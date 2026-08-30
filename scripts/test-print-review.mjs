/**
 * 印刷テンプレートと復習キューの契約テスト
 *   node scripts/test-print-review.mjs
 */
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const printLib = join(root, "src/features/print/lib/document.mjs");
const reviewLib = join(root, "src/features/review/lib/select.mjs");

const {
  buildPrintHtml,
  chooseAnswerStyle,
  flattenWorksheetItems,
  extractMathExpression,
  formatMathExpression,
  looksLikeMath,
  toClipItems,
  packClipRows,
  packWorksheetRows,
  paginateWorksheetRows,
  paginateWorksheetItems,
  explodeFigureItemsForPages,
  layoutKind,
  geminiBBoxToNormalizedBox,
  expandPrintCropBox,
  figureAnswerMasks,
  shrinkCropExcludingAnswer,
  coerceGeminiBox,
  cropOccupancyOf,
  geminiBoxToPixelCrop,
  expandFigureGeminiBox,
  prepareParentFigureBox,
  planExpandedFigureCrop,
  clipFigureBottomBeforeBelow,
  stripRepeatedLead,
} = await import(pathToFileURL(printLib).href);
const { applyReviewResult, isolateLeeches, selectDailyReviews } = await import(
  pathToFileURL(reviewLib).href
);

function pass(name) {
  console.log(`ok - ${name}`);
}

const SCAN_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

assert.equal(chooseAnswerStyle({ topicTag: "つるかめ算", subject: "math" }), "graph");
assert.equal(chooseAnswerStyle({ topicTag: "漢字", subject: "japanese" }), "kanji");
assert.equal(chooseAnswerStyle({ topicTag: "読解" }), "lined");
pass("単元から解答欄スタイルを切り替える");

assert.equal(extractMathExpression("72。8×9=72。"), "8×9");
assert.equal(extractMathExpression("$5+4=$"), "5+4");
assert.equal(formatMathExpression("8+2"), "8 + 2 =");
assert.equal(formatMathExpression("0 + 7 ="), "0 + 7 =");
assert.equal(formatMathExpression("$5 + 4 =$"), "5 + 4 =");
pass("Gemini の式・解説から計算式テキストを取り出す");

const compactBox = geminiBBoxToNormalizedBox([80, 60, 260, 940]);
assert.equal(Number(compactBox.width.toFixed(2)), 0.88);
assert.equal(layoutKind({ problemType: "calc_block" }, compactBox), "compact");
assert.equal(layoutKind({ problemType: "math_geometry_graph" }, compactBox), "wide");
assert.equal(layoutKind({ problemType: "reading_passage" }, { x: 0.05, y: 0.2, width: 0.9, height: 0.58 }), "wide");
pass("短い計算は2列、図形・長文は1列にする");

const figureCrop = { x: 0.05, y: 0.1, width: 0.9, height: 0.5 };
const rightAnswer = { x: 0.78, y: 0.42, width: 0.14, height: 0.12 };
const shrunkFigure = shrinkCropExcludingAnswer(figureCrop, rightAnswer);
assert.deepEqual(shrunkFigure, figureCrop);
const narrowCrop = { x: 0.1, y: 0.4, width: 0.4, height: 0.12 };
const shrunkNarrow = shrinkCropExcludingAnswer(narrowCrop, { x: 0.38, y: 0.42, width: 0.1, height: 0.08 });
assert.ok(shrunkNarrow.width < narrowCrop.width);
const preserved = shrinkCropExcludingAnswer(narrowCrop, { x: 0.38, y: 0.42, width: 0.1, height: 0.08 }, { preserveExtent: true });
assert.deepEqual(preserved, narrowCrop);
const masked = figureAnswerMasks([100, 50, 600, 950], [420, 780, 540, 920], { preserveExtent: true });
assert.ok(masked.crop);
assert.equal(masked.crop.width, 0.9);
assert.ok(Array.isArray(masked.masks));
const planned = planExpandedFigureCrop([100, 50, 500, 950], [420, 780, 540, 920], { preserveExtent: true });
assert.ok(planned.cropGemini);
assert.ok(planned.cropGemini[1] < 50);
assert.ok(planned.cropGemini[3] > 950);
pass("大問図は枠を維持し、狭い切り抜きだけ解答欄を除外する");

const thinAnswer = geminiBBoxToNormalizedBox([170, 119, 213, 513]);
assert.ok(thinAnswer.height < 0.05);
const expandedThin = expandPrintCropBox(thinAnswer);
assert.ok(expandedThin.x < thinAnswer.x);
assert.ok(expandedThin.width > 0.4);
assert.ok(expandedThin.height >= 0.11);
const thinClips = toClipItems([
  {
    id: "thin",
    label: "2",
    problemType: "calc_block",
    bbox: [170, 119, 213, 513],
    isCorrect: false,
    originalImageSrc: "https://example.com/scan.jpg",
    correctAnswer: "6",
    parentCoachingTip: "",
  },
]);
assert.equal(thinClips[0].label, "問2");
assert.equal(thinClips[0].mask.kind, "right");
assert.ok(thinClips[0].mask.x >= 0.6);
const thinHtmlProblems = [
  {
    id: "thin",
    label: "2",
    topicTag: "足し算",
    bbox: [170, 119, 213, 513],
    isCorrect: false,
    questionText: "5 + 4 =",
    originalImageSrc: "https://example.com/scan.jpg",
    correctAnswer: "6",
    parentCoachingTip: "",
  },
];
const thinHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月27日",
  problems: thinHtmlProblems,
});
assert.match(thinHtml, /\(2\)/);
assert.match(thinHtml, /answer-box/);
assert.match(thinHtml, /5 \+ 4/);
assert.doesNotMatch(thinHtml, /\(1\)\(2\)/);
assert.doesNotMatch(thinHtml, /scan-frame/);
assert.doesNotMatch(thinHtml, /<img/);
pass("解答欄だけの bbox でも画像ではなくテキストと解答枠で印字する");

const printProblems = [
  { id: "ok", label: "かけ算", problemType: "calc_block", bbox: [40, 60, 80, 940], isCorrect: true, studentAnswer: "72", originalImageSrc: SCAN_PNG, originalPath: "scans/a.jpg", correctAnswer: "72", parentCoachingTip: "" },
  { id: "c1", label: "計算", problemType: "calc_block", bbox: [80, 60, 260, 940], isCorrect: false, questionText: "3 + 4 =", studentAnswer: "43", originalImageSrc: SCAN_PNG, originalPath: "scans/a.jpg", correctAnswer: "34", parentCoachingTip: "" },
  { id: "c2", label: "漢字", problemType: "kanji", bbox: [100, 40, 220, 480], isCorrect: false, questionText: "「ちゅうい」の「ちゅう」", studentAnswer: "注", originalImageSrc: SCAN_PNG, originalPath: "scans/a.jpg", correctAnswer: "注", parentCoachingTip: "" },
  { id: "g", label: "大問3", problemType: "math_geometry_graph", bbox: [830, 60, 980, 940], isCorrect: false, questionText: "切り口はどんな形ですか", studentAnswer: "", originalImageSrc: SCAN_PNG, originalPath: "scans/a.jpg", correctAnswer: "正六角形", parentCoachingTip: "" },
  { id: "r", label: "読解", problemType: "reading_passage", bbox: [200, 50, 780, 950], isCorrect: false, questionText: "空欄に入る言葉を書きなさい", studentAnswer: "川", originalImageSrc: SCAN_PNG, originalPath: "scans/a.jpg", correctAnswer: "雨", parentCoachingTip: "" },
];
const clips = toClipItems(printProblems);
assert.equal(clips.length, 4);
assert.equal(clips.some((item) => item.id === "ok"), false);
const rows = packClipRows(clips);
assert.equal(rows[0].length, 2);
assert.equal(rows[0][0].layout, "compact");
assert.equal(rows.some((row) => row.length === 1 && row[0].layout === "wide"), true);
pass("不正解だけ切り抜き、サイズで可変配置する");

const html = buildPrintHtml({
  title: "8月26日のまとめプリント",
  childName: "はると",
  dateLabel: "2026年8月26日",
  problems: printProblems,
});
assert.match(html, /size: A4/);
assert.match(html, /margin:\s*12mm/);
assert.match(html, /なまえ: はると/);
assert.match(html, /2026年8月26日/);
assert.doesNotMatch(html, /日付<span class="line"/);
assert.match(html, /answer-box/);
assert.match(html, /font-size:\s*16px/);
assert.match(html, /width:\s*60px/);
assert.match(html, /height:\s*35px/);
assert.match(html, /page-break-inside: avoid/);
assert.match(html, /white-space:\s*normal/);
assert.match(html, /flex-direction:\s*row/);
assert.doesNotMatch(html, /height:\s*297mm/);
assert.doesNotMatch(html, /scan-frame/);
assert.doesNotMatch(html, /css-crop/);
assert.doesNotMatch(html, /保護者用カンペ/);
assert.doesNotMatch(html, /声かけ/);
assert.match(html, /3 \+ 4/);
pass("PDF は間違えた問題だけを集約し、テキストと解答枠で構成する");

const { collectPrintProblems, isIncorrectForPrint, isBlankPrintAnswer, displayQuestionText, displayTopicTag, stripLatexDollars, hasPrintableQuestion, selectProblemsForScope, dedupePrintProblems, DAILY_PRINT_MAX } = await import(
  pathToFileURL(join(root, "src/features/print/lib/from-reviews.mjs")).href,
);
const scanIncorrects = collectPrintProblems({
  childId: "child-1",
  scans: [
    {
      childId: "child-1",
      localUri: "file:///tmp/scan.jpg",
      problems: [
        {
          id: "ok",
          is_correct: true,
          problem_label: "問1",
          student_answer: "72",
          correct_answer: "72",
        },
        {
          id: "ng",
          is_correct: false,
          problem_label: "8+2",
          student_answer: "9",
          correct_answer: "10",
          topic_tag: "足し算",
        },
      ],
    },
  ],
  fallback: [{ id: "mock", label: "モック", isCorrect: false, correctAnswer: "x", parentCoachingTip: "" }],
});
assert.equal(scanIncorrects.length, 1);
assert.equal(scanIncorrects[0].id, "ng");
assert.equal(scanIncorrects[0].label, "8+2");
assert.match(scanIncorrects[0].questionText, /8\+2/);
assert.equal(scanIncorrects[0].correctAnswer, "10");
assert.equal(scanIncorrects.some((item) => item.id === "mock"), false);
const twinQ4 = collectPrintProblems({
  scope: "all",
  extras: [
    {
      id: "q4-a",
      label: "4",
      originalPath: "scans/candle.jpg",
      parentContext: "ろうそくの燃え方を比べました。",
      questionText:
        "(4) ウの上と下のすき間に線香のけむりを近づけると、どのように動きますか。次の①〜③から選び、番号を書きましょう。",
      correctAnswer: "2",
      studentAnswer: "2",
      isCorrect: false,
    },
    {
      id: "q4-b",
      label: "4",
      originalPath: "scans/candle.jpg",
      questionText:
        "(4) ウの上と下のすき間に線香のけむりを近づけると、どのように動きますか。次の①〜③から選び、番号を書きましょう。",
      correctAnswer: "1",
      studentAnswer: "2",
      isCorrect: false,
    },
  ],
});
assert.equal(twinQ4.length, 1);
assert.equal(twinQ4[0].id, "q4-a");
pass("採点の不正解だけを集め、モックへ落とさない");

const fromNumberOnly = collectPrintProblems({
  childId: "child-1",
  scans: [
    {
      childId: "child-1",
      problems: [
        {
          id: "q3",
          is_correct: false,
          problem_label: "3",
          question_text: "0 + 7 =",
          student_answer: "0",
          correct_answer: "7",
        },
      ],
    },
  ],
});
assert.equal(fromNumberOnly[0].label, "3");
assert.match(fromNumberOnly[0].questionText, /0 \+ 7/);
const formulaHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月27日",
  problems: fromNumberOnly,
});
assert.match(formulaHtml, /0 \+ 7/);
assert.doesNotMatch(formulaHtml, />3\s*=</);
assert.equal(looksLikeMath("3"), false);
assert.equal(looksLikeMath("0 + 7 ="), true);
const stems = flattenWorksheetItems(fromNumberOnly);
assert.match(stems[0].stem, /0 \+ 7/);
assert.equal(stems[0].numberLabel, "(3)");
assert.equal(stems[0].numberStyle, "round");
pass("問番号ではなく問題文・数式を復習プリントに出す");

const {
  resolveQuestionNumber,
  formatSquareNumber,
  formatRoundNumber,
} = await import(pathToFileURL(join(root, "src/features/print/lib/question-number.mjs")).href);
assert.equal(formatSquareNumber("1"), "[ 1 ]");
assert.equal(formatRoundNumber("3"), "(3)");
assert.equal(resolveQuestionNumber({ questionText: "① 支点はどれですか" }).label, "(1)");
assert.equal(resolveQuestionNumber({ questionText: "【2】次の問いに答えなさい" }).label, "[ 2 ]");
assert.equal(resolveQuestionNumber({ questionText: "■3 実験について" }).label, "[ 3 ]");
assert.equal(resolveQuestionNumber({ questionText: "[4] 正しいものを選べ" }).label, "[ 4 ]");
assert.equal(resolveQuestionNumber({ questionText: "1⃣ 左のうで" }).label, "[ 1 ]");
assert.equal(resolveQuestionNumber({ questionText: "(a) 記号を書きなさい" }).label, "(a)");
assert.equal(resolveQuestionNumber({ questionText: "2. おもりの重さ" }).label, "(2)");
assert.equal(resolveQuestionNumber({ label: "大問1" }).label, "[ 1 ]");
assert.equal(resolveQuestionNumber({ label: "大問1 (2)" }).label, "(2)");
const numberedStem = flattenWorksheetItems([
  {
    id: "n3",
    label: "1",
    topicTag: "てこ",
    visualType: "text_only",
    questionText: "(3) 実験の結果を表にまとめると、正しいものを選びなさい。",
    isCorrect: false,
    correctAnswer: "1",
    parentCoachingTip: "",
  },
]);
assert.equal(numberedStem[0].numberLabel, "(3)");
assert.equal(numberedStem[0].numberStyle, "round");
assert.doesNotMatch(numberedStem[0].stem, /^\s*\(3\)/);
const numberedHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月29日",
  problems: [
    {
      id: "n3",
      label: "1",
      topicTag: "てこ",
      visualType: "text_only",
      questionText: "(3) 実験の結果を表にまとめると、正しいものを選びなさい。",
      isCorrect: false,
      correctAnswer: "1",
      parentCoachingTip: "",
    },
  ],
});
assert.match(numberedHtml, /class="num">\(3\)</);
assert.doesNotMatch(numberedHtml, /\(1\)\s*\(3\)/);
assert.doesNotMatch(numberedHtml, /\(1\)\(3\)/);
const squareHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月29日",
  problems: [
    {
      id: "sq",
      label: "大問1",
      topicTag: "てこ",
      visualType: "text_only",
      questionText: "【1】てこについて答えなさい。",
      isCorrect: false,
      correctAnswer: "支点",
      parentCoachingTip: "",
    },
  ],
});
assert.match(squareHtml, /num-square/);
assert.match(squareHtml, /\[ 1 \]/);
pass("設問番号を元プリント記号に応じて正規化し二重連番を出さない");

assert.equal(displayQuestionText("14", "14"), "");
assert.equal(displayQuestionText("2 + 6 =", "14"), "2 + 6 =");
assert.equal(displayQuestionText("$5+4=$", "1"), "5+4=");
assert.equal(displayTopicTag("14", "14"), "");
assert.equal(displayTopicTag("たし算", "14"), "たし算");
assert.equal(stripLatexDollars("$5 + 4 =$"), "5 + 4 =");
pass("復習カードは問番号の重複を出さず式だけを本文にする");

const junkOnly = collectPrintProblems({
  childId: "child-1",
  scans: [
    {
      childId: "child-1",
      problems: [
        { id: "num", is_correct: false, problem_label: "14", question_text: "14", student_answer: "1", correct_answer: "8" },
        { id: "empty", is_correct: false, problem_label: "15", student_answer: "2", correct_answer: "9" },
        { id: "ok", is_correct: false, problem_label: "1", question_text: "$5+4=$", student_answer: "8", correct_answer: "9" },
      ],
    },
  ],
});
assert.equal(junkOnly.length, 1);
assert.equal(junkOnly[0].id, "ok");
assert.equal(hasPrintableQuestion({ questionText: "14", label: "14", correctAnswer: "8" }), false);
assert.equal(hasPrintableQuestion({ questionText: "$5+4=$", label: "1" }), true);
const latexHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月27日",
  problems: junkOnly,
});
assert.match(latexHtml, /5 \+ 4/);
assert.doesNotMatch(latexHtml, /\$/);
assert.doesNotMatch(latexHtml, />14</);
assert.match(latexHtml, /width:\s*60px/);
assert.match(latexHtml, /answer-box/);
pass("番号だけの残骸を除外し、LaTeX の $ を描画前に除去する");

const manyWrong = Array.from({ length: 8 }, (_, index) => ({
  id: `q${index}`,
  is_correct: false,
  problem_label: `${index + 1}`,
  question_text: `${index + 2} + ${index + 3} =`,
  student_answer: "0",
  correct_answer: String(index * 2 + 5),
  bbox: [80 + index * 100, 60, 160 + index * 100, 940],
}));
const dailyScan = { childId: "child-1", localUri: SCAN_PNG, originalStoragePath: "scans/a.jpg", problems: manyWrong };
const dailyPick = collectPrintProblems({
  childId: "child-1",
  scans: [dailyScan],
  scope: "daily",
});
const allPick = collectPrintProblems({
  childId: "child-1",
  scans: [dailyScan],
  scope: "all",
});
assert.equal(DAILY_PRINT_MAX, 5);
assert.equal(dailyPick.length, 5);
assert.equal(allPick.length, 8);
assert.equal(selectProblemsForScope(allPick, "daily").length, 5);
const allPages = paginateWorksheetItems(flattenWorksheetItems(allPick));
assert.equal(allPages.length, 2);
assert.equal(allPages[0].length, 6);
assert.equal(allPages[1].length, 2);
const dailyHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月27日",
  problems: dailyPick,
  scope: "daily",
});
assert.equal([...dailyHtml.matchAll(/class="sheet/g)].length, 1);
assert.match(dailyHtml, /sheet single/);
assert.match(dailyHtml, /\(5\)/);
assert.doesNotMatch(dailyHtml, /\(6\)/);
assert.doesNotMatch(dailyHtml, /height:\s*297mm/);
const extraDaily = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月27日",
  problems: allPick,
  scope: "daily",
});
assert.doesNotMatch(extraDaily, /\(6\)/);
const allHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月27日",
  problems: allPick,
  scope: "all",
});
assert.equal([...allHtml.matchAll(/class="sheet/g)].length, 2);
pass("今日の5問は先頭5問1枚、全問は1ページ6問で改ページする");

assert.equal(isBlankPrintAnswer({ student_answer: "" }), true);
assert.equal(isBlankPrintAnswer({ studentAnswer: "   " }), true);
assert.equal(isBlankPrintAnswer({ user_answer: null }), true);
assert.equal(isBlankPrintAnswer({ status: "unanswered" }), true);
assert.equal(isBlankPrintAnswer({ mistake_type: "blank", student_answer: "9" }), true);
assert.equal(isBlankPrintAnswer({ student_answer: "9" }), false);
assert.equal(isIncorrectForPrint({ is_correct: false, student_answer: "9" }), true);
assert.equal(isIncorrectForPrint({ is_correct: true, student_answer: "9" }), false);
assert.equal(isIncorrectForPrint({ is_correct: true, student_answer: "" }), true);
assert.equal(isIncorrectForPrint({ is_correct: null, student_answer: "" }), true);
const withBlanks = collectPrintProblems({
  childId: "child-1",
  scans: [
    {
      childId: "child-1",
      localUri: SCAN_PNG,
      originalStoragePath: "scans/blank.jpg",
      problems: [
        { id: "ok", is_correct: true, problem_label: "1+1", student_answer: "2", correct_answer: "2", bbox: [40, 60, 80, 940] },
        { id: "miss", is_correct: false, problem_label: "2+2", student_answer: "5", correct_answer: "4", bbox: [80, 60, 160, 940] },
        { id: "blank", is_correct: false, problem_label: "0+7", student_answer: "", correct_answer: "7", mistake_type: "blank", bbox: [160, 60, 240, 940] },
        { id: "unanswered", is_correct: true, problem_label: "5+3", student_answer: "", correct_answer: "8", bbox: [240, 60, 320, 940] },
      ],
    },
  ],
});
assert.equal(withBlanks.map((item) => item.id).sort().join(","), "blank,miss,unanswered");
const blankHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月27日",
  problems: withBlanks,
});
assert.match(blankHtml, /0 \+ 7/);
assert.match(blankHtml, /5 \+ 3/);
assert.match(blankHtml, /2 \+ 2/);
assert.doesNotMatch(blankHtml, /1 \+ 1/);
assert.match(blankHtml, /answer-box/);
pass("空欄・未回答も解き直し対象としてテキスト印字する");

const textHtml = buildPrintHtml({
  title: "お直しプリント",
  childName: "はると",
  dateLabel: "2026年8月27日",
  problems: scanIncorrects,
});
assert.match(textHtml, /8 \+ 2/);
assert.match(textHtml, /answer-box/);
assert.match(textHtml, /\(1\)/);
assert.doesNotMatch(textHtml, /<img/);
pass("画像が無い不正解も問題番号と問題文を印字する");

const fromExplanation = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月27日",
  problems: [
    {
      id: "mul",
      label: "大問1 (1)",
      topicTag: "かけ算",
      isCorrect: false,
      correctAnswer: "72。8×9=72。",
      parentCoachingTip: "",
    },
  ],
});
assert.match(fromExplanation, /8\s*×\s*9/);
assert.doesNotMatch(fromExplanation, /72。/);
pass("解説文から計算式だけを取り出して印字する");

const emptyHtml = buildPrintHtml({ title: "空", childName: "はると", dateLabel: "", problems: [] });
assert.match(emptyHtml, /間違えた問題はまだありません/);
pass("不正解が無いときは空メッセージを出す");

const FIGURE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const { inferVisualType, figureCropBoxOf } = await import(pathToFileURL(join(root, "src/features/print/lib/visual.mjs")).href);
assert.equal(inferVisualType({ visualType: "has_figure" }), "has_figure");
assert.equal(inferVisualType({ problemType: "calc_block" }), "text_only");
assert.equal(inferVisualType({ problemType: "math_geometry_graph" }), "has_figure");
assert.equal(inferVisualType({ problemType: "reading_passage" }), "passage_based");
assert.equal(inferVisualType({ questionText: "下線部①の意味を答えなさい。" }), "passage_based");
assert.equal(inferVisualType({ questionText: "会話文を読んで答えなさい。" }), "passage_based");
assert.equal(inferVisualType({ questionText: "次の資料を見て答えなさい。" }), "has_figure");
assert.equal(inferVisualType({ questionText: "下の表にまとめなさい。" }), "has_figure");
assert.equal(
  inferVisualType({
    visualType: "text_only",
    questionText: "(6) 実験の結果を表にまとめると、正しいものをすべて選びなさい。",
    parent_figure_box: [40, 50, 380, 950],
    sub_figure_box: [500, 80, 720, 900],
  }),
  "has_figure",
);
assert.deepEqual(figureCropBoxOf({ crop_box: [10, 20, 30, 40] }), [10, 20, 30, 40]);
assert.deepEqual(figureCropBoxOf({ crop_box: "[50,60,70,80]" }), [50, 60, 70, 80]);
assert.deepEqual(figureCropBoxOf({ crop_box: { 0: 1, 1: 2, 2: 3, 3: 4 } }), [1, 2, 3, 4]);
assert.deepEqual(coerceGeminiBox({ ymin: 100, xmin: 50, ymax: 400, xmax: 800 }), [100, 50, 400, 800]);
const pixel = geminiBoxToPixelCrop([0, 0, 500, 1000], 200, 400);
assert.ok(pixel);
assert.equal(pixel.originX, 0);
assert.equal(pixel.originY, 0);
assert.equal(pixel.width, 200);
assert.equal(pixel.height, 200);
const half = geminiBoxToPixelCrop([250, 250, 750, 750], 1000, 1000);
assert.ok(half);
assert.equal(half.originX, 250);
assert.equal(half.originY, 250);
assert.equal(half.width, 500);
assert.equal(half.height, 500);
const filePx = geminiBoxToPixelCrop([100, 200, 300, 600], 500, 800);
assert.ok(filePx);
assert.equal(filePx.originX, 100);
assert.equal(filePx.originY, 80);
assert.equal(filePx.width, 200);
assert.equal(filePx.height, 160);
pass("crop_box の JSON 文字列・正規化座標をピクセルに変換する");
const paddedFigure = expandFigureGeminiBox([100, 50, 500, 950]);
assert.ok(paddedFigure);
assert.ok(paddedFigure[0] < 100);
assert.ok(paddedFigure[1] < 50);
assert.ok(paddedFigure[2] > 500);
assert.ok(paddedFigure[3] > 950);
assert.ok(paddedFigure[1] < 50);
assert.ok(paddedFigure[2] <= 515);
// 解答欄 bbox の上にある設問本文も図に残さない
const clipped = clipFigureBottomBeforeBelow(
  expandFigureGeminiBox([200, 40, 480, 960]),
  [200, 40, 480, 960],
  [560, 700, 620, 920],
  12,
);
assert.ok(clipped);
assert.ok(clipped[2] <= 522);
assert.ok(clipped[2] >= 480);
assert.ok(clipped[2] < 560);
// 設問が近いときも (1) 本文の巻き込みを優先して切る
const clearStem = clipFigureBottomBeforeBelow(
  expandFigureGeminiBox([200, 40, 480, 960]),
  [200, 40, 480, 960],
  [500, 700, 560, 920],
  10,
);
assert.ok(clearStem);
assert.ok(clearStem[2] < 500);
const plannedClip = planExpandedFigureCrop([200, 40, 480, 960], [560, 700, 620, 920], {
  preserveExtent: true,
});
assert.ok(plannedClip.cropGemini);
assert.ok(plannedClip.cropGemini[2] <= 522);
const swallowedStem = planExpandedFigureCrop([80, 40, 580, 960], null, { preserveExtent: true });
assert.ok(swallowedStem.cropGemini);
assert.ok(swallowedStem.cropGemini[2] <= 510);
assert.ok(swallowedStem.cropGemini[2] < 560);
pass("親図の下端は手順注釈まで含め、設問本文は図に残さない");
const paddedRight = expandFigureGeminiBox([100, 50, 500, 800]);
assert.ok(paddedRight);
assert.ok(paddedRight[3] >= 810);
const paddedLeft = expandFigureGeminiBox([100, 200, 500, 800]);
assert.ok(paddedLeft);
assert.ok(paddedLeft[1] <= 185);
const tightLeverArm = expandFigureGeminiBox([80, 70, 360, 720]);
assert.ok(tightLeverArm);
assert.ok(tightLeverArm[3] >= 800, "おもりで切れた右うでの目盛まで伸ばす");
assert.ok(tightLeverArm[3] <= 992);
const parentAboveTable = prepareParentFigureBox([40, 50, 380, 950], [420, 80, 680, 900]);
assert.deepEqual(parentAboveTable, [40, 50, 380, 950]);
const parentFarFromTable = prepareParentFigureBox([40, 50, 380, 950], [720, 80, 960, 900]);
assert.deepEqual(parentFarFromTable, [40, 50, 380, 950]);
const parentIntoTable = prepareParentFigureBox([40, 50, 500, 950], [420, 80, 680, 900]);
assert.ok(parentIntoTable);
assert.ok(parentIntoTable[2] < 420);
const expandedIntoTable = expandFigureGeminiBox(parentIntoTable);
assert.ok(expandedIntoTable);
assert.ok(expandedIntoTable[2] <= 420 + 2);
assert.equal(
  stripRepeatedLead(
    "下の図のような手順で、てこが水平につり合うのはどれですか。(6) 実験の結果を表にまとめると、正しいものをすべて選びなさい。",
    "下の図のような手順で、てこが水平につり合うのはどれですか。",
  ),
  "(6) 実験の結果を表にまとめると、正しいものをすべて選びなさい。",
);
const occupancy = cropOccupancyOf({ figureCropBox: [100, 50, 500, 950] });
assert.ok(occupancy.widthPct >= 95);
assert.ok(occupancy.heightMm >= 40);
assert.ok(occupancy.heightMm <= 68);
pass("crop_box の元ページ占有率を A4 本文へ写す");
const { printProblemFromReview } = await import(pathToFileURL(join(root, "src/features/print/lib/from-reviews.mjs")).href);
const fromJsonCrop = printProblemFromReview({
  id: "json-crop",
  label: "図",
  visualType: "has_figure",
  problemType: "math_geometry_graph",
  crop_box: "[100,50,400,900]",
  questionText: "角度を求めなさい",
  correctAnswer: "50",
  parentCoachingTip: "",
  isCorrect: false,
});
assert.deepEqual(fromJsonCrop.figureCropBox, [100, 50, 400, 900]);
assert.equal(fromJsonCrop.visualType, "has_figure");
pass("JSON 文字列の crop_box をお直し問題に載せる");
const figureHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月28日",
  problems: [
    {
      id: "clock",
      label: "時計",
      topicTag: "時計",
      visualType: "has_figure",
      problemType: "math_geometry_graph",
      figureImageSrc: FIGURE_PNG,
      figureCropBox: [100, 50, 500, 950],
      questionText: "何時何分ですか",
      isCorrect: false,
      correctAnswer: "3時20分",
      parentCoachingTip: "",
    },
  ],
});
assert.match(figureHtml, /<img/);
assert.match(figureHtml, /data:image/);
assert.doesNotMatch(figureHtml, /file:/);
const fromBase64Only = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月28日",
  problems: [
    {
      id: "b64",
      label: "図",
      topicTag: "図形",
      visualType: "has_figure",
      problemType: "math_geometry_graph",
      figureBase64: FIGURE_PNG,
      questionText: "角度を求めなさい",
      isCorrect: false,
      correctAnswer: "1",
      parentCoachingTip: "",
    },
  ],
});
assert.match(fromBase64Only, /<img src="data:image/);
assert.match(fromBase64Only, /角度を求めなさい/);
assert.match(figureHtml, /object-fit:\s*contain/);
assert.match(figureHtml, /height:\s*auto/);
assert.doesNotMatch(figureHtml, /object-fit:\s*cover/);
assert.doesNotMatch(figureHtml, /max-height:\s*var\(--crop-h/);
assert.match(figureHtml, /--crop-w:\d+(\.\d+)?%/);
assert.match(figureHtml, /--crop-h:\d+(\.\d+)?mm/);
assert.match(figureHtml, /parent-figure/);
assert.match(figureHtml, /parent-figure img \{\s*max-height: 68mm/);
assert.match(figureHtml, /sub-figure img \{\s*max-height: none/);
assert.doesNotMatch(figureHtml, /max-height:\s*118mm/);
assert.doesNotMatch(figureHtml, /max-height:\s*85mm/);
assert.match(figureHtml, /answer-frame/);
assert.doesNotMatch(figureHtml, /figure-work/);
assert.match(figureHtml, /何時何分ですか/);
assert.equal((figureHtml.match(/class="answer-frame"/g) ?? []).length, 1);
const figureMasked = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月28日",
  problems: [
    {
      id: "lever",
      label: "(3)",
      topicTag: "てこ",
      visualType: "has_figure",
      problemType: "science_social_diagram",
      figureImageSrc: FIGURE_PNG,
      figureCropBox: [0, 0, 1000, 1000],
      bbox: [100, 100, 900, 900],
      contextText: "下の図のような手順で、てこが水平につり合うのはどれですか。",
      questionText: "すべて選び",
      optionsText: "① 支点からのきょりが2倍 ② おもりを2倍 ③ 力点と作用点を入れかえる",
      isCorrect: false,
      correctAnswer: "1,3",
      parentCoachingTip: "",
    },
  ],
});
assert.match(figureMasked, /figure-mask/);
assert.match(figureMasked, /すべて選び/);
assert.match(figureMasked, /てこが水平につり合う/);
assert.match(figureMasked, /支点からのきょり/);
assert.match(figureMasked, /answer-box/);
const figureFallback = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月28日",
  problems: [
    {
      id: "g",
      label: "大問3",
      topicTag: "立体切断",
      visualType: "has_figure",
      problemType: "math_geometry_graph",
      questionText: "切り口はどんな形ですか",
      isCorrect: false,
      correctAnswer: "正六角形",
      parentCoachingTip: "",
    },
  ],
});
assert.doesNotMatch(figureFallback, /<img/);
assert.match(figureFallback, /切り口はどんな形ですか/);
assert.match(figureFallback, /answer-box/);
const passageHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月28日",
  problems: [
    {
      id: "read",
      label: "読解",
      topicTag: "長文読解",
      visualType: "passage_based",
      problemType: "reading_passage",
      passageText: "雨が三日続いたので、川の水かさが増えた。",
      questionText: "水かさが増えた理由は？",
      isCorrect: false,
      correctAnswer: "雨が続いたから",
      parentCoachingTip: "",
    },
  ],
});
assert.match(passageHtml, /passage-block/);
assert.match(passageHtml, /雨が三日続いた/);
assert.match(passageHtml, /水かさが増えた理由/);
assert.doesNotMatch(passageHtml, /<img/);
assert.match(passageHtml, /answer-box/);
pass("図形は切り抜き画像、欠けたらテキスト、長文は本文＋設問で印字する");

const groupedProblems = [
  {
    id: "clock-1",
    label: "1",
    topicTag: "時計",
    visualType: "has_figure",
    problemType: "math_geometry_graph",
    originalPath: "scans/clock.jpg",
    figureBase64: FIGURE_PNG,
    figureCropBox: [200, 200, 700, 800],
    questionText: "何時何分ですか",
    isCorrect: false,
    correctAnswer: "3時20分",
    parentCoachingTip: "",
  },
  {
    id: "clock-2",
    label: "2",
    topicTag: "時計",
    visualType: "has_figure",
    problemType: "math_geometry_graph",
    originalPath: "scans/clock.jpg",
    figureBase64: FIGURE_PNG,
    figureCropBox: [210, 190, 690, 810],
    questionText: "あと何分で4時ですか",
    isCorrect: false,
    correctAnswer: "40分",
    parentCoachingTip: "",
  },
];
const groupedItems = flattenWorksheetItems(groupedProblems);
assert.equal(groupedItems.length, 1);
assert.equal(groupedItems[0].parts.length, 2);
assert.equal(groupedItems[0].parts[0].numberLabel, "(1)");
assert.equal(groupedItems[0].parts[1].numberLabel, "(2)");
assert.match(groupedItems[0].parts[0].stem, /何時何分ですか/);
assert.match(groupedItems[0].parts[1].stem, /あと何分で4時ですか/);
const dupProblems = [
  ...groupedProblems,
  { ...groupedProblems[0], id: "clock-1-dup" },
  { ...groupedProblems[1], id: "clock-2-extra", questionText: "(2) あと何分で4時ですか" },
];
const dedupedItems = flattenWorksheetItems(dupProblems);
assert.equal(dedupedItems.length, 1);
assert.equal(dedupedItems[0].parts.length, 2);
const dupHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月28日",
  problems: dupProblems,
});
assert.equal((dupHtml.match(/何時何分ですか/g) ?? []).length, 1);
assert.equal((dupHtml.match(/あと何分で4時ですか/g) ?? []).length, 1);
assert.equal((dupHtml.match(/<img /g) ?? []).length, 1);
pass("同一小問の重複は1件にまとめ、共通図も1枚にする");
const groupedHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月28日",
  problems: groupedProblems,
});
assert.equal((groupedHtml.match(/<img /g) ?? []).length, 1);
assert.match(groupedHtml, /何時何分ですか/);
assert.match(groupedHtml, /あと何分で4時ですか/);
assert.match(groupedHtml, /item-part/);
const threeParts = explodeFigureItemsForPages([
  {
    kind: "figure",
    id: "lever-many",
    layout: "wide",
    parentFigureSrc: FIGURE_PNG,
    context: "てこが水平につり合う条件を調べました。",
    parts: [
      { number: 1, numberLabel: "(1)", stem: "変える条件は何ですか。" },
      { number: 3, numberLabel: "(3)", stem: "実験の結果を表にまとめると" },
      { number: 4, numberLabel: "(4)", stem: "ウの上と下のすき間に線香のけむりを近づけると" },
    ],
  },
]);
assert.equal(threeParts.length, 2);
assert.equal(threeParts[0].parts.length, 2);
assert.equal(threeParts[1].parts.length, 1);
assert.equal(threeParts[1].parentFigureSrc, "");
const threeHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月31日",
  scope: "all",
  problems: [
    {
      id: "lever-1",
      label: "1",
      topicTag: "てこ",
      visualType: "has_figure",
      problemType: "science_social_diagram",
      originalPath: "scans/lever.jpg",
      parentContext: "てこが水平につり合う条件を調べました。",
      parentFigureSrc: FIGURE_PNG,
      parentFigureBox: [40, 50, 380, 950],
      questionText: "(1) 変える条件は何ですか。",
      isCorrect: false,
      correctAnswer: "1",
      parentCoachingTip: "",
    },
    {
      id: "lever-3",
      label: "3",
      topicTag: "てこ",
      visualType: "has_figure",
      problemType: "science_social_diagram",
      originalPath: "scans/lever.jpg",
      parentContext: "てこが水平につり合う条件を調べました。",
      parentFigureSrc: FIGURE_PNG,
      parentFigureBox: [40, 50, 380, 950],
      questionText: "(3) 実験の結果を表にまとめると",
      isCorrect: false,
      correctAnswer: "1",
      parentCoachingTip: "",
    },
    {
      id: "lever-4",
      label: "4",
      topicTag: "てこ",
      visualType: "has_figure",
      problemType: "science_social_diagram",
      originalPath: "scans/lever.jpg",
      parentContext: "てこが水平につり合う条件を調べました。",
      parentFigureSrc: FIGURE_PNG,
      parentFigureBox: [40, 50, 380, 950],
      questionText: "(4) ウの上と下のすき間に線香のけむりを近づけると",
      isCorrect: false,
      correctAnswer: "1",
      parentCoachingTip: "",
    },
  ],
});
assert.equal([...threeHtml.matchAll(/class="sheet/g)].length, 2);
assert.match(threeHtml, /item-part \{\s*[\s\S]*?page-break-inside: avoid/);
assert.match(threeHtml, /figure-media \{\s*[\s\S]*?page-break-inside: avoid/);
assert.doesNotMatch(threeHtml, /img \{\s*break-inside: auto !important/);
pass("同じ大問の共通図は1つだけ出し、小問を並べる");

const pathVariantProblems = [
  {
    id: "lever-a",
    label: "1",
    topicTag: "てこ",
    visualType: "has_figure",
    problemType: "science_social_diagram",
    originalPath: "user/scan-abc/original.jpg",
    parentContext: "下の図のような手順で、てこが水平につり合うのはどれですか。",
    parentFigureSrc: FIGURE_PNG,
    parentFigureBox: [40, 50, 380, 950],
    questionText: "(1) 変えるものを選びなさい。",
    optionsText: "① おもりの重さ ② 支点からのきょり",
    isCorrect: false,
    correctAnswer: "1",
    parentCoachingTip: "",
  },
  {
    id: "lever-b",
    label: "3",
    topicTag: "てこ",
    visualType: "has_figure",
    problemType: "science_social_diagram",
    originalPath: "file:///cache/original.jpg",
    parentContext: "下の図のような手順で、てこが水平につり合うのはどれですか。",
    parentFigureSrc: FIGURE_PNG,
    subFigureSrc: FIGURE_PNG,
    parentFigureBox: [45, 55, 385, 940],
    subFigureBox: [560, 40, 960, 960],
    questionText: "(3) 実験の結果を表にまとめると、正しいものをすべて選びなさい。",
    optionsText: "① 支点からのきょりが2倍 ② おもりを2倍",
    isCorrect: false,
    correctAnswer: "1,2",
    parentCoachingTip: "",
  },
];
const pathMerged = flattenWorksheetItems(pathVariantProblems);
assert.equal(pathMerged.length, 1);
assert.equal(pathMerged[0].parts.length, 2);
const pathHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月28日",
  problems: pathVariantProblems,
});
assert.equal((pathHtml.match(/class="figure-media parent-figure"/g) ?? []).length, 1);
assert.equal((pathHtml.match(/class="figure-media sub-figure"/g) ?? []).length, 1);
assert.equal((pathHtml.match(/変えるものを選びなさい/g) ?? []).length, 1);
assert.equal((pathHtml.match(/実験の結果を表にまとめると/g) ?? []).length, 1);
assert.match(pathHtml, /parent-figure img \{\s*max-height: 68mm/);
assert.match(pathHtml, /sub-figure img \{\s*max-height: none/);
const twoFigures = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月31日",
  scope: "all",
  problems: [
    ...pathVariantProblems,
    {
      id: "candle-1",
      label: "1",
      topicTag: "ろうそく",
      visualType: "has_figure",
      problemType: "science_social_diagram",
      originalPath: "scans/candle.jpg",
      parentContext: "下の㋐〜㋓のようにして、ろうそくの燃え方を比べました。",
      parentFigureSrc: FIGURE_PNG,
      parentFigureBox: [70, 40, 420, 960],
      questionText: "(1) ㋐のろうそくの火はこのあとどうなりますか。",
      optionsText: "① すぐに消える ② しばらく燃えたあと消える",
      isCorrect: false,
      correctAnswer: "1",
      parentCoachingTip: "",
    },
  ],
});
assert.equal([...twoFigures.matchAll(/class="sheet/g)].length, 2);
assert.doesNotMatch(twoFigures, /1\/1/);
assert.match(twoFigures, /1\/2/);
assert.match(twoFigures, /2\/2/);
pass("パス表記が違っても同一大問は1カード・親図1・表1にする");

const outDir = join(root, "scripts/output");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "print-preview.html"), html, "utf8");
const figurePreview = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月28日",
  problems: [
    {
      id: "calc-unit",
      label: "1",
      topicTag: "たし算",
      visualType: "text_only",
      problemType: "calc_block",
      originalImageSrc: FIGURE_PNG,
      originalPath: "scans/unit.jpg",
      bbox: [80, 60, 180, 940],
      questionText: "2 + 6 =",
      isCorrect: false,
      correctAnswer: "8",
      parentCoachingTip: "",
    },
    {
      id: "fig-unit",
      label: "3",
      topicTag: "てこ",
      visualType: "has_figure",
      problemType: "science_social_diagram",
      figureBase64: FIGURE_PNG,
      figureCropBox: [0, 200, 700, 800],
      contextText: "下の図のような手順で、てこが水平につり合うのはどれですか。",
      questionText: "(3) 実験の結果を表にまとめると、正しいものをすべて選びなさい。",
      optionsText: "① 支点からのきょりが2倍 ② おもりを2倍 ③ 力点と作用点を入れかえる",
      isCorrect: false,
      correctAnswer: "1,3",
      parentCoachingTip: "",
    },
    {
      id: "pass-unit",
      label: "2",
      topicTag: "読解",
      visualType: "passage_based",
      problemType: "reading_passage",
      contextText: "雨が三日続いたので、川の水かさが増えた。",
      questionText: "水かさが増えた理由は？",
      isCorrect: false,
      correctAnswer: "雨が続いたから",
      parentCoachingTip: "",
    },
  ],
});
assert.match(figurePreview, /2 \+ 6/);
assert.match(figurePreview, /<img src="data:image/);
assert.match(figurePreview, /てこが水平につり合う/);
assert.match(figurePreview, /実験の結果を表にまとめると/);
assert.match(figurePreview, /支点からのきょり/);
assert.match(figurePreview, /passage-block/);
assert.match(figurePreview, /水かさが増えた理由/);
assert.match(figurePreview, /--crop-w:/);
assert.match(figurePreview, /--crop-h:/);
assert.match(figurePreview, /page-break-inside: avoid/);
writeFileSync(join(outDir, "print-figure-preview.html"), figurePreview, "utf8");
pass("計算・図あり・長文のユニットを同じ紙面に並べる");

const compoundHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月28日",
  problems: [
    {
      id: "lever-3",
      label: "3",
      topicTag: "てこ",
      visualType: "has_figure",
      problemType: "science_social_diagram",
      parentContext: "下の図のような手順で、てこが水平につり合うのはどれですか。",
      questionText: "(3) 実験の結果を表にまとめると、正しいものをすべて選びなさい。",
      optionsText: "① 支点からのきょりが2倍 ② おもりを2倍 ③ 力点と作用点を入れかえる",
      parentFigureSrc: FIGURE_PNG,
      subFigureSrc: FIGURE_PNG,
      parentFigureBox: [40, 50, 380, 950],
      subFigureBox: [420, 80, 680, 900],
      isCorrect: false,
      correctAnswer: "1,3",
      parentCoachingTip: "",
    },
  ],
});
assert.equal((compoundHtml.match(/<img /g) ?? []).length, 2);
const ctxAt = compoundHtml.indexOf("下の図のような手順");
const qAt = compoundHtml.indexOf("実験の結果を表にまとめると");
const optAt = compoundHtml.indexOf("支点からのきょり");
const firstImg = compoundHtml.indexOf("<img ");
const secondImg = compoundHtml.indexOf("<img ", firstImg + 1);
assert.ok(ctxAt >= 0 && firstImg > ctxAt && qAt > firstImg && secondImg > qAt && optAt > secondImg);
assert.match(compoundHtml, /answer-box/);
pass("複合問題は親図・設問・表・選択肢の順に並べる");

const dupParentHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月28日",
  problems: [
    {
      id: "lever-dup",
      label: "3",
      topicTag: "てこ",
      visualType: "has_figure",
      problemType: "science_social_diagram",
      parentContext: "下の図のような手順で、てこが水平につり合うのはどれですか。",
      questionText: "(1) 正しいものを選びなさい。",
      optionsText: "| おもり | きょり |\n| --- | --- |\n| 1個 | 2 |\n① ア ② イ",
      parentFigureSrc: FIGURE_PNG,
      subFigureSrc: FIGURE_PNG,
      parentFigureBox: [40, 50, 380, 950],
      isCorrect: false,
      correctAnswer: "ア",
      parentCoachingTip: "",
    },
  ],
});
assert.equal((dupParentHtml.match(/<img /g) ?? []).length, 1);
assert.doesNotMatch(dupParentHtml, /\| おもり \|/);
assert.match(dupParentHtml, /① ア/);
pass("親図と同一の sub は二重描画せず、Markdown表テキストも出さない");

const tableMarkdownHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月28日",
  problems: [
    {
      id: "lever-md",
      label: "3",
      topicTag: "てこ",
      visualType: "has_figure",
      problemType: "science_social_diagram",
      parentContext: "下の図のような手順で、てこが水平につり合うのはどれですか。",
      questionText: "(3) 実験の結果を表にまとめると、正しいものをすべて選びなさい。",
      optionsText: "| おもりの数 | 支点からのきょり |\n| --- | --- |\n| 1個 | 6 |\n① ア ② イ ③ ウ",
      parentFigureSrc: FIGURE_PNG,
      subFigureSrc: FIGURE_PNG,
      parentFigureBox: [40, 50, 380, 950],
      subFigureBox: [420, 80, 680, 900],
      isCorrect: false,
      correctAnswer: "1,3",
      parentCoachingTip: "",
    },
  ],
});
assert.equal((tableMarkdownHtml.match(/<img /g) ?? []).length, 2);
assert.doesNotMatch(tableMarkdownHtml, /\| おもりの数 \|/);
assert.match(tableMarkdownHtml, /① ア/);
pass("表画像があるとき Markdown 表テキストは出さない");

const tableOnlyHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月28日",
  problems: [
    {
      id: "lever-6",
      label: "6",
      topicTag: "てこ",
      visualType: "text_only",
      problemType: "standard",
      parentContext: "下の図のような手順で、てこが水平につり合うのはどれですか。",
      questionText: "(6) 実験の結果を表にまとめると、正しいものをすべて選びなさい。",
      optionsText: "① 支点からのきょりが2倍 ② おもりを2倍 ③ 力点と作用点を入れかえる",
      parentFigureSrc: FIGURE_PNG,
      subFigureSrc: FIGURE_PNG,
      parentFigureBox: [40, 50, 380, 950],
      subFigureBox: [500, 80, 720, 900],
      isCorrect: false,
      correctAnswer: "1,3",
      parentCoachingTip: "",
    },
  ],
});
assert.equal((tableOnlyHtml.match(/<img /g) ?? []).length, 2);
const tableQ = tableOnlyHtml.indexOf("実験の結果を表にまとめると");
const tableFirstImg = tableOnlyHtml.indexOf("<img ");
const tableSecondImg = tableOnlyHtml.indexOf("<img ", tableFirstImg + 1);
assert.ok(tableQ > tableFirstImg && tableSecondImg > tableQ);
pass("表にまとめるとの小問は visual_type が text_only でも表を出す");

const ocrTableHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月28日",
  problems: [
    {
      id: "lever-ocr",
      label: "6",
      topicTag: "てこ",
      visualType: "has_figure",
      parentContext: "下の図のような手順で、てこが水平につり合うのはどれですか。",
      questionText:
        "下の図のような手順で、てこが水平につり合うのはどれですか。(6) 実験の結果を和にまとめると、正しいものをすべて選びなさい。",
      optionsText: "① 支点からのきょりが2倍",
      parentFigureSrc: FIGURE_PNG,
      subFigureSrc: FIGURE_PNG,
      parentFigureBox: [40, 50, 380, 950],
      subFigureBox: [500, 80, 720, 900],
      isCorrect: false,
      correctAnswer: "1,3",
      parentCoachingTip: "",
    },
  ],
});
assert.equal((ocrTableHtml.match(/てこが水平につり合う/g) ?? []).length, 1);
assert.match(ocrTableHtml, /表にまとめると/);
assert.doesNotMatch(ocrTableHtml, /和にまとめると/);
assert.equal((ocrTableHtml.match(/<img /g) ?? []).length, 2);
pass("OCRの和にまとめるとを直し、リード文の二重表示を除く");

const q2TableHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月28日",
  problems: [
    {
      id: "lever-2",
      label: "2",
      topicTag: "てこ",
      visualType: "has_figure",
      parentContext: "下の図のような手順で、てこが水平につり合うのはどれですか。",
      questionText: "(2) 実験の結果を表にまとめると、正しいものをすべて選びなさい。",
      optionsText: "① 支点からのきょりが2倍 ② おもりを2倍",
      parentFigureSrc: FIGURE_PNG,
      subFigureBase64: FIGURE_PNG,
      parentFigureBox: [40, 50, 380, 950],
      subFigureBox: [500, 80, 720, 900],
      isCorrect: false,
      correctAnswer: "1,2",
      parentCoachingTip: "",
    },
  ],
});
assert.equal((q2TableHtml.match(/<img /g) ?? []).length, 2);
const q2At = q2TableHtml.indexOf("実験の結果を表にまとめると");
const q2First = q2TableHtml.indexOf("<img ");
const q2Second = q2TableHtml.indexOf("<img ", q2First + 1);
assert.ok(q2At > q2First && q2Second > q2At);
pass("小問(2)のデータ表を本文直下に必ず描画する");

const { enrichPrintFigureBoxes, resolveSubFigureBox, resolveParentFigureBox, needsDataTableVisual, benefitsFromParentFigure } =
  await import(pathToFileURL(join(root, "src/features/print/lib/figure-boxes.mjs")).href);
assert.equal(
  needsDataTableVisual({
    questionText: "(3) 実験の結果を表にまとめると下のようになりました。",
  }),
  true,
);
assert.equal(
  needsDataTableVisual({
    questionText: "(3) 実験の結果から正しいものをすべて選びなさい。",
  }),
  true,
);
assert.equal(benefitsFromParentFigure({ questionText: "(3) 実験の結果を表にまとめると下のようになりました。" }), true);
const inferredSub = resolveSubFigureBox({
  questionText: "(3) 実験の結果を表にまとめると下のようになりました。",
  parentFigureBox: [40, 50, 380, 950],
});
assert.ok(inferredSub);
assert.ok(inferredSub[0] >= 500);
assert.ok(inferredSub[0] <= 720);
assert.ok(inferredSub[2] - inferredSub[0] >= 120);
assert.ok(inferredSub[1] >= 30);
assert.ok(inferredSub[3] <= 970);
const tightTable = resolveSubFigureBox({
  questionText: "(3) 実験の結果を表にまとめると下のようになりました。",
  parentFigureBox: [40, 50, 380, 950],
  subFigureBox: [760, 80, 900, 900],
});
assert.ok(tightTable);
assert.ok(tightTable[0] >= 740);
assert.ok(tightTable[1] >= 60);
assert.ok(tightTable[2] <= 930);
assert.ok(tightTable[3] <= 920);
const tableWithChoices = resolveSubFigureBox({
  questionText: "(3) 実験の結果を表にまとめると下のようになりました。次の①〜③からすべて選び、番号を書きましょう。",
  optionsText: "① 支点からのきょりが2倍、3倍になると、おもりの重さは 1/2, 1/3 となる。\n② 支点からのきょりが2倍、3倍になると、おもりの重さも2倍、3倍になる。\n③ 左右のうでで、支点からのきょりとおもりの重さの積が同じになっている。",
  parentFigureBox: [40, 50, 380, 950],
  subFigureBox: [720, 70, 900, 910],
});
assert.ok(tableWithChoices);
assert.ok(tableWithChoices[0] > 720, "選択肢①行を表クロップ上端から外す");
assert.ok(tableWithChoices[2] >= 900, "表の最終行は切らない");
const tableIntoOptions = resolveSubFigureBox({
  questionText: "(3) 実験の結果を表にまとめると下のようになりました。次の①〜③からすべて選び、番号を書きましょう。",
  optionsText: "③ 左右のうでで、支点からのきょりとおもりの重さの積が同じになっている。",
  parentFigureBox: [40, 50, 380, 950],
  subFigureBox: [700, 70, 980, 910],
});
assert.ok(tableIntoOptions);
assert.ok(tableIntoOptions[2] < 980, "箱が①〜③帯まで伸びているときだけ下を切る");
assert.ok(tableIntoOptions[2] >= 900, "切っても表の最終行は残す");
const enriched = enrichPrintFigureBoxes([
  {
    id: "a",
    originalPath: "scans/x.jpg",
    questionText: "(1) 変えるものを選びなさい。",
    parentFigureBox: [40, 50, 380, 950],
    visualType: "has_figure",
  },
  {
    id: "b",
    originalPath: "scans/x.jpg",
    questionText: "(3) 実験の結果を表にまとめると下のようになりました。",
    visualType: "text_only",
  },
]);
assert.deepEqual(enriched[1].parentFigureBox, [40, 50, 380, 950]);
assert.ok(enriched[1].subFigureBox);
assert.equal(enriched[1].visualType, "has_figure");
const enrichedHelpful = enrichPrintFigureBoxes([
  {
    id: "p",
    originalPath: "scans/y.jpg",
    questionText: "(1) 変えるものを選びなさい。",
    parentFigureBox: [40, 50, 380, 950],
    subFigureBox: [760, 40, 960, 960],
    visualType: "has_figure",
  },
  {
    id: "q",
    originalPath: "scans/y.jpg",
    questionText: "(3) 実験の結果から正しいものをすべて選びなさい。",
    visualType: "text_only",
  },
]);
assert.deepEqual(enrichedHelpful[1].parentFigureBox, [40, 50, 380, 950]);
assert.deepEqual(enrichedHelpful[1].subFigureBox, [760, 40, 960, 960]);
assert.equal(enrichedHelpful[1].visualType, "has_figure");
const fromCropOnly = enrichPrintFigureBoxes([
  {
    id: "crop-only",
    originalPath: "scans/z.jpg",
    questionText: "(3) 実験の結果を表にまとめると下のようになりました。",
    crop_box: [40, 50, 380, 950],
    visualType: "text_only",
  },
]);
assert.deepEqual(fromCropOnly[0].parentFigureBox, [40, 50, 380, 950]);
assert.ok(fromCropOnly[0].subFigureBox);
assert.ok(fromCropOnly[0].subFigureBox[2] - fromCropOnly[0].subFigureBox[0] >= 90);
assert.deepEqual(
  resolveParentFigureBox({
    questionText: "(3) 実験の結果を表にまとめると",
    crop_box: [40, 50, 380, 950],
  }),
  [40, 50, 380, 950],
);
const noSharedSolo = enrichPrintFigureBoxes([
  {
    id: "lever-solo",
    questionText: "(1) 変える条件は何ですか。",
    parentFigureBox: [40, 50, 380, 950],
    visualType: "has_figure",
  },
  {
    id: "candle-solo",
    questionText: "(1) ろうそくの火はどうなりますか。",
    parentFigureBox: [80, 40, 420, 960],
    visualType: "has_figure",
  },
]);
assert.deepEqual(noSharedSolo[0].parentFigureBox, [40, 50, 380, 950]);
assert.deepEqual(noSharedSolo[1].parentFigureBox, [80, 40, 420, 960]);
const mixedCards = flattenWorksheetItems([
  {
    id: "lever-card",
    label: "1",
    topicTag: "てこ",
    visualType: "has_figure",
    problemType: "science_social_diagram",
    parentContext: "てこが水平につり合う条件を調べました。",
    parentFigureSrc: FIGURE_PNG,
    parentFigureBox: [40, 50, 380, 950],
    questionText: "(1) 変える条件は何ですか。",
    isCorrect: false,
    correctAnswer: "1",
    parentCoachingTip: "",
  },
  {
    id: "candle-card",
    label: "1",
    topicTag: "ろうそく",
    visualType: "has_figure",
    problemType: "science_social_diagram",
    parentContext: "下の㋐〜㋓のようにして、ろうそくの燃え方を比べました。",
    parentFigureSrc: FIGURE_PNG,
    parentFigureBox: [80, 40, 420, 960],
    questionText: "(1) ㋐のろうそくの火はこのあとどうなりますか。",
    isCorrect: false,
    correctAnswer: "1",
    parentCoachingTip: "",
  },
]);
assert.equal(mixedCards.length, 2);
const bothHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月28日",
  problems: [
    {
      id: "both-3",
      label: "3",
      topicTag: "てこ",
      visualType: "has_figure",
      parentContext: "下の図のような手順で、てこが水平につり合うのはどれですか。",
      questionText: "(3) 実験の結果を表にまとめると下のようになりました。正しいものをすべて選びなさい。",
      optionsText: "① 支点からのきょり ② おもりの重さ",
      parentFigureSrc: FIGURE_PNG,
      subFigureSrc: FIGURE_PNG,
      parentFigureBox: [40, 50, 380, 950],
      subFigureBox: inferredSub,
      isCorrect: false,
      correctAnswer: "1",
      parentCoachingTip: "",
    },
  ],
});
assert.equal((bothHtml.match(/<img /g) ?? []).length, 2);
assert.ok(bothHtml.indexOf("表にまとめると") > bothHtml.indexOf("<img "));
pass("図と表があり必須またはあった方がよい小問は親図と表を両方出す");
pass("プレビュー HTML を書き出した");

assert.equal(chooseAnswerStyle({ problemType: "calc_block" }), "calc");
assert.equal(chooseAnswerStyle({ problemType: "kanji" }), "kanji");
pass("problem_type から解答欄スタイルを切り替える");

const previewScreen = readFileSync(join(root, "app/(app)/print/preview.tsx"), "utf8");
assert.match(previewScreen, /PrintPreviewSheets/);
assert.match(previewScreen, /ScreenBackButton/);
assert.doesNotMatch(previewScreen, /ネイティブでは PDF/);
assert.doesNotMatch(previewScreen, /切り抜きです/);
const previewSheets = readFileSync(join(root, "src/features/print/PreviewSheets.tsx"), "utf8");
assert.match(previewSheets, /flattenWorksheetItems/);
assert.match(previewSheets, /width: 60/);
assert.match(previewSheets, /fontSize: 16/);
assert.match(previewSheets, /sanitizeStem/);
assert.match(previewSheets, /FigureAnswerFrame/);
assert.match(previewSheets, /occupancy/);
assert.match(previewSheets, /resizeMode="contain"/);
assert.doesNotMatch(previewSheets, /maxHeight/);
assert.match(previewSheets, /item.parts/);
assert.match(previewSheets, /part.subFigureSrc/);
assert.doesNotMatch(previewSheets, /fontSize: 22/);
assert.doesNotMatch(previewSheets, /CroppedImage/);
assert.doesNotMatch(previewSheets, /toScanPrintSheets/);
assert.doesNotMatch(previewSheets, /borderStyle: "dashed"/);
const printScreen = readFileSync(join(root, "app/(app)/print/index.tsx"), "utf8");
assert.doesNotMatch(printScreen, /保護者カンペシート/);
assert.match(printScreen, /t\("print\.subtitle"\)/);
assert.match(printScreen, /PrintScopeToggle/);
assert.match(previewScreen, /PrintScopeToggle/);
const reviewScreen = readFileSync(join(root, "app/(app)/(tabs)/review/index.tsx"), "utf8");
assert.match(reviewScreen, /PrintScopeToggle/);
assert.match(reviewScreen, /ReviewPrintList/);
assert.match(reviewScreen, /t\("review.printAll"\)|t\("review.printSelected"/);
assert.doesNotMatch(reviewScreen, /Leech/);
assert.doesNotMatch(reviewScreen, /要指導リストへ退場/);
assert.doesNotMatch(reviewScreen, /今日の出題は少なめ/);
const reviewList = readFileSync(join(root, "src/features/review/ReviewPrintList.tsx"), "utf8");
assert.match(reviewList, /accessibilityRole="checkbox"/);
assert.match(reviewList, /t\("review.answered"\)|t\("review.unanswered"/);
assert.match(reviewList, /togglePrintSelection/);
const printStore = readFileSync(join(root, "src/stores/printStore.ts"), "utf8");
assert.match(printStore, /excludedIds/);
const printHook = readFileSync(join(root, "src/features/print/usePrintDocument.ts"), "utf8");
assert.match(printHook, /excluded\.has/);
assert.match(printHook, /candidates/);
assert.match(printHook, /resolvePrintImageUrls/);
const scanImageSrc = readFileSync(join(root, "src/lib/files/scan-image.ts"), "utf8");
assert.match(scanImageSrc, /FIGURE_CACHE_VERSION = 24/);
assert.match(scanImageSrc, /isRawScanSourceUri/);
assert.match(scanImageSrc, /expandFigureGeminiBox/);
assert.match(scanImageSrc, /planExpandedFigureCrop/);
assert.match(scanImageSrc, /cropFigureToBase64/);
assert.match(scanImageSrc, /expanded-preserve|expanded-table/);
assert.match(scanImageSrc, /preserveExtent:\s*true/);
assert.match(scanImageSrc, /asTable/);
assert.match(readFileSync(join(root, "src/features/print/lib/bbox.mjs"), "utf8"), /clipFigureBottomBeforeBelow/);
assert.match(readFileSync(join(root, "src/features/print/lib/bbox.mjs"), "utf8"), /FIGURE_BOTTOM_PAD = 0\.08/);
assert.match(readFileSync(join(root, "src/features/print/lib/bbox.mjs"), "utf8"), /FIGURE_CAPTION_ROOM/);
assert.match(readFileSync(join(root, "src/features/print/lib/bbox.mjs"), "utf8"), /FIGURE_STEM_CLEARANCE/);
assert.match(readFileSync(join(root, "src/features/print/lib/bbox.mjs"), "utf8"), /asTable/);
assert.match(readFileSync(join(root, "src/features/print/lib/document.mjs"), "utf8"), /normalizeShareScan/);
assert.match(readFileSync(join(root, "src/features/print/lib/document.mjs"), "utf8"), /partWantsDataTable/);
assert.match(readFileSync(join(root, "src/features/print/lib/figure-boxes.mjs"), "utf8"), /earliestStemBelowParent/);
assert.match(scanImageSrc, /ensureLocalImageFile/);
assert.match(scanImageSrc, /base64:\s*true/);
assert.match(scanImageSrc, /data:image\/jpeg;base64/);
assert.doesNotMatch(scanImageSrc, /if \(problem.figureImageSrc\) return problem/);
const printService = readFileSync(join(root, "src/features/print/service.ts"), "utf8");
assert.match(printService, /earliestStemBelowParent/);
assert.match(printService, /printToFileAsync/);
assert.match(printService, /width:/);
assert.match(printService, /height:/);
assert.doesNotMatch(printService, /resolveImages/);
assert.match(printService, /is_correct\.eq\.false/);
assert.match(printService, /mistake_type\.eq\.blank/);
assert.match(printService, /isIncorrectForPrint/);
assert.match(printService, /question_text/);
assert.match(printService, /isRawScanSourceUri/);
assert.match(printService, /figureBase64/);
assert.match(printService, /data:image/);
assert.match(printService, /cropFigureToBase64/);
assert.match(printService, /enrichPrintFigureBoxes/);
assert.match(printService, /resolveParentFigureBox/);
assert.match(printService, /resolveSubFigureBox/);
assert.match(printService, /needsDataTableVisual/);
assert.match(printService, /resolvePrintImageUrls\(input.problems\)/);
assert.match(printService, /fallback to text: no crop_box/);
assert.doesNotMatch(printService, /coerceGeminiBox\(problem.bbox\)/);
const gradeServiceSrc = readFileSync(join(root, "src/features/grading/service.ts"), "utf8");
assert.match(gradeServiceSrc, /answerBBox/);
assert.doesNotMatch(gradeServiceSrc, /if \(problem.figureImageSrc\) return problem/);
const reviewFetch = readFileSync(join(root, "src/features/review/useDailyReviews.ts"), "utf8");
assert.match(reviewFetch, /question_text/);
assert.match(reviewFetch, /displayQuestionText\(problem\?\.question_text/);
assert.match(reviewFetch, /masteryByKey/);
assert.match(reviewFetch, /advanceOnCorrect/);
const selectSrc = readFileSync(join(root, "src/features/review/lib/select.mjs"), "utf8");
assert.match(selectSrc, /selectBalancedReviews/);
const enqueueSql = readFileSync(join(root, "supabase/migrations/20240827000018_enqueue_blank_problems.sql"), "utf8");
assert.match(enqueueSql, /mistake_type = 'blank'/);
assert.match(enqueueSql, /student_answer/);
const printLayout = readFileSync(join(root, "app/(app)/_layout.tsx"), "utf8");
assert.match(printLayout, /print\/preview[\s\S]*ScreenBackButton/s);
pass("プレビューは実紙面を出し、戻るボタンがある");

const today = "2026-08-24";
const queue = [
  { id: "a", status: "active", nextReviewOn: today, consecutiveMisses: 1, label: "A" },
  { id: "b", status: "queued", nextReviewOn: today, consecutiveMisses: 0, label: "B" },
  { id: "c", status: "active", nextReviewOn: today, consecutiveMisses: 2, label: "C" },
  { id: "d", status: "queued", nextReviewOn: today, consecutiveMisses: 0, label: "D" },
  { id: "e", status: "queued", nextReviewOn: today, consecutiveMisses: 0, label: "E" },
  { id: "f", status: "queued", nextReviewOn: today, consecutiveMisses: 0, label: "F" },
  { id: "g", status: "queued", nextReviewOn: "2099-01-01", consecutiveMisses: 0, label: "G" },
  { id: "L", status: "leech", nextReviewOn: today, consecutiveMisses: 3, leechAt: "2026-08-23", label: "L" },
];

const selected = selectDailyReviews(queue, { today, min: 3, max: 5 });
assert.equal(selected.daily.length, 5);
assert.equal(selected.daily.some((item) => item.id === "L"), false);
assert.equal(selected.daily.some((item) => item.id === "g"), false);
assert.equal(selected.truncated, true);
const leeches = isolateLeeches(queue);
assert.equal(leeches.length, 1);
assert.equal(leeches[0].id, "L");
pass("日次キューは最大5問、Leech と未来日は除外");

const mixed = selectDailyReviews(
  [
    ...["a", "b", "c", "d"].map((id, index) => ({
      id: `recent-${id}`,
      status: "active",
      nextReviewOn: today,
      consecutiveMisses: 1,
      isCorrect: false,
      createdAt: "2026-08-22",
      subject: "math",
      topicTag: "くり上がり",
      label: `R${index}`,
    })),
    {
      id: "settle-1",
      status: "active",
      nextReviewOn: today,
      consecutiveMisses: 1,
      isCorrect: false,
      createdAt: "2026-08-01",
      subject: "math",
      topicTag: "かけ算",
      label: "S1",
    },
    {
      id: "settle-2",
      status: "active",
      nextReviewOn: today,
      consecutiveMisses: 1,
      isCorrect: false,
      createdAt: "2026-08-01",
      subject: "math",
      topicTag: "かけ算",
      label: "S2",
    },
    {
      id: "settle-ok",
      status: "active",
      nextReviewOn: today,
      consecutiveMisses: 0,
      isCorrect: true,
      createdAt: "2026-08-01",
      subject: "math",
      topicTag: "かけ算",
      label: "SOK",
    },
    {
      id: "settle-ok-2",
      status: "active",
      nextReviewOn: today,
      consecutiveMisses: 0,
      isCorrect: true,
      createdAt: "2026-08-01",
      subject: "math",
      topicTag: "かけ算",
      label: "SOK2",
    },
    {
      id: "settle-ok-3",
      status: "active",
      nextReviewOn: today,
      consecutiveMisses: 0,
      isCorrect: true,
      createdAt: "2026-08-01",
      subject: "math",
      topicTag: "かけ算",
      label: "SOK3",
    },
    {
      id: "curve-1",
      status: "active",
      nextReviewOn: today,
      consecutiveMisses: 0,
      isCorrect: false,
      createdAt: "2026-07-01",
      subject: "japanese",
      topicTag: "漢字",
      label: "C1",
    },
  ],
  {
    today,
    min: 3,
    max: 5,
    masteryByKey: {
      "japanese::漢字": { isMastered: true, nextReviewDate: "2026-08-20" },
    },
  },
);
const mixedIds = mixed.daily.map((item) => item.id);
assert.equal(mixed.daily.length, 5);
assert.equal(mixedIds.filter((id) => String(id).startsWith("recent-")).length >= 2, true);
assert.equal(mixedIds.some((id) => String(id).startsWith("settle-")), true);
assert.equal(mixedIds.includes("curve-1"), true);
assert.equal(new Set(mixed.daily.map((item) => item.topicTag)).size >= 2, true);
pass("間違えた問題が5問以上なら優先度スコアでバランスよく抽出する");

const afterMiss = applyReviewResult(
  { id: "c", status: "active", consecutiveMisses: 2, consecutiveHits: 0, intervalDays: 1, easeFactor: 2.5 },
  false,
);
assert.equal(afterMiss.status, "leech");
assert.equal(afterMiss.consecutiveMisses, 3);
const afterHit = applyReviewResult(
  { id: "a", status: "active", consecutiveMisses: 1, consecutiveHits: 0, intervalDays: 1, easeFactor: 2.5 },
  true,
);
assert.equal(afterHit.status, "active");
assert.equal(afterHit.consecutiveMisses, 0);
pass("解けた/もう一回で間隔更新し、3連続ミスで Leech 退場");

const { addDaysIso, applyLeechToCarte, resolveLeechItem } = await import(
  pathToFileURL(join(root, "src/features/review/lib/leech.mjs")).href,
);
const restored = resolveLeechItem(queue.find((item) => item.id === "L"), "requeue", { today });
assert.equal(restored.status, "queued");
assert.equal(restored.nextReviewOn, addDaysIso(today, 1));
assert.equal(isolateLeeches([restored]).length, 0);
const masteredLeech = resolveLeechItem(queue.find((item) => item.id === "L"), "master", { today });
assert.equal(masteredLeech.status, "mastered");
const afterClear = applyLeechToCarte(
  { foundation_rate: 0.62, problem_count: 40, weak_units: [{ unit: "L", rate: 0.25, total: 8, correct: 2 }], strong_units: [] },
  { topicTag: "L" },
  "master",
);
assert.equal(afterClear.weak_units[0].correct, 3);
pass("要指導リストの手動復帰・完全クリア");

console.log("\nAll print/review checks passed.");
