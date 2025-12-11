import { useCallback, useState } from 'react';
import { Header } from '@/components/Header/Header';
import { FolderBrowser } from '@/components/PhotoEditor/FolderBrowser';
import { ImageList } from '@/components/PhotoEditor/ImageList';
import { EditorCanvas, MaskData } from '@/components/PhotoEditor/EditorCanvas';
import { HealingBrushTool } from '@/components/PhotoEditor/HealingBrushTool';
import { SaveButton } from '@/components/PhotoEditor/SaveButton';
import { CardCreator } from '@/components/PhotoEditor/CardCreator';
import { useEditorStore, AspectRatio } from '@/stores/editorStore';
import { useAppStore } from '@/store/useAppStore';
import { inpaintApi } from '@/api/client';
import { toast } from 'sonner';
import { Loader2, Crop, Paintbrush, Square, RectangleHorizontal, RectangleVertical, Maximize2, Settings2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ASPECT_RATIO_OPTIONS: { value: AspectRatio; label: string; icon: React.ReactNode }[] = [
  { value: 'free', label: 'Свободно', icon: <Maximize2 className="h-4 w-4" /> },
  { value: '1:1', label: '1:1', icon: <Square className="h-4 w-4" /> },
  { value: '3:4', label: '3:4', icon: <RectangleVertical className="h-4 w-4" /> },
  { value: '4:3', label: '4:3', icon: <RectangleHorizontal className="h-4 w-4" /> },
  { value: '2:3', label: '2:3', icon: <RectangleVertical className="h-4 w-4" /> },
  { value: '3:2', label: '3:2', icon: <RectangleHorizontal className="h-4 w-4" /> },
  { value: '16:9', label: '16:9', icon: <RectangleHorizontal className="h-4 w-4" /> },
  { value: '9:16', label: '9:16', icon: <RectangleVertical className="h-4 w-4" /> },
  { value: 'custom', label: 'Своё', icon: <Settings2 className="h-4 w-4" /> },
];

const PhotoEditorPage = () => {
  const { folders } = useAppStore();
  const {
    selectedFolderId,
    setSelectedFolderId,
    selectedImagePath,
    currentImage,
    isLoadingImage,
    isProcessingInpaint,
    loadImage,
    activeTool,
    setActiveTool,
    cropSettings,
    setCropAspectRatio,
    setCropSettings,
    updateWorkingImage,
    setIsProcessingInpaint,
  } = useEditorStore();

  // Get the selected folder's path
  const selectedFolder = folders.find((f) => f.id === selectedFolderId);
  const selectedFolderPath = selectedFolder?.path || null;

  const handleFolderSelect = useCallback((folderId: string) => {
    setSelectedFolderId(folderId);
  }, [setSelectedFolderId]);

  const handleImageSelect = useCallback(async (imagePath: string, folderPath: string) => {
    try {
      await loadImage(imagePath, folderPath);
    } catch (e: any) {
      toast.error(`Ошибка загрузки изображения: ${e.message}`);
    }
  }, [loadImage]);

  const handleCropToolClick = useCallback(() => {
    if (activeTool === 'crop') {
      setActiveTool(null);
    } else {
      setActiveTool('crop');
    }
  }, [activeTool, setActiveTool]);

  // Custom ratio state
  const [customWidth, setCustomWidth] = useState(cropSettings.customRatio?.width?.toString() || '1');
  const [customHeight, setCustomHeight] = useState(cropSettings.customRatio?.height?.toString() || '1');

  const handleAspectRatioChange = useCallback((ratio: AspectRatio) => {
    setCropAspectRatio(ratio);
  }, [setCropAspectRatio]);

  const handleCustomRatioChange = useCallback((width: string, height: string) => {
    const w = parseInt(width) || 1;
    const h = parseInt(height) || 1;
    setCropSettings({ customRatio: { width: w, height: h } });
  }, [setCropSettings]);

  // Convert current working image to base64
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

  // Convert mask data to base64 (full image size with white where painted)
  const getMaskAsBase64 = useCallback((maskData: MaskData): string | null => {
    const workingImage = currentImage?.workingImage;
    if (!workingImage) return null;
    
    const width = workingImage.naturalWidth || (workingImage as unknown as HTMLCanvasElement).width;
    const height = workingImage.naturalHeight || (workingImage as unknown as HTMLCanvasElement).height;
    
    // Create a full-size mask canvas (black background)
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    
    const ctx = maskCanvas.getContext('2d');
    if (!ctx) return null;
    
    // Fill with black (areas not to inpaint)
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height);
    
    // Draw the mask data at the correct position
    // Convert RGBA mask data to white pixels where there's any red channel
    const { bounds, imageData } = maskData;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = bounds.width;
    tempCanvas.height = bounds.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;
    
    // Create white mask from the red channel of the mask data
    const whiteMaskData = tempCtx.createImageData(bounds.width, bounds.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      // If there's any red (from the red brush stroke), make it white
      const hasColor = imageData.data[i] > 0 || imageData.data[i + 1] > 0 || imageData.data[i + 2] > 0;
      const value = hasColor ? 255 : 0;
      whiteMaskData.data[i] = value;     // R
      whiteMaskData.data[i + 1] = value; // G
      whiteMaskData.data[i + 2] = value; // B
      whiteMaskData.data[i + 3] = 255;   // A
    }
    tempCtx.putImageData(whiteMaskData, 0, 0);
    
    // Draw the white mask portion onto the full mask canvas
    ctx.drawImage(tempCanvas, bounds.x, bounds.y);
    
    return maskCanvas.toDataURL('image/png');
  }, [currentImage]);

  // Handle healing brush stroke completion
  const handleHealingStroke = useCallback(async (maskData: MaskData) => {
    if (isProcessingInpaint) {
      toast.warning('Обработка уже выполняется');
      return;
    }
    
    const imageBase64 = getImageAsBase64();
    const maskBase64 = getMaskAsBase64(maskData);
    
    if (!imageBase64 || !maskBase64) {
      toast.error('Не удалось подготовить данные для обработки');
      return;
    }
    
    setIsProcessingInpaint(true);
    
    try {
      const response = await inpaintApi.inpaint(imageBase64, maskBase64);
      
      // Update the working image with the result
      await updateWorkingImage(response.result);
      
      toast.success('Область успешно обработана');
    } catch (error: any) {
      console.error('Inpainting error:', error);
      toast.error(`Ошибка обработки: ${error.message || 'Неизвестная ошибка'}`);
    } finally {
      setIsProcessingInpaint(false);
    }
  }, [isProcessingInpaint, getImageAsBase64, getMaskAsBase64, setIsProcessingInpaint, updateWorkingImage]);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Header />
      
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left panel - Folders & Images */}
        <aside className="w-[280px] shrink-0 border-r border-border bg-background-secondary flex flex-col overflow-hidden">
          {/* Folder Browser Section */}
          <div className="p-4 border-b border-border shrink-0">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Папки</h3>
            <FolderBrowser
              selectedFolderId={selectedFolderId}
              onFolderSelect={handleFolderSelect}
            />
          </div>
          
          {/* Image List Section */}
          <div className="flex-1 p-4 overflow-y-auto scrollbar-thin">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Изображения</h3>
            <ImageList
              folderId={selectedFolderId}
              folderPath={selectedFolderPath}
              selectedImagePath={selectedImagePath}
              onImageSelect={handleImageSelect}
            />
          </div>
          
          {/* Tools Section */}
          <div className="p-4 shrink-0 border-t border-border">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Инструменты</h3>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button
                  variant={activeTool === 'crop' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  disabled={!currentImage}
                  onClick={handleCropToolClick}
                >
                  <Crop className="h-4 w-4 mr-2" />
                  Обрезка
                </Button>
                <Button
                  variant={activeTool === 'healing' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  disabled={!currentImage}
                  onClick={() => setActiveTool(activeTool === 'healing' ? null : 'healing')}
                >
                  <Paintbrush className="h-4 w-4 mr-2" />
                  Кисть
                </Button>
              </div>
              
              {/* Aspect ratio selector (visible when crop tool is active) */}
              {activeTool === 'crop' && (
                <div className="mt-2 space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Соотношение сторон</label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-between">
                          {cropSettings.aspectRatio === 'custom' 
                            ? `${cropSettings.customRatio?.width || 1}:${cropSettings.customRatio?.height || 1}`
                            : ASPECT_RATIO_OPTIONS.find(o => o.value === (cropSettings.aspectRatio || 'free'))?.label || 'Свободно'}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[200px]">
                        {ASPECT_RATIO_OPTIONS.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            onClick={() => handleAspectRatioChange(option.value)}
                            className="flex items-center gap-2"
                          >
                            {option.icon}
                            <span>{option.label}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  
                  {/* Custom ratio inputs */}
                  {cropSettings.aspectRatio === 'custom' && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={customWidth}
                        onChange={(e) => {
                          setCustomWidth(e.target.value);
                          handleCustomRatioChange(e.target.value, customHeight);
                        }}
                        className="h-8 w-16 text-center"
                      />
                      <span className="text-muted-foreground">:</span>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={customHeight}
                        onChange={(e) => {
                          setCustomHeight(e.target.value);
                          handleCustomRatioChange(customWidth, e.target.value);
                        }}
                        className="h-8 w-16 text-center"
                      />
                    </div>
                  )}
                  

                  
                  {/* Allow out of bounds toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Выход за границы</label>
                    <button
                      onClick={() => setCropSettings({ allowOutOfBounds: !cropSettings.allowOutOfBounds })}
                      className={`w-10 h-5 rounded-full transition-colors ${
                        cropSettings.allowOutOfBounds ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        cropSettings.allowOutOfBounds ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                  
                  {/* Fill mode selector (only when out of bounds is enabled) */}
                  {cropSettings.allowOutOfBounds && (
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground block">Заливка фона</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setCropSettings({ fillMode: 'transparent' })}
                          className={`flex-1 h-8 rounded border text-xs flex items-center justify-center gap-1 ${
                            cropSettings.fillMode === 'transparent' 
                              ? 'border-primary bg-primary/10 text-primary' 
                              : 'border-border text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          <span className="w-4 h-4 rounded bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOCIgaGVpZ2h0PSI4IiB2aWV3Qm94PSIwIDAgOCA4IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNjY2MiLz48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjY2NjIi8+PC9zdmc+')]" />
                          Прозрачный
                        </button>
                        <button
                          onClick={() => setCropSettings({ fillMode: 'color' })}
                          className={`flex-1 h-8 rounded border text-xs flex items-center justify-center gap-1 ${
                            cropSettings.fillMode === 'color' 
                              ? 'border-primary bg-primary/10 text-primary' 
                              : 'border-border text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          <span 
                            className="w-4 h-4 rounded border border-border" 
                            style={{ backgroundColor: cropSettings.fillColor }}
                          />
                          Цвет
                        </button>
                      </div>
                      
                      {/* Color picker (only when color mode is selected) */}
                      {cropSettings.fillMode === 'color' && (
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-muted-foreground">Цвет</label>
                          <input
                            type="color"
                            value={cropSettings.fillColor}
                            onChange={(e) => setCropSettings({ fillColor: e.target.value })}
                            className="w-8 h-8 rounded border border-border cursor-pointer"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* Healing brush settings (visible when healing tool is active) */}
              {activeTool === 'healing' && (
                <HealingBrushTool className="mt-3 pt-3 border-t border-border" />
              )}
              
              {/* Save button */}
              <div className="mt-3 pt-3 border-t border-border">
                <SaveButton />
              </div>
            </div>
          </div>
        </aside>

        {/* Center - Canvas */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 flex flex-col m-4 rounded-lg border border-border overflow-hidden">
            {isLoadingImage ? (
              <div className="flex-1 flex items-center justify-center bg-muted/30">
                <div className="text-center text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                  <p className="text-sm">Загрузка изображения...</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col relative">
                <EditorCanvas onHealingStroke={handleHealingStroke} />
                {isProcessingInpaint && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
                      <p className="text-sm text-muted-foreground">Обработка области...</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* Right panel - Cards */}
        <aside className="w-[320px] shrink-0 border-l border-border bg-background-secondary p-4 overflow-y-auto scrollbar-thin">
          <CardCreator />
        </aside>
      </div>
    </div>
  );
};

export default PhotoEditorPage;
