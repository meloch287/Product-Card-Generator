import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FolderBrowser } from '@/components/PhotoEditor/FolderBrowser';
import { ImageList } from '@/components/PhotoEditor/ImageList';
import { useAppStore } from '@/store/useAppStore';
import { ImageIcon, Check, X, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedImages: string[];
  onImagesSelect: (images: string[]) => void;
  maxImages?: number;
}

export function ImageSelector({ 
  open, 
  onOpenChange, 
  selectedImages, 
  onImagesSelect,
  maxImages = 30 
}: ImageSelectorProps) {
  const { folders } = useAppStore();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [tempSelectedImages, setTempSelectedImages] = useState<string[]>([]);

  // Get the selected folder's path
  const selectedFolder = folders.find((f) => f.id === selectedFolderId);
  const selectedFolderPath = selectedFolder?.path || null;

  // Initialize temp selection when dialog opens
  useEffect(() => {
    if (open) {
      setTempSelectedImages([...selectedImages]);
    }
  }, [open, selectedImages]);

  const handleImageSelect = (imagePath: string) => {
    setTempSelectedImages(prev => {
      const isSelected = prev.includes(imagePath);
      if (isSelected) {
        // Remove from selection
        return prev.filter(path => path !== imagePath);
      } else {
        // Add to selection if under limit
        if (prev.length >= maxImages) {
          return prev; // Don't add if at limit
        }
        return [...prev, imagePath];
      }
    });
  };

  const handleSave = () => {
    onImagesSelect(tempSelectedImages);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setTempSelectedImages([...selectedImages]);
    onOpenChange(false);
  };

  const isImageSelected = (imagePath: string) => tempSelectedImages.includes(imagePath);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const validFiles = Array.from(files).filter(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      return ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
    });

    if (validFiles.length === 0) {
      alert('Выберите изображения в формате JPG, PNG или WEBP');
      return;
    }

    if (tempSelectedImages.length + validFiles.length > maxImages) {
      alert(`Можно выбрать максимум ${maxImages} изображений`);
      return;
    }

    // Convert files to data URLs for preview
    const filePromises = validFiles.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
    });

    try {
      const dataUrls = await Promise.all(filePromises);
      setTempSelectedImages(prev => [...prev, ...dataUrls]);
    } catch (error) {
      alert('Ошибка при загрузке файлов');
    }

    // Reset input
    event.target.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Выбор изображений</DialogTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {tempSelectedImages.length} / {maxImages}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex gap-4 min-h-0">
          {/* Left panel - Folder browser */}
          <div className="w-64 shrink-0 border-r pr-4">
            <div className="mb-3">
              <h3 className="text-sm font-medium mb-2">Папки с изображениями</h3>
            </div>
            <FolderBrowser
              selectedFolderId={selectedFolderId}
              onFolderSelect={setSelectedFolderId}
            />
          </div>

          {/* Right panel - Image grid */}
          <div className="flex-1 overflow-y-auto">
            {!selectedFolderId ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <ImageIcon className="w-16 h-16 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium mb-2">Выберите папку</h3>
                <p className="text-muted-foreground">
                  Выберите папку слева, чтобы просмотреть изображения
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">
                    Изображения в папке: {selectedFolder?.name}
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('file-upload')?.click()}
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      Загрузить файлы
                    </Button>
                    {tempSelectedImages.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTempSelectedImages([])}
                      >
                        Очистить выбор
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Show uploaded files first */}
                {tempSelectedImages.some(img => img.startsWith('data:')) && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium mb-2">Загруженные файлы</h4>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                      {tempSelectedImages
                        .filter(img => img.startsWith('data:'))
                        .map((img, index) => (
                          <button
                            key={`uploaded-${index}`}
                            onClick={() => handleImageSelect(img)}
                            className="relative aspect-square rounded-lg overflow-hidden border-2 border-primary ring-2 ring-primary/30 transition-all hover:shadow-md"
                          >
                            <img
                              src={img}
                              alt={`Uploaded ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-1">
                              <Check className="w-3 h-3" />
                            </div>
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                              <p className="text-[10px] text-white truncate">Загружено {index + 1}</p>
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                <CustomImageList
                  folderId={selectedFolderId}
                  folderPath={selectedFolderPath}
                  selectedImages={tempSelectedImages}
                  onImageSelect={handleImageSelect}
                  maxImages={maxImages}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {tempSelectedImages.length > 0 && (
              <span>Выбрано {tempSelectedImages.length} изображений</span>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleCancel}>
              Отмена
            </Button>
            <Button onClick={handleSave}>
              Выбрать ({tempSelectedImages.length})
            </Button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          id="file-upload"
          type="file"
          multiple
          accept="image/jpeg,image/jpg,image/png,image/webp"
          onChange={handleFileUpload}
          className="hidden"
        />
      </DialogContent>
    </Dialog>
  );
}

// Custom ImageList component for selection
interface CustomImageListProps {
  folderId: string | null;
  folderPath: string | null;
  selectedImages: string[];
  onImageSelect: (imagePath: string) => void;
  maxImages: number;
}

function CustomImageList({ 
  folderId, 
  folderPath, 
  selectedImages, 
  onImageSelect,
  maxImages 
}: CustomImageListProps) {
  const [images, setImages] = useState<Array<{ name: string; path: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!folderId) {
      setImages([]);
      return;
    }

    setIsLoading(true);
    import('@/api/client').then(({ foldersApi }) => {
      foldersApi.getFiles(folderId)
        .then((files) => {
          // Filter only supported image formats
          const imageFiles = files.filter((f) => {
            const ext = f.name.split('.').pop()?.toLowerCase() || '';
            return ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
          });
          setImages(imageFiles);
        })
        .catch(() => setImages([]))
        .finally(() => setIsLoading(false));
    });
  }, [folderId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Нет изображений в папке</p>
        <p className="text-xs mt-1">Поддерживаемые форматы: JPG, PNG, WEBP</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
      {images.map((image) => {
        const isSelected = selectedImages.includes(image.path);
        const canSelect = selectedImages.length < maxImages || isSelected;
        
        return (
          <button
            key={image.path}
            onClick={() => canSelect && onImageSelect(image.path)}
            disabled={!canSelect}
            className={cn(
              'relative aspect-square rounded-lg overflow-hidden border-2 transition-all',
              'hover:shadow-md',
              isSelected
                ? 'border-primary ring-2 ring-primary/30'
                : canSelect
                ? 'border-border hover:border-primary/50'
                : 'border-border opacity-50 cursor-not-allowed'
            )}
          >
            <img
              src={`/api/image?path=${encodeURIComponent(image.path)}`}
              alt={image.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            
            {/* Selection indicator */}
            {isSelected && (
              <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-1">
                <Check className="w-3 h-3" />
              </div>
            )}
            
            {/* Image name */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1">
              <p className="text-[10px] text-white truncate">{image.name}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}