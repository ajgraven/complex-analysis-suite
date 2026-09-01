import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Mirrors the 2d-electrostatics app's lint config (it was carved out of 2d-electrostatics, ADR-0036).
// The root config layers the cross-workspace dependency-boundary rule (an app may import packages,
// never another app).
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
    files: ["test/**", "*.config.{js,ts}"],
    languageOptions: { globals: { ...globals.node } },
  },
);
