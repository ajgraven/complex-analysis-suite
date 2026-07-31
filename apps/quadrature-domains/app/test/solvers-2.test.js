'use strict';
// solvers-2.test.js — shard 2/4 of the former monolithic solvers.test.js (refactor Stage B2, QD-TEST-5).
// EXACT contiguous slice of the original run() body (original lines 817-935); split only for parallelism.
// Concatenating all 4 shard bodies reproduces the original body byte-for-byte (verified). The module-scope
// preamble is the original's, preserved verbatim; shared kernels + harness (ok, C, T, vm/ctx, Schwarz, PS, ...)
// are installed on `global` by test/bootstrap.js, so bare names resolve exactly as in the monolith.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP_DIR = path.join(__dirname, '..');
require('./bootstrap');
module.exports = async function run() {

// §PB: OFF-AXIS POLE branch fix (anchored αth-root). Before this fix the bounded
// PQD reconstruction used the PRINCIPAL αth-root, which lands on a wrong sheet
// once α·arg(a) leaves (−π,π] — so a pole with |arg a| > π/α (e.g. the whole
// left half-plane for α=2) failed to solve or came back non-univalent, even
// though the |w|^{2(α−1)} weight is rotationally symmetric and a valid (rotated)
// domain must exist. The solver now reconstructs φ on the single continuous
// branch anchored at φ(0)=w0 (QD.PqdCommon.phiAnchored / argContAt + the
// anchored sweep), so every pole angle works for the two BOUNDED families.
{
  const sin = Math.sin, cos = Math.cos, PI = Math.PI;
  const poleAt = (R, deg) => ({ re: R * cos(deg * PI / 180), im: R * sin(deg * PI / 180) });

  // (1) Angular sweep, single simple pole, several α. Every angle — including
  //     the previously-broken left half-plane — must solve, be univalent, and
  //     verify the quadrature identity to machine precision.
  for (const alpha of [1.5, 2, 3]) {
    let allOk = true, worst = 0, firstBad = '';
    for (let deg = 0; deg < 360; deg += 30) {
      const hData = { poles: [{ a: poleAt(2, deg), principal: [{ re: 1, im: 0 }] }] };
      const r = QD_NS.solveInverseQD(hData, { alpha });
      const good = r.success && r.primary && r.primary.univalent &&
                   r.primary.identity && r.primary.identity.maxRelDiff < 1e-6;
      if (r.primary && r.primary.identity) worst = Math.max(worst, r.primary.identity.maxRelDiff);
      if (!good && !firstBad) firstBad = deg + '°(' + (r.success ? ('univ=' + (r.primary && r.primary.univalent) + ' id=' + (r.primary && r.primary.identity && r.primary.identity.maxRelDiff.toExponential(1))) : r.error) + ')';
      allOk = allOk && good;
    }
    ok('§PB powerQD α=' + alpha + ': all 12 pole angles solve+univalent+identity<1e-6',
       allOk, allOk ? ('worst id=' + worst.toExponential(1)) : ('first fail ' + firstBad));
  }

  // (2) Far off-axis poles (distance + left-half angle, the user-reported combo).
  for (const [R, deg] of [[100, 120], [500, 135], [50, -150]]) {
    const r = QD_NS.solveInverseQD({ poles: [{ a: poleAt(R, deg), principal: [{ re: 1, im: 0 }] }] }, { alpha: 2 });
    ok('§PB powerQD far off-axis a=' + R + '∠' + deg + '°: solves+univalent',
       r.success && r.primary && r.primary.univalent && r.primary.identity.maxRelDiff < 1e-6,
       r.success ? ('id=' + r.primary.identity.maxRelDiff.toExponential(1)) : r.error);
  }

  // (3) Rotation-covariance round-trip: a single-pole PQD at angle θ must be the
  //     θ-rotation of the same-|a| real-axis PQD (weight is radially symmetric;
  //     residue C₁ is rotation-invariant). The two domains coincide AS CURVES:
  //     e^{−iθ}·∂Ω(θ) = ∂Ω(0). We compare as SETS (one-sided nearest-neighbour
  //     distance), since the gauge/canonicalizer reparametrizes the disk so the
  //     θ-grids don't align pointwise.
  {
    const alpha = 2, R = 1.7, C = 1, deg = 135, th = deg * PI / 180;
    const r0 = QD_NS.solveInverseQD({ poles: [{ a: poleAt(R, 0), principal: [{ re: C, im: 0 }] }] }, { alpha });
    const rT = QD_NS.solveInverseQD({ poles: [{ a: poleAt(R, deg), principal: [{ re: C, im: 0 }] }] }, { alpha });
    let covOk = r0.success && rT.success;
    let maxErr = 0;
    if (covOk) {
      // sampleBoundary returns raw {re,im} complex points (unlike the {w,…}
      // shape of sampleBoundaryAdaptive).
      const b0 = QD_NS.sampleBoundary(r0.primary.phi, 720);
      const bT = QD_NS.sampleBoundary(rT.primary.phi, 720);
      const back = { re: cos(-th), im: sin(-th) };
      for (const pT of bT) {
        const p = Complex.mul(back, pT);            // e^{−iθ}·boundary(θ)
        let best = Infinity;
        for (const p0 of b0) {
          const d = Math.hypot(p.re - p0.re, p.im - p0.im);
          if (d < best) best = d;
        }
        if (best > maxErr) maxErr = best;
      }
      covOk = maxErr < 5e-3;                          // dense-grid nearest-neighbour
    }
    ok('§PB powerQD rotation-covariance: e^{−i·135°}·∂Ω(135°) coincides with ∂Ω(0°)',
       covOk, covOk ? ('set maxErr=' + maxErr.toExponential(1)) : ('r0=' + r0.success + ' rT=' + rT.success + ' maxErr=' + maxErr.toExponential(1)));
  }

  // (4) Bounded SINGULAR family off-axis (0 ∈ Ω). Same branch fix via the
  //     Blaschke-prefixed reconstruction.
  {
    let allOk = true, firstBad = '';
    for (const deg of [0, 90, 135, 180, -135]) {
      const r = QD_NS.solveInverseQD({ poles: [{ a: poleAt(1, deg), principal: [{ re: 2, im: 0 }] }] }, { alpha: 2, singular: true });
      const good = r.success && r.primary && r.primary.univalent && r.primary.identity.maxRelDiff < 1e-6;
      if (!good && !firstBad) firstBad = deg + '°(' + (r.success ? ('univ=' + r.primary.univalent + ' id=' + r.primary.identity.maxRelDiff.toExponential(1)) : r.error) + ')';
      allOk = allOk && good;
    }
    ok('§PB powerQD_singular: off-axis angles solve+univalent+identity<1e-6',
       allOk, allOk ? '' : ('first fail ' + firstBad));
  }

  // (5) Real-axis bit-stability: the anchored 0→z=1 walk reproduces the principal
  //     value when arg(R#)=0 along the +real ray, so a real-axis pole is solved
  //     to the same machine precision as before (guards against the anchor
  //     perturbing the in-sector baseline).
  {
    const r = QD_NS.solveInverseQD({ poles: [{ a: { re: 1.5, im: 0 }, principal: [{ re: 1, im: 0 }] }] }, { alpha: 2 });
    ok('§PB powerQD real-axis baseline still machine-precision',
       r.success && r.primary.identity.maxRelDiff < 1e-10,
       r.success ? ('id=' + r.primary.identity.maxRelDiff.toExponential(1)) : r.error);
  }

  // (6) argContAt sanity: continuous arg of R# at z=1 (walked from z=0) must
  //     equal the value the boundary sweep anchors to (consistency of the two
  //     anchoring paths into the same global sheet).
  {
    const r = QD_NS.solveInverseQD({ poles: [{ a: poleAt(1.5, 135), principal: [{ re: 1, im: 0 }] }] }, { alpha: 2 });
    if (r.success) {
      const phi = r.primary.phi;
      const evalR = QD_NS.evalRHash_PQD;
      const anchorArg0 = phi.alpha * Complex.arg(phi.w0);
      const argAt1 = QD_NS.PqdCommon.argContAt(phi, { re: 1, im: 0 }, evalR, anchorArg0, { re: 0, im: 0 });
      // φ(1) from the anchored root must match evalPhi(1) (same single sheet).
      const wMag = Math.pow(Complex.abs2(evalR({ re: 1, im: 0 }, phi)), 0.5 / phi.alpha);
      const wAnchor = { re: wMag * cos(argAt1 / phi.alpha), im: wMag * sin(argAt1 / phi.alpha) };
      const wEval = QD_NS.evalPhi({ re: 1, im: 0 }, phi);
      const err = Math.hypot(wAnchor.re - wEval.re, wAnchor.im - wEval.im);
      ok('§PB argContAt consistent with evalPhi at z=1 (single global sheet)', err < 1e-9,
         'err=' + err.toExponential(1));
    } else {
      ok('§PB argContAt consistency (off-axis solve prerequisite)', false, r.error);
    }
  }
}
};
