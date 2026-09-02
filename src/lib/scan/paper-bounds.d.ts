export function contentSpanFromSizes(sizes: number[]): { start: number; end: number } | null;
export function quietCenterSpan(sizes: number[]): { start: number; end: number } | null;
export function paperCropFromProfiles(
  rowSizes: number[],
  colSizes: number[],
): { x: number; y: number; width: number; height: number } | null;
export function remapGeminiBoxToPaper(
  box: unknown,
  paper: { x: number; y: number; width: number; height: number },
): [number, number, number, number] | null;
