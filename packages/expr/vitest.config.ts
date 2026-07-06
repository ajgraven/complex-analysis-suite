import { defineConfig } from "vitest/config";

// @cas/expr's tests (test/**). Registered in the root vitest.workspace.ts. Pure computation
// (parse -> JS evaluate + GLSL string emit), so the node environment suffices; the numeric
// GLSL≈JS backend-agreement property test needs a real WebGL context (GPU) and lives with the
// gpu extraction / a GPU-capable run.
export default defineConfig({
  test: {
    name: "expr",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
