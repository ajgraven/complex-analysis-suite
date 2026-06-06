'use strict';
// =============================================================================
// cmax tests — QD.estimateMaxConformalRadius: the automatic estimator of the
// maximum conformal radius c* for which an UNBOUNDED quadrature domain exists.
//
// The estimator is dependency-injected (a `solveFn` is passed in), so most of
// the contract is checked against cheap SYNTHETIC stubs (deterministic, fast),
// and one section drives the REAL QD.solveInverseQD on a known unbounded case.
//
// Coverage map:
//   §1 bracket→bisection converges to a known threshold (stub valid iff c≤T)
//   §2 always-valid stub  → found:false, reason 'no-invalid-below-ceiling'
//   §3 always-invalid stub → found:false, reason 'no-valid-at-start'
//   §4 warm-start GAUGE INJECTION: every warm seed carries c == queried c
//      (the exact c-slider-bug class — HANDOFF #61)
//   §5 CONFIRM-INVALID guard: a warm failure that a fresh solve would pass must
//      NOT shrink c* (no underestimation from a bad seed)
//   §6 real solver: a classical unbounded QD (deltoid h=w²) brackets a finite
//      c*; 0.99·c* solves valid, 1.05·c* does not.
// =============================================================================
require('./bootstrap');

// The estimator is a page-only module (not in the bootstrap CORE list); load it
// into the shared vm exactly like ui-inputs.test.js loads ui-modes.js. It
// registers QD.estimateMaxConformalRadius on the QD namespace (= global QD).
loadInCtx('solver-cmax.js');

module.exports = async function run() {
  section('cmax — max-conformal-radius estimator');

  const estimate = QD.estimateMaxConformalRadius;
  ok('estimator exposed on QD', typeof estimate === 'function');

  // A clonable minimal unbounded φ (clonePhi requires phi.branches to be an array).
  const mkPhi = (c) => ({ family: 'unboundedQD', unbounded: true, c, branches: [] });
  // A valid result is univalent + identityOK; an INVALID one mimics the real
  // solver's fallback (success:true but NOT univalent) so we also prove the gate
  // ignores `success` alone.
  const result = (valid, c) => valid
    ? { success: true, primary: { univalent: true,  identityOK: true, phi: mkPhi(c), residual: 1e-12 } }
    : { success: true, primary: { univalent: false, identityOK: true, phi: mkPhi(c), residual: 1e-3  } };

  const hStub = { poles: [], polyPart: [] };
  const baseOpts = { unbounded: true };

  // ---- §1 bracket + bisection correctness ----------------------------------
  {
    const T = 1.234;
    const solveFn = (h, opts) => result(opts.c <= T, opts.c);
    const res = await estimate(hStub, baseOpts, solveFn, { cStart: 0.5, relTol: 1e-3, maxSolves: 60 });
    ok('§1 found a finite c*', res.found === true, 'reason=' + res.reason);
    ok('§1 reason = bracketed', res.reason === 'bracketed');
    ok('§1 cMax ≈ threshold 1.234', approxEq(res.cMax, T, 3e-3), 'cMax=' + res.cMax);
    ok('§1 cMax ≤ threshold (never reports an invalid c)', res.cMax <= T + 1e-9, 'cMax=' + res.cMax);
    ok('§1 phiAtMax returned', !!(res.phiAtMax && res.phiAtMax.unbounded));
    // every recorded valid probe is at c ≤ T, every invalid at c > T (monotone gate)
    const consistent = res.trace.every(t => t.valid === (t.c <= T + 1e-12));
    ok('§1 trace gate is monotone in c', consistent);
  }

  // ---- §2 no invalid below the ceiling (always valid) ----------------------
  {
    const solveFn = (h, opts) => result(true, opts.c);
    const res = await estimate(hStub, baseOpts, solveFn, { cStart: 0.5, cCeiling: 10, relTol: 1e-3 });
    ok('§2 not found (valid up to ceiling)', res.found === false);
    ok('§2 reason = no-invalid-below-ceiling', res.reason === 'no-invalid-below-ceiling');
    ok('§2 ceiling echoed', res.ceiling === 10);
    ok('§2 cLowValid set near ceiling', res.cLowValid > 5 && res.cLowValid <= 10, 'cLowValid=' + res.cLowValid);
    ok('§2 phiAtMax returned for the largest valid c', !!res.phiAtMax);
  }

  // ---- §3 no valid solution at the start (always invalid) ------------------
  {
    const solveFn = (h, opts) => result(false, opts.c);
    const res = await estimate(hStub, baseOpts, solveFn, { cStart: 0.5, shrinkTries: 6 });
    ok('§3 not found (nothing valid)', res.found === false);
    ok('§3 reason = no-valid-at-start', res.reason === 'no-valid-at-start');
    ok('§3 cMax null', res.cMax === null);
  }

  // ---- §4 warm-start gauge injection ---------------------------------------
  {
    const T = 1.234;
    const seen = [];
    const solveFn = (h, opts) => { seen.push(opts); return result(opts.c <= T, opts.c); };
    const res = await estimate(hStub, baseOpts, solveFn, { cStart: 0.5, relTol: 1e-3, maxSolves: 60 });
    ok('§4 estimation succeeded', res.found === true);
    const warmCalls = seen.filter(o => o.warmPhi);
    ok('§4 at least one warm-started probe happened', warmCalls.length > 0, 'warm=' + warmCalls.length);
    const allInjected = warmCalls.every(o => o.warmPhi.c === o.c);
    ok('§4 every warm seed carries c == queried c (gauge injection)', allInjected);
    // identity gate is always forced on
    ok('§4 identityCheck forced on for every probe', seen.every(o => o.identityCheck === true));
  }

  // ---- §5 confirm-invalid guard (no underestimation from a bad seed) -------
  {
    const T = 1.0;
    // Truth: valid iff c ≤ T. But a WARM probe spuriously "fails" in [0.85, T]
    // (a bad-seed band) even though a FRESH solve there succeeds. Without the
    // confirm-invalid retry the estimator would bracket too low (~0.85).
    const solveFn = (h, opts) => {
      const c = opts.c, warm = !!opts.warmPhi;
      let valid;
      if (c > T) valid = false;
      else if (warm && c >= 0.85) valid = false;   // bad-seed band
      else valid = true;
      return result(valid, c);
    };
    const res = await estimate(hStub, baseOpts, solveFn, { cStart: 0.5, relTol: 5e-3, maxSolves: 80 });
    ok('§5 found a finite c*', res.found === true, 'reason=' + res.reason);
    ok('§5 c* NOT underestimated into the bad-seed band', res.cMax > 0.95, 'cMax=' + res.cMax);
    ok('§5 c* ≈ true threshold 1.0', approxEq(res.cMax, T, 1e-2), 'cMax=' + res.cMax);
  }

  // ---- §6 real solver: classical unbounded QD (deltoid h = w²) -------------
  {
    const hData = { poles: [], polyPart: [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: 1, im: 0 }] };
    const opts = { unbounded: true, identityTol: 1e-6 };
    const res = await estimate(hData, opts, QD.solveInverseQD,
                              { cStart: 0.2, relTol: 1e-2, maxSolves: 40 });
    ok('§6 deltoid: bracketed a finite c*', res.found === true, 'reason=' + res.reason);
    ok('§6 deltoid: c* finite & positive', res.cMax > 0 && isFinite(res.cMax), 'cMax=' + res.cMax);
    ok('§6 deltoid: c* ≈ 0.5 (univalence-loss scale)', approxEq(res.cMax, 0.5, 3e-2), 'cMax=' + res.cMax);
    // boundary behavior: just below valid, above invalid (the gate the estimator used)
    const below = QD.solveInverseQD(hData, { ...opts, c: 0.99 * res.cMax });
    const above = QD.solveInverseQD(hData, { ...opts, c: 1.05 * res.cMax });
    const isValid = (r) => !!(r && r.success && r.primary && r.primary.univalent && r.primary.identityOK);
    ok('§6 deltoid: 0.99·c* is a valid QD', isValid(below));
    ok('§6 deltoid: 1.05·c* is NOT a valid QD', !isValid(above));
  }

  // ---- §7 regression: cusp-limited family h = 1.5/w + 0.5/w² (pole at origin) ---
  // The order-2 pole AT THE ORIGIN is the case that exposed the c* under-estimate
  // bug: the naive identity test points drifted onto the origin pole, so a genuine
  // QD read as identity-failing and c* was capped at ~0.52. The true c* ≈ 1.46 is a
  // CUSP (a φ′ zero reaches |z| = 1); reaching it needs (a) the robust test-point
  // verifier and (b) the estimator's cusp criterion past the (now unverifiable)
  // near-cusp region. See HANDOFF.
  {
    const hData = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1.5, im: 0 }, { re: 0.5, im: 0 }] }], polyPart: [] };
    const opts = { unbounded: true, identityTol: 1e-6 };
    const res = await estimate(hData, opts, QD.solveInverseQD, { cStart: 0.5, relTol: 1e-2, maxSolves: 80 });
    ok('§7 cardioid: bracketed a finite c*', res.found === true, 'reason=' + res.reason);
    ok('§7 cardioid: c* ≈ 1.46 (NOT the ~0.52 under-estimate)', approxEq(res.cMax, 1.46, 6e-2), 'cMax=' + res.cMax);
    ok('§7 cardioid: c* well above the old buggy cap', res.cMax > 1.0, 'cMax=' + res.cMax);
    ok('§7 cardioid: mechanism is a cusp', res.mechanism === 'cusp', 'mechanism=' + res.mechanism);
    // Identity now verifies a genuine QD in the mid-range (was a false 100% failure
    // at the default sampling). c = 1.0 is comfortably inside the existence region.
    const mid = QD.solveInverseQD(hData, { ...opts, c: 1.0, identitySamples: 4000 });
    ok('§7 cardioid: c=1.0 is a genuine QD (univalent + identity)',
       !!(mid && mid.success && mid.primary && mid.primary.univalent && mid.primary.identityOK),
       'maxRelDiff=' + (mid && mid.primary && mid.primary.identity && mid.primary.identity.maxRelDiff));
  }
};
