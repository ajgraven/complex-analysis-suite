// define-family.mjs -- assemble a QD.Family.<name> record from config (QD-SOLV-4 / refactor C3b).
//
// The 10 families re-type an identical ~17-key record scaffolding. This factory supplies the MECHANICAL
// parts — `enforceInDisk`/`enforceOutDisk` from a single `unbounded` flag, the `computeTargets`
// { A[, F][, G] } composition, the DEFAULT `diverseInitialGuess` delegation, the fixed key layout — so a
// family declares only its distinct pieces. The per-family MATH and seed/continuation kernels are injected
// verbatim and NEVER unified (ADR-0007/0008): the families genuinely diverge (positional-`norm` vs
// whole-`norm` seed conventions; some carry their own `diverseInitialGuess`; F/G targets), so the factory
// removes the scaffolding, it does not merge the engines.
//
// config: {
//   name, unbounded?, matches, normalizeOpts,
//   evalPhi, phiTaylorAt,
//   computeTargetA, computeTargetF?, computeTargetG?,   // → computeTargets { A[, F][, G] }
//   residual, packPhi, unpackPhi, canonicalizePhi,
//   initialGuess, perturbedInitialGuess, diverseInitialGuess?,   // seeds; diverse defaults to QD.diverseInitialGuess
//   continuationSolve, verifyQuadratureIdentity, sampleBoundary?,
// }
import _QD from '../solver.mjs';

export function defineFamily(config) {
  const {
    name, unbounded = false, matches, normalizeOpts,
    evalPhi, phiTaylorAt,
    computeTargetA, computeTargetF = null, computeTargetG = null,
    residual, packPhi, unpackPhi, canonicalizePhi,
    initialGuess, perturbedInitialGuess, diverseInitialGuess,
    continuationSolve, verifyQuadratureIdentity, sampleBoundary,
  } = config;

  const record = {
    name,
    enforceInDisk: !unbounded,
    enforceOutDisk: !!unbounded,
    matches,
    normalizeOpts,
    evalPhi,
    phiTaylorAt,
    // Compose the target record from whichever computers the family supplied: bounded → { A, F:null };
    // unbounded → { A, F:[…] }; unboundedLQD_singular additionally → { …, G:[…] }.
    computeTargets(phi, hData) {
      const out = { A: computeTargetA(phi, hData), F: computeTargetF ? computeTargetF(phi, hData) : null };
      if (computeTargetG) out.G = computeTargetG(phi, hData);
      return out;
    },
    residual,
    packPhi,
    unpackPhi,
    canonicalizePhi,
    initialGuess,
    perturbedInitialGuess,
    // Default: the shared diverse-seed strategy; a family with its own passes it explicitly.
    diverseInitialGuess: diverseInitialGuess ||
      ((hData, norm, rng, r) => _QD.diverseInitialGuess(hData, norm, rng, r)),
    continuationSolve,
    verifyQuadratureIdentity,
  };
  // Optional key: only the 4 PQD families carry a boundary sampler.
  if (sampleBoundary) record.sampleBoundary = sampleBoundary;
  return record;
}
