import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Phase-2 flip DEV config. Serves the app graph (app/) as native ES modules with HMR, so the
// ESM flip (index-esm.html → main.mjs) can be browser-validated BEFORE the production build
// config is repointed at app/index.html and the classic .js graph is deleted. `worker.format:es`
// matches the native module workers. Throwaway alongside esm-proof / workers-build-check.
const here = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: resolve(here, "app"),
  base: "./",
  worker: { format: "es" },
  server: { port: 5199, strictPort: true },
});
