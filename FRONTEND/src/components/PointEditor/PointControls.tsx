import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Wand2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/useAppStore';
import { POINT_COLORS, type PointType } from '@/types';
import { cn } from '@/lib/utils';

interface PointControlsProps {
  onAutoDetect: () => void;
  onSave: () => void;
}

const STEP_OPTIONS = [1, 5, 10, 25, 50];

export function PointControls({ onAutoDetect, onSave }: PointControlsProps) {
  const { 
    selectedPoint, 
    setSelectedPoint, 
    moveStep, 
    setMoveStep,
    templates,
    selectedTemplateId,
    updatePoints
  } = useAppStore();

  // Move selected point in direction
  const movePoint = (dx: number, dy: number) => {
    if (!selectedPoint || !selectedTemplateId) return;
    
    const template = templates.find(t => t.id === selectedTemplateId);
    if (!template) return;
    
    const idx = ['tl', 'tr', 'br', 'bl'].indexOf(selectedPoint);
    if (idx === -1) return;
    
    const pts = [...template.points] as typeof template.points;
    pts[idx] = { x: pts[idx].x + dx, y: pts[idx].y + dy };
    updatePoints(selectedTemplateId, pts);
  };

  const pointTypes: PointType[] = ['tl', 'tr', 'br', 'bl'];

  return (
    <div className="space-y-4">
      {/* Point selection */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground font-medium">Точка:</span>
        <div className="flex gap-1.5">
          {pointTypes.map((type) => (
            <button
              key={type}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200',
                selectedPoint === type
                  ? 'ring-2 ring-offset-2 ring-offset-card shadow-lg'
                  : 'opacity-50 hover:opacity-80'
              )}
              style={{
                backgroundColor: POINT_COLORS[type],
                color: type === 'bl' ? '#000' : '#fff',
                boxShadow: selectedPoint === type ? `0 0 20px ${POINT_COLORS[type]}60` : undefined,
              }}
              onClick={() => setSelectedPoint(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Arrow controls and step selector */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Шаг:</span>
          <div className="flex gap-1 bg-secondary/50 rounded-lg p-1">
            {STEP_OPTIONS.map((step) => (
              <button
                key={step}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-mono transition-all',
                  moveStep === step 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
                onClick={() => setMoveStep(step)}
              >
                {step}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            disabled={!selectedPoint}
            onClick={() => movePoint(-moveStep, 0)}
            title="Влево"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex flex-col gap-1">
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              disabled={!selectedPoint}
              onClick={() => movePoint(0, -moveStep)}
              title="Вверх"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              disabled={!selectedPoint}
              onClick={() => movePoint(0, moveStep)}
              title="Вниз"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
          </div>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            disabled={!selectedPoint}
            onClick={() => movePoint(moveStep, 0)}
            title="Вправо"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onAutoDetect}
          className="border-accent/30 hover:bg-accent/10 hover:border-accent/50"
        >
          <Wand2 className="w-4 h-4 mr-1.5" />
          Auto
        </Button>
        <Button 
          size="sm" 
          onClick={onSave}
          className="bg-gradient-primary hover:opacity-90"
        >
          <Save className="w-4 h-4 mr-1.5" />
          Сохранить
        </Button>
      </div>
    </div>
  );
}
