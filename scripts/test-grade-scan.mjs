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
  answersMatchStrict,
  canonicalizeChoiceAnswer,
  snapBBoxToAnswerSlot,
  normalizeTeacherMark,
  dedupeExtractedProblems,
  parseMarkerCoordinate,
  bboxFromMarkerCoordinate,
  mergeProblemPayloads,
  continuationUserPrompt,
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
assert.equal(extracted[0].question_text, "8×9");
const hybrid = gradeExtractedProblems(extracted);
assert.equal(hybrid.overall_score.earned, 1);
assert.equal(hybrid.problems[0].is_correct, true);
assert.equal(hybrid.problems[0].question_text, "8×9");
assert.deepEqual(hybrid.problems[0].bbox, [80, 60, 180, 420]);
assert.deepEqual(hybrid.problems[1].bbox, placeholderBBox(1, 2));
assert.equal(hybrid.problems[1].mistake_type, "blank");
assert.ok(hybrid.problems[1].parent_coaching_tip.length <= 20);
assert.equal(hybrid.problems[0].parent_coaching_tip, "");
pass("ハイブリッド採点は計算をプログラム判定し、不正解のみ定型ヒントを返す");

assert.equal(answersMatchStrict("120°", "50°"), false);
const protractorCopied = gradeExtractedProblems([
  {
    problem_index: "④",
    question_text: "㋐の角度は、( )です。語群: じょうぎ 分度器 アイ イウ アウ 130° 50°",
    student_answer: "130°",
    correct_answer: "130°",
    ground_truth: "130°",
    type: "math",
    bbox: [100, 100, 200, 400],
  },
]);
assert.equal(protractorCopied.problems[0].is_correct, false);
const leverCopied = gradeExtractedProblems([
  {
    problem_index: "(3)",
    question_text: "次の①〜③からすべて選び、番号を書きましょう。",
    student_answer: "2",
    correct_answer: "2",
    ground_truth: "2",
    type: "text",
    bbox: [100, 100, 200, 400],
  },
]);
assert.equal(leverCopied.problems[0].is_correct, false);
const leverOk = gradeExtractedProblems([
  {
    problem_index: "(3)",
    question_text: "次の①〜③からすべて選び、番号を書きましょう。",
    student_answer: "1,3",
    correct_answer: "1,3",
    ground_truth: "1,3",
    type: "text",
    bbox: [100, 100, 200, 400],
  },
]);
assert.equal(leverOk.problems[0].is_correct, true);
const mixedPage = gradeExtractedProblems([
  {
    problem_index: "(1)",
    question_text: "アのろうそくの火はどうなりますか。次の①〜③から選び、番号を書きましょう。",
    options_text: "① すぐ消える ② しばらく燃えて消える ③ 燃え続ける",
    student_answer: "2",
    correct_answer: "2",
    ground_truth: "2",
    type: "text",
    bbox: [100, 100, 200, 400],
  },
  {
    problem_index: "(2)",
    question_text: "火が消えずに燃え続けるものを、次のア〜エからすべて選びなさい。",
    student_answer: "ウ",
    correct_answer: "ウ",
    ground_truth: "ウ",
    type: "text",
    bbox: [300, 100, 400, 400],
  },
]);
assert.equal(mixedPage.problems[0].is_correct, true);
assert.equal(mixedPage.problems[1].is_correct, true);
const protractorOk = gradeExtractedProblems([
  {
    problem_index: "④",
    question_text: "㋐の角度は、( )です。語群: 130° 50°",
    student_answer: "50°",
    correct_answer: "50°",
    ground_truth: "50°",
    type: "math",
    bbox: [100, 100, 200, 400],
  },
]);
assert.equal(protractorOk.problems[0].is_correct, true);
const protractorFromBankOnPage = gradeExtractedProblems([
  {
    problem_index: "①",
    question_text: "空欄に当てはまる言葉を語群から選ぼう。じょうぎ 分度器 アイ イウ アウ 130° 50°",
    student_answer: "分度器",
    correct_answer: "分度器",
    ground_truth: "分度器",
    type: "text",
    bbox: [100, 100, 200, 400],
  },
  {
    problem_index: "④",
    question_text: "㋐の角度は、( )です。",
    student_answer: "130°",
    correct_answer: "130°",
    ground_truth: "130°",
    type: "math",
    bbox: [100, 100, 200, 400],
  },
]);
assert.equal(protractorFromBankOnPage.problems[1].is_correct, false);
assert.equal(answersMatchStrict("50度", "50°"), true);
assert.equal(answersMatchStrict("ア、イ", "ア、イ、ウ"), false);
assert.equal(answersMatchStrict("ア、イ、ウ", "ア、イ、ウ"), true);
const angleGraded = gradeExtractedProblems([
  {
    problem_index: "4",
    question_text: "④ あの角度は、( )です。",
    student_answer: "120°",
    correct_answer: "50°",
    ground_truth: "50°",
    type: "math",
  },
]);
assert.equal(angleGraded.problems[0].is_correct, false);
assert.equal(angleGraded.problems[0].correct_answer, "50°");
const copiedTruth = gradeExtractedProblems([
  {
    problem_index: "4",
    question_text: "④ あの角度は、( )です。",
    student_answer: "120°",
    correct_answer: "120°",
    ground_truth: "50°",
    type: "math",
  },
]);
assert.equal(copiedTruth.problems[0].is_correct, false);
pass("図の真の正解と手書きが違えば不正解。一部選択も不正解");

const scienceOptions = "① 空気がなくなる ② 空気の成分が変わる ③ 変わらない";
assert.equal(canonicalizeChoiceAnswer("空気がなくなる", scienceOptions), "1");
assert.equal(canonicalizeChoiceAnswer("1", scienceOptions), "1");
const shortOptions = "① 大 ② 小 ③ 同じ";
assert.equal(canonicalizeChoiceAnswer("大", shortOptions, "circle_selection"), "1");
assert.equal(canonicalizeChoiceAnswer("変わらない", scienceOptions, "circle_selection"), "3");
assert.equal(canonicalizeChoiceAnswer("なる", scienceOptions, "circle_selection"), "なる");
assert.equal(canonicalizeChoiceAnswer("大", shortOptions), "大");
const scienceWrongCopiedBody = gradeExtractedProblems([
  {
    problem_index: "(2)",
    question_text: "(1)の結果からわかることを、次の①〜③から選び、番号を書きましょう。",
    options_text: scienceOptions,
    student_answer: "空気がなくなる",
    correct_answer: "2",
    ground_truth: "2",
    type: "text",
    bbox: [220, 80, 255, 220],
  },
]);
assert.equal(scienceWrongCopiedBody.problems[0].student_answer, "1");
assert.equal(scienceWrongCopiedBody.problems[0].is_correct, false);
const sciencePrintedLabel = gradeExtractedProblems([
  {
    problem_index: "2(1)",
    question_text: "Aの器具の名前を書きましょう。",
    student_answer: "気体採取器",
    correct_answer: "気体採取器",
    ground_truth: "気体採取器",
    type: "text",
    bbox: [520, 420, 720, 900],
    parent_figure_box: [500, 380, 780, 960],
  },
]);
assert.equal(sciencePrintedLabel.problems[0].is_correct, false);
const snappedSlot = snapBBoxToAnswerSlot([520, 420, 720, 900], [500, 380, 780, 960], null);
assert.ok(snappedSlot[2] - snappedSlot[0] <= 40);
assert.ok(snappedSlot[3] < 380);
const scienceHandwrittenOk = gradeExtractedProblems([
  {
    problem_index: "2(1)",
    question_text: "Aの器具の名前を書きましょう。",
    student_answer: "気体検知管",
    correct_answer: "気体検知管",
    ground_truth: "気体検知管",
    type: "text",
    bbox: [610, 80, 648, 280],
  },
]);
assert.equal(scienceHandwrittenOk.problems[0].is_correct, true);
const circledChoice = gradeExtractedProblems([
  {
    problem_index: "1-(2)",
    question_text: "(1)の結果からわかることを、次の①〜③から選びなさい。",
    options_text: scienceOptions,
    student_answer: "2",
    correct_answer: "2",
    ground_truth: "2",
    type: "text",
    answer_type: "circle_selection",
    is_blank: false,
    bbox: [240, 120, 290, 210],
    parent_figure_box: [80, 400, 420, 960],
  },
]);
assert.equal(circledChoice.problems[0].is_correct, true);
assert.equal(circledChoice.problems[0].answer_type, "circle_selection");
assert.deepEqual(circledChoice.problems[0].bbox, [240, 120, 290, 210]);
const circledShortBody = gradeExtractedProblems([
  {
    problem_index: "1-(2)",
    question_text: "次の①〜③から選びなさい。",
    options_text: scienceOptions,
    student_answer: "変わらない",
    correct_answer: "3",
    ground_truth: "3",
    type: "text",
    answer_type: "circle_selection",
    is_blank: false,
    bbox: [300, 120, 340, 260],
  },
]);
assert.equal(circledShortBody.problems[0].student_answer, "3");
assert.equal(circledShortBody.problems[0].is_correct, true);
const blankSlot = gradeExtractedProblems([
  {
    problem_index: "1-(1)",
    question_text: "(1) 右の図のようになりました。",
    student_answer: null,
    is_blank: true,
    answer_type: "none",
    correct_answer: "1",
    ground_truth: "1",
    type: "text",
    bbox: [180, 80, 215, 200],
  },
]);
assert.equal(blankSlot.problems[0].is_blank, true);
assert.equal(blankSlot.problems[0].student_answer, "");
assert.equal(blankSlot.problems[0].is_correct, false);
pass("手書き解答欄以外の印刷ラベル・選択肢本文は答案にしない");

assert.equal(normalizeTeacherMark("〇"), "circle");
assert.equal(normalizeTeacherMark("レ点"), "check");
assert.equal(normalizeTeacherMark("×"), "cross");
const redCircleGraded = gradeExtractedProblems([
  {
    problem_index: "(3)",
    question_text: "ろうそくの火はどうなりますか。次の①〜③から選び、番号を書きましょう。",
    options_text: "① すぐ消える ② しばらく燃えて消える ③ 燃え続ける",
    student_answer: "1",
    correct_answer: "2",
    ground_truth: "2",
    type: "text",
    teacher_mark: "circle",
  },
]);
assert.equal(redCircleGraded.problems[0].is_correct, false);
const redCrossGraded = gradeExtractedProblems([
  {
    problem_index: "(1)",
    question_text: "次の①〜③から選びなさい。",
    student_answer: "2",
    correct_answer: "2",
    ground_truth: "2",
    type: "text",
    teacher_mark: "cross",
  },
]);
assert.equal(redCrossGraded.problems[0].is_correct, false);
const unmarkedAir = gradeExtractedProblems([
  {
    problem_index: "(5)",
    question_text: "集気びんの中に残っているものは何ですか。",
    student_answer: "空気",
    correct_answer: "空気",
    ground_truth: "空気",
    type: "text",
    teacher_mark: "none",
  },
]);
assert.equal(unmarkedAir.problems[0].is_correct, true);
const dupedQ1 = gradeExtractedProblems([
  {
    problem_index: "問1",
    question_text: "(1) 右の図のように、火のついたろうそくを入れるとどうなりますか。",
    student_answer: "2",
    correct_answer: "2",
    ground_truth: "2",
    type: "text",
    teacher_mark: "cross",
    bbox: [400, 80, 460, 220],
  },
  {
    problem_index: "1",
    question_text: "(1) 右の図のように、火のついたろうそくを入れるとどうなりますか。",
    student_answer: "2",
    correct_answer: "2",
    ground_truth: "2",
    type: "text",
    teacher_mark: "cross",
    bbox: [402, 82, 458, 218],
  },
]);
assert.equal(dupedQ1.problems.length, 1);
assert.equal(dupedQ1.overall_score.max, 1);
assert.equal(dedupeExtractedProblems([
  { problem_index: "問1", question_text: "(1) 火はどうなりますか。", student_answer: "2" },
  { problem_index: "(1)", question_text: "(1) 火はどうなりますか。", student_answer: "2" },
]).length, 1);
assert.deepEqual(parseMarkerCoordinate([430, 180]), [430, 180]);
assert.equal(parseMarkerCoordinate([1200, 10]), null);
const markedOverlay = gradeExtractedProblems([
  {
    problem_index: "(1)",
    question_text: "次の①〜③から選び、番号を書きましょう。",
    student_answer: "2",
    correct_answer: "2",
    ground_truth: "2",
    type: "text",
    bbox: [80, 60, 260, 940],
    marker_coordinate: [430, 180],
  },
]);
assert.deepEqual(markedOverlay.problems[0].bbox, bboxFromMarkerCoordinate([430, 180]));
assert.deepEqual(markedOverlay.problems[0].marker_coordinate, [430, 180]);
assert.equal(normalizeTeacherMark("斜線"), "cross");
const mergedPages = mergeProblemPayloads(
  { subject: "science", problems: [{ problem_index: "(1)", question_text: "アの火", student_answer: "2" }] },
  { problems: [{ problem_index: "(4)", question_text: "ウのけむり", student_answer: "2" }, { problem_index: "(5)", question_text: "調べること", student_answer: "空気" }] },
);
assert.equal(mergedPages.problems.length, 3);
assert.equal(mergedPages.problems[2].problem_index, "(5)");
assert.match(continuationUserPrompt("(3)", 3), /すでに 3 問/);
pass("赤ペン〇は正解の根拠にしない。同一小問の二重抽出は1件にまとめる。続き抽出をマージできる");

const aliasExtracted = parseExtractProblems({
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
assert.equal(aliasExtracted[0].problem_index, "3");
assert.equal(aliasExtracted[0].question_text, "0 + 7 =");
assert.equal(aliasExtracted[0].student_answer, "0");
const aliasGraded = gradeExtractedProblems(aliasExtracted);
assert.equal(aliasGraded.problems[0].is_correct, false);
assert.equal(aliasGraded.problems[0].question_text, "0 + 7 =");
assert.equal(aliasGraded.problems[0].topic_tag, "たし算");
pass("questions / question_text / user_answer エイリアスから問題文を残す");

const numberOnlyStem = parseExtractProblems({
  problems: [
    {
      problem_index: "16",
      question_text: "16",
      student_answer: "6",
      correct_answer: "6",
      type: "math",
    },
    {
      problem_index: "16",
      question_text: "2 + 4 =",
      student_answer: "6",
      correct_answer: "6",
      type: "math",
    },
  ],
});
assert.equal(numberOnlyStem[0].problem_index, "16");
assert.equal(numberOnlyStem[0].question_text, "");
assert.equal(numberOnlyStem[1].question_text, "2 + 4 =");
pass("question_text が問題番号だけのときは捨て、式は残す");

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
assert.match(schemaBlock, /ground_truth/);
assert.match(schemaBlock, /"is_correct"/);
assert.match(schemaBlock, /"teacher_mark"/);
assert.match(schemaBlock, /enum: \["circle", "check", "cross", "none"\]/);
assert.match(schemaBlock, /"marker_coordinate"/);
assert.match(schemaBlock, /visual_type/);
assert.match(schemaBlock, /has_figure/);
assert.match(schemaBlock, /crop_box/);
assert.match(schemaBlock, /question_unit/);
assert.match(schemaBlock, /context_text/);
assert.match(schemaBlock, /parent_figure_box/);
assert.match(schemaBlock, /STOP immediately ABOVE/);
assert.match(schemaBlock, /complete visual rectangle/i);
assert.match(schemaBlock, /すき間/);
assert.match(schemaBlock, /表にまとめると/);
assert.match(schemaBlock, /グラフ/);
assert.match(schemaBlock, /\(2\)/);
assert.match(schemaBlock, /ruled table/);
assert.match(schemaBlock, /和にまとめると/);
assert.match(schemaBlock, /ふた/);
assert.match(schemaBlock, /左のうで/);
assert.match(schemaBlock, /NEVER \[0,0,0,0\]/);
assert.match(schemaBlock, /sub_figure_box/);
assert.match(schemaBlock, /parent_context/);
assert.doesNotMatch(schemaBlock, /difficulty_level/);
assert.doesNotMatch(schemaBlock, /mistake_type/);
assert.doesNotMatch(schemaBlock, /needs_inpaint/);
assert.doesNotMatch(schemaBlock, /problem_type/);
assert.doesNotMatch(schemaBlock, /parent_coaching_tip/);
assert.match(schemaBlock, /question_text/);
assert.match(geminiSrc, /GEMINI_MAX_OUTPUT_TOKENS = 8192/);
assert.match(geminiSrc, /GEMINI_FETCH_TIMEOUT_MS = 25_000/);
assert.match(geminiSrc, /grade-continue/);
assert.match(geminiSrc, /MAX_TOKENS/);
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
assert.match(promptSrc, /problem_index, question_text, ground_truth, student_answer, answer_type, is_blank, teacher_mark, is_correct, correct_answer, type, topic, bbox, marker_coordinate, visual_type, crop_box, question_unit/);
assert.match(promptSrc, /teacher_mark/);
assert.match(promptSrc, /赤ペン/);
assert.match(promptSrc, /2回以上含めない/);
assert.match(promptSrc, /marker_coordinate/);
assert.match(promptSrc, /全問走査/);
assert.match(promptSrc, /最初の2〜3問で止めない/);
assert.match(promptSrc, /赤丸が付いていても/);
assert.match(promptSrc, /Step 4/);
assert.match(promptSrc, /has_figure/);
assert.match(promptSrc, /crop_box/);
assert.match(promptSrc, /question_unit/);
assert.match(promptSrc, /context_text/);
assert.match(promptSrc, /options_text/);
assert.match(promptSrc, /ground_truth/);
assert.match(promptSrc, /【4段階の思考プロセス/);
assert.match(promptSrc, /満点解答/);
assert.match(promptSrc, /甘口採点は禁止/);
assert.match(promptSrc, /子どもの手書き解答を一旦完全に無視/);
assert.match(promptSrc, /直感で答えを決めず/);
assert.match(promptSrc, /1文字でも異なれば/);
assert.match(promptSrc, /プリントの教えを上書きするな|決めつけるな/);
assert.match(promptSrc, /Step 1/);
assert.match(promptSrc, /目盛り/);
assert.match(promptSrc, /語群/);
assert.match(promptSrc, /すべて選べ/);
assert.match(promptSrc, /1問=1件/);
assert.match(promptSrc, /番号を書きましょう/);
assert.match(promptSrc, /記号を書きましょう/);
assert.match(promptSrc, /漏れなく/);
assert.match(promptSrc, /純粋な図/);
assert.match(promptSrc, /自己完結/);
assert.match(promptSrc, /参照/);
assert.match(promptSrc, /2〜3%/);
assert.match(promptSrc, /完全境界認識/);
assert.match(promptSrc, /すき間/);
assert.match(promptSrc, /Bounding Box/);
assert.match(promptSrc, /下線部/);
assert.match(promptSrc, /会話文/);
assert.match(promptSrc, /資料/);
assert.match(promptSrc, /一番右端/);
assert.match(promptSrc, /ymax/);
assert.match(promptSrc, /\(1\)/);
assert.match(promptSrc, /表にまとめると/);
assert.match(promptSrc, /\(2\)\(3\)\(6\)/);
assert.match(promptSrc, /あった方が解きやすい/);
assert.match(promptSrc, /片方だけにしない/);
assert.match(promptSrc, /罫線/);
assert.match(promptSrc, /グラフ/);
assert.match(promptSrc, /和にまとめると/);
assert.match(promptSrc, /ふた/);
assert.match(promptSrc, /引き出し/);
assert.match(promptSrc, /左のうで/);
assert.match(promptSrc, /\(6\)/);
assert.match(promptSrc, /空にするな/);
assert.match(promptSrc, /自己検証/);
assert.match(promptSrc, /parent_context/);
assert.match(promptSrc, /parent_figure_box/);
assert.match(promptSrc, /sub_figure_box/);
assert.match(promptSrc, /2 \+ 6 =/);
assert.match(promptSrc, /解答欄/);
assert.match(promptSrc, /すぐ右/);
assert.match(promptSrc, /\[ymin, xmin, ymax, xmax\]/);
assert.match(promptSrc, /手書き/);
assert.match(promptSrc, /等号/);
assert.match(promptSrc, /薄い鉛筆/);
assert.match(promptSrc, /雪だるま/);
assert.match(promptSrc, /ground_truth に手書きをコピーするな/);
assert.match(promptSrc, /130°/);
assert.match(promptSrc, /1,3/);
assert.doesNotMatch(promptSrc, /採点・思考・解説は禁止/);
assert.match(promptSrc, /0 \+ 7 =/);
assert.match(schemaBlock, /hand-drawn circle/);
assert.match(schemaBlock, /circle_selection/);
assert.match(promptSrc, /手書き解答/);
assert.match(promptSrc, /囲み型/);
assert.match(promptSrc, /circle_selection/);
assert.match(promptSrc, /気体採取器/);
assert.match(promptSrc, /空気の成分が変わる/);
assert.match(schemaBlock, /NEVER only a question number/);
assert.match(schemaBlock, /1-\(1\)/);
assert.match(promptSrc, /【抽出例】/);
assert.match(promptSrc, /⑯/);
assert.match(promptSrc, /2 \+ 4 =/);
assert.match(promptSrc, /problem_index: "16"/);
assert.match(promptSrc, /問題番号だけ/);
assert.doesNotMatch(promptSrc, /calc_block としてまとめ/);
assert.doesNotMatch(promptSrc, /parent_coaching_tip は不正解/);
pass("システムプロンプトが ground_truth 導出と厳密比較を指示する");

const { resolveScanSubject, normalizeSubject, DEFAULT_SUBJECT, SUBJECT_CODES } = await import(
  pathToFileURL(join(root, "supabase/functions/grade-scan/subject.mjs")).href,
);
assert.deepEqual(
  [...SUBJECT_CODES],
  [
    "math",
    "japanese",
    "spelling_phonics",
    "reading",
    "writing_grammar",
    "science",
    "social_studies",
    "world_languages",
    "other",
  ],
);
assert.equal(normalizeSubject("国語"), "japanese");
assert.equal(normalizeSubject("MATH"), "math");
assert.equal(normalizeSubject("english"), "world_languages");
assert.equal(normalizeSubject("社会"), "social_studies");
assert.equal(normalizeSubject("spelling"), "spelling_phonics");
assert.equal(resolveScanSubject({ subject: "english" }), "world_languages");
assert.equal(resolveScanSubject({ subject: "social" }), "social_studies");
assert.equal(
  resolveScanSubject({
    problems: [{ topic_tag: "漢字書き取り", problem_type: "kanji" }],
  }),
  "japanese",
);
assert.equal(
  resolveScanSubject({
    problems: [{ topic_tag: "Phonics CVC", problem_type: "standard" }],
  }),
  "spelling_phonics",
);
assert.equal(
  resolveScanSubject({
    problems: [{ topic_tag: "Reading Comprehension" }],
  }),
  "reading",
);
assert.equal(resolveScanSubject({}), DEFAULT_SUBJECT);
assert.equal(DEFAULT_SUBJECT, "other");
pass("プリント教科は Gemini 値を正規化し、欠落時は other に落とす");

assert.match(schemaBlock, /subject/);
assert.match(schemaBlock, /enum: SUBJECT_CODES/);
assert.match(schemaBlock, /required: \["subject", "problems", "detected_child_id", "detected_child_name", "confidence_reason"\]/);
assert.match(promptSrc, /detected_child_id/);
assert.match(promptSrc, /formatChildrenRoster/);
const matchChildSrc = readFileSync(join(root, "supabase/functions/grade-scan/match-child.mjs"), "utf8");
assert.match(matchChildSrc, /子ども振り分け/);
assert.match(promptSrc, /subject はプリント全体の教科/);
assert.match(promptSrc, /spelling_phonics/);
assert.match(promptSrc, /world_languages/);
assert.match(promptSrc, /ひらがな・漢字/);
assert.match(promptSrc, /アルファベット/);
assert.match(promptSrc, /迷ったら other/);
assert.match(promptSrc, /topic は必須/);
assert.match(promptSrc, /くり上がりのある足し算/);
assert.match(schemaBlock, /required: \[[\s\S]*"ground_truth"[\s\S]*"is_correct"[\s\S]*"crop_box"[\s\S]*"question_unit"/);
assert.match(
  readFileSync(join(root, "supabase/functions/grade-scan/persist.ts"), "utf8"),
  /resolveScanSubject/,
);
assert.match(
  readFileSync(join(root, "supabase/functions/grade-scan/pipeline.ts"), "utf8"),
  /subject: result\.subject/,
);
const scanSubjectSql = readFileSync(join(root, "supabase/migrations/20240827000020_scan_subject.sql"), "utf8");
assert.match(scanSubjectSql, /scans\.subject/);
const appSubject = await import(pathToFileURL(join(root, "src/features/scans/lib/subject.mjs")).href);
assert.deepEqual([...appSubject.SUBJECT_CODES], [...SUBJECT_CODES]);
assert.equal(appSubject.SUBJECT_BADGES.math, "📘 算数・数学");
assert.equal(appSubject.SUBJECT_BADGES.japanese, "📕 国語");
assert.equal(appSubject.normalizeSubject("english"), "world_languages");
assert.equal(appSubject.normalizeSubject("social"), "social_studies");
pass("教科スキーマ・プロンプト・DB コメントとバッジ表記が揃っている");


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

const persistSrc = readFileSync(join(root, "supabase/functions/grade-scan/persist.ts"), "utf8");
assert.match(persistSrc, /question_text: problem\.question_text/);
assert.match(persistSrc, /topic: problem\.topic_tag/);
assert.match(persistSrc, /context_text:/);
assert.match(persistSrc, /parent_figure_box:/);
assert.match(persistSrc, /sub_figure_box:/);
const validateSrc = readFileSync(join(root, "supabase/functions/grade-scan/validate.ts"), "utf8");
assert.match(validateSrc, /fillMissingSubFigureBoxes/);
assert.match(validateSrc, /あった方がよい/);
assert.match(validateSrc, /normalizeOcrText/);
assert.match(validateSrc, /inferTableBoxBelow/);
assert.match(validateSrc, /mentionsDataTable/);
const ocrTextSrc = readFileSync(join(root, "supabase/functions/grade-scan/ocr-text.mjs"), "utf8");
assert.match(ocrTextSrc, /表にまとめると/);
assert.match(ocrTextSrc, /mentionsDataTable/);
assert.match(persistSrc, /options_text:/);
assert.match(
  readFileSync(join(root, "supabase/migrations/20240827000021_problem_topic.sql"), "utf8"),
  /ADD COLUMN IF NOT EXISTS topic/,
);
pass("problems.topic を永続化する");

const serviceSrc = readFileSync(join(root, "src/features/grading/service.ts"), "utf8");
assert.match(serviceSrc, /storagePath: uploaded.storagePath/);
assert.doesNotMatch(serviceSrc, /imageBase64:/);
pass("クライアントは Storage アップロード後にパスだけ送る");

const cameraSrc = readFileSync(join(root, "app/(app)/(tabs)/camera/index.tsx"), "utf8");
assert.match(cameraSrc, /scanPaperDocuments/);
assert.match(cameraSrc, /enqueueScanJob/);
assert.doesNotMatch(cameraSrc, /launchCameraAsync/);
assert.doesNotMatch(cameraSrc, /await runGradePipeline/);
pass("撮影はドキュメントスキャナーで行い ImagePicker カメラを使わない");

const compressSrc = readFileSync(join(root, "src/lib/files/scan-image.ts"), "utf8");
assert.match(compressSrc, /SCAN_JPEG_QUALITY = 0\.6/);
assert.match(compressSrc, /SCAN_MAX_LONG_EDGE = 1280/);
assert.match(compressSrc, /pickScanPictureSize/);
assert.match(compressSrc, /compress skip/);
const compressFn = compressSrc.slice(
  compressSrc.indexOf("export async function compressScanForGrade"),
  compressSrc.indexOf("export async function describeImage"),
);
assert.doesNotMatch(compressFn, /readAsStringAsync/);
pass("圧縮は長辺1280px・JPEG 0.6 で確定し fallback read しない");

const matchChild = await import(pathToFileURL(join(root, "supabase/functions/grade-scan/match-child.mjs")).href);
const yui = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "ゆい", grade_code: "e6" };
const taro = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "たろう", grade_code: "e4" };
assert.equal(matchChild.normalizePersonName("ユイ"), "ゆい");
assert.deepEqual(matchChild.extractGradeCodes("小学6年生"), ["e6"]);
assert.equal(
  matchChild.resolveChildDetection({
    children: [yui, taro],
    fallbackChildId: taro.id,
    hint: { detected_child_id: "", detected_child_name: "ゆい", confidence_reason: "名前欄に『ゆい』" },
  }).childId,
  yui.id,
);
assert.equal(
  matchChild.resolveChildDetection({
    children: [yui, taro],
    fallbackChildId: yui.id,
    hint: { detected_child_id: "", detected_child_name: "", confidence_reason: "学年が小4" },
  }).childId,
  taro.id,
);
assert.equal(
  matchChild.resolveChildDetection({
    children: [yui, taro],
    fallbackChildId: taro.id,
    hint: { detected_child_id: "unknown", detected_child_name: "", confidence_reason: "" },
  }).fallback,
  true,
);
pass("名前欄と学年で子どもを照合し、不明なら選択中へ戻す");

console.log("\nAll grade-scan contract checks passed.");
