import { ActivityIndicator, AppState, NativeModules, Platform, View } from "react-native";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { requireOptionalNativeModule } from "expo-modules-core";
import { I18n } from "i18n-js";
import { normalizeSubject } from "@/src/features/scans/subject";
import { usePrefsStore } from "@/src/stores/prefsStore";
import { resolveAppLocale } from "./locale.mjs";
import en from "../../locales/en.json";
import ja from "../../locales/ja.json";

export type AppLocale = "ja" | "en";
export { resolveAppLocale };

type TranslateOptions = Record<string, string | number | boolean | null | undefined>;

const translations = { ja, en } as const;

const i18n = new I18n(translations);
i18n.enableFallback = true;
i18n.defaultLocale = "en";
i18n.missingBehavior = "guess";

function localeCandidate(locale: { languageCode?: string | null; languageTag?: string | null } | undefined) {
  const languageCode = String(locale?.languageCode ?? "").trim();
  const languageTag = String(locale?.languageTag ?? "").trim();
  return languageCode || languageTag || null;
}

function intlLocale(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || null;
  } catch {
    return null;
  }
}

function nativeLocales(): Array<{ languageCode?: string | null; languageTag?: string | null }> {
  try {
    const ExpoLocalization = requireOptionalNativeModule<{
      getLocales?: () => Array<{ languageCode?: string | null; languageTag?: string | null }>;
    }>("ExpoLocalization");
    const locales = ExpoLocalization?.getLocales?.();
    if (locales?.length) return locales;
  } catch {
    // 開発ビルドに expo-localization が未リンクでも起動を止めない
  }

  try {
    if (Platform.OS === "ios") {
      const settings = NativeModules.SettingsManager?.settings as
        | { AppleLocale?: string; AppleLanguages?: string[] }
        | undefined;
      const tag = settings?.AppleLocale || settings?.AppleLanguages?.[0];
      if (tag) {
        return [{ languageTag: String(tag), languageCode: String(tag).split(/[-_]/)[0] }];
      }
    }
    if (Platform.OS === "android") {
      const tag = NativeModules.I18nManager?.localeIdentifier as string | undefined;
      if (tag) {
        return [{ languageTag: String(tag), languageCode: String(tag).split(/[-_]/)[0] }];
      }
    }
  } catch {
    // SettingsManager が無い環境では Intl に落とす
  }

  return [];
}

export function detectDeviceLocale(): AppLocale {
  try {
    const fromNative = localeCandidate(nativeLocales()[0]);
    if (fromNative) return resolveAppLocale(fromNative);
  } catch {
    // expo-localization が未リンクの開発ビルドでも起動を止めない
  }
  return resolveAppLocale(intlLocale());
}

export function setAppLocale(locale: AppLocale) {
  i18n.locale = locale;
}

setAppLocale(detectDeviceLocale());

export function t(key: string, options?: TranslateOptions): string {
  return i18n.t(key, options);
}

export function tSubject(code?: string | null): string {
  return t(`subject.${normalizeSubject(code) ?? "other"}`);
}

export function tSubjectBadge(code?: string | null): string {
  return t(`subjectBadge.${normalizeSubject(code) ?? "other"}`);
}

export function tGrade(code?: string | null): string {
  if (!code) return "";
  const key = `grade.${code}`;
  const value = t(key);
  return value === key ? code : value;
}

export function tPlan(tier?: string | null): string {
  const key = `plan.${tier ?? "free"}`;
  const value = t(key);
  return value === key ? String(tier ?? "") : value;
}

export function tMistake(type?: string | null): string {
  const key = `scan.mistake.${type ?? "none"}`;
  const value = t(key);
  return value === key ? t("scan.mistake.none") : value;
}

const LocaleContext = createContext<AppLocale>(i18n.locale as AppLocale);

export function I18nProvider({ children }: { children: ReactNode }) {
  const storedLocale = usePrefsStore((state) => state.locale);
  const ready = usePrefsStore((state) => state.ready);
  const [deviceLocale, setDeviceLocale] = useState<AppLocale>(() => detectDeviceLocale());

  useEffect(() => {
    void usePrefsStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (storedLocale) return;
    const applyDeviceLocale = () => setDeviceLocale(detectDeviceLocale());
    applyDeviceLocale();
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      applyDeviceLocale();
    });
    return () => sub.remove();
  }, [storedLocale]);

  const locale = storedLocale ?? deviceLocale;

  useEffect(() => {
    setAppLocale(locale);
  }, [locale]);

  const value = useMemo(() => locale, [locale]);
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F7F4EE", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#C44738" />
      </View>
    );
  }
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useT() {
  useContext(LocaleContext);
  return t;
}

export function useAppLocale(): AppLocale {
  return useContext(LocaleContext);
}
