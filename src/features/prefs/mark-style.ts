export type MarkStyle = "jp" | "global";

export {
  MARK_STYLES,
  DEFAULT_MARK_STYLE_BY_LOCALE,
  defaultMarkStyle,
  correctMarkGlyph,
} from "./lib/mark-style.mjs";

export function isMarkStyle(value: unknown): value is MarkStyle {
  return value === "jp" || value === "global";
}
