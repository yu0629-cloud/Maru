export function mapAuthError(error: unknown): Error {
  const raw = readMessage(error);
  const lower = raw.toLowerCase();

  if (lower.includes("anonymous sign-ins are disabled") || lower.includes("anonymous_provider_disabled")) {
    return new Error(
      "ゲストログインがオフです。Supabase ダッシュボードの Authentication → Providers で Anonymous を有効にしてください。",
    );
  }
  if (lower.includes("invalid login credentials")) {
    return new Error("メールアドレスまたはパスワードが違います。");
  }
  if (lower.includes("email not confirmed")) {
    return new Error("確認メールのリンクを開いてから、もう一度ログインしてください。");
  }
  if (lower.includes("user already registered")) {
    return new Error("このメールアドレスはすでに登録されています。ログインしてください。");
  }
  if (lower.includes("signup is disabled")) {
    return new Error("新規登録がオフです。Supabase の Authentication 設定を確認してください。");
  }
  if (lower.includes("email rate limit")) {
    return new Error("メール送信が混み合っています。しばらく待ってからやり直してください。");
  }

  return error instanceof Error ? error : new Error(raw || "ログインできませんでした");
}

function readMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message ?? "");
  }
  return String(error ?? "");
}
