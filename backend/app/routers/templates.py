import sys
import uuid
import shutil
from pathlib import Path
from typing import List, Optional

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse, Response

from backend.app.models import Template, TemplateUpdate, Point
from backend.app.storage import storage
from backend.app.config import TEMPLATES_DIR, THUMBNAILS_DIR, SUPPORTED_EXTENSIONS
from backend.app.services import image_service

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("", response_model=List[Template])
async def get_templates():
    """Get all templates."""
    return storage.get_all_templates()


@router.post("", response_model=Template)
async def upload_template(file: UploadFile = File(...)):
    """Upload a new template. Keeps original filename."""
    if len(storage.templates) >= 10:
        raise HTTPException(400, "Maximum 10 templates allowed")
    
    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type: {ext}")
    
    # Use original filename, not UUID
    original_filename = file.filename
    file_path = TEMPLATES_DIR / original_filename
    
    # Check if file already exists
    if file_path.exists():
        # Generate unique name only if conflict
        base = Path(original_filename).stem
        counter = 1
        while file_path.exists():
            file_path = TEMPLATES_DIR / f"{base}_{counter}{ext}"
            counter += 1
    
    # Use filename stem as ID (without extension), sanitized
    template_id = file_path.stem.replace(' ', '_').replace('.', '_')
    
    # Check if template with this ID already exists
    existing = storage.get_template(template_id)
    if existing:
        # Add suffix to make unique
        counter = 1
        while storage.get_template(f"{template_id}_{counter}"):
            counter += 1
        template_id = f"{template_id}_{counter}"
    
    # Save file
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    # Create thumbnail (use template_id for thumbnail name)
    thumb_path = THUMBNAILS_DIR / f"{template_id}.jpg"
    try:
        image_service.create_thumbnail(file_path, thumb_path)
    except Exception as e:
        file_path.unlink(missing_ok=True)
        raise HTTPException(400, f"Failed to process image: {e}")
    
    # Default points based on image size
    from PIL import Image
    from src.file_utils import load_image
    img = load_image(file_path)
    w, h = img.size
    
    default_points = [
        Point(x=int(w * 0.1), y=int(h * 0.35)),
        Point(x=int(w * 0.9), y=int(h * 0.4)),
        Point(x=int(w * 0.85), y=int(h * 0.85)),
        Point(x=int(w * 0.05), y=int(h * 0.75)),
    ]
    
    # Create initial point_set from default points
    from backend.app.models import PointSet
    default_point_set = PointSet(index=0, points=default_points)
    
    template = Template(
        id=template_id,
        name=Path(file.filename).stem,  # Original name without extension
        path=str(file_path),
        thumbnail_url=f"/api/templates/{template_id}/thumbnail",
        points=default_points,
        point_sets=[default_point_set],  # Initialize with single point set
        is_multi_mode=False,  # Default to single mode
        corner_radius=0,
        blend_strength=0.25,
        change_background_color=True,
        add_product=True,
        original_width=w,
        original_height=h
    )
    
    return storage.add_template(template)


@router.get("/{template_id}", response_model=Template)
async def get_template(template_id: str):
    """Get template by ID."""
    template = storage.get_template(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    return template


@router.put("/{template_id}", response_model=Template)
async def update_template(template_id: str, updates: TemplateUpdate):
    """Update template settings.
    
    Supports both single-point mode (points field) and multi-point mode (point_sets field).
    The storage layer handles synchronization between these fields.
    """
    template = storage.get_template(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    
    update_data = updates.model_dump(exclude_unset=True)
    
    # Convert points dicts to Point objects if present (backward compatibility)
    if 'points' in update_data and update_data['points']:
        points = [
            Point(x=p['x'], y=p['y']) if isinstance(p, dict) else p 
            for p in update_data['points']
        ]
        update_data['points'] = points
        update_data['saved_points'] = points.copy()
        # Save preset by template name for future use
        storage.save_preset(template.name, points)
    
    # Convert point_sets dicts to PointSet objects if present
    if 'point_sets' in update_data and update_data['point_sets']:
        from backend.app.models import PointSet
        point_sets = []
        for ps in update_data['point_sets']:
            if isinstance(ps, dict):
                points = [
                    Point(x=p['x'], y=p['y']) if isinstance(p, dict) else p 
                    for p in ps.get('points', [])
                ]
                point_sets.append(PointSet(index=ps.get('index', len(point_sets)), points=points))
            else:
                point_sets.append(ps)
        update_data['point_sets'] = point_sets
        
        # Save first point set as preset for backward compatibility
        if point_sets and len(point_sets[0].points) == 4:
            storage.save_preset(template.name, point_sets[0].points)
    
    updated = storage.update_template(template_id, update_data)
    return updated


@router.delete("/{template_id}")
async def delete_template(template_id: str):
    """Delete template and its thumbnail."""
    template = storage.get_template(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    
    # Delete original file
    Path(template.path).unlink(missing_ok=True)
    
    # Delete thumbnail
    thumb_path = THUMBNAILS_DIR / f"{template_id}.jpg"
    thumb_path.unlink(missing_ok=True)
    
    storage.delete_template(template_id)
    return {"status": "deleted"}


@router.get("/{template_id}/thumbnail")
async def get_thumbnail(template_id: str):
    """Get template thumbnail with caching."""
    thumb_path = THUMBNAILS_DIR / f"{template_id}.jpg"
    if not thumb_path.exists():
        raise HTTPException(404, "Thumbnail not found")
    return FileResponse(
        thumb_path, 
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"}  # Cache 24h
    )


@router.get("/{template_id}/editor-image")
async def get_editor_image(template_id: str):
    """Get higher quality image for point editor."""
    template = storage.get_template(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    
    from PIL import Image
    from src.file_utils import load_image
    import io
    
    img = load_image(Path(template.path))
    
    # Resize to max 1200px for editor (high quality)
    max_size = 1200
    if img.width > max_size or img.height > max_size:
        ratio = min(max_size / img.width, max_size / img.height)
        new_size = (int(img.width * ratio), int(img.height * ratio))
        img = img.resize(new_size, Image.Resampling.LANCZOS)
    
    # Convert RGBA to RGB for JPEG
    if img.mode == 'RGBA':
        bg = Image.new('RGB', img.size, (13, 17, 23))
        bg.paste(img, mask=img.split()[3])
        img = bg
    
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=90)
    buffer.seek(0)
    
    return Response(
        content=buffer.getvalue(),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=3600"}  # Cache 1h
    )


@router.post("/{template_id}/auto-detect")
async def auto_detect_points(template_id: str):
    """Auto-detect corner points for template. Restores saved preset by name if available."""
    template = storage.get_template(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    
    # First check preset by template name (persists across re-uploads)
    preset = storage.get_preset(template.name)
    if preset and len(preset) == 4:
        updated = storage.update_template(template_id, {'points': preset, 'saved_points': preset})
        return updated
    
    # Then check saved_points on template itself
    if template.saved_points and len(template.saved_points) == 4:
        updated = storage.update_template(template_id, {'points': template.saved_points})
        return updated
    
    # Otherwise use corner detector
    try:
        from src.corner_detector import CornerDetector
        from src.file_utils import load_image_cv2
        
        img = load_image_cv2(Path(template.path))
        points = CornerDetector.detect_corners(img, template.name)
        
        if points:
            new_points = [Point(x=p[0], y=p[1]) for p in points]
            updated = storage.update_template(template_id, {'points': new_points})
            return updated
        else:
            raise HTTPException(400, "Could not detect corners")
    except Exception as e:
        raise HTTPException(500, f"Auto-detect failed: {e}")


@router.post("/cleanup-orphans")
async def cleanup_orphan_files():
    """Remove template files that are not in storage (orphaned files)."""
    import re
    
    # Get all template IDs from storage
    stored_ids = set(storage.templates.keys())
    stored_paths = set(Path(t.path).name for t in storage.templates.values())
    
    deleted_templates = []
    deleted_thumbnails = []
    
    # UUID pattern
    uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', re.IGNORECASE)
    
    # Clean orphan template files (only UUID-named files)
    for f in TEMPLATES_DIR.iterdir():
        if f.is_file():
            # Only delete files with UUID names that are not in storage
            if uuid_pattern.match(f.stem) and f.name not in stored_paths:
                f.unlink()
                deleted_templates.append(f.name)
    
    # Clean orphan thumbnails
    for f in THUMBNAILS_DIR.iterdir():
        if f.is_file() and f.suffix == '.jpg':
            # Check if thumbnail belongs to existing template
            thumb_id = f.stem
            if thumb_id not in stored_ids and uuid_pattern.match(thumb_id):
                f.unlink()
                deleted_thumbnails.append(f.name)
    
    return {
        "deleted_templates": deleted_templates,
        "deleted_thumbnails": deleted_thumbnails,
        "templates_count": len(deleted_templates),
        "thumbnails_count": len(deleted_thumbnails)
    }


@router.post("/clear-cache")
async def clear_cache():
    """Clear all image caches to force reload."""
    from backend.app.services.image_service import clear_all_caches
    clear_all_caches()
    return {"status": "ok", "message": "All caches cleared"}


@router.get("/{template_id}/preview")
async def get_preview(
    template_id: str, 
    print_file: str = None,
    print_files: str = None,  # Comma-separated list of files for multi-area
    corner_radius: int = None,
    blend_strength: float = None,
    change_color: str = None,
    add_product: str = None
):
    """Get preview with optional print overlay and settings override.
    
    Supports both single-point mode and multi-point mode:
    - Single mode: Uses template.points for single area transformation
    - Multi mode: Uses template.point_sets for multiple area transformations
    
    Args:
        print_file: Single print file path (for single mode or fallback)
        print_files: Comma-separated list of print file paths (for multi-area mode)
    
    Requirements: 6.5
    """
    template = storage.get_template(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    
    # Handle both Point objects and dicts for primary points (backward compatibility)
    points = [(p.x, p.y) if hasattr(p, 'x') else (p['x'], p['y']) for p in template.points]
    
    # Build point_sets for multi-area mode
    # Use point_sets when template is in multi-mode and has multiple point sets
    point_sets = None
    if template.is_multi_mode and template.point_sets and len(template.point_sets) >= 1:
        point_sets = []
        for ps in template.point_sets:
            ps_points = [(p.x, p.y) if hasattr(p, 'x') else (p['x'], p['y']) for p in ps.points]
            point_sets.append(ps_points)
    
    # Use passed parameters or fall back to template defaults
    radius = corner_radius if corner_radius is not None else template.corner_radius
    blend = blend_strength if blend_strength is not None else template.blend_strength
    change_bg = change_color.lower() == 'true' if change_color is not None else template.change_background_color
    add_prod = add_product.lower() == 'true' if add_product is not None else template.add_product
    
    # Helper function to resolve file path
    def resolve_path(file_path: str) -> Optional[Path]:
        if not file_path:
            return None
        p = Path(file_path)
        if p.exists():
            return p
        # Try with forward slashes converted
        p2 = Path(file_path.replace('/', '\\'))
        if p2.exists():
            return p2
        return None
    
    # Handle print file paths
    print_path = None
    print_paths = None
    
    # Multi-area mode: parse comma-separated list
    # Process print_files if provided, regardless of point_sets
    if print_files:
        # Split and preserve order - empty strings become None
        file_list = [f.strip() for f in print_files.split(',')]
        print_paths = []
        has_any_valid = False
        for f in file_list:
            if f:
                resolved = resolve_path(f)
                print_paths.append(resolved)
                if resolved:
                    has_any_valid = True
            else:
                # Empty string - no file for this area
                print_paths.append(None)
        # If no valid paths at all, clear print_paths
        if not has_any_valid:
            print_paths = None
    
    # Single file fallback
    if print_file:
        print_path = resolve_path(print_file)
    
    try:
        preview_bytes = image_service.generate_preview(
            Path(template.path),
            points,
            print_path,
            radius,
            blend,
            change_bg,
            add_prod,
            point_sets=point_sets,
            print_paths=print_paths
        )
        return Response(
            content=preview_bytes, 
            media_type="image/jpeg",
            headers={"Cache-Control": "no-cache"}  # Don't cache previews
        )
    except Exception as e:
        raise HTTPException(500, f"Preview generation failed: {e}")
