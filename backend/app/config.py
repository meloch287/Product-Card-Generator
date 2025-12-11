from pathlib import Path

# Paths
BASE_DIR = Path(__file__).parent.parent.parent
UPLOADS_DIR = BASE_DIR / "uploads"
TEMPLATES_DIR = UPLOADS_DIR / "templates"
PRINTS_DIR = UPLOADS_DIR / "prints"
OUTPUT_DIR = BASE_DIR / "output"
EDITOR_OUTPUT_DIR = OUTPUT_DIR / "editor"
THUMBNAILS_DIR = UPLOADS_DIR / "thumbnails"

# Create directories
for d in [UPLOADS_DIR, TEMPLATES_DIR, PRINTS_DIR, OUTPUT_DIR, EDITOR_OUTPUT_DIR, THUMBNAILS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Image settings
THUMBNAIL_SIZE = (300, 300)
PREVIEW_MAX_SIZE = 800
SUPPORTED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.psd', '.webp'}
