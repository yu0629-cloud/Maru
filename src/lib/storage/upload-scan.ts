import { randomUUID } from "expo-crypto";
import { withTimeout } from "@/src/lib/async/timeout";
import { maruLog } from "@/src/lib/debug/maruLog";
import { uploadLocalFile } from "@/src/lib/files/scan-image";
import { getMemoryAccessToken } from "@/src/lib/supabase/access-token";
import { SCAN_IMAGE_BUCKET, scanObjectPath } from "@/src/lib/storage/paths";

const UPLOAD_TIMEOUT_MS = 25_000;

function storageObjectUrl(storagePath: string) {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 環境変数がありません");
  }
  const encodedPath = storagePath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return {
    url: `${supabaseUrl}/storage/v1/object/${SCAN_IMAGE_BUCKET}/${encodedPath}`,
    supabaseAnonKey,
  };
}

export async function uploadCompressedScan(input: {
  uri: string;
  parentId: string;
  childId: string;
}): Promise<{ scanId: string; storagePath: string }> {
  const scanId = randomUUID();
  const storagePath = scanObjectPath(input.parentId, input.childId, scanId);
  const started = Date.now();
  const { url, supabaseAnonKey } = storageObjectUrl(storagePath);
  maruLog("fs", "storage upload start", {
    bucket: SCAN_IMAGE_BUCKET,
    storagePath,
    via: "uploadAsync",
  });

  const accessToken = (await getMemoryAccessToken()) ?? supabaseAnonKey;
  await withTimeout(
    uploadLocalFile(input.uri, url, {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
    }),
    UPLOAD_TIMEOUT_MS,
    "画像アップロードがタイムアウトしました。もう一度お試しください。",
  );

  maruLog("fs", "storage upload done", { storagePath, ms: Date.now() - started });
  return { scanId, storagePath };
}
