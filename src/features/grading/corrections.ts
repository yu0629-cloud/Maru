import type { ProblemType } from "@/src/types/database";
import type { GeminiBBox } from "@/src/types/grading";

export const MISTAKE_LABELS = {
  none: "正解",
  careless: "ケアレスミス",
  concept_gap: "概念の穴",
  blank: "無解答",
} as const;

export type GradedProblemView = {
  id: string;
  problem_index: number;
  problem_label: string;
  question_text: string;
  is_correct: boolean;
  mistake_type: keyof typeof MISTAKE_LABELS;
  parent_coaching_tip: string;
  student_answer: string;
  correct_answer: string;
  topic_tag: string;
  imageSrc: string;
  needs_inpaint: boolean;
  problem_type?: ProblemType;
  bbox?: GeminiBBox;
  dirty?: boolean;
};

const GUIDANCE_LEAK =
  /なぜ間違えたかを先に一言|怒らず、次の一手|計算のどこで位が崩れたか|いきなり式を書かせず|へんとつくりのバランスやトメ|指定キーワード|単なる用語暗記|グラフの数値の変化を言葉に/;

/** 画面表示用。正解は出さない。指示文が混ざっていたら短文に差し替える */
export function displayCoachingTip(isCorrect: boolean, tip: string | null | undefined): string {
  if (isCorrect) return "";
  const text = (tip ?? "").trim().slice(0, 25);
  if (text && !GUIDANCE_LEAK.test(text)) return text;
  const quoted = (tip ?? "").match(/「[^」]{4,}」/)?.[0];
  if (quoted) return quoted.slice(0, 25);
  return "今わかることを一つ書こう";
}

export {
  problemsNeedingInpaint,
  recountScore,
  toggleProblemCorrect,
} from "./lib/corrections.mjs";
