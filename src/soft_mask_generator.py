"""
Генератор мягких масок с плавными переходами для перекрашивания.
Использует sigmoid falloff вместо hard threshold для устранения артефактов.
"""
import numpy as np
import cv2
from typing import Tuple


class SoftMaskGenerator:
    """Генератор мягких масок с плавными переходами."""
    
    def __init__(
        self,
        sat_threshold: float = 50.0,
        val_low: float = 30.0,
        val_high: float = 245.0,
        falloff_width: float = 20.0,
        feather_radius: int = 3
    ):
        """
        Инициализация генератора масок.
        
        Args:
            sat_threshold: Порог насыщенности для цветных пикселей
            val_low: Нижний порог яркости
            val_high: Верхний порог яркости
            falloff_width: Ширина перехода для sigmoid функции
            feather_radius: Радиус размытия границ (минимум 3)
        """
        self._sat_threshold = sat_threshold
        self._val_low = val_low
        self._val_high = val_high
        self._falloff_width = falloff_width
        self._feather_radius = max(3, feather_radius)  # Минимум 3 пикселя
    
    @staticmethod
    def sigmoid_threshold(
        value: np.ndarray, 
        threshold: float, 
        width: float
    ) -> np.ndarray:
        """
        Smooth threshold function: 1/(1 + exp(-(x-threshold)/width))
        
        Обеспечивает плавный переход вместо резкого порога.
        Функция является Lipschitz-непрерывной с константой k = 1/(4*width).
        
        Args:
            value: Входные значения (numpy array)
            threshold: Пороговое значение
            width: Ширина перехода (больше = более плавный переход)
        
        Returns:
            Значения от 0 до 1 с плавным переходом около threshold
        """
        if width <= 0:
            width = 1.0  # Защита от деления на ноль
        
        # Ограничиваем экспоненту для предотвращения overflow
        x = (value.astype(np.float64) - threshold) / width
        x = np.clip(x, -500, 500)
        
        return 1.0 / (1.0 + np.exp(-x))
    
    def create_color_mask(
        self, 
        hsv_image: np.ndarray,
        sat_threshold: float = None,
        val_low: float = None,
        val_high: float = None,
        falloff_width: float = None
    ) -> np.ndarray:
        """
        Создаёт soft mask для цветных пикселей.
        Использует sigmoid falloff вместо hard threshold.
        
        Args:
            hsv_image: Изображение в HSV формате (numpy array)
            sat_threshold: Порог насыщенности (по умолчанию из конструктора)
            val_low: Нижний порог яркости (по умолчанию из конструктора)
            val_high: Верхний порог яркости (по умолчанию из конструктора)
            falloff_width: Ширина перехода (по умолчанию из конструктора)
        
        Returns:
            Soft mask 0-255, где 255 = цветной пиксель для перекрашивания
        """
        if hsv_image is None or hsv_image.size == 0:
            return np.zeros((1, 1), dtype=np.uint8)
        
        # Используем параметры из конструктора если не указаны
        sat_threshold = sat_threshold if sat_threshold is not None else self._sat_threshold
        val_low = val_low if val_low is not None else self._val_low
        val_high = val_high if val_high is not None else self._val_high
        falloff_width = falloff_width if falloff_width is not None else self._falloff_width
        
        # Извлекаем каналы S и V
        saturation = hsv_image[:, :, 1].astype(np.float64)
        value = hsv_image[:, :, 2].astype(np.float64)
        
        # Soft mask для насыщенности: высокие значения = цветной пиксель
        sat_mask = self.sigmoid_threshold(saturation, sat_threshold, falloff_width)
        
        # Soft mask для яркости: исключаем слишком тёмные и слишком светлые
        # Для val_low: значения выше порога -> 1
        val_low_mask = self.sigmoid_threshold(value, val_low, falloff_width)
        # Для val_high: значения ниже порога -> 1 (инвертируем)
        val_high_mask = 1.0 - self.sigmoid_threshold(value, val_high, falloff_width)
        
        # Комбинируем маски: пиксель должен быть насыщенным И в допустимом диапазоне яркости
        combined_mask = sat_mask * val_low_mask * val_high_mask
        
        # Конвертируем в 0-255
        result = (combined_mask * 255).astype(np.uint8)
        
        return result
    
    def apply_feathering(
        self, 
        mask: np.ndarray, 
        radius: int = None
    ) -> np.ndarray:
        """
        Применяет Gaussian blur для сглаживания границ маски.
        
        Args:
            mask: Входная маска (0-255)
            radius: Радиус размытия (минимум 3, по умолчанию из конструктора)
        
        Returns:
            Маска с размытыми границами
        """
        if mask is None or mask.size == 0:
            return np.zeros((1, 1), dtype=np.uint8)
        
        radius = radius if radius is not None else self._feather_radius
        radius = max(3, radius)  # Минимум 3 пикселя по требованию 1.2
        
        # Kernel size должен быть нечётным
        kernel_size = radius * 2 + 1
        
        # Применяем Gaussian blur
        feathered = cv2.GaussianBlur(
            mask.astype(np.float32),
            (kernel_size, kernel_size),
            0
        )
        
        return np.clip(feathered, 0, 255).astype(np.uint8)
