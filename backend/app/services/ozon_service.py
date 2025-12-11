"""
Ozon Seller API Service
Documentation: https://docs.ozon.ru/api/seller/
"""
import httpx
import base64
from typing import Optional, List, Dict, Any
from pathlib import Path


class OzonService:
    """Service for Ozon Seller API integration."""
    
    BASE_URL = "https://api-seller.ozon.ru"
    
    def __init__(self, client_id: str, api_key: str):
        self.client_id = client_id
        self.api_key = api_key
        self.headers = {
            "Client-Id": client_id,
            "Api-Key": api_key,
            "Content-Type": "application/json"
        }
    
    async def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make HTTP request with error handling."""
        url = f"{self.BASE_URL}{endpoint}"
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method,
                url,
                headers=self.headers,
                **kwargs
            )
            
            if response.status_code == 401:
                raise OzonAPIError("Неверные учетные данные", 401)
            elif response.status_code == 403:
                raise OzonAPIError("Доступ запрещен", 403)
            elif response.status_code == 429:
                raise OzonAPIError("Превышен лимит запросов", 429)
            elif response.status_code >= 400:
                try:
                    error_data = response.json()
                    message = error_data.get("message", response.text)
                except:
                    message = response.text
                raise OzonAPIError(f"Ошибка API: {message}", response.status_code)
            
            return response.json() if response.text else {}
    
    async def test_connection(self) -> bool:
        """Test API connection with credentials."""
        try:
            await self.get_seller_info()
            return True
        except Exception:
            return False
    
    async def get_seller_info(self) -> Dict[str, Any]:
        """Get seller information."""
        return await self._request("POST", "/v3/seller/info", json={})
    
    # ==================== Categories ====================
    
    async def get_category_tree(self) -> List[Dict[str, Any]]:
        """Get category tree."""
        result = await self._request("POST", "/v1/description-category/tree", json={})
        return result.get("result", [])
    
    async def get_category_attributes(
        self, 
        category_id: int,
        type_id: int = 0,
        language: str = "RU"
    ) -> List[Dict[str, Any]]:
        """Get attributes for a category."""
        body = {
            "description_category_id": category_id,
            "type_id": type_id,
            "language": language
        }
        result = await self._request("POST", "/v1/description-category/attribute", json=body)
        return result.get("result", [])
    
    async def get_attribute_values(
        self,
        category_id: int,
        attribute_id: int,
        limit: int = 100,
        last_value_id: int = 0
    ) -> List[Dict[str, Any]]:
        """Get possible values for an attribute."""
        body = {
            "description_category_id": category_id,
            "attribute_id": attribute_id,
            "limit": limit,
            "last_value_id": last_value_id,
            "language": "RU"
        }
        result = await self._request("POST", "/v1/description-category/attribute/values", json=body)
        return result.get("result", [])
    
    # ==================== Products ====================
    
    async def create_product(self, product_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create or update a product.
        
        product_data format:
        {
            "description_category_id": 17028922,
            "name": "Product name",
            "offer_id": "ART-123",
            "barcode": "4600000000001",
            "price": "1990",
            "old_price": "2490",
            "vat": "0.1",
            "dimension_unit": "mm",
            "depth": 100,
            "height": 200,
            "width": 150,
            "weight": 500,
            "weight_unit": "g",
            "images": ["https://example.com/photo.jpg"],
            "attributes": [
                {"id": 85, "values": [{"value": "Белый"}]}
            ]
        }
        """
        body = {"items": [product_data]}
        result = await self._request("POST", "/v3/product/import", json=body)
        return result
    
    async def get_import_status(self, task_id: int) -> Dict[str, Any]:
        """Get product import task status."""
        body = {"task_id": task_id}
        result = await self._request("POST", "/v1/product/import/info", json=body)
        return result
    
    async def get_products(
        self,
        offer_ids: Optional[List[str]] = None,
        product_ids: Optional[List[int]] = None,
        limit: int = 100,
        last_id: str = ""
    ) -> Dict[str, Any]:
        """Get list of products."""
        body = {
            "filter": {},
            "limit": limit,
            "last_id": last_id
        }
        
        if offer_ids:
            body["filter"]["offer_id"] = offer_ids
        if product_ids:
            body["filter"]["product_id"] = product_ids
        
        result = await self._request("POST", "/v2/product/list", json=body)
        return result
    
    async def get_product_info(self, offer_id: str) -> Optional[Dict[str, Any]]:
        """Get product info by offer_id."""
        body = {"offer_id": offer_id}
        result = await self._request("POST", "/v2/product/info", json=body)
        return result.get("result")
    
    async def get_product_info_list(self, offer_ids: List[str]) -> List[Dict[str, Any]]:
        """Get info for multiple products."""
        body = {"offer_id": offer_ids}
        result = await self._request("POST", "/v2/product/info/list", json=body)
        return result.get("result", {}).get("items", [])
    
    async def delete_products(self, offer_ids: List[str]) -> Dict[str, Any]:
        """Archive products by offer_id."""
        body = {"offer_id": offer_ids}
        result = await self._request("POST", "/v2/products/delete", json=body)
        return result
    
    # ==================== Images ====================
    
    async def upload_images_by_url(
        self,
        product_id: int,
        images: List[str]
    ) -> Dict[str, Any]:
        """
        Upload images by URL.
        
        Args:
            product_id: Ozon product ID
            images: List of image URLs
        """
        body = {
            "product_id": product_id,
            "images": images
        }
        result = await self._request("POST", "/v1/product/pictures/import", json=body)
        return result
    
    async def get_images_upload_status(self, product_ids: List[int]) -> Dict[str, Any]:
        """Get image upload status."""
        body = {"product_id": product_ids}
        result = await self._request("POST", "/v1/product/pictures/info", json=body)
        return result
    
    # ==================== Prices & Stocks ====================
    
    async def update_prices(self, prices: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Update product prices.
        
        prices format:
        [{"offer_id": "ART-123", "price": "1990", "old_price": "2490"}]
        """
        body = {"prices": prices}
        result = await self._request("POST", "/v1/product/import/prices", json=body)
        return result
    
    async def update_stocks(self, stocks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Update product stocks.
        
        stocks format:
        [{"offer_id": "ART-123", "stock": 100, "warehouse_id": 123}]
        """
        body = {"stocks": stocks}
        result = await self._request("POST", "/v2/products/stocks", json=body)
        return result
    
    # ==================== Warehouses ====================
    
    async def get_warehouses(self) -> List[Dict[str, Any]]:
        """Get list of warehouses."""
        result = await self._request("POST", "/v1/warehouse/list", json={})
        return result.get("result", [])


class OzonAPIError(Exception):
    """Ozon API Error."""
    def __init__(self, message: str, status_code: int = 0):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)
