"""
Parser for WB/Ozon category Excel templates
Extracts characteristics from Excel files and Google Sheets
"""
import zipfile
import xml.etree.ElementTree as ET
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import re
import json
import os
import tempfile
import httpx

class CategoryCharacteristic(BaseModel):
    id: str
    name: str
    group: str
    description: str = ""
    type: str = "text"  # text, number, select, multiselect, boolean
    required: bool = False
    max_values: int = 1
    unit: Optional[str] = None
    values: List[str] = []  # For select/multiselect


class CategoryTemplate(BaseModel):
    id: str
    name: str
    marketplace: str  # wildberries, ozon
    characteristics: List[CategoryCharacteristic]
    created_at: str


def parse_excel_template(file_path: str) -> Dict[str, Any]:
    """Parse WB/Ozon Excel template and extract characteristics"""
    
    characteristics = []
    groups = {}
    headers = {}
    descriptions = {}
    
    with zipfile.ZipFile(file_path, 'r') as z:
        # Read shared strings
        shared_strings = []
        try:
            with z.open('xl/sharedStrings.xml') as f:
                tree = ET.parse(f)
                root = tree.getroot()
                ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
                for si in root.findall('.//ns:si', ns):
                    text = ''.join(t.text or '' for t in si.findall('.//ns:t', ns))
                    shared_strings.append(text)
        except:
            pass
        
        # Read first sheet
        with z.open('xl/worksheets/sheet1.xml') as f:
            tree = ET.parse(f)
            root = tree.getroot()
            ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            
            rows = root.findall('.//ns:row', ns)[:5]  # First 5 rows
            
            for row in rows:
                row_num = int(row.get('r', 0))
                
                for cell in row.findall('ns:c', ns):
                    cell_ref = cell.get('r', '')
                    cell_type = cell.get('t')
                    value_elem = cell.find('ns:v', ns)
                    value = value_elem.text if value_elem is not None else ''
                    
                    # Get column letter
                    col = re.match(r'([A-Z]+)', cell_ref)
                    if not col:
                        continue
                    col_letter = col.group(1)
                    
                    # If shared string, get actual value
                    if cell_type == 's' and value:
                        try:
                            value = shared_strings[int(value)]
                        except:
                            pass
                    
                    if not value:
                        continue
                    
                    # Row 1: Group names
                    if row_num == 1:
                        groups[col_letter] = value.strip()
                    
                    # Row 3: Field names (headers)
                    elif row_num == 3:
                        headers[col_letter] = value.strip()
                    
                    # Row 4: Descriptions
                    elif row_num == 4:
                        descriptions[col_letter] = value.strip()
    
    # Build characteristics list
    current_group = "Основная информация"
    
    for col in sorted(headers.keys(), key=lambda x: (len(x), x)):
        name = headers[col]
        
        # Find group for this column
        for g_col in sorted(groups.keys(), key=lambda x: (len(x), x), reverse=True):
            if col >= g_col:
                current_group = groups[g_col]
                break
        
        desc = descriptions.get(col, "")
        
        # Determine type and constraints from description
        char_type = "text"
        max_values = 1
        unit = None
        required = False
        
        # Parse description for constraints
        if desc:
            # Check for max values
            max_match = re.search(r'Максимальное количество значений:\s*(\d+)', desc)
            if max_match:
                max_values = int(max_match.group(1))
                if max_values > 1:
                    char_type = "multiselect"
            
            # Check for unit
            unit_match = re.search(r'Единица измерения:\s*(\S+)', desc)
            if unit_match:
                unit = unit_match.group(1)
                char_type = "number"
        
        # Determine if required based on name
        if name in ['Наименование', 'Артикул продавца', 'Бренд', 'Категория продавца']:
            required = True
        
        # Skip some system fields
        if name in ['Артикул WB', 'Группа']:
            continue
        
        char = CategoryCharacteristic(
            id=f"char_{col.lower()}",
            name=name,
            group=current_group,
            description=desc,
            type=char_type,
            required=required,
            max_values=max_values,
            unit=unit
        )
        characteristics.append(char)
    
    return {
        "characteristics": [c.model_dump() for c in characteristics],
        "groups": list(set(groups.values()))
    }


# Storage for category templates
TEMPLATES_FILE = "category_templates.json"


def load_templates() -> List[CategoryTemplate]:
    """Load saved category templates"""
    if os.path.exists(TEMPLATES_FILE):
        try:
            with open(TEMPLATES_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return [CategoryTemplate(**t) for t in data]
        except:
            pass
    return []


def save_templates(templates: List[CategoryTemplate]):
    """Save category templates"""
    with open(TEMPLATES_FILE, 'w', encoding='utf-8') as f:
        json.dump([t.model_dump() for t in templates], f, ensure_ascii=False, indent=2)


def add_template(name: str, marketplace: str, characteristics: List[Dict]) -> CategoryTemplate:
    """Add a new category template"""
    from datetime import datetime
    import uuid
    
    template = CategoryTemplate(
        id=str(uuid.uuid4()),
        name=name,
        marketplace=marketplace,
        characteristics=[CategoryCharacteristic(**c) for c in characteristics],
        created_at=datetime.now().isoformat()
    )
    
    templates = load_templates()
    templates.append(template)
    save_templates(templates)
    
    return template


def delete_template(template_id: str) -> bool:
    """Delete a category template"""
    templates = load_templates()
    templates = [t for t in templates if t.id != template_id]
    save_templates(templates)
    return True


def get_template(template_id: str) -> Optional[CategoryTemplate]:
    """Get a specific template by ID"""
    templates = load_templates()
    for t in templates:
        if t.id == template_id:
            return t
    return None


def extract_google_sheet_id(url: str) -> Optional[str]:
    """Extract Google Sheet ID from URL"""
    # Patterns for Google Sheets URLs
    patterns = [
        r'/spreadsheets/d/([a-zA-Z0-9-_]+)',
        r'id=([a-zA-Z0-9-_]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


async def download_google_sheet(url: str) -> str:
    """Download Google Sheet as Excel file and return temp file path"""
    sheet_id = extract_google_sheet_id(url)
    if not sheet_id:
        raise ValueError("Не удалось извлечь ID таблицы из ссылки")
    
    # Google Sheets export URL for xlsx format
    export_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=xlsx"
    
    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        response = await client.get(export_url)
        
        if response.status_code != 200:
            raise ValueError(f"Не удалось скачать таблицу. Убедитесь, что доступ открыт для всех по ссылке. Код: {response.status_code}")
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp:
            tmp.write(response.content)
            return tmp.name


def parse_google_sheet(url: str) -> Dict[str, Any]:
    """Synchronous wrapper for parsing Google Sheet"""
    import asyncio
    
    async def _parse():
        tmp_path = await download_google_sheet(url)
        try:
            return parse_excel_template(tmp_path)
        finally:
            os.unlink(tmp_path)
    
    # Run async function
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_parse())
    finally:
        loop.close()
