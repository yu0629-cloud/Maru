import { GEMINI_MODEL, GRADE_RESPONSE_SCHEMA } from "./schema.ts";
import { parseGradeJson, gradeGeminiResponse } from "./validate.ts";
import type { GradeResult } from "./schema.ts";
import { parseEnrichItems, type EnrichItem } from "./enrich.ts";
import { continuationUserPrompt, mergeProblemPayloads } from "./hybrid-grade.ts";

const GEMINI_REST_ORIGIN = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_FETCH_TIMEOUT_MS = 25_000;
const GEMINI_MAX_OUTPUT_TOKENS = 8192;

/** 3.5 は thinkingBudget:0 を受け付けないため minimal。2.5 は budget 0 */
export const GEMINI_THINKING_BUDGET = 0;

export function thinkingConfigForModel(model: string): Record<string, unknown> | undefined {
  if (model.includes("gemini-3")) {
    return { thinkingLevel: "minimal" };
  }
  return { thinkingBudget: 0 };
}

export function buildGenerationConfig(model = GEMINI_MODEL) {
  const thinkingConfig = thinkingConfigForModel(model);
  return {
    responseMimeType: "application/json",
    responseSchema: GRADE_RESPONSE_SCHEMA,
    temperature: 0,
    maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
    ...(thinkingConfig ? { thinkingConfig } : {}),
  } as {
    responseMimeType: string;
    responseSchema: typeof GRADE_RESPONSE_SCHEMA;
    temperature: number;
    maxOutputTokens: number;
    thinkingConfig?: Record<string, unknown>;
  };
}

export type GeminiImagePart = {
  mimeType: string;
  data: string;
};

export type GeminiClient = {
  gradeWorksheet: (input: {
    systemPrompt: string;
    userPrompt: string;
    image: GeminiImagePart;
  }) => Promise<GradeResult>;
  enrichIncorrect: (input: {
    systemPrompt: string;
    userPrompt: string;
    image: GeminiImagePart;
  }) => Promise<EnrichItem[]>;
};

export function readGeminiApiKey(): string {
  const key = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (!key) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }
  return key;
}

export function resolveGeminiModel(): string {
  const fromEnv = Deno.env.get("GEMINI_MODEL")?.trim();
  if (fromEnv && fromEnv !== GEMINI_MODEL) {
    console.log("[grade-scan] ignore GEMINI_MODEL env, using flash-lite", { fromEnv });
  }
  return GEMINI_MODEL;
}

function candidateMeta(payload: Record<string, unknown>) {
  const candidates = payload.candidates;
  const first = Array.isArray(candidates) ? (candidates[0] as Record<string, unknown> | undefined) : undefined;
  return {
    finishReason: typeof first?.finishReason === "string" ? first.finishReason : null,
    hasParts: Array.isArray((first?.content as { parts?: unknown[] } | undefined)?.parts),
  };
}

function extractText(payload: Record<string, unknown>): string {
  const candidates = payload.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    const block = (payload.promptFeedback as { blockReason?: string } | undefined)?.blockReason;
    throw new Error(block ? `GEMINI_BLOCKED:${block}` : "GEMINI_EMPTY_CANDIDATES");
  }

  const content = candidates[0] as {
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  };
  const text =
    content.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("") ?? "";
  if (!text.trim()) {
    throw new Error("GEMINI_EMPTY_TEXT");
  }
  return text;
}

function geminiRestUrl(model: string, apiKey: string): string {
  return `${GEMINI_REST_ORIGIN}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

async function postGemini(
  url: string,
  body: Record<string, unknown>,
  label: string,
): Promise<Response> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    console.log("[grade-scan] gemini response", {
      label,
      status: response.status,
      ok: response.ok,
      ms: Date.now() - started,
    });
    return response;
  } catch (error) {
    const ms = Date.now() - started;
    if (error instanceof Error && error.name === "AbortError") {
      console.log("[grade-scan] gemini request timeout", { label, ms });
      throw new Error(`GEMINI_TIMEOUT_${ms}ms`);
    }
    console.log("[grade-scan] gemini request error", {
      label,
      ms,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function generateJson(input: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  image: GeminiImagePart;
  label: string;
}): Promise<{ parsed: Record<string, unknown>; finishReason: string | null }> {
  const url = geminiRestUrl(input.model, input.apiKey);
  const generationConfig = buildGenerationConfig(input.model);
  const body: Record<string, unknown> = {
    systemInstruction: {
      parts: [{ text: input.systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: input.image.mimeType.startsWith("image/") ? input.image.mimeType : "image/jpeg",
              data: input.image.data.replace(/\s/g, ""),
            },
          },
          { text: input.userPrompt },
        ],
      },
    ],
    generationConfig,
  };

  console.log("[grade-scan] gemini request start", {
    label: input.label,
    model: input.model,
    imageBytes: Math.round((input.image.data.length * 3) / 4),
    mimeType: input.image.mimeType.startsWith("image/") ? input.image.mimeType : "image/jpeg",
    thinkingConfig: generationConfig.thinkingConfig ?? "omitted",
    timeoutMs: GEMINI_FETCH_TIMEOUT_MS,
  });

  let response = await postGemini(url, body, input.label);
  if (!response.ok && response.status === 400 && generationConfig.thinkingConfig) {
    const detail = await response.text();
    console.log("[grade-scan] gemini retry without thinkingConfig", {
      label: input.label,
      detail: detail.slice(0, 200).replace(input.apiKey, "[redacted]"),
    });
    delete generationConfig.thinkingConfig;
    response = await postGemini(url, { ...body, generationConfig }, `${input.label}-retry`);
  }

  if (!response.ok) {
    const detail = await response.text();
    const safe = detail.slice(0, 400).replace(input.apiKey, "[redacted]");
    throw new Error(`GEMINI_HTTP_${response.status}:${safe}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const meta = candidateMeta(payload);
  let text: string;
  try {
    text = extractText(payload);
  } catch (error) {
    console.log("[grade-scan] gemini empty text", {
      label: input.label,
      finishReason: meta.finishReason,
      hasParts: meta.hasParts,
    });
    throw error;
  }
  console.log("[grade-scan] gemini text", {
    label: input.label,
    finishReason: meta.finishReason,
    textLength: text.length,
    preview: text.slice(0, 160).replace(/\s+/g, " "),
  });
  let parsed: unknown;
  try {
    parsed = parseGradeJson(text);
  } catch (error) {
    console.log("[grade-scan] gemini json parse fail", {
      label: input.label,
      finishReason: meta.finishReason,
      textLength: text.length,
      tail: text.slice(-180).replace(/\s+/g, " "),
    });
    throw error;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("GEMINI_JSON_NOT_OBJECT");
  }
  return { parsed: parsed as Record<string, unknown>, finishReason: meta.finishReason };
}

function payloadProblems(raw: Record<string, unknown>): unknown[] {
  const problems = raw.problems ?? raw.questions;
  return Array.isArray(problems) ? problems : [];
}

export async function callGeminiFlash(input: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  image: GeminiImagePart;
}): Promise<GradeResult> {
  const first = await generateJson({
    ...input,
    label: "grade",
  });
  let raw = first.parsed;
  let problems = payloadProblems(raw);
  if (first.finishReason === "MAX_TOKENS" && problems.length > 0) {
    const last = problems[problems.length - 1];
    const lastIndex =
      last && typeof last === "object" && !Array.isArray(last)
        ? String((last as { problem_index?: unknown }).problem_index ?? "")
        : "";
    const more = await generateJson({
      ...input,
      userPrompt: `${continuationUserPrompt(lastIndex, problems.length)}\n${input.userPrompt}`,
      label: "grade-continue",
    });
    raw = mergeProblemPayloads(raw, more.parsed);
    problems = payloadProblems(raw);
    console.log("[grade-scan] gemini continued after MAX_TOKENS", {
      firstCount: payloadProblems(first.parsed).length,
      mergedCount: problems.length,
      continueFinish: more.finishReason,
    });
  }
  return gradeGeminiResponse(raw);
}

export async function callGeminiEnrich(input: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  image: GeminiImagePart;
}): Promise<EnrichItem[]> {
  const raw = await generateJson({
    ...input,
    label: "enrich",
  });
  return parseEnrichItems(raw.parsed);
}

export function createGeminiClient(loadFixture?: () => GradeResult): GeminiClient {
  if (Deno.env.get("MOCK_GEMINI") === "1") {
    if (!loadFixture) {
      throw new Error("MOCK_GEMINI requires a fixture loader");
    }
    return {
      gradeWorksheet: async () => loadFixture(),
      enrichIncorrect: async () => [],
    };
  }

  return {
    gradeWorksheet: ({ systemPrompt, userPrompt, image }) =>
      callGeminiFlash({
        apiKey: readGeminiApiKey(),
        model: resolveGeminiModel(),
        systemPrompt,
        userPrompt,
        image,
      }),
    enrichIncorrect: ({ systemPrompt, userPrompt, image }) =>
      callGeminiEnrich({
        apiKey: readGeminiApiKey(),
        model: resolveGeminiModel(),
        systemPrompt,
        userPrompt,
        image,
      }),
  };
}
