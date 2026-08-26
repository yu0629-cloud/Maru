import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { ChildSwitcher } from "@/src/components/ChildSwitcher";
import { ChildScoped } from "@/src/components/ChildScoped";
import { ScreenBackButton } from "@/src/components/ScreenBackButton";
import { createAndSharePrint, printDirect, generatePrintPdf } from "@/src/features/print/service";
import { usePrintDocument } from "@/src/features/print/usePrintDocument";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";
import { useEnsureDemoChild } from "@/src/hooks/useEnsureDemoChild";

export default function PrintScreen() {
  return (
    <ChildScoped>
      <PrintBody />
    </ChildScoped>
  );
}

function PrintBody() {
  useEnsureDemoChild();
  const { currentChild } = useCurrentChild();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = usePrintDocument();

  async function run(action: "share" | "print") {
    setBusy(true);
    setMessage(null);
    try {
      if (action === "share") {
        await createAndSharePrint({
          ...input,
          parentId: currentChild?.parent_id ?? "mock-parent-1",
          childId: currentChild?.id ?? "mock-child-1",
        });
        setMessage(Platform.OS === "web" ? "ブラウザの印刷ダイアログを開きました。" : "PDFを共有シートに渡しました。");
      } else {
        const generated = await generatePrintPdf(input);
        await printDirect(generated.html);
        setMessage("印刷ダイアログを開きました。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "印刷に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-cream px-5 pt-3">
      <ScreenBackButton fallbackHref="/(app)/review" />
      <Text className="mt-1 text-2xl font-bold text-ink">A4まとめプリント</Text>
      <Text className="mt-2 text-ink/70">
        間違えた問題を元画像から切り抜き、解答欄を白くして印刷します。解答と声かけはカルテ・復習画面で確認できます。
      </Text>
      <View className="mt-4">
        <ChildSwitcher />
      </View>

      <Pressable
        disabled={busy}
        className="mt-5 rounded-xl bg-maru-500 px-4 py-3"
        onPress={() => router.push("/(app)/print/preview")}
      >
        <Text className="text-center font-semibold text-white">A4プレビューを開く</Text>
      </Pressable>
      <Pressable disabled={busy} className="mt-3 rounded-xl bg-ink px-4 py-3" onPress={() => void run("share")}>
        <Text className="text-center font-semibold text-white">PDFを作って共有（netprint等）</Text>
      </Pressable>
      <Pressable disabled={busy} className="mt-3 rounded-xl bg-white px-4 py-3" onPress={() => void run("print")}>
        <Text className="text-center font-semibold text-ink">AirPrint / プリンタへ送る</Text>
      </Pressable>

      {message ? <Text className="mt-4 text-sm text-ink/80">{message}</Text> : null}

      <Link href="/(app)/review" className="mt-6 mb-10">
        <Text className="text-maru-600">今日の復習キューへ</Text>
      </Link>
    </ScrollView>
  );
}
