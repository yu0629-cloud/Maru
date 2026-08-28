import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { push, replace } from "@/src/lib/nav/href";
import { useAuth } from "@/src/hooks/useAuth";
import { signOut } from "@/src/features/auth/service";
import { deleteOwnAccount } from "@/src/features/auth/deleteAccount";
import { LEGAL_DOCS } from "@/src/constants/legal";
import { useQuota } from "@/src/hooks/useQuota";
import { DebugResetScanQuotaButton } from "@/src/components/DebugResetScanQuotaButton";
import { GradeMarkPreview } from "@/src/components/GradeMark";
import { PlanPreviewSwitcher } from "@/src/components/PlanPreviewSwitcher";
import { tPlan, useAppLocale, useT } from "@/src/i18n";
import { defaultMarkStyle, type MarkStyle } from "@/src/features/prefs/mark-style";
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
      className={`mt-2 rounded-xl px-4 py-3 ${selected ? "bg-maru-500" : "bg-cream"}`}
      onPress={onPress}
    >
      <Text className={`text-center font-semibold ${selected ? "text-white" : "text-ink"}`}>{label}</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const t = useT();
  const locale = useAppLocale();
  const storedMarkStyle = usePrefsStore((state) => state.markStyle);
  const markStyle = storedMarkStyle ?? defaultMarkStyle(locale);
  const { email, displayName, mocked, isAnonymous } = useAuth();
  const quota = useQuota();

  function onLocale(next: AppLocale) {
    usePrefsStore.getState().setLocale(next);
    if (!usePrefsStore.getState().markStyle) {
      usePrefsStore.getState().setMarkStyle(defaultMarkStyle(next));
    }
  }

  function onMarkStyle(next: MarkStyle) {
    usePrefsStore.getState().setMarkStyle(next);
  }

  function onLogout() {
    Alert.alert(t("settings.logoutConfirm"), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.logout"),
        style: "destructive",
        onPress: () => {
          void signOut().then(() => replace("/(auth)/login"));
        },
      },
    ]);
  }

  function onDelete() {
    Alert.alert(t("settings.deleteTitle"), t("settings.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.deleteForever"),
        style: "destructive",
        onPress: () => {
          Alert.alert(t("settings.finalConfirmTitle"), t("settings.finalConfirmBody"), [
            { text: t("common.back"), style: "cancel" },
            {
              text: t("scan.deleteAction"),
              style: "destructive",
              onPress: () => {
                void deleteOwnAccount()
                  .then(() => replace("/(auth)/login"))
                  .catch((error) =>
                    Alert.alert(t("settings.cannotDelete"), error instanceof Error ? error.message : ""),
                  );
              },
            },
          ]);
        },
      },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-cream px-5 pt-5">
      <Text className="text-2xl font-bold text-ink">{t("settings.title")}</Text>
      <Text className="mt-2 text-ink/70">
        {displayName || email || t("settings.parent")}
        {isAnonymous ? t("settings.guest") : ""}
        {mocked ? t("settings.mockSuffix") : ""}
      </Text>
      <Text className="mt-1 text-sm text-ink/50">
        {t("settings.quotaLine", {
          plan: `${quota.previewTier ? t("quota.testPrefix") : ""}${tPlan(quota.tier)}`,
          remaining: quota.remaining,
        })}
      </Text>
      <PlanPreviewSwitcher />

      <Pressable className="mt-6 rounded-2xl bg-white px-4 py-4" onPress={() => push("/(app)/settings/billing")}>
        <Text className="text-lg font-bold text-ink">{t("settings.billingTitle")}</Text>
        <Text className="mt-1 text-sm text-ink/60">{t("settings.billingHint")}</Text>
      </Pressable>
      <Pressable className="mt-3 rounded-2xl bg-white px-4 py-4" onPress={() => push("/(app)/settings/devices")}>
        <Text className="text-lg font-bold text-ink">{t("settings.devicesTitle")}</Text>
        <Text className="mt-1 text-sm text-ink/60">{t("settings.devicesHint")}</Text>
      </Pressable>
      <Pressable className="mt-3 rounded-2xl bg-white px-4 py-4" onPress={() => push("/(app)/children")}>
        <Text className="text-lg font-bold text-ink">{t("settings.childrenTitle")}</Text>
        <Text className="mt-1 text-sm text-ink/60">{t("settings.childrenHint")}</Text>
      </Pressable>

      <View className="mt-6 rounded-2xl bg-white px-4 py-4">
        <Text className="text-lg font-bold text-ink">{t("settings.languageTitle")}</Text>
        <ChoiceRow selected={locale === "ja"} label={t("settings.languageJa")} onPress={() => onLocale("ja")} />
        <ChoiceRow selected={locale === "en"} label={t("settings.languageEn")} onPress={() => onLocale("en")} />
      </View>

      <View className="mt-3 rounded-2xl bg-white px-4 py-4">
        <Text className="text-lg font-bold text-ink">{t("settings.markStyleTitle")}</Text>
        <Text className="mt-1 text-sm text-ink/60">{t("settings.markStyleHint")}</Text>
        <ChoiceRow
          selected={markStyle === "jp"}
          label={t("settings.markStyleJp")}
          onPress={() => onMarkStyle("jp")}
        />
        {markStyle === "jp" ? <GradeMarkPreview style="jp" size={32} /> : null}
        <ChoiceRow
          selected={markStyle === "global"}
          label={t("settings.markStyleGlobal")}
          onPress={() => onMarkStyle("global")}
        />
        {markStyle === "global" ? <GradeMarkPreview style="global" size={32} /> : null}
      </View>

      <Text className="mt-8 font-bold text-ink">{t("settings.legalTitle")}</Text>
      {Object.entries(LEGAL_DOCS).map(([id, doc]) => (
        <Pressable
          key={id}
          className="mt-3 rounded-2xl bg-white px-4 py-4"
          onPress={() => push(`/(app)/settings/legal/${id}`)}
        >
          <Text className="text-ink">{doc.title}</Text>
        </Pressable>
      ))}

      <Pressable className="mt-8 rounded-2xl bg-white px-4 py-4" onPress={onLogout}>
        <Text className="text-center font-bold text-ink">{t("settings.logout")}</Text>
      </Pressable>
      <Pressable className="mb-10 mt-3 rounded-2xl bg-white px-4 py-4" onPress={onDelete}>
        <Text className="text-center font-bold text-maru-600">{t("settings.deleteAccount")}</Text>
      </Pressable>
      <DebugResetScanQuotaButton />
    </ScrollView>
  );
}
