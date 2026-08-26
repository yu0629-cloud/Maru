export type LayoutRect = { x: number; y: number; width: number; height: number };

export function clamp(n: number, min: number, max: number): number;
export function isGeminiBBox(value: unknown): value is [number, number, number, number];
export function containedImageRect(
  layoutW: number,
  layoutH: number,
  imageW: number,
  imageH: number,
): LayoutRect;
export function letterboxImageRect(
  containerW: number,
  containerH: number,
  imageW: number,
  imageH: number,
): { offsetX: number; offsetY: number; displayWidth: number; displayHeight: number };
export function mapGeminiBBoxToLetterbox(
  bbox: [number, number, number, number],
  letterbox: { offsetX: number; offsetY: number; displayWidth: number; displayHeight: number },
): LayoutRect;
export function mapGeminiBBoxToView(
  bbox: [number, number, number, number],
  width: number,
  height: number,
): LayoutRect;
export function gradeMarkFromMappedBox(box: LayoutRect): {
  cx: number;
  cy: number;
  r: number;
  x: number;
  y: number;
  size: number;
};
export const EQUALS_X_RATIO: number;
export const ANSWER_X_RATIO: number;
export const BLANK_ANSWER_GAP_RATIO: number;
export const MARK_RADIUS: number;
export const MARK_RADIUS_MIN: number;
export const MARK_RADIUS_MAX: number;
export const MARK_ROW_SIZE_RATIO: number;
export const MARK_SIZE_MIN: number;
export const MARK_SIZE_MAX: number;
export const MARK_STROKE_WIDTH: number;
export const PHOTO_Y_MAX_RATIO: number;
export const PHOTO_Y_MIN_RATIO: number;
export const PHOTO_X_MARGIN_RATIO: number;
export function isBlankStudentAnswer(value: unknown): boolean;
export function estimatePrintedRowHeight(boxes: LayoutRect[]): number;
export function clusterOverlayColumns<T extends { box: LayoutRect }>(
  items: Array<T | null | undefined>,
  gapRatio?: number,
): T[][];
export function isMarkInsidePhoto(
  cx: number,
  cy: number,
  letterbox: { offsetX: number; offsetY: number; displayWidth: number; displayHeight: number },
): boolean;
export function clampMarkToPhoto(
  mark: { cx: number; cy: number; r: number; x: number; y: number; size: number },
  letterbox: { offsetX: number; offsetY: number; displayWidth: number; displayHeight: number },
): { cx: number; cy: number; r: number; x: number; y: number; size: number };
export function layoutAlignedGradeMarks(
  items: Array<{ box: LayoutRect; isBlank?: boolean } | null | undefined>,
  letterbox?: { offsetX: number; offsetY: number; displayWidth: number; displayHeight: number },
): Array<{
  cx: number;
  cy: number;
  r: number;
  x: number;
  y: number;
  size: number;
} | null>;
export function isInsideLetterbox(
  x: number,
  y: number,
  letterbox: { offsetX: number; offsetY: number; displayWidth: number; displayHeight: number },
): boolean;
export function geminiBBoxToDisplayRect(
  bbox: [number, number, number, number],
  imageRect: LayoutRect,
): LayoutRect;
export function gradeMarkLayout(
  box: LayoutRect,
  options?: { min?: number; max?: number },
): { x: number; y: number; size: number };
export const FIT_PADDING_RATIO: number;
export const FIT_VIEW_INSET_RATIO: number;
export function bboxIntersects(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean;
export function isDisplayRectVisible(
  rect: LayoutRect,
  view: { width: number; height: number },
  slop?: number,
): boolean;
export function isPlausibleGeminiBBox(box: unknown): box is [number, number, number, number];
export function filterOverlayBBoxes(bboxes: unknown[]): [number, number, number, number][];
export function unionGeminiBBox(
  bboxes: unknown[],
  paddingRatio?: number,
): [number, number, number, number] | null;
export function problemAreaFitTransform(
  cropBBox: [number, number, number, number] | null | undefined,
  layoutW: number,
  layoutH: number,
  letterbox: { offsetX: number; offsetY: number; displayWidth: number; displayHeight: number } | null | undefined,
): { scale: number; translateX: number; translateY: number };
export function fittedImageRect(
  cropBBox: [number, number, number, number] | null | undefined,
  layoutW: number,
  layoutH: number,
  imageW: number,
  imageH: number,
  insetRatio?: number,
): LayoutRect;
export function cropAspectRatio(
  bbox: [number, number, number, number] | null | undefined,
  fallback?: number,
): number;
export function alignedFrameAspect(
  cropBBox: [number, number, number, number] | null | undefined,
  imageW: number,
  imageH: number,
  fallback?: number,
): number;
export function sizeAfterExifOrientation(
  width: number,
  height: number,
  orientation: number,
): { width: number; height: number };
