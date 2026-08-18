// Copies MapLibre's web-worker bundle into /public so it can be served with a
// stable URL (Turbopack does not resolve maplibre's `new URL(..., import.meta.url)`
// worker lookup). Runs automatically before `dev` and `build`.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "maplibre-gl", "dist");
const dst = join(root, "public", "maplibre");
mkdirSync(dst, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  if (!existsSync(join(src, f))) throw new Error(`missing ${f} in maplibre-gl/dist`);
  copyFileSync(join(src, f), join(dst, f));
}
console.log("maplibre worker copied to public/maplibre");
