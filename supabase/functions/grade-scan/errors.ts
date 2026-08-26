export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

export function jsonError(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof HttpError) {
    return { status: error.status, body: { ok: false, error: error.code, message: error.message } };
  }

  const message = error instanceof Error ? error.message : "UNKNOWN";
  if (message === "GEMINI_API_KEY_MISSING") {
    return { status: 500, body: { ok: false, error: message } };
  }
  if (message === "QUOTA_EXCEEDED" || message.includes("QUOTA_EXCEEDED")) {
    return { status: 402, body: { ok: false, error: "QUOTA_EXCEEDED" } };
  }
  if (message.startsWith("GradeValidationError") || (error as { name?: string }).name === "GradeValidationError") {
    return { status: 422, body: { ok: false, error: "INVALID_GRADE_JSON", message } };
  }

  return {
    status: 500,
    body: { ok: false, error: "GRADE_SCAN_FAILED", message },
  };
}
