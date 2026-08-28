# MARU 実機・EAS セットアップガイド

小学生〜中学受験の家庭学習アプリ MARU を、Dev Client と EAS Build（TestFlight / App Store）で動かす手順です。

## 必要なもの

- Node.js 20 以上
- Expo アカウント（[expo.dev](https://expo.dev)）
- Apple Developer Program（iOS / TestFlight）
- Google Play 開発者アカウント（Android。任意）
- Supabase プロジェクト
- RevenueCat プロジェクト（App Store / Play の API キー）
- Gemini API キー、Replicate API トークン（採点・白紙化）

## 識別子

| 項目 | 値 |
| --- | --- |
| 表示名 | MARU |
| version | 1.0.0 |
| iOS bundleIdentifier | `app.maru.family` |
| iOS buildNumber | `1`（production は EAS が自動インクリメント） |
| Android package | `app.maru.family` |
| Android versionCode | `1` |
| URL scheme | `maru://` |
| OAuth リダイレクト | `maru://auth/callback` |

権限説明（日本語）:

- カメラ / 写真ライブラリ: 「学習プリントの撮影・取り込みに使用します。」
- 写真への保存: 「まとめプリントの保存と共有に使用します。」

RevenueCat は `react-native-purchases` を autolink します。公式の Expo config plugin は v8 に無いため、`plugins/with-revenuecat.js` を `app.json` の plugins に明示しています。**Expo Go では課金 SDK は使えません。Dev Client かストアビルドが必要です。**

## 環境変数

`.env.example` をコピーして `.env` を作ります。

```bash
cp .env.example .env
```

### アプリ（EXPO_PUBLIC_*）

| 変数 | 用途 |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` | RevenueCat iOS public SDK key（`appl_`） |
| `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` | RevenueCat Android public SDK key（`goog_`） |
| `EXPO_PUBLIC_USE_MOCKS` | `1` でモック。実機本番は削除または `0` |
| `EXPO_PUBLIC_OAUTH_REDIRECT_URL` | 既定 `maru://auth/callback` |
| `EXPO_PUBLIC_TERMS_URL` / `PRIVACY_URL` / `TOKUSHOHO_URL` | 設定画面の外部リンク（任意） |
| `EAS_PROJECT_ID` | `eas init` で発行される UUID（任意） |

`EXPO_PUBLIC_USE_MOCKS=1` のままだと、Supabase URL があってもモック課金・モック採点になります。実機で本番 API を使うときは**必ず外してください**。

EAS Build ではローカルの `.env` は自動では入りません。ダッシュボードの Environment variables、または `eas secret:create` で同じ `EXPO_PUBLIC_*` をビルドプロファイルに設定します。

### Edge Functions（クライアントに出さない）

`npx supabase secrets set` で本番 Functions に入れます。

| 変数 | 用途 |
| --- | --- |
| `GEMINI_API_KEY` | `grade-scan`（Gemini Vision） |
| `GEMINI_MODEL` | 既定 `gemini-2.5-flash` |
| `REPLICATE_API_TOKEN` | `inpaint-handwriting`（LaMa） |
| `REPLICATE_INPAINT_MODEL` | 既定 `allenhooo/lama` |
| `REVENUECAT_WEBHOOK_SECRET` | `sync-revenuecat` の Authorization |
| `MOCK_GEMINI` / `MOCK_INPAINT` | 本番では `0` または未設定 |

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` は Functions 実行環境に自動注入されます。

```bash
npx supabase secrets set GEMINI_API_KEY=your-gemini-key
npx supabase secrets set REPLICATE_API_TOKEN=your-replicate-token
npx supabase secrets set REVENUECAT_WEBHOOK_SECRET=your-webhook-secret
npx supabase secrets unset MOCK_GEMINI
npx supabase secrets unset MOCK_INPAINT
```

## 1. リポジトリと DB

```bash
cd MARU
cp .env.example .env
npm install
npx supabase start
npx supabase db reset
```

本番プロジェクトへ migration を当てる場合:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase functions deploy grade-scan
npx supabase functions deploy inpaint-handwriting
npx supabase functions deploy sync-revenuecat
npx supabase functions deploy delete-account
npx supabase functions deploy purge-expired-media
```

Secrets:

```bash
npx supabase secrets set PURGE_CRON_SECRET=<random>
```

定期削除は Dashboard の Scheduled Functions、または外部 cron から毎日 `POST /functions/v1/purge-expired-media`（Header `x-cron-secret`）を叩いてください。採点テキストは消えません。

## 2. 型チェックと契約テスト

```bash
npm run typecheck
npx expo-doctor
npm run test:grade-scan
npm run test:inpaint
npm run test:print-review
npm run test:leech
npm run test:scan-ui
npm run test:retention
npm run test:account
```

## 3. Dev Client（実機テスト）

Expo Go ではカメラ・RevenueCat・印刷の一部が動きません。development build を使います。

### 事前準備

1. `.env` から `EXPO_PUBLIC_USE_MOCKS` を外す（本番接続時）。
2. Apple / Google / Email を有効化する。**ゲストではじめる** には Authentication → Providers → **Anonymous** の有効化が必須（初期状態はオフ）。
3. Redirect URLs に `maru://auth/callback` を追加。
4. RevenueCat で Entitlement `standard` / `family` と商品 ID を作成（下記）。
5. `npx eas login` → `npx eas init`（`app.json` / EAS に projectId が入ります）。

### A. EAS で Dev Client をビルド（推奨）

```bash
npx eas build --profile development --platform ios
npx eas build --profile development --platform android
```

iOS シミュレータ用:

```bash
npx eas build --profile development-simulator --platform ios
```

ビルド後、QR / リンクから端末にインストールし、同じ LAN で Metro を起動します。

```bash
npx expo start --dev-client
```

端末と PC が同じ Wi-Fi にない場合はトンネルを使います。

```bash
npx expo start --dev-client --tunnel
```

### B. ローカルでネイティブビルド

Xcode / Android Studio と CocoaPods が必要です。

```bash
npx expo prebuild --clean
npx expo run:ios --device
# または
npx expo run:android --device
```

`ios/` `android/` は CNG（生成物）です。コミットしない運用が既定です。

## 4. 実機での確認ステップ

1. **認証**: Apple / Google / メール / ゲストでログインできる。ログアウト・アカウント削除。
2. **端末制限**: 3台目でログインすると、使っていない端末に「別の端末でログインされました」と出てサインアウトする。
3. **課金**: Sandbox Apple ID でスタンダード / ファミリーを購入。チケットは有料会員のみ。復元でプランが戻る。
4. **撮影〜採点**: カメラまたは写真ライブラリからプリントを取り込み、丸付け結果が出る。
5. **白紙化**: 不正解の手書きが消えた画像になる（Replicate が本番キーのとき）。
6. **A4印刷**: まとめプリントのプレビュー / 共有。問題タイプで解答欄が切り替わる。
7. **カルテ**: 苦手単元。要指導リストで「理解できた（クリア）」と「もう一度復習する」。
8. **子ども**: スタンダードは1人、ファミリーは3人まで。切り替えでカルテ・復習が入れ替わる。

## 5. TestFlight / App Store（EAS production）

```bash
npx eas build --profile production --platform ios
npx eas submit --platform ios --profile production
```

`eas.json` の `submit.production.ios` に `appleId` / `ascAppId` / `appleTeamId` を入れておくと、以降の submit が非対話になります。

Android 内部テスト:

```bash
npx eas build --profile production --platform android
npx eas submit --platform android --profile production
```

審査前チェック:

- カメラ・写真の権限説明が日本語で用途が分かること
- アカウント削除が設定からできること（App Store 要件）
- サブスクの「購入の復元」があること
- `ITSAppUsesNonExemptEncryption` が false（輸出コンプライアンス）
- Privacy Nutrition / データ収集を App Store Connect に記入（アカウント、購入、ユーザーコンテンツ）

## RevenueCat 商品 ID

| Product ID | 内容 |
| --- | --- |
| `maru_standard_monthly` | スタンダード月額 |
| `maru_standard_yearly` | スタンダード年額 |
| `maru_family_monthly` | ファミリー月額 |
| `maru_family_yearly` | ファミリー年額 |
| `scan_ticket_50` | 追加スキャン 50 枚 |
| `scan_ticket_100` | 追加スキャン 100 枚 |

Entitlement: `standard` / `family`  
Webhook: `https://<project-ref>.functions.supabase.co/sync-revenuecat`  
Authorization ヘッダに `REVENUECAT_WEBHOOK_SECRET` と同じ値。

## よくある失敗

| 症状 | 原因 |
| --- | --- |
| 課金がモックのまま | Expo Go、または `EXPO_PUBLIC_USE_MOCKS=1`、または API キー未設定 |
| カメラが真っ黒 | Dev Client ではなく Expo Go。権限を拒否した |
| 採点が fixture のまま | Functions の `MOCK_GEMINI=1` |
| EAS で Supabase に繋がらない | ビルド環境に `EXPO_PUBLIC_SUPABASE_*` が無い |
| `eas build` が projectId を求める | `npx eas init` 未実行 |
