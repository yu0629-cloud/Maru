export function needsDataTableVisual(item?: object | null): boolean;
export function benefitsFromDataTableVisual(item?: object | null): boolean;
export function benefitsFromParentFigure(item?: object | null): boolean;
export function mentionsDataTable(value: unknown): boolean;
export function looksLikeParentFigureBox(
  box?: unknown,
  sub?: [number, number, number, number] | null,
): boolean;
export function inferTableBoxBelow(
  parent?: [number, number, number, number] | null,
  item?: object | null,
): [number, number, number, number] | null;
export function trimTableBoxExcludingChoices(
  box?: unknown,
  item?: object | null,
): [number, number, number, number] | null;
export function resolveSubFigureBox(
  item?: object | null,
): [number, number, number, number] | null;
export function resolveParentFigureBox(
  item?: object | null,
): [number, number, number, number] | null;
export function enrichPrintFigureBoxes<T extends object>(problems: T[]): T[];
export function normalizeOcrText(value: unknown): string;
