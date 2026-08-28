import { Pressable, Text, View } from "react-native";
import { push } from "@/src/lib/nav/href";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";
import { t } from "@/src/i18n";

export function ChildSwitcher() {
  const { children, currentChildId, switchChild } = useCurrentChild();

  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {children.map((child) => {
        const selected = child.id === currentChildId;
        return (
          <Pressable
            key={child.id}
            onPress={() => void switchChild(child.id)}
            className={`flex-row items-center rounded-full px-3 py-2 ${selected ? "bg-maru-500" : "bg-white"}`}
          >
            <View
              className="mr-2 h-3 w-3 rounded-full"
              style={{ backgroundColor: selected ? "#fff" : `hsl(${child.avatar_hue}, 70%, 45%)` }}
            />
            <Text className={selected ? "font-semibold text-white" : "text-ink"}>{child.name}</Text>
          </Pressable>
        );
      })}
      <Pressable className="rounded-full bg-white px-3 py-2" onPress={() => push("/(app)/children")}>
        <Text className="text-ink/70">{children.length === 0 ? t("child.register") : t("child.manage")}</Text>
      </Pressable>
    </View>
  );
}
