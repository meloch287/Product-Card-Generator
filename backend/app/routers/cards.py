"""Cards API router for marketplace cards management."""
import json
import uuid
from datetime import datetime
from typing import List, Optional, AsyncGenerator
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.app.models import (
    MarketplaceCard, 
    MarketplaceCardCreate, 
    MarketplaceCardUpdate,
    MarketplaceType,
    CardStatus
)
from backend.app.storage import storage

router = APIRouter(prefix="/api/cards", tags=["cards"])


@router.get("", response_model=List[MarketplaceCard])
async def get_cards(
    marketplace: Optional[str] = None,
    status: Optional[str] = None
):
    """Get all marketplace cards with optional filtering."""
    cards = storage.get_all_cards()
    
    if marketplace:
        cards = [c for c in cards if c.marketplace == marketplace]
    if status:
        cards = [c for c in cards if c.status == status]
    
    return cards


async def generate_ndjson_stream(
    cards: List[MarketplaceCard],
    marketplace: Optional[str] = None,
    status: Optional[str] = None
) -> AsyncGenerator[str, None]:
    """Generate NDJSON stream for cards.
    
    Format:
    - First line: {"type":"meta","total":<count>}
    - Card lines: {"type":"card","data":{...}}
    - Last line: {"type":"done"}
    
    Requirements: 1.2, 1.4
    """
    # Apply filters
    filtered_cards = cards
    if marketplace:
        filtered_cards = [c for c in filtered_cards if c.marketplace == marketplace]
    if status:
        filtered_cards = [c for c in filtered_cards if c.status == status]
    
    # Meta line with total count
    yield json.dumps({"type": "meta", "total": len(filtered_cards)}) + "\n"
    
    # Stream each card
    for card in filtered_cards:
        card_dict = card.model_dump() if hasattr(card, 'model_dump') else card.dict()
        yield json.dumps({"type": "card", "data": card_dict}) + "\n"
    
    # Done line
    yield json.dumps({"type": "done"}) + "\n"


@router.get("/stream")
async def get_cards_stream(
    marketplace: Optional[str] = None,
    status: Optional[str] = None
):
    """Stream all marketplace cards as NDJSON.
    
    Returns a streaming response with NDJSON format:
    - Line 1: {"type":"meta","total":<count>}
    - Lines 2-N: {"type":"card","data":{...}}
    - Last line: {"type":"done"}
    
    This enables chunked loading on the frontend for faster initial display.
    Requirements: 1.2, 1.4
    """
    cards = storage.get_all_cards()
    
    return StreamingResponse(
        generate_ndjson_stream(cards, marketplace, status),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff"
        }
    )


@router.post("", response_model=MarketplaceCard)
async def create_card(card_data: MarketplaceCardCreate):
    """Create a new marketplace card."""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Creating card with data: {card_data.model_dump()}")
    
    # Validate name
    if not card_data.name or not card_data.name.strip():
        raise HTTPException(400, "Название карточки обязательно")
    
    # Validate article
    if not card_data.article or not card_data.article.strip():
        raise HTTPException(400, "Артикул обязателен")
    
    # Validate price
    if card_data.price <= 0:
        raise HTTPException(400, "Цена должна быть больше 0")
    
    now = datetime.utcnow().isoformat()
    
    card = MarketplaceCard(
        id=str(uuid.uuid4()),
        name=card_data.name.strip(),
        description=card_data.description,
        marketplace=card_data.marketplace,
        status=CardStatus.DRAFT,
        brand=card_data.brand,
        article=card_data.article.strip(),
        barcode=card_data.barcode,
        price=card_data.price,
        discount=card_data.discount,
        category_id=card_data.category_id,
        category_name=card_data.category_name,
        images=card_data.images,
        created_at=now,
        updated_at=now,
    )
    
    return storage.add_card(card)


@router.get("/{card_id}", response_model=MarketplaceCard)
async def get_card(card_id: str):
    """Get a specific card by ID."""
    card = storage.get_card(card_id)
    if not card:
        raise HTTPException(404, "Карточка не найдена")
    return card


@router.put("/{card_id}", response_model=MarketplaceCard)
async def update_card(card_id: str, updates: MarketplaceCardUpdate):
    """Update a marketplace card."""
    card = storage.get_card(card_id)
    if not card:
        raise HTTPException(404, "Карточка не найдена")
    
    update_data = updates.model_dump(exclude_unset=True)
    
    # Validate price if provided
    if 'price' in update_data and update_data['price'] <= 0:
        raise HTTPException(400, "Цена должна быть больше 0")
    
    updated = storage.update_card(card_id, update_data)
    return updated


@router.delete("/{card_id}")
async def delete_card(card_id: str):
    """Delete a card by ID."""
    card = storage.get_card(card_id)
    if not card:
        raise HTTPException(404, "Карточка не найдена")
    
    storage.delete_card(card_id)
    return {"status": "deleted"}


@router.post("/batch-delete")
async def batch_delete_cards(ids: List[str]):
    """Delete multiple cards at once.
    
    More efficient than multiple individual DELETE requests.
    Returns count of successfully deleted cards.
    """
    deleted = 0
    not_found = []
    
    for card_id in ids:
        card = storage.get_card(card_id)
        if card:
            storage.delete_card(card_id)
            deleted += 1
        else:
            not_found.append(card_id)
    
    return {
        "status": "ok",
        "deleted": deleted,
        "not_found": len(not_found)
    }


@router.post("/{card_id}/images")
async def add_card_images(card_id: str, images: List[str]):
    """Add images to a card."""
    card = storage.get_card(card_id)
    if not card:
        raise HTTPException(404, "Карточка не найдена")
    
    current_images = card.images or []
    updated_images = current_images + images
    
    storage.update_card(card_id, {"images": updated_images})
    return {"status": "ok", "images_count": len(updated_images)}


@router.delete("/{card_id}/images/{image_index}")
async def remove_card_image(card_id: str, image_index: int):
    """Remove an image from a card by index."""
    card = storage.get_card(card_id)
    if not card:
        raise HTTPException(404, "Карточка не найдена")
    
    if image_index < 0 or image_index >= len(card.images):
        raise HTTPException(400, "Неверный индекс изображения")
    
    updated_images = card.images.copy()
    updated_images.pop(image_index)
    
    storage.update_card(card_id, {"images": updated_images})
    return {"status": "ok", "images_count": len(updated_images)}
