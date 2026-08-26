import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/src/hooks/useAuth";
import { signOut } from "@/src/features/auth/service";
import { deleteOwnAccount } from "@/src/features/auth/deleteAccount";
import { LEGAL_DOCS } from "@/src/constants/legal";
import { useQuota } from "@/src/hooks/useQuota";
import { PlanPreviewSwitcher } from "@/src/components/PlanPreviewSwitcher";

export default function SettingsScreen() {
  const { email, displayName, mocked, isAnonymous } = useAuth();
  const quota = useQuota();

  function onLogout() {
    Alert.alert("ログアウトしますか？", undefined, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "ログアウト",
        style: "destructive",
        onPress: () => {
          void signOut().then(() => router.replace("/(auth)/login"));
        },
      },
    ]);
  }

  function onDelete() {
    Alert.alert(
      "アカウントを削除します",
      "子ども・スキャン・カルテ・復習履歴を含むすべてのデータが消去され、元に戻せません。",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "完全に削除する",
          style: "destructive",
          onPress: () => {
            Alert.alert("最終確認", "本当に削除してよろしいですか？", [
              { text: "戻る", style: "cancel" },
              {
                text: "削除する",
                style: "destructive",
                onPress: () => {
                  void deleteOwnAccount()
                    .then(() => router.replace("/(auth)/login"))
                    .catch((error) =>
                      Alert.alert("削除できません", error instanceof Error ? error.message : ""),
                    );
                },
              },
            ]);
          },
        },
      ],
    );
  }

  return (
    <ScrollView className="flex-1 bg-cream px-5 pt-5">
      <Text className="text-2xl font-bold text-ink">設定</Text>
      <Text className="mt-2 text-ink/70">
        {displayName || email || "保護者"}
        {isAnonymous ? "（ゲスト）" : ""}
        {mocked ? " ・モック" : ""}
      </Text>
      <Text className="mt-1 text-sm text-ink/50">
        {quota.previewTier ? "テスト・" : ""}
        {quota.label}　残 {quota.remaining}枚
      </Text>
      <PlanPreviewSwitcher />

      <Pressable className="mt-6 rounded-2xl bg-white px-4 py-4" onPress={() => router.push("/(app)/settings/billing")}>
        <Text className="text-lg font-bold text-ink">料金プラン・追加チケット</Text>
        <Text className="mt-1 text-sm text-ink/60">月額/年額、購入の復元</Text>
      </Pressable>
      <Pressable className="mt-3 rounded-2xl bg-white px-4 py-4" onPress={() => router.push("/(app)/settings/devices")}>
        <Text className="text-lg font-bold text-ink">ログイン端末</Text>
        <Text className="mt-1 text-sm text-ink/60">同時ログインは最大2台</Text>
      </Pressable>
      <Pressable className="mt-3 rounded-2xl bg-white px-4 py-4" onPress={() => router.push("/(app)/children")}>
        <Text className="text-lg font-bold text-ink">子ども管理</Text>
        <Text className="mt-1 text-sm text-ink/60">追加・編集・切り替え</Text>
      </Pressable>

      <Text className="mt-8 font-bold text-ink">ストア審査用の表記</Text>
      {Object.entries(LEGAL_DOCS).map(([id, doc]) => (
        <Pressable
          key={id}
          className="mt-3 rounded-2xl bg-white px-4 py-4"
          onPress={() => router.push(`/(app)/settings/legal/${id}`)}
        >
          <Text className="text-ink">{doc.title}</Text>
        </Pressable>
      ))}

      <Pressable className="mt-8 rounded-2xl bg-white px-4 py-4" onPress={onLogout}>
        <Text className="text-center font-bold text-ink">ログアウト</Text>
      </Pressable>
      <Pressable className="mb-10 mt-3 rounded-2xl bg-white px-4 py-4" onPress={onDelete}>
        <Text className="text-center font-bold text-maru-600">アカウントを削除</Text>
      </Pressable>
    </ScrollView>
  );
}
