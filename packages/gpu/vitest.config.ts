import { defineConfig } from "vitest/config";

// @cas/gpu's tests (test/**). Registered in the root vitest.workspace.ts. The df64 numeric
// reference is pure computation, so the node environment suffices. The dual-backend GLSL≈JS
// property test needs a real WebGL context (GPU) and is added later in the extraction.
export default defineConfig({
  test: {
    name: "gpu",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
