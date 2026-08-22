// @ts-check
// =============================================================================
// qd.mjs -- named-export façade over the live QD namespace.
//
// The app is an ESM/Vite graph rooted at main.mjs. Many modules retain IIFE
// bodies for namespace compatibility, so solver.mjs publishes the shared QD
// object on globalThis while modules attach their APIs. This façade lets an
// ESM consumer import that established surface with named exports.
//
// Import it only after the solver graph has initialized (for example, from a
// later application module or an external module loaded after main.mjs).
// =============================================================================

const _global = (typeof window !== 'undefined') ? window
              : (typeof globalThis !== 'undefined') ? globalThis : {};
const _QD = _global.QD;

if (!_QD) {
  throw new Error(
    'qd.mjs: QD is undefined. Load the ESM solver graph before importing this façade.'
  );
}

// Math primitives.
export const Complex = _QD.Complex;
export const Taylor  = _QD.Taylor;

// Solver core.
export const evalPhi              = _QD.evalPhi;
export const phiTaylorAt          = _QD.phiTaylorAt;
export const residual             = _QD.residual;
export const residualNorm         = _QD.residualNorm;
export const packPhi              = _QD.packPhi;
export const unpackPhi            = _QD.unpackPhi;
export const newtonSolve          = _QD.newtonSolve;
export const solveInverseQD       = _QD.solveInverseQD;
export const searchAlternates     = _QD.searchAlternates;
export const isBoundaryUnivalent  = _QD.isBoundaryUnivalent;
export const sampleBoundary       = _QD.sampleBoundary;
export const sampleBoundaryAdaptive = _QD.sampleBoundaryAdaptive;
export const binomialCoeff        = _QD.binomialCoeff;
export const selectFamily         = _QD.selectFamily;
export const registerFamily       = _QD.registerFamily;
export const packPhiBySchema      = _QD.packPhiBySchema;
export const unpackPhiBySchema    = _QD.unpackPhiBySchema;
export const applySchemaClamps    = _QD.applySchemaClamps;

// Linear algebra (P1.2 — Householder QR).
export const solveLinearSystem    = _QD.solveLinearSystem;
export const solveLeastSquares    = _QD.solveLeastSquares;
export const houseQR              = _QD.houseQR;
export const numericalJacobian    = _QD.numericalJacobian;

// Inverse-Faber primitives (QD.Faber.*).
export const Faber                = _QD.Faber;

// Direct problem (QD.Direct.*).
export const Direct               = _QD.Direct;

// Schwarz / Sphere / param-slice subsystems (object namespaces).
export const Schwarz              = _QD.Schwarz;
export const Sphere               = _QD.Sphere;

// Custom h(w) text input.
export const parseH               = _QD.parseH;
export const formatH              = _QD.formatH;

// Critical-set kernel.
export const CriticalSet          = _QD.CriticalSet;
export const findCriticalPoints   = _QD.findCriticalPoints;

// Cross-tab envelope (P0.1a) + warm worker (P0.2).
export const PrimarySolution      = _QD.PrimarySolution;
export const PrimarySolverWorker  = _QD.PrimarySolverWorker;

// Family registry — convenience.
export const Family               = _QD.Family;

// The whole QD object — escape hatch for anything not yet enumerated above.
export default _QD;
