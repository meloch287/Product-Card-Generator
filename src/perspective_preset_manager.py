import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional

from src.models import PerspectiveConfig


class PerspectivePresetManager:
    def __init__(self, presets_file: Path):
        self.presets_file = Path(presets_file)
        self._presets: Dict[str, Dict[str, Any]] = {}
        self._load_presets_file()
    
    def _load_presets_file(self) -> None:
        if not self.presets_file.exists():
            self._presets = {}
            return
        
        try:
            with open(self.presets_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            self._presets = {}
            for name, preset_data in data.items():
                try:
                    self._validate_preset_data(preset_data)
                    self._presets[name] = preset_data
                except (KeyError, TypeError, ValueError):
                    continue
        except (json.JSONDecodeError, IOError):
            self._presets = {}
    
    def _validate_preset_data(self, data: Dict[str, Any]) -> None:
        config = data['config']
        required_fields = ['template_path', 'corner_points', 'input_folder', 'output_folder']
        for field in required_fields:
            if field not in config:
                raise KeyError(f"Missing required field: {field}")
        
        corner_points = config['corner_points']
        if not isinstance(corner_points, list) or len(corner_points) != 4:
            raise TypeError("corner_points must be a list of 4 points")
        
        for i, point in enumerate(corner_points):
            if not isinstance(point, (list, tuple)) or len(point) != 2:
                raise TypeError(f"corner_points[{i}] must be a tuple/list of 2 integers")

    def _save_presets_file(self) -> None:
        self.presets_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.presets_file, 'w', encoding='utf-8') as f:
            json.dump(self._presets, f, indent=2, ensure_ascii=False)
    
    def _serialize_config(self, config: PerspectiveConfig) -> Dict[str, Any]:
        return {
            'template_path': str(config.template_path),
            'corner_points': [list(point) for point in config.corner_points],
            'input_folder': str(config.input_folder),
            'output_folder': str(config.output_folder),
            'corner_radius': config.corner_radius,
        }
    
    def _deserialize_config(self, data: Dict[str, Any]) -> PerspectiveConfig:
        return PerspectiveConfig(
            template_path=Path(data['template_path']),
            corner_points=[tuple(point) for point in data['corner_points']],
            input_folder=Path(data['input_folder']),
            output_folder=Path(data['output_folder']),
            corner_radius=data.get('corner_radius', 0),
        )

    def save_preset(self, name: str, config: PerspectiveConfig) -> None:
        preset_data = {
            'config': self._serialize_config(config),
            'created_at': datetime.now().isoformat(),
        }
        self._presets[name] = preset_data
        self._save_presets_file()
    
    def load_preset(self, name: str) -> PerspectiveConfig:
        if name not in self._presets:
            raise KeyError(f"Preset '{name}' not found")
        return self._deserialize_config(self._presets[name]['config'])
    
    def list_presets(self) -> List[str]:
        return list(self._presets.keys())
    
    def delete_preset(self, name: str) -> None:
        if name not in self._presets:
            raise KeyError(f"Preset '{name}' not found")
        del self._presets[name]
        self._save_presets_file()
    
    def check_template_exists(self, name: str) -> Optional[str]:
        if name not in self._presets:
            raise KeyError(f"Preset '{name}' not found")
        
        template_path = Path(self._presets[name]['config']['template_path'])
        if not template_path.exists():
            return str(template_path)
        return None
