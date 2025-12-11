"""
Save Image API endpoint for the Photo Editor.

Provides functionality to save edited images back to the source folder.
"""
import base64
import io
import os
from pathlib import Path
from typing import Optional
from datetime import datetime

from PIL import Image
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


router = APIRouter(prefix="/api", tags=["save-image"])


class SaveImageRequest(BaseModel):
    """Request model for saving an image."""
    image: str = Field(..., description="Base64 encoded image data")
    folder_path: str = Field(default="", description="Original folder path (for reference)")
    filename: str = Field(..., description="Original filename")
    suffix: Optional[str] = Field(default="_edited", description="Suffix to add before extension")


class SaveImageResponse(BaseModel):
    """Response model for save operation."""
    success: bool = Field(..., description="Whether the save was successful")
    path: str = Field(..., description="Full path to the saved file")
    filename: str = Field(..., description="Name of the saved file")


def decode_base64_image(base64_str: str) -> Image.Image:
    """Decode base64 string to PIL Image."""
    # Handle data URL format (e.g., "data:image/png;base64,...")
    if "," in base64_str:
        base64_str = base64_str.split(",", 1)[1]
    
    try:
        image_data = base64.b64decode(base64_str)
        image = Image.open(io.BytesIO(image_data))
        return image
    except Exception as e:
        raise HTTPException(400, f"Failed to decode image: {str(e)}")


def generate_save_filename(original_filename: str, suffix: str) -> str:
    """Generate filename with suffix, preserving original name."""
    path = Path(original_filename)
    stem = path.stem
    extension = path.suffix.lower()
    
    # Default to .png if no extension
    if not extension:
        extension = ".png"
    
    # Ensure valid extension
    valid_extensions = {'.png', '.jpg', '.jpeg', '.webp'}
    if extension not in valid_extensions:
        extension = ".png"
    
    return f"{stem}{suffix}{extension}"


@router.post("/save-image", response_model=SaveImageResponse)
async def save_image(request: SaveImageRequest) -> SaveImageResponse:
    """
    Save an edited image to output/editor folder.
    
    The image is saved with the original filename plus an optional suffix.
    All edited images go to output/editor/ directory.
    """
    from backend.app.config import EDITOR_OUTPUT_DIR
    
    # Always save to output/editor folder
    folder_path = EDITOR_OUTPUT_DIR
    folder_path.mkdir(parents=True, exist_ok=True)
    
    # Decode image
    image = decode_base64_image(request.image)
    
    # Generate filename
    suffix = request.suffix if request.suffix else "_edited"
    save_filename = generate_save_filename(request.filename, suffix)
    save_path = folder_path / save_filename
    
    # Handle filename collision - add timestamp if file exists
    if save_path.exists():
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        stem = Path(save_filename).stem
        extension = Path(save_filename).suffix
        save_filename = f"{stem}_{timestamp}{extension}"
        save_path = folder_path / save_filename
    
    try:
        # Convert RGBA to RGB for JPEG
        if save_path.suffix.lower() in {'.jpg', '.jpeg'} and image.mode == 'RGBA':
            background = Image.new('RGB', image.size, (255, 255, 255))
            background.paste(image, mask=image.split()[3])
            image = background
        elif image.mode == 'RGBA' and save_path.suffix.lower() not in {'.png', '.webp'}:
            image = image.convert('RGB')
        
        # Save image
        image.save(str(save_path), quality=95)
        
        return SaveImageResponse(
            success=True,
            path=str(save_path),
            filename=save_filename
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to save image: {str(e)}")
