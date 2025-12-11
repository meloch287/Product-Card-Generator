import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cardsApi, type MarketplaceCard } from '@/api/client';
import { toast } from 'sonner';
import {
  Save,
  Loader2,
  Undo2,
  Table as TableIcon,
} from 'lucide-react';
import { VirtualBulkEditTable, EDITABLE_FIELDS, type EditableCard } from './VirtualBulkEditTable';
import { CardsErrorBoundary } from './CardsErrorBoundary';

interface BulkEditTableProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cards: MarketplaceCard[];
  onSaved?: () => void;
}

export function BulkEditTable({ open, onOpenChange, cards, onSaved }: BulkEditTableProps) {
  const [editableCards, setEditableCards] = useState<EditableCard[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && cards.length > 0) {
      setEditableCards(cards.map(card => ({
        ...card,
        _modified: false,
        _original: { ...card }
      })));
      setSelectedIds(new Set());
    }
  }, [open, cards]);

  const handleCellChange = useCallback((cardId: string, field: string, value: string | number) => {
    setEditableCards(prev => prev.map(card => {
      if (card.id !== cardId) return card;
      
      const newValue = EDITABLE_FIELDS.find(f => f.key === field)?.type === 'number' 
        ? Number(value) || 0 
        : value;
      
      const isModified = card._original?.[field as keyof MarketplaceCard] !== newValue;
      
      return {
        ...card,
        [field]: newValue,
        _modified: isModified || Object.keys(card).some(k => 
          k !== field && 
          k !== '_modified' && 
          k !== '_original' && 
          card._original?.[k as keyof MarketplaceCard] !== card[k as keyof EditableCard]
        )
      };
    }));
  }, []);

  const handleRevert = useCallback((cardId: string) => {
    setEditableCards(prev => prev.map(card => {
      if (card.id !== cardId || !card._original) return card;
      return {
        ...card._original,
        _modified: false,
        _original: card._original
      };
    }));
  }, []);

  const handleRevertAll = useCallback(() => {
    setEditableCards(prev => prev.map(card => ({
      ...card._original!,
      _modified: false,
      _original: card._original
    })));
  }, []);

  const handleSave = async () => {
    const modifiedCards = editableCards.filter(c => c._modified);
    
    if (modifiedCards.length === 0) {
      toast.info('Нет изменений для сохранения');
      return;
    }

    setSaving(true);
    let saved = 0;
    let errors = 0;

    try {
      for (const card of modifiedCards) {
        try {
          await cardsApi.update(card.id, {
            name: card.name,
            article: card.article,
            brand: card.brand,
            price: card.price,
            old_price: card.old_price || undefined,
            discount: card.discount,
            barcode: card.barcode,
          });
          saved++;
        } catch (e) {
          errors++;
          console.error(`Error saving card ${card.id}:`, e);
        }
      }

      if (saved > 0) {
        toast.success(`Сохранено ${saved} карточек`);
        onSaved?.();
      }
      if (errors > 0) {
        toast.error(`Ошибка сохранения ${errors} карточек`);
      }

      // Mark saved cards as not modified
      setEditableCards(prev => prev.map(card => ({
        ...card,
        _modified: false,
        _original: { ...card, _modified: undefined, _original: undefined } as MarketplaceCard
      })));

    } catch (e: any) {
      toast.error(`Ошибка: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const modifiedCount = editableCards.filter(c => c._modified).length;

  const toggleSelect = (cardId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === editableCards.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(editableCards.map(c => c.id)));
    }
  };

  // Bulk update selected cards
  const handleBulkUpdate = (field: string, value: string | number) => {
    if (selectedIds.size === 0) return;
    
    setEditableCards(prev => prev.map(card => {
      if (!selectedIds.has(card.id)) return card;
      
      const newValue = EDITABLE_FIELDS.find(f => f.key === field)?.type === 'number' 
        ? Number(value) || 0 
        : value;
      
      return {
        ...card,
        [field]: newValue,
        _modified: true
      };
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <TableIcon className="h-5 w-5" />
            Табличное редактирование
            <Badge variant="outline">{editableCards.length} товаров</Badge>
            {modifiedCount > 0 && (
              <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-500">
                {modifiedCount} изменено
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Bulk actions bar */}
        {selectedIds.size > 0 && (
          <div className="px-6 py-3 bg-muted/50 border-b flex items-center gap-4">
            <span className="text-sm font-medium">
              Выбрано: {selectedIds.size}
            </span>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Новая цена"
                type="number"
                className="w-32 h-8"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleBulkUpdate('price', e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const input = document.querySelector('input[placeholder="Новая цена"]') as HTMLInputElement;
                  if (input?.value) {
                    handleBulkUpdate('price', input.value);
                    input.value = '';
                  }
                }}
              >
                Применить цену
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Скидка %"
                type="number"
                className="w-24 h-8"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleBulkUpdate('discount', e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const input = document.querySelector('input[placeholder="Скидка %"]') as HTMLInputElement;
                  if (input?.value) {
                    handleBulkUpdate('discount', input.value);
                    input.value = '';
                  }
                }}
              >
                Применить скидку
              </Button>
            </div>
          </div>
        )}

        {/* Virtualized Table - wrapped with error boundary (Requirement 5.4) */}
        <div className="flex-1 overflow-hidden">
          <CardsErrorBoundary componentName="таблицу редактирования">
            <VirtualBulkEditTable
              cards={editableCards}
              selectedIds={selectedIds}
              onCellChange={handleCellChange}
              onRevert={handleRevert}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
            />
          </CardsErrorBoundary>
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {modifiedCount > 0 && (
                <Button variant="outline" onClick={handleRevertAll}>
                  <Undo2 className="h-4 w-4 mr-2" />
                  Отменить все изменения
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Закрыть
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={saving || modifiedCount === 0}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Сохранить {modifiedCount > 0 ? `(${modifiedCount})` : ''}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
