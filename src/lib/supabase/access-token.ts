import { supabase } from "@/src/lib/supabase/client";

let memoryToken: string | null = null;

export function setMemoryAccessToken(token: string | null) {
  memoryToken = token;
}

/** AsyncStorage を読まず、ログイン時にキャッシュしたトークンを返す */
export async function getMemoryAccessToken(): Promise<string | null> {
  if (memoryToken) return memoryToken;
  const { data } = await supabase.auth.getSession();
  memoryToken = data.session?.access_token ?? null;
  return memoryToken;
}
