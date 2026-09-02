export function needsDataTableVisual(item?: object | null): boolean;
export function mayInheritDataTable(item?: object | null): boolean;
export function benefitsFromDataTableVisual(item?: object | null): boolean;
export function benefitsFromParentFigure(item?: object | null): boolean;
export function figureFamilyOf(item?: object | null): "" | "lever" | "candle" | "tube" | "mixed";
export function sameFigureFamily(a?: object | null, b?: object | null): boolean;
export function inferParentFigureBox(item?: object | null): [number, number, number, number] | null;
export function preferParentFigureBox(
  a?: unknown,
  b?: unknown,
): [number, number, number, number] | null;
export function trimParentBoxExcludingLead(
  box?: unknown,
  item?: object | null,
): [number, number, number, number] | null;
export function trimParentBottomBeforeQuestion(
  box?: unknown,
  item?: object | null,
): [number, number, number, number] | null;
export function mentionsDataTable(value: unknown): boolean;
export function looksLikeInsetFigureBox(box?: unknown): boolean;
export function needsInsetFigure(item?: object | null): boolean;
export function figurePlacementOf(item?: object | null): "right" | "left" | "below";
export function inferInsetFigureBox(
  item?: object | null,
): [number, number, number, number] | null;
export function mergeInsetFigureBox(
  explicit?: unknown,
  inferred?: unknown,
  place?: "right" | "left" | "below",
): [number, number, number, number] | null;
export function resolveInsetFigureBox(
  item?: object | null,
): [number, number, number, number] | null;
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
