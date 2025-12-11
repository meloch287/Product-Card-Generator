from .templates import router as templates_router
from .folders import router as folders_router
from .generate import router as generate_router
from .inpaint import router as inpaint_router
from .save_image import router as save_image_router
from .cards import router as cards_router
from .marketplace import router as marketplace_router

__all__ = [
    'templates_router', 
    'folders_router', 
    'generate_router', 
    'inpaint_router', 
    'save_image_router', 
    'cards_router',
    'marketplace_router'
]
