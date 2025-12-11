from pathlib import Path
from typing import Callable, Optional
from PIL import Image

from src.color_analyzer import ColorAnalyzer
from src.file_utils import get_image_files, load_image
from src.image_compositor import ImageCompositor
from src.models import BatchResult, CardConfig


class CardGenerator:
    def __init__(self, config: CardConfig):
        self.config = config
        self.color_analyzer = ColorAnalyzer(n_clusters=config.k_clusters)
        self.compositor = ImageCompositor(canvas_size=(config.canvas_width, config.canvas_height))
        
        self.overlay: Optional[Image.Image] = None
        if config.overlay_path and config.overlay_path.exists():
            self.overlay = load_image(config.overlay_path)
            if self.overlay.mode != 'RGBA':
                self.overlay = self.overlay.convert('RGBA')

        self.mask: Optional[Image.Image] = None
        if config.mask_path and config.mask_path.exists():
            self.mask = load_image(config.mask_path)
            if self.mask.mode != 'L':
                self.mask = self.mask.convert('L')
    
    def generate_single(self, print_path: Path) -> Image.Image:
        print_img = load_image(print_path)
        dominant_color = self.color_analyzer.get_dominant_color(print_img)
        
        overlay = self.overlay
        if overlay is None:
            overlay = Image.new('RGBA', (self.config.canvas_width, self.config.canvas_height), (0, 0, 0, 0))
        
        return self.compositor.compose(
            print_img=print_img,
            overlay=overlay,
            color=dominant_color,
            area=self.config.print_area,
            mask=self.mask
        )
    
    def generate_batch(self, progress_callback: Optional[Callable[[int, int], None]] = None) -> BatchResult:
        self.config.output_folder.mkdir(parents=True, exist_ok=True)
        
        try:
            all_files = list(self.config.input_folder.iterdir())
            image_files = get_image_files(self.config.input_folder)
        except Exception as e:
            return BatchResult(total_files=0, processed=0, skipped=0, errors=[("input_folder", str(e))])
        
        total_files = len(all_files)
        skipped = len([f for f in all_files if f.is_file()]) - len(image_files)
        processed = 0
        errors = []
        
        for idx, print_path in enumerate(image_files):
            if progress_callback:
                progress_callback(idx, len(image_files))
            
            try:
                card = self.generate_single(print_path)
                
                ext = print_path.suffix.lower()
                if ext == '.psd':
                    output_path = self.config.output_folder / (print_path.stem + '.png')
                else:
                    output_path = self.config.output_folder / print_path.name
                
                if ext in ('.jpg', '.jpeg'):
                    if card.mode == 'RGBA':
                        rgb_card = Image.new('RGB', card.size, (255, 255, 255))
                        rgb_card.paste(card, mask=card.split()[3])
                        card = rgb_card
                    card.save(output_path, 'JPEG', quality=95)
                else:
                    card.save(output_path, 'PNG')
                
                processed += 1
            except Exception as e:
                errors.append((print_path.name, str(e)))
        
        if progress_callback:
            progress_callback(len(image_files), len(image_files))
        
        return BatchResult(total_files=total_files, processed=processed, skipped=skipped, errors=errors)
    
    def get_preview(self, print_path: Path) -> Image.Image:
        return self.generate_single(print_path)
