import { Text, View } from "react-native";
import {
  flattenWorksheetItems,
  paginateWorksheetItems,
  WORKSHEET_PER_PAGE,
  type PrintDocumentInput,
  type WorksheetItem,
} from "@/src/features/print/html";
import { t } from "@/src/i18n";

function sanitizeStem(text: string) {
  return String(text ?? "")
    .replace(/\$/g, "")
    .replace(/＄/g, "")
    .trim();
}

function WorksheetCell({ item }: { item: WorksheetItem }) {
  return (
    <View
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderWidth: 1.5,
        borderColor: "#d0d0d0",
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        marginBottom: 10,
        backgroundColor: "#fff",
        minHeight: 60,
      }}
    >
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          flexShrink: 1,
          marginRight: 12,
        }}
      >
        <Text style={{ fontSize: 15, color: "#666", marginRight: 10 }}>({item.number})</Text>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "bold",
            color: "#222",
            flexShrink: 0,
          }}
        >
          {sanitizeStem(item.stem)}
        </Text>
      </View>
      <View
        style={{
          width: 60,
          height: 35,
          borderWidth: 2,
          borderColor: "#333",
          borderRadius: 6,
          backgroundColor: "#fafafa",
          flexShrink: 0,
        }}
      />
    </View>
  );
}

export function PrintPreviewSheets({ input }: { input: PrintDocumentInput }) {
  const items = flattenWorksheetItems(input.problems).map((item) => ({
    ...item,
    stem: sanitizeStem((item as WorksheetItem).stem),
  })) as WorksheetItem[];
  const pages =
    input.scope === "all"
      ? (paginateWorksheetItems(items, WORKSHEET_PER_PAGE) as WorksheetItem[][])
      : [items.slice(0, 5)];
  const sheets = pages.length ? pages : [[]];

  return (
    <View className="px-4 pb-8">
      {sheets.map((pageItems, pageIndex) => (
        <View key={`page-${pageIndex}`} className="mb-4 bg-white px-3 py-3">
          <View className="mb-3 border-b-2 border-maru-600 pb-2">
            <Text className="text-[10px] font-bold tracking-widest text-maru-600">
              {input.brand ?? t("print.brand")}
            </Text>
            <Text className="mt-1 text-base font-bold text-ink">{input.title ?? t("print.defaultTitle")}</Text>
            <View className="mt-2 flex-row justify-between">
              <Text className="text-xs text-ink">
                {input.nameLabel ?? t("print.nameLabel", { name: input.childName ?? "—" })}
              </Text>
              <Text className="text-xs text-ink">{input.dateLabel ?? ""}</Text>
            </View>
          </View>
          {pageItems.length === 0 ? (
            <Text className="py-8 text-center text-sm text-ink/60">{input.emptyLabel ?? t("print.emptySheet")}</Text>
          ) : (
            pageItems.map((item) => <WorksheetCell key={item.id} item={item} />)
          )}
          <Text className="mt-2 text-center text-[10px] text-ink/50">
            {pageIndex + 1}/{Math.max(1, pages.length)}
          </Text>
        </View>
      ))}
    </View>
  );
}
