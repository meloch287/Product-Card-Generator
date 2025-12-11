import { useEffect, useRef } from 'react';
import { Play, Square, AlertCircle, CheckCircle2, Zap, Layers, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function GenerateButton() {
  const {
    templates,
    folders,
    generationStatus,
    startGeneration,
    stopGeneration,
    pollStatus,
    resetGeneration,
  } = useAppStore();

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const canGenerate = templates.length > 0 && folders.length > 0;
  const progress = generationStatus.total > 0
    ? (generationStatus.current / generationStatus.total) * 100
    : 0;

  // Poll status while running
  useEffect(() => {
    if (generationStatus.isRunning) {
      pollIntervalRef.current = setInterval(() => {
        pollStatus().catch(console.error);
      }, 500);
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [generationStatus.isRunning, pollStatus]);

  // Show completion toast
  useEffect(() => {
    if (!generationStatus.isRunning && generationStatus.current > 0 && 
        generationStatus.current === generationStatus.total) {
      toast.success(`Генерация завершена! Создано ${generationStatus.total} карточек`);
    }
  }, [generationStatus.isRunning, generationStatus.current, generationStatus.total]);

  const handleGenerate = async () => {
    if (generationStatus.isRunning) {
      try {
        await stopGeneration();
        toast.info('Генерация остановлена');
      } catch (e: any) {
        toast.error(`Ошибка: ${e.message}`);
      }
      return;
    }

    try {
      await startGeneration();
      toast.success('Генерация запущена');
    } catch (e: any) {
      toast.error(`Ошибка: ${e.message}`);
    }
  };

  const handleReset = async () => {
    try {
      await resetGeneration();
    } catch (e: any) {
      toast.error(`Ошибка: ${e.message}`);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-header-icon" style={{ background: 'linear-gradient(135deg, hsl(45 100% 55%), hsl(25 100% 55%))' }}>
          <Zap className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-semibold">Генерация</span>
      </div>

      <div className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-4 h-4 text-primary" />
              <p className="text-muted-foreground text-xs">Шаблонов</p>
            </div>
            <p className="text-2xl font-bold text-gradient">{templates.length}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-1">
              <FolderOpen className="w-4 h-4 text-accent" />
              <p className="text-muted-foreground text-xs">Папок</p>
            </div>
            <p className="text-2xl font-bold text-gradient-accent">{folders.length}</p>
          </div>
        </div>

        {/* Progress */}
        {(generationStatus.isRunning || generationStatus.current > 0) && (
          <div className="space-y-2 animate-fade-in">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Прогресс</span>
              <span className="font-mono text-primary">
                {generationStatus.current} / {generationStatus.total}
              </span>
            </div>
            <div className="relative">
              <Progress value={progress} className="h-2" />
            </div>
          </div>
        )}

        {/* Errors */}
        {generationStatus.errors.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 animate-slide-in">
            <div className="flex items-center gap-2 text-destructive text-sm font-medium mb-2">
              <AlertCircle className="w-4 h-4" />
              Ошибки: {generationStatus.errors.length}
            </div>
            <div className="max-h-20 overflow-y-auto scrollbar-thin space-y-1">
              {generationStatus.errors.map((error, i) => (
                <p key={i} className="text-xs text-muted-foreground truncate">
                  {error.file}: {error.error}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Success state */}
        {!generationStatus.isRunning && generationStatus.current > 0 && 
         generationStatus.current === generationStatus.total && (
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 flex items-center gap-3 animate-slide-in">
            <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Генерация завершена!</p>
              <p className="text-xs text-muted-foreground">{generationStatus.total} карточек создано</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleReset}>
              Сбросить
            </Button>
          </div>
        )}

        {/* Generate button */}
        <Button
          className={cn(
            'w-full h-12 text-base font-semibold transition-all duration-300',
            generationStatus.isRunning 
              ? 'bg-destructive hover:bg-destructive/90' 
              : 'bg-gradient-primary hover:opacity-90 shadow-lg shadow-primary/25'
          )}
          disabled={!canGenerate && !generationStatus.isRunning}
          onClick={handleGenerate}
        >
          {generationStatus.isRunning ? (
            <>
              <Square className="w-5 h-5 mr-2" />
              Остановить
            </>
          ) : (
            <>
              <Play className="w-5 h-5 mr-2" />
              Генерировать
            </>
          )}
        </Button>

        {!canGenerate && !generationStatus.isRunning && (
          <p className="text-xs text-muted-foreground text-center">
            Добавьте шаблоны и папки с принтами для начала
          </p>
        )}
      </div>
    </div>
  );
}
