'use strict';
// cusps.test.js — subsystem tests split from the former monolithic node-test.js (Phase 2).
// Shared kernels + harness (ok, C, T, solveInverseQD, Schwarz, PS, SC, …) are
// installed on `global` by test/bootstrap.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP_DIR = path.join(__dirname, '..');
require('./bootstrap');
module.exports = async function run() {
// Boundary cusp detection + (p,q)-type classification (QD.classifyCusps)
// -----------------------------------------------------------------------------
// Oracles are constructed φ's (no solve needed) whose φ′-zeros and cusp types
// are known in closed form:
//   • φ(z)=R·z            → φ′=R, no zeros            → no cusps.
//   • φ(z)=R(z+z²/2)      → φ′=R(1+z), simple zero z=-1 (on ∂𝔻) → one (2,3)
//                           ordinary cusp at θ=180°. (The cardioid.)
//   • φ(z)=R(z+z⁴/4)      → φ′=R(1+z³), three simple zeros at the cube roots of
//                           -1, all on ∂𝔻 → three (2,3) cusps at 60/180/300°.
//   • φ(z)=R(z+z²+z³/3)   → φ′=R(1+z)², DOUBLE zero z=-1 → one (3,4) cusp, m=2.
//   • φ(z)=R(z+0.48 z²)   → φ′=R(1+0.96z), zero z=-1/0.96 (|z|≈1.042, OFF ∂𝔻)
//                           → an INCIPIENT cusp: isCusp=false, dist≈0.042, the
//                           numerical leading exponent is ≈1 (boundary still
//                           smooth) while the Taylor type is the limiting (2,3).
// =============================================================================
{
  const classifyCusps = QD_NS.classifyCusps;
  ok('Cusps: namespace export', typeof classifyCusps === 'function' &&
     typeof QD_NS.Cusps === 'object');

  const mkBounded = (A) => ({
    family: 'boundedQD', w0: { re: 0, im: 0 }, unbounded: false,
    branches: [{ z: { re: 0, im: 0 }, A }],
  });
  const R = 1.0;

  // Disk: no critical points → no cusps.
  {
    const r = classifyCusps(mkBounded([{ re: R, im: 0 }]));
    ok('Cusps: disk has no cusps  — got ' + r.cusps.length, r.cusps.length === 0);
  }

  // Cardioid: one ordinary (2,3) cusp at θ≈180°, m=1, on the boundary.
  {
    const r = classifyCusps(mkBounded([{ re: R, im: 0 }, { re: R / 2, im: 0 }]));
    ok('Cusps: cardioid → exactly one cusp  — got ' + r.cusps.length, r.cusps.length === 1);
    const c = r.cusps[0] || {};
    ok('Cusps: cardioid cusp order m=1', c.orderM === 1);
    ok('Cusps: cardioid cusp type (2,3)', c.type && c.type[0] === 2 && c.type[1] === 3);
    ok('Cusps: cardioid cusp at θ≈180°', Math.abs(Math.abs(c.thetaDeg) - 180) < 1.0);
    ok('Cusps: cardioid is an actual cusp (on ∂𝔻)', c.isCusp === true && Math.abs(c.dist) < 1e-3);
    ok('Cusps: cardioid numerical leading exponent ≈ 2',
       c.numeric && Math.abs(c.numeric.pLeading - 2) < 0.25,
       'pLeading=' + (c.numeric && c.numeric.pLeading));
  }

  // Deltoid-like: three (2,3) cusps (Z₃-symmetric), all on the boundary.
  {
    const r = classifyCusps(mkBounded(
      [{ re: R, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, { re: R / 4, im: 0 }]));
    ok('Cusps: z+z⁴/4 → exactly three cusps  — got ' + r.cusps.length, r.cusps.length === 3);
    const allOrdinary = r.cusps.every(c => c.orderM === 1 && c.type[0] === 2 && c.type[1] === 3);
    ok('Cusps: all three are ordinary (2,3) cusps', allOrdinary);
  }

  // Higher-order: a double zero of φ′ → one (3,4) cusp (m=2), deduped from the
  // cluster of near-roots a multiple root produces.
  {
    const r = classifyCusps(mkBounded([{ re: R, im: 0 }, { re: R, im: 0 }, { re: R / 3, im: 0 }]));
    ok('Cusps: z+z²+z³/3 → exactly one cusp (deduped)  — got ' + r.cusps.length, r.cusps.length === 1);
    const c = r.cusps[0] || {};
    ok('Cusps: higher-order cusp order m=2', c.orderM === 2);
    ok('Cusps: higher-order cusp type (3,4)', c.type && c.type[0] === 3 && c.type[1] === 4);
    ok('Cusps: higher-order numerical leading exponent ≈ 3',
       c.numeric && Math.abs(c.numeric.pLeading - 3) < 0.3,
       'pLeading=' + (c.numeric && c.numeric.pLeading));
  }

  // Incipient (near) cusp: φ′-zero just OUTSIDE 𝔻 → reported with proximity but
  // isCusp=false; numerical leading exponent ≈ 1 (boundary still smooth).
  {
    const r = classifyCusps(mkBounded([{ re: R, im: 0 }, { re: 0.48 * R, im: 0 }]));
    ok('Cusps: near-cusp reported  — got ' + r.cusps.length, r.cusps.length === 1);
    const c = r.cusps[0] || {};
    ok('Cusps: near-cusp not flagged as actual (isCusp=false)', c.isCusp === false);
    ok('Cusps: near-cusp proximity d≈0.042', Math.abs(c.dist - 0.0417) < 5e-3,
       'dist=' + (c.dist && c.dist.toFixed(4)));
    ok('Cusps: near-cusp incipient type (2,3)', c.type && c.type[0] === 2 && c.type[1] === 3);
    ok('Cusps: near-cusp numerical leading exponent ≈ 1 (still smooth)',
       c.numeric && Math.abs(c.numeric.pLeading - 1) < 0.25,
       'pLeading=' + (c.numeric && c.numeric.pLeading));
  }

  // Robustness: null phi → empty, no throw.
  {
    const r = classifyCusps(null);
    ok('Cusps: null phi → empty result', r && r.cusps.length === 0);
  }
}

// =============================================================================
// Householder QR tests
// -----------------------------------------------------------------------------
// Validates the QR-backed solveLinearSystem / solveLeastSquares (P1.2).
// Covers: identity, sign-flip, square solve, overdetermined least-squares,
// ill-conditioned matrices, singular detection, residual orthogonality.
// =============================================================================
{
  const solveLinearSystem = QD_NS.solveLinearSystem;
  const solveLeastSquares = QD_NS.solveLeastSquares;
  const houseQR           = QD_NS.houseQR;

  function vecMaxErr(a, b) {
    let m = 0;
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > m) m = d; }
    return m;
  }

  ok('houseQR: exported', typeof houseQR === 'function');

  // 1) Identity system
  {
    const A = [[1,0,0],[0,1,0],[0,0,1]];
    const b = [3, -2, 7];
    const x = solveLinearSystem(A, b);
    ok('houseQR: identity solve', vecMaxErr(x, b) < 1e-12,
       'maxErr=' + vecMaxErr(x, b).toExponential(2));
  }

  // 2) Negative diagonal → exercises the sign-flip path that originally broke
  // the LQD-singular tests.
  {
    const A = [[-3, 1, 0],
               [ 4, -2, 1],
               [ 0,  1, -5]];
    const xExpected = [1, -1, 2];
    const b = A.map(row => row[0]*xExpected[0] + row[1]*xExpected[1] + row[2]*xExpected[2]);
    const x = solveLinearSystem(A, b);
    ok('houseQR: negative-diagonal solve', vecMaxErr(x, xExpected) < 1e-12,
       'maxErr=' + vecMaxErr(x, xExpected).toExponential(2));
  }

  // 3) 5×3 overdetermined LS — direct QR should beat normal-equations
  //    accuracy on ill-conditioned tall systems.
  {
    const A = [
      [ 1,  1,  1],
      [ 1,  2,  4],
      [ 1,  3,  9],
      [ 1,  4, 16],
      [ 1,  5, 25],
    ];
    const xExpected = [0.5, -1.2, 0.3];
    const b = A.map(row => row[0]*xExpected[0] + row[1]*xExpected[1] + row[2]*xExpected[2]);
    const x = solveLeastSquares(A, b);
    ok('houseQR: 5×3 LS exact-fit', vecMaxErr(x, xExpected) < 1e-10,
       'maxErr=' + vecMaxErr(x, xExpected).toExponential(2));
    // Q^T b residual: trailing entries should equal the LS residual (≈0 here).
    const qr = houseQR(A);
    const Qtb = qr.applyQt(b);
    let trailing2 = 0;
    for (let i = 3; i < 5; i++) trailing2 += Qtb[i] * Qtb[i];
    ok('houseQR: 5×3 LS residual ≈0 on exact fit', Math.sqrt(trailing2) < 1e-10,
       'trailing||=' + Math.sqrt(trailing2).toExponential(2));
  }

  // 4) Hilbert-ish matrix — moderately ill-conditioned. Direct QR should
  // hold accuracy; normal-equations would lose ~half the digits.
  {
    const n = 4;
    const A = Array.from({length: n}, (_, i) =>
      Array.from({length: n}, (_, j) => 1 / (i + j + 1)));
    const xExpected = [1, -1, 1, -1];
    const b = A.map(row => row.reduce((s, v, j) => s + v * xExpected[j], 0));
    const x = solveLinearSystem(A, b);
    ok('houseQR: Hilbert-4 solve accuracy', vecMaxErr(x, xExpected) < 1e-7,
       'maxErr=' + vecMaxErr(x, xExpected).toExponential(2));
  }

  // 5) Singular matrix → backSolve must throw.
  {
    const A = [[1, 2, 3],
               [2, 4, 6],     // 2× row 0
               [1, 1, 1]];
    let threw = false;
    try { solveLinearSystem(A, [1, 2, 3]); } catch (e) { threw = /singular/i.test(e.message); }
    ok('houseQR: singular system throws', threw);
  }

  // 5b) C5 — iterative refinement on ill-conditioned systems. Hilbert-6
  // (cond ≈ 1.5e7) should solve more accurately after C5 kicks in.
  {
    const n = 6;
    const A = Array.from({length: n}, (_, i) =>
      Array.from({length: n}, (_, j) => 1 / (i + j + 1)));
    const xExpected = [1, -1, 1, -1, 1, -1];
    const b = A.map(row => row.reduce((s, v, j) => s + v * xExpected[j], 0));
    const x = solveLinearSystem(A, b);
    const err = vecMaxErr(x, xExpected);
    // Without refinement Hilbert-6 typically gives err ~ 1e-9 to 1e-8;
    // with refinement it should reach ~1e-12 or better.
    ok('houseQR: Hilbert-6 + iterative refinement accuracy', err < 1e-9,
       'maxErr=' + err.toExponential(2));
  }

  // 6) Condition-number estimate sanity: identity → cond=1; Hilbert-4 → large.
  {
    const qrI = houseQR([[1,0,0],[0,1,0],[0,0,1]]);
    ok('houseQR: cond(I) ≈ 1', Math.abs(qrI.condEst - 1) < 1e-12,
       'condEst=' + qrI.condEst);
    const Ah = Array.from({length: 4}, (_, i) =>
      Array.from({length: 4}, (_, j) => 1 / (i + j + 1)));
    const qrH = houseQR(Ah);
    ok('houseQR: cond(Hilbert-4) > 1e3', qrH.condEst > 1e3, 'condEst=' + qrH.condEst.toExponential(2));
  }
}

// =============================================================================
// PrimarySolution envelope tests
// -----------------------------------------------------------------------------
// Validates the typed envelope + subscribe/publish shim that decouples
// cross-tab readers (Schwarz, Sphere, Param-slice) from ui.js's internal
// state.current.
// =============================================================================
{
  const PS = QD_NS.PrimarySolution;
  ok('PrimarySolution: exported on QD', !!PS);
  ok('PrimarySolution: get() initially null', PS.get() === null);
  ok('PrimarySolution: hasSolution() false initially', PS.hasSolution() === false);

  let received = 'none';
  const unsub = PS.subscribe(env => { received = env; });
  const env1 = { success: true, primary: { phi: { id: 1 } }, hData: { foo: 'bar' } };
  PS.publish(env1);
  ok('PrimarySolution: get() returns published envelope', PS.get() === env1);
  ok('PrimarySolution: subscriber notified on publish', received === env1);
  ok('PrimarySolution: hasSolution() true after success publish', PS.hasSolution() === true);

  // Failed solve should still publish but hasSolution() is false.
  const envFail = { success: false, error: 'no root' };
  PS.publish(envFail);
  ok('PrimarySolution: hasSolution() false on failed solve', PS.hasSolution() === false);
  ok('PrimarySolution: get() reflects the failed envelope', PS.get() === envFail);

  // update() patches in place and notifies.
  PS.publish(env1);
  received = 'reset';
  PS.update({ alternates: ['alt1', 'alt2'] });
  ok('PrimarySolution: update() patches envelope', env1.alternates.length === 2);
  ok('PrimarySolution: update() notifies subscribers', received === env1);

  // update() is a no-op when envelope is null.
  PS.clear();
  ok('PrimarySolution: clear() drops envelope', PS.get() === null);
  ok('PrimarySolution: subscriber notified on clear', received === null);
  received = 'untouched';
  PS.update({ anything: 1 });
  ok('PrimarySolution: update() is no-op on null envelope', received === 'untouched');

  // Unsubscribe stops further notifications.
  unsub();
  received = 'untouched';
  PS.publish({ success: true });
  ok('PrimarySolution: unsubscribed handler is not called', received === 'untouched');

  // Subscriber throwing does not break other subscribers.
  const order = [];
  const u1 = PS.subscribe(() => { order.push('A'); throw new Error('boom'); });
  const u2 = PS.subscribe(() => { order.push('B'); });
  // Silence the expected error log during this test.
  const origErr = console.error;
  console.error = () => {};
  PS.publish({ success: true });
  console.error = origErr;
  ok('PrimarySolution: throwing subscriber does not halt notify chain',
     order.length === 2 && order[0] === 'A' && order[1] === 'B');
  u1(); u2();
  PS.clear();
}

// =============================================================================
// Disk-clamp invariant (C4)
// -----------------------------------------------------------------------------
// newtonSolve's bounded-family iteration clamps |z_j| ≤ DISK_CLAMP_IN
// before each residual eval. If a future change drops the clamp, the solver
// can let z_j cross |z|=1 into a disjoint branch and never recover.
//
// This test runs a Newton step on the cardioid preset (h = 1.5/w + 0.5/w²,
// bounded) and confirms (a) the converged phi has |z_j| < 1 for every branch
// and (b) the constants DISK_CLAMP_IN / DISK_CLAMP_OUT are exported on QD.
// =============================================================================
{
  ok('DiskClamp: DISK_CLAMP_IN exported on QD',
     typeof QD_NS.DISK_CLAMP_IN === 'number' && QD_NS.DISK_CLAMP_IN < 1);
  ok('DiskClamp: DISK_CLAMP_OUT exported on QD',
     typeof QD_NS.DISK_CLAMP_OUT === 'number' && QD_NS.DISK_CLAMP_OUT > 1);

  // Two-point symmetric: h(w) = 1.5/(w-1) + 1.5/(w+1). Bounded; converges
  // to z_j on the real axis with |z_j| ≈ 0.5-0.7 — well inside but the
  // clamp WOULD fire if Newton overshot.
  const hData = { poles: [
    { a: {re: 1,im:0}, principal: [{re:1.5,im:0}] },
    { a: {re:-1,im:0}, principal: [{re:1.5,im:0}] },
  ]};
  const result = QD_NS.solveInverseQD(hData, { w0: {re:0,im:0} });
  ok('DiskClamp: two-point symmetric solves', result.success, result.success ? '' : result.error);
  if (result.success) {
    const branches = result.primary.phi.branches || [];
    let allInside = true;
    let maxR = 0;
    for (const br of branches) {
      const r = Math.hypot(br.z.re, br.z.im);
      if (r > maxR) maxR = r;
      if (r >= 1) allInside = false;
    }
    ok('DiskClamp: branches stay |z|<1', allInside, 'maxR=' + maxR.toFixed(6));
    ok('DiskClamp: branches non-trivial (test exercises the clamp path)',
       branches.length === 2 && maxR > 0.01, 'nBranches=' + branches.length);
    ok('DiskClamp: maxR < DISK_CLAMP_IN (= ' + QD_NS.DISK_CLAMP_IN + ')',
       maxR < QD_NS.DISK_CLAMP_IN);
  }
}

// =============================================================================
// Riemann-map LaTeX render smoke (KaTeX parse guard)
// -----------------------------------------------------------------------------
};
