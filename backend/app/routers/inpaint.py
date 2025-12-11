"""
Inpainting API endpoint for the Photo Editor.

Provides content-aware fill functionality using OpenCV's inpainting algorithms.
"""
import base64
import io
from typing import Optional

import cv2
import numpy as np
from PIL import Image
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


router = APIRouter(prefix="/api", tags=["inpaint"])


class InpaintRequest(BaseModel):
    """Request model for inpainting operation."""
    image: str = Field(..., description="Base64 encoded image data")
    mask: str = Field(..., description="Base64 encoded mask data (white = area to inpaint)")
    radius: Optional[int] = Field(default=3, description="Inpainting radius")


class InpaintResponse(BaseModel):
    """Response model for inpainting operation."""
    result: str = Field(..., description="Base64 encoded result image")


def decode_base64_image(base64_str: str) -> np.ndarray:
    """Decode base64 string to numpy array (BGR format for OpenCV)."""
    # Handle data URL format (e.g., "data:image/png;base64,...")
    if "," in base64_str:
        base64_str = base64_str.split(",", 1)[1]
    
    try:
        image_data = base64.b64decode(base64_str)
        image = Image.open(io.BytesIO(image_data))
        
        # Convert to RGB if needed
        if image.mode == "RGBA":
            # Create white background for RGBA images
            background = Image.new("RGB", image.size, (255, 255, 255))
            background.paste(image, mask=image.split()[3])
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")
        
        # Convert to BGR for OpenCV
        return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    except Exception as e:
        raise HTTPException(400, f"Failed to decode image: {str(e)}")


def decode_base64_mask(base64_str: str) -> np.ndarray:
    """Decode base64 string to grayscale mask array."""
    # Handle data URL format
    if "," in base64_str:
        base64_str = base64_str.split(",", 1)[1]
    
    try:
        image_data = base64.b64decode(base64_str)
        image = Image.open(io.BytesIO(image_data))
        
        # Convert to grayscale
        if image.mode != "L":
            image = image.convert("L")
        
        return np.array(image)
    except Exception as e:
        raise HTTPException(400, f"Failed to decode mask: {str(e)}")


def encode_image_to_base64(image: np.ndarray) -> str:
    """Encode numpy array (BGR) to base64 PNG string."""
    # Convert BGR to RGB
    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    pil_image = Image.fromarray(rgb_image)
    
    buffer = io.BytesIO()
    pil_image.save(buffer, format="PNG")
    buffer.seek(0)
    
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


@router.post("/inpaint", response_model=InpaintResponse)
async def inpaint_image(request: InpaintRequest) -> InpaintResponse:
    """
    Apply content-aware inpainting to an image.
    
    The mask should be a grayscale image where white (255) indicates
    the areas to be inpainted (filled in).
    
    Uses OpenCV's Telea inpainting algorithm for fast, quality results.
    """
    # Decode inputs
    image = decode_base64_image(request.image)
    mask = decode_base64_mask(request.mask)
    
    # Validate dimensions match
    if image.shape[:2] != mask.shape[:2]:
        raise HTTPException(
            400, 
            f"Image and mask dimensions must match. "
            f"Image: {image.shape[:2]}, Mask: {mask.shape[:2]}"
        )
    
    # Ensure mask is binary (threshold at 128)
    _, binary_mask = cv2.threshold(mask, 128, 255, cv2.THRESH_BINARY)
    
    # Apply inpainting using Telea algorithm (fast and good quality)
    # Alternative: cv2.INPAINT_NS (Navier-Stokes based)
    radius = max(1, min(request.radius or 3, 20))  # Clamp radius to reasonable range
    result = cv2.inpaint(image, binary_mask, radius, cv2.INPAINT_TELEA)
    
    # Encode result
    result_base64 = encode_image_to_base64(result)
    
    return InpaintResponse(result=f"data:image/png;base64,{result_base64}")
