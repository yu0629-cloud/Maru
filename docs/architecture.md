# MARU 初期アーキテクチャ

小学生〜中学受験生の親向け、家庭学習・解き直し特化型アシスタント。

## ディレクトリ構成

```text
MARU/
├── app/                          # Expo Router（画面）
│   ├── _layout.tsx
│   ├── index.tsx                 # 未ログインは auth へ
│   ├── (auth)/login.tsx, signup.tsx
│   └── (app)/
│       ├── index.tsx             # ホーム（残数・今日の復習）
│       ├── camera/               # 撮影
│       ├── scan/[id].tsx         # 丸付け結果
│       ├── review/               # 1日3〜5問
│       ├── carte/                # 生徒カルテ
│       ├── print/                # A4 PDF
│       ├── children/             # 最大3人切り替え
│       └── settings/             # 課金・端末
├── src/
│   ├── components/               # 共通 UI（ChildSwitcher など）
│   ├── features/                 # ドメイン単位のロジック
│   │   ├── grading/              # 撮影→採点フロー
│   │   └── print/                # A4 HTML/PDF
│   ├── hooks/
│   ├── lib/
│   │   ├── supabase/             # クライアント
│   │   ├── storage/              # Storage パス規約
│   │   └── revenuecat/
│   ├── stores/                   # 現在の子どもなど
│   ├── types/
│   └── constants/                # プラン・復習定数
├── supabase/
│   ├── migrations/               # DB 定義（本リポジトリの正）
│   ├── functions/                # Gemini / LaMa / RevenueCat
│   └── seed.sql
└── docs/
    ├── architecture.md
    └── setup-guide.md          # Dev Client / EAS / TestFlight
```

## 主要データフロー

### 1. 撮影と自動丸付け

```text
親が子どもを選択
  → expo-camera でプリント撮影
  → Storage scan-originals/{parent}/{child}/{scan}/original.jpg
  → scans 行を pending で作成
  → consume_scan_quota(parent, scan)
       free: 初回10枚
       paid: 月次残数 → 追加チケット
  → Edge Function grade-scan
       Gemini 2.5 Flash Vision
       問題枠 bbox / 正誤 / 単元
  → 不正解のみ crop → inpaint-handwriting (Replicate LaMa)
  → problems 保存、scans を completed
  → enqueue_incorrect_problems（翌日以降に投入。当日枠は圧迫しない）
  → update_child_carte
```

### 2. カルテとトリアージ

`child_cartes` は子ども1人につき1行。`update_child_carte()` が全 `problems` を再集計する。

- `foundation_rate`: 正解数 / 判定済み問題数
- `subject_stats`: 教科・単元ごとの correct/total/rate/weak
- `weak_units`: 3問以上かつ正答率 60% 未満
- `triage.level`: solid / watch / needs_review / critical

### 3. 破綻しない復習キュー

```text
ホームまたは復習タブ
  → assign_daily_reviews(child, today)
  → daily_review_assignments に最大5問
  → 解答
  → record_review_result()
       正解: 間隔を ease_factor 倍
       不正解: 翌日に戻す
       3連続ミス: status=leech で退場
```

Leech と mastered は当日割当の対象外。新しい間違いも `next_review_on = 明日` のため、その日の5枠は埋まらない。

### 4. A4 まとめプリント

白紙化画像（`problem-blanks`）+ 解答欄（方眼/マス目）を HTML 化し、`expo-print` → `expo-sharing`。履歴は `print_jobs`。

### 5. 複数チルドレン

- `children` は親あたり最大3行。実制限はプランの `max_children`（free/standard=1, family=3）
- `profiles.current_child_id` をワンタップ更新
- スキャン・復習・カルテはすべて `child_id` で隔離

### 6. 課金と同時ログイン

| プラン | 月額 | スキャン | 子ども |
| --- | --- | --- | --- |
| フリー | 0 | 初回10枚買い切り | 1 |
| スタンダード | 980円 | 月150枚 | 1 |
| ファミリー | 1,480円 | 月400枚 | 3 |

追加チケット（50枚/300円、100枚/500円）は有料会員のみ。`credit_scan_tickets()` が残高を加算する。

`claim_device_session()` は同一親で最大2台。3台目は最終ハートビートが古い端末を追い出す。外された端末は `heartbeat_device_session()` が false を返し、自動ログアウトする。UI から既存端末を `revoke_device_session()` して入れ替えることもできる。

## Storage パス

`{bucket}/{parent_id}/{child_id}/{entity_id}/{file}`

RLS は先頭フォルダが `auth.uid()` であることだけを見る。
