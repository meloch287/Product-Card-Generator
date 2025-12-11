"""
API routes for category templates management
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from typing import List, Optional
import os
import tempfile
import shutil

from ..category_parser import (
    parse_excel_template,
    load_templates,
    add_template,
    delete_template,
    get_template,
    CategoryTemplate,
    download_google_sheet,
    extract_google_sheet_id
)

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("/templates", response_model=List[dict])
async def get_templates():
    """Get all saved category templates"""
    templates = load_templates()
    return [t.model_dump() for t in templates]


@router.get("/templates/{template_id}")
async def get_template_by_id(template_id: str):
    """Get a specific category template"""
    template = get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template.model_dump()


@router.delete("/templates/{template_id}")
async def delete_template_by_id(template_id: str):
    """Delete a category template"""
    delete_template(template_id)
    return {"success": True}


@router.post("/parse-excel")
async def parse_excel(file: UploadFile = File(...)):
    """Parse Excel file and extract characteristics"""
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported")
    
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    
    try:
        result = parse_excel_template(tmp_path)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing file: {str(e)}")
    finally:
        os.unlink(tmp_path)


@router.post("/templates")
async def create_template(
    name: str = Form(...),
    marketplace: str = Form(...),
    file: UploadFile = File(...)
):
    """Create a new category template from Excel file"""
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported")
    
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    
    try:
        result = parse_excel_template(tmp_path)
        template = add_template(name, marketplace, result['characteristics'])
        return template.model_dump()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error creating template: {str(e)}")
    finally:
        os.unlink(tmp_path)


@router.post("/templates/manual")
async def create_template_manual(data: dict):
    """Create a category template manually (without Excel)"""
    name = data.get('name')
    marketplace = data.get('marketplace', 'wildberries')
    characteristics = data.get('characteristics', [])
    
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    
    template = add_template(name, marketplace, characteristics)
    return template.model_dump()


@router.post("/templates/google-sheets")
async def create_template_from_google_sheets(data: dict):
    """Create a category template from Google Sheets URL"""
    url = data.get('url')
    name = data.get('name')
    marketplace = data.get('marketplace', 'wildberries')
    
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    
    # Validate URL
    sheet_id = extract_google_sheet_id(url)
    if not sheet_id:
        raise HTTPException(status_code=400, detail="Неверная ссылка на Google Sheets")
    
    try:
        # Download and parse
        tmp_path = await download_google_sheet(url)
        try:
            result = parse_excel_template(tmp_path)
            template = add_template(name, marketplace, result['characteristics'])
            return template.model_dump()
        finally:
            os.unlink(tmp_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка загрузки: {str(e)}")
