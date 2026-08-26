export { buildPrintHtml } from "./html";
export const A4_PRINT_TEMPLATE = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  marginMm: 12,
  gridTypes: ["squared", "graph", "lined", "blank"] as const,
};
