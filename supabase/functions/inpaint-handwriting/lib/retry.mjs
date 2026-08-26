export function sleep(ms, sleeper = (wait) => new Promise((resolve) => setTimeout(resolve, wait))) {
  return sleeper(ms);
}

export function isRetryable(error) {
  const status = error?.status ?? error?.statusCode;
  if (status === 408 || status === 429 || (typeof status === "number" && status >= 500)) {
    return true;
  }
  if (error?.code === "TIMEOUT" || error?.name === "TimeoutError") return true;
  const message = String(error?.message ?? "");
  return /429|408|500|502|503|504|ECONNRESET|ETIMEDOUT|timeout/i.test(message);
}

export async function withRetry(fn, options = {}) {
  const retries = options.retries ?? 3;
  const baseMs = options.baseMs ?? 400;
  const sleeper = options.sleep ?? sleep;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === retries) {
        throw error;
      }
      await sleeper(baseMs * 2 ** attempt);
    }
  }

  throw lastError;
}
