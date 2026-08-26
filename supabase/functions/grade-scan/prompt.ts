import type { CarteJson } from "./schema.ts";

export type PromptChild = {
  name?: string | null;
  gradeLabel?: string | null;
  examTarget?: string | null;
};

function percent(rate: number | undefined): string {
  if (rate === undefined || Number.isNaN(rate)) return "不明";
  return `${Math.round(rate * 100)}%`;
}

export function formatCarteForPrompt(carte: CarteJson | null | undefined): string {
  if (!carte) {
    return [
      "カルテ未作成（初回スキャン）。",
      "- 基礎定着率は未計測として、見た目の難易度だけで判定する。",
      "- つまずきは慎重に。careless と決めつけない。",
    ].join("\n");
  }

  const weak = (carte.weak_units ?? [])
    .map((unit) => {
      const name = unit.unit ?? "未分類";
      const rate = percent(unit.rate);
      const n = unit.total ?? 0;
      return `- ${name}（正答率 ${rate}, n=${n}）`;
    })
    .join("\n");

  const priority = carte.triage?.priority_units?.join("、") || "なし";

  return [
    `基礎定着率: ${percent(carte.foundation_rate)}`,
    `トリアージ: ${carte.triage?.level ?? "watch"}`,
    `要約: ${carte.triage?.summary ?? ""}`,
    `優先単元: ${priority}`,
    `累計スキャン: ${carte.scan_count ?? 0} / 累計問題: ${carte.problem_count ?? 0}`,
    "苦手単元:",
    weak || "- （まだ弱い単元は検出されていない）",
  ].join("\n");
}

/** 抽出5キーだけ。正誤・思考・解説は出させない */
export function buildSystemPrompt(_carte?: CarteJson | null, child?: PromptChild): string {
  const childLine = [
    child?.name ? `名前: ${child.name}` : null,
    child?.gradeLabel ? `学年: ${child.gradeLabel}` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return [
    "問題を抽出して JSON だけ返す。採点・思考・解説は禁止。",
    childLine ? `対象: ${childLine}` : "",
    "各問は problem_index, student_answer, correct_answer, type, bbox の5キーのみ。",
    "type は math か text。problem_index は問番号か式（例: 8+2）。番号が無くても1問1件。",
    "bbox は [ymin, xmin, ymax, xmax]（各 0〜1000）。手書きインクではなく、印刷された問題式全体（等号=と解答枠を含む1行）。高さは当該行のみ。隣の行・机は含めない。空欄でも等号の右の解答位置を含める。用紙の外・机は bbox にしない。",
    "student_answer は等号の右の手書き。薄い鉛筆も読む。低学年の筆跡（丸い4、繋がる9、雪だるまの8、閉じた0）を正しい数字にする。書いてあれば空にしない。式の正解（例: 2+7=9, 0+0=0, 4+4=8, 6+3=9）と一致する数字ならその数字を返す。本当に白紙だけ空文字。",
    "1問=1件。まとめない。空欄も student_answer を空で残す。",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildUserPrompt(): string {
  return "problems だけ返せ。5キー以外は出すな。";
}

const GRADE_LABELS: Record<string, string> = {
  e1: "小1",
  e2: "小2",
  e3: "小3",
  e4: "小4",
  e5: "小5",
  e6: "小6",
  j1: "中1",
  j2: "中2",
  j3: "中3",
};

export function gradeCodeToLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return GRADE_LABELS[code] ?? code;
}
