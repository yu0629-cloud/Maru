export const MARK_STYLES: readonly ["jp", "global"];
export const DEFAULT_MARK_STYLE_BY_LOCALE: { ja: "jp"; en: "global" };
export type MarkStyle = (typeof MARK_STYLES)[number];
export function isMarkStyle(value: unknown): value is MarkStyle;
export function defaultMarkStyle(locale?: string | null): MarkStyle;
export function correctMarkGlyph(style?: MarkStyle | null): string;
