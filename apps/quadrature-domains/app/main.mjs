// =============================================================================
// main.mjs -- The page ESM entry (Phase 2 flip). Vite loads THIS instead of the
// classic asset-manifest.js + document.write loader. It side-effect-imports every
// page module in dependency order (each attaches onto the QD / QD_UI namespace),
// then applies the editable UI strings (was an inline <script> after the loader).
//
// HAND-MAINTAINED (the asset-manifest.js generator was retired at the flip). The import
// ORDER below is significant — later modules depend on earlier side-effect registrations;
// workers/solver-graph.mjs and test/bootstrap.js mirror this same order. Modules live in
// core/ solvers/ qd/ sym/ analysis/ ui/ (E2 folderization) — keep new imports in dependency
// order, not alphabetical.
// =============================================================================
// Self-hosted mathjs + KaTeX as window.math / window.katex (was CDN <script> tags).
// MUST be first so the globals exist before the page modules below run.
import './core/vendor-globals.mjs';

import QD from './solvers/solver.mjs';

import './core/complex.mjs';
import './core/taylor.mjs';
import './solvers/solver.mjs';
import './solvers/solver-faber.mjs';
import './solvers/seeds/seeds-qd.mjs';
import './solvers/solver-qd.mjs';
import './solvers/seeds/seeds-uqd.mjs';
import './solvers/solver-uqd.mjs';
import './solvers/solver-lqd-common.mjs';
import './solvers/seeds/seeds-lqd.mjs';
import './solvers/solver-lqd.mjs';
import './solvers/seeds/seeds-lqd-singular.mjs';
import './solvers/solver-lqd-singular.mjs';
import './solvers/seeds/seeds-uqd-lqd.mjs';
import './solvers/solver-uqd-lqd.mjs';
import './solvers/seeds/seeds-uqd-lqd-singular.mjs';
import './solvers/solver-uqd-lqd-singular.mjs';
import './solvers/solver-pqd-common.mjs';
import './solvers/seeds/seeds-pqd.mjs';
import './solvers/solver-pqd.mjs';
import './solvers/seeds/seeds-pqd-singular.mjs';
import './solvers/solver-pqd-singular.mjs';
import './solvers/seeds/seeds-uqd-pqd.mjs';
import './solvers/solver-uqd-pqd.mjs';
import './solvers/seeds/seeds-uqd-pqd-singular.mjs';
import './solvers/solver-uqd-pqd-singular.mjs';
import './core/poly-helpers.mjs';
import './core/parse-h.mjs';
import './ui/ui-strings.mjs';
import './analysis/critical-set.mjs';
import './analysis/univalence.mjs';
import './analysis/cusps.mjs';
import './analysis/observables.mjs';
import './analysis/symmetry.mjs';
import './solvers/solver-cmax.mjs';
import './analysis/thesis-examples.mjs';
import './analysis/faber-analysis.mjs';
import './sym/sym-core.mjs';
import './sym/sym-radical.mjs';
import './qd/qd-equations.mjs';
import './qd/qd-constraints.mjs';
import './solvers/primary-solution.mjs';
import './solvers/primary-solver-worker.mjs';
// O4: warm the live (drag) worker lane on the user's first pointerdown so the
// first drag frame isn't the cold spawn. Registers a one-time listener only —
// no boot-time spawn (that would just slow first solve). See prewarm.mjs.
import './solvers/prewarm.mjs';
import './core/qol.mjs';
import './ui/ui-presets.mjs';
import './ui/ui-state.mjs';
import './ui/ui-domain-plot.mjs';
import './analysis/riemann-latex.mjs';
import './ui/ui-modes.mjs';
import './ui/ui-pole-grid.mjs';
import './ui/ui-h-text.mjs';
import './ui/ui-solve.mjs';
import './ui/ui-url-state.mjs';
import './ui/ui-thesis.mjs';
import './ui/ui-faber.mjs';
import './ui/ui-qd-equations.mjs';
import './ui/ui-figure-export.mjs';
import './ui/ui-qol-help.mjs';
import './ui/ui-copy-buttons.mjs';
import './ui/ui.mjs';
import './lazy-features.mjs';

// Fill [data-str*] elements from QD.Strings (ui-strings.mjs). Modules are deferred, so
// the DOM is parsed by now; this ran as an inline post-loader <script> in the classic page.
if (QD && QD.Strings && typeof QD.Strings.apply === "function") QD.Strings.apply();
