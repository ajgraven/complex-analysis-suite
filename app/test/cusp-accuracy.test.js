'use strict';
// =============================================================================
// cusp-accuracy tests (#11) — solver accuracy as a quadrature domain approaches
// a CUSP (a φ′ zero migrating onto |z| = 1, the Hele-Shaw / Polubarinova–Galin
// blow-up). These lock in the near-cusp accuracy work and guard against
// regressions in the well-conditioned regime.
//
// Coverage map:
//   §1 Newton conditioning — the unbounded "cardioid" family h = 1.5/w + 0.5/w²
//      stays a converged, univalent, identity-satisfying QD as c is pushed toward
//      its cusp c* ≈ 1.46 (W2: central-diff Jacobian + extended refinement).
//   §2 Cusp-aware graded sampling — the identity verifier auto-grades its θ-nodes
//      toward the cusp angle near a cusp (W3). Graded error ≤ uniform error at the
//      same node budget; away from a cusp the uniform path is untouched (graded
//      flag false, result byte-for-byte).
//   §3 Critical-modulus accuracy — findCriticalPoints locates the boundary cusp
//      of constructed oracles (cardioid, deltoid) with |z| ≈ 1 to high accuracy
//      (W4 sharpens this; baseline already good for simple zeros).
//   §4 c* polish — estimateMaxConformalRadius brackets c* tightly with a cusp
//      mechanism and reports a confidence (W4).
//   §5 Honest reporting — estimateAccuracy flags the near-cusp regime and names
//      the trustworthy signal (W5).
//
// Reuses the cmax oracle (cardioid c* ≈ 1.46, HANDOFF) and the cusps oracles
// (cardioid/deltoid constructed φ) so the numbers are anchored to known answers.
// =============================================================================
require('./bootstrap');

// Page-only modules not in the bootstrap CORE list (mirrors cmax.test.js).
loadInCtx('observables.js');
loadInCtx('solver-cmax.js');

module.exports = async function run() {
  const C = QD.Complex;

  // The classical cusp-limited unbounded family (order-2 pole at the origin):
  // h = 1.5/w + 0.5/w². c* ≈ 1.46 is a CUSP. Used across §1, §2, §5.
  const cardioidH = () => ({
    poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1.5, im: 0 }, { re: 0.5, im: 0 }] }],
    polyPart: [],
  });
  const baseOpts = { unbounded: true, identityTol: 1e-6 };

  // Constructed bounded oracles (no solve; φ′-zeros known in closed form).
  const mkBounded = (A) => ({
    family: 'boundedQD', w0: { re: 0, im: 0 }, unbounded: false,
    branches: [{ z: { re: 0, im: 0 }, A }],
  });

  // ---------------------------------------------------------------------------
  section('cusp-accuracy — §1 Newton conditioning toward c* (W2)');
  // ---------------------------------------------------------------------------
  {
    // March c up toward the cusp; each must remain a converged, univalent,
    // identity-satisfying QD. The residual must stay at solver tolerance even as
    // the Jacobian conditioning worsens — that is the W2 central-diff/refinement
    // win. (Pre-W2 the residual at the high-c end degraded.)
    const hData = cardioidH();
    // c = 1.4 sits just below c* ≈ 1.46: pre-fix the identity verifier
    // under-resolved there (≈ 5e-2 at N=1500) and the QD was mis-rejected. With
    // adaptive escalation (W3) the identity is verified to tolerance.
    const cs = [0.6, 0.9, 1.1, 1.3, 1.4];
    for (const c of cs) {
      const r = QD.solveInverseQD(hData, { ...baseOpts, c, identitySamples: 2000 });
      const okSolve = !!(r && r.success && r.primary);
      ok('§1 c=' + c + ': solves', okSolve, okSolve ? '' : (r && r.error));
      if (!okSolve) continue;
      const p = r.primary;
      ok('§1 c=' + c + ': residual ≤ 1e-8', p.residual <= 1e-8,
         'residual=' + (p.residual != null ? p.residual.toExponential(2) : 'null'));
      ok('§1 c=' + c + ': univalent', p.univalent === true);
      ok('§1 c=' + c + ': identity holds (maxRelDiff < 1e-6)',
         !!(p.identity && p.identity.maxRelDiff < 1e-6),
         'maxRelDiff=' + (p.identity && p.identity.maxRelDiff != null
           ? p.identity.maxRelDiff.toExponential(2) : 'n/a'));
    }
  }

  // ---------------------------------------------------------------------------
  section('cusp-accuracy — §2 adaptive sample escalation near a cusp (W3)');
  // ---------------------------------------------------------------------------
  {
    const fam = QD.Family.unboundedQD;
    // A genuinely near-cusp QD: c = 1.4 sits just below c* ≈ 1.46, so the smooth
    // periodic integrand has SHARPENED and a fixed node count under-resolves it.
    // Escalation (more uniform nodes) restores accuracy; grading would only hurt
    // this spectrally-accurate integrand.
    const hData = cardioidH();
    const sol = QD.solveInverseQD(hData, { ...baseOpts, c: 1.4, identitySamples: 1500 });
    ok('§2 near-cusp QD solves', !!(sol && sol.success && sol.primary),
       sol && sol.success ? '' : (sol && sol.error));
    if (sol && sol.success) {
      const phi = sol.primary.phi;
      const vFixed = fam.verifyQuadratureIdentity(phi, hData, { numSamples: 1500, adaptiveSamples: false });
      const vAuto  = fam.verifyQuadratureIdentity(phi, hData, { numSamples: 1500 });
      ok('§2 escalation fires near the cusp', vAuto.escalatedTo > 1500,
         'escalatedTo=' + vAuto.escalatedTo);
      ok('§2 fixed-N path does not escalate', vFixed.escalatedTo === undefined ||
         vFixed.escalatedTo === 1500, 'escalatedTo=' + vFixed.escalatedTo);
      ok('§2 escalated error ≪ fixed-N error',
         vAuto.maxRelDiff < vFixed.maxRelDiff * 0.5,
         'auto=' + vAuto.maxRelDiff.toExponential(2) +
         ' fixed=' + vFixed.maxRelDiff.toExponential(2));
    }

    // Away from any cusp (a plain 2-point unbounded QD) escalation must NOT fire,
    // so the result is the untouched single-pass uniform sum (byte-for-byte).
    const hFar = {
      poles: [
        { a: { re: 2, im: 0 },  principal: [{ re: 1, im: 0 }] },
        { a: { re: -2, im: 0 }, principal: [{ re: 1, im: 0 }] },
      ], polyPart: [],
    };
    const solFar = QD.solveInverseQD(hFar, { ...baseOpts, c: 0.5, identitySamples: 1500 });
    if (solFar && solFar.success) {
      const vAuto = fam.verifyQuadratureIdentity(solFar.primary.phi, hFar, { numSamples: 1500 });
      const vFix  = fam.verifyQuadratureIdentity(solFar.primary.phi, hFar, { numSamples: 1500, adaptiveSamples: false });
      ok('§2 no escalation away from a cusp', vAuto.escalatedTo === 1500,
         'escalatedTo=' + vAuto.escalatedTo);
      ok('§2 away-from-cusp result is byte-for-byte single-pass',
         vAuto.maxRelDiff === vFix.maxRelDiff);
    }
  }

  // ---------------------------------------------------------------------------
  section('cusp-accuracy — §3 critical-modulus accuracy (W4)');
  // ---------------------------------------------------------------------------
  {
    // Cardioid φ(z)=R(z+z²/2): φ′=R(1+z), simple zero exactly at z=-1 ⇒ g=1.
    const card = mkBounded([{ re: 1, im: 0 }, { re: 0.5, im: 0 }]);
    const csCard = QD.findCriticalPoints(card);
    let gCard = 0;
    for (const pt of csCard.points) if (pt.absZ < 1.05 && pt.absZ > gCard) gCard = pt.absZ;
    ok('§3 cardioid: critical point found near |z|=1', gCard > 0.9,
       'g=' + gCard.toFixed(8));
    ok('§3 cardioid: |g − 1| ≤ 1e-6', Math.abs(gCard - 1) <= 1e-6,
       '|g-1|=' + Math.abs(gCard - 1).toExponential(2));

    // Deltoid-ish φ(z)=R(z+z⁴/4): φ′=R(1+z³), three simple zeros at cube roots of
    // −1, all on |z|=1.
    const delt = mkBounded([{ re: 1, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0.25, im: 0 }]);
    const csDelt = QD.findCriticalPoints(delt);
    let nNear = 0, worst = 0;
    for (const pt of csDelt.points) {
      if (Math.abs(pt.absZ - 1) <= 0.05) { nNear++; worst = Math.max(worst, Math.abs(pt.absZ - 1)); }
    }
    ok('§3 deltoid: three boundary zeros found', nNear === 3, 'nNear=' + nNear);
    ok('§3 deltoid: all |z| ≈ 1 (≤ 1e-6)', nNear === 3 && worst <= 1e-6,
       'worst|z-1|=' + worst.toExponential(2));
  }

  // ---------------------------------------------------------------------------
  section('cusp-accuracy — §4 c* polish + confidence (W4)');
  // ---------------------------------------------------------------------------
  {
    const hData = cardioidH();
    const res = await QD.estimateMaxConformalRadius(hData, baseOpts, QD.solveInverseQD,
                                                    { cStart: 0.5, relTol: 1e-2, maxSolves: 90 });
    ok('§4 cardioid: bracketed a finite c*', res.found === true, 'reason=' + res.reason);
    ok('§4 cardioid: mechanism is a cusp', res.mechanism === 'cusp', 'mechanism=' + res.mechanism);
    ok('§4 cardioid: c* ≈ 1.46 (tight)', approxEq(res.cMax, 1.46, 4e-2), 'cMax=' + res.cMax);
    ok('§4 cardioid: c* confidence reported in [0,1]',
       typeof res.confidence === 'number' && res.confidence >= 0 && res.confidence <= 1,
       'confidence=' + res.confidence);
    ok('§4 cardioid: c* confidence is high for a clean cusp', res.confidence >= 0.5,
       'confidence=' + res.confidence);
  }

  // ---------------------------------------------------------------------------
  section('cusp-accuracy — §5 honest near-cusp reporting (W5)');
  // ---------------------------------------------------------------------------
  {
    const hData = cardioidH();
    // Near the cusp: estimateAccuracy must flag nearCusp and trust geometry.
    const near = QD.solveInverseQD(hData, { ...baseOpts, c: 1.3, identitySamples: 2000 });
    if (near && near.success) {
      const acc = QD.estimateAccuracy(near.primary.phi, hData);
      ok('§5 near-cusp: nearCusp flagged', acc.nearCusp === true, 'nearCusp=' + acc.nearCusp);
      ok('§5 near-cusp: cuspDistance small & finite',
         typeof acc.cuspDistance === 'number' && acc.cuspDistance >= 0 && acc.cuspDistance < 0.2,
         'cuspDistance=' + acc.cuspDistance);
      ok('§5 near-cusp: trustedSignal = geometry', acc.trustedSignal === 'geometry',
         'trustedSignal=' + acc.trustedSignal);
    }
    // Comfortably inside the existence region: no cusp flag, identity trusted.
    const safe = QD.solveInverseQD(hData, { ...baseOpts, c: 0.6, identitySamples: 1500 });
    if (safe && safe.success) {
      const acc = QD.estimateAccuracy(safe.primary.phi, hData);
      ok('§5 safe: nearCusp not flagged', acc.nearCusp === false, 'nearCusp=' + acc.nearCusp);
      ok('§5 safe: trustedSignal = identity', acc.trustedSignal === 'identity',
         'trustedSignal=' + acc.trustedSignal);
    }
  }
};
