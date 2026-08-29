import { useEffect } from "react";
import { useAuthStore } from "@/src/stores/authStore";
import { restoreLocalAuth } from "@/src/features/auth/service";
import { supabase } from "@/src/lib/supabase/client";
import { setMemoryAccessToken } from "@/src/lib/supabase/access-token";
import { shouldMockAuth } from "@/src/lib/env";

export function useAuth() {
  const ready = useAuthStore((state) => state.ready);
  const userId = useAuthStore((state) => state.userId);
  const email = useAuthStore((state) => state.email);
  const displayName = useAuthStore((state) => state.displayName);
  const isAnonymous = useAuthStore((state) => state.isAnonymous);
  const mocked = useAuthStore((state) => state.mocked);

  useEffect(() => {
    if (ready) return;
    void restoreLocalAuth();
  }, [ready]);

  useEffect(() => {
    if (shouldMockAuth()) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setMemoryAccessToken(session?.access_token ?? null);
      if (useAuthStore.getState().mocked) return;
      if (event === "SIGNED_OUT") {
        useAuthStore.getState().clear();
        return;
      }
      const user = session?.user;
      if (!user) return;
      const isAnonymous = Boolean(user.is_anonymous);
      if (isAnonymous) {
        void import("@/src/features/storage/guest-scans").then(({ rememberGuestLocalId }) =>
          rememberGuestLocalId(user.id),
        );
      }
      useAuthStore.getState().setSession({
        userId: user.id,
        email: user.email ?? null,
        displayName: (user.user_metadata?.display_name as string | undefined) ?? "",
        isAnonymous,
        mocked: false,
      });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return {
    ready,
    userId,
    email,
    displayName,
    isAnonymous,
    mocked,
    signedIn: Boolean(userId),
  };
}
