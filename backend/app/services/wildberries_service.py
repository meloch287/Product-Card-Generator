"""
Wildberries API Service
Documentation: https://openapi.wildberries.ru/
"""
import httpx
import base64
from typing import Optional, List, Dict, Any
from pathlib import Path


class WildberriesService:
    """Service for Wildberries Content API integration."""
    
    CONTENT_API_URL = "https://content-api.wildberries.ru"
    PRICES_API_URL = "https://discounts-prices-api.wildberries.ru"
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {
            "Authorization": api_key,
            "Content-Type": "application/json"
        }
    
    async def _request(self, method: str, url: str, **kwargs) -> Dict[str, Any]:
        """Make HTTP request with error handling."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method, 
                url, 
                headers=self.headers,
                **kwargs
            )
            
            if response.status_code == 401:
                raise WildberriesAPIError("Неверный API ключ", 401)
            elif response.status_code == 429:
                raise WildberriesAPIError("Превышен лимит запросов", 429)
            elif response.status_code >= 400:
                error_text = response.text
                raise WildberriesAPIError(f"Ошибка API: {error_text}", response.status_code)
            
            return response.json() if response.text else {}
    
    async def test_connection(self) -> bool:
        """Test API connection with credentials."""
        try:
            await self.get_categories()
            return True
        except Exception:
            return False
    
    # ==================== Categories ====================
    
    async def get_categories(self) -> List[Dict[str, Any]]:
        """Get all parent categories (subjects)."""
        url = f"{self.CONTENT_API_URL}/content/v2/object/parent/all"
        result = await self._request("GET", url)
        return result.get("data", [])
    
    async def get_subject_characteristics(self, subject_id: int) -> List[Dict[str, Any]]:
        """Get characteristics for a specific category."""
        url = f"{self.CONTENT_API_URL}/content/v2/object/charcs/{subject_id}"
        result = await self._request("GET", url)
        return result.get("data", [])
    
    async def search_categories(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Search categories by name."""
        url = f"{self.CONTENT_API_URL}/content/v2/object/all"
        params = {"name": query, "limit": limit}
        result = await self._request("GET", url, params=params)
        return result.get("data", [])
    
    # ==================== Cards ====================
    
    async def create_card(self, card_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new product card.
        
        card_data format:
        {
            "subjectID": 105,  # Category ID
            "variants": [{
                "vendorCode": "ART-123",
                "title": "Product name",
                "description": "Description",
                "brand": "Brand",
                "dimensions": {"length": 10, "width": 10, "height": 5},
                "characteristics": [{"id": 1, "value": "Value"}],
                "sizes": [{
                    "techSize": "42",
                    "wbSize": "M", 
                    "price": 1990,
                    "skus": ["4600000000001"]
                }]
            }]
        }
        """
        url = f"{self.CONTENT_API_URL}/content/v2/cards/upload"
        result = await self._request("POST", url, json={"cards": [card_data]})
        return result
    
    async def update_card(self, card_data: Dict[str, Any]) -> Dict[str, Any]:
        """Update existing product card."""
        url = f"{self.CONTENT_API_URL}/content/v2/cards/update"
        result = await self._request("POST", url, json={"cards": [card_data]})
        return result
    
    async def get_cards(
        self, 
        limit: int = 100, 
        cursor: Optional[Dict] = None,
        filter_nm_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Get list of cards with pagination."""
        url = f"{self.CONTENT_API_URL}/content/v2/get/cards/list"
        
        body = {
            "settings": {
                "cursor": cursor or {"limit": limit},
                "filter": {"withPhoto": -1}
            }
        }
        
        if filter_nm_id:
            body["settings"]["filter"]["nmID"] = filter_nm_id
        
        result = await self._request("POST", url, json=body)
        return result
    
    async def get_card_by_vendor_code(self, vendor_code: str) -> Optional[Dict[str, Any]]:
        """Get card by vendor code (article)."""
        url = f"{self.CONTENT_API_URL}/content/v2/get/cards/list"
        body = {
            "settings": {
                "cursor": {"limit": 1},
                "filter": {"textSearch": vendor_code, "withPhoto": -1}
            }
        }
        result = await self._request("POST", url, json=body)
        cards = result.get("cards", [])
        return cards[0] if cards else None
    
    async def delete_card(self, nm_ids: List[int]) -> Dict[str, Any]:
        """Delete cards by nmID."""
        url = f"{self.CONTENT_API_URL}/content/v2/cards/delete/trash"
        result = await self._request("POST", url, json={"nmIDs": nm_ids})
        return result
    
    # ==================== Media ====================
    
    async def upload_photos(
        self, 
        vendor_code: str, 
        photos: List[str]
    ) -> Dict[str, Any]:
        """
        Upload photos for a product.
        
        Args:
            vendor_code: Product article
            photos: List of base64 encoded images (without data:image prefix)
        """
        url = f"{self.CONTENT_API_URL}/content/v2/media/save"
        
        # Clean base64 strings
        clean_photos = []
        for photo in photos:
            if "base64," in photo:
                photo = photo.split("base64,")[1]
            clean_photos.append(photo)
        
        body = {
            "vendorCode": vendor_code,
            "data": clean_photos
        }
        
        result = await self._request("POST", url, json=body)
        return result
    
    async def upload_photo_from_file(
        self, 
        vendor_code: str, 
        file_path: Path
    ) -> Dict[str, Any]:
        """Upload photo from file path."""
        with open(file_path, "rb") as f:
            photo_base64 = base64.b64encode(f.read()).decode()
        return await self.upload_photos(vendor_code, [photo_base64])
    
    # ==================== Prices ====================
    
    async def set_prices(self, prices: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Set prices for products.
        
        prices format:
        [{"nmID": 123456, "price": 1990, "discount": 10}]
        """
        url = f"{self.PRICES_API_URL}/api/v2/upload/task"
        result = await self._request("POST", url, json={"data": prices})
        return result
    
    # ==================== Errors ====================
    
    async def get_error_list(self) -> List[Dict[str, Any]]:
        """Get list of card creation/update errors."""
        url = f"{self.CONTENT_API_URL}/content/v2/cards/error/list"
        result = await self._request("GET", url)
        return result.get("data", [])


class WildberriesAPIError(Exception):
    """Wildberries API Error."""
    def __init__(self, message: str, status_code: int = 0):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)
