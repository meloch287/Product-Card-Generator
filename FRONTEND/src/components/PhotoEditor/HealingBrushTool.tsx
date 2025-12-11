import { useCallback } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Paintbrush } from 'lucide-react';

const MIN_BRUSH_SIZE = 1;
const MAX_BRUSH_SIZE = 100;

export interface HealingBrushToolProps {
  className?: string;
}

export function HealingBrushTool({ className }: HealingBrushToolProps) {
  const { brushSettings, setBrushSize } = useEditorStore();

  const handleSizeChange = useCallback((value: number[]) => {
    const newSize = value[0];
    if (newSize >= MIN_BRUSH_SIZE && newSize <= MAX_BRUSH_SIZE) {
      setBrushSize(newSize);
    }
  }, [setBrushSize]);

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-3">
        <Paintbrush className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Восстанавливающая кисть</span>
      </div>
      
      <div className="space-y-4">
        {/* Brush Size Control */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="brush-size" className="text-xs text-muted-foreground">
              Размер кисти
            </Label>
            <span className="text-xs text-muted-foreground font-mono">
              {brushSettings.size}px
            </span>
          </div>
          <Slider
            id="brush-size"
            min={MIN_BRUSH_SIZE}
            max={MAX_BRUSH_SIZE}
            step={1}
            value={[brushSettings.size]}
            onValueChange={handleSizeChange}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{MIN_BRUSH_SIZE}px</span>
            <span>{MAX_BRUSH_SIZE}px</span>
          </div>
        </div>

        {/* Brush Preview */}
        <div className="flex items-center justify-center p-4 bg-muted/30 rounded-md">
          <div
            className="rounded-full bg-primary/50 border border-primary"
            style={{
              width: Math.min(brushSettings.size, 60),
              height: Math.min(brushSettings.size, 60),
            }}
            title={`Размер кисти: ${brushSettings.size}px`}
          />
        </div>

        {/* Usage Instructions */}
        <p className="text-xs text-muted-foreground">
          Закрасьте область для удаления дефектов. При отпускании кисти область будет обработана автоматически.
        </p>
      </div>
    </div>
  );
}

export { MIN_BRUSH_SIZE, MAX_BRUSH_SIZE };
