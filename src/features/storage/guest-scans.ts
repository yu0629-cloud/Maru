import AsyncStorage from "@react-native-async-storage/async-storage";
import { pruneGuestScanRecords, GUEST_RETENTION } from "@/src/features/storage/lib/guest-local.mjs";
import { useAuthStore } from "@/src/stores/authStore";
import { useScanStore, type ScanRecord } from "@/src/stores/scanStore";
import type { GradedProblemView } from "@/src/features/grading/corrections";

export { GUEST_RETENTION, pruneGuestScanRecords };

const GUEST_ID_KEY = "maru.guest.id";
const GUEST_SCANS_KEY = "maru.guest.scans.v1";

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeStore: (() => void) | null = null;
let hydrating: Promise<void> | null = null;

/** 端末に残すゲスト識別子。リロード後も同一ゲストとして再利用する */
export async function getOrCreateGuestLocalId(): Promise<string> {
  const existing = String((await AsyncStorage.getItem(GUEST_ID_KEY)) ?? "").trim();
  if (existing) return existing;
  const next = `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(GUEST_ID_KEY, next);
  return next;
}

export async function peekGuestLocalId(): Promise<string | null> {
  const existing = String((await AsyncStorage.getItem(GUEST_ID_KEY)) ?? "").trim();
  return existing || null;
}

export async function rememberGuestLocalId(userId: string): Promise<void> {
  const id = String(userId ?? "").trim();
  if (!id) return;
  await AsyncStorage.setItem(GUEST_ID_KEY, id);
}

function slimProblem(problem: GradedProblemView): GradedProblemView {
  return {
    ...problem,
    imageSrc: "",
    figureImageSrc: undefined,
    figureBase64: undefined,
    subFigureBase64: undefined,
  };
}

function slimScan(scan: ScanRecord): ScanRecord {
  return {
    ...scan,
    problems: (scan.problems ?? []).map(slimProblem),
  };
}

function parseStoredScans(raw: string | null): ScanRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row) => row && typeof row === "object" && typeof (row as ScanRecord).id === "string",
    ) as ScanRecord[];
  } catch {
    return [];
  }
}

export async function loadGuestScansFromStorage(now = new Date().toISOString()): Promise<ScanRecord[]> {
  const raw = await AsyncStorage.getItem(GUEST_SCANS_KEY);
  const parsed = parseStoredScans(raw);
  const pruned = pruneGuestScanRecords(parsed, { now }) as {
    kept: ScanRecord[];
    removed: ScanRecord[];
  };
  if (pruned.removed.length > 0) {
    await AsyncStorage.setItem(GUEST_SCANS_KEY, JSON.stringify(pruned.kept.map(slimScan)));
  }
  return pruned.kept;
}

export async function persistGuestScans(now = new Date().toISOString()): Promise<void> {
  if (!useAuthStore.getState().isAnonymous) return;
  const all = Object.values(useScanStore.getState().scans);
  const pruned = pruneGuestScanRecords(all, { now }) as {
    kept: ScanRecord[];
    removed: ScanRecord[];
  };
  if (pruned.removed.length > 0) {
    const store = useScanStore.getState();
    for (const scan of pruned.removed) {
      store.remove(String(scan.id));
    }
  }
  await AsyncStorage.setItem(GUEST_SCANS_KEY, JSON.stringify(pruned.kept.map(slimScan)));
}

export async function hydrateGuestScans(now = new Date().toISOString()): Promise<void> {
  if (!useAuthStore.getState().isAnonymous) return;
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const kept = await loadGuestScansFromStorage(now);
      const store = useScanStore.getState();
      for (const scan of kept) {
        store.upsert({
          ...scan,
          createdAt: scan.createdAt ?? now,
        });
      }
      await persistGuestScans(now);
    } finally {
      hydrating = null;
    }
  })();
  return hydrating;
}

export function schedulePersistGuestScans(): void {
  if (!useAuthStore.getState().isAnonymous) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistGuestScans().catch((error) => {
      console.warn("[guest-scans] persist", error);
    });
  }, 300);
}

/** ゲスト中は scanStore 変更を AsyncStorage へ自動保存 */
export function startGuestScanPersistence(): () => void {
  if (unsubscribeStore) {
    return () => {
      unsubscribeStore?.();
      unsubscribeStore = null;
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
    };
  }
  unsubscribeStore = useScanStore.subscribe(() => {
    schedulePersistGuestScans();
  });
  return () => {
    unsubscribeStore?.();
    unsubscribeStore = null;
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
  };
}

export async function clearGuestScansStorage(): Promise<void> {
  await AsyncStorage.removeItem(GUEST_SCANS_KEY);
}
