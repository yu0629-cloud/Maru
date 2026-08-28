export const MARK_STYLES = ["jp", "global"];

export const DEFAULT_MARK_STYLE_BY_LOCALE = {
  ja: "jp",
  en: "global",
};

export function isMarkStyle(value) {
  return value === "jp" || value === "global";
}

export function defaultMarkStyle(locale) {
  return locale === "ja" ? "jp" : "global";
}

export function correctMarkGlyph(style) {
  return style === "global" ? "✓" : "⭕";
}
