import { Pressable, Text, View } from "react-native";
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { t, tSubject, tSubjectBadge } from "@/src/i18n";
import {
  chartModeForSubjectCount,
  type CarteTabId,
  type SubjectGroup,
} from "@/src/features/carte/stats";
import {
  labelTextAnchor,
  pointsAttr,
  radarDataPoints,
  radarRingPoints,
  radarVertex,
} from "@/src/features/carte/chart";

const INK = "#1F2933";
const MARU = "#E25C4A";
const SUBJECT_COLORS: Record<string, string> = {
  math: "#E25C4A",
  japanese: "#3B82F6",
  spelling_phonics: "#06B6D4",
  reading: "#8B5CF6",
  writing_grammar: "#EC4899",
  science: "#10B981",
  social_studies: "#F59E0B",
  world_languages: "#14B8A6",
  other: "#6B7280",
  english: "#14B8A6",
  social: "#F59E0B",
};

function colorOf(subject: string) {
  return SUBJECT_COLORS[subject] ?? MARU;
}

function SubjectBarChart({
  subjects,
  selected,
  onSelect,
}: {
  subjects: SubjectGroup[];
  selected?: CarteTabId;
  onSelect?: (subject: SubjectGroup["subject"]) => void;
}) {
  const width = 280;
  const height = 176;
  const top = 28;
  const bottom = 36;
  const chartH = height - top - bottom;
  const barW = 48;
  const gap = (width - barW * subjects.length) / (subjects.length + 1);

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessibilityRole="image">
      <Line
        x1={20}
        y1={top + chartH}
        x2={width - 20}
        y2={top + chartH}
        stroke={INK}
        strokeOpacity={0.15}
        strokeWidth={1}
      />
      {subjects.map((item, index) => {
        const h = Math.max(6, item.rate * chartH);
        const x = gap + index * (barW + gap);
        const y = top + chartH - h;
        const active = selected === item.subject;
        return (
          <G
            key={item.subject}
            onPress={onSelect ? () => onSelect(item.subject) : undefined}
            accessibilityRole="button"
            accessibilityLabel={t("carte.chartRateA11y", {
              subject: tSubject(item.subject),
              rate: Math.round(item.rate * 100),
            })}
          >
            <Rect
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={8}
              fill={colorOf(item.subject)}
              fillOpacity={active || selected === "all" || !selected ? 1 : 0.45}
            />
            <SvgText
              x={x + barW / 2}
              y={y - 8}
              textAnchor="middle"
              fontSize={12}
              fontWeight="700"
              fill={INK}
            >
              {`${Math.round(item.rate * 100)}%`}
            </SvgText>
            <SvgText
              x={x + barW / 2}
              y={height - 12}
              textAnchor="middle"
              fontSize={12}
              fontWeight="600"
              fill={INK}
            >
              {tSubject(item.subject)}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function SubjectRadarChart({
  subjects,
  selected,
  onSelect,
}: {
  subjects: SubjectGroup[];
  selected?: CarteTabId;
  onSelect?: (subject: SubjectGroup["subject"]) => void;
}) {
  const size = 292;
  const cx = 146;
  const cy = 142;
  const radius = 82;
  const n = subjects.length;
  const rings = [0.25, 0.5, 0.75, 1];
  const data = radarDataPoints(
    subjects.map((item) => item.rate),
    radius,
    cx,
    cy,
  );

  return (
    <Svg width="100%" height={size} viewBox={`0 0 ${size} ${size}`} accessibilityRole="image">
      {rings.map((scale) => (
        <Polygon
          key={scale}
          points={pointsAttr(radarRingPoints(n, scale, radius, cx, cy))}
          fill="none"
          stroke={INK}
          strokeOpacity={0.12}
          strokeWidth={1}
        />
      ))}
      {Array.from({ length: n }, (_, index) => {
        const tip = radarVertex(index, n, radius, cx, cy);
        return (
          <Line
            key={subjects[index].subject}
            x1={cx}
            y1={cy}
            x2={tip.x}
            y2={tip.y}
            stroke={INK}
            strokeOpacity={0.12}
            strokeWidth={1}
          />
        );
      })}
      <Polygon
        points={pointsAttr(data)}
        fill={MARU}
        fillOpacity={0.28}
        stroke={MARU}
        strokeWidth={2}
      />
      {data.map((point: { x: number; y: number; angle: number }, index: number) => {
        const item = subjects[index];
        const label = radarVertex(index, n, radius + 24, cx, cy);
        const active = selected === item.subject;
        return (
          <G
            key={item.subject}
            onPress={onSelect ? () => onSelect(item.subject) : undefined}
            accessibilityRole="button"
            accessibilityLabel={t("carte.chartRateA11y", {
              subject: tSubject(item.subject),
              rate: Math.round(item.rate * 100),
            })}
          >
            <Circle cx={point.x} cy={point.y} r={active ? 6 : 4} fill={colorOf(item.subject)} />
            <SvgText
              x={label.x}
              y={label.y - 6}
              textAnchor={labelTextAnchor(label.angle)}
              fontSize={11}
              fontWeight="700"
              fill={INK}
            >
              {tSubject(item.subject)}
            </SvgText>
            <SvgText
              x={label.x}
              y={label.y + 8}
              textAnchor={labelTextAnchor(label.angle)}
              fontSize={10}
              fontWeight="600"
              fill={INK}
              fillOpacity={0.7}
            >
              {`${Math.round(item.rate * 100)}%`}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

export function CarteSubjectChart({
  subjects,
  selected,
  onSelect,
}: {
  subjects: SubjectGroup[];
  selected?: CarteTabId;
  onSelect?: (subject: SubjectGroup["subject"]) => void;
}) {
  const mode = chartModeForSubjectCount(subjects.length);
  if (mode === "none") return null;

  const caption =
    mode === "bar" ? t("carte.barCaption") : t("carte.radarCaption", { count: subjects.length });
  const rates = subjects.map((item) => `${tSubject(item.subject)}${Math.round(item.rate * 100)}%`).join(t("common.listSep"));

  return (
    <View className="rounded-2xl bg-white p-4">
      <Text className="text-sm text-ink/60">{caption}</Text>
      <View
        className="mt-2 items-center"
        accessibilityLabel={t("carte.chartA11y", { rates })}
      >
        {mode === "bar" ? (
          <SubjectBarChart subjects={subjects} selected={selected} onSelect={onSelect} />
        ) : (
          <SubjectRadarChart subjects={subjects} selected={selected} onSelect={onSelect} />
        )}
      </View>
    </View>
  );
}

export function CarteSubjectCards({
  subjects,
  selected,
  onSelect,
}: {
  subjects: SubjectGroup[];
  selected: CarteTabId;
  onSelect: (subject: SubjectGroup["subject"]) => void;
}) {
  return (
    <View className="mt-3 flex-row flex-wrap gap-3">
      {subjects.map((item) => {
        const active = selected === item.subject;
        return (
          <Pressable
            key={item.subject}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t("carte.cardA11y", { subject: tSubjectBadge(item.subject), rate: Math.round(item.rate * 100) })}
            onPress={() => onSelect(item.subject)}
            className={`${subjects.length === 1 ? "w-full" : "min-w-[46%] flex-1"} rounded-2xl bg-white p-4 ${active ? "border-2 border-maru-500" : "border-2 border-transparent"}`}
          >
            <Text className="text-sm font-bold text-ink">{tSubjectBadge(item.subject)}</Text>
            <Text className={`mt-1 text-2xl font-bold ${item.rate >= 0.8 ? "text-emerald-700" : "text-ink"}`}>
              {Math.round(item.rate * 100)}%
            </Text>
            <Text className="mt-1 text-xs text-ink/60">
              {t("common.questionsCount", { correct: item.correct, total: item.total })}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
