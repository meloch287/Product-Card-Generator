import { CropArea, AspectRatio } from '@/stores/editorStore';

export const MIN_CROP_SIZE = 20;

/**
 * Aspect ratio presets with their numeric values
 */
export const ASPECT_RATIO_PRESETS: Record<string, number> = {
  '1:1': 1,
  '3:4': 3 / 4,
  '4:3': 4 / 3,
  '2:3': 2 / 3,
  '3:2': 3 / 2,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
};

/**
 * Parses aspect ratio string to numeric value
 * Returns null for 'free' or null input (allows free movement)
 * For 'custom', uses the provided customRatio
 */
export function parseAspectRatio(
  ratio: AspectRatio | null, 
  customRatio?: { width: number; height: number }
): number | null {
  if (!ratio || ratio === 'free') return null;
  
  // Handle custom ratio
  if (ratio === 'custom') {
    if (customRatio && customRatio.width > 0 && customRatio.height > 0) {
      return customRatio.width / customRatio.height;
    }
    return null;
  }
  
  return ASPECT_RATIO_PRESETS[ratio] ?? null;
}

/**
 * Calculates the aspect ratio of given dimensions
 */
export function calculateAspectRatio(width: number, height: number): number {
  if (height === 0) return 0;
  return width / height;
}

/**
 * Checks if dimensions match the expected aspect ratio within tolerance
 */
export function matchesAspectRatio(
  width: number,
  height: number,
  expectedRatio: number,
  tolerance: number = 0.001
): boolean {
  const actualRatio = calculateAspectRatio(width, height);
  return Math.abs(actualRatio - expectedRatio) <= tolerance;
}

/**
 * Constrains dimensions to maintain aspect ratio
 * Adjusts height based on width by default
 */
export function constrainDimensionsToRatio(
  width: number,
  height: number,
  ratio: number,
  adjustHeight: boolean = true
): { width: number; height: number } {
  if (adjustHeight) {
    return { width, height: width / ratio };
  } else {
    return { width: height * ratio, height };
  }
}


/**
 * Clamps crop area to image bounds while maintaining minimum size
 * If allowOutOfBounds is true, allows crop area to extend beyond image
 */
export function clampCropArea(
  area: CropArea,
  imageWidth: number,
  imageHeight: number,
  allowOutOfBounds: boolean = false
): CropArea {
  let { x, y, width, height } = area;

  // Ensure minimum size
  width = Math.max(MIN_CROP_SIZE, width);
  height = Math.max(MIN_CROP_SIZE, height);

  if (allowOutOfBounds) {
    // Only ensure crop area overlaps with image at least partially
    const minOverlap = MIN_CROP_SIZE;
    x = Math.max(-width + minOverlap, Math.min(x, imageWidth - minOverlap));
    y = Math.max(-height + minOverlap, Math.min(y, imageHeight - minOverlap));
  } else {
    // Clamp to image bounds
    width = Math.min(width, imageWidth);
    height = Math.min(height, imageHeight);
    x = Math.max(0, Math.min(x, imageWidth - width));
    y = Math.max(0, Math.min(y, imageHeight - height));
  }

  return { x, y, width, height };
}

export type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/**
 * Constrains crop area to maintain aspect ratio while staying within image bounds
 * The handle parameter determines which dimension to adjust based on drag direction
 */
export function constrainToAspectRatio(
  area: CropArea,
  ratio: number | null,
  imageWidth: number,
  imageHeight: number,
  handle: HandlePosition | null = null,
  allowOutOfBounds: boolean = false
): CropArea {
  if (ratio === null) {
    return clampCropArea(area, imageWidth, imageHeight, allowOutOfBounds);
  }

  let { x, y, width, height } = area;

  // Determine which dimension to adjust based on handle
  const isHorizontalHandle = handle === 'e' || handle === 'w';
  const isVerticalHandle = handle === 'n' || handle === 's';

  if (isVerticalHandle) {
    // Adjust width based on height for vertical handles
    width = height * ratio;
  } else {
    // Adjust height based on width for horizontal/corner handles or default
    height = width / ratio;
  }

  // Ensure minimum size while maintaining ratio
  if (width < MIN_CROP_SIZE) {
    width = MIN_CROP_SIZE;
    height = width / ratio;
  }
  if (height < MIN_CROP_SIZE) {
    height = MIN_CROP_SIZE;
    width = height * ratio;
  }

  if (!allowOutOfBounds) {
    // Clamp to image bounds while maintaining ratio
    if (width > imageWidth) {
      width = imageWidth;
      height = width / ratio;
    }
    if (height > imageHeight) {
      height = imageHeight;
      width = height * ratio;
    }

    // Clamp position
    x = Math.max(0, Math.min(x, imageWidth - width));
    y = Math.max(0, Math.min(y, imageHeight - height));
  }

  return { x, y, width, height };
}

/**
 * Initializes crop area centered on image with given aspect ratio
 */
export function initializeCropArea(
  imageWidth: number,
  imageHeight: number,
  ratio: AspectRatio | null,
  customRatio?: { width: number; height: number }
): CropArea {
  const numericRatio = parseAspectRatio(ratio, customRatio);

  let width: number;
  let height: number;

  if (numericRatio === null) {
    // Free crop - use 80% of image
    width = imageWidth * 0.8;
    height = imageHeight * 0.8;
  } else {
    // Calculate max size that fits in image with given ratio
    const imageRatio = imageWidth / imageHeight;

    if (numericRatio > imageRatio) {
      // Width-constrained
      width = imageWidth * 0.8;
      height = width / numericRatio;
    } else {
      // Height-constrained
      height = imageHeight * 0.8;
      width = height * numericRatio;
    }
  }

  // Center the crop area
  const x = (imageWidth - width) / 2;
  const y = (imageHeight - height) / 2;

  return { x, y, width, height };
}

/**
 * Applies crop to canvas and returns cropped image data
 */
export function applyCropToCanvas(
  sourceCanvas: HTMLCanvasElement | HTMLImageElement,
  cropArea: CropArea
): HTMLCanvasElement {
  const { x, y, width, height } = cropArea;

  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = Math.round(width);
  croppedCanvas.height = Math.round(height);

  const ctx = croppedCanvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(
      sourceCanvas,
      Math.round(x),
      Math.round(y),
      Math.round(width),
      Math.round(height),
      0,
      0,
      Math.round(width),
      Math.round(height)
    );
  }

  return croppedCanvas;
}

/**
 * Validates that crop area is within image bounds
 */
export function isValidCropArea(
  area: CropArea,
  imageWidth: number,
  imageHeight: number
): boolean {
  return (
    area.x >= 0 &&
    area.y >= 0 &&
    area.width >= MIN_CROP_SIZE &&
    area.height >= MIN_CROP_SIZE &&
    area.x + area.width <= imageWidth &&
    area.y + area.height <= imageHeight
  );
}
