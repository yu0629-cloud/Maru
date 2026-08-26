export function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function decodeBase64(data) {
  const cleaned = data.replace(/\s/g, "");
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(cleaned, "base64"));
  }
  const binary = atob(cleaned);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function toDataUri(mimeType, bytes) {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

export function stripDataUrl(value) {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return { data: value.replace(/\s/g, "") };
  }
  return { mimeType: match[1], data: match[2] };
}
