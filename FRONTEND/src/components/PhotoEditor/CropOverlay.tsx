import { useRef, useState, useCallback, useEffect, MouseEvent } from 'react';
import { CropArea, AspectRatio } from '@/stores/editorStore';
import {
  parseAspectRatio,
  clampCropArea,
  constrainToAspectRatio,
  MIN_CROP_SIZE,
} from './cropUtils';

// Re-export utilities for external use
export { parseAspectRatio, clampCropArea, constrainToAspectRatio, initializeCropArea } from './cropUtils';

interface CropOverlayProps {
  imageWidth: number;
  imageHeight: number;
  cropArea: CropArea;
  aspectRatio: AspectRatio | null;
  customRatio?: { width: number; height: number };
  allowOutOfBounds?: boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
  onCropChange: (area: CropArea) => void;
  onCropConfirm: () => void;
  onCropCancel: () => void;
}

export type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface DragState {
  isDragging: boolean;
  dragType: 'move' | 'resize' | null;
  handle: HandlePosition | null;
  startX: number;
  startY: number;
  startCropArea: CropArea;
}

const HANDLE_SIZE = 10;

export function CropOverlay({
  imageWidth,
  imageHeight,
  cropArea,
  aspectRatio,
  customRatio,
  allowOutOfBounds = false,
  scale,
  offsetX,
  offsetY,
  onCropChange,
  onCropConfirm,
  onCropCancel,
}: CropOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragType: null,
    handle: null,
    startX: 0,
    startY: 0,
    startCropArea: cropArea,
  });

  // Handle mouse down on crop area (move)
  const handleCropMouseDown = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDragState({
      isDragging: true,
      dragType: 'move',
      handle: null,
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      startCropArea: { ...cropArea },
    });
  }, [cropArea]);

  // Handle mouse down on resize handle
  const handleHandleMouseDown = useCallback((e: MouseEvent, handle: HandlePosition) => {
    e.stopPropagation();
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDragState({
      isDragging: true,
      dragType: 'resize',
      handle,
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      startCropArea: { ...cropArea },
    });
  }, [cropArea]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.isDragging) return;

    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    const deltaX = (currentX - dragState.startX) / scale;
    const deltaY = (currentY - dragState.startY) / scale;

    const numericRatio = parseAspectRatio(aspectRatio, customRatio);
    let newArea: CropArea;

    if (dragState.dragType === 'move') {
      newArea = {
        ...dragState.startCropArea,
        x: dragState.startCropArea.x + deltaX,
        y: dragState.startCropArea.y + deltaY,
      };
      newArea = clampCropArea(newArea, imageWidth, imageHeight, allowOutOfBounds);
    } else {
      // Resize based on handle
      newArea = resizeCropArea(
        dragState.startCropArea,
        deltaX,
        deltaY,
        dragState.handle!,
        numericRatio,
        imageWidth,
        imageHeight,
        allowOutOfBounds
      );
    }

    onCropChange(newArea);
  }, [dragState, scale, aspectRatio, customRatio, allowOutOfBounds, imageWidth, imageHeight, onCropChange]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setDragState((prev) => ({
      ...prev,
      isDragging: false,
      dragType: null,
      handle: null,
    }));
  }, []);

  // Add global mouse event listeners when dragging
  useEffect(() => {
    if (dragState.isDragging) {
      const handleGlobalMouseMove = (e: globalThis.MouseEvent) => {
        handleMouseMove(e as unknown as MouseEvent);
      };
      const handleGlobalMouseUp = () => {
        handleMouseUp();
      };

      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [dragState.isDragging, handleMouseMove, handleMouseUp]);

  // Calculate screen positions
  const screenCrop = {
    x: cropArea.x * scale + offsetX,
    y: cropArea.y * scale + offsetY,
    width: cropArea.width * scale,
    height: cropArea.height * scale,
  };

  // Handle positions
  const handles: { position: HandlePosition; x: number; y: number; cursor: string }[] = [
    { position: 'nw', x: screenCrop.x, y: screenCrop.y, cursor: 'nwse-resize' },
    { position: 'n', x: screenCrop.x + screenCrop.width / 2, y: screenCrop.y, cursor: 'ns-resize' },
    { position: 'ne', x: screenCrop.x + screenCrop.width, y: screenCrop.y, cursor: 'nesw-resize' },
    { position: 'e', x: screenCrop.x + screenCrop.width, y: screenCrop.y + screenCrop.height / 2, cursor: 'ew-resize' },
    { position: 'se', x: screenCrop.x + screenCrop.width, y: screenCrop.y + screenCrop.height, cursor: 'nwse-resize' },
    { position: 's', x: screenCrop.x + screenCrop.width / 2, y: screenCrop.y + screenCrop.height, cursor: 'ns-resize' },
    { position: 'sw', x: screenCrop.x, y: screenCrop.y + screenCrop.height, cursor: 'nesw-resize' },
    { position: 'w', x: screenCrop.x, y: screenCrop.y + screenCrop.height / 2, cursor: 'ew-resize' },
  ];


  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 pointer-events-auto"
      style={{ zIndex: 10 }}
    >
      {/* Dark overlay outside crop area */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="cropMask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={screenCrop.x}
              y={screenCrop.y}
              width={screenCrop.width}
              height={screenCrop.height}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.5)"
          mask="url(#cropMask)"
        />
      </svg>

      {/* Crop area border */}
      <div
        className="absolute border-2 border-white cursor-move"
        style={{
          left: screenCrop.x,
          top: screenCrop.y,
          width: screenCrop.width,
          height: screenCrop.height,
        }}
        onMouseDown={handleCropMouseDown}
      >
        {/* Rule of thirds grid */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30" />
          <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30" />
          <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30" />
          <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30" />
        </div>
      </div>

      {/* Resize handles */}
      {handles.map(({ position, x, y, cursor }) => (
        <div
          key={position}
          className="absolute bg-white border border-gray-400 rounded-sm"
          style={{
            left: x - HANDLE_SIZE / 2,
            top: y - HANDLE_SIZE / 2,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            cursor,
          }}
          onMouseDown={(e) => handleHandleMouseDown(e, position)}
        />
      ))}

      {/* Confirm/Cancel buttons */}
      <div
        className="absolute flex gap-2"
        style={{
          left: screenCrop.x + screenCrop.width / 2,
          top: screenCrop.y + screenCrop.height + 16,
          transform: 'translateX(-50%)',
        }}
      >
        <button
          className="px-4 py-1.5 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 transition-colors"
          onClick={onCropConfirm}
        >
          Применить
        </button>
        <button
          className="px-4 py-1.5 bg-secondary text-secondary-foreground text-sm rounded-md hover:bg-secondary/80 transition-colors"
          onClick={onCropCancel}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

/**
 * Resizes crop area based on handle drag
 */
function resizeCropArea(
  startArea: CropArea,
  deltaX: number,
  deltaY: number,
  handle: HandlePosition,
  ratio: number | null,
  imageWidth: number,
  imageHeight: number,
  allowOutOfBounds: boolean = false
): CropArea {
  let { x, y, width, height } = startArea;

  switch (handle) {
    case 'nw':
      x = startArea.x + deltaX;
      y = startArea.y + deltaY;
      width = startArea.width - deltaX;
      height = startArea.height - deltaY;
      break;
    case 'n':
      y = startArea.y + deltaY;
      height = startArea.height - deltaY;
      break;
    case 'ne':
      y = startArea.y + deltaY;
      width = startArea.width + deltaX;
      height = startArea.height - deltaY;
      break;
    case 'e':
      width = startArea.width + deltaX;
      break;
    case 'se':
      width = startArea.width + deltaX;
      height = startArea.height + deltaY;
      break;
    case 's':
      height = startArea.height + deltaY;
      break;
    case 'sw':
      x = startArea.x + deltaX;
      width = startArea.width - deltaX;
      height = startArea.height + deltaY;
      break;
    case 'w':
      x = startArea.x + deltaX;
      width = startArea.width - deltaX;
      break;
  }

  // Ensure positive dimensions
  if (width < 0) {
    x = x + width;
    width = Math.abs(width);
  }
  if (height < 0) {
    y = y + height;
    height = Math.abs(height);
  }

  return constrainToAspectRatio({ x, y, width, height }, ratio, imageWidth, imageHeight, handle, allowOutOfBounds);
}
