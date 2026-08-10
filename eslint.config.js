// Root ESLint flat config.
//
// Scope: the root config's ONLY job is the **dependency-boundary rule** (ARCHITECTURE.md §4)
// — "no app imports another app; no package imports an app." Each app lints its own source
// with its own tuned config (apps/*/eslint.config.*), invoked via `pnpm -r … run lint`; the
// root config deliberately does NOT restyle or re-judge that code. The remaining graph
// invariants (strictly-downward imports between packages, cycle detection) are a natural fit
// for dependency-cruiser and are planned as a follow-on check (MIGRATION.md "Ongoing").
//
// The boundary rule is applied to ESM import surfaces (.ts/.mjs and package sources), which
// is where a cross-workspace import can actually occur — QD's classic <script> files have no
// ES imports, so they are left to QD's own config.

import globals from "globals";
import tseslint from "typescript-eslint";

// Workspace app names (present or planned). Importing any as a bare specifier from another
// workspace member violates the dependency rule.
const APP_NAMES = [
  "complex-dynamics",
  "complex-function-plotter",
  "quadrature-domains",
  "correspondences",
  "launcher",
  "riemann-map",
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
  {
    // Inline eslint-disable directives belong to each file's owning config, not the root.
    linterOptions: { reportUnusedDisableDirectives: "off" },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tseslint.parser,
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // Boundary rule, on ESM import surfaces only.
    files: [
      "apps/**/*.{ts,tsx,mts,cts,mjs}",
      "packages/**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: noCrossAppImports }],
    },
  },
);
