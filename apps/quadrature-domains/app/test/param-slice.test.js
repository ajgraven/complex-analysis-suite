'use strict';
// param-slice.test.js — subsystem tests split from the former monolithic node-test.js (Phase 2).
// Shared kernels + harness (ok, C, T, solveInverseQD, Schwarz, PS, SC, …) are
// installed on `global` by test/bootstrap.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP_DIR = path.join(__dirname, '..');
require('./bootstrap');
module.exports = async function run() {
ok('ParamSlice: namespace exports core symbols',
   typeof PS.applyParam === 'function' &&
   typeof PS.classifyResult === 'function' &&
   typeof PS.listAvailableParams === 'function' &&
   typeof PS.formatParamLabel === 'function');

// ---- formatParamLabel produces non-empty strings for all kinds ----
{
  const kinds = [
    { kind: 'residueRe', poleIdx: 0, residueIdx: 1 },
    { kind: 'residueIm', poleIdx: 1, residueIdx: 0 },
    { kind: 'poleRe',    poleIdx: 2 },
    { kind: 'poleIm',    poleIdx: 0 },
    { kind: 'polyRe',    degree: 0 },
    { kind: 'polyIm',    degree: 3 },
    { kind: 'cReal' }, { kind: 'qRe' }, { kind: 'qIm' },
    { kind: 'w0Re' }, { kind: 'w0Im' },
  ];
  let allOK = true;
  for (const r of kinds) {
    const s = PS.formatParamLabel(r);
    if (typeof s !== 'string' || s.length === 0 || s === '?') allOK = false;
  }
  ok('ParamSlice: formatParamLabel returns non-empty for every kind', allOK);
}

// ---- applyParam round-trip per ParamRef kind ----
{
  const baseScenario = {
    hData: {
      poles: [
        { a: { re: 1, im: 0 },    principal: [{ re: 0.5, im: 0 }, { re: 0.2, im: 0.1 }] },
        { a: { re: -1, im: 0.5 }, principal: [{ re: 0.3, im: -0.2 }] },
      ],
      polyPart: [{ re: 0, im: 0 }, { re: 1, im: 0 }],
    },
    norm: { c: 0.5, w0: { re: 0.2, im: -0.1 }, q: { re: 0.1, im: 0.2 } },
    opts: {},
  };

  const cases = [
    { ref: { kind: 'residueRe', poleIdx: 0, residueIdx: 1 }, value: 0.77,
      read: s => s.hData.poles[0].principal[1].re },
    { ref: { kind: 'residueIm', poleIdx: 1, residueIdx: 0 }, value: -0.55,
      read: s => s.hData.poles[1].principal[0].im },
    { ref: { kind: 'poleRe', poleIdx: 0 }, value: 2.5,
      read: s => s.hData.poles[0].a.re },
    { ref: { kind: 'poleIm', poleIdx: 1 }, value: -1.25,
      read: s => s.hData.poles[1].a.im },
    { ref: { kind: 'polyRe', degree: 1 }, value: 3.14,
      read: s => s.hData.polyPart[1].re },
    { ref: { kind: 'polyIm', degree: 0 }, value: -0.5,
      read: s => s.hData.polyPart[0].im },
    { ref: { kind: 'cReal' }, value: 0.85, read: s => s.norm.c },
    { ref: { kind: 'qRe' },   value: 1.5,  read: s => s.norm.q.re },
    { ref: { kind: 'qIm' },   value: -0.5, read: s => s.norm.q.im },
    { ref: { kind: 'w0Re' },  value: 0.9,  read: s => s.norm.w0.re },
    { ref: { kind: 'w0Im' },  value: -0.3, read: s => s.norm.w0.im },
  ];
  let allOK = true;
  for (const c of cases) {
    const s = PS.applyParam(baseScenario, c.ref, c.value);
    const got = c.read(s);
    if (Math.abs(got - c.value) > 1e-12) {
      allOK = false;
      console.log('  applyParam mismatch: ', c.ref, ' expected ', c.value, ' got ', got);
    }
    // And confirm the base scenario wasn't mutated.
    if (c.read(baseScenario) === c.value && Math.abs(c.value - c.read({
      hData: { poles: [
        { a: { re: 1, im: 0 },    principal: [{ re: 0.5, im: 0 }, { re: 0.2, im: 0.1 }] },
        { a: { re: -1, im: 0.5 }, principal: [{ re: 0.3, im: -0.2 }] },
      ], polyPart: [{ re: 0, im: 0 }, { re: 1, im: 0 }] },
      norm: { c: 0.5, w0: { re: 0.2, im: -0.1 }, q: { re: 0.1, im: 0.2 } },
    })) > 1e-12) {
      allOK = false;
      console.log('  applyParam mutated base scenario for ref ', c.ref);
    }
  }
  ok('ParamSlice: applyParam round-trip + non-mutation for every kind', allOK);

  // polyRe/polyIm should grow polyPart on demand.
  const grown = PS.applyParam(baseScenario, { kind: 'polyRe', degree: 4 }, 9);
  ok('ParamSlice: applyParam(polyRe degree=4) grows polyPart',
     grown.hData.polyPart.length >= 5 && Math.abs(grown.hData.polyPart[4].re - 9) < 1e-12);
}

// ---- listAvailableParams returns non-empty arrays per mode ----
{
  const hData = {
    poles: [
      { a: { re: 1, im: 0 }, principal: [{ re: 1, im: 0 }] },
    ],
    polyPart: [{ re: 0, im: 0 }, { re: 1, im: 0 }],
  };
  const modes = [
    { mode: 'bounded',                norm: { w0: { re: 0, im: 0 } } },
    { mode: 'unbounded',              norm: { c: 0.5, unbounded: true } },
    // PQD families (Q4: param-slice routing). PQD-singular has NO q (only LQD-singular does).
    { mode: 'pqd-bounded',            norm: { w0: { re: 1, im: 0 }, alpha: 2 } },
    { mode: 'pqd-bounded-singular',   norm: { w0: { re: 1, im: 0 }, alpha: 2, singular: true } },
    { mode: 'pqd-unbounded',          norm: { c: 0.5, alpha: 2, unbounded: true } },
    { mode: 'pqd-unbounded-singular', norm: { c: 0.5, alpha: 2, unbounded: true, singular: true } },
    { mode: 'lqd-bounded',            norm: { w0: { re: 1, im: 0 }, lqd: true } },
    { mode: 'lqd-bounded-singular',   norm: { w0: { re: 1, im: 0 }, q: { re: 0, im: 0 }, lqd: true, singular: true } },
    { mode: 'lqd-unbounded',          norm: { c: 0.5, lqd: true, unbounded: true } },
    { mode: 'lqd-unbounded-singular', norm: { c: 0.5, q: { re: 0, im: 0 }, lqd: true, unbounded: true, singular: true } },
  ];
  let allOK = true;
  for (const m of modes) {
    // Family-tag routing must be defined for every solvable mode (else warm-start breaks).
    if (!(m.mode in PS.MODE_FAMILY_TAG)) { allOK = false; console.log('  no MODE_FAMILY_TAG entry for ', m.mode); }
    const lst = PS.listAvailableParams({ hData, norm: m.norm }, m.mode);
    if (!Array.isArray(lst) || lst.length === 0) { allOK = false; console.log('  no params for mode ', m.mode); }
    // Per-mode invariants: every mode has pole + residue refs.
    const hasPoleRe = lst.some(p => p.ref.kind === 'poleRe');
    const hasResRe  = lst.some(p => p.ref.kind === 'residueRe');
    if (!hasPoleRe || !hasResRe) { allOK = false; console.log('  missing pole/residue refs for mode ', m.mode); }
    // Bounded modes should expose w0; unbounded modes should expose c.
    if (m.mode.includes('unbounded')) {
      if (!lst.some(p => p.ref.kind === 'cReal')) { allOK = false; console.log('  missing cReal for mode ', m.mode); }
    } else {
      if (!lst.some(p => p.ref.kind === 'w0Re')) { allOK = false; console.log('  missing w0Re for mode ', m.mode); }
    }
    // q is exposed only by the LQD-singular families (PQD-singular carries no q).
    const wantsQ = m.mode.startsWith('lqd') && m.mode.includes('singular');
    const hasQ = lst.some(p => p.ref.kind === 'qRe');
    if (wantsQ && !hasQ) { allOK = false; console.log('  missing qRe for LQD-singular mode ', m.mode); }
    if (!wantsQ && hasQ) { allOK = false; console.log('  unexpected qRe for mode ', m.mode); }
    // Poly-allowed modes should expose poly refs (we put a degree-1 polyPart in hData):
    // every UNBOUNDED family (classical, PQD, LQD).
    const polyAllowed = m.mode.includes('unbounded');
    const hasPoly = lst.some(p => p.ref.kind === 'polyRe');
    if (polyAllowed && !hasPoly) { allOK = false; console.log('  missing polyRe for poly-allowed mode ', m.mode); }
    if (!polyAllowed && hasPoly) { allOK = false; console.log('  unexpected polyRe for non-poly mode ', m.mode); }
  }
  ok('ParamSlice: listAvailableParams per-mode invariants (incl. PQD families)', allOK);
  ok('ParamSlice: all 4 PQD modes route to a family tag',
     PS.MODE_FAMILY_TAG['pqd-bounded'] === 'powerQD'
     && PS.MODE_FAMILY_TAG['pqd-bounded-singular'] === 'powerQD_singular'
     && PS.MODE_FAMILY_TAG['pqd-unbounded'] === 'unboundedPQD'
     && PS.MODE_FAMILY_TAG['pqd-unbounded-singular'] === 'unboundedPQD_singular');
}

// ---- classifyResult — each class triggers for the expected synthetic input ----
{
  const cases = [
    {
      name: 'VALID',
      result: { success: true, univalent: true, identityOK: true, iterations: 5, residual: 1e-12 },
      expected: PS.CLASS_VALID,
    },
    {
      name: 'IDENTITY_FAIL',
      result: { success: true, univalent: true, identityOK: false, iterations: 5 },
      expected: PS.CLASS_IDENTITY_FAIL,
    },
    {
      name: 'UNIVALENCE_FAIL',
      result: { success: true, univalent: false, identityOK: true, iterations: 5 },
      expected: PS.CLASS_UNIVALENCE_FAIL,
    },
    {
      name: 'NEWTON_DIVERGED',
      result: { success: false, error: 'Max iterations exceeded', iterations: 200 },
      expected: PS.CLASS_NEWTON_DIVERGED,
    },
    {
      name: 'NEWTON_DIVERGED (singular jacobian)',
      result: { success: false, error: 'Singular Jacobian (recovery failed)' },
      expected: PS.CLASS_NEWTON_DIVERGED,
    },
    {
      name: 'NO_ROOT',
      result: { success: false, error: 'No algebraic root found by direct, continuation, or multistart' },
      expected: PS.CLASS_NO_ROOT,
    },
    {
      name: 'CAPABILITY (not yet implemented)',
      result: { success: false, error: 'Polynomial-h for unbounded LQDs is not yet implemented' },
      expected: PS.CLASS_CAPABILITY,
    },
    {
      // Updated for HANDOFF #36: classifier regex now requires "deferred to"
      // (the intentional gate phrasing), not the bare word "deferred". Any
      // future feature-gate throws should follow this convention.
      name: 'CAPABILITY (deferred to)',
      result: { success: false, error: 'solveInverseQD: γ slot deferred to a later pass' },
      expected: PS.CLASS_CAPABILITY,
    },
    {
      // Regression guard for HANDOFF #36: a math-rejection throw that
      // contains "higher-order pole" must NOT classify as CAPABILITY —
      // it must fall through to NEWTON_DIVERGED (matches the /singular/i
      // arm via "no algebraic QD exists for h" routed via the wording
      // chosen in solver-uqd-lqd-singular.js).
      name: 'higher-order-pole wording is NOT capability (HANDOFF #36)',
      result: { success: false, error: 'Family.unboundedLQD_singular: no algebraic QD exists for h = q/w' },
      expected: PS.CLASS_NO_ROOT,
    },
    {
      name: 'normalizeOpts thrown — NOT capability (was the bug)',
      result: { success: false, error: 'solveInverseQD: c must be a positive number' },
      expected: PS.CLASS_UNCLASSIFIED,
    },
  ];
  let allOK = true;
  for (const c of cases) {
    const got = PS.classifyResult(c.result).cls;
    if (got !== c.expected) {
      allOK = false;
      console.log('  classifyResult mismatch for', c.name, ': expected', c.expected, 'got', got);
    }
  }
  ok('ParamSlice: classifyResult — every class triggers correctly', allOK);
}

// ---- Complex.mulInto / addInto / addMulInto: in-place variants ----
{
  const C = QD_NS.Complex;
  const a = { re: 2, im: 3 };
  const b = { re: 4, im: -1 };
  const out = { re: 0, im: 0 };
  C.mulInto(a, b, out);
  ok('Complex.mulInto: correct product',
     Math.abs(out.re - 11) < 1e-12 && Math.abs(out.im - 10) < 1e-12,
     'out=(' + out.re + ',' + out.im + ')');
  // Alias safety: out === a.
  const aa = { re: 2, im: 3 };
  C.mulInto(aa, b, aa);
  ok('Complex.mulInto: safe when out===a',
     Math.abs(aa.re - 11) < 1e-12 && Math.abs(aa.im - 10) < 1e-12);
  // Accumulator.
  const acc = { re: 0, im: 0 };
  C.addMulInto({re:1,im:0}, {re:2,im:3}, acc);
  C.addMulInto({re:0,im:1}, {re:4,im:5}, acc);
  // expect (2+3i) + (-5+4i) = (-3,7i)
  ok('Complex.addMulInto: accumulator correct',
     Math.abs(acc.re - (-3)) < 1e-12 && Math.abs(acc.im - 7) < 1e-12,
     'acc=(' + acc.re + ',' + acc.im + ')');
}

// ---- Schwarz.buildPolygonIndex + pointInPolygonIndexed match the naive version ----
{
  // `Schwarz` here is the one captured earlier in the test file (line ~1698);
  // we can't re-grab via `module.exports.Schwarz` because the later
  // param-slice load overwrote module.exports.
  // Build a circle polygon (radius 1, 64 segments).
  const N = 64;
  const poly = [];
  for (let i = 0; i < N; i++) {
    const th = 2 * Math.PI * i / N;
    poly.push({ re: Math.cos(th), im: Math.sin(th) });
  }
  const idx = Schwarz.buildPolygonIndex(poly, 16);
  let allMatch = true;
  // Sample 200 random test points; both implementations must agree.
  let seed = 12345;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
  for (let k = 0; k < 200; k++) {
    const pt = { re: 2 * rng() - 1, im: 2 * rng() - 1 };
    const naive   = Schwarz.pointInPolygon(pt, poly);
    const indexed = Schwarz.pointInPolygonIndexed(pt, idx);
    if (naive !== indexed) { allMatch = false; break; }
  }
  ok('Schwarz.pointInPolygonIndexed matches naive on 200 random points', allMatch);
  // Sanity: origin inside, far point outside.
  ok('Schwarz.pointInPolygonIndexed: origin inside circle',
     Schwarz.pointInPolygonIndexed({ re: 0, im: 0 }, idx));
  ok('Schwarz.pointInPolygonIndexed: (10,10) outside circle',
     !Schwarz.pointInPolygonIndexed({ re: 10, im: 10 }, idx));
}

// ---- adaptive-mesh helpers: cornersAgree + subdivisionPoints ----
{
  const n0 = 8, n1 = 8;
  const grid = new Uint8Array(n0 * n1).fill(PS.UNKNOWN_CLASS);
  // All four corners of a 2-stride cell at (0,0) are class 0.
  grid[0 * n0 + 0] = 0;
  grid[0 * n0 + 2] = 0;
  grid[2 * n0 + 0] = 0;
  grid[2 * n0 + 2] = 0;
  ok('ParamSlice: cornersAgree true when all 4 corners agree',
     PS.cornersAgree(grid, n0, n1, 0, 0, 2));
  grid[2 * n0 + 2] = 1;
  ok('ParamSlice: cornersAgree false after mutation',
     !PS.cornersAgree(grid, n0, n1, 0, 0, 2));
  grid[2 * n0 + 2] = PS.UNKNOWN_CLASS;
  ok('ParamSlice: cornersAgree false when any corner is UNKNOWN',
     !PS.cornersAgree(grid, n0, n1, 0, 0, 2));

  const sub = PS.subdivisionPoints(0, 0, 4, n0, n1);
  // 4 edge midpoints + 1 center = 5 points
  ok('ParamSlice: subdivisionPoints returns 5 in-grid points (stride 4)', sub.length === 5);
  const hasCenter = sub.some(p => p.c === 2 && p.r === 2);
  ok('ParamSlice: subdivisionPoints includes the cell center', hasCenter);

  // Out-of-grid clipping: stride-2 cell at (n0-2, n1-2) should produce only
  // points that fit inside the grid.
  const subClipped = PS.subdivisionPoints(n0 - 2, n1 - 2, 2, n0, n1);
  let allInBounds = true;
  for (const p of subClipped) {
    if (p.c < 0 || p.c >= n0 || p.r < 0 || p.r >= n1) allInBounds = false;
  }
  ok('ParamSlice: subdivisionPoints respects grid bounds at edges', allInBounds);
}

// ---- cellIsHomogeneous: iter-gradient refinement trigger ----
{
  const n0 = 8, n1 = 8;
  const cls   = new Uint8Array(n0 * n1).fill(PS.UNKNOWN_CLASS);
  const iters = new Uint8Array(n0 * n1);
  const V = PS.CLASS_TO_IDX[PS.CLASS_VALID];
  const F = PS.CLASS_TO_IDX[PS.CLASS_IDENTITY_FAIL];
  // 4 corners all VALID with iter spread = 12 (5, 8, 11, 17).
  cls[0]   = V; iters[0]   = 5;
  cls[2]   = V; iters[2]   = 8;
  cls[16]  = V; iters[16]  = 11;  // (0,2)
  cls[18]  = V; iters[18]  = 17;  // (2,2)
  ok('ParamSlice: cellIsHomogeneous true when iter spread <= iterDelta',
     PS.cellIsHomogeneous(cls, iters, n0, n1, 0, 0, 2, { iterDelta: 12 }));
  ok('ParamSlice: cellIsHomogeneous false when iter spread > iterDelta',
     !PS.cellIsHomogeneous(cls, iters, n0, n1, 0, 0, 2, { iterDelta: 8 }));
  // For non-VALID classes the iter check is skipped: identical setup but
  // class F, large iter spread → still homogeneous.
  cls[0] = F; cls[2] = F; cls[16] = F; cls[18] = F;
  ok('ParamSlice: cellIsHomogeneous ignores iter spread for non-VALID class',
     PS.cellIsHomogeneous(cls, iters, n0, n1, 0, 0, 2, { iterDelta: 1 }));
  // iterDelta=Infinity → degenerates to cornersAgree.
  cls[0] = V; cls[2] = V; cls[16] = V; cls[18] = V;
  ok('ParamSlice: cellIsHomogeneous with iterDelta=Infinity matches cornersAgree',
     PS.cellIsHomogeneous(cls, iters, n0, n1, 0, 0, 2, { iterDelta: Infinity }) ===
     PS.cornersAgree(cls, n0, n1, 0, 0, 2));
}

// ---- Adaptive walk: synthetic grid, predicate-driven refinement ----
// Mirrors the point-selection logic in runAdaptive2D (param-slice-ui.js)
// without the async dispatch / canvas paint, so we can assert behaviour
// of both the cornersAgree-only walk and the cellIsHomogeneous walk.
//
// Two synthetic truths exercise distinct properties:
//   (A) Class-only varying grid → tests that cellIsHomogeneous(Infinity)
//       matches cornersAgree exactly, and both cut cell count significantly.
//   (B) Uniformly-VALID grid with iter gradient → tests that the iter
//       trigger fires MORE refinement than cornersAgree, which would
//       otherwise skip everything beyond the coarse pass.
{
  const N = 32;
  const V = PS.CLASS_TO_IDX[PS.CLASS_VALID];
  const F = PS.CLASS_TO_IDX[PS.CLASS_IDENTITY_FAIL];

  // Walk the coarse→refine loop using `predicate` and a `truthAt(c,r)`
  // ground-truth function. Returns { visited, firstRefineCount } where
  // firstRefineCount is the number of stride-8 cells that subdivided
  // (the most direct measure of refinement intensity).
  function walk(predicate, truthAt) {
    const cls   = new Uint8Array(N * N).fill(PS.UNKNOWN_CLASS);
    const iters = new Uint8Array(N * N);
    let stride = 1;
    while ((stride << 1) <= N / 4) stride <<= 1;
    const startStride = stride;
    let visited = 0;
    let firstRefineCount = -1;

    function sample(c, r) {
      const idx = r * N + c;
      if (cls[idx] !== PS.UNKNOWN_CLASS) return;
      const t = truthAt(c, r);
      cls[idx] = t.cls;
      iters[idx] = t.iters;
      visited++;
    }

    for (let r = 0; r < N; r += startStride)
      for (let c = 0; c < N; c += startStride) sample(c, r);
    for (let r = 0; r < N; r += startStride) sample(N - 1, r);
    for (let c = 0; c < N; c += startStride) sample(c, N - 1);
    sample(N - 1, N - 1);

    while (stride > 1) {
      const seen = new Set();
      const newPoints = [];
      let subdivisions = 0;
      for (let r = 0; r + stride < N; r += stride) {
        for (let c = 0; c + stride < N; c += stride) {
          if (predicate(cls, iters, c, r, stride)) continue;
          subdivisions++;
          for (const p of PS.subdivisionPoints(c, r, stride, N, N)) {
            const key = p.r * N + p.c;
            if (cls[key] === PS.UNKNOWN_CLASS && !seen.has(key)) {
              seen.add(key);
              newPoints.push(p);
            }
          }
        }
      }
      if (firstRefineCount < 0) firstRefineCount = subdivisions;
      for (const p of newPoints) sample(p.c, p.r);
      stride >>= 1;
    }
    return { visited, firstRefineCount };
  }

  // --- (A) Class-only varying grid: VALID below the parabola, else FAIL.
  // Iter is constant so the iter trigger never fires; the two predicates
  // must walk identically.
  const truthClassOnly = (c, r) => ({
    cls: (r > (c * c) / 8) ? V : F,
    iters: 10,
  });
  const aCorners = walk((cls, _, c, r, s) => PS.cornersAgree(cls, N, N, c, r, s),
                        truthClassOnly);
  const aInf = walk((cls, iters, c, r, s) =>
    PS.cellIsHomogeneous(cls, iters, N, N, c, r, s, { iterDelta: Infinity }),
    truthClassOnly);
  ok('ParamSlice adaptive walk: cellIsHomogeneous(Infinity) matches cornersAgree (same visited)',
     aCorners.visited === aInf.visited);
  ok('ParamSlice adaptive walk: cellIsHomogeneous(Infinity) matches cornersAgree (same stride-8 refinements)',
     aCorners.firstRefineCount === aInf.firstRefineCount);
  ok('ParamSlice adaptive walk: cornersAgree cuts visits to < 80% of full grid on class-only truth',
     aCorners.visited < 0.8 * N * N);

  // --- (B) Uniformly-VALID grid with smooth iter gradient. cornersAgree
  // skips everything (one class), so only the coarse pass samples cells.
  // cellIsHomogeneous(iterDelta=4) sees iter spread > 4 in every coarse
  // cell and triggers refinement everywhere.
  const truthIterOnly = (c, r) => ({ cls: V, iters: Math.min(255, c + r) });
  const bCorners = walk((cls, _, c, r, s) => PS.cornersAgree(cls, N, N, c, r, s),
                        truthIterOnly);
  const bIter4 = walk((cls, iters, c, r, s) =>
    PS.cellIsHomogeneous(cls, iters, N, N, c, r, s, { iterDelta: 4 }),
    truthIterOnly);
  ok('ParamSlice adaptive walk: cornersAgree does NO refinement on uniformly-VALID grid',
     bCorners.firstRefineCount === 0);
  ok('ParamSlice adaptive walk: cellIsHomogeneous(iterDelta=4) refines every coarse cell on iter-gradient grid',
     bIter4.firstRefineCount >= 9);
  // The iter trigger's win is *where* it places samples (in iter-gradient
  // regions cornersAgree skips), not the *total* count — populating more
  // cells at coarse strides actually reduces spurious UNKNOWN-corner
  // subdivisions later, so iterDelta=4 often visits fewer cells overall.
  // We assert both stay well below full-grid sampling so the algorithm
  // remains adaptive on this input.
  ok('ParamSlice adaptive walk: cornersAgree stays < 90% of full grid even on iter-gradient input',
     bCorners.visited < 0.9 * N * N);
  ok('ParamSlice adaptive walk: cellIsHomogeneous(iterDelta=4) stays < 60% of full grid on iter-gradient input',
     bIter4.visited < 0.6 * N * N);
}

// ---- solveOnePoint: cardioid sweep with warm-start chain ----
// Needs QD on the same vm context that loaded param-slice-common.js.
{
  const baseScenario = {
    hData: { poles: [{ a: {re:0,im:0}, principal: [{re:1.5,im:0},{re:0.5,im:0}] }], polyPart: [] },
    norm:  { w0: {re:0,im:0} },
    opts:  { numRestarts: 1, identityTol: 1e-5, findAlternates: false,
             newton: { maxIter: 40, tolerance: 1e-9 },
             usePhases: { direct: true, continuation: false, multistart: true,
                          diverse: false, deflation: false } },
    expectedFamilyTag: undefined,
  };
  let warmPhi = null;
  let validCount = 0, warmUsedCount = 0;
  for (const v of [-0.5, -0.25, 0, 0.25, 0.4]) {
    const r = PS.solveOnePoint(baseScenario,
      [{ ref: { kind: 'poleRe', poleIdx: 0 }, value: v }],
      warmPhi, undefined);
    if (r.cls === PS.CLASS_VALID) validCount++;
    if (r.warmUsed) warmUsedCount++;
    if (r.phiSerialized) warmPhi = r.phiSerialized;
  }
  ok('ParamSlice: solveOnePoint produces valid pixels for cardioid sweep',
     validCount >= 4, 'validCount=' + validCount);
  ok('ParamSlice: warm-start chain kicks in after first valid solve',
     warmUsedCount >= 3, 'warmUsedCount=' + warmUsedCount);

  // solveOnePointWithScratch matches solveOnePoint when given a fresh scratch.
  {
    const scenarioA = {
      hData: { poles: [{ a: {re:0,im:0}, principal: [{re:1.5,im:0},{re:0.5,im:0}] }], polyPart: [] },
      norm:  { w0: {re:0,im:0} },
      opts:  baseScenario.opts,
    };
    const scenarioB = JSON.parse(JSON.stringify(scenarioA));
    const point = [{ ref: { kind: 'poleRe', poleIdx: 0 }, value: 0.1 }];
    const r1 = PS.solveOnePoint(scenarioA, point, null, undefined);
    const scratch = PS.cloneScenario(scenarioB);
    const r2 = PS.solveOnePointWithScratch(scratch, point, null, undefined);
    ok('ParamSlice: solveOnePointWithScratch agrees with solveOnePoint on class',
       r1.cls === r2.cls,
       'r1=' + r1.cls + ', r2=' + r2.cls);
    // Same scratch, second point — must produce correct independent result
    // (scratch reuse invariant: subsequent points overwrite the same refs).
    const r3 = PS.solveOnePointWithScratch(scratch,
      [{ ref: { kind: 'poleRe', poleIdx: 0 }, value: 0.2 }], null, undefined);
    const r4 = PS.solveOnePoint(scenarioA,
      [{ ref: { kind: 'poleRe', poleIdx: 0 }, value: 0.2 }], null, undefined);
    ok('ParamSlice: scratch reuse — successive points produce the right answers',
       r3.cls === r4.cls,
       'r3=' + r3.cls + ', r4=' + r4.cls);
  }

  // Warm-start hint of the wrong family should be ignored, not crash.
  const fakeWarm = { family: 'unboundedLQD', branches: [], unbounded: true,
                     c: 1, polyA: [], lqdBeta: [] };
  const r = PS.solveOnePoint(baseScenario,
    [{ ref: { kind: 'poleRe', poleIdx: 0 }, value: 0.1 }],
    fakeWarm, undefined);
  ok('ParamSlice: mismatched-family warmHint is rejected gracefully',
     r.cls === PS.CLASS_VALID || r.cls === PS.CLASS_NO_ROOT);
}

// ---- PQD param-slice routing regression ----
// A bounded non-singular PQD scenario MUST route through _solveScenarioBody
// to Family.powerQD — NOT the classical boundedQD fallback. Regression for the
// dropped `norm.alpha` that made the Parameter-slice grid AND the Hovered-QD
// live preview render a classical QD for one-point bounded non-singular PQDs.
{
  // One-point bounded non-singular PQD, α=2, h = 3/(w−3) (the §20 example).
  // Bootstrap a valid interior w₀ (param-slice runs with bootstrapW0:false, so
  // the scenario must supply w₀ exactly as the QD tab's buildNorm does).
  const mkH = () => ({ poles: [{ a: { re: 3, im: 0 }, principal: [{ re: 3, im: 0 }] }], polyPart: [] });
  const boot = QD_NS.solveInverseQD(mkH(), { alpha: 2 });
  ok('ParamSlice PQD: bootstrap solve for w₀ succeeded', boot.success, boot.error);
  if (boot.success) {
    const w0 = boot.primary.phi.w0;
    const scen = {
      hData: mkH(),
      norm:  { w0: { re: w0.re, im: w0.im }, alpha: 2 },
      opts:  { univalenceSamples: 64, identityTol: 1e-5, findAlternates: false,
               newton: { maxIter: 40, tolerance: 1e-9 },
               usePhases: { direct: true, continuation: false, multistart: true,
                            diverse: false, deflation: false } },
    };
    const pt = [{ ref: { kind: 'poleRe', poleIdx: 0 }, value: 3 }];   // no-op assign
    // Cold solve — only routes to powerQD if opts.alpha is forwarded (the fix).
    const cold = PS.solveOnePoint(scen, pt, null, 'powerQD');
    ok('ParamSlice PQD: cold solve routes to Family.powerQD (not classical)',
       cold.cls === PS.CLASS_VALID && cold.phiSerialized && cold.phiSerialized.family === 'powerQD',
       'cls=' + cold.cls + ' family=' + (cold.phiSerialized && cold.phiSerialized.family));
    ok('ParamSlice PQD: cold solve preserves α=2',
       !!cold.phiSerialized && cold.phiSerialized.alpha === 2,
       'alpha=' + (cold.phiSerialized && cold.phiSerialized.alpha));
    // Warm solve from the powerQD hint — chain must engage AND stay powerQD
    // (guards the chain-poisoning: a classical first pixel would block warm-start).
    const warm = PS.solveOnePoint(scen, pt, cold.phiSerialized, 'powerQD');
    ok('ParamSlice PQD: same-family warm-start engages + stays powerQD',
       warm.cls === PS.CLASS_VALID && warm.warmUsed &&
       warm.phiSerialized && warm.phiSerialized.family === 'powerQD',
       'cls=' + warm.cls + ' warmUsed=' + warm.warmUsed +
       ' family=' + (warm.phiSerialized && warm.phiSerialized.family));
  }
}

// ---- Boundary self-intersection: O(N log N) grid == O(N²) brute force ----
// (param-slice PQD perf work, Fix B). The spatial-grid fast path MUST return
// the identical verdict to the reference all-pairs test on every curve — it's
// only an optimisation. The brute-force fn is also the test oracle.
{
  const bsi   = QD_NS.boundarySelfIntersects;
  const brute = QD_NS.boundarySelfIntersectsBruteForce;
  function circle(N, cx = 0, cy = 0, R = 1) {
    const p = [];
    for (let i = 0; i < N; i++) { const t = 2 * Math.PI * i / N; p.push({ re: cx + R * Math.cos(t), im: cy + R * Math.sin(t) }); }
    return p;
  }
  // limaçon r = 0.5 + cos θ — r goes negative ⇒ an inner loop ⇒ self-intersects.
  function limacon(N) {
    const p = [];
    for (let i = 0; i < N; i++) { const t = 2 * Math.PI * i / N; const r = 0.5 + Math.cos(t); p.push({ re: r * Math.cos(t), im: r * Math.sin(t) }); }
    return p;
  }
  const bowtie = [{ re: -1, im: -1 }, { re: 1, im: 1 }, { re: 1, im: -1 }, { re: -1, im: 1 }];
  function pentagram() {
    const p = [];
    for (let k = 0; k < 5; k++) { const t = 2 * Math.PI * (2 * k) / 5 - Math.PI / 2; p.push({ re: Math.cos(t), im: Math.sin(t) }); }
    return p;   // vertex skip ⇒ self-intersecting star
  }
  const battery = [
    { name: 'unit square N=4',     pts: [{ re: 0, im: 0 }, { re: 1, im: 0 }, { re: 1, im: 1 }, { re: 0, im: 1 }] },
    { name: 'bowtie N=4',          pts: bowtie },
    { name: 'pentagram N=5',       pts: pentagram() },
    { name: 'circle N=33',         pts: circle(33) },             // grid path (N>32), convex
    { name: 'circle N=300',        pts: circle(300) },            // grid path, convex
    { name: 'ellipse N=257',       pts: circle(257, 0, 0, 1).map(p => ({ re: 2 * p.re, im: 0.3 * p.im })) },
    { name: 'limaçon N=200',       pts: limacon(200) },           // grid path, self-intersecting
    { name: 'limaçon N=400',       pts: limacon(400) },
  ];
  let allAgree = true, detail = '';
  for (const c of battery) {
    const g = bsi(c.pts), b = brute(c.pts);
    if (g !== b) { allAgree = false; detail += ` ${c.name}:grid=${g}≠brute=${b}`; }
  }
  ok('BSI: grid self-intersection == brute-force across battery', allAgree, detail);
  ok('BSI: bowtie + pentagram + limaçon flagged self-intersecting',
     brute(bowtie) && bsi(bowtie) && brute(pentagram()) && bsi(pentagram()) &&
     brute(limacon(200)) && bsi(limacon(200)));
  ok('BSI: convex circles (N=300) NOT self-intersecting (grid path)',
     !brute(circle(300)) && !bsi(circle(300)));
}

// ---- PQD isBoundaryUnivalent: family-sweep sampler (Fix A) gives the same
// verdict as the old per-point evalPhi sampler, across a pole-angle battery. ----
{
  let agree = true, allUniv = true, n = 0, detail = '';
  for (const deg of [0, 30, 60, 90, 135, 170]) {
    const th = deg * Math.PI / 180;
    const h = { poles: [{ a: { re: 2 * Math.cos(th), im: 2 * Math.sin(th) }, principal: [{ re: 1, im: 0 }] }], polyPart: [] };
    const r = QD_NS.solveInverseQD(h, { alpha: 2 });
    if (!r.success) { detail += ` deg${deg}:solveFail`; continue; }
    n++;
    const phi  = r.primary.phi;
    const fast = QD_NS.isBoundaryUnivalent(phi, 128);                                  // new: family sweep
    const slow = !QD_NS.boundarySelfIntersectsBruteForce(QD_NS.sampleBoundary(phi, 128)); // old: per-point evalPhi
    if (fast !== slow) { agree = false; detail += ` deg${deg}:fast=${fast}≠slow=${slow}`; }
    if (!fast) allUniv = false;
  }
  ok('PQD isBoundaryUnivalent: family-sweep sampler agrees with per-point sampler', agree && n >= 5, 'n=' + n + detail);
  ok('PQD isBoundaryUnivalent: valid α=2 PQDs report univalent', allUniv && n >= 5, detail);
}

// ---- Identity-rigor wiring (HANDOFF #32): opts.univalenceSamples flows
// from a param-slice scenario through to the family identity verifier
// for both the warm-start and cold-start paths in _solveScenarioBody.
{
  const baseHData = {
    poles: [{ a: {re:0,im:0}, principal: [{re:1.5,im:0},{re:0.5,im:0}] }],
    polyPart: [],
  };
  // Cold-path: solveInverseQD directly. The solver echoes numSamples back
  // in result.primary.identity.numSamples (per verifyQuadratureIdentity_QD).
  const r32  = QD_NS.solveInverseQD(baseHData, {
    univalenceSamples: 32, identityTol: 1e-5, findAlternates: false,
    usePhases: { direct: true, continuation: false, multistart: true,
                 diverse: false, deflation: false },
  });
  const r512 = QD_NS.solveInverseQD(baseHData, {
    univalenceSamples: 512, identityTol: 1e-7, findAlternates: false,
    usePhases: { direct: true, continuation: false, multistart: true,
                 diverse: false, deflation: false },
  });
  ok('IdentityRigor: solveInverseQD honours univalenceSamples=32',
     r32.success && r32.primary && r32.primary.identity &&
     r32.primary.identity.numSamples === 32,
     'numSamples=' + (r32.primary && r32.primary.identity && r32.primary.identity.numSamples));
  ok('IdentityRigor: solveInverseQD honours univalenceSamples=512',
     r512.success && r512.primary && r512.primary.identity &&
     r512.primary.identity.numSamples === 512,
     'numSamples=' + (r512.primary && r512.primary.identity && r512.primary.identity.numSamples));
  // Param-slice path: solveOnePoint with the same opts must reach VALID
  // for this cardioid configuration at both extremes (it's well within
  // the QD admissibility region at both N=32 and N=512).
  const psFast = PS.solveOnePoint({
    hData: baseHData, norm: { w0: {re:0,im:0} },
    opts: { univalenceSamples: 32,  identityTol: 1e-5, findAlternates: false,
            usePhases: { direct: true, continuation: false, multistart: true,
                         diverse: false, deflation: false } },
  }, [{ ref: { kind: 'poleRe', poleIdx: 0 }, value: 0 }], null, undefined);
  const psRig  = PS.solveOnePoint({
    hData: baseHData, norm: { w0: {re:0,im:0} },
    opts: { univalenceSamples: 512, identityTol: 1e-7, findAlternates: false,
            usePhases: { direct: true, continuation: false, multistart: true,
                         diverse: false, deflation: false } },
  }, [{ ref: { kind: 'poleRe', poleIdx: 0 }, value: 0 }], null, undefined);
  ok('IdentityRigor: cardioid scenario stays VALID at Fast preset (N=32, tol=1e-5)',
     psFast.cls === PS.CLASS_VALID, 'cls=' + psFast.cls);
  ok('IdentityRigor: cardioid scenario stays VALID at Rigorous preset (N=512, tol=1e-7)',
     psRig.cls === PS.CLASS_VALID, 'cls=' + psRig.cls);
}

// ---- QoL (HANDOFF #33): qol.js loads + exports the expected surface ----
// We exercise qol.js in a minimal DOM stub (just enough surface for the
// keyboard-shortcut + auto-wire path); the visual DOM behaviour is covered
// by browser manual smoke. This catches API regressions and crashes during
// auto-wire on load.
{
  const qolCtx = vm.createContext({
    document: {
      readyState: 'complete',
      addEventListener: function () {},
    },
    window: undefined,
    module: { exports: {} },
    console: console,
  });
  qolCtx.window = qolCtx;        // qol.js uses `typeof window !== 'undefined'`
  qolCtx.globalThis = qolCtx;
  const qolSrc = fs.readFileSync(path.join(APP_DIR, 'qol.js'), 'utf8');
  let loaded = false;
  try {
    vm.runInContext(qolSrc, qolCtx, { filename: 'qol.js' });
    loaded = true;
  } catch (e) {
    loaded = false;
  }
  ok('QoL: qol.js loads without throwing', loaded);
  const QoL = qolCtx.QD && qolCtx.QD.QoL;
  ok('QoL: QD.QoL namespace exists', !!QoL);
  if (QoL) {
    ok('QoL: attachHelp is a function', typeof QoL.attachHelp === 'function');
    ok('QoL: attachHoverTooltip is a function', typeof QoL.attachHoverTooltip === 'function');
    ok('QoL: copyButton is a function', typeof QoL.copyButton === 'function');
    ok('QoL: openShortcutsOverlay is a function', typeof QoL.openShortcutsOverlay === 'function');
    ok('QoL: wireGlobalKeyboardShortcuts is a function',
       typeof QoL.wireGlobalKeyboardShortcuts === 'function');
    // attachHelp(null, ...) is a no-op — must not throw.
    let noOpOK = true;
    try { QoL.attachHelp(null, 'help'); } catch (e) { noOpOK = false; }
    ok('QoL: attachHelp(null, ...) is a safe no-op', noOpOK);
    // attachHoverTooltip(null, ...) likewise.
    let noOpHover = true;
    try { QoL.attachHoverTooltip(null, () => null); } catch (e) { noOpHover = false; }
    ok('QoL: attachHoverTooltip(null, ...) is a safe no-op', noOpHover);
  }
}

// ---- colorFor: VALID dims with iter count; non-VALID is iter-independent ----
{
  const cBright = PS.colorFor({ cls: PS.CLASS_VALID, iterations: 1 });
  const cDim    = PS.colorFor({ cls: PS.CLASS_VALID, iterations: 200 });
  const dimmer  = (cDim[0] + cDim[1] + cDim[2]) < (cBright[0] + cBright[1] + cBright[2]);
  ok('ParamSlice: colorFor VALID brightness scales with iter count', dimmer);

  const cFail1 = PS.colorFor({ cls: PS.CLASS_NO_ROOT, iterations: 1 });
  const cFail2 = PS.colorFor({ cls: PS.CLASS_NO_ROOT, iterations: 200 });
  const same = cFail1[0] === cFail2[0] && cFail1[1] === cFail2[1] && cFail1[2] === cFail2[2];
  ok('ParamSlice: colorFor non-VALID is iter-independent', same);
}

// ===========================================================================
// Polynomial-h support for unbounded LQDs  (HANDOFF #21, L-poly-h — shipped)
// ===========================================================================
// Verifies (1) the new helpers in QD.LqdCommon, then (2) end-to-end inverse
// solves with nonzero polyPart on both unbounded LQD families using the
// runFamilyBattery pattern. Identity verifiers already account for the
// polyPart ∞-residue contribution on the RHS, so a passing identity check
// here genuinely confirms the (★)_F equations are correct (a wrong β would
// shift φ by an amount the verifier would catch).

// ---- Helpers: rHashLaurentAtInfinity sanity check -------------------------
{
  const LC = QD_NS.LqdCommon;
  ok('LqdCommon: rHashLaurentAtInfinity exists',
     typeof LC.rHashLaurentAtInfinity === 'function');
  // Single-branch closed-form: r#(z) = z / (1 − 2z) (A=1, z_j=2, k=1).
  // ⇒ r#(1/u) = 1/(u − 2) = −Σ_n u^n / 2^{n+1}, i.e. a_l = −1/2^{l+1}.
  const phi = { c: 1, branches: [{ z: { re: 2, im: 0 }, A: [{ re: 1, im: 0 }] }] };
  const a = LC.rHashLaurentAtInfinity(phi, 5);
  let maxErr = 0;
  for (let l = 0; l < 5; l++) {
    const expected = -1 / Math.pow(2, l + 1);
    const err = Math.hypot(a[l].re - expected, a[l].im);
    if (err > maxErr) maxErr = err;
  }
  ok('LqdCommon: rHashLaurentAtInfinity matches closed-form (1 branch, k=1)',
     maxErr < 1e-14, 'maxErr=' + maxErr.toExponential(2));
  // Consistency: a[0] should equal rHashAtInfinity (-1/2 for this phi).
  const rInf = LC.rHashAtInfinity(phi);
  ok('LqdCommon: rHashLaurentAtInfinity[0] == rHashAtInfinity',
     Math.hypot(a[0].re - rInf.re, a[0].im - rInf.im) < 1e-14);
}

// ---- Helper: blaschkeLaurentAtInfinity closed-form check ------------------
{
  const LC = QD_NS.LqdCommon;
  ok('LqdCommon: blaschkeLaurentAtInfinity exists',
     typeof LC.blaschkeLaurentAtInfinity === 'function');
  // For z_0 real = 2: |z_0|=2, b_0 = 1/2, b_n = (1−4)/(2·2^n) = −3/2^{n+1}.
  const bU = LC.blaschkeLaurentAtInfinity({ re: 2, im: 0 }, 4);
  ok('LqdCommon: blaschke b_0 = 1/|z₀|', Math.abs(bU[0].re - 0.5) < 1e-14);
  ok('LqdCommon: blaschke b_1 = (1-|z₀|²)/(|z₀|·conj(z₀)) = -3/4',
     Math.abs(bU[1].re + 0.75) < 1e-14 && Math.abs(bU[1].im) < 1e-14);
  ok('LqdCommon: blaschke b_2 = -3/8',
     Math.abs(bU[2].re + 3/8) < 1e-14 && Math.abs(bU[2].im) < 1e-14);
}

// ---- Helper: phiLaurentAtInfinity_UQDL sanity check -----------------------
{
  const LC = QD_NS.LqdCommon;
  // Trivial phi: c = 1, no branches, no β.  φ(z) = z. So f̃_l = 0 for all l.
  const phi0 = { c: 1, branches: [], lqdBeta: [] };
  const f = LC.phiLaurentAtInfinity_UQDL(phi0, 3);
  let m = 0;
  for (const ff of f) m = Math.max(m, Math.hypot(ff.re, ff.im));
  ok('LqdCommon: phiLaurentAtInfinity_UQDL(trivial) = 0',
     m < 1e-14, 'max=' + m.toExponential(2));

  // β-only: c = 1, β = [β_1]. φ(z) = z·exp(β_1/z) = z + β_1 + β_1²/(2z) + ...
  // So f̃_0 = β_1, f̃_1 = β_1²/2.
  const phi1 = { c: 1, branches: [], lqdBeta: [{ re: 0.3, im: 0 }] };
  const f1 = LC.phiLaurentAtInfinity_UQDL(phi1, 2);
  ok('LqdCommon: phiLaurentAtInfinity_UQDL(β=[0.3])[0] = 0.3',
     Math.abs(f1[0].re - 0.3) < 1e-14);
  ok('LqdCommon: phiLaurentAtInfinity_UQDL(β=[0.3])[1] = 0.045',
     Math.abs(f1[1].re - 0.3 * 0.3 / 2) < 1e-14);
}

// ---- End-to-end polynomial-h LQD solves -----------------------------------
runFamilyBattery('unboundedLQD (poly-h)', [
  // Single finite pole + tiny linear polyPart (degree-0 polynomial-h).
  // c = 0.6 matches the existing finite-pole-only smoke test (line 862) so
  // the geometry is similar; polyPart adds a small constant perturbation.
  { tag: 'one pole + C∞,0 = 0.02',
    hData: {
      poles: [{ a: {re:2,im:0}, principal: [{re:1,im:0}] }],
      polyPart: [{ re: 0.02, im: 0 }],
    },
    opts: { lqd: true, unbounded: true, c: 0.6 },
    identityTol: 1e-6, family: 'unboundedLQD',
    insideTest: { point: {re:0,im:0}, expected: true, label: 'origin (∈ K)' } },
  // Slightly larger polyPart.
  { tag: 'one pole + C∞,0 = 0.05',
    hData: {
      poles: [{ a: {re:2,im:0}, principal: [{re:1,im:0}] }],
      polyPart: [{ re: 0.05, im: 0 }],
    },
    opts: { lqd: true, unbounded: true, c: 0.6 },
    identityTol: 1e-6, family: 'unboundedLQD',
    insideTest: { point: {re:0,im:0}, expected: true, label: 'origin (∈ K)' } },
  // Complex polyPart coefficient.
  { tag: 'one pole + complex C∞,0',
    hData: {
      poles: [{ a: {re:2,im:0}, principal: [{re:1,im:0}] }],
      polyPart: [{ re: 0.02, im: 0.03 }],
    },
    opts: { lqd: true, unbounded: true, c: 0.6 },
    identityTol: 1e-6, family: 'unboundedLQD',
    insideTest: { point: {re:0,im:0}, expected: true, label: 'origin (∈ K)' } },
  // Two finite poles + polyPart.
  { tag: 'two poles + C∞,0 = 0.02',
    hData: {
      poles: [
        { a: {re: 2.0, im: 0}, principal: [{re:1,im:0}] },
        { a: {re:-2.0, im: 0}, principal: [{re:1,im:0}] },
      ],
      polyPart: [{ re: 0.02, im: 0 }],
    },
    opts: { lqd: true, unbounded: true, c: 0.6 },
    identityTol: 1e-6, family: 'unboundedLQD',
    insideTest: { point: {re:0,im:0}, expected: true, label: 'origin (∈ K)' } },
]);

// Self-consistency cross-check: after the simplest solve above, recompute the
// (★)_F target and confirm |β − target| is at machine precision (proves the
// equation we added IS the fixed point, not a coincidence).
{
  const hData = {
    poles: [{ a: {re:2,im:0}, principal: [{re:1,im:0}] }],
    polyPart: [{ re: 0.02, im: 0 }],
  };
  const r = solveInverseQD(hData, { lqd: true, unbounded: true, c: 0.6 });
  if (r.success) {
    const Fam = QD_NS.Family.unboundedLQD;
    const phi = r.primary.phi;
    const tgt = Fam.computeTargets(phi, hData);
    let maxErr = 0;
    for (let l = 0; l < phi.lqdBeta.length; l++) {
      const e = Math.hypot(phi.lqdBeta[l].re - tgt.F[l].re,
                            phi.lqdBeta[l].im - tgt.F[l].im);
      if (e > maxErr) maxErr = e;
    }
    ok('unboundedLQD: solved β matches (★)_F target',
       maxErr < 1e-10, 'maxErr=' + maxErr.toExponential(2));
  } else {
    ok('unboundedLQD self-consistency setup', false, 'solve failed: ' + r.error);
  }
}

// Regression: pure-finite-pole case (no polyPart) should be UNCHANGED by the
// (★)_F additions — same maxRelDiff to the same tolerance.
{
  const hData = { poles: [{ a: {re:2,im:0}, principal: [{re:1,im:0}] }] };
  const r = solveInverseQD(hData, { lqd: true, unbounded: true, c: 0.6 });
  ok('unboundedLQD: finite-pole-only path still solves (no polyPart regression)',
     r.success && r.primary.identity.maxRelDiff < 1e-7,
     r.success ? 'maxRel=' + r.primary.identity.maxRelDiff.toExponential(2)
               : 'solve failed: ' + r.error);
  if (r.success) {
    ok('unboundedLQD: finite-pole-only β is empty (no polyPart ⇒ no β)',
       (r.primary.phi.lqdBeta || []).length === 0);
  }
}

// ---- Singular LQD with polynomial-h ---------------------------------------
// The boundary identity verifier for UQDLS uses test class w/(w-b)^k for
// k ≥ 2, which vanishes at ∞ — so the existing identityOK check from
// runFamilyBattery can't detect β. Instead we verify directly that the
// β-corrected (●₀) q-equation holds at convergence (it must, by Newton
// construction; but it ALSO confirms β has been correctly pinned by (★)_F,
// since wrong β would force the q-equation to fail or Newton to diverge).
//
// We solve and then evaluate the family's residual function directly; if
// the (●₀) and (★)_F slots are near zero, the full system is satisfied.
{
  function residualMaxAbs(family, phi, hData) {
    const res = family.residual(phi, hData);
    let m = 0;
    for (const x of res) m = Math.max(m, Math.abs(x));
    return m;
  }
  const Fam = QD_NS.Family.unboundedLQD_singular;
  const cases = [
    { tag: 'one pole + q=0.2 + C∞,0 = 0.02',
      hData: {
        poles: [{ a:{re:2,im:0}, principal:[{re:1,im:0}] }],
        polyPart: [{re:0.02, im:0}],
      },
      opts: { lqd: true, unbounded: true, singular: true, c: 0.5, q: {re:0.2,im:0} } },
    { tag: 'one pole + q=0.2 + complex C∞,0',
      hData: {
        poles: [{ a:{re:2,im:0}, principal:[{re:1,im:0}] }],
        polyPart: [{re:0.02, im:0.01}],
      },
      opts: { lqd: true, unbounded: true, singular: true, c: 0.5, q: {re:0.2,im:0} } },
    { tag: 'one pole + larger C∞,0',
      hData: {
        poles: [{ a:{re:2,im:0}, principal:[{re:1,im:0}] }],
        polyPart: [{re:0.05, im:0}],
      },
      opts: { lqd: true, unbounded: true, singular: true, c: 0.5, q: {re:0.2,im:0} } },
    { tag: 'two poles + q=0.1 + C∞,0 = 0.02',
      hData: {
        poles: [
          { a:{re: 2,im:0}, principal:[{re:1,im:0}] },
          { a:{re:-2,im:0}, principal:[{re:1,im:0}] },
        ],
        polyPart: [{re:0.02, im:0}],
      },
      opts: { lqd: true, unbounded: true, singular: true, c: 0.5, q: {re:0.1,im:0} } },
  ];
  for (const c of cases) {
    const tag = 'unboundedLQD_singular (poly-h) :: ' + c.tag;
    const r = solveInverseQD(c.hData, c.opts);
    ok(tag + ' solves', r.success, r.success ? '' : r.error);
    if (!r.success) continue;
    ok(tag + ' univalent', r.primary.univalent);
    const maxRes = residualMaxAbs(Fam, r.primary.phi, c.hData);
    ok(tag + ' (●), (★)_A, (●₀), (★)_F all satisfied (residual < 1e-8)',
       maxRes < 1e-8, 'max |res| = ' + maxRes.toExponential(2));
    // β should be nonzero (polyPart drove it away from 0).
    ok(tag + ' β is nonzero',
       r.primary.phi.lqdBeta.length === c.hData.polyPart.length &&
       Math.hypot(r.primary.phi.lqdBeta[0].re, r.primary.phi.lqdBeta[0].im) > 1e-8,
       'β = ' + JSON.stringify(r.primary.phi.lqdBeta[0]));
    // Identity check (HANDOFF #25 added polyPart-Res∞ contribution to RHS).
    // All these cases have at least one finite pole, so the formula closes
    // cleanly to machine precision.
    ok(tag + ' identityOK (1e-7)',
       r.primary.identity.maxRelDiff < 1e-7,
       'maxRelDiff=' + r.primary.identity.maxRelDiff.toExponential(2));
  }
}

// Self-consistency: solved β matches the (★)_F target at convergence.
{
  const hData = {
    poles: [{ a:{re:2,im:0}, principal:[{re:1,im:0}] }],
    polyPart: [{re:0.02, im:0}],
  };
  const r = solveInverseQD(hData, { lqd: true, unbounded: true, singular: true, c: 0.5, q: {re:0.2,im:0} });
  if (r.success) {
    const Fam = QD_NS.Family.unboundedLQD_singular;
    const phi = r.primary.phi;
    const tgt = Fam.computeTargets(phi, hData);
    let maxErr = 0;
    for (let l = 0; l < phi.lqdBeta.length; l++) {
      const e = Math.hypot(phi.lqdBeta[l].re - tgt.F[l].re,
                            phi.lqdBeta[l].im - tgt.F[l].im);
      if (e > maxErr) maxErr = e;
    }
    ok('unboundedLQD_singular: solved β matches (★)_F target',
       maxErr < 1e-10, 'maxErr=' + maxErr.toExponential(2));
  } else {
    ok('unboundedLQD_singular self-consistency setup', false, 'solve failed: ' + r.error);
  }
}

// Regression: no-polyPart UQDLS cases unchanged by the new (●₀) β-correction
// (since B ≡ 0 when β = []).
{
  const hData = { poles: [{ a:{re:2,im:0}, principal:[{re:1,im:0}] }] };
  const r = solveInverseQD(hData, { lqd: true, unbounded: true, singular: true, c: 0.5, q: {re:0.2,im:0} });
  ok('unboundedLQD_singular: no-polyPart path unaffected by β-correction',
     r.success && r.primary.identity.maxRelDiff < 1e-6,
     r.success ? 'maxRel=' + r.primary.identity.maxRelDiff.toExponential(2)
               : 'solve failed: ' + r.error);
  if (r.success) {
    ok('unboundedLQD_singular: no-polyPart β is empty',
       (r.primary.phi.lqdBeta || []).length === 0);
  }
}

// ---------------------------------------------------------------------------
// HANDOFF #23 (a): UQDLS with NO finite poles + polyPart should be solvable.
// Previously rejected as "no unbounded singular LQD exists for h = q/w with
// no finite poles" — that rejection was correct only when polyPart is also
// empty.  With polyPart, the system has enough structure to pin φ.
// ---------------------------------------------------------------------------
{
  function tryNoFinitePoles(tag, hData, opts) {
    const r = solveInverseQD(hData, opts);
    ok('unboundedLQD_singular (no finite poles) :: ' + tag + ' solves',
       r.success, r.success ? '' : r.error);
    if (!r.success) return;
    ok('unboundedLQD_singular (no finite poles) :: ' + tag + ' univalent',
       r.primary.univalent);
    const Fam = QD_NS.Family.unboundedLQD_singular;
    const res = Fam.residual(r.primary.phi, hData);
    let m = 0; for (const x of res) m = Math.max(m, Math.abs(x));
    ok('unboundedLQD_singular (no finite poles) :: ' + tag +
       ' residual < 1e-8 (Newton converged at machine precision)',
       m < 1e-8, 'max|res| = ' + m.toExponential(2));
  }
  tryNoFinitePoles('q=0.2 + linear polyPart',
    { poles: [], polyPart: [{ re: 0.02, im: 0 }] },
    { lqd: true, unbounded: true, singular: true, c: 0.5, q: { re: 0.2, im: 0 } });
  tryNoFinitePoles('pure polyPart, q = 0',
    { poles: [], polyPart: [{ re: 0.05, im: 0 }] },
    { lqd: true, unbounded: true, singular: true, c: 0.5, q: { re: 0, im: 0 } });
  tryNoFinitePoles('q=0.3 + complex polyPart',
    { poles: [], polyPart: [{ re: 0.2, im: 0.1 }] },
    { lqd: true, unbounded: true, singular: true, c: 0.5, q: { re: 0.3, im: 0 } });

  // Negative case: still rejected when neither finite poles nor polyPart.
  let threw = false;
  try {
    solveInverseQD({ poles: [], polyPart: [] },
                   { lqd: true, unbounded: true, singular: true, c: 0.5, q: { re: 0.2, im: 0 } });
  } catch (e) { threw = true; }
  // (solveInverseQD may catch and return {success:false, error:...} instead
  //  of throwing; accept either path.)
  let stillRejected = threw;
  if (!stillRejected) {
    const r = solveInverseQD({ poles: [], polyPart: [] },
        { lqd: true, unbounded: true, singular: true, c: 0.5, q: { re: 0.2, im: 0 } });
    stillRejected = !r.success && /no algebraic QD exists/.test(r.error || '');
  }
  ok('unboundedLQD_singular: h = q/w only (no poles, no polyPart) still rejected',
     stillRejected);
}

// ===========================================================================
// UQDLS case (b): higher-order pole at the origin (HANDOFF #24)
// ---------------------------------------------------------------------------
// hData.poles entry with a={re:0,im:0} and principal=[q_2, …, q_{m₀+1}]
// (length m₀; q_1 stays in opts.q). The synthetic γ-branch at z = z₀ pins
// φ such that S₀(w) has the correct order-(m₀+1) pole at w = 0.
//
// Tests check: solves + univalent + residual < 1e-8 + lqdGamma length =
// m₀ + computeTargets.G self-consistency. The IDENTITY check (1e-7) is
// applied to cases that have no polyPart (the polyPart-Res_∞ contribution
// to the identity verifier RHS is a known pre-existing gap inherited from
// HANDOFF #22; polyPart-only cases there also only check residual). The
// β-γ interaction case uses the residual check only.
// ===========================================================================
{
  const Fam = QD_NS.Family.unboundedLQD_singular;
  const residualMaxAbs = (phi, hData) => {
    const res = Fam.residual(phi, hData);
    let m = 0; for (const x of res) m = Math.max(m, Math.abs(x));
    return m;
  };
  const tryGammaCase = (tag, hData, opts, { checkIdentity } = {}) => {
    const r = solveInverseQD(hData, opts);
    const prefix = 'unboundedLQD_singular (γ) :: ' + tag;
    ok(prefix + ' solves',
       r.success === true,
       r.success ? '' : (r.error || 'no error'));
    if (!r.success) return;
    const sol = r.primary;
    ok(prefix + ' family tag', sol.phi.family === 'unboundedLQD_singular');
    ok(prefix + ' univalent', sol.univalent);
    const maxRes = residualMaxAbs(sol.phi, hData);
    ok(prefix + ' residual < 1e-8',
       maxRes < 1e-8, 'max |res| = ' + maxRes.toExponential(2));
    // lqdGamma must be present and length-m0
    const a0 = (hData.poles || []).find(p =>
      Math.hypot(p.a.re, p.a.im) < 1e-10
    );
    const m0 = a0 ? a0.principal.length : 0;
    ok(prefix + ' lqdGamma length = m0=' + m0,
       (sol.phi.lqdGamma || []).length === m0,
       'got length ' + (sol.phi.lqdGamma || []).length);
    // computeTargets.G should match lqdGamma at convergence
    const tgt = Fam.computeTargets(sol.phi, hData);
    let maxErrG = 0;
    for (let l = 0; l < m0; l++) {
      const e = Math.hypot(sol.phi.lqdGamma[l].re - tgt.G[l].re,
                            sol.phi.lqdGamma[l].im - tgt.G[l].im);
      if (e > maxErrG) maxErrG = e;
    }
    ok(prefix + ' γ matches (★)_Γ target',
       maxErrG < 1e-10, 'maxErr=' + maxErrG.toExponential(2));
    if (checkIdentity) {
      ok(prefix + ' identityOK (1e-7)',
         sol.identity.maxRelDiff < 1e-7,
         'maxRelDiff=' + sol.identity.maxRelDiff.toExponential(2));
    }
  };
  tryGammaCase(
    'q + q_2 + one finite pole (m_0=1)',
    {
      poles: [
        { a: {re:0, im:0}, principal: [{re:0.05, im:0}] },   // q_2 = 0.05
        { a: {re:2, im:0}, principal: [{re:1,    im:0}] },
      ],
    },
    { lqd: true, unbounded: true, singular: true,
      c: 0.5, q: { re: 0.2, im: 0 } },
    { checkIdentity: true }
  );
  tryGammaCase(
    'q + q_2 + q_3 + finite pole (m_0=2)',
    {
      poles: [
        { a: {re:0, im:0}, principal: [{re:0.05, im:0}, {re:0.01, im:0}] },
        { a: {re:2, im:0}, principal: [{re:1,    im:0}] },
      ],
    },
    { lqd: true, unbounded: true, singular: true,
      c: 0.5, q: { re: 0.2, im: 0 } },
    { checkIdentity: true }
  );
  tryGammaCase(
    'q + q_2 + finite + polyPart (β-γ interaction)',
    {
      poles: [
        { a: {re:0, im:0}, principal: [{re:0.05, im:0}] },
        { a: {re:2, im:0}, principal: [{re:1,    im:0}] },
      ],
      polyPart: [{ re: 0.02, im: 0 }],
    },
    { lqd: true, unbounded: true, singular: true,
      c: 0.5, q: { re: 0.2, im: 0 } },
    { checkIdentity: true }
  );
  // Complex γ — make sure phase is preserved end-to-end.
  tryGammaCase(
    'q + complex q_2 + finite (m_0=1, complex γ)',
    {
      poles: [
        { a: {re:0, im:0}, principal: [{re:0.03, im:0.04}] },
        { a: {re:2, im:0}, principal: [{re:1,    im:0}] },
      ],
    },
    { lqd: true, unbounded: true, singular: true,
      c: 0.5, q: { re: 0.2, im: 0 } },
    { checkIdentity: true }
  );
}

};
