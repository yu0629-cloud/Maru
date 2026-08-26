# MARU

小学生〜中学受験生を持つ親向けの、家庭学習・解き直し特化型 AI スマートアシスタント。

- 初期設計: [docs/architecture.md](docs/architecture.md)
- **実機・EAS / TestFlight**: [docs/setup-guide.md](docs/setup-guide.md)

## セットアップ

```bash
cp .env.example .env
npm install
npx supabase start
npx supabase db reset
npx expo start
```

モックだけで画面を見る場合は `.env` の `EXPO_PUBLIC_USE_MOCKS=1` を残すか、Supabase URL を空のままにします。

実機（Dev Client）や TestFlight は [セットアップガイド](docs/setup-guide.md) の手順で、`npx eas build --profile development --platform ios` から進めてください。Expo Go では課金 SDK とカメラの一部が動きません。

## 契約テスト

```bash
npm run typecheck
npm run test:grade-scan
npm run test:inpaint
npm run test:print-review
npm run test:leech
npm run test:scan-ui
npm run test:account
```

`test:account` は課金 Entitlement、追加チケットの有料会員限定、子ども人数上限、3台目ログインによる最古端末の失効を検証します。`test:leech` は要指導リストの手動クリア / 復習復帰を検証します。

## 課金・認証・子ども管理の確認手順

### モック（Web / Expo Go）

RevenueCat のネイティブ SDK は Expo Go では使えません。モック課金に自動で切り替わります。

```bash
npx expo start --web
```

1. ログイン画面で「開発用モックでホームへ」（またはメール / Google / ゲスト。モック時はすべてローカルセッション）。
2. 設定 → 料金プラン:
   - フリーの残数表示を確認。
   - スタンダード月額 / 年額、ファミリー月額 / 年額を購入（シミュレーション）。
   - フリーのまま追加チケットを買うと「有料会員限定」になること。
   - 有料化後に 50枚/100枚チケットを買い、ホームの残数バッジが増えること。
   - 「購入の復元」で前回のプランが戻ること。
3. 子ども管理:
   - スタンダードでは2人目を追加できない（ファミリーへ誘導）。
   - ファミリー購入後に3人まで追加・色/学年/教科を編集。
   - ホームのタブで切り替えるとカルテ・復習が対象の子どもになる。
4. 設定 → ログイン端末:
   - 「3台目ログインをシミュレート」で最古の擬似端末が外れること（この端末は残る）。
   - 「この端末の失効をシミュレート」でアラートが出て自動ログアウトすること。
5. 設定の利用規約・プライバシー・特商法、ログアウト、アカウント削除（モックはローカル状態の消去）。
6. ログアウト後に再ログインし、「購入の復元」でプランが戻ること（モック購入は端末に残ります）。

### 実機（開発ビルド + Supabase + RevenueCat）

詳細コマンドは [docs/setup-guide.md](docs/setup-guide.md) を参照。

```bash
npx eas login
npx eas init
npx eas build --profile development --platform ios
npx expo start --dev-client
```

1. `.env` から `EXPO_PUBLIC_USE_MOCKS` を外し、Supabase URL / anon key、RevenueCat の Apple/Google API キーを入れる。
2. `npx supabase db reset`（または本番に最新 migration まで適用）。
3. Edge Functions をデプロイ: `grade-scan`、`inpaint-handwriting`、`sync-revenuecat`、`delete-account`。
4. RevenueCat ダッシュボード:
   - Entitlement `standard` / `family`
   - 商品 ID: `maru_standard_monthly` `maru_standard_yearly` `maru_family_monthly` `maru_family_yearly` `scan_ticket_50` `scan_ticket_100`
   - Webhook URL: `https://<project>.functions.supabase.co/sync-revenuecat`（Authorization に `REVENUECAT_WEBHOOK_SECRET`）
5. Supabase Auth で Apple / Google / Email / Anonymous を有効化し、リダイレクト `maru://auth/callback` を登録。
6. Sandbox Apple ID / License tester で購入・リストア・チケット加算後、`profiles.subscription_tier` と `extra_ticket_balance` が更新されることを確認。
7. 3台目の実機でログインし、使っていない端末に「別の端末でログインされました」と出てサインアウトすることを確認。
8. カルテの要指導リストで「理解できた（クリア）」と「もう一度復習する」を確認。
9. 設定からアカウント削除し、Auth ユーザーと Storage 配下が消えることを確認（App Store 審査要件）。
