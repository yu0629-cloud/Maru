const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function guessMimeType(pathOrUrl: string, fallback = "image/jpeg"): string {
  const cleaned = pathOrUrl.split("?")[0] ?? pathOrUrl;
  const ext = cleaned.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? fallback;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function stripDataUrl(base64: string): { mimeType?: string; data: string } {
  const match = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return { data: base64.replace(/\s/g, "") };
  }
  return { mimeType: match[1], data: match[2] };
}

export async function fetchImageAsBase64(url: string): Promise<{ mimeType: string; data: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`IMAGE_FETCH_FAILED:${response.status}`);
  }
  const mimeType = response.headers.get("content-type")?.split(";")[0] ?? guessMimeType(url);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { mimeType, data: bytesToBase64(bytes) };
}
