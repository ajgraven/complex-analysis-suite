// @cas/expr lint config — strict TypeScript, the typescript-eslint recommended set. The root
// config layers the cross-workspace dependency-boundary rule (a package may not import an app).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
