// =============================================================================
// solver-cmax.js  —  Estimate the maximum conformal radius c* for which an
// UNBOUNDED quadrature domain still exists.
//
// For an unbounded family the conformal radius c = φ′(∞) is a FREE GAUGE the
// user picks; the solver enforces it and solves for the rest of the map
// φ: 𝔻* → Ω. As c grows the domain grows, and at a critical scale c* its
// boundary develops a cusp and then self-overlaps (the classic Hele-Shaw /
// Polubarinova–Galin blow-up). This module finds c* automatically.
//
//   QD.estimateMaxConformalRadius(hData, baseOpts, solveFn, ctl) → Promise<{
//     found,        // true ⇔ a finite c* was bracketed
//     cMax,         // the estimated largest valid c (= cLowValid when found)
//     cLowValid,    // largest c proven valid (also set when !found, if any)
//     phiAtMax,     // the solved φ at cMax (the largest clean domain)
//     trace,        // [{ c, valid, residual, phase }] — the probe history
//     reason,       // 'bracketed' | 'no-invalid-below-ceiling' | 'no-valid-at-start'
//     ceiling?,     // search ceiling (only on 'no-invalid-below-ceiling')
//     solves,       // number of solveFn invocations spent
//   }>
//
// DESIGN — dependency-injected + pure-ish orchestration:
//   • `solveFn(hData, opts) → result | Promise<result>` is INJECTED. In the
//     browser the UI passes the off-thread QD.PrimarySolverWorker.solve; Node
//     tests pass the synchronous QD.solveInverseQD. Both are await-safe. This
//     keeps the bracket/bisection logic unit-testable with the real solver and
//     with cheap synthetic stubs.
//   • VALIDITY GATE (the user-chosen criterion): a c is "valid" iff the solve
//     returns a primary that is UNIVALENT *and* satisfies the QUADRATURE
//     IDENTITY. NOTE: solveInverseQD returns success:true even for a
//     converged-but-non-univalent fallback root (it picks the best candidate),
//     so `success` ALONE is NOT the gate — we check primary.univalent &&
//     primary.identityOK explicitly, and force identityCheck on.
//   • WARM-START GAUGE INJECTION (the c-slider-bug lesson, HANDOFF #61): the
//     solver TRUSTS the warm seed's gauge. When we reuse the last valid φ as a
//     seed for a new c we MUST set seed.c = c first, else Newton re-converges to
//     the stale-c solution. We clone + inject c on every warm probe.
//   • CONFIRM-INVALID GUARD: a warm-started solve can fail merely because the
//     seed was bad. Before accepting "invalid" at a given c we retry once
//     WITHOUT a seed (fresh multistart). A bad seed must never shrink c*.
//
// Algorithm: confirm/establish a valid lower bracket cLo → grow ×growFactor
// (warm-started) until an invalid cHi (or the ceiling) → bisect [cLo,cHi] on the
// validity gate to relTol. cLo always tracks the largest known-valid c (+ its φ).
//
// Pure + DOM-free; loaded page-side only (like critical-set.js / cusps.js), not
// bundled into the solver Workers — it DRIVES a worker rather than running in one.
// =============================================================================

(function () {
  'use strict';

  // QD-namespace resolution — same idiom every solver/analysis file uses.
  const QD = (typeof window !== 'undefined' && window.QD)
    ? window.QD
    : (typeof module !== 'undefined' ? module.exports : null);
  if (!QD) return;

  const C = QD.Complex;

  // A solve result is "valid" (a genuine unbounded QD exists at this c) iff the
  // primary is univalent AND passes the quadrature identity. `success` is not
  // sufficient (see header). identityOK is undefined when identityCheck is off,
  // so we force identityCheck on in mergeOpts and require it strictly true.
  function isValidResult(r) {
    return !!(r && r.success === true && r.primary &&
              r.primary.univalent === true && r.primary.identityOK === true);
  }

  function residualOf(r) {
    return (r && r.primary && typeof r.primary.residual === 'number') ? r.primary.residual : null;
  }

  async function estimateMaxConformalRadius(hData, baseOpts, solveFn, ctl) {
    baseOpts = baseOpts || {};
    ctl = ctl || {};
    if (typeof solveFn !== 'function') {
      throw new Error('estimateMaxConformalRadius: solveFn must be a function');
    }

    // ---- controls / defaults -------------------------------------------------
    const growFactor  = (ctl.growFactor  > 1) ? ctl.growFactor  : 1.6;
    const relTol      = (ctl.relTol      > 0) ? ctl.relTol      : 1e-3;
    const maxSolves   = (ctl.maxSolves   > 0) ? ctl.maxSolves   : 40;
    const shrinkTries = (ctl.shrinkTries >= 0) ? (ctl.shrinkTries | 0) : 8;
    const progress    = (typeof ctl.progress === 'function') ? ctl.progress : null;

    // Starting c: the caller's hint (the live slider value), else a heuristic
    // mirroring continuationInC_UQD — 0.25 × smallest finite pole magnitude.
    let cStart = ctl.cStart;
    if (!(cStart > 0) || !isFinite(cStart)) {
      let minA = Infinity;
      for (const p of (hData.poles || [])) {
        const m = C.abs(p.a);
        if (m > 0 && m < minA) minA = m;
      }
      cStart = isFinite(minA) ? 0.25 * minA : 0.25;
    }
    // Search ceiling: generous relative cap, never below an absolute floor.
    const cCeiling = (ctl.cCeiling > 0) ? ctl.cCeiling : Math.max(100, cStart * 256);

    // ---- probing -------------------------------------------------------------
    let solves = 0;
    const trace = [];
    function record(c, valid, residual, phase) {
      trace.push({ c, valid, residual, phase });
      if (progress) { try { progress({ phase, c, valid, step: trace.length, solves }); } catch (_) {} }
    }

    // Build per-c options: force the identity gate on, and inject c into a clone
    // of the warm seed (gauge injection) so Newton can't drift back to a stale c.
    function mergeOpts(c, seedPhi) {
      const opts = Object.assign({}, baseOpts, { c: c, identityCheck: true });
      if (seedPhi) {
        const seed = QD.clonePhi(seedPhi);
        seed.c = c;
        opts.warmPhi = seed;
      } else {
        delete opts.warmPhi;
      }
      return opts;
    }

    async function callSolve(c, seedPhi) {
      solves++;
      try {
        return await solveFn(hData, mergeOpts(c, seedPhi));
      } catch (e) {
        // A solver throw at this c ⇒ no determinable valid QD here.
        return { success: false, error: String((e && e.message) || e) };
      }
    }

    // Validity of c, with the confirm-invalid guard: a warm failure is retried
    // fresh before being believed.
    async function probe(c, seedPhi) {
      let r = await callSolve(c, seedPhi);
      if (isValidResult(r)) return { valid: true, phi: r.primary.phi, residual: residualOf(r) };
      if (seedPhi) {
        const r2 = await callSolve(c, null);
        if (isValidResult(r2)) return { valid: true, phi: r2.primary.phi, residual: residualOf(r2) };
        r = r2 || r;
      }
      return { valid: false, phi: null, residual: residualOf(r) };
    }

    // ---- 1) lower bracket: find a valid cLo --------------------------------
    let cLo = cStart;
    let p = await probe(cLo, null);
    record(cLo, p.valid, p.residual, 'bracket-lo');
    let shrinks = 0;
    while (!p.valid && shrinks < shrinkTries) {
      cLo *= 0.5; shrinks++;
      p = await probe(cLo, null);
      record(cLo, p.valid, p.residual, 'bracket-lo');
    }
    if (!p.valid) {
      return { found: false, cMax: null, cLowValid: null, phiAtMax: null,
               trace, reason: 'no-valid-at-start', solves };
    }
    let loPhi = p.phi;

    // ---- 2) grow to an invalid upper bracket cHi ---------------------------
    let cHi = cLo * growFactor;
    let bracketed = false;
    while (cHi <= cCeiling) {
      const pg = await probe(cHi, loPhi);
      record(cHi, pg.valid, pg.residual, 'bracket-hi');
      if (pg.valid) {
        cLo = cHi; loPhi = pg.phi;
        cHi = cLo * growFactor;
      } else {
        bracketed = true;
        break;
      }
    }
    if (!bracketed) {
      return { found: false, cMax: null, cLowValid: cLo, phiAtMax: loPhi,
               trace, reason: 'no-invalid-below-ceiling', ceiling: cCeiling, solves };
    }

    // ---- 3) bisect [cLo, cHi] on the validity gate -------------------------
    while ((cHi - cLo) / cHi > relTol && solves < maxSolves) {
      const mid = 0.5 * (cLo + cHi);
      const pm = await probe(mid, loPhi);
      record(mid, pm.valid, pm.residual, 'bisect');
      if (pm.valid) { cLo = mid; loPhi = pm.phi; }
      else { cHi = mid; }
    }

    return { found: true, cMax: cLo, cLowValid: cLo, phiAtMax: loPhi,
             trace, reason: 'bracketed', solves };
  }

  QD.estimateMaxConformalRadius = estimateMaxConformalRadius;

})();
