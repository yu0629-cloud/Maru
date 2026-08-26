import { useEffect } from "react";
import { useAuthStore } from "@/src/stores/authStore";
import { restoreLocalAuth } from "@/src/features/auth/service";
import { supabase } from "@/src/lib/supabase/client";
import { setMemoryAccessToken } from "@/src/lib/supabase/access-token";
import { isMockMode } from "@/src/lib/env";

export function useAuth() {
  const store = useAuthStore();

  useEffect(() => {
    if (store.ready) return;
    void restoreLocalAuth();
  }, [store.ready]);

  useEffect(() => {
    if (isMockMode()) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setMemoryAccessToken(session?.access_token ?? null);
      if (useAuthStore.getState().mocked) return;
      if (event === "SIGNED_OUT") {
        useAuthStore.getState().clear();
        return;
      }
      const user = session?.user;
      if (!user) return;
      useAuthStore.getState().setSession({
        userId: user.id,
        email: user.email ?? null,
        displayName: (user.user_metadata?.display_name as string | undefined) ?? "",
        isAnonymous: Boolean(user.is_anonymous),
        mocked: false,
      });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return {
    ready: store.ready,
    userId: store.userId,
    email: store.email,
    displayName: store.displayName,
    isAnonymous: store.isAnonymous,
    mocked: store.mocked,
    signedIn: Boolean(store.userId),
  };
}
