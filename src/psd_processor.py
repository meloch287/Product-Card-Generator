"""
Модуль для обработки PSD шаблонов.
Перекрашивает цветные элементы фона в цвет коврика.
НЕ перекрашивает: коврик, фото с лицами, белое, чёрное, серое.
"""
from pathlib import Path
from typing import Tuple, Optional, Dict, List
from dataclasses import dataclass
from PIL import Image
import numpy as np
import colorsys
import logging
import cv2

from src.skin_detector import SkinDetector
from src.soft_mask_generator import SoftMaskGenerator


@dataclass
class LayerRenderResult:
    """Результат рендеринга одного слоя."""
    layer_name: str
    success: bool
    image: Optional[Image.Image]
    error: Optional[str]
    method_used: str  # 'composite', 'topil', 'recursive', 'pixel_data', 'none'
    is_photo: bool = False


@dataclass
class PSDRenderResult:
    """Результат рендеринга всего PSD."""
    mode: str  # 'layer_by_layer', 'hybrid', 'composite_fallback'
    rendered_layers: List[LayerRenderResult]
    fallback_used: bool
    final_image: Optional[Image.Image] = None

# Настройка логирования для модуля
logger = logging.getLogger(__name__)

try:
    from psd_tools import PSDImage
    PSD_AVAILABLE = True
except ImportError:
    PSD_AVAILABLE = False


def is_psd_available() -> bool:
    return PSD_AVAILABLE


def rgb_to_hsv(r: int, g: int, b: int) -> Tuple[float, float, float]:
    return colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)


class PSDProcessor:
    """Простой обработчик PSD файлов."""
    
    PRODUCT_KEYWORDS = ('коврик', 'смена', 'product', 'mat', 'mousepad', 'прямоугольник')
    PHOTO_KEYWORDS = ('фото', 'photo', 'портрет', 'лицо', 'face', 'avatar', 'person', 'человек')
    
    # Порог для определения фото-слоя по содержанию кожи (3.5%)
    # Понижен с 5% до 3.5% для лучшей детекции фото с небольшим количеством кожи
    SKIN_THRESHOLD = 0.035
    
    # Константы для обработки
    ALPHA_VISIBILITY_THRESHOLD = 20   # Порог видимости альфа-канала
    HIGH_SKIN_PERCENTAGE = 0.1        # >10% кожи - усиленная защита
    DILATE_ITERATIONS = 2             # Итерации расширения маски кожи
    COLOR_MASK_THRESHOLD = 128        # Порог для маски цветных пикселей
    HUE_RANGE = 180                   # Диапазон hue в OpenCV HSV
    
    # Порог для определения режима рендеринга
    # Если отрендерилось меньше этой доли слоёв - используем hybrid/fallback
    PARTIAL_RENDER_THRESHOLD = 0.5  # 50% слоёв
    
    # Class-level PSD cache for faster repeated access
    _psd_cache: Dict[str, 'PSDImage'] = {}
    _PSD_CACHE_MAX_SIZE = 10
    
    def __init__(self):
        if not PSD_AVAILABLE:
            raise ImportError("psd-tools не установлен")
        
        # Instance-level cache (не shared между экземплярами)
        self._cache: Dict[str, Tuple] = {}
        
        # Инициализируем детекторы
        self._skin_detector = SkinDetector(feather_radius=5)
        self._mask_generator = SoftMaskGenerator(
            sat_threshold=50.0,
            val_low=15.0,  # Понижено с 30 до 15 для перекрашивания тёмных цветов
            val_high=245.0,
            falloff_width=20.0,
            feather_radius=5
        )
    
    @classmethod
    def _get_cached_psd(cls, template_path: Path) -> 'PSDImage':
        """Get PSD from cache or load it."""
        key = str(template_path)
        if key not in cls._psd_cache:
            if len(cls._psd_cache) >= cls._PSD_CACHE_MAX_SIZE:
                # Remove oldest entry
                oldest_key = next(iter(cls._psd_cache))
                del cls._psd_cache[oldest_key]
            cls._psd_cache[key] = PSDImage.open(template_path)
        return cls._psd_cache[key]
    
    @staticmethod
    def clear_cache():
        """Очищает класс-level кэш (для совместимости с GUI)."""
        # Статический метод для вызова без экземпляра
        pass  # Кэш теперь instance-level, этот метод для совместимости
    
    def _collect_layer_render_results(
        self,
        psd,
        width: int,
        height: int,
        product_layer
    ) -> Tuple[List[LayerRenderResult], List[LayerRenderResult], List[LayerRenderResult]]:
        """
        Собирает результаты рендеринга всех слоёв PSD.
        
        Разделяет слои на три группы:
        - before_product: слои до слоя коврика
        - after_product: слои после слоя коврика
        - failed: слои которые не удалось отрендерить
        
        Args:
            psd: PSD файл
            width: Ширина холста
            height: Высота холста
            product_layer: Слой коврика (для разделения before/after)
            
        Returns:
            Tuple[before_product, after_product, failed_layers]
        """
        before_product: List[LayerRenderResult] = []
        after_product: List[LayerRenderResult] = []
        failed_layers: List[LayerRenderResult] = []
        
        product_found = False
        
        for layer in psd:
            if not layer.visible:
                continue
            
            layer_name = getattr(layer, 'name', 'Unknown')
            
            # Пропускаем слой коврика
            if layer == product_layer:
                product_found = True
                continue
            
            # Рендерим слой
            layer_img = self._render_layer(layer, width, height)
            
            # Определяем метод рендеринга (для диагностики)
            method_used = 'none'
            if layer_img is not None:
                method_used = 'composite'  # По умолчанию, реальный метод логируется в _render_layer
            
            # Проверяем это фото (передаём размеры холста для определения покрытия)
            layer_arr = np.array(layer_img) if layer_img is not None else None
            is_photo = self._is_photo_layer(layer, layer_arr, width, height)
            
            # Создаём результат
            result = LayerRenderResult(
                layer_name=layer_name,
                success=layer_img is not None,
                image=layer_img,
                error=None if layer_img is not None else "Render failed",
                method_used=method_used,
                is_photo=is_photo
            )
            
            if layer_img is None:
                failed_layers.append(result)
                logger.debug(f"Layer '{layer_name}' failed to render")
            elif not product_found:
                before_product.append(result)
            else:
                after_product.append(result)
        
        return before_product, after_product, failed_layers
    
    def _determine_render_mode(
        self,
        before_product: List[LayerRenderResult],
        after_product: List[LayerRenderResult],
        failed_layers: List[LayerRenderResult]
    ) -> str:
        """
        Определяет режим рендеринга на основе результатов.
        
        Режимы:
        - 'layer_by_layer': все или большинство слоёв отрендерились успешно
        - 'hybrid': часть слоёв отрендерилась, часть нет
        - 'composite_fallback': ни один слой не отрендерился
        
        Args:
            before_product: Успешно отрендеренные слои до коврика
            after_product: Успешно отрендеренные слои после коврика
            failed_layers: Слои которые не удалось отрендерить
            
        Returns:
            Режим рендеринга: 'layer_by_layer', 'hybrid', или 'composite_fallback'
        """
        total_layers = len(before_product) + len(after_product) + len(failed_layers)
        successful_layers = len(before_product) + len(after_product)
        
        if total_layers == 0:
            logger.info("No visible layers found, using composite_fallback")
            return 'composite_fallback'
        
        if successful_layers == 0:
            logger.info(f"All {total_layers} layers failed to render, using composite_fallback")
            return 'composite_fallback'
        
        success_ratio = successful_layers / total_layers
        
        if len(failed_layers) == 0:
            logger.info(f"All {successful_layers} layers rendered successfully, using layer_by_layer")
            return 'layer_by_layer'
        
        if success_ratio >= self.PARTIAL_RENDER_THRESHOLD:
            logger.info(
                f"Rendered {successful_layers}/{total_layers} layers ({success_ratio:.0%}), "
                f"using layer_by_layer (above threshold)"
            )
            return 'layer_by_layer'
        else:
            logger.info(
                f"Rendered {successful_layers}/{total_layers} layers ({success_ratio:.0%}), "
                f"using hybrid mode (below threshold)"
            )
            return 'hybrid'
    
    def process_with_warped_product(
        self,
        template_path: Path,
        warped_product: np.ndarray,
        target_color: Tuple[int, int, int] = None
    ) -> Image.Image:
        """
        Обрабатывает PSD: перекрашивает фон, вставляет коврик (если есть слой коврика).
        
        Логика:
        - Если найден слой коврика (product_layer) - вставляем warped_product на его место
        - Если слой коврика не найден - только перекрашиваем фон, коврик НЕ вставляем
        
        Использует три режима рендеринга:
        - layer_by_layer: когда все/большинство слоёв рендерятся успешно
        - hybrid: когда часть слоёв не рендерится - комбинирует с composite
        - composite_fallback: когда ни один слой не рендерится
        """
        psd = self._get_cached_psd(template_path)
        width, height = psd.width, psd.height
        
        # Находим слой коврика
        product_layer = self._find_product_layer(psd)
        
        # Проверяем есть ли реальный warped_product (не пустой)
        has_warped = warped_product is not None and np.any(warped_product[:, :, 3] > 0) if warped_product is not None and len(warped_product.shape) == 3 and warped_product.shape[2] >= 4 else False
        
        # Конвертируем коврик если он есть
        if has_warped:
            warped_rgba = cv2.cvtColor(warped_product, cv2.COLOR_BGRA2RGBA)
            warped_pil = Image.fromarray(warped_rgba)
            if warped_pil.size != (width, height):
                warped_pil = warped_pil.resize((width, height), Image.Resampling.LANCZOS)
        else:
            # Пустое прозрачное изображение
            warped_pil = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        
        # Собираем результаты рендеринга всех слоёв
        before_product, after_product, failed_layers = self._collect_layer_render_results(
            psd, width, height, product_layer
        )
        
        # Определяем режим рендеринга
        render_mode = self._determine_render_mode(before_product, after_product, failed_layers)
        
        # Обрабатываем в зависимости от режима
        if render_mode == 'composite_fallback':
            return self._process_with_composite_fallback(psd, warped_pil, target_color, product_layer)
        elif render_mode == 'hybrid':
            return self._process_with_hybrid_fallback(
                psd, before_product, after_product, failed_layers,
                warped_pil, target_color, width, height
            )
        else:
            # layer_by_layer - стандартный режим
            return self._process_layer_by_layer(
                before_product, after_product, warped_pil, target_color, width, height
            )
    
    def _process_layer_by_layer(
        self,
        before_product: List[LayerRenderResult],
        after_product: List[LayerRenderResult],
        warped_pil: Image.Image,
        target_color: Optional[Tuple[int, int, int]],
        width: int,
        height: int
    ) -> Image.Image:
        """
        Стандартный режим рендеринга - слой за слоем.
        
        Args:
            before_product: Слои до коврика
            after_product: Слои после коврика
            warped_pil: Изображение коврика
            target_color: Целевой цвет для перекрашивания
            width: Ширина холста
            height: Высота холста
            
        Returns:
            Финальное изображение
        """
        result = Image.new('RGBA', (width, height), (0, 0, 0, 255))
        layers_before = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        layers_after = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        
        # Композитим слои до коврика
        for layer_result in before_product:
            if layer_result.image is None:
                continue
            layer_img = layer_result.image
            # Перекрашиваем если нужно (кроме фото)
            if target_color and not layer_result.is_photo:
                layer_img = self._recolor(layer_img, target_color)
            layers_before = Image.alpha_composite(layers_before, layer_img)
        
        # Композитим слои после коврика
        for layer_result in after_product:
            if layer_result.image is None:
                continue
            layer_img = layer_result.image
            # Перекрашиваем если нужно (кроме фото)
            if target_color and not layer_result.is_photo:
                layer_img = self._recolor(layer_img, target_color)
            layers_after = Image.alpha_composite(layers_after, layer_img)
        
        # Собираем: фон + слои до + коврик + слои после
        result = Image.alpha_composite(result, layers_before)
        result = Image.alpha_composite(result, warped_pil)
        result = Image.alpha_composite(result, layers_after)
        
        return result
    
    def _process_with_composite_fallback(
        self,
        psd,
        warped_pil: Image.Image,
        target_color: Optional[Tuple[int, int, int]],
        product_layer=None
    ) -> Image.Image:
        """
        Fallback режим - использует psd.composite() когда слои не рендерятся.
        
        Находит позицию слоя коврика (даже если он не рендерится) и 
        корректно размещает warped_product на композите.
        
        Args:
            psd: PSD файл
            warped_pil: Изображение коврика
            target_color: Целевой цвет для перекрашивания
            product_layer: Слой коврика (опционально, для определения позиции)
            
        Returns:
            Финальное изображение
        """
        width, height = psd.width, psd.height
        
        try:
            composite = psd.composite()
            if composite.mode != 'RGBA':
                composite = composite.convert('RGBA')
            
            if target_color:
                # Применяем защиту лиц перед перекрашиванием композита
                composite = self._recolor_with_face_protection(composite, target_color)
            
            # Находим позицию слоя коврика для корректного размещения
            product_bounds = self._get_product_layer_bounds(psd, product_layer)
            
            if product_bounds:
                # Размещаем warped_product в позиции слоя коврика
                result = self._place_product_on_composite(
                    composite, warped_pil, product_bounds, width, height
                )
            else:
                # Fallback: просто накладываем поверх
                result = Image.alpha_composite(composite, warped_pil)
            
            logger.info("Used composite_fallback mode successfully")
            return result
            
        except Exception as e:
            logger.error(f"Failed to use composite fallback: {type(e).__name__}: {e}")
            # Возвращаем просто коврик на чёрном фоне
            result = Image.new('RGBA', warped_pil.size, (0, 0, 0, 255))
            return Image.alpha_composite(result, warped_pil)
    
    def _get_product_layer_bounds(
        self, 
        psd, 
        product_layer=None
    ) -> Optional[Tuple[int, int, int, int]]:
        """
        Получает границы слоя коврика из PSD.
        
        Работает даже когда слой не рендерится - использует метаданные слоя.
        
        Args:
            psd: PSD файл
            product_layer: Слой коврика (если уже найден)
            
        Returns:
            Tuple (left, top, right, bottom) или None если не найден
        """
        # Если слой не передан - ищем его
        if product_layer is None:
            product_layer = self._find_product_layer(psd)
        
        if product_layer is None:
            logger.debug("Product layer not found for bounds extraction")
            return None
        
        try:
            # Получаем границы из метаданных слоя (не требует рендеринга)
            left = getattr(product_layer, 'left', 0)
            top = getattr(product_layer, 'top', 0)
            right = getattr(product_layer, 'right', psd.width)
            bottom = getattr(product_layer, 'bottom', psd.height)
            
            # Проверяем валидность границ
            if right <= left or bottom <= top:
                logger.debug(f"Invalid product layer bounds: ({left}, {top}, {right}, {bottom})")
                return None
            
            layer_name = getattr(product_layer, 'name', 'Unknown')
            logger.debug(f"Product layer '{layer_name}' bounds: ({left}, {top}, {right}, {bottom})")
            
            return (left, top, right, bottom)
            
        except Exception as e:
            logger.warning(f"Failed to get product layer bounds: {e}")
            return None
    
    def _place_product_on_composite(
        self,
        composite: Image.Image,
        warped_product: Image.Image,
        product_bounds: Tuple[int, int, int, int],
        width: int,
        height: int
    ) -> Image.Image:
        """
        Размещает warped_product на композите в позиции слоя коврика.
        
        Создаёт маску для области коврика и заменяет её на warped_product,
        сохраняя остальные части композита.
        
        Args:
            composite: Перекрашенный композит PSD
            warped_product: Изображение коврика для вставки
            product_bounds: Границы слоя коврика (left, top, right, bottom)
            width: Ширина холста
            height: Высота холста
            
        Returns:
            Композит с вставленным ковриком
        """
        left, top, right, bottom = product_bounds
        
        # Размеры области коврика
        product_width = right - left
        product_height = bottom - top
        
        # Если warped_product уже полноразмерный - просто накладываем
        if warped_product.size == (width, height):
            return Image.alpha_composite(composite, warped_product)
        
        # Масштабируем warped_product под размер области коврика
        if warped_product.size != (product_width, product_height):
            warped_resized = warped_product.resize(
                (product_width, product_height), 
                Image.Resampling.LANCZOS
            )
        else:
            warped_resized = warped_product
        
        # Создаём полноразмерное изображение с ковриком в нужной позиции
        product_full = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        product_full.paste(warped_resized, (left, top), warped_resized)
        
        # Накладываем на композит
        result = Image.alpha_composite(composite, product_full)
        
        logger.debug(f"Placed product at ({left}, {top}) with size {product_width}x{product_height}")
        return result
    
    def _process_with_hybrid_fallback(
        self,
        psd,
        before_product: List[LayerRenderResult],
        after_product: List[LayerRenderResult],
        failed_layers: List[LayerRenderResult],
        warped_pil: Image.Image,
        target_color: Optional[Tuple[int, int, int]],
        width: int,
        height: int
    ) -> Image.Image:
        """
        Гибридный режим - комбинирует успешно отрендеренные слои с composite.
        
        Используется когда часть слоёв не рендерится. Алгоритм:
        1. Получить psd.composite() как базу
        2. Применить recoloring с skin protection к composite
        3. Наложить успешно отрендеренные слои поверх (они перекрывают composite)
        4. Вставить коврик
        5. Наложить слои после коврика
        
        Args:
            psd: PSD файл
            before_product: Успешно отрендеренные слои до коврика
            after_product: Успешно отрендеренные слои после коврика
            failed_layers: Слои которые не удалось отрендерить
            warped_pil: Изображение коврика
            target_color: Целевой цвет для перекрашивания
            width: Ширина холста
            height: Высота холста
            
        Returns:
            Финальное изображение
        """
        # Логируем информацию о failed layers для отладки
        failed_names = [lr.layer_name for lr in failed_layers]
        logger.info(f"Hybrid mode: {len(failed_layers)} layers failed: {failed_names}")
        
        # 1. Получаем composite как базу
        try:
            composite = psd.composite()
            if composite.mode != 'RGBA':
                composite = composite.convert('RGBA')
        except Exception as e:
            logger.error(f"Failed to get composite in hybrid mode: {e}")
            # Fallback на layer_by_layer если composite не работает
            return self._process_layer_by_layer(
                before_product, after_product, warped_pil, target_color, width, height
            )
        
        # 2. Применяем recoloring с skin protection к composite
        if target_color:
            composite_recolored = self._recolor_with_face_protection(composite, target_color)
        else:
            composite_recolored = composite
        
        # 3. Создаём маску для областей покрытых успешными слоями
        # Эти области будут взяты из отрендеренных слоёв, а не из composite
        rendered_coverage = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        
        # Собираем слои до коврика (перекрашенные)
        layers_before = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        for layer_result in before_product:
            if layer_result.image is None:
                continue
            layer_img = layer_result.image
            # Перекрашиваем если нужно (кроме фото)
            if target_color and not layer_result.is_photo:
                layer_img = self._recolor(layer_img, target_color)
            layers_before = Image.alpha_composite(layers_before, layer_img)
            # Добавляем в coverage маску
            rendered_coverage = Image.alpha_composite(rendered_coverage, layer_result.image)
        
        # 4. Комбинируем: composite (база) + отрендеренные слои поверх
        # Используем альфа-канал отрендеренных слоёв для определения что брать откуда
        result = self._blend_composite_with_layers(
            composite_recolored, layers_before, rendered_coverage, width, height
        )
        
        # 5. Накладываем коврик
        result = Image.alpha_composite(result, warped_pil)
        
        # 6. Накладываем слои после коврика
        for layer_result in after_product:
            if layer_result.image is None:
                continue
            layer_img = layer_result.image
            # Перекрашиваем если нужно (кроме фото)
            if target_color and not layer_result.is_photo:
                layer_img = self._recolor(layer_img, target_color)
            result = Image.alpha_composite(result, layer_img)
        
        logger.info("Used hybrid mode successfully")
        return result
    
    def _blend_composite_with_layers(
        self,
        composite: Image.Image,
        rendered_layers: Image.Image,
        coverage_mask: Image.Image,
        width: int,
        height: int
    ) -> Image.Image:
        """
        Смешивает composite с отрендеренными слоями.
        
        В областях где есть отрендеренные слои - берём их.
        В областях где слои не отрендерились - берём composite.
        
        Args:
            composite: Перекрашенный composite PSD
            rendered_layers: Скомпозированные отрендеренные слои
            coverage_mask: Маска покрытия (где есть отрендеренные слои)
            width: Ширина холста
            height: Высота холста
            
        Returns:
            Смешанное изображение
        """
        # Получаем альфа-канал coverage для определения где есть слои
        coverage_arr = np.array(coverage_mask)
        if coverage_arr.shape[2] >= 4:
            coverage_alpha = coverage_arr[:, :, 3].astype(np.float32) / 255.0
        else:
            coverage_alpha = np.ones((height, width), dtype=np.float32)
        
        # Конвертируем в numpy
        composite_arr = np.array(composite).astype(np.float32)
        rendered_arr = np.array(rendered_layers).astype(np.float32)
        
        # Смешиваем: где coverage_alpha > 0 берём rendered, иначе composite
        # Используем плавное смешивание по альфе
        alpha_3d = coverage_alpha[:, :, np.newaxis]
        
        # Для RGB каналов
        blended_rgb = rendered_arr[:, :, :3] * alpha_3d + composite_arr[:, :, :3] * (1.0 - alpha_3d)
        
        # Для альфа-канала берём максимум
        if composite_arr.shape[2] >= 4 and rendered_arr.shape[2] >= 4:
            blended_alpha = np.maximum(composite_arr[:, :, 3], rendered_arr[:, :, 3])
        else:
            blended_alpha = np.full((height, width), 255.0)
        
        # Собираем результат
        result_arr = np.zeros((height, width, 4), dtype=np.uint8)
        result_arr[:, :, :3] = np.clip(blended_rgb, 0, 255).astype(np.uint8)
        result_arr[:, :, 3] = np.clip(blended_alpha, 0, 255).astype(np.uint8)
        
        return Image.fromarray(result_arr)
    
    def _render_layer(self, layer, width: int, height: int) -> Optional[Image.Image]:
        """
        Рендерит слой в полноразмерное изображение с fallback стратегиями.
        
        Стратегии рендеринга (в порядке приоритета):
        1. layer.composite() - стандартный метод
        2. Для групп - рекурсивный рендеринг sublayers
        3. layer.topil() - альтернативный метод psd-tools
        4. Извлечение pixel data напрямую
        
        Args:
            layer: Слой PSD для рендеринга
            width: Ширина целевого изображения
            height: Высота целевого изображения
            
        Returns:
            Отрендеренное изображение слоя или None при ошибке
        """
        layer_name = getattr(layer, 'name', 'Unknown')
        
        try:
            # Для групп - рекурсивный рендеринг
            if layer.is_group():
                return self._render_group_layer(layer, width, height)
            
            # Пробуем разные методы рендеринга
            img, method = self._try_render_methods(layer)
            
            if img is None:
                logger.debug(f"Layer '{layer_name}' - all render methods failed")
                return None
            
            logger.debug(f"Layer '{layer_name}' rendered using method: {method}")
            
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            
            # Размещаем на полном холсте
            return self._place_on_canvas(img, layer, width, height)
            
        except Exception as e:
            logger.warning(f"Failed to render layer '{layer_name}': {type(e).__name__}: {e}")
            return None
    
    def _try_render_methods(self, layer) -> Tuple[Optional[Image.Image], str]:
        """
        Пробует разные методы рендеринга слоя.
        
        Args:
            layer: Слой PSD
            
        Returns:
            Tuple[Optional[Image.Image], str]: (изображение, метод который сработал)
        """
        layer_name = getattr(layer, 'name', 'Unknown')
        
        # Метод 1: layer.composite() - стандартный
        try:
            img = layer.composite()
            if img is not None and self._is_valid_image(img):
                return img, 'composite'
        except Exception as e:
            logger.debug(f"Layer '{layer_name}' composite() failed: {e}")
        
        # Метод 2: layer.topil() - альтернативный метод psd-tools
        try:
            if hasattr(layer, 'topil'):
                img = layer.topil()
                if img is not None and self._is_valid_image(img):
                    return img, 'topil'
        except Exception as e:
            logger.debug(f"Layer '{layer_name}' topil() failed: {e}")
        
        # Метод 3: Извлечение pixel data напрямую
        try:
            img = self._extract_pixel_data(layer)
            if img is not None and self._is_valid_image(img):
                return img, 'pixel_data'
        except Exception as e:
            logger.debug(f"Layer '{layer_name}' pixel_data extraction failed: {e}")
        
        return None, 'none'
    
    def _is_valid_image(self, img: Image.Image) -> bool:
        """
        Проверяет что изображение валидно (не пустое).
        
        Args:
            img: PIL Image
            
        Returns:
            True если изображение содержит непрозрачные пиксели
        """
        if img is None:
            return False
        
        if img.width == 0 or img.height == 0:
            return False
        
        # Проверяем есть ли непрозрачные пиксели
        if img.mode == 'RGBA':
            arr = np.array(img)
            if arr.shape[2] >= 4:
                alpha = arr[:, :, 3]
                if np.max(alpha) < self.ALPHA_VISIBILITY_THRESHOLD:
                    return False
        
        return True
    
    def _extract_pixel_data(self, layer) -> Optional[Image.Image]:
        """
        Извлекает pixel data напрямую из слоя.
        
        Args:
            layer: Слой PSD
            
        Returns:
            PIL Image или None
        """
        layer_name = getattr(layer, 'name', 'Unknown')
        
        # Пробуем получить numpy array напрямую
        if hasattr(layer, 'numpy'):
            try:
                arr = layer.numpy()
                if arr is not None and arr.size > 0:
                    return Image.fromarray(arr)
            except Exception:
                pass
        
        # Пробуем через channels
        if hasattr(layer, 'channels'):
            try:
                channels = layer.channels
                if channels:
                    # Собираем каналы в изображение
                    channel_data = []
                    for ch in channels:
                        if hasattr(ch, 'data') and ch.data is not None:
                            channel_data.append(np.array(ch.data))
                    
                    if len(channel_data) >= 3:
                        # RGB или RGBA
                        height, width = channel_data[0].shape
                        if len(channel_data) >= 4:
                            arr = np.stack(channel_data[:4], axis=-1)
                            return Image.fromarray(arr.astype(np.uint8), mode='RGBA')
                        else:
                            arr = np.stack(channel_data[:3], axis=-1)
                            return Image.fromarray(arr.astype(np.uint8), mode='RGB')
            except Exception as e:
                logger.debug(f"Layer '{layer_name}' channel extraction failed: {e}")
        
        return None
    
    def _place_on_canvas(
        self, 
        img: Image.Image, 
        layer, 
        width: int, 
        height: int
    ) -> Optional[Image.Image]:
        """
        Размещает изображение слоя на полноразмерном холсте.
        
        Args:
            img: Изображение слоя
            layer: Слой PSD (для получения позиции)
            width: Ширина холста
            height: Высота холста
            
        Returns:
            Изображение на полном холсте или None
        """
        layer_name = getattr(layer, 'name', 'Unknown')
        
        full = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        x, y = layer.left, layer.top
        
        # Обрезка если выходит за границы
        if x < 0 or y < 0 or x + img.width > width or y + img.height > height:
            crop_l = max(0, -x)
            crop_t = max(0, -y)
            crop_r = min(img.width, width - x)
            crop_b = min(img.height, height - y)
            if crop_r > crop_l and crop_b > crop_t:
                img = img.crop((crop_l, crop_t, crop_r, crop_b))
                x = max(0, x)
                y = max(0, y)
            else:
                logger.debug(f"Layer '{layer_name}' is completely outside canvas bounds")
                return None
        
        full.paste(img, (x, y), img)
        return full
    
    def _render_group_layer(
        self, 
        group, 
        width: int, 
        height: int
    ) -> Optional[Image.Image]:
        """
        Рекурсивно рендерит группу слоёв с поддержкой clipping masks.
        
        Args:
            group: Группа слоёв PSD
            width: Ширина холста
            height: Высота холста
            
        Returns:
            Скомпозированное изображение группы или None
        """
        group_name = getattr(group, 'name', 'Unknown')
        group_img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        
        # Собираем все видимые sublayers
        sublayers = [s for s in group if s.visible]
        
        if not sublayers:
            logger.debug(f"Group '{group_name}' has no visible sublayers")
            return None
        
        rendered_count = 0
        clipping_base = None  # Базовый слой для clipping mask
        
        for i, sublayer in enumerate(sublayers):
            sublayer_name = getattr(sublayer, 'name', 'Unknown')
            
            # Рендерим sublayer
            sub_img = self._render_layer(sublayer, width, height)
            
            if sub_img is None:
                logger.debug(f"Sublayer '{sublayer_name}' in group '{group_name}' returned None")
                clipping_base = None  # Сбрасываем clipping base
                continue
            
            # Проверяем является ли слой clipping mask
            is_clipping = self._is_clipping_layer(sublayer)
            
            if is_clipping and clipping_base is not None:
                # Применяем clipping mask - используем альфу базового слоя
                sub_img = self._apply_clipping_mask(sub_img, clipping_base)
                logger.debug(f"Applied clipping mask for '{sublayer_name}' to base layer")
            else:
                # Обычный слой - становится потенциальной базой для clipping
                clipping_base = sub_img
            
            # Композитим на результат группы
            group_img = Image.alpha_composite(group_img, sub_img)
            rendered_count += 1
        
        if rendered_count == 0:
            logger.debug(f"Group '{group_name}' - no sublayers rendered successfully")
            return None
        
        logger.debug(f"Group '{group_name}' rendered {rendered_count}/{len(sublayers)} sublayers")
        return group_img
    
    def _is_clipping_layer(self, layer) -> bool:
        """
        Проверяет является ли слой clipping mask.
        
        Args:
            layer: Слой PSD
            
        Returns:
            True если слой является clipping mask
        """
        # psd-tools использует атрибут clipping
        if hasattr(layer, 'clipping'):
            return layer.clipping
        
        # Альтернативный способ через _record
        if hasattr(layer, '_record'):
            record = layer._record
            if hasattr(record, 'clipping'):
                return record.clipping
        
        return False
    
    def _apply_clipping_mask(
        self, 
        layer_img: Image.Image, 
        base_img: Image.Image
    ) -> Image.Image:
        """
        Применяет clipping mask - обрезает слой по альфе базового слоя.
        
        Args:
            layer_img: Изображение слоя (clipping layer)
            base_img: Изображение базового слоя
            
        Returns:
            Обрезанное изображение
        """
        if layer_img.mode != 'RGBA':
            layer_img = layer_img.convert('RGBA')
        if base_img.mode != 'RGBA':
            base_img = base_img.convert('RGBA')
        
        # Получаем альфа-канал базового слоя
        base_arr = np.array(base_img)
        layer_arr = np.array(layer_img)
        
        if base_arr.shape[2] < 4 or layer_arr.shape[2] < 4:
            return layer_img
        
        # Применяем альфу базового слоя к слою
        base_alpha = base_arr[:, :, 3].astype(np.float32) / 255.0
        layer_alpha = layer_arr[:, :, 3].astype(np.float32) / 255.0
        
        # Новая альфа = min(layer_alpha, base_alpha)
        new_alpha = np.minimum(layer_alpha, base_alpha)
        
        result = layer_arr.copy()
        result[:, :, 3] = (new_alpha * 255).astype(np.uint8)
        
        return Image.fromarray(result)
    
    def _is_photo_layer_by_name(self, name: str) -> bool:
        """Проверяет является ли слой фотографией по имени."""
        if not name:
            return False
        name_lower = name.lower()
        for kw in self.PHOTO_KEYWORDS:
            if kw in name_lower:
                return True
        return False
    
    def _is_photo_layer(
        self, 
        layer, 
        layer_image: np.ndarray = None,
        canvas_width: int = None,
        canvas_height: int = None
    ) -> bool:
        """
        Комбинированная детекция фото-слоя: по имени ИЛИ по содержимому.
        
        Улучшенная логика:
        - Если слой покрывает >80% холста - это скорее всего фон, а не фото
        - Фото обычно имеет локализованную область, а не покрывает весь холст
        
        Args:
            layer: Слой PSD (для получения имени и размеров)
            layer_image: Изображение слоя в формате numpy array (RGB/RGBA)
            canvas_width: Ширина холста PSD (для определения покрытия)
            canvas_height: Высота холста PSD (для определения покрытия)
        
        Returns:
            True если слой определён как фото (по имени или по содержанию кожи >5%)
        """
        # Проверка по имени
        layer_name = layer.name if hasattr(layer, 'name') else str(layer)
        if self._is_photo_layer_by_name(layer_name):
            return True
        
        # Проверка по содержимому (если изображение доступно)
        if layer_image is not None and layer_image.size > 0:
            # Проверяем покрытие холста - если слой покрывает >80% холста,
            # это скорее всего фоновый слой, а не фото с лицом
            if canvas_width and canvas_height:
                layer_coverage = self._get_layer_coverage(layer, canvas_width, canvas_height)
                if layer_coverage > 0.8:
                    # Большой слой - скорее всего фон, не фото
                    logger.debug(
                        f"Layer '{layer_name}' covers {layer_coverage:.0%} of canvas - "
                        f"treating as background, not photo"
                    )
                    return False
            
            return self._skin_detector.is_photo_layer(layer_image, self.SKIN_THRESHOLD)
        
        return False
    
    def _get_layer_coverage(self, layer, canvas_width: int, canvas_height: int) -> float:
        """
        Вычисляет какую долю холста покрывает слой.
        
        Args:
            layer: Слой PSD
            canvas_width: Ширина холста
            canvas_height: Высота холста
            
        Returns:
            Доля покрытия (0.0 - 1.0)
        """
        try:
            left = getattr(layer, 'left', 0)
            top = getattr(layer, 'top', 0)
            right = getattr(layer, 'right', canvas_width)
            bottom = getattr(layer, 'bottom', canvas_height)
            
            layer_width = right - left
            layer_height = bottom - top
            
            if layer_width <= 0 or layer_height <= 0:
                return 0.0
            
            layer_area = layer_width * layer_height
            canvas_area = canvas_width * canvas_height
            
            return layer_area / canvas_area if canvas_area > 0 else 0.0
        except Exception:
            return 0.0
    
    def _recolor(self, image: Image.Image, target_color: Tuple[int, int, int]) -> Image.Image:
        """
        Перекрашивает насыщенные цвета в целевой цвет с использованием soft masks.
        НЕ перекрашивает телесные тона (кожу) - защищает их с плавными переходами.
        
        Использует HUE SHIFT вместо HUE REPLACE для корректного перекрашивания.
        
        Args:
            image: Исходное изображение (PIL Image)
            target_color: Целевой цвет RGB
        
        Returns:
            Перекрашенное изображение с плавными переходами
        """
        import cv2
        
        img_arr = np.array(image)
        if len(img_arr.shape) < 3 or img_arr.shape[2] < 3:
            return image
        
        rgb = img_arr[:, :, :3].copy()
        alpha = img_arr[:, :, 3] if img_arr.shape[2] == 4 else None
        
        # Конвертируем в HSV
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
        
        # Целевой hue (OpenCV использует 0-180 для H)
        target_h, _, _ = rgb_to_hsv(*target_color)
        target_hue = target_h * 180
        
        # 1. Создаём soft color mask (какие пиксели перекрашивать)
        color_mask = self._mask_generator.create_color_mask(hsv.astype(np.uint8))
        
        # 2. Создаём skin protection mask (какие пиксели защищать)
        skin_mask = self._skin_detector.detect_skin_mask(rgb, feather_radius=5)
        
        # 3. Комбинируем маски: color_mask * (1 - skin_mask/255)
        color_mask_float = color_mask.astype(np.float32) / 255.0
        skin_mask_float = skin_mask.astype(np.float32) / 255.0
        final_mask = color_mask_float * (1.0 - skin_mask_float)
        
        # 4. Применяем feathering к финальной маске
        final_mask_uint8 = (final_mask * 255).astype(np.uint8)
        final_mask_feathered = self._mask_generator.apply_feathering(final_mask_uint8, radius=5)
        final_mask_float = final_mask_feathered.astype(np.float32) / 255.0
        
        # Если есть альфа - учитываем только видимые пиксели
        if alpha is not None:
            alpha_mask = (alpha > 20).astype(np.float32)
            final_mask_float = final_mask_float * alpha_mask
        
        # 5. Вычисляем доминантный hue из цветных пикселей для расчёта сдвига
        dominant_hue = self._get_dominant_hue(hsv, color_mask)
        
        # 6. Вычисляем hue shift (сдвиг) вместо замены
        hue_shift = target_hue - dominant_hue
        
        # 7. Применяем hue shift к оригинальным значениям
        hsv_recolored = hsv.copy()
        new_hue = (hsv[:, :, 0] + hue_shift) % 180  # Циклический сдвиг в диапазоне 0-180
        hsv_recolored[:, :, 0] = new_hue
        
        # 8. Blend с оригиналом по маске (плавное смешивание) - в RGB пространстве!
        # Конвертируем обе версии в RGB для корректного смешивания
        hsv_recolored_uint8 = np.clip(hsv_recolored, 0, 255).astype(np.uint8)
        rgb_recolored = cv2.cvtColor(hsv_recolored_uint8, cv2.COLOR_HSV2RGB)
        
        # Смешиваем в RGB пространстве для избежания артефактов на границах hue
        mask_3d = final_mask_float[:, :, np.newaxis]
        rgb_blended = rgb_recolored.astype(np.float32) * mask_3d + rgb.astype(np.float32) * (1.0 - mask_3d)
        rgb_result = np.clip(rgb_blended, 0, 255).astype(np.uint8)
        
        if alpha is not None:
            return Image.fromarray(np.dstack([rgb_result, alpha]))
        return Image.fromarray(rgb_result)
    
    def _get_dominant_hue(self, hsv: np.ndarray, color_mask: np.ndarray) -> float:
        """
        Вычисляет доминантный hue из цветных пикселей.
        
        Args:
            hsv: HSV изображение
            color_mask: Маска цветных пикселей (0-255)
        
        Returns:
            Доминантный hue (0-180)
        """
        # Берём пиксели где маска > 128 (достаточно цветные)
        mask_bool = color_mask > 128
        
        if not np.any(mask_bool):
            return 0.0
        
        hues = hsv[:, :, 0][mask_bool]
        saturations = hsv[:, :, 1][mask_bool]
        
        if len(hues) == 0:
            return 0.0
        
        # Взвешенное среднее по насыщенности (более насыщенные пиксели важнее)
        weights = saturations / (saturations.sum() + 1e-6)
        
        # Для корректного усреднения hue используем circular mean
        # (hue - циклическая величина, 0 и 180 - соседи)
        hue_rad = hues * np.pi / 90  # Конвертируем 0-180 в 0-2π
        sin_sum = np.sum(np.sin(hue_rad) * weights)
        cos_sum = np.sum(np.cos(hue_rad) * weights)
        
        mean_hue_rad = np.arctan2(sin_sum, cos_sum)
        mean_hue = (mean_hue_rad * 90 / np.pi) % 180  # Обратно в 0-180
        
        return float(mean_hue)
    
    def _recolor_with_face_protection(
        self, 
        image: Image.Image, 
        target_color: Tuple[int, int, int]
    ) -> Image.Image:
        """
        Перекрашивает композитное изображение с защитой лиц.
        
        Используется как fallback когда отдельные слои не удалось отрендерить.
        Применяет детекцию кожи ко всему композиту и создаёт маску защиты
        перед перекрашиванием.
        
        Args:
            image: Композитное изображение PSD (PIL Image)
            target_color: Целевой цвет RGB
            
        Returns:
            Перекрашенное изображение с защищёнными областями лиц
        """
        import cv2
        
        img_arr = np.array(image)
        if len(img_arr.shape) < 3 or img_arr.shape[2] < 3:
            return image
        
        rgb = img_arr[:, :, :3].copy()
        alpha = img_arr[:, :, 3] if img_arr.shape[2] == 4 else None
        
        # Создаём маску защиты кожи для всего композита
        skin_mask = self._skin_detector.detect_skin_mask(rgb, feather_radius=7)
        skin_percentage = self._skin_detector.get_skin_percentage(rgb)
        
        logger.debug(f"Composite fallback: detected {skin_percentage:.1%} skin content")
        
        # Если много кожи - усиливаем защиту
        if skin_percentage > 0.1:  # >10% кожи
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            skin_mask = cv2.dilate(skin_mask, kernel, iterations=2)
            skin_mask = self._mask_generator.apply_feathering(skin_mask, radius=7)
        
        # Конвертируем в HSV
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
        
        # Целевой hue
        target_h, _, _ = rgb_to_hsv(*target_color)
        target_hue = target_h * 180
        
        # Создаём soft color mask
        color_mask = self._mask_generator.create_color_mask(hsv.astype(np.uint8))
        
        # Комбинируем маски с защитой кожи
        color_mask_float = color_mask.astype(np.float32) / 255.0
        skin_mask_float = skin_mask.astype(np.float32) / 255.0
        final_mask = color_mask_float * (1.0 - skin_mask_float)
        
        # Применяем feathering
        final_mask_uint8 = (final_mask * 255).astype(np.uint8)
        final_mask_feathered = self._mask_generator.apply_feathering(final_mask_uint8, radius=5)
        final_mask_float = final_mask_feathered.astype(np.float32) / 255.0
        
        # Учитываем альфа-канал
        if alpha is not None:
            alpha_mask = (alpha > 20).astype(np.float32)
            final_mask_float = final_mask_float * alpha_mask
        
        # Вычисляем доминантный hue и делаем HUE SHIFT
        dominant_hue = self._get_dominant_hue(hsv, color_mask)
        hue_shift = target_hue - dominant_hue
        
        # Применяем hue shift
        hsv_recolored = hsv.copy()
        new_hue = (hsv[:, :, 0] + hue_shift) % 180
        hsv_recolored[:, :, 0] = new_hue
        
        # Blend в RGB пространстве
        hsv_recolored_uint8 = np.clip(hsv_recolored, 0, 255).astype(np.uint8)
        rgb_recolored = cv2.cvtColor(hsv_recolored_uint8, cv2.COLOR_HSV2RGB)
        
        mask_3d = final_mask_float[:, :, np.newaxis]
        rgb_blended = rgb_recolored.astype(np.float32) * mask_3d + rgb.astype(np.float32) * (1.0 - mask_3d)
        rgb_result = np.clip(rgb_blended, 0, 255).astype(np.uint8)
        
        if alpha is not None:
            return Image.fromarray(np.dstack([rgb_result, alpha]))
        return Image.fromarray(rgb_result)
    
    def _find_product_layer(self, psd):
        """
        Находит слой коврика по ключевым словам в имени.
        
        Ключевые слова: коврик, смена, product, mat, mousepad, прямоугольник
        
        Returns:
            Слой коврика или None если не найден
        """
        for layer in psd:
            name_lower = layer.name.lower()
            for kw in self.PRODUCT_KEYWORDS:
                if kw in name_lower:
                    logger.debug(f"Found product layer: '{layer.name}' (keyword: '{kw}')")
                    return layer
        
        # НЕ используем fallback на smart object - это приводит к ошибкам
        # (например, "ПРОФЕССИОНАЛА" в шаблоне 5 - smart object, но не коврик)
        logger.debug("No product layer found by keywords")
        return None
