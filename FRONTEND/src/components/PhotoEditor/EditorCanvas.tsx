import { useRef, useEffect, useState, useCallback, WheelEvent, MouseEvent } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CropOverlay } from './CropOverlay';
import { initializeCropArea } from './cropUtils';

interface ViewState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface MaskData {
  imageData: ImageData;
  bounds: { x: number; y: number; width: number; height: number };
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const ZOOM_SENSITIVITY = 0.001;

export interface EditorCanvasProps {
  onHealingStroke?: (maskData: MaskData) => void;
}

export function EditorCanvas({ onHealingStroke }: EditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    currentImage,
    activeTool,
    cropSettings,
    brushSettings,
    setCropArea,
    applyCrop,
    setActiveTool,
  } = useEditorStore();
  
  const [viewState, setViewState] = useState<ViewState>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
  
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const [cropInitialized, setCropInitialized] = useState(false);
  
  // Healing brush state
  const [isDrawingMask, setIsDrawingMask] = useState(false);
  const [lastDrawPoint, setLastDrawPoint] = useState<{ x: number; y: number } | null>(null);
  const [maskBounds, setMaskBounds] = useState<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);

  // Get the current working image (after crops) or original
  const displayImage = currentImage?.workingImage || currentImage?.original;

  // Draw image on canvas with current view state
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    
    if (!canvas || !ctx || !displayImage) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Save context state
    ctx.save();
    
    // Apply transformations
    ctx.translate(viewState.offsetX, viewState.offsetY);
    ctx.scale(viewState.scale, viewState.scale);
    
    // Draw image
    ctx.drawImage(displayImage, 0, 0);
    
    // Restore context state
    ctx.restore();
  }, [displayImage, viewState]);


  // Fit image to container
  const fitToContainer = useCallback(() => {
    const container = containerRef.current;
    
    if (!container || !displayImage) return;
    
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const imageWidth = displayImage.naturalWidth || (displayImage as unknown as HTMLCanvasElement).width;
    const imageHeight = displayImage.naturalHeight || (displayImage as unknown as HTMLCanvasElement).height;
    
    // Calculate scale to fit image in container with padding
    const padding = 40;
    const scaleX = (containerWidth - padding * 2) / imageWidth;
    const scaleY = (containerHeight - padding * 2) / imageHeight;
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 100%
    
    // Center the image
    const scaledWidth = imageWidth * scale;
    const scaledHeight = imageHeight * scale;
    const offsetX = (containerWidth - scaledWidth) / 2;
    const offsetY = (containerHeight - scaledHeight) / 2;
    
    setViewState({ scale, offsetX, offsetY });
  }, [displayImage]);

  // Initialize canvas size and fit image when container or image changes
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    
    if (!container || !canvas) return;
    
    const resizeObserver = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      fitToContainer();
    });
    
    resizeObserver.observe(container);
    
    return () => resizeObserver.disconnect();
  }, [fitToContainer]);

  // Redraw canvas when view state or image changes
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Fit to container when image loads
  useEffect(() => {
    if (displayImage) {
      fitToContainer();
    }
  }, [displayImage, fitToContainer]);

  // Clear mask canvas when tool changes or image changes
  useEffect(() => {
    const maskCanvas = maskCanvasRef.current;
    if (maskCanvas) {
      const ctx = maskCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      }
    }
    setMaskBounds(null);
  }, [activeTool, displayImage]);

  // Sync mask canvas size with main canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (canvas && maskCanvas) {
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
    }
  }, [viewState]);

  // Initialize crop area when crop tool is activated or aspect ratio changes
  useEffect(() => {
    if (activeTool === 'crop' && displayImage) {
      const imageWidth = displayImage.naturalWidth || (displayImage as unknown as HTMLCanvasElement).width;
      const imageHeight = displayImage.naturalHeight || (displayImage as unknown as HTMLCanvasElement).height;
      const initialCrop = initializeCropArea(imageWidth, imageHeight, cropSettings.aspectRatio, cropSettings.customRatio);
      setCropArea(initialCrop);
      setCropInitialized(true);
    } else if (activeTool !== 'crop') {
      setCropInitialized(false);
    }
  }, [activeTool, displayImage, cropSettings.aspectRatio, cropSettings.customRatio, setCropArea]);


  // Convert screen coordinates to image coordinates
  const screenToImageCoords = useCallback((screenX: number, screenY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;
    
    // Convert from canvas space to image space
    const imageX = (canvasX - viewState.offsetX) / viewState.scale;
    const imageY = (canvasY - viewState.offsetY) / viewState.scale;
    
    return { x: imageX, y: imageY };
  }, [viewState]);

  // Draw on mask canvas
  const drawMaskStroke = useCallback((fromX: number, fromY: number, toX: number, toY: number) => {
    const maskCanvas = maskCanvasRef.current;
    const ctx = maskCanvas?.getContext('2d');
    if (!maskCanvas || !ctx) return;
    
    // Convert image coordinates to canvas coordinates for drawing
    const canvasFromX = fromX * viewState.scale + viewState.offsetX;
    const canvasFromY = fromY * viewState.scale + viewState.offsetY;
    const canvasToX = toX * viewState.scale + viewState.offsetX;
    const canvasToY = toY * viewState.scale + viewState.offsetY;
    
    // Scale brush size with view
    const scaledBrushSize = brushSettings.size * viewState.scale;
    
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
    ctx.lineWidth = scaledBrushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    ctx.moveTo(canvasFromX, canvasFromY);
    ctx.lineTo(canvasToX, canvasToY);
    ctx.stroke();
    
    // Update mask bounds (in image coordinates)
    const halfBrush = brushSettings.size / 2;
    setMaskBounds(prev => {
      const minX = Math.min(fromX, toX) - halfBrush;
      const minY = Math.min(fromY, toY) - halfBrush;
      const maxX = Math.max(fromX, toX) + halfBrush;
      const maxY = Math.max(fromY, toY) + halfBrush;
      
      if (!prev) {
        return { minX, minY, maxX, maxY };
      }
      
      return {
        minX: Math.min(prev.minX, minX),
        minY: Math.min(prev.minY, minY),
        maxX: Math.max(prev.maxX, maxX),
        maxY: Math.max(prev.maxY, maxY),
      };
    });
  }, [viewState, brushSettings.size]);

  // Extract mask data from the mask canvas
  const extractMaskData = useCallback((): MaskData | null => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas || !maskBounds || !displayImage) return null;
    
    const imageWidth = displayImage.naturalWidth || (displayImage as unknown as HTMLCanvasElement).width;
    const imageHeight = displayImage.naturalHeight || (displayImage as unknown as HTMLCanvasElement).height;
    
    // Clamp bounds to image dimensions
    const bounds = {
      x: Math.max(0, Math.floor(maskBounds.minX)),
      y: Math.max(0, Math.floor(maskBounds.minY)),
      width: Math.min(imageWidth, Math.ceil(maskBounds.maxX)) - Math.max(0, Math.floor(maskBounds.minX)),
      height: Math.min(imageHeight, Math.ceil(maskBounds.maxY)) - Math.max(0, Math.floor(maskBounds.minY)),
    };
    
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    
    // Create a temporary canvas to extract mask data in image coordinates
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = bounds.width;
    tempCanvas.height = bounds.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;
    
    // Draw the mask portion from the mask canvas, transforming from canvas to image space
    const ctx = maskCanvas.getContext('2d');
    if (!ctx) return null;
    
    // Get the mask canvas data and transform it to image space
    const sourceX = bounds.x * viewState.scale + viewState.offsetX;
    const sourceY = bounds.y * viewState.scale + viewState.offsetY;
    const sourceWidth = bounds.width * viewState.scale;
    const sourceHeight = bounds.height * viewState.scale;
    
    tempCtx.drawImage(
      maskCanvas,
      sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, bounds.width, bounds.height
    );
    
    const imageData = tempCtx.getImageData(0, 0, bounds.width, bounds.height);
    
    return { imageData, bounds };
  }, [maskBounds, displayImage, viewState]);

  // Handle crop confirm
  const handleCropConfirm = useCallback(() => {
    if (cropSettings.cropArea.width > 0 && cropSettings.cropArea.height > 0) {
      applyCrop(cropSettings.cropArea);
    }
  }, [cropSettings.cropArea, applyCrop]);

  // Handle crop cancel
  const handleCropCancel = useCallback(() => {
    setActiveTool(null);
  }, [setActiveTool]);

  // Handle mouse wheel for zoom
  const handleWheel = useCallback((e: WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas || !displayImage) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate zoom
    const delta = -e.deltaY * ZOOM_SENSITIVITY;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, viewState.scale * (1 + delta)));
    
    // Zoom towards mouse position
    const scaleRatio = newScale / viewState.scale;
    const newOffsetX = mouseX - (mouseX - viewState.offsetX) * scaleRatio;
    const newOffsetY = mouseY - (mouseY - viewState.offsetY) * scaleRatio;
    
    setViewState({
      scale: newScale,
      offsetX: newOffsetX,
      offsetY: newOffsetY,
    });
  }, [currentImage, viewState]);

  // Handle mouse down for pan start or healing brush
  const handleMouseDown = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    if (activeTool === 'crop') return; // Don't pan while cropping
    
    if (e.button === 0) { // Left mouse button
      if (activeTool === 'healing') {
        // Start drawing mask
        const imageCoords = screenToImageCoords(e.clientX, e.clientY);
        setIsDrawingMask(true);
        setLastDrawPoint(imageCoords);
        
        // Draw initial point
        drawMaskStroke(imageCoords.x, imageCoords.y, imageCoords.x, imageCoords.y);
      } else {
        // Start panning
        setIsPanning(true);
        setLastPanPoint({ x: e.clientX, y: e.clientY });
      }
    }
  }, [activeTool, screenToImageCoords, drawMaskStroke]);

  // Handle mouse move for panning or healing brush
  const handleMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    if (isDrawingMask && activeTool === 'healing' && lastDrawPoint) {
      // Continue drawing mask
      const imageCoords = screenToImageCoords(e.clientX, e.clientY);
      drawMaskStroke(lastDrawPoint.x, lastDrawPoint.y, imageCoords.x, imageCoords.y);
      setLastDrawPoint(imageCoords);
      return;
    }
    
    if (!isPanning) return;
    
    const deltaX = e.clientX - lastPanPoint.x;
    const deltaY = e.clientY - lastPanPoint.y;
    
    setViewState((prev) => ({
      ...prev,
      offsetX: prev.offsetX + deltaX,
      offsetY: prev.offsetY + deltaY,
    }));
    
    setLastPanPoint({ x: e.clientX, y: e.clientY });
  }, [isPanning, lastPanPoint, isDrawingMask, activeTool, lastDrawPoint, screenToImageCoords, drawMaskStroke]);

  // Handle mouse up for pan end or healing brush stroke complete
  const handleMouseUp = useCallback(() => {
    if (isDrawingMask && activeTool === 'healing') {
      // Finish drawing mask and extract mask data
      setIsDrawingMask(false);
      setLastDrawPoint(null);
      
      const maskData = extractMaskData();
      if (maskData && onHealingStroke) {
        onHealingStroke(maskData);
      }
      
      // Clear the mask canvas after extracting data
      const maskCanvas = maskCanvasRef.current;
      if (maskCanvas) {
        const ctx = maskCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        }
      }
      setMaskBounds(null);
    }
    
    setIsPanning(false);
  }, [isDrawingMask, activeTool, extractMaskData, onHealingStroke]);

  // Handle mouse leave for pan end or healing brush
  const handleMouseLeave = useCallback(() => {
    if (isDrawingMask && activeTool === 'healing') {
      // Finish drawing mask on mouse leave
      setIsDrawingMask(false);
      setLastDrawPoint(null);
      
      const maskData = extractMaskData();
      if (maskData && onHealingStroke) {
        onHealingStroke(maskData);
      }
      
      // Clear the mask canvas
      const maskCanvas = maskCanvasRef.current;
      if (maskCanvas) {
        const ctx = maskCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        }
      }
      setMaskBounds(null);
    }
    
    setIsPanning(false);
  }, [isDrawingMask, activeTool, extractMaskData, onHealingStroke]);


  // Zoom controls
  const zoomIn = useCallback(() => {
    setViewState((prev) => {
      const newScale = Math.min(MAX_SCALE, prev.scale * 1.25);
      const canvas = canvasRef.current;
      if (!canvas) return prev;
      
      // Zoom towards center
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const scaleRatio = newScale / prev.scale;
      
      return {
        scale: newScale,
        offsetX: centerX - (centerX - prev.offsetX) * scaleRatio,
        offsetY: centerY - (centerY - prev.offsetY) * scaleRatio,
      };
    });
  }, []);

  const zoomOut = useCallback(() => {
    setViewState((prev) => {
      const newScale = Math.max(MIN_SCALE, prev.scale / 1.25);
      const canvas = canvasRef.current;
      if (!canvas) return prev;
      
      // Zoom towards center
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const scaleRatio = newScale / prev.scale;
      
      return {
        scale: newScale,
        offsetX: centerX - (centerX - prev.offsetX) * scaleRatio,
        offsetY: centerY - (centerY - prev.offsetY) * scaleRatio,
      };
    });
  }, []);

  const zoomPercentage = Math.round(viewState.scale * 100);

  // Get image dimensions for crop overlay
  const imageWidth = displayImage?.naturalWidth || (displayImage as unknown as HTMLCanvasElement)?.width || 0;
  const imageHeight = displayImage?.naturalHeight || (displayImage as unknown as HTMLCanvasElement)?.height || 0;

  // Get cursor class based on active tool
  const getCursorClass = useCallback(() => {
    if (activeTool === 'crop') return 'cursor-crosshair';
    if (activeTool === 'healing') return isDrawingMask ? 'cursor-none' : 'cursor-none';
    return isPanning ? 'cursor-grabbing' : 'cursor-grab';
  }, [activeTool, isPanning, isDrawingMask]);

  if (!displayImage) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p className="text-sm">Выберите изображение для редактирования</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Zoom controls */}
      <div className="flex items-center justify-end gap-2 p-2 border-b border-border bg-background">
        <Button variant="ghost" size="icon" onClick={zoomOut} title="Уменьшить">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground min-w-[50px] text-center">
          {zoomPercentage}%
        </span>
        <Button variant="ghost" size="icon" onClick={zoomIn} title="Увеличить">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={fitToContainer} title="По размеру">
          <Maximize className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Canvas container */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-hidden bg-muted/30 relative"
      >
        {/* Main image canvas */}
        <canvas
          ref={canvasRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          className={getCursorClass()}
          style={{ display: 'block' }}
        />
        
        {/* Mask canvas layer for healing brush */}
        <canvas
          ref={maskCanvasRef}
          className="absolute top-0 left-0 pointer-events-none"
          style={{ display: activeTool === 'healing' ? 'block' : 'none' }}
        />
        
        {/* Brush cursor preview for healing tool */}
        {activeTool === 'healing' && (
          <BrushCursor 
            brushSize={brushSettings.size} 
            scale={viewState.scale}
          />
        )}
        
        {/* Crop overlay */}
        {activeTool === 'crop' && imageWidth > 0 && imageHeight > 0 && (
          <CropOverlay
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            cropArea={cropSettings.cropArea}
            aspectRatio={cropSettings.aspectRatio}
            customRatio={cropSettings.customRatio}
            allowOutOfBounds={cropSettings.allowOutOfBounds}
            scale={viewState.scale}
            offsetX={viewState.offsetX}
            offsetY={viewState.offsetY}
            onCropChange={setCropArea}
            onCropConfirm={handleCropConfirm}
            onCropCancel={handleCropCancel}
          />
        )}
      </div>
    </div>
  );
}

// Brush cursor component that follows mouse
function BrushCursor({ brushSize, scale }: { brushSize: number; scale: number }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);
  
  const scaledSize = brushSize * scale;
  
  if (position.x === 0 && position.y === 0) return null;
  
  return (
    <div
      className="fixed pointer-events-none border-2 border-red-500 rounded-full opacity-70 z-50"
      style={{
        width: scaledSize,
        height: scaledSize,
        left: position.x - scaledSize / 2,
        top: position.y - scaledSize / 2,
      }}
    />
  );
}
