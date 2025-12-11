/**
 * CardItem - Memoized card component for marketplace cards
 * 
 * Wrapped with React.memo and custom comparison function to prevent
 * unnecessary re-renders in virtualized lists.
 * 
 * Requirements: 2.2
 */
import { memo } from 'react';
import { type MarketplaceCard, type CardStatus, type Marketplace } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Pencil, Trash2, Upload, Package } from 'lucide-react';

const STATUS_LABELS: Record<CardStatus, string> = {
  draft: 'Черновик',
  ready: 'Готова',
  published: 'Опубликована',
};

const STATUS_COLORS: Record<CardStatus, string> = {
  draft: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  ready: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
  published: 'bg-green-500/20 text-green-500 border-green-500/30',
};

const MARKETPLACE_COLORS: Record<Marketplace, string> = {
  wildberries: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  ozon: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
};

export interface CardItemProps {
  card: MarketplaceCard;
  onEdit: () => void;
  onDelete: () => void;
  onPublish: () => void;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
}

/**
 * CardItem component - displays a single marketplace card
 */
function CardItemComponent({ card, onEdit, onDelete, onPublish, isSelected, onSelect }: CardItemProps) {
  return (
    <div className={`bg-card border rounded-lg p-5 hover:border-primary/50 transition-colors min-w-0 h-[396px] flex flex-col ${
      isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border'
    }`}>
      {/* Header with checkbox, badges and menu */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            className="mt-1"
          />
          <div className="flex flex-wrap gap-2 min-w-0 flex-1">
            <Badge variant="outline" className={MARKETPLACE_COLORS[card.marketplace]}>
              {card.marketplace === 'wildberries' ? 'Wildberries' : 'Ozon'}
            </Badge>
            <Badge variant="outline" className={STATUS_COLORS[card.status]}>
              {STATUS_LABELS[card.status]}
            </Badge>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-2" />
              Редактировать
            </DropdownMenuItem>
            {card.status !== 'published' && (
              <DropdownMenuItem onClick={onPublish}>
                <Upload className="h-4 w-4 mr-2" />
                Опубликовать
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Image */}
      <div className="aspect-[4/3] bg-muted rounded-md mb-4 flex items-center justify-center overflow-hidden">
        {card.images && card.images.length > 0 ? (
          <img
            src={card.images[0].startsWith('data:') ? card.images[0] : `/api/image?path=${encodeURIComponent(card.images[0])}`}
            alt={card.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <Package className="h-16 w-16 text-muted-foreground/50" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-between">
        <div>
          <h3 className="font-medium text-base leading-tight mb-1 line-clamp-2">{card.name}</h3>
          <p className="text-sm text-muted-foreground truncate">{card.brand || 'Без бренда'}</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold">
              {card.price.toLocaleString('ru-RU')} ₽
            </span>
            {card.discount > 0 && (
              <Badge variant="destructive" className="text-xs">
                -{card.discount}%
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">Арт: {card.article}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Custom comparison function for React.memo
 * Only re-renders when relevant card data or selection state changes
 */
function arePropsEqual(prevProps: CardItemProps, nextProps: CardItemProps): boolean {
  // Check selection state first (most likely to change)
  if (prevProps.isSelected !== nextProps.isSelected) {
    return false;
  }
  
  // Check card identity
  if (prevProps.card.id !== nextProps.card.id) {
    return false;
  }
  
  // Check visible card properties
  const prevCard = prevProps.card;
  const nextCard = nextProps.card;
  
  return (
    prevCard.name === nextCard.name &&
    prevCard.status === nextCard.status &&
    prevCard.price === nextCard.price &&
    prevCard.discount === nextCard.discount &&
    prevCard.marketplace === nextCard.marketplace &&
    prevCard.brand === nextCard.brand &&
    prevCard.article === nextCard.article &&
    prevCard.images?.[0] === nextCard.images?.[0]
  );
}

/**
 * Memoized CardItem - prevents unnecessary re-renders
 */
export const CardItem = memo(CardItemComponent, arePropsEqual);

// Export the raw component for testing
export { CardItemComponent };
