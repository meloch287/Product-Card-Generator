import { Point, PointSet, POINT_SET_COLORS } from '@/types';

/**
 * Default offset in pixels for new point sets
 */
export const DEFAULT_OFFSET = 50;

/**
 * Maximum number of point sets allowed
 */
export const MAX_POINT_SETS = 10;

/**
 * Default points for a new point set (centered square)
 */
export const DEFAULT_BASE_POINTS: [Point, Point, Point, Point] = [
  { x: 100, y: 100 },  // TL
  { x: 400, y: 100 },  // TR
  { x: 400, y: 400 },  // BR
  { x: 100, y: 400 },  // BL
];

/**
 * Calculates offset coordinates for all 4 points
 * @param basePoints - The base points to offset from
 * @param offset - The offset in pixels (applied to both x and y)
 * @returns New points with offset applied
 */
export function calculateOffsetPoints(
  basePoints: [Point, Point, Point, Point],
  offset: number
): [Point, Point, Point, Point] {
  return basePoints.map(point => ({
    x: point.x + offset,
    y: point.y + offset,
  })) as [Point, Point, Point, Point];
}

/**
 * Creates a new point set with the given index
 * @param index - The index for the new point set
 * @param basePoints - Optional base points to offset from (uses DEFAULT_BASE_POINTS if not provided)
 * @returns A new PointSet with offset applied based on index
 */
export function createDefaultPointSet(
  index: number,
  basePoints?: [Point, Point, Point, Point]
): PointSet {
  const base = basePoints ?? DEFAULT_BASE_POINTS;
  const offset = index * DEFAULT_OFFSET;
  
  return {
    index,
    points: calculateOffsetPoints(base, offset),
  };
}

/**
 * Gets the color for a point set by its index
 * @param index - The point set index (0-9)
 * @returns The color string for the point set
 */
export function getPointSetColor(index: number): string {
  // Use modulo to handle indices beyond the color array length
  const colorIndex = index % POINT_SET_COLORS.length;
  return POINT_SET_COLORS[colorIndex];
}

/**
 * Validates a single point set structure
 * @param pointSet - The point set to validate
 * @returns true if the point set is valid, false otherwise
 */
export function validatePointSet(pointSet: unknown): pointSet is PointSet {
  if (!pointSet || typeof pointSet !== 'object') {
    return false;
  }

  const ps = pointSet as Record<string, unknown>;

  // Check index is a non-negative number
  if (typeof ps.index !== 'number' || ps.index < 0 || !Number.isInteger(ps.index)) {
    return false;
  }

  // Check points is an array of exactly 4 points
  if (!Array.isArray(ps.points) || ps.points.length !== 4) {
    return false;
  }

  // Check each point has valid x and y coordinates
  return ps.points.every(
    (point: unknown) =>
      point !== null &&
      typeof point === 'object' &&
      typeof (point as Record<string, unknown>).x === 'number' &&
      typeof (point as Record<string, unknown>).y === 'number' &&
      Number.isFinite((point as Record<string, unknown>).x) &&
      Number.isFinite((point as Record<string, unknown>).y)
  );
}

/**
 * Validates an array of point sets
 * @param pointSets - The array of point sets to validate
 * @returns true if all point sets are valid, false otherwise
 */
export function validatePointSets(pointSets: unknown): pointSets is PointSet[] {
  // Must be a non-empty array
  if (!Array.isArray(pointSets) || pointSets.length === 0) {
    return false;
  }

  // Cannot exceed maximum
  if (pointSets.length > MAX_POINT_SETS) {
    return false;
  }

  // All point sets must be valid
  if (!pointSets.every(validatePointSet)) {
    return false;
  }

  // Check for duplicate indices
  const indices = new Set(pointSets.map((ps: PointSet) => ps.index));
  if (indices.size !== pointSets.length) {
    return false;
  }

  return true;
}

/**
 * Serialized point structure for JSON storage
 */
export interface SerializedPoint {
  x: number;
  y: number;
}

/**
 * Serialized point set structure for JSON storage
 */
export interface SerializedPointSet {
  index: number;
  points: [SerializedPoint, SerializedPoint, SerializedPoint, SerializedPoint];
}

/**
 * Old template format with single points array (for migration)
 */
export interface OldTemplateFormat {
  id?: string;
  name?: string;
  path?: string;
  points?: Point[];
  pointSets?: PointSet[];
  isMultiMode?: boolean;
  [key: string]: unknown;
}

/**
 * Serializes an array of point sets to JSON-compatible format
 * @param pointSets - The array of point sets to serialize
 * @returns JSON-compatible array of serialized point sets
 */
export function serializePointSets(pointSets: PointSet[]): SerializedPointSet[] {
  return pointSets.map((ps) => ({
    index: ps.index,
    points: ps.points.map((p) => ({ x: p.x, y: p.y })) as [
      SerializedPoint,
      SerializedPoint,
      SerializedPoint,
      SerializedPoint
    ],
  }));
}

/**
 * Deserializes JSON data to an array of point sets
 * @param data - The JSON data to deserialize
 * @returns Array of PointSet objects, or default point set if data is invalid
 */
export function deserializePointSets(data: unknown): PointSet[] {
  // If data is not an array, return default
  if (!Array.isArray(data)) {
    return [createDefaultPointSet(0)];
  }

  // If empty array, return default
  if (data.length === 0) {
    return [createDefaultPointSet(0)];
  }

  const result: PointSet[] = [];

  for (const item of data) {
    if (validatePointSet(item)) {
      result.push({
        index: item.index,
        points: item.points.map((p: Point) => ({ x: p.x, y: p.y })) as [
          Point,
          Point,
          Point,
          Point
        ],
      });
    }
  }

  // If no valid point sets found, return default
  if (result.length === 0) {
    return [createDefaultPointSet(0)];
  }

  // Sort by index to ensure consistent ordering
  result.sort((a, b) => a.index - b.index);

  return result;
}

/**
 * Migrates old single-points format to pointSets format
 * @param template - The template object (potentially in old format)
 * @returns Object with pointSets array and isMultiMode flag
 */
export function migrateOldFormat(template: OldTemplateFormat): {
  pointSets: PointSet[];
  isMultiMode: boolean;
} {
  // If template already has valid pointSets, use them
  if (
    template.pointSets &&
    Array.isArray(template.pointSets) &&
    template.pointSets.length > 0 &&
    validatePointSets(template.pointSets)
  ) {
    return {
      pointSets: template.pointSets,
      // Preserve explicit isMultiMode setting, or infer from pointSets length
      isMultiMode: template.isMultiMode ?? template.pointSets.length > 1,
    };
  }

  // If template has old-style points array with 4 points, convert to pointSets
  if (
    template.points &&
    Array.isArray(template.points) &&
    template.points.length === 4 &&
    template.points.every(
      (p) =>
        p !== null &&
        typeof p === 'object' &&
        typeof p.x === 'number' &&
        typeof p.y === 'number'
    )
  ) {
    const pointSet: PointSet = {
      index: 0,
      points: template.points.map((p) => ({ x: p.x, y: p.y })) as [
        Point,
        Point,
        Point,
        Point
      ],
    };
    return {
      pointSets: [pointSet],
      isMultiMode: false,
    };
  }

  // Default: create a new default point set
  return {
    pointSets: [createDefaultPointSet(0)],
    isMultiMode: false,
  };
}
