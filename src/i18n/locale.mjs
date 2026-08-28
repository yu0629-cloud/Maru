export function resolveAppLocale(languageCode) {
  const code = String(languageCode ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  const base = code.split("-")[0];
  if (base === "ja" || base === "jp") return "ja";
  return "en";
}
