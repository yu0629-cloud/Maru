/**
 * 端末ロケール → アプリ言語の判定と翻訳キーの対称性
 *   node scripts/test-i18n.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function pass(name) {
  console.log(`ok - ${name}`);
}

const { resolveAppLocale } = await import(pathToFileURL(join(root, "src/i18n/locale.mjs")).href);

assert.equal(resolveAppLocale("ja"), "ja");
assert.equal(resolveAppLocale("ja-JP"), "ja");
assert.equal(resolveAppLocale("ja_JP"), "ja");
assert.equal(resolveAppLocale("JA"), "ja");
assert.equal(resolveAppLocale("jp"), "ja");
assert.equal(resolveAppLocale("en"), "en");
assert.equal(resolveAppLocale("en-US"), "en");
assert.equal(resolveAppLocale("fr"), "en");
assert.equal(resolveAppLocale("zh-CN"), "en");
assert.equal(resolveAppLocale(null), "en");
assert.equal(resolveAppLocale(""), "en");
pass("端末言語コードを ja / en に正規化し、それ以外は en にフォールバックする");

function collectKeys(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.keys(value)
    .sort()
    .flatMap((key) => collectKeys(value[key], prefix ? `${prefix}.${key}` : key));
}

const ja = JSON.parse(readFileSync(join(root, "locales/ja.json"), "utf8"));
const en = JSON.parse(readFileSync(join(root, "locales/en.json"), "utf8"));
assert.deepEqual(collectKeys(ja), collectKeys(en));
pass("ja.json と en.json のキーツリーが一致する");

const i18nSrc = readFileSync(join(root, "src/i18n/index.tsx"), "utf8");
assert.match(i18nSrc, /requireOptionalNativeModule/);
assert.match(i18nSrc, /ExpoLocalization/);
assert.match(i18nSrc, /getLocales/);
assert.match(i18nSrc, /nativeLocales/);
assert.match(i18nSrc, /languageTag/);
assert.match(i18nSrc, /from "i18n-js"/);
assert.match(i18nSrc, /I18nProvider/);
assert.match(i18nSrc, /defaultLocale = "en"/);
const rootLayoutSrc = readFileSync(join(root, "app/_layout.tsx"), "utf8");
assert.match(rootLayoutSrc, /I18nProvider/);
const appJson = JSON.parse(readFileSync(join(root, "app.json"), "utf8"));
assert.match(JSON.stringify(appJson.expo.plugins), /expo-localization/);
pass("i18n 初期化が expo-localization と I18nProvider で端末ロケールを読む");

const screens = [
  ["src/features/carte/CarteMastery.tsx", /t\("carte\.empty"\)/],
  ["app/(app)/(tabs)/review/index.tsx", /t\("review\.title"\)/],
  ["app/(app)/scans/index.tsx", /t\("history\.title"\)/],
  ["app/(app)/(tabs)/camera/index.tsx", /t\("camera\.startScan"\)/],
  ["app/(app)/(tabs)/settings/index.tsx", /t\("settings\.billingTitle"\)/],
  ["app/(app)/children/index.tsx", /t\("child\.title"\)/],
  ["app/(auth)/login.tsx", /t\("auth\.emailLogin"\)/],
];
for (const [rel, pattern] of screens) {
  assert.match(readFileSync(join(root, rel), "utf8"), pattern);
}
pass("カルテ・復習・履歴・撮影ボタンが翻訳キー経由である");

for (const code of [
  "math",
  "japanese",
  "spelling_phonics",
  "reading",
  "writing_grammar",
  "science",
  "social_studies",
  "world_languages",
  "other",
]) {
  assert.equal(typeof ja.subject[code], "string");
  assert.equal(typeof en.subject[code], "string");
  assert.equal(typeof ja.subjectBadge[code], "string");
  assert.equal(typeof en.subjectBadge[code], "string");
}
assert.equal(ja.subject.math, "算数・数学");
assert.equal(en.subject.reading, "Reading Comprehension");
assert.equal(en.subject.world_languages, "Spanish & World Languages");
pass("英語圏・日本の教科プリセットが ja / en のラベルを持つ");

assert.equal(ja.settings.languageTitle, "言語設定");
assert.equal(en.settings.languageTitle, "Language");
assert.match(ja.settings.markStyleHint, /国や地域によって正解の印が異なります/);
assert.match(en.settings.markStyleHint, /Grading symbols vary by region/);
assert.equal(typeof ja.onboarding.languageTitle, "string");
assert.equal(typeof en.onboarding.start, "string");
const settingsSrc = readFileSync(join(root, "app/(app)/(tabs)/settings/index.tsx"), "utf8");
assert.match(settingsSrc, /settings\.languageTitle/);
assert.match(settingsSrc, /settings\.markStyleTitle/);
assert.match(settingsSrc, /openLegalUrl|LegalLinkList/);
assert.match(settingsSrc, /setLocale/);
assert.match(settingsSrc, /setMarkStyle/);
const legalSrc = readFileSync(join(root, "src/constants/legal.ts"), "utf8");
assert.match(legalSrc, /openBrowserAsync/);
assert.match(legalSrc, /2PACX-1vTL3BWhJjqpCTwHV/);
assert.match(legalSrc, /2PACX-1vTWB0rsfyNkGyv/);
assert.match(legalSrc, /2PACX-1vRnrBL151s-KjWlLSK4CfdQFNvcQq8EG/);
assert.equal(ja.settings.legalTitle, "規約・サポート");
assert.equal(ja.settings.terms, "利用規約");
assert.equal(en.settings.privacy, "Privacy Policy");
assert.equal(ja.settings.commerce, "特定商取引法に基づく表記");
const loginSrc = readFileSync(join(root, "app/(auth)/login.tsx"), "utf8");
assert.match(loginSrc, /LegalFooter/);
assert.match(settingsSrc, /LegalLinkList/);
const onboardingSrc = readFileSync(join(root, "app/onboarding.tsx"), "utf8");
assert.match(onboardingSrc, /onboarding\.languageTitle/);
assert.match(onboardingSrc, /GradeMarkPreview/);
assert.match(onboardingSrc, /completeOnboarding/);
const i18nProviderSrc = readFileSync(join(root, "src/i18n/index.tsx"), "utf8");
assert.match(i18nProviderSrc, /storedLocale/);
assert.match(i18nProviderSrc, /if \(storedLocale\) return/);
const { defaultMarkStyle, correctMarkGlyph } = await import(
  pathToFileURL(join(root, "src/features/prefs/lib/mark-style.mjs")).href,
);
assert.equal(defaultMarkStyle("ja"), "jp");
assert.equal(defaultMarkStyle("en"), "global");
assert.equal(correctMarkGlyph("jp"), "⭕");
assert.equal(correctMarkGlyph("global"), "✓");
pass("言語・採点マーク設定と初回オンボーディングが翻訳キーと永続化に載る");

console.log("\nAll i18n checks passed.");
