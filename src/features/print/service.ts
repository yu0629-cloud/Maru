import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { supabase } from "@/src/lib/supabase/client";
import { STORAGE_BUCKETS } from "@/src/lib/storage/paths";
import { buildPrintHtml, chooseAnswerStyle, styleToGridType } from "@/src/features/print/html";
import type { PrintDocumentInput, PrintProblem } from "@/src/features/print/html";

export type GeneratedPrint = {
  html: string;
  uri?: string;
};

async function signedUrl(bucket: string, path?: string | null) {
  if (!path) return "";
  if (/^(https?:|data:|file:)/i.test(path)) return path;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? "";
}

export async function resolvePrintImageUrls(problems: PrintProblem[]): Promise<PrintProblem[]> {
  return Promise.all(
    problems.map(async (problem) => {
      const blankedImageSrc = await signedUrl(STORAGE_BUCKETS.blanks, problem.blankedPath || problem.blankedImageSrc);
      const croppedImageSrc = await signedUrl(STORAGE_BUCKETS.crops, problem.croppedPath || problem.croppedImageSrc);
      const originalImageSrc = await signedUrl(
        STORAGE_BUCKETS.originals,
        problem.originalPath || problem.originalImageSrc,
      );
      return {
        ...problem,
        blankedImageSrc: blankedImageSrc || problem.blankedImageSrc,
        croppedImageSrc: croppedImageSrc || problem.croppedImageSrc,
        originalImageSrc: originalImageSrc || problem.originalImageSrc,
        imageSrc: blankedImageSrc || croppedImageSrc || problem.imageSrc || originalImageSrc,
        isBlanked: Boolean(blankedImageSrc || problem.isBlanked),
      };
    }),
  );
}

export async function generatePrintPdf(input: PrintDocumentInput): Promise<GeneratedPrint> {
  const problems = await resolvePrintImageUrls(input.problems);
  const html = buildPrintHtml({ ...input, problems });
  if (Platform.OS === "web") {
    return { html };
  }
  const result = await Print.printToFileAsync({ html });
  return { html, uri: result.uri };
}

export async function sharePrintPdf(uri: string) {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("SHARING_UNAVAILABLE");
  }
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: "コンビニ印刷アプリやファイルに共有",
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
  await Print.printAsync({ html });
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
  const generated = await generatePrintPdf(input);
  const first = input.problems[0];
  const dominant = styleToGridType(first?.answerStyle ?? chooseAnswerStyle(first ?? { topicTag: "" }));
  await recordPrintJob({
    parentId: input.parentId,
    childId: input.childId,
    title: input.title ?? "まとめプリント",
    gridType: dominant,
    problemIds: input.problems.map((problem) => problem.id),
  });
  if (generated.uri) {
    await sharePrintPdf(generated.uri);
  } else {
    await printDirect(generated.html);
  }
  return generated;
}

export { buildPrintHtml, styleToGridType };