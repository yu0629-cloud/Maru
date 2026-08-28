import { Image, Pressable, Text, View } from "react-native";
import { ScanPrintMenuButton, useScanPrintActions } from "@/src/components/ScanPrintMenu";
import { SubjectTag } from "@/src/components/SubjectTag";
import { formatScanDateTime, isScanImageExpired } from "@/src/features/storage/history";
import { useScanPhotoUri } from "@/src/features/storage/useScanPhotoUri";
import type { ScanRecord } from "@/src/stores/scanStore";
import { t, useAppLocale } from "@/src/i18n";

function scoreLabel(scan: ScanRecord) {
  const score = scan.overall_score;
  return score?.max ? t("common.points", { earned: score.earned, max: score.max }) : t("history.graded");
}

export function ScanHistoryCard({
  scan,
  compact = false,
  layout = "row",
  onPress,
}: {
  scan: ScanRecord;
  compact?: boolean;
  layout?: "row" | "grid";
  onPress: () => void;
}) {
  const { uri, expired } = useScanPhotoUri(scan);
  const { openMenu, childSheet, busy } = useScanPrintActions(scan);
  const locale = useAppLocale();
  const imageExpired = expired || isScanImageExpired(scan);
  const hint = imageExpired ? t("history.hintExpired") : t("history.hintOpen");
  const dateLabel = formatScanDateTime(scan.createdAt, new Date(), locale);

  if (layout === "grid") {
    return (
      <Pressable
        accessibilityRole="button"
        className="overflow-hidden rounded-2xl bg-white"
        onPress={onPress}
        onLongPress={openMenu}
      >
        <View className="h-36 items-center justify-center bg-cream">
          {uri && !imageExpired ? (
            <Image source={{ uri }} className="h-full w-full" resizeMode="cover" />
          ) : (
            <View className="h-full w-full items-center justify-center px-2">
              <Text className="text-center text-[10px] leading-4 text-ink/60">
                {imageExpired ? t("history.expiredThumb") : ""}
              </Text>
            </View>
          )}
          <View className="absolute right-2 top-2">
            <ScanPrintMenuButton openMenu={openMenu} compact busy={busy} />
          </View>
        </View>
        <View className="px-3 py-2.5">
          <Text className="text-sm font-bold text-ink">{dateLabel}</Text>
          <View className="mt-1 flex-row flex-wrap items-center">
            <SubjectTag subject={scan.subject} scan={scan} compact />
            <Text className="ml-1.5 text-sm text-ink/70">{scoreLabel(scan)}</Text>
          </View>
        </View>
        {childSheet}
      </Pressable>
    );
  }

  const thumbH = compact ? 72 : 96;
  const thumbW = compact ? 54 : 72;

  return (
    <Pressable
      accessibilityRole="button"
      className="flex-row items-center rounded-2xl bg-white p-3"
      onPress={onPress}
      onLongPress={openMenu}
    >
      <View className="overflow-hidden rounded-xl bg-cream" style={{ width: thumbW, height: thumbH }}>
        {uri && !imageExpired ? (
          <Image source={{ uri }} style={{ width: thumbW, height: thumbH }} resizeMode="cover" />
        ) : (
          <View className="h-full w-full items-center justify-center px-1">
            <Text className="text-center text-[10px] leading-4 text-ink/60">
              {imageExpired ? t("history.expiredThumb") : ""}
            </Text>
          </View>
        )}
      </View>
      <View className="ml-3 flex-1">
        <View className="flex-row items-center justify-between">
          <Text className="flex-1 font-bold text-ink">{dateLabel}</Text>
          <View className="flex-row items-center gap-2">
            <SubjectTag subject={scan.subject} scan={scan} compact />
            <ScanPrintMenuButton openMenu={openMenu} compact busy={busy} tone="light" />
          </View>
        </View>
        <Text className="mt-1 text-sm text-ink/70">{scoreLabel(scan)}</Text>
        <Text className="mt-1 text-xs text-ink/50">{hint}</Text>
      </View>
      {childSheet}
    </Pressable>
  );
}
