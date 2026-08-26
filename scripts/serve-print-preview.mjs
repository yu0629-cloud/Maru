import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = join(root, "scripts/output/print-preview.html");

if (!existsSync(htmlPath)) {
  spawnSync(process.execPath, [join(root, "scripts/test-print-review.mjs")], { stdio: "inherit" });
}

const html = readFileSync(htmlPath, "utf8");
const port = Number(process.env.PRINT_PREVIEW_PORT ?? 4173);

const server = createServer((req, res) => {
  const latest = readFileSync(htmlPath, "utf8");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(latest);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`A4 preview: http://127.0.0.1:${port}/`);
});
