import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GradeMarkPreview } from "@/src/components/GradeMark";
import { defaultMarkStyle, type MarkStyle } from "@/src/features/prefs/mark-style";
import { detectDeviceLocale, useAppLocale, useT } from "@/src/i18n";
import { href, replace } from "@/src/lib/nav/href";
import { useAuth } from "@/src/hooks/useAuth";
import { usePrefsStore, type AppLocale } from "@/src/stores/prefsStore";

function ChoiceRow({
  selected,
  label,
  onPress,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      className={`mt-3 rounded-2xl px-4 py-4 ${selected ? "bg-maru-500" : "bg-white"}`}
      onPress={onPress}
    >
      <Text className={`text-center text-lg font-semibold ${selected ? "text-white" : "text-ink"}`}>{label}</Text>
    </Pressable>
  );
}

export default function OnboardingScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { signedIn } = useAuth();
  const onboardingDone = usePrefsStore((state) => state.onboardingDone);
  const storedLocale = usePrefsStore((state) => state.locale);
  const storedMarkStyle = usePrefsStore((state) => state.markStyle);
  const locale = useAppLocale();
  const [step, setStep] = useState<"language" | "marks">("language");
  const [markStyle, setMarkStyle] = useState<MarkStyle>(
    () => storedMarkStyle ?? defaultMarkStyle(storedLocale ?? detectDeviceLocale()),
  );

  if (onboardingDone) {
    return <Redirect href={href(signedIn ? "/(app)" : "/(auth)/login")} />;
  }

  function chooseLocale(next: AppLocale) {
    usePrefsStore.getState().setLocale(next);
    if (!usePrefsStore.getState().markStyle) {
      const nextMark = defaultMarkStyle(next);
      setMarkStyle(nextMark);
    }
  }

  function chooseMark(next: MarkStyle) {
    setMarkStyle(next);
    usePrefsStore.getState().setMarkStyle(next);
  }

  function finish() {
    usePrefsStore.getState().completeOnboarding(locale, markStyle);
    replace(signedIn ? "/(app)" : "/(auth)/login");
  }

  return (
    <View className="flex-1 bg-cream px-5" style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }}>
      {step === "language" ? (
        <>
          <Text className="text-2xl font-bold text-ink">{t("onboarding.languageTitle")}</Text>
          <Text className="mt-2 text-ink/70">{t("onboarding.languageSubtitle")}</Text>
          <ChoiceRow selected={locale === "ja"} label={t("settings.languageJa")} onPress={() => chooseLocale("ja")} />
          <ChoiceRow selected={locale === "en"} label={t("settings.languageEn")} onPress={() => chooseLocale("en")} />
          <Pressable className="mt-8 rounded-2xl bg-maru-500 px-4 py-4" onPress={() => setStep("marks")}>
            <Text className="text-center font-bold text-white">{t("common.next")}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text className="text-2xl font-bold text-ink">{t("onboarding.markTitle")}</Text>
          <Text className="mt-2 text-ink/70">{t("onboarding.markHint")}</Text>
          <ChoiceRow
            selected={markStyle === "jp"}
            label={t("settings.markStyleJp")}
            onPress={() => chooseMark("jp")}
          />
          <GradeMarkPreview style="jp" />
          <ChoiceRow
            selected={markStyle === "global"}
            label={t("settings.markStyleGlobal")}
            onPress={() => chooseMark("global")}
          />
          <GradeMarkPreview style="global" />
          <Pressable className="mt-8 rounded-2xl bg-maru-500 px-4 py-4" onPress={finish}>
            <Text className="text-center font-bold text-white">{t("onboarding.start")}</Text>
          </Pressable>
          <Pressable className="mt-3 rounded-2xl bg-white px-4 py-4" onPress={() => setStep("language")}>
            <Text className="text-center font-semibold text-ink">{t("common.back")}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
