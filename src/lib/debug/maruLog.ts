function stamp() {
  return new Date().toISOString().slice(11, 23);
}

function formatExtra(extra: unknown) {
  if (extra === undefined) return "";
  if (extra instanceof Error) return ` ${extra.message}`;
  if (typeof extra === "string") return ` ${extra}`;
  try {
    return ` ${JSON.stringify(extra)}`;
  } catch {
    return ` ${String(extra)}`;
  }
}

/** Metro / Cursor のターミナルに出すデバッグログ */
export function maruLog(scope: string, message: string, extra?: unknown) {
  console.log(`[MARU ${stamp()}] ${scope}: ${message}${formatExtra(extra)}`);
}

export async function maruStep<T>(scope: string, label: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  maruLog(scope, `${label} start`);
  try {
    const result = await run();
    maruLog(scope, `${label} ok ${Date.now() - started}ms`);
    return result;
  } catch (error) {
    maruLog(scope, `${label} FAIL ${Date.now() - started}ms`, error);
    throw error;
  }
}
