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
  },
  {
    // Test and config files may use Node globals.
    files: ["test/**", "*.config.{js,ts}"],
    languageOptions: { globals: { ...globals.node } },
  },
);
