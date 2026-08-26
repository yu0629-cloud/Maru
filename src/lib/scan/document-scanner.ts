import { Platform } from "react-native";
import type { ScanDocumentOptions, ScanDocumentResponse } from "react-native-document-scanner-plugin";
import { isExpoGo } from "@/src/lib/env";

export const SCAN_MAX_DOCUMENTS = 8;
export const SCAN_CROPPED_JPEG_QUALITY = 80;

export class DocumentScanUnavailableError extends Error {
  constructor(
    message = Platform.OS === "web"
      ? "Web では紙の自動検出は使えません。"
      : "紙の自動検出はこのビルドでは使えません。開発ビルドで開き直してください。",
  ) {
    super(message);
    this.name = "DocumentScanUnavailableError";
  }
}

export class DocumentScanCancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "DocumentScanCancelledError";
  }
}

export function canUseNativeDocumentScanner() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;
  return !isExpoGo();
}

function toFileUri(path: string) {
  if (!path) return path;
  if (
    path.startsWith("file:") ||
    path.startsWith("content:") ||
    path.startsWith("ph://") ||
    path.startsWith("assets-library:")
  ) {
    return path;
  }
  return `file://${path}`;
}

type ScannerModule = {
  scanDocument: (options?: ScanDocumentOptions) => Promise<ScanDocumentResponse>;
};

function loadDocumentScanner(): ScannerModule | null {
  try {
    const mod = require("react-native-document-scanner-plugin") as { default?: ScannerModule };
    return mod.default ?? null;
  } catch {
    return null;
  }
}

/** ネイティブ UI で四隅検出・台形補正し、用紙だけの長方形画像 URI を返す */
export async function scanPaperDocuments(options?: { maxNumDocuments?: number }): Promise<string[]> {
  if (!canUseNativeDocumentScanner()) {
    throw new DocumentScanUnavailableError();
  }
  const scanner = loadDocumentScanner();
  if (!scanner) {
    throw new DocumentScanUnavailableError();
  }

  const result = await scanner.scanDocument({
    maxNumDocuments: options?.maxNumDocuments ?? SCAN_MAX_DOCUMENTS,
    croppedImageQuality: SCAN_CROPPED_JPEG_QUALITY,
  });

  if (result.status === "cancel") {
    throw new DocumentScanCancelledError();
  }

  return (result.scannedImages ?? []).filter(Boolean).map(toFileUri);
}
