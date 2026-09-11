// @cas/rigor lint config. 100% strict TypeScript, so the standard typescript-eslint recommended
// set. The ROOT config layers the cross-workspace dependency-boundary rule (ARCHITECTURE.md §4).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
