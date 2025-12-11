from typing import Optional, Tuple
from PIL import Image
from src.models import PrintArea


class ImageCompositor:
    def __init__(self, canvas_size: Tuple[int, int]):
        self.canvas_size = canvas_size
    
    def create_background(self, color: Tuple[int, int, int]) -> Image.Image:
        return Image.new('RGB', self.canvas_size, color=color)
    
    def _scale_contain(self, image_size: Tuple[int, int], area_size: Tuple[int, int]) -> Tuple[int, int]:
        img_width, img_height = image_size
        area_width, area_height = area_size

        if img_width <= 0 or img_height <= 0 or area_width <= 0 or area_height <= 0:
            return (0, 0)
        
        scale = min(area_width / img_width, area_height / img_height)
        return (int(img_width * scale), int(img_height * scale))
    
    def _center_position(self, item_size: Tuple[int, int], area: PrintArea) -> Tuple[int, int]:
        item_width, item_height = item_size
        offset_x = (area.width - item_width) // 2
        offset_y = (area.height - item_height) // 2
        return (area.x + offset_x, area.y + offset_y)
    
    def place_print(self, background: Image.Image, print_img: Image.Image, area: PrintArea, mask: Optional[Image.Image] = None) -> Image.Image:
        result = background.copy()
        scaled_size = self._scale_contain(print_img.size, (area.width, area.height))
        
        if scaled_size[0] <= 0 or scaled_size[1] <= 0:
            return result
        
        scaled_print = print_img.resize(scaled_size, Image.Resampling.LANCZOS)
        
        if scaled_print.mode != 'RGBA':
            scaled_print = scaled_print.convert('RGBA')
        
        if mask is not None:
            scaled_mask = mask.resize(scaled_size, Image.Resampling.LANCZOS)
            if scaled_mask.mode != 'L':
                scaled_mask = scaled_mask.convert('L')
            scaled_print.putalpha(scaled_mask)
        
        position = self._center_position(scaled_size, area)
        
        if result.mode != 'RGBA':
            result = result.convert('RGBA')
        
        result.paste(scaled_print, position, scaled_print)
        return result
    
    def apply_overlay(self, base: Image.Image, overlay: Image.Image) -> Image.Image:
        result = base.copy()
        
        if result.mode != 'RGBA':
            result = result.convert('RGBA')
        
        if overlay.size != self.canvas_size:
            overlay = overlay.resize(self.canvas_size, Image.Resampling.LANCZOS)
        
        if overlay.mode != 'RGBA':
            overlay = overlay.convert('RGBA')
        
        return Image.alpha_composite(result, overlay)
    
    def compose(self, print_img: Image.Image, overlay: Image.Image, color: Tuple[int, int, int], area: PrintArea, mask: Optional[Image.Image] = None) -> Image.Image:
        background = self.create_background(color)
        with_print = self.place_print(background, print_img, area, mask)
        result = self.apply_overlay(with_print, overlay)
        
        if result.mode == 'RGBA':
            rgb_result = Image.new('RGB', result.size, (255, 255, 255))
            rgb_result.paste(result, mask=result.split()[3])
            return rgb_result
        
        return result
