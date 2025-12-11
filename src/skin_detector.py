"""
Модуль для детекции телесных тонов с поддержкой всех оттенков кожи.
Используется для защиты лиц от перекрашивания в PSD шаблонах.
"""
import numpy as np
import cv2
from typing import Dict, Tuple


class SkinDetector:
    """Детектор телесных тонов с поддержкой всех оттенков кожи."""
    
    # HSV диапазоны для разных оттенков кожи
    # H: 0-180 (OpenCV), S: 0-255, V: 0-255
    # ВАЖНО: Насыщенность ограничена до 90-100 чтобы исключить яркие красные/оранжевые цвета
    # (красные плашки, кнопки и т.д. имеют S > 100, кожа обычно S < 90)
    SKIN_RANGES: Dict[str, Dict[str, Tuple[int, int]]] = {
        'light': {'h': (0, 25), 's': (20, 90), 'v': (180, 255)},
        'medium': {'h': (0, 25), 's': (30, 100), 'v': (120, 220)},
        'dark': {'h': (0, 30), 's': (30, 100), 'v': (50, 160)},
        'olive': {'h': (15, 35), 's': (25, 90), 'v': (100, 200)},
        'reddish': {'h': (0, 15), 's': (40, 100), 'v': (100, 230)},
    }
    
    def __init__(self, feather_radius: int = 5):
        """
        Инициализация детектора.
        
        Args:
            feather_radius: Радиус размытия для сглаживания границ маски
        """
        self._feather_radius = feather_radius
    
    def detect_skin_mask(self, image: np.ndarray, feather_radius: int = None) -> np.ndarray:
        """
        Создаёт soft mask телесных тонов (0-255).
        
        Args:
            image: Изображение в формате RGB или RGBA (numpy array)
            feather_radius: Радиус размытия границ (по умолчанию из конструктора)
        
        Returns:
            Маска 0-255, где 255 = кожа, 0 = не кожа
        """
        if image is None or image.size == 0:
            return np.zeros((1, 1), dtype=np.uint8)
        
        if feather_radius is None:
            feather_radius = self._feather_radius
        
        # Убираем альфа-канал если есть
        if len(image.shape) == 3 and image.shape[2] == 4:
            rgb = image[:, :, :3]
        elif len(image.shape) == 3 and image.shape[2] == 3:
            rgb = image
        elif len(image.shape) == 2:
            # Grayscale - нет кожи
            return np.zeros(image.shape, dtype=np.uint8)
        else:
            return np.zeros((1, 1), dtype=np.uint8)
        
        # Конвертируем в HSV
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
        
        # Создаём комбинированную маску для всех оттенков кожи
        combined_mask = np.zeros(hsv.shape[:2], dtype=np.float32)
        
        for skin_type, ranges in self.SKIN_RANGES.items():
            h_min, h_max = ranges['h']
            s_min, s_max = ranges['s']
            v_min, v_max = ranges['v']
            
            # Создаём маску для этого диапазона
            lower = np.array([h_min, s_min, v_min], dtype=np.uint8)
            upper = np.array([h_max, s_max, v_max], dtype=np.uint8)
            
            mask = cv2.inRange(hsv, lower, upper)
            
            # Добавляем к комбинированной маске
            combined_mask = np.maximum(combined_mask, mask.astype(np.float32))
        
        # Нормализуем к 0-255
        combined_mask = np.clip(combined_mask, 0, 255).astype(np.uint8)
        
        # Применяем feathering (Gaussian blur) для плавных переходов
        if feather_radius > 0:
            # Kernel size должен быть нечётным
            kernel_size = feather_radius * 2 + 1
            combined_mask = cv2.GaussianBlur(
                combined_mask, 
                (kernel_size, kernel_size), 
                0
            )
        
        return combined_mask

    
    def get_skin_percentage(self, image: np.ndarray) -> float:
        """
        Вычисляет процент пикселей с телесными тонами среди видимых пикселей.
        
        Args:
            image: Изображение в формате RGB или RGBA (numpy array)
        
        Returns:
            Процент пикселей с кожей (0.0 - 1.0) среди видимых пикселей
        """
        if image is None or image.size == 0:
            return 0.0
        
        # Получаем маску без feathering для точного подсчёта
        mask = self.detect_skin_mask(image, feather_radius=0)
        
        if mask.size == 0:
            return 0.0
        
        # Определяем видимые пиксели (учитываем альфа-канал если есть)
        if len(image.shape) == 3 and image.shape[2] == 4:
            # RGBA - считаем только пиксели с альфа > 127
            alpha = image[:, :, 3]
            visible_mask = alpha > 127
            total_visible = np.sum(visible_mask)
            
            if total_visible == 0:
                return 0.0
            
            # Считаем пиксели кожи только среди видимых
            skin_pixels = np.sum((mask > 127) & visible_mask)
            return skin_pixels / total_visible
        else:
            # RGB или grayscale - все пиксели видимы
            skin_pixels = np.sum(mask > 127)
            total_pixels = mask.size
            return skin_pixels / total_pixels if total_pixels > 0 else 0.0
    
    def is_photo_layer(self, image: np.ndarray, threshold: float = 0.05) -> bool:
        """
        Определяет является ли изображение фото по содержанию кожи.
        
        Args:
            image: Изображение в формате RGB или RGBA (numpy array)
            threshold: Минимальный процент кожи для определения как фото (по умолчанию 5%)
        
        Returns:
            True если изображение содержит достаточно телесных тонов
        """
        if image is None or image.size == 0:
            return False
        
        skin_percentage = self.get_skin_percentage(image)
        return skin_percentage >= threshold
    
    def is_skin_color(self, h: int, s: int, v: int) -> bool:
        """
        Проверяет является ли HSV цвет телесным тоном.
        
        Args:
            h: Hue (0-180 в OpenCV формате)
            s: Saturation (0-255)
            v: Value (0-255)
        
        Returns:
            True если цвет попадает в диапазон телесных тонов
        """
        for ranges in self.SKIN_RANGES.values():
            h_min, h_max = ranges['h']
            s_min, s_max = ranges['s']
            v_min, v_max = ranges['v']
            
            if (h_min <= h <= h_max and 
                s_min <= s <= s_max and 
                v_min <= v <= v_max):
                return True
        
        return False
