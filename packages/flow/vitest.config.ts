import { defineConfig } from "vitest/config";

// @cas/flow tests (test/**). Registered in the root vitest.workspace.ts. The moved specs are
// pure-numeric (the reference flows + the SC polygon fits over @cas/conformal), so the node
// environment suffices — net2d.ts (DOM-only line-art) carries no test, as it did in the app.
export default defineConfig({
  test: {
    name: "flow",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
