from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple


@dataclass
class PrintArea:
    x: int
    y: int
    width: int
    height: int


class ConfigValidationError(ValueError):
    pass


class ValidationError(ValueError):
    pass


@dataclass
class TemplateSettings:
    """Настройки для одного шаблона."""
    template_path: Path
    corner_points: List[Tuple[int, int]]
    corner_radius: int = 0
    blend_strength: float = 0.25
    change_background_color: bool = True  # Менять цвет фона под коврик
    add_product: bool = True  # Добавлять коврик на карточку


@dataclass
class PerspectiveConfig:
    template_path: Path
    corner_points: List[Tuple[int, int]]
    input_folder: Path
    output_folder: Path
    corner_radius: int = 0
    blend_strength: float = 0.13


@dataclass
class MultiTemplateConfig:
    """Конфигурация для генерации с несколькими шаблонами и папками."""
    templates: List[TemplateSettings]  # До 10 шаблонов
    input_folders: List[Path]  # Несколько папок с принтами
    output_folder: Path  # Базовая папка для вывода


@dataclass
class CardConfig:
    canvas_width: int
    canvas_height: int
    print_area: PrintArea
    input_folder: Path
    output_folder: Path
    overlay_path: Optional[Path] = None
    mask_path: Optional[Path] = None
    k_clusters: int = 5
    
    def validate(self, check_paths: bool = True) -> None:
        errors = []
        
        if self.canvas_width <= 0:
            errors.append(f"canvas_width must be positive, got {self.canvas_width}")
        if self.canvas_height <= 0:
            errors.append(f"canvas_height must be positive, got {self.canvas_height}")
        if self.print_area.width <= 0:
            errors.append(f"print_area.width must be positive, got {self.print_area.width}")
        if self.print_area.height <= 0:
            errors.append(f"print_area.height must be positive, got {self.print_area.height}")
        if self.print_area.x < 0:
            errors.append(f"print_area.x must be non-negative, got {self.print_area.x}")
        if self.print_area.y < 0:
            errors.append(f"print_area.y must be non-negative, got {self.print_area.y}")
        
        if self.canvas_width > 0 and self.canvas_height > 0:
            if self.print_area.x + self.print_area.width > self.canvas_width:
                errors.append(f"print_area exceeds canvas width")
            if self.print_area.y + self.print_area.height > self.canvas_height:
                errors.append(f"print_area exceeds canvas height")
        
        if check_paths:
            if self.overlay_path is not None and not self.overlay_path.exists():
                errors.append(f"overlay_path does not exist: {self.overlay_path}")
            if self.mask_path is not None and not self.mask_path.exists():
                errors.append(f"mask_path does not exist: {self.mask_path}")
        
        if self.k_clusters <= 0:
            errors.append(f"k_clusters must be positive, got {self.k_clusters}")
        
        if errors:
            raise ConfigValidationError("; ".join(errors))


@dataclass
class BatchResult:
    total_files: int
    processed: int
    skipped: int
    errors: List[Tuple[str, str]] = field(default_factory=list)


@dataclass
class Preset:
    name: str
    config: CardConfig
    created_at: datetime = field(default_factory=datetime.now)
