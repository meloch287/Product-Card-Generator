"""
Import Products API Router
Handles bulk import of products from Excel/Google Sheets
"""
import uuid
import tempfile
import shutil
import os
import re
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import asyncio

import httpx

from backend.app.storage import storage
from backend.app.models import MarketplaceCard, CardStatus, MarketplaceType
from backend.app.config import UPLOADS_DIR

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/import", tags=["import"])


# ==================== Models ====================

class ColumnMapping(BaseModel):
    """Mapping of Excel columns to card fields"""
    article: str = "Артикул продавца"
    name: str = "Наименование"
    brand: str = "Бренд"
    description: str = "Описание"
    price: str = "Цена"
    old_price: str = "Цена до скидки"
    barcode: str = "Баркод"
    photos: str = "Фото"
    # Dimensions
    length: str = "Длина упаковки"
    width: str = "Ширина упаковки"
    height: str = "Высота упаковки"
    weight: str = "Вес"


class ImportPreviewRow(BaseModel):
    """Preview of a single row from Excel"""
    row_number: int
    article: str
    name: str
    brand: str = ""
    price: float = 0
    photos_count: int = 0
    is_valid: bool = True
    errors: List[str] = []
    exists: bool = False  # Already exists in DB


class ImportPreviewResponse(BaseModel):
    """Response for import preview"""
    total_rows: int
    valid_rows: int
    invalid_rows: int
    existing_rows: int  # Will be updated
    new_rows: int  # Will be created
    columns: List[str]  # Available columns in file
    rows: List[ImportPreviewRow]
    detected_mapping: Dict[str, str]  # Auto-detected column mapping


class ImportRequest(BaseModel):
    """Request to execute import"""
    file_path: str  # Temp file path from preview
    mapping: ColumnMapping
    marketplace: str = "wildberries"
    category_id: str = ""
    category_name: str = ""
    update_existing: bool = True
    download_photos: bool = True
    selected_rows: Optional[List[int]] = None  # Row numbers to import (None = all valid)


class ImportResultRow(BaseModel):
    """Result for a single imported row"""
    row_number: int
    article: str
    name: str
    status: str  # created, updated, skipped, error
    message: str = ""
    card_id: Optional[str] = None


class ImportResponse(BaseModel):
    """Response for import execution"""
    total: int
    created: int
    updated: int
    skipped: int
    errors: int
    results: List[ImportResultRow]


# ==================== Excel Parser ====================

def parse_excel_products(file_path: str) -> Dict[str, Any]:
    """
    Parse Excel file with WB/Ozon product template structure.
    
    Auto-detects header row by looking for "Артикул" column.
    Supports various WB/Ozon template formats.
    """
    import zipfile
    import xml.etree.ElementTree as ET
    
    columns = []
    rows = []
    all_row_data = []
    
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
            
            all_rows = root.findall('.//ns:row', ns)
            
            # Parse all rows first
            for row in all_rows:
                row_num = int(row.get('r', 0))
                row_data = {}
                
                for cell in row.findall('ns:c', ns):
                    cell_ref = cell.get('r', '')
                    cell_type = cell.get('t')
                    value_elem = cell.find('ns:v', ns)
                    value = value_elem.text if value_elem is not None else ''
                    
                    # Get column letter
                    col_match = re.match(r'([A-Z]+)', cell_ref)
                    if not col_match:
                        continue
                    col_letter = col_match.group(1)
                    
                    # If shared string, get actual value
                    if cell_type == 's' and value:
                        try:
                            value = shared_strings[int(value)]
                        except:
                            pass
                    
                    row_data[col_letter] = value
                
                all_row_data.append({'row_num': row_num, 'data': row_data})
    
    # Auto-detect header row (look for "Артикул" in any cell)
    header_row_idx = None
    header_keywords = ['артикул продавца', 'артикул', 'наименование', 'название товара']
    
    for idx, row_info in enumerate(all_row_data):
        row_data = row_info['data']
        values_lower = [str(v).lower().strip() for v in row_data.values()]
        
        # Check if this row contains header keywords
        matches = sum(1 for kw in header_keywords if any(kw in v for v in values_lower))
        if matches >= 2:  # At least 2 header keywords found
            header_row_idx = idx
            break
    
    if header_row_idx is None:
        # Fallback: try row 2 or row 3 (0-indexed: 1 or 2)
        for try_idx in [1, 2, 0]:
            if try_idx < len(all_row_data):
                header_row_idx = try_idx
                break
    
    if header_row_idx is None or header_row_idx >= len(all_row_data):
        return {'columns': [], 'rows': []}
    
    # Extract columns from header row
    header_data = all_row_data[header_row_idx]['data']
    
    # Get all column letters used in the file
    all_cols = set()
    for row_info in all_row_data:
        all_cols.update(row_info['data'].keys())
    sorted_cols = sorted(all_cols, key=lambda x: (len(x), x))
    
    columns = [header_data.get(col, '') for col in sorted_cols]
    
    # Data starts after header row (skip 1-2 rows for hints/descriptions)
    # Look for first row with actual data (has article or name filled)
    data_start_idx = header_row_idx + 1
    
    # Skip hint rows (usually 1-2 rows after header with long descriptions)
    while data_start_idx < len(all_row_data):
        row_data = all_row_data[data_start_idx]['data']
        # Check if this looks like a hint row (very long text in cells)
        values = list(row_data.values())
        if values:
            avg_len = sum(len(str(v)) for v in values) / len(values)
            if avg_len > 50:  # Hint rows usually have long descriptions
                data_start_idx += 1
                continue
        break
    
    # Extract data rows
    for row_info in all_row_data[data_start_idx:]:
        row_num = row_info['row_num']
        row_data = row_info['data']
        
        # Skip empty rows (check if any meaningful data)
        non_empty = sum(1 for v in row_data.values() if v and str(v).strip())
        if non_empty < 2:  # Need at least 2 non-empty cells
            continue
        
        row_values = [row_data.get(col, '') for col in sorted_cols]
        rows.append({
            'row_number': row_num,
            'values': row_values,
            'raw': row_data
        })
    
    return {
        'columns': columns,
        'rows': rows
    }


def detect_column_mapping(columns: List[str]) -> Dict[str, str]:
    """Auto-detect column mapping based on column names"""
    mapping = {}
    
    # Mapping patterns
    patterns = {
        'article': ['артикул продавца', 'артикул', 'sku', 'vendor code', 'код товара'],
        'name': ['наименование', 'название', 'name', 'title'],
        'brand': ['бренд', 'brand', 'производитель'],
        'description': ['описание', 'description', 'desc'],
        'price': ['цена', 'price', 'розничная цена'],
        'old_price': ['цена до скидки', 'старая цена', 'old price'],
        'barcode': ['баркод', 'barcode', 'штрихкод', 'ean'],
        'photos': ['фото', 'photo', 'изображения', 'images', 'медиафайлы'],
        'length': ['длина упаковки', 'длина', 'length'],
        'width': ['ширина упаковки', 'ширина', 'width'],
        'height': ['высота упаковки', 'высота', 'height'],
        'weight': ['вес', 'weight', 'масса'],
    }
    
    for field, keywords in patterns.items():
        for col in columns:
            col_lower = col.lower().strip()
            for keyword in keywords:
                if keyword in col_lower:
                    mapping[field] = col
                    break
            if field in mapping:
                break
    
    return mapping


def get_cell_value(row_values: List[str], columns: List[str], column_name: str) -> str:
    """Get cell value by column name"""
    try:
        idx = columns.index(column_name)
        if idx < len(row_values):
            return str(row_values[idx]).strip()
    except (ValueError, IndexError):
        pass
    return ""


def parse_photos(photos_str: str) -> List[str]:
    """Parse photos string (semicolon or comma separated URLs)"""
    if not photos_str:
        return []
    
    # Split by semicolon or comma
    photos = re.split(r'[;,]', photos_str)
    
    # Clean and filter
    result = []
    for photo in photos:
        photo = photo.strip()
        if photo and (photo.startswith('http://') or photo.startswith('https://')):
            result.append(photo)
    
    return result


def parse_price(price_str: str) -> float:
    """Parse price string to float"""
    if not price_str:
        return 0
    
    # Remove currency symbols and spaces
    price_str = re.sub(r'[^\d.,]', '', str(price_str))
    
    # Replace comma with dot
    price_str = price_str.replace(',', '.')
    
    try:
        return float(price_str)
    except ValueError:
        return 0


# ==================== Photo Downloader ====================

async def download_photo(url: str, save_dir: Path, client: Optional[httpx.AsyncClient] = None) -> Optional[str]:
    """Download photo from URL and save to local directory"""
    try:
        should_close = client is None
        if client is None:
            client = httpx.AsyncClient(follow_redirects=True, timeout=15.0)
        
        try:
            response = await client.get(url)
            
            if response.status_code != 200:
                logger.warning(f"Failed to download photo: {url}, status: {response.status_code}")
                return None
            
            # Determine filename from URL or content-disposition
            filename = None
            
            # Try content-disposition header
            cd = response.headers.get('content-disposition')
            if cd:
                match = re.search(r'filename="?([^";\n]+)"?', cd)
                if match:
                    filename = match.group(1)
            
            # Fallback to URL path
            if not filename:
                url_path = url.split('?')[0]
                filename = url_path.split('/')[-1]
            
            # Ensure valid extension
            if not any(filename.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                # Try to detect from content-type
                content_type = response.headers.get('content-type', '')
                if 'jpeg' in content_type or 'jpg' in content_type:
                    filename = f"{uuid.uuid4()}.jpg"
                elif 'png' in content_type:
                    filename = f"{uuid.uuid4()}.png"
                elif 'webp' in content_type:
                    filename = f"{uuid.uuid4()}.webp"
                else:
                    filename = f"{uuid.uuid4()}.jpg"
            
            # Save file
            save_path = save_dir / filename
            save_path.write_bytes(response.content)
            
            return str(save_path)
        finally:
            if should_close:
                await client.aclose()
    
    except Exception as e:
        logger.error(f"Error downloading photo {url}: {e}")
        return None


async def download_photos_batch(urls: List[str], save_dir: Path, max_concurrent: int = 5) -> List[str]:
    """Download multiple photos concurrently with limit"""
    import asyncio
    
    if not urls:
        return []
    
    semaphore = asyncio.Semaphore(max_concurrent)
    results = []
    
    async def download_with_semaphore(url: str, client: httpx.AsyncClient) -> Optional[str]:
        async with semaphore:
            return await download_photo(url, save_dir, client)
    
    async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client:
        tasks = [download_with_semaphore(url, client) for url in urls]
        downloaded = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in downloaded:
            if isinstance(result, str):
                results.append(result)
    
    return results


# ==================== API Endpoints ====================

@router.post("/preview")
async def preview_import(file: UploadFile = File(...)):
    """
    Preview Excel file before import.
    Returns parsed data and auto-detected column mapping.
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(400, "Поддерживаются только Excel файлы (.xlsx, .xls)")
    
    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    
    try:
        # Parse Excel
        data = parse_excel_products(tmp_path)
        columns = data['columns']
        rows = data['rows']
        
        # Auto-detect mapping
        detected_mapping = detect_column_mapping(columns)
        
        # Get existing articles for comparison
        existing_cards = storage.get_all_cards()
        existing_articles = {c.article.lower(): c for c in existing_cards}
        
        # Build preview rows and count stats for ALL rows
        preview_rows = []
        valid_count = 0
        invalid_count = 0
        existing_count = 0
        new_count = 0
        
        for idx, row in enumerate(rows):
            row_values = row['values']
            row_num = row['row_number']
            
            # Extract key fields
            article = get_cell_value(row_values, columns, detected_mapping.get('article', ''))
            name = get_cell_value(row_values, columns, detected_mapping.get('name', ''))
            brand = get_cell_value(row_values, columns, detected_mapping.get('brand', ''))
            price_str = get_cell_value(row_values, columns, detected_mapping.get('price', ''))
            photos_str = get_cell_value(row_values, columns, detected_mapping.get('photos', ''))
            
            price = parse_price(price_str)
            photos = parse_photos(photos_str)
            
            # Validate
            errors = []
            if not article:
                errors.append("Отсутствует артикул")
            if not name:
                errors.append("Отсутствует наименование")
            
            is_valid = len(errors) == 0
            exists = article.lower() in existing_articles if article else False
            
            # Count stats for ALL rows
            if is_valid:
                valid_count += 1
                if exists:
                    existing_count += 1
                else:
                    new_count += 1
            else:
                invalid_count += 1
            
            # Only add first 100 rows to preview
            if idx < 100:
                preview_rows.append(ImportPreviewRow(
                    row_number=row_num,
                    article=article,
                    name=name,
                    brand=brand,
                    price=price,
                    photos_count=len(photos),
                    is_valid=is_valid,
                    errors=errors,
                    exists=exists
                ))
        
        # Keep temp file for actual import
        # Move to uploads dir
        import_file = UPLOADS_DIR / f"import_{uuid.uuid4()}.xlsx"
        shutil.move(tmp_path, import_file)
        
        return ImportPreviewResponse(
            total_rows=len(rows),
            valid_rows=valid_count,
            invalid_rows=invalid_count,
            existing_rows=existing_count,
            new_rows=new_count,
            columns=columns,
            rows=preview_rows,
            detected_mapping=detected_mapping
        )
    
    except Exception as e:
        # Clean up temp file on error
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise HTTPException(400, f"Ошибка парсинга файла: {str(e)}")


@router.post("/preview-google-sheets")
async def preview_google_sheets(data: dict):
    """
    Preview Google Sheets before import.
    Downloads sheet as Excel and parses it.
    """
    url = data.get('url')
    if not url:
        raise HTTPException(400, "URL обязателен")
    
    # Extract sheet ID
    from backend.app.category_parser import extract_google_sheet_id, download_google_sheet
    
    sheet_id = extract_google_sheet_id(url)
    if not sheet_id:
        raise HTTPException(400, "Неверная ссылка на Google Sheets")
    
    try:
        # Download as Excel
        tmp_path = await download_google_sheet(url)
        
        # Parse Excel
        data = parse_excel_products(tmp_path)
        columns = data['columns']
        rows = data['rows']
        
        # Auto-detect mapping
        detected_mapping = detect_column_mapping(columns)
        
        # Get existing articles
        existing_cards = storage.get_all_cards()
        existing_articles = {c.article.lower(): c for c in existing_cards}
        
        # Build preview rows and count stats for ALL rows
        preview_rows = []
        valid_count = 0
        invalid_count = 0
        existing_count = 0
        new_count = 0
        
        for idx, row in enumerate(rows):
            row_values = row['values']
            row_num = row['row_number']
            
            article = get_cell_value(row_values, columns, detected_mapping.get('article', ''))
            name = get_cell_value(row_values, columns, detected_mapping.get('name', ''))
            brand = get_cell_value(row_values, columns, detected_mapping.get('brand', ''))
            price_str = get_cell_value(row_values, columns, detected_mapping.get('price', ''))
            photos_str = get_cell_value(row_values, columns, detected_mapping.get('photos', ''))
            
            price = parse_price(price_str)
            photos = parse_photos(photos_str)
            
            errors = []
            if not article:
                errors.append("Отсутствует артикул")
            if not name:
                errors.append("Отсутствует наименование")
            
            is_valid = len(errors) == 0
            exists = article.lower() in existing_articles if article else False
            
            # Count stats for ALL rows
            if is_valid:
                valid_count += 1
                if exists:
                    existing_count += 1
                else:
                    new_count += 1
            else:
                invalid_count += 1
            
            # Only add first 100 rows to preview
            if idx < 100:
                preview_rows.append(ImportPreviewRow(
                    row_number=row_num,
                    article=article,
                    name=name,
                    brand=brand,
                    price=price,
                    photos_count=len(photos),
                    is_valid=is_valid,
                    errors=errors,
                    exists=exists
                ))
        
        # Move to uploads
        import_file = UPLOADS_DIR / f"import_{uuid.uuid4()}.xlsx"
        shutil.move(tmp_path, import_file)
        
        return ImportPreviewResponse(
            total_rows=len(rows),
            valid_rows=valid_count,
            invalid_rows=invalid_count,
            existing_rows=existing_count,
            new_rows=new_count,
            columns=columns,
            rows=preview_rows,
            detected_mapping=detected_mapping
        )
    
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, f"Ошибка загрузки: {str(e)}")


@router.post("/execute", response_model=ImportResponse)
async def execute_import(request: ImportRequest):
    """
    Execute product import from previously uploaded Excel file.
    Creates new cards or updates existing ones based on article.
    """
    file_path = Path(request.file_path) if request.file_path else None
    
    # Find the import file
    if not file_path or not file_path.exists():
        # Try to find latest import file
        import_files = list(UPLOADS_DIR.glob("import_*.xlsx"))
        if not import_files:
            raise HTTPException(400, "Файл импорта не найден. Сначала загрузите файл через /preview")
        file_path = max(import_files, key=lambda p: p.stat().st_mtime)
    
    try:
        # Parse Excel
        data = parse_excel_products(str(file_path))
        columns = data['columns']
        rows = data['rows']
        
        mapping = request.mapping
        
        # Get existing cards by article
        existing_cards = storage.get_all_cards()
        existing_by_article = {c.article.lower(): c for c in existing_cards}
        
        # Prepare photo directory
        photos_dir = UPLOADS_DIR / "imported_photos"
        photos_dir.mkdir(exist_ok=True)
        
        results = []
        created = 0
        updated = 0
        skipped = 0
        errors = 0
        
        # Filter rows by selection if provided
        selected_set = set(request.selected_rows) if request.selected_rows else None
        
        for row in rows:
            row_values = row['values']
            row_num = row['row_number']
            
            # Skip if not in selected rows
            if selected_set is not None and row_num not in selected_set:
                continue
            
            try:
                # Extract fields using mapping
                article = get_cell_value(row_values, columns, mapping.article)
                name = get_cell_value(row_values, columns, mapping.name)
                brand = get_cell_value(row_values, columns, mapping.brand)
                description = get_cell_value(row_values, columns, mapping.description)
                price_str = get_cell_value(row_values, columns, mapping.price)
                old_price_str = get_cell_value(row_values, columns, mapping.old_price)
                barcode = get_cell_value(row_values, columns, mapping.barcode)
                photos_str = get_cell_value(row_values, columns, mapping.photos)
                length_str = get_cell_value(row_values, columns, mapping.length)
                width_str = get_cell_value(row_values, columns, mapping.width)
                height_str = get_cell_value(row_values, columns, mapping.height)
                weight_str = get_cell_value(row_values, columns, mapping.weight)
                
                # Validate required fields
                if not article:
                    results.append(ImportResultRow(
                        row_number=row_num,
                        article="",
                        name=name,
                        status="error",
                        message="Отсутствует артикул"
                    ))
                    errors += 1
                    continue
                
                if not name:
                    results.append(ImportResultRow(
                        row_number=row_num,
                        article=article,
                        name="",
                        status="error",
                        message="Отсутствует наименование"
                    ))
                    errors += 1
                    continue
                
                # Parse values
                price = parse_price(price_str)
                old_price = parse_price(old_price_str)
                photos_urls = parse_photos(photos_str)
                
                # Parse dimensions
                length = int(float(length_str)) if length_str else 0
                width = int(float(width_str)) if width_str else 0
                height = int(float(height_str)) if height_str else 0
                weight = int(float(weight_str)) if weight_str else 0
                
                # Download photos if enabled (batch download for speed)
                images = []
                if request.download_photos and photos_urls:
                    article_photos_dir = photos_dir / article.replace('/', '_').replace('\\', '_')
                    article_photos_dir.mkdir(exist_ok=True)
                    
                    # Use batch download for better performance
                    images = await download_photos_batch(photos_urls, article_photos_dir, max_concurrent=5)
                
                # Check if exists
                existing = existing_by_article.get(article.lower())
                
                if existing:
                    if not request.update_existing:
                        results.append(ImportResultRow(
                            row_number=row_num,
                            article=article,
                            name=name,
                            status="skipped",
                            message="Товар уже существует",
                            card_id=existing.id
                        ))
                        skipped += 1
                        continue
                    
                    # Update existing card
                    update_data = {
                        'name': name,
                        'description': description,
                        'brand': brand,
                        'barcode': barcode,
                    }
                    
                    if price > 0:
                        update_data['price'] = price
                    if old_price > 0:
                        update_data['old_price'] = old_price
                    if images:
                        # Append new images to existing
                        update_data['images'] = (existing.images or []) + images
                    if length or width or height:
                        update_data['dimensions'] = {
                            'length': length or (existing.dimensions.length if existing.dimensions else 0),
                            'width': width or (existing.dimensions.width if existing.dimensions else 0),
                            'height': height or (existing.dimensions.height if existing.dimensions else 0),
                            'weight': weight or (existing.dimensions.weight if existing.dimensions else 0),
                        }
                    if weight:
                        update_data['weight'] = weight
                    
                    storage.update_card(existing.id, update_data)
                    
                    results.append(ImportResultRow(
                        row_number=row_num,
                        article=article,
                        name=name,
                        status="updated",
                        message="Товар обновлен",
                        card_id=existing.id
                    ))
                    updated += 1
                
                else:
                    # Create new card
                    now = datetime.utcnow().isoformat()
                    
                    # Determine marketplace type
                    marketplace = MarketplaceType.WILDBERRIES
                    if request.marketplace.lower() == 'ozon':
                        marketplace = MarketplaceType.OZON
                    
                    card = MarketplaceCard(
                        id=str(uuid.uuid4()),
                        marketplace=marketplace,
                        status=CardStatus.DRAFT,
                        name=name,
                        description=description,
                        brand=brand,
                        article=article,
                        barcode=barcode,
                        category_id=request.category_id,
                        category_name=request.category_name,
                        images=images,
                        price=price if price > 0 else 1,  # Default price
                        old_price=old_price if old_price > 0 else None,
                        weight=weight if weight > 0 else None,
                        dimensions={'length': length, 'width': width, 'height': height, 'weight': weight} if any([length, width, height]) else None,
                        created_at=now,
                        updated_at=now,
                    )
                    
                    storage.add_card(card)
                    existing_by_article[article.lower()] = card  # Add to cache
                    
                    results.append(ImportResultRow(
                        row_number=row_num,
                        article=article,
                        name=name,
                        status="created",
                        message="Товар создан",
                        card_id=card.id
                    ))
                    created += 1
            
            except Exception as e:
                logger.error(f"Error importing row {row_num}: {e}")
                results.append(ImportResultRow(
                    row_number=row_num,
                    article=article if 'article' in dir() else "",
                    name=name if 'name' in dir() else "",
                    status="error",
                    message=str(e)
                ))
                errors += 1
        
        # Clean up import file
        try:
            file_path.unlink()
        except:
            pass
        
        return ImportResponse(
            total=len(rows),
            created=created,
            updated=updated,
            skipped=skipped,
            errors=errors,
            results=results
        )
    
    except Exception as e:
        logger.error(f"Import error: {e}")
        raise HTTPException(500, f"Ошибка импорта: {str(e)}")


@router.post("/execute-stream")
async def execute_import_stream(request: ImportRequest):
    """
    Execute product import with SSE progress streaming.
    Returns Server-Sent Events with progress updates.
    """
    async def generate():
        file_path = Path(request.file_path) if request.file_path else None
        
        # Find the import file
        if not file_path or not file_path.exists():
            import_files = list(UPLOADS_DIR.glob("import_*.xlsx"))
            if not import_files:
                yield f"data: {json.dumps({'error': 'Файл импорта не найден'})}\n\n"
                return
            file_path = max(import_files, key=lambda p: p.stat().st_mtime)
        
        try:
            # Parse Excel
            data = parse_excel_products(str(file_path))
            columns = data['columns']
            rows = data['rows']
            
            mapping = request.mapping
            
            # Get existing cards by article
            existing_cards = storage.get_all_cards()
            existing_by_article = {c.article.lower(): c for c in existing_cards}
            
            # Prepare photo directory
            photos_dir = UPLOADS_DIR / "imported_photos"
            photos_dir.mkdir(exist_ok=True)
            
            results = []
            created = 0
            updated = 0
            skipped = 0
            errors = 0
            
            # Filter rows by selection if provided
            selected_set = set(request.selected_rows) if request.selected_rows else None
            rows_to_process = [r for r in rows if selected_set is None or r['row_number'] in selected_set]
            total_rows = len(rows_to_process)
            
            yield f"data: {json.dumps({'type': 'start', 'total': total_rows})}\n\n"
            
            for idx, row in enumerate(rows_to_process):
                row_values = row['values']
                row_num = row['row_number']
                
                # Send progress every row
                progress = int((idx / total_rows) * 100) if total_rows > 0 else 0
                yield f"data: {json.dumps({'type': 'progress', 'current': idx, 'total': total_rows, 'percent': progress})}\n\n"
                
                try:
                    # Extract fields using mapping
                    article = get_cell_value(row_values, columns, mapping.article)
                    name = get_cell_value(row_values, columns, mapping.name)
                    brand = get_cell_value(row_values, columns, mapping.brand)
                    description = get_cell_value(row_values, columns, mapping.description)
                    price_str = get_cell_value(row_values, columns, mapping.price)
                    old_price_str = get_cell_value(row_values, columns, mapping.old_price)
                    barcode = get_cell_value(row_values, columns, mapping.barcode)
                    photos_str = get_cell_value(row_values, columns, mapping.photos)
                    length_str = get_cell_value(row_values, columns, mapping.length)
                    width_str = get_cell_value(row_values, columns, mapping.width)
                    height_str = get_cell_value(row_values, columns, mapping.height)
                    weight_str = get_cell_value(row_values, columns, mapping.weight)
                    
                    # Validate required fields
                    if not article:
                        results.append(ImportResultRow(
                            row_number=row_num, article="", name=name,
                            status="error", message="Отсутствует артикул"
                        ))
                        errors += 1
                        continue
                    
                    if not name:
                        results.append(ImportResultRow(
                            row_number=row_num, article=article, name="",
                            status="error", message="Отсутствует наименование"
                        ))
                        errors += 1
                        continue
                    
                    # Parse values
                    price = parse_price(price_str)
                    old_price = parse_price(old_price_str)
                    photos_urls = parse_photos(photos_str)
                    
                    # Parse dimensions
                    length = int(float(length_str)) if length_str else 0
                    width = int(float(width_str)) if width_str else 0
                    height = int(float(height_str)) if height_str else 0
                    weight = int(float(weight_str)) if weight_str else 0
                    
                    # Download photos if enabled (batch download)
                    images = []
                    if request.download_photos and photos_urls:
                        article_photos_dir = photos_dir / article.replace('/', '_').replace('\\', '_')
                        article_photos_dir.mkdir(exist_ok=True)
                        images = await download_photos_batch(photos_urls, article_photos_dir, max_concurrent=5)
                    
                    # Check if exists
                    existing = existing_by_article.get(article.lower())
                    
                    if existing:
                        if not request.update_existing:
                            results.append(ImportResultRow(
                                row_number=row_num, article=article, name=name,
                                status="skipped", message="Товар уже существует", card_id=existing.id
                            ))
                            skipped += 1
                            continue
                        
                        # Update existing card
                        update_data = {
                            'name': name, 'description': description,
                            'brand': brand, 'barcode': barcode,
                        }
                        
                        if price > 0:
                            update_data['price'] = price
                        if old_price > 0:
                            update_data['old_price'] = old_price
                        if images:
                            update_data['images'] = (existing.images or []) + images
                        if length or width or height:
                            update_data['dimensions'] = {
                                'length': length or (existing.dimensions.length if existing.dimensions else 0),
                                'width': width or (existing.dimensions.width if existing.dimensions else 0),
                                'height': height or (existing.dimensions.height if existing.dimensions else 0),
                                'weight': weight or (existing.dimensions.weight if existing.dimensions else 0),
                            }
                        if weight:
                            update_data['weight'] = weight
                        
                        storage.update_card(existing.id, update_data)
                        
                        results.append(ImportResultRow(
                            row_number=row_num, article=article, name=name,
                            status="updated", message="Товар обновлен", card_id=existing.id
                        ))
                        updated += 1
                    
                    else:
                        # Create new card
                        now = datetime.utcnow().isoformat()
                        
                        marketplace_type = MarketplaceType.WILDBERRIES
                        if request.marketplace.lower() == 'ozon':
                            marketplace_type = MarketplaceType.OZON
                        
                        card = MarketplaceCard(
                            id=str(uuid.uuid4()),
                            marketplace=marketplace_type,
                            status=CardStatus.DRAFT,
                            name=name, description=description, brand=brand,
                            article=article, barcode=barcode,
                            category_id=request.category_id,
                            category_name=request.category_name,
                            images=images,
                            price=price if price > 0 else 1,
                            old_price=old_price if old_price > 0 else None,
                            weight=weight if weight > 0 else None,
                            dimensions={'length': length, 'width': width, 'height': height, 'weight': weight} if any([length, width, height]) else None,
                            created_at=now, updated_at=now,
                        )
                        
                        storage.add_card(card)
                        existing_by_article[article.lower()] = card
                        
                        results.append(ImportResultRow(
                            row_number=row_num, article=article, name=name,
                            status="created", message="Товар создан", card_id=card.id
                        ))
                        created += 1
                
                except Exception as e:
                    logger.error(f"Error importing row {row_num}: {e}")
                    results.append(ImportResultRow(
                        row_number=row_num,
                        article=article if 'article' in dir() else "",
                        name=name if 'name' in dir() else "",
                        status="error", message=str(e)
                    ))
                    errors += 1
                
                # Small delay to allow SSE to flush
                await asyncio.sleep(0.01)
            
            # Clean up import file
            try:
                file_path.unlink()
            except:
                pass
            
            # Send final result
            final_result = {
                'type': 'complete',
                'total': len(rows),
                'created': created,
                'updated': updated,
                'skipped': skipped,
                'errors': errors,
                'results': [r.model_dump() for r in results]
            }
            yield f"data: {json.dumps(final_result)}\n\n"
        
        except Exception as e:
            logger.error(f"Import stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/template")
async def download_template():
    """
    Download Excel template for product import.
    """
    from fastapi.responses import FileResponse
    
    template_path = UPLOADS_DIR / "import_template.xlsx"
    
    # Create template if not exists
    if not template_path.exists():
        await create_import_template(template_path)
    
    return FileResponse(
        template_path,
        filename="import_template.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


async def create_import_template(path: Path):
    """Create Excel template for import"""
    import zipfile
    import xml.etree.ElementTree as ET
    from io import BytesIO
    
    # Simple xlsx creation
    # For production, use openpyxl or xlsxwriter
    
    # Create minimal xlsx structure
    xlsx = BytesIO()
    
    with zipfile.ZipFile(xlsx, 'w', zipfile.ZIP_DEFLATED) as zf:
        # [Content_Types].xml
        content_types = '''<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
    <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
    <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>'''
        zf.writestr('[Content_Types].xml', content_types)
        
        # _rels/.rels
        rels = '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>'''
        zf.writestr('_rels/.rels', rels)
        
        # xl/_rels/workbook.xml.rels
        wb_rels = '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
    <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>'''
        zf.writestr('xl/_rels/workbook.xml.rels', wb_rels)
        
        # xl/workbook.xml
        workbook = '''<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <sheets>
        <sheet name="Товары" sheetId="1" r:id="rId1"/>
    </sheets>
</workbook>'''
        zf.writestr('xl/workbook.xml', workbook)
        
        # Shared strings
        strings = [
            "Основная информация", "", "", "", "", "", "Медиа", "Габариты", "", "", "",
            "Артикул продавца", "Наименование", "Бренд", "Описание", "Цена", "Цена до скидки", "Фото", "Длина упаковки", "Ширина упаковки", "Высота упаковки", "Вес",
            "Уникальный код товара", "Название товара", "Название бренда", "Подробное описание", "Цена в рублях", "Старая цена для скидки", "Ссылки на фото через ;", "мм", "мм", "мм", "граммы",
            "SKU-001", "Коврик для ванной синий", "MyBrand", "Мягкий коврик для ванной комнаты", "1990", "2490", "https://example.com/photo1.jpg;https://example.com/photo2.jpg", "500", "400", "10", "300"
        ]
        
        shared_strings = '<?xml version="1.0" encoding="UTF-8"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{}" uniqueCount="{}">'.format(len(strings), len(strings))
        for s in strings:
            shared_strings += f'<si><t>{s}</t></si>'
        shared_strings += '</sst>'
        zf.writestr('xl/sharedStrings.xml', shared_strings)
        
        # xl/worksheets/sheet1.xml
        sheet = '''<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
    <sheetData>
        <row r="1">
            <c r="A1" t="s"><v>0</v></c>
            <c r="G1" t="s"><v>6</v></c>
            <c r="H1" t="s"><v>7</v></c>
        </row>
        <row r="2">
            <c r="A2" t="s"><v>11</v></c>
            <c r="B2" t="s"><v>12</v></c>
            <c r="C2" t="s"><v>13</v></c>
            <c r="D2" t="s"><v>14</v></c>
            <c r="E2" t="s"><v>15</v></c>
            <c r="F2" t="s"><v>16</v></c>
            <c r="G2" t="s"><v>17</v></c>
            <c r="H2" t="s"><v>18</v></c>
            <c r="I2" t="s"><v>19</v></c>
            <c r="J2" t="s"><v>20</v></c>
            <c r="K2" t="s"><v>21</v></c>
        </row>
        <row r="3">
            <c r="A3" t="s"><v>22</v></c>
            <c r="B3" t="s"><v>23</v></c>
            <c r="C3" t="s"><v>24</v></c>
            <c r="D3" t="s"><v>25</v></c>
            <c r="E3" t="s"><v>26</v></c>
            <c r="F3" t="s"><v>27</v></c>
            <c r="G3" t="s"><v>28</v></c>
            <c r="H3" t="s"><v>29</v></c>
            <c r="I3" t="s"><v>30</v></c>
            <c r="J3" t="s"><v>31</v></c>
            <c r="K3" t="s"><v>32</v></c>
        </row>
        <row r="4">
            <c r="A4" t="s"><v>33</v></c>
            <c r="B4" t="s"><v>34</v></c>
            <c r="C4" t="s"><v>35</v></c>
            <c r="D4" t="s"><v>36</v></c>
            <c r="E4" t="s"><v>37</v></c>
            <c r="F4" t="s"><v>38</v></c>
            <c r="G4" t="s"><v>39</v></c>
            <c r="H4" t="s"><v>40</v></c>
            <c r="I4" t="s"><v>41</v></c>
            <c r="J4" t="s"><v>42</v></c>
            <c r="K4" t="s"><v>43</v></c>
        </row>
    </sheetData>
</worksheet>'''
        zf.writestr('xl/worksheets/sheet1.xml', sheet)
    
    # Write to file
    path.write_bytes(xlsx.getvalue())


@router.delete("/cleanup")
async def cleanup_import_files():
    """Clean up temporary import files"""
    import_files = list(UPLOADS_DIR.glob("import_*.xlsx"))
    deleted = 0
    
    for f in import_files:
        try:
            f.unlink()
            deleted += 1
        except:
            pass
    
    return {"deleted": deleted}
