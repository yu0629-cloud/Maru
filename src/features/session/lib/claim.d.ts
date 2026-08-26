export const MAX_CONCURRENT_DEVICES: 2;
export const DEVICE_LIMIT_ERROR: "DEVICE_LIMIT_REACHED";
export const DEVICE_REVOKED_ERROR: "DEVICE_REVOKED";

export function isDeviceLimitError(message: string | undefined | null): boolean;
export function isDeviceRevokedError(message: string | undefined | null): boolean;

export type DeviceSessionRow = {
  device_id: string;
  last_seen_at: string;
  device_name?: string | null;
  platform?: string | null;
};

export function registerDeviceSession(
  sessions: DeviceSessionRow[],
  incoming: DeviceSessionRow,
  max?: number,
): {
  sessions: DeviceSessionRow[];
  evicted: DeviceSessionRow | null;
  status: "refreshed" | "registered" | "replaced_oldest";
};

/** @deprecated 互換用。ログイン時は registerDeviceSession を使う */
export const claimDeviceSession: typeof registerDeviceSession;

export function isCurrentDeviceRevoked(
  sessions: DeviceSessionRow[] | null | undefined,
  deviceId: string | null | undefined,
): boolean;

export function heartbeatDeviceSession(
  sessions: DeviceSessionRow[],
  deviceId: string,
  lastSeenAt: string,
): { ok: boolean; sessions: DeviceSessionRow[]; code: string | null };
