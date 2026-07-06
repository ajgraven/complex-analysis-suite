// @cas/interchange lint config — strict TypeScript, the typescript-eslint recommended set. The
// ROOT config layers the cross-workspace dependency-boundary rule on top (interchange is a
// package and may not import any app).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
