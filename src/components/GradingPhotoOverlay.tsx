import { useEffect, useMemo, useRef, useState } from "react";
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
import { ZoomableView } from "@/src/components/ZoomableView";
import { CorrectMark, IncorrectMark, useGradeResultLabel, useResolvedMarkStyle } from "@/src/components/GradeMark";
import { t, tMistake, useT } from "@/src/i18n";
import { displayProblemNumber } from "@/src/features/print/html";
import {
  displayCoachingTip,
  type GradedProblemView,
} from "@/src/features/grading/corrections";
import {
  isBlankStudentAnswer,
  isGeminiBBox,
  layoutAlignedGradeMarks,
  mapGeminiBBoxToView,
} from "@/src/features/grading/overlay-layout";

const A4_ASPECT = 210 / 297;

type OverlayProblem = Pick<
  GradedProblemView,
  | "id"
  | "problem_label"
  | "question_text"
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
  onUnavailable,
}: {
  uri: string;
  problems: OverlayProblem[];
  onPressProblem: (problem: OverlayProblem) => void;
  onGestureActive?: (active: boolean) => void;
  onUnavailable?: () => void;
}) {
  useT();
  const markStyle = useResolvedMarkStyle();
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  useEffect(() => {
    let cancelled = false;
    setNatural(null);
    Image.getSize(
      uri,
      (width, height) => {
        if (!cancelled && width > 0 && height > 0) setNatural({ width, height });
      },
      () => {
        if (!cancelled) {
          setNatural(null);
          onUnavailableRef.current?.();
        }
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
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            onError={() => onUnavailableRef.current?.()}
          />
          {problems.map((problem, index) => {
            const mark = alignedMarks[index];
            if (!mark) return null;
            return (
              <Pressable
                key={problem.id}
                accessibilityRole="button"
                accessibilityLabel={t("scan.markA11y", {
                  label:
                    displayProblemNumber({
                      problem_label: problem.problem_label,
                      question_text: problem.question_text,
                    }) || problem.problem_label,
                  result: problem.is_correct ? t("scan.correctShort") : t("scan.incorrectShort"),
                })}
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
                {problem.is_correct ? <CorrectMark size={mark.size} style={markStyle} /> : <IncorrectMark size={mark.size} />}
              </Pressable>
            );
          })}
        </View>
      </ZoomableView>
    </View>
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
  const resultLabel = useGradeResultLabel(problem?.is_correct ?? false);
  if (!problem) return null;
  const coachingTip = displayCoachingTip(problem.is_correct, problem.parent_coaching_tip);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t("scan.closeDetail")} />
        <View className="rounded-t-3xl bg-cream px-5 pb-8 pt-4" style={{ zIndex: 1 }} pointerEvents="auto">
          <View className="mb-3 h-1 w-12 self-center rounded-full bg-ink/20" />
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-ink">
              {t("common.question", {
                label:
                  displayProblemNumber({
                    problem_label: problem.problem_label,
                    question_text: problem.question_text,
                  }) || problem.problem_label,
              })}
            </Text>
            <Pressable
              onPress={onToggle}
              className={`rounded-full px-3 py-1 ${problem.is_correct ? "bg-emerald-600" : "bg-maru-500"}`}
            >
              <Text className="font-bold text-white">{resultLabel}</Text>
            </Pressable>
          </View>
          <Text className="mt-1 text-xs text-ink/60">
            {problem.topic_tag}　／　{tMistake(problem.mistake_type)}
          </Text>
          {problem.question_text ? (
            <Text className="mt-2 text-base font-semibold text-ink">{problem.question_text}</Text>
          ) : null}
          <Text className="mt-1 text-xs text-ink/50">{t("scan.pinchSheetHint")}</Text>
          <ScrollView className="mt-3 max-h-64" keyboardShouldPersistTaps="handled">
            <Text className="text-xs font-semibold text-ink/50">{t("scan.studentAnswerLabel")}</Text>
            <Text className="mt-1 text-sm text-ink">{problem.student_answer || t("common.none")}</Text>
            <Text className="mt-3 text-xs font-semibold text-ink/50">{t("scan.answerLabel")}</Text>
            <Text className="mt-1 text-sm text-ink">{problem.correct_answer || t("common.none")}</Text>
            {coachingTip ? (
              <>
                <Text className="mt-3 text-xs font-semibold text-ink/50">{t("scan.advice")}</Text>
                <Text className="mt-1 text-sm leading-5 text-ink/80">{coachingTip}</Text>
              </>
            ) : null}
          </ScrollView>
          <Pressable className="mt-5 rounded-xl bg-ink py-3" onPress={onClose}>
            <Text className="text-center font-semibold text-white">{t("common.close")}</Text>
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
