/**
 * useOptimizedFilter - Hook for optimized filtering of marketplace cards
 * 
 * Features:
 * - 200ms debounce on search input (Requirements: 4.1)
 * - useDeferredValue for non-blocking filter updates
 * - Memoized filter function for efficient filtering (Requirements: 4.2, 4.3)
 * - Filter results counter (Requirements: 4.4, 5.3)
 */
import { useState, useMemo, useDeferredValue, useCallback, useEffect, useRef } from 'react';
import type { MarketplaceCard, Marketplace, CardStatus } from '@/api/client';

export interface FilterState {
  marketplace: Marketplace | 'all';
  status: CardStatus | 'all';
  search: string;
}

export interface FilterResult {
  filteredCards: MarketplaceCard[];
  totalCount: number;
  filteredCount: number;
  isFiltering: boolean;
}

export interface UseOptimizedFilterResult extends FilterResult {
  filter: FilterState;
  setFilter: (filter: FilterState) => void;
  setSearch: (search: string) => void;
  setMarketplace: (marketplace: Marketplace | 'all') => void;
  setStatus: (status: CardStatus | 'all') => void;
  resetFilters: () => void;
}

const DEFAULT_FILTER: FilterState = {
  marketplace: 'all',
  status: 'all',
  search: '',
};

const DEBOUNCE_MS = 200;

/**
 * Debounce hook for search input
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Optimized filter function for marketplace cards
 * Uses efficient string matching with early termination
 * 
 * Requirements: 4.2, 4.3
 */
export function filterCards(
  cards: MarketplaceCard[],
  filter: FilterState
): MarketplaceCard[] {
  const { marketplace, status, search } = filter;
  const searchLower = search.toLowerCase().trim();
  
  return cards.filter((card) => {
    // Marketplace filter - fast check first
    if (marketplace !== 'all' && card.marketplace !== marketplace) {
      return false;
    }
    
    // Status filter - fast check
    if (status !== 'all' && card.status !== status) {
      return false;
    }
    
    // Search filter - more expensive, check last
    if (searchLower) {
      // Check name first (most common search target)
      if (card.name.toLowerCase().includes(searchLower)) {
        return true;
      }
      // Check article
      if (card.article.toLowerCase().includes(searchLower)) {
        return true;
      }
      // Check brand if exists
      if (card.brand && card.brand.toLowerCase().includes(searchLower)) {
        return true;
      }
      // Check barcode
      if (card.barcode && card.barcode.toLowerCase().includes(searchLower)) {
        return true;
      }
      // No match found
      return false;
    }
    
    return true;
  });
}

/**
 * Hook for optimized filtering of marketplace cards
 * 
 * @param cards - Array of marketplace cards to filter
 * @returns Filter state, setters, and filtered results
 */
export function useOptimizedFilter(cards: MarketplaceCard[]): UseOptimizedFilterResult {
  const [filter, setFilterState] = useState<FilterState>(DEFAULT_FILTER);
  
  // Debounce search input by 200ms (Requirements: 4.1)
  const debouncedSearch = useDebounce(filter.search, DEBOUNCE_MS);
  
  // Create effective filter with debounced search
  const effectiveFilter = useMemo(
    () => ({
      ...filter,
      search: debouncedSearch,
    }),
    [filter.marketplace, filter.status, debouncedSearch]
  );
  
  // Use deferred value for non-blocking updates
  const deferredFilter = useDeferredValue(effectiveFilter);
  
  // Memoized filtered cards (Requirements: 4.2, 4.3)
  const filteredCards = useMemo(
    () => filterCards(cards, deferredFilter),
    [cards, deferredFilter]
  );
  
  // Check if filtering is in progress (deferred value hasn't caught up)
  const isFiltering = effectiveFilter !== deferredFilter;
  
  // Setters
  const setFilter = useCallback((newFilter: FilterState) => {
    setFilterState(newFilter);
  }, []);
  
  const setSearch = useCallback((search: string) => {
    setFilterState(prev => ({ ...prev, search }));
  }, []);
  
  const setMarketplace = useCallback((marketplace: Marketplace | 'all') => {
    setFilterState(prev => ({ ...prev, marketplace }));
  }, []);
  
  const setStatus = useCallback((status: CardStatus | 'all') => {
    setFilterState(prev => ({ ...prev, status }));
  }, []);
  
  const resetFilters = useCallback(() => {
    setFilterState(DEFAULT_FILTER);
  }, []);
  
  return {
    filter,
    setFilter,
    setSearch,
    setMarketplace,
    setStatus,
    resetFilters,
    filteredCards,
    totalCount: cards.length,
    filteredCount: filteredCards.length,
    isFiltering,
  };
}

// Export for testing
export { DEFAULT_FILTER, DEBOUNCE_MS };
