import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { geminiBBoxToNormalizedBox, normalizedBoxToPixels } from "./bbox.ts";
import { SAMPLE_CARTE, SAMPLE_GRADE_RESULT, SAMPLE_JPEG_BASE64 } from "./fixtures/sample.ts";
import { inferSubject, inpaintTargetsFromInserts, toProblemInserts } from "./persist.ts";
import { base64ToBytes } from "./image.ts";
import {
  enrichCoachingTip,
  inferProblemType,
  mergeCalcBlocks,
} from "./problem-types.ts";
import { executeGradeScan, runGradeScan } from "./pipeline.ts";
import { buildSystemPrompt, formatCarteForPrompt } from "./prompt.ts";
import { buildEnrichSystemPrompt, parseEnrichItems } from "./enrich.ts";
import { buildGenerationConfig, thinkingConfigForModel } from "./gemini.ts";
import { GEMINI_MODEL, GRADE_RESPONSE_SCHEMA } from "./schema.ts";
import {
  countCorrect,
  GradeValidationError,
  gradeGeminiResponse,
  parseGradeJson,
  shouldQueueInpaint,
  validateGradeResult,
} from "./validate.ts";
import { gradeMath, gradeShortText, gradeFreeText, answersMatchStrict, gradeExtractedProblems } from "./hybrid-grade.ts";

Deno.test("responseSchema は question_text を含む抽出キーを必須にする", () => {
  assertEquals(GRADE_RESPONSE_SCHEMA.required, ["subject", "problems"]);
  const item = GRADE_RESPONSE_SCHEMA.properties.problems.items;
  assertEquals(item.required, [
    "problem_index",
    "question_text",
    "ground_truth",
    "student_answer",
    "is_correct",
    "correct_answer",
    "type",
    "topic",
    "bbox",
    "visual_type",
    "crop_box",
  ]);
  assertEquals(Object.keys(item.properties), [
    "problem_index",
    "question_text",
    "ground_truth",
    "student_answer",
    "is_correct",
    "correct_answer",
    "type",
    "topic",
    "bbox",
    "visual_type",
    "crop_box",
    "passage_text",
  ]);
  assertEquals(item.properties.question_text.description.includes("16"), true);
  assertEquals(item.properties.problem_index.description.includes("16"), true);
  assertEquals(item.properties.type.enum, ["math", "text"]);
  assertEquals(item.properties.visual_type.enum, ["text_only", "has_figure", "passage_based"]);
  assertEquals(item.properties.bbox.type, "ARRAY");
  assertEquals(item.properties.bbox.items.type, "NUMBER");
  assertEquals(item.properties.crop_box.type, "ARRAY");
  assertEquals(item.properties.ground_truth.type, "STRING");
  assertEquals(item.properties.is_correct.type, "BOOLEAN");
  assert(!("difficulty_level" in item.properties));
  assert(!("mistake_type" in item.properties));
  assert(!("needs_inpaint" in item.properties));
  assert(!("problem_type" in item.properties));
  assert(!("parent_coaching_tip" in item.properties));
});

Deno.test("既定は 3.5 flash-lite で thinkingLevel minimal・temperature 0 の REST 直叩きする", () => {
  assertEquals(GEMINI_MODEL, "gemini-3.5-flash-lite");
  assertEquals(thinkingConfigForModel(GEMINI_MODEL), { thinkingLevel: "minimal" });
  const config = buildGenerationConfig(GEMINI_MODEL);
  assertEquals(config.temperature, 0);
  assertEquals(config.responseMimeType, "application/json");
  assertEquals(config.maxOutputTokens, 2048);
  assertEquals(config.thinkingConfig, { thinkingLevel: "minimal" });
});

Deno.test("Gemini 3 系は thinkingLevel minimal、2.5 は thinkingBudget 0", () => {
  assertEquals(thinkingConfigForModel("gemini-2.5-flash"), { thinkingBudget: 0 });
  assertEquals(thinkingConfigForModel("gemini-3-flash"), { thinkingLevel: "minimal" });
  assertEquals(buildGenerationConfig("gemini-2.5-flash").thinkingConfig, { thinkingBudget: 0 });
});

Deno.test("コンパクトな判定 JSON をサーバ側で補完できる", () => {
  const result = validateGradeResult({
    overall_score: { earned: 0, max: 1 },
    problems: [
      {
        problem_index: "問1",
        bbox: [10, 10, 200, 400],
        is_correct: false,
        student_answer: "12",
        correct_answer: "13",
      },
    ],
  });
  assertEquals(result.problems[0].correct_answer, "13");
  assertEquals(result.problems[0].needs_inpaint, true);
  assertEquals(result.problems[0].mistake_type, "concept_gap");
  assert(result.problems[0].parent_coaching_tip.length >= 8);
});

Deno.test("サンプル JSON がスキーマ検証を通る", () => {
  const result = validateGradeResult(SAMPLE_GRADE_RESULT);
  assertEquals(result.overall_score, { earned: 7, max: 10 });
  assertEquals(result.problems.length, 4);
  assertEquals(result.problems[0].problem_type, "calc_block");
  assertEquals(result.problems[3].problem_type, "math_geometry_graph");
  assertEquals(result.problems[0].visual_type, "text_only");
  assertEquals(result.problems[3].visual_type, "has_figure");
  assertEquals(countCorrect(result).incorrect, 3);
});

Deno.test("コードフェンス付き JSON を剥がしてパースする", () => {
  const parsed = parseGradeJson(`\`\`\`json\n${JSON.stringify(SAMPLE_GRADE_RESULT)}\n\`\`\``);
  const result = validateGradeResult(parsed);
  assertEquals(result.problems[0].problem_index, "大問1 (1)");
});

Deno.test("途中で切れた problems JSON から完成した問だけ復元する", () => {
  const parsed = parseGradeJson(
    `{"problems":[{"problem_index":"8+2","student_answer":"10","correct_answer":"10","type":"math","bbox":[10,20,80,200]},{"problem_index":"9+1","student_answer":"`,
  ) as { problems: Array<{ problem_index: string }> };
  assertEquals(parsed.problems.length, 1);
  assertEquals(parsed.problems[0].problem_index, "8+2");
});

Deno.test("bbox [ymin,xmin,ymax,xmax] を 0-1 の crop box に変換する", () => {
  const box = geminiBBoxToNormalizedBox([270, 60, 460, 940]);
  assertEquals(box.y, 0.27);
  assertEquals(box.x, 0.06);
  assertEquals(Number(box.height.toFixed(2)), 0.19);
  assertEquals(box.width, 0.88);

  const pixels = normalizedBoxToPixels(box, 1000, 1400);
  assertEquals(pixels.left, 60);
  assertEquals(pixels.top, 378);
});

Deno.test("正解は needs_inpaint を false、無解答は blank に正規化する", () => {
  const result = validateGradeResult({
    overall_score: { earned: 1, max: 2 },
    problems: [
      {
        ...SAMPLE_GRADE_RESULT.problems[0],
        is_correct: true,
        needs_inpaint: true,
        mistake_type: "careless",
      },
      {
        ...SAMPLE_GRADE_RESULT.problems[3],
        student_answer: "",
        is_correct: false,
        mistake_type: "careless",
        needs_inpaint: true,
      },
    ],
  });

  assertEquals(result.problems[0].needs_inpaint, false);
  assertEquals(result.problems[0].mistake_type, "none");
  assertEquals(result.problems[1].mistake_type, "blank");
  assertEquals(result.problems[1].needs_inpaint, false);
});

Deno.test("不正な得点や空の problems は拒否する", () => {
  assertThrows(
    () => validateGradeResult({ overall_score: { earned: 11, max: 10 }, problems: SAMPLE_GRADE_RESULT.problems }),
    GradeValidationError,
  );
  assertThrows(
    () => validateGradeResult({ overall_score: { earned: 1, max: 10 }, problems: [] }),
    GradeValidationError,
  );
});

Deno.test("1次プロンプトは ground_truth を先に導かせ、手書きと厳密比較する", () => {
  const prompt = buildSystemPrompt(SAMPLE_CARTE, {
    name: "はると",
    gradeLabel: "小4",
    examTarget: "中学受験",
  });
  assert(prompt.includes("はると"));
  assert(prompt.includes("problem_index, question_text, ground_truth, student_answer, is_correct, correct_answer, type, topic, bbox, visual_type, crop_box"));
  assert(prompt.includes("has_figure"));
  assert(prompt.includes("crop_box"));
  assert(prompt.includes("1問=1件"));
  assert(prompt.includes("math"));
  assert(prompt.includes("text"));
  assert(prompt.includes("[ymin, xmin, ymax, xmax]"));
  assert(prompt.includes("手書き"));
  assert(prompt.includes("等号"));
  assert(prompt.includes("薄い鉛筆"));
  assert(prompt.includes("雪だるま"));
  assert(prompt.includes("ground_truth"));
  assert(prompt.includes("Step 1"));
  assert(prompt.includes("Step 2"));
  assert(prompt.includes("Step 3"));
  assert(prompt.includes("目盛り"));
  assert(prompt.includes("語群"));
  assert(prompt.includes("すべて選べ"));
  assert(prompt.includes("is_correct"));
  assert(prompt.includes("question_text"));
  assert(prompt.includes("0 + 7 ="));
  assert(prompt.includes("【抽出例】"));
  assert(prompt.includes("⑯"));
  assert(prompt.includes("2 + 4 ="));
  assert(prompt.includes('problem_index: "16"'));
  assert(prompt.includes("2 + 6 ="));
  assert(prompt.includes("解答欄"));
  assert(prompt.includes("問題番号だけ"));
  assert(prompt.includes("50°"));
  assert(prompt.includes("130°"));
  assert(prompt.includes("1,3"));
  assert(!prompt.includes("short_text"));
  assert(!prompt.includes("free_text"));
  assert(!prompt.includes("difficulty_level"));
  assert(!prompt.includes("needs_inpaint"));
  assert(!prompt.includes("parent_coaching_tip"));
  assert(!prompt.includes("つるかめ算"));
  assert(!prompt.includes("採点・思考・解説は禁止"));
  assert(formatCarteForPrompt(SAMPLE_CARTE).includes("基礎定着率: 62%"));
  const enrich = buildEnrichSystemPrompt(SAMPLE_CARTE);
  assert(enrich.includes("つるかめ算"));
  assert(enrich.includes("1文"));
});

Deno.test("2次 enrich JSON を短くパースする", () => {
  const items = parseEnrichItems({
    items: [
      {
        problem_index: "大問2",
        topic_tag: "つるかめ算",
        mistake_type: "concept_gap",
        parent_coaching_tip: "全部かめにしたら足は何本？",
      },
    ],
  });
  assertEquals(items.length, 1);
  assertEquals(items[0].topic_tag, "つるかめ算");
});

Deno.test("problems 行へ一括変換し、inpaint 対象だけ残す", () => {
  const rows = toProblemInserts(SAMPLE_GRADE_RESULT, {
    scanId: "11111111-1111-1111-1111-111111111111",
    childId: "22222222-2222-2222-2222-222222222222",
  });
  assertEquals(rows.length, 4);
  assertEquals(rows[1].problem_label, "大問1 (2)");
  assertEquals(rows[1].question_text, "52 - 18 =");
  assertEquals(rows[0].question_text, "8 × 9 =");
  assertEquals(rows[1].problem_index, 2);
  assertEquals(rows[2].subject, "math");
  assertEquals(rows[1].topic, "繰り下がり");
  assertEquals(rows[1].unit, "繰り下がり");
  assertEquals(rows[3].problem_type, "math_geometry_graph");
  assertEquals(rows[0].visual_type, "text_only");
  assertEquals(rows[3].visual_type, "has_figure");
  assertEquals(rows[3].crop_box, [830, 40, 980, 700]);
  assertEquals(inferSubject("立体切断"), "math");
  assertEquals(inferSubject("漢字書き取り", "kanji"), "japanese");

  const queued = inpaintTargetsFromInserts(rows);
  assertEquals(queued.map((row) => row.problem_label), ["大問1 (2)", "大問2"]);
  assert(SAMPLE_GRADE_RESULT.problems.every((problem) => !problem.is_correct || !shouldQueueInpaint(problem)));
});

function createFakeSupabase() {
  const inserts: unknown[] = [];
  const jobs: unknown[] = [];
  const rpcs: string[] = [];
  const scans: unknown[] = [];

  const supabase = {
    inserts,
    jobs,
    rpcs,
    scans,
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => {
                  if (table === "scans") {
                    return {
                      data: {
                        id: "s1",
                        parent_id: "p1",
                        child_id: "c1",
                        original_storage_path: "p/c/s/original.jpg",
                        quota_source: "monthly",
                        status: "pending",
                      },
                      error: null,
                    };
                  }
                  if (table === "children") {
                    return {
                      data: {
                        id: "c1",
                        parent_id: "p1",
                        name: "はると",
                        grade_code: "e4",
                        exam_target: "中学受験",
                      },
                      error: null,
                    };
                  }
                  if (table === "child_cartes") {
                    return { data: SAMPLE_CARTE, error: null };
                  }
                  return { data: null, error: null };
                },
              };
            },
          };
        },
        update() {
          const done = Promise.resolve({ error: null });
          const chain = {
            eq() {
              return chain;
            },
            then: done.then.bind(done),
          };
          return chain;
        },
        delete() {
          return { eq: async () => ({ error: null }) };
        },
        insert(payload: unknown) {
          const rows = Array.isArray(payload) ? payload : [payload];
          if (table === "problems") inserts.push(...rows);
          if (table === "inpaint_jobs") jobs.push(...rows);
          if (table === "scans") scans.push(...rows);
          const done = Promise.resolve({ data: rows, error: null });
          return Object.assign(done, {
            select: async () => {
              if (table === "problems") {
                return {
                  data: (rows as Array<{ problem_index: number; is_correct: boolean; needs_inpaint: boolean }>).map(
                    (row, index) => ({
                      id: `prob-${index + 1}`,
                      problem_index: row.problem_index,
                      is_correct: row.is_correct,
                      needs_inpaint: row.needs_inpaint,
                    }),
                  ),
                  error: null,
                };
              }
              return {
                data: (rows as object[]).map((row, index) => ({ id: `job-${index + 1}`, ...row })),
                error: null,
              };
            },
          });
        },
      };
    },
    async rpc(name: string) {
      rpcs.push(name);
      return { data: name === "enqueue_incorrect_problems" ? 3 : null, error: null };
    },
    storage: {
      from() {
        return {
          download: async () => ({ data: new Blob([new Uint8Array([255, 216, 255])]), error: null }),
          upload: async () => ({ error: null }),
        };
      },
    },
  };

  return supabase;
}

Deno.test("scan 永続化で problems 一括 insert と inpaint キューが走る", async () => {
  Deno.env.set("MOCK_GEMINI", "1");
  const fake = createFakeSupabase();
  const invoked: Record<string, unknown>[] = [];

  const output = await runGradeScan(
    { scanId: "s1" },
    {
      supabase: fake as never,
      awaitBackground: true,
      invokeInpaint: async (payload) => {
        invoked.push(payload);
      },
    },
  );

  assertEquals(output.ok, true);
  assertEquals(output.dryRun, false);
  assertEquals(output.persisted.problemCount, 4);
  assertEquals(output.persisted.inpaintQueued, 2);
  assertEquals(output.persisted.reviewEnqueued, 3);
  assertEquals(invoked.length, 2);
  assertEquals(invoked[0].problemId, "prob-2");
  assert(fake.rpcs.includes("enqueue_incorrect_problems"));
  assert(fake.rpcs.includes("update_child_carte"));
});

Deno.test("executeGradeScan は永続化完了を待たずに判定 JSON を返す", async () => {
  Deno.env.set("MOCK_GEMINI", "1");
  const fake = createFakeSupabase();

  const { output, background } = await executeGradeScan(
    { scanId: "s1" },
    {
      supabase: fake as never,
      invokeInpaint: async () => {},
    },
  );

  assertEquals(output.ok, true);
  assertEquals(output.problems.length, 4);
  assertEquals(output.persisted.reviewEnqueued, null);
  assert(background);
  await background;
  assertEquals(fake.inserts.length, 4);
});

Deno.test("MOCK Gemini で dryRun パイプラインが期待 JSON を返す", async () => {
  Deno.env.set("MOCK_GEMINI", "1");
  const invoked: Record<string, unknown>[] = [];

  const output = await runGradeScan(
    {
      dryRun: true,
      imageBase64: SAMPLE_JPEG_BASE64,
      mimeType: "image/jpeg",
      carteJsonb: SAMPLE_CARTE,
    },
    {
      invokeInpaint: async (payload) => {
        invoked.push(payload);
      },
    },
  );

  assertEquals(output.ok, true);
  assertEquals(output.dryRun, true);
  assertEquals(output.personalized, true);
  assertEquals(output.overall_score.max, 10);
  assertEquals(output.problems.length, 4);
  assertEquals(output.persisted.inpaintQueued, 2);
  assertEquals(invoked.length, 0);
});

Deno.test("クライアントは storagePath だけ送り永続化は後段", async () => {
  Deno.env.set("MOCK_GEMINI", "1");
  const fake = createFakeSupabase();
  const invoked: Record<string, unknown>[] = [];
  const scanId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  const output = await runGradeScan(
    {
      storagePath: `p1/c1/${scanId}/original.jpg`,
      scanId,
      mimeType: "image/jpeg",
      childId: "c1",
      parentId: "p1",
    },
    {
      supabase: fake as never,
      awaitBackground: true,
      invokeInpaint: async (payload) => {
        invoked.push(payload);
      },
    },
  );

  assertEquals(output.ok, true);
  assertEquals(output.dryRun, false);
  assertEquals(output.scanId, scanId);
  assertEquals(output.problems.length, 4);
  assertEquals(fake.scans.length, 1);
  assertEquals(fake.inserts.length, 4);
  assertEquals(invoked.length, 2);
  assert(fake.rpcs.includes("consume_scan_quota"));
  assert(fake.rpcs.includes("update_child_carte"));
});

Deno.test("base64 と bytes を往復できる", () => {
  const bytes = new Uint8Array([255, 216, 255, 0]);
  const encoded = btoa(String.fromCharCode(...bytes));
  assertEquals(Array.from(base64ToBytes(encoded)), Array.from(bytes));
});

Deno.test("教科・問題タイプをキーワードから推定する", () => {
  assertEquals(inferProblemType({ topicTag: "計算ドリル" }), "calc_block");
  assertEquals(inferProblemType({ topicTag: "立体展開図" }), "math_geometry_graph");
  assertEquals(inferProblemType({ topicTag: "漢字書き取り" }), "kanji");
  assertEquals(inferProblemType({ topicTag: "長文読解", subject: "japanese" }), "reading_passage");
  assertEquals(inferProblemType({ topicTag: "実験器具", subject: "science" }), "science_social_diagram");
  assertEquals(inferProblemType({ topicTag: "適性検査 200字作文" }), "integrated_essay");
  assertEquals(inferProblemType({ topicTag: "つるかめ算", subject: "math" }), "standard");
});

Deno.test("タイプ別の声かけを補完する", () => {
  const geo = enrichCoachingTip("math_geometry_graph", "", false);
  assert(geo.includes("図に書き込んで"));
  const kanji = enrichCoachingTip("kanji", "", false);
  assert(kanji.includes("とめ") || kanji.includes("はね"));
  const reading = enrichCoachingTip("reading_passage", "", false);
  assert(reading.includes("だから"));
  const sci = enrichCoachingTip("science_social_diagram", "", false);
  assert(sci.includes("なぜ"));
  const essay = enrichCoachingTip("integrated_essay", "", false);
  assert(essay.includes("グラフ"));
  const fromGemini = enrichCoachingTip("standard", "繰り下がりで1を引き忘れています。", false);
  assertEquals(fromGemini, "繰り下がりで1を引き忘れています。");
  const praise = enrichCoachingTip("standard", "3が正しく書けています。この調子で。", true);
  assertEquals(praise, "");
  const leaked = enrichCoachingTip("standard", "なぜ間違えたかを先に一言。怒らず、次の一手だけ示す。", true);
  assertEquals(leaked, "");
});

Deno.test("計算ドリルは1問ずつ返し、まとめない", () => {
  const base = {
    is_correct: false,
    student_answer: "1",
    correct_answer: "2",
    topic_tag: "計算ドリル",
    difficulty_level: "basic",
    mistake_type: "careless" as const,
    parent_coaching_tip: "位を揃えよう",
    needs_inpaint: true,
    problem_type: "calc_block" as const,
  };
  const six = Array.from({ length: 6 }, (_, index) => ({
    ...base,
    problem_index: `問${index + 1}`,
    bbox: [100 + index * 80, 50, 170 + index * 80, 900] as [number, number, number, number],
  }));
  const merged = mergeCalcBlocks(six);
  assertEquals(merged.length, 6);
  assertEquals(merged[0].problem_index, "問1");
  assertEquals(merged[5].problem_index, "問6");
});

Deno.test("ハイブリッド採点は計算をプログラム判定し、表記ゆれを吸収する", () => {
  assertEquals(
    gradeMath({ questionText: "3+6", problemIndex: "問1", studentAnswer: "9", correctAnswer: "8" }),
    true,
  );
  assertEquals(
    gradeMath({ questionText: "3＋6＝", problemIndex: "問1", studentAnswer: "９", correctAnswer: "0" }),
    true,
  );
  assertEquals(
    gradeMath({ questionText: "12×3", problemIndex: "問2", studentAnswer: "35", correctAnswer: "36" }),
    false,
  );
  assertEquals(
    gradeMath({ questionText: "2+7=", problemIndex: "2+7", studentAnswer: "9", correctAnswer: "9" }),
    true,
  );
  assertEquals(
    gradeMath({ questionText: "0+0=", problemIndex: "0+0", studentAnswer: "0", correctAnswer: "0" }),
    true,
  );
  assertEquals(
    gradeMath({ questionText: "4+4=", problemIndex: "4+4", studentAnswer: "8", correctAnswer: "8" }),
    true,
  );
  assertEquals(gradeShortText("じしん", "ジシン"), true);
  assertEquals(gradeShortText("東京", " 東 京 "), true);
  assertEquals(gradeShortText("大阪", "京都"), false);
  assertEquals(gradeFreeText("水が蒸発して水蒸気になるから", "蒸発して水蒸気になる", undefined), true);
  assertEquals(gradeFreeText("", "蒸発", undefined), false);

  const graded = gradeGeminiResponse({
    problems: [
      {
        problem_index: "3+6",
        student_answer: "9",
        correct_answer: "1",
        type: "math",
        bbox: [80, 60, 180, 420],
      },
      { problem_index: "漢字", student_answer: "山", correct_answer: "川", type: "text" },
      { problem_index: "問3", student_answer: "", correct_answer: "蒸発", type: "text" },
    ],
  });
  assertEquals(graded.overall_score, { earned: 1, max: 3 });
  assertEquals(graded.problems[0].is_correct, true);
  assertEquals(graded.problems[0].correct_answer, "9");
  assertEquals(graded.problems[0].bbox, [80, 60, 180, 420]);
  assertEquals(graded.problems[0].visual_type, "text_only");
  assertEquals(graded.problems[1].is_correct, false);
  assertEquals(graded.problems[2].mistake_type, "blank");
  assertEquals(graded.problems[2].parent_coaching_tip, "空欄。まず1つ書こう");
  assert(graded.problems[0].parent_coaching_tip === "");
  assert(graded.problems[1].parent_coaching_tip.length <= 20);
});

Deno.test("Gemini の question_text / questions エイリアスから問題文を残す", () => {
  const graded = gradeGeminiResponse({
    questions: [
      {
        question_number: "3",
        question_text: "0 + 7 =",
        user_answer: "0",
        correct_answer: "7",
        is_correct: false,
        topic: "たし算",
      },
    ],
  });
  assertEquals(graded.problems.length, 1);
  assertEquals(graded.problems[0].problem_index, "3");
  assertEquals(graded.problems[0].question_text, "0 + 7 =");
  assertEquals(graded.problems[0].student_answer, "0");
  assertEquals(graded.problems[0].is_correct, false);
  assertEquals(graded.problems[0].topic_tag, "たし算");
  const rows = toProblemInserts(graded, {
    scanId: "11111111-1111-1111-1111-111111111111",
    childId: "22222222-2222-2222-2222-222222222222",
  });
  assertEquals(rows[0].problem_label, "3");
  assertEquals(rows[0].question_text, "0 + 7 =");
});

Deno.test("question_text が問題番号だけのときは捨てる", () => {
  const graded = gradeGeminiResponse({
    problems: [
      {
        problem_index: "16",
        question_text: "16",
        student_answer: "6",
        correct_answer: "6",
        type: "math",
        bbox: [80, 60, 180, 420],
      },
      {
        problem_index: "16",
        question_text: "2 + 4 =",
        student_answer: "6",
        correct_answer: "6",
        type: "math",
        bbox: [180, 60, 280, 420],
      },
    ],
  });
  assertEquals(graded.problems[0].question_text, "");
  assertEquals(graded.problems[1].question_text, "2 + 4 =");
  assertEquals(graded.problems[1].problem_index, "16");
});

Deno.test("ground_truth と手書きが違えば不正解。一部選択も不正解", () => {
  assertEquals(answersMatchStrict("120°", "50°"), false);
  assertEquals(answersMatchStrict("50度", "50°"), true);
  assertEquals(answersMatchStrict("ア、イ", "ア、イ、ウ"), false);
  assertEquals(answersMatchStrict("ア、イ、ウ", "ア、イ、ウ"), true);
  const graded = gradeExtractedProblems([
    {
      problem_index: "4",
      question_text: "④ あの角度は、( )です。",
      student_answer: "120°",
      correct_answer: "50°",
      ground_truth: "50°",
      type: "math",
    },
  ]);
  assertEquals(graded.problems[0].is_correct, false);
  assertEquals(graded.problems[0].correct_answer, "50°");
});

Deno.test("手書きを正解にコピーしても分度器の外側目盛りとすべて選びの一部は不正解", () => {
  const protractor = gradeExtractedProblems([
    {
      problem_index: "④",
      question_text: "㋐の角度は、( )です。語群: じょうぎ 分度器 アイ イウ アウ 130° 50°",
      student_answer: "130°",
      correct_answer: "130°",
      ground_truth: "130°",
      type: "math",
    },
  ]);
  assertEquals(protractor.problems[0].is_correct, false);

  const leverWrong = gradeExtractedProblems([
    {
      problem_index: "(3)",
      question_text: "次の①〜③からすべて選び、番号を書きましょう。",
      student_answer: "2",
      correct_answer: "2",
      ground_truth: "2",
      type: "text",
    },
  ]);
  assertEquals(leverWrong.problems[0].is_correct, false);

  const leverOk = gradeExtractedProblems([
    {
      problem_index: "(3)",
      question_text: "次の①〜③からすべて選び、番号を書きましょう。",
      student_answer: "1,3",
      correct_answer: "1,3",
      ground_truth: "1,3",
      type: "text",
    },
  ]);
  assertEquals(leverOk.problems[0].is_correct, true);
});


