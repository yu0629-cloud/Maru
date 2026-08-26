/**
 * 単色の PNG を生成する（依存パッケージなし）
 *   node scripts/generate-app-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "assets/images");

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function png({ width, height, fill, circle }) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      let [r, g, b] = fill;
      if (circle) {
        const dx = x + 0.5 - width / 2;
        const dy = y + 0.5 - height / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= circle.radius) {
          [r, g, b] = circle.color;
        }
      }
      const i = row + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const body = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return body;
}

const cream = [247, 244, 238];
const maru = [196, 71, 56];

mkdirSync(outDir, { recursive: true });

const icon = png({ width: 1024, height: 1024, fill: cream, circle: { radius: 380, color: maru } });
writeFileSync(join(outDir, "icon.png"), icon);
writeFileSync(join(outDir, "adaptive-icon.png"), icon);
writeFileSync(join(outDir, "splash-icon.png"), png({ width: 1284, height: 1284, fill: cream, circle: { radius: 420, color: maru } }));
writeFileSync(join(outDir, "favicon.png"), png({ width: 48, height: 48, fill: cream, circle: { radius: 18, color: maru } }));

console.log("wrote assets/images/{icon,adaptive-icon,splash-icon,favicon}.png");
