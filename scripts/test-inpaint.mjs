/**
 * inpaint-handwriting の単体検証（Deno 不要）
 *   node scripts/test-inpaint.mjs
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lib = join(root, "supabase/functions/inpaint-handwriting/lib");

const { geminiBBoxToNormalizedBox, normalizedBoxToPixels, resolveCropBox } = await import(
  pathToFileURL(join(lib, "crop-box.mjs")).href
);
const { buildMaskPixels, maskCoverage, DEFAULT_MASK_ZONES } = await import(
  pathToFileURL(join(lib, "mask.mjs")).href
);
const { cropStoragePath, blankStoragePath } = await import(pathToFileURL(join(lib, "paths.mjs")).href);
const { isRetryable, withRetry } = await import(pathToFileURL(join(lib, "retry.mjs")).href);
const {
  shouldUseMockInpaint,
  extractOutputUrl,
  waitForPrediction,
  runLamaInpaint,
} = await import(pathToFileURL(join(lib, "replicate-client.mjs")).href);
const { runInpaintJob } = await import(pathToFileURL(join(lib, "pipeline-core.mjs")).href);

function pass(name) {
  console.log(`ok - ${name}`);
}

const cropBox = geminiBBoxToNormalizedBox([270, 60, 460, 940]);
assert.equal(cropBox.x, 0.06);
assert.equal(cropBox.y, 0.27);
assert.equal(Number(cropBox.width.toFixed(2)), 0.88);
const pixels = normalizedBoxToPixels(cropBox, 1000, 1400);
assert.equal(pixels.left, 60);
assert.equal(pixels.top, 378);
assert.deepEqual(resolveCropBox({ geminiBbox: [270, 60, 460, 940] }), cropBox);
pass("bbox からクロップ矩形を計算する");

const mask = buildMaskPixels(100, 100);
assert.equal(mask.pixels[0], 0);
assert.equal(mask.pixels[99 * 100 + 50], 255);
assert.ok(maskCoverage(mask) > 0.4);
assert.equal(DEFAULT_MASK_ZONES.length, 2);
pass("手書き・赤ペン帯のマスクを生成する");

assert.equal(
  cropStoragePath({ parentId: "p", childId: "c", problemId: "q" }),
  "p/c/q/crop.jpg",
);
assert.equal(
  blankStoragePath({ parentId: "p", childId: "c", problemId: "q" }),
  "p/c/q/blank.jpg",
);
pass("Storage パス規約");

assert.equal(isRetryable({ status: 429 }), true);
assert.equal(isRetryable({ status: 400 }), false);
let tries = 0;
const retried = await withRetry(
  async () => {
    tries += 1;
    if (tries < 3) {
      const error = new Error("429 rate limit");
      error.status = 429;
      throw error;
    }
    return "ok";
  },
  { retries: 3, baseMs: 1, sleep: async () => {} },
);
assert.equal(retried, "ok");
assert.equal(tries, 3);
pass("429 を指数バックオフでリトライする");

assert.equal(shouldUseMockInpaint({ MOCK_INPAINT: "1", REPLICATE_API_TOKEN: "r8_xxx" }), true);
assert.equal(shouldUseMockInpaint({ MOCK_INPAINT: "0", REPLICATE_API_TOKEN: "" }), true);
assert.equal(shouldUseMockInpaint({ REPLICATE_API_TOKEN: "r8_xxx" }), false);
assert.equal(extractOutputUrl(["https://example.com/out.jpg"]), "https://example.com/out.jpg");
pass("モック判定と Replicate 出力 URL");

const calls = [];
const prediction = await waitForPrediction({
  token: "r8_test",
  id: "pred_1",
  initial: { status: "starting" },
  pollMs: 1,
  timeoutMs: 1000,
  sleep: async () => {},
  fetchImpl: async (url) => {
    calls.push(url);
    const status = calls.length >= 2 ? "succeeded" : "processing";
    return {
      ok: true,
      async text() {
        return JSON.stringify({
          status,
          output: status === "succeeded" ? "https://example.com/blank.jpg" : null,
        });
      },
    };
  },
});
assert.equal(prediction.status, "succeeded");
assert.equal(calls.length, 2);
pass("Replicate 予測をポーリングして完了を待つ");

let createCount = 0;
const lama = await runLamaInpaint({
  token: "r8_test",
  model: "allenhooo/lama",
  input: { image: "data:image/jpeg;base64,xx", mask: "data:image/png;base64,yy" },
  retries: 2,
  baseMs: 1,
  sleep: async () => {},
  fetchImpl: async (url, init) => {
    if (init?.method === "POST") {
      createCount += 1;
      if (createCount === 1) {
        return { ok: false, status: 429, async text() { return "rate limited"; } };
      }
      return {
        ok: true,
        status: 201,
        async text() {
          return JSON.stringify({ id: "pred_2", status: "succeeded", output: "https://example.com/a.jpg" });
        },
      };
    }
    return { ok: true, async text() { return JSON.stringify({ status: "succeeded", output: "https://example.com/a.jpg" }); } };
  },
});
assert.equal(lama.status, "succeeded");
assert.equal(createCount, 2);
pass("LaMa 作成 API の 429 をリトライする");

const uploads = [];
const updates = [];
const jobs = [];
const fakeBytes = new Uint8Array([1, 2, 3, 4]);

function createDeps(overrides = {}) {
  return {
    env: { MOCK_INPAINT: "1" },
    maxAttempts: 5,
    async loadContext() {
      return {
        job: { id: "job-1", status: "queued", attempts: 0 },
        problemId: "prob-1",
        scanId: "scan-1",
        cropBox: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
        sourceStoragePath: "p/c/s/original.jpg",
        ids: { parentId: "parent", childId: "child", problemId: "prob-1" },
        imageBytes: fakeBytes,
      };
    },
    async downloadOriginal() {
      return fakeBytes;
    },
    async cropImage(bytes, box) {
      assert.ok(box.width > 0);
      return { bytes, width: 80, height: 60, mimeType: "image/jpeg" };
    },
    buildMask: buildMaskPixels,
    async encodeMaskPng() {
      return new Uint8Array([9, 9]);
    },
    async mockInpaint(cropped) {
      return cropped.bytes;
    },
    async lamaInpaint() {
      throw new Error("should not call real lama in mock");
    },
    async upload(bucket, path, bytes) {
      uploads.push({ bucket, path, size: bytes.length });
    },
    async updateProblem(id, fields) {
      updates.push({ id, fields });
    },
    async markProcessing(id, attempts) {
      jobs.push({ id, status: "processing", attempts });
    },
    async markCompleted(id) {
      jobs.push({ id, status: "completed" });
    },
    async markFailed(id, message) {
      jobs.push({ id, status: "failed", message });
    },
    async countActiveJobs() {
      return 0;
    },
    async completeScan(scanId) {
      updates.push({ scanId, status: "completed" });
    },
    ...overrides,
  };
}

uploads.length = 0;
updates.length = 0;
jobs.length = 0;
const mocked = await runInpaintJob({ forceMock: true }, createDeps());
assert.equal(mocked.ok, true);
assert.equal(mocked.mocked, true);
assert.equal(mocked.cropPath, "parent/child/prob-1/crop.jpg");
assert.equal(mocked.blankPath, "parent/child/prob-1/blank.jpg");
assert.equal(mocked.scanCompleted, true);
assert.deepEqual(
  uploads.map((item) => item.bucket),
  ["problem-crops", "problem-blanks"],
);
assert.equal(updates[0].fields.blanked_storage_path, "parent/child/prob-1/blank.jpg");
assert.equal(jobs.some((item) => item.status === "completed"), true);
pass("モックパイプラインが crop / blank を保存しジョブを completed にする");

uploads.length = 0;
jobs.length = 0;
const failed = await runInpaintJob({}, createDeps({
  env: { REPLICATE_API_TOKEN: "r8_xxx" },
  async lamaInpaint() {
    const error = new Error("REPLICATE_TIMEOUT");
    error.code = "TIMEOUT";
    throw error;
  },
})).catch((error) => error);
assert.match(String(failed.message), /TIMEOUT/);
assert.equal(jobs.at(-1).status, "failed");
assert.match(jobs.at(-1).message, /TIMEOUT/);
pass("失敗時に inpaint_jobs へエラーを残す");

const skipped = await runInpaintJob({}, createDeps({
  async loadContext() {
    return {
      job: {
        id: "job-9",
        status: "completed",
        attempts: 1,
        blankedStoragePath: "parent/child/prob-1/blank.jpg",
        croppedStoragePath: "parent/child/prob-1/crop.jpg",
      },
      problemId: "prob-1",
      scanId: "scan-1",
      cropBox: { x: 0, y: 0, width: 1, height: 1 },
      ids: { parentId: "parent", childId: "child", problemId: "prob-1" },
    };
  },
}));
assert.equal(skipped.skipped, true);
pass("完了済みジョブは再実行しない");

const limited = await runInpaintJob({}, createDeps({
  async loadContext() {
    return {
      job: { id: "job-8", status: "failed", attempts: 5 },
      problemId: "prob-1",
      scanId: "scan-1",
      cropBox: { x: 0, y: 0, width: 1, height: 1 },
      ids: { parentId: "parent", childId: "child", problemId: "prob-1" },
    };
  },
})).catch((error) => error);
assert.equal(limited.message, "INPAINT_MAX_ATTEMPTS");
pass("最大試行回数を超えたジョブは止める");

console.log("\nAll inpaint-handwriting checks passed.");
