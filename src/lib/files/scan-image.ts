import { RETENTION } from "@/src/features/storage/retention";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Image } from "react-native";
import { maruLog } from "@/src/lib/debug/maruLog";
import {
  coerceGeminiBox,
  expandFigureGeminiBox,
  geminiBoxToPixelCrop,
  planExpandedFigureCrop,
  raiseCropBelowLead,
  looksLikeInsetCrop,
  looksLikeTopParentFigure,
  trailingStemCutFromBandSizes,
  leadingStemCutFromBandSizes,
  leftStemMasksFromBandColumns,
  swallowedStemMasksInCrop,
  combineFigureMasks,
  figureAnswerMasks,
} from "@/src/features/print/lib/bbox.mjs";
import { paperCropFromProfiles, remapGeminiBoxToPaper } from "@/src/lib/scan/paper-bounds.mjs";

export const SCAN_MAX_LONG_EDGE = 1280;
export const SCAN_CAPTURE_QUALITY = 0.5;
export const SCAN_JPEG_QUALITY = 0.6;

export function toFileUri(uri: string) {
  if (!uri || uri.startsWith("mock")) return uri;
  if (
    uri.startsWith("file:") ||
    uri.startsWith("content:") ||
    uri.startsWith("http://") ||
    uri.startsWith("https://") ||
    uri.startsWith("ph://") ||
    uri.startsWith("assets-library:")
  ) {
    return uri;
  }
  if (uri.startsWith("/")) return `file://${uri}`;
  return uri;
}

export function isPreviewableScanUri(uri?: string) {
  if (!uri || uri.startsWith("mock")) return false;
  const value = toFileUri(uri);
  return (
    value.startsWith("file:") ||
    value.startsWith("content:") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("ph://") ||
    value.startsWith("assets-library:")
  );
}

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
  await FileSystem.copyAsync({ from: toFileUri(uri), to: dest });
  const info = await FileSystem.getInfoAsync(dest);
  const size = info.exists && "size" in info ? Number(info.size ?? 0) : 0;
  maruLog("fs", "copyAsync", { dest, size, ms: Date.now() - started });
  if (!info.exists || size === 0) {
    throw new Error("写真の保存に失敗しました。もう一度撮影してください。");
  }
  return toFileUri(dest);
}

export async function localFileExists(uri?: string | null) {
  if (!uri || uri.startsWith("mock") || uri.startsWith("http://") || uri.startsWith("https://")) return false;
  if (!isPreviewableScanUri(uri)) return false;
  try {
    const info = await FileSystem.getInfoAsync(toFileUri(uri));
    if (!info.exists) return false;
    if ("size" in info && Number(info.size ?? 0) <= 0) return false;
    return true;
  } catch {
    return false;
  }
}

function looksLikeVolatileCache(uri: string) {
  return /ImageManipulator|\/Caches\/|\/cache\//i.test(uri);
}

function looksLikeDurableScanUri(uri: string) {
  return /maru-scans/i.test(uri) && !looksLikeVolatileCache(uri);
}

/** ImageManipulator の Caches 出力を Documents へ移し、再起動後も読める URI にする */
export async function ensureDurableScanUri(uri: string) {
  if (!uri || uri.startsWith("mock")) return uri;
  if (looksLikeDurableScanUri(uri)) return uri;
  return persistScanImage(uri);
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

export type PaperCropResult = CompressedScan & {
  frac: { x: number; y: number; width: number; height: number };
};

/** EXIF 向きを画素に焼き込み、縦撮りが横倒しにならないようにする */
export async function normalizeImageOrientation(uri: string): Promise<CompressedScan> {
  const result = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: result.uri, width: result.width, height: result.height };
}

async function sampleProfileSizes(
  uri: string,
  width: number,
  height: number,
  bands: number,
  axis: "row" | "col",
): Promise<number[] | null> {
  const sizes: number[] = [];
  const span = axis === "row" ? height : width;
  const band = Math.max(6, Math.floor(span / bands));
  if (band < 6) return null;
  for (let i = 0; i < bands; i += 1) {
    const origin = i * band;
    const len = i === bands - 1 ? span - origin : band;
    if (len < 4) break;
    try {
      const strip = await ImageManipulator.manipulateAsync(
        uri,
        [
          {
            crop:
              axis === "row"
                ? { originX: 0, originY: origin, width, height: len }
                : { originX: origin, originY: 0, width: len, height },
          },
        ],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      sizes.push(strip.base64?.length ?? 0);
    } catch {
      return null;
    }
  }
  return sizes.length >= 6 ? sizes : null;
}

/**
 * ライブラリ写真など、机が写った画像から用紙だけを切り出す。
 * すでにスキャナー済み（余白が無い）なら null。
 */
export async function cropPaperFromPhoto(
  uri: string,
  knownSize?: { width?: number; height?: number },
): Promise<PaperCropResult | null> {
  if (!uri || uri.startsWith("mock")) return null;
  const local = await ensureLocalImageFile(uri);
  if (!local) return null;
  const probed = await probeImageSize(local, knownSize);
  if (!probed?.width || !probed.height) return null;
  if (Math.max(probed.width, probed.height) < 240) return null;
  try {
    const previewLong = 240;
    const scale = previewLong / Math.max(probed.width, probed.height);
    const preview = await ImageManipulator.manipulateAsync(
      local,
      [{ resize: { width: Math.max(48, Math.round(probed.width * scale)), height: Math.max(48, Math.round(probed.height * scale)) } }],
      { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG },
    );
    const pw = Number(preview.width) || 0;
    const ph = Number(preview.height) || 0;
    if (pw < 48 || ph < 48) return null;
    const [rowSizes, colSizes] = await Promise.all([
      sampleProfileSizes(preview.uri, pw, ph, 12, "row"),
      sampleProfileSizes(preview.uri, pw, ph, 12, "col"),
    ]);
    if (!rowSizes || !colSizes) return null;
    const frac = paperCropFromProfiles(rowSizes, colSizes);
    if (!frac) {
      maruLog("fs", "paper crop none", {
        preview: { width: pw, height: ph },
        rowSizes,
        colSizes,
      });
      return null;
    }
    const originX = Math.round(frac.x * probed.width);
    const originY = Math.round(frac.y * probed.height);
    const width = Math.max(32, Math.min(probed.width - originX, Math.round(frac.width * probed.width)));
    const height = Math.max(32, Math.min(probed.height - originY, Math.round(frac.height * probed.height)));
    if (width < probed.width * 0.42 || height < probed.height * 0.42) return null;
    const cropped = await ImageManipulator.manipulateAsync(
      local,
      [{ crop: { originX, originY, width, height } }],
      { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
    );
    maruLog("fs", "paper crop", {
      from: { width: probed.width, height: probed.height },
      to: { width: cropped.width, height: cropped.height },
      frac,
    });
    return { uri: cropped.uri, width: cropped.width, height: cropped.height, frac };
  } catch (error) {
    maruLog("fs", "paper crop skip", { error: error instanceof Error ? error.message : error });
    return null;
  }
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
  const paper = await cropPaperFromPhoto(uri, knownSize);
  const sourceUri = paper?.uri ?? uri;
  const probed = paper
    ? { width: paper.width, height: paper.height }
    : await probeImageSize(uri, knownSize);
  if (alreadyScanSized(probed?.width, probed?.height)) {
    const durableUri = await ensureDurableScanUri(sourceUri);
    maruLog("fs", "compress skip", {
      width: probed?.width,
      height: probed?.height,
      uri: durableUri,
      paper: Boolean(paper),
      ms: Date.now() - started,
    });
    return { uri: durableUri, width: probed?.width, height: probed?.height };
  }

  const actions = longEdgeResize(probed?.width, probed?.height);

  const result = await ImageManipulator.manipulateAsync(sourceUri, actions, {
    compress: SCAN_JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const durableUri = await persistScanImage(result.uri);
  maruLog("fs", "compress", {
    width: result.width,
    height: result.height,
    uri: durableUri,
    ms: Date.now() - started,
  });
  return { uri: durableUri, width: result.width, height: result.height };
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

function sameLocalFile(left: string, right: string) {
  return toFileUri(left).replace(/\/+$/, "") === toFileUri(right).replace(/\/+$/, "");
}

/** 同期時に maru-scans の期限切れローカルキャッシュを捨てる。keepUris は現在の撮影・採点中ファイル */
export async function purgeLocalScanCache(input?: { keepUris?: Array<string | undefined | null>; maxAgeMs?: number }) {
  const root = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!root) return { deleted: [] as string[] };
  const dir = `${root}maru-scans/`;
  const keep = (input?.keepUris ?? []).filter((uri): uri is string => Boolean(uri && !uri.startsWith("mock")));
  const maxAgeMs = input?.maxAgeMs ?? RETENTION.localCacheTtlDays * 86_400_000;
  const now = Date.now();
  const deleted: string[] = [];
  try {
    const names = await FileSystem.readDirectoryAsync(dir);
    for (const name of names) {
      const path = `${dir}${name}`;
      if (keep.some((uri) => sameLocalFile(uri, path))) continue;
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) continue;
      const raw = "modificationTime" in info ? Number(info.modificationTime ?? 0) : 0;
      const modifiedMs = raw > 1e12 ? raw : raw * 1000;
      if (!(modifiedMs > 0)) continue;
      const ageMs = now - modifiedMs;
      if (ageMs <= maxAgeMs) continue;
      await FileSystem.deleteAsync(path, { idempotent: true });
      deleted.push(toFileUri(path));
    }
  } catch (error) {
    maruLog("fs", "purgeLocalScanCache skip", { error: error instanceof Error ? error.message : "unknown" });
  }
  if (deleted.length > 0) {
    maruLog("fs", "purgeLocalScanCache", { deleted: deleted.length });
  }
  return { deleted };
}

export const FIGURE_CACHE_VERSION = 77;
const FULL_PAGE_CROP: [number, number, number, number] = [0, 0, 1000, 1000];

function figuresDir() {
  const root = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!root) throw new Error("この端末では写真を保存できません");
  return `${root}maru-figures/`;
}

function figureLog(message: string, extra?: unknown) {
  maruLog("figure", message, extra);
}

/** 採点マーク付き切り抜きや maru-figures キャッシュはソースに使わない */
export function isRawScanSourceUri(uri?: string | null) {
  const value = String(uri ?? "").trim();
  if (!value || value.startsWith("mock")) return false;
  if (/maru-figures/i.test(value)) return false;
  if (value.startsWith("data:image/svg")) return false;
  return (
    value.startsWith("file:") ||
    value.startsWith("content:") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("ph://") ||
    value.startsWith("assets-library:") ||
    value.startsWith("data:image/") ||
    value.startsWith("/")
  );
}

/** ページ全体の生スキャンだけ。切り抜き data URI はソースにしない */
export function isFullPageScanSource(uri?: string | null) {
  const value = String(uri ?? "").trim();
  if (!isRawScanSourceUri(value)) return false;
  if (value.startsWith("data:image/")) return false;
  return true;
}

async function writeDataUriToFile(dataUri: string, dest: string) {
  const base64 = dataUri.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
  await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });
  return toFileUri(dest);
}

/** file:// / ph:// / content:// / HTTPS / data URI を ImageManipulator が開けるローカルファイルにする */
export async function ensureLocalImageFile(uri: string): Promise<string | null> {
  const value = String(uri ?? "").trim();
  if (!value || value.startsWith("mock")) {
    figureLog("ensureLocal skip: empty or mock", { uri: value.slice(0, 80) });
    return null;
  }
  const cacheRoot = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!cacheRoot) {
    figureLog("ensureLocal skip: no cache dir");
    return null;
  }
  try {
    if (value.startsWith("data:image/")) {
      const dest = `${cacheRoot}figure-src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      return await writeDataUriToFile(value, dest);
    }
    if (/^https?:/i.test(value)) {
      const dest = `${cacheRoot}figure-dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const result = await FileSystem.downloadAsync(value, dest);
      figureLog("ensureLocal downloaded https", {
        dest: result.uri,
        status: result.status,
      });
      if (result.status && result.status >= 400) return null;
      return toFileUri(result.uri);
    }
    const local = toFileUri(value);
    if (local.startsWith("file:") && (await localFileExists(local))) {
      figureLog("ensureLocal existing file", { uri: local.slice(0, 120) });
      return local;
    }
    if (
      local.startsWith("ph://") ||
      local.startsWith("content:") ||
      local.startsWith("assets-library:") ||
      local.startsWith("file:")
    ) {
      const dest = `${cacheRoot}figure-copy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      await FileSystem.copyAsync({ from: local, to: dest });
      const info = await FileSystem.getInfoAsync(dest);
      if (!info.exists) {
        figureLog("ensureLocal copy missing", { dest });
        return null;
      }
      figureLog("ensureLocal copied", { from: local.slice(0, 80), dest });
      return toFileUri(dest);
    }
    figureLog("ensureLocal unsupported scheme", { uri: local.slice(0, 80) });
    return null;
  } catch (error) {
    figureLog("ensureLocal fail", {
      error: error instanceof Error ? error.message : error,
      uri: value.slice(0, 80),
    });
    return null;
  }
}

async function probeImageSizeForCrop(uri: string): Promise<{ width: number; height: number } | undefined> {
  const fromGetSize = await probeImageSize(uri);
  if (fromGetSize?.width && fromGetSize.height) {
    figureLog("size from Image.getSize", fromGetSize);
    return fromGetSize;
  }
  try {
    const probe = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    if (probe.width && probe.height) {
      figureLog("size from manipulateAsync probe", { width: probe.width, height: probe.height });
      return { width: probe.width, height: probe.height };
    }
  } catch (error) {
    figureLog("size probe fail", { error: error instanceof Error ? error.message : error });
  }
  return undefined;
}

async function resultToDataUri(result: {
  uri: string;
  base64?: string;
}): Promise<string | null> {
  if (result.base64) {
    return `data:image/jpeg;base64,${result.base64}`;
  }
  try {
    const fromFile = await FileSystem.readAsStringAsync(toFileUri(result.uri), {
      encoding: FileSystem.EncodingType.Base64,
    });
    figureLog("base64 missing on result, read from file");
    return `data:image/jpeg;base64,${fromFile}`;
  } catch (error) {
    figureLog("resultToDataUri fail", { error: error instanceof Error ? error.message : error });
    return null;
  }
}

async function manipulateCrop(
  local: string,
  pixel: { originX: number; originY: number; width: number; height: number },
) {
  figureLog("manipulateAsync crop", pixel);
  return ImageManipulator.manipulateAsync(local, [{ crop: pixel }], {
    compress: 0.82,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
}

async function sampleJpegBandSizes(
  croppedUri: string,
  width: number,
  originY: number,
  sampleH: number,
  bands = 10,
): Promise<{ sizes: number[]; bandH: number } | null> {
  const bh = Math.max(6, Math.floor(sampleH / bands));
  if (bh < 6 || sampleH < bh * 6) return null;
  const sizes: number[] = [];
  for (let i = 0; i < bands; i += 1) {
    const y = originY + i * bh;
    const stripH = i === bands - 1 ? originY + sampleH - y : bh;
    if (stripH < 4) break;
    try {
      const strip = await ImageManipulator.manipulateAsync(
        croppedUri,
        [{ crop: { originX: 0, originY: y, width, height: stripH } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      sizes.push(strip.base64?.length ?? 0);
    } catch {
      return null;
    }
  }
  if (sizes.length < 6) return null;
  return { sizes, bandH: bh };
}

/**
 * 親図 JPEG の下側を細い帯に分け、説明と問題文のあいだの空きで切る。
 * 空きが無ければ null（説明だけの図は触らない）。
 */
async function trimTrailingSwallowedStem(
  croppedUri: string,
  width: number,
  height: number,
): Promise<{ originX: number; originY: number; width: number; height: number } | null> {
  if (height < 160 || width < 160) return null;
  const y0 = Math.floor(height * 0.7);
  const sampled = await sampleJpegBandSizes(croppedUri, width, y0, height - y0);
  if (!sampled) return null;
  const frac = trailingStemCutFromBandSizes(sampled.sizes);
  if (frac == null || !(frac > 0.04) || !(frac < 0.9)) return null;
  const cutY = y0 + Math.round(frac * sampled.sizes.length * sampled.bandH);
  const keepH = Math.min(height, Math.max(Math.floor(height * 0.55), cutY + 4));
  if (keepH >= height - 8) return null;
  figureLog("trim trailing stem", { width, height, keepH, frac, sizes: sampled.sizes });
  return { originX: 0, originY: 0, width, height: keepH };
}

/**
 * 図・表 JPEG の上側を細い帯に分け、問題文と本体のあいだの空きで切る。
 * 親図では使わない（段間の矢印を問題文と誤認して上段を落とすため）。表の上の設問行だけ切る。
 */
async function trimLeadingSwallowedStem(
  croppedUri: string,
  width: number,
  height: number,
  asTable = false,
): Promise<{ originX: number; originY: number; width: number; height: number } | null> {
  if (height < 100 || width < 160) return null;
  const sampleH = Math.max(56, Math.floor(height * (asTable ? 0.42 : 0.32)));
  const sampled = await sampleJpegBandSizes(croppedUri, width, 0, Math.min(height, sampleH), asTable ? 12 : 10);
  if (!sampled) return null;
  const frac = leadingStemCutFromBandSizes(sampled.sizes);
  if (frac == null || !(frac > 0.04) || !(frac < 0.72)) return null;
  const raiseY = Math.round(frac * sampled.sizes.length * sampled.bandH);
  if (raiseY < 8) return null;
  const keepH = height - raiseY;
  if (keepH < Math.floor(height * 0.48) || keepH < 72) return null;
  figureLog("trim leading stem", { width, height, raiseY, keepH, frac, asTable, sizes: sampled.sizes });
  return { originX: 0, originY: raiseY, width, height: keepH };
}

/**
 * 横帯ごとに左の本文切れ端を探し、crop 内 0〜1 の白マスクにする。
 * 縦一刀だとイ・ウと問題文が同じ X で両立しない。
 */
async function detectLeftStemMasks(
  croppedUri: string,
  width: number,
  height: number,
): Promise<Array<{ x: number; y: number; width: number; height: number }>> {
  if (height < 120 || width < 180) return [];
  const bands = height >= 260 ? 10 : 8;
  const columns = 12;
  const sampleFrac = 0.72;
  const sampleW = Math.max(80, Math.floor(width * sampleFrac));
  const bandH = Math.max(10, Math.floor(height / bands));
  const colW = Math.max(6, Math.floor(sampleW / columns));
  const grid: number[][] = [];
  for (let r = 0; r < bands; r += 1) {
    const y = r * bandH;
    const h = r === bands - 1 ? height - y : bandH;
    if (h < 8) break;
    const sizes: number[] = [];
    for (let c = 0; c < columns; c += 1) {
      const x = c * colW;
      const w = c === columns - 1 ? sampleW - x : colW;
      if (w < 4) break;
      try {
        const strip = await ImageManipulator.manipulateAsync(
          croppedUri,
          [{ crop: { originX: x, originY: y, width: w, height: h } }],
          { compress: 0.55, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        sizes.push(strip.base64?.length ?? 0);
      } catch {
        sizes.push(0);
      }
    }
    grid.push(sizes);
  }
  const masks = leftStemMasksFromBandColumns(grid, { sampleWidthFrac: sampleFrac });
  if (masks.length) {
    figureLog("left stem masks", { width, height, bands: grid.length, masks });
  }
  return masks;
}

function shiftGeminiBoxByPixelTrim(
  box: [number, number, number, number],
  imgW: number,
  imgH: number,
  trim: { originX: number; originY: number; width: number; height: number },
): [number, number, number, number] {
  const [ymin, xmin, ymax, xmax] = box;
  const h = Math.max(1, ymax - ymin);
  const w = Math.max(1, xmax - xmin);
  const pw = Math.max(1, imgW);
  const ph = Math.max(1, imgH);
  return [
    ymin + (trim.originY / ph) * h,
    xmin + (trim.originX / pw) * w,
    ymin + ((trim.originY + trim.height) / ph) * h,
    xmin + ((trim.originX + trim.width) / pw) * w,
  ];
}

function geminiForCrop(
  cropBox: unknown,
  answerBBox?: unknown,
  options?: {
    asTable?: boolean;
    asInset?: boolean;
    clipBottomBeforeStem?: boolean;
    hasQuestionStem?: boolean;
    problemBox?: unknown;
    answerSlot?: unknown;
  },
) {
  const planned = planExpandedFigureCrop(cropBox ?? FULL_PAGE_CROP, answerBBox ?? null, {
    preserveExtent: true,
    asTable: options?.asTable === true,
    asInset: options?.asInset === true,
    clipBottomBeforeStem:
      options?.asTable || options?.asInset ? false : options?.clipBottomBeforeStem,
    hasQuestionStem: options?.hasQuestionStem === true,
    problemBox: options?.problemBox,
    answerSlot: options?.answerSlot,
  });
  if (planned.cropGemini) return planned.cropGemini;
  const raw = coerceGeminiBox(cropBox) ?? FULL_PAGE_CROP;
  return (
    expandFigureGeminiBox(raw, undefined, {
      asTable: options?.asTable === true,
      asInset: options?.asInset === true,
    }) ?? raw
  );
}

/** Storage パスの `/` が入ってもファイル名として使えるようにする */
function figureCacheToken(value?: string) {
  return String(value ?? "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

async function cacheFigureFile(resultUri: string, scanId?: string, problemId?: string) {
  const scanKey = figureCacheToken(scanId);
  const problemKey = figureCacheToken(problemId);
  if (!scanKey || !problemKey) return;
  try {
    const dir = figuresDir();
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const dest = `${dir}${scanKey}-${problemKey}-v${FIGURE_CACHE_VERSION}.jpg`;
    for (const stale of [
      `${dir}${scanKey}-${problemKey}.jpg`,
      `${dir}${scanKey}-${problemKey}-v1.jpg`,
      `${dir}${scanKey}-${problemKey}-v40.jpg`,
      `${dir}${scanKey}-${problemKey}-v41.jpg`,
      `${dir}${scanKey}-${problemKey}-v42.jpg`,
      `${dir}${scanKey}-${problemKey}-v43.jpg`,
      `${dir}${scanKey}-${problemKey}-v44.jpg`,
      `${dir}${scanKey}-${problemKey}-v45.jpg`,
      `${dir}${scanKey}-${problemKey}-v46.jpg`,
      `${dir}${scanKey}-${problemKey}-v47.jpg`,
      `${dir}${scanKey}-${problemKey}-v48.jpg`,
      `${dir}${scanKey}-${problemKey}-v49.jpg`,
      `${dir}${scanKey}-${problemKey}-v50.jpg`,
      `${dir}${scanKey}-${problemKey}-v51.jpg`,
      `${dir}${scanKey}-${problemKey}-v52.jpg`,
      `${dir}${scanKey}-${problemKey}-v53.jpg`,
      `${dir}${scanKey}-${problemKey}-v54.jpg`,
      `${dir}${scanKey}-${problemKey}-v55.jpg`,
      `${dir}${scanKey}-${problemKey}-v56.jpg`,
      `${dir}${scanKey}-${problemKey}-v57.jpg`,
      `${dir}${scanKey}-${problemKey}-v58.jpg`,
      `${dir}${scanKey}-${problemKey}-v59.jpg`,
      `${dir}${scanKey}-${problemKey}-v70.jpg`,
      `${dir}${scanKey}-${problemKey}-v71.jpg`,
      `${dir}${scanKey}-${problemKey}-v72.jpg`,
      `${dir}${scanKey}-${problemKey}-v73.jpg`,
      `${dir}${scanKey}-${problemKey}-v74.jpg`,
      `${dir}${scanKey}-${problemKey}-v75.jpg`,
      `${dir}${scanKey}-${problemKey}-v76.jpg`,
    ]) {
      await FileSystem.deleteAsync(stale, { idempotent: true });
    }
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.copyAsync({ from: resultUri, to: dest });
  } catch (error) {
    figureLog("cache write skip", { error: error instanceof Error ? error.message : error });
  }
}

export type CroppedFigure = {
  dataUri: string;
  masks: Array<{ x: number; y: number; width: number; height: number }>;
};

/**
 * has_figure の crop_box を生スキャンから切り抜き、data URI と本文切れ端の白マスクを返す。
 * 失敗時は null（呼び出し側でテキストフォールバック）。
 */
export async function cropFigureResult(input: {
  sourceUri: string;
  cropBox?: unknown;
  scanId?: string;
  problemId?: string;
  answerBBox?: unknown;
  visualType?: string;
  asTable?: boolean;
  asInset?: boolean;
  hasQuestionStem?: boolean;
  stemBoxes?: unknown[];
  answerSlot?: unknown;
}): Promise<CroppedFigure | null> {
  const visual = String(input.visualType ?? "");
  const asTable = input.asTable === true;
  figureLog("crop start", {
    problemId: input.problemId,
    visualType: visual || "(unset)",
    visualIsHasFigure: visual === "has_figure",
    asTable,
    sourceUri: String(input.sourceUri ?? "").slice(0, 120),
    cropBox: input.cropBox,
    cropBoxRawType: Array.isArray(input.cropBox) ? "array" : typeof input.cropBox,
    answerBBox: asTable ? null : coerceGeminiBox(input.answerBBox),
  });

  const local = await ensureLocalImageFile(input.sourceUri);
  if (!local) {
    figureLog("fail: no local image", {
      problemId: input.problemId,
      sourceUri: String(input.sourceUri ?? "").slice(0, 120),
    });
    return null;
  }

  const size = await probeImageSizeForCrop(local);
  if (!size?.width || !size.height) {
    figureLog("fail: image size unknown", { problemId: input.problemId, local: local.slice(0, 120) });
    return null;
  }
  const longEdge = Math.max(size.width, size.height);
  const shortEdge = Math.min(size.width, size.height);
  const aspect = longEdge / Math.max(1, shortEdge);
  // すでに切り抜かれた図（横長の親図・狭い差し込み）を再クロップしない
  if (longEdge < 700 || shortEdge < 480 || aspect > 2.3) {
    figureLog("fail: source is not a full page scan", {
      problemId: input.problemId,
      image: size,
      aspect: Math.round(aspect * 100) / 100,
    });
    return null;
  }

  let cropLocal = local;
  let cropSize = size;
  let cropBox: unknown = input.cropBox;
  let answerBBox: unknown = input.answerBBox;
  let answerSlot: unknown = input.answerSlot;
  let stemBoxes: unknown[] | undefined = input.stemBoxes;
  const paper = await cropPaperFromPhoto(local, size);
  if (paper?.frac && paper.width && paper.height) {
    const remapped = remapGeminiBoxToPaper(cropBox ?? FULL_PAGE_CROP, paper.frac);
    if (remapped) {
      cropLocal = paper.uri;
      cropSize = { width: paper.width, height: paper.height };
      cropBox = remapped;
      answerBBox = answerBBox != null ? remapGeminiBoxToPaper(answerBBox, paper.frac) : answerBBox;
      answerSlot = answerSlot != null ? remapGeminiBoxToPaper(answerSlot, paper.frac) : answerSlot;
      stemBoxes = Array.isArray(stemBoxes)
        ? stemBoxes
            .map((box) => remapGeminiBoxToPaper(box, paper.frac))
            .filter((box): box is [number, number, number, number] => Boolean(box))
        : stemBoxes;
      figureLog("paper crop applied", {
        problemId: input.problemId,
        frac: paper.frac,
        from: size,
        to: cropSize,
        remappedCrop: remapped,
      });
    } else {
      figureLog("paper crop unused: remap failed", {
        problemId: input.problemId,
        frac: paper.frac,
        cropBox,
      });
    }
  }

  const rawGemini = coerceGeminiBox(cropBox);
  const insetLike = looksLikeInsetCrop(rawGemini);
  const asInset = input.asInset === true || (input.asInset !== false && !asTable && insetLike);
  const geminiCrop = asTable
    ? rawGemini
    : asInset
      ? rawGemini
      : raiseCropBelowLead(rawGemini) ?? rawGemini;

  const cropOpts = {
    asTable,
    asInset,
    clipBottomBeforeStem: !asTable && !asInset,
    hasQuestionStem: input.hasQuestionStem === true,
    problemBox: answerSlot ?? answerBBox,
    answerSlot,
  };
  const answerForClip = asTable ? null : answerBBox;
  const expandedOnly =
    (geminiCrop ? expandFigureGeminiBox(geminiCrop, undefined, { asTable, asInset }) : null) ??
    geminiCrop ??
    FULL_PAGE_CROP;
  const attempts: Array<{ label: string; box: [number, number, number, number] }> = [
    {
      label: asTable ? "expanded-table" : asInset ? "expanded-inset" : "expanded-preserve",
      box: geminiForCrop(geminiCrop ?? FULL_PAGE_CROP, answerForClip, cropOpts) as [
        number,
        number,
        number,
        number,
      ],
    },
  ];
  if (asTable) {
    attempts.push({ label: "expanded-only", box: expandedOnly as [number, number, number, number] });
    if (geminiCrop) attempts.push({ label: "raw-crop_box", box: geminiCrop as [number, number, number, number] });
  } else if (geminiCrop) {
    // 親図は設問本文を含まないクリップだけ使う（full-page / 未クリップは二重表示の原因）
    attempts.push({
      label: "raw-crop_box",
      box: (expandFigureGeminiBox(geminiCrop, undefined, { asTable, asInset }) ?? geminiCrop) as [
        number,
        number,
        number,
        number,
      ],
    });
  }

  let lastError: unknown;
  for (const attempt of attempts) {
    const pixel = geminiBoxToPixelCrop(attempt.box, cropSize.width, cropSize.height);
    if (!pixel) {
      figureLog("skip attempt: pixel crop invalid", {
        problemId: input.problemId,
        label: attempt.label,
        box: attempt.box,
        image: cropSize,
      });
      continue;
    }
    try {
      let result = await manipulateCrop(cropLocal, pixel);
      let dataUri = await resultToDataUri(result);
      if (!dataUri) {
        figureLog("fail: no base64 on result", { problemId: input.problemId, label: attempt.label });
        continue;
      }
      let masks: Array<{ x: number; y: number; width: number; height: number }> = [];
      if (!asInset) {
        let visibleBox = attempt.box;
        let visW = Number(result.width) || pixel.width;
        let visH = Number(result.height) || pixel.height;
        const applyStemTrim = async (
          label: string,
          trim: { originX: number; originY: number; width: number; height: number } | null,
        ) => {
          if (!trim) return;
          try {
            const trimmed = await manipulateCrop(result.uri, trim);
            const trimmedUri = await resultToDataUri(trimmed);
            if (!trimmedUri) return;
            visibleBox = shiftGeminiBoxByPixelTrim(visibleBox, visW, visH, trim);
            visW = Number(trimmed.width) || trim.width;
            visH = Number(trimmed.height) || trim.height;
            result = trimmed;
            dataUri = trimmedUri;
            figureLog(`trimmed ${label}`, {
              problemId: input.problemId,
              after: trim,
            });
          } catch (error) {
            figureLog(`trim ${label} skip`, {
              problemId: input.problemId,
              error: error instanceof Error ? error.message : error,
            });
          }
        };
        await applyStemTrim(
          "leading stem",
          asTable ? await trimLeadingSwallowedStem(result.uri, visW, visH, asTable) : null,
        );
        if (!asTable && looksLikeTopParentFigure(attempt.box)) {
          await applyStemTrim(
            "trailing stem",
            await trimTrailingSwallowedStem(result.uri, visW, visH),
          );
        }
        if (!asTable) {
          const bboxMasks = swallowedStemMasksInCrop(visibleBox, stemBoxes);
          const jpegMasks = await detectLeftStemMasks(result.uri, visW, visH);
          const answerMasks = figureAnswerMasks(visibleBox, answerSlot, { preserveExtent: true }).masks;
          masks = combineFigureMasks(bboxMasks, jpegMasks, answerMasks);
        }
      }
      await cacheFigureFile(result.uri, input.scanId, input.problemId);
      figureLog("crop ok", {
        problemId: input.problemId,
        label: attempt.label,
        image: cropSize,
        pixel,
        dataUriChars: dataUri.length,
        maskCount: masks.length,
      });
      return { dataUri, masks };
    } catch (error) {
      lastError = error;
      figureLog("manipulateAsync exception", {
        problemId: input.problemId,
        label: attempt.label,
        pixel,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  figureLog("fail: all crop attempts exhausted", {
    problemId: input.problemId,
    error: lastError instanceof Error ? lastError.message : lastError,
  });
  return null;
}

export async function cropFigureToBase64(input: {
  sourceUri: string;
  cropBox?: unknown;
  scanId?: string;
  problemId?: string;
  answerBBox?: unknown;
  visualType?: string;
  asTable?: boolean;
  asInset?: boolean;
  hasQuestionStem?: boolean;
}): Promise<string | null> {
  const cropped = await cropFigureResult(input);
  return cropped?.dataUri ?? null;
}

/** has_figure の crop_box を生スキャンから切り抜く。成功時は data URI、失敗時は null */
export async function cropAndCacheFigure(input: {
  sourceUri: string;
  cropBox: [number, number, number, number] | unknown;
  scanId: string;
  problemId: string;
  answerBBox?: [number, number, number, number] | null;
  visualType?: string;
}): Promise<string | null> {
  if (!isRawScanSourceUri(input.sourceUri) && !String(input.sourceUri ?? "").startsWith("data:image/")) {
    figureLog("cropAndCacheFigure skip: not a raw scan source", {
      problemId: input.problemId,
      sourceUri: String(input.sourceUri ?? "").slice(0, 80),
    });
    return null;
  }
  return cropFigureToBase64(input);
}
