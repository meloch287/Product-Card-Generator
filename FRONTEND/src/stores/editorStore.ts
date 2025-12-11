import { create } from 'zustand';

export type AspectRatio = '1:1' | '3:4' | '4:3' | '16:9' | '9:16' | '2:3' | '3:2' | 'free' | 'custom';
export type ToolType = 'crop' | 'healing' | null;

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FillMode = 'color' | 'transparent';

export interface CropSettings {
  aspectRatio: AspectRatio | null;
  cropArea: CropArea;
  customRatio?: { width: number; height: number };  // For custom aspect ratio
  allowOutOfBounds: boolean;  // Allow crop area to extend beyond image
  fillMode: FillMode;  // How to fill extended areas
  fillColor: string;  // Color to fill extended areas (when fillMode is 'color')
}

export interface BrushSettings {
  size: number;
  hardness: number;
}

export interface ImageState {
  original: HTMLImageElement | null;
  current: HTMLCanvasElement | null;
  sourcePath: string;
  // Track the current working image (after crops/edits)
  workingImage: HTMLImageElement | null;
}

interface EditorState {
  // Image state
  currentImage: ImageState | null;
  sourcePath: string | null;
  selectedFolderId: string | null;
  selectedImagePath: string | null;
  isLoadingImage: boolean;
  isProcessingInpaint: boolean;
  
  // Tool state
  activeTool: ToolType;
  
  // Crop settings
  cropSettings: CropSettings;
  
  // Brush settings
  brushSettings: BrushSettings;
  
  // Actions
  setCurrentImage: (image: ImageState | null) => void;
  setSourcePath: (path: string | null) => void;
  setSelectedFolderId: (id: string | null) => void;
  setSelectedImagePath: (path: string | null) => void;
  loadImage: (imagePath: string, sourceFolderPath: string) => Promise<void>;
  setActiveTool: (tool: ToolType) => void;
  setCropSettings: (settings: Partial<CropSettings>) => void;
  setCropAspectRatio: (ratio: AspectRatio | null) => void;
  setCropArea: (area: CropArea) => void;
  setBrushSettings: (settings: Partial<BrushSettings>) => void;
  setBrushSize: (size: number) => void;
  applyCrop: (cropArea: CropArea) => void;
  updateWorkingImage: (imageDataUrl: string) => Promise<void>;
  setIsProcessingInpaint: (isProcessing: boolean) => void;
  resetEditor: () => void;
}

const initialCropSettings: CropSettings = {
  aspectRatio: null,
  cropArea: { x: 0, y: 0, width: 0, height: 0 },
  customRatio: { width: 1, height: 1 },
  allowOutOfBounds: true,
  fillMode: 'transparent',
  fillColor: '#ffffff',
};

const initialBrushSettings: BrushSettings = {
  size: 20,
  hardness: 50,
};

export const useEditorStore = create<EditorState>((set) => ({
  // Initial state
  currentImage: null,
  sourcePath: null,
  selectedFolderId: null,
  selectedImagePath: null,
  isLoadingImage: false,
  isProcessingInpaint: false,
  activeTool: null,
  cropSettings: initialCropSettings,
  brushSettings: initialBrushSettings,
  
  // Actions
  setCurrentImage: (image) => set({ currentImage: image }),
  
  setSourcePath: (path) => set({ sourcePath: path }),
  
  setSelectedFolderId: (id) => set({ selectedFolderId: id }),
  
  setSelectedImagePath: (path) => set({ selectedImagePath: path }),
  
  loadImage: async (imagePath: string, sourceFolderPath: string) => {
    set({ isLoadingImage: true, selectedImagePath: imagePath });
    
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = `/api/image?path=${encodeURIComponent(imagePath)}`;
      });
      
      const imageState: ImageState = {
        original: img,
        current: null,
        sourcePath: sourceFolderPath,
        workingImage: img,
      };
      
      set({
        currentImage: imageState,
        sourcePath: sourceFolderPath,
        isLoadingImage: false,
      });
    } catch (error) {
      set({ isLoadingImage: false });
      throw error;
    }
  },
  
  setActiveTool: (tool) => set({ activeTool: tool }),
  
  setCropSettings: (settings) => set((state) => ({
    cropSettings: { ...state.cropSettings, ...settings },
  })),
  
  setCropAspectRatio: (ratio) => set((state) => ({
    cropSettings: { ...state.cropSettings, aspectRatio: ratio },
  })),
  
  setCropArea: (area) => set((state) => ({
    cropSettings: { ...state.cropSettings, cropArea: area },
  })),
  
  setBrushSettings: (settings) => set((state) => ({
    brushSettings: { ...state.brushSettings, ...settings },
  })),
  
  setBrushSize: (size) => set((state) => ({
    brushSettings: { ...state.brushSettings, size },
  })),
  
  applyCrop: (cropArea: CropArea) => set((state) => {
    if (!state.currentImage?.workingImage) return state;
    
    const sourceImage = state.currentImage.workingImage;
    const { x, y, width, height } = cropArea;
    const imgWidth = sourceImage.naturalWidth || (sourceImage as unknown as HTMLCanvasElement).width;
    const imgHeight = sourceImage.naturalHeight || (sourceImage as unknown as HTMLCanvasElement).height;
    
    // Create a new canvas with cropped dimensions
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = Math.round(width);
    croppedCanvas.height = Math.round(height);
    
    const ctx = croppedCanvas.getContext('2d');
    if (!ctx) return state;
    
    // Check if crop extends beyond image bounds
    const extendsOutOfBounds = x < 0 || y < 0 || x + width > imgWidth || y + height > imgHeight;
    
    if (extendsOutOfBounds && state.cropSettings.allowOutOfBounds) {
      // Fill background based on fillMode
      if (state.cropSettings.fillMode === 'color') {
        ctx.fillStyle = state.cropSettings.fillColor;
        ctx.fillRect(0, 0, width, height);
      }
      // For 'transparent' mode, canvas is already transparent by default
      
      // Calculate where to draw the image portion
      const srcX = Math.max(0, x);
      const srcY = Math.max(0, y);
      const srcWidth = Math.min(imgWidth - srcX, width - Math.max(0, -x));
      const srcHeight = Math.min(imgHeight - srcY, height - Math.max(0, -y));
      const destX = Math.max(0, -x);
      const destY = Math.max(0, -y);
      
      if (srcWidth > 0 && srcHeight > 0) {
        ctx.drawImage(
          sourceImage,
          Math.round(srcX),
          Math.round(srcY),
          Math.round(srcWidth),
          Math.round(srcHeight),
          Math.round(destX),
          Math.round(destY),
          Math.round(srcWidth),
          Math.round(srcHeight)
        );
      }
    } else {
      // Standard crop within bounds
      ctx.drawImage(
        sourceImage,
        Math.round(Math.max(0, x)),
        Math.round(Math.max(0, y)),
        Math.round(width),
        Math.round(height),
        0,
        0,
        Math.round(width),
        Math.round(height)
      );
    }
    
    // Convert canvas to image
    const newImage = new Image();
    newImage.src = croppedCanvas.toDataURL('image/png');
    
    return {
      currentImage: {
        ...state.currentImage,
        current: croppedCanvas,
        workingImage: newImage,
      },
      activeTool: null,
      cropSettings: {
        ...state.cropSettings,
        cropArea: { x: 0, y: 0, width: 0, height: 0 },
      },
    };
  }),
  
  setIsProcessingInpaint: (isProcessing) => set({ isProcessingInpaint: isProcessing }),
  
  updateWorkingImage: async (imageDataUrl: string) => {
    return new Promise<void>((resolve, reject) => {
      const newImage = new Image();
      newImage.onload = () => {
        set((state) => {
          if (!state.currentImage) return state;
          return {
            currentImage: {
              ...state.currentImage,
              workingImage: newImage,
            },
          };
        });
        resolve();
      };
      newImage.onerror = () => reject(new Error('Failed to load inpainted image'));
      newImage.src = imageDataUrl;
    });
  },
  
  resetEditor: () => set({
    currentImage: null,
    sourcePath: null,
    selectedFolderId: null,
    selectedImagePath: null,
    isLoadingImage: false,
    isProcessingInpaint: false,
    activeTool: null,
    cropSettings: initialCropSettings,
    brushSettings: initialBrushSettings,
  }),
}));
