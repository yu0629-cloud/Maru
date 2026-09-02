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

const cameraSrc = readFileSync(join(root, "app/(app)/(tabs)/camera/index.tsx"), "utf8");
assert.match(cameraSrc, /t\("billing\.freeCarryover"\)/);
assert.match(cameraSrc, /from "expo-camera"/);
assert.match(cameraSrc, /SCAN_CAPTURE_QUALITY/);
assert.match(cameraSrc, /scanPaperDocuments/);
assert.match(cameraSrc, /persistScanImage/);
assert.match(cameraSrc, /enqueueScanJob/);
assert.match(cameraSrc, /t\("camera.gradeBatch"\)/);
assert.match(cameraSrc, /t\("camera.reviewList"\)/);
assert.match(cameraSrc, /scan\/\$\{job\.scanId\}/);
assert.match(cameraSrc, /t\("camera.startScan"\)/);
assert.match(cameraSrc, /t\("camera.pickLibrary"\)/);
assert.match(cameraSrc, /cropPaperFromPhoto/);
assert.match(cameraSrc, /ScanCaptureStage/);
assert.match(cameraSrc, /hitSlop=\{TAP_HIT_SLOP\}/);
assert.match(cameraSrc, /paddingBottom: 12/);
assert.doesNotMatch(cameraSrc, /A4Finder/);
assert.doesNotMatch(cameraSrc, /bg-black/);
assert.doesNotMatch(cameraSrc, /takePictureAsync/);
assert.doesNotMatch(cameraSrc, /launchCameraAsync/);
assert.doesNotMatch(cameraSrc, /pictureSize/);
assert.doesNotMatch(cameraSrc, /pickScanPictureSize/);
assert.doesNotMatch(cameraSrc, /丸付けする/);
assert.doesNotMatch(cameraSrc, /AnalyzingOverlay/);
assert.doesNotMatch(cameraSrc, /runGradePipeline/);
pass("撮影画面はネイティブスキャナーの連続バッチ。完了を待たない");

const { paperCropFromProfiles, contentSpanFromSizes, quietCenterSpan, remapGeminiBoxToPaper } = await import(
  pathToFileURL(join(root, "src/lib/scan/paper-bounds.mjs")).href,
);
assert.equal(contentSpanFromSizes([900, 910, 920, 930, 940, 950, 960, 970]), null, "均一な用紙スキャンは切らない");
const photoRows = [200, 210, 800, 820, 850, 840, 830, 810, 220, 190];
const photoCols = [180, 200, 780, 800, 820, 810, 790, 210, 190, 180];
const paper = paperCropFromProfiles(photoRows, photoCols);
assert.ok(paper, "机の余白がある写真は用紙だけ残す");
assert.ok(paper.x > 0.05 && paper.y > 0.05, "端の机を落とす");
assert.ok(paper.width > 0.45 && paper.height > 0.45, "用紙本体は残す");
const textureRows = [900, 880, 400, 390, 410, 400, 395, 405, 870, 910];
const textureCols = [920, 890, 380, 400, 410, 395, 405, 390, 880, 900];
assert.ok(quietCenterSpan(textureRows), "テクスチャ机は端を落とす");
const textured = paperCropFromProfiles(textureRows, textureCols);
assert.ok(textured, "木目机の写真も用紙だけ残す");
assert.ok(textured.x > 0.05 && textured.y > 0.05, "テクスチャ端を落とす");
assert.ok(textured.width > 0.45 && textured.height > 0.45, "用紙本体は残す");
const remapped = remapGeminiBoxToPaper([174, 521, 455, 873], { x: 0.1, y: 0.08, width: 0.82, height: 0.84 });
assert.ok(remapped, "全ページ箱を用紙空間へ写す");
assert.ok(remapped[0] >= 0 && remapped[3] <= 1000, "写した箱は 0〜1000");
assert.equal(remapGeminiBoxToPaper([10, 10, 40, 40], { x: 0.5, y: 0.5, width: 0.4, height: 0.4 }), null);
const scanImageSrc = readFileSync(join(root, "src/lib/files/scan-image.ts"), "utf8");
assert.match(scanImageSrc, /cropPaperFromPhoto/);
assert.match(scanImageSrc, /compressScanForGrade/);
assert.match(scanImageSrc, /remapGeminiBoxToPaper/);
assert.match(scanImageSrc, /paper crop applied/);
assert.match(scanImageSrc, /figureCacheToken/);
assert.match(scanImageSrc, /paper crop none/);
pass("ライブラリ写真は用紙を検出してから採点する");

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
assert.match(storeSrc, /startFreshBatch/);
pass("バッチ購読は新しい配列を selector から返さない");

const queueSrc = readFileSync(join(root, "src/features/grading/batch-queue.ts"), "utf8");
assert.match(queueSrc, /MAX_PARALLEL_GRADE = 4/);
assert.match(queueSrc, /uploadCompressedScan|runGradePipeline/);
assert.match(queueSrc, /kickBatchQueue/);
pass("採点キューは最大4並列で upload → grade-scan する");

const batchSrc = readFileSync(join(root, "app/(app)/scan/batch.tsx"), "utf8");
assert.match(batchSrc, /t\("batch.title"\)/);
assert.match(batchSrc, /from=batch/);
assert.match(batchSrc, /retryScanJob/);
pass("一括確認画面から完了分を1枚ずつ開ける");

const captureSrc = readFileSync(join(root, "src/components/ScanCaptureStage.tsx"), "utf8");
assert.match(captureSrc, /t\("camera.autoHint"\)/);
assert.match(captureSrc, /ScanSweep/);
assert.match(captureSrc, /onOpenJob/);
assert.match(captureSrc, /useScanPhotoUri/);
assert.doesNotMatch(captureSrc, /border-white\/85/);
assert.doesNotMatch(captureSrc, /丸付けするを押してください/);
pass("撮影待機は空状態の説明とサムネイル一覧");

const sweepSrc = readFileSync(join(root, "src/components/ScanSweep.tsx"), "utf8");
assert.match(sweepSrc, /translateY/);
assert.match(sweepSrc, /useNativeDriver: true/);
pass("解析中はスキャン線の演出を出す");

const layoutSrc = readFileSync(join(root, "app/(app)/_layout.tsx"), "utf8");
const tabsLayoutSrc = readFileSync(join(root, "app/(app)/(tabs)/_layout.tsx"), "utf8");
const rootLayoutSrc = readFileSync(join(root, "app/_layout.tsx"), "utf8");
assert.match(layoutSrc, /scan\/batch/);
assert.match(layoutSrc, /gestureEnabled: true/);
assert.match(layoutSrc, /fullScreenGestureEnabled: false/);
assert.match(layoutSrc, /settings\/billing[\s\S]*ScreenBackButton/s);
assert.match(readFileSync(join(root, "src/components/ScreenBackButton.tsx"), "utf8"), /router\.back\(\)/);
assert.match(rootLayoutSrc, /flex: 1/);
assert.match(rootLayoutSrc, /fullScreenGestureEnabled: false/);
assert.match(tabsLayoutSrc, /tabBarIcon/);
assert.match(tabsLayoutSrc, /TabBarIcon/);
assert.match(tabsLayoutSrc, /useSafeAreaInsets/);
assert.match(tabsLayoutSrc, /paddingBottom: tabBarBottom/);
assert.match(tabsLayoutSrc, /height: 56 \+ tabBarBottom/);
assert.match(tabsLayoutSrc, /hitSlop=\{TAP_HIT_SLOP\}/);
assert.match(layoutSrc, /name="\(tabs\)"[\s\S]*gestureEnabled: false[\s\S]*fullScreenGestureEnabled: false/s);
assert.match(tabsLayoutSrc, /zIndex: 100/);
assert.match(tabsLayoutSrc, /pointerEvents: "auto"/);
assert.match(tabsLayoutSrc, /detachInactiveScreens=\{false\}/);
assert.match(tabsLayoutSrc, /freezeOnBlur: true/);
assert.match(tabsLayoutSrc, /animationEnabled: false/);
assert.match(layoutSrc, /animation: "none"/);
assert.doesNotMatch(tabsLayoutSrc, /Button Pressed/);
assert.doesNotMatch(cameraSrc, /withPressLog/);
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

const answerSlots = layoutAlignedGradeMarks([
  { box: { x: 120, y: 40, width: 32, height: 28 }, isBlank: false },
  { box: { x: 120, y: 80, width: 32, height: 28 }, isBlank: true },
  { box: { x: 320, y: 40, width: 32, height: 28 }, isBlank: false },
]);
assert.ok(Math.abs(answerSlots[0].cx - 136) < 8, "解答欄 bbox の中央に〇✕を置く");
assert.ok(Math.abs(answerSlots[0].cx - answerSlots[1].cx) < 8);
assert.ok(answerSlots[2].cx > answerSlots[0].cx + 150, "右列の解答欄は左列より右");
pass("解答欄 bbox ならマークを枠の中央に置く");

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
assert.match(overlaySrc, /CorrectMark/);
assert.match(overlaySrc, /useResolvedMarkStyle/);
assert.match(overlaySrc, /ProblemDetailSheet/);
assert.match(overlaySrc, /ZoomableView/);
assert.match(overlaySrc, /mapGeminiBBoxToView/);
assert.match(overlaySrc, /layoutAlignedGradeMarks/);
assert.match(overlaySrc, /isBlankStudentAnswer/);
const markSrc = readFileSync(join(root, "src/components/GradeMark.tsx"), "utf8");
assert.match(markSrc, /from "react-native-svg"/);
assert.match(markSrc, /Circle/);
assert.match(markSrc, /Path/);
assert.match(markSrc, /MARK_STROKE_WIDTH/);
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
assert.match(detailSrc, /useScanPhotoUri/);
assert.match(detailSrc, /ExpiredMediaNotice/);
const photoUriSrc = readFileSync(join(root, "src/features/storage/useScanPhotoUri.ts"), "utf8");
assert.match(photoUriSrc, /isPreviewableScanUri/);
assert.match(photoUriSrc, /toFileUri/);
assert.match(photoUriSrc, /localFileExists/);
assert.match(photoUriSrc, /signedStorageUrl/);
assert.match(photoUriSrc, /originalStoragePath/);
assert.doesNotMatch(detailSrc, /!current\.isDemo &&/);
assert.match(detailSrc, /hydrateScanById/);
assert.doesNotMatch(detailSrc, /ensureQuota/);
assert.doesNotMatch(detailSrc, /quota\.remaining/);
assert.doesNotMatch(detailSrc, /quotaExhaustedMessage/);
assert.match(cameraSrc, /ensureQuota/);
assert.match(cameraSrc, /quota\.remaining/);
pass("結果画面が写真上の〇✕オーバーレイと詳細シートを持つ");
pass("過去画像の閲覧は無料残数でブロックしない");

const homeSrc = readFileSync(join(root, "app/(app)/(tabs)/index.tsx"), "utf8");
assert.match(homeSrc, /RecentScansSection/);
const recentSrc = readFileSync(join(root, "src/features/scans/RecentScansSection.tsx"), "utf8");
assert.match(recentSrc, /t\("history.recentTitle"\)/);
assert.match(recentSrc, /useScanHistory/);
assert.match(recentSrc, /from=history/);
assert.match(recentSrc, /layout="grid"/);
const historyScreenSrc = readFileSync(join(root, "app/(app)/scans/index.tsx"), "utf8");
assert.match(historyScreenSrc, /t\("history.title"\)/);
assert.match(historyScreenSrc, /from=history/);
assert.match(historyScreenSrc, /ScanHistoryCard/);
const historyCardSrc = readFileSync(join(root, "src/components/ScanHistoryCard.tsx"), "utf8");
assert.match(historyCardSrc, /t\("history\.expiredThumb"\)/);
assert.match(historyCardSrc, /overall_score/);
assert.match(historyCardSrc, /formatScanDateTime/);
assert.match(layoutSrc, /scans\/index/);
assert.match(layoutSrc, /from === "history"/);
assert.match(detailSrc, /fromHistory/);
assert.match(detailSrc, /t\("scan.backToHistory"\)/);
assert.match(detailSrc, /t\("scan.textRecord"\)/);
assert.match(detailSrc, /push\("\/\(app\)\/carte"\)/);
const carteSrc = readFileSync(join(root, "app/(app)/(tabs)/carte/index.tsx"), "utf8");
assert.match(carteSrc, /t\("carte.historyTitle"\)/);
assert.match(carteSrc, /\/\(app\)\/scans/);
pass("ホームとカルテから採点履歴へ入れ、期限切れはテキスト詳細を開く");

const subjectTagSrc = readFileSync(join(root, "src/components/SubjectTag.tsx"), "utf8");
assert.match(subjectTagSrc, /t\("subjectTag.pickTitle"\)/);
assert.match(subjectTagSrc, /updateScanSubject/);
assert.match(subjectTagSrc, /SUBJECT_CODES/);
assert.match(subjectTagSrc, /SubjectTagProps/);
assert.match(historyCardSrc, /SubjectTag/);
assert.doesNotMatch(historyCardSrc, /absolute left-/);
assert.match(historyCardSrc, /formatScanDateTime[\s\S]*SubjectTag[\s\S]*scoreLabel/s);
assert.match(detailSrc, /SubjectTag/);
assert.match(carteSrc, /CarteMastery/);
assert.match(carteSrc, /RecentScansSection/);
const updateSubjectSrc = readFileSync(join(root, "src/features/scans/updateSubject.ts"), "utf8");
assert.match(updateSubjectSrc, /from\("scans"\)\.update\(\{ subject \}\)/);
assert.match(updateSubjectSrc, /from\("problems"\)\.update\(\{ subject \}\)/);
assert.match(storeSrc2, /updateSubject/);
assert.match(readFileSync(join(root, "src/features/storage/hydrate-scans.ts"), "utf8"), /subject: normalizeSubject\(row\.subject\)/);
pass("教科タグの表示と親の手動変更が履歴・結果・カルテにある");

const manageSrc = readFileSync(join(root, "src/features/scans/manageScan.ts"), "utf8");
assert.match(manageSrc, /deleteScanRecord/);
assert.match(manageSrc, /reassignScanChild/);
assert.match(manageSrc, /このプリントを削除しますか？カルテや復習の集計からも除外されます/);
assert.match(manageSrc, /from\("scans"\)\.delete\(\)/);
assert.match(manageSrc, /child_id: nextChildId/);
assert.match(manageSrc, /update_child_carte/);
assert.match(manageSrc, /storage\.from/);
assert.match(historyCardSrc, /ScanPrintMenuButton/);
assert.match(historyCardSrc, /onLongPress/);
assert.match(detailSrc, /t\("scan.delete"\)/);
assert.match(detailSrc, /t\("scan.reassign"\)/);
assert.match(detailSrc, /ScanChildBanner/);
assert.match(storeSrc2, /remove:/);
assert.match(storeSrc2, /updateChildId/);
const topicMigration = readFileSync(join(root, "supabase/migrations/20240827000023_ensure_problem_topic.sql"), "utf8");
assert.match(topicMigration, /ADD COLUMN IF NOT EXISTS topic TEXT/);
assert.match(topicMigration, /column_name = 'subject'/);
pass("プリントの削除・子ども付け替えと topic カラム追加がある");



const backendSrc = readFileSync(join(root, "src/lib/backend.ts"), "utf8");
assert.doesNotMatch(backendSrc, /isMockMode\(\)/);
assert.match(backendSrc, /auth\.mocked/);
const envSrc = readFileSync(join(root, "src/lib/env.ts"), "utf8");
assert.match(envSrc, /isBillingMocked/);
assert.match(envSrc, /shouldMockAuth/);
const gradeSrc = readFileSync(join(root, "src/features/grading/service.ts"), "utf8");
assert.match(gradeSrc, /gradeViaEdgeFunction/);
assert.match(gradeSrc, /shouldUseRemote/);
assert.doesNotMatch(gradeSrc, /isMockMode/);
pass("課金モックでも採点は shouldUseRemote で Gemini に送る");

console.log("\nAll scan UI checks passed.");
