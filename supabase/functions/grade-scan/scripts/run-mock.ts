/**
 * ローカル単体実行:
 *   deno run --allow-env --allow-read --allow-net supabase/functions/grade-scan/scripts/run-mock.ts
 *
 * 実 Gemini を使う場合:
 *   $env:GEMINI_API_KEY="..."
 *   $env:MOCK_GEMINI="0"
 *   deno run --allow-env --allow-read --allow-net supabase/functions/grade-scan/scripts/run-mock.ts
 */
import { SAMPLE_CARTE, SAMPLE_JPEG_BASE64 } from "../fixtures/sample.ts";
import { bytesToBase64, guessMimeType } from "../image.ts";
import { runGradeScan } from "../pipeline.ts";

const useMock = Deno.env.get("MOCK_GEMINI") !== "0";
if (useMock) {
  Deno.env.set("MOCK_GEMINI", "1");
}

const imagePath = Deno.env.get("GRADE_SCAN_IMAGE");
let imageBase64 = SAMPLE_JPEG_BASE64;
let mimeType = "image/jpeg";

if (imagePath) {
  const bytes = await Deno.readFile(imagePath);
  imageBase64 = bytesToBase64(bytes);
  mimeType = guessMimeType(imagePath);
}

const result = await runGradeScan({
  dryRun: true,
  imageBase64,
  mimeType,
  carteJsonb: SAMPLE_CARTE,
});

console.log(JSON.stringify(result, null, 2));

if (result.overall_score.max <= 0 || result.problems.length === 0) {
  Deno.exit(1);
}

if (!result.problems.every((problem) => Array.isArray(problem.bbox) && problem.bbox.length === 4)) {
  console.error("bbox が [ymin,xmin,ymax,xmax] ではありません");
  Deno.exit(1);
}
