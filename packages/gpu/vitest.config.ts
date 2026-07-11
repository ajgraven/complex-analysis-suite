import { defineConfig, configDefaults } from "vitest/config";

// @cas/gpu's tests (test/**). Registered in the root vitest.workspace.ts. The df64 numeric
// reference is pure computation, so the node environment suffices. The dual-backend GLSL≈JS
// *numeric* property test (runGLSL) needs a real WebGL2 context and lives in `*.browser.test.ts`,
// run by the SEPARATE vitest.browser.config.ts (`pnpm test:browser`) — excluded here so the node
// gate never tries to launch a browser. (Review P4: GLSL-in-CI.)
export default defineConfig({
  test: {
    name: "gpu",
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "test/**/*.browser.test.ts"],
  },
});
