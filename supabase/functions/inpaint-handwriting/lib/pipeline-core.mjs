import { resolveCropBox } from "./crop-box.mjs";
import { blankStoragePath, cropStoragePath } from "./paths.mjs";
import { shouldUseMockInpaint } from "./replicate-client.mjs";

export function shouldSkipCompleted(job) {
  return job?.status === "completed" && Boolean(job.blankedStoragePath);
}

/**
 * クロップ → マスク → LaMa（またはモック）→ Storage 更新、の本体。
 * Deno / Node どちらからも deps を差し替えて使える。
 */
export async function runInpaintJob(input, deps) {
  const context = await deps.loadContext(input);
  if (shouldSkipCompleted(context.job)) {
    return {
      ok: true,
      mocked: false,
      skipped: true,
      jobId: context.job.id,
      problemId: context.problemId,
      cropPath: context.job.croppedStoragePath ?? null,
      blankPath: context.job.blankedStoragePath,
    };
  }

  if ((context.job.attempts ?? 0) >= (deps.maxAttempts ?? 5) && !input.force) {
    throw Object.assign(new Error("INPAINT_MAX_ATTEMPTS"), { code: "MAX_ATTEMPTS" });
  }

  await deps.markProcessing(context.job.id, (context.job.attempts ?? 0) + 1);

  try {
    const original = context.imageBytes ?? await deps.downloadOriginal(context.sourceStoragePath);
    const cropBox = resolveCropBox({
      cropBox: input.cropBox ?? context.cropBox,
      geminiBbox: input.geminiBbox ?? context.geminiBbox,
    });
    const cropped = await deps.cropImage(original, cropBox);
    const cropPath = cropStoragePath(context.ids);
    await deps.upload("problem-crops", cropPath, cropped.bytes, cropped.mimeType);

    const mask = deps.buildMask(cropped.width, cropped.height, {
      maskBoxes: input.maskBoxes,
    });
    const mock = input.forceMock || shouldUseMockInpaint(deps.env ?? {});
    let blankBytes;
    if (mock) {
      blankBytes = await deps.mockInpaint(cropped, mask);
    } else {
      const maskBytes = await deps.encodeMaskPng(mask);
      blankBytes = await deps.lamaInpaint({
        imageBytes: cropped.bytes,
        imageMime: cropped.mimeType,
        maskBytes,
      });
    }

    const blankPath = blankStoragePath(context.ids);
    await deps.upload("problem-blanks", blankPath, blankBytes, "image/jpeg");
    await deps.updateProblem(context.problemId, {
      cropped_storage_path: cropPath,
      blanked_storage_path: blankPath,
    });
    await deps.markCompleted(context.job.id);
    const remaining = await deps.countActiveJobs(context.scanId);
    if (remaining === 0) {
      await deps.completeScan(context.scanId);
    }

    return {
      ok: true,
      mocked: mock,
      skipped: false,
      jobId: context.job.id,
      problemId: context.problemId,
      cropPath,
      blankPath,
      scanCompleted: remaining === 0,
    };
  } catch (error) {
    await deps.markFailed(context.job.id, error instanceof Error ? error.message : "INPAINT_FAILED");
    throw error;
  }
}
