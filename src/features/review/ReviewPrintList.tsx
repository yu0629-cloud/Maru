import { Pressable, Text, View } from "react-native";
import { formatMathExpression } from "@/src/features/print/html";
import { isBlankPrintAnswer, stripLatexDollars } from "@/src/features/print/from-reviews";
import type { PrintProblem } from "@/src/features/print/html";
import { usePrintStore } from "@/src/stores/printStore";
import { ExpiredMediaNotice } from "@/src/components/ExpiredMediaNotice";
import { t } from "@/src/i18n";

function cardStem(problem: PrintProblem) {
  const raw = stripLatexDollars(problem.questionText || problem.prompt || "");
  if (!raw) return "";
  if (/[0-9０-９].*[+\-×÷＋−*/=＝]/.test(raw) || /[+\-×÷＋−*/=＝].*[0-9０-９]/.test(raw)) {
    return formatMathExpression(raw) || raw;
  }
  return raw;
}

function answerLabel(problem: PrintProblem) {
  const student = stripLatexDollars(problem.studentAnswer);
  const correct = stripLatexDollars(problem.correctAnswer) || "—";
  if (isBlankPrintAnswer(problem) || !student) {
    return t("review.unanswered", { correct });
  }
  return t("review.answered", { student, correct });
}

function problemNumber(problem: PrintProblem, index: number) {
  const label = stripLatexDollars(problem.problemIndex || problem.label);
  if (label) return label.startsWith("問") || /^Q\d/i.test(label) ? label : t("common.question", { label });
  return t("common.question", { label: index + 1 });
}

export function ReviewPrintList({
  candidates,
}: {
  candidates: PrintProblem[];
}) {
  const excludedIds = usePrintStore((state) => state.excludedIds);
  const togglePrintSelection = usePrintStore((state) => state.togglePrintSelection);

  if (candidates.length === 0) {
    return (
      <Text className="mt-4 rounded-xl bg-white px-4 py-3 text-sm text-ink/70">
        {t("review.listEmpty")}
      </Text>
    );
  }

  return (
    <View className="mt-2">
      {candidates.map((problem, index) => {
        const selected = !excludedIds.includes(String(problem.id));
        const stem = cardStem(problem);
        return (
          <Pressable
            key={problem.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            className="mt-3 rounded-2xl bg-white p-4"
            onPress={() => togglePrintSelection(problem.id)}
          >
            <View className="flex-row items-start">
              <View
                className={`mr-3 mt-0.5 h-6 w-6 items-center justify-center rounded-md border ${
                  selected ? "border-maru-500 bg-maru-500" : "border-ink/30 bg-white"
                }`}
              >
                {selected ? <Text className="text-xs font-bold text-white">✓</Text> : null}
              </View>
              <View className="flex-1">
                <Text className="font-bold text-ink">{problemNumber(problem, index)}</Text>
                {stem ? <Text className="mt-2 text-lg font-semibold text-ink">{stem}</Text> : null}
                <Text className="mt-2 text-sm text-ink/70">{answerLabel(problem)}</Text>
                {problem.mediaExpired ? <ExpiredMediaNotice compact /> : null}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
