export type PixelPoint = { x: number; y: number };

export function normalizeMapRotation(degrees: number): number {
  return Number.isFinite(degrees) ? ((degrees % 360) + 360) % 360 : 0;
}

/** Rotate a vector in screen coordinates (positive angles are clockwise). */
export function rotateMapVector(point: PixelPoint, degrees: number): PixelPoint {
  const radians = normalizeMapRotation(degrees) * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

/** Axis-aligned extent of a rectangle after rotation, also used for fitBounds. */
export function rotatedMapSize(size: PixelPoint, degrees: number): PixelPoint {
  const radians = normalizeMapRotation(degrees) * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return { x: size.x * cos + size.y * sin, y: size.x * sin + size.y * cos };
}

/** Convert visible viewport pixels to the unrotated Leaflet container pixels. */
export function viewportToMapPoint(
  point: PixelPoint, viewport: PixelPoint, mapSize: PixelPoint, degrees: number,
): PixelPoint {
  const offset = rotateMapVector({ x: point.x - viewport.x / 2, y: point.y - viewport.y / 2 }, -degrees);
  return { x: mapSize.x / 2 + offset.x, y: mapSize.y / 2 + offset.y };
}
