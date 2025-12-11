from pathlib import Path
from typing import List, Tuple, Optional, Callable
import logging

import cv2
import numpy as np
from PIL import Image

from src.file_utils import load_image_cv2
from src.models import BatchResult
from src.point_validator import PointValidator

logger = logging.getLogger(__name__)


class PerspectiveTransformer:
    def __init__(
        self, 
        template_path: Path, 
        corner_points: List[Tuple[int, int]], 
        corner_radius: int = 0, 
        blend_strength: float = 0.25,
        point_sets: Optional[List[List[Tuple[int, int]]]] = None
    ):
        """
        Initialize PerspectiveTransformer with support for multiple point sets.
        
        Args:
            template_path: Path to the template image
            corner_points: Primary set of 4 corner points (TL, TR, BR, BL) for backward compatibility
            corner_radius: Radius for rounded corners on transformed images
            blend_strength: Strength of color blending with template
            point_sets: Optional list of point sets for multi-area transformation.
                       Each point set is a list of 4 (x, y) tuples.
                       If provided, this takes precedence over corner_points.
        """
        self.template_path = Path(template_path)
        
        if not self.template_path.exists():
            raise FileNotFoundError(f"Template not found: {template_path}")
        
        try:
            self._template = load_image_cv2(self.template_path)
        except Exception as e:
            raise ValueError(f"Failed to load template image: {template_path} - {e}")
        
        if self._template is None:
            raise ValueError(f"Failed to load template image: {template_path}")
        
        self._template_height, self._template_width = self._template.shape[:2]
        
        # Handle point_sets for multi-area support
        if point_sets is not None and len(point_sets) > 0:
            self._point_sets = []
            for i, ps in enumerate(point_sets):
                PointValidator.validate_points(ps, self._template_width, self._template_height)
                self._point_sets.append(ps)
            # Use first point set as primary for backward compatibility
            self.corner_points = self._point_sets[0]
        else:
            PointValidator.validate_points(corner_points, self._template_width, self._template_height)
            self.corner_points = corner_points
            self._point_sets = [corner_points]
        
        self._dst_points = np.float32(self.corner_points)
        self._corner_radius = corner_radius
        self._blend_strength = blend_strength

    @staticmethod
    def compute_transform_matrix(src_points: np.ndarray, dst_points: np.ndarray) -> np.ndarray:
        return cv2.getPerspectiveTransform(src_points, dst_points)

    def _create_rounded_mask(self, width: int, height: int, radius: int) -> np.ndarray:
        mask = np.zeros((height, width), dtype=np.uint8)
        
        if radius <= 0:
            mask[:] = 255
            return mask
        
        radius = min(radius, width // 2, height // 2)
        
        cv2.rectangle(mask, (radius, 0), (width - radius, height), 255, -1)
        cv2.rectangle(mask, (0, radius), (width, height - radius), 255, -1)
        
        cv2.circle(mask, (radius, radius), radius, 255, -1, cv2.LINE_AA)
        cv2.circle(mask, (width - radius - 1, radius), radius, 255, -1, cv2.LINE_AA)
        cv2.circle(mask, (width - radius - 1, height - radius - 1), radius, 255, -1, cv2.LINE_AA)
        cv2.circle(mask, (radius, height - radius - 1), radius, 255, -1, cv2.LINE_AA)
        
        mask = cv2.GaussianBlur(mask, (3, 3), 0)
        return mask
    
    def _warp_product(self, product: np.ndarray) -> np.ndarray:
        h, w = product.shape[:2]
        
        if len(product.shape) == 2:
            product = cv2.cvtColor(product, cv2.COLOR_GRAY2BGRA)
        elif product.shape[2] == 3:
            product = cv2.cvtColor(product, cv2.COLOR_BGR2BGRA)
        else:
            product = product.copy()
        
        if self._corner_radius > 0:
            min_dim = min(w, h)
            scaled_radius = int((self._corner_radius / 2000.0) * min_dim)
            scaled_radius = max(scaled_radius, 3)
            
            mask = self._create_rounded_mask(w, h, scaled_radius)
            alpha = product[:, :, 3].astype(np.float32)
            mask_float = mask.astype(np.float32) / 255.0
            product[:, :, 3] = (alpha * mask_float).astype(np.uint8)
        
        src_points = np.float32([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]])
        matrix = self.compute_transform_matrix(src_points, self._dst_points)
        
        warped = cv2.warpPerspective(
            product, matrix, (self._template_width, self._template_height),
            flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0)
        )
        
        # Simple edge smoothing - faster than Canny-based approach
        alpha = warped[:, :, 3]
        if self._corner_radius > 0:
            warped[:, :, 3] = cv2.GaussianBlur(alpha, (3, 3), 0.5)
        
        return warped

    def _apply_color_blend(self, product: np.ndarray, template: np.ndarray, blend_strength: float = 0.15) -> np.ndarray:
        if blend_strength <= 0:
            return product
        
        alpha = product[:, :, 3]
        if not np.any(alpha > 10):
            return product
        
        result = product.copy()
        
        # Optimized: sample smaller center region for average color
        template_bgr = template[:, :, :3] if template.shape[2] == 4 else template
        h, w = template_bgr.shape[:2]
        cy, cx = h // 2, w // 2
        sample_h, sample_w = h // 8, w // 8  # Smaller sample for speed
        center_region = template_bgr[max(0, cy-sample_h):cy+sample_h, max(0, cx-sample_w):cx+sample_w]
        avg_color = np.mean(center_region, axis=(0, 1))
        
        # Vectorized blend - in-place for speed
        result[:, :, :3] = np.clip(
            result[:, :, :3].astype(np.float32) * (1 - blend_strength) + avg_color * blend_strength,
            0, 255
        ).astype(np.uint8)
        return result

    def _composite_with_alpha(self, template: np.ndarray, product: np.ndarray, blend_strength: float = 0.15) -> np.ndarray:
        if template.shape[2] == 3:
            template = cv2.cvtColor(template, cv2.COLOR_BGR2BGRA)
        else:
            template = template.copy()
        
        if product.shape[2] == 3:
            product_bgra = cv2.cvtColor(product, cv2.COLOR_BGR2BGRA)
        else:
            product_bgra = product
        
        product_bgra = self._apply_color_blend(product_bgra, template, blend_strength)
        alpha = product_bgra[:, :, 3].astype(np.float32) / 255.0
        
        for c in range(3):
            template[:, :, c] = (alpha * product_bgra[:, :, c].astype(np.float32) + (1 - alpha) * template[:, :, c].astype(np.float32)).astype(np.uint8)
        
        return template

    def _warp_product_to_points(self, product: np.ndarray, dst_points: np.ndarray) -> np.ndarray:
        """
        Warp a product image to specific destination points.
        
        Args:
            product: Product image in BGRA format
            dst_points: Destination points as np.float32 array of shape (4, 2)
            
        Returns:
            Warped product image in BGRA format
        """
        h, w = product.shape[:2]
        
        if len(product.shape) == 2:
            product = cv2.cvtColor(product, cv2.COLOR_GRAY2BGRA)
        elif product.shape[2] == 3:
            product = cv2.cvtColor(product, cv2.COLOR_BGR2BGRA)
        else:
            product = product.copy()
        
        if self._corner_radius > 0:
            min_dim = min(w, h)
            scaled_radius = int((self._corner_radius / 2000.0) * min_dim)
            scaled_radius = max(scaled_radius, 3)
            
            mask = self._create_rounded_mask(w, h, scaled_radius)
            alpha = product[:, :, 3].astype(np.float32)
            mask_float = mask.astype(np.float32) / 255.0
            product[:, :, 3] = (alpha * mask_float).astype(np.uint8)
        
        src_points = np.float32([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]])
        matrix = self.compute_transform_matrix(src_points, dst_points)
        
        warped = cv2.warpPerspective(
            product, matrix, (self._template_width, self._template_height),
            flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0)
        )
        
        # Simple edge smoothing
        alpha = warped[:, :, 3]
        if self._corner_radius > 0:
            warped[:, :, 3] = cv2.GaussianBlur(alpha, (3, 3), 0.5)
        
        return warped

    def transform_multiple(self, product_paths: List[Optional[Path]]) -> Tuple[np.ndarray, List[Tuple[str, str]]]:
        """
        Transform multiple product images into multiple point set areas.
        
        Applies perspective transformation for each point set. Supports:
        - Direct mapping: product_paths[i] -> point_set[i] (None skips that area)
        - Cyclic distribution: when fewer images than point sets, cycles through available
        
        Args:
            product_paths: List of paths to product images (can contain None for skipped areas)
            
        Returns:
            Tuple of (result_image, errors) where:
            - result_image: Final composited image with all products
            - errors: List of (filename, error_message) tuples for failed transformations
            
        Requirements: 6.1, 6.2, 6.3
        """
        if not product_paths:
            # Return template copy if no products
            if self._template.shape[2] == 3:
                return cv2.cvtColor(self._template, cv2.COLOR_BGR2BGRA), []
            return self._template.copy(), []
        
        # Filter out None values for cyclic distribution
        valid_paths = [p for p in product_paths if p is not None]
        
        # Prepare result image
        if self._template.shape[2] == 3:
            result = cv2.cvtColor(self._template, cv2.COLOR_BGR2BGRA)
        else:
            result = self._template.copy()
        
        errors: List[Tuple[str, str]] = []
        num_valid = len(valid_paths)
        
        # Process each point set
        for i, point_set in enumerate(self._point_sets):
            # Determine which product to use for this point set
            product_path = None
            
            # First, check if there's a direct mapping (same index)
            if i < len(product_paths) and product_paths[i] is not None:
                # Handle both Path objects and strings
                p = product_paths[i]
                product_path = p if isinstance(p, Path) else Path(p)
            # Otherwise, use cyclic distribution from valid paths
            elif num_valid > 0:
                product_idx = i % num_valid
                p = valid_paths[product_idx]
                product_path = p if isinstance(p, Path) else Path(p)
            
            # Skip if no product for this area
            if product_path is None:
                continue
            
            try:
                # Load product image
                if not product_path.exists():
                    raise FileNotFoundError(f"Product image not found: {product_path}")
                
                product = load_image_cv2(product_path)
                if product is None:
                    raise ValueError(f"Failed to load product image: {product_path}")
                
                # Convert to BGRA
                if len(product.shape) == 2:
                    product = cv2.cvtColor(product, cv2.COLOR_GRAY2BGRA)
                elif product.shape[2] == 3:
                    product = cv2.cvtColor(product, cv2.COLOR_BGR2BGRA)
                
                # Warp product to this point set's destination
                dst_points = np.float32(point_set)
                warped = self._warp_product_to_points(product, dst_points)
                
                # Apply color blend
                if self._blend_strength > 0:
                    warped = self._apply_color_blend(warped, result, self._blend_strength)
                
                # Composite onto result
                alpha = warped[:, :, 3].astype(np.float32) / 255.0
                for c in range(3):
                    result[:, :, c] = (
                        alpha * warped[:, :, c].astype(np.float32) + 
                        (1 - alpha) * result[:, :, c].astype(np.float32)
                    ).astype(np.uint8)
                    
            except Exception as e:
                # Log error and continue with remaining point sets (Requirement 6.4)
                error_msg = f"{type(e).__name__}: {str(e)}"
                logger.warning(f"Failed to transform product for point set {i}: {error_msg}")
                errors.append((product_path.name if product_path else f"point_set_{i}", error_msg))
                continue
        
        return result, errors

    def get_warped_product(self, product_path: Path, apply_blend: bool = True) -> np.ndarray:
        """
        Возвращает трансформированный коврик с опциональным color blend.
        Используется для PSD обработки.
        """
        product_path = Path(product_path)
        
        if not product_path.exists():
            raise FileNotFoundError(f"Product image not found: {product_path}")
        
        try:
            product = load_image_cv2(product_path)
        except Exception:
            raise ValueError(f"Failed to load product image: {product_path}")
        
        if len(product.shape) == 2:
            product = cv2.cvtColor(product, cv2.COLOR_GRAY2BGRA)
        elif product.shape[2] == 3:
            product = cv2.cvtColor(product, cv2.COLOR_BGR2BGRA)
        
        warped = self._warp_product(product)
        
        # Применяем color blend если нужно
        if apply_blend and self._blend_strength > 0:
            warped = self._apply_color_blend(warped, self._template, self._blend_strength)
        
        return warped

    def transform_product(self, product_path: Path) -> np.ndarray:
        product_path = Path(product_path)
        
        if not product_path.exists():
            raise FileNotFoundError(f"Product image not found: {product_path}")
        
        try:
            product = load_image_cv2(product_path)
        except Exception:
            raise ValueError(f"Failed to load product image: {product_path}")
        
        if len(product.shape) == 2:
            product = cv2.cvtColor(product, cv2.COLOR_GRAY2BGRA)
        elif product.shape[2] == 3:
            product = cv2.cvtColor(product, cv2.COLOR_BGR2BGRA)
        
        warped = self._warp_product(product)
        return self._composite_with_alpha(self._template, warped, self._blend_strength)

    def get_preview(self, product_path: Path, max_size: int = 500) -> Image.Image:
        result = self.transform_product(product_path)
        result_rgba = cv2.cvtColor(result, cv2.COLOR_BGRA2RGBA)
        pil_image = Image.fromarray(result_rgba)
        
        width, height = pil_image.size
        if width > max_size or height > max_size:
            ratio = min(max_size / width, max_size / height)
            new_size = (int(width * ratio), int(height * ratio))
            pil_image = pil_image.resize(new_size, Image.Resampling.LANCZOS)
        
        return pil_image

    def transform_batch(self, input_folder: Path, output_folder: Path, progress_callback: Optional[Callable[[int, int], None]] = None) -> BatchResult:
        input_folder = Path(input_folder)
        output_folder = Path(output_folder)
        output_folder.mkdir(parents=True, exist_ok=True)
        
        all_files = list(input_folder.iterdir()) if input_folder.exists() else []
        image_extensions = {'.png', '.jpg', '.jpeg', '.psd'}
        image_files = [f for f in all_files if f.is_file() and f.suffix.lower() in image_extensions]
        
        total_files = len(all_files)
        skipped = len([f for f in all_files if f.is_file()]) - len(image_files)
        processed = 0
        errors: List[Tuple[str, str]] = []
        
        for i, image_file in enumerate(image_files):
            try:
                result = self.transform_product(image_file)
                
                ext = image_file.suffix.lower()
                if ext == '.psd':
                    output_path = output_folder / (image_file.stem + '.png')
                else:
                    output_path = output_folder / image_file.name
                
                from PIL import Image as PILImage
                if output_path.suffix.lower() == '.png':
                    result_rgba = cv2.cvtColor(result, cv2.COLOR_BGRA2RGBA)
                    PILImage.fromarray(result_rgba).save(str(output_path), 'PNG')
                else:
                    result_rgb = cv2.cvtColor(result, cv2.COLOR_BGRA2RGB)
                    PILImage.fromarray(result_rgb).save(str(output_path), 'JPEG', quality=95)
                
                processed += 1
            except Exception as e:
                errors.append((image_file.name, f"{type(e).__name__}: {str(e)}"))
            
            if progress_callback:
                progress_callback(i + 1, len(image_files))
        
        return BatchResult(total_files=total_files, processed=processed, skipped=skipped, errors=errors)

    def transform_files(self, files: List[Path], output_folder: Path, progress_callback: Optional[Callable[[int, int], None]] = None) -> BatchResult:
        output_folder = Path(output_folder)
        output_folder.mkdir(parents=True, exist_ok=True)
        
        total_files = len(files)
        processed = 0
        errors: List[Tuple[str, str]] = []
        
        for i, image_file in enumerate(files):
            try:
                result = self.transform_product(image_file)
                
                ext = image_file.suffix.lower()
                if ext == '.psd':
                    output_path = output_folder / (image_file.stem + '.png')
                else:
                    output_path = output_folder / image_file.name
                
                from PIL import Image as PILImage
                if output_path.suffix.lower() == '.png':
                    result_rgba = cv2.cvtColor(result, cv2.COLOR_BGRA2RGBA)
                    PILImage.fromarray(result_rgba).save(str(output_path), 'PNG')
                else:
                    result_rgb = cv2.cvtColor(result, cv2.COLOR_BGRA2RGB)
                    PILImage.fromarray(result_rgb).save(str(output_path), 'JPEG', quality=95)
                
                processed += 1
            except Exception as e:
                errors.append((image_file.name, f"{type(e).__name__}: {str(e)}"))
            
            if progress_callback:
                progress_callback(i + 1, total_files)
        
        return BatchResult(total_files=total_files, processed=processed, skipped=0, errors=errors)
