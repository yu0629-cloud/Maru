import { Text, View } from "react-native";
import { ScanSweep } from "@/src/components/ScanSweep";

type Props = {
  shotCount: number;
  scanning?: boolean;
};

/** ライブカメラの上に載せる A4 ガイド。大きな写真プレビューは開かない */
export function A4Finder({ shotCount, scanning = false }: Props) {
  return (
    <View className="flex-1" pointerEvents="none">
      <View className="flex-1 items-center justify-center px-8 py-10">
        <View className="h-full w-full overflow-hidden rounded-lg border-2 border-white/85">
          <ScanSweep active={scanning} />
        </View>
      </View>
      <View className="absolute bottom-6 left-0 right-0 px-6">
        {scanning ? (
          <Text className="text-center text-sm font-semibold text-white">
            解析中です。このまま次のプリントを撮ってください
          </Text>
        ) : shotCount > 0 ? (
          <Text className="text-center text-sm font-semibold text-white">
            {shotCount}枚撮影済み。どんどん次のプリントを撮ってください
          </Text>
        ) : (
          <Text className="text-center text-sm text-white/90">スキャンすると紙の四隅を自動で検出します</Text>
        )}
      </View>
    </View>
  );
}
