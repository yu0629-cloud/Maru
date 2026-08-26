import type { CarteJson, MistakeType } from "./schema.ts";
import { MISTAKE_TYPES } from "./schema.ts";

export type EnrichItem = {
  problem_index: string;
  topic_tag: string;
  mistake_type: Exclude<MistakeType, "none">;
  parent_coaching_tip: string;
};

export const ENRICH_RESPONSE_SCHEMA = {
  type: "OBJECT",
  description: "不正解問題のカルテ用タグ。短文のみ",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          problem_index: { type: "STRING" },
          topic_tag: { type: "STRING", description: "短い単元名。例: つるかめ算" },
          mistake_type: {
            type: "STRING",
            format: "enum",
            enum: ["careless", "concept_gap", "blank"],
          },
          parent_coaching_tip: {
            type: "STRING",
            description: "保護者向け超短文。25文字以内。解説の長文は禁止",
          },
        },
        required: ["problem_index", "topic_tag", "mistake_type", "parent_coaching_tip"],
      },
    },
  },
  required: ["items"],
} as const;

export function parseEnrichItems(raw: unknown): EnrichItem[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [];
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  const allowed = new Set(MISTAKE_TYPES.filter((item) => item !== "none"));
  const out: EnrichItem[] = [];
  for (const item of items) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const problemIndex = typeof row.problem_index === "string" ? row.problem_index.trim() : "";
    const topicTag = typeof row.topic_tag === "string" ? row.topic_tag.trim() : "";
    const tip = typeof row.parent_coaching_tip === "string" ? row.parent_coaching_tip.trim() : "";
    const mistake = typeof row.mistake_type === "string" ? row.mistake_type : "";
    if (!problemIndex || !topicTag || !allowed.has(mistake as EnrichItem["mistake_type"])) continue;
    out.push({
      problem_index: problemIndex,
      topic_tag: topicTag.slice(0, 40),
      mistake_type: mistake as EnrichItem["mistake_type"],
      parent_coaching_tip: tip.slice(0, 25),
    });
  }
  return out;
}

export function buildEnrichSystemPrompt(carte: CarteJson | null | undefined): string {
  const weak = (carte?.weak_units ?? [])
    .map((unit) => unit.unit)
    .filter(Boolean)
    .slice(0, 6)
    .join("、") || "なし";

  return [
    "不正解問題だけに短い単元タグと1文の声かけを付ける。",
    `苦手単元: ${weak}`,
    "長文・解説・途中式は禁止。parent_coaching_tip は25文字以内。",
    "JSON の items 以外は出力しない。",
  ].join("\n");
}

export function buildEnrichUserPrompt(
  problems: Array<{ problem_index: string; student_answer: string; correct_answer: string }>,
): string {
  const lines = problems.map(
    (problem) =>
      `${problem.problem_index}: 生徒=${problem.student_answer || "（無解答）"} / 正解=${problem.correct_answer}`,
  );
  return `次の不正解の topic_tag と1文の声かけを付けてください。\n${lines.join("\n")}`;
}
