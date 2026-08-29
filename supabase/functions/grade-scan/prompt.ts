import type { CarteJson } from "./schema.ts";

export type PromptChild = {
  name?: string | null;
  gradeLabel?: string | null;
  examTarget?: string | null;
};

function percent(rate: number | undefined): string {
  if (rate === undefined || Number.isNaN(rate)) return "不明";
  return `${Math.round(rate * 100)}%`;
}

export function formatCarteForPrompt(carte: CarteJson | null | undefined): string {
  if (!carte) {
    return [
      "カルテ未作成（初回スキャン）。",
      "- 基礎定着率は未計測として、見た目の難易度だけで判定する。",
      "- つまずきは慎重に。careless と決めつけない。",
    ].join("\n");
  }

  const weak = (carte.weak_units ?? [])
    .map((unit) => {
      const name = unit.unit ?? "未分類";
      const rate = percent(unit.rate);
      const n = unit.total ?? 0;
      return `- ${name}（正答率 ${rate}, n=${n}）`;
    })
    .join("\n");

  const priority = carte.triage?.priority_units?.join("、") || "なし";

  return [
    `基礎定着率: ${percent(carte.foundation_rate)}`,
    `トリアージ: ${carte.triage?.level ?? "watch"}`,
    `要約: ${carte.triage?.summary ?? ""}`,
    `優先単元: ${priority}`,
    `累計スキャン: ${carte.scan_count ?? 0} / 累計問題: ${carte.problem_count ?? 0}`,
    "苦手単元:",
    weak || "- （まだ弱い単元は検出されていない）",
  ].join("\n");
}

/** 抽出＋自己検証。ground_truth は手書きを見る前に導く。正誤はサーバでも再判定する */
export function buildSystemPrompt(_carte?: CarteJson | null, child?: PromptChild): string {
  const childLine = [
    child?.name ? `名前: ${child.name}` : null,
    child?.gradeLabel ? `学年: ${child.gradeLabel}` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return [
    "問題を抽出して JSON だけ返す。解説文は書くな。",
    childLine ? `対象: ${childLine}` : "",
    "ルートに subject と problems を置く。",
    "subject はプリント全体の教科を1つ。math=算数・数学、japanese=国語（日本）、spelling_phonics=スペル・フォニックス・語彙、reading=英語の読解、writing_grammar=文法・ライティング、science=理科・科学、social_studies=社会・歴史・地理、world_languages=外国語、other=その他。",
    "画像の中身から推測する。数式・計算・図形なら math。ひらがな・漢字・国語の読解なら japanese。アルファベット表・フォニックス・スペル・語彙なら spelling_phonics。英語の長文読解なら reading。英文法・作文なら writing_grammar。実験・植物・天気・STEM なら science。地図・歴史・公民・Social Studies なら social_studies。スペイン語など外国語なら world_languages。迷ったら other。other のときはプリントのタイトルを topic に残す。",
    "各問は problem_index, question_text, ground_truth, student_answer, is_correct, correct_answer, type, topic, bbox, visual_type, crop_box, question_unit。",
    "キーの意味を厳守する。混ぜない。",
    "【採点思考。JSON を書く前に必ずこの順で行う。書かれている手書きを正解だとみなすな】",
    "Step 1 ground_truth: 印刷された問題文・図・分度器の目盛り・語群（選択肢）・実験の表だけから、自分で真の正解をゼロから導く。手書きはまだ見るな。鋭角なら内側の目盛り（右0°基準なら50°）、鈍角なら外側。語群に 50° と 130° の両方があっても、手書き側を選ぶな。『すべて選び』は表や文を自分で判定し、正しい番号をすべて列挙する（例: 1,3）。計算は式を自分で解け。",
    "Step 2 student_answer: 子どもの手書きをそのまま読む。語群にある「130°」や誤った「2」でも、書いたとおり抽出する。白紙は空文字。",
    "Step 3 is_correct: ground_truth と student_answer を厳密に比較する。一致しなければ必ず false。『すべて選べ』で一部しか選んでいない場合（正解が 1と3 なのに 2 だけ等）も false。",
    "ground_truth に手書きをコピーするな。student_answer を正解に寄せて直すな。",
    'problem_index: 丸数字や先頭の番号だけ（例: "14", "3"）。式を入れない。',
    "question_unit: 復習プリント用の完全ユニット。大問の親図と設問ごとの表を分けて埋める。",
    "【自己完結】教科・レイアウトを問わず、その問題を解くために必要な要素を欠かさず入れる。参照だけ書いて前提を落とすな。",
    "設問文に「図」「表」「グラフ」「資料」「会話文」「下線部」「選択肢」「語群」などの参照指示があるときは、解答に必須の前提、およびあった方が解きやすい前提を漏れなく特定する。大問のリード文・共通本文は parent_context、共通図は parent_figure_box、設問固有の表・グラフは sub_figure_box、①②③や語群は options_text。",
    "question_unit.parent_context: 大問全体の前提説明文・リード文・会話文・資料の導入（例: 「下の図のような手順で、てこが水平につり合うのは…」「次の文章を読んで、あとの問いに答えなさい。」）。context_text と同じ文字列。単独の計算式なら空文字。passage_based なら本文・対話・下線部の属する段落をここにも入れる。",
    "question_unit.context_text: parent_context と同じ。",
    'question_unit.question_text: その小問だけの設問を文末まで完全に写す（例: "(3) 実験の結果を表にまとめると…", "次の①〜③からすべて選び、番号を書きましょう。", "2 + 6 ="）。「選び、番号を書きましょう。」「記号を書きましょう。」「答えなさい。」など指示の終わりまで含める。途中で切るな。問題番号だけは禁止。トップレベルの question_text と同じ内容にする。',
    'question_unit.options_text: ①②③④やア〜エ、語群があるときはすべての選択肢を省略せず全文（例: "① 支点からのきょりが2倍 ② おもりを2倍 ③ 力点と作用点を入れかえる" / "語群: 50° 130°"）。2つだけ抜粋するな。無ければ空文字。',
    "question_unit.parent_figure_box: [ymin, xmin, ymax, xmax]（各 0〜1000）。下記【図・表の完全境界認識】に従い純粋な図の最小完全矩形を返す。同じ大問の小問では同じ座標。無いときは [0,0,0,0]。",
    "question_unit.sub_figure_box: [ymin, xmin, ymax, xmax]。その設問だけのデータ表・表組み・グラフ・補足図（罫線のある表も視覚要素として入れる）。設問に「表にまとめると」（OCRで「和にまとめると」と読めても同じ）「次の表」「下の表」「グラフ」「実験の結果」「下のようになりました」などがあり、表が必須またはあった方が解きやすい小問（例: (2)(3)(6)）は、左のうで・右のうで・おもりの位置と重さなどのデータ表を必ずこの箱で囲む。[0,0,0,0] や null は禁止。大問に共通図（てこ図）と小問に表があるときは、解くのに必須でもあった方がよくても parent_figure_box と sub_figure_box の両方を別々に埋める（表だけ／図だけにしない）。親図と重ねるな。見出し行から最終行・右端の罫線まで（完全境界認識を表にも適用）。手書きは入れない。表・グラフが無いときだけ [0,0,0,0]。",
    "question_unit.crop_box: parent_figure_box があればそれ、なければ sub_figure_box。図が無いときは [0,0,0,0]。トップレベルの crop_box と同じ値にする。",
    [
      "【図・表の完全境界認識】理科・算数・社会・英語などあらゆるレイアウトで汎用。parent_figure_box / sub_figure_box はイラスト単体ではなく、その図を成立させているすべての付属要素を含む最小の矩形を厳密に計算する。",
      "含める（Bounding Box 内に完全包含）: グラフィック本体（イラスト・写真・実験図・グラフ・表組み・幾何図形・地図・回路図など）／引き出し線・矢印の始点から終点／上下左右の注釈ラベル（ふた・底のない集気びん・すき間・ねん土・支点・目盛・単位など）／図の記号・連番（ア・イ・ウ・エ・㋐〜㋓・(a)(b)・図1・図2・❶❷❸など）／各パネル直下の短い手順説明（Caption。例: ●左のうでの目盛6のところに…）。",
      "除外する（Bounding Box の外側で切る）: 大問の導入文・リード文（「下の㋐〜㋓のようにして…次の問いに答えましょう。」など）／小問の設問本文（「(1) ㋐のろうそくの火は…」など）／解答欄・配点（「（ ）」「[10点]」）／手書き・丸付け／親図とは別位置の表（それは sub_figure_box）。",
      "境界の決め方: ymin=本体または最上部の引き出し線・ラベル文字のさらに上端（㋑上の「すき間」「ふた」を切るな）／ymax=最下部の記号（㋐〜㋓・ア〜エ）または手順注釈の下端。直下の小問番号「(1)」や設問テキストの直前で止める／xmin=最左の引き出し線先端・ラベル先頭文字まで完全に含める／xmax=一番右端の図（㋓のびん・❸のてこ）の右端枠まで完全に含める。切れたラベル・切れた右端は不合格。",
      "余白: 付属要素の外側に約 2〜3% だけ（紙の外側や黒い背景は入れない）。",
    ].join("\n"),
    'question_text: question_unit.question_text と同じ。計算なら "2 + 6 =" のように等号まで。手書きは入れない。問題番号だけ（"14" など）は厳禁。文末まで切るな。',
    "student_answer: 解答欄の子どもの手書き。白紙は空文字。",
    "correct_answer: ground_truth と同じ値。手書きではない。",
    "bbox: [ymin, xmin, ymax, xmax]（各 0〜1000）。式全体でも問番号でもなく、子どもが答えを書くスペース（印刷された「=」のすぐ右側の解答欄）だけ。空欄でもその解答位置を囲む。高さは当該行のみ。隣の行・左の式・丸番号・机は入れない。",
    "visual_type: text_only / has_figure / passage_based のどれか1つ。計算式・漢字・語彙など文字だけで解けるなら text_only。図形・グラフ・時計・イラスト・表・資料など画像がないと解けないなら has_figure。長文読解・対話文・会話文・下線部など共通の本文が必要ななら passage_based。",
    "crop_box: question_unit.crop_box と同じ（親図があれば親図）。",
    "passage_text: passage_based のとき question_unit.context_text と同じ本文。それ以外は空文字。",
    [
      "【抽出例】",
      "プリントに「⑭ 2 + 6 =」（右は空欄または手書き）とある場合：",
      '{ "problem_index": "14", "question_text": "2 + 6 =", "ground_truth": "8", "student_answer": "", "is_correct": false, "correct_answer": "8", "type": "math", "topic": "くり上がりのない足し算", "bbox": [解答欄], "visual_type": "text_only", "crop_box": [式の範囲], "question_unit": { "context_text": "", "question_text": "2 + 6 =", "options_text": "", "crop_box": [式の範囲] } }',
      "同様に「0 + 7 =」も question_text は \"0 + 7 =\"。",
      "プリントに「⑯ 2 + 4 = 6」と書かれている場合：",
      '- problem_index: "16"',
      '- question_text: "2 + 4 ="',
      '- ground_truth: "6"',
      '- student_answer: "6"',
      '- is_correct: true',
      '- correct_answer: "6"',
      "- bbox: 「=」のすぐ右の「6」の位置（式 2 + 4 や ⑯ は含めない）",
      "分度器の図で鋭角㋐を読み、語群に 50° と 130° があり、子どもが外側の 130° と書いた場合：",
      '- question_unit.context_text: "次の図の角㋐について答えなさい。"',
      '- question_unit.question_text: "④ ㋐の角度は、( )です。"',
      '- question_unit.options_text: "語群: 130° 50°"',
      '- ground_truth: "50°"（内側目盛り。手書きの 130° をコピーするな）',
      '- student_answer: "130°"（書いたとおり）',
      "- is_correct: false",
      "- visual_type: has_figure",
      "国語の『次の文章を読んで』で下線部①の意味を問う場合：",
      '- question_unit.parent_context: 本文（下線部を含む会話文・資料文）',
      '- question_unit.question_text: "下線部①の意味として最も適切なものを選びなさい。"',
      '- question_unit.options_text: ア〜エを全文',
      "- visual_type: passage_based",
      "理科のろうそく実験図（㋐〜㋓が横並び）の場合：",
      '- question_unit.parent_context: "下の㋐〜㋓のようにして、ろうそくの燃え方を比べました。次の問いに答えましょう。"',
      "- question_unit.parent_figure_box: 4本の集気びん＋左ラベル（ふた・底のない集気びん・ねん土・燃えているろうそく）＋上下の「すき間」ラベル＋引き出し線＋下の㋐㋑㋒㋓。リード文と小問(1)は含めない。㋑上／㋒下の「すき間」や㋓の右端を切るな",
      "てこの『①〜③からすべて選び』で、実験の全体図とおもりの表があり、表から正しいのは ① と ③、子どもが ② だけ書いた場合：",
      '- question_unit.parent_context: "下の図のような手順で、てこが水平につり合うのはどれですか。"',
      '- question_unit.question_text: "次の①〜③からすべて選び、番号を書きましょう。"',
      '- question_unit.options_text: "① 支点からのきょりが2倍 ② おもりを2倍 ③ 力点と作用点を入れかえる"',
      "- question_unit.parent_figure_box: てこ手順図 ❶❷❸ の3つ全部（左端ラベル〜右端の支柱・おもり）＋直下の注釈最下行まで。その下のリード文断片・表・小問「(1)」は含めない",
      "- question_unit.sub_figure_box: おもりデータ表だけ（親図は含めない）。「表にまとめると」「下の表」「グラフ」「実験の結果」の小問（(2)(3)(6) など）では空にするな。罫線のある表も入れる。図と表の両方があり、必須またはあった方が解きやすいときは両方入れる（片方だけにしない）",
      '- ground_truth: "1,3"',
      '- student_answer: "2"',
      "- is_correct: false（2 を ground_truth にコピーするな。一部選択も不正解）",
      "※ question_text に \"14\" や \"16\" だけを入れるな。必ず式または設問を抽出する。",
    ].join("\n"),
    "type は math か text。topic は必須。小学生・幼児向けの具体的な日本語の単元名（例: くり上がりのある足し算、くり下がりのない引き算、漢字の読み、漢字の書き取り、ひらがな）。番号や式を topic にしない。",
    "student_answer は薄い鉛筆も読む。低学年の筆跡（丸い4、繋がる9、雪だるまの8、閉じた0）を正しい数字にする。書いてあれば空にしない。本当に白紙だけ空文字。",
    "1問=1件。まとめない。",
    "【自己検証】JSON を出す前に、抽出した parent_context・親図・question_text・sub_figure・options_text だけで ground_truth が導けるか確認する。親図について完全境界認識を再確認: 上の「すき間」「ふた」や引き出し線が切れていないか（切れていたら ymin を上げる）／左の「ふた」「底のない集気びん」「ねん土」が切れていないか（切れていたら xmin を広げる）／右端の㋓・エ・❸の図が切れていないか（切れていたら xmax を広げる）／下の㋐〜㋓・ア〜エ・手順注釈が切れていないか（切れていたら ymax を広げる）／リード文や小問「(1)」が入っていたら ymax を上げて外す。枠外の黒い余白を入れすぎていたら箱を少し縮める。表にまとめると／下の表／グラフ／実験の結果（和にまとめるとと読めても同じ）なのに sub_figure_box が空なら表を探して埋める。親図と表があり解くのに必須またはあった方がよい小問は両方入れる。",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildUserPrompt(): string {
  return [
    "subject と problems を返せ。各問に ground_truth と topic を必ず付ける。",
    "先に図と印刷文から ground_truth を出し、次に手書きを student_answer に取り、最後に比較して is_correct を付ける。",
    '例: { "subject": "math", "problems": [{ "problem_index": "4", "question_text": "④ ㋐の角度は、( )です。", "ground_truth": "50°", "student_answer": "130°", "is_correct": false, "correct_answer": "50°", "type": "math", "topic": "角度", "bbox": [ymin,xmin,ymax,xmax], "visual_type": "has_figure", "crop_box": [ymin,xmin,ymax,xmax], "question_unit": { "context_text": "次の図の角㋐について答えなさい。", "question_text": "④ ㋐の角度は、( )です。", "options_text": "語群: 130° 50°", "crop_box": [ymin,xmin,ymax,xmax] } }] }',
    "question_unit で parent_context・小問・選択肢・parent_figure_box・sub_figure_box を欠かさず入れる。設問中の参照語（図・表・グラフ・資料・会話文・下線部・選択肢・語群）がある問は、必須およびあった方が解きやすい前提文と図を欠かさず入れる。【図・表の完全境界認識】に従い、横並び図（てこ3つ・ろうそく㋐〜㋓）は左端ラベルから一番右端（㋓のびん・支柱・おもり）まで。引き出し線と「ふた」「ねん土」「すき間」などのラベルを切るな。親図の ymax は記号・手順注釈の最下行で止め、リード文断片や小問「(1)」を図に入れるな。てこ図とデータ表があり、解くのに必須またはあった方がよいときは両方の箱を入れる（片方だけにしない）。表にまとめると／下の表／グラフ／実験の結果（和にまとめるとと読めても同じ。(2)(3)(6) など）は sub_figure_box を空にするな。罫線のある表も入れる。手書きは図に入れるな。question_text は式または設問を文末まで。選択肢は漏れなく。親図と表は分ける。問番号（14）を入れるな。抽出した情報だけで正解が導けるか最後に確認する。",
    "bbox は「=」のすぐ右の解答欄。式全体ではない。ground_truth に手書きを入れるな。",
  ].join(" ");
}

const GRADE_LABELS: Record<string, string> = {
  e1: "小1",
  e2: "小2",
  e3: "小3",
  e4: "小4",
  e5: "小5",
  e6: "小6",
  j1: "中1",
  j2: "中2",
  j3: "中3",
};

export function gradeCodeToLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return GRADE_LABELS[code] ?? code;
}
