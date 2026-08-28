import { useMemo, type ComponentProps } from "react";
import { Tabs } from "expo-router";
import { PlatformPressable } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabBarIcon, type TabBarIconName } from "@/src/components/TabBarIcon";
import { useT } from "@/src/i18n";

const TAB_ICONS: Record<string, TabBarIconName> = {
  index: "home",
  "camera/index": "camera",
  "review/index": "review",
  "carte/index": "carte",
  "settings/index": "settings",
};

const TAP_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

function TabBarButton(props: ComponentProps<typeof PlatformPressable>) {
  return <PlatformPressable {...props} hitSlop={TAP_HIT_SLOP} />;
}

export default function TabsLayout() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const tabBarBottom = Math.max(insets.bottom, 8);

  const screenOptions = useMemo(
    () =>
      ({ route }: { route: { name: string } }) => ({
        headerShown: true,
        lazy: true,
        freezeOnBlur: true,
        animationEnabled: false,
        tabBarActiveTintColor: "#C44738",
        tabBarInactiveTintColor: "#6B7280",
        tabBarStyle: {
          backgroundColor: "#F7F4EE",
          borderTopColor: "rgba(15, 23, 42, 0.08)",
          paddingTop: 6,
          paddingBottom: tabBarBottom,
          height: 56 + tabBarBottom,
          zIndex: 100,
          elevation: 100,
          pointerEvents: "auto" as const,
        },
        tabBarItemStyle: {
          minHeight: 44,
          paddingVertical: 4,
        },
        tabBarButton: TabBarButton,
        tabBarIcon: ({ color, size, focused }: { color: string; size: number; focused: boolean }) => {
          const name = TAB_ICONS[route.name];
          if (!name) return null;
          return <TabBarIcon name={name} color={color} size={size} focused={focused} />;
        },
      }),
    [tabBarBottom],
  );

  return (
    <Tabs detachInactiveScreens={false} screenOptions={screenOptions as never}>
      <Tabs.Screen name="index" options={{ title: t("tabs.home") }} />
      <Tabs.Screen name="camera/index" options={{ title: t("tabs.camera") }} />
      <Tabs.Screen name="review/index" options={{ title: t("tabs.review") }} />
      <Tabs.Screen name="carte/index" options={{ title: t("tabs.carte") }} />
      <Tabs.Screen name="settings/index" options={{ title: t("tabs.settings") }} />
    </Tabs>
  );
}
