export const PROBLEM_TYPES: [
  "calc_block",
  "math_geometry_graph",
  "kanji",
  "reading_passage",
  "science_social_diagram",
  "integrated_essay",
  "standard",
];
export const ANSWER_STYLES: ["calc", "geometry", "graph", "kanji", "lined", "diagram", "essay"];
export const PROBLEM_TYPE_LABELS: Record<string, string>;
export const ANSWER_STYLE_LABELS: Record<
  "calc" | "geometry" | "graph" | "kanji" | "lined" | "diagram" | "essay",
  string
>;
export function chooseAnswerStyle(input: {
  topicTag?: string;
  unit?: string;
  subject?: string;
  problemType?: string;
  problem_type?: string;
}): "calc" | "geometry" | "graph" | "kanji" | "lined" | "diagram" | "essay";
export function problemsPerPage(
  styles: Array<"calc" | "geometry" | "graph" | "kanji" | "lined" | "diagram" | "essay">,
): 1 | 2 | 3 | 4;
export function styleToGridType(
  style: "calc" | "geometry" | "graph" | "kanji" | "lined" | "diagram" | "essay",
): "graph" | "squared" | "lined" | "blank";
