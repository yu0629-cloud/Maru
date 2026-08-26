import type { ReactNode } from "react";
import { View } from "react-native";
import { useChildStore } from "@/src/stores/childStore";

/** 子ども切り替え時に配下を再マウントし、画面データを作り直す */
export function ChildScoped({ children }: { children: ReactNode }) {
  const currentChildId = useChildStore((state) => state.currentChildId);
  return (
    <View key={currentChildId ?? "no-child"} className="flex-1">
      {children}
    </View>
  );
}
