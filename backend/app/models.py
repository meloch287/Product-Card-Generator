from pydantic import BaseModel, Field
from typing import List, Optional, Tuple
from enum import Enum


class Point(BaseModel):
    x: int
    y: int


class PointSet(BaseModel):
    """A set of 4 points defining an image insertion area."""
    index: int
    points: List[Point]  # Always 4 points: TL, TR, BR, BL


class TemplateCreate(BaseModel):
    name: str
    points: List[Point] = Field(default_factory=lambda: [
        Point(x=100, y=100), Point(x=400, y=100),
        Point(x=400, y=400), Point(x=100, y=400)
    ])
    corner_radius: int = 0
    blend_strength: float = 0.25
    change_background_color: bool = True
    add_product: bool = True


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    points: Optional[List[Point]] = None  # For backward compatibility
    point_sets: Optional[List[PointSet]] = None  # All point sets for multi-mode
    is_multi_mode: Optional[bool] = None  # Flag indicating multi-photo insertion mode
    corner_radius: Optional[int] = None
    blend_strength: Optional[float] = None
    change_background_color: Optional[bool] = None
    add_product: Optional[bool] = None


class Template(BaseModel):
    id: str
    name: str
    path: str
    thumbnail_url: str
    points: List[Point]  # For backward compatibility (first point set)
    point_sets: List[PointSet] = Field(default_factory=list)  # All point sets for multi-mode
    is_multi_mode: bool = False  # Flag indicating multi-photo insertion mode
    saved_points: Optional[List[Point]] = None  # Saved points for auto-detect restore
    corner_radius: int = 0
    blend_strength: float = 0.25
    change_background_color: bool = True
    add_product: bool = True
    original_width: int = 0
    original_height: int = 0


class PrintFolder(BaseModel):
    id: str
    path: str
    name: str
    file_count: int


class GenerationRequest(BaseModel):
    template_ids: List[str]
    folder_ids: List[str]


class GenerationStatus(BaseModel):
    is_running: bool = False
    current: int = 0
    total: int = 0
    errors: List[dict] = Field(default_factory=list)
    task_id: Optional[str] = None


class PreviewRequest(BaseModel):
    template_id: str
    print_file: Optional[str] = None


# ==================== Marketplace Cards ====================

class MarketplaceType(str, Enum):
    WILDBERRIES = "wildberries"
    OZON = "ozon"


class CardStatus(str, Enum):
    DRAFT = "draft"
    READY = "ready"
    PUBLISHED = "published"


class ProductDimensions(BaseModel):
    length: int  # мм
    width: int   # мм  
    height: int  # мм
    weight: int  # граммы


class CategoryCharacteristic(BaseModel):
    id: int
    name: str
    type: str  # text, number, select, multiselect, boolean, date
    required: bool
    values: Optional[List[str]] = None  # Для select/multiselect
    unit: Optional[str] = None  # Единица измерения
    min_value: Optional[float] = None
    max_value: Optional[float] = None


class MarketplaceCard(BaseModel):
    # Основная информация
    id: str
    marketplace: MarketplaceType
    status: CardStatus = CardStatus.DRAFT
    
    # Товарная информация
    name: str
    description: str = ""
    brand: str = ""
    article: str  # vendor_code для WB, offer_id для Ozon
    barcode: str = ""
    
    # Категория и характеристики
    category_id: str = ""
    category_name: str = ""
    category_path: List[str] = Field(default_factory=list)  # Путь в дереве категорий
    characteristics: dict = Field(default_factory=dict)  # Динамические характеристики
    
    # Медиа
    images: List[str] = Field(default_factory=list)  # Пути к файлам или URLs
    main_image_index: int = 0
    
    # Размеры и вес
    dimensions: Optional[ProductDimensions] = None
    weight: Optional[int] = None  # граммы
    
    # Ценообразование
    price: float
    old_price: Optional[float] = None
    discount: float = 0
    cost_price: Optional[float] = None  # себестоимость
    
    # Логистика (для Ozon)
    warehouse_id: Optional[str] = None
    stock_quantity: Optional[int] = None
    
    # Метаданные
    marketplace_id: Optional[str] = None  # ID на маркетплейсе после публикации
    moderation_status: Optional[str] = None
    created_at: str
    updated_at: str
    published_at: Optional[str] = None
    
    # Дополнительные данные
    seo_keywords: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    notes: str = ""
    
    # Совместимость со старой моделью
    data: dict = Field(default_factory=dict)  # Additional marketplace-specific data


class MarketplaceCardCreate(BaseModel):
    # Основная информация
    name: str
    description: str = ""
    marketplace: MarketplaceType
    brand: str = ""
    article: str
    barcode: str = ""
    
    # Категория и характеристики
    category_id: str = ""
    category_name: str = ""
    category_path: List[str] = Field(default_factory=list)
    characteristics: dict = Field(default_factory=dict)
    
    # Медиа
    images: List[str] = Field(default_factory=list)
    main_image_index: int = 0
    
    # Размеры и вес
    dimensions: Optional[ProductDimensions] = None
    weight: Optional[int] = None
    
    # Ценообразование
    price: float
    old_price: Optional[float] = None
    discount: float = 0
    cost_price: Optional[float] = None
    
    # Логистика (для Ozon)
    warehouse_id: Optional[str] = None
    stock_quantity: Optional[int] = None
    
    # Дополнительные данные
    seo_keywords: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    notes: str = ""


class MarketplaceCardUpdate(BaseModel):
    # Основная информация
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[CardStatus] = None
    brand: Optional[str] = None
    article: Optional[str] = None
    barcode: Optional[str] = None
    
    # Категория и характеристики
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    category_path: Optional[List[str]] = None
    characteristics: Optional[dict] = None
    
    # Медиа
    images: Optional[List[str]] = None
    main_image_index: Optional[int] = None
    
    # Размеры и вес
    dimensions: Optional[ProductDimensions] = None
    weight: Optional[int] = None
    
    # Ценообразование
    price: Optional[float] = None
    old_price: Optional[float] = None
    discount: Optional[float] = None
    cost_price: Optional[float] = None
    
    # Логистика (для Ozon)
    warehouse_id: Optional[str] = None
    stock_quantity: Optional[int] = None
    
    # Метаданные
    marketplace_id: Optional[str] = None
    moderation_status: Optional[str] = None
    published_at: Optional[str] = None
    
    # Дополнительные данные
    seo_keywords: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    data: Optional[dict] = None
