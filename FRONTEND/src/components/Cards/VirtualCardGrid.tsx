/**
 * VirtualCardGrid - Virtualized grid for displaying marketplace cards
 * 
 * Uses @tanstack/react-virtual for virtualization to render only visible cards.
 * Limits DOM elements to ~100 cards regardless of total count.
 * 
 * Requirements: 2.1, 2.3
 */
import { useRef, useCallback, useMemo, memo, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { type MarketplaceCard } from '@/api/client';
import { CardItem } from './CardItem';

// Configuration constants
const CARD_MIN_WIDTH = 280;
const CARD_HEIGHT = 420; // Increased to prevent overlap
const GAP = 24;
const OVERSCAN = 3; // Number of rows to render outside viewport

export interface VirtualCardGridProps {
  cards: MarketplaceCard[];
  onEdit: (card: MarketplaceCard) => void;
  onDelete: (card: MarketplaceCard) => void;
  onPublish: (card: MarketplaceCard) => void;
  selectedIds: Set<string>;
  onSelect: (id: string, selected: boolean) => void;
}

/**
 * Calculate number of columns based on container width
 */
function calculateColumns(containerWidth: number): number {
  if (containerWidth <= 0) return 1;
  // Account for gap between cards
  const availableWidth = containerWidth + GAP;
  const columns = Math.floor(availableWidth / (CARD_MIN_WIDTH + GAP));
  return Math.max(1, columns);
}

/**
 * VirtualCardGrid component
 * 
 * Renders a virtualized grid of cards, only mounting DOM elements for visible rows.
 * Maximum ~100 DOM elements regardless of total card count.
 */
export function VirtualCardGrid({
  cards,
  onEdit,
  onDelete,
  onPublish,
  selectedIds,
  onSelect,
}: VirtualCardGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track container width for responsive columns
  const [containerWidth, setContainerWidth] = useState(0);
  
  // Update container width on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const updateWidth = () => {
      setContainerWidth(container.clientWidth);
    };
    
    // Initial measurement
    updateWidth();
    
    // Use ResizeObserver for responsive updates
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);
    
    return () => resizeObserver.disconnect();
  }, []);
  
  // Calculate columns based on container width
  const columns = useMemo(() => calculateColumns(containerWidth), [containerWidth]);
  
  // Calculate rows from cards
  const rows = useMemo(() => {
    const result: MarketplaceCard[][] = [];
    for (let i = 0; i < cards.length; i += columns) {
      result.push(cards.slice(i, i + columns));
    }
    return result;
  }, [cards, columns]);
  
  // Setup virtualizer for rows
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_HEIGHT + GAP,
    overscan: OVERSCAN,
  });
  
  const virtualRows = virtualizer.getVirtualItems();
  
  // Memoized handlers to prevent unnecessary re-renders
  const handleEdit = useCallback((card: MarketplaceCard) => {
    onEdit(card);
  }, [onEdit]);
  
  const handleDelete = useCallback((card: MarketplaceCard) => {
    onDelete(card);
  }, [onDelete]);
  
  const handlePublish = useCallback((card: MarketplaceCard) => {
    onPublish(card);
  }, [onPublish]);
  
  const handleSelect = useCallback((id: string, selected: boolean) => {
    onSelect(id, selected);
  }, [onSelect]);
  
  if (cards.length === 0) {
    return null;
  }
  
  return (
    <div ref={containerRef} className="w-full h-full">
      <div
        ref={parentRef}
        className="w-full h-full overflow-auto"
        style={{ contain: 'strict' }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualRows.map((virtualRow) => {
            const rowCards = rows[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
                  className="grid gap-6"
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(${CARD_MIN_WIDTH}px, 1fr))`,
                  }}
                >
                  {rowCards.map((card) => (
                    <MemoizedCardItem
                      key={card.id}
                      card={card}
                      onEdit={() => handleEdit(card)}
                      onDelete={() => handleDelete(card)}
                      onPublish={() => handlePublish(card)}
                      isSelected={selectedIds.has(card.id)}
                      onSelect={(selected) => handleSelect(card.id, selected)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Memoized CardItem wrapper for use in virtual grid
 * Prevents re-renders when parent re-renders but props haven't changed
 */
const MemoizedCardItem = memo(CardItem, (prevProps, nextProps) => {
  return (
    prevProps.card.id === nextProps.card.id &&
    prevProps.card.name === nextProps.card.name &&
    prevProps.card.status === nextProps.card.status &&
    prevProps.card.price === nextProps.card.price &&
    prevProps.card.discount === nextProps.card.discount &&
    prevProps.card.marketplace === nextProps.card.marketplace &&
    prevProps.card.brand === nextProps.card.brand &&
    prevProps.card.article === nextProps.card.article &&
    prevProps.card.images?.[0] === nextProps.card.images?.[0] &&
    prevProps.isSelected === nextProps.isSelected
  );
});

// Export constants for testing
export { CARD_MIN_WIDTH, CARD_HEIGHT, GAP, OVERSCAN, calculateColumns };
