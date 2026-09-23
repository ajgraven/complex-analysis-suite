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
  "contour-integration",
  "launcher",
  "riemann-map",
  "argument-principle",
  "faber-transform",
  // Added 2026-09-22 (ADR-0046). The four before `polynomial-roots` were never listed, so this rule had
  // silently stopped covering a third of the apps; the graph-level rule in .dependency-cruiser.cjs is
  // generic and did cover them, which is why nothing broke.
  "2d-electrostatics",
  "2d-hydrodynamics",
  "hele-shaw-flow",
  "potential-theory",
  "polynomial-roots",
  "polynomial-root-analysis", // ADR-0047 (PRA-0)
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
  {
    // **Shadowing, in the one app whose shell is a long closure over mutable state.**
    //
    // `apps/contour-integration/src/shell/app.ts` HELD its whole state — `branch`, `contour`,
    // `mode`, `input` — as `let` bindings in one module closure, and its renderers took pieces of
    // that state as parameters. A parameter named after the state it was passed therefore SHADOWS
    // it, and an assignment inside the renderer writes to the parameter and is silently discarded.
    // (Past tense re-measured 2026-09-20: M6.1 lifted those four into `ShellState` and the M8
    // rebuild kept them there, so the shareable state is now three `let`s at lines 125-127 —
    // `state`, `compiled`, `resolution` — with the file's other six holding stage/sweep/hash
    // machinery rather than the argument. The rule stays, and so does the finding that bought it:
    // the hazard
    // is a renderer parameter shadowing an outer binding, which a state object narrows but does not
    // remove.)
    // That happened: `renderDeclaration(branch)` made the sheet spinner do nothing, and made
    // changing the declared determination move the ANSWER while leaving the cut drawn where it was
    // — the two then disagreeing about where the discontinuity is, which is the one thing
    // "declaring the determination IS declaring the cut" exists to prevent. TypeScript cannot catch
    // it; assigning to a parameter is legal, and both sides had the same type.
    //
    // Scoped to this app rather than the repo: `no-param-reassign` would be the broader rule and
    // fires 268 times across `packages/`, nearly all of it legitimate (Euclid's algorithm
    // reassigning `a` and `b`). `no-shadow` here was three harmless cases, now renamed, and catches
    // the hazard at its source.
    files: ["apps/contour-integration/**/*.{ts,tsx,mts,cts}"],
    rules: { "no-shadow": "error" },
  },
);
