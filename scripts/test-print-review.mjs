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
  layoutKind,
  geminiBBoxToNormalizedBox,
  expandPrintCropBox,
  figureAnswerMasks,
  shrinkCropExcludingAnswer,
  coerceGeminiBox,
  geminiBoxToPixelCrop,
} = await import(pathToFileURL(printLib).href);
const { applyReviewResult, isolateLeeches, selectDailyReviews } = await import(
  pathToFileURL(reviewLib).href
);

function pass(name) {
  console.log(`ok - ${name}`);
}

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
assert.ok(shrunkFigure.width < figureCrop.width);
assert.ok(shrunkFigure.x + shrunkFigure.width <= rightAnswer.x + 0.01);
const masked = figureAnswerMasks([100, 50, 600, 950], [420, 780, 540, 920]);
assert.ok(masked.crop);
assert.ok(Array.isArray(masked.masks));
pass("図の切り抜きから右下の解答欄を除外する");

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
const thinHtml = buildPrintHtml({
  title: "お直し",
  childName: "はると",
  dateLabel: "2026年8月27日",
  problems: [
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
  ],
});
assert.match(thinHtml, /\(1\)/);
assert.match(thinHtml, /answer-box/);
assert.doesNotMatch(thinHtml, /<img/);
pass("解答欄だけの bbox でも画像ではなくテキストと解答枠で印字する");

const printProblems = [
  { id: "ok", label: "かけ算", problemType: "calc_block", bbox: [40, 60, 80, 940], isCorrect: true, studentAnswer: "72", correctAnswer: "72", parentCoachingTip: "" },
  { id: "c1", label: "計算", problemType: "calc_block", bbox: [80, 60, 260, 940], isCorrect: false, questionText: "3 + 4 =", studentAnswer: "43", correctAnswer: "34", parentCoachingTip: "" },
  { id: "c2", label: "漢字", problemType: "kanji", bbox: [100, 40, 220, 480], isCorrect: false, questionText: "「ちゅうい」の「ちゅう」", studentAnswer: "注", correctAnswer: "注", parentCoachingTip: "" },
  { id: "g", label: "大問3", problemType: "math_geometry_graph", bbox: [830, 60, 980, 940], isCorrect: false, questionText: "切り口はどんな形ですか", studentAnswer: "", correctAnswer: "正六角形", parentCoachingTip: "" },
  { id: "r", label: "読解", problemType: "reading_passage", bbox: [200, 50, 780, 950], isCorrect: false, questionText: "空欄に入る言葉を書きなさい", studentAnswer: "川", originalImageSrc: "https://example.com/scan.jpg", correctAnswer: "雨", parentCoachingTip: "" },
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
assert.doesNotMatch(html, /<img/);
assert.doesNotMatch(html, /class="mask"/);
assert.doesNotMatch(html, /css-crop/);
assert.doesNotMatch(html, /保護者用カンペ/);
assert.doesNotMatch(html, /声かけ/);
pass("PDF は名前・日付を印字し、テキストと解答枠だけで構成する");

const { collectPrintProblems, isIncorrectForPrint, isBlankPrintAnswer, displayQuestionText, displayTopicTag, stripLatexDollars, hasPrintableQuestion, selectProblemsForScope, DAILY_PRINT_MAX } = await import(
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
pass("問番号ではなく問題文・数式を復習プリントに出す");

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
}));
const dailyPick = collectPrintProblems({
  childId: "child-1",
  scans: [{ childId: "child-1", problems: manyWrong }],
  scope: "daily",
});
const allPick = collectPrintProblems({
  childId: "child-1",
  scans: [{ childId: "child-1", problems: manyWrong }],
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
      problems: [
        { id: "ok", is_correct: true, problem_label: "1+1", student_answer: "2", correct_answer: "2" },
        { id: "miss", is_correct: false, problem_label: "2+2", student_answer: "5", correct_answer: "4" },
        { id: "blank", is_correct: false, problem_label: "0+7", student_answer: "", correct_answer: "7", mistake_type: "blank" },
        { id: "unanswered", is_correct: true, problem_label: "5+3", student_answer: "", correct_answer: "8" },
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
pass("crop_box の JSON 文字列・正規化座標をピクセルに変換する");
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
      questionText: "これは出さない",
      isCorrect: false,
      correctAnswer: "1",
      parentCoachingTip: "",
    },
  ],
});
assert.match(fromBase64Only, /<img src="data:image/);
assert.doesNotMatch(fromBase64Only, /これは出さない/);
assert.match(figureHtml, /object-fit:\s*contain/);
assert.match(figureHtml, /max-height:\s*80mm/);
assert.match(figureHtml, /answer-frame/);
assert.doesNotMatch(figureHtml, /figure-work/);
assert.doesNotMatch(figureHtml, /何時何分ですか/);
assert.equal((figureHtml.match(/class="answer-frame"/g) ?? []).length, 1);
assert.doesNotMatch(figureHtml, /class="answer-box"/);
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
      questionText: "すべて選び",
      isCorrect: false,
      correctAnswer: "1,3",
      parentCoachingTip: "",
    },
  ],
});
assert.match(figureMasked, /figure-mask/);
assert.doesNotMatch(figureMasked, /すべて選び/);
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

const outDir = join(root, "scripts/output");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "print-preview.html"), html, "utf8");
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
assert.doesNotMatch(previewSheets, /fontSize: 22/);
assert.doesNotMatch(previewSheets, /CroppedImage/);
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
assert.match(scanImageSrc, /FIGURE_CACHE_VERSION = 2/);
assert.match(scanImageSrc, /isRawScanSourceUri/);
assert.match(scanImageSrc, /cropFigureToBase64/);
assert.match(scanImageSrc, /ensureLocalImageFile/);
assert.match(scanImageSrc, /base64:\s*true/);
assert.match(scanImageSrc, /data:image\/jpeg;base64/);
assert.doesNotMatch(scanImageSrc, /if \(problem.figureImageSrc\) return problem/);
const printService = readFileSync(join(root, "src/features/print/service.ts"), "utf8");
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
assert.match(printService, /resolvePrintImageUrls\(input.problems\)/);
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
