import { build } from "../artifacts/api-server/node_modules/esbuild/lib/main.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [path.join(rootDir, "artifacts/api-server/src/app.ts")],
  outfile: path.join(rootDir, "api/[...path].mjs"),
  platform: "node",
  target: "node20",
  format: "esm",
  bundle: true,
  sourcemap: false,
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; globalThis.require = __createRequire(import.meta.url);",
  },
});
