/** OCR で「表」が「和」などと誤る定型句を直す */
export function normalizeOcrText(value) {
  return String(value ?? "")
    .replace(/[和衰裏乗]にまとめると/g, "表にまとめると")
    .replace(/[和衰裏乗]にまとめ/g, "表にまとめ");
}

/** 表・グラフが必須、またはあった方が解きやすい設問か */
export function mentionsDataTable(value) {
  return /[表和衰裏乗]にまとめると|表にまとめ|次の表|下の表|上の表|右の表|左の表|表から|表を見|表より|表の中|結果を表|グラフから|グラフを見|グラフ/.test(
    String(value ?? ""),
  );
}
