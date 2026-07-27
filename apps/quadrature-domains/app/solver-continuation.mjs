// ESM (Phase 2 port). Shared continuation-in-c driver for the unbounded QD family
// solvers — a pure function with NO side effects and NO namespace registration;
// imported directly by the three families that use it (and so pulled in
// transitively by main.mjs and the test bootstrap, which import those solvers).
import { Complex } from './complex.mjs';
import _QD from './solver.mjs';

// =============================================================================
// solver-continuation.mjs -- the continuation-in-c homotopy shared by the
// unbounded classical (UQD), unbounded-LQD (UQDL) and singular-unbounded-LQD
// (UQDLS) solvers.
//
// All three walked c from a small starting value up to the user's target,
// warm-starting Newton at each step and grow/shrink-adapting the step size. The
// three copies were byte-identical apart from (1) the family's initial-guess
// builder, (2) an error-message label and (3) the result `method` tag (review
// finding cd-dup-06). They had even begun to DRIFT: only the classical (UQD) copy
// annotated its "step underflow" error with the target c. The loop lives here
// once — each family passes its initial-guess closure, its label and its method —
// and the target-c annotation is now included for every family (strictly more
// information in the error; no caller inspects these strings).
// =============================================================================

const QD = _QD;

/**
 * Walk c from a small start up to `cTarget`, warm-starting Newton at each step.
 *
 * @param {object} hData    Quadrature data ({ poles: [{ a, principal }, …] }).
 * @param {number} cTarget  Target value of the continuation parameter c.
 * @param {object} params
 * @param {(c:number)=>object} params.initialGuess  Builds a seed φ for a given c.
 * @param {string} params.label   Inserted after "continuationInC" in every error
 *                                 message (e.g. "" for UQD, " (LQD)" for UQDL).
 * @param {string} params.method  The `method` tag on a successful result.
 * @param {object} [params.options]  { cStart, growFactor, shrinkFactor, minStep,
 *                                     maxSteps, newton } — the tuning knobs.
 * @returns {object} A solve result: on success { success:true, phi, iterations,
 *   residual, trace, method }; on failure { success:false, error, trace, … }.
 */
export function continuationInC(hData, cTarget, { initialGuess, label, method, options = {} }) {
  const {
    cStart       = null,
    growFactor   = 1.6,
    shrinkFactor = 0.5,
    minStep      = 1e-4,
    maxSteps     = 80,
    newton       = {},
  } = options;

  let minA = Infinity;
  for (const p of hData.poles) {
    const m = Complex.abs(p.a);
    if (m > 0 && m < minA) minA = m;
  }
  const startGuess = cStart ?? Math.min(cTarget, isFinite(minA) ? 0.25 * minA : 0.25);
  if (startGuess <= 0) {
    return { success: false, error: "continuationInC" + label + ": invalid starting c", trace: [] };
  }

  const trace = [];
  let c = startGuess;
  let phi = initialGuess(c);

  let warmup;
  while (true) {
    warmup = QD.newtonSolve(phi, hData, newton);
    if (warmup.success) { phi = warmup.phi; break; }
    c *= shrinkFactor;
    if (c < minStep) {
      return {
        success: false,
        error: "continuationInC" + label + ": warmup failed even at c=" + c.toExponential(2),
        phi: warmup.phi, trace,
      };
    }
    phi = initialGuess(c);
  }
  trace.push({ c, ok: true, residual: warmup.residual });

  if (c >= cTarget - 1e-12) {
    return { success: true, phi, iterations: 0, residual: warmup.residual, trace, method };
  }

  let lastSuccessC = c;
  let stepSize = Math.max((cTarget - c) * 0.4, minStep);
  for (let step = 0; step < maxSteps; step++) {
    if (lastSuccessC >= cTarget - 1e-12) break;
    const nextC = Math.min(cTarget, lastSuccessC + stepSize);
    const phiNext = QD.clonePhi(phi);
    phiNext.c = nextC;
    const result = QD.newtonSolve(phiNext, hData, newton);
    if (result.success) {
      phi = result.phi;
      lastSuccessC = nextC;
      trace.push({ c: nextC, ok: true, residual: result.residual });
      stepSize *= growFactor;
    } else {
      stepSize *= shrinkFactor;
      trace.push({ c: nextC, ok: false, residual: result.residual ?? null });
      if (stepSize < minStep) {
        return {
          success: false,
          error: "continuationInC" + label + ": step underflow at c=" + lastSuccessC.toFixed(4) +
                 " (target c=" + cTarget.toFixed(4) + ")",
          phi, trace, lastC: lastSuccessC,
        };
      }
    }
  }
  if (lastSuccessC < cTarget - 1e-9) {
    return {
      success: false,
      error: "continuationInC" + label + ": max steps reached at c=" + lastSuccessC.toFixed(4),
      phi, trace, lastC: lastSuccessC,
    };
  }
  return {
    success: true, phi, iterations: 0,
    residual: trace[trace.length - 1].residual,
    trace, method,
  };
}
