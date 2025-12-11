import sys
from pathlib import Path
from typing import List, Tuple, Optional, Dict
import cv2
import numpy as np
from PIL import Image
import io

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from src.perspective_transformer import PerspectiveTransformer
from src.color_analyzer import ColorAnalyzer
from src.psd_processor import PSDProcessor, is_psd_available
from src.file_utils import load_image, load_image_cv2
from backend.app.config import THUMBNAIL_SIZE, PREVIEW_MAX_SIZE


# Optimized caches with size limits
_transformer_cache: Dict[str, PerspectiveTransformer] = {}
_preview_cache: Dict[str, bytes] = {}
_color_cache: Dict[str, tuple] = {}

# Cache size limits
_TRANSFORMER_CACHE_MAX = 15
_PREVIEW_CACHE_MAX = 30
_COLOR_CACHE_MAX = 50


def clear_all_caches():
    """Очистить все кэши изображений."""
    global _transformer_cache, _preview_cache, _color_cache
    _transformer_cache.clear()
    _preview_cache.clear()
    _color_cache.clear()
    # Также очищаем кэш в file_utils
    from src.file_utils import clear_image_cache
    clear_image_cache()


def get_transformer_cached(template_path: Path, points: List[Tuple[int, int]], 
                           corner_radius: int, blend_strength: float,
                           point_sets: Optional[List[List[Tuple[int, int]]]] = None) -> PerspectiveTransformer:
    """Get cached transformer or create new one.
    
    Args:
        template_path: Path to template image
        points: Primary set of 4 corner points (for backward compatibility)
        corner_radius: Radius for rounded corners
        blend_strength: Strength of color blending
        point_sets: Optional list of point sets for multi-area transformation
    """
    key = f"{template_path}:{points}:{corner_radius}:{blend_strength}:{point_sets}"
    if key not in _transformer_cache:
        if len(_transformer_cache) >= _TRANSFORMER_CACHE_MAX:
            # Remove oldest entries (first 5)
            keys_to_remove = list(_transformer_cache.keys())[:5]
            for k in keys_to_remove:
                del _transformer_cache[k]
        _transformer_cache[key] = PerspectiveTransformer(
            template_path, points, corner_radius, blend_strength, point_sets=point_sets
        )
    return _transformer_cache[key]


class ImageService:
    def __init__(self):
        self.color_analyzer = ColorAnalyzer(n_clusters=3)  # Reduced for speed
        self._psd_processor: Optional[PSDProcessor] = None
    
    @property
    def psd_processor(self) -> PSDProcessor:
        if self._psd_processor is None:
            self._psd_processor = PSDProcessor()
        return self._psd_processor
    
    def create_thumbnail(self, image_path: Path, output_path: Path) -> Path:
        """Create thumbnail for template."""
        img = load_image(image_path)
        img.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
        
        if img.mode == 'RGBA':
            bg = Image.new('RGB', img.size, (13, 17, 23))
            bg.paste(img, mask=img.split()[3])
            img = bg
        
        img.save(output_path, 'JPEG', quality=80)
        return output_path
    
    def _get_cached_color(self, print_path: Path) -> tuple:
        """Get cached dominant color or compute it."""
        key = str(print_path)
        if key not in _color_cache:
            if len(_color_cache) >= _COLOR_CACHE_MAX:
                # Remove oldest entries
                keys_to_remove = list(_color_cache.keys())[:10]
                for k in keys_to_remove:
                    del _color_cache[k]
            orig = load_image(print_path)
            # Resize for faster color analysis - use smaller size
            if orig.width > 150 or orig.height > 150:
                orig.thumbnail((150, 150), Image.Resampling.NEAREST)
            _color_cache[key] = self.color_analyzer.get_dominant_color(orig)
        return _color_cache[key]

    def _create_combined_warped_for_psd(
        self,
        transformer: PerspectiveTransformer,
        print_paths: List[Optional[Path]]
    ) -> np.ndarray:
        """Create combined warped image from multiple print paths for PSD processing.
        
        This method warps each print image to its corresponding point set area
        and combines them into a single BGRA image that can be passed to PSD processor.
        
        Args:
            transformer: PerspectiveTransformer with point_sets configured
            print_paths: List of print paths (can contain None for skipped areas)
            
        Returns:
            Combined warped image in BGRA format
        """
        height, width = transformer._template_height, transformer._template_width
        combined = np.zeros((height, width, 4), dtype=np.uint8)
        
        # Filter valid paths
        valid_paths = [p for p in print_paths if p is not None]
        if not valid_paths:
            return combined
        
        # Process each point set
        for i, point_set in enumerate(transformer._point_sets):
            # Determine which product to use for this point set
            product_path = None
            
            # Direct mapping: product_paths[i] -> point_set[i]
            if i < len(print_paths) and print_paths[i] is not None:
                p = print_paths[i]
                product_path = p if isinstance(p, Path) else Path(p)
            # Cyclic distribution from valid paths
            elif len(valid_paths) > 0:
                product_idx = i % len(valid_paths)
                p = valid_paths[product_idx]
                product_path = p if isinstance(p, Path) else Path(p)
            
            if product_path is None or not product_path.exists():
                continue
            
            try:
                # Load and warp product to this point set
                product = load_image_cv2(product_path)
                if product is None:
                    continue
                
                # Convert to BGRA
                if len(product.shape) == 2:
                    product = cv2.cvtColor(product, cv2.COLOR_GRAY2BGRA)
                elif product.shape[2] == 3:
                    product = cv2.cvtColor(product, cv2.COLOR_BGR2BGRA)
                
                # Warp to this point set's destination
                dst_points = np.float32(point_set)
                warped = transformer._warp_product_to_points(product, dst_points)
                
                # Apply color blend if configured
                if transformer._blend_strength > 0:
                    warped = transformer._apply_color_blend(warped, transformer._template, transformer._blend_strength)
                
                # Composite onto combined image
                alpha = warped[:, :, 3].astype(np.float32) / 255.0
                for c in range(3):
                    combined[:, :, c] = (
                        alpha * warped[:, :, c].astype(np.float32) + 
                        (1 - alpha) * combined[:, :, c].astype(np.float32)
                    ).astype(np.uint8)
                # Update alpha channel
                combined[:, :, 3] = np.maximum(combined[:, :, 3], warped[:, :, 3])
                
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Failed to warp product for point set {i}: {e}")
                continue
        
        return combined

    def generate_preview(
        self,
        template_path: Path,
        points: List[Tuple[int, int]],
        print_path: Optional[Path] = None,
        corner_radius: int = 0,
        blend_strength: float = 0.25,
        change_color: bool = True,
        add_product: bool = True,
        point_sets: Optional[List[List[Tuple[int, int]]]] = None,
        print_paths: Optional[List[Path]] = None
    ) -> bytes:
        """Generate preview image and return as bytes.
        
        Supports both single-point mode (backward compatible) and multi-point mode.
        
        Args:
            template_path: Path to template image
            points: Primary set of 4 corner points (for backward compatibility)
            print_path: Single print image path (for backward compatibility)
            corner_radius: Radius for rounded corners
            blend_strength: Strength of color blending
            change_color: Whether to change background color based on print
            add_product: Whether to add product image
            point_sets: Optional list of point sets for multi-area transformation
            print_paths: Optional list of print paths for multi-area (cycles if fewer than point_sets)
            
        Requirements: 6.5
        """
        # Check cache first
        cache_key = f"{template_path}:{points}:{print_path}:{corner_radius}:{blend_strength}:{change_color}:{add_product}:{point_sets}:{print_paths}"
        if cache_key in _preview_cache:
            return _preview_cache[cache_key]
        
        is_psd = template_path.suffix.lower() == '.psd' and is_psd_available()
        
        # Determine if we should use multi-area mode
        # Use multi-mode when point_sets is provided (even with 1 set) AND print_paths is provided
        # This allows multi-area selection even with single point set initially
        use_multi_mode = (point_sets is not None and len(point_sets) >= 1 and print_paths is not None and len(print_paths) > 0)
        
        # Use cached transformer with point_sets if available
        # Always pass point_sets when in multi-mode to ensure correct transformation
        transformer = get_transformer_cached(
            template_path, points, corner_radius, blend_strength, 
            point_sets=point_sets if (use_multi_mode and point_sets) else None
        )
        
        if is_psd:
            # PSD processing with multi-area support
            warped = None
            effective_print_path = None
            
            if add_product:
                if use_multi_mode and print_paths:
                    # Multi-area mode: use transform_multiple to get combined warped image
                    # Filter valid paths
                    valid_paths = [p for p in print_paths if p is not None]
                    if valid_paths:
                        # Get warped products for all areas combined
                        result_img, errors = transformer.transform_multiple(print_paths)
                        # Extract just the warped products (without template background)
                        # We need to create a combined warped image from all areas
                        warped = self._create_combined_warped_for_psd(transformer, print_paths)
                        # Use first valid path for color
                        effective_print_path = valid_paths[0]
                elif print_path:
                    warped = transformer.get_warped_product(print_path)
                    effective_print_path = print_path
            
            if warped is None:
                warped = np.zeros(
                    (transformer._template_height, transformer._template_width, 4),
                    dtype=np.uint8
                )
            
            color = None
            if change_color and effective_print_path:
                color = self._get_cached_color(effective_print_path)
            
            img = self.psd_processor.process_with_warped_product(template_path, warped, color)
        else:
            # Non-PSD processing
            if add_product:
                if use_multi_mode:
                    # Multi-area mode: use transform_multiple
                    # Build list of print paths - use provided list or cycle single print
                    if print_paths and len(print_paths) > 0:
                        paths_to_use = print_paths
                    elif print_path:
                        paths_to_use = [print_path]
                    else:
                        paths_to_use = []
                    
                    if paths_to_use:
                        result, errors = transformer.transform_multiple(paths_to_use)
                        # Log any errors but continue with result
                        if errors:
                            import logging
                            logger = logging.getLogger(__name__)
                            for filename, error in errors:
                                logger.warning(f"Preview transform error for {filename}: {error}")
                    else:
                        result = transformer._template.copy()
                else:
                    # Single-area mode: use transform_product
                    if print_path:
                        result = transformer.transform_product(print_path)
                    else:
                        result = transformer._template.copy()
            else:
                result = transformer._template.copy()
            
            img = Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGRA2RGBA))
        
        # Resize for preview - higher quality
        max_size = 1200
        width, height = img.size
        if width > max_size or height > max_size:
            ratio = min(max_size / width, max_size / height)
            new_size = (int(width * ratio), int(height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        # Convert to JPEG - high quality
        buffer = io.BytesIO()
        if img.mode == 'RGBA':
            bg = Image.new('RGB', img.size, (13, 17, 23))
            bg.paste(img, mask=img.split()[3])
            img = bg
        img.save(buffer, format='JPEG', quality=92)
        result = buffer.getvalue()
        
        # Cache result with size limit
        if len(_preview_cache) >= _PREVIEW_CACHE_MAX:
            keys_to_remove = list(_preview_cache.keys())[:10]
            for k in keys_to_remove:
                del _preview_cache[k]
        _preview_cache[cache_key] = result
        
        return result
    
    def generate_card(
        self,
        template_path: Path,
        points: List[Tuple[int, int]],
        print_path: Path,
        output_path: Path,
        corner_radius: int = 0,
        blend_strength: float = 0.25,
        change_color: bool = True,
        add_product: bool = True
    ) -> Path:
        """Generate final card and save to output."""
        is_psd = template_path.suffix.lower() == '.psd' and is_psd_available()
        
        transformer = get_transformer_cached(template_path, points, corner_radius, blend_strength)
        
        if is_psd:
            if add_product:
                warped = transformer.get_warped_product(print_path)
            else:
                warped = np.zeros(
                    (transformer._template_height, transformer._template_width, 4),
                    dtype=np.uint8
                )
            
            color = None
            if change_color:
                color = self.color_analyzer.get_dominant_color(load_image(print_path))
            
            img = self.psd_processor.process_with_warped_product(template_path, warped, color)
        else:
            if add_product:
                result = transformer.transform_product(print_path)
            else:
                result = transformer._template.copy()
            img = Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGRA2RGBA))
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(str(output_path), 'PNG')
        return output_path


image_service = ImageService()
