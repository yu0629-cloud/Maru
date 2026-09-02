import { Image, Text, View } from "react-native";
import {
  flattenWorksheetItems,
  packWorksheetRows,
  paginateWorksheetRows,
  PRINT_ROWS_PER_PAGE,
  stripRepeatedLead,
  stripLeadingQuestionNumber,
  stripMarkdownTables,
  type PrintDocumentInput,
  type WorksheetItem,
} from "@/src/features/print/html";
import { figurePlacementOf, needsDataTableVisual, needsInsetFigure } from "@/src/features/print/lib/figure-boxes.mjs";
import { t } from "@/src/i18n";
import { normalizeOcrText } from "@/src/features/print/lib/ocr-text.mjs";

function sanitizeStem(text: string) {
  return normalizeOcrText(String(text ?? ""))
    .replace(/\$/g, "")
    .replace(/＄/g, "")
    .trim();
}

function partWantsDataTable(part: { stem?: string; options?: string }) {
  return needsDataTableVisual({
    questionText: part.stem,
    optionsText: part.options,
  });
}

function isDistinctSubFigure(
  parentSrc?: string | null,
  subSrc?: string | null,
  parentOcc?: { widthPct: number; heightMm: number } | null,
  subOcc?: { widthPct: number; heightMm: number } | null,
) {
  const parent = String(parentSrc ?? "").trim();
  const sub = String(subSrc ?? "").trim();
  if (!sub) return false;
  if (sub !== parent) return true;
  if (!subOcc || !Number.isFinite(subOcc.heightMm)) return false;
  if (!parentOcc || !Number.isFinite(parentOcc.heightMm)) return true;
  return (
    Math.abs(Number(subOcc.heightMm) - Number(parentOcc.heightMm)) > 0.5 ||
    Math.abs(Number(subOcc.widthPct) - Number(parentOcc.widthPct)) > 0.5
  );
}

function NumberLabel({
  label,
  numberStyle,
}: {
  label?: string;
  numberStyle?: "square" | "round";
}) {
  const text = String(label ?? "").trim();
  if (!text) return null;
  const square = numberStyle === "square";
  return (
    <Text
      style={{
        fontSize: 14,
        fontWeight: square ? "700" : "400",
        color: square ? "#222" : "#666",
      }}
    >
      {text}{" "}
    </Text>
  );
}

function AnswerBox() {
  return (
    <View
      style={{
        width: 60,
        height: 35,
        borderWidth: 2,
        borderColor: "#333",
        borderRadius: 4,
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
        minHeight: 76,
        borderWidth: 2,
        borderColor: "#333",
        borderRadius: 6,
        marginTop: 4,
        backgroundColor: "#fff",
      }}
    />
  );
}

function FigureMedia({
  src,
  occupancy,
  masks,
  id,
}: {
  src?: string;
  occupancy?: { widthPct: number; heightMm: number } | null;
  masks?: Array<{ x: number; y: number; width: number; height: number }>;
  id: string;
}) {
  if (!src) return null;
  const aspectRatio =
    occupancy?.widthPct && occupancy?.heightMm
      ? (occupancy.widthPct * 273) / (100 * occupancy.heightMm)
      : 4 / 3;
  return (
    <View
      style={{
        position: "relative",
        width: occupancy?.widthPct ? `${Math.min(occupancy.widthPct, 100)}%` : "100%",
        maxWidth: "100%",
        marginBottom: 6,
        marginTop: 4,
        alignSelf: "center",
      }}
    >
      <Image
        source={{ uri: src }}
        resizeMode="contain"
        style={{ width: "100%", maxWidth: "100%", aspectRatio }}
      />
      {(masks ?? []).map((mask, index) => (
        <View
          key={`${id}-mask-${index}`}
          pointerEvents="none"
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
  );
}

function PartAnswer({ hasOptions, isFigure }: { hasOptions: boolean; isFigure: boolean }) {
  if (isFigure && !hasOptions) {
    return (
      <View style={{ alignItems: "stretch" }}>
        <FigureAnswerFrame />
      </View>
    );
  }
  return (
    <View style={{ alignItems: "flex-end" }}>
      <AnswerBox />
    </View>
  );
}

function WorksheetCell({ item }: { item: WorksheetItem }) {
  const rawContext = item.context || (item.kind === "passage" ? item.passage ?? "" : "");
  const context = sanitizeStem(rawContext);
  const options = sanitizeStem(item.options ?? "");
  const stem = stripLeadingQuestionNumber(stripRepeatedLead(item.stem, rawContext));
  const compact = item.layout === "compact" && !item.figureSrc && !context && !options;
  const parts =
    item.kind === "figure" && item.parts?.length
      ? item.parts
      : [
          {
            number: item.number,
            numberLabel: item.numberLabel,
            numberStyle: item.numberStyle,
            stem,
            options,
          },
        ];

  if (compact) {
    return (
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          borderWidth: 1.5,
          borderColor: "#d0d0d0",
          borderRadius: 8,
          paddingVertical: 10,
          paddingHorizontal: 12,
          marginBottom: 8,
          backgroundColor: "#fff",
          minHeight: 48,
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
          <NumberLabel label={item.numberLabel} numberStyle={item.numberStyle} />
          {stem}
        </Text>
        <AnswerBox />
      </View>
    );
  }

  const cardStyle = {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#d0d0d0",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: "#fff",
  } as const;

  if (item.kind === "figure") {
    const parentSrc = item.parentFigureSrc || item.figureSrc;
    const parentOcc = item.parentOccupancy || item.occupancy;
    const shownSubs = new Set<string>();
    return (
      <View style={cardStyle}>
        {context ? (
          <Text style={{ fontSize: 14, lineHeight: 21, color: "#222", marginBottom: 6 }}>{context}</Text>
        ) : null}
        <FigureMedia id={`${item.id}-parent`} src={parentSrc} occupancy={parentOcc} masks={item.masks} />
        {parts.map((part, index) => {
          const partStem = stripLeadingQuestionNumber(stripRepeatedLead(part.stem, rawContext));
          const wantsTable = partWantsDataTable(part);
          const wantsInset = needsInsetFigure({ questionText: part.stem });
          const subSrc = part.subFigureSrc || (wantsTable || wantsInset ? item.subFigureSrc : "") || "";
          const subOcc = part.subOccupancy ?? (wantsTable || wantsInset ? item.subOccupancy : null);
          const subKey =
            subOcc && Number.isFinite(subOcc.heightMm)
              ? `occ:${Math.round(Number(subOcc.widthPct) * 10)}:${Math.round(Number(subOcc.heightMm) * 10)}`
              : subSrc
                ? `src:${String(subSrc).length}:${String(subSrc).slice(40, 88)}`
                : "";
          const showSub =
            Boolean(subSrc) &&
            Boolean(subKey) &&
            !shownSubs.has(subKey) &&
            (wantsTable || wantsInset) &&
            isDistinctSubFigure(parentSrc, subSrc, parentOcc, subOcc);
          if (showSub && subKey) shownSubs.add(subKey);
          const partOptions = sanitizeStem(stripMarkdownTables(part.options ?? ""));
          const place = figurePlacementOf({ questionText: part.stem, optionsText: part.options });
          const insetRight = showSub && place === "right";
          const insetLeft = showSub && place === "left";
          return (
            <View
              key={`${item.id}-part-${part.numberLabel || part.number}-${index}`}
              style={{
                marginTop: index === 0 ? 4 : 8,
                paddingTop: index === 0 ? 0 : 8,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: "#eee",
                flexDirection: insetRight || insetLeft ? "row" : "column",
                alignItems: insetRight || insetLeft ? "flex-start" : undefined,
              }}
            >
              {insetLeft && showSub ? (
                <FigureMedia
                  id={`${item.id}-sub-${part.numberLabel || part.number}-${index}`}
                  src={subSrc}
                  occupancy={subOcc}
                  masks={part.subMasks ?? item.subMasks}
                />
              ) : null}
              <View style={insetRight || insetLeft ? { flex: 1, minWidth: 0 } : undefined}>
              <Text style={{ fontSize: 16, fontWeight: "600", lineHeight: 24, color: "#222", marginBottom: 6 }}>
                <NumberLabel label={part.numberLabel ?? item.numberLabel} numberStyle={part.numberStyle ?? item.numberStyle} />
                {partStem}
              </Text>
              {!insetRight && !insetLeft && showSub ? (
                <FigureMedia
                  id={`${item.id}-sub-${part.numberLabel || part.number}-${index}`}
                  src={subSrc}
                  occupancy={subOcc}
                  masks={part.subMasks ?? item.subMasks}
                />
              ) : null}
              {partOptions ? (
                <Text style={{ fontSize: 14, lineHeight: 21, color: "#222", marginBottom: 8 }}>{partOptions}</Text>
              ) : null}
              {part.printRole === "prerequisite" ? (
                <View style={{ alignItems: "flex-end" }}>
                  <View
                    style={{
                      minWidth: 60,
                      minHeight: 35,
                      paddingHorizontal: 10,
                      borderWidth: 2,
                      borderColor: "#333",
                      borderRadius: 4,
                      backgroundColor: "#f3f3f3",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#222" }}>
                      {String(part.correctAnswer ?? "").trim() || "○"}
                    </Text>
                  </View>
                </View>
              ) : (
                <PartAnswer hasOptions={Boolean(partOptions)} isFigure />
              )}
              </View>
              {insetRight && showSub ? (
                <FigureMedia
                  id={`${item.id}-sub-${part.numberLabel || part.number}-${index}`}
                  src={subSrc}
                  occupancy={subOcc}
                  masks={part.subMasks ?? item.subMasks}
                />
              ) : null}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={cardStyle}>
      <Text style={{ fontSize: 14, lineHeight: 21, color: "#222", marginBottom: 6 }}>
        <NumberLabel label={item.numberLabel} numberStyle={item.numberStyle} />
        {item.kind !== "passage" && context ? context : ""}
      </Text>
      {item.kind === "passage" && context ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 6,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginBottom: 8,
            backgroundColor: "#fbfbfb",
          }}
        >
          <Text style={{ fontSize: 14, lineHeight: 21, color: "#222" }}>{context}</Text>
        </View>
      ) : null}
      <FigureMedia id={item.id} src={item.figureSrc} occupancy={item.occupancy} masks={item.masks} />
      {stem && stem !== context ? (
        <Text style={{ fontSize: 16, fontWeight: "600", lineHeight: 24, color: "#222", marginBottom: 6 }}>{stem}</Text>
      ) : null}
      {options ? (
        <Text style={{ fontSize: 14, lineHeight: 21, color: "#222", marginBottom: 8 }}>{options}</Text>
      ) : null}
      <PartAnswer hasOptions={Boolean(options)} isFigure={false} />
    </View>
  );
}

export function PrintPreviewSheets({ input }: { input: PrintDocumentInput }) {
  const items = flattenWorksheetItems(input.problems).map((item) => ({
    ...item,
    stem: sanitizeStem((item as WorksheetItem).stem),
    context: sanitizeStem((item as WorksheetItem).context ?? ""),
    options: sanitizeStem((item as WorksheetItem).options ?? ""),
    passage: sanitizeStem((item as WorksheetItem).passage ?? ""),
  })) as WorksheetItem[];
  const rows = packWorksheetRows(items.slice(0, input.scope === "all" ? items.length : 5));
  const pages =
    input.scope === "all" ? (paginateWorksheetRows(rows, PRINT_ROWS_PER_PAGE) as WorksheetItem[][][]) : [rows];
  const sheets = pages.length ? pages : [[]];

  return (
    <View className="px-4 pb-8">
      {sheets.map((pageRows, pageIndex) => (
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
          {pageRows.length === 0 ? (
            <Text className="py-8 text-center text-sm text-ink/60">{input.emptyLabel ?? t("print.emptySheet")}</Text>
          ) : (
            pageRows.map((row, rowIndex) => (
              <View key={`row-${pageIndex}-${rowIndex}`} style={{ flexDirection: "row", gap: 10 }}>
                {row.map((item) => (
                  <WorksheetCell key={item.id} item={item} />
                ))}
              </View>
            ))
          )}
          <Text className="mt-2 text-center text-[10px] text-ink/50">
            {pageIndex + 1}/{Math.max(1, pages.length)}
          </Text>
        </View>
      ))}
    </View>
  );
}
