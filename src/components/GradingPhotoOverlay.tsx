import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { ZoomableView } from "@/src/components/ZoomableView";
import {
  displayCoachingTip,
  MISTAKE_LABELS,
  type GradedProblemView,
} from "@/src/features/grading/corrections";
import {
  isBlankStudentAnswer,
  isGeminiBBox,
  layoutAlignedGradeMarks,
  mapGeminiBBoxToView,
  MARK_STROKE_WIDTH,
} from "@/src/features/grading/overlay-layout";

const MARK_RED = "#E25C4A";
const A4_ASPECT = 210 / 297;

type OverlayProblem = Pick<
  GradedProblemView,
  | "id"
  | "problem_label"
  | "is_correct"
  | "bbox"
  | "student_answer"
  | "correct_answer"
  | "parent_coaching_tip"
  | "topic_tag"
  | "mistake_type"
>;

export function GradingPhotoOverlay({
  uri,
  problems,
  onPressProblem,
  onGestureActive,
}: {
  uri: string;
  problems: OverlayProblem[];
  onPressProblem: (problem: OverlayProblem) => void;
  onGestureActive?: (active: boolean) => void;
}) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNatural(null);
    Image.getSize(
      uri,
      (width, height) => {
        if (!cancelled && width > 0 && height > 0) setNatural({ width, height });
      },
      () => {
        if (!cancelled) setNatural(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const aspectRatio = natural && natural.width > 0 && natural.height > 0
    ? natural.width / natural.height
    : A4_ASPECT;

  const alignedMarks = useMemo(() => {
    if (layout.width <= 0 || layout.height <= 0) return [];
    return layoutAlignedGradeMarks(
      problems.map((problem) => {
        if (!isGeminiBBox(problem.bbox)) return null;
        const box = mapGeminiBBoxToView(problem.bbox, layout.width, layout.height);
        if (box.width <= 0 || box.height <= 0) return null;
        return { box, isBlank: isBlankStudentAnswer(problem.student_answer) };
      }),
    );
  }, [layout, problems]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout({ width, height });
  };

  return (
    <View
      className="mt-4 overflow-hidden rounded-2xl bg-black/10"
      style={[styles.frame, { aspectRatio }]}
      onLayout={onLayout}
    >
      <ZoomableView onInteractionChange={onGestureActive}>
        <View style={styles.layer} pointerEvents="box-none">
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          {problems.map((problem, index) => {
            const mark = alignedMarks[index];
            if (!mark) return null;
            return (
              <Pressable
                key={problem.id}
                accessibilityRole="button"
                accessibilityLabel={`${problem.problem_label} ${problem.is_correct ? "正解" : "不正解"}`}
                hitSlop={6}
                onPress={() => onPressProblem(problem)}
                style={{
                  position: "absolute",
                  left: mark.x,
                  top: mark.y,
                  width: mark.size,
                  height: mark.size,
                }}
              >
                {problem.is_correct ? <CorrectMark size={mark.size} /> : <IncorrectMark size={mark.size} />}
              </Pressable>
            );
          })}
        </View>
      </ZoomableView>
    </View>
  );
}

function CorrectMark({ size }: { size: number }) {
  const stroke = MARK_STROKE_WIDTH;
  const r = Math.max(0, (size - stroke) / 2);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={MARK_RED} strokeWidth={stroke} fill="none" />
    </Svg>
  );
}

function IncorrectMark({ size }: { size: number }) {
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

export function ProblemDetailSheet({
  problem,
  onClose,
  onToggle,
}: {
  problem: OverlayProblem | null;
  onClose: () => void;
  onToggle: () => void;
}) {
  if (!problem) return null;
  const coachingTip = displayCoachingTip(problem.is_correct, problem.parent_coaching_tip);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="詳細を閉じる" />
        <View className="rounded-t-3xl bg-cream px-5 pb-8 pt-4" style={{ zIndex: 1 }} pointerEvents="auto">
          <View className="mb-3 h-1 w-12 self-center rounded-full bg-ink/20" />
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-ink">問 {problem.problem_label}</Text>
            <Pressable
              onPress={onToggle}
              className={`rounded-full px-3 py-1 ${problem.is_correct ? "bg-emerald-600" : "bg-maru-500"}`}
            >
              <Text className="font-bold text-white">{problem.is_correct ? "〇 正解" : "✕ 不正解"}</Text>
            </Pressable>
          </View>
          <Text className="mt-1 text-xs text-ink/60">
            {problem.topic_tag}　／　{MISTAKE_LABELS[problem.mistake_type]}
          </Text>
          <Text className="mt-1 text-xs text-ink/50">ピンチで拡大。マークまたはボタンで〇✕を修正できます</Text>
          <ScrollView className="mt-3 max-h-64" keyboardShouldPersistTaps="handled">
            <Text className="text-xs font-semibold text-ink/50">生徒の解答</Text>
            <Text className="mt-1 text-sm text-ink">{problem.student_answer || "（なし）"}</Text>
            <Text className="mt-3 text-xs font-semibold text-ink/50">解答</Text>
            <Text className="mt-1 text-sm text-ink">{problem.correct_answer || "（なし）"}</Text>
            {coachingTip ? (
              <>
                <Text className="mt-3 text-xs font-semibold text-ink/50">アドバイス</Text>
                <Text className="mt-1 text-sm leading-5 text-ink/80">{coachingTip}</Text>
              </>
            ) : null}
          </ScrollView>
          <Pressable className="mt-5 rounded-xl bg-ink py-3" onPress={onClose}>
            <Text className="text-center font-semibold text-white">閉じる</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    minHeight: 280,
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
});
