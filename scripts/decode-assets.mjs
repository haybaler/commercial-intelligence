// Decodes the base64-shipped PWA icons into public/icons.
//
// Binary files can't be pushed to GitHub through a text-only channel, so the
// repo ships its two PNG icons as .b64 companions under /assets. Runs
// automatically on `npm install` (postinstall) and is idempotent: existing
// targets are left alone. (If a future binary asset needs the same treatment,
// drop its .b64 in /assets and extend the mapping below.)
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = join(root, "assets");

if (!existsSync(assetsDir)) {
  console.log("[decode-assets] no /assets dir -- nothing to decode");
  process.exit(0);
}

const icons = readdirSync(assetsDir).filter((n) => n.endsWith(".png.b64"));
for (const name of icons) {
  const target = join(root, "public", "icons", name.replace(/\.b64$/, ""));
  if (existsSync(target)) continue;
  const b64 = readFileSync(join(assetsDir, name), "utf8");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, Buffer.from(b64.replace(/\s+/g, ""), "base64"));
  console.log(`[decode-assets] wrote ${target}`);
}
console.log("[decode-assets] done");
