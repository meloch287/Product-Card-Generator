import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PointSetItemProps {
  index: number;
  isActive: boolean;
  color: string;
  onSelect: () => void;
  onRemove: () => void;
  canRemove: boolean;
}

export function PointSetItem({
  index,
  isActive,
  color,
  onSelect,
  onRemove,
  canRemove,
}: PointSetItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded-md cursor-pointer transition-all',
        'hover:bg-accent/50',
        isActive && 'bg-accent ring-1 ring-primary'
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-selected={isActive}
      aria-label={`Область ${index + 1}`}
    >
      {/* Color indicator */}
      <div
        className={cn(
          'w-4 h-4 rounded-full flex-shrink-0 border-2',
          isActive ? 'border-foreground' : 'border-transparent'
        )}
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />

      {/* Label */}
      <span
        className={cn(
          'flex-1 text-sm font-medium',
          isActive ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        Область {index + 1}
      </span>

      {/* Remove button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7 flex-shrink-0',
                  !canRemove && 'opacity-50 cursor-not-allowed'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  if (canRemove) {
                    onRemove();
                  }
                }}
                disabled={!canRemove}
                aria-label={`Удалить область ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{canRemove ? `Удалить область ${index + 1}` : 'Минимум одна область'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
