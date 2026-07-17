// =============================================================================
// main.mjs -- The page ESM entry (Phase 2 flip). Vite loads THIS instead of the
// classic asset-manifest.js + document.write loader. It side-effect-imports every
// page module in PAGE_SCRIPTS order (each attaches onto the QD / QD_UI namespace),
// then applies the editable UI strings (was an inline <script> after the loader).
//
// GENERATED from asset-manifest.js PAGE_SCRIPTS by scratchpad/gen-main.mjs.
// =============================================================================
// Self-hosted mathjs + KaTeX as window.math / window.katex (was CDN <script> tags).
// MUST be first so the globals exist before the page modules below run.
import './vendor-globals.mjs';

import QD from './solver.mjs';

import './complex.mjs';
import './taylor.mjs';
import './solver.mjs';
import './solver-faber.mjs';
import './solvers/seeds/seeds-qd.mjs';
import './solver-qd.mjs';
import './solvers/seeds/seeds-uqd.mjs';
import './solver-uqd.mjs';
import './solver-lqd-common.mjs';
import './solvers/seeds/seeds-lqd.mjs';
import './solver-lqd.mjs';
import './solvers/seeds/seeds-lqd-singular.mjs';
import './solver-lqd-singular.mjs';
import './solvers/seeds/seeds-uqd-lqd.mjs';
import './solver-uqd-lqd.mjs';
import './solvers/seeds/seeds-uqd-lqd-singular.mjs';
import './solver-uqd-lqd-singular.mjs';
import './solver-pqd-common.mjs';
import './solvers/seeds/seeds-pqd.mjs';
import './solver-pqd.mjs';
import './solvers/seeds/seeds-pqd-singular.mjs';
import './solver-pqd-singular.mjs';
import './solvers/seeds/seeds-uqd-pqd.mjs';
import './solver-uqd-pqd.mjs';
import './solvers/seeds/seeds-uqd-pqd-singular.mjs';
import './solver-uqd-pqd-singular.mjs';
import './poly-helpers.mjs';
import './parse-h.mjs';
import './ui-strings.mjs';
import './critical-set.mjs';
import './univalence.mjs';
import './cusps.mjs';
import './observables.mjs';
import './symmetry.mjs';
import './solver-cmax.mjs';
import './thesis-examples.mjs';
import './faber-analysis.mjs';
import './sym-core.mjs';
import './sym-radical.mjs';
import './qd-equations.mjs';
import './qd-constraints.mjs';
import './primary-solution.mjs';
import './primary-solver-worker.mjs';
import './direct/direct-common.mjs';
import './schwarz/schwarz-common.mjs';
import './schwarz/schwarz-inverse.mjs';
import './schwarz/schwarz-analysis.mjs';
import './schwarz/schwarz-forward.mjs';
import './schwarz/schwarz-webgl.mjs';
import './schwarz/schwarz-cpu-worker.mjs';
import './param-slice/param-slice-common.mjs';
import './param-slice/param-slice-pool.mjs';
import './qol.mjs';
import './ui-presets.mjs';
import './ui-state.mjs';
import './ui-domain-plot.mjs';
import './riemann-latex.mjs';
import './ui-modes.mjs';
import './ui-pole-grid.mjs';
import './ui-h-text.mjs';
import './ui-solve.mjs';
import './ui-url-state.mjs';
import './ui-thesis.mjs';
import './ui-faber.mjs';
import './ui-qd-equations.mjs';
import './algebra/sym-worker.mjs';
import './algebra/cas-export.mjs';
import './algebra/expr-parser.mjs';
import './algebra/algebra-store.mjs';
import './algebra/algebra-canvas.mjs';
import './algebra/algebra-ui.mjs';
import './ui.mjs';
import './direct/direct-recompute.mjs';
import './direct/direct-verify.mjs';
import './direct/direct-ui.mjs';
import './schwarz/schwarz-paint.mjs';
import './schwarz/schwarz-render.mjs';
import './schwarz/schwarz-features.mjs';
import './schwarz/schwarz-interaction.mjs';
import './schwarz/schwarz-ui.mjs';
import './param-slice/param-slice-render.mjs';
import './param-slice/param-slice-ui.mjs';
import './sphere/sphere-common.mjs';
import './sphere/sphere-webgl.mjs';
import './sphere/sphere-ui.mjs';

// Fill [data-str*] elements from QD.Strings (ui-strings.mjs). Modules are deferred, so
// the DOM is parsed by now; this ran as an inline post-loader <script> in the classic page.
if (QD && QD.Strings && typeof QD.Strings.apply === "function") QD.Strings.apply();
