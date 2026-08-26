/**
 * Deno なしで grade-scan の契約を検証する。
 *   node scripts/test-grade-scan.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(
  readFileSync(join(root, "supabase/functions/grade-scan/fixtures/sample-gemini-response.json"), "utf8"),
);
const carte = JSON.parse(
  readFileSync(join(root, "supabase/functions/grade-scan/fixtures/sample-carte.json"), "utf8"),
);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function pass(name) {
  console.log(`ok - ${name}`);
}

if (!fixture.overall_score || typeof fixture.overall_score.earned !== "number") {
  fail("overall_score.earned がない");
}
if (!Array.isArray(fixture.problems) || fixture.problems.length === 0) {
  fail("problems が空");
}
pass("fixture が overall_score と problems を持つ");

const required = [
  "problem_index",
  "bbox",
  "is_correct",
  "student_answer",
  "correct_answer",
  "parent_coaching_tip",
];

for (const [index, problem] of fixture.problems.entries()) {
  for (const key of required) {
    if (!(key in problem)) fail(`problems[${index}].${key} がない`);
  }
  if (!Array.isArray(problem.bbox) || problem.bbox.length !== 4) {
    fail(`problems[${index}].bbox は [ymin,xmin,ymax,xmax]`);
  }
  if (problem.is_correct && problem.needs_inpaint) {
    fail("正解問題の needs_inpaint は false であるべき（正規化前の fixture 確認）");
  }
}
pass("各 problem が判定 JSON の必須キーを持つ");

const [ymin, xmin, ymax, xmax] = fixture.problems[1].bbox;
assert.equal(ymin, 270);
assert.equal(xmin, 60);
const box = {
  x: xmin / 1000,
  y: ymin / 1000,
  width: (xmax - xmin) / 1000,
  height: (ymax - ymin) / 1000,
};
assert.equal(box.x, 0.06);
assert.equal(box.y, 0.27);
pass("bbox 0-1000 → 正規化 crop box");

const queued = fixture.problems.filter((p) => !p.is_correct && p.needs_inpaint);
assert.equal(queued.length, 2);
assert.deepEqual(
  queued.map((p) => p.problem_index),
  ["大問1 (2)", "大問2"],
);
pass("不正解かつ needs_inpaint の2問が inpaint 対象");

assert.match(carte.triage.level, /needs_review/);
assert.ok(carte.weak_units.some((u) => u.unit === "つるかめ算"));
pass("カルテ fixture に苦手単元が含まれる");

assert.equal(fixture.overall_score.earned, 7);
assert.equal(fixture.overall_score.max, 10);
pass("得点/配点が 7/10");

assert.equal(fixture.problems[0].problem_type, "calc_block");
assert.equal(fixture.problems[2].problem_type, "standard");
assert.equal(fixture.problems[3].problem_type, "math_geometry_graph");
pass("fixture が problem_type を持つ");

const { inferProblemType, enrichCoachingTip, mergeCalcBlocks } = await import(
  pathToFileURL(join(root, "supabase/functions/grade-scan/problem-types.mjs")).href,
);
const {
  gradeMath,
  gradeShortText,
  gradeFreeText,
  gradeExtractedProblems,
  parseExtractProblems,
  placeholderBBox,
} = await import(
  pathToFileURL(join(root, "supabase/functions/grade-scan/hybrid-grade.mjs")).href,
);
const { parseJsonPayload } = await import(
  pathToFileURL(join(root, "supabase/functions/grade-scan/parse-json.mjs")).href,
);

assert.equal(inferProblemType({ topicTag: "計算ドリル" }), "calc_block");
assert.equal(inferProblemType({ topicTag: "立体展開図" }), "math_geometry_graph");
assert.equal(inferProblemType({ topicTag: "漢字書き取り" }), "kanji");
assert.equal(inferProblemType({ topicTag: "長文読解", subject: "japanese" }), "reading_passage");
assert.equal(inferProblemType({ topicTag: "実験器具", subject: "science" }), "science_social_diagram");
assert.equal(inferProblemType({ topicTag: "適性検査 200字作文" }), "integrated_essay");
assert.equal(inferProblemType({ topicTag: "つるかめ算", subject: "math" }), "standard");
pass("教科・問題タイプをキーワードから推定する");

const geo = enrichCoachingTip("math_geometry_graph", "", false);
assert.match(geo, /図に書き込んで/);
const kanji = enrichCoachingTip("kanji", "", false);
assert.match(kanji, /とめ|はね/);
const reading = enrichCoachingTip("reading_passage", "", false);
assert.match(reading, /だから/);
const sci = enrichCoachingTip("science_social_diagram", "", false);
assert.match(sci, /なぜ/);
const essay = enrichCoachingTip("integrated_essay", "", false);
assert.match(essay, /グラフ/);
const fromGemini = enrichCoachingTip("standard", "繰り下がりで1を引き忘れています。", false);
assert.equal(fromGemini, "繰り下がりで1を引き忘れています。");
const praise = enrichCoachingTip("standard", "3が正しく書けています。この調子で。", true);
assert.equal(praise, "");
const leaked = enrichCoachingTip("standard", "なぜ間違えたかを先に一言。怒らず、次の一手だけ示す。", true);
assert.equal(leaked, "");
pass("タイプ別の声かけを補完する");

const six = Array.from({ length: 6 }, (_, index) => ({
  problem_index: `問${index + 1}`,
  bbox: [100 + index * 80, 50, 170 + index * 80, 900],
  is_correct: false,
  student_answer: "1",
  correct_answer: "2",
  topic_tag: "計算ドリル",
  difficulty_level: "basic",
  mistake_type: "careless",
  parent_coaching_tip: "位を揃えよう",
  needs_inpaint: true,
  problem_type: "calc_block",
}));
const merged = mergeCalcBlocks(six);
assert.equal(merged.length, 6);
assert.equal(merged[0].problem_index, "問1");
assert.equal(merged[5].problem_index, "問6");
pass("計算ドリルは1問ずつ返し、まとめない");

assert.equal(gradeMath({ questionText: "3+6", problemIndex: "問1", studentAnswer: "9", correctAnswer: "1" }), true);
assert.equal(gradeMath({ questionText: "3＋6", problemIndex: "問1", studentAnswer: "10", correctAnswer: "9" }), false);
assert.equal(gradeMath({ questionText: "2+7=", problemIndex: "2+7", studentAnswer: "9", correctAnswer: "9" }), true);
assert.equal(gradeMath({ questionText: "0+0=", problemIndex: "0+0", studentAnswer: "0", correctAnswer: "0" }), true);
assert.equal(gradeMath({ questionText: "4+4=", problemIndex: "4+4", studentAnswer: "8", correctAnswer: "8" }), true);
assert.equal(gradeMath({ questionText: "6+3=", problemIndex: "6+3", studentAnswer: "9", correctAnswer: "9" }), true);
assert.equal(gradeShortText("じしん", "ジシン"), true);
assert.equal(gradeFreeText("水が蒸発して水蒸気になるから", "蒸発して水蒸気になる", undefined), true);
const extracted = parseExtractProblems({
  problems: [
    {
      problem_index: "8×9",
      student_answer: "72",
      correct_answer: "0",
      type: "math",
      bbox: [80, 60, 180, 420],
    },
    { problem_index: "漢字", student_answer: "", correct_answer: "山", type: "text" },
  ],
});
const hybrid = gradeExtractedProblems(extracted);
assert.equal(hybrid.overall_score.earned, 1);
assert.equal(hybrid.problems[0].is_correct, true);
assert.deepEqual(hybrid.problems[0].bbox, [80, 60, 180, 420]);
assert.deepEqual(hybrid.problems[1].bbox, placeholderBBox(1, 2));
assert.equal(hybrid.problems[1].mistake_type, "blank");
assert.ok(hybrid.problems[1].parent_coaching_tip.length <= 20);
assert.equal(hybrid.problems[0].parent_coaching_tip, "");
pass("ハイブリッド採点は計算をプログラム判定し、不正解のみ定型ヒントを返す");

const recovered = parseJsonPayload(
  `{"problems":[{"problem_index":"8+2","student_answer":"10","correct_answer":"10","type":"math","bbox":[10,20,80,200]},{"problem_index":"9+1","student_answer":"`,
);
assert.equal(recovered.problems.length, 1);
assert.equal(recovered.problems[0].problem_index, "8+2");
pass("途中で切れた Gemini JSON から完成した問だけ復元する");

const geminiSrc = readFileSync(join(root, "supabase/functions/grade-scan/gemini.ts"), "utf8");
const schemaSrc = readFileSync(join(root, "supabase/functions/grade-scan/schema.ts"), "utf8");
const schemaBlock = schemaSrc.slice(schemaSrc.indexOf("GRADE_RESPONSE_SCHEMA"), schemaSrc.indexOf("GEMINI_MODEL"));
assert.match(schemaSrc, /GEMINI_MODEL = "gemini-3\.5-flash-lite"/);
assert.match(schemaBlock, /enum: \["math", "text"\]/);
assert.match(schemaBlock, /bbox/);
assert.match(schemaBlock, /"problem_index", "student_answer", "correct_answer", "type", "bbox"/);
assert.doesNotMatch(schemaBlock, /difficulty_level/);
assert.doesNotMatch(schemaBlock, /mistake_type/);
assert.doesNotMatch(schemaBlock, /needs_inpaint/);
assert.doesNotMatch(schemaBlock, /problem_type/);
assert.doesNotMatch(schemaBlock, /parent_coaching_tip/);
assert.doesNotMatch(schemaBlock, /question_text/);
assert.match(geminiSrc, /GEMINI_MAX_OUTPUT_TOKENS = 2048/);
assert.match(geminiSrc, /GEMINI_FETCH_TIMEOUT_MS = 15_000/);
assert.match(geminiSrc, /thinkingConfigForModel/);
assert.match(geminiSrc, /thinkingLevel: "minimal"/);
assert.match(geminiSrc, /thinkingBudget: 0/);
assert.match(geminiSrc, /temperature:\s*0/);
assert.match(geminiSrc, /maxOutputTokens/);
assert.match(geminiSrc, /generativelanguage\.googleapis\.com\/v1beta\/models/);
assert.match(geminiSrc, /\?key=/);
assert.match(geminiSrc, /"Content-Type": "application\/json"/);
assert.match(geminiSrc, /retry without thinkingConfig/);
assert.match(geminiSrc, /ignore GEMINI_MODEL env, using flash-lite/);
assert.doesNotMatch(geminiSrc, /x-goog-api-key/);
pass("Gemini 呼び出しが REST 直叩き・既定は 3.5 flash-lite");

const promptSrc = readFileSync(join(root, "supabase/functions/grade-scan/prompt.ts"), "utf8");
assert.match(promptSrc, /problem_index, student_answer, correct_answer, type, bbox/);
assert.match(promptSrc, /1問=1件/);
assert.match(promptSrc, /5キー以外は出すな/);
assert.match(promptSrc, /\[ymin, xmin, ymax, xmax\]/);
assert.match(promptSrc, /手書き/);
assert.match(promptSrc, /等号/);
assert.match(promptSrc, /薄い鉛筆/);
assert.match(promptSrc, /雪だるま/);
assert.match(promptSrc, /採点・思考・解説は禁止/);
assert.doesNotMatch(promptSrc, /question_text/);
assert.doesNotMatch(promptSrc, /calc_block としてまとめ/);
assert.doesNotMatch(promptSrc, /parent_coaching_tip は不正解/);
pass("システムプロンプトが抽出のみを指示し採点を禁止する");

const enrichSrc = readFileSync(join(root, "supabase/functions/grade-scan/enrich.ts"), "utf8");
assert.match(enrichSrc, /parent_coaching_tip/);
assert.match(enrichSrc, /topic_tag/);
pass("2次パイプラインが不正解の単元タグと声かけを生成する");

const indexSrc = readFileSync(join(root, "supabase/functions/grade-scan/index.ts"), "utf8");
assert.match(indexSrc, /GRADE_SCAN_HTTP_TIMEOUT_MS = 20_000/);
assert.match(indexSrc, /enqueueBackground/);
assert.match(indexSrc, /executeGradeScan/);
assert.match(indexSrc, /storagePath/);
assert.match(indexSrc, /IMAGE_BASE64_DISABLED/);
const pipelineSrc = readFileSync(join(root, "supabase/functions/grade-scan/pipeline.ts"), "utf8");
assert.match(pipelineSrc, /waitUntil/);
pass("HTTP 層は storagePath のみ受け取り Base64 を拒否する");

const serviceSrc = readFileSync(join(root, "src/features/grading/service.ts"), "utf8");
assert.match(serviceSrc, /storagePath: uploaded.storagePath/);
assert.doesNotMatch(serviceSrc, /imageBase64:/);
pass("クライアントは Storage アップロード後にパスだけ送る");

const cameraSrc = readFileSync(join(root, "app/(app)/camera/index.tsx"), "utf8");
assert.match(cameraSrc, /CameraView/);
assert.match(cameraSrc, /expo-camera/);
assert.match(cameraSrc, /enqueueScanJob/);
assert.doesNotMatch(cameraSrc, /launchCameraAsync/);
assert.doesNotMatch(cameraSrc, /await runGradePipeline/);
pass("撮影はアプリ内 CameraView で行い ImagePicker カメラを使わない");

const compressSrc = readFileSync(join(root, "src/lib/files/scan-image.ts"), "utf8");
assert.match(compressSrc, /SCAN_JPEG_QUALITY = 0\.6/);
assert.match(compressSrc, /SCAN_MAX_LONG_EDGE = 1280/);
assert.match(compressSrc, /pickScanPictureSize/);
assert.match(compressSrc, /compress skip/);
assert.doesNotMatch(compressSrc, /readAsStringAsync/);
pass("圧縮は長辺1280px・JPEG 0.6 で確定し fallback read しない");

console.log("\nAll grade-scan contract checks passed.");
