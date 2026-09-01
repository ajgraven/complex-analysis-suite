// Classical interior-droplet Hele-Shaw / Polubarinova–Galin evolver (M4c.1a — the equation + its oracle).
//
// A bounded fluid droplet D(t) is the image of the unit disk under a univalent interior conformal map
//
//   f(w, t) = Σ_{k≥1} a_k(t) · w^k          (f(0, t) = 0 — the injection point is the image of w = 0)
//
// fed by a point source of strength Q in the fluid. With the free-boundary condition (constant pressure on
// ∂D, Darcy's law V_n = −∂p/∂n), the boundary evolution is the **classical Polubarinova–Galin equation**
//
//   Re[ ḟ(w, t) · conj( w · f'(w, t) ) ] = (Q / 2π) · P(a, w)      on |w| = 1                        (PG)
//
// where P(a, ·) is the Poisson kernel of the disk at the source preimage `a` (a = 0 for injection at the
// droplet's center, where P ≡ 1 and the right-hand side is the constant Q/2π). This is a DIFFERENT
// scenario from the M4a Graven–Makarov family (`heleShawOnePoint.ts`): there the quadrature node sits at
// w₀ = 2 in the *unbounded* exterior geometry and the whole family is closed form (`=`); here the droplet
// is *bounded*, the source lives *inside* the fluid, and general shapes evolve by numerical integration of
// (PG) (`≈`, the M4c.1b stepper). This module is the exact SPINE that stepper is validated against: the
// residual (the equation itself) and a corpus of classical closed-form benchmarks (the oracle).
//
// Well-posedness: injection (Q > 0) is a smoothing, forward-well-posed flow (the circle is a stable
// self-similar attractor); suction (Q < 0) is the ill-posed, cusp/finger-forming direction (RISKS §3) and
// any evolution there is strictly `≈`/`⚠`. Refs: Polubarinova-Kochina & Galin (1945); Gustafsson–Vasil'ev,
// *Conformal and Potential Analysis in Hele-Shaw Cells*; Howison, *Complex variable methods in Hele-Shaw
// moving boundary problems*.

export type Cx = readonly [re: number, im: number];

const add = (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const conj = (a: Cx): Cx => [a[0], -a[1]];
const abs2 = (a: Cx): number => a[0] * a[0] + a[1] * a[1];
const cabs = (a: Cx): number => Math.hypot(a[0], a[1]);

/** Point of the unit circle at angle θ. */
const onCircle = (theta: number): Cx => [Math.cos(theta), Math.sin(theta)];

// --- the interior map f(w) = Σ_{k≥1} a_k w^k ----------------------------------------------------------
// Coefficients are stored leading-index-first with NO constant term: `coeffs[k-1]` is a_k (the coefficient
// of w^k), so `coeffs[0]` is a₁ (the conformal radius when real-positive) and f(0) = 0.

/** f(z) = Σ_{k≥1} a_k z^k. */
export function evalMap(coeffs: readonly Cx[], z: Cx): Cx {
  let acc: Cx = [0, 0];
  let zk: Cx = [1, 0];
  for (let k = 1; k <= coeffs.length; k++) {
    zk = mul(zk, z); // z^k
    acc = add(acc, mul(coeffs[k - 1], zk));
  }
  return acc;
}

/** f'(z) = Σ_{k≥1} k·a_k z^{k-1}. */
export function evalMapPrime(coeffs: readonly Cx[], z: Cx): Cx {
  let acc: Cx = [0, 0];
  let zk: Cx = [1, 0]; // z^{k-1}
  for (let k = 1; k <= coeffs.length; k++) {
    acc = add(acc, mul([k * coeffs[k - 1][0], k * coeffs[k - 1][1]], zk));
    zk = mul(zk, z);
  }
  return acc;
}

// --- the source term (the right-hand side of (PG)) ----------------------------------------------------

/** A point source injected into the fluid. `strength` = Q (area/time; Q > 0 injects, Q < 0 suctions —
 *  ill-posed). `at` is the source's preimage in the disk (default 0, the droplet center); |at| < 1. */
export interface Source {
  readonly strength: number;
  readonly at?: Cx;
}

/** The Poisson kernel P(a, e^{iθ}) = (1 − |a|²) / |e^{iθ} − a|² (≡ 1 at a = 0). Normalized so
 *  (1/2π)∮ P dθ = 1, hence ∮ (Q/2π)·P dθ = Q — the total injected flux, independent of the source site.
 *  `a` must be an INTERIOR source (|a| < 1); on/outside the disk the kernel is not defined, so a source
 *  coinciding with the boundary sample point would give 0/0 — guarded to 0 rather than NaN. */
export function poissonKernel(a: Cx, theta: number): number {
  const r2 = abs2(a);
  if (r2 < 1e-300) return 1;
  const d = onCircle(theta);
  const dist2 = abs2([d[0] - a[0], d[1] - a[1]]);
  return dist2 < 1e-300 ? 0 : (1 - r2) / dist2;
}

/** The (PG) right-hand side (Q/2π)·P(a, e^{iθ}) on the boundary. */
export function sourceDensity(src: Source, theta: number): number {
  return (src.strength / (2 * Math.PI)) * poissonKernel(src.at ?? [0, 0], theta);
}

// --- the Polubarinova–Galin residual (the equation) ---------------------------------------------------

/** The pointwise (PG) residual Re[ḟ·conj(w f')] − (Q/2π)P(a,·) at w = e^{iθ}. Zero (to machine precision)
 *  exactly when (coeffs, coeffsDot) satisfy the interior Hele-Shaw law for `src` at this boundary point —
 *  the check the M4c.1b stepper drives to zero at each step. `coeffsDot` are the ȧ_k (same indexing). */
export function pgResidual(
  coeffs: readonly Cx[],
  coeffsDot: readonly Cx[],
  src: Source,
  theta: number,
): number {
  const w = onCircle(theta);
  let fdot: Cx = [0, 0]; // Σ ȧ_k w^k
  let wfp: Cx = [0, 0]; // w f'(w) = Σ k a_k w^k
  let wk: Cx = [1, 0];
  const n = Math.max(coeffs.length, coeffsDot.length);
  for (let k = 1; k <= n; k++) {
    wk = mul(wk, w); // w^k
    if (k <= coeffsDot.length) fdot = add(fdot, mul(coeffsDot[k - 1], wk));
    if (k <= coeffs.length) wfp = add(wfp, mul([k * coeffs[k - 1][0], k * coeffs[k - 1][1]], wk));
  }
  const lhs = mul(fdot, conj(wfp))[0]; // Re[ḟ·conj(w f')]
  return lhs - sourceDensity(src, theta);
}

/** sup_θ |pgResidual| over a uniform boundary sample — the harness gauge for how well (coeffs, coeffsDot)
 *  solve (PG). Exact benchmarks drive this to ~1e-13; a linearized state leaves an O(ε²) remainder. */
export function pgResidualSup(
  coeffs: readonly Cx[],
  coeffsDot: readonly Cx[],
  src: Source,
  samples = 512,
): number {
  let mx = 0;
  for (let i = 0; i < samples; i++) {
    mx = Math.max(mx, Math.abs(pgResidual(coeffs, coeffsDot, src, (2 * Math.PI * i) / samples)));
  }
  return mx;
}

// --- geometry & invariants ----------------------------------------------------------------------------

/** The droplet area A = π · Σ_k k·|a_k|² (exact, from Green's theorem on f(∂𝔻)). */
export function dropletArea(coeffs: readonly Cx[]): number {
  let s = 0;
  for (let k = 1; k <= coeffs.length; k++) s += k * abs2(coeffs[k - 1]);
  return Math.PI * s;
}

/** dA/dt = 2π · Σ_k k·Re(conj(a_k)·ȧ_k). For any exact (PG) solution this equals the source strength Q
 *  (the conserved-flux identity) — the M4c.1b area/moment-drift monitor watches |dA/dt − Q|. */
export function areaRate(coeffs: readonly Cx[], coeffsDot: readonly Cx[]): number {
  let s = 0;
  const n = Math.min(coeffs.length, coeffsDot.length);
  for (let k = 1; k <= n; k++) s += k * mul(conj(coeffs[k - 1]), coeffsDot[k - 1])[0];
  return 2 * Math.PI * s;
}

/** min over |w| = 1 of |f'(w)| — the cusp/univalence gauge (→ 0 as the boundary forms a cusp; the hard
 *  ⚠ stop for any evolution). */
export function minAbsMapPrime(coeffs: readonly Cx[], samples = 1440): number {
  let mn = Infinity;
  for (let i = 0; i < samples; i++) {
    mn = Math.min(mn, cabs(evalMapPrime(coeffs, onCircle((2 * Math.PI * i) / samples))));
  }
  return mn;
}

// --- the oracle: exact closed-form benchmarks (`=`) ---------------------------------------------------

/** Exact self-similar disk. A disk f = a₁·w under a central source stays a disk; πa₁² grows linearly at
 *  rate Q, so a₁(t) = √(a₁(0)² + Q·t/π). */
export function circleRadius(a1Initial: number, Q: number, t: number): number {
  return Math.sqrt(a1Initial * a1Initial + (Q * t) / Math.PI);
}

/** ȧ₁ for the exact disk solution (central source): ȧ₁ = Q/(2π a₁). */
export function circleRate(a1: number, Q: number): Cx {
  return [Q / (2 * Math.PI * a1), 0];
}

/** The exact linearized modal log-rate for a near-circular droplet f = a₁w + ε_n w^n under a central
 *  source: ε̇_n/ε_n = −n·ȧ₁/a₁ = −n·Q/(2π a₁²). Injection (Q>0) DECAYS every mode (the circle is a stable
 *  attractor); suction (Q<0) GROWS them (fingering, ill-posed). */
export function linearModeRate(a1: number, n: number, Q: number): number {
  return (-n * Q) / (2 * Math.PI * a1 * a1);
}

/** The exact linearized invariant ε_n·a₁^n (conserved along the central-source flow to first order): a
 *  clean closed-form check for the stepper's near-circular regime. */
export function linearInvariant(a1: number, epsN: Cx, n: number): Cx {
  return [epsN[0] * a1 ** n, epsN[1] * a1 ** n];
}

/** The exact two-term polynomial solution f = a₁w + a₂w² (real a₁ > 2|a₂| > 0) under a central source: the
 *  rates (ȧ₁, ȧ₂) that make it an EXACT (PG) solution (residual ≡ 0, not just O(ε²)) — the classic cusp-
 *  forming example. With D = a₁² − 4a₂²: ȧ₁ = Q·a₁/(2πD), ȧ₂ = −Q·a₂/(πD). The map degenerates (f'
 *  vanishes on |w|=1 → a 4/3-cusp) as a₁ → 2a₂, i.e. D → 0. */
export function quadraticSolutionRates(a1: number, a2: number, Q: number): readonly [Cx, Cx] {
  const D = a1 * a1 - 4 * a2 * a2;
  return [
    [(Q * a1) / (2 * Math.PI * D), 0],
    [(-Q * a2) / (Math.PI * D), 0],
  ];
}

// --- the vortex overlay (honest labeling) -------------------------------------------------------------

/** A rigid co-rotation of the droplet at angular rate ω: ḟ_spin = iω·f, i.e. ȧ_k += iω·a_k for every k.
 *  In the pure scalar-pressure (Darcy) model a vortex at the center adds exactly this rigid spin of the
 *  label — it injects NO area (Σ over the circle of its (PG) contribution is 0) and does not change the
 *  droplet's SHAPE, only spins it. It is the honest "twist" available to the classical interior model; a
 *  genuinely shape-changing spin is the exterior Graven–Makarov family (M4a), a different scenario. */
export function rigidSpinRate(coeffs: readonly Cx[], omega: number): Cx[] {
  return coeffs.map((a) => [-omega * a[1], omega * a[0]]); // iω·a_k
}
