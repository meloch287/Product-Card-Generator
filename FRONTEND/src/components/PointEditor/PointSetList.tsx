import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { PointSet } from '@/types';
import { getPointSetColor, MAX_POINT_SETS } from '@/utils/pointSetUtils';
import { PointSetItem } from './PointSetItem';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PointSetListProps {
  pointSets: PointSet[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

export function PointSetList({
  pointSets,
  activeIndex,
  onSelect,
  onAdd,
  onRemove,
}: PointSetListProps) {
  const canAdd = pointSets.length < MAX_POINT_SETS;
  const canRemove = pointSets.length > 1;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Области вставки ({pointSets.length}/{MAX_POINT_SETS})
        </span>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAdd}
                  disabled={!canAdd}
                  className="h-8"
                  aria-label="Добавить область"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Добавить
                </Button>
              </span>
            </TooltipTrigger>
            {!canAdd && (
              <TooltipContent>
                <p>Максимум 10 областей</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
        {pointSets.map((pointSet) => (
          <PointSetItem
            key={pointSet.index}
            index={pointSet.index}
            isActive={pointSet.index === activeIndex}
            color={getPointSetColor(pointSet.index)}
            onSelect={() => onSelect(pointSet.index)}
            onRemove={() => onRemove(pointSet.index)}
            canRemove={canRemove}
          />
        ))}
      </div>

      {!canRemove && (
        <p className="text-xs text-muted-foreground">
          Минимум одна область обязательна
        </p>
      )}
    </div>
  );
}
