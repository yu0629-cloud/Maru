import { useEffect, useMemo, useState } from "react";
import { chooseAnswerStyle, type PrintDocumentInput, type PrintProblem } from "@/src/features/print/html";
import { collectPrintProblems } from "@/src/features/print/from-reviews";
import { mockPrintDocumentInput } from "@/src/features/print/mock";
import { fetchIncorrectProblemsForPrint, resolvePrintImageUrls } from "@/src/features/print/service";
import { useDailyReviews } from "@/src/features/review/useDailyReviews";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";
import { useScanStore } from "@/src/stores/scanStore";
import { usePrintStore } from "@/src/stores/printStore";
import { t, useAppLocale } from "@/src/i18n";

function dateLabelOf(now = new Date()) {
  return t("date.yearMonthDay", {
    y: now.getFullYear(),
    m: now.getMonth() + 1,
    d: now.getDate(),
  });
}

function titleOf(now = new Date()) {
  return t("date.printTitle", { m: now.getMonth() + 1, d: now.getDate() });
}

function scanFingerprint(scans: Record<string, { id: string; problems?: Array<{ is_correct?: boolean }> }>) {
  return Object.values(scans)
    .map((scan) =>
      `${scan.id}:${(scan.problems ?? []).filter((problem) => problem.is_correct !== true).length}`,
    )
    .join("|");
}

export function usePrintDocument(): PrintDocumentInput & {
  candidates: PrintProblem[];
  imagesReady: boolean;
} {
  const locale = useAppLocale();
  const { currentChild } = useCurrentChild();
  const { items, daily, todayRedo, mocked, refresh } = useDailyReviews();
  const scans = useScanStore((state) => state.scans);
  const scansKey = scanFingerprint(scans);
  const scope = usePrintStore((state) => state.scope);
  const excludedIds = usePrintStore((state) => state.excludedIds);
  const [extras, setExtras] = useState<PrintProblem[]>([]);

  useEffect(() => {
    void refresh();
  }, [refresh, scansKey]);

  useEffect(() => {
    let cancelled = false;
    if (mocked || !currentChild?.id) {
      setExtras([]);
      return () => {
        cancelled = true;
      };
    }
    void fetchIncorrectProblemsForPrint(currentChild.id).then((next) => {
      if (!cancelled) setExtras(next);
    });
    return () => {
      cancelled = true;
    };
  }, [currentChild?.id, mocked, scansKey]);

  const candidates = useMemo(() => {
    return collectPrintProblems({
      reviews: items,
      scans: Object.values(scans),
      extras,
      childId: currentChild?.id,
      allowMockFallback: mocked,
      scope,
      preferredIds:
        scope === "today"
          ? todayRedo.map((item) => item.id)
          : daily.map((item) => item.problemId || item.id),
    }).map((problem) => ({
      ...problem,
      answerStyle: chooseAnswerStyle(problem),
    }));
  }, [currentChild?.id, daily, extras, items, mocked, scans, scope, todayRedo]);

  const excluded = useMemo(() => new Set(excludedIds.map((id) => String(id))), [excludedIds]);
  const visibleProblems = useMemo(
    () => candidates.filter((problem) => !excluded.has(String(problem.id))),
    [candidates, excluded],
  );
  const [resolvedProblems, setResolvedProblems] = useState<PrintProblem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResolvedProblems(null);
    void resolvePrintImageUrls(visibleProblems)
      .then((next) => {
        if (!cancelled) setResolvedProblems(next);
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedProblems(
            visibleProblems.map((problem) => ({
              ...problem,
              figureImageSrc: "",
              figureBase64: "",
              parentFigureSrc: "",
              parentFigureBase64: "",
              subFigureSrc: "",
              subFigureBase64: "",
              imageSrc: "",
            })),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visibleProblems]);

  return useMemo(() => {
    const now = new Date();
    const fallback = mockPrintDocumentInput();
    const problems = resolvedProblems ?? visibleProblems;
    const childName = currentChild?.name ?? fallback.childName;
    return {
      ...fallback,
      title: titleOf(now),
      childName,
      dateLabel: dateLabelOf(now),
      includeCheatSheet: false,
      problems,
      candidates,
      imagesReady: resolvedProblems !== null,
      scope,
      brand: t("print.brand"),
      nameLabel: t("print.nameLabel", { name: childName ?? "—" }),
      emptyLabel: t("print.emptySheet"),
      htmlLang: locale,
    };
  }, [candidates, currentChild?.name, locale, resolvedProblems, scope, visibleProblems]);
}
