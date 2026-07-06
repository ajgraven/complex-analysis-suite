import { defineConfig } from "vitest/config";

// @cas/interchange's corpus (test/**). Registered in the root vitest.workspace.ts. The codec's
// web globals (TextEncoder / btoa / atob) exist in Vitest's node environment (Node >= 18).
export default defineConfig({
  test: {
    name: "interchange",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
