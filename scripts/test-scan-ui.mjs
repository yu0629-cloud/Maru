/**
 * 撮影→修正→カルテのクライアントロジック検証
 *   node scripts/test-scan-ui.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { recountScore, toggleProblemCorrect, problemsNeedingInpaint } = await import(
  pathToFileURL(join(root, "src/features/grading/lib/corrections.mjs")).href
);

function pass(name) {
  console.log(`ok - ${name}`);
}

const problems = [
  { id: "1", is_correct: true, student_answer: "72", needs_inpaint: false, mistake_type: "none" },
  { id: "2", is_correct: false, student_answer: "43", needs_inpaint: true, mistake_type: "concept_gap" },
  { id: "3", is_correct: false, student_answer: "", needs_inpaint: false, mistake_type: "blank" },
];

const flipped = toggleProblemCorrect(problems[1]);
assert.equal(flipped.is_correct, true);
assert.equal(flipped.mistake_type, "none");
assert.equal(flipped.needs_inpaint, false);
const next = [problems[0], flipped, problems[2]];
assert.deepEqual(recountScore(next), { earned: 2, max: 3 });
assert.equal(problemsNeedingInpaint(next).length, 0);
pass("〇✕反転で得点と inpaint 対象が更新される");

const flippedBlank = toggleProblemCorrect(problems[0]);
assert.equal(flippedBlank.is_correct, false);
assert.equal(flippedBlank.needs_inpaint, true);
pass("正解を✕にすると白紙化対象になる");

function quotaRemaining(input) {
  if (input.tier === "free") return input.freeScansRemaining;
  const monthly = Math.max(0, input.monthlyQuota - input.monthlyUsed);
  return monthly + input.extraTicketBalance;
}

assert.equal(quotaRemaining({ tier: "free", freeScansRemaining: 0, monthlyQuota: 0, monthlyUsed: 0, extraTicketBalance: 0 }), 0);
assert.equal(quotaRemaining({ tier: "standard", freeScansRemaining: 0, monthlyQuota: 150, monthlyUsed: 150, extraTicketBalance: 2 }), 2);
pass("残数0は課金導線、チケット残は加算");

const cameraSrc = readFileSync(join(root, "app/(app)/camera/index.tsx"), "utf8");
assert.match(cameraSrc, /from "expo-camera"/);
assert.match(cameraSrc, /SCAN_CAPTURE_QUALITY/);
assert.match(cameraSrc, /scanPaperDocuments/);
assert.match(cameraSrc, /persistScanImage/);
assert.match(cameraSrc, /enqueueScanJob/);
assert.match(cameraSrc, /scanning=\{analyzingCount > 0\}/);
assert.match(cameraSrc, />完了</);
assert.doesNotMatch(cameraSrc, /takePictureAsync/);
assert.doesNotMatch(cameraSrc, /launchCameraAsync/);
assert.doesNotMatch(cameraSrc, /pictureSize/);
assert.doesNotMatch(cameraSrc, /pickScanPictureSize/);
assert.doesNotMatch(cameraSrc, /丸付けする/);
assert.doesNotMatch(cameraSrc, /AnalyzingOverlay/);
assert.doesNotMatch(cameraSrc, /runGradePipeline/);
pass("撮影画面はネイティブスキャナーの連続バッチ。完了を待たない");

const appJson = JSON.parse(readFileSync(join(root, "app.json"), "utf8"));
assert.match(JSON.stringify(appJson.expo.plugins), /react-native-document-scanner-plugin/);
const scannerSrc = readFileSync(join(root, "src/lib/scan/document-scanner.ts"), "utf8");
assert.match(scannerSrc, /scanDocument/);
assert.match(scannerSrc, /croppedImageQuality/);
assert.match(scannerSrc, /react-native-document-scanner-plugin/);
pass("Config Plugin とネイティブスキャナー呼び出しを登録している");

const storeSrc = readFileSync(join(root, "src/stores/scanQueueStore.ts"), "utf8");
assert.match(storeSrc, /EMPTY_JOBS/);
assert.match(storeSrc, /useCurrentBatchJobs/);
pass("バッチ購読は新しい配列を selector から返さない");

const queueSrc = readFileSync(join(root, "src/features/grading/batch-queue.ts"), "utf8");
assert.match(queueSrc, /MAX_PARALLEL_GRADE = 4/);
assert.match(queueSrc, /uploadCompressedScan|runGradePipeline/);
assert.match(queueSrc, /kickBatchQueue/);
pass("採点キューは最大4並列で upload → grade-scan する");

const batchSrc = readFileSync(join(root, "app/(app)/scan/batch.tsx"), "utf8");
assert.match(batchSrc, /一括確認/);
assert.match(batchSrc, /from=batch/);
assert.match(batchSrc, /retryScanJob/);
pass("一括確認画面から完了分を1枚ずつ開ける");

const finderSrc = readFileSync(join(root, "src/components/A4Finder.tsx"), "utf8");
assert.match(finderSrc, /どんどん次のプリントを撮ってください/);
assert.match(finderSrc, /ScanSweep/);
assert.match(finderSrc, /scanning/);
assert.doesNotMatch(finderSrc, /丸付けするを押してください/);
pass("ファインダー文言は連続撮影向け");

const sweepSrc = readFileSync(join(root, "src/components/ScanSweep.tsx"), "utf8");
assert.match(sweepSrc, /translateY/);
assert.match(sweepSrc, /useNativeDriver: true/);
pass("解析中はスキャン線の演出を出す");

const layoutSrc = readFileSync(join(root, "app/(app)/_layout.tsx"), "utf8");
assert.match(layoutSrc, /scan\/batch/);
assert.match(layoutSrc, /tabBarIcon/);
assert.match(layoutSrc, /TabBarIcon/);
pass("一括確認ルートがタブに登録されている");
pass("下部タブにアイコンを指定している");

const tabIconSrc = readFileSync(join(root, "src/components/TabBarIcon.tsx"), "utf8");
assert.match(tabIconSrc, /home/);
assert.match(tabIconSrc, /camera/);
assert.match(tabIconSrc, /settings/);
assert.doesNotMatch(tabIconSrc, /@expo\/vector-icons/);
pass("タブアイコンはフォント欠落で×にならない描画");

function parsePictureSize(size) {
  const match = String(size).trim().match(/^(\d+)\s*[xX×]\s*(\d+)$/);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}
function pickScanPictureSize(sizes, target = 1280) {
  const parsed = sizes
    .map((value) => {
      const dims = parsePictureSize(value);
      if (!dims) return null;
      const long = Math.max(dims.width, dims.height);
      const short = Math.min(dims.width, dims.height);
      return { value, long, aspectDiff: Math.abs(long / short - 297 / 210) };
    })
    .filter(Boolean);
  const preferred = parsed.filter((item) => item.long >= target && item.long <= Math.round(target * 1.6));
  if (preferred.length) {
    preferred.sort((a, b) => a.aspectDiff - b.aspectDiff || a.long - b.long);
    return preferred[0]?.value;
  }
  const enough = parsed.filter((item) => item.long >= target);
  if (enough.length) {
    enough.sort((a, b) => a.aspectDiff - b.aspectDiff || a.long - b.long);
    return enough[0]?.value;
  }
  parsed.sort((a, b) => b.long - a.long);
  return parsed[0]?.value;
}
assert.equal(pickScanPictureSize(["640x480", "1280x720", "1440x1080", "4032x3024"]), "1440x1080");
assert.equal(pickScanPictureSize(["1920x1080", "1920x1440", "4032x3024"]), "1920x1440");
assert.equal(pickScanPictureSize(["640x480", "800x600"]), "800x600");
pass("撮影サイズは長辺1280以上の最小を選ぶ");

const { containedImageRect, geminiBBoxToDisplayRect, letterboxImageRect, mapGeminiBBoxToLetterbox, mapGeminiBBoxToView, gradeMarkFromMappedBox, isInsideLetterbox, layoutAlignedGradeMarks, isMarkInsidePhoto, clampMarkToPhoto, PHOTO_Y_MAX_RATIO, sizeAfterExifOrientation, unionGeminiBBox, problemAreaFitTransform, FIT_PADDING_RATIO, MARK_ROW_SIZE_RATIO, MARK_STROKE_WIDTH } = await import(
  pathToFileURL(join(root, "src/features/grading/lib/overlay-layout.mjs")).href,
);
const contained = containedImageRect(400, 600, 1000, 1400);
assert.equal(contained.width, 400);
assert.equal(contained.height, 560);
assert.equal(contained.x, 0);
assert.equal(contained.y, 20);
const letterbox = letterboxImageRect(400, 600, 1080, 1440);
assert.equal(letterbox.offsetX, 0);
assert.equal(Number(letterbox.displayWidth.toFixed(1)), 400);
assert.equal(Number(letterbox.displayHeight.toFixed(1)), Number((400 * 1440 / 1080).toFixed(1)));
const mapped = mapGeminiBBoxToLetterbox([270, 60, 460, 940], letterbox);
assert.equal(Number(mapped.x.toFixed(1)), Number((letterbox.offsetX + (60 / 1000) * letterbox.displayWidth).toFixed(1)));
assert.equal(Number(mapped.y.toFixed(1)), Number((letterbox.offsetY + (270 / 1000) * letterbox.displayHeight).toFixed(1)));
const overlayMark = gradeMarkFromMappedBox(mapped);
assert.equal(Number(overlayMark.r.toFixed(4)), Number((Math.min(mapped.width, mapped.height) * 0.4).toFixed(4)));
assert.equal(Number((overlayMark.cx).toFixed(4)), Number((mapped.x + mapped.width / 2).toFixed(4)));
assert.equal(isInsideLetterbox(mapped.x, mapped.y, letterbox), true);
assert.equal(isInsideLetterbox(-10, 10, letterbox), false);
const viewMapped = mapGeminiBBoxToView([270, 60, 460, 940], 400, 600);
assert.equal(Number(viewMapped.x.toFixed(4)), Number(((60 / 1000) * 400).toFixed(4)));
assert.equal(Number(viewMapped.y.toFixed(4)), Number(((270 / 1000) * 600).toFixed(4)));
assert.equal(Number(viewMapped.width.toFixed(4)), Number(((880 / 1000) * 400).toFixed(4)));
pass("contain の実描画領域へ bbox をマッピングする");

const aligned = layoutAlignedGradeMarks([
  { box: { x: 20, y: 40, width: 140, height: 120 }, isBlank: false },
  { box: { x: 20, y: 100, width: 140, height: 36 }, isBlank: false },
  { box: { x: 20, y: 160, width: 90, height: 36 }, isBlank: true },
  { box: { x: 220, y: 40, width: 140, height: 36 }, isBlank: false },
]);
assert.ok(aligned[0].cy < 40 + 50, "手書きで縦に伸びた bbox でもマークは印刷行の高さに置く");
assert.ok(aligned[0].cy < aligned[1].cy - 8, "下の行に被らない");
assert.ok(Math.abs(aligned[0].cx - aligned[1].cx) < 12, "同じ列のマークXを揃える");
assert.ok(Math.abs(aligned[2].cx - aligned[0].cx) < 12, "無解答の✕も列の解答位置に揃える");
assert.ok(aligned[3].cx > aligned[0].cx + 40, "右列は左列より右");
assert.ok(aligned[0].cx > 20 + 140 * 0.5, "マークは bbox 中心ではなく等号の右");
assert.ok(aligned[1].size >= 36 * 0.5 - 0.5 && aligned[1].size <= 36 * 0.6 + 0.5, "マーク直径は行高の 50〜60%");
assert.equal(Number(MARK_ROW_SIZE_RATIO.toFixed(2)), 0.55);
assert.equal(aligned[0].size, aligned[0].r * 2);
assert.ok(aligned[0].r < 16, "固定 22px より小さく、上下が重ならない");
pass("〇✕を印刷行のYと等号右の解答位置へ揃える");

const deskLetterbox = { offsetX: 0, offsetY: 0, displayWidth: 400, displayHeight: 500 };
const clipped = layoutAlignedGradeMarks(
  [
    { box: { x: 40, y: 80, width: 120, height: 36 }, isBlank: false },
    { box: { x: 40, y: 490, width: 120, height: 40 }, isBlank: true },
  ],
  deskLetterbox,
);
assert.ok(clipped[0], "用紙上のマークは残す");
assert.equal(clipped[1], null, "用紙下部を突き抜けた机上のマークは描画しない");
assert.equal(isMarkInsidePhoto(200, 490, deskLetterbox), false);
assert.equal(PHOTO_Y_MAX_RATIO, 0.95);
const clamped = clampMarkToPhoto({ cx: 500, cy: -10, r: 22, x: 478, y: -32, size: 44 }, deskLetterbox);
assert.ok(clamped.cx - clamped.r >= deskLetterbox.offsetX);
assert.ok(clamped.cx + clamped.r <= deskLetterbox.offsetX + deskLetterbox.displayWidth);
assert.ok(clamped.cy - clamped.r >= deskLetterbox.offsetY);
assert.ok(clamped.cy + clamped.r <= deskLetterbox.offsetY + deskLetterbox.displayHeight);
pass("枠外のマークはスキップし、残りの中心を写真内へクランプする");

const swapped = sizeAfterExifOrientation(1440, 1080, 6);
assert.equal(swapped.width, 1080);
assert.equal(swapped.height, 1440);
pass("EXIF 90° は幅高さを入れ替える");

assert.equal(FIT_PADDING_RATIO, 0.05);
const union = unionGeminiBBox([
  [100, 80, 200, 400],
  [250, 90, 360, 410],
]);
assert.ok(union);
const rawMinY = 100;
const rawMaxY = 360;
const rawMinX = 80;
const rawMaxX = 410;
assert.equal(Number(union[0].toFixed(4)), Number((rawMinY - (rawMaxY - rawMinY) * 0.05).toFixed(4)));
assert.equal(Number(union[1].toFixed(4)), Number((rawMinX - (rawMaxX - rawMinX) * 0.05).toFixed(4)));
assert.equal(Number(union[2].toFixed(4)), Number((rawMaxY + (rawMaxY - rawMinY) * 0.05).toFixed(4)));
assert.equal(Number(union[3].toFixed(4)), Number((rawMaxX + (rawMaxX - rawMinX) * 0.05).toFixed(4)));
const fitLetterbox = { offsetX: 0, offsetY: 0, displayWidth: 400, displayHeight: 600 };
const fit = problemAreaFitTransform([100, 100, 900, 900], 400, 600, fitLetterbox);
assert.equal(Number(fit.scale.toFixed(4)), 1.25);
assert.equal(Number(fit.translateX.toFixed(4)), -40);
assert.equal(Number(fit.translateY.toFixed(4)), -60);
const mappedLeft = 40 * fit.scale + fit.translateX * fit.scale;
const mappedTop = 60 * fit.scale + fit.translateY * fit.scale;
assert.equal(Number(mappedLeft.toFixed(4)), 0);
assert.equal(Number(mappedTop.toFixed(4)), 0);
pass("全問 bbox の外接矩形に 5% 余白を足して transform で自動フィットする");

const mockSrc = readFileSync(join(root, "src/features/grading/mock.ts"), "utf8");
assert.match(mockSrc, /bbox: problem\.bbox/);
const viewSrc = readFileSync(join(root, "src/features/grading/corrections.ts"), "utf8");
assert.match(viewSrc, /bbox\?: GeminiBBox/);
const storeSrc2 = readFileSync(join(root, "src/stores/scanStore.ts"), "utf8");
assert.match(storeSrc2, /GradedProblemView/);
pass("GradedProblemView と scanStore に bbox が載る");

const overlaySrc = readFileSync(join(root, "src/components/GradingPhotoOverlay.tsx"), "utf8");
assert.match(overlaySrc, /from "react-native-svg"/);
assert.match(overlaySrc, /Circle/);
assert.match(overlaySrc, /ProblemDetailSheet/);
assert.match(overlaySrc, /ZoomableView/);
assert.match(overlaySrc, /mapGeminiBBoxToView/);
assert.match(overlaySrc, /layoutAlignedGradeMarks/);
assert.match(overlaySrc, /isBlankStudentAnswer/);
assert.match(overlaySrc, /MARK_STROKE_WIDTH/);
assert.equal(MARK_STROKE_WIDTH, 2.25);
assert.match(overlaySrc, /resizeMode="contain"/);
assert.doesNotMatch(overlaySrc, /letterboxImageRect/);
assert.doesNotMatch(overlaySrc, /mapGeminiBBoxToLetterbox/);
assert.doesNotMatch(overlaySrc, /problemAreaFitTransform/);
assert.doesNotMatch(overlaySrc, /unionGeminiBBox/);
assert.doesNotMatch(overlaySrc, /fittedImageRect/);
assert.doesNotMatch(overlaySrc, /transformOrigin/);
assert.doesNotMatch(overlaySrc, /resizeMode="stretch"/);
const zoomSrc = readFileSync(join(root, "src/components/ZoomableView.tsx"), "utf8");
assert.match(zoomSrc, /PanResponder/);
assert.match(zoomSrc, /MAX_SCALE = 4/);
const detailSrc = readFileSync(join(root, "app/(app)/scan/[id].tsx"), "utf8");
assert.match(detailSrc, /GradingPhotoOverlay/);
assert.match(detailSrc, /ProblemDetailSheet/);
assert.match(detailSrc, /onPressProblem/);
assert.match(detailSrc, /scrollEnabled=\{!photoGesturing\}/);
pass("結果画面が写真上の〇✕オーバーレイと詳細シートを持つ");

console.log("\nAll scan UI checks passed.");
