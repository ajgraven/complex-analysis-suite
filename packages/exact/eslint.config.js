// @cas/exact lint config. The package is 100% strict TypeScript, so this is the standard
// typescript-eslint recommended set. The ROOT config layers the cross-workspace dependency-boundary
// rule (ARCHITECTURE.md §4) on top of this — @cas/exact is a package and may not import any app.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
