export function formatSquareNumber(token: unknown): string;
export function formatRoundNumber(token: unknown): string;
export function formatMajorSubLabel(major?: unknown, sub?: unknown): string;
export function parseMajorSub(value?: unknown): { major: string; sub: string } | null;
export function matchLeadingQuestionNumber(text?: unknown): {
  style: "square" | "round";
  token: string;
  raw: string;
  rest: string;
} | null;
export function matchLabelQuestionNumber(label?: unknown): {
  style: "square" | "round";
  token: string;
  raw: string;
  rest: string;
  major?: string;
} | null;
export function formatQuestionNumberLabel(style: "square" | "round", token: unknown): string;
export function resolveQuestionNumber(sources?: {
  questionText?: unknown;
  question_text?: unknown;
  prompt?: unknown;
  stem?: unknown;
  text?: unknown;
  problemLabel?: unknown;
  problem_label?: unknown;
  problemIndex?: unknown;
  problem_index?: unknown;
  label?: unknown;
}): {
  style: "square" | "round";
  token: string;
  label: string;
  body: string;
  major?: string;
  sub?: string;
};
export function displayProblemNumber(sources?: {
  questionText?: unknown;
  question_text?: unknown;
  prompt?: unknown;
  stem?: unknown;
  text?: unknown;
  problemLabel?: unknown;
  problem_label?: unknown;
  problemIndex?: unknown;
  problem_index?: unknown;
  label?: unknown;
}): string;
export function stripLeadingQuestionNumber(text?: unknown): string;
export function referencedPartTokens(text?: unknown): string[];
