import { Image, Text, View } from "react-native";
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

function AnswerBox() {
  return (
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
  );
}

function FigureAnswerFrame() {
  return (
    <View
      style={{
        minHeight: 80,
        borderWidth: 2,
        borderColor: "#333",
        borderRadius: 6,
        marginTop: 8,
        backgroundColor: "#fff",
      }}
    />
  );
}

function WorksheetCell({ item }: { item: WorksheetItem }) {
  if (item.kind === "figure" && item.figureSrc) {
    return (
      <View
        style={{
          borderWidth: 1.5,
          borderColor: "#d0d0d0",
          borderRadius: 8,
          paddingVertical: 10,
          paddingHorizontal: 14,
          marginBottom: 10,
          backgroundColor: "#fff",
        }}
      >
        <Text style={{ fontSize: 15, color: "#666", marginBottom: 8 }}>({item.number})</Text>
        <View style={{ position: "relative", width: "100%" }}>
          <Image
            source={{ uri: item.figureSrc }}
            resizeMode="contain"
            style={{ width: "100%", height: 200, maxHeight: 240 }}
          />
          {(item.masks ?? []).map((mask, index) => (
            <View
              key={`mask-${index}`}
              style={{
                position: "absolute",
                left: `${mask.x * 100}%`,
                top: `${mask.y * 100}%`,
                width: `${mask.width * 100}%`,
                height: `${mask.height * 100}%`,
                backgroundColor: "#fff",
              }}
            />
          ))}
        </View>
        <FigureAnswerFrame />
      </View>
    );
  }

  if (item.kind === "passage") {
    const passage = sanitizeStem(item.passage || item.stem);
    const stem = sanitizeStem(item.stem);
    const showQuestion = Boolean(stem && stem !== passage);
    return (
      <View
        style={{
          borderWidth: 1.5,
          borderColor: "#d0d0d0",
          borderRadius: 8,
          paddingVertical: 10,
          paddingHorizontal: 14,
          marginBottom: 10,
          backgroundColor: "#fff",
        }}
      >
        <View
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 6,
            paddingVertical: 10,
            paddingHorizontal: 12,
            backgroundColor: "#fbfbfb",
          }}
        >
          <Text style={{ fontSize: 13, lineHeight: 22, color: "#222" }}>{passage}</Text>
        </View>
        <Text style={{ fontSize: 15, fontWeight: showQuestion ? "700" : "400", color: showQuestion ? "#222" : "#666", marginVertical: 8 }}>
          ({item.number}){showQuestion ? ` ${stem}` : ""}
        </Text>
        <View style={{ alignItems: "flex-end" }}>
          <AnswerBox />
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        borderWidth: 1.5,
        borderColor: "#d0d0d0",
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        marginBottom: 10,
        backgroundColor: "#fff",
        minHeight: 52,
      }}
    >
      <Text
        style={{
          flex: 1,
          flexShrink: 1,
          minWidth: 0,
          marginRight: 12,
          fontSize: 16,
          fontWeight: "600",
          lineHeight: 24,
          color: "#222",
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: "400", color: "#666" }}>({item.number}) </Text>
        {sanitizeStem(item.stem)}
      </Text>
      <AnswerBox />
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
