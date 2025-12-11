/**
 * ErrorDisplay - Component for displaying loading errors with retry functionality
 * 
 * Shows user-friendly error messages and provides a retry button
 * 
 * Requirements: 5.4
 */
import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CardsLoadError } from '@/hooks/useCardsLoader';

export interface ErrorDisplayProps {
  /** The error to display */
  error: Error;
  /** Callback to retry the failed operation */
  onRetry: () => void;
  /** Whether a retry is currently in progress */
  isRetrying?: boolean;
  /** Optional title override */
  title?: string;
}

/**
 * Get user-friendly error message from error object
 */
function getErrorMessage(error: Error): string {
  if (error instanceof CardsLoadError) {
    return error.userMessage;
  }
  return error.message || 'Произошла неизвестная ошибка.';
}

/**
 * Check if error is network-related
 */
function isNetworkError(error: Error): boolean {
  if (error instanceof CardsLoadError) {
    return error.isNetworkError;
  }
  return (
    error.message.includes('network') ||
    error.message.includes('Network') ||
    error.message.includes('Failed to fetch') ||
    error.message.includes('ERR_CONNECTION')
  );
}

/**
 * ErrorDisplay component
 * 
 * Displays error message with appropriate icon and retry button.
 * Handles network errors with special messaging.
 */
export function ErrorDisplay({
  error,
  onRetry,
  isRetrying = false,
  title,
}: ErrorDisplayProps) {
  const isNetwork = isNetworkError(error);
  const Icon = isNetwork ? WifiOff : AlertCircle;
  const errorTitle = title || (isNetwork ? 'Ошибка подключения' : 'Ошибка загрузки');
  const errorMessage = getErrorMessage(error);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <Alert variant="destructive" className="max-w-md">
        <Icon className="h-5 w-5" />
        <AlertTitle>{errorTitle}</AlertTitle>
        <AlertDescription className="mt-2">
          {errorMessage}
        </AlertDescription>
      </Alert>
      
      <Button
        onClick={onRetry}
        disabled={isRetrying}
        className="mt-6"
        variant="outline"
      >
        <RefreshCw className={`h-4 w-4 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
        {isRetrying ? 'Загрузка...' : 'Повторить попытку'}
      </Button>
    </div>
  );
}
