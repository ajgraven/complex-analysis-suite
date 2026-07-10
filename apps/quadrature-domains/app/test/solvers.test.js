'use strict';
// solvers.test.js — subsystem tests split from the former monolithic node-test.js (Phase 2).
// Shared kernels + harness (ok, C, T, solveInverseQD, Schwarz, PS, SC, …) are
// installed on `global` by test/bootstrap.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP_DIR = path.join(__dirname, '..');
require('./bootstrap');
module.exports = async function run() {

// Complex parsing
ok('parse 1+2i', approxEq(C.parse('1+2i'), {re:1, im:2}));
ok('parse -1.5-2.5i', approxEq(C.parse('-1.5-2.5i'), {re:-1.5, im:-2.5}));

// Complex.cpow — real (possibly non-integer) power via principal branch (QA.1).
// Used by Family.powerQD for w₀^α, p^{1−α}, w^{α−1} with arbitrary real α.
{
  const z = { re: 0.7, im: -0.4 };
  ok('cpow(z,2) ≈ z·z', approxEq(C.cpow(z, 2), C.mul(z, z), 1e-12));
  ok('cpow(z,3) ≈ z³', approxEq(C.cpow(z, 3), C.mul(C.mul(z, z), z), 1e-12));
  ok('cpow(z,1) ≈ z', approxEq(C.cpow(z, 1), z, 1e-12));
  ok('cpow(z,0) ≈ 1', approxEq(C.cpow(z, 0), { re: 1, im: 0 }, 1e-12));
  ok('cpow(z,-1) ≈ 1/z', approxEq(C.cpow(z, -1), C.inv(z), 1e-12));
  // Half-power round-trip: cpow(z,0.5)² = z (principal branch, z in right half-plane).
  const sq = C.cpow(z, 0.5);
  ok('cpow(z,0.5)² ≈ z', approxEq(C.mul(sq, sq), z, 1e-12));
  // Non-integer round-trip: cpow(cpow(z,α),1/α) = z for z on principal sheet.
  const a = 1.5;
  ok('cpow(cpow(z,1.5),1/1.5) ≈ z',
     approxEq(C.cpow(C.cpow(z, a), 1 / a), z, 1e-12));
}

// Taylor inversion
{
  const p = [{re:0,im:0},{re:2,im:0},{re:3,im:0},{re:0,im:0},{re:0,im:0}];
  const q = T.invert(p, 4);
  // Verify by composition
  let comp = T.zero(5);
  let qPow = q.slice(0);
  for (let k = 1; k <= 4; k++) {
    if (k > 1) qPow = T.mul(qPow, q, 4);
    for (let i = 0; i <= 4; i++) comp[i] = C.add(comp[i], C.mul(p[k] || {re:0,im:0}, qPow[i]));
  }
  ok('p(q)[1]=1', approxEq(comp[1], {re:1,im:0}, 1e-10));
  ok('p(q)[2]=0', approxEq(comp[2], {re:0,im:0}, 1e-10));
  ok('p(q)[3]=0', approxEq(comp[3], {re:0,im:0}, 1e-10));
}

// Disk evaluation
{
  const R = 1.7, c = {re: 0.5, im: -0.3};
  const phi = { w0: c, branches: [{ z: {re:0,im:0}, A: [{re:R,im:0}] }] };
  for (let i = 0; i < 8; i++) {
    const th = i * Math.PI / 4;
    const w = evalPhi({re: Math.cos(th), im: Math.sin(th)}, phi);
    ok('|φ(e^{iθ}) - c|=R at '+(i*45)+'°', approxEq(C.abs(C.sub(w, c)), R, 1e-10));
  }
}

// Newton solve: disk
const verifyQuadratureIdentity = QD_NS.verifyQuadratureIdentity;     // moved to solver-qd.js
{
  const R = 1.4;
  const hData = { poles: [{ a: {re:0,im:0}, principal: [{re: R*R, im:0}] }] };
  const result = solveInverseQD(hData);
  ok('disk solve success', result.success, result.success ? '' : result.error);
  if (result.success) {
    ok('disk z=0', approxEq(result.primary.phi.branches[0].z, {re:0,im:0}, 1e-5));
    // A is determined only up to phase (rotational gauge of 𝔻 since the
    // Riemann-mapping normalization φ'(0) > 0 isn't enforced). Check |A| = R.
    ok('disk |A|=R', Math.abs(Complex.abs(result.primary.phi.branches[0].A[0]) - R) < 1e-5,
       '|A| = ' + Complex.abs(result.primary.phi.branches[0].A[0]).toFixed(6));
    ok('disk univalent', result.primary.univalent);

    // Verify the quadrature identity holds on monomials.
    const v = verifyQuadratureIdentity(result.primary.phi, hData, { maxDegree: 6 });
    ok('disk quadrature identity: max rel diff < 1e-10', v.maxRelDiff < 1e-10,
       'max=' + v.maxRelDiff.toExponential(3));
    // The disk-specific values: ∫_{|w|<R} w^k dA = R^{2(k+1)}/(k+1) for k=0, else 0
    //                            (modulo our normalization dA = dx dy / π and 1/(k+1) here)
    // Sanity-check k=0 -> R^2 = 1.96, k=1 -> 0.
    ok('disk k=0 ≈ R²',
       approxEq(v.checks[0].lhs, {re: R*R, im: 0}, 1e-8));
    ok('disk k=1 ≈ 0',
       Complex.abs(v.checks[1].lhs) < 1e-10);

    console.log('     iters=' + result.primary.iterations + ' resid=' + result.primary.residual.toExponential(3));
  }
}

// liveSolveStep — the off-main-thread live-drag core (one warm Newton +
// reduced-sample univalence/identity), shared by the live worker and its
// main-thread fallback. Warm-starting from a valid solved φ on the same hData
// must converge fast and report a valid QD; bad seeds must fail gracefully.
{
  const R = 1.4;
  const hData = { poles: [{ a: {re:0,im:0}, principal: [{re: R*R, im:0}] }] };
  const base = solveInverseQD(hData);
  if (base.success) {
    const seed = QD_NS.clonePhi(base.primary.phi);
    const live = QD_NS.liveSolveStep(hData, seed,
      { newton: { maxIter: 30 }, numSamples: 96, wantOriginInside: true });
    ok('liveSolveStep: warm-start succeeds', !!live && live.success === true,
       live ? (live.error || '') : 'no result');
    ok('liveSolveStep: reports univalent', !!live && live.univalent === true);
    ok('liveSolveStep: reports identityOK', !!live && live.identityOK === true);
    ok('liveSolveStep: warm-start converges in ≤5 iters', !!live && live.iterations <= 5,
       live ? ('iters=' + live.iterations) : 'no result');
    ok('liveSolveStep: wantOriginInside returns a boolean',
       !!live && typeof live.originInside === 'boolean');
  }
  // Guards: null / structurally-invalid seed return { success:false }, no throw.
  ok('liveSolveStep: null seed → failure (no throw)',
     QD_NS.liveSolveStep(hData, null, {}).success === false);
  ok('liveSolveStep: seed without family → failure (no throw)',
     QD_NS.liveSolveStep(hData, { branches: [] }, {}).success === false);
}

// 2-point QD
{
  const hData = { poles: [
    { a: {re:-0.5,im:0}, principal: [{re:1.0,im:0}] },
    { a: {re: 0.5,im:0}, principal: [{re:1.0,im:0}] },
  ]};
  const result = solveInverseQD(hData);
  ok('2-pt solve success', result.success, result.success ? '' : result.error);
  if (result.success) {
    const v = verifyQuadratureIdentity(result.primary.phi, hData, { maxDegree: 4 });
    ok('2-pt quadrature identity holds', v.maxRelDiff < 1e-10, 'maxRel=' + v.maxRelDiff.toExponential(3));
    console.log('     iters=' + result.primary.iterations +
                ' resid=' + result.primary.residual.toExponential(3) +
                ' univalent=' + result.primary.univalent +
                ' alternates=' + result.alternates.length +
                ' identity-maxRel=' + v.maxRelDiff.toExponential(2));
    const ph = result.primary.phi;
    console.log('     w0 =', C.toString(ph.w0));
    console.log('     z1 =', C.toString(ph.branches[0].z), ' A1 =', C.toString(ph.branches[0].A[0]));
    console.log('     z2 =', C.toString(ph.branches[1].z), ' A2 =', C.toString(ph.branches[1].A[0]));
  }
}

// Order-2 quadrature: h = 0.5/w + 0.2/w². With the corrected Schwarz reflection,
// neither direct nor multistart finds a valid simply-connected bounded QD here.
// This might genuinely have no simply-connected QD with these parameters, or
// the solver basin is unreachable. Either way, the failure should be graceful.
{
  const hData = { poles: [
    { a: {re:0,im:0}, principal: [{re:0.5,im:0},{re:0.2,im:0}] }
  ]};
  const result = solveInverseQD(hData);
  ok('order-2 fails gracefully (no valid QD found)',
     result.success === false || (result.success && !result.primary.identityOK),
     result.success ? ('univ=' + result.primary.univalent + ' idOK=' + result.primary.identityOK)
                    : result.error);
}

// 2-point asymmetric real residues -- valid QD, identity should hold
{
  const hData = { poles: [
    { a: {re:-0.5,im:0}, principal: [{re:1.0,im:0}] },
    { a: {re: 0.7,im:0}, principal: [{re:0.6,im:0}] },
  ]};
  const result = solveInverseQD(hData);
  ok('2-pt asymmetric solve success', result.success, result.success ? '' : result.error);
  if (result.success) {
    ok('2-pt asymmetric: identityOK', result.primary.identityOK === true,
       'maxRel=' + result.primary.identity.maxRelDiff.toExponential(3));
    console.log('     method=' + result.primary.method +
                ' resid=' + result.primary.residual.toExponential(3) +
                ' univalent=' + result.primary.univalent +
                ' identity-maxRel=' + result.primary.identity.maxRelDiff.toExponential(2));
  }
}

// y-symmetric 3-point: known to work
{
  const hData = { poles: [
    { a: {re:-1.0, im: 0.0}, principal: [{re: 1.5, im: 0}] },
    { a: {re: 0.5, im: 0.8}, principal: [{re: 1.0, im: 0}] },
    { a: {re: 0.5, im:-0.8}, principal: [{re: 1.0, im: 0}] },
  ]};
  const result = solveInverseQD(hData);
  ok('3-pt y-symmetric solve success', result.success, result.success ? '' : result.error);
  if (result.success) {
    ok('3-pt y-symmetric: identityOK', result.primary.identityOK === true,
       'maxRel=' + result.primary.identity.maxRelDiff.toExponential(3));
    console.log('     method=' + result.primary.method +
                ' resid=' + result.primary.residual.toExponential(3) +
                ' identity-maxRel=' + result.primary.identity.maxRelDiff.toExponential(2));
  }
}

// Previously-failing case: 3-pt asymmetric with real residues but complex
// pole locations. With the buggy Schwarz reflection this returned a non-QD
// spurious root; with the corrected math it now solves to a true QD at
// machine precision.
{
  const hData = { poles: [
    { a: {re:-0.6, im: 0.2}, principal: [{re: 0.8, im: 0}] },
    { a: {re: 0.4, im: 0.4}, principal: [{re: 0.5, im: 0}] },
    { a: {re: 0.1, im:-0.5}, principal: [{re: 0.4, im: 0}] },
  ]};
  const result = solveInverseQD(hData);
  ok('3-pt complex-poles real-residues: valid QD found',
     result.success && result.primary.identityOK,
     'maxRel=' + (result.primary?.identity?.maxRelDiff ?? 'n/a').toExponential?.(2));
}

// User-reported case: poles at 1, -1, -i with residue 2 each. Schwarz
// reflection had been wrong; with the fix this now solves to machine precision.
{
  const hData = { poles: [
    { a: {re: 1, im: 0}, principal: [{re:2,im:0}] },
    { a: {re:-1, im: 0}, principal: [{re:2,im:0}] },
    { a: {re: 0, im:-1}, principal: [{re:2,im:0}] },
  ]};
  const result = solveInverseQD(hData);
  ok('user case (1, -1, -i; residues 2): valid QD',
     result.success && result.primary.identityOK,
     'maxRel=' + (result.primary?.identity?.maxRelDiff ?? 'n/a').toExponential?.(2));
}

// Continuation runs on the 2-point case (force it, not as a fallback) and
// produces the same solution as direct.
{
  const continuationSolve = QD_NS.continuationSolve;    // moved to solver-qd.js
  const hData = { poles: [
    { a: {re:-0.5,im:0}, principal: [{re:1.0,im:0}] },
    { a: {re: 0.5,im:0}, principal: [{re:1.0,im:0}] },
  ]};
  const cont = continuationSolve(hData, {re:0,im:0});
  ok('continuation: 2-pt symmetric succeeds', cont.success, cont.success ? '' : cont.error);
  if (cont.success) {
    console.log('     trace length=' + cont.trace.length +
                ' final residual=' + cont.residual.toExponential(3));
  }
}

// Feasible 3-pt asymmetric with residues large enough that the QD comfortably
// contains the poles. Symmetric in y so we expect a y-symmetric solution.
{
  const hData = { poles: [
    { a: {re:-1.0, im: 0.0}, principal: [{re: 1.5, im: 0}] },
    { a: {re: 0.5, im: 0.8}, principal: [{re: 1.0, im: 0}] },
    { a: {re: 0.5, im:-0.8}, principal: [{re: 1.0, im: 0}] },
  ]};
  const result = solveInverseQD(hData);
  ok('3-pt spread solve success', result.success, result.success ? '' : result.error);
  if (result.success) {
    console.log('     method=' + result.primary.method +
                ' iters=' + result.primary.iterations +
                ' resid=' + result.primary.residual.toExponential(3) +
                ' univalent=' + result.primary.univalent +
                ' alternates=' + result.alternates.length);
  }
}

// Infeasible case (poles too far for the given residues): we expect failure,
// but the solver should fail GRACEFULLY -- not throw, and return a useful
// error message.
{
  const hData = { poles: [
    { a: {re:-3.0, im:0}, principal: [{re: 0.3, im: 0}] },
    { a: {re: 3.0, im:0}, principal: [{re: 0.3, im: 0}] },
  ]};
  const result = solveInverseQD(hData);
  ok('infeasible case fails gracefully', result.success === false && typeof result.error === 'string',
     result.success ? 'unexpectedly succeeded' : result.error);
}

// =====================================================================
// Pass 2: unbounded with polynomial part of h
// =====================================================================

// h = 0 (no poly, no finite): exterior of disk D_c(0). Riemann map φ(z) = cz.
{
  for (const c of [0.5, 1.0, 2.0]) {
    const hData = { poles: [], polyPart: [] };
    const r = solveInverseQD(hData, { unbounded: true, c });
    ok('unb h=0 (c='+c+') solve success', r.success, r.success ? '' : r.error);
    if (r.success) {
      // Boundary |φ(e^{iθ}) - 0| should = c exactly.
      const ph = r.primary.phi;
      let maxErr = 0;
      for (let i = 0; i < 16; i++) {
        const t = 2 * Math.PI * i / 16;
        const z = { re: Math.cos(t), im: Math.sin(t) };
        const w = vm.runInContext('evalPhi', ctx)(z, ph);
        const e = Math.abs(Complex.abs(w) - c);
        if (e > maxErr) maxErr = e;
      }
      ok('unb h=0 (c='+c+') |φ| = c on circle', maxErr < 1e-12,
         'maxErr=' + maxErr.toExponential(2));
    }
  }
}

// h = real constant (shifted disk).
{
  const hData = { poles: [], polyPart: [{re:0.5, im:0}] };
  const r = solveInverseQD(hData, { unbounded: true, c: 1.0, identityTol: 1e-8 });
  ok('unb h=0.5 (real constant) solve success', r.success);
  if (r.success) {
    ok('unb h=0.5 (real constant) identityOK', r.primary.identityOK,
       'maxRel=' + r.primary.identity.maxRelDiff.toExponential(2));
  }
}

// h = complex constant (shifted disk at conj(C_{∞,0})). Tests the conj-on-C
// fix in computeTargetF.
{
  const hData = { poles: [], polyPart: [{re:0.3, im:0.4}] };
  const r = solveInverseQD(hData, { unbounded: true, c: 1.0, identityTol: 1e-8 });
  ok('unb h=0.3+0.4i (complex const) solve success', r.success);
  if (r.success) {
    ok('unb h=0.3+0.4i (complex const) identityOK', r.primary.identityOK,
       'maxRel=' + r.primary.identity.maxRelDiff.toExponential(2));
    // F_0 should be conj(C_{∞,0}) = 0.3 − 0.4i (center of K).
    const F0 = r.primary.phi.polyA[0];
    ok('unb h=0.3+0.4i: F_0 ≈ conj(C_{∞,0})',
       Math.abs(F0.re - 0.3) < 1e-8 && Math.abs(F0.im - (-0.4)) < 1e-8,
       'F_0 = ' + Complex.toString(F0, 6));
  }
}

// h = w + α/(w − w_0) mixed (poly + finite pole).
{
  const hData = {
    poles: [{ a: {re:2, im:0}, principal: [{re:1, im:0}] }],
    polyPart: [{re:0,im:0}, {re:0.5,im:0}],
  };
  const r = solveInverseQD(hData, { unbounded: true, c: 0.6 });
  ok('unb mixed (w + α/(w-w0)) solve success', r.success);
  if (r.success) {
    ok('unb mixed identityOK', r.primary.identityOK,
       'maxRel=' + r.primary.identity.maxRelDiff.toExponential(2));
    // The polyA should have 2 entries (F_0, F_1).
    ok('unb mixed polyA has 2 entries', r.primary.phi.polyA.length === 2);
  }
}

// Backward compat: omitting polyPart should match polyPart=[] explicitly.
{
  const hA = { poles: [{ a: {re:2,im:0}, principal: [{re:1,im:0}] }] };
  const hB = { poles: [{ a: {re:2,im:0}, principal: [{re:1,im:0}] }], polyPart: [] };
  const rA = solveInverseQD(hA, { unbounded: true, c: 0.6 });
  const rB = solveInverseQD(hB, { unbounded: true, c: 0.6 });
  ok('polyPart absent vs polyPart=[]: both succeed', rA.success && rB.success);
  if (rA.success && rB.success) {
    const dz = Complex.abs(Complex.sub(rA.primary.phi.branches[0].z, rB.primary.phi.branches[0].z));
    ok('polyPart absent vs polyPart=[]: same z_1', dz < 1e-10);
  }
}

// ===========================================================================
// LQD tests — bounded non-singular log-weighted quadrature domains
// ---------------------------------------------------------------------------
// Validates Family.boundedLQD against closed-form examples from Chapter V
// (Theorem 5.3.2: one-point bounded non-singular LQDs).
// ===========================================================================
{
  // Taylor.exp sanity (already smoke-tested but make it a formal test)
  const T = Taylor;
  let p = T.zero(5); p[1] = {re:1, im:0};
  let q = T.exp(p, 4);
  const expected = [1, 1, 0.5, 1/6, 1/24];
  let err = 0;
  for (let i = 0; i <= 4; i++) err = Math.max(err, Math.abs(q[i].re - expected[i]), Math.abs(q[i].im));
  ok('Taylor.exp(t) matches 1+t+t²/2+...', err < 1e-14, 'maxErr=' + err.toExponential(2));

  // Multiplicative property: exp(p)·exp(-p) = 1
  p = T.zero(6); p[1] = {re:0.3,im:0.2}; p[2] = {re:0.1,im:-0.4}; p[3] = {re:-0.2,im:0.1};
  q = T.exp(p, 5);
  const pNeg = p.map(c => ({re:-c.re, im:-c.im}));
  const qInv = T.exp(pNeg, 5);
  const prod = T.mul(q, qInv, 5);
  let mulErr = Math.abs(prod[0].re - 1) + Math.abs(prod[0].im);
  for (let i = 1; i <= 5; i++) mulErr = Math.max(mulErr, Math.abs(prod[i].re) + Math.abs(prod[i].im));
  ok('Taylor.exp(p)·exp(-p) = 1', mulErr < 1e-14, 'maxErr=' + mulErr.toExponential(2));
}

// Taylor.log: round-trip log(exp(p)) = p for p with p_0 = 0.
{
  const T = Taylor;
  // log(1 + t) = t − t²/2 + t³/3 − t⁴/4 + ...
  const p = T.zero(6); p[0] = {re:1,im:0}; p[1] = {re:1,im:0};
  const q = T.log(p, 5);
  const expected = [0, 1, -1/2, 1/3, -1/4, 1/5];
  let err = 0;
  for (let i = 0; i <= 5; i++) err = Math.max(err, Math.abs(q[i].re - expected[i]), Math.abs(q[i].im));
  ok('Taylor.log(1+t) matches t-t²/2+t³/3-...', err < 1e-14, 'maxErr=' + err.toExponential(2));

  // Round-trip: log(exp(p)) = p for p with arbitrary p_0.
  const p2 = T.zero(6);
  p2[0] = {re:0.3,im:-0.2}; p2[1] = {re:0.5,im:0.1}; p2[2] = {re:-0.2,im:0.3}; p2[3] = {re:0.1,im:-0.05};
  const expP = T.exp(p2, 5);
  const logExpP = T.log(expP, 5);
  let rtErr = 0;
  for (let i = 0; i <= 5; i++) rtErr = Math.max(rtErr, Math.abs(logExpP[i].re - p2[i].re), Math.abs(logExpP[i].im - p2[i].im));
  ok('Taylor.log(Taylor.exp(p)) = p (round-trip)', rtErr < 1e-13, 'maxErr=' + rtErr.toExponential(2));

  // Round-trip: exp(log(p)) = p for p with p_0 ≠ 0.
  const p3 = T.zero(5);
  p3[0] = {re:1.5,im:0.4}; p3[1] = {re:0.6,im:-0.3}; p3[2] = {re:0.2,im:0.1};
  const logP = T.log(p3, 4);
  const expLogP = T.exp(logP, 4);
  let rt2Err = 0;
  for (let i = 0; i <= 4; i++) rt2Err = Math.max(rt2Err, Math.abs(expLogP[i].re - p3[i].re), Math.abs(expLogP[i].im - p3[i].im));
  ok('Taylor.exp(Taylor.log(p)) = p (round-trip)', rt2Err < 1e-13, 'maxErr=' + rt2Err.toExponential(2));
}

// Theorem 5.3.2: one-point bounded non-singular LQD has φ(z) = w₀·exp(z√α)
// for 0 < α ≤ π². Verify identity and closed form agree at machine precision.
{
  const cases = [
    { alpha: 0.3, w0_re: 1, w0_im: 0 },
    { alpha: 1.0, w0_re: 1, w0_im: 0 },
    { alpha: 2.0, w0_re: 1, w0_im: 0 },
    { alpha: 0.5, w0_re: 2, w0_im: 0 },        // shifted
    { alpha: 0.4, w0_re: 0, w0_im: 1 },        // pure imaginary w₀
    { alpha: 0.5, w0_re: 1, w0_im: 1 },        // generic complex w₀
  ];
  for (const cs of cases) {
    const w0 = { re: cs.w0_re, im: cs.w0_im };
    const hData = { poles: [{ a: w0, principal: [{re: cs.alpha, im: 0}] }] };
    const r = solveInverseQD(hData, { lqd: true, w0 });
    const tag = 'LQD 1-pt α=' + cs.alpha + ' w₀=' + cs.w0_re + (cs.w0_im >= 0 ? '+' : '') + cs.w0_im + 'i';
    ok(tag + ': solve success', r.success);
    if (r.success) {
      ok(tag + ': identityOK', r.primary.identityOK,
        'maxRel=' + r.primary.identity.maxRelDiff.toExponential(2));
      ok(tag + ': univalent', r.primary.univalent);

      // Compare to closed form: φ(z) = w₀·exp(z√α) at z=0.5.
      const sqrtA = Math.sqrt(cs.alpha);
      const expected_re_factor = Math.exp(0.5 * sqrtA);
      const expected = { re: w0.re * expected_re_factor, im: w0.im * expected_re_factor };
      const family = vm.runInContext('Family.boundedLQD', ctx);
      const phi05 = family.evalPhi({re:0.5, im:0}, r.primary.phi);
      const diff = Math.hypot(phi05.re - expected.re, phi05.im - expected.im);
      ok(tag + ': φ(0.5) matches closed-form', diff < 1e-10, 'diff=' + diff.toExponential(2));
    }
  }
}

// (Critical-α non-univalence test omitted: per Theorem 5.3.2, α > π² admits
// no bounded simply-connected LQD, but the algebraic system is still
// solvable — φ(z) = w₀·exp(z√α) satisfies (●) and (★) for any α. Detecting
// the resulting self-intersection in the discrete `isBoundaryUnivalent`
// boundary-segment check is a known pre-existing limitation that affects
// all modes equally; it's not specific to LQDs and addressing it belongs
// in a separate validation pass. The α=2 test above confirms that valid
// LQDs at moderate α are correctly flagged univalent.)

// Three-point equilateral with real residues, around w₀=3
{
  const r3 = 0.5;
  const hData = { poles: [
    { a: {re: 3 + r3, im: 0}, principal: [{re:0.2, im:0}] },
    { a: {re: 3 - r3/2, im:  r3*Math.sqrt(3)/2}, principal: [{re:0.2, im:0}] },
    { a: {re: 3 - r3/2, im: -r3*Math.sqrt(3)/2}, principal: [{re:0.2, im:0}] },
  ]};
  const r = solveInverseQD(hData, { lqd: true, w0: {re:3, im:0} });
  ok('LQD 3-pt equilateral around w₀=3: solve success', r.success);
  if (r.success) {
    ok('LQD 3-pt equilateral: identityOK', r.primary.identityOK,
      'maxRel=' + r.primary.identity.maxRelDiff.toExponential(2));
    ok('LQD 3-pt equilateral: univalent', r.primary.univalent);
  }
}

// Conj-bug sentinel: locator residual must be zero for complex w₀. If any
// conjugation in r#(z_j) = ln(a_j/w₀) is wrong, φ(z_j) won't equal a_j.
{
  const w0 = { re: 1.2, im: 0.7 };
  const hData = { poles: [{ a: w0, principal: [{re: 0.3, im: 0}] }] };
  const r = solveInverseQD(hData, { lqd: true, w0 });
  if (r.success) {
    const family = vm.runInContext('Family.boundedLQD', ctx);
    const zj = r.primary.phi.branches[0].z;
    const phiZj = family.evalPhi(zj, r.primary.phi);
    const locErr = Math.hypot(phiZj.re - w0.re, phiZj.im - w0.im);
    ok('LQD conj-bug sentinel: locator residual ~ 0', locErr < 1e-10,
      'locErr=' + locErr.toExponential(2));
  } else {
    ok('LQD conj-bug sentinel: solve succeeds', false, 'solve failed: ' + r.error);
  }
}

// Family dispatch: solver-lqd.js patches QD.selectFamily (the export), not
// the bare `selectFamily` global from solver.js. Use the export.
{
  const QD = vm.runInContext('module.exports', ctx);
  ok('QD.selectFamily({}) → boundedQD',
    QD.selectFamily({}).name === 'boundedQD');
  ok('QD.selectFamily({unbounded:true}) → unboundedQD',
    QD.selectFamily({unbounded: true}).name === 'unboundedQD');
  ok('QD.selectFamily({lqd:true}) → boundedLQD',
    QD.selectFamily({lqd: true}).name === 'boundedLQD');
  ok('Family.boundedLQD registered', typeof QD.Family.boundedLQD === 'object');
  // Singular-LQD dispatch must take precedence over non-singular when both
  // lqd and singular flags are set.
  ok('QD.selectFamily({lqd, singular}) → boundedLQD_singular',
    QD.selectFamily({ lqd: true, singular: true }).name === 'boundedLQD_singular');
  ok('Family.boundedLQD_singular registered',
    typeof QD.Family.boundedLQD_singular === 'object');
}

// ===========================================================================
// Singular LQD tests
// ---------------------------------------------------------------------------
// Bounded LQDs with 0 ∈ Ω. Riemann map  φ(z) = γ · b_{z_0}(z) · exp(r#(z))
// where b_{z_0}(z) = -(conj(z_0)/|z_0|)·(z-z_0)/(1-conj(z_0)z), z_0 ∈ 𝔻 \ {0}.
//
// Identity:  ∫_Ω f/|w|² dA = ∮_∂Ω f h dw  for f ∈ L¹_a(Ω; ρ₀) (forces f(0)=0),
// and h ∈ Rat(Ω) is allowed an extra simple pole at 0 with residue q ∈ ℂ
// (user input).
// ===========================================================================
{
  const Singular = vm.runInContext('module.exports', ctx).Family.boundedLQD_singular;

  // (a) q-equation residual sanity at hand-constructed config.
  //   z_0=0.5, γ=2, no finite poles. r#(z_0)=0=r(z_0), so q-eq predicts
  //   q = ln|γ|² = ln 4. With q=ln 4, all 5 residual entries must be 0.
  {
    const phi = {
      family: 'boundedLQD_singular',
      w0: { re: 1, im: 0 }, q: { re: Math.log(4), im: 0 },
      z0: { re: 0.5, im: 0 }, gamma: { re: 2, im: 0 },
      branches: [],
    };
    const r = Singular.residual(phi, { poles: [] });
    let maxAbs = 0;
    for (const v of r) maxAbs = Math.max(maxAbs, Math.abs(v));
    ok('LQD-singular q-eq closed-form residual ≈ 0', maxAbs < 1e-14,
       'maxAbs=' + maxAbs.toExponential(2));
  }

  // (b) End-to-end solve for q = 0.1, one finite pole.
  {
    const hData = { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 0.5, im: 0 }] }] };
    const r = solveInverseQD(hData, {
      lqd: true, singular: true,
      w0: { re: 1, im: 0 }, q: { re: 0.1, im: 0 }, identityTol: 1e-8,
    });
    ok('LQD-singular 1-pt q=0.1 solves', r.success, r.success ? '' : r.error);
    if (r.success) {
      ok('LQD-singular 1-pt q=0.1 univalent', r.primary.univalent);
      ok('LQD-singular 1-pt q=0.1 identityOK', r.primary.identityOK,
         'maxRel=' + r.primary.identity.maxRelDiff.toExponential(2));
      ok('LQD-singular phi has family tag', r.primary.phi.family === 'boundedLQD_singular');
      ok('LQD-singular phi has z_0 inside 𝔻 and ≠ 0',
         Complex.abs(r.primary.phi.z0) > 1e-3 && Complex.abs(r.primary.phi.z0) < 1);
      // φ(z_0) ≈ 0
      const phiAt0 = Singular.evalPhi(r.primary.phi.z0, r.primary.phi);
      ok('LQD-singular φ(z_0) ≈ 0', Complex.abs(phiAt0) < 1e-9,
         '|φ(z_0)| = ' + Complex.abs(phiAt0).toExponential(2));
      // φ(0) ≈ w_0
      const phiAt0w = Singular.evalPhi({ re: 0, im: 0 }, r.primary.phi);
      ok('LQD-singular φ(0) ≈ w_0',
         Complex.abs(Complex.sub(phiAt0w, { re: 1, im: 0 })) < 1e-9,
         '|φ(0) - w_0| = ' + Complex.abs(Complex.sub(phiAt0w, { re: 1, im: 0 })).toExponential(2));
    }
  }

  // (c) q sweep (real-q family parameterized by q ∈ ℝ) — Theorem 5.6.2 style.
  // The user's "q-slider family": fix (h, w_0), dial q and verify each solve.
  // (Complex-q with real h-data is a known solver-basin limitation: the
  // gauge Im(φ'(0)) = 0 + φ(0) = w_0 ∈ ℝ pulls z_0 toward the real axis,
  // which makes Im(q) hard to achieve. Future work.)
  {
    const hData = { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 0.5, im: 0 }] }] };
    let allOK = true;
    let lastDetail = '';
    for (const qReal of [0, 0.05, 0.1, 0.2, 0.3]) {
      const r = solveInverseQD(hData, {
        lqd: true, singular: true,
        w0: { re: 1, im: 0 }, q: { re: qReal, im: 0 }, identityTol: 1e-6,
      });
      if (!r.success || !r.primary.identityOK) { allOK = false; lastDetail = 'q=' + qReal + ': ' + (r.error || 'identity fail'); break; }
      lastDetail = 'q=' + qReal + ' OK';
    }
    ok('LQD-singular q-sweep [0, 0.05, 0.1, 0.2, 0.3] all solve + identityOK',
       allOK, lastDetail);
  }

  // (c2) sampleBoundaryAdaptive regression: must produce no duplicate points
  // and no out-of-order theta values. (Pre-existing index-update bug: e.j
  // got incremented mid-iteration via aliasing, corrupting subsequent edges'
  // comparisons. Visible on LQD-singular boundaries with spike-shaped
  // refinement; made the rendered polygon misorder and visually exclude the
  // origin from a domain that actually contains it.)
  {
    const sampleAdaptive = vm.runInContext('sampleBoundaryAdaptive', ctx);
    const hData = { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 0.5, im: 0 }] }] };
    const r = solveInverseQD(hData, {
      lqd: true, singular: true,
      w0: { re: 1, im: 0 }, q: { re: 0, im: 0 },
    });
    if (r.success) {
      const boundary = sampleAdaptive(r.primary.phi, 500, 750);
      let dup = 0, ooo = 0;
      for (let i = 1; i < boundary.length; i++) {
        const dx = boundary[i].w.re - boundary[i-1].w.re;
        const dy = boundary[i].w.im - boundary[i-1].w.im;
        if (Math.hypot(dx, dy) < 1e-12) dup++;
        if (boundary[i].theta < boundary[i-1].theta) ooo++;
      }
      ok('sampleBoundaryAdaptive: no duplicate points (singular LQD)',  dup === 0, 'duplicates=' + dup);
      ok('sampleBoundaryAdaptive: theta strictly increasing',           ooo === 0, 'out-of-order=' + ooo);
      // Ray-cast origin-inside check: confirms the rendered polygon
      // (what Canvas would fill via evenodd) correctly contains origin.
      const pts = boundary.map(b => b.w);
      let cross = 0;
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        if ((pts[i].im > 0) !== (pts[j].im > 0)) {
          const t = -pts[i].im / (pts[j].im - pts[i].im);
          if (pts[i].re + t * (pts[j].re - pts[i].re) > 0) cross++;
        }
      }
      ok('Singular-LQD adaptive polygon: origin inside rendered fill', (cross % 2) === 1);
    } else {
      ok('sampleBoundaryAdaptive regression: solve succeeded', false, 'solve failed');
    }
  }

  // (d) phiTaylorAt vs finite-difference sanity.
  {
    const phi = {
      family: 'boundedLQD_singular',
      w0: { re: 1, im: 0 }, q: { re: 0, im: 0 },
      z0: { re: 0.3, im: -0.2 }, gamma: { re: 1.5, im: 0.1 },
      branches: [
        { z: { re: 0.4, im: 0.2 }, A: [{ re: 0.3, im: -0.1 }] },
      ],
    };
    const zc = { re: 0.1, im: 0.15 };
    const taylor = Singular.phiTaylorAt(zc, phi, 2);
    // Finite-difference φ' at zc
    const eps = 1e-6;
    const fzPlus  = Singular.evalPhi({ re: zc.re + eps, im: zc.im }, phi);
    const fzMinus = Singular.evalPhi({ re: zc.re - eps, im: zc.im }, phi);
    const fdRe = (fzPlus.re - fzMinus.re) / (2 * eps);
    const fdIm = (fzPlus.im - fzMinus.im) / (2 * eps);
    const err = Math.hypot(taylor[1].re - fdRe, taylor[1].im - fdIm);
    ok('LQD-singular phiTaylorAt[1] ≈ finite-diff φ\'', err < 1e-7,
       'err=' + err.toExponential(2));
  }

  // (e) z_0 ≈ 0 rejection / safety: solve attempt where bootstrap would push
  // z_0 toward 0. We clamp inside unpackPhi at |z_0| ≥ 1e-3, so even if the
  // solve doesn't converge it should not produce NaN.
  {
    // Configure: w_0 large so the bootstrap z_0 might tend toward something
    // small. Just check that we don't crash and return a graceful result.
    const hData = { poles: [{ a: { re: 5, im: 0 }, principal: [{ re: 0.1, im: 0 }] }] };
    let threw = false;
    try {
      solveInverseQD(hData, {
        lqd: true, singular: true,
        w0: { re: 4.9, im: 0 }, q: { re: 0, im: 0 },
      });
    } catch (e) { threw = true; }
    ok('LQD-singular extreme-w0 does not throw', !threw);
  }
}

// =============================================================================
// Per-family standard battery (declarative regression sweep, R8)
// -----------------------------------------------------------------------------
// Demonstrates the runFamilyBattery helper. Adding the upcoming unbounded LQD
// families = adding presets here, no per-test boilerplate.
// =============================================================================

runFamilyBattery('boundedQD', [
  { tag: 'disk h=R²/w (R=1.4)',
    hData: { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1.96, im: 0 }] }] },
    opts: {}, identityTol: 1e-8, family: undefined },
  { tag: '2-pt symmetric',
    hData: { poles: [
      { a: {re:-0.5,im:0}, principal: [{re:1.0,im:0}] },
      { a: {re: 0.5,im:0}, principal: [{re:1.0,im:0}] },
    ]}, opts: {}, identityTol: 1e-6 },
]);

runFamilyBattery('unboundedQD', [
  { tag: 'one-pt h=1/(w-2) c=0.6',
    hData: { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 1, im: 0 }] }] },
    opts: { unbounded: true, c: 0.6 }, identityTol: 1e-6 },
]);

// ---------------------------------------------------------------------------
// Q1: bounded power-weighted QDs (Family.powerQD, α ≥ 2).
//
// Thesis reference: Theorem 4.3.2 / Corollary 4.3.1. The parametrization is
//   φ(ξ) = (R#(ξ))^{1/α},     R# matches the existing boundedQD form
// with r0 = R(0) = w₀^α and w₀ = φ(0) user-supplied.
//
// Round-trip and α = 1 dispatch tests follow the family battery.
// ---------------------------------------------------------------------------
// Realizability constraint for bounded PQDs (single pole, m=1): the
// closed-form solution z_1 = (p^α − w_0^α)/(α·√(|C_{1,1}·p_1^{1-α}|))
// has |z_1| < 1 only when C is sufficiently large. The α=2, p=2,
// w_0=1 floor is C > 2.25.
//
// TODO (Q1.2 follow-up): α ≥ 3 single-pole presets require continuous
// αth-root branch-tracking in the boundary sampler + identity verifier.
// Currently phiTaylorAt_PQD uses Taylor.log's principal branch at each
// sample point, which discontinuously flips sheets when R#(z) on ∂𝔻
// winds around 0 (typical for α ≥ 3 non-trivial PQDs). Newton converges
// correctly, but the boundary samples land on inconsistent sheets.
runFamilyBattery('powerQD', [
  { tag: 'one-pt α=2 h=3/(w-2) w₀=1',
    hData: { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 3, im: 0 }] }] },
    opts: { alpha: 2, w0: { re: 1, im: 0 } },
    identityTol: 1e-5, family: 'powerQD' },
  // 2nd-order pole — Q1.2 exercises the higher-order (★) formula
  // β_{j,k} = α · inverseFaberAtPole(D_{j,·}, phiTilde)[k] with
  // D_{j,n} = Σ_m C(1-α, m) · p_j^{1-α-m} · C_{j,n+m} (modified
  // residues from h(w)·w^{1-α} principal-part expansion).
  { tag: 'one-pt α=2 m=2 h=0.5/(w-1.2)+0.05/(w-1.2)² w₀=1',
    hData: { poles: [{ a: { re: 1.2, im: 0 },
                       principal: [{ re: 0.5, im: 0 }, { re: 0.05, im: 0 }] }] },
    opts: { alpha: 2, w0: { re: 1, im: 0 } },
    identityTol: 1e-10, family: 'powerQD' },

  // QA: arbitrary (non-integer) α. The (★) closed form is α-general (the
  // generalized binomial C(1−α, m) handles any real α); all power ops route
  // through Complex.cpow. α ∈ (0,1) is the LQD-limit regime (weight
  // |w|^{2(α-1)} singular at 0, but 0 ∉ Ω̄ so the integral is fine).
  { tag: 'one-pt α=1.5 h=3/(w-2) w₀=1',
    hData: { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 3, im: 0 }] }] },
    opts: { alpha: 1.5, w0: { re: 1, im: 0 } },
    identityTol: 1e-6, family: 'powerQD' },
  { tag: 'one-pt α=0.5 h=3/(w-2) w₀=1 (LQD-limit regime)',
    hData: { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 3, im: 0 }] }] },
    opts: { alpha: 0.5, w0: { re: 1, im: 0 } },
    identityTol: 1e-6, family: 'powerQD' },
  { tag: 'one-pt α=0.5 h=2/(w-1.5) w₀=1',
    hData: { poles: [{ a: { re: 1.5, im: 0 }, principal: [{ re: 2, im: 0 }] }] },
    opts: { alpha: 0.5, w0: { re: 1, im: 0 } },
    identityTol: 1e-6, family: 'powerQD' },

  // §20 far-pole robustness: w₀ OMITTED ⇒ the classical-QD bootstrap picks an
  // interior w₀, and the residue-strength homotopy (scaleHDataResidues) drives
  // Newton from the near-disk (small residue) to full strength. h=3/(w-3) α=2
  // FAILED before §20 (the old pole-location continuation was vacuous when the
  // single pole sat at the centroid w₀, and the seed z₁=0 was degenerate).
  { tag: 'one-pt α=2 h=3/(w-3) (w₀ auto, §20)',
    hData: { poles: [{ a: { re: 3, im: 0 }, principal: [{ re: 3, im: 0 }] }] },
    opts: { alpha: 2 },
    identityTol: 1e-5, family: 'powerQD' },
  { tag: 'one-pt α=2 h=5/(w-4) (w₀ auto, §20)',
    hData: { poles: [{ a: { re: 4, im: 0 }, principal: [{ re: 5, im: 0 }] }] },
    opts: { alpha: 2 },
    identityTol: 1e-5, family: 'powerQD' },
  { tag: 'one-pt α=1.5 h=3/(w-3) (w₀ auto, non-integer, §20)',
    hData: { poles: [{ a: { re: 3, im: 0 }, principal: [{ re: 3, im: 0 }] }] },
    opts: { alpha: 1.5 },
    identityTol: 1e-5, family: 'powerQD' },
]);

// §20: scaleHDataResidues homotopy primitive + the reference-case path.
{
  const hData = { poles: [
    { a: { re: 3, im: 0 }, principal: [{ re: 3, im: 0 }, { re: 1, im: 0 }] },
  ], polyPart: [{ re: 2, im: 0 }] };
  const scaled = QD_NS.scaleHDataResidues(hData, 0.25);
  ok('scaleHDataResidues: residues scaled by s',
     Math.abs(scaled.poles[0].principal[0].re - 0.75) < 1e-15 &&
     Math.abs(scaled.poles[0].principal[1].re - 0.25) < 1e-15);
  ok('scaleHDataResidues: pole location preserved',
     scaled.poles[0].a.re === 3 && scaled.poles[0].a.im === 0);
  ok('scaleHDataResidues: polyPart scaled', Math.abs(scaled.polyPart[0].re - 0.5) < 1e-15);

  // The reference failure solves AND comes through the continuation path.
  const r = QD_NS.solveInverseQD(
    { poles: [{ a: { re: 3, im: 0 }, principal: [{ re: 3, im: 0 }] }] },
    { alpha: 2 });
  ok('§20 powerQD h=3/(w-3) α=2: solves with auto w₀', r.success, r.success ? '' : r.error);
  if (r.success) {
    ok('§20 powerQD h=3/(w-3): univalent', r.primary.univalent);
    // Solved via a CHEAP path (direct seed or residue-homotopy continuation),
    // not the exhaustive diverse/deflation fallback — the auto-w₀ + homotopy
    // put the solve in-basin early.
    const cheap = r.attempts && r.attempts.some(
      a => (a.method === 'direct' || a.method === 'continuation') && a.success);
    ok('§20 powerQD h=3/(w-3): solved via a cheap path (direct/continuation)', cheap,
       'methods=' + (r.attempts || []).map(a => a.method + (a.success ? '✓' : '✗')).join(','));
  }

  // Fix 1 directly: the residue-strength homotopy converges to a full-strength
  // (s=1) solution for the reference case (independent of the direct path).
  {
    const fam = QD_NS.Family.powerQD;
    const hRef = { poles: [{ a: { re: 3, im: 0 }, principal: [{ re: 3, im: 0 }] }] };
    const cont = fam.continuationSolve(hRef, { w0: { re: 3, im: 0 }, alpha: 2 }, {});
    ok('§20 continuationSolve_PQD (residue homotopy): success', cont.success,
       cont.success ? '' : cont.error);
    if (cont.success) {
      const resid = QD_NS.residualNorm(QD_NS.residual(cont.phi, hRef, {}));
      ok('§20 residue-homotopy result satisfies the full (s=1) system', resid < 1e-8,
         'residual=' + resid.toExponential(2));
    }
  }

  // User-supplied w₀ that violates realizability ⇒ clear early error.
  const bad = QD_NS.solveInverseQD(
    { poles: [{ a: { re: 3, im: 0 }, principal: [{ re: 3, im: 0 }] }] },
    { alpha: 2, w0: { re: 1, im: 0 } });
  ok('§20 powerQD: unrealizable w₀=1 reports a clear error',
     !bad.success && /realizability/.test(bad.error || ''),
     'error=' + (bad.error || '(none)'));
}

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

// §PR: bounded-PQD REALIZABILITY DIAGNOSTIC (α-homotopy fold tracer,
// QD.diagnosePQDRealizability). A bounded-PQD failure is usually genuine
// NON-REALIZABILITY: with fixed quadrature data the univalent solution branch
// folds as α grows (the |w|^{2(α−1)} weight shrinks the realizable region), so
// "classically (α=1) solvable" does NOT imply the target-α PQD exists. The
// tracer seeds at α≈1, marches α to the target, and reports the fold. (A
// separate exhaustive sweep confirmed there is NO multi-pole convergence bug —
// the cold solver finds every realizable bounded PQD — so this is diagnostic,
// not a solver fix.)
{
  const PI = Math.PI;
  const sym = (cx, off, C) => ({ poles: [
    { a: { re: cx, im:  off }, principal: [{ re: C, im: 0 }] },
    { a: { re: cx, im: -off }, principal: [{ re: C, im: 0 }] },
  ] });
  const triFold = () => ({ poles: [0, 1, 2].map((k) => {
    const th = PI / 2 + 2 * PI * k / 3;
    return { a: { re: 2 + 0.5 * Math.cos(th), im: 0.5 * Math.sin(th) }, principal: [{ re: 0.6, im: 0 }] };
  }) });

  // (1) Non-realizable two-pole: branch folds well below α=2.
  const d1 = QD_NS.diagnosePQDRealizability(sym(3, 0.6, 0.4), { alpha: 2, w0: { re: 3, im: 0 } });
  ok('§PR non-realizable 3±0.6i C=0.4 @α=2: reason=fold-below-target',
     d1.reason === 'fold-below-target' && d1.realizable === false, 'reason=' + d1.reason);
  ok('§PR non-realizable: fold αMax ≈ 1.05', d1.alphaMax > 1.0 && d1.alphaMax < 1.2,
     'αMax=' + d1.alphaMax.toFixed(3));

  // (2) Realizable two-pole: reaches α=2 with a univalent, identity-verified map.
  const h2 = sym(2, 0.3, 1.0);
  const d2 = QD_NS.diagnosePQDRealizability(h2, { alpha: 2, w0: { re: 2, im: 0 } });
  ok('§PR realizable 2±0.3i C=1 @α=2: realizable + univalent phi',
     d2.realizable === true && d2.reason === 'realizable' && d2.phi &&
     QD_NS.isBoundaryUnivalent(d2.phi), 'reason=' + d2.reason + ' αMax=' + d2.alphaMax.toFixed(3));
  if (d2.phi) {
    const idv = QD_NS.Family.powerQD.verifyQuadratureIdentity(d2.phi, h2, {});
    ok('§PR realizable: returned phi verifies the quadrature identity < 1e-6',
       idv.maxRelDiff < 1e-6, 'id=' + idv.maxRelDiff.toExponential(1));
  }

  // (3) Three-pole equilateral cluster that folds before α=2.
  const d3 = QD_NS.diagnosePQDRealizability(triFold(), { alpha: 2, w0: { re: 2, im: 0 } });
  ok('§PR 3-pole triangle @α=2: fold-below-target with 1.5 < αMax < 2',
     d3.reason === 'fold-below-target' && d3.alphaMax > 1.5 && d3.alphaMax < 2.0,
     'reason=' + d3.reason + ' αMax=' + d3.alphaMax.toFixed(3));

  // (4) Data that is not a valid QD even classically (far poles, tiny residue):
  //     the α≈1 seed solve itself fails ⇒ invalid-even-classical.
  const d4 = QD_NS.diagnosePQDRealizability(sym(2, 1.0, 0.1), { alpha: 2, w0: { re: 2, im: 0 } });
  ok('§PR non-QD data @α=2: reason=invalid-even-classical',
     d4.reason === 'invalid-even-classical' && d4.realizable === false, 'reason=' + d4.reason);

  // (5) Independent corroboration of the fold (no tracer reuse): the COLD solver
  //     succeeds just BELOW the reported fold and fails just ABOVE it.
  {
    const base = () => sym(3, 0.6, 0.4);
    const below = QD_NS.solveInverseQD(base(), { alpha: Math.max(1.01, d1.alphaMax - 0.05), w0: { re: 3, im: 0 } });
    const above = QD_NS.solveInverseQD(base(), { alpha: d1.alphaMax + 0.15, w0: { re: 3, im: 0 } });
    ok('§PR fold corroborated: cold solves below αMax, fails above',
       below.success === true && above.success === false,
       'below=' + below.success + ' above=' + above.success);
  }

  // (6) α=1 short-circuits to "realizable" (classical case — nothing to trace).
  const d6 = QD_NS.diagnosePQDRealizability(sym(2, 0.3, 1.0), { alpha: 1, w0: { re: 2, im: 0 } });
  ok('§PR α=1 short-circuits to realizable (classical)',
     d6.realizable === true && d6.reason === 'realizable');
}

// §21: normFromPhi — reseed/alt-search reconstructs the dispatch-complete norm
// from the solved phi. The OLD reseed dropped alpha/lqd/singular/q and misrouted
// every non-classical family to boundedQD. Round-trip check: for a phi of each
// of the 10 families, normFromPhi(phi) must re-select THAT family.
{
  const F = QD_NS.Family;
  const C0 = { re: 1.5, im: 0 }, Cq = { re: 0.2, im: 0.1 };
  const cases = [
    { tag: 'boundedQD',             phi: { family: 'boundedQD',             w0: C0 } },
    { tag: 'unboundedQD',           phi: { family: 'unboundedQD',           unbounded: true, c: 0.8 } },
    { tag: 'boundedLQD',            phi: { family: 'boundedLQD',            w0: C0 } },
    { tag: 'boundedLQD_singular',   phi: { family: 'boundedLQD_singular',   w0: C0, q: Cq } },
    { tag: 'unboundedLQD',          phi: { family: 'unboundedLQD',          unbounded: true, c: 0.8 } },
    { tag: 'unboundedLQD_singular', phi: { family: 'unboundedLQD_singular', unbounded: true, c: 0.8, q: Cq } },
    { tag: 'powerQD',               phi: { family: 'powerQD',               alpha: 2,   w0: C0 } },
    { tag: 'powerQD_singular',      phi: { family: 'powerQD_singular',      alpha: 2,   w0: C0 } },
    { tag: 'unboundedPQD',          phi: { family: 'unboundedPQD',          alpha: 2,   unbounded: true, c: 0.8 } },
    { tag: 'unboundedPQD_singular', phi: { family: 'unboundedPQD_singular', alpha: 1.5, unbounded: true, c: 0.8 } },
  ];
  for (const { tag, phi } of cases) {
    const norm = QD_NS.normFromPhi(phi);
    const fam = QD_NS.selectFamily(norm);
    ok('§21 normFromPhi routes ' + tag + ' correctly', fam === F[tag],
       'got ' + (fam && Object.keys(F).find(k => F[k] === fam)) + ' — norm=' + JSON.stringify(norm));
  }
  ok('§21 normFromPhi(null) === null', QD_NS.normFromPhi(null) === null);
  // Value fields survive (seeds read these).
  const np = QD_NS.normFromPhi({ family: 'powerQD', alpha: 2, w0: { re: 3, im: 0 } });
  ok('§21 normFromPhi carries alpha + w0', np.alpha === 2 && np.w0.re === 3);
  const nq = QD_NS.normFromPhi({ family: 'unboundedLQD_singular', unbounded: true, c: 0.7, q: { re: 0.5, im: 0 } });
  ok('§21 normFromPhi carries c + q', nq.c === 0.7 && nq.q.re === 0.5);

  // End-to-end: a real powerQD solve → reseed norm → searchAlternates routes to
  // powerQD (NOT boundedQD), so reseed actually searches the right family.
  const r = QD_NS.solveInverseQD(
    { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 3, im: 0 }] }] },
    { alpha: 2, w0: { re: 1, im: 0 } });
  if (r.success) {
    const reseedNorm = QD_NS.normFromPhi(r.primary.phi);
    ok('§21 reseed norm for solved powerQD selects powerQD',
       QD_NS.selectFamily(reseedNorm) === F.powerQD);
    const alts = QD_NS.searchAlternates(
      { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 3, im: 0 }] }] },
      reseedNorm, [r.primary], { numRestarts: 4, seed: 0x51111 });
    ok('§21 searchAlternates on reseed norm stays in powerQD',
       alts.every(a => a.phi && a.phi.family === 'powerQD'),
       'families=' + alts.map(a => a.phi && a.phi.family).join(','));
  } else {
    ok('§21 reseed routing (skipped — powerQD solve failed)', false, r.error);
  }
}

// §22: curvature-aware (deviation/sagitta) adaptive boundary sampling. The old
// length-vs-mean criterion left localized high-curvature features (e.g. a PQD
// boundary swinging in toward the origin, where |φ'| spikes) under-sampled.
// The shared refiner concentrates points where the curve bends and bounds the
// worst chord gap, for every family.
{
  const TWO_PI = 2 * Math.PI;
  const getW = (p) => (p && p.w) ? p.w : p;                 // adaptive {theta,w} vs uniform {re,im}
  const maxEdge = (arr) => {                                // worst consecutive gap (closed loop)
    let m = 0;
    for (let i = 0; i < arr.length; i++) {
      const a = getW(arr[i]), b = getW(arr[(i + 1) % arr.length]);
      m = Math.max(m, Math.hypot(b.re - a.re, b.im - a.im));
    }
    return m;
  };

  // (a) Synthetic curve with a LOCALIZED sharp feature: a near-circular ring
  // with a narrow radial spike at θ=π. Given the same total budget, the
  // deviation refiner must (i) concentrate points in the spike and (ii) bound
  // the worst gap well below a uniform sampler.
  const spike = (t) => 1 + 0.8 * Math.exp(-Math.pow((t - Math.PI) / 0.12, 2));
  const wOf   = (t) => ({ re: spike(t) * Math.cos(t), im: spike(t) * Math.sin(t) });
  const coarse = [];
  for (let i = 0; i < 64; i++) { const t = TWO_PI * i / 64; coarse.push({ theta: t, w: wOf(t) }); }
  coarse.push({ theta: TWO_PI, w: wOf(0) });
  const refined = QD_NS.refineBoundaryByDeviation(coarse, (t) => ({ theta: t, w: wOf(t) }), { maxPoints: 4000 });
  ok('§22 refiner densifies a localized sharp feature', refined.length > 64);
  // Same-budget uniform sampling of the same curve.
  const uni = [];
  for (let i = 0; i < refined.length; i++) { const t = TWO_PI * i / refined.length; uni.push({ theta: t, w: wOf(t) }); }
  const inSpike = (arr) => arr.reduce((n, p) => n + (Math.abs(p.theta - Math.PI) < 0.3 ? 1 : 0), 0);
  ok('§22 refiner concentrates points in the sharp feature (vs uniform same-N)',
     inSpike(refined) > 1.5 * inSpike(uni),
     'refined=' + inSpike(refined) + ' uniform=' + inSpike(uni) + ' N=' + refined.length);
  ok('§22 refiner bounds worst gap below uniform (same N)',
     maxEdge(refined) < 0.7 * maxEdge(uni),
     'refinedMax=' + maxEdge(refined).toExponential(2) + ' uniformMax=' + maxEdge(uni).toExponential(2));
  ok('§22 refiner respects maxPoints', refined.length <= 4000);
  // A perfectly straight (zero-sagitta) curve is left untouched.
  const line = [{ theta: 0, w: { re: 0, im: 0 } }, { theta: Math.PI, w: { re: 1, im: 0 } }, { theta: TWO_PI, w: { re: 2, im: 0 } }];
  const lineOut = QD_NS.refineBoundaryByDeviation(line, (t) => ({ theta: t, w: { re: t / Math.PI, im: 0 } }), { maxPoints: 500 });
  ok('§22 refiner leaves a straight curve unrefined', lineOut.length === line.length - 1);

  // (b) Integration across families: from a deliberately COARSE base grid the
  // family samplers refine (length > base), bound the worst gap below uniform,
  // stay an ordered ring with no duplicates, and respect the budget. Covers a
  // bounded PQD and an unbounded PQD (the latter had NO refinement before §22).
  const famCases = [
    { tag: 'powerQD',      hData: { poles: [{ a: { re: 3, im: 0 }, principal: [{ re: 3, im: 0 }] }] }, opts: { alpha: 2 } },
    { tag: 'unboundedPQD', hData: { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 1, im: 0 }] }] }, opts: { unbounded: true, alpha: 2, c: 0.6 } },
  ];
  for (const fc of famCases) {
    const rr = QD_NS.solveInverseQD(fc.hData, fc.opts);
    if (!rr.success) { ok('§22 ' + fc.tag + ' setup (skipped)', false, rr.error); continue; }
    const base = 32, extra = 4000;
    const ad = QD_NS.sampleBoundaryAdaptive(rr.primary.phi, base, extra);
    // (No max-edge-vs-uniform assertion here: these domains are smooth/near-
    // circular, where evenly-spaced uniform is already near-optimal for the
    // worst gap. The curvature/gap win is proven on the synthetic localized
    // feature above; here we just confirm the family samplers engage + stay
    // valid.)
    ok('§22 ' + fc.tag + ': refines a coarse base grid', ad.length > base, 'len=' + ad.length);
    ok('§22 ' + fc.tag + ': budget respected', ad.length <= base + extra);
    let inc = true, dup = 0;
    for (let i = 1; i < ad.length; i++) {
      if (ad[i].theta <= ad[i - 1].theta) inc = false;
      if (Math.hypot(ad[i].w.re - ad[i - 1].w.re, ad[i].w.im - ad[i - 1].w.im) < 1e-12) dup++;
    }
    ok('§22 ' + fc.tag + ': theta strictly increasing', inc);
    ok('§22 ' + fc.tag + ': no duplicate points', dup === 0);
  }
}

// QB: SINGULAR bounded PQDs (Family.powerQD_singular, 0 ∈ Ω). φ = b_{z₀}·(R#)^{1/α}.
// The mass/area constraint (M) — the f=1 case of the quadrature identity —
// closes the otherwise 1-DOF-underdetermined system (it pins |z₀|; the
// hardwired R#(0)=w₀^α/|z₀|^α makes φ(0)=w₀ vacuous, so it cannot). With (M)
// the Newton system is full-rank and the weighted identity holds to machine
// precision. insideTest: the origin must be INSIDE Ω (that is what "singular"
// means). The canonical example h=(63/32)/(w-1), α=2, w₀=1 lands at z₀ = 2/3.
runFamilyBattery('powerQD_singular', [
  { tag: 'one-pt α=2 h=(63/32)/(w-1) w₀=1 (z₀=2/3)',
    hData: { poles: [{ a: { re: 1, im: 0 }, principal: [{ re: 63 / 32, im: 0 }] }] },
    opts: { alpha: 2, singular: true, w0: { re: 1, im: 0 } },
    identityTol: 1e-8, family: 'powerQD_singular',
    insideTest: { point: { re: 0, im: 0 }, expected: true, label: 'origin (0 ∈ Ω)' } },
  { tag: 'one-pt α=2 h=3/(w-1.2) w₀=1.1',
    hData: { poles: [{ a: { re: 1.2, im: 0 }, principal: [{ re: 3, im: 0 }] }] },
    opts: { alpha: 2, singular: true, w0: { re: 1.1, im: 0 } },
    identityTol: 1e-8, family: 'powerQD_singular',
    insideTest: { point: { re: 0, im: 0 }, expected: true, label: 'origin (0 ∈ Ω)' } },
  { tag: 'one-pt α=1.5 h=2.2/(w-1) w₀=1 (non-integer α)',
    hData: { poles: [{ a: { re: 1, im: 0 }, principal: [{ re: 2.2, im: 0 }] }] },
    opts: { alpha: 1.5, singular: true, w0: { re: 1, im: 0 } },
    identityTol: 1e-8, family: 'powerQD_singular',
    insideTest: { point: { re: 0, im: 0 }, expected: true, label: 'origin (0 ∈ Ω)' } },
]);

// QB: the canonical example converges to z₀ = 2/3 (origin-preimage), and the
// |z₀|-closing (M) constraint makes the result independent of the seed.
{
  const r = solveInverseQD(
    { poles: [{ a: { re: 1, im: 0 }, principal: [{ re: 63 / 32, im: 0 }] }] },
    { alpha: 2, singular: true, w0: { re: 1, im: 0 } }
  );
  // |z₀| = 2/3 is pinned by (M); the sign of z₀ is a Z/2 gauge choice
  // (z → −z) fixed by canonicalizePhi's φ'(0) > 0, so check the magnitude.
  ok('powerQD_singular: canonical example |z₀| ≈ 2/3',
     r.success && Math.abs(Math.abs(r.primary.phi.z0.re) - 2 / 3) < 1e-6 &&
     Math.abs(r.primary.phi.z0.im) < 1e-6,
     r.success ? 'z₀=' + r.primary.phi.z0.re.toFixed(6) : r.error);
  ok('powerQD_singular: α=2 routes to singular family (not powerQD)',
     r.success && r.primary.phi.family === 'powerQD_singular',
     'family=' + (r.primary?.phi?.family || '<none>'));
  // clonePhi must preserve alpha + z0 (HANDOFF #26-class field-drop guard).
  if (r.success) {
    const cl = QD_NS.clonePhi(r.primary.phi);
    ok('powerQD_singular: clonePhi preserves alpha', cl.alpha === r.primary.phi.alpha,
       'alpha=' + cl.alpha);
    ok('powerQD_singular: clonePhi preserves z0',
       cl.z0 && Math.abs(cl.z0.re - r.primary.phi.z0.re) < 1e-15 &&
       Math.abs(cl.z0.im - r.primary.phi.z0.im) < 1e-15);
  }
}

// ---------------------------------------------------------------------------
// §CONT: continuationSolve for the three PQD families that previously stubbed
// it (powerQD_singular, unboundedPQD, unboundedPQD_singular). The homotopy is
// continuation in α from the classical limit (QD.PqdCommon.continuationInAlpha):
// residue-/c-homotopies degenerate here (singular → 0 leaves Ω; unbounded → the
// small-c seed blows up). Each case: (a) family.continuationSolve reaches the
// target via method 'continuation-in-alpha'; (b) a continuation-ONLY solve
// (all other phases off) finds the SAME valid, univalent QD; (c) it matches the
// full multistart solve. Plus a degenerate-but-safe (no throw / no recursion).
{
  const CONT_ONLY = { usePhases: { direct: false, continuation: true, multistart: false, diverse: false, deflation: false } };
  const contCases = [
    { name: 'powerQD_singular',      hData: { poles: [{ a: { re: 1, im: 0 }, principal: [{ re: 63 / 32, im: 0 }] }] }, opts: { alpha: 2, singular: true, w0: { re: 1, im: 0 } }, family: 'powerQD_singular' },
    { name: 'unboundedPQD',          hData: { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 1, im: 0 }] }] },        opts: { unbounded: true, alpha: 2, c: 2 },                 family: 'unboundedPQD' },
    { name: 'unboundedPQD_singular', hData: { poles: [], polyPart: [{ re: 1, im: 0 }] },                               opts: { unbounded: true, singular: true, alpha: 2, c: 1 }, family: 'unboundedPQD_singular' },
  ];
  for (const c of contCases) {
    const fam = QD_NS.selectFamily(c.opts);
    const norm = fam.normalizeOpts(c.opts, c.hData);
    // (a) direct continuationSolve reaches the target via the α-homotopy.
    const cs = fam.continuationSolve(c.hData, norm, { newton: { maxIter: 80, tolerance: 1e-10 } });
    ok('§CONT ' + c.name + ': continuationSolve succeeds via α-homotopy',
       cs.success && cs.method === 'continuation-in-alpha' && cs.residual < 1e-7 && cs.phi.family === c.family,
       cs.success ? ('method=' + cs.method + ' resid=' + (cs.residual != null ? cs.residual.toExponential(2) : '-') + ' fam=' + cs.phi.family) : cs.error);
    // (b) continuation-ONLY full solve finds a valid, univalent QD of this family.
    const ro = solveInverseQD(c.hData, Object.assign({}, c.opts, CONT_ONLY));
    ok('§CONT ' + c.name + ': continuation-only solve is valid + univalent',
       ro.success && ro.primary.univalent && ro.primary.phi.family === c.family,
       ro.success ? ('univ=' + ro.primary.univalent + ' fam=' + ro.primary.phi.family) : ro.error);
    // (c) matches the full multistart solve (same domain — sorted |z_j|).
    const rFull = solveInverseQD(c.hData, c.opts);
    if (ro.success && rFull.success && ro.primary.phi.branches.length) {
      const za = ro.primary.phi.branches.map(b => Math.hypot(b.z.re, b.z.im)).sort((x, y) => x - y);
      const zb = rFull.primary.phi.branches.map(b => Math.hypot(b.z.re, b.z.im)).sort((x, y) => x - y);
      const d = Math.max.apply(null, za.map((v, i) => Math.abs(v - (zb[i] || 0))));
      ok('§CONT ' + c.name + ': continuation matches multistart (|z_j|)', d < 1e-5, 'maxΔ=' + d.toExponential(2));
    } else {
      ok('§CONT ' + c.name + ': continuation matches multistart (poly-only)', ro.success && rFull.success);
    }
  }
  // Degenerate-but-safe: continuation on a non-realizable config must NOT throw
  // or infinite-recurse (the α≈1 seed solve disables its own continuation), and
  // must return a result object so the pipeline can fall through to multistart.
  let threw = false, res = null;
  try {
    res = solveInverseQD({ poles: [{ a: { re: 0.3, im: 0 }, principal: [{ re: 5, im: 0 }] }] },
                         Object.assign({ alpha: 2, singular: true, w0: { re: 1, im: 0 } }, CONT_ONLY));
  } catch (e) { threw = true; }
  ok('§CONT degenerate case: no throw / no recursion, returns a result',
     !threw && res && typeof res.success === 'boolean');
}

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
