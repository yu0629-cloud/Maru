export const GUEST_RETENTION: {
  ttlDays: 7;
  maxScans: 10;
};

export function pruneGuestScanRecords<T extends { id?: string; createdAt?: string; created_at?: string }>(
  scans: T[] | null | undefined,
  input?: { now?: string; ttlDays?: number; maxScans?: number },
): { kept: T[]; removed: T[] };
