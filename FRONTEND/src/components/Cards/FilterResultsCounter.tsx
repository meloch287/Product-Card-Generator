/**
 * FilterResultsCounter - Displays "Showing X of Y cards" with filter info
 * 
 * Requirements: 4.4, 5.3
 */
import React from 'react';
import { Loader2 } from 'lucide-react';

export interface FilterResultsCounterProps {
  filteredCount: number;
  totalCount: number;
  isFiltering?: boolean;
  className?: string;
}

/**
 * Component to display filter results count
 * Shows "Showing X of Y cards" format
 * Updates on filter changes
 */
export const FilterResultsCounter: React.FC<FilterResultsCounterProps> = React.memo(({
  filteredCount,
  totalCount,
  isFiltering = false,
  className = '',
}) => {
  const isFiltered = filteredCount !== totalCount;
  
  return (
    <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
      {isFiltering && (
        <Loader2 className="h-3 w-3 animate-spin" />
      )}
      <span>
        {isFiltered ? (
          <>
            Показано <span className="font-medium text-foreground">{filteredCount}</span> из{' '}
            <span className="font-medium text-foreground">{totalCount}</span> карточек
          </>
        ) : (
          <>
            Всего карточек: <span className="font-medium text-foreground">{totalCount}</span>
          </>
        )}
      </span>
    </div>
  );
});

FilterResultsCounter.displayName = 'FilterResultsCounter';

export default FilterResultsCounter;
