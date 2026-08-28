import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { defaultMarkStyle, isMarkStyle, type MarkStyle } from "@/src/features/prefs/mark-style";
import { resolveAppLocale } from "@/src/i18n/locale.mjs";

export type AppLocale = "ja" | "en";
export type { MarkStyle };

const STORAGE_KEY = "maru.prefs.v1";

type PrefsState = {
  ready: boolean;
  locale: AppLocale | null;
  markStyle: MarkStyle | null;
  onboardingDone: boolean;
  hydrate: () => Promise<void>;
  setLocale: (locale: AppLocale) => void;
  setMarkStyle: (style: MarkStyle) => void;
  completeOnboarding: (locale: AppLocale, markStyle: MarkStyle) => void;
};

function isLocale(value: unknown): value is AppLocale {
  return value === "ja" || value === "en";
}

async function persist(state: Pick<PrefsState, "locale" | "markStyle" | "onboardingDone">) {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      locale: state.locale,
      markStyle: state.markStyle,
      onboardingDone: state.onboardingDone,
    }),
  );
}

let hydrating: Promise<void> | null = null;

export const usePrefsStore = create<PrefsState>((set, get) => ({
  ready: false,
  locale: null,
  markStyle: null,
  onboardingDone: false,
  hydrate: async () => {
    if (get().ready) return;
    if (hydrating) return hydrating;
    hydrating = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            locale?: unknown;
            markStyle?: unknown;
            onboardingDone?: unknown;
          };
          set({
            locale: isLocale(parsed.locale) ? parsed.locale : null,
            markStyle: isMarkStyle(parsed.markStyle) ? parsed.markStyle : null,
            onboardingDone: parsed.onboardingDone === true,
            ready: true,
          });
          return;
        }
      } catch {
        // keep defaults
      } finally {
        hydrating = null;
      }
      set({ ready: true });
    })();
    return hydrating;
  },
  setLocale: (locale) => {
    const current = get();
    set({ locale });
    void persist({ locale, markStyle: current.markStyle, onboardingDone: current.onboardingDone });
  },
  setMarkStyle: (markStyle) => {
    const current = get();
    set({ markStyle });
    void persist({ locale: current.locale, markStyle, onboardingDone: current.onboardingDone });
  },
  completeOnboarding: (locale, markStyle) => {
    const next = { locale, markStyle, onboardingDone: true };
    set({ ...next, ready: true });
    void persist(next);
  },
}));

export function resolvedLocale(state: Pick<PrefsState, "locale">, deviceLocale?: string | null): AppLocale {
  return state.locale ?? resolveAppLocale(deviceLocale);
}

export function resolvedMarkStyle(
  state: Pick<PrefsState, "locale" | "markStyle">,
  deviceLocale?: string | null,
): MarkStyle {
  return state.markStyle ?? defaultMarkStyle(resolvedLocale(state, deviceLocale));
}
