"""
Marketplace API Router
Handles Wildberries and Ozon integrations
"""
from typing import Optional, List, Dict, Any, Literal
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel

from backend.app.storage import storage
from backend.app.services.wildberries_service import WildberriesService, WildberriesAPIError
from backend.app.services.ozon_service import OzonService, OzonAPIError

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])


# ==================== Models ====================

class MarketplaceSettings(BaseModel):
    wb_api_key: Optional[str] = None
    ozon_client_id: Optional[str] = None
    ozon_api_key: Optional[str] = None


class TestConnectionRequest(BaseModel):
    marketplace: Literal["wildberries", "ozon"]


class TestConnectionResponse(BaseModel):
    success: bool
    message: str


class CategorySearchRequest(BaseModel):
    query: str
    limit: int = 50


class PublishCardRequest(BaseModel):
    card_id: str
    # WB specific
    subject_id: Optional[int] = None
    # Ozon specific  
    category_id: Optional[int] = None
    # Common
    dimensions: Optional[Dict[str, int]] = None  # length, width, height in mm
    weight: Optional[int] = None  # in grams
    characteristics: Optional[List[Dict[str, Any]]] = None


# ==================== Settings ====================

@router.get("/settings", response_model=MarketplaceSettings)
async def get_settings():
    """Get marketplace API settings (keys are masked)."""
    settings = storage.get_marketplace_settings()
    # Mask API keys for security
    return MarketplaceSettings(
        wb_api_key="***" if settings.get("wb_api_key") else None,
        ozon_client_id="***" if settings.get("ozon_client_id") else None,
        ozon_api_key="***" if settings.get("ozon_api_key") else None,
    )


@router.post("/settings", response_model=MarketplaceSettings)
async def update_settings(settings: MarketplaceSettings):
    """Update marketplace API settings."""
    current = storage.get_marketplace_settings()
    
    # Only update non-empty values (don't overwrite with empty)
    update_data = {}
    if settings.wb_api_key and settings.wb_api_key != "***":
        update_data["wb_api_key"] = settings.wb_api_key
    if settings.ozon_client_id and settings.ozon_client_id != "***":
        update_data["ozon_client_id"] = settings.ozon_client_id
    if settings.ozon_api_key and settings.ozon_api_key != "***":
        update_data["ozon_api_key"] = settings.ozon_api_key
    
    if update_data:
        storage.update_marketplace_settings(update_data)
    
    return await get_settings()


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_connection(request: TestConnectionRequest):
    """Test connection to marketplace API."""
    settings = storage.get_marketplace_settings()
    
    if request.marketplace == "wildberries":
        api_key = settings.get("wb_api_key")
        if not api_key:
            return TestConnectionResponse(success=False, message="API ключ не настроен")
        
        try:
            service = WildberriesService(api_key)
            success = await service.test_connection()
            return TestConnectionResponse(
                success=success,
                message="Подключение успешно" if success else "Не удалось подключиться"
            )
        except WildberriesAPIError as e:
            return TestConnectionResponse(success=False, message=e.message)
        except Exception as e:
            return TestConnectionResponse(success=False, message=str(e))
    
    elif request.marketplace == "ozon":
        client_id = settings.get("ozon_client_id")
        api_key = settings.get("ozon_api_key")
        if not client_id or not api_key:
            return TestConnectionResponse(success=False, message="Учетные данные не настроены")
        
        try:
            service = OzonService(client_id, api_key)
            success = await service.test_connection()
            return TestConnectionResponse(
                success=success,
                message="Подключение успешно" if success else "Не удалось подключиться"
            )
        except OzonAPIError as e:
            return TestConnectionResponse(success=False, message=e.message)
        except Exception as e:
            return TestConnectionResponse(success=False, message=str(e))
    
    return TestConnectionResponse(success=False, message="Неизвестный маркетплейс")


# ==================== Wildberries ====================

@router.get("/wb/categories")
async def get_wb_categories():
    """Get Wildberries categories."""
    settings = storage.get_marketplace_settings()
    api_key = settings.get("wb_api_key")
    
    if not api_key:
        raise HTTPException(400, "API ключ Wildberries не настроен")
    
    try:
        service = WildberriesService(api_key)
        categories = await service.get_categories()
        return {"categories": categories}
    except WildberriesAPIError as e:
        raise HTTPException(e.status_code or 500, e.message)


@router.post("/wb/categories/search")
async def search_wb_categories(request: CategorySearchRequest):
    """Search Wildberries categories by name."""
    settings = storage.get_marketplace_settings()
    api_key = settings.get("wb_api_key")
    
    if not api_key:
        raise HTTPException(400, "API ключ Wildberries не настроен")
    
    try:
        service = WildberriesService(api_key)
        categories = await service.search_categories(request.query, request.limit)
        return {"categories": categories}
    except WildberriesAPIError as e:
        raise HTTPException(e.status_code or 500, e.message)


@router.get("/wb/categories/{subject_id}/characteristics")
async def get_wb_characteristics(subject_id: int):
    """Get characteristics for a Wildberries category."""
    settings = storage.get_marketplace_settings()
    api_key = settings.get("wb_api_key")
    
    if not api_key:
        raise HTTPException(400, "API ключ Wildberries не настроен")
    
    try:
        service = WildberriesService(api_key)
        characteristics = await service.get_subject_characteristics(subject_id)
        return {"characteristics": characteristics}
    except WildberriesAPIError as e:
        raise HTTPException(e.status_code or 500, e.message)


@router.get("/wb/errors")
async def get_wb_errors():
    """Get Wildberries card errors."""
    settings = storage.get_marketplace_settings()
    api_key = settings.get("wb_api_key")
    
    if not api_key:
        raise HTTPException(400, "API ключ Wildberries не настроен")
    
    try:
        service = WildberriesService(api_key)
        errors = await service.get_error_list()
        return {"errors": errors}
    except WildberriesAPIError as e:
        raise HTTPException(e.status_code or 500, e.message)


# ==================== Ozon ====================

@router.get("/ozon/categories")
async def get_ozon_categories():
    """Get Ozon category tree."""
    settings = storage.get_marketplace_settings()
    client_id = settings.get("ozon_client_id")
    api_key = settings.get("ozon_api_key")
    
    if not client_id or not api_key:
        raise HTTPException(400, "Учетные данные Ozon не настроены")
    
    try:
        service = OzonService(client_id, api_key)
        categories = await service.get_category_tree()
        return {"categories": categories}
    except OzonAPIError as e:
        raise HTTPException(e.status_code or 500, e.message)


@router.get("/ozon/categories/{category_id}/attributes")
async def get_ozon_attributes(category_id: int):
    """Get attributes for an Ozon category."""
    settings = storage.get_marketplace_settings()
    client_id = settings.get("ozon_client_id")
    api_key = settings.get("ozon_api_key")
    
    if not client_id or not api_key:
        raise HTTPException(400, "Учетные данные Ozon не настроены")
    
    try:
        service = OzonService(client_id, api_key)
        attributes = await service.get_category_attributes(category_id)
        return {"attributes": attributes}
    except OzonAPIError as e:
        raise HTTPException(e.status_code or 500, e.message)


@router.get("/ozon/warehouses")
async def get_ozon_warehouses():
    """Get Ozon warehouses."""
    settings = storage.get_marketplace_settings()
    client_id = settings.get("ozon_client_id")
    api_key = settings.get("ozon_api_key")
    
    if not client_id or not api_key:
        raise HTTPException(400, "Учетные данные Ozon не настроены")
    
    try:
        service = OzonService(client_id, api_key)
        warehouses = await service.get_warehouses()
        return {"warehouses": warehouses}
    except OzonAPIError as e:
        raise HTTPException(e.status_code or 500, e.message)


# ==================== Publish ====================

@router.post("/publish")
async def publish_card(request: PublishCardRequest):
    """Publish a card to marketplace."""
    card = storage.get_card(request.card_id)
    if not card:
        raise HTTPException(404, "Карточка не найдена")
    
    settings = storage.get_marketplace_settings()
    
    if card.marketplace == "wildberries":
        return await _publish_to_wildberries(card, request, settings)
    elif card.marketplace == "ozon":
        return await _publish_to_ozon(card, request, settings)
    else:
        raise HTTPException(400, "Неизвестный маркетплейс")


async def _publish_to_wildberries(card, request: PublishCardRequest, settings: dict):
    """Publish card to Wildberries."""
    api_key = settings.get("wb_api_key")
    if not api_key:
        raise HTTPException(400, "API ключ Wildberries не настроен")
    
    if not request.subject_id:
        raise HTTPException(400, "Не указана категория (subject_id)")
    
    service = WildberriesService(api_key)
    
    try:
        # Prepare card data
        card_data = {
            "subjectID": request.subject_id,
            "variants": [{
                "vendorCode": card.article,
                "title": card.name,
                "description": card.description or "",
                "brand": card.brand or "No Brand",
                "dimensions": request.dimensions or {"length": 100, "width": 100, "height": 50},
                "characteristics": request.characteristics or [],
                "sizes": [{
                    "techSize": "0",
                    "wbSize": "",
                    "price": int(card.price),
                    "skus": [card.barcode] if card.barcode else []
                }]
            }]
        }
        
        # Create card
        result = await service.create_card(card_data)
        
        # Upload photos if any
        if card.images:
            await service.upload_photos(card.article, card.images)
        
        # Update card status
        storage.update_card(card.id, {"status": "published"})
        
        return {
            "success": True,
            "message": "Карточка отправлена на модерацию",
            "result": result
        }
    
    except WildberriesAPIError as e:
        raise HTTPException(e.status_code or 500, e.message)


async def _publish_to_ozon(card, request: PublishCardRequest, settings: dict):
    """Publish card to Ozon."""
    client_id = settings.get("ozon_client_id")
    api_key = settings.get("ozon_api_key")
    
    if not client_id or not api_key:
        raise HTTPException(400, "Учетные данные Ozon не настроены")
    
    if not request.category_id:
        raise HTTPException(400, "Не указана категория (category_id)")
    
    service = OzonService(client_id, api_key)
    
    try:
        # Calculate old price for discount
        old_price = None
        if card.discount and card.discount > 0:
            old_price = str(int(card.price / (1 - card.discount / 100)))
        
        # Prepare product data
        product_data = {
            "description_category_id": request.category_id,
            "name": card.name,
            "offer_id": card.article,
            "barcode": card.barcode or "",
            "price": str(int(card.price)),
            "old_price": old_price or str(int(card.price)),
            "vat": "0",
            "dimension_unit": "mm",
            "depth": request.dimensions.get("length", 100) if request.dimensions else 100,
            "height": request.dimensions.get("height", 50) if request.dimensions else 50,
            "width": request.dimensions.get("width", 100) if request.dimensions else 100,
            "weight": request.weight or 500,
            "weight_unit": "g",
            "images": card.images if card.images else [],
            "attributes": request.characteristics or []
        }
        
        # Create product
        result = await service.create_product(product_data)
        
        # Update card status
        storage.update_card(card.id, {"status": "published"})
        
        return {
            "success": True,
            "message": "Товар отправлен на модерацию",
            "result": result
        }
    
    except OzonAPIError as e:
        raise HTTPException(e.status_code or 500, e.message)
