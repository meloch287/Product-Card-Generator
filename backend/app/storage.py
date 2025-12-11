"""In-memory storage for templates and folders with optimized I/O."""
import sys
import json
from pathlib import Path
from typing import Dict, List, Optional
import threading

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.app.models import Template, PrintFolder, GenerationStatus, Point, PointSet, MarketplaceCard
from backend.app.config import BASE_DIR

STORAGE_FILE = BASE_DIR / "storage.json"
PRESETS_FILE = BASE_DIR / "template_presets.json"
CARDS_FILE = BASE_DIR / "marketplace_cards.json"
SETTINGS_FILE = BASE_DIR / "marketplace_settings.json"


class Storage:
    def __init__(self):
        self.templates: Dict[str, Template] = {}
        self.folders: Dict[str, PrintFolder] = {}
        self.presets: Dict[str, List[dict]] = {}  # name -> points preset
        self.cards: Dict[str, MarketplaceCard] = {}  # Marketplace cards
        self.marketplace_settings: Dict[str, str] = {}  # API keys
        self.generation_status = GenerationStatus()
        self._save_lock = threading.Lock()  # Thread-safe saves
        self._load()
        self._load_presets()
        self._load_cards()
        self._load_marketplace_settings()
    
    def _load(self):
        """Load from file if exists."""
        if STORAGE_FILE.exists():
            try:
                data = json.loads(STORAGE_FILE.read_text(encoding='utf-8'))
                needs_save = False
                for t in data.get('templates', []):
                    template = Template(**t)
                    # Migrate: load original dimensions if missing
                    if template.original_width == 0 or template.original_height == 0:
                        template = self._load_original_dimensions(template)
                        needs_save = True
                    # Migrate: create point_sets from points if empty
                    if not template.point_sets and template.points:
                        template = self._migrate_points_to_point_sets(template)
                        needs_save = True
                    self.templates[template.id] = template
                for f in data.get('folders', []):
                    folder = PrintFolder(**f)
                    self.folders[folder.id] = folder
                # Save migrated data
                if needs_save and self.templates:
                    self._save()
            except Exception:
                pass
    
    def _load_original_dimensions(self, template: Template) -> Template:
        """Load original image dimensions for migration."""
        try:
            from PIL import Image
            from src.file_utils import load_image
            img = load_image(Path(template.path))
            w, h = img.size
            return template.model_copy(update={'original_width': w, 'original_height': h})
        except Exception:
            return template
    
    def _migrate_points_to_point_sets(self, template: Template) -> Template:
        """Migrate old single-points format to point_sets array.
        
        Creates a single PointSet with index 0 from the existing points.
        Sets is_multi_mode to False for backward compatibility.
        """
        if template.points and len(template.points) == 4:
            point_set = PointSet(index=0, points=template.points)
            return template.model_copy(update={
                'point_sets': [point_set],
                'is_multi_mode': False
            })
        return template
    
    def _save(self):
        """Save to file (thread-safe)."""
        with self._save_lock:
            data = {
                'templates': [t.model_dump() for t in self.templates.values()],
                'folders': [f.model_dump() for f in self.folders.values()]
            }
            STORAGE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    
    # Templates
    def add_template(self, template: Template) -> Template:
        self.templates[template.id] = template
        self._save()
        return template
    
    def get_template(self, template_id: str) -> Optional[Template]:
        return self.templates.get(template_id)
    
    def get_all_templates(self) -> List[Template]:
        return list(self.templates.values())
    
    def update_template(self, template_id: str, updates: dict) -> Optional[Template]:
        if template_id not in self.templates:
            return None
        template = self.templates[template_id]
        
        # Synchronize points and point_sets
        updates = self._sync_points_and_point_sets(template, updates)
        
        updated = template.model_copy(update=updates)
        self.templates[template_id] = updated
        self._save()
        return updated
    
    def _sync_points_and_point_sets(self, template: Template, updates: dict) -> dict:
        """Synchronize points and point_sets fields for consistency.
        
        - If point_sets is updated, sync first set to points field
        - If points is updated without point_sets, update first point_set
        - Auto-detect is_multi_mode based on point_sets length
        """
        updates = updates.copy()
        
        # Case 1: point_sets is being updated
        if 'point_sets' in updates and updates['point_sets']:
            point_sets = updates['point_sets']
            # Ensure point_sets are PointSet objects
            normalized_sets = []
            for ps in point_sets:
                if isinstance(ps, dict):
                    # Convert dict to PointSet
                    points = [Point(x=p['x'], y=p['y']) if isinstance(p, dict) else p 
                              for p in ps.get('points', [])]
                    normalized_sets.append(PointSet(index=ps.get('index', len(normalized_sets)), points=points))
                else:
                    normalized_sets.append(ps)
            updates['point_sets'] = normalized_sets
            
            # Sync first point set to points field for backward compatibility
            if normalized_sets and len(normalized_sets[0].points) == 4:
                updates['points'] = normalized_sets[0].points
            
            # Don't auto-detect multi mode - preserve user's explicit setting
            # Only set if not already specified in updates
        
        # Case 2: Only points is being updated (backward compatibility)
        elif 'points' in updates and updates['points']:
            points = updates['points']
            # Ensure points are Point objects
            normalized_points = [
                Point(x=p['x'], y=p['y']) if isinstance(p, dict) else p 
                for p in points
            ]
            updates['points'] = normalized_points
            
            # Update first point_set or create one
            current_sets = list(template.point_sets) if template.point_sets else []
            if current_sets:
                # Update first set
                current_sets[0] = PointSet(index=0, points=normalized_points)
            else:
                # Create first set
                current_sets = [PointSet(index=0, points=normalized_points)]
            updates['point_sets'] = current_sets
        
        return updates
    
    def delete_template(self, template_id: str) -> bool:
        if template_id in self.templates:
            del self.templates[template_id]
            self._save()
            return True
        return False
    
    # Folders
    def add_folder(self, folder: PrintFolder) -> PrintFolder:
        self.folders[folder.id] = folder
        self._save()
        return folder
    
    def get_folder(self, folder_id: str) -> Optional[PrintFolder]:
        return self.folders.get(folder_id)
    
    def get_all_folders(self) -> List[PrintFolder]:
        return list(self.folders.values())
    
    def delete_folder(self, folder_id: str) -> bool:
        if folder_id in self.folders:
            del self.folders[folder_id]
            self._save()
            return True
        return False
    
    # Presets (by template name)
    def _load_presets(self):
        """Load presets from file."""
        if PRESETS_FILE.exists():
            try:
                self.presets = json.loads(PRESETS_FILE.read_text(encoding='utf-8'))
            except Exception:
                self.presets = {}
    
    def _save_presets(self):
        """Save presets to file (thread-safe)."""
        with self._save_lock:
            PRESETS_FILE.write_text(json.dumps(self.presets, ensure_ascii=False, indent=2), encoding='utf-8')
    
    def _parse_preset(self, data) -> Optional[List[Point]]:
        """Parse preset data from either old or new format.
        
        Supports:
        - New format: [{x, y}, {x, y}, {x, y}, {x, y}]
        - Old format nested: {points: [[x,y], ...], radius, blend}
        - Old format array: [[x, y], [x, y], ...]
        
        Returns None if data is invalid or cannot be parsed.
        """
        if data is None:
            return None
        
        # New format: [{x, y}, ...]
        if isinstance(data, list) and len(data) == 4:
            try:
                # Check for dict format with x, y keys
                if all(isinstance(p, dict) and 'x' in p and 'y' in p for p in data):
                    return [Point(x=int(p['x']), y=int(p['y'])) for p in data]
                # Old format inside list: [[x, y], [x, y], ...]
                if all(isinstance(p, (list, tuple)) and len(p) >= 2 for p in data):
                    return [Point(x=int(p[0]), y=int(p[1])) for p in data]
            except (TypeError, ValueError, KeyError):
                return None
        
        # Old format: {points: [[x,y], ...], radius, blend}
        if isinstance(data, dict) and 'points' in data:
            pts = data['points']
            if isinstance(pts, list) and len(pts) == 4:
                try:
                    if all(isinstance(p, (list, tuple)) and len(p) >= 2 for p in pts):
                        return [Point(x=int(p[0]), y=int(p[1])) for p in pts]
                except (TypeError, ValueError):
                    return None
        
        return None
    
    def save_preset(self, name: str, points: List[Point]):
        """Save points preset by template name.
        
        Always saves in new format: [{x, y}, ...]
        Removes .psd suffix from key if present for consistency.
        """
        # Normalize name: remove .psd suffix if present
        clean_name = name[:-4] if name.lower().endswith('.psd') else name
        self.presets[clean_name] = [{'x': p.x, 'y': p.y} for p in points]
        self._save_presets()
    
    def get_preset(self, name: str) -> Optional[List[Point]]:
        """Get points preset by template name. Supports old and new formats.
        
        Search order:
        1. Exact name match (new format)
        2. Name with .psd suffix (old format backward compatibility)
        """
        # Try exact name first (new format)
        if name in self.presets:
            result = self._parse_preset(self.presets[name])
            if result is not None:
                return result
        
        # Try with .psd suffix (old format backward compatibility)
        old_name = f"{name}.psd"
        if old_name in self.presets:
            result = self._parse_preset(self.presets[old_name])
            if result is not None:
                return result
        
        return None
    
    # ==================== Marketplace Cards ====================
    
    def _load_cards(self):
        """Load marketplace cards from file."""
        if CARDS_FILE.exists():
            try:
                data = json.loads(CARDS_FILE.read_text(encoding='utf-8'))
                for c in data.get('cards', []):
                    card = MarketplaceCard(**c)
                    self.cards[card.id] = card
            except Exception:
                self.cards = {}
    
    def _save_cards(self):
        """Save marketplace cards to file (thread-safe)."""
        with self._save_lock:
            data = {'cards': [c.model_dump() for c in self.cards.values()]}
            CARDS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    
    def add_card(self, card: MarketplaceCard) -> MarketplaceCard:
        """Add a new marketplace card."""
        self.cards[card.id] = card
        self._save_cards()
        return card
    
    def get_card(self, card_id: str) -> Optional[MarketplaceCard]:
        """Get card by ID."""
        return self.cards.get(card_id)
    
    def get_all_cards(self) -> List[MarketplaceCard]:
        """Get all marketplace cards."""
        return list(self.cards.values())
    
    def update_card(self, card_id: str, updates: dict) -> Optional[MarketplaceCard]:
        """Update a marketplace card."""
        if card_id not in self.cards:
            return None
        card = self.cards[card_id]
        # Update timestamp
        from datetime import datetime
        updates['updated_at'] = datetime.now().isoformat()
        updated = card.model_copy(update=updates)
        self.cards[card_id] = updated
        self._save_cards()
        return updated
    
    def delete_card(self, card_id: str) -> bool:
        """Delete a marketplace card."""
        if card_id in self.cards:
            del self.cards[card_id]
            self._save_cards()
            return True
        return False
    
    # ==================== Marketplace Settings ====================
    
    def _load_marketplace_settings(self):
        """Load marketplace settings from file."""
        if SETTINGS_FILE.exists():
            try:
                self.marketplace_settings = json.loads(SETTINGS_FILE.read_text(encoding='utf-8'))
            except Exception:
                self.marketplace_settings = {}
    
    def _save_marketplace_settings(self):
        """Save marketplace settings to file (thread-safe)."""
        with self._save_lock:
            SETTINGS_FILE.write_text(
                json.dumps(self.marketplace_settings, ensure_ascii=False, indent=2), 
                encoding='utf-8'
            )
    
    def get_marketplace_settings(self) -> Dict[str, str]:
        """Get marketplace API settings."""
        return self.marketplace_settings.copy()
    
    def update_marketplace_settings(self, updates: Dict[str, str]) -> Dict[str, str]:
        """Update marketplace API settings."""
        self.marketplace_settings.update(updates)
        self._save_marketplace_settings()
        return self.marketplace_settings.copy()


storage = Storage()
