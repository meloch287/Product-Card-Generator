import { X, Palette, Image as ImageIcon } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { Template } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { templatesApi } from '@/api/client';

interface TemplateCardProps {
  template: Template;
  isSelected: boolean;
  onSelect: () => void;
}

export function TemplateCard({ template, isSelected, onSelect }: TemplateCardProps) {
  const { removeTemplate, updateTemplate } = useAppStore();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await removeTemplate(template.id);
      toast.info(`Шаблон "${template.name}" удалён`);
    } catch (err: any) {
      toast.error(`Ошибка: ${err.message}`);
    }
  };

  const handleToggleColor = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newValue = !template.changeBackgroundColor;
    // Update local state
    updateTemplate(template.id, { changeBackgroundColor: newValue });
    // Save to API
    try {
      await templatesApi.update(template.id, { changeBackgroundColor: newValue });
    } catch (err: any) {
      // Revert on error
      updateTemplate(template.id, { changeBackgroundColor: !newValue });
      toast.error(`Ошибка: ${err.message}`);
    }
  };

  const handleToggleProduct = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newValue = !template.addProduct;
    // Update local state
    updateTemplate(template.id, { addProduct: newValue });
    // Save to API
    try {
      await templatesApi.update(template.id, { addProduct: newValue });
    } catch (err: any) {
      // Revert on error
      updateTemplate(template.id, { addProduct: !newValue });
      toast.error(`Ошибка: ${err.message}`);
    }
  };

  return (
    <div
      className={cn(
        'template-card group cursor-pointer',
        isSelected && 'selected'
      )}
      onClick={onSelect}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-background/50 mb-2">
        <img
          src={template.thumbnailUrl}
          alt={template.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        
        {/* Delete button */}
        <button
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive hover:text-destructive-foreground"
          onClick={handleDelete}
        >
          <X className="w-3.5 h-3.5" />
        </button>
        
        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute inset-0 border-2 border-primary rounded-lg pointer-events-none" />
        )}
      </div>

      {/* Name */}
      <p className="text-xs font-medium truncate mb-2">{template.name}</p>

      {/* Options */}
      <div className="flex items-center gap-3 text-xs">
        <label 
          className="flex items-center gap-1.5 cursor-pointer"
          onClick={handleToggleColor}
        >
          <Checkbox 
            checked={template.changeBackgroundColor} 
            className="w-3.5 h-3.5"
          />
          <Palette className="w-3 h-3 text-muted-foreground" />
        </label>
        
        <label 
          className="flex items-center gap-1.5 cursor-pointer"
          onClick={handleToggleProduct}
        >
          <Checkbox 
            checked={template.addProduct} 
            className="w-3.5 h-3.5"
          />
          <ImageIcon className="w-3 h-3 text-muted-foreground" />
        </label>
      </div>
    </div>
  );
}
