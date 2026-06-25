import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

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
      // Guardrails locking in the codebase's current hygiene so regressions are caught.
      // (Type-aware rules like no-floating-promises are intentionally NOT enabled: the UI
      //  layer uses fire-and-forget async handlers, and they'd need `void` noise everywhere.)
      eqeqeq: ["error", "always"],
      "no-console": ["error", { allow: ["warn", "info", "error"] }],
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
  {
    // Test and config files may use Node globals.
    files: ["test/**", "*.config.{js,ts}"],
    languageOptions: { globals: { ...globals.node } },
  },
);
