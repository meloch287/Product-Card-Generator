import sys
import logging
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Reduce noise from libraries
logging.getLogger("src.psd_processor").setLevel(logging.WARNING)
logging.getLogger("PIL").setLevel(logging.WARNING)
logging.getLogger("psd_tools").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.INFO)

logger = logging.getLogger(__name__)

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.app.routers import templates_router, folders_router, generate_router, inpaint_router, save_image_router, cards_router, marketplace_router
from backend.app.routers.categories import router as categories_router
from backend.app.routers.import_products import router as import_router
from backend.app.config import OUTPUT_DIR, UPLOADS_DIR, SUPPORTED_EXTENSIONS

app = FastAPI(
    title="Card Generator API",
    description="API for generating product cards with perspective transformation",
    version="1.0.0"
)

# GZip compression for responses > 500 bytes
# Enables compression for /api/cards endpoint (Requirement 1.4)
app.add_middleware(GZipMiddleware, minimum_size=500)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
app.mount("/output", StaticFiles(directory=str(OUTPUT_DIR)), name="output")

# Routers
app.include_router(templates_router)
app.include_router(folders_router)
app.include_router(generate_router)
app.include_router(inpaint_router)
app.include_router(save_image_router)
app.include_router(cards_router)
app.include_router(marketplace_router)
app.include_router(categories_router)
app.include_router(import_router)


@app.get("/")
async def root():
    logger.info("Root endpoint called")
    return {"message": "Card Generator API", "docs": "/docs"}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/image")
async def get_image(path: str = Query(..., description="Full path to the image file")):
    """Serve an image file from the filesystem.
    
    Used by the photo editor to display images from user folders.
    """
    file_path = Path(path)
    
    if not file_path.exists():
        raise HTTPException(404, "Image not found")
    
    if not file_path.is_file():
        raise HTTPException(400, "Path is not a file")
    
    # Validate it's a supported image format
    if file_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported image format: {file_path.suffix}")
    
    # Determine media type
    suffix = file_path.suffix.lower()
    media_types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
    }
    media_type = media_types.get(suffix, 'application/octet-stream')
    
    return FileResponse(file_path, media_type=media_type)
