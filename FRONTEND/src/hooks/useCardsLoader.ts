/**
 * useCardsLoader - Hook for loading marketplace cards with streaming support
 * 
 * Implements NDJSON stream parsing with fetch + ReadableStream
 * Tracks loading progress based on received cards vs total
 * Falls back to regular JSON if streaming fails
 * Handles network errors gracefully with retry functionality
 * 
 * Requirements: 1.1, 1.2, 1.3, 5.4
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { type MarketplaceCard } from '@/api/client';

export interface LoadingState {
  status: 'idle' | 'loading' | 'success' | 'error';
  progress: number;
  loadedCount: number;
  totalCount: number;
  error?: Error;
}

export interface UseCardsLoaderResult {
  cards: MarketplaceCard[];
  isLoading: boolean;
  progress: number;
  loadedCount: number;
  totalCount: number;
  error: Error | null;
  /** Retry loading cards after an error */
  retry: () => void;
  /** Reload cards (alias for retry, for backwards compatibility) */
  reload: () => void;
  /** Clear the current error state */
  clearError: () => void;
}

/**
 * Custom error class for cards loading errors with user-friendly messages
 */
export class CardsLoadError extends Error {
  public readonly isNetworkError: boolean;
  public readonly isServerError: boolean;
  public readonly statusCode?: number;
  public readonly userMessage: string;

  constructor(
    message: string,
    options: {
      isNetworkError?: boolean;
      isServerError?: boolean;
      statusCode?: number;
      userMessage?: string;
    } = {}
  ) {
    super(message);
    this.name = 'CardsLoadError';
    this.isNetworkError = options.isNetworkError ?? false;
    this.isServerError = options.isServerError ?? false;
    this.statusCode = options.statusCode;
    this.userMessage = options.userMessage ?? this.getDefaultUserMessage();
  }

  private getDefaultUserMessage(): string {
    if (this.isNetworkError) {
      return 'Не удалось подключиться к серверу. Проверьте интернет-соединение.';
    }
    if (this.isServerError) {
      return `Ошибка сервера (${this.statusCode}). Попробуйте позже.`;
    }
    return 'Произошла ошибка при загрузке карточек.';
  }
}

/**
 * Convert any error to CardsLoadError with appropriate user message
 */
function toCardsLoadError(error: unknown): CardsLoadError {
  if (error instanceof CardsLoadError) {
    return error;
  }

  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new CardsLoadError(error.message, {
      isNetworkError: true,
      userMessage: 'Не удалось подключиться к серверу. Проверьте интернет-соединение.',
    });
  }

  if (error instanceof Error) {
    // Check for network-related errors
    if (
      error.message.includes('network') ||
      error.message.includes('Network') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('ERR_CONNECTION')
    ) {
      return new CardsLoadError(error.message, {
        isNetworkError: true,
        userMessage: 'Не удалось подключиться к серверу. Проверьте интернет-соединение.',
      });
    }

    return new CardsLoadError(error.message, {
      userMessage: 'Произошла ошибка при загрузке карточек.',
    });
  }

  return new CardsLoadError(String(error), {
    userMessage: 'Произошла неизвестная ошибка.',
  });
}

interface NDJSONMeta {
  type: 'meta';
  total: number;
}

interface NDJSONCard {
  type: 'card';
  data: MarketplaceCard;
}

interface NDJSONDone {
  type: 'done';
}

type NDJSONLine = NDJSONMeta | NDJSONCard | NDJSONDone;

/**
 * Parse NDJSON stream from ReadableStream
 */
async function* parseNDJSONStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<NDJSONLine, void, unknown> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    
    if (done) {
      // Process any remaining data in buffer
      if (buffer.trim()) {
        yield JSON.parse(buffer.trim());
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    
    // Keep the last incomplete line in buffer
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        yield JSON.parse(line);
      }
    }
  }
}

/**
 * Load cards using NDJSON streaming
 */
async function loadCardsStream(
  onProgress: (cards: MarketplaceCard[], total: number, loaded: number) => void,
  signal?: AbortSignal
): Promise<MarketplaceCard[]> {
  let response: Response;
  
  try {
    response = await fetch('/api/cards/stream', { signal });
  } catch (error) {
    throw toCardsLoadError(error);
  }
  
  if (!response.ok) {
    throw new CardsLoadError(`HTTP ${response.status}: ${response.statusText}`, {
      isServerError: response.status >= 500,
      statusCode: response.status,
      userMessage: response.status >= 500
        ? `Ошибка сервера (${response.status}). Попробуйте позже.`
        : `Ошибка загрузки (${response.status}).`,
    });
  }

  if (!response.body) {
    throw new CardsLoadError('Response body is not available', {
      userMessage: 'Сервер вернул пустой ответ.',
    });
  }

  const reader = response.body.getReader();
  const cards: MarketplaceCard[] = [];
  let total = 0;

  try {
    for await (const line of parseNDJSONStream(reader)) {
      if (line.type === 'meta') {
        total = line.total;
        onProgress([], total, 0);
      } else if (line.type === 'card') {
        cards.push(line.data);
        onProgress([...cards], total, cards.length);
      }
      // 'done' type signals completion, no action needed
    }
  } catch (error) {
    throw toCardsLoadError(error);
  } finally {
    reader.releaseLock();
  }

  return cards;
}

/**
 * Fallback: Load cards using regular JSON endpoint
 */
async function loadCardsFallback(signal?: AbortSignal): Promise<MarketplaceCard[]> {
  let response: Response;
  
  try {
    response = await fetch('/api/cards', { signal });
  } catch (error) {
    throw toCardsLoadError(error);
  }
  
  if (!response.ok) {
    throw new CardsLoadError(`HTTP ${response.status}: ${response.statusText}`, {
      isServerError: response.status >= 500,
      statusCode: response.status,
      userMessage: response.status >= 500
        ? `Ошибка сервера (${response.status}). Попробуйте позже.`
        : `Ошибка загрузки (${response.status}).`,
    });
  }

  try {
    return await response.json();
  } catch (error) {
    throw new CardsLoadError('Failed to parse response', {
      userMessage: 'Ошибка обработки данных от сервера.',
    });
  }
}

/**
 * Hook for loading marketplace cards with streaming support
 * 
 * Features:
 * - NDJSON streaming for progressive loading
 * - Progress tracking (loaded/total)
 * - Automatic fallback to regular JSON on streaming failure
 * - Abort support for cleanup
 * - Graceful error handling with retry functionality (Requirement 5.4)
 */
export function useCardsLoader(): UseCardsLoaderResult {
  const [cards, setCards] = useState<MarketplaceCard[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>({
    status: 'idle',
    progress: 0,
    loadedCount: 0,
    totalCount: 0,
  });
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    // Cancel any in-progress request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoadingState({
      status: 'loading',
      progress: 0,
      loadedCount: 0,
      totalCount: 0,
    });
    setCards([]);

    try {
      // Try streaming first
      const loadedCards = await loadCardsStream(
        (currentCards, total, loaded) => {
          setCards(currentCards);
          setLoadingState({
            status: 'loading',
            progress: total > 0 ? Math.round((loaded / total) * 100) : 0,
            loadedCount: loaded,
            totalCount: total,
          });
        },
        abortController.signal
      );

      setCards(loadedCards);
      setLoadingState({
        status: 'success',
        progress: 100,
        loadedCount: loadedCards.length,
        totalCount: loadedCards.length,
      });
    } catch (streamError) {
      // If aborted, don't try fallback
      if (abortController.signal.aborted) {
        return;
      }

      console.warn('Streaming failed, falling back to regular JSON:', streamError);

      try {
        // Fallback to regular JSON
        const loadedCards = await loadCardsFallback(abortController.signal);
        
        setCards(loadedCards);
        setLoadingState({
          status: 'success',
          progress: 100,
          loadedCount: loadedCards.length,
          totalCount: loadedCards.length,
        });
      } catch (fallbackError) {
        if (abortController.signal.aborted) {
          return;
        }

        // Convert to CardsLoadError for consistent error handling
        const error = toCardsLoadError(fallbackError);
        
        setLoadingState({
          status: 'error',
          progress: 0,
          loadedCount: 0,
          totalCount: 0,
          error,
        });
      }
    }
  }, []);

  /**
   * Clear the current error state
   * Useful when user wants to dismiss error without retrying
   */
  const clearError = useCallback(() => {
    setLoadingState(prev => ({
      ...prev,
      status: prev.status === 'error' ? 'idle' : prev.status,
      error: undefined,
    }));
  }, []);

  // Load on mount
  useEffect(() => {
    load();
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [load]);

  return {
    cards,
    isLoading: loadingState.status === 'loading',
    progress: loadingState.progress,
    loadedCount: loadingState.loadedCount,
    totalCount: loadingState.totalCount,
    error: loadingState.error || null,
    retry: load,
    reload: load, // Alias for backwards compatibility
    clearError,
  };
}

// Export types and utilities for testing
export type { NDJSONLine, NDJSONMeta, NDJSONCard, NDJSONDone };
export { parseNDJSONStream, loadCardsStream, loadCardsFallback, toCardsLoadError };
