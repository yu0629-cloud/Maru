export function radarVertex(
  index: number,
  count: number,
  radius: number,
  cx: number,
  cy: number,
  startAngle?: number,
): { x: number; y: number; angle: number };
export function radarRingPoints(
  count: number,
  scale: number,
  radius: number,
  cx: number,
  cy: number,
): Array<{ x: number; y: number; angle: number }>;
export function radarDataPoints(
  rates: number[] | null | undefined,
  radius: number,
  cx: number,
  cy: number,
): Array<{ x: number; y: number; angle: number }>;
export function pointsAttr(points?: Array<{ x: number; y: number }> | null): string;
export function labelTextAnchor(angle: number): "start" | "end" | "middle";
