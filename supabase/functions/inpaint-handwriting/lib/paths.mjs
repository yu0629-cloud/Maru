export const BUCKETS = {
  originals: "scan-originals",
  crops: "problem-crops",
  blanks: "problem-blanks",
};

export function problemObjectPath(parentId, childId, problemId, fileName) {
  if (!parentId || !childId || !problemId) {
    throw new Error("STORAGE_PATH_IDS_REQUIRED");
  }
  return `${parentId}/${childId}/${problemId}/${fileName}`;
}

export function cropStoragePath(ids) {
  return problemObjectPath(ids.parentId, ids.childId, ids.problemId, "crop.jpg");
}

export function blankStoragePath(ids) {
  return problemObjectPath(ids.parentId, ids.childId, ids.problemId, "blank.jpg");
}
