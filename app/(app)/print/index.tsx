import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Link } from "expo-router";
import { href, push } from "@/src/lib/nav/href";
import { ChildSwitcher } from "@/src/components/ChildSwitcher";
import { ChildScoped } from "@/src/components/ChildScoped";
import { ScreenBackButton } from "@/src/components/ScreenBackButton";
import { createAndSharePrint, printDirect, generatePrintPdf } from "@/src/features/print/service";
import { PrintScopeToggle } from "@/src/features/print/PrintScopeToggle";
import { usePrintDocument } from "@/src/features/print/usePrintDocument";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";
import { useEnsureDemoChild } from "@/src/hooks/useEnsureDemoChild";
import { maruLog } from "@/src/lib/debug/maruLog";
import { useT } from "@/src/i18n";

export default function PrintScreen() {
  return (
    <ChildScoped>
      <PrintBody />
    </ChildScoped>
  );
}

function PrintBody() {
  useEnsureDemoChild();
  const t = useT();
  const { currentChild } = useCurrentChild();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const input = usePrintDocument();

  async function run(action: "share" | "print") {
    if (busy) return;
    if (input.problems.length === 0) {
      Alert.alert(t("print.emptyAlertTitle"), t("print.emptyAlertBody"));
      return;
    }
    if (!input.imagesReady) {
      Alert.alert(t("print.emptyAlertTitle"), t("print.creatingPdf"));
      return;
    }
    setBusy(true);
    setBusyLabel(action === "share" ? t("print.creatingPdf") : t("print.openingPrint"));
    setMessage(null);
    maruLog("print", `${action} tap`, { count: input.problems.length });
    try {
      if (action === "share") {
        await createAndSharePrint({
          ...input,
          parentId: currentChild?.parent_id ?? "mock-parent-1",
          childId: currentChild?.id ?? "mock-child-1",
        });
        setMessage(Platform.OS === "web" ? t("print.browserOpened") : t("print.shared"));
      } else {
        const generated = await generatePrintPdf(input);
        await printDirect(generated.html);
        setMessage(t("print.dialogOpened"));
      }
    } catch (error) {
      maruLog("print", `${action} fail`, error);
      const text = error instanceof Error ? error.message : t("print.failed");
      setMessage(text);
      Alert.alert(t("print.cannotMakePdf"), text);
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }

  return (
    <ScrollView className="flex-1 bg-cream px-5 pt-3">
      <ScreenBackButton fallbackHref="/(app)/review" />
      <Text className="mt-1 text-2xl font-bold text-ink">{t("print.title")}</Text>
      <Text className="mt-2 text-ink/70">{t("print.subtitle")}</Text>
      <View className="mt-4">
        <ChildSwitcher />
      </View>
      <PrintScopeToggle />

      {input.problems.length === 0 ? (
        <Text className="mt-5 rounded-xl bg-white px-4 py-3 text-sm text-ink/70">{t("print.empty")}</Text>
      ) : (
        <Text className="mt-5 text-sm text-ink/70">{t("print.selectedCount", { count: input.problems.length })}</Text>
      )}

      <Pressable
        disabled={busy}
        className="mt-5 rounded-xl bg-maru-500 px-4 py-3"
        onPress={() => push("/(app)/print/preview")}
      >
        <Text className="text-center font-semibold text-white">{t("print.openPreview")}</Text>
      </Pressable>
      <Pressable
        disabled={busy || (input.problems.length > 0 && !input.imagesReady)}
        className="mt-3 rounded-xl bg-ink px-4 py-3"
        onPress={() => void run("share")}
      >
        <Text className="text-center font-semibold text-white">{t("print.sharePdf")}</Text>
      </Pressable>
      <Pressable
        disabled={busy || (input.problems.length > 0 && !input.imagesReady)}
        className="mt-3 rounded-xl bg-white px-4 py-3"
        onPress={() => void run("print")}
      >
        <Text className="text-center font-semibold text-ink">{t("print.sendPrinter")}</Text>
      </Pressable>

      {busy ? (
        <View className="mt-4 flex-row items-center">
          <ActivityIndicator color="#C44738" />
          <Text className="ml-2 text-sm text-ink/80">{busyLabel}</Text>
        </View>
      ) : null}
      {message ? <Text className="mt-4 text-sm text-ink/80">{message}</Text> : null}

      <Link href={href("/(app)/review")} className="mt-6 mb-10">
        <Text className="text-maru-600">{t("print.toReview")}</Text>
      </Link>
    </ScrollView>
  );
}
