import { Image, Text, View } from "react-native";
import {
  packClipRows,
  paginateClipRows,
  toClipItems,
  type PrintDocumentInput,
} from "@/src/features/print/html";

function isShowableUri(uri: string) {
  return /^(https?:|file:|content:|data:image\/(png|jpe?g|webp))/i.test(uri);
}

export function PrintPreviewSheets({ input }: { input: PrintDocumentInput }) {
  const items = toClipItems(input.problems);
  const pages = paginateClipRows(packClipRows(items));

  return (
    <View className="px-4 pb-8">
      {(pages.length ? pages : [[]]).map((rows, pageIndex) => (
        <View key={`page-${pageIndex}`} className="mb-4 bg-white px-3 py-3">
          <View className="mb-3 border-b-2 border-maru-600 pb-2">
            <Text className="text-[10px] font-bold tracking-widest text-maru-600">MARU 家庭学習</Text>
            <Text className="mt-1 text-base font-bold text-ink">{input.title ?? "今日のまとめプリント"}</Text>
            <View className="mt-2 flex-row justify-between">
              <Text className="text-xs text-ink">なまえ: {input.childName ?? "—"}</Text>
              <Text className="text-xs text-ink">{input.dateLabel ?? ""}</Text>
            </View>
          </View>
          {rows.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} className="mb-2 flex-row justify-between">
              {row.map((item) => (
                <View
                  key={item.id}
                  className="overflow-hidden border border-[#e5ddd4] p-1.5"
                  style={{ width: row.length === 2 ? "48.5%" : "100%" }}
                >
                  <Text className="mb-1 text-[10px] text-ink/40">({item.number})</Text>
                  <View
                    className="overflow-hidden bg-[#fbfaf6]"
                    style={{
                      aspectRatio: Math.max(item.cropBox.width, 0.01) / Math.max(item.cropBox.height, 0.01),
                    }}
                  >
                    {isShowableUri(item.imageSrc) ? (
                      <Image source={{ uri: item.imageSrc }} className="h-full w-full" resizeMode="cover" />
                    ) : (
                      <View className="h-full w-full bg-[#fbfaf6]" />
                    )}
                    {item.isBlanked ? null : (
                      <View className="absolute bottom-0 left-0 right-0 h-[55%] bg-white" />
                    )}
                  </View>
                </View>
              ))}
            </View>
          ))}
          <Text className="mt-2 text-center text-[10px] text-ink/50">
            {pageIndex + 1}/{Math.max(1, pages.length)}
          </Text>
        </View>
      ))}
    </View>
  );
}
