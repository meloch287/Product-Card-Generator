import { useCallback, useRef } from 'react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAppStore } from '@/store/useAppStore';
import type { Template } from '@/types';
import { Circle, Droplets, Palette, Package, Images, Image } from 'lucide-react';
import { templatesApi } from '@/api/client';

interface SettingsPanelProps {
  template: Template;
  onModeToggle?: (isMulti: boolean) => void;
}

export function SettingsPanel({ template, onModeToggle }: SettingsPanelProps) {
  const { updateTemplate } = useAppStore();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced save to API
  const debouncedSave = useCallback((id: string, updates: Partial<Template>) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      templatesApi.update(id, updates).catch(console.error);
    }, 300);
  }, []);

  const handleRadiusChange = useCallback(([value]: number[]) => {
    updateTemplate(template.id, { cornerRadius: value });
    debouncedSave(template.id, { cornerRadius: value });
  }, [template.id, updateTemplate, debouncedSave]);

  const handleBlendChange = useCallback(([value]: number[]) => {
    const blendValue = value / 100;
    updateTemplate(template.id, { blendStrength: blendValue });
    debouncedSave(template.id, { blendStrength: blendValue });
  }, [template.id, updateTemplate, debouncedSave]);

  const handleColorChange = useCallback(async (checked: boolean) => {
    // Update local state first for immediate UI feedback
    updateTemplate(template.id, { changeBackgroundColor: checked });
    // Save to backend
    try {
      await templatesApi.update(template.id, { changeBackgroundColor: checked });
    } catch (e) {
      // Revert on error
      updateTemplate(template.id, { changeBackgroundColor: !checked });
    }
  }, [template.id, updateTemplate]);

  const handleProductChange = useCallback(async (checked: boolean) => {
    // Update local state first for immediate UI feedback
    updateTemplate(template.id, { addProduct: checked });
    // Save to backend
    try {
      await templatesApi.update(template.id, { addProduct: checked });
    } catch (e) {
      // Revert on error
      updateTemplate(template.id, { addProduct: !checked });
    }
  }, [template.id, updateTemplate]);

  return (
    <div className="space-y-5 pt-4 border-t border-border/50">
      {/* Mode toggle and checkboxes */}
      <div className="flex flex-wrap gap-4">
        {/* Multi-mode toggle */}
        {onModeToggle && (
          <div className="flex items-center gap-2">
            <Switch
              id="multi-mode"
              checked={template.isMultiMode ?? false}
              onCheckedChange={onModeToggle}
            />
            <Label htmlFor="multi-mode" className="text-sm flex items-center gap-1.5 cursor-pointer">
              {template.isMultiMode ? (
                <Images className="w-4 h-4 text-purple-400" />
              ) : (
                <Image className="w-4 h-4 text-muted-foreground" />
              )}
              {template.isMultiMode ? 'Несколько фото' : 'Одна фото'}
            </Label>
          </div>
        )}
        
        <div className="flex items-center gap-2">
          <Switch
            id="change-color"
            checked={template.changeBackgroundColor}
            onCheckedChange={handleColorChange}
          />
          <Label htmlFor="change-color" className="text-sm flex items-center gap-1.5 cursor-pointer">
            <Palette className="w-4 h-4 text-accent" />
            Цвет фона
          </Label>
        </div>
        
        <div className="flex items-center gap-2">
          <Switch
            id="add-product"
            checked={template.addProduct}
            onCheckedChange={handleProductChange}
          />
          <Label htmlFor="add-product" className="text-sm flex items-center gap-1.5 cursor-pointer">
            <Package className="w-4 h-4 text-primary" />
            Коврик
          </Label>
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm flex items-center gap-2 font-medium">
            <Circle className="w-4 h-4 text-primary" />
            Радиус скругления
          </Label>
          <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
            {template.cornerRadius}px
          </span>
        </div>
        <Slider
          value={[template.cornerRadius]}
          min={0}
          max={200}
          step={1}
          onValueChange={handleRadiusChange}
          className="[&_[role=slider]]:bg-gradient-primary [&_[role=slider]]:border-0 [&_[role=slider]]:shadow-lg [&_[role=slider]]:shadow-primary/30"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm flex items-center gap-2 font-medium">
            <Droplets className="w-4 h-4 text-accent" />
            Blend (размытие)
          </Label>
          <span className="text-xs font-mono text-accent bg-accent/10 px-2 py-0.5 rounded">
            {Math.round(template.blendStrength * 100)}%
          </span>
        </div>
        <Slider
          value={[template.blendStrength * 100]}
          min={0}
          max={50}
          step={1}
          onValueChange={handleBlendChange}
          className="[&_[role=slider]]:bg-gradient-accent [&_[role=slider]]:border-0 [&_[role=slider]]:shadow-lg [&_[role=slider]]:shadow-accent/30"
        />
      </div>
    </div>
  );
}
