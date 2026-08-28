import type { CarteJson, GradeResult } from "../schema.ts";

/** 1x1 JPEG。モック実行用。実画像は fixtures/sample-worksheet.jpg を置いて上書きできる */
export const SAMPLE_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhUSEhIVFRUVFRUVFRUVFRUVFRUVFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAbAAABBQEBAAAAAAAAAAAAAAADAAIEBQYBB//EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmP/9k=";

export const SAMPLE_CARTE: CarteJson = {
  foundation_rate: 0.62,
  scan_count: 8,
  problem_count: 40,
  weak_units: [
    { subject: "math", unit: "つるかめ算", correct: 2, total: 8, rate: 0.25 },
    { subject: "math", unit: "繰り下がり", correct: 4, total: 9, rate: 0.4444 },
  ],
  subject_stats: {
    math: {
      correct: 18,
      total: 30,
      foundation_rate: 0.6,
    },
  },
  triage: {
    level: "needs_review",
    priority_units: ["つるかめ算", "繰り下がり"],
    summary: "定着が不安定な単元がある。1日3〜5問の復習枠を守る。",
  },
};

export const SAMPLE_GRADE_RESULT: GradeResult = {
  subject: "math",
  overall_score: { earned: 7, max: 10 },
  problems: [
    {
      problem_index: "大問1 (1)",
      question_text: "8 × 9 =",
      bbox: [80, 60, 260, 940],
      is_correct: true,
      student_answer: "72",
      correct_answer: "72。8×9=72。九九の基本問題。",
      topic_tag: "かけ算",
      difficulty_level: "basic",
      mistake_type: "none",
      parent_coaching_tip: "九九は安定しています。「この調子で、次の繰り下がりも同じ丁寧さでいこう」と一声かけてください。",
      needs_inpaint: false,
      problem_type: "calc_block",
    },
    {
      problem_index: "大問1 (2)",
      question_text: "52 - 18 =",
      bbox: [270, 60, 460, 940],
      is_correct: false,
      student_answer: "43",
      correct_answer: "34。52-18は十の位から繰り下がって 12-8=4、4-1=3。",
      topic_tag: "繰り下がり",
      difficulty_level: "basic",
      mistake_type: "concept_gap",
      parent_coaching_tip:
        "カルテでも苦手な繰り下がりです。十の位から借りる意識が抜けています。「怒らないよ。52の2から8は引けないね。隣から1借りて12にしてみよう」と、指で十の位をトントンしながら聞いてください。",
      needs_inpaint: true,
      problem_type: "calc_block",
    },
    {
      problem_index: "大問2",
      question_text: "つるとかめが合わせて10ひき、足の数が34本。それぞれ何ひき？",
      bbox: [480, 60, 820, 940],
      is_correct: false,
      student_answer: "つる4ひき、かめ6ひき",
      correct_answer:
        "つる3ひき、かめ7ひき。頭の数10、足の数34。全部かめだと40本、多い6本を2本差で割るとつるが3。",
      topic_tag: "つるかめ算",
      difficulty_level: "advanced",
      mistake_type: "concept_gap",
      parent_coaching_tip:
        "つるかめ算が最優先の穴です。式の意味より「全部かめにしたら足が何本余るか」が見えていません。「答えを急がなくていいよ。まず全部かめだったら足は何本？ そこから一緒に戻そう」と促してください。",
      needs_inpaint: true,
      problem_type: "standard",
    },
    {
      problem_index: "大問3",
      question_text: "立方体を切った切り口の形は？",
      bbox: [830, 60, 980, 940],
      is_correct: false,
      student_answer: "",
      correct_answer: "画像上は立方体の対角線を含む切断面。正六角形になる場合を確認。",
      topic_tag: "立体切断",
      difficulty_level: "advanced",
      mistake_type: "blank",
      parent_coaching_tip:
        "手つかずです。難問なので責めず、「今日は図に線を1本だけ書いてみよう。切った面が何角形に見える？」と入口だけ作ってあげてください。",
      needs_inpaint: false,
      problem_type: "math_geometry_graph",
    },
  ],
};
