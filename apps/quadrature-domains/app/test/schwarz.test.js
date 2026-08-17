'use strict';
// schwarz.test.js — subsystem tests split from the former monolithic node-test.js (Phase 2).
// Shared kernels + harness (ok, C, T, solveInverseQD, Schwarz, PS, SC, …) are
// installed on `global` by test/bootstrap.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP_DIR = path.join(__dirname, '..');
require('./bootstrap');
module.exports = async function run() {
ok('Schwarz: namespace registered', typeof Schwarz === 'object' && typeof Schwarz.buildSchwarzFromPhi === 'function');
ok('Schwarz: sigmaInverse exported (S1)', typeof Schwarz.sigmaInverse === 'function');
ok('Schwarz: buildPreimageTree exported (S1)', typeof Schwarz.buildPreimageTree === 'function');
ok('Schwarz: sampleLimitSet exported (S3)', typeof Schwarz.sampleLimitSet === 'function');
ok('Schwarz: boxCountingDimension exported (S3)', typeof Schwarz.boxCountingDimension === 'function');
ok('Schwarz: explicitSigmaForm exported (S4 / E13)', typeof Schwarz.explicitSigmaForm === 'function');
ok('Schwarz: findSigmaSingularities exported (S4 / F3)', typeof Schwarz.findSigmaSingularities === 'function');
ok('Schwarz: computeSigmaLevelCurves exported (S4 / F12)', typeof Schwarz.computeSigmaLevelCurves === 'function');
ok('Schwarz: canonicalSeeds exported (S5 / H7)', typeof Schwarz.canonicalSeeds === 'function');
ok('Schwarz: iterateCurveForward exported (S5 / E11)', typeof Schwarz.iterateCurveForward === 'function');
ok('Schwarz: findCycles exported (S5 / E10)', typeof Schwarz.findCycles === 'function');
ok('Schwarz: sampleSweepSeeds exported (S5 / H8)', typeof Schwarz.sampleSweepSeeds === 'function');
ok('Schwarz: domainColoringField exported (S5 / F6)', typeof Schwarz.domainColoringField === 'function');

// Helper: solve the inverse problem for a given hData and family, return phi + boundaryPts.
function solveAndSample(hData, opts) {
  const r = solveInverseQD(hData, opts);
  if (!r.success) throw new Error('solveInverseQD failed: ' + r.error);
  const phi = r.primary.phi;
  const pts = QD_NS.sampleBoundary(phi, 256);
  return { phi, hData, boundaryPts: pts };
}

// ---- Bounded unit disk: h = 1/w. φ(z) = z. σ(w) = 1/conj(w). ----
{
  const hData = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1, im: 0 }] }] };
  const { phi, boundaryPts } = solveAndSample(hData, {});
  const sw = Schwarz.buildSchwarzFromPhi(phi, hData, boundaryPts);
  ok('Schwarz/unit-disk: builder returns non-null', !!sw && sw.family === 'boundedQD');

  // σ(0.5) should equal 1/conj(0.5) = 2.
  const s1 = sw.sigma({ re: 0.5, im: 0 });
  ok('Schwarz/unit-disk: σ(0.5) ≈ 2',
     s1 && Math.abs(s1.re - 2) < 1e-8 && Math.abs(s1.im) < 1e-8,
     's=' + (s1 ? (s1.re.toFixed(6) + ',' + s1.im.toFixed(6)) : '(null)'));

  // σ(0.3 + 0.4i): closed form is conj(1/(0.3+0.4i)) = (0.3+0.4i)/|0.3+0.4i|² · (1) = (0.3-0.4i)conjugate / 0.25
  // 1/(0.3+0.4i) = (0.3-0.4i)/0.25 = 1.2 - 1.6i; conj = 1.2 + 1.6i.
  const w = { re: 0.3, im: 0.4 };
  const s2 = sw.sigma(w);
  ok('Schwarz/unit-disk: σ(0.3+0.4i) ≈ 1.2+1.6i',
     s2 && Math.abs(s2.re - 1.2) < 1e-8 && Math.abs(s2.im - 1.6) < 1e-8,
     's=' + (s2 ? (s2.re.toFixed(6) + ',' + s2.im.toFixed(6)) : '(null)'));

  // Every interior point escapes in 1 iteration.
  const et = Schwarz.escapeTime({ re: 0.5, im: 0 }, sw, { maxIter: 8 });
  ok('Schwarz/unit-disk: escapeTime(0.5) = 1', et.kind === 'fundamental' && et.n === 1,
     'kind=' + et.kind + ', n=' + et.n);
  // Off-axis interior point
  const et2 = Schwarz.escapeTime({ re: -0.2, im: 0.6 }, sw, { maxIter: 8 });
  ok('Schwarz/unit-disk: escapeTime(-0.2+0.6i) = 1', et2.kind === 'fundamental' && et2.n === 1);

  // σ(w) ≈ w on ∂Ω: for the unit disk, every boundary point should map to itself
  // under σ (since on |w|=1, conj(w) = 1/w). Sample a few.
  let maxBdyErr = 0;
  for (let k = 0; k < 16; k++) {
    const th = 2 * Math.PI * k / 16;
    const w = { re: Math.cos(th), im: Math.sin(th) };
    const sv = sw.sigma(w);
    if (sv) maxBdyErr = Math.max(maxBdyErr, Math.hypot(sv.re - w.re, sv.im - w.im));
  }
  ok('Schwarz/unit-disk: σ(w) ≈ w on ∂Ω', maxBdyErr < 1e-6,
     'maxErr=' + maxBdyErr.toExponential(2));

  // -------- S1: σ⁻¹ round-trip on the unit disk --------
  // For the disk, σ has degree 1 and σ⁻¹(w) = 1/conj(w). So preimages of
  // any w ∈ ℂ \ {0} are a single point. We test a couple of seed points
  // in Ω^c (|w| > 1 since Ω = unit disk for h = 1/w).
  {
    const seed = { re: 1.5, im: 0.3 };
    const preimages = Schwarz.sigmaInverse(seed, sw);
    ok('S1/unit-disk: σ⁻¹(1.5+0.3i) has 1 preimage', preimages.length === 1,
       'n=' + preimages.length);
    if (preimages.length === 1) {
      const back = sw.sigma(preimages[0]);
      const err  = Math.hypot(back.re - seed.re, back.im - seed.im);
      ok('S1/unit-disk: σ(σ⁻¹(w)) ≈ w', err < 1e-8, 'err=' + err.toExponential(2));
    }
  }
}

// ---- QD-schwarz-a-B-01: GPU bounded Newton-seed w₀ factor is gated on family ----
// The GPU seed source `newtonSeedFresh` (schwarz-webgl.mjs) linearizes ψ at z=0. For the
// exp-form LQD families φ = w₀·exp(r#) ⇒ φ'(0) = w₀·Σconj(A_{j,1}); for boundedQD
// φ = w₀+Σbranches ⇒ φ'(0) = Σconj(A_{j,1}) with NO w₀ factor. QDSch-1 applied the w₀
// factor unconditionally, regressing boundedQD (family 0). The shader now gates it on
// family 2/3. GLSL is not executed in CI (Phase-0 P0-2), so this validates the seed
// FORMULA by transliterating the shader branch and comparing to the REAL CPU adapter
// (`sw.adapter.seedFor`, the canonical reference the shader must match).
{
  // JS transliteration of newtonSeedFresh's bounded branch (schwarz-webgl.mjs:454-470).
  // gated=true → the fixed shader (w₀ factor only for family 2/3); gated=false → the old
  // unconditional multiply (the regression), kept to prove the divergence it caused.
  function gpuBoundedSeed(phi, w, familyId, gated) {
    const w0 = phi.w0 || { re: 0, im: 0 };
    let dphi0 = { re: 0, im: 0 };
    for (const br of phi.branches || []) {
      if (br.A && br.A.length >= 1) dphi0 = C.add(dphi0, C.conj(br.A[0]));
    }
    const doW0 = gated ? (familyId === 2 || familyId === 3) : true;
    if (doW0) dphi0 = C.mul(w0, dphi0);
    if (dphi0.re * dphi0.re + dphi0.im * dphi0.im < 1e-30) return { re: 0, im: 0 }; // EPS_DIV
    const cand = C.div(C.sub(w, w0), dphi0);
    const r = Math.hypot(cand.re, cand.im);
    if (r < 0.95) return cand;
    return { re: cand.re * 0.9 / r, im: cand.im * 0.9 / r };
  }
  const dist = (a, b) => Math.hypot(a.re - b.re, a.im - b.im);
  // w₀ with |w₀| ≠ 1 so the (mis)applied factor materially moves the seed.
  const branches = [{ z: { re: 0, im: 0 }, A: [{ re: 1.5, im: -0.3 }] }];
  const w0 = { re: 2, im: 0.5 };
  const wTest = { re: 1.2, im: 0.4 };

  // boundedQD (family 0): the fixed shader must match the CPU seed (no w₀ factor).
  const phiQD = { family: 'boundedQD', unbounded: false, w0, branches };
  const swQD = Schwarz.buildSchwarzFromPhi(phiQD, { poles: [] }, []);
  const cpuQD = swQD.adapter.seedFor(wTest, null);
  const fixedQD = gpuBoundedSeed(phiQD, wTest, 0, true);
  const oldQD = gpuBoundedSeed(phiQD, wTest, 0, false);
  ok('QD-schwarz-a-B-01: fixed GPU boundedQD seed matches CPU adaptBounded.seedFor',
     dist(fixedQD, cpuQD) < 1e-12,
     'Δ=' + dist(fixedQD, cpuQD).toExponential(2));
  ok('QD-schwarz-a-B-01: OLD unconditional-w₀ GPU seed diverged from CPU (the regression)',
     dist(oldQD, cpuQD) > 0.05,
     'Δ=' + dist(oldQD, cpuQD).toExponential(2));

  // boundedLQD (family 2): the fixed shader must STILL carry the w₀ factor (QDSch-1 intact).
  const phiLQD = { family: 'boundedLQD', unbounded: false, w0, branches };
  const swLQD = Schwarz.buildSchwarzFromPhi(phiLQD, { poles: [] }, []);
  const cpuLQD = swLQD.adapter.seedFor(wTest, null);
  const fixedLQD = gpuBoundedSeed(phiLQD, wTest, 2, true);
  ok('QD-schwarz-a-B-01: fixed GPU boundedLQD seed matches CPU seedBoundedLQD (w₀ retained)',
     dist(fixedLQD, cpuLQD) < 1e-12,
     'Δ=' + dist(fixedLQD, cpuLQD).toExponential(2));
  // And the CPU boundedQD vs boundedLQD seeds genuinely differ (so the gate is load-bearing).
  ok('QD-schwarz-a-B-01: CPU boundedQD and boundedLQD seeds differ by the w₀ factor',
     dist(cpuQD, cpuLQD) > 0.05,
     'Δ=' + dist(cpuQD, cpuLQD).toExponential(2));
}

// ---- QD σ-AGREEMENT: the schwarz-webgl.mjs σ pipeline (JS mirror) ↔ the CPU engine ----
// A node-runnable GLSL↔CPU agreement guard for the QD Schwarz shader (Review QD-schwarz-a-A-06 — the only
// prior shader test lived in apps/correspondences). Modeled on correspondences/gpuAgreement.test.ts: it
// transliterates the shader's σ STRATEGY — the family-gated fresh seed (newtonSeedFresh, the schwarz-a-B-01
// fix), the cold-start Newton invert (invertPhi), the 4-seed retry ladder, and σ = conj(F(ψ(w))) — reusing
// the CPU adapter's shared φ/φ'/F, and asserts it reproduces the CPU engine's sigma() across a grid of Ω.
// The float32 GLSL numerics themselves ride the browser dual-backend harness (P4); this pins the STRATEGY
// (incl. the family-gated seed) so a divergence from the CPU σ fails in CI without a GPU. KEEP IN SYNC with
// schwarz-webgl.mjs sigma()/invertPhi/newtonSeedFresh if that inverse strategy ever changes.
{
  const hData = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1.5, im: 0 }, { re: 0.5, im: 0 }] }] };
  const { phi, boundaryPts } = solveAndSample(hData, {}); // a boundedQD (family 0) cardioid
  const sw = Schwarz.buildSchwarzFromPhi(phi, hData, boundaryPts);
  const abs2 = (z) => z.re * z.re + z.im * z.im;
  const scl = (z, s) => ({ re: z.re * s, im: z.im * s });

  // newtonSeedFresh (schwarz-webgl.mjs bounded branch), family-gated per schwarz-a-B-01. buggy=true replays
  // the pre-fix unconditional-w₀ multiply, to show the fix improves DIRECT (no-ladder) convergence.
  function seedFresh(w, buggy) {
    const w0 = phi.w0 || { re: 0, im: 0 };
    let dphi0 = { re: 0, im: 0 };
    for (const br of phi.branches || []) if (br.A && br.A.length >= 1) dphi0 = C.add(dphi0, C.conj(br.A[0]));
    if (buggy) dphi0 = C.mul(w0, dphi0); // family 0: the FIX omits this; the bug applied it unconditionally
    if (abs2(dphi0) < 1e-30) return { re: 0, im: 0 };
    const cand = C.div(C.sub(w, w0), dphi0);
    const r = Math.hypot(cand.re, cand.im);
    return r < 0.95 ? cand : scl(cand, 0.9 / r);
  }
  // invertPhi (schwarz-webgl.mjs): NEWTON_MAX=40, CONVERGE |fz|<1e-7, FINAL |fz|<1e-5, diverge |z|>1e4.
  function invert(w, zSeed) {
    let z = zSeed;
    for (let it = 0; it < 40; it++) {
      const fz = C.sub(sw.adapter.evalPhi(z), w);
      if (abs2(fz) < 1e-14) return { z, ok: true };
      const dfz = sw.adapter.derivPhi(z);
      if (abs2(dfz) < 1e-30) return { z, ok: false };
      z = C.sub(z, C.div(fz, dfz));
      if (!isFinite(z.re) || !isFinite(z.im) || abs2(z) > 1e8) return { z, ok: false };
    }
    const fz = C.sub(sw.adapter.evalPhi(z), w);
    return { z, ok: abs2(fz) < 1e-10 };
  }
  const acceptZ = (z) => Math.hypot(z.re, z.im) < 1 - 1e-4; // bounded → z ∈ 𝔻
  // sigma() (schwarz-webgl.mjs): fresh + 4-seed retry ladder, z≈0 guard, σ = conj(F(z)).
  function shaderSigma(w, buggy) {
    const fresh = seedFresh(w, buggy);
    const fr = Math.max(Math.hypot(fresh.re, fresh.im), 1e-20);
    const fhat = { re: fresh.re / fr, im: fresh.im / fr };
    const ladder = [fresh, scl(fresh, 0.6),
                    { re: -fhat.im * fr, im: fhat.re * fr }, { re: fhat.im * fr, im: -fhat.re * fr }];
    let z = null, direct = false;
    for (let i = 0; i < ladder.length; i++) {
      const r = invert(w, ladder[i]);
      if (r.ok && acceptZ(r.z)) { z = r.z; direct = i === 0; break; }
    }
    if (!z || abs2(z) < 1e-8) return { sigma: null, direct: false };
    const Sv = sw.adapter.evalF(z);
    if (!Sv || !isFinite(Sv.re) || !isFinite(Sv.im)) return { sigma: null, direct: false };
    return { sigma: { re: Sv.re, im: -Sv.im }, direct };
  }

  // Grid of Ω: w = φ(z) for z on a lattice in 𝔻 (interior points map into Ω).
  let both = 0, worst = 0, nullMismatch = 0, directGated = 0, directBuggy = 0;
  for (let ri = 1; ri <= 6; ri++) {
    const rr = (ri / 7) * 0.9;
    for (let ti = 0; ti < 12; ti++) {
      const th = (2 * Math.PI * ti) / 12;
      const w = sw.evalPhi({ re: rr * Math.cos(th), im: rr * Math.sin(th) });
      if (!isFinite(w.re) || !isFinite(w.im) || !sw.isInOmega(w)) continue;
      const ref = sw.sigma(w); // CPU engine
      const g = shaderSigma(w, false); // shader-strategy mirror (family-gated seed)
      if ((ref === null) !== (g.sigma === null)) { nullMismatch++; continue; }
      if (ref && g.sigma) {
        both++;
        worst = Math.max(worst, Math.hypot(g.sigma.re - ref.re, g.sigma.im - ref.im));
        if (g.direct) directGated++;
        if (shaderSigma(w, true).direct) directBuggy++;
      }
    }
  }
  // Bound is ~5e-6 because the mirror faithfully uses the shader's FLOAT32-sized Newton tol (|fz|<1e-7)
  // vs the CPU engine's 1e-12 — a ~5-significant-figure σ agreement, the honest strategy-level bound.
  ok('QD σ-agreement/boundedQD: shader-strategy mirror σ matches the CPU engine across Ω',
     both > 40 && worst < 1e-5 && nullMismatch === 0,
     'matched=' + both + ' worst=' + worst.toExponential(2) + ' nullMismatch=' + nullMismatch);
  // The family-gated seed (schwarz-a-B-01) is a good DIRECT seed and never worse than the pre-fix buggy w₀
  // seed. (For the cardioid |w₀| is benign so both converge directly — the regression is latent here; the
  // direct seed↔CPU-adapter equality is pinned separately by the QD-schwarz-a-B-01 block above.)
  ok('QD σ-agreement/boundedQD: the family-gated seed converges DIRECTLY (no ladder) ≥ as often as the buggy w₀ seed',
     directGated >= directBuggy && directGated > 0,
     'directGated=' + directGated + ' directBuggy=' + directBuggy + ' of ' + both);
}

// ---- Bounded cardioid: h = 1.5/w + 0.5/w² ----
{
  const hData = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1.5, im: 0 }, { re: 0.5, im: 0 }] }] };
  const { phi, boundaryPts } = solveAndSample(hData, {});
  const sw = Schwarz.buildSchwarzFromPhi(phi, hData, boundaryPts);
  ok('Schwarz/cardioid: builder returns non-null', !!sw);

  // σ should fix ∂Ω.
  let maxBdyErr = 0;
  for (let k = 0; k < 32; k++) {
    const th = 2 * Math.PI * k / 32;
    const z = { re: Math.cos(th), im: Math.sin(th) };
    const w = sw.evalPhi(z);
    const sv = sw.sigma(w);
    if (sv) maxBdyErr = Math.max(maxBdyErr, Math.hypot(sv.re - w.re, sv.im - w.im));
  }
  ok('Schwarz/cardioid: σ(w) ≈ w on ∂Ω', maxBdyErr < 1e-4,
     'maxErr=' + maxBdyErr.toExponential(2));

  // invPhi round-trip: φ(ψ(w)) ≈ w for test points in Ω.
  let maxInvErr = 0, nTested = 0;
  for (let i = 0; i < 12; i++) {
    const t = (i + 0.5) / 12;
    const w = { re: 0.5 + 0.6 * Math.cos(2 * Math.PI * t), im: 0.4 * Math.sin(2 * Math.PI * t) };
    if (!sw.isInOmega(w)) continue;
    const z = sw.psi(w);
    if (!z) continue;
    nTested++;
    const wBack = sw.evalPhi(z);
    maxInvErr = Math.max(maxInvErr, Math.hypot(wBack.re - w.re, wBack.im - w.im));
  }
  ok('Schwarz/cardioid: ψ ∘ φ ≈ id (n=' + nTested + ')', nTested > 0 && maxInvErr < 1e-8,
     'maxErr=' + maxInvErr.toExponential(2));

  // -------- S1: σ⁻¹ on cardioid --------
  // Cardioid has a single pole of order 2 at w=0, so deg(σ) = 2 — every
  // seed in Ω^c should have ≤ 2 preimages, and σ(σ⁻¹(w)) ≈ w.
  {
    const seed = { re: 1.4, im: 0.6 };       // outside the cardioid
    const preimages = Schwarz.sigmaInverse(seed, sw);
    ok('S1/cardioid: σ⁻¹ has ≤ 2 preimages', preimages.length <= 2,
       'n=' + preimages.length);
    ok('S1/cardioid: σ⁻¹ has ≥ 1 preimage (deg σ = 2)', preimages.length >= 1,
       'n=' + preimages.length);
    let worstErr = 0;
    for (const wPre of preimages) {
      const back = sw.sigma(wPre);
      const err  = Math.hypot(back.re - seed.re, back.im - seed.im);
      if (err > worstErr) worstErr = err;
    }
    ok('S1/cardioid: σ(σ⁻¹(w)) ≈ w for all preimages', worstErr < 1e-4,
       'worstErr=' + worstErr.toExponential(2));
  }

  // -------- S1: preimage tree depth structure --------
  {
    const tree = Schwarz.buildPreimageTree({ re: 1.4, im: 0.6 }, sw,
                                            { depth: 3, visualBudget: 256 });
    ok('S1/cardioid: tree has 4 generations (depth=3 + root)', tree.generations.length === 4,
       'n=' + tree.generations.length);
    ok('S1/cardioid: tree gen 0 has exactly the seed', tree.generations[0].length === 1);
    ok('S1/cardioid: tree edges count = sum of nodes in gens 1..N',
       tree.edges.length === (tree.generations.slice(1).reduce((s, g) => s + g.length, 0)));
  }

  // -------- S1: visual budget honored --------
  {
    const tree = Schwarz.buildPreimageTree({ re: 1.4, im: 0.6 }, sw,
                                            { depth: 12, visualBudget: 20 });
    let total = 0;
    for (const g of tree.generations) total += g.length;
    ok('S1/cardioid: tree respects visualBudget', total <= 20,
       'total=' + total);
    ok('S1/cardioid: truncatedByBudget flag set when capped', tree.truncatedByBudget === true);
  }

  // -------- Tiling-set seed gate (preimage-tree, fractal-mode overlay) --------
  // The double-click handler in schwarz-ui.js accepts a seed iff
  // escapeTime(w).kind === 'fundamental' — i.e. the point reaches the
  // fundamental tile in finitely many σ-steps, so it lies in the tiling set
  // (this also covers Ω^c at n=0). 'interior' (non-escaping / limit set),
  // 'escaped', 'invalid', and null are rejected.
  {
    const gate = (et) => !!(et && et.kind === 'fundamental');
    // (i) decision logic over every possible escapeTime verdict.
    ok('Gate: accepts Ω^c (fundamental, n=0)',          gate({ kind: 'fundamental', n: 0 }) === true);
    ok('Gate: accepts finite-escape (fundamental, n=k)', gate({ kind: 'fundamental', n: 5 }) === true);
    ok('Gate: rejects non-escaping (interior/limit set)', gate({ kind: 'interior', n: 256 }) === false);
    ok('Gate: rejects escaping set',                     gate({ kind: 'escaped', n: 3 }) === false);
    ok('Gate: rejects invalid (σ undefined)',            gate({ kind: 'invalid', n: 0 }) === false);
    ok('Gate: rejects null verdict',                     gate(null) === false);

    // (ii) real points through escapeTime with the generous seed-gate cap
    // (schwarz-ui uses max(256, maxIter*4)).
    const GATE = Math.max(256, 24 * 4);
    const etOut = Schwarz.escapeTime({ re: 1.4, im: 0.6 }, sw, { maxIter: GATE }); // outside cardioid
    ok('Gate/cardioid: Ω^c point in tiling set (accepted)', gate(etOut) === true,
       'kind=' + (etOut && etOut.kind) + ', n=' + (etOut && etOut.n));
    // Interior points NEAR ∂Ω escape Ω in ~1 σ-step → they're in the tiling
    // set and the gate accepts them. (The deepest interior points can hit a
    // σ-singularity → 'invalid', so we scan near-boundary points instead.)
    let cx = 0, cy = 0;
    for (const p of boundaryPts) { cx += p.re; cy += p.im; }
    cx /= boundaryPts.length; cy /= boundaryPts.length;
    let acceptedInterior = false, lastKind = 'none';
    for (let i = 0; i < boundaryPts.length && !acceptedInterior; i += 8) {
      const bp = boundaryPts[i];
      for (const f of [0.95, 0.85, 0.7, 0.5]) {
        const p = { re: cx + f * (bp.re - cx), im: cy + f * (bp.im - cy) };
        if (!sw.isInOmega(p)) continue;
        const et = Schwarz.escapeTime(p, sw, { maxIter: GATE });
        lastKind = et ? et.kind : 'null';
        if (gate(et)) { acceptedInterior = true; break; }
      }
    }
    ok('Gate/cardioid: a near-∂Ω interior point is in the tiling set (accepted)',
       acceptedInterior, 'lastKind=' + lastKind);
  }

  // -------- S3: limit-set chaos game + box-counting dimension --------
  // Cardioid σ has degree 2 → its limit set is the classical Schwarz limit
  // set of a degree-2 rational map. We sample a small cloud, confirm the
  // points land in K (the bounded complement here is the cardioid interior
  // — wait, cardioid is bounded so Ω is the cardioid and Ω^c is outside).
  // Actually for bounded cardioid the chaos game preimages climb DEEPER
  // into Ω (toward the limit set inside Ω). Just verify the API works.
  {
    // Deterministic RNG for reproducible test.
    let rngState = 0x9e3779b9;
    function rng() { rngState = (rngState * 1664525 + 1013904223) | 0; return ((rngState >>> 0) / 0x100000000); }
    const seed = { re: 1.4, im: 0.6 };          // outside the cardioid
    const cloud = Schwarz.sampleLimitSet(sw, { n: 2000, burnIn: 50, seed, rng });
    ok('S3/cardioid: sampleLimitSet returns ≥ 1500 of 2000 points', cloud.length >= 3000,
       'got=' + (cloud.length / 2) + ' pts');
    // Box-counting dimension: cardioid σ-limit set is expected to be 1-D-like
    // for the simple cases here. We just check the regression runs and gives
    // a finite dim in a plausible range.
    if (cloud.length >= 200) {
      const r = Schwarz.boxCountingDimension(cloud);
      ok('S3/cardioid: boxCountingDimension gives finite dim',
         isFinite(r.dim) && r.dim >= -0.05 && r.dim <= 2.5,
         'dim=' + (r.dim !== undefined ? r.dim.toFixed(3) : 'NaN'));
      ok('S3/cardioid: boxCountingDimension has ≥ 4 valid scales',
         r.counts.filter(c => c >= 2).length >= 4);
    }
  }

  // -------- S4 / E13: explicit σ form panel --------
  {
    const f = Schwarz.explicitSigmaForm(sw);
    ok('S4/cardioid: explicitSigmaForm returns boundedQD',
       f && f.family === 'boundedQD', 'family=' + (f && f.family));
    ok('S4/cardioid: phiText non-empty', f && f.phiText && f.phiText.length > 5,
       'phiText="' + (f && f.phiText) + '"');
    ok('S4/cardioid: fText non-empty', f && f.fText && f.fText.length > 5);
    ok('S4/cardioid: sigmaLatex contains \\overline',
       f && f.sigmaLatex && f.sigmaLatex.indexOf('overline') >= 0);
  }

  // -------- S4 / F3: σ singularity analyzer --------
  {
    const s = Schwarz.findSigmaSingularities(sw);
    ok('S4/cardioid: findSigmaSingularities returns shape',
       s && Array.isArray(s.poles) && Array.isArray(s.branchPoints));
    // Cardioid has one pole at z_j = 0… actually for cardioid the disk
    // initial-guess places z_j near 0 (z_j ≈ 0 since pole is at w=0).
    // Reflection 1/conj(z_j) blows up — so we should get 0 poles reported
    // (filter at |z_j| < 1e-12). Either 0 or 1 pole is acceptable.
    ok('S4/cardioid: σ-pole count is reasonable',
       s && s.poles.length <= 2, 'nPoles=' + s.poles.length);
    // Branch points: cardioid has φ'(−1) = 0 → branch point at φ(−1) = R/2 − R/2 = 0.
    ok('S4/cardioid: ≥ 1 branch point found (φ has a critical point)',
       s && s.branchPoints.length >= 1, 'nBP=' + s.branchPoints.length);
  }

  // -------- S4 / F12: σ level curves --------
  {
    const viewport = { reMin: -1.2, reMax: 1.2, imMin: -1.2, imMax: 1.2 };
    const r = Schwarz.computeSigmaLevelCurves(sw, { gridSize: 64, viewport });
    ok('S4/cardioid: computeSigmaLevelCurves returns abs+arg', r && r.abs && r.arg);
    let absSegs = 0;
    for (const c of r.abs) absSegs += c.segments.length;
    ok('S4/cardioid: ≥ 1 |σ| contour segment found',
       absSegs >= 1, 'absSegs=' + absSegs);
    // arg contours may be sparse depending on Ω coverage; just verify the
    // structure is sound (each contour has a segments array).
    ok('S4/cardioid: arg contours have segments arrays',
       r.arg.every(c => Array.isArray(c.segments)));
  }

  // -------- S5 / H7: canonical seeds --------
  {
    const seeds = Schwarz.canonicalSeeds(sw);
    ok('S5/cardioid: canonicalSeeds returns ≥ 1 entry', seeds.length >= 1,
       'n=' + seeds.length);
    ok('S5/cardioid: each seed has w + label',
       seeds.every(s => s.w && typeof s.label === 'string'));
  }

  // -------- S5 / E11: iterateCurveForward --------
  {
    // A small curve inside Ω: a line segment from φ(0.5,0) to φ(-0.3, 0.4).
    const curve = [];
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const z = { re: 0.5 - 0.8 * t, im: 0.4 * t };
      const w = sw.evalPhi(z);
      if (sw.isInOmega(w)) curve.push(w);
    }
    const iters = Schwarz.iterateCurveForward(curve, sw, 3);
    ok('S5/cardioid: iterateCurveForward returns k+1 polylines',
       iters.length === 4, 'n=' + iters.length);
    ok('S5/cardioid: iteration 0 has the original points',
       iters[0].length === curve.length);
  }

  // -------- S5 / E10: findCycles --------
  {
    // n=1 fixed points: σ(w) = w. For a Schwarz function fixing ∂Ω,
    // fixed points of σ in Ω lie on ∂Ω (or near it). The grid search may
    // find a few — even 0 is acceptable for some φ. Assert shape only.
    const cycles = Schwarz.findCycles(sw, 1, { gridSize: 10 });
    ok('S5/cardioid: findCycles(n=1) returns an array', Array.isArray(cycles));
    ok('S5/cardioid: each cycle has period and points',
       cycles.every(c => c.period >= 1 && Array.isArray(c.points)));
    // n=2 exercises the even (holomorphic σ²) path through the anti-holomorphic-aware 2×2 Newton.
    const cyc2 = Schwarz.findCycles(sw, 2, { gridSize: 10 });
    ok('S5/cardioid: findCycles(n=2) returns an array of valid cycles',
       Array.isArray(cyc2) && cyc2.every(c => c.period >= 1 && Array.isArray(c.points)));
  }

  // -------- S5 / H8: sampleSweepSeeds --------
  {
    const lineSeeds = Schwarz.sampleSweepSeeds('line',
      { from: { re: -1, im: 0 }, to: { re: 1, im: 0 }, n: 5 });
    ok('S5: sampleSweepSeeds line returns n points', lineSeeds.length === 5);
    ok('S5: line seeds endpoints correct',
       Math.abs(lineSeeds[0].re - (-1)) < 1e-10 && Math.abs(lineSeeds[4].re - 1) < 1e-10);

    const cSeeds = Schwarz.sampleSweepSeeds('circle',
      { center: { re: 0, im: 0 }, radius: 0.5, n: 8 });
    ok('S5: sampleSweepSeeds circle returns n points', cSeeds.length === 8);
    let allOnCircle = true;
    for (const p of cSeeds) {
      if (Math.abs(Math.hypot(p.re, p.im) - 0.5) > 1e-10) { allOnCircle = false; break; }
    }
    ok('S5: circle seeds at correct radius', allOnCircle);
  }

  // -------- S5 / F6: domainColoringField --------
  {
    const viewport = { reMin: -1, reMax: 1, imMin: -1, imMax: 1 };
    const buf = Schwarz.domainColoringField(sw, viewport, { W: 32, H: 32 });
    // The vm-context Uint8ClampedArray is a distinct constructor from the
    // outer Node one, so we duck-type instead of `instanceof`.
    ok('S5/cardioid: domainColoringField returns a typed byte array',
       buf && typeof buf.length === 'number' && buf.constructor.name === 'Uint8ClampedArray');
    ok('S5/cardioid: buffer length = 4·W·H', buf.length === 4 * 32 * 32);
    // At least one pixel should have non-zero alpha (some in Ω).
    let nonZero = 0;
    for (let i = 3; i < buf.length; i += 4) if (buf[i] > 0) nonZero++;
    ok('S5/cardioid: ≥ 1 pixel in Ω rendered', nonZero >= 1,
       'nonZero=' + nonZero);
  }
}

// ---- Deltoid: h = w², c = 0.5 (POLYNOMIAL-only h; phi.polyA branch) ----
{
  const hData = { poles: [], polyPart: [{re:0,im:0},{re:0,im:0},{re:1,im:0}] };
  const { phi, boundaryPts } = solveAndSample(hData, { unbounded: true, c: 0.5 });
  const sw = Schwarz.buildSchwarzFromPhi(phi, hData, boundaryPts);
  ok('Schwarz/deltoid: builder',
     !!sw && sw.family === 'unboundedQD' && sw.unbounded,
     'phi.polyA.length=' + (phi.polyA ? phi.polyA.length : -1) +
     ', phi.branches.length=' + (phi.branches ? phi.branches.length : -1));
  // σ on ∂Ω.
  let maxBdyErr = 0;
  for (let k = 0; k < 32; k++) {
    const th = 2 * Math.PI * k / 32;
    const z = { re: Math.cos(th), im: Math.sin(th) };
    const w = sw.evalPhi(z);
    const sv = sw.sigma(w);
    if (sv) maxBdyErr = Math.max(maxBdyErr, Math.hypot(sv.re - w.re, sv.im - w.im));
  }
  ok('Schwarz/deltoid: σ(w) ≈ w on ∂Ω', maxBdyErr < 1e-3,
     'maxErr=' + maxBdyErr.toExponential(2));
  // invPhi round-trip in 𝔻* on a few interior test points (chosen by mapping
  // z in 𝔻* through φ).
  let maxInvErr = 0, nTested = 0;
  for (let k = 0; k < 16; k++) {
    const th = 2 * Math.PI * k / 16;
    const z0 = { re: 1.4 * Math.cos(th), im: 1.4 * Math.sin(th) };
    const w = sw.evalPhi(z0);
    if (!sw.isInOmega(w)) continue;
    const z = sw.psi(w);
    if (!z) continue;
    nTested++;
    const wBack = sw.evalPhi(z);
    maxInvErr = Math.max(maxInvErr, Math.hypot(wBack.re - w.re, wBack.im - w.im));
  }
  ok('Schwarz/deltoid: ψ ∘ φ ≈ id (n=' + nTested + ')',
     nTested > 0 && maxInvErr < 1e-7,
     'maxErr=' + maxInvErr.toExponential(2));

  // -------- S2: σ⁻¹ on the deltoid (unboundedQD, Newton fallback). --------
  // Pick a seed in the bounded complement K (inside the deltoid hypocycloid).
  // The deltoid has 3-fold rotational symmetry; the "fundamental tile" Ω^c
  // for this unbounded case is exactly K (the deltoid interior).
  {
    const seed = { re: 0.0, im: 0.0 };           // origin is inside K
    if (!sw.isInOmega(seed)) {
      const preimages = Schwarz.sigmaInverse(seed, sw);
      ok('S2/deltoid (unboundedQD): σ⁻¹ found ≥ 1 preimage',
         preimages.length >= 1, 'n=' + preimages.length);
      let worstErr = 0;
      for (const wPre of preimages) {
        const back = sw.sigma(wPre);
        const err  = Math.hypot(back.re - seed.re, back.im - seed.im);
        if (err > worstErr) worstErr = err;
      }
      ok('S2/deltoid: σ(σ⁻¹(w)) ≈ w', worstErr < 1e-4,
         'worstErr=' + worstErr.toExponential(2));
    } else {
      ok('S2/deltoid: skipped (seed origin inside Ω)', true);
    }
  }
}

// ---- Q2: Schwarz adapter for bounded PQDs (Family.powerQD, α ≥ 2). ----
// adaptPowerQD (schwarz-common.js) gives σ via conj(F(ψ(w))) where
// F(z) = (R(z))^{1/α}. The corresponding σ⁻¹ polynomial fast path in
// schwarz-inverse.js raises target to the α-power, then reuses the
// boundedQD polynomial-root pipeline.
{
  const hData = { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 3, im: 0 }] }] };
  const r = solveInverseQD(hData, { alpha: 2, w0: { re: 1, im: 0 } });
  ok('Schwarz/powerQD: solve success', r.success, r.success ? '' : r.error);
  if (r.success) {
    const phi = r.primary.phi;
    const boundaryPts = QD_NS.sampleBoundary(phi, 256);
    const sw = Schwarz.buildSchwarzFromPhi(phi, hData, boundaryPts);
    ok('Schwarz/powerQD: builder returns non-null', !!sw && sw.family === 'powerQD',
       'got family=' + (sw && sw.family));

    // σ ≈ identity on ∂Ω (defining property of Schwarz reflection).
    let maxBdyErr = 0;
    for (let k = 0; k < 16; k++) {
      const theta = 2 * Math.PI * k / 16;
      const z = { re: Math.cos(theta), im: Math.sin(theta) };
      const w = QD_NS.evalPhi(z, phi);
      const ss = sw.sigma(w);
      if (!ss) continue;
      maxBdyErr = Math.max(maxBdyErr, Math.hypot(ss.re - w.re, ss.im - w.im));
    }
    ok('Schwarz/powerQD: σ ≈ identity on ∂Ω', maxBdyErr < 1e-8,
       'maxErr=' + maxBdyErr.toExponential(2));

    // σ ∘ σ⁻¹ round-trip on points outside Ω.
    let maxRoundTrip = 0;
    let numPreimages = 0;
    for (const wTarget of [{ re: 3.5, im: 0 }, { re: 0.5, im: 0.5 }]) {
      const preimages = Schwarz.sigmaInverse(wTarget, sw);
      numPreimages += preimages.length;
      for (const wPre of preimages) {
        const wRound = sw.sigma(wPre);
        if (!wRound) continue;
        maxRoundTrip = Math.max(maxRoundTrip,
          Math.hypot(wRound.re - wTarget.re, wRound.im - wTarget.im));
      }
    }
    ok('Schwarz/powerQD: σ⁻¹ found preimages', numPreimages >= 2,
       'numFound=' + numPreimages);
    ok('Schwarz/powerQD: σ ∘ σ⁻¹ ≈ identity', maxRoundTrip < 1e-8,
       'maxErr=' + maxRoundTrip.toExponential(2));

    // explicitSigmaForm sanity — has the alpha exponent and rational structure.
    const form = Schwarz.explicitSigmaForm(sw);
    ok('Schwarz/powerQD: explicitSigmaForm returns family tag',
       form && form.family === 'powerQD');
    ok('Schwarz/powerQD: phiLatex mentions ^{1/α}',
       form && /\^{1\/2}/.test(form.phiLatex || ''),
       'phiLatex=' + (form && form.phiLatex || '').slice(0, 80));

    // CR1 regression: the browser capture path clones φ (schwarz-ui.js now
    // delegates to QD.clonePhi) BEFORE building the Schwarz handle. If the
    // clone drops `alpha` (the historical schwarz-ui bug), the PQD adapter
    // computes cpow(x, 1/undefined) = NaN. Build the handle from a clone and
    // assert σ stays finite on ∂Ω.
    const phiCloned = QD_NS.clonePhi(phi);
    ok('Schwarz/powerQD: clone keeps alpha for capture', phiCloned.alpha === phi.alpha);
    const swCloned = Schwarz.buildSchwarzFromPhi(phiCloned, hData, boundaryPts);
    let cloneFinite = true;
    for (let k = 0; k < 8; k++) {
      const theta = 2 * Math.PI * k / 8;
      const z = { re: Math.cos(theta), im: Math.sin(theta) };
      const ss = swCloned.sigma(QD_NS.evalPhi(z, phiCloned));
      if (ss && (!Number.isFinite(ss.re) || !Number.isFinite(ss.im))) cloneFinite = false;
    }
    ok('Schwarz/powerQD: σ finite (non-NaN) from cloned φ', cloneFinite);
  }
}

// ---- QA: Schwarz adapter for NON-INTEGER α (σ⁻¹ Newton fallback path). ----
// For non-integer α the σ⁻¹ polynomial fast path doesn't apply (target^α is
// not polynomial), so sigmaInverse routes through the generic Newton-based
// _sigmaInverseViaNewton using the adapter's evalF = (R(z))^{1/α} closure.
{
  const hData = { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 3, im: 0 }] }] };
  const r = solveInverseQD(hData, { alpha: 1.5, w0: { re: 1, im: 0 } });
  ok('Schwarz/powerQD α=1.5: solve success', r.success, r.success ? '' : r.error);
  if (r.success) {
    const phi = r.primary.phi;
    const boundaryPts = QD_NS.sampleBoundary(phi, 256);
    const sw = Schwarz.buildSchwarzFromPhi(phi, hData, boundaryPts);
    ok('Schwarz/powerQD α=1.5: builder non-null', !!sw && sw.family === 'powerQD');

    // σ ≈ identity on ∂Ω.
    let maxBdyErr = 0;
    for (let k = 0; k < 16; k++) {
      const theta = 2 * Math.PI * k / 16;
      const z = { re: Math.cos(theta), im: Math.sin(theta) };
      const w = QD_NS.evalPhi(z, phi);
      const ss = sw.sigma(w);
      if (!ss) continue;
      maxBdyErr = Math.max(maxBdyErr, Math.hypot(ss.re - w.re, ss.im - w.im));
    }
    ok('Schwarz/powerQD α=1.5: σ ≈ identity on ∂Ω', maxBdyErr < 1e-7,
       'maxErr=' + maxBdyErr.toExponential(2));

    // σ ∘ σ⁻¹ round-trip via the Newton fallback (non-integer α).
    let maxRoundTrip = 0, numPreimages = 0;
    for (const wTarget of [{ re: 3.5, im: 0 }, { re: 1.0, im: 0.6 }]) {
      const preimages = Schwarz.sigmaInverse(wTarget, sw);
      numPreimages += preimages.length;
      for (const wPre of preimages) {
        const wRound = sw.sigma(wPre);
        if (!wRound) continue;
        maxRoundTrip = Math.max(maxRoundTrip,
          Math.hypot(wRound.re - wTarget.re, wRound.im - wTarget.im));
      }
    }
    ok('Schwarz/powerQD α=1.5: σ⁻¹ (Newton fallback) found preimages',
       numPreimages >= 1, 'numFound=' + numPreimages);
    ok('Schwarz/powerQD α=1.5: σ ∘ σ⁻¹ ≈ identity', maxRoundTrip < 1e-6,
       'maxErr=' + maxRoundTrip.toExponential(2));
  }
}

// ---- QB: Schwarz adapter for bounded SINGULAR PQDs (Family.powerQD_singular).
// adaptPowerQD_singular (schwarz-common.js): φ = b_{z₀}·(R#)^{1/α},
// F = b#_{z₀}·(R)^{1/α}. On ∂Ω, F = conj(φ) ⇒ σ = identity. σ⁻¹ routes through
// the generic Newton F-inverter (bounded, side='in').
{
  const hData = { poles: [{ a: { re: 1, im: 0 }, principal: [{ re: 63 / 32, im: 0 }] }] };
  const r = solveInverseQD(hData, { alpha: 2, singular: true, w0: { re: 1, im: 0 } });
  ok('Schwarz/powerQD_singular: solve success', r.success, r.success ? '' : r.error);
  if (r.success) {
    const phi = r.primary.phi;
    const boundaryPts = QD_NS.sampleBoundary(phi, 256);
    const sw = Schwarz.buildSchwarzFromPhi(phi, hData, boundaryPts);
    ok('Schwarz/powerQD_singular: builder non-null',
       !!sw && sw.family === 'powerQD_singular', 'got family=' + (sw && sw.family));

    // σ ≈ identity on ∂Ω.
    let maxBdyErr = 0;
    for (let k = 0; k < 16; k++) {
      const theta = 2 * Math.PI * k / 16;
      const z = { re: Math.cos(theta), im: Math.sin(theta) };
      const w = QD_NS.evalPhi(z, phi);
      const ss = sw.sigma(w);
      if (!ss) continue;
      maxBdyErr = Math.max(maxBdyErr, Math.hypot(ss.re - w.re, ss.im - w.im));
    }
    ok('Schwarz/powerQD_singular: σ ≈ identity on ∂Ω', maxBdyErr < 1e-7,
       'maxErr=' + maxBdyErr.toExponential(2));

    // σ ∘ σ⁻¹ round-trip (Newton fallback) on points outside Ω.
    let maxRoundTrip = 0, numPreimages = 0;
    for (const wTarget of [{ re: 2.5, im: 0 }, { re: 0.2, im: 1.2 }]) {
      const preimages = Schwarz.sigmaInverse(wTarget, sw);
      numPreimages += preimages.length;
      for (const wPre of preimages) {
        const wRound = sw.sigma(wPre);
        if (!wRound) continue;
        maxRoundTrip = Math.max(maxRoundTrip,
          Math.hypot(wRound.re - wTarget.re, wRound.im - wTarget.im));
      }
    }
    ok('Schwarz/powerQD_singular: σ⁻¹ found preimages', numPreimages >= 1,
       'numFound=' + numPreimages);
    ok('Schwarz/powerQD_singular: σ ∘ σ⁻¹ ≈ identity', maxRoundTrip < 1e-6,
       'maxErr=' + maxRoundTrip.toExponential(2));

    // explicitSigmaForm has the Blaschke + αth-root structure.
    const form = Schwarz.explicitSigmaForm(sw);
    ok('Schwarz/powerQD_singular: explicitSigmaForm family tag',
       form && form.family === 'powerQD_singular');
    ok('Schwarz/powerQD_singular: phiLatex mentions Blaschke b_{z_0}',
       form && /b_\{z_0\}/.test(form.phiLatex || ''),
       'phiLatex=' + (form && form.phiLatex || '').slice(0, 80));
  }
}

// ---- UA: Schwarz adapter for unbounded PQDs (Family.unboundedPQD). ----
// adaptUnboundedPQD: φ=z·(r#)^{1/α}, F=(1/z)·(R)^{1/α} ⇒ σ=identity on ∂Ω.
// σ⁻¹ via the generic Newton F-inverter with side='out' (unbounded).
{
  const hData = { poles: [{ a: { re: 2.5, im: 0 }, principal: [{ re: 1, im: 0 }] }] };
  const r = solveInverseQD(hData, { unbounded: true, alpha: 2, c: 2 });
  ok('Schwarz/unboundedPQD: solve success', r.success, r.success ? '' : r.error);
  if (r.success) {
    const phi = r.primary.phi;
    const boundaryPts = QD_NS.sampleBoundary(phi, 256);
    const sw = Schwarz.buildSchwarzFromPhi(phi, hData, boundaryPts);
    ok('Schwarz/unboundedPQD: builder non-null',
       !!sw && sw.family === 'unboundedPQD', 'got family=' + (sw && sw.family));

    // σ ≈ identity on ∂Ω (∂Ω = φ(|z|=1) for unbounded).
    let maxBdyErr = 0;
    for (let k = 0; k < 16; k++) {
      const theta = 2 * Math.PI * k / 16;
      const z = { re: Math.cos(theta), im: Math.sin(theta) };
      const w = QD_NS.evalPhi(z, phi);
      const ss = sw.sigma(w);
      if (!ss) continue;
      maxBdyErr = Math.max(maxBdyErr, Math.hypot(ss.re - w.re, ss.im - w.im));
    }
    ok('Schwarz/unboundedPQD: σ ≈ identity on ∂Ω', maxBdyErr < 1e-7,
       'maxErr=' + maxBdyErr.toExponential(2));

    // ψ ∘ φ ≈ id for z0 in 𝔻* (the numerical inverse used by σ).
    let maxInvErr = 0, nTested = 0;
    for (let k = 0; k < 16; k++) {
      const th = 2 * Math.PI * k / 16;
      const z0 = { re: 1.5 * Math.cos(th), im: 1.5 * Math.sin(th) };
      const w = sw.evalPhi(z0);
      if (!sw.isInOmega(w)) continue;
      const z = sw.psi(w);
      if (!z) continue;
      nTested++;
      const wBack = sw.evalPhi(z);
      maxInvErr = Math.max(maxInvErr, Math.hypot(wBack.re - w.re, wBack.im - w.im));
    }
    ok('Schwarz/unboundedPQD: ψ ∘ φ ≈ id (n=' + nTested + ')',
       nTested > 0 && maxInvErr < 1e-8, 'maxErr=' + maxInvErr.toExponential(2));

    const form = Schwarz.explicitSigmaForm(sw);
    ok('Schwarz/unboundedPQD: explicitSigmaForm family tag',
       form && form.family === 'unboundedPQD');
  }
}

// ---- UB: Schwarz adapter for unbounded SINGULAR PQDs. adaptUnboundedPQD_singular:
// φ=z·b_{z₀}·(r#)^{1/α}, F=(1/z)·b#_{z₀}·(R)^{1/α} ⇒ σ=identity on ∂Ω. ----
{
  const hData = { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 0.5, im: 0 }] }] };
  const r = solveInverseQD(hData, { unbounded: true, singular: true, alpha: 2, c: 1 });
  ok('Schwarz/unboundedPQD_singular: solve success', r.success, r.success ? '' : r.error);
  if (r.success) {
    const phi = r.primary.phi;
    const boundaryPts = QD_NS.sampleBoundary(phi, 256);
    const sw = Schwarz.buildSchwarzFromPhi(phi, hData, boundaryPts);
    ok('Schwarz/unboundedPQD_singular: builder non-null',
       !!sw && sw.family === 'unboundedPQD_singular', 'got family=' + (sw && sw.family));
    let maxBdyErr = 0;
    for (let k = 0; k < 16; k++) {
      const theta = 2 * Math.PI * k / 16;
      const z = { re: Math.cos(theta), im: Math.sin(theta) };
      const w = QD_NS.evalPhi(z, phi);
      const ss = sw.sigma(w);
      if (!ss) continue;
      maxBdyErr = Math.max(maxBdyErr, Math.hypot(ss.re - w.re, ss.im - w.im));
    }
    ok('Schwarz/unboundedPQD_singular: σ ≈ identity on ∂Ω', maxBdyErr < 1e-7,
       'maxErr=' + maxBdyErr.toExponential(2));
    let maxInvErr = 0, nTested = 0;
    for (let k = 0; k < 16; k++) {
      const th = 2 * Math.PI * k / 16;
      const z0 = { re: 1.5 * Math.cos(th), im: 1.5 * Math.sin(th) };
      const w = sw.evalPhi(z0);
      if (!sw.isInOmega(w)) continue;
      const z = sw.psi(w);
      if (!z) continue;
      nTested++;
      const wBack = sw.evalPhi(z);
      maxInvErr = Math.max(maxInvErr, Math.hypot(wBack.re - w.re, wBack.im - w.im));
    }
    ok('Schwarz/unboundedPQD_singular: ψ ∘ φ ≈ id (n=' + nTested + ')',
       nTested > 0 && maxInvErr < 1e-8, 'maxErr=' + maxInvErr.toExponential(2));
    const form = Schwarz.explicitSigmaForm(sw);
    ok('Schwarz/unboundedPQD_singular: explicitSigmaForm family tag',
       form && form.family === 'unboundedPQD_singular');
  }
}

// ---- Unbounded one-point: h = 1/(w-2), c = 0.6  ----
{
  const hData = { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 1, im: 0 }] }], polyPart: [] };
  const { phi, boundaryPts } = solveAndSample(hData, { unbounded: true, c: 0.6 });
  const sw = Schwarz.buildSchwarzFromPhi(phi, hData, boundaryPts);
  ok('Schwarz/unb-1pt: builder', !!sw && sw.family === 'unboundedQD' && sw.unbounded);

  // σ on ∂Ω: sample a few points φ(e^{iθ}) (for unbounded, ∂Ω = φ(|z|=1)).
  let maxBdyErr = 0;
  for (let k = 0; k < 32; k++) {
    const th = 2 * Math.PI * k / 32;
    const z = { re: Math.cos(th), im: Math.sin(th) };
    const w = sw.evalPhi(z);
    const sv = sw.sigma(w);
    if (sv) maxBdyErr = Math.max(maxBdyErr, Math.hypot(sv.re - w.re, sv.im - w.im));
  }
  ok('Schwarz/unb-1pt: σ(w) ≈ w on ∂Ω', maxBdyErr < 1e-4,
     'maxErr=' + maxBdyErr.toExponential(2));

  // invPhi round-trip in 𝔻*.
  let maxInvErr = 0, nTested = 0;
  for (let k = 0; k < 16; k++) {
    const th = 2 * Math.PI * k / 16;
    const r = 1.4;
    const z0 = { re: r * Math.cos(th), im: r * Math.sin(th) };
    const w = sw.evalPhi(z0);
    if (!sw.isInOmega(w)) continue;
    const z = sw.psi(w);
    if (!z) continue;
    nTested++;
    const wBack = sw.evalPhi(z);
    maxInvErr = Math.max(maxInvErr, Math.hypot(wBack.re - w.re, wBack.im - w.im));
  }
  ok('Schwarz/unb-1pt: ψ ∘ φ ≈ id (n=' + nTested + ')', nTested > 0 && maxInvErr < 1e-8,
     'maxErr=' + maxInvErr.toExponential(2));
}

// ---- Bounded rational Schwarz via direct kernel ----
if (mathjs) {
  // φ(z) = z/(1-0.3z): a Möbius. φ(0)=0, φ'(0)=1.
  const P = [{re:0,im:0},{re:1,im:0}];
  const Q = [{re:1,im:0},{re:-0.3,im:0}];
  const phiRat = { rational: true, P, Q, w0: { re: 0, im: 0 } };
  // Build boundary by sampling φ on |z|=1.
  const pts = [];
  for (let k = 0; k < 256; k++) {
    const th = 2 * Math.PI * k / 256;
    const z = { re: Math.cos(th), im: Math.sin(th) };
    pts.push(Complex.div(z, Complex.sub({re:1,im:0}, Complex.scale(z, 0.3))));
  }
  const sw = Schwarz.buildSchwarzFromRational(phiRat, pts);
  ok('Schwarz/rational Möbius: builder', !!sw && sw.family === 'boundedQDRational');

  // σ on ∂Ω.
  let maxBdyErr = 0;
  for (let k = 0; k < 16; k++) {
    const th = 2 * Math.PI * k / 16;
    const z = { re: Math.cos(th), im: Math.sin(th) };
    const w = sw.evalPhi(z);
    const sv = sw.sigma(w);
    if (sv) maxBdyErr = Math.max(maxBdyErr, Math.hypot(sv.re - w.re, sv.im - w.im));
  }
  ok('Schwarz/rational Möbius: σ ≈ id on ∂Ω', maxBdyErr < 1e-5,
     'maxErr=' + maxBdyErr.toExponential(2));
}

// ---- LQD adapters: bounded non-singular ----
{
  const hData = { poles: [{ a: {re:1,im:0}, principal: [{re:0.5,im:0}] }] };
  const r = solveInverseQD(hData, { lqd: true, w0: {re:1,im:0} });
  ok('Schwarz/boundedLQD: solve success', r.success, r.success ? '' : r.error);
  if (r.success) {
    const phi = r.primary.phi;
    const pts = QD_NS.sampleBoundary(phi, 256);
    const sw = Schwarz.buildSchwarzFromPhi(phi, hData, pts);
    ok('Schwarz/boundedLQD: builder + family tag',
       !!sw && sw.family === 'boundedLQD');
    // σ ≈ id on ∂Ω
    let maxBdyErr = 0;
    for (let k = 0; k < 32; k++) {
      const th = 2 * Math.PI * k / 32;
      const z = { re: Math.cos(th), im: Math.sin(th) };
      const w = sw.evalPhi(z);
      const sv = sw.sigma(w);
      if (sv) maxBdyErr = Math.max(maxBdyErr, Math.hypot(sv.re - w.re, sv.im - w.im));
    }
    ok('Schwarz/boundedLQD: σ(w) ≈ w on ∂Ω', maxBdyErr < 1e-4,
       'maxErr=' + maxBdyErr.toExponential(2));
    // ψ ∘ φ ≈ id at interior test points
    let maxInvErr = 0, nTested = 0;
    for (let k = 0; k < 8; k++) {
      const t = (k + 1) / 10;
      const z0 = { re: t * Math.cos(2 * Math.PI * k / 8),
                   im: t * Math.sin(2 * Math.PI * k / 8) };
      const w = sw.evalPhi(z0);
      if (!sw.isInOmega(w)) continue;
      const z = sw.psi(w);
      if (!z) continue;
      nTested++;
      maxInvErr = Math.max(maxInvErr, Math.hypot(sw.evalPhi(z).re - w.re,
                                                  sw.evalPhi(z).im - w.im));
    }
    ok('Schwarz/boundedLQD: ψ ∘ φ ≈ id (n=' + nTested + ')',
       nTested > 0 && maxInvErr < 1e-7,
       'maxErr=' + maxInvErr.toExponential(2));

    // -------- S2: σ⁻¹ on boundedLQD (Newton fallback). --------
    // Seed candidates: try a few points in Ω^c. boundedLQD with one pole
    // gives a small region near w₀=1; the point w=−1 should be well outside.
    {
      const candidates = [{re:-1,im:0}, {re:3,im:0}, {re:0,im:2}];
      let tried = 0, found = 0, worstErr = 0;
      for (const seed of candidates) {
        if (sw.isInOmega(seed)) continue;
        tried++;
        const preimages = Schwarz.sigmaInverse(seed, sw);
        if (preimages.length > 0) {
          found++;
          for (const wPre of preimages) {
            const back = sw.sigma(wPre);
            const err = Math.hypot(back.re - seed.re, back.im - seed.im);
            if (err > worstErr) worstErr = err;
          }
        }
      }
      ok('S2/boundedLQD: σ⁻¹ found preimages for ≥ 1 of ' + tried + ' Ω^c seeds',
         tried > 0 && found > 0, 'tried=' + tried + ' found=' + found);
      ok('S2/boundedLQD: σ(σ⁻¹(w)) ≈ w (worst across seeds)',
         worstErr < 1e-3, 'worstErr=' + worstErr.toExponential(2));
    }
  } else {
    ok('Schwarz/boundedLQD: skipped (solver failed: ' + r.error + ')', true);
  }
}

// ---- LQD adapters: bounded singular ----
{
  const hData = { poles: [{ a: {re:2,im:0}, principal: [{re:0.5,im:0}] }] };
  const r = solveInverseQD(hData, {
    lqd: true, singular: true, w0: {re:1,im:0}, q: {re:0.5,im:0}
  });
  ok('Schwarz/boundedLQD_singular: solve success', r.success, r.success ? '' : r.error);
  if (r.success) {
    const phi = r.primary.phi;
    const pts = QD_NS.sampleBoundary(phi, 256);
    const sw = Schwarz.buildSchwarzFromPhi(phi, hData, pts);
    ok('Schwarz/boundedLQD_singular: builder + family tag',
       !!sw && sw.family === 'boundedLQD_singular');
    let maxBdyErr = 0;
    for (let k = 0; k < 32; k++) {
      const th = 2 * Math.PI * k / 32;
      const z = { re: Math.cos(th), im: Math.sin(th) };
      const w = sw.evalPhi(z);
      const sv = sw.sigma(w);
      if (sv) maxBdyErr = Math.max(maxBdyErr, Math.hypot(sv.re - w.re, sv.im - w.im));
    }
    ok('Schwarz/boundedLQD_singular: σ(w) ≈ w on ∂Ω', maxBdyErr < 1e-4,
       'maxErr=' + maxBdyErr.toExponential(2));

    // -------- S2: σ⁻¹ on boundedLQD_singular (Newton fallback). --------
    {
      const candidates = [{re:-2,im:0}, {re:5,im:0}, {re:0,im:3}];
      let tried = 0, found = 0, worstErr = 0;
      for (const seed of candidates) {
        if (sw.isInOmega(seed)) continue;
        tried++;
        const preimages = Schwarz.sigmaInverse(seed, sw);
        if (preimages.length > 0) {
          found++;
          for (const wPre of preimages) {
            const back = sw.sigma(wPre);
            const err = Math.hypot(back.re - seed.re, back.im - seed.im);
            if (err > worstErr) worstErr = err;
          }
        }
      }
      ok('S2/boundedLQD_singular: σ⁻¹ found preimages for ≥ 1 of ' + tried + ' seeds',
         tried > 0 && found > 0, 'tried=' + tried + ' found=' + found);
      ok('S2/boundedLQD_singular: σ(σ⁻¹(w)) ≈ w', worstErr < 1e-3,
         'worstErr=' + worstErr.toExponential(2));
    }
  } else {
    ok('Schwarz/boundedLQD_singular: skipped (solver failed: ' + r.error + ')', true);
  }
}

// ---- LQD adapters: unbounded non-singular ----
{
  const hData = { poles: [{ a: {re:2,im:0}, principal: [{re:1,im:0}] }] };
  const r = solveInverseQD(hData, { lqd: true, unbounded: true, c: 0.6 });
  ok('Schwarz/unboundedLQD: solve success', r.success, r.success ? '' : r.error);
  if (r.success) {
    const phi = r.primary.phi;
    const pts = QD_NS.sampleBoundary(phi, 256);
    const sw = Schwarz.buildSchwarzFromPhi(phi, hData, pts);
    ok('Schwarz/unboundedLQD: builder + family tag',
       !!sw && sw.family === 'unboundedLQD');
    let maxBdyErr = 0;
    for (let k = 0; k < 32; k++) {
      const th = 2 * Math.PI * k / 32;
      const z = { re: Math.cos(th), im: Math.sin(th) };
      const w = sw.evalPhi(z);
      const sv = sw.sigma(w);
      if (sv) maxBdyErr = Math.max(maxBdyErr, Math.hypot(sv.re - w.re, sv.im - w.im));
    }
    ok('Schwarz/unboundedLQD: σ(w) ≈ w on ∂Ω', maxBdyErr < 1e-4,
       'maxErr=' + maxBdyErr.toExponential(2));
    // ψ ∘ φ ≈ id at exterior test points
    let maxInvErr = 0, nTested = 0;
    for (let k = 0; k < 16; k++) {
      const th = 2 * Math.PI * k / 16;
      const r0 = 1.4;
      const z0 = { re: r0 * Math.cos(th), im: r0 * Math.sin(th) };
      const w = sw.evalPhi(z0);
      if (!sw.isInOmega(w)) continue;
      const z = sw.psi(w);
      if (!z) continue;
      nTested++;
      maxInvErr = Math.max(maxInvErr, Math.hypot(sw.evalPhi(z).re - w.re,
                                                  sw.evalPhi(z).im - w.im));
    }
    ok('Schwarz/unboundedLQD: ψ ∘ φ ≈ id (n=' + nTested + ')',
       nTested > 0 && maxInvErr < 1e-7,
       'maxErr=' + maxInvErr.toExponential(2));

    // -------- S2: σ⁻¹ on unboundedLQD (Newton fallback, side='out'). --------
    // Unbounded LQD's Ω^c = bounded complement K (around origin). Try a
    // few seeds inside K.
    {
      const candidates = [{re:0,im:0}, {re:0.3,im:0.2}, {re:-0.4,im:0.4}];
      let tried = 0, found = 0, worstErr = 0;
      for (const seed of candidates) {
        if (sw.isInOmega(seed)) continue;
        tried++;
        const preimages = Schwarz.sigmaInverse(seed, sw);
        if (preimages.length > 0) {
          found++;
          for (const wPre of preimages) {
            const back = sw.sigma(wPre);
            const err = Math.hypot(back.re - seed.re, back.im - seed.im);
            if (err > worstErr) worstErr = err;
          }
        }
      }
      ok('S2/unboundedLQD: σ⁻¹ found preimages for ≥ 1 of ' + tried + ' K seeds',
         tried > 0 && found > 0, 'tried=' + tried + ' found=' + found);
      ok('S2/unboundedLQD: σ(σ⁻¹(w)) ≈ w', worstErr < 1e-3,
         'worstErr=' + worstErr.toExponential(2));
    }
  } else {
    ok('Schwarz/unboundedLQD: skipped (solver failed: ' + r.error + ')', true);
  }
}

// ---- LQD adapters: unbounded singular ----
{
  const hData = { poles: [{ a: {re:2,im:0}, principal: [{re:1,im:0}] }] };
  const r = solveInverseQD(hData, {
    lqd: true, unbounded: true, singular: true, c: 0.6, q: {re:0.5,im:0}
  });
  ok('Schwarz/unboundedLQD_singular: solve success', r.success, r.success ? '' : r.error);
  if (r.success) {
    const phi = r.primary.phi;
    const pts = QD_NS.sampleBoundary(phi, 256);
    const sw = Schwarz.buildSchwarzFromPhi(phi, hData, pts);
    ok('Schwarz/unboundedLQD_singular: builder + family tag',
       !!sw && sw.family === 'unboundedLQD_singular');
    let maxBdyErr = 0;
    for (let k = 0; k < 32; k++) {
      const th = 2 * Math.PI * k / 32;
      const z = { re: Math.cos(th), im: Math.sin(th) };
      const w = sw.evalPhi(z);
      const sv = sw.sigma(w);
      if (sv) maxBdyErr = Math.max(maxBdyErr, Math.hypot(sv.re - w.re, sv.im - w.im));
    }
    ok('Schwarz/unboundedLQD_singular: σ(w) ≈ w on ∂Ω', maxBdyErr < 1e-4,
       'maxErr=' + maxBdyErr.toExponential(2));

    // -------- S2: σ⁻¹ on unboundedLQD_singular. --------
    // For this family Ω contains both 0 AND ∞, so K (= Ω^c) is a bounded
    // region around the finite pole at w=2. Probe a wide grid to find
    // candidates — the K region's shape varies with c, q, residue.
    {
      const candidates = [];
      for (let re = -2; re <= 4 && candidates.length < 5; re += 0.5) {
        for (let im = -2; im <= 2 && candidates.length < 5; im += 0.5) {
          const p = { re, im };
          if (!sw.isInOmega(p)) candidates.push(p);
        }
      }
      let tried = 0, found = 0, worstErr = 0;
      for (const seed of candidates) {
        if (sw.isInOmega(seed)) continue;
        tried++;
        const preimages = Schwarz.sigmaInverse(seed, sw);
        if (preimages.length > 0) {
          found++;
          for (const wPre of preimages) {
            const back = sw.sigma(wPre);
            const err = Math.hypot(back.re - seed.re, back.im - seed.im);
            if (err > worstErr) worstErr = err;
          }
        }
      }
      ok('S2/unboundedLQD_singular: σ⁻¹ found preimages for ≥ 1 of ' + tried + ' K seeds',
         tried > 0 && found > 0, 'tried=' + tried + ' found=' + found);
      ok('S2/unboundedLQD_singular: σ(σ⁻¹(w)) ≈ w', worstErr < 1e-3,
         'worstErr=' + worstErr.toExponential(2));
    }
  } else {
    ok('Schwarz/unboundedLQD_singular: skipped (solver failed: ' + r.error + ')', true);
  }
}

// ---- LQD adapters: unbounded NON-singular with polynomial-h (HANDOFF #26) --
// The user's reported failing case: h(w) = 1 (polyPart-only), c = 1. Before
// HANDOFF #26 the Schwarz adapter silently dropped phi.lqdBeta, evaluating
// φ = c·z·exp(r̃#(z)) which omits the polynomial-h B(1/z) term. σ on ∂Ω
// then failed to fix points by O(1).
{
  const hData = { poles: [], polyPart: [{re:1, im:0}] };
  const r = solveInverseQD(hData, { lqd: true, unbounded: true, c: 1 });
  ok('Schwarz/unboundedLQD-polyPart h=1 c=1: solve success', r.success, r.success ? '' : r.error);
  if (r.success) {
    const phi = r.primary.phi;
    const pts = QD_NS.sampleBoundary(phi, 256);
    const sw = Schwarz.buildSchwarzFromPhi(phi, hData, pts);
    ok('Schwarz/unboundedLQD-polyPart h=1 c=1: builder + family tag',
       !!sw && sw.family === 'unboundedLQD');
    ok('Schwarz/unboundedLQD-polyPart h=1 c=1: phi.lqdBeta carried through',
       (phi.lqdBeta || []).length > 0,
       'lqdBeta=' + JSON.stringify(phi.lqdBeta || []));
    let maxBdyErr = 0;
    for (let k = 0; k < 32; k++) {
      const th = 2 * Math.PI * k / 32;
      const z = { re: Math.cos(th), im: Math.sin(th) };
      const w = sw.evalPhi(z);
      const sv = sw.sigma(w);
      if (sv) maxBdyErr = Math.max(maxBdyErr, Math.hypot(sv.re - w.re, sv.im - w.im));
    }
    ok('Schwarz/unboundedLQD-polyPart h=1 c=1: σ(w) ≈ w on ∂Ω', maxBdyErr < 1e-4,
       'maxErr=' + maxBdyErr.toExponential(2));
  } else {
    ok('Schwarz/unboundedLQD-polyPart h=1 c=1: skipped (solver failed: ' + r.error + ')', true);
  }
}

// Combined polyPart + finite pole.
{
  const hData = {
    poles: [{ a: {re:2,im:0}, principal: [{re:1,im:0}] }],
    polyPart: [{re:0.05, im:0}],
  };
  const r = solveInverseQD(hData, { lqd: true, unbounded: true, c: 0.6 });
  ok('Schwarz/unboundedLQD-polyPart+1pole: solve success', r.success, r.success ? '' : r.error);
  if (r.success) {
    const phi = r.primary.phi;
    const pts = QD_NS.sampleBoundary(phi, 256);
    const sw = Schwarz.buildSchwarzFromPhi(phi, hData, pts);
    ok('Schwarz/unboundedLQD-polyPart+1pole: builder',
       !!sw && sw.family === 'unboundedLQD');
    let maxBdyErr = 0;
    for (let k = 0; k < 32; k++) {
      const th = 2 * Math.PI * k / 32;
      const z = { re: Math.cos(th), im: Math.sin(th) };
      const w = sw.evalPhi(z);
      const sv = sw.sigma(w);
      if (sv) maxBdyErr = Math.max(maxBdyErr, Math.hypot(sv.re - w.re, sv.im - w.im));
    }
    ok('Schwarz/unboundedLQD-polyPart+1pole: σ(w) ≈ w on ∂Ω', maxBdyErr < 1e-4,
       'maxErr=' + maxBdyErr.toExponential(2));
  } else {
    ok('Schwarz/unboundedLQD-polyPart+1pole: skipped (' + r.error + ')', true);
  }
}

// ---- LQD adapters: unbounded SINGULAR with γ-branch (HANDOFF #24/#26) -------
// Higher-order pole at the origin: hData has an a=0 entry with principal
// holding q_2…q_{m₀+1}. Before HANDOFF #26 the Schwarz adapter ignored
// phi.lqdGamma; the synthetic-branch r̃#_syn(z) contribution was missing.
{
  const hData = {
    poles: [
      { a: {re:0,im:0}, principal: [{re:0.05, im:0}] },   // q_2 = 0.05
      { a: {re:2,im:0}, principal: [{re:1,    im:0}] },
    ],
  };
  const r = solveInverseQD(hData, {
    lqd: true, unbounded: true, singular: true, c: 0.5, q: {re:0.2, im:0}
  });
  ok('Schwarz/unboundedLQD_singular+γ: solve success', r.success, r.success ? '' : r.error);
  if (r.success) {
    const phi = r.primary.phi;
    const pts = QD_NS.sampleBoundary(phi, 256);
    const sw = Schwarz.buildSchwarzFromPhi(phi, hData, pts);
    ok('Schwarz/unboundedLQD_singular+γ: builder + family tag',
       !!sw && sw.family === 'unboundedLQD_singular');
    ok('Schwarz/unboundedLQD_singular+γ: phi.lqdGamma carried through',
       (phi.lqdGamma || []).length === 1,
       'lqdGamma.length=' + (phi.lqdGamma || []).length);
    let maxBdyErr = 0;
    for (let k = 0; k < 32; k++) {
      const th = 2 * Math.PI * k / 32;
      const z = { re: Math.cos(th), im: Math.sin(th) };
      const w = sw.evalPhi(z);
      const sv = sw.sigma(w);
      if (sv) maxBdyErr = Math.max(maxBdyErr, Math.hypot(sv.re - w.re, sv.im - w.im));
    }
    ok('Schwarz/unboundedLQD_singular+γ: σ(w) ≈ w on ∂Ω', maxBdyErr < 1e-4,
       'maxErr=' + maxBdyErr.toExponential(2));
  } else {
    ok('Schwarz/unboundedLQD_singular+γ: skipped (' + r.error + ')', true);
  }
}

// ---- Orbit and escapeTime smoke tests for cardioid ----
{
  const hData = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1.5, im: 0 }, { re: 0.5, im: 0 }] }] };
  const { phi, boundaryPts } = solveAndSample(hData, {});
  const sw = Schwarz.buildSchwarzFromPhi(phi, hData, boundaryPts);

  // Orbit starting at the centroid w₀=0 escapes immediately; pick a generic
  // interior point instead. φ(0.5) is the image of z=0.5, definitely in Ω.
  const wInside = sw.evalPhi({ re: 0.5, im: 0 });
  const orbit = Schwarz.makeOrbit(wInside, sw, { maxIter: 8 });
  ok('Schwarz/cardioid: makeOrbit returns at least 2 points', orbit.length >= 2,
     'orbit.length=' + orbit.length);

  // Orbit starting at w₀ = φ(0) (singularity): σ maps it to ∞ immediately.
  const w0 = phi.w0;
  const orb0 = Schwarz.makeOrbit(w0, sw, { maxIter: 4 });
  // First iterate is at ∞ (or diverges); shouldn't loop forever.
  ok('Schwarz/cardioid: orbit at w₀ terminates', orb0.length <= 4);
}

};
