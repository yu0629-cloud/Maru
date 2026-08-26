import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/database";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase 環境変数が未設定です。.env を確認してください。");
}

type AfterFetchHook = () => void;

let afterFetchHook: AfterFetchHook | null = null;

export function setSupabaseAfterFetchHook(hook: AfterFetchHook | null) {
  afterFetchHook = hook;
}

export const supabase = createClient<Database>(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      if (response.ok) afterFetchHook?.();
      return response;
    },
  },
});
