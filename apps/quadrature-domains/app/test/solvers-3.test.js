'use strict';
// solvers-3.test.js — shard 3/4 of the former monolithic solvers.test.js (refactor Stage B2, QD-TEST-5).
// EXACT contiguous slice of the original run() body (original lines 936-1233); split only for parallelism.
// Concatenating all 4 shard bodies reproduces the original body byte-for-byte (verified). The module-scope
// preamble is the original's, preserved verbatim; shared kernels + harness (ok, C, T, vm/ctx, Schwarz, PS, ...)
// are installed on `global` by test/bootstrap.js, so bare names resolve exactly as in the monolith.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP_DIR = path.join(__dirname, '..');
require('./bootstrap');
module.exports = async function run() {

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
};
