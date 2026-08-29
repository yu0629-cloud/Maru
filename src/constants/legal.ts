import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

const DEFAULT_TERMS_URL =
  "https://docs.google.com/document/d/e/2PACX-1vTL3BWhJjqpCTwHVwMMP-VTs23cnsOIZEXPYkpaPOuPXXwoWup__BCyx1TTpTk7WF9zG6oCiKQdgA8d/pub";
const DEFAULT_PRIVACY_URL =
  "https://docs.google.com/document/d/e/2PACX-1vTWB0rsfyNkGyv-gXf_BiRjPNjXNdmyxyWvVnNpDi71jVD0ETbc7ZFM2IOuO6Ah6tl-fb6Lx0FUGLNQ/pub";
const DEFAULT_COMMERCE_URL =
  "https://docs.google.com/document/d/e/2PACX-1vRnrBL151s-KjWlLSK4CfdQFNvcQq8EG_DV69BC7vOOl_j0i53IEoatHzkBwPtQGvyBx5n9Xz6PTnMq/pub";

function envUrl(value: string | undefined, fallback: string | null) {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
}

export const LEGAL_DOCS = {
  terms: {
    title: "利用規約",
    url: envUrl(process.env.EXPO_PUBLIC_TERMS_URL, DEFAULT_TERMS_URL),
    body: `MARU 利用規約（草案）

1. 本サービスは、保護者が家庭学習のプリントを撮影し、丸付け・復習・印刷を行うためのツールです。
2. 学習結果やカルテは保護者の判断を補助するものであり、学校の成績や合否を保証しません。
3. アカウントは保護者本人が管理し、同時ログインは2台までとします。
4. 無料プランは初回10枚のスキャン、有料プランは表示の月次枚数と子ども人数を上限とします。
5. 追加スキャンチケットは有料会員のみ購入できます。
6. 本規約は予告なく改定されることがあります。`,
  },
  privacy: {
    title: "プライバシーポリシー",
    url: envUrl(process.env.EXPO_PUBLIC_PRIVACY_URL, DEFAULT_PRIVACY_URL),
    body: `MARU プライバシーポリシー（草案）

1. 取得する情報: アカウント情報、子どもの学年・教科、撮影したプリント画像、採点結果、端末識別子。
2. 利用目的: 丸付け、カルテ作成、復習キュー、印刷、同時ログイン制限、課金状態の同期。
3. 外部委託: 認証・データベースは Supabase、画像認識は Google Gemini、手書き消去は Replicate、課金は RevenueCat / Apple / Google。
4. 保管: 画像は保護者ID配下のストレージに保存し、アカウント削除時に消去します。
5. 第三者提供: 法令に基づく場合を除き、個人を特定できる学習データを販売しません。
6. お問い合わせ: アプリ内の設定画面から削除・ログアウトが可能です。`,
  },
  commerce: {
    title: "特定商取引法に基づく表記",
    url: envUrl(process.env.EXPO_PUBLIC_TOKUSHOHO_URL, DEFAULT_COMMERCE_URL),
    body: `特定商取引法に基づく表記（草案）

販売事業者: （ストア申請時に記入）
運営責任者: （ストア申請時に記入）
所在地: （請求があれば遅滞なく開示）
連絡先: support@maru.example

販売価格:
- スタンダード 月額 980円 / 年額 9,800円
- ファミリー 月額 1,480円 / 年額 14,800円
- 追加スキャン 50枚 300円 / 100枚 500円（有料会員限定）

支払時期: アプリ内課金の決済時（Apple / Google の規約に従う）
提供時期: 決済完了後ただちに利用可能
解約: ストアの定期購入管理から解約。日割り返金はストア規約に従う
返品: デジタルコンテンツの性質上、提供開始後の返品には応じられません（法令に基づく場合を除く）`,
  },
} as const;

export type LegalDocId = keyof typeof LEGAL_DOCS;
export const LEGAL_LINK_IDS = ["privacy", "terms", "commerce"] as const;

/** In-App Browser。失敗時は外部ブラウザへフォールバックする */
export async function openLegalUrl(url: string | null | undefined) {
  const target = String(url ?? "").trim();
  if (!target) return;
  try {
    await WebBrowser.openBrowserAsync(target);
  } catch {
    await Linking.openURL(target);
  }
}
