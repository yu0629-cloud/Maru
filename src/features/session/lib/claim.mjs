/** 同時ログイン2台制限。3台目は最終ハートビートが古い端末を追い出す。 */

export const MAX_CONCURRENT_DEVICES = 2;
export const DEVICE_LIMIT_ERROR = "DEVICE_LIMIT_REACHED";
export const DEVICE_REVOKED_ERROR = "DEVICE_REVOKED";

export function isDeviceLimitError(message) {
  return String(message ?? "").includes(DEVICE_LIMIT_ERROR);
}

export function isDeviceRevokedError(message) {
  return String(message ?? "").includes(DEVICE_REVOKED_ERROR);
}

/**
 * @param {Array<{ device_id: string, last_seen_at: string, device_name?: string|null, platform?: string|null }>} sessions
 * @param {{ device_id: string, last_seen_at: string, device_name?: string|null, platform?: string|null }} incoming
 * @param {number} [max]
 */
export function registerDeviceSession(sessions, incoming, max = MAX_CONCURRENT_DEVICES) {
  const list = Array.isArray(sessions) ? [...sessions] : [];
  const existingIndex = list.findIndex((row) => row.device_id === incoming.device_id);

  if (existingIndex >= 0) {
    const next = list.map((row, index) =>
      index === existingIndex
        ? {
            ...row,
            last_seen_at: incoming.last_seen_at,
            device_name: incoming.device_name ?? row.device_name,
            platform: incoming.platform ?? row.platform,
          }
        : row,
    );
    return { sessions: next, evicted: null, status: "refreshed" };
  }

  if (list.length < max) {
    return { sessions: [...list, incoming], evicted: null, status: "registered" };
  }

  const oldest = [...list].sort((a, b) => String(a.last_seen_at).localeCompare(String(b.last_seen_at)))[0];
  return {
    sessions: [...list.filter((row) => row.device_id !== oldest.device_id), incoming],
    evicted: oldest,
    status: "replaced_oldest",
  };
}

/** @deprecated 互換用。ログイン時は registerDeviceSession を使う */
export const claimDeviceSession = registerDeviceSession;

export function isCurrentDeviceRevoked(sessions, deviceId) {
  if (!deviceId) return false;
  return !(sessions ?? []).some((row) => row.device_id === deviceId);
}

export function heartbeatDeviceSession(sessions, deviceId, lastSeenAt) {
  if (isCurrentDeviceRevoked(sessions, deviceId)) {
    return { ok: false, sessions, code: DEVICE_REVOKED_ERROR };
  }
  return {
    ok: true,
    sessions: sessions.map((row) =>
      row.device_id === deviceId ? { ...row, last_seen_at: lastSeenAt } : row,
    ),
    code: null,
  };
}
