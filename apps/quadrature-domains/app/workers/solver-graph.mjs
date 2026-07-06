// =============================================================================
// solver-graph.mjs -- Native-ESM barrel for the solver worker graph (Phase 2).
//
// The ES-module replacement for the runtime-Blob bundle the workers used to build
// by fetch()ing WORKER_BUNDLE_FILES and concatenating the source. A native module
// worker imports THIS instead: it side-effect-loads the whole solver cluster
// (solver core + poly-helpers + every family/seed, in WORKER_BUNDLE_FILES order)
// so the shared QD namespace is fully populated, then re-exports it as default.
//
// parse-h is intentionally omitted (it is still classic, and the workers never
// call it — hData arrives already parsed over the wire), matching the old bundle's
// effective contents for the worker's purposes.
// =============================================================================
import _QD from '../solver.mjs';
import '../poly-helpers.mjs';
import '../solver-faber.mjs';
import '../solvers/seeds/seeds-qd.mjs';
import '../solver-qd.mjs';
import '../solvers/seeds/seeds-uqd.mjs';
import '../solver-uqd.mjs';
import '../solver-lqd-common.mjs';
import '../solvers/seeds/seeds-lqd.mjs';
import '../solver-lqd.mjs';
import '../solvers/seeds/seeds-lqd-singular.mjs';
import '../solver-lqd-singular.mjs';
import '../solvers/seeds/seeds-uqd-lqd.mjs';
import '../solver-uqd-lqd.mjs';
import '../solvers/seeds/seeds-uqd-lqd-singular.mjs';
import '../solver-uqd-lqd-singular.mjs';
import '../solver-pqd-common.mjs';
import '../solvers/seeds/seeds-pqd.mjs';
import '../solver-pqd.mjs';
import '../solvers/seeds/seeds-pqd-singular.mjs';
import '../solver-pqd-singular.mjs';
import '../solvers/seeds/seeds-uqd-pqd.mjs';
import '../solver-uqd-pqd.mjs';
import '../solvers/seeds/seeds-uqd-pqd-singular.mjs';
import '../solver-uqd-pqd-singular.mjs';

export default _QD;
