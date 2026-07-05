import { defineConfig } from "vite";

// Static, GitHub-Pages-friendly build with relative asset paths (CLAUDE.md decision 11).
// The launcher deploys at the suite's top-level Pages URL; each app deploys independently
// underneath it.
export default defineConfig({
  base: "./",
});
