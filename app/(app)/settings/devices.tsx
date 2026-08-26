import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { shouldUseRemote } from "@/src/lib/backend";
import {
  fetchDeviceSessions,
  revokeDevice,
  simulateKickThisDevice,
  simulateThirdDeviceLogin,
} from "@/src/features/session/service";
import { useDeviceStore } from "@/src/stores/deviceStore";

export default function DevicesScreen() {
  const sessions = useDeviceStore((state) => state.sessions);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchDeviceSessions();
  }, []);

  function confirmRevoke(deviceId: string, name: string | null, isCurrent: boolean) {
    Alert.alert(
      isCurrent ? "この端末からログアウトします" : "端末を解除します",
      name ?? deviceId,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "解除",
          style: "destructive",
          onPress: () => {
            setBusy(true);
            void revokeDevice(deviceId)
              .catch((error) => Alert.alert("解除できません", error instanceof Error ? error.message : ""))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }

  return (
    <ScrollView className="flex-1 bg-cream px-5 pt-5">
      <Text className="text-2xl font-bold text-ink">ログイン端末</Text>
      <Text className="mt-2 text-ink/70">同時ログインは最大2台です。3台目で入ると、使っていない端末が自動で外れます。</Text>

      {sessions.map((session) => (
        <View key={session.device_id} className="mt-3 rounded-2xl bg-white px-4 py-4">
          <Text className="font-bold text-ink">
            {session.device_name ?? session.device_id}
            {session.isCurrent ? "（この端末）" : ""}
          </Text>
          <Text className="mt-1 text-xs text-ink/50">
            {session.platform} · 最終 {new Date(session.last_seen_at).toLocaleString("ja-JP")}
          </Text>
          <Pressable
            className="mt-3 self-start rounded-full bg-cream px-3 py-1"
            disabled={busy}
            onPress={() => confirmRevoke(session.device_id, session.device_name, session.isCurrent)}
          >
            <Text className="text-sm text-maru-600">解除</Text>
          </Pressable>
        </View>
      ))}

      {!shouldUseRemote() ? (
        <>
          <Pressable
            className="mt-6 rounded-2xl bg-white px-4 py-4"
            onPress={() => {
              void simulateThirdDeviceLogin().then((stillHere) => {
                if (stillHere) {
                  Alert.alert("3台目を追加しました", "この端末は残っています。最古の擬似端末が外れました。");
                }
              });
            }}
          >
            <Text className="text-center font-bold text-ink">3台目ログインをシミュレート</Text>
            <Text className="mt-1 text-center text-xs text-ink/60">最古の端末が失効します（この端末は残る）</Text>
          </Pressable>
          <Pressable
            className="mt-3 mb-10 rounded-2xl bg-white px-4 py-4"
            onPress={() => {
              void simulateKickThisDevice();
            }}
          >
            <Text className="text-center font-bold text-maru-600">この端末の失効をシミュレート</Text>
            <Text className="mt-1 text-center text-xs text-ink/60">アラートのあと自動ログアウトします</Text>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}
