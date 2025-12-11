from pathlib import Path
from typing import List
from PIL import Image

try:
    from psd_tools import PSDImage
    PSD_SUPPORTED = True
except ImportError:
    PSD_SUPPORTED = False

SUPPORTED_EXTENSIONS = {'.png', '.jpg', '.jpeg'}
PSD_EXTENSIONS = {'.psd'}


def is_valid_image(file_path: Path) -> bool:
    if not file_path.exists() or not file_path.is_file():
        return False
    
    suffix = file_path.suffix.lower()
    
    if suffix in PSD_EXTENSIONS:
        if not PSD_SUPPORTED:
            return False
        try:
            psd = PSDImage.open(file_path)
            _ = psd.size
            return True
        except Exception:
            return False
    
    if suffix not in SUPPORTED_EXTENSIONS:
        return False
    
    try:
        with Image.open(file_path) as img:
            img.verify()
        return True
    except Exception:
        return False


def load_image(file_path: Path) -> Image.Image:
    if not file_path.exists():
        raise ValueError(f"File does not exist: {file_path}")
    
    suffix = file_path.suffix.lower()
    
    if suffix in PSD_EXTENSIONS:
        if not PSD_SUPPORTED:
            raise ValueError("PSD support not available. Install psd-tools: pip install psd-tools")
        try:
            psd = PSDImage.open(file_path)
            return psd.composite()
        except Exception as e:
            raise ValueError(f"Failed to open PSD file: {e}")
    
    if suffix in SUPPORTED_EXTENSIONS:
        try:
            return Image.open(file_path)
        except Exception as e:
            raise ValueError(f"Failed to open image file: {e}")
    
    raise ValueError(f"Unsupported file format: {suffix}")


# Simple LRU cache for loaded images
_image_cache = {}
_CACHE_MAX_SIZE = 50


def clear_image_cache():
    """Очистить кэш изображений."""
    global _image_cache
    _image_cache.clear()


def load_image_cv2(file_path: Path, use_cache: bool = True):
    import numpy as np
    import cv2
    
    file_path = Path(file_path)
    cache_key = str(file_path)
    
    # Check cache first
    if use_cache and cache_key in _image_cache:
        return _image_cache[cache_key].copy()
    
    if not file_path.exists():
        raise ValueError(f"File does not exist: {file_path}")
    
    suffix = file_path.suffix.lower()
    
    if suffix in PSD_EXTENSIONS:
        pil_img = load_image(file_path)
        img_array = np.array(pil_img)
        if len(img_array.shape) == 2:
            result = img_array
        elif img_array.shape[2] == 3:
            result = img_array[:, :, ::-1]
        elif img_array.shape[2] == 4:
            result = np.concatenate([
                img_array[:, :, 2:3],
                img_array[:, :, 1:2],
                img_array[:, :, 0:1],
                img_array[:, :, 3:4],
            ], axis=2)
        else:
            result = img_array
    else:
        # Сначала пробуем через PIL (поддерживает Unicode пути)
        result = None
        try:
            pil_img = Image.open(file_path)
            # Загружаем данные изображения полностью
            pil_img.load()
            
            # Конвертируем в правильный режим для корректной обработки PNG
            # Все режимы приводим к RGB или RGBA
            original_mode = pil_img.mode
            
            if original_mode in ('P', 'PA'):
                # Палитровые изображения - проверяем есть ли прозрачность
                if 'transparency' in pil_img.info or original_mode == 'PA':
                    pil_img = pil_img.convert('RGBA')
                else:
                    pil_img = pil_img.convert('RGB')
            elif original_mode == 'L':
                # Grayscale без альфы -> RGB (сохраняем цвета)
                pil_img = pil_img.convert('RGB')
            elif original_mode == 'LA':
                # Grayscale с альфой -> RGBA
                pil_img = pil_img.convert('RGBA')
            elif original_mode == '1':
                # Bitmap -> RGB
                pil_img = pil_img.convert('RGB')
            elif original_mode in ('I', 'I;16', 'I;16L', 'I;16B'):
                # 16-bit Integer -> RGB (нормализуем)
                img_array = np.array(pil_img)
                if img_array.max() > 255:
                    img_array = (img_array / 256).astype(np.uint8)
                pil_img = Image.fromarray(img_array).convert('RGB')
            elif original_mode == 'F':
                # Float -> RGB
                img_array = np.array(pil_img)
                img_array = ((img_array - img_array.min()) / (img_array.max() - img_array.min() + 1e-8) * 255).astype(np.uint8)
                pil_img = Image.fromarray(img_array).convert('RGB')
            elif original_mode == 'CMYK':
                # CMYK -> RGB
                pil_img = pil_img.convert('RGB')
            elif original_mode not in ('RGB', 'RGBA'):
                # Любой другой режим -> RGBA на всякий случай
                pil_img = pil_img.convert('RGBA')
            # RGB и RGBA оставляем как есть
            
            img_array = np.array(pil_img)
            
            if len(img_array.shape) == 2:
                result = img_array
            elif img_array.shape[2] == 3:
                result = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
            elif img_array.shape[2] == 4:
                result = cv2.cvtColor(img_array, cv2.COLOR_RGBA2BGRA)
            else:
                result = img_array
        except Exception:
            pass
        
        if result is None:
            # Fallback на cv2.imread (может не работать с Unicode)
            result = cv2.imread(str(file_path), cv2.IMREAD_UNCHANGED)
        
        if result is None:
            raise ValueError(f"Failed to load image: {file_path}")
    
    # Cache the result
    if use_cache:
        if len(_image_cache) >= _CACHE_MAX_SIZE:
            # Remove oldest entries
            keys_to_remove = list(_image_cache.keys())[:_CACHE_MAX_SIZE // 2]
            for k in keys_to_remove:
                del _image_cache[k]
        _image_cache[cache_key] = result.copy()
    
    return result


def get_image_files(folder_path: Path) -> List[Path]:
    if not folder_path.exists():
        raise ValueError(f"Folder does not exist: {folder_path}")
    
    if not folder_path.is_dir():
        raise ValueError(f"Path is not a directory: {folder_path}")
    
    image_files = []
    all_extensions = SUPPORTED_EXTENSIONS | PSD_EXTENSIONS
    
    for file_path in folder_path.iterdir():
        if file_path.is_dir():
            continue
        if file_path.suffix.lower() in all_extensions:
            if is_valid_image(file_path):
                image_files.append(file_path)
    
    return sorted(image_files, key=lambda p: p.name.lower())
