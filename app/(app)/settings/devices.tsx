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
import { useAppLocale, useT } from "@/src/i18n";

export default function DevicesScreen() {
  const t = useT();
  const locale = useAppLocale();
  const sessions = useDeviceStore((state) => state.sessions);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchDeviceSessions();
  }, []);

  function confirmRevoke(deviceId: string, name: string | null, isCurrent: boolean) {
    Alert.alert(isCurrent ? t("devices.logoutThis") : t("devices.revokeDevice"), name ?? deviceId, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("devices.revoke"),
        style: "destructive",
        onPress: () => {
          setBusy(true);
          void revokeDevice(deviceId)
            .catch((error) => Alert.alert(t("devices.cannotRevoke"), error instanceof Error ? error.message : ""))
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-cream px-5 pt-5">
      <Text className="text-2xl font-bold text-ink">{t("devices.title")}</Text>
      <Text className="mt-2 text-ink/70">{t("devices.subtitle")}</Text>

      {sessions.map((session) => (
        <View key={session.device_id} className="mt-3 rounded-2xl bg-white px-4 py-4">
          <Text className="font-bold text-ink">
            {session.device_name ?? session.device_id}
            {session.isCurrent ? t("devices.thisDevice") : ""}
          </Text>
          <Text className="mt-1 text-xs text-ink/50">
            {t("devices.lastSeen", {
              platform: session.platform,
              time: new Date(session.last_seen_at).toLocaleString(locale === "ja" ? "ja-JP" : "en-US"),
            })}
          </Text>
          <Pressable
            className="mt-3 self-start rounded-full bg-cream px-3 py-1"
            disabled={busy}
            onPress={() => confirmRevoke(session.device_id, session.device_name, session.isCurrent)}
          >
            <Text className="text-sm text-maru-600">{t("devices.revoke")}</Text>
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
                  Alert.alert(t("devices.simThirdDone"), t("devices.simThirdBody"));
                }
              });
            }}
          >
            <Text className="text-center font-bold text-ink">{t("devices.simThird")}</Text>
            <Text className="mt-1 text-center text-xs text-ink/60">{t("devices.simThirdHint")}</Text>
          </Pressable>
          <Pressable
            className="mt-3 mb-10 rounded-2xl bg-white px-4 py-4"
            onPress={() => {
              void simulateKickThisDevice();
            }}
          >
            <Text className="text-center font-bold text-maru-600">{t("devices.simKick")}</Text>
            <Text className="mt-1 text-center text-xs text-ink/60">{t("devices.simKickHint")}</Text>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}
