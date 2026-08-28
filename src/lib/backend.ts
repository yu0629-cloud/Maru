import { hasSupabaseConfig } from "@/src/lib/env";
import { useAuthStore } from "@/src/stores/authStore";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value?: string | null): value is string {
  return Boolean(value && UUID_RE.test(value));
}

/**
 * 本物の Supabase / Gemini へ問い合わせてよいか。
 * EXPO_PUBLIC_USE_MOCKS は課金モック専用なので、ここでは見ない。
 * 開発用モックログイン（userId が mock-parent-1 など）では false。
 */
export function shouldUseRemote(id?: string | null) {
  const auth = useAuthStore.getState();
  if (auth.mocked) return false;
  if (auth.userId && !isUuid(auth.userId)) return false;
  if (id && !isUuid(id)) return false;
  return hasSupabaseConfig();
}
