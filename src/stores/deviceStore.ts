import { create } from "zustand";
import type { DeviceSessionView } from "@/src/features/session/claim";
import {
  heartbeatDeviceSession,
  registerDeviceSession,
  type DeviceSessionRow,
} from "@/src/features/session/devices";

type DeviceState = {
  currentDeviceId: string | null;
  sessions: DeviceSessionView[];
  setCurrentDeviceId: (id: string) => void;
  setSessions: (sessions: DeviceSessionView[]) => void;
  claimLocal: (incoming: {
    device_id: string;
    device_name: string | null;
    platform: string | null;
  }) => { evictedId: string | null; revoked: boolean };
  heartbeatLocal: () => boolean;
  revokeLocal: (deviceId: string) => boolean;
};

function toView(
  row: {
    device_id: string;
    last_seen_at: string;
    device_name?: string | null;
    platform?: string | null;
  },
  currentDeviceId: string | null,
): DeviceSessionView {
  return {
    id: row.device_id,
    parent_id: "mock-parent-1",
    device_id: row.device_id,
    device_name: row.device_name ?? null,
    platform: row.platform ?? null,
    last_seen_at: row.last_seen_at,
    created_at: row.last_seen_at,
    isCurrent: row.device_id === currentDeviceId,
  };
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  currentDeviceId: null,
  sessions: [],
  setCurrentDeviceId: (id) =>
    set((state) => ({
      currentDeviceId: id,
      sessions: state.sessions.map((row) => ({ ...row, isCurrent: row.device_id === id })),
    })),
  setSessions: (sessions) => set({ sessions }),
  claimLocal: (incoming) => {
    const now = new Date().toISOString();
    const claimed = registerDeviceSession(
      get().sessions,
      { ...incoming, last_seen_at: now },
    );
    const currentId = get().currentDeviceId;
    set({
      sessions: claimed.sessions.map((row: DeviceSessionRow) => toView(row, currentId)),
    });
    const evictedId = claimed.evicted?.device_id ?? null;
    return { evictedId, revoked: evictedId !== null && evictedId === currentId };
  },
  heartbeatLocal: () => {
    const currentId = get().currentDeviceId;
    if (!currentId) return true;
    const beat = heartbeatDeviceSession(get().sessions, currentId, new Date().toISOString());
    if (!beat.ok) return false;
    set({
      sessions: beat.sessions.map((row: DeviceSessionRow) => toView(row, currentId)),
    });
    return true;
  },
  revokeLocal: (deviceId) => {
    const currentId = get().currentDeviceId;
    const next = get().sessions.filter((row) => row.device_id !== deviceId);
    set({ sessions: next.map((row) => ({ ...row, isCurrent: row.device_id === currentId })) });
    return currentId === deviceId;
  },
}));
