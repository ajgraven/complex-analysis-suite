'use strict';
// solvers-4.test.js — shard 4/4 of the former monolithic solvers.test.js (refactor Stage B2, QD-TEST-5).
// EXACT contiguous slice of the original run() body (original lines 1234-1914); split only for parallelism.
// Concatenating all 4 shard bodies reproduces the original body byte-for-byte (verified). The module-scope
// preamble is the original's, preserved verbatim; shared kernels + harness (ok, C, T, vm/ctx, Schwarz, PS, ...)
// are installed on `global` by test/bootstrap.js, so bare names resolve exactly as in the monolith.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP_DIR = path.join(__dirname, '..');
require('./bootstrap');
module.exports = async function run() {

// ---------------------------------------------------------------------------
// §23: Automatic singular ↔ non-singular PQD regime switching. As the
// quadrature residues grow, ∂Ω crosses the origin and the domain moves between
// the non-singular family (0 ∉ Ω) and the singular family (0 ∈ Ω). With
// opts.autoSwitchSingular the solver detects the mismatch (geometric: 0 ∈ Ω ⟺
// singular) and re-dispatches once to the correct family. Empirically-verified
// cases below (bounded transition for h=C/(w-3),α=2 sits between C=16 and C=25).
{
  const originIn = QD_NS.originInsideOmega;

  // --- originInsideOmega unit checks (incl. the phi.unbounded inversion) ---
  const rNonSing = solveInverseQD(
    { poles: [{ a: { re: 3, im: 0 }, principal: [{ re: 6, im: 0 }] }] }, { alpha: 2 });
  ok('§23 originInsideOmega: non-singular bounded PQD → false',
     rNonSing.success && originIn(rNonSing.primary.phi) === false);
  const rSing = solveInverseQD(
    { poles: [{ a: { re: 1, im: 0 }, principal: [{ re: 63 / 32, im: 0 }] }] },
    { alpha: 2, singular: true, w0: { re: 1, im: 0 } });
  ok('§23 originInsideOmega: singular bounded PQD → true',
     rSing.success && originIn(rSing.primary.phi) === true);
  const rUnbNonSing = solveInverseQD(
    { poles: [], polyPart: [{ re: 0.3, im: 0 }] }, { unbounded: true, alpha: 2, c: 1 });
  ok('§23 originInsideOmega: unbounded non-singular PQD → false (phi.unbounded inversion)',
     rUnbNonSing.success && originIn(rUnbNonSing.primary.phi) === false);
  const rUnbSing = solveInverseQD(
    { poles: [], polyPart: [{ re: 1, im: 0 }] }, { unbounded: true, singular: true, alpha: 2, c: 1 });
  ok('§23 originInsideOmega: unbounded singular PQD → true (phi.unbounded inversion)',
     rUnbSing.success && originIn(rUnbSing.primary.phi) === true);

  // --- Bounded switch-up: request non-singular on a domain that is actually
  //     singular (0 ∈ Ω) → auto-switch to powerQD_singular. ---
  const hUp = { poles: [{ a: { re: 1, im: 0 }, principal: [{ re: 63 / 32, im: 0 }] }] };
  const rUp = solveInverseQD(hUp, { alpha: 2, autoSwitchSingular: true });
  ok('§23 bounded switch-up: regimeSwitched',
     rUp.success && rUp.regimeSwitched === true && rUp.switchedTo === 'singular',
     'fam=' + (rUp.primary && rUp.primary.phi.family));
  ok('§23 bounded switch-up: lands on powerQD_singular, valid, 0 ∈ Ω',
     rUp.success && rUp.primary.phi.family === 'powerQD_singular' &&
     rUp.primary.univalent && rUp.primary.identityOK && originIn(rUp.primary.phi) === true,
     rUp.success ? 'idDiff=' + rUp.primary.identity.maxRelDiff.toExponential(2) : rUp.error);

  // --- Bounded switch-down: request singular on a domain that is actually
  //     non-singular (0 ∉ Ω; the user's reference h=3/(w-3), α=2) → switch back. ---
  const hDn = { poles: [{ a: { re: 3, im: 0 }, principal: [{ re: 3, im: 0 }] }] };
  const rDn = solveInverseQD(hDn, { alpha: 2, singular: true, w0: { re: 2, im: 0 }, autoSwitchSingular: true });
  ok('§23 bounded switch-down: regimeSwitched',
     rDn.success && rDn.regimeSwitched === true && rDn.switchedTo === 'nonsingular',
     'fam=' + (rDn.primary && rDn.primary.phi.family));
  ok('§23 bounded switch-down: lands on powerQD, valid, 0 ∉ Ω',
     rDn.success && rDn.primary.phi.family === 'powerQD' &&
     rDn.primary.univalent && rDn.primary.identityOK && originIn(rDn.primary.phi) === false,
     rDn.success ? 'idDiff=' + rDn.primary.identity.maxRelDiff.toExponential(2) : rDn.error);

  // --- Unbounded switch-up: monomial h=1 (singular truth) requested non-singular. ---
  const rUUp = solveInverseQD({ poles: [], polyPart: [{ re: 1, im: 0 }] },
    { unbounded: true, alpha: 2, c: 1, autoSwitchSingular: true });
  ok('§23 unbounded switch-up: lands on unboundedPQD_singular, switched, valid',
     rUUp.success && rUUp.regimeSwitched === true &&
     rUUp.primary.phi.family === 'unboundedPQD_singular' &&
     rUUp.primary.univalent && rUUp.primary.identityOK,
     rUUp.success ? 'fam=' + rUUp.primary.phi.family : rUUp.error);

  // --- Unbounded switch-down: const h=0.3 (non-singular truth) requested singular. ---
  const rUDn = solveInverseQD({ poles: [], polyPart: [{ re: 0.3, im: 0 }] },
    { unbounded: true, singular: true, alpha: 2, c: 1, autoSwitchSingular: true });
  ok('§23 unbounded switch-down: lands on unboundedPQD, switched, valid',
     rUDn.success && rUDn.regimeSwitched === true &&
     rUDn.primary.phi.family === 'unboundedPQD' &&
     rUDn.primary.univalent && rUDn.primary.identityOK,
     rUDn.success ? 'fam=' + rUDn.primary.phi.family : rUDn.error);

  // --- Toggle off: same switch-up case WITHOUT the flag → no switch (the
  //     requested non-singular family's invalid result is returned unchanged). ---
  const rOff = solveInverseQD(hUp, { alpha: 2 });
  ok('§23 toggle off: no switch (stays powerQD, identity fails)',
     rOff.success && !rOff.regimeSwitched && rOff.primary.phi.family === 'powerQD' &&
     !rOff.primary.identityOK);

  // --- No-op when already correct: a comfortably non-singular case with the
  //     flag on returns powerQD with regimeSwitched falsy (one solve). ---
  const rNoop = solveInverseQD(
    { poles: [{ a: { re: 3, im: 0 }, principal: [{ re: 6, im: 0 }] }] },
    { alpha: 2, autoSwitchSingular: true });
  ok('§23 no-op when already correct: stays powerQD, not switched',
     rNoop.success && !rNoop.regimeSwitched && rNoop.primary.phi.family === 'powerQD' &&
     rNoop.primary.univalent && rNoop.primary.identityOK);
}

// ---------------------------------------------------------------------------
// Q1.4: explicit R# non-vanishing guard for bounded PQDs. φ = (…)·(R#)^{1/α} is
// single-valued/univalent only if R# is non-vanishing on 𝔻̄ (winding 0 about 0).
// QD._rHashVanishingGuard(samples) detects winding ≠ 0 (a zero inside 𝔻) or a
// near-zero |R#| on ∂𝔻; the PQD verifiers force maxRelDiff = ∞ when it trips so
// spurious roots are rejected directly.
{
  const guard = QD_NS._rHashVanishingGuard;
  const ring = (fn) => {
    const N = 256, s = new Array(N);
    for (let i = 0; i < N; i++) {
      const t = (2 * Math.PI * i) / N;
      s[i] = { rH: fn(t) };
    }
    return s;
  };
  // Non-vanishing, winding 0: R# = 2 + e^{iθ} (a circle of radius 1 about 2).
  const g0 = guard(ring((t) => ({ re: 2 + Math.cos(t), im: Math.sin(t) })));
  ok('Q1.4 guard: non-vanishing R# (winding 0) → not flagged',
     g0.winding === 0 && g0.vanishes === false);
  // Winding +1: R# = e^{iθ} (unit circle about 0 ⇒ a zero inside 𝔻).
  const g1 = guard(ring((t) => ({ re: Math.cos(t), im: Math.sin(t) })));
  ok('Q1.4 guard: R# winding 1 (zero inside 𝔻) → flagged',
     g1.winding === 1 && g1.vanishes === true);
  // Winding −2: R# = e^{-2iθ}.
  const g2 = guard(ring((t) => ({ re: Math.cos(2 * t), im: -Math.sin(2 * t) })));
  ok('Q1.4 guard: R# winding −2 → flagged', g2.winding === -2 && g2.vanishes === true);
  // Touches 0 on the boundary (|R#| → 0 at one sample) with winding 0.
  const gT = guard(ring((t) => ({ re: 1 - Math.cos(t), im: 0 })));   // 0 at t=0
  ok('Q1.4 guard: R# touching 0 on ∂𝔻 → flagged', gT.vanishes === true);

  // Regression: a genuinely valid bounded PQD is NOT flagged (guard adds the
  // rHashVanishes:false field; identity still passes).
  const rOk = solveInverseQD(
    { poles: [{ a: { re: 3, im: 0 }, principal: [{ re: 3, im: 0 }] }] }, { alpha: 2 });
  ok('Q1.4 guard: valid powerQD not flagged (rHashVanishes false)',
     rOk.success && rOk.primary.identity.rHashVanishes === false &&
     rOk.primary.identityOK);
  // Regression: a valid singular bounded PQD is NOT flagged.
  const rOkS = solveInverseQD(
    { poles: [{ a: { re: 1, im: 0 }, principal: [{ re: 63 / 32, im: 0 }] }] },
    { alpha: 2, singular: true, w0: { re: 1, im: 0 } });
  ok('Q1.4 guard: valid powerQD_singular not flagged',
     rOkS.success && rOkS.primary.identity.rHashVanishes === false &&
     rOkS.primary.identityOK);
}

// ---------------------------------------------------------------------------
// §25: geometric univalence criteria (QD.classifyUnivalence). Convex / star-like
// / spiral-like of the solved Ω, via QD.phiTaylorAt(z,φ,2) on the boundary.
// Oracles: a one-point bounded QD is an exact disk (convex ⟹ star ⟹ spiral);
// a bounded LQD here is star-like but NOT convex; unbounded families are
// star-like w.r.t. ∞ (g=zφ'/φ) with convex N/A.
{
  const classify = QD_NS.classifyUnivalence;
  const P = (re) => ({ re, im: 0 });

  // Disk (one-point bounded QD = exact disk): convex ⟹ star ⟹ spiral.
  const rDisk = solveInverseQD({ poles: [{ a: P(2), principal: [P(3)] }] }, {});
  ok('§25 disk: solves', rDisk.success, rDisk.success ? '' : rDisk.error);
  if (rDisk.success) {
    const g = classify(rDisk.primary.phi, { samples: 360, univalent: rDisk.primary.univalent });
    ok('§25 disk: convex', g.convex.is === true, 'min Re=' + g.convex.margin.toExponential(2));
    ok('§25 disk: star-like', g.starLike.is === true);
    ok('§25 disk: spiral-like', g.spiralLike.is === true);
    ok('§25 disk: convex ⟹ star ⟹ spiral hierarchy',
       (!g.convex.is || g.starLike.is) && (!g.starLike.is || g.spiralLike.is));
    ok('§25 disk: tiny spiral arc (args aligned)', g.spiralLike.arcWidth < 0.1);
    ok('§25 disk: bounded, center = w₀', g.bounded === true && g.center && Number.isFinite(g.center.re));
  }

  // Star-like but NOT convex (bounded LQD).
  const rSL = solveInverseQD({ poles: [{ a: P(2), principal: [P(3)] }] }, { lqd: true, w0: P(1) });
  ok('§25 star-not-convex: solves', rSL.success, rSL.success ? '' : rSL.error);
  if (rSL.success) {
    const g = classify(rSL.primary.phi, { samples: 360, univalent: rSL.primary.univalent });
    ok('§25 LQD: star-like but not convex',
       g.starLike.is === true && g.convex.is === false,
       'star=' + g.starLike.margin.toExponential(2) + ' convexMin=' + g.convex.margin.toExponential(2));
    ok('§25 LQD: star ⟹ spiral', !g.starLike.is || g.spiralLike.is);
  }

  // Unbounded: star-like w.r.t. ∞ (g = zφ'/φ); convex is N/A.
  const rUstar = solveInverseQD({ poles: [{ a: P(2), principal: [P(1)] }] }, { unbounded: true, c: 1 });
  ok('§25 unbounded-star: solves', rUstar.success, rUstar.success ? '' : rUstar.error);
  if (rUstar.success) {
    const g = classify(rUstar.primary.phi, { samples: 360, univalent: rUstar.primary.univalent });
    ok('§25 unbounded: convex N/A, center ∞',
       g.bounded === false && g.convex.na === true && g.center === 'infinity');
    ok('§25 unbounded: star-like w.r.t. ∞', g.starLike.is === true,
       'min Re=' + g.starLike.margin.toExponential(2));
  }

  // Unbounded NOT star-like (large residue) — exercises the negative branch.
  const rUns = solveInverseQD({ poles: [{ a: P(2), principal: [P(5)] }] }, { unbounded: true, c: 1 });
  if (rUns.success) {
    const g = classify(rUns.primary.phi, { samples: 360, univalent: rUns.primary.univalent });
    ok('§25 unbounded not-star-like: star=false',
       g.starLike.is === false, 'min Re=' + g.starLike.margin.toExponential(2));
  }

  // PQD sanity: phiTaylorAt order-2 works through (R#)^{1/α}.
  const rPQD = solveInverseQD({ poles: [{ a: P(3), principal: [P(3)] }] }, { alpha: 2 });
  if (rPQD.success) {
    const g = classify(rPQD.primary.phi, { samples: 360, univalent: rPQD.primary.univalent });
    ok('§25 PQD: criteria computed (star-like)', g.starLike.is === true);
  }

  // Non-univalent caveat note.
  if (rDisk.success) {
    const g = classify(rDisk.primary.phi, { samples: 120, univalent: false });
    ok('§25 non-univalent caveat note present', g.notes.some(n => /not univalent/i.test(n)));
  }
}

// ---------------------------------------------------------------------------
// UA: UNBOUNDED power-weighted QDs (Family.unboundedPQD, 0 ∉ Ω). φ(z) =
// z·(r#(z))^{1/α} on 𝔻*, r#(∞)=c^α hardwired. The test class A₀(Ω) (decaying)
// makes the weighted integral converge for all α>0. c is a user input. The
// identity verifier is the oracle (no closed-form ground truth needed for
// finite poles). Example 4.3.1 (constant h) is the closed-form check for the
// ∞-pole/Laurent block: φ=c·z·(1−γ/z)^{1/α}, γ=−α·h₀/c^{2α−1}.
{
  // Example 4.3.1: constant h=0.3, α=2, c=1 → G₁ = α·h₀·c^{1−α} = 0.6, γ=−0.6.
  const hC = { poles: [], polyPart: [{ re: 0.3, im: 0 }] };
  const rC = solveInverseQD(hC, { unbounded: true, alpha: 2, c: 1 });
  ok('unboundedPQD: Example 4.3.1 (const h) solves', rC.success, rC.success ? '' : rC.error);
  if (rC.success) {
    const phi = rC.primary.phi;
    ok('unboundedPQD: family tag', phi.family === 'unboundedPQD', 'got=' + phi.family);
    ok('unboundedPQD: Example 4.3.1 G₁ ≈ α·h₀·c^{1−α} = 0.6',
       Math.abs(phi.polyA[0].re - 0.6) < 1e-6 && Math.abs(phi.polyA[0].im) < 1e-6,
       'G₁=' + phi.polyA[0].re.toFixed(6));
    ok('unboundedPQD: Example 4.3.1 identity < 1e-8',
       rC.primary.identity.maxRelDiff < 1e-8, 'maxRel=' + rC.primary.identity.maxRelDiff.toExponential(2));
  }

  // Finite-pole α=2 (univalent): h=1/(w−2.5), c=2. Identity verifier = oracle.
  const hF = { poles: [{ a: { re: 2.5, im: 0 }, principal: [{ re: 1, im: 0 }] }] };
  const rF = solveInverseQD(hF, { unbounded: true, alpha: 2, c: 2 });
  ok('unboundedPQD: finite-pole α=2 solves', rF.success, rF.success ? '' : rF.error);
  if (rF.success) {
    ok('unboundedPQD: finite-pole α=2 univalent', rF.primary.univalent);
    ok('unboundedPQD: finite-pole α=2 identity < 1e-8',
       rF.primary.identity.maxRelDiff < 1e-8, 'maxRel=' + rF.primary.identity.maxRelDiff.toExponential(2));
    ok('unboundedPQD: finite-pole z₁ exterior (|z₁| > 1)',
       Complex.abs(rF.primary.phi.branches[0].z) > 1);
  }

  // Non-integer α=1.5 finite pole (univalent): h=0.5/(w−2.5), c=2.
  const hN = { poles: [{ a: { re: 2.5, im: 0 }, principal: [{ re: 0.5, im: 0 }] }] };
  const rN = solveInverseQD(hN, { unbounded: true, alpha: 1.5, c: 2 });
  ok('unboundedPQD: finite-pole α=1.5 solves', rN.success, rN.success ? '' : rN.error);
  if (rN.success) {
    ok('unboundedPQD: finite-pole α=1.5 identity < 1e-8',
       rN.primary.identity.maxRelDiff < 1e-8, 'maxRel=' + rN.primary.identity.maxRelDiff.toExponential(2));
  }

  // Dispatch: α≠1 unbounded selects unboundedPQD; α=1 does not.
  const famPQD = QD_NS.Family.unboundedPQD;
  ok('unboundedPQD: matches α=2 unbounded',
     famPQD.matches({ unbounded: true, alpha: 2, c: 2 }) === true);
  ok('unboundedPQD: does NOT match α=1 (routes to unboundedQD)',
     famPQD.matches({ unbounded: true, alpha: 1, c: 2 }) === false);
  ok('unboundedPQD: does NOT match bounded α=2 (routes to powerQD)',
     famPQD.matches({ unbounded: false, alpha: 2 }) === false);

  // clonePhi preserves alpha + c (field-drop guard).
  if (rF.success) {
    const cl = QD_NS.clonePhi(rF.primary.phi);
    ok('unboundedPQD: clonePhi preserves alpha + c',
       cl.alpha === rF.primary.phi.alpha && cl.c === rF.primary.phi.c,
       'alpha=' + cl.alpha + ' c=' + cl.c);
  }
}

// UA (degree ≥ 1): polynomial-h ∞-pole block via the Laurent-at-∞ matching
// residual. Ground truth: monomial PQDs (Thm 4.5.3): Ω ∈ QD_a(α·k·w^{k-1}) ⇒
// r#(z) = c^a(1 − γ_k/z^k), γ_k = −aαk/c^{2a−k}, so only G_k = α·h_n·c^{k−α}
// is nonzero (k = n+1). Identity verifier is the oracle for all cases.
{
  // Monomial h = w (a=2, c=2): k=2, α=½ ⇒ G₂ = 2·½·c^{2−2}·2 = 2, G₁ = 0.
  const hW = { poles: [], polyPart: [{ re: 0, im: 0 }, { re: 1, im: 0 }] };
  const rW = solveInverseQD(hW, { unbounded: true, alpha: 2, c: 2 });
  ok('unboundedPQD: monomial h=w solves', rW.success, rW.success ? '' : rW.error);
  if (rW.success) {
    const phi = rW.primary.phi;
    ok('unboundedPQD: monomial h=w  G₁≈0, G₂≈2',
       Complex.abs(phi.polyA[0]) < 1e-6 && Math.abs(phi.polyA[1].re - 2) < 1e-6 &&
       Math.abs(phi.polyA[1].im) < 1e-6,
       'G₁=' + phi.polyA[0].re.toFixed(5) + ' G₂=' + phi.polyA[1].re.toFixed(5));
    ok('unboundedPQD: monomial h=w identity < 1e-8',
       rW.primary.identity.maxRelDiff < 1e-8, 'maxRel=' + rW.primary.identity.maxRelDiff.toExponential(2));
    ok('unboundedPQD: monomial h=w univalent', rW.primary.univalent);
  }

  // Monomial h = 0.9·w² (a=2, c=4): k=3 ⇒ G₃ = α·h_n·c^{k−α} = 2·0.9·4 = 7.2,
  // G₁=G₂=0. (c=4 keeps |γ₃|=0.45 well clear of the corner-forming limit so the
  // default-resolution identity verifier resolves the Z₃-symmetric boundary.)
  const hW2 = { poles: [], polyPart: [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0.9, im: 0 }] };
  const rW2 = solveInverseQD(hW2, { unbounded: true, alpha: 2, c: 4 });
  ok('unboundedPQD: monomial h=0.9w² solves', rW2.success, rW2.success ? '' : rW2.error);
  if (rW2.success) {
    const phi = rW2.primary.phi;
    ok('unboundedPQD: monomial h=0.9w²  G₃≈7.2',
       Math.abs(phi.polyA[2].re - 7.2) < 1e-5 && Complex.abs(phi.polyA[0]) < 1e-5 &&
       Complex.abs(phi.polyA[1]) < 1e-5,
       'G₃=' + phi.polyA[2].re.toFixed(5));
    ok('unboundedPQD: monomial h=0.9w² identity < 1e-8',
       rW2.primary.identity.maxRelDiff < 1e-8, 'maxRel=' + rW2.primary.identity.maxRelDiff.toExponential(2));
  }

  // COMPLEX constant h = 0.2+0.15i (a=2, c=1): the conjugation regression.
  // G₁ = α·conj(h₀)·c^{1−α} = 2·(0.2−0.15i) = 0.4−0.3i (reflection form).
  const hC = { poles: [], polyPart: [{ re: 0.2, im: 0.15 }] };
  const rC = solveInverseQD(hC, { unbounded: true, alpha: 2, c: 1 });
  ok('unboundedPQD: complex const h solves', rC.success, rC.success ? '' : rC.error);
  if (rC.success) {
    const G1 = rC.primary.phi.polyA[0];
    ok('unboundedPQD: complex const G₁ ≈ α·conj(h₀)·c^{1−α} = 0.4−0.3i',
       Math.abs(G1.re - 0.4) < 1e-6 && Math.abs(G1.im - (-0.3)) < 1e-6,
       'G₁=' + G1.re.toFixed(5) + (G1.im >= 0 ? '+' : '') + G1.im.toFixed(5) + 'i');
    ok('unboundedPQD: complex const identity < 1e-8',
       rC.primary.identity.maxRelDiff < 1e-8, 'maxRel=' + rC.primary.identity.maxRelDiff.toExponential(2));
  }

  // Polynomial part + finite pole: h = 0.2·w + 0.5/(w−3) (a=2, c=2). Identity oracle.
  const hPF = { poles: [{ a: { re: 3, im: 0 }, principal: [{ re: 0.5, im: 0 }] }],
                polyPart: [{ re: 0, im: 0 }, { re: 0.2, im: 0 }] };
  const rPF = solveInverseQD(hPF, { unbounded: true, alpha: 2, c: 2 });
  ok('unboundedPQD: poly+finite-pole solves', rPF.success, rPF.success ? '' : rPF.error);
  if (rPF.success) {
    ok('unboundedPQD: poly+finite-pole univalent', rPF.primary.univalent);
    ok('unboundedPQD: poly+finite-pole identity < 1e-8',
       rPF.primary.identity.maxRelDiff < 1e-8, 'maxRel=' + rPF.primary.identity.maxRelDiff.toExponential(2));
  }
}

// UB: UNBOUNDED SINGULAR PQDs (Family.unboundedPQD_singular, 0 ∈ Ω).
// φ = z·b_{z₀}·(r#)^{1/α}, r#(∞)=|cz₀|^α. The z₀-closure is r(z₀)=0 (the
// rational r = reflection of r# has a root at the origin-preimage z₀, thesis
// Prop 4.6.3); without it the system is rank-deficient by 2. Ground truth:
// singular monomial (Thm 4.5.2) h=1, α=2, c=1 → z₀ = γ^{1/(2α−1)} = (−2)^{1/3}.
{
  // Singular monomial h=1 (const), α=2, c=1 → z₀ = (−2)^{1/3} ≈ −1.25992.
  const hM = { poles: [], polyPart: [{ re: 1, im: 0 }] };
  const rM = solveInverseQD(hM, { unbounded: true, singular: true, alpha: 2, c: 1 });
  ok('unboundedPQD_singular: monomial h=1 solves', rM.success, rM.success ? '' : rM.error);
  if (rM.success) {
    const phi = rM.primary.phi;
    ok('unboundedPQD_singular: family tag', phi.family === 'unboundedPQD_singular', 'got=' + phi.family);
    ok('unboundedPQD_singular: monomial z₀ ≈ (−2)^{1/3} = −1.25992 (Thm 4.5.2)',
       Math.abs(phi.z0.re - (-Math.cbrt(2))) < 1e-5 && Math.abs(phi.z0.im) < 1e-5,
       'z₀=' + phi.z0.re.toFixed(6));
    ok('unboundedPQD_singular: monomial identity < 1e-8',
       rM.primary.identity.maxRelDiff < 1e-8, 'maxRel=' + rM.primary.identity.maxRelDiff.toExponential(2));
  }

  // One-point finite pole, α=2: h = 0.5/(w−2), c=1. Identity verifier oracle.
  const hP = { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 0.5, im: 0 }] }] };
  const rP = solveInverseQD(hP, { unbounded: true, singular: true, alpha: 2, c: 1 });
  ok('unboundedPQD_singular: one-pole α=2 solves', rP.success, rP.success ? '' : rP.error);
  if (rP.success) {
    ok('unboundedPQD_singular: one-pole α=2 univalent', rP.primary.univalent);
    ok('unboundedPQD_singular: one-pole α=2 identity < 1e-8',
       rP.primary.identity.maxRelDiff < 1e-8, 'maxRel=' + rP.primary.identity.maxRelDiff.toExponential(2));
    ok('unboundedPQD_singular: z₀ exterior (|z₀| > 1)', Complex.abs(rP.primary.phi.z0) > 1);
  }

  // Non-integer α=1.5 one-pole: h = 1/(w−2), c=1.
  const hN = { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 1, im: 0 }] }] };
  const rN = solveInverseQD(hN, { unbounded: true, singular: true, alpha: 1.5, c: 1 });
  ok('unboundedPQD_singular: one-pole α=1.5 solves', rN.success, rN.success ? '' : rN.error);
  if (rN.success) {
    ok('unboundedPQD_singular: one-pole α=1.5 identity < 1e-8',
       rN.primary.identity.maxRelDiff < 1e-8, 'maxRel=' + rN.primary.identity.maxRelDiff.toExponential(2));
  }

  // Dispatch + clonePhi (z₀ + alpha + c).
  const famS = QD_NS.Family.unboundedPQD_singular;
  ok('unboundedPQD_singular: matches α=2 unbounded singular',
     famS.matches({ unbounded: true, singular: true, alpha: 2, c: 1 }) === true);
  ok('unboundedPQD_singular: does NOT match α=1',
     famS.matches({ unbounded: true, singular: true, alpha: 1, c: 1 }) === false);
  ok('unboundedPQD_singular: does NOT match non-singular',
     famS.matches({ unbounded: true, alpha: 2, c: 1 }) === false);
  if (rP.success) {
    const cl = QD_NS.clonePhi(rP.primary.phi);
    ok('unboundedPQD_singular: clonePhi preserves z₀ + alpha + c',
       cl.z0 && Math.abs(cl.z0.re - rP.primary.phi.z0.re) < 1e-15 &&
       cl.alpha === rP.primary.phi.alpha && cl.c === rP.primary.phi.c);
  }
}

// QD-solver-families-B-01: unbounded singular PQD identity verifier self-converges.
// h with BOTH a finite pole AND a polynomial part steepens the near-origin boundary; the old fixed
// 2000-sample floor read ~4e-3 there and FALSE-rejected a genuinely univalent QD (identityOK=false).
// The verifier now escalates the sample count while the residual keeps converging (capped at 16000).
// Perf: because 2000 is ALWAYS insufficient for that pole+polyPart class, the verifier starts it at
// the 4000 floor (skipping the known-wasted first sweep); pole-only / polyPart-only keep 2000.
{
  const famS = QD_NS.Family.unboundedPQD_singular;
  // (A) pole + polyPart together — the false-negative case.
  const hPP = { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 0.5, im: 0 }] }], polyPart: [{ re: 0.4, im: 0 }] };
  const rPP = solveInverseQD(hPP, { unbounded: true, singular: true, alpha: 2, c: 1 });
  ok('B-01: pole+polyPart UPQD_singular solves + univalent',
     rPP.success && rPP.primary && rPP.primary.univalent, rPP.success ? '' : rPP.error);
  if (rPP.success) {
    ok('B-01: pole+polyPart now CERTIFIED valid (identityOK — was a false negative at N=2000)',
       rPP.primary.identityOK === true, 'maxRelDiff=' + rPP.primary.identity.maxRelDiff.toExponential(2));
    const vPP = famS.verifyQuadratureIdentity(rPP.primary.phi, hPP, {});
    ok('B-01: pole+polyPart verify starts above the 2000 floor (≥4000; skips the wasted first sweep)',
       vPP.numSamples >= 4000, 'numSamples=' + vPP.numSamples);
    ok('B-01: escalated identity residual is well below identityTol (1e-6)',
       vPP.maxRelDiff < 1e-6, 'maxRelDiff=' + vPP.maxRelDiff.toExponential(2));
  }
  // (B) pole-only baseline — resolves at 2000, must NOT escalate (no perf regression).
  const hPole = { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 0.5, im: 0 }] }], polyPart: [] };
  const rPole = solveInverseQD(hPole, { unbounded: true, singular: true, alpha: 2, c: 1 });
  if (rPole.success) {
    const vP = famS.verifyQuadratureIdentity(rPole.primary.phi, hPole, {});
    ok('B-01: pole-only verify does NOT escalate (single 2000-sweep, common case unchanged)',
       vP.numSamples === 2000, 'numSamples=' + vP.numSamples);
    ok('B-01: pole-only still certified valid', rPole.primary.identityOK === true,
       'maxRelDiff=' + rPole.primary.identity.maxRelDiff.toExponential(2));
  }
}

// QA: non-integer-α dispatch. α=1.5 must route to powerQD; α=1 to boundedQD.
{
  const r15 = solveInverseQD(
    { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 3, im: 0 }] }] },
    { alpha: 1.5, w0: { re: 1, im: 0 } }
  );
  ok('powerQD: α=1.5 routes to powerQD', r15.success && r15.primary.phi.family === 'powerQD',
     'family=' + (r15.primary?.phi?.family || '<none>'));
  ok('powerQD: α=1.5 phi.alpha preserved (non-integer)',
     r15.success && r15.primary.phi.alpha === 1.5, 'alpha=' + r15.primary?.phi?.alpha);
}

// powerQD α=1 dispatch: opts.alpha=1 (or absent) must NOT route to powerQD;
// existing boundedQD behavior is preserved.
{
  const r = solveInverseQD(
    { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1.96, im: 0 }] }] },
    { alpha: 1 }
  );
  ok('powerQD: α=1 routes to boundedQD (not powerQD)',
     r.success && r.primary.phi.family !== 'powerQD',
     'family=' + (r.primary?.phi?.family || '<none>'));
}

// powerQD: schema pack/unpack round-trip on a representative α=2 instance.
{
  const r = solveInverseQD(
    { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 3, im: 0 }] }] },
    { alpha: 2, w0: { re: 1, im: 0 } }
  );
  if (r.success) {
    const phi = r.primary.phi;
    const fam = QD_NS.Family.powerQD;
    const v = fam.packPhi(phi);
    const phi2 = fam.unpackPhi(v, phi);
    let maxDelta = 0;
    for (let j = 0; j < phi.branches.length; j++) {
      maxDelta = Math.max(maxDelta,
        Complex.abs(Complex.sub(phi.branches[j].z, phi2.branches[j].z)));
      for (let k = 0; k < phi.branches[j].A.length; k++) {
        maxDelta = Math.max(maxDelta,
          Complex.abs(Complex.sub(phi.branches[j].A[k], phi2.branches[j].A[k])));
      }
    }
    ok('powerQD: pack/unpack round-trip', maxDelta < 1e-14,
       'maxDelta=' + maxDelta.toExponential(2));
    ok('powerQD: unpack preserves alpha', phi2.alpha === phi.alpha,
       'got=' + phi2.alpha);
    ok('powerQD: unpack preserves family tag', phi2.family === 'powerQD',
       'got=' + phi2.family);
  } else {
    ok('powerQD: pack/unpack round-trip (skipped — solve failed)', false, r.error);
  }
}

// powerQD: α=2 sanity check that φ² ≈ R# on the boundary (the defining
// identity from Equation 4.8 of the thesis).
{
  const r = solveInverseQD(
    { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 3, im: 0 }] }] },
    { alpha: 2, w0: { re: 1, im: 0 } }
  );
  if (r.success) {
    const phi = r.primary.phi;
    const evalPhiPQD = QD_NS.Family.powerQD.evalPhi;
    const evalR      = QD_NS.evalRHash_PQD;
    let maxErr = 0;
    for (let k = 0; k < 20; k++) {
      const theta = 2 * Math.PI * k / 20;
      const z = { re: Math.cos(theta), im: Math.sin(theta) };
      const w = evalPhiPQD(z, phi);
      const wAlpha = Complex.mul(w, w);                    // w² since α=2
      const rval = evalR(z, phi);
      const e = Complex.abs(Complex.sub(wAlpha, rval));
      if (e > maxErr) maxErr = e;
    }
    ok('powerQD α=2: φ² ≈ R# on ∂𝔻', maxErr < 1e-10,
       'maxErr=' + maxErr.toExponential(2));
  } else {
    ok('powerQD α=2: φ² ≈ R# on ∂𝔻 (skipped — solve failed)', false, r.error);
  }
}


runFamilyBattery('boundedLQD', [
  { tag: '1-pt α=0.5 w₀=1',
    hData: { poles: [{ a: {re:1,im:0}, principal: [{re:0.5,im:0}] }] },
    opts: { lqd: true, w0: {re:1,im:0} }, identityTol: 1e-8,
    family: 'boundedLQD' },
]);

runFamilyBattery('boundedLQD_singular', [
  { tag: 'Thm 5.6.2 h=0.5/(w-2) w₀=1 q=0',
    hData: { poles: [{ a: {re:2,im:0}, principal: [{re:0.5,im:0}] }] },
    opts: { lqd: true, singular: true, w0: {re:1,im:0}, q: {re:0,im:0} },
    identityTol: 1e-8, family: 'boundedLQD_singular',
    insideTest: { point: {re:0,im:0}, expected: true, label: 'origin' } },
  { tag: 'q=0.5 same h, w₀=1',
    hData: { poles: [{ a: {re:2,im:0}, principal: [{re:0.5,im:0}] }] },
    opts: { lqd: true, singular: true, w0: {re:1,im:0}, q: {re:0.5,im:0} },
    identityTol: 1e-8, family: 'boundedLQD_singular',
    insideTest: { point: {re:0,im:0}, expected: true, label: 'origin' } },
]);

runFamilyBattery('unboundedLQD_singular', [
  { tag: '1-pt q=0 h=1/(w-2) c=0.6',
    hData: { poles: [{ a: {re:2,im:0}, principal: [{re:1,im:0}] }] },
    opts: { lqd: true, unbounded: true, singular: true, c: 0.6, q: {re:0,im:0} },
    identityTol: 1e-6, family: 'unboundedLQD_singular',
    // Origin ∈ Ω (singular) ⇒ NOT inside the K-bounding polygon
    insideTest: { point: {re:0,im:0}, expected: false, label: 'origin (∈ Ω)' } },
  { tag: '1-pt q=0.1 h=1/(w-2) c=0.6',
    hData: { poles: [{ a: {re:2,im:0}, principal: [{re:1,im:0}] }] },
    opts: { lqd: true, unbounded: true, singular: true, c: 0.6, q: {re:0.1,im:0} },
    identityTol: 1e-6, family: 'unboundedLQD_singular',
    insideTest: { point: {re:0,im:0}, expected: false, label: 'origin (∈ Ω)' } },
  { tag: '1-pt q=0.5 same h, c=0.6',
    hData: { poles: [{ a: {re:2,im:0}, principal: [{re:1,im:0}] }] },
    opts: { lqd: true, unbounded: true, singular: true, c: 0.6, q: {re:0.5,im:0} },
    identityTol: 1e-6, family: 'unboundedLQD_singular',
    insideTest: { point: {re:0,im:0}, expected: false, label: 'origin (∈ Ω)' } },
  { tag: '1-pt complex q=0.2+0.1i, c=0.6',
    hData: { poles: [{ a: {re:2,im:0}, principal: [{re:1,im:0}] }] },
    opts: { lqd: true, unbounded: true, singular: true, c: 0.6, q: {re:0.2,im:0.1} },
    identityTol: 1e-6, family: 'unboundedLQD_singular',
    insideTest: { point: {re:0,im:0}, expected: false, label: 'origin (∈ Ω)' } },
  { tag: '2-pt symmetric q=0.3, c=0.4',
    hData: { poles: [
      { a: {re: 2,   im:0}, principal: [{re:1,  im:0}] },
      { a: {re:-1.5, im:0}, principal: [{re:0.6,im:0}] },
    ] },
    opts: { lqd: true, unbounded: true, singular: true, c: 0.4, q: {re:0.3,im:0} },
    identityTol: 1e-6, family: 'unboundedLQD_singular',
    insideTest: { point: {re:0,im:0}, expected: false, label: 'origin (∈ Ω)' } },
]);

// Refusal tests: should fail gracefully.
{
  // h = q/w only (no finite poles, nonzero q): no solution exists.
  const r = solveInverseQD({ poles: [] }, {
    lqd: true, unbounded: true, singular: true, c: 0.5, q: {re:0.1, im:0},
  });
  ok('unboundedLQD_singular: h = q/w only is rejected',
     r.success === false && /no algebraic QD exists/.test(r.error || ''));
}
// (Higher-order pole at a = 0 in hData is now SUPPORTED via the synthetic-
// branch parametrization — HANDOFF #24. The dedicated battery for this case
// lives further down near the case (a) tests.)

runFamilyBattery('unboundedLQD', [
  { tag: 'trivial h=0 c=0.5  (Ω = ext. disk)',
    hData: { poles: [] },
    opts: { lqd: true, unbounded: true, c: 0.5 },
    identityTol: 1e-8, family: 'unboundedLQD',
    // For unbounded Ω, the boundary polygon traced by φ(e^{iθ}) is the
    // boundary of K (the bounded complement); points in K are inside that
    // polygon (ray-cast = true) and points in Ω are outside.
    insideTest: { point: {re:0,im:0}, expected: true, label: 'origin (∈ K)' } },
  { tag: '1-pt h=1/(w-2) c=0.6',
    hData: { poles: [{ a: {re:2,im:0}, principal: [{re:1,im:0}] }] },
    opts: { lqd: true, unbounded: true, c: 0.6 },
    identityTol: 1e-8, family: 'unboundedLQD',
    // For unbounded Ω, the boundary polygon traced by φ(e^{iθ}) is the
    // boundary of K (the bounded complement); points in K are inside that
    // polygon (ray-cast = true) and points in Ω are outside.
    insideTest: { point: {re:0,im:0}, expected: true, label: 'origin (∈ K)' } },
  { tag: '1-pt h=1/(w-2) c=0.3 (smaller c → bigger Ω)',
    hData: { poles: [{ a: {re:2,im:0}, principal: [{re:1,im:0}] }] },
    opts: { lqd: true, unbounded: true, c: 0.3 },
    identityTol: 1e-8, family: 'unboundedLQD',
    // For unbounded Ω, the boundary polygon traced by φ(e^{iθ}) is the
    // boundary of K (the bounded complement); points in K are inside that
    // polygon (ray-cast = true) and points in Ω are outside.
    insideTest: { point: {re:0,im:0}, expected: true, label: 'origin (∈ K)' } },
  { tag: '2-pt symmetric  c=0.4',
    hData: { poles: [
      { a: {re: 2,im:0}, principal: [{re:1,  im:0}] },
      { a: {re:-1.5,im:0}, principal: [{re:0.6,im:0}] },
    ] },
    opts: { lqd: true, unbounded: true, c: 0.4 },
    identityTol: 1e-8, family: 'unboundedLQD',
    // For unbounded Ω, the boundary polygon traced by φ(e^{iθ}) is the
    // boundary of K (the bounded complement); points in K are inside that
    // polygon (ray-cast = true) and points in Ω are outside.
    insideTest: { point: {re:0,im:0}, expected: true, label: 'origin (∈ K)' } },
]);

// Sanity: post-solve, r#(∞) should reflect the absorbed constant; φ at large
// |z| should behave as c·z to leading order (since the parametrization
// includes the −r#(∞) subtraction).
{
  const hData = { poles: [{ a: {re:2,im:0}, principal: [{re:1,im:0}] }] };
  const r = solveInverseQD(hData, { lqd: true, unbounded: true, c: 0.6 });
  if (r.success) {
    const Fam = QD_NS.Family.unboundedLQD;
    const phi = r.primary.phi;
    // φ(R) / (c · R) → 1 as R → ∞, with rate O(1/R) since r#(R) − r#(∞)
    // = O(1/R) for rational r#. Use R = 1e10 and tolerance 1e-8 for headroom.
    const R = 1e10;
    const wAtR = Fam.evalPhi({ re: R, im: 0 }, phi);
    const ratio = wAtR.re / (phi.c * R);
    ok('unboundedLQD: leading coefficient of φ at ∞ equals c',
       Math.abs(ratio - 1) < 1e-8,
       'φ(R)/(c·R) - 1 = ' + (ratio - 1).toExponential(2) + ' at R=' + R);
  } else {
    ok('unboundedLQD leading-coefficient test setup', false, 'solve failed');
  }
}

// QD.poleCentroid — the shared default-φ(0) helper (single source for what were three
// open-coded copies in ui.js buildW0 / solver-pqd / solver-lqd). Mean of the pole
// positions a_j; `fallback` (per-caller) when there are no poles.
{
  const h2 = { poles: [{ a: { re: 1, im: 2 } }, { a: { re: 3, im: -4 } }] };
  ok('poleCentroid: mean of pole positions', approxEq(QD.poleCentroid(h2), { re: 2, im: -1 }, 1e-12));
  ok('poleCentroid: no poles → provided fallback', approxEq(QD.poleCentroid({ poles: [] }, { re: 1, im: 0 }), { re: 1, im: 0 }, 1e-12));
  ok('poleCentroid: no poles + no fallback → origin', approxEq(QD.poleCentroid({ poles: [] }), { re: 0, im: 0 }, 1e-12));
  ok('poleCentroid: single pole → that pole', approxEq(QD.poleCentroid({ poles: [{ a: { re: -0.5, im: 0.25 } }] }), { re: -0.5, im: 0.25 }, 1e-12));
}

// QDS-5: the singular-LQD honesty gate INDEPENDENTLY checks the origin log-pole residue q. The identity
// test functions are residue-free at 0 (w^k·q/w and w/(w−b)^k·q/w have no residue there), so a wrong q
// used to read "✓ Valid"; verifyQuadratureIdentity now folds the (●₀) q-equation residual into maxRelDiff
// (fail-closed). Synthetic φ (structure only — no solve needed) with q set to its (●₀)-consistent value
// vs a perturbed q.
{
  const hData = { poles: [{ a: { re: 0.5, im: 0 }, principal: [{ re: 1.0, im: 0 }] }] };

  // Bounded: (●₀) q = ln|γ|² + r#(z0) + conj(r#(1/conj z0)) — the clean 3-term formula (matches the solve).
  {
    const famB = QD_NS.Family.boundedLQD_singular;
    const evalRHash = QD_NS.LqdCommon.evalRHash;
    const pB = { family: 'boundedLQD_singular', singular: true, lqd: true, w0: { re: 1, im: 0 },
      gamma: { re: 1.1, im: 0.15 }, z0: { re: 0.25, im: 0.1 }, q: { re: 0, im: 0 },
      branches: [{ z: { re: 0.2, im: -0.15 }, A: [{ re: 0.3, im: 0.05 }, { re: 0.02, im: -0.01 }] }] };
    const a2 = C.abs2(pB.z0);
    const rz = evalRHash(pB.z0, pB);
    const ri = C.conj(evalRHash(C.scale(pB.z0, 1 / a2), pB));
    const qOK = { re: rz.re + ri.re + Math.log(C.abs2(pB.gamma)), im: rz.im + ri.im };
    const vGood = famB.verifyQuadratureIdentity(Object.assign({}, pB, { q: qOK }), hData, { maxDegree: 3 });
    const vBad = famB.verifyQuadratureIdentity(Object.assign({}, pB, { q: { re: qOK.re + 0.1, im: qOK.im } }), hData, { maxDegree: 3 });
    ok('QDS-5 bounded: (●₀) q-check present in the honesty gate', vGood.checks.some((c) => c.q0 === true));
    ok('QDS-5 bounded: a (●₀)-consistent q passes the q-check', vGood.qRelDiff < 1e-9, 'qRelDiff=' + vGood.qRelDiff.toExponential(2));
    ok('QDS-5 bounded: a wrong q is caught (folded into maxRelDiff, fail-closed)',
       vBad.qRelDiff > 1e-2 && vBad.maxRelDiff >= vBad.qRelDiff, 'qRelDiff=' + vBad.qRelDiff.toExponential(2));
  }

  // Unbounded: (●₀) reused from residual_UQDLS (β/γ-corrected) at offset 2·nFinite + 2·ΣA.
  {
    const famU = QD_NS.Family.unboundedLQD_singular;
    const pU = { family: 'unboundedLQD_singular', unbounded: true, singular: true, lqd: true, c: 1.2,
      z0: { re: 1.5, im: 0.3 }, q: { re: 0, im: 0 }, lqdBeta: [],
      branches: [{ z: { re: 1.8, im: -0.2 }, A: [{ re: 0.3, im: 0.05 }] }] };
    const r0 = famU.residual(pU, hData, {});   // (●₀) at index 2·1 + 2·1 = 4
    const qOK = { re: pU.q.re - r0[4], im: pU.q.im - r0[5] };
    const vGood = famU.verifyQuadratureIdentity(Object.assign({}, pU, { q: qOK }), hData, { maxDegree: 4 });
    const vBad = famU.verifyQuadratureIdentity(Object.assign({}, pU, { q: { re: qOK.re + 0.1, im: qOK.im } }), hData, { maxDegree: 4 });
    ok('QDS-5 unbounded: (●₀) q-check present in the honesty gate', vGood.checks.some((c) => c.q0 === true));
    ok('QDS-5 unbounded: a (●₀)-consistent q passes the q-check', vGood.qRelDiff < 1e-9, 'qRelDiff=' + vGood.qRelDiff.toExponential(2));
    ok('QDS-5 unbounded: a wrong q is caught (folded into maxRelDiff, fail-closed)',
       vBad.qRelDiff > 1e-2 && vBad.maxRelDiff >= vBad.qRelDiff, 'qRelDiff=' + vBad.qRelDiff.toExponential(2));
  }
}

};
