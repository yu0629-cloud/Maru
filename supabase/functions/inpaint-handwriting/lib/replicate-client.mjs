import { sleep, withRetry } from "./retry.mjs";

export const DEFAULT_LAMA_MODEL = "allenhooo/lama";

export function readReplicateToken(env = typeof Deno !== "undefined" ? Deno.env.toObject() : process.env) {
  const token = env.REPLICATE_API_TOKEN?.trim();
  return token || null;
}

export function shouldUseMockInpaint(env = typeof Deno !== "undefined" ? Deno.env.toObject() : process.env) {
  return env.MOCK_INPAINT === "1" || !readReplicateToken(env);
}

export function resolveInpaintModel(env = typeof Deno !== "undefined" ? Deno.env.toObject() : process.env) {
  return env.REPLICATE_INPAINT_MODEL?.trim() || DEFAULT_LAMA_MODEL;
}

export function predictionUrl(model) {
  if (model.includes("/")) {
    return `https://api.replicate.com/v1/models/${model}/predictions`;
  }
  return "https://api.replicate.com/v1/predictions";
}

function redact(text, token) {
  if (!token) return text;
  return text.replaceAll(token, "[redacted]");
}

export async function createPrediction(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const body = options.version
    ? { version: options.version, input: options.input }
    : { input: options.input };

  const response = await fetchImpl(predictionUrl(options.model), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.token}`,
      "Content-Type": "application/json",
      Prefer: "wait=0",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`REPLICATE_HTTP_${response.status}:${redact(text, options.token).slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }

  return JSON.parse(text);
}

export async function getPrediction(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`https://api.replicate.com/v1/predictions/${options.id}`, {
    headers: { Authorization: `Bearer ${options.token}` },
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`REPLICATE_POLL_${response.status}:${redact(text, options.token).slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  return JSON.parse(text);
}

export function extractOutputUrl(output) {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  if (output && typeof output === "object" && typeof output.url === "string") return output.url;
  throw new Error("REPLICATE_OUTPUT_MISSING");
}

export async function waitForPrediction(options) {
  const pollMs = options.pollMs ?? 1200;
  const timeoutMs = options.timeoutMs ?? 90_000;
  const started = Date.now();

  let prediction = options.initial;
  while (Date.now() - started < timeoutMs) {
    if (!prediction) {
      prediction = await getPrediction(options);
    }
    if (prediction.status === "succeeded") return prediction;
    if (prediction.status === "failed" || prediction.status === "canceled") {
      throw new Error(`REPLICATE_${prediction.status.toUpperCase()}:${prediction.error ?? ""}`);
    }
    await sleep(pollMs, options.sleep);
    prediction = null;
  }

  const error = new Error("REPLICATE_TIMEOUT");
  error.code = "TIMEOUT";
  throw error;
}

export async function runLamaInpaint(options) {
  const created = await withRetry(
    () =>
      createPrediction({
        token: options.token,
        model: options.model,
        version: options.version,
        input: options.input,
        fetchImpl: options.fetchImpl,
      }),
    { retries: options.retries ?? 3, baseMs: options.baseMs ?? 500, sleep: options.sleep },
  );

  if (created.status === "succeeded") return created;

  return waitForPrediction({
    token: options.token,
    id: created.id,
    initial: created,
    pollMs: options.pollMs,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
    sleep: options.sleep,
  });
}

export async function downloadOutputImage(url, fetchImpl = fetch) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`REPLICATE_OUTPUT_FETCH_${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
