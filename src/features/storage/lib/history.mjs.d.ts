export function isScanImageExpired(scan?: {
  localUri?: string | null;
  originalStoragePath?: string | null;
  originalPurgedAt?: string | null;
}): boolean;
export function formatScanDateTime(iso?: string | null, now?: Date, locale?: string | null): string;
export function belongsToActiveChild(
  scan?: { childId?: string | null; child_id?: string | null } | null,
  childId?: string | null,
): boolean;
export function selectHistoryScans<T extends Record<string, unknown>>(
  scans?: T[] | null,
  input?: {
    childId?: string | null;
    tier?: string | null;
    now?: string;
    isAnonymous?: boolean;
  },
): T[];
