import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Image } from "react-native";
import { maruLog } from "@/src/lib/debug/maruLog";

export const SCAN_MAX_LONG_EDGE = 1280;
export const SCAN_CAPTURE_QUALITY = 0.5;
export const SCAN_JPEG_QUALITY = 0.6;

export function parsePictureSize(size: string): { width: number; height: number } | null {
  const match = size.trim().match(/^(\d+)\s*[xX×]\s*(\d+)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return null;
  return { width, height };
}

/** A4 に近い比率で、長辺が target〜target*1.6 のものを優先する */
export function pickScanPictureSize(sizes: string[], target = SCAN_MAX_LONG_EDGE): string | undefined {
  const parsed = sizes
    .map((value) => {
      const dims = parsePictureSize(value);
      if (!dims) return null;
      const long = Math.max(dims.width, dims.height);
      const short = Math.min(dims.width, dims.height);
      const aspectDiff = Math.abs(long / short - 297 / 210);
      return { value, long, aspectDiff };
    })
    .filter((item): item is { value: string; long: number; aspectDiff: number } => Boolean(item));
  if (parsed.length === 0) return undefined;
  const preferred = parsed.filter((item) => item.long >= target && item.long <= Math.round(target * 1.6));
  if (preferred.length > 0) {
    preferred.sort((a, b) => a.aspectDiff - b.aspectDiff || a.long - b.long);
    return preferred[0]?.value;
  }
  const enough = parsed.filter((item) => item.long >= target);
  if (enough.length > 0) {
    enough.sort((a, b) => a.aspectDiff - b.aspectDiff || a.long - b.long);
    return enough[0]?.value;
  }
  parsed.sort((a, b) => b.long - a.long);
  return parsed[0]?.value;
}

function alreadyScanSized(width?: number, height?: number) {
  if (!width || !height) return false;
  return Math.max(width, height) <= Math.round(SCAN_MAX_LONG_EDGE * 1.25);
}

function scanDir() {
  const root = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!root) throw new Error("この端末では写真を保存できません");
  return `${root}maru-scans/`;
}

export async function persistScanImage(uri: string) {
  if (uri.startsWith("mock")) return uri;
  const started = Date.now();
  const dir = scanDir();
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const dest = `${dir}scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  const info = await FileSystem.getInfoAsync(dest);
  const size = info.exists && "size" in info ? Number(info.size ?? 0) : 0;
  maruLog("fs", "copyAsync", { dest, size, ms: Date.now() - started });
  if (!info.exists || size === 0) {
    throw new Error("写真の保存に失敗しました。もう一度撮影してください。");
  }
  return dest;
}

async function probeImageSize(uri: string, known?: { width?: number; height?: number }) {
  if (known?.width && known?.height) return { width: known.width, height: known.height };
  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
    });
  } catch {
    return undefined;
  }
}

function longEdgeResize(width?: number, height?: number) {
  if (!width || !height) return [{ resize: { width: SCAN_MAX_LONG_EDGE } }];
  const long = Math.max(width, height);
  if (long <= SCAN_MAX_LONG_EDGE) return [];
  const scale = SCAN_MAX_LONG_EDGE / long;
  return [{ resize: { width: Math.round(width * scale), height: Math.round(height * scale) } }];
}

export type CompressedScan = {
  uri: string;
  width?: number;
  height?: number;
};

/** EXIF 向きを画素に焼き込み、縦撮りが横倒しにならないようにする */
export async function normalizeImageOrientation(uri: string): Promise<CompressedScan> {
  const result = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: result.uri, width: result.width, height: result.height };
}

/** 長辺 1280px・JPEG 0.6 のファイルを確定する。Edge Function には Base64 を載せない */
export async function compressScanForGrade(
  uri: string,
  knownSize?: { width?: number; height?: number },
): Promise<CompressedScan> {
  if (uri.startsWith("mock")) {
    throw new Error("モック画像は圧縮できません");
  }

  const started = Date.now();
  const probed = await probeImageSize(uri, knownSize);
  if (alreadyScanSized(probed?.width, probed?.height)) {
    maruLog("fs", "compress skip", {
      width: probed?.width,
      height: probed?.height,
      uri,
      ms: Date.now() - started,
    });
    return { uri, width: probed?.width, height: probed?.height };
  }

  const actions = longEdgeResize(probed?.width, probed?.height);

  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: SCAN_JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  maruLog("fs", "compress", {
    width: result.width,
    height: result.height,
    uri: result.uri,
    ms: Date.now() - started,
  });
  return { uri: result.uri, width: result.width, height: result.height };
}

export async function describeImage(uri: string) {
  if (uri.startsWith("mock")) return { uri, exists: false, size: 0, mock: true };
  const info = await FileSystem.getInfoAsync(uri);
  const size = info.exists && "size" in info ? Number(info.size ?? 0) : 0;
  return { uri, exists: Boolean(info.exists), size, mock: false };
}

export async function uploadLocalFile(uri: string, url: string, headers: Record<string, string>) {
  maruLog("fs", "uploadAsync start", { uri });
  const result = await FileSystem.uploadAsync(url, uri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers,
  });
  maruLog("fs", "uploadAsync status", { status: result.status, body: result.body?.slice(0, 200) });
  if (result.status < 200 || result.status >= 300) {
    const detail = result.body?.slice(0, 180)?.trim();
    throw new Error(
      detail
        ? `画像アップロードに失敗しました (${result.status}) ${detail}`
        : `画像アップロードに失敗しました (${result.status})`,
    );
  }
  return result;
}
