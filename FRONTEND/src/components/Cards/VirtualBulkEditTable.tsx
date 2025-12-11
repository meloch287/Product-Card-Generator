/**
 * VirtualBulkEditTable - Virtualized table for bulk editing marketplace cards
 * 
 * Uses @tanstack/react-virtual for row virtualization to render only visible rows.
 * Limits DOM elements to ~50 rows regardless of total count.
 * 
 * Requirements: 3.1, 3.3
 */
import { useRef, useCallback, useMemo, useState, useEffect, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { type MarketplaceCard } from '@/api/client';
import { Undo2, Image as ImageIcon } from 'lucide-react';

// Configuration constants
const ROW_HEIGHT = 48;
const OVERSCAN = 5; // Number of rows to render outside viewport
const MAX_VISIBLE_ROWS = 50; // Maximum rows to render at once

export interface EditableCard extends MarketplaceCard {
  _modified?: boolean;
  _original?: MarketplaceCard;
}

export interface VirtualBulkEditTableProps {
  cards: EditableCard[];
  selectedIds: Set<string>;
  onCellChange: (cardId: string, field: string, value: string | number) => void;
  onRevert: (cardId: string) => void;
  onToggleSelect: (cardId: string) => void;
  onToggleSelectAll: () => void;
}

export const EDITABLE_FIELDS = [
  { key: 'name', label: 'Название', type: 'text', width: '200px' },
  { key: 'article', label: 'Артикул', type: 'text', width: '120px' },
  { key: 'brand', label: 'Бренд', type: 'text', width: '120px' },
  { key: 'price', label: 'Цена', type: 'number', width: '100px' },
  { key: 'old_price', label: 'Старая цена', type: 'number', width: '100px' },
  { key: 'discount', label: 'Скидка %', type: 'number', width: '80px' },
  { key: 'barcode', label: 'Баркод', type: 'text', width: '130px' },
] as const;

// Calculate total table width
const TABLE_WIDTH = 40 + 50 + EDITABLE_FIELDS.reduce((sum, f) => sum + parseInt(f.width), 0) + 80 + 60;

/**
 * VirtualBulkEditTable component
 * 
 * Renders a virtualized table of editable cards, only mounting DOM elements for visible rows.
 * Maximum ~50 DOM row elements regardless of total card count.
 */
export function VirtualBulkEditTable({
  cards,
  selectedIds,
  onCellChange,
  onRevert,
  onToggleSelect,
  onToggleSelectAll,
}: VirtualBulkEditTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  // Setup virtualizer for rows
  const virtualizer = useVirtualizer({
    count: cards.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });
  
  const virtualRows = virtualizer.getVirtualItems();
  
  // Check if all cards are selected
  const allSelected = cards.length > 0 && selectedIds.size === cards.length;
  
  if (cards.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Нет карточек для редактирования
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full">
      {/* Sticky Header */}
      <div 
        className="flex-shrink-0 bg-background border-b z-10"
        style={{ minWidth: `${TABLE_WIDTH}px` }}
      >
        <div className="flex items-center h-10 text-sm font-medium text-muted-foreground">
          <div className="w-[40px] flex items-center justify-center px-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={onToggleSelectAll}
            />
          </div>
          <div className="w-[50px] px-2">Фото</div>
          {EDITABLE_FIELDS.map(field => (
            <div key={field.key} style={{ width: field.width }} className="px-2">
              {field.label}
            </div>
          ))}
          <div className="w-[80px] px-2">Статус</div>
          <div className="w-[60px] px-2"></div>
        </div>
      </div>
      
      {/* Virtualized Body */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        style={{ contain: 'strict' }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
            minWidth: `${TABLE_WIDTH}px`,
          }}
        >
          {virtualRows.map((virtualRow) => {
            const card = cards[virtualRow.index];
            return (
              <VirtualTableRow
                key={card.id}
                card={card}
                isSelected={selectedIds.has(card.id)}
                onCellChange={onCellChange}
                onRevert={onRevert}
                onToggleSelect={onToggleSelect}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Export constants for testing
export { ROW_HEIGHT, OVERSCAN, MAX_VISIBLE_ROWS };


/**
 * VirtualTableRow - Memoized table row component
 * 
 * Uses React.memo to prevent re-renders when other rows change.
 * Only re-renders when this specific row's data changes.
 * 
 * Requirements: 3.4
 */
interface VirtualTableRowProps {
  card: EditableCard;
  isSelected: boolean;
  onCellChange: (cardId: string, field: string, value: string | number) => void;
  onRevert: (cardId: string) => void;
  onToggleSelect: (cardId: string) => void;
  style: React.CSSProperties;
}

export const VirtualTableRow = memo(function VirtualTableRow({
  card,
  isSelected,
  onCellChange,
  onRevert,
  onToggleSelect,
  style,
}: VirtualTableRowProps) {
  const handleChange = useCallback((field: string, value: string) => {
    onCellChange(card.id, field, value);
  }, [card.id, onCellChange]);
  
  const handleRevert = useCallback(() => {
    onRevert(card.id);
  }, [card.id, onRevert]);
  
  const handleToggleSelect = useCallback(() => {
    onToggleSelect(card.id);
  }, [card.id, onToggleSelect]);
  
  return (
    <div
      style={style}
      className={`flex items-center border-b hover:bg-muted/50 ${
        card._modified ? 'bg-yellow-500/5' : ''
      }`}
    >
      {/* Checkbox */}
      <div className="w-[40px] flex items-center justify-center px-2">
        <Checkbox
          checked={isSelected}
          onCheckedChange={handleToggleSelect}
        />
      </div>
      
      {/* Image */}
      <div className="w-[50px] px-2">
        {card.images && card.images.length > 0 ? (
          <div className="w-8 h-8 rounded overflow-hidden bg-muted">
            <img
              src={card.images[0].startsWith('data:') 
                ? card.images[0] 
                : `/api/image?path=${encodeURIComponent(card.images[0])}`}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
            <ImageIcon className="h-3 w-3 text-muted-foreground" />
          </div>
        )}
      </div>
      
      {/* Editable Fields */}
      {EDITABLE_FIELDS.map(field => (
        <div key={field.key} style={{ width: field.width }} className="px-1">
          <Input
            type={field.type}
            value={card[field.key as keyof MarketplaceCard] as string | number || ''}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className="h-7 text-xs"
          />
        </div>
      ))}
      
      {/* Status */}
      <div className="w-[80px] px-2">
        <Badge 
          variant={card.status === 'published' ? 'default' : 'secondary'}
          className="text-xs"
        >
          {card.status === 'draft' ? 'Черновик' : 
           card.status === 'ready' ? 'Готова' : 'Опубл.'}
        </Badge>
      </div>
      
      {/* Revert Button */}
      <div className="w-[60px] px-2">
        {card._modified && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRevert}
            title="Отменить изменения"
            className="h-7 w-7 p-0"
          >
            <Undo2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for memoization
  // Only re-render if this specific row's data changed
  return (
    prevProps.card.id === nextProps.card.id &&
    prevProps.card.name === nextProps.card.name &&
    prevProps.card.article === nextProps.card.article &&
    prevProps.card.brand === nextProps.card.brand &&
    prevProps.card.price === nextProps.card.price &&
    prevProps.card.old_price === nextProps.card.old_price &&
    prevProps.card.discount === nextProps.card.discount &&
    prevProps.card.barcode === nextProps.card.barcode &&
    prevProps.card.status === nextProps.card.status &&
    prevProps.card._modified === nextProps.card._modified &&
    prevProps.card.images?.[0] === nextProps.card.images?.[0] &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.style.transform === nextProps.style.transform
  );
});
