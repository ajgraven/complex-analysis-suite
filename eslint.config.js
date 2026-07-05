// Root ESLint flat config — Phase 0 skeleton.
//
// The one rule that must exist from day one is the **dependency-boundary rule** that
// encodes ARCHITECTURE.md §4: "packages import only downward; apps import packages; no
// app imports another app; no cycles." This config enforces the load-bearing part that
// a lint rule can express cheaply and without false positives on legacy code:
//
//   * no app may import another app (by its workspace name), and
//   * no package may import an app.
//
// The remaining invariants — strictly downward imports *between* packages, and cycle
// detection — are added in Phase 1 as a dependency-cruiser check (per MIGRATION.md
// Phase 1 and the ADR-0004 rationale), which is the right tool for graph-level rules.
// Deliberately narrow: Phase 0 does not impose style rules on the two apps' existing
// code (each app keeps its own eslint config); that unification is Phase 1.

import globals from "globals";
import tseslint from "typescript-eslint";

// Workspace app names (present or planned). Importing any of these as a bare specifier
// from inside another workspace member is a dependency-rule violation.
const APP_NAMES = [
  "complex-dynamics",
  "quadrature-domains",
  "correspondences",
  "launcher",
];

const noCrossAppImports = APP_NAMES.flatMap((name) => [name, `${name}/*`]).map(
  (pattern) => ({
    group: [pattern],
    message:
      "Dependency rule (ARCHITECTURE.md §4): an app may not import another app, and a package may not import an app. Depend downward on packages instead.",
  }),
);

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.vite/**",
      "**/coverage/**",
    ],
  },
  // Parse TypeScript sources with the TS parser (apps contain .ts).
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tseslint.parser,
      globals: { ...globals.browser, ...globals.node },
    },
  },
  // The boundary rule, scoped to workspace members only.
  {
    files: [
      "apps/**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}",
      "packages/**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: noCrossAppImports }],
    },
  },
);
