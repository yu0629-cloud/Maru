import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { supabase } from "@/src/lib/supabase/client";
import { STORAGE_BUCKETS } from "@/src/lib/storage/paths";
import { signedStorageUrl } from "@/src/lib/storage/signed-url";
import { shouldUseRemote } from "@/src/lib/backend";
import { maruLog, maruStep } from "@/src/lib/debug/maruLog";
import { t } from "@/src/i18n";
import { isRawScanSourceUri, isFullPageScanSource, toFileUri, cropFigureResult } from "@/src/lib/files/scan-image";
import { isIncorrectForPrint, printProblemFromReview } from "@/src/features/print/from-reviews";
import {
  buildPrintHtml,
  chooseAnswerStyle,
  figureCropBoxOf,
  inferVisualType,
  enrichPrintFigureBoxes,
  benefitsFromParentFigure,
  needsDataTableVisual,
  needsInsetFigure,
  resolveParentFigureBox,
  resolveSubFigureBox,
  resolveInsetFigureBox,
  earliestStemBelowParent,
  matchLeadingQuestionNumber,
  looksLikeProblemStemText,
  styleToGridType,
  subFigureBoxOf,
  PRINT_CROP_REV,
} from "@/src/features/print/html";
import type { PrintDocumentInput, PrintProblem } from "@/src/features/print/html";
import { usableGeminiBox } from "@/src/features/print/lib/bbox.mjs";

export type GeneratedPrint = {
  html: string;
  uri?: string;
};

async function fileToDataUri(uri: string) {
  if (uri.startsWith("data:image/")) return uri;
  const local = toFileUri(uri);
  try {
    const base64 = await FileSystem.readAsStringAsync(local, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const mime = /\.png$/i.test(local) ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${base64}`;
  } catch (error) {
    maruLog("print", "fileToDataUri fail", error);
    return "";
  }
}

async function toPrintableImageSrc(uri?: string | null) {
  const value = String(uri ?? "").trim();
  if (!value) return "";
  if (value.startsWith("data:image/")) return value;
  if (/^https?:/i.test(value)) {
    if (Platform.OS === "web") return value;
    try {
      const local = await downloadToCache(value);
      return fileToDataUri(local);
    } catch (error) {
      maruLog("print", "https to data uri fail", error);
      return "";
    }
  }
  if (
    value.startsWith("file:") ||
    value.startsWith("content:") ||
    value.startsWith("/") ||
    value.startsWith("ph://")
  ) {
    return fileToDataUri(value);
  }
  return "";
}

function isStorageObjectPath(value: string) {
  const path = String(value ?? "").trim();
  if (!path) return false;
  return !/^(https?:|file:|content:|ph:|data:|assets-library:)/i.test(path);
}

async function downloadToCache(uri: string) {
  const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!dir) throw new Error("NO_CACHE_DIR");
  const dest = `${dir}print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const result = await FileSystem.downloadAsync(uri, dest);
  return result.uri;
}

export async function fetchIncorrectProblemsForPrint(childId?: string): Promise<PrintProblem[]> {
  if (!childId || !shouldUseRemote(childId)) return [];
  const { data: problems, error } = await supabase
    .from("problems")
    .select(
      "id, scan_id, problem_label, question_text, unit, topic_tags, blanked_storage_path, cropped_storage_path, crop_purged_at, blank_purged_at, bounding_box, gemini_bbox, is_correct, student_answer, parent_coaching_tip, correct_answer, subject, problem_type, mistake_type, visual_type, crop_box, passage_text, context_text, options_text, parent_figure_box, sub_figure_box",
    )
    .eq("child_id", childId)
    .or("is_correct.eq.false,is_correct.is.null,mistake_type.eq.blank")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error || !problems?.length) return [];
  const scanIds = [...new Set(problems.map((problem) => problem.scan_id).filter(Boolean))];
  const { data: scans } = scanIds.length
    ? await supabase
        .from("scans")
        .select("id, original_storage_path, original_purged_at")
        .in("id", scanIds)
    : { data: [] as Array<{ id: string; original_storage_path: string | null; original_purged_at: string | null }> };
  const scanMap = new Map((scans ?? []).map((scan) => [scan.id, scan]));
  return problems
    .filter((problem) =>
      isIncorrectForPrint({
        is_correct: problem.is_correct,
        student_answer: problem.student_answer,
        mistake_type: problem.mistake_type,
      }),
    )
    .map((problem) => {
    const scan = scanMap.get(problem.scan_id);
    const originalPath = scan?.original_storage_path ?? "";
    const blankPath = problem.blanked_storage_path ?? "";
    const cropPath = problem.cropped_storage_path ?? "";
    const mediaExpired = Boolean(
      (problem.crop_purged_at || problem.blank_purged_at || scan?.original_purged_at) &&
        !blankPath &&
        !cropPath &&
        !originalPath,
    );
    const label = problem.problem_label || "問";
    return printProblemFromReview({
      id: problem.id,
      problemId: problem.id,
      scanId: problem.scan_id,
      scan_id: problem.scan_id,
      label,
      topicTag: problem.unit ?? problem.topic_tags?.[0] ?? "",
      questionText: problem.question_text,
      question_text: problem.question_text,
      problemIndex: label,
      studentAnswer: problem.student_answer,
      correctAnswer: problem.correct_answer,
      parentCoachingTip: problem.parent_coaching_tip,
      bbox: problem.gemini_bbox ?? undefined,
      cropBox: problem.bounding_box ?? undefined,
      visualType: problem.visual_type ?? undefined,
      figureCropBox: problem.crop_box ?? undefined,
      crop_box: problem.crop_box ?? undefined,
      parentFigureBox: problem.parent_figure_box ?? undefined,
      subFigureBox: problem.sub_figure_box ?? undefined,
      parent_figure_box: problem.parent_figure_box ?? undefined,
      sub_figure_box: problem.sub_figure_box ?? undefined,
      passageText: problem.passage_text ?? "",
      contextText: problem.context_text ?? problem.passage_text ?? "",
      optionsText: problem.options_text ?? "",
      blankedPath: blankPath,
      croppedPath: cropPath,
      originalPath,
      mistake_type: problem.mistake_type,
      isCorrect: false,
      isBlanked: Boolean(blankPath) || !String(problem.student_answer ?? "").trim(),
      mediaExpired,
      subject: problem.subject ?? undefined,
      problemType: problem.problem_type ?? undefined,
    });
  }) as PrintProblem[];
}

function asFigurePayload(dataUri: string) {
  if (!dataUri.startsWith("data:image/")) return { figureImageSrc: "", figureBase64: "", imageSrc: "" };
  return { figureImageSrc: dataUri, figureBase64: dataUri, imageSrc: dataUri };
}

/** 採点時の古い切り抜き JPEG を印字に使わない */
function stripStoredFigureSrcs(problem: PrintProblem): PrintProblem {
  return {
    ...problem,
    figureImageSrc: "",
    figureBase64: "",
    parentFigureSrc: "",
    parentFigureBase64: "",
    subFigureSrc: "",
    subFigureBase64: "",
    figureMasks: [],
    imageSrc: "",
    figure_image_src: "",
    figure_base64: "",
    parent_figure_src: "",
    parent_figure_base64: "",
    sub_figure_src: "",
    sub_figure_base64: "",
  } as PrintProblem;
}

async function fetchScanStemGuides(problems: PrintProblem[]): Promise<PrintProblem[]> {
  const scanIds = [
    ...new Set(
      problems
        .map((problem) => String((problem as PrintProblem & { scanId?: string; scan_id?: string }).scanId ?? (problem as { scan_id?: string }).scan_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (!scanIds.length || !shouldUseRemote()) return [];
  const pathByScan = new Map<string, string>();
  for (const problem of problems) {
    const sid = String((problem as { scanId?: string; scan_id?: string }).scanId ?? (problem as { scan_id?: string }).scan_id ?? "").trim();
    const path = String(problem.originalPath ?? "").trim();
    if (sid && path) pathByScan.set(sid, path);
  }
  const known = new Set(problems.map((problem) => String(problem.id ?? "")));
  const { data, error } = await supabase
    .from("problems")
    .select("id, scan_id, question_text, gemini_bbox, bounding_box, context_text")
    .in("scan_id", scanIds)
    .limit(80);
  if (error || !data?.length) return [];
  return data
    .filter((row) => row.id && !known.has(String(row.id)))
    .map((row) => ({
      id: String(row.id),
      scanId: row.scan_id,
      scan_id: row.scan_id,
      questionText: row.question_text ?? "",
      question_text: row.question_text ?? "",
      bbox: row.gemini_bbox ?? row.bounding_box ?? null,
      gemini_bbox: row.gemini_bbox ?? null,
      contextText: row.context_text ?? "",
      parentContext: row.context_text ?? "",
      originalPath: pathByScan.get(String(row.scan_id ?? "")) ?? "",
    })) as PrintProblem[];
}

function stemBoxesOnSameScan(pool: PrintProblem[], problem: PrintProblem) {
  const path = String(problem.originalPath ?? "").trim();
  const scanId = String(
    (problem as PrintProblem & { scanId?: string; scan_id?: string }).scanId ??
      (problem as { scan_id?: string }).scan_id ??
      "",
  ).trim();
  const boxes: Array<[number, number, number, number]> = [];
  for (const row of pool) {
    const rowPath = String(row.originalPath ?? "").trim();
    const rowScan = String(
      (row as PrintProblem & { scanId?: string; scan_id?: string }).scanId ??
        (row as { scan_id?: string }).scan_id ??
        "",
    ).trim();
    if ((path && rowPath === path) || (scanId && rowScan === scanId)) {
      const box = usableGeminiBox(row.bbox ?? row.gemini_bbox ?? (row as { geminiBbox?: unknown }).geminiBbox);
      if (box) boxes.push(box);
    }
  }
  return boxes;
}

function pickFullPageSource(problem: PrintProblem, signedOriginal: string) {
  const localUri = String((problem as PrintProblem & { localUri?: string }).localUri ?? "").trim();
  for (const uri of [signedOriginal, localUri, problem.originalImageSrc]) {
    const value = String(uri ?? "").trim();
    if (isFullPageScanSource(value)) return value;
    if (isRawScanSourceUri(value) && !value.startsWith("data:image/")) return value;
  }
  return "";
}

export async function resolvePrintImageUrls(problems: PrintProblem[]): Promise<PrintProblem[]> {
  const stemGuides = await fetchScanStemGuides(problems);
  const enriched = enrichPrintFigureBoxes(problems.map(stripStoredFigureSrcs));
  const stemPool = [...enriched, ...stemGuides];
  return Promise.all(
    enriched.map(async (problem) => {
      if (problem.mediaExpired) {
        return {
          ...problem,
          blankedImageSrc: "",
          croppedImageSrc: "",
          originalImageSrc: "",
          imageSrc: "",
          figureImageSrc: "",
          figureBase64: "",
          parentFigureSrc: "",
          parentFigureBase64: "",
          subFigureSrc: "",
          subFigureBase64: "",
        };
      }
      const signedOriginal = isStorageObjectPath(problem.originalPath ?? "")
        ? await signedStorageUrl(STORAGE_BUCKETS.originals, problem.originalPath)
        : "";
      const needsTable = needsDataTableVisual(problem);
      const needsInset = needsInsetFigure(problem);
      const parentBox = resolveParentFigureBox(problem);
      const stemBox =
        earliestStemBelowParent(stemPool, parentBox, problem) ?? usableGeminiBox(problem.bbox) ?? null;
      const subBox = needsTable
        ? resolveSubFigureBox(problem) ?? subFigureBoxOf(problem)
        : needsInset
          ? resolveInsetFigureBox({
              ...problem,
              parentFigureBox: parentBox,
              parent_figure_box: parentBox,
              bbox: stemBox,
            }) ?? subFigureBoxOf(problem)
          : null;
      const legacyBox = !parentBox && !subBox ? figureCropBoxOf(problem) : null;
      let visual = inferVisualType(problem);
      const shouldRecrop =
        visual === "has_figure" ||
        needsTable ||
        needsInset ||
        Boolean(parentBox || subBox || legacyBox) ||
        benefitsFromParentFigure(problem);
      if (shouldRecrop && visual !== "passage_based") {
        visual = "has_figure";
      }
      if (visual === "has_figure") {
        const cleared = stripStoredFigureSrcs(problem);
        const rawSource = pickFullPageSource(problem, signedOriginal);
        maruLog("figure", "resolvePrintImageUrls", {
          id: problem.id,
          visual,
          needsTable,
          sourceUri: String(rawSource ?? "").slice(0, 120),
          parentBox,
          subBox,
          cropBox: legacyBox,
        });
        if (!parentBox && !subBox && !legacyBox) {
          maruLog("figure", "fallback to text: no crop_box", { id: problem.id });
          return { ...cleared, ...asFigurePayload(""), parentFigureSrc: "", subFigureSrc: "" };
        }
        try {
          const cropOne = async (
            box: typeof parentBox,
            suffix: string,
            asTable = false,
            clipBelow: unknown = null,
            asInset = false,
          ) => {
            if (!box || !rawSource) return { dataUri: "", masks: [] as Array<{ x: number; y: number; width: number; height: number }> };
            return (
              (await cropFigureResult({
                sourceUri: rawSource,
                cropBox: box,
                scanId: String(problem.originalPath || problem.id),
                problemId: `${problem.id}-${suffix}`,
                answerBBox: asTable ? null : clipBelow,
                visualType: "has_figure",
                asTable,
                asInset,
                hasQuestionStem: Boolean(
                  looksLikeProblemStemText(problem.questionText ?? problem.question_text),
                ),
                stemBoxes: asTable || asInset ? [] : stemBoxesOnSameScan(stemPool, problem),
                answerSlot: asTable || asInset ? null : usableGeminiBox(problem.bbox),
              })) ?? { dataUri: "", masks: [] }
            );
          };
          const parentClipBelow =
            earliestStemBelowParent(stemPool, parentBox || legacyBox, problem) ??
            usableGeminiBox(problem.bbox) ??
            null;
          const subTop = usableGeminiBox(subBox);
          const clipTop = (box: typeof parentClipBelow) =>
            box ? Math.min(box[0], box[2]) : Infinity;
          // 表は親図の下なので表上端でも切る。差し込み図は設問横なので親図の下端クリップに使わない
          const clipBelow = needsTable
            ? clipTop(parentClipBelow) <= clipTop(subTop)
              ? parentClipBelow ?? subTop
              : subTop ?? parentClipBelow
            : parentClipBelow;
          const parentCrop = await cropOne(parentBox || legacyBox, "p", false, clipBelow);
          const insetAnswer = needsInset && !needsTable ? usableGeminiBox(problem.bbox) : null;
          const subCrop = await cropOne(
            subBox,
            "s",
            needsTable,
            insetAnswer,
            needsInset && !needsTable,
          );
          const parentSrc = parentCrop.dataUri;
          const subSrc = subCrop.dataUri;
          const printable = parentSrc.startsWith("data:image/")
            ? parentSrc
            : subSrc.startsWith("data:image/")
              ? subSrc
              : "";
          if (!printable) {
            maruLog("figure", "fallback to text: raw crop failed", { id: problem.id });
            return { ...cleared, ...asFigurePayload(""), parentFigureSrc: "", subFigureSrc: "" };
          }
          return {
            ...cleared,
            visualType: "has_figure",
            printFigureRev: PRINT_CROP_REV,
            ...asFigurePayload(printable),
            parentFigureBox: parentBox ?? problem.parentFigureBox,
            subFigureBox: subBox ?? problem.subFigureBox,
            parentFigureSrc: parentSrc.startsWith("data:image/") ? parentSrc : "",
            parentFigureBase64: parentSrc.startsWith("data:image/") ? parentSrc : "",
            subFigureSrc: subSrc.startsWith("data:image/") ? subSrc : "",
            subFigureBase64: subSrc.startsWith("data:image/") ? subSrc : "",
            figureMasks: parentSrc.startsWith("data:image/") ? parentCrop.masks : subCrop.masks,
            originalImageSrc: problem.originalImageSrc || signedOriginal || "",
          };
        } catch (error) {
          maruLog("figure", "figure crop skip", {
            id: problem.id,
            error: error instanceof Error ? error.message : error,
          });
          return { ...cleared, ...asFigurePayload(""), parentFigureSrc: "", subFigureSrc: "" };
        }
      }
      return problem;
    }),
  );
}

const A4_WIDTH_PT = Math.round((210 * 72) / 25.4);
const A4_HEIGHT_PT = Math.round((297 * 72) / 25.4);
const A4_PRINT_OPTIONS = {
  width: A4_WIDTH_PT,
  height: A4_HEIGHT_PT,
  margins: { top: 0, right: 0, bottom: 0, left: 0 },
};

export async function generatePrintPdf(input: PrintDocumentInput): Promise<GeneratedPrint> {
  const problems = await resolvePrintImageUrls(input.problems.map(stripStoredFigureSrcs));
  const html = buildPrintHtml({ ...input, problems });
  if (Platform.OS === "web") {
    return { html };
  }
  const result = await maruStep("print", "printToFile", () =>
    Print.printToFileAsync({ html, ...A4_PRINT_OPTIONS }),
  );
  return { html, uri: result.uri };
}

export async function sharePrintPdf(uri: string) {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("SHARING_UNAVAILABLE");
  }
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: t("print.shareDialog"),
    UTI: "com.adobe.pdf",
  });
}

export async function printDirect(html: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const popup = window.open("", "_blank");
    if (!popup) throw new Error("POPUP_BLOCKED");
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
    return;
  }
  await Print.printAsync({ html, ...A4_PRINT_OPTIONS });
}

export async function recordPrintJob(input: {
  parentId: string;
  childId: string;
  title: string;
  gridType: "graph" | "squared" | "lined" | "blank";
  problemIds: string[];
}) {
  if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
    return { id: `mock-print-${Date.now()}`, mocked: true as const };
  }
  const { data, error } = await supabase
    .from("print_jobs")
    .insert({
      parent_id: input.parentId,
      child_id: input.childId,
      title: input.title,
      grid_type: input.gridType,
      problem_ids: input.problemIds,
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return { id: data?.id ?? null, mocked: false as const };
}

export async function createAndSharePrint(input: PrintDocumentInput & {
  parentId: string;
  childId: string;
}) {
  maruLog("print", "share start", { count: input.problems.length, title: input.title });
  const generated = await generatePrintPdf(input);
  const first = input.problems[0];
  const dominant = styleToGridType(first?.answerStyle ?? chooseAnswerStyle(first ?? { topicTag: "" }));
  try {
    await recordPrintJob({
      parentId: input.parentId,
      childId: input.childId,
      title: input.title ?? t("print.recordTitle"),
      gridType: dominant,
      problemIds: input.problems.map((problem) => problem.id),
    });
  } catch (error) {
    maruLog("print", "recordPrintJob skip", error);
  }
  if (generated.uri) {
    await maruStep("print", "shareSheet", () => sharePrintPdf(generated.uri as string));
  } else {
    await maruStep("print", "printDirect", () => printDirect(generated.html));
  }
  maruLog("print", "share done");
  return generated;
}

export { buildPrintHtml, styleToGridType };