// Aberth–Ehrlich: all roots of one polynomial at once.
//
// **Why not `@cas/core`'s `rootsMonic`.** The package's Durand–Kerner is the suite's general-purpose
// root finder and it is this one's ORACLE (`test/aberth.test.ts` pins every root of thousands of
// polynomials against it). It is not the engine here, for one reason: this app solves a quarter of a
// million polynomials per frame, and `rootsMonic` allocates — a `ComplexTuple[]` per call plus a
// residual pass per root — where the same work at 16 µs per degree-20 polynomial has to be
// allocation-free to stay inside a frame budget. This solver writes into caller-owned buffers, runs
// Gauss–Seidel (each root sees its neighbours' updates immediately, so it converges in roughly half the
// sweeps of the Jacobi form), and never touches the heap. Two consumers would make it a package
// (ADR-0007); one makes it app-local, pinned.
//
// The iteration is Aberth's correction to Newton — subtract the pull of the other roots before
// stepping, so the roots repel rather than collapsing onto the same one:
//
//     w_k = (p/p')(z_k) / (1 − (p/p')(z_k) · Σ_{j≠k} 1/(z_k − z_j)),   z_k ← z_k − w_k
//
// It is cubically convergent for simple roots, which is what these polynomials mostly have.
//
// **The seed is the UNIT circle, and the textbook radius was measured and removed.** The classical
// Aberth seed is a circle of radius `|a_0/a_d|^{1/d}` — the geometric mean of the root moduli — and for
// this family it is dead weight: the roots of a proper polynomial over a small alphabet cluster near
// `|z| = 1` whatever the coefficients do (for Littlewood, Bousch's `½ < |z| < 2`), so moving the seed
// circle away from 1 moves it away from the roots. Measured over ~20,000 polynomials: on `{−9…9}` at
// degree 14 the geometric-mean seed took 6.99 sweeps against the unit circle's 6.90, and on the WIDE
// alphabets it is supposed to protect it was worse by more — `{1, 1000}` at degree 14 took 9.23 against
// 8.40, `{1, −1, 500, −500}` 7.65 against 6.93. It never won a single case. (Found by a mutation sweep:
// replacing the radius with 1 changed no test, which is what sent the question to a measurement.)
//
// What the seed DOES need is to avoid the real axis, and the angles are offset by a quarter step for it:
// a real seed on a polynomial with a real root makes two iterates start at the same point, where the
// `1/(z_k − z_j)` term divides by zero.
//
// **The stopping rule is the RESIDUAL, and that is not a detail.** Stopping when the step falls below a
// fixed floor looks equivalent and is not: near a double root Aberth degrades from cubic to linear
// convergence and the step stalls at the square root of the noise floor, so a step test tight enough to
// mean anything reports failure on polynomials it has in fact solved. Measured over every Littlewood
// polynomial to degree 12 — 8188 of them — a `|step| < 1e-13` rule failed on five, all with steps stuck
// between 1e-9 and 1e-6 and residuals already at rounding level. Loosening the floor until those five
// pass would be buying the flag rather than earning it. Instead a root is settled when
//
//     |p(z)| ≤ ERR_FACTOR · ε · Σ_k |a_k| |z|^k
//
// which is the backward-error statement "this `z` is an exact root of a polynomial whose coefficients
// differ from ours only by the rounding in evaluating them" — the standard Adams/Igarashi rule. The
// bound `Σ |a_k| |z|^k` is Horner on `|a|` at `|z|`, accumulated in the SAME loop as `p` and `p'`, so it
// costs two flops per term.
//
// **A SMALL STEP IS NOT CONVERGENCE, and treating it as one shipped a wrong answer.** The first version
// of this rule also accepted a root whose step had fallen below a floor, on the reasoning that an
// iterate which has stopped moving has arrived. It has not, and Aberth's own correction is why: when two
// iterates come within `~1e-15` of each other the repulsion sum `Σ 1/(z_k − z_j)` reaches `~1e15`, the
// denominator `1 − (p/p')·Σ` goes with it, and the step is divided down to nothing — the roots are
// FROZEN, not settled. On `−1 + iz + iz²` that rule returned a double root at `−(1+i)/√2` with residual
// 1.47 and reported `converged`, where the true roots are `0.3002 − 0.6248i` and `−1.3002 + 0.6248i`.
// The density then drew two roots that do not exist. The residual is the only certificate; a solve that
// cannot reach it runs out of sweeps and says so, and the caller drops the polynomial rather than
// painting it.

/** The outcome of one solve. `iterations` is the sweep count; `converged` is false on a bail-out. */
export interface AberthResult {
  readonly converged: boolean;
  readonly iterations: number;
  /**
   * The worst relative backward error over the roots, in units of `ε` — `|p(z)| / (ε · Σ|a_k||z|^k)`.
   *
   * This is the solver's own account of how well it did, reported rather than assumed. The residual
   * rule — the only settling rule since PR-1 removed the step rule, which bounded nothing — bounds it by
   * `ERR_FACTOR` on a converged solve. It is read from the FINAL sweep; a solve stops on a sweep in which
   * every root was already settled, so on a converged solve nothing moved after it and it is exactly the
   * backward error at the roots returned (`test/aberth.test.ts` recomputes it). On a give-up it is the
   * last sweep's, before that sweep's corrections.
   */
  readonly backwardErrorEps: number;
}

/** Scratch buffers sized for one degree, reused across every polynomial in a chunk. */
export interface AberthWorkspace {
  readonly degree: number;
  readonly rootRe: Float64Array;
  readonly rootIm: Float64Array;
  /** `|a_j|`, filled once per solve (see `aberth`). */
  readonly coeffAbs: Float64Array;
}

/** Allocate a workspace for polynomials of this degree. */
export function makeWorkspace(degree: number): AberthWorkspace {
  return {
    degree,
    rootRe: new Float64Array(degree),
    rootIm: new Float64Array(degree),
    coeffAbs: new Float64Array(degree + 1),
  };
}

/** Sweeps before giving up. Cubic convergence from a good seed needs well under ten. */
const MAX_SWEEPS = 60;
/** Multiple of `ε · Σ|a_k||z|^k` a residual may reach and still count as settled. */
const ERR_FACTOR = 8;
/** Float64 machine epsilon. */
const EPS = 2.220446049250313e-16;

/**
 * Solve `Σ cRe[k] + i·cIm[k] · z^k = 0` for all `degree` roots, writing them into `ws`.
 *
 * Coefficients are ASCENDING (`cRe[0]` is the constant term) and `cRe[degree]`/`cIm[degree]` must not
 * both be zero. Returns whether every root settled; a caller that cares counts the failures rather than
 * dropping them silently, because "this polynomial did not converge" is a fact about the picture.
 */
export function aberth(
  cRe: Float64Array,
  cIm: Float64Array,
  degree: number,
  ws: AberthWorkspace,
): AberthResult {
  const n = degree;
  const zr = ws.rootRe;
  const zi = ws.rootIm;

  // Seed: the unit circle, angles offset by a quarter step so no seed sits on the real axis (header).
  for (let k = 0; k < n; k++) {
    const t = (2 * Math.PI * (k + 0.25)) / n;
    zr[k] = Math.cos(t);
    zi[k] = Math.sin(t);
  }

  // **The coefficient moduli, once per solve.** The residual's error bound is Horner on `|a_j|` at
  // `|z|`, and it called `Math.hypot(cRe[j], cIm[j])` for every coefficient of every root of every
  // sweep — `n²` hypots a sweep for `n + 1` distinct values. Hoisted, the same numbers in the same
  // order, so the roots are BIT-identical (hashed over all 232,938 polynomials of Littlewood 16, trinary
  // 9 and {−2…2} 6) and the solve 2.6–2.9× faster: 9.8–10.1 s → 3.4–3.9 s (2026-09-26 review).
  const ca = ws.coeffAbs;
  for (let j = 0; j <= n; j++) ca[j] = Math.hypot(cRe[j], cIm[j]);

  // Hoisted so the give-up return can still report what the last sweep measured.
  let worstRel = 0;
  for (let sweep = 1; sweep <= MAX_SWEEPS; sweep++) {
    let allSettled = true;
    worstRel = 0;
    for (let k = 0; k < n; k++) {
      const x = zr[k];
      const y = zi[k];
      const absZ = Math.hypot(x, y);

      // Horner for p and p' together, from the top down, with the residual's own error bound
      // `Σ |a_j| |z|^j` accumulated alongside (Horner on |a| at |z|).
      let pr = cRe[n];
      let pi = cIm[n];
      let dr = 0;
      let di = 0;
      let bound = ca[n];
      for (let j = n - 1; j >= 0; j--) {
        const ndr = dr * x - di * y + pr;
        const ndi = dr * y + di * x + pi;
        dr = ndr;
        di = ndi;
        const npr = pr * x - pi * y + cRe[j];
        const npi = pr * y + pi * x + cIm[j];
        pr = npr;
        pi = npi;
        bound = bound * absZ + ca[j];
      }

      const resid = Math.hypot(pr, pi);
      const rel = bound > 0 ? resid / (EPS * bound) : 0;
      if (rel > worstRel) worstRel = rel;

      // Settled: the residual has reached the rounding noise of evaluating this polynomial here.
      if (resid <= ERR_FACTOR * EPS * bound) continue;

      const den = dr * dr + di * di;
      if (den === 0) {
        // A critical point with a non-negligible residual: this root is NOT settled. Saying so is what
        // keeps `converged` from being true for a polynomial the solver never moved at all.
        allSettled = false;
        continue;
      }
      // ratio = p / p'
      const rr = (pr * dr + pi * di) / den;
      const ri = (pi * dr - pr * di) / den;

      // s = Σ_{j≠k} 1/(z_k − z_j)
      let sr = 0;
      let si = 0;
      for (let j = 0; j < n; j++) {
        if (j === k) continue;
        const ax = x - zr[j];
        const ay = y - zi[j];
        const a2 = ax * ax + ay * ay;
        if (a2 === 0) continue; // coincident iterates: skip the singular term rather than yielding NaN
        sr += ax / a2;
        si -= ay / a2;
      }

      // w = ratio / (1 − ratio·s)
      const wr = 1 - (rr * sr - ri * si);
      const wi = -(rr * si + ri * sr);
      const w2 = wr * wr + wi * wi;
      if (w2 === 0) {
        allSettled = false;
        continue;
      }
      const stepR = (rr * wr + ri * wi) / w2;
      const stepI = (ri * wr - rr * wi) / w2;
      if (!Number.isFinite(stepR) || !Number.isFinite(stepI)) {
        return { converged: false, iterations: sweep, backwardErrorEps: worstRel };
      }

      zr[k] = x - stepR;
      zi[k] = y - stepI;
      // This root was not settled when it was measured; only the next sweep's residual can say it is.
      allSettled = false;
    }
    if (allSettled) return { converged: true, iterations: sweep, backwardErrorEps: worstRel };
  }
  return { converged: false, iterations: MAX_SWEEPS, backwardErrorEps: worstRel };
}

/** `|p(z)|` by Horner — the residual a caller uses to report how well a root is pinned. */
export function residual(
  cRe: Float64Array,
  cIm: Float64Array,
  degree: number,
  x: number,
  y: number,
): number {
  let pr = cRe[degree];
  let pi = cIm[degree];
  for (let j = degree - 1; j >= 0; j--) {
    const npr = pr * x - pi * y + cRe[j];
    const npi = pr * y + pi * x + cIm[j];
    pr = npr;
    pi = npi;
  }
  return Math.hypot(pr, pi);
}
