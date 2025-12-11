import { useState, useCallback } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/stores/editorStore';
import { saveImageApi } from '@/api/client';
import { toast } from 'sonner';

interface SaveButtonProps {
  className?: string;
}

/**
 * Extracts filename from a full file path.
 */
function extractFilename(path: string): string {
  // Handle both Windows and Unix paths
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || 'image.png';
}

/**
 * SaveButton component for saving edited images back to the source folder.
 * 
 * **Feature: photo-editor-tab, Property 6: Save path preservation**
 * The saved file path should be within the Source_Folder from which the image
 * was originally loaded, and the filename should contain the original filename.
 */
export const SaveButton = ({ className }: SaveButtonProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const { currentImage, selectedImagePath } = useEditorStore();

  /**
   * Convert the current working image to base64 PNG format.
   */
  const getImageAsBase64 = useCallback((): string | null => {
    const workingImage = currentImage?.workingImage;
    if (!workingImage) return null;

    const canvas = document.createElement('canvas');
    const width = workingImage.naturalWidth || (workingImage as unknown as HTMLCanvasElement).width;
    const height = workingImage.naturalHeight || (workingImage as unknown as HTMLCanvasElement).height;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(workingImage, 0, 0);
    return canvas.toDataURL('image/png');
  }, [currentImage]);

  /**
   * Handle save button click.
   * Saves the edited image to output/editor folder.
   */
  const handleSave = useCallback(async () => {
    if (!currentImage?.workingImage || !selectedImagePath) {
      toast.error('Нет изображения для сохранения');
      return;
    }

    const imageBase64 = getImageAsBase64();
    if (!imageBase64) {
      toast.error('Не удалось подготовить изображение для сохранения');
      return;
    }

    const filename = extractFilename(selectedImagePath);

    setIsSaving(true);

    try {
      const response = await saveImageApi.save(
        imageBase64,
        '',  // Not used anymore, saves to output/editor
        filename,
        '_edited'
      );

      if (response.success) {
        toast.success(`Сохранено в output/editor: ${response.filename}`);
      } else {
        toast.error('Не удалось сохранить изображение');
      }
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error(`Ошибка сохранения: ${error.message || 'Неизвестная ошибка'}`);
    } finally {
      setIsSaving(false);
    }
  }, [currentImage, selectedImagePath, getImageAsBase64]);

  const isDisabled = !currentImage?.workingImage || !selectedImagePath || isSaving;

  return (
    <div className={className}>
      <Button
        variant="default"
        size="sm"
        className="w-full"
        disabled={isDisabled}
        onClick={handleSave}
      >
        {isSaving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Сохранение...
          </>
        ) : (
          <>
            <Save className="h-4 w-4 mr-2" />
            Сохранить
          </>
        )}
      </Button>
      <p className="text-xs text-muted-foreground mt-1">
        → output/editor/
      </p>
    </div>
  );
};

export default SaveButton;
