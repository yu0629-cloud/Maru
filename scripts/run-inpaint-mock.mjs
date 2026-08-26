/**
 * モック inpaint を単体実行する。
 *   node scripts/run-inpaint-mock.mjs
 */
import { buildMaskPixels } from "../supabase/functions/inpaint-handwriting/lib/mask.mjs";
import { runInpaintJob } from "../supabase/functions/inpaint-handwriting/lib/pipeline-core.mjs";
import { shouldUseMockInpaint } from "../supabase/functions/inpaint-handwriting/lib/replicate-client.mjs";

const cropBytes = new Uint8Array([255, 216, 255, 224]);
const uploads = [];

const result = await runInpaintJob(
  {
    forceMock: shouldUseMockInpaint(process.env),
    cropBox: { x: 0.06, y: 0.27, width: 0.88, height: 0.19 },
  },
  {
    env: process.env,
    async loadContext() {
      return {
        job: { id: "mock-job", status: "queued", attempts: 0 },
        problemId: "mock-problem",
        scanId: "mock-scan",
        cropBox: { x: 0.06, y: 0.27, width: 0.88, height: 0.19 },
        ids: { parentId: "parent", childId: "child", problemId: "mock-problem" },
        imageBytes: cropBytes,
      };
    },
    async downloadOriginal() {
      return cropBytes;
    },
    async cropImage(bytes) {
      return { bytes, width: 88, height: 40, mimeType: "image/jpeg" };
    },
    buildMask: buildMaskPixels,
    async encodeMaskPng() {
      return new Uint8Array([1]);
    },
    async mockInpaint(cropped) {
      return cropped.bytes;
    },
    async lamaInpaint() {
      throw new Error("Set MOCK_INPAINT=1 for this script without wiring fetch");
    },
    async upload(bucket, path) {
      uploads.push(`${bucket}:${path}`);
    },
    async updateProblem() {},
    async markProcessing() {},
    async markCompleted() {},
    async markFailed() {},
    async countActiveJobs() {
      return 0;
    },
    async completeScan() {},
  },
);

console.log(JSON.stringify({ result, uploads }, null, 2));
if (!result.ok || !result.blankPath) {
  process.exit(1);
}
