import { useState, useEffect } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';
import { foldersApi } from '@/api/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Supported image formats per Requirements 2.4
export const SUPPORTED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];

export function isSupportedImageFormat(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_IMAGE_FORMATS.includes(ext);
}

interface ImageFile {
  name: string;
  path: string;
}

interface ImageListProps {
  folderId: string | null;
  folderPath: string | null;
  selectedImagePath: string | null;
  onImageSelect: (imagePath: string, folderPath: string) => void;
}

export function ImageList({ folderId, folderPath, selectedImagePath, onImageSelect }: ImageListProps) {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!folderId) {
      setImages([]);
      return;
    }

    setIsLoading(true);
    foldersApi.getFiles(folderId)
      .then((files) => {
        // Filter only supported image formats
        const imageFiles = files.filter((f) => isSupportedImageFormat(f.name));
        setImages(imageFiles);
      })
      .catch((e) => {
        toast.error(`Ошибка загрузки файлов: ${e.message}`);
        setImages([]);
      })
      .finally(() => setIsLoading(false));
  }, [folderId]);

  if (!folderId) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-xs">Выберите папку</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-xs">Нет изображений в папке</p>
        <p className="text-xs mt-1">Поддерживаемые форматы: JPG, PNG, WEBP</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {images.map((image) => (
        <button
          key={image.path}
          onClick={() => folderPath && onImageSelect(image.path, folderPath)}
          className={cn(
            'relative aspect-square rounded-md overflow-hidden border-2 transition-all',
            'hover:border-accent/50 hover:shadow-md',
            selectedImagePath === image.path
              ? 'border-accent ring-2 ring-accent/30'
              : 'border-transparent'
          )}
        >
          <img
            src={`/api/image?path=${encodeURIComponent(image.path)}`}
            alt={image.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1">
            <p className="text-[10px] text-white truncate">{image.name}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
