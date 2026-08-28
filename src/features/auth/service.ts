import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { mapAuthError } from "@/src/features/auth/errors";
import { shouldMockAuth, oauthRedirectUrl } from "@/src/lib/env";
import { shouldUseRemote } from "@/src/lib/backend";
import { supabase } from "@/src/lib/supabase/client";
import { setMemoryAccessToken } from "@/src/lib/supabase/access-token";
import { billingSdk } from "@/src/lib/revenuecat/sdk";
import { useAuthStore } from "@/src/stores/authStore";
import { useChildStore } from "@/src/stores/childStore";
import { useDeviceStore } from "@/src/stores/deviceStore";
import { useQuotaStore } from "@/src/stores/quotaStore";

WebBrowser.maybeCompleteAuthSession();

const MOCK_SESSION_KEY = "maru.auth.mock";

export type MockSession = {
  userId: string;
  email: string | null;
  displayName: string;
  isAnonymous: boolean;
};

const DEV_SESSION: MockSession = {
  userId: "mock-parent-1",
  email: "dev@maru.local",
  displayName: "開発用アカウント",
  isAnonymous: false,
};

function applyLocalSession(session: MockSession, mocked: boolean) {
  useAuthStore.getState().setSession({
    userId: session.userId,
    email: session.email,
    displayName: session.displayName,
    isAnonymous: session.isAnonymous,
    mocked,
  });
}

export async function persistMockSession(session: MockSession) {
  await AsyncStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(session));
  applyLocalSession(session, true);
}

export async function loadMockSession() {
  const raw = await AsyncStorage.getItem(MOCK_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MockSession;
  } catch {
    return null;
  }
}

export async function signInMock(overrides?: Partial<MockSession>) {
  const session = { ...DEV_SESSION, ...overrides };
  await persistMockSession(session);
  return session;
}

export async function signInAnonymouslyMock() {
  return signInMock({
    userId: `anon_${Date.now().toString(36)}`,
    email: null,
    displayName: "ゲスト",
    isAnonymous: true,
  });
}

export function parseSessionFromUrl(url: string) {
  const normalized = url.replace("#", "?");
  const parsed = Linking.parse(normalized);
  const accessToken = typeof parsed.queryParams?.access_token === "string" ? parsed.queryParams.access_token : null;
  const refreshToken =
    typeof parsed.queryParams?.refresh_token === "string" ? parsed.queryParams.refresh_token : null;
  return { accessToken, refreshToken };
}

export async function createSessionFromUrl(url: string) {
  const { accessToken, refreshToken } = parseSessionFromUrl(url);
  if (!accessToken || !refreshToken) return null;
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw mapAuthError(error);
  return data.session;
}

export async function signInWithEmail(email: string, password: string) {
  if (shouldMockAuth()) {
    return signInMock({ email, displayName: email.split("@")[0] ?? "保護者" });
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw mapAuthError(error);
  return data.session;
}

export async function signUpWithEmail(email: string, password: string, displayName: string) {
  if (shouldMockAuth()) {
    return signInMock({ email, displayName: displayName || email.split("@")[0] || "保護者" });
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw mapAuthError(error);
  return data;
}

export async function signInAnonymously() {
  if (shouldMockAuth()) return signInAnonymouslyMock();
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw mapAuthError(error);
  return data.session;
}

export async function signInWithGoogle() {
  if (shouldMockAuth()) {
    return signInMock({ email: "google@maru.local", displayName: "Googleユーザー" });
  }
  const redirectTo = oauthRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw mapAuthError(error);
  if (!data.url) throw new Error("Google の認証 URL を取得できませんでした");
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success" || !("url" in result)) {
    throw new Error("Google ログインがキャンセルされました");
  }
  return createSessionFromUrl(result.url);
}

export async function signInWithApple() {
  if (Platform.OS !== "ios") {
    throw new Error("Apple でサインインは iOS のみ対応しています");
  }
  if (shouldMockAuth()) {
    return signInMock({ email: "apple@maru.local", displayName: "Appleユーザー" });
  }
  const AppleAuthentication = await import("expo-apple-authentication");
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) throw new Error("この端末では Apple でサインインできません");
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) throw new Error("Apple の ID トークンを取得できませんでした");
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
  });
  if (error) throw mapAuthError(error);
  return data.session;
}

export async function signOut() {
  const userId = useAuthStore.getState().userId;
  try {
    await billingSdk.logOut();
  } catch {
    // ignore
  }
  if (userId && shouldUseRemote(userId)) {
    try {
      const { getDeviceId } = await import("@/src/features/session/deviceId");
      const deviceId = await getDeviceId();
      await supabase.rpc("revoke_device_session", {
        p_parent_id: userId,
        p_device_id: deviceId,
      });
    } catch {
      // オフラインでもログアウトは完了させる
    }
    await supabase.auth.signOut();
  }
  await AsyncStorage.removeItem(MOCK_SESSION_KEY);
  useAuthStore.getState().clear();
  useChildStore.getState().setChildren([]);
  useDeviceStore.getState().setSessions([]);
  useQuotaStore.getState().setFromServer({
    tier: "free",
    freeScansRemaining: 10,
    monthlyUsed: 0,
    extraTicketBalance: 0,
  });
}

export async function restoreLocalAuth() {
  if (shouldMockAuth()) {
    const session = await loadMockSession();
    if (session) applyLocalSession(session, true);
    else useAuthStore.getState().setReady(true);
    return;
  }
  const { data } = await supabase.auth.getSession();
  setMemoryAccessToken(data.session?.access_token ?? null);
  const user = data.session?.user;
  if (!user) {
    useAuthStore.getState().setReady(true);
    return;
  }
  useAuthStore.getState().setSession({
    userId: user.id,
    email: user.email ?? null,
    displayName: (user.user_metadata?.display_name as string | undefined) ?? "",
    isAnonymous: Boolean(user.is_anonymous),
    mocked: false,
  });
}

export { DEV_SESSION };
