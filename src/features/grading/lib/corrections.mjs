export const MISTAKE_LABELS = {
  none: "正解",
  careless: "ケアレスミス",
  concept_gap: "概念の穴",
  blank: "無解答",
};

export function recountScore(problems) {
  const correct = problems.filter((problem) => problem.is_correct).length;
  return {
    earned: correct,
    max: Math.max(problems.length, 1),
  };
}

export function toggleProblemCorrect(problem) {
  const isCorrect = !problem.is_correct;
  return {
    ...problem,
    is_correct: isCorrect,
    mistake_type: isCorrect ? "none" : problem.student_answer ? "careless" : "blank",
    needs_inpaint: !isCorrect && Boolean(problem.student_answer),
    dirty: true,
  };
}

export function problemsNeedingInpaint(problems) {
  return problems.filter((problem) => problem.is_correct === false && problem.needs_inpaint === true);
}
