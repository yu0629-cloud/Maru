import { useMemo } from "react";
import { chooseAnswerStyle, type PrintDocumentInput } from "@/src/features/print/html";
import { toPrintProblems } from "@/src/features/print/from-reviews";
import { mockPrintDocumentInput } from "@/src/features/print/mock";
import { useDailyReviews } from "@/src/features/review/useDailyReviews";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";

function dateLabelOf(now = new Date()) {
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
}

function titleOf(now = new Date()) {
  return `${now.getMonth() + 1}月${now.getDate()}日のまとめプリント`;
}

export function usePrintDocument(): PrintDocumentInput {
  const { currentChild } = useCurrentChild();
  const { daily } = useDailyReviews();

  return useMemo(() => {
    const now = new Date();
    const fallback = mockPrintDocumentInput();
    const problems = toPrintProblems(daily).map((problem) => ({
      ...problem,
      answerStyle: chooseAnswerStyle(problem),
    }));
    return {
      ...fallback,
      title: titleOf(now),
      childName: currentChild?.name ?? fallback.childName,
      dateLabel: dateLabelOf(now),
      includeCheatSheet: false,
      problems,
    };
  }, [currentChild?.name, daily]);
}
