import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Mirrors the 2d-hydrodynamics app's lint config (the PRA-0 template, ADR-0047). The root config
// layers the cross-workspace dependency-boundary rule (an app may import packages, never another app).
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
      // DESIGN §1, from Contour Integration's M5.1 review: a parameter shadowing the module state it
      // was meant to update is legal TypeScript and was three silent bugs there.
      "no-shadow": "off",
      "@typescript-eslint/no-shadow": "error",
    },
  },
  {
    files: ["test/**", "*.config.{js,ts}"],
    languageOptions: { globals: { ...globals.node } },
  },
);
