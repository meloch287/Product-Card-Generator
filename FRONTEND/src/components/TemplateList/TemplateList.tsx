import { useCallback, useState, useEffect } from 'react';
import { Plus, Upload, Image, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TemplateCard } from './TemplateCard';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function TemplateList() {
  const { 
    templates, 
    selectedTemplateId, 
    selectTemplate, 
    uploadTemplate,
    fetchTemplates,
    isLoading 
  } = useAppStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch templates on mount
  useEffect(() => {
    fetchTemplates().catch((e) => toast.error(`Ошибка загрузки: ${e.message}`));
  }, [fetchTemplates]);

  const handleUpload = useCallback(async (files: FileList | File[]) => {
    if (templates.length >= 10) {
      toast.error('Максимум 10 шаблонов');
      return;
    }

    setIsUploading(true);
    const fileArray = Array.from(files).filter((file) =>
      file.type.startsWith('image/') || file.name.endsWith('.psd')
    );

    for (const file of fileArray) {
      if (templates.length >= 10) break;
      try {
        const template = await uploadTemplate(file);
        toast.success(`Шаблон "${template.name}" добавлен`);
      } catch (e: any) {
        toast.error(`Ошибка: ${e.message}`);
      }
    }
    setIsUploading(false);
  }, [uploadTemplate, templates.length]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleUpload(e.dataTransfer.files);
  }, [handleUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleUpload(e.target.files);
    }
    e.target.value = '';
  }, [handleUpload]);

  if (isLoading && templates.length === 0) {
    return (
      <div className="panel">
        <div className="panel-header">
          <div className="panel-header-icon">
            <Image className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold">Шаблоны</span>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-header-icon">
          <Image className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-semibold">Шаблоны</span>
        <span className="text-muted-foreground font-normal text-xs ml-auto bg-secondary/80 px-2 py-0.5 rounded-full">
          {templates.length}/10
        </span>
      </div>

      {templates.length === 0 ? (
        <div
          className={cn('drop-zone', isDragging && 'active')}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-primary/20 flex items-center justify-center mb-2">
            {isUploading ? (
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
            ) : (
              <Upload className="w-7 h-7 text-primary" />
            )}
          </div>
          <p className="text-sm font-medium">Перетащите изображения сюда</p>
          <p className="text-xs text-muted-foreground">PNG, JPG, PSD</p>
          <label className="mt-3">
            <input
              type="file"
              multiple
              accept="image/*,.psd"
              className="hidden"
              onChange={handleFileSelect}
              disabled={isUploading}
            />
            <Button size="sm" variant="outline" className="cursor-pointer" asChild disabled={isUploading}>
              <span>
                <Plus className="w-4 h-4 mr-1.5" />
                Выбрать файлы
              </span>
            </Button>
          </label>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className={cn('grid grid-cols-2 gap-3', isDragging && 'opacity-50')}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isSelected={template.id === selectedTemplateId}
                onSelect={() => selectTemplate(template.id)}
              />
            ))}
          </div>

          {templates.length < 10 && (
            <label className="block">
              <input
                type="file"
                multiple
                accept="image/*,.psd"
                className="hidden"
                onChange={handleFileSelect}
                disabled={isUploading}
              />
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full cursor-pointer border-dashed border-primary/30 hover:border-primary/50 hover:bg-primary/5" 
                asChild
                disabled={isUploading}
              >
                <span>
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-1.5" />
                  )}
                  Добавить шаблон
                </span>
              </Button>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
