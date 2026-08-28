import { supabase } from "@/src/lib/supabase/client";

const LOCAL_OR_DATA = /^(file:|content:|data:|ph:|assets-library:)/i;

export function asStoragePath(bucket: string, value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (LOCAL_OR_DATA.test(raw)) return raw;
  for (const kind of ["public", "sign"] as const) {
    const marker = `/storage/v1/object/${kind}/${bucket}/`;
    const index = raw.indexOf(marker);
    if (index >= 0) {
      return decodeURIComponent(raw.slice(index + marker.length).split("?")[0]);
    }
  }
  return raw;
}

export async function signedStorageUrl(bucket: string, path?: string | null, expiresSec = 60 * 60) {
  const value = asStoragePath(bucket, path);
  if (!value) return "";
  if (LOCAL_OR_DATA.test(value)) return value;
  if (/^https?:/i.test(value) && !value.includes("/storage/v1/object/")) return value;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(value, expiresSec);
  if (error || !data?.signedUrl) return "";
  return data.signedUrl;
}

export function objectPublicUrl(bucket: string, path?: string | null) {
  const trimmed = asStoragePath(bucket, path);
  if (!trimmed || LOCAL_OR_DATA.test(trimmed) || /^https?:/i.test(trimmed)) return trimmed;
  const base = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!base) return "";
  return `${base}/storage/v1/object/public/${bucket}/${trimmed}`;
}
