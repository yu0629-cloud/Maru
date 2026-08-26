import type { PrintProblem } from "@/src/features/print/html";
import { MOCK_PRINT_PROBLEMS } from "@/src/features/print/mock";
import type { ReviewQueueItem } from "@/src/features/review/select";

export function toPrintProblems(reviews: ReviewQueueItem[]): PrintProblem[] {
  const mapped = reviews.map((item) => {
    const fallback =
      MOCK_PRINT_PROBLEMS.find((problem) => problem.id === item.problemId) ??
      MOCK_PRINT_PROBLEMS.find((problem) => problem.label === item.label);
    return {
      id: item.problemId || item.id,
      label: item.label,
      topicTag: item.topicTag,
      subject: item.subject,
      problemType: item.problemType ?? fallback?.problemType,
      imageSrc: item.imageSrc || fallback?.imageSrc,
      blankedImageSrc: item.blankedImageSrc || fallback?.blankedImageSrc,
      croppedImageSrc: item.croppedImageSrc || fallback?.croppedImageSrc,
      originalImageSrc: item.originalImageSrc || fallback?.originalImageSrc,
      bbox: item.bbox ?? fallback?.bbox,
      cropBox: item.cropBox ?? fallback?.cropBox,
      isCorrect: item.isCorrect ?? fallback?.isCorrect ?? false,
      isBlanked: item.isBlanked ?? Boolean(item.blankedImageSrc),
      studentAnswer: item.studentAnswer,
      prompt: item.prompt ?? fallback?.prompt,
      questionText: item.questionText ?? fallback?.questionText,
      problemIndex: item.problemIndex ?? item.label,
      expressions: item.expressions ?? fallback?.expressions,
      modelText: item.modelText ?? fallback?.modelText,
      correctAnswer: item.correctAnswer || fallback?.correctAnswer || "",
      parentCoachingTip: item.parentCoachingTip || fallback?.parentCoachingTip || "",
    } satisfies PrintProblem;
  });
  return mapped.length ? mapped : MOCK_PRINT_PROBLEMS.filter((problem) => problem.isCorrect !== true);
}
