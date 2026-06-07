'use strict';
// =============================================================================
// faber tests — QD.FaberAnalysis (Faber polynomials of the complement of a UQD).
//
// Oracles are constructed exterior maps φ (no solve) whose Faber polynomials
// are known in closed form:
//   • φ(z) = z          (K = unit disk)        → F_n(ζ) = ζ^n.
//   • φ(z) = z + 1/z    (K = interval [−2,2])  → F_n(ζ) = 2·T_n(ζ/2), Chebyshev.
// Plus root-finder accuracy on polynomials with known roots, and an
// end-to-end check that the interval's Faber roots land on [−2,2].
// =============================================================================
require('./bootstrap');
loadInCtx('faber-analysis.js');   // page-only module (not in the bootstrap CORE list)

module.exports = async function run() {
  section('faber — QD.FaberAnalysis');

  const FA = QD.FaberAnalysis;
  ok('FaberAnalysis exposed on QD', FA && typeof FA.faberPolynomials === 'function');

  const re = (x) => ({ re: x, im: 0 });

  // φ(z) = z  →  unbounded exterior map of the unit disk (c=1, all c_k = 0).
  const phiDisk = { family: 'unboundedQD', unbounded: true, c: 1, polyA: [], branches: [] };
  // φ(z) = z + 1/z  →  exterior map of [−2,2] (c=1, c0=0, c1=1, rest 0).
  const phiJouk = { family: 'unboundedQD', unbounded: true, c: 1, polyA: [re(0), re(1)], branches: [] };

  // ---- Oracle 1: disk → F_n(ζ) = ζ^n ----------------------------------------
  {
    const { coeffs } = FA.faberPolynomials(phiDisk, 8);
    let allOk = true, detail = '';
    for (let n = 0; n <= 8; n++) {
      const Fn = coeffs[n];
      // Expect coeff 1 at degree n, 0 elsewhere.
      for (let k = 0; k <= n; k++) {
        const want = (k === n) ? 1 : 0;
        if (!approxEq(Fn[k] || re(0), re(want), 1e-10)) {
          allOk = false; detail = `F_${n}[${k}]=` + JSON.stringify(Fn[k]); break;
        }
      }
      if (!allOk) break;
    }
    ok('disk: F_n(ζ) = ζ^n for n=0..8', allOk, detail);
  }

  // ---- Oracle 2: interval [−2,2] → F_n(ζ) = 2·T_n(ζ/2) ----------------------
  {
    // Build reference 2·T_n(ζ/2) as a real ascending-coeff array.
    // T_0 = 1, T_1 = x, T_{n+1} = 2x·T_n − T_{n−1}, then x = ζ/2, then ×2.
    const cheb = [];                 // cheb[n] = T_n(x) ascending real coeffs in x
    cheb[0] = [1];
    cheb[1] = [0, 1];
    for (let n = 1; n < 8; n++) {
      const a = cheb[n], b = cheb[n - 1];
      const next = new Array(a.length + 1).fill(0);
      for (let k = 0; k < a.length; k++) next[k + 1] += 2 * a[k];   // 2x·T_n
      for (let k = 0; k < b.length; k++) next[k] -= b[k];           // − T_{n−1}
      cheb[n + 1] = next;
    }
    // ref_n(ζ) = 2·T_n(ζ/2): substitute x=ζ/2 (coeff_k ×(1/2)^k), then ×2.
    const refOf = (n) => cheb[n].map((co, k) => 2 * co * Math.pow(0.5, k));

    const { coeffs } = FA.faberPolynomials(phiJouk, 8);
    let allOk = true, detail = '';
    for (let n = 1; n <= 8; n++) {
      const Fn = coeffs[n];
      const ref = refOf(n);
      for (let k = 0; k <= n; k++) {
        if (!approxEq(Fn[k] || re(0), re(ref[k] || 0), 1e-10)) {
          allOk = false; detail = `n=${n} k=${k} got=` + JSON.stringify(Fn[k]) + ' want=' + (ref[k] || 0); break;
        }
      }
      if (!allOk) break;
    }
    ok('interval: F_n(ζ) = 2·T_n(ζ/2) for n=1..8', allOk, detail);
    // Spot-check the canonical F_2 = ζ^2 − 2.
    ok('interval: F_2 = ζ^2 − 2', approxEq(coeffs[2][0], re(-2), 1e-12)
       && approxEq(coeffs[2][1], re(0), 1e-12) && approxEq(coeffs[2][2], re(1), 1e-12));
  }

  // ---- Root-finder accuracy --------------------------------------------------
  const sortByReIm = (rts) => rts.slice().sort((a, b) => (a.re - b.re) || (a.im - b.im));

  {
    // (ζ−1)(ζ−2)(ζ−3) = ζ^3 − 6ζ^2 + 11ζ − 6  → roots {1,2,3}.
    const r = FA.polynomialRoots([re(-6), re(11), re(-6), re(1)]);
    ok('roots: degree 3 detected', r.degree === 3 && r.converged, 'deg=' + r.degree + ' conv=' + r.converged);
    const s = sortByReIm(r.roots);
    ok('roots: {1,2,3}', s.length === 3 && approxEq(s[0], re(1), 1e-9)
       && approxEq(s[1], re(2), 1e-9) && approxEq(s[2], re(3), 1e-9),
       JSON.stringify(s));
  }

  {
    // (ζ−(1+i))(ζ−(2−i)) = ζ^2 − 3ζ + (3+i)  → roots {1+i, 2−i}.
    const r = FA.polynomialRoots([{ re: 3, im: 1 }, re(-3), re(1)]);
    const s = sortByReIm(r.roots);
    ok('roots: complex {1+i, 2−i}', s.length === 2
       && approxEq(s[0], { re: 1, im: 1 }, 1e-9) && approxEq(s[1], { re: 2, im: -1 }, 1e-9),
       JSON.stringify(s));
  }

  {
    // ζ^5 − 1 → 5th roots of unity (the symmetric case the phase-offset init targets).
    const coeffs = [re(-1), re(0), re(0), re(0), re(0), re(1)];
    const r = FA.polynomialRoots(coeffs);
    let allUnit = r.roots.length === 5;
    for (const z of r.roots) {
      // z^5 should equal 1.
      let z5 = { re: 1, im: 0 };
      for (let i = 0; i < 5; i++) z5 = { re: z5.re * z.re - z5.im * z.im, im: z5.re * z.im + z5.im * z.re };
      if (!approxEq(z5, re(1), 1e-8)) allUnit = false;
    }
    ok('roots: ζ^5−1 → five 5th-roots of unity', allUnit, 'n=' + r.roots.length + ' conv=' + r.converged);
  }

  {
    // (ζ−1)^3 = ζ^3 − 3ζ^2 + 3ζ − 1  → triple root at 1 (DK converges slowly; loose tol).
    const r = FA.polynomialRoots([re(-1), re(3), re(-3), re(1)]);
    let nearOne = r.roots.length === 3;
    for (const z of r.roots) if (Math.hypot(z.re - 1, z.im) > 1e-3) nearOne = false;
    ok('roots: (ζ−1)^3 cluster near 1', nearOne, JSON.stringify(r.roots) + ' conv=' + r.converged);
  }

  {
    // Degenerate inputs return {roots:[]} without throwing.
    let threw = false, out = null;
    try { out = FA.polynomialRoots([re(3)]); } catch (e) { threw = true; }
    ok('roots: degree-0 input → no roots, no throw', !threw && out && out.roots.length === 0);
    let threw2 = false, out2 = null;
    try { out2 = FA.polynomialRoots([]); } catch (e) { threw2 = true; }
    ok('roots: empty input → no roots, no throw', !threw2 && out2 && out2.roots.length === 0);
  }

  // ---- Compose: interval Faber roots land on [−2,2] -------------------------
  {
    const n = 6;
    const Fn = FA.faberPolynomial(phiJouk, n);
    const r = FA.polynomialRoots(Fn);
    // Known roots of 2·T_n(ζ/2): ζ_k = 2·cos((2k−1)π/(2n)), k=1..n (all real, in (−2,2)).
    const want = [];
    for (let k = 1; k <= n; k++) want.push(2 * Math.cos((2 * k - 1) * Math.PI / (2 * n)));
    want.sort((a, b) => a - b);
    const got = r.roots.slice().sort((a, b) => a.re - b.re);
    let match = got.length === n;
    let maxIm = 0;
    for (let k = 0; k < n; k++) {
      maxIm = Math.max(maxIm, Math.abs(got[k].im));
      if (Math.abs(got[k].re - want[k]) > 1e-6) match = false;
      if (Math.abs(got[k].re) > 2 + 1e-6) match = false;
    }
    ok('compose: F_6 roots = 2cos((2k−1)π/12) in [−2,2]', match && maxIm < 1e-6,
       'maxIm=' + maxIm.toExponential(2));
  }

  // ---- formatFaberPoly readability ------------------------------------------
  {
    const Fn = FA.faberPolynomial(phiJouk, 2);     // ζ^2 − 2
    const s = FA.formatFaberPoly(Fn);
    ok('format: F_2 renders as "ζ^2 − 2"', s === 'ζ^2 − 2', 'got="' + s + '"');
    const F1 = FA.faberPolynomial(phiDisk, 1);     // ζ
    ok('format: F_1(disk) renders as "ζ"', FA.formatFaberPoly(F1) === 'ζ', 'got="' + FA.formatFaberPoly(F1) + '"');
  }

  // ---- faberConvergence shape ------------------------------------------------
  {
    const conv = FA.faberConvergence(phiJouk, 5);
    ok('convergence: returns 5 orders n=1..5', conv.length === 5 && conv[0].n === 1 && conv[4].n === 5);
    ok('convergence: each order has roots + converged flag',
       conv.every(o => Array.isArray(o.roots) && typeof o.converged === 'boolean'));
    ok('convergence: low-order interval solves converge', conv.every(o => o.converged));
  }

  // ---- Guards ----------------------------------------------------------------
  {
    let threw = false;
    try { FA.faberPolynomials({ family: 'boundedQD', unbounded: false, c: 1 }, 4); } catch (e) { threw = true; }
    ok('guard: bounded map throws', threw);
    let threw2 = false;
    try { FA.faberPolynomials({ family: 'unboundedQD', unbounded: true, c: 0, polyA: [], branches: [] }, 4); } catch (e) { threw2 = true; }
    ok('guard: c ≤ 0 throws', threw2);
  }
};
