/**
 * CardsErrorBoundary - Error boundary for cards components
 * 
 * Wraps VirtualCardGrid and VirtualBulkEditTable to catch render errors
 * and show fallback UI instead of crashing the entire application.
 * 
 * Requirements: 5.4
 */
import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export interface CardsErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode;
  /** Optional fallback component to render on error */
  fallback?: ReactNode;
  /** Optional callback when error occurs */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Component name for error messages */
  componentName?: string;
}

interface CardsErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * CardsErrorBoundary component
 * 
 * React Error Boundary that catches JavaScript errors in child component tree,
 * logs them, and displays a fallback UI instead of crashing.
 */
export class CardsErrorBoundary extends Component<
  CardsErrorBoundaryProps,
  CardsErrorBoundaryState
> {
  constructor(props: CardsErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): CardsErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console for debugging
    console.error('CardsErrorBoundary caught an error:', error, errorInfo);
    
    // Call optional error callback
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Render custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <CardsErrorFallback
          error={this.state.error}
          componentName={this.props.componentName}
          onReset={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Default fallback UI for error boundary
 */
interface CardsErrorFallbackProps {
  error: Error | null;
  componentName?: string;
  onReset: () => void;
}

function CardsErrorFallback({
  error,
  componentName = 'компонент',
  onReset,
}: CardsErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <Alert variant="destructive" className="max-w-md">
        <AlertTriangle className="h-5 w-5" />
        <AlertTitle>Ошибка отображения</AlertTitle>
        <AlertDescription className="mt-2">
          Не удалось отобразить {componentName}. 
          {error?.message && (
            <span className="block mt-1 text-xs opacity-75">
              Детали: {error.message}
            </span>
          )}
        </AlertDescription>
      </Alert>
      
      <Button
        onClick={onReset}
        className="mt-6"
        variant="outline"
      >
        <RefreshCw className="h-4 w-4 mr-2" />
        Попробовать снова
      </Button>
    </div>
  );
}

/**
 * Higher-order component to wrap any component with error boundary
 */
export function withCardsErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string
) {
  return function WithErrorBoundary(props: P) {
    return (
      <CardsErrorBoundary componentName={componentName}>
        <WrappedComponent {...props} />
      </CardsErrorBoundary>
    );
  };
}
