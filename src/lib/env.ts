import { Platform } from "react-native";
import Constants from "expo-constants";

export function hasSupabaseConfig() {
  return Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
}

/** EXPO_PUBLIC_USE_MOCKS。課金（RevenueCat）だけモックし、採点には使わない */
export function isMockMode() {
  const flag = String(process.env.EXPO_PUBLIC_USE_MOCKS ?? "").trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  return !hasSupabaseConfig();
}

export function isBillingMocked() {
  return isMockMode();
}

/** Supabase 未設定のときだけ認証・子どもデータをローカルモックにする */
export function shouldMockAuth() {
  return !hasSupabaseConfig();
}

export function revenueCatApiKey() {
  if (Platform.OS === "ios") return process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY;
  if (Platform.OS === "android") return process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY;
  return undefined;
}

export function isExpoGo() {
  return Constants.appOwnership === "expo";
}

/** Expo Go / 開発ビルドでプラン切替テストを出す */
export function canPreviewPlans() {
  return typeof __DEV__ !== "undefined" && __DEV__ ? true : isExpoGo();
}

export function canUseNativePurchases() {
  if (Platform.OS === "web") return false;
  if (isMockMode()) return false;
  if (isExpoGo()) return false;
  return Boolean(revenueCatApiKey());
}

export function oauthRedirectUrl() {
  return process.env.EXPO_PUBLIC_OAUTH_REDIRECT_URL ?? "maru://auth/callback";
}
