import { Image, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { supabase } from "@/src/lib/supabase/client";
import { STORAGE_BUCKETS } from "@/src/lib/storage/paths";
import { signedStorageUrl } from "@/src/lib/storage/signed-url";
import { shouldUseRemote } from "@/src/lib/backend";
import { maruLog, maruStep } from "@/src/lib/debug/maruLog";
import { t } from "@/src/i18n";
import { isIncorrectForPrint, printProblemFromReview } from "@/src/features/print/from-reviews";
import {
  buildPrintHtml,
  chooseAnswerStyle,
  expandPrintCropBox,
  resolveCropBox,
  styleToGridType,
} from "@/src/features/print/html";
import type { PrintDocumentInput, PrintProblem } from "@/src/features/print/html";

export type GeneratedPrint = {
  html: string;
  uri?: string;
};

async function fileToDataUri(uri: string) {
  if (uri.startsWith("data:image/")) return uri;
  if (!uri.startsWith("file:")) return uri;
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    maruLog("print", "fileToDataUri fail", error);
    return uri;
  }
}

async function toPrintableImageSrc(uri?: string | null) {
  const value = String(uri ?? "").trim();
  if (!value) return "";
  if (value.startsWith("data:image/")) return value;
  if (value.startsWith("file:")) return fileToDataUri(value);
  if (/^https?:/i.test(value) && Platform.OS !== "web") {
    try {
      const local = await downloadToCache(value);
      return fileToDataUri(local);
    } catch (error) {
      maruLog("print", "https to data uri fail", error);
      return value;
    }
  }
  return value;
}

async function downloadToCache(uri: string) {
  const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!dir) throw new Error("NO_CACHE_DIR");
  const dest = `${dir}print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const result = await FileSystem.downloadAsync(uri, dest);
  return result.uri;
}

function imageSize(uri: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

async function cropImageToBox(uri: string, box: { x: number; y: number; width: number; height: number }) {
  if (Platform.OS === "web") return uri;
  const local = uri.startsWith("http") ? await downloadToCache(uri) : uri;
  const { width, height } = await imageSize(local);
  const originX = Math.round(Math.max(0, box.x) * width);
  const originY = Math.round(Math.max(0, box.y) * height);
  const cropW = Math.max(8, Math.round(box.width * width));
  const cropH = Math.max(8, Math.round(box.height * height));
  const result = await ImageManipulator.manipulateAsync(
    local,
    [
      {
        crop: {
          originX: Math.min(originX, width - 8),
          originY: Math.min(originY, height - 8),
          width: Math.min(cropW, width - originX),
          height: Math.min(cropH, height - originY),
        },
      },
    ],
    { compress: 0.78, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

export async function fetchIncorrectProblemsForPrint(childId?: string): Promise<PrintProblem[]> {
  if (!childId || !shouldUseRemote(childId)) return [];
  const { data: problems, error } = await supabase
    .from("problems")
    .select(
      "id, scan_id, problem_label, question_text, unit, topic_tags, blanked_storage_path, cropped_storage_path, crop_purged_at, blank_purged_at, bounding_box, gemini_bbox, is_correct, student_answer, parent_coaching_tip, correct_answer, subject, problem_type, mistake_type",
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

export async function resolvePrintImageUrls(problems: PrintProblem[]): Promise<PrintProblem[]> {
  return Promise.all(
    problems.map(async (problem) => {
      if (problem.mediaExpired) {
        return {
          ...problem,
          blankedImageSrc: "",
          croppedImageSrc: "",
          originalImageSrc: "",
          imageSrc: "",
        };
      }
      const blankedImageSrc = await signedStorageUrl(
        STORAGE_BUCKETS.blanks,
        problem.blankedPath || problem.blankedImageSrc,
      );
      const croppedImageSrc = await signedStorageUrl(
        STORAGE_BUCKETS.crops,
        problem.croppedPath || problem.croppedImageSrc,
      );
      const signedOriginal = await signedStorageUrl(
        STORAGE_BUCKETS.originals,
        problem.originalPath || problem.originalImageSrc,
      );
      const source = blankedImageSrc || croppedImageSrc || signedOriginal || problem.originalImageSrc || "";
      if (!source) {
        return { ...problem, imageSrc: "", originalImageSrc: "", printCropped: false };
      }
      const alreadyCropped = Boolean(blankedImageSrc || croppedImageSrc);
      try {
        const box = expandPrintCropBox(resolveCropBox(problem));
        const croppedUri = alreadyCropped ? source : await cropImageToBox(source, box);
        const printable = await toPrintableImageSrc(croppedUri);
        return {
          ...problem,
          imageSrc: croppedUri.startsWith("file:") ? croppedUri : printable,
          originalImageSrc: printable,
          blankedImageSrc: blankedImageSrc ? printable : "",
          croppedImageSrc: croppedImageSrc ? printable : "",
          isBlanked: Boolean(blankedImageSrc || problem.isBlanked),
          printCropped: !alreadyCropped,
          cropBox: box,
        };
      } catch (error) {
        maruLog("print", "crop skip", { id: problem.id, error: error instanceof Error ? error.message : error });
        const printable = await toPrintableImageSrc(source);
        return {
          ...problem,
          imageSrc: printable,
          originalImageSrc: printable,
          printCropped: false,
        };
      }
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
  const html = buildPrintHtml(input);
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