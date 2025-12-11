/**
 * LoadingProgress - Component for displaying cards loading progress
 * 
 * Displays progress bar during loading and shows loaded/total count
 * 
 * Requirements: 5.1, 5.2
 */
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

export interface LoadingProgressProps {
  /** Current progress percentage (0-100) */
  progress: number;
  /** Number of cards loaded so far */
  loadedCount: number;
  /** Total number of cards to load */
  totalCount: number;
  /** Whether loading is in progress */
  isLoading: boolean;
}

export function LoadingProgress({
  progress,
  loadedCount,
  totalCount,
  isLoading,
}: LoadingProgressProps) {
  if (!isLoading) {
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm font-medium">Загрузка карточек...</span>
      </div>
      
      <div className="w-full max-w-md space-y-2">
        <Progress value={progress} className="h-2" />
        
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {loadedCount} из {totalCount > 0 ? totalCount : '...'}
          </span>
          <span>{progress}%</span>
        </div>
      </div>
    </div>
  );
}
