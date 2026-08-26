import { setSupabaseAfterFetchHook } from "@/src/lib/supabase/client";

const HEARTBEAT_MIN_INTERVAL_MS = 15_000;

/**
 * 認証済み API 呼び出しの直後に端末セッションを確認する。
 * Realtime / 定期ハートビートの保険として、3台目ログイン後の失効を取りこぼさない。
 */
export function installSessionFetchInterceptor(options: {
  check: () => Promise<boolean>;
  onRevoked: () => void;
}) {
  let lastCheck = 0;
  let inFlight = false;

  const run = () => {
    const now = Date.now();
    if (inFlight || now - lastCheck < HEARTBEAT_MIN_INTERVAL_MS) return;
    lastCheck = now;
    inFlight = true;
    void options
      .check()
      .then((ok) => {
        if (!ok) options.onRevoked();
      })
      .catch(() => {
        // 一時的なネットワークエラーではログアウトしない
      })
      .finally(() => {
        inFlight = false;
      });
  };

  setSupabaseAfterFetchHook(run);

  return () => {
    setSupabaseAfterFetchHook(null);
  };
}
