"""
Preset Manager for Product Card Generator.

Управление сохранением и загрузкой конфигураций (пресетов) в JSON формате.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

from src.models import CardConfig, PrintArea, Preset


class PresetManager:
    """
    Сохранение и загрузка конфигураций.
    
    Пресеты хранятся в JSON-файле. Каждый пресет содержит полную
    конфигурацию CardConfig и метаданные (имя, дата создания).
    """
    
    def __init__(self, presets_file: Path):
        """
        Инициализация менеджера пресетов.
        
        Args:
            presets_file: Путь к JSON-файлу с пресетами
        """
        self.presets_file = Path(presets_file)
        self._presets: Dict[str, Preset] = {}
        self._load_presets_file()
    
    def _load_presets_file(self) -> None:
        """
        Загружает пресеты из файла.
        
        Обрабатывает отсутствующий или повреждённый файл gracefully.
        """
        if not self.presets_file.exists():
            self._presets = {}
            return
        
        try:
            with open(self.presets_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            self._presets = {}
            for name, preset_data in data.items():
                try:
                    preset = self._deserialize_preset(name, preset_data)
                    self._presets[name] = preset
                except (KeyError, TypeError, ValueError):
                    # Skip corrupted preset entries
                    continue
                    
        except (json.JSONDecodeError, IOError):
            # Reset to empty presets on corrupted file
            self._presets = {}

    def _save_presets_file(self) -> None:
        """
        Сохраняет все пресеты в файл.
        """
        data = {}
        for name, preset in self._presets.items():
            data[name] = self._serialize_preset(preset)
        
        # Ensure parent directory exists
        self.presets_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(self.presets_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    
    def _serialize_preset(self, preset: Preset) -> Dict[str, Any]:
        """
        Сериализует пресет в словарь для JSON.
        
        Args:
            preset: Пресет для сериализации
            
        Returns:
            Словарь с данными пресета
        """
        config = preset.config
        return {
            'config': {
                'canvas_width': config.canvas_width,
                'canvas_height': config.canvas_height,
                'print_area': {
                    'x': config.print_area.x,
                    'y': config.print_area.y,
                    'width': config.print_area.width,
                    'height': config.print_area.height,
                },
                'input_folder': str(config.input_folder),
                'output_folder': str(config.output_folder),
                'overlay_path': str(config.overlay_path) if config.overlay_path else None,
                'mask_path': str(config.mask_path) if config.mask_path else None,
                'k_clusters': config.k_clusters,
            },
            'created_at': preset.created_at.isoformat(),
        }
    
    def _deserialize_preset(self, name: str, data: Dict[str, Any]) -> Preset:
        """
        Десериализует пресет из словаря.
        
        Args:
            name: Имя пресета
            data: Словарь с данными пресета
            
        Returns:
            Объект Preset
        """
        config_data = data['config']
        print_area_data = config_data['print_area']
        
        print_area = PrintArea(
            x=print_area_data['x'],
            y=print_area_data['y'],
            width=print_area_data['width'],
            height=print_area_data['height'],
        )
        
        config = CardConfig(
            canvas_width=config_data['canvas_width'],
            canvas_height=config_data['canvas_height'],
            print_area=print_area,
            input_folder=Path(config_data['input_folder']),
            output_folder=Path(config_data['output_folder']),
            overlay_path=Path(config_data['overlay_path']) if config_data.get('overlay_path') else None,
            mask_path=Path(config_data['mask_path']) if config_data.get('mask_path') else None,
            k_clusters=config_data.get('k_clusters', 5),
        )
        
        created_at = datetime.fromisoformat(data['created_at'])
        
        return Preset(name=name, config=config, created_at=created_at)

    def save_preset(self, name: str, config: CardConfig) -> None:
        """
        Сохраняет конфигурацию под именем.
        
        Args:
            name: Имя пресета
            config: Конфигурация для сохранения
        """
        preset = Preset(
            name=name,
            config=config,
            created_at=datetime.now(),
        )
        self._presets[name] = preset
        self._save_presets_file()
    
    def load_preset(self, name: str) -> CardConfig:
        """
        Загружает конфигурацию по имени.
        
        Args:
            name: Имя пресета
            
        Returns:
            Конфигурация CardConfig
            
        Raises:
            KeyError: Если пресет с таким именем не найден
        """
        if name not in self._presets:
            raise KeyError(f"Preset '{name}' not found")
        return self._presets[name].config
    
    def list_presets(self) -> List[str]:
        """
        Возвращает список имён пресетов.
        
        Returns:
            Список имён всех сохранённых пресетов
        """
        return list(self._presets.keys())
    
    def delete_preset(self, name: str) -> None:
        """
        Удаляет пресет.
        
        Args:
            name: Имя пресета для удаления
            
        Raises:
            KeyError: Если пресет с таким именем не найден
        """
        if name not in self._presets:
            raise KeyError(f"Preset '{name}' not found")
        del self._presets[name]
        self._save_presets_file()
