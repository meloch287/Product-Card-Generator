export interface Point {
  x: number;
  y: number;
}

export interface PointSet {
  index: number;
  points: [Point, Point, Point, Point]; // TL, TR, BR, BL
}

// 10 distinct colors for point sets in multi-mode
export const POINT_SET_COLORS: string[] = [
  '#ef4444',  // red (набор 1)
  '#22c55e',  // green (набор 2)
  '#3b82f6',  // blue (набор 3)
  '#eab308',  // yellow (набор 4)
  '#a855f7',  // purple (набор 5)
  '#ec4899',  // pink (набор 6)
  '#14b8a6',  // teal (набор 7)
  '#f97316',  // orange (набор 8)
  '#6366f1',  // indigo (набор 9)
  '#84cc16',  // lime (набор 10)
];

export interface Template {
  id: string;
  name: string;
  path: string;
  thumbnailUrl: string;
  points: [Point, Point, Point, Point]; // TL, TR, BR, BL - kept for backward compatibility
  pointSets: PointSet[]; // All point sets for multi-mode
  isMultiMode: boolean; // Flag indicating multi-photo insertion mode
  cornerRadius: number;
  blendStrength: number;
  changeBackgroundColor: boolean;
  addProduct: boolean;
  originalWidth: number;
  originalHeight: number;
}

export interface PrintFolder {
  id: string;
  path: string;
  name: string;
  fileCount: number;
}

export interface GenerationStatus {
  isRunning: boolean;
  current: number;
  total: number;
  errors: Array<{ file: string; error: string }>;
}

export type PointType = 'tl' | 'tr' | 'br' | 'bl';

export const POINT_COLORS: Record<PointType, string> = {
  tl: '#ef4444', // red
  tr: '#22c55e', // green
  br: '#3b82f6', // blue
  bl: '#eab308', // yellow
};

export const POINT_LABELS: Record<PointType, string> = {
  tl: 'Top Left',
  tr: 'Top Right',
  br: 'Bottom Right',
  bl: 'Bottom Left',
};
