export const STORAGE_BUCKETS = {
  originals: "scan-originals",
  annotated: "scan-annotated",
  crops: "problem-crops",
  blanks: "problem-blanks",
} as const;

/** プリント原本のアップロード先。RLS は parent_id を第1フォルダにする */
export const SCAN_IMAGE_BUCKET = STORAGE_BUCKETS.originals;

export function scanObjectPath(
  parentId: string,
  childId: string,
  scanId: string,
  fileName = "original.jpg",
) {
  return `${parentId}/${childId}/${scanId}/${fileName}`;
}

export function problemObjectPath(
  parentId: string,
  childId: string,
  problemId: string,
  fileName: string,
) {
  return `${parentId}/${childId}/${problemId}/${fileName}`;
}
