// Copies the duckdb-wasm runtime assets (wasm module + web worker) from
// node_modules into /public/vendor/duckdb so the static export can serve them
// same-origin. Runs automatically on `npm install` (postinstall).
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@duckdb", "duckdb-wasm", "dist");
const dst = join(root, "public", "vendor", "duckdb");
mkdirSync(dst, { recursive: true });

const files = [
  "duckdb-mvp.wasm",
  "duckdb-browser-mvp.worker.js",
  "duckdb-eh.wasm",
  "duckdb-browser-eh.worker.js",
];

for (const f of files) {
  const from = join(src, f);
  if (!existsSync(from)) {
    console.warn(`[duckdb-assets] missing ${from} -- skipped`);
    continue;
  }
  copyFileSync(from, join(dst, f));
}
console.log(`[duckdb-assets] copied ${files.length} files to public/vendor/duckdb`);
