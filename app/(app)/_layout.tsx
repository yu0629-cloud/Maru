import { useAuth } from "@/src/hooks/useAuth";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { AccountRuntime } from "@/src/features/session/AccountRuntime";
import { TabBarIcon, type TabBarIconName } from "@/src/components/TabBarIcon";
import { ScreenBackButton } from "@/src/components/ScreenBackButton";

const TAB_ICONS: Record<string, TabBarIconName> = {
  index: "home",
  "camera/index": "camera",
  "review/index": "review",
  "carte/index": "carte",
  "settings/index": "settings",
};

export default function AppLayout() {
  const { ready, signedIn } = useAuth();

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator color="#C44738" />
      </View>
    );
  }

  if (!signedIn) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <AccountRuntime>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: true,
          tabBarActiveTintColor: "#C44738",
          tabBarInactiveTintColor: "#6B7280",
          tabBarIcon: ({ color, size, focused }) => {
            const name = TAB_ICONS[route.name];
            if (!name) return null;
            return <TabBarIcon name={name} color={color} size={size} focused={focused} />;
          },
        })}
      >
        <Tabs.Screen name="index" options={{ title: "ホーム" }} />
        <Tabs.Screen
          name="camera/index"
          options={{ title: "撮影", unmountOnBlur: true, freezeOnBlur: true }}
        />
        <Tabs.Screen name="review/index" options={{ title: "復習" }} />
        <Tabs.Screen name="carte/index" options={{ title: "カルテ" }} />
        <Tabs.Screen name="settings/index" options={{ title: "設定" }} />
        <Tabs.Screen name="scan/batch" options={{ href: null, title: "一括確認" }} />
        <Tabs.Screen name="scan/[id]" options={{ href: null }} />
        <Tabs.Screen
          name="print/index"
          options={{
            href: null,
            title: "印刷",
            headerLeft: () => <ScreenBackButton fallbackHref="/(app)/review" />,
          }}
        />
        <Tabs.Screen
          name="print/preview"
          options={{
            href: null,
            title: "プレビュー",
            headerLeft: () => <ScreenBackButton fallbackHref="/(app)/print" />,
          }}
        />
        <Tabs.Screen name="children/index" options={{ href: null, title: "子ども" }} />
        <Tabs.Screen name="settings/billing" options={{ href: null, title: "料金プラン" }} />
        <Tabs.Screen name="settings/devices" options={{ href: null, title: "ログイン端末" }} />
        <Tabs.Screen name="settings/legal/[doc]" options={{ href: null, title: "表記" }} />
      </Tabs>
    </AccountRuntime>
  );
}
