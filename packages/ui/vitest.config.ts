import { defineConfig } from "vitest/config";

// @cas/ui tests (test/**). Registered in the root vitest.workspace.ts. Unlike every prior package (pure
// numeric kernels, node env), @cas/ui is the suite's DOM shell, so its tests run under **jsdom** — the
// first non-node package environment. jsdom has no WebGL and no real Worker, so the canvas tests assert
// the a11y wiring (roles / labels / keyboard) rather than pixels, and the compute-client tests exercise
// the synchronous fallback path; the worker path is verified in-browser at app-adoption time.
export default defineConfig({
  test: {
    name: "ui",
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
});
