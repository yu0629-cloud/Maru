import { hasSupabaseConfig, isMockMode } from "@/src/lib/env";
import { useAuthStore } from "@/src/stores/authStore";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value?: string | null): value is string {
  return Boolean(value && UUID_RE.test(value));
}

/**
 * 本物の Supabase へ問い合わせてよいか。
 * 開発用モックログイン（userId が mock-parent-1 など）では false。
 */
export function shouldUseRemote(id?: string | null) {
  if (isMockMode()) return false;
  const auth = useAuthStore.getState();
  if (auth.mocked) return false;
  if (auth.userId && !isUuid(auth.userId)) return false;
  if (id && !isUuid(id)) return false;
  return hasSupabaseConfig();
}
