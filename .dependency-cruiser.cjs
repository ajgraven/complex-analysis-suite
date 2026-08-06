// dependency-cruiser — the workspace dependency-graph guardrail (CLAUDE.md "One dependency
// direction" / ARCHITECTURE.md §4). It enforces the two invariants the root ESLint config
// deliberately leaves to it (see eslint.config.js header): NO import cycles, and the strictly-
// downward graph shape — a shared package may not depend on an app, and an app may not import
// another app. ESLint's `no-restricted-imports` still forbids the bare-specifier cross-app
// import per-file; this adds the graph-level checks (cycle detection + path-based cross-workspace
// edges, which a per-file lint rule cannot see). Runs in `pnpm dep:check` and the CI `build` gate.
// (Refactor F1; the "planned follow-on" the ESLint header + MIGRATION.md "Ongoing" anticipated.)

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment:
        "No import cycles, anywhere under packages/ or apps/. Cycles defeat incremental reasoning " +
        "and make extraction (the whole point of this suite) impossible to do safely.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-package-to-app",
      comment:
        "A shared @cas/* package must not depend on an app — imports go downward only. A primitive " +
        "an app needs is extracted INTO a package (ADR-0007), never reached for UP into an app.",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "no-cross-app",
      comment:
        "An app must not import another app (no app imports another app). Shared logic belongs in a " +
        "package both can depend on downward; apps hand data off via the interchange format, not imports.",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/([^/]+)/", pathNot: "^apps/$1/" },
    },
  ],
  options: {
    // Third-party code is not ours to police; do not crawl into it.
    doNotFollow: { path: "node_modules" },
    // Build outputs / caches are generated, not source (and a package's own dist/ mirrors its src/).
    exclude: { path: "(^|/)(dist|build|coverage|\\.vite|\\.git)/" },
    // Include TYPE-ONLY imports (`import type { … }`) in the graph. This is load-bearing: CD-4 was a
    // 5-module *type-only* cycle in complex-dynamics/render — invisible to a runtime-only crawl. It
    // is fixed (stage A3), and this setting is what keeps a future type-only cycle from silently
    // reappearing under the gate.
    tsPreCompilationDeps: true,
    // SCOPE NOTE: `no-circular` runs over first-party SOURCE — every module under packages/*/src and
    // apps/* (~580, incl. type-only edges), so cycles WITHIN any package or app are caught (the real,
    // common risk). Cross-package edges (e.g. @cas/gpu → @cas/expr) resolve through the target
    // package's built `exports` (dist/, excluded above), so the package↔package layer is kept acyclic
    // by its package.json dependency DAG (only gpu → expr today) — a reverse edge is a deliberate,
    // reviewable package.json change, not a silent import. The path rules above enforce the direction
    // at the workspace boundary regardless of how an edge resolves.
  },
};
