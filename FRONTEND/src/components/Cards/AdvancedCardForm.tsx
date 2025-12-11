import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { CategorySelector } from './CategorySelector';
import { CharacteristicsForm } from './CharacteristicsForm';
import { ImageSelector } from './ImageSelector';
import { CategoryManager } from './CategoryManager';
import { cardsApi, type MarketplaceCard, type Marketplace, type CardStatus } from '@/api/client';
import { toast } from 'sonner';
import { 
  Package, 
  Image as ImageIcon, 
  Ruler, 
  DollarSign, 
  Tag,
  Loader2, 
  FolderOpen,
  FileSpreadsheet,
  X
} from 'lucide-react';

interface AdvancedCardFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card?: MarketplaceCard | null;
  onSaved?: () => void;
}

interface Category {
  id: string;
  name: string;
  path: string[];
}

const INITIAL_FORM = {
  // Основная информация
  name: '',
  description: '',
  marketplace: 'wildberries' as Marketplace,
  status: 'draft' as CardStatus,
  brand: '',
  article: '',
  barcode: '',
  
  // Категория и характеристики
  category_id: '',
  category_name: '',
  category_path: [] as string[],
  characteristics: {} as Record<string, any>,
  
  // Медиа
  images: [] as string[],
  main_image_index: 0,
  
  // Размеры и вес
  dimensions: {
    length: 0,
    width: 0,
    height: 0,
    weight: 0
  },
  weight: 0,
  
  // Ценообразование
  price: 0,
  old_price: 0,
  discount: 0,
  cost_price: 0,
  
  // Логистика (для Ozon)
  warehouse_id: '',
  stock_quantity: 0,
  
  // Дополнительные данные
  seo_keywords: [] as string[],
  tags: [] as string[],
  notes: ''
};

interface CategoryTemplate {
  id: string;
  name: string;
  marketplace: string;
  characteristics: any[];
}

export function AdvancedCardForm({ open, onOpenChange, card, onSaved }: AdvancedCardFormProps) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [isCategorySelectorOpen, setIsCategorySelectorOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [isImageSelectorOpen, setIsImageSelectorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [categoryTemplate, setCategoryTemplate] = useState<CategoryTemplate | null>(null);
  const isEditing = !!card;

  useEffect(() => {
    if (card) {
      setForm({
        name: card.name,
        description: card.description,
        marketplace: card.marketplace,
        status: card.status,
        brand: card.brand,
        article: card.article,
        barcode: card.barcode,
        category_id: card.category_id,
        category_name: card.category_name,
        category_path: card.category_path || [],
        characteristics: card.characteristics || {},
        images: card.images || [],
        main_image_index: card.main_image_index || 0,
        dimensions: card.dimensions || { length: 0, width: 0, height: 0, weight: 0 },
        weight: card.weight || 0,
        price: card.price,
        old_price: card.old_price || 0,
        discount: card.discount || 0,
        cost_price: card.cost_price || 0,
        warehouse_id: card.warehouse_id || '',
        stock_quantity: card.stock_quantity || 0,
        seo_keywords: card.seo_keywords || [],
        tags: card.tags || [],
        notes: card.notes || ''
      });
    } else {
      setForm(INITIAL_FORM);
    }
  }, [card, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!form.name.trim()) {
      toast.error('Введите название товара');
      setActiveTab('basic');
      return;
    }
    if (!form.article.trim()) {
      toast.error('Введите артикул');
      setActiveTab('basic');
      return;
    }
    if (form.price <= 0) {
      toast.error('Укажите цену');
      setActiveTab('pricing');
      return;
    }
    if (!form.category_id) {
      toast.error('Выберите категорию');
      setActiveTab('basic');
      return;
    }

    setLoading(true);
    try {
      const cardData = {
        name: form.name,
        description: form.description,
        marketplace: form.marketplace,
        brand: form.brand,
        article: form.article,
        barcode: form.barcode,
        category_id: form.category_id,
        category_name: form.category_name,
        category_path: form.category_path,
        characteristics: form.characteristics,
        images: form.images,
        main_image_index: form.main_image_index,
        dimensions: form.dimensions,
        weight: form.weight,
        price: form.price,
        old_price: form.old_price || undefined,
        discount: form.discount,
        cost_price: form.cost_price || undefined,
        warehouse_id: form.warehouse_id || undefined,
        stock_quantity: form.stock_quantity || undefined,
        seo_keywords: form.seo_keywords,
        tags: form.tags,
        notes: form.notes
      };

      if (isEditing && card) {
        await cardsApi.update(card.id, cardData);
        toast.success('Карточка обновлена');
      } else {
        await cardsApi.create(cardData);
        toast.success('Карточка создана');
      }
      
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Ошибка: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySelect = (category: Category) => {
    setForm(f => ({
      ...f,
      category_id: category.id,
      category_name: category.name,
      category_path: category.path,
      characteristics: {} // Reset characteristics when category changes
    }));
  };

  const handleCharacteristicsChange = (characteristics: Record<string, any>) => {
    setForm(f => ({ ...f, characteristics }));
  };

  const handleImagesSelect = (images: string[]) => {
    setForm(f => ({ ...f, images }));
  };

  const addKeyword = (keyword: string) => {
    if (keyword.trim() && !form.seo_keywords.includes(keyword.trim())) {
      setForm(f => ({ ...f, seo_keywords: [...f.seo_keywords, keyword.trim()] }));
    }
  };

  const removeKeyword = (index: number) => {
    setForm(f => ({ ...f, seo_keywords: f.seo_keywords.filter((_, i) => i !== index) }));
  };

  const addTag = (tag: string) => {
    if (tag.trim() && !form.tags.includes(tag.trim())) {
      setForm(f => ({ ...f, tags: [...f.tags, tag.trim()] }));
    }
  };

  const removeTag = (index: number) => {
    setForm(f => ({ ...f, tags: f.tags.filter((_, i) => i !== index) }));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {isEditing ? 'Редактирование карточки' : 'Создание карточки'}
              <Badge variant="outline">
                {form.marketplace === 'wildberries' ? 'Wildberries' : 'Ozon'}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="basic" className="flex items-center gap-1">
                  <Package className="h-4 w-4" />
                  Основное
                </TabsTrigger>
                <TabsTrigger value="media" className="flex items-center gap-1">
                  <ImageIcon className="h-4 w-4" />
                  Фото
                </TabsTrigger>
                <TabsTrigger value="dimensions" className="flex items-center gap-1">
                  <Ruler className="h-4 w-4" />
                  Размеры
                </TabsTrigger>
                <TabsTrigger value="pricing" className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />
                  Цены
                </TabsTrigger>
                <TabsTrigger value="additional" className="flex items-center gap-1">
                  <Tag className="h-4 w-4" />
                  Доп. данные
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto pr-2" style={{ maxHeight: 'calc(90vh - 200px)' }}>
                {/* Basic Information */}
                <TabsContent value="basic" className="space-y-6 mt-6 pb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Маркетплейс</Label>
                      <Select
                        value={form.marketplace}
                        onValueChange={(v) => setForm(f => ({ ...f, marketplace: v as Marketplace }))}
                        disabled={isEditing}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="wildberries">Wildberries</SelectItem>
                          <SelectItem value="ozon">Ozon</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Статус</Label>
                      <Select
                        value={form.status}
                        onValueChange={(v) => setForm(f => ({ ...f, status: v as CardStatus }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Черновик</SelectItem>
                          <SelectItem value="ready">Готова к публикации</SelectItem>
                          {form.status === 'published' && (
                            <SelectItem value="published">Опубликована</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name">Название товара *</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Например: Футболка мужская хлопок"
                      maxLength={form.marketplace === 'wildberries' ? 60 : 500}
                    />
                    <div className="text-xs text-muted-foreground">
                      {form.name.length} / {form.marketplace === 'wildberries' ? '60' : '500'} символов
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Описание</Label>
                    <Textarea
                      id="description"
                      value={form.description}
                      onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Подробное описание товара..."
                      rows={6}
                      maxLength={5000}
                    />
                    <div className="text-xs text-muted-foreground">
                      {form.description.length} / 5000 символов
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="brand">Бренд</Label>
                      <Input
                        id="brand"
                        value={form.brand}
                        onChange={(e) => setForm(f => ({ ...f, brand: e.target.value }))}
                        placeholder="Название бренда"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="article">Артикул *</Label>
                      <Input
                        id="article"
                        value={form.article}
                        onChange={(e) => setForm(f => ({ ...f, article: e.target.value }))}
                        placeholder="SKU-12345"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="barcode">Баркод</Label>
                    <Input
                      id="barcode"
                      value={form.barcode}
                      onChange={(e) => setForm(f => ({ ...f, barcode: e.target.value }))}
                      placeholder="4600000000000"
                    />
                  </div>

                  <Separator />

                  {/* Category Selection */}
                  <div className="space-y-3">
                    <Label>Категория *</Label>
                    {form.category_name ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                          <div className="flex-1">
                            <div className="font-medium text-sm">{form.category_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {form.category_path.join(' → ')}
                            </div>
                            {categoryTemplate && (
                              <Badge variant="secondary" className="mt-1 text-xs">
                                <FileSpreadsheet className="h-3 w-3 mr-1" />
                                Из Excel
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setIsCategorySelectorOpen(true)}
                            >
                              Изменить
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setIsCategoryManagerOpen(true)}
                            >
                              <FileSpreadsheet className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsCategorySelectorOpen(true)}
                          className="flex-1"
                        >
                          <FolderOpen className="h-4 w-4 mr-2" />
                          Выбрать категорию
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsCategoryManagerOpen(true)}
                        >
                          <FileSpreadsheet className="h-4 w-4 mr-2" />
                          Из Excel
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Characteristics */}
                  {(form.category_id || categoryTemplate) && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="text-lg font-medium mb-4">Характеристики товара</h3>
                        <CharacteristicsForm
                          marketplace={form.marketplace}
                          categoryId={form.category_id}
                          values={form.characteristics}
                          onChange={handleCharacteristicsChange}
                          categoryTemplate={categoryTemplate}
                        />
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* Media */}
                <TabsContent value="media" className="space-y-6 mt-6 pb-4">
                  <div>
                    <h3 className="text-lg font-medium mb-4">Фотографии товара</h3>
                    
                    {form.images.length > 0 && (
                      <div className="grid grid-cols-4 gap-4 mb-4">
                        {form.images.map((img, i) => (
                          <div key={i} className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                            i === form.main_image_index ? 'border-primary' : 'border-border'
                          }`}>
                            <img 
                              src={img.startsWith('data:') ? img : `/api/image?path=${encodeURIComponent(img)}`} 
                              alt="" 
                              className="w-full h-full object-cover" 
                            />
                            {i === form.main_image_index && (
                              <Badge className="absolute top-2 left-2 text-xs">
                                Главное
                              </Badge>
                            )}
                            <div className="absolute top-2 right-2 flex gap-1">
                              {i !== form.main_image_index && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setForm(f => ({ ...f, main_image_index: i }))}
                                  className="h-6 px-2 text-xs"
                                >
                                  Главное
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  const newImages = form.images.filter((_, index) => index !== i);
                                  setForm(f => ({ 
                                    ...f, 
                                    images: newImages,
                                    main_image_index: f.main_image_index >= i ? Math.max(0, f.main_image_index - 1) : f.main_image_index
                                  }));
                                }}
                                className="h-6 w-6 p-0"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsImageSelectorOpen(true)}
                      className="w-full"
                    >
                      <ImageIcon className="h-4 w-4 mr-2" />
                      {form.images.length > 0 ? 'Изменить фото' : 'Добавить фото'}
                    </Button>
                    
                    <p className="text-xs text-muted-foreground mt-2">
                      {form.marketplace === 'wildberries' ? 'До 30 фото, мин. 900x1200px' : 'До 15 фото, мин. 200x200px'}. 
                      Поддерживаемые форматы: JPG, PNG, WEBP
                    </p>
                  </div>
                </TabsContent>

                {/* Dimensions */}
                <TabsContent value="dimensions" className="space-y-6 mt-6 pb-4">
                  <div>
                    <h3 className="text-lg font-medium mb-4">Размеры и вес</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <h4 className="font-medium">Размеры упаковки</h4>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Длина (мм)</Label>
                            <Input
                              type="number"
                              value={form.dimensions.length || ''}
                              onChange={(e) => setForm(f => ({ 
                                ...f, 
                                dimensions: { ...f.dimensions, length: Number(e.target.value) }
                              }))}
                              placeholder="100"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Ширина (мм)</Label>
                            <Input
                              type="number"
                              value={form.dimensions.width || ''}
                              onChange={(e) => setForm(f => ({ 
                                ...f, 
                                dimensions: { ...f.dimensions, width: Number(e.target.value) }
                              }))}
                              placeholder="100"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Высота (мм)</Label>
                            <Input
                              type="number"
                              value={form.dimensions.height || ''}
                              onChange={(e) => setForm(f => ({ 
                                ...f, 
                                dimensions: { ...f.dimensions, height: Number(e.target.value) }
                              }))}
                              placeholder="50"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <h4 className="font-medium">Вес</h4>
                        <div className="space-y-2">
                          <Label>Вес товара (граммы)</Label>
                          <Input
                            type="number"
                            value={form.weight || ''}
                            onChange={(e) => setForm(f => ({ ...f, weight: Number(e.target.value) }))}
                            placeholder="500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Pricing */}
                <TabsContent value="pricing" className="space-y-6 mt-6 pb-4">
                  <div>
                    <h3 className="text-lg font-medium mb-4">Ценообразование</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="price">Цена продажи (₽) *</Label>
                        <Input
                          id="price"
                          type="number"
                          min={0}
                          value={form.price || ''}
                          onChange={(e) => setForm(f => ({ ...f, price: Number(e.target.value) }))}
                          placeholder="1990"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="old_price">Старая цена (₽)</Label>
                        <Input
                          id="old_price"
                          type="number"
                          min={0}
                          value={form.old_price || ''}
                          onChange={(e) => setForm(f => ({ ...f, old_price: Number(e.target.value) }))}
                          placeholder="2490"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="discount">Скидка (%)</Label>
                        <Input
                          id="discount"
                          type="number"
                          min={0}
                          max={99}
                          value={form.discount || ''}
                          onChange={(e) => setForm(f => ({ ...f, discount: Number(e.target.value) }))}
                          placeholder="20"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cost_price">Себестоимость (₽)</Label>
                        <Input
                          id="cost_price"
                          type="number"
                          min={0}
                          value={form.cost_price || ''}
                          onChange={(e) => setForm(f => ({ ...f, cost_price: Number(e.target.value) }))}
                          placeholder="800"
                        />
                      </div>
                    </div>

                    {form.marketplace === 'ozon' && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-medium mb-4">Логистика (Ozon)</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Склад</Label>
                              <Input
                                value={form.warehouse_id}
                                onChange={(e) => setForm(f => ({ ...f, warehouse_id: e.target.value }))}
                                placeholder="ID склада"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Количество на складе</Label>
                              <Input
                                type="number"
                                min={0}
                                value={form.stock_quantity || ''}
                                onChange={(e) => setForm(f => ({ ...f, stock_quantity: Number(e.target.value) }))}
                                placeholder="100"
                              />
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </TabsContent>

                {/* Additional Data */}
                <TabsContent value="additional" className="space-y-6 mt-6 pb-4">
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-4">Дополнительные данные</h3>
                      
                      {/* SEO Keywords */}
                      <div className="space-y-3">
                        <Label>SEO ключевые слова</Label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Добавить ключевое слово"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addKeyword(e.currentTarget.value);
                                e.currentTarget.value = '';
                              }
                            }}
                          />
                        </div>
                        {form.seo_keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {form.seo_keywords.map((keyword, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {keyword}
                                <button
                                  type="button"
                                  onClick={() => removeKeyword(index)}
                                  className="ml-1 hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Tags */}
                      <div className="space-y-3">
                        <Label>Теги</Label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Добавить тег"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addTag(e.currentTarget.value);
                                e.currentTarget.value = '';
                              }
                            }}
                          />
                        </div>
                        {form.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {form.tags.map((tag, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {tag}
                                <button
                                  type="button"
                                  onClick={() => removeTag(index)}
                                  className="ml-1 hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Notes */}
                      <div className="space-y-2">
                        <Label htmlFor="notes">Заметки</Label>
                        <Textarea
                          id="notes"
                          value={form.notes}
                          onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                          placeholder="Внутренние заметки о товаре..."
                          rows={4}
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            {/* Footer */}
            <div className="flex justify-end gap-3 pt-4 border-t mt-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {isEditing ? 'Сохранить' : 'Создать'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Category Selector */}
      <CategorySelector
        open={isCategorySelectorOpen}
        onOpenChange={setIsCategorySelectorOpen}
        marketplace={form.marketplace}
        selectedCategory={form.category_id ? {
          id: form.category_id,
          name: form.category_name,
          path: form.category_path
        } : null}
        onCategorySelect={handleCategorySelect}
      />

      {/* Image Selector */}
      <ImageSelector
        open={isImageSelectorOpen}
        onOpenChange={setIsImageSelectorOpen}
        selectedImages={form.images}
        onImagesSelect={handleImagesSelect}
        maxImages={form.marketplace === 'wildberries' ? 30 : 15}
      />

      {/* Category Manager (Excel upload) */}
      <CategoryManager
        open={isCategoryManagerOpen}
        onOpenChange={setIsCategoryManagerOpen}
        onTemplateSelect={(template) => {
          setCategoryTemplate(template);
          setForm(f => ({
            ...f,
            category_id: template.id,
            category_name: template.name,
            category_path: [template.name],
            characteristics: {}
          }));
        }}
      />
    </>
  );
}