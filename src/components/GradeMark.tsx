import { Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { MARK_STROKE_WIDTH } from "@/src/features/grading/overlay-layout";
import { correctMarkGlyph, defaultMarkStyle, type MarkStyle } from "@/src/features/prefs/mark-style";
import { t, useAppLocale, useT } from "@/src/i18n";
import { usePrefsStore } from "@/src/stores/prefsStore";

const MARK_RED = "#E25C4A";

export function useResolvedMarkStyle(): MarkStyle {
  const locale = useAppLocale();
  const stored = usePrefsStore((state) => state.markStyle);
  return stored ?? defaultMarkStyle(locale);
}

export function useGradeResultLabel(isCorrect: boolean): string {
  useT();
  const markStyle = useResolvedMarkStyle();
  if (isCorrect) return t("scan.correct", { mark: correctMarkGlyph(markStyle) });
  return t("scan.incorrect");
}

export function CorrectMark({ size, style }: { size: number; style: MarkStyle }) {
  const stroke = MARK_STROKE_WIDTH;
  if (style === "global") {
    const inset = size * 0.18;
    return (
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Path
          d={`M ${inset} ${size * 0.52} L ${size * 0.42} ${size - inset} L ${size - inset} ${size * 0.28}`}
          stroke={MARK_RED}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  const r = Math.max(0, (size - stroke) / 2);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={MARK_RED} strokeWidth={stroke} fill="none" />
    </Svg>
  );
}

export function IncorrectMark({ size }: { size: number }) {
  const stroke = MARK_STROKE_WIDTH;
  const inset = size * 0.22;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Line
        x1={inset}
        y1={inset}
        x2={size - inset}
        y2={size - inset}
        stroke={MARK_RED}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <Line
        x1={size - inset}
        y1={inset}
        x2={inset}
        y2={size - inset}
        stroke={MARK_RED}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function GradeMarkPreview({ style, size = 36 }: { style: MarkStyle; size?: number }) {
  const t = useT();
  return (
    <View className="mt-3 flex-row items-center justify-center">
      <View className="items-center px-4">
        <CorrectMark size={size} style={style} />
        <Text className="mt-1 text-xs text-ink/60">{t("onboarding.previewCorrect")}</Text>
      </View>
      <View className="items-center px-4">
        <IncorrectMark size={size} />
        <Text className="mt-1 text-xs text-ink/60">{t("onboarding.previewIncorrect")}</Text>
      </View>
    </View>
  );
}
