import { AppState, Alert } from "react-native";
import { getDeviceId, getDeviceMeta } from "@/src/features/session/deviceId";
import { installSessionFetchInterceptor } from "@/src/features/session/interceptor";
import { shouldUseRemote } from "@/src/lib/backend";
import { supabase } from "@/src/lib/supabase/client";
import { useAuthStore } from "@/src/stores/authStore";
import { useDeviceStore } from "@/src/stores/deviceStore";
import { signOut } from "@/src/features/auth/service";
import type { DeviceSessionView } from "@/src/features/session/claim";

async function mapSessions(
  rows: Array<{
    id: string;
    parent_id: string;
    device_id: string;
    device_name: string | null;
    platform: string | null;
    last_seen_at: string;
    created_at: string;
  }>,
  currentDeviceId: string,
): Promise<DeviceSessionView[]> {
  return rows.map((row) => ({ ...row, isCurrent: row.device_id === currentDeviceId }));
}

export async function fetchDeviceSessions() {
  const deviceId = await getDeviceId();
  useDeviceStore.getState().setCurrentDeviceId(deviceId);
  const userId = useAuthStore.getState().userId;
  if (!userId) return [];

  if (!shouldUseRemote(userId)) {
    const current = useDeviceStore.getState().sessions;
    if (current.length === 0) {
      const meta = getDeviceMeta();
      useDeviceStore.getState().claimLocal({
        device_id: deviceId,
        device_name: meta.deviceName,
        platform: meta.platform,
      });
    }
    return useDeviceStore.getState().sessions;
  }

  const { data, error } = await supabase
    .from("device_sessions")
    .select("*")
    .eq("parent_id", userId)
    .order("last_seen_at", { ascending: false });
  if (error) throw error;
  const sessions = await mapSessions(data ?? [], deviceId);
  useDeviceStore.getState().setSessions(sessions);
  return sessions;
}

export async function registerThisDevice() {
  const userId = useAuthStore.getState().userId;
  if (!userId) return { revoked: false, evictedId: null as string | null };
  const deviceId = await getDeviceId();
  const meta = getDeviceMeta();
  useDeviceStore.getState().setCurrentDeviceId(deviceId);

  if (!shouldUseRemote(userId)) {
    return useDeviceStore.getState().claimLocal({
      device_id: deviceId,
      device_name: meta.deviceName,
      platform: meta.platform,
    });
  }

  const { data, error } = await supabase.rpc("register_device_session", {
    p_parent_id: userId,
    p_device_id: deviceId,
    p_device_name: meta.deviceName,
    p_platform: meta.platform,
  } as never);
  if (error) throw error;
  await fetchDeviceSessions();
  const payload = data as { evicted_device_id?: string | null } | null;
  return { evictedId: payload?.evicted_device_id ?? null, revoked: false };
}

/** @deprecated 互換。ログイン時は registerThisDevice */
export const claimThisDevice = registerThisDevice;

export async function heartbeatThisDevice() {
  const userId = useAuthStore.getState().userId;
  if (!userId) return true;
  const deviceId = await getDeviceId();

  if (!shouldUseRemote(userId)) {
    return useDeviceStore.getState().heartbeatLocal();
  }

  const { data, error } = await supabase.rpc("heartbeat_device_session", {
    p_parent_id: userId,
    p_device_id: deviceId,
  } as never);
  if (error) throw error;
  return data === true;
}

export async function revokeDevice(deviceId: string) {
  const userId = useAuthStore.getState().userId;
  if (!userId) return false;
  const currentId = useDeviceStore.getState().currentDeviceId;

  if (!shouldUseRemote(userId)) {
    const kickedSelf = useDeviceStore.getState().revokeLocal(deviceId);
    if (kickedSelf) await handleRevoked();
    return kickedSelf;
  }

  const { error } = await supabase.rpc("revoke_device_session", {
    p_parent_id: userId,
    p_device_id: deviceId,
  } as never);
  if (error) throw error;
  await fetchDeviceSessions();
  if (deviceId === currentId) {
    await handleRevoked();
    return true;
  }
  return false;
}

/** 3台目ログイン: 最古（擬似端末）が外れ、この端末は残る */
export async function simulateThirdDeviceLogin() {
  await registerThisDevice();
  const now = Date.now();
  const currentId = useDeviceStore.getState().currentDeviceId;
  const hasOther = useDeviceStore.getState().sessions.some((row) => row.device_id !== currentId);
  if (!hasOther) {
    useDeviceStore.getState().claimLocal({
      device_id: `sim_old_${now.toString(36)}`,
      device_name: "使っていない端末（シミュレーション）",
      platform: "ios",
    });
  }
  const fakeId = `sim_${(now + 1).toString(36)}`;
  useDeviceStore.getState().claimLocal({
    device_id: fakeId,
    device_name: "3台目（シミュレーション）",
    platform: "ios",
  });
  const stillHere = useDeviceStore.getState().heartbeatLocal();
  if (!stillHere) await handleRevoked();
  return stillHere;
}

/** この端末を最古扱いにして追い出す（自動ログアウトの確認用） */
export async function simulateKickThisDevice() {
  await registerThisDevice();
  const currentId = useDeviceStore.getState().currentDeviceId;
  const hasOther = useDeviceStore.getState().sessions.some((row) => row.device_id !== currentId);
  if (!hasOther) {
    useDeviceStore.getState().claimLocal({
      device_id: `sim_keep_${Date.now().toString(36)}`,
      device_name: "残る端末（シミュレーション）",
      platform: "ios",
    });
  }
  if (currentId) {
    const sessions = useDeviceStore.getState().sessions.map((row) =>
      row.device_id === currentId
        ? { ...row, last_seen_at: "2000-01-01T00:00:00.000Z" }
        : row,
    );
    useDeviceStore.getState().setSessions(sessions);
  }
  useDeviceStore.getState().claimLocal({
    device_id: `sim_new_${Date.now().toString(36)}`,
    device_name: "新しい端末（シミュレーション）",
    platform: "android",
  });
  const stillHere = useDeviceStore.getState().heartbeatLocal();
  if (!stillHere) await handleRevoked();
  return stillHere;
}

let revoking = false;

function readErrorField(error: unknown, key: "code" | "message") {
  if (!error || typeof error !== "object" || !(key in error)) return "";
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function isClockSkewAuthError(error: unknown) {
  const code = readErrorField(error, "code");
  const message = `${readErrorField(error, "message")} ${error instanceof Error ? error.message : ""}`;
  return code === "PGRST303" || /jwt issued at future/i.test(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function registerThisDeviceWithRetry() {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await registerThisDevice();
    } catch (error) {
      lastError = error;
      if (!isClockSkewAuthError(error) || attempt === 3) throw error;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function handleRevoked() {
  if (revoking) return;
  revoking = true;
  try {
    Alert.alert(
      "別の端末でログインされました",
      "同時に使える端末は2台までです。この端末のセッションは無効になったためサインアウトします。",
    );
    await signOut();
  } finally {
    revoking = false;
  }
}

export function startDeviceSessionWatch(onRevoked: () => void) {
  let cancelled = false;
  let established = false;
  let detachFetch = () => {};
  const userId = useAuthStore.getState().userId;

  function attachInterceptor() {
    detachFetch();
    detachFetch = installSessionFetchInterceptor({
      check: async () => {
        if (!established) return true;
        return heartbeatThisDevice();
      },
      onRevoked: () => {
        if (established && !cancelled) onRevoked();
      },
    });
  }

  async function ensureRegistered() {
    if (established) return true;
    await registerThisDeviceWithRetry();
    if (cancelled) return false;
    established = true;
    attachInterceptor();
    return true;
  }

  async function tick() {
    if (cancelled) return;
    try {
      if (!established) {
        await ensureRegistered();
        return;
      }
      const ok = await heartbeatThisDevice();
      if (!ok && !cancelled && established) onRevoked();
    } catch (error) {
      if (!established) console.warn("[session] registerThisDevice", error);
    }
  }

  void tick();

  const interval = setInterval(() => void tick(), 20_000);
  const appState = AppState.addEventListener("change", (state) => {
    if (state === "active") void tick();
  });

  let realtimeUnsubscribe = () => {};
  if (shouldUseRemote(userId) && userId) {
    const channel = supabase
      .channel(`device-sessions-${userId}`)
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "device_sessions", filter: `parent_id=eq.${userId}` },
        (payload) => {
          if (!established || cancelled) return;
          const removed = (payload.old as { device_id?: string } | null)?.device_id;
          const currentId = useDeviceStore.getState().currentDeviceId;
          if (removed && removed === currentId) onRevoked();
        },
      )
      .subscribe();
    realtimeUnsubscribe = () => {
      void supabase.removeChannel(channel);
    };
  }

  return () => {
    cancelled = true;
    clearInterval(interval);
    appState.remove();
    detachFetch();
    realtimeUnsubscribe();
  };
}
