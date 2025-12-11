import sys
import uuid
from pathlib import Path
from typing import List

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import FileResponse

from backend.app.models import PrintFolder
from backend.app.storage import storage
from backend.app.config import SUPPORTED_EXTENSIONS

router = APIRouter(prefix="/api/folders", tags=["folders"])


def count_images(folder_path: Path) -> int:
    """Count image files in folder."""
    if not folder_path.exists():
        return 0
    return len([f for f in folder_path.iterdir() 
                if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS])


def get_image_files(folder_path: Path) -> List[Path]:
    """Get all image files in folder."""
    if not folder_path.exists():
        return []
    return sorted([f for f in folder_path.iterdir() 
                   if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS],
                  key=lambda p: p.name.lower())


@router.get("", response_model=List[PrintFolder])
async def get_folders():
    """Get all print folders."""
    return storage.get_all_folders()


@router.post("", response_model=PrintFolder)
async def add_folder(path: str = Body(..., embed=True)):
    """Add a print folder by path."""
    folder_path = Path(path)
    
    if not folder_path.exists():
        raise HTTPException(400, f"Folder does not exist: {path}")
    
    if not folder_path.is_dir():
        raise HTTPException(400, f"Path is not a directory: {path}")
    
    # Check if already added
    for f in storage.folders.values():
        if Path(f.path).resolve() == folder_path.resolve():
            raise HTTPException(400, "Folder already added")
    
    folder = PrintFolder(
        id=str(uuid.uuid4()),
        path=str(folder_path.resolve()),
        name=folder_path.name,
        file_count=count_images(folder_path)
    )
    
    return storage.add_folder(folder)


@router.get("/{folder_id}", response_model=PrintFolder)
async def get_folder(folder_id: str):
    """Get folder by ID."""
    folder = storage.get_folder(folder_id)
    if not folder:
        raise HTTPException(404, "Folder not found")
    return folder


@router.delete("/{folder_id}")
async def delete_folder(folder_id: str):
    """Remove folder from list (doesn't delete files)."""
    if not storage.delete_folder(folder_id):
        raise HTTPException(404, "Folder not found")
    return {"status": "deleted"}


@router.get("/{folder_id}/files")
async def get_folder_files(folder_id: str):
    """Get list of image files in folder."""
    folder = storage.get_folder(folder_id)
    if not folder:
        raise HTTPException(404, "Folder not found")
    
    files = get_image_files(Path(folder.path))
    return [{"name": f.name, "path": str(f)} for f in files]


@router.get("/{folder_id}/files/{filename}/thumbnail")
async def get_file_thumbnail(folder_id: str, filename: str):
    """Get thumbnail of a print file."""
    folder = storage.get_folder(folder_id)
    if not folder:
        raise HTTPException(404, "Folder not found")
    
    file_path = Path(folder.path) / filename
    if not file_path.exists():
        raise HTTPException(404, "File not found")
    
    return FileResponse(file_path, media_type="image/png")


@router.post("/browse")
async def browse_folder():
    """Open native folder selection dialog.
    
    Scans the selected folder for subfolders containing images
    and returns all subfolders that have at least one image.
    """
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)

    folder_path = filedialog.askdirectory(
        title="Выберите папку с принтами", mustexist=True
    )

    root.destroy()

    if not folder_path:
        raise HTTPException(400, "No folder selected")

    selected_path = Path(folder_path)
    paths_to_add = []
    
    # Check if selected folder itself has images
    if count_images(selected_path) > 0:
        paths_to_add.append(str(selected_path))
    
    # Scan subfolders for images
    try:
        for item in selected_path.iterdir():
            if item.is_dir() and not item.name.startswith('.'):
                if count_images(item) > 0:
                    paths_to_add.append(str(item))
    except PermissionError:
        pass
    
    if not paths_to_add:
        raise HTTPException(400, "No folders with images found")

    return {"paths": paths_to_add}


@router.post("/add-multiple")
async def add_multiple_folders(paths: List[str] = Body(...)):
    """Add multiple folders at once.
    
    Returns added folders and skipped folders with reasons.
    Handles duplicates gracefully by skipping them.
    """
    added = []
    skipped = []
    
    for path in paths:
        folder_path = Path(path)
        
        # Check if folder exists
        if not folder_path.exists():
            skipped.append({"path": path, "reason": "not_found"})
            continue
        
        # Check if it's a directory
        if not folder_path.is_dir():
            skipped.append({"path": path, "reason": "not_directory"})
            continue
        
        # Check if already added (duplicate)
        already_exists = False
        for f in storage.folders.values():
            if Path(f.path).resolve() == folder_path.resolve():
                already_exists = True
                skipped.append({"path": path, "reason": "duplicate"})
                break
        
        if not already_exists:
            folder = PrintFolder(
                id=str(uuid.uuid4()),
                path=str(folder_path.resolve()),
                name=folder_path.name,
                file_count=count_images(folder_path)
            )
            storage.add_folder(folder)
            added.append(folder)
    
    return {
        "added": added,
        "added_count": len(added),
        "skipped": skipped,
        "skipped_count": len(skipped)
    }
