import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Mirrors the Correspondences / Complex-Dynamics config (the greenfield apps hold the same hygiene
// line), plus one rule of this app's own: the **internal layer boundary**.
//
// DESIGN.md §1 fixes four layers — kernel -> engine -> ui/shell — and the value of `kernel/` and
// `engine/` being pure (no DOM, no upward imports) is the whole reason the golden corpus can exist.
// That is worth enforcing on day one, while it costs nothing, rather than rediscovering it later.
// The root config layers the cross-workspace rule (an app may import packages, never another app).
const noUpwardImports = (groups) => ({
  "no-restricted-imports": [
    "error",
    {
      patterns: groups.map((g) => ({
        group: [`**/${g}/**`, `**/${g}`],
        message:
          "Layer boundary (DESIGN.md §1): kernel/ imports only @cas/*; engine/ imports kernel/; nothing imports upward. Move the shared piece down, or the caller up.",
      })),
    },
  ],
});

export default tseslint.config(
  {
    ignores: ["dist/", "node_modules/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      eqeqeq: ["error", "always"],
      "no-console": ["error", { allow: ["warn", "info", "error"] }],
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
  {
    files: ["src/kernel/**"],
    rules: noUpwardImports(["engine", "ui", "shell", "worker"]),
  },
  {
    files: ["src/engine/**"],
    rules: noUpwardImports(["ui", "shell"]),
  },
  {
    files: ["test/**", "*.config.{js,ts}"],
    languageOptions: { globals: { ...globals.node } },
  },
);
