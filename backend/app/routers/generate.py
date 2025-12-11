import sys
import uuid
from pathlib import Path
from typing import List
from concurrent.futures import ThreadPoolExecutor, as_completed

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from fastapi import APIRouter, HTTPException, BackgroundTasks

from backend.app.models import GenerationRequest, GenerationStatus
from backend.app.storage import storage
from backend.app.config import OUTPUT_DIR, SUPPORTED_EXTENSIONS
from backend.app.services import image_service

router = APIRouter(prefix="/api/generate", tags=["generate"])

# Thread pool for parallel processing - use more workers for I/O bound tasks
executor = ThreadPoolExecutor(max_workers=6)

# Active generation task
_current_task_id: str = None
_cancel_flag: bool = False


def get_image_files(folder_path: Path) -> List[Path]:
    """Get all image files in folder."""
    if not folder_path.exists():
        return []
    return sorted([f for f in folder_path.iterdir() 
                   if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS],
                  key=lambda p: p.name.lower())


def process_generation(task_id: str, template_ids: List[str], folder_ids: List[str]):
    """Background task for generation."""
    global _cancel_flag
    
    templates = [storage.get_template(tid) for tid in template_ids]
    templates = [t for t in templates if t]
    
    folders = [storage.get_folder(fid) for fid in folder_ids]
    folders = [f for f in folders if f]
    
    if not templates or not folders:
        storage.generation_status = GenerationStatus(
            is_running=False,
            errors=[{"file": "config", "error": "No templates or folders"}]
        )
        return
    
    # Count total
    total = 0
    for folder in folders:
        files = get_image_files(Path(folder.path))
        total += len(files) * len(templates)
    
    storage.generation_status = GenerationStatus(
        is_running=True,
        current=0,
        total=total,
        task_id=task_id
    )
    
    current = 0
    errors = []
    
    for folder in folders:
        if _cancel_flag:
            break
            
        folder_path = Path(folder.path)
        output_folder = OUTPUT_DIR / folder.name
        output_folder.mkdir(parents=True, exist_ok=True)
        
        files = get_image_files(folder_path)
        
        for print_file in files:
            if _cancel_flag:
                break
                
            for t_idx, template in enumerate(templates):
                if _cancel_flag:
                    break
                    
                try:
                    # Handle both Point objects and dicts
                    points = [(p.x, p.y) if hasattr(p, 'x') else (p['x'], p['y']) for p in template.points]
                    
                    # Output filename
                    if len(templates) > 1:
                        out_name = f"{print_file.stem}_{t_idx + 1}.png"
                    else:
                        out_name = f"{print_file.stem}.png"
                    
                    output_path = output_folder / out_name
                    
                    image_service.generate_card(
                        Path(template.path),
                        points,
                        print_file,
                        output_path,
                        template.corner_radius,
                        template.blend_strength,
                        template.change_background_color,
                        template.add_product
                    )
                    
                except Exception as e:
                    errors.append({
                        "file": f"{folder.name}/{print_file.name}",
                        "error": str(e)
                    })
                
                current += 1
                storage.generation_status = GenerationStatus(
                    is_running=True,
                    current=current,
                    total=total,
                    errors=errors,
                    task_id=task_id
                )
    
    storage.generation_status = GenerationStatus(
        is_running=False,
        current=current,
        total=total,
        errors=errors,
        task_id=task_id
    )
    _cancel_flag = False


@router.post("/start")
async def start_generation(request: GenerationRequest, background_tasks: BackgroundTasks):
    """Start generation process."""
    global _current_task_id, _cancel_flag
    
    if storage.generation_status.is_running:
        raise HTTPException(400, "Generation already in progress")
    
    if not request.template_ids:
        raise HTTPException(400, "No templates selected")
    
    if not request.folder_ids:
        raise HTTPException(400, "No folders selected")
    
    _cancel_flag = False
    _current_task_id = str(uuid.uuid4())
    
    background_tasks.add_task(
        process_generation,
        _current_task_id,
        request.template_ids,
        request.folder_ids
    )
    
    return {"status": "started", "task_id": _current_task_id}


@router.post("/stop")
async def stop_generation():
    """Stop current generation."""
    global _cancel_flag
    
    if not storage.generation_status.is_running:
        raise HTTPException(400, "No generation in progress")
    
    _cancel_flag = True
    return {"status": "stopping"}


@router.get("/status", response_model=GenerationStatus)
async def get_status():
    """Get current generation status."""
    return storage.generation_status


@router.post("/reset")
async def reset_status():
    """Reset generation status."""
    if storage.generation_status.is_running:
        raise HTTPException(400, "Cannot reset while running")
    
    storage.generation_status = GenerationStatus()
    return {"status": "reset"}
