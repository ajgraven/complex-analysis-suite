// faber.ts — the app-facing glue over @cas/faber. Evaluates the exterior map φ (to trace ∂K), builds
// the forward transform Φφ(f) = Σ b_n F_n, and evaluates the resulting polynomial for the right-panel
// coloring. The app never touches the package's internals directly — everything routes through here.
import { Complex, makePoly, objAlgebra, dftOnCircle } from "@cas/core";
import type { Cx } from "@cas/core";
import { faberTransform, faberImageOfPole, evalRationalImage, faberTransformRational, polynomialRoots, weightedFaberPolynomial } from "@cas/faber";
import type { ExteriorMap, RationalImage } from "@cas/faber";
import { parse, makeComplexFn, fToRational } from "@cas/expr";

const P = makePoly(objAlgebra);

/** Decompose an @cas/expr source into a rational num/den (ascending Cx[]) of z, or null if not rational. */
export function exprToRational(src: string): Rational | null {
  let ast;
  try {
    ast = parse(src);
  } catch {
    return null;
  }
  const r = fToRational(ast, [0, 0], [0, 0]);
  if (!r) return null;
  return {
    num: r.num.map((t): Cx => ({ re: t[0], im: t[1] })),
    den: r.den.map((t): Cx => ({ re: t[0], im: t[1] })),
  };
}

/** The exact exterior Faber transform of a rational f = num/den as a rational N(w)/D(w). */
export function transformRational(map: ExteriorMap, r: Rational): Rational {
  return faberTransformRational(map, r.num, r.den);
}

/** Compile a free-form f(z) from an @cas/expr source into a {re,im} evaluator, or return a parse error. */
export function compileExprF(src: string): { fn: (z: Cx) => Cx } | { error: string } {
  let fnRaw: (z: [number, number], c: [number, number]) => [number, number];
  try {
    fnRaw = makeComplexFn(parse(src));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const fn = (z: Cx): Cx => {
    const r = fnRaw([z.re, z.im], [0, 0]);
    return { re: r[0], im: r[1] };
  };
  return { fn };
}

/**
 * Taylor coefficients b₀…b_N of f (analytic on the unit disk) via the DFT of samples on |z| = radius:
 * bₙ = (1 / (M·rⁿ)) Σ_k f(r·ωᵏ) ω^{−nk}, ω = e^{2πi/M}. Sampling at r < 1 damps aliasing from the tail.
 */
export function taylorViaFFT(f: (z: Cx) => Cx, N: number, radius = 0.9): Cx[] {
  const M = Math.max(64, 1 << Math.ceil(Math.log2(4 * (N + 1))));
  const samples: Cx[] = [];
  for (let k = 0; k < M; k++) {
    const th = (2 * Math.PI * k) / M;
    samples.push(f({ re: radius * Math.cos(th), im: radius * Math.sin(th) }));
  }
  // bₙ = ĉₙ / rⁿ, where ĉₙ is the DFT of the ring of samples (the 1/M mean lives inside dftOnCircle).
  return dftOnCircle(samples, N).map((c, n) => {
    const scale = 1 / Math.pow(radius, n);
    return { re: c.re * scale, im: c.im * scale };
  });
}

/** Machine epsilon for IEEE-754 doubles — the balance point for the optimal FFT sampling radius. */
const EPS = 2.220446049250313e-16;

/**
 * Taylor coefficients of f via {@link taylorViaFFT} at an **adaptive** sampling radius. A cheap probe at
 * r = 0.9 estimates the radius of convergence R; when R is finite the true radius is used to place the
 * sample circle at Bornemann's optimum r* = R·ε^{1/M}, which balances aliasing (∼(r/R)^M) against the
 * roundoff amplification (∼ε·(R/r)^N) that wrecks the high-order coefficients at a fixed small radius.
 * Because the coefficients are intrinsic to f (any circle inside |z| < R recovers them), r* may exceed 1
 * — pushing the sample circle toward the nearest singularity, exactly where the tail decays cleanest.
 * Entire f (R = ∞) keeps the probe radius: its coefficients decay super-geometrically already.
 */
export function taylorAdaptive(f: (z: Cx) => Cx, N: number): { coeffs: Cx[]; radius: number; R: number } {
  const M = Math.max(64, 1 << Math.ceil(Math.log2(4 * (N + 1))));
  const probe = taylorViaFFT(f, N, 0.9);
  const R = radiusOfConvergence(probe);
  if (!Number.isFinite(R) || R <= 1) return { coeffs: probe, radius: 0.9, R };
  const rOpt = R * Math.pow(EPS, 1 / M);
  // Stay strictly inside R (cap at 0.98 R so max|f| on the circle can't blow up) and never below the probe.
  const radius = Math.min(Math.max(rOpt, 0.9), 0.98 * R);
  if (Math.abs(radius - 0.9) < 1e-9) return { coeffs: probe, radius, R };
  return { coeffs: taylorViaFFT(f, N, radius), radius, R };
}

/**
 * Drop the noise-dominated tail of an FFT coefficient list: keep b₀…b_L where L is the last index whose
 * magnitude clears a relative floor. Prevents the truncated Faber sum from adding garbage — a coefficient
 * at the ~1e-14 roundoff floor, times an Fₙ that grows geometrically, is O(1) noise (M3 numerical guard).
 */
export function trimTail(b: Cx[], relTol = 1e-10): Cx[] {
  let maxAbs = 0;
  for (const c of b) maxAbs = Math.max(maxAbs, Math.hypot(c.re, c.im));
  if (maxAbs === 0) return b.slice(0, 1);
  const thresh = Math.max(relTol * maxAbs, 1e-13);
  let last = 0;
  for (let n = 0; n < b.length; n++) if (Math.hypot(b[n].re, b[n].im) > thresh) last = n;
  return b.slice(0, last + 1);
}

/**
 * Estimate f's radius of convergence from the ratios |bₙ|/|bₙ₊₁| of its RELIABLE coefficients (above the
 * FFT noise floor). Geometric decay ⇒ the ratio is ~constant ≈ R; super-geometric decay (an entire f) ⇒
 * the ratio climbs without bound, reported as ∞. Robust where a naive |bₙ|^{1/n} is wrecked by the noise
 * floor at high n.
 */
export function radiusOfConvergence(b: Cx[]): number {
  let maxAbs = 0;
  for (const c of b) maxAbs = Math.max(maxAbs, Math.hypot(c.re, c.im));
  if (maxAbs === 0) return Infinity;
  const thresh = Math.max(1e-10 * maxAbs, 1e-13);
  // Reliable NONZERO indices (skipping the constant term). Using the index GAP in the exponent makes the
  // estimate work for lacunary series (even/odd-only coefficients) and cancels any polynomial prefactor,
  // so a geometric b_n ~ c·ρ^{−n} gives ρ exactly rather than a prefactor-biased value.
  const idx: number[] = [];
  for (let n = 1; n < b.length; n++) if (Math.hypot(b[n].re, b[n].im) > thresh) idx.push(n);
  if (idx.length < 2) return Infinity; // coefficients hit the noise floor almost at once ⇒ ~entire
  const gapRatio = (i: number): number => {
    const n0 = idx[i];
    const n1 = idx[i + 1];
    const a = Math.hypot(b[n0].re, b[n0].im);
    const c = Math.hypot(b[n1].re, b[n1].im);
    return Math.pow(a / c, 1 / (n1 - n0));
  };
  const first = gapRatio(0);
  const last = gapRatio(idx.length - 2);
  if (last > 4 && last > 1.5 * first) return Infinity; // ratios climbing ⇒ super-geometric (entire)
  return last;
}

export { evalRationalImage };
export type { RationalImage };

/** f(z) = 1/(z − z₀)^order — the pole input, analytic on the unit disk when |z₀| > 1. */
export function evalPoleInput(z0: Cx, order: number, z: Cx): Cx {
  return Complex.pow(Complex.sub(z, z0), -order);
}

/** The exact closed-form Faber image of the pole input 1/(z − z₀)^order. */
export function poleImage(map: ExteriorMap, z0: Cx, order: number): RationalImage {
  return faberImageOfPole(map, z0, order);
}

/** Evaluate φ(z) = c·z + Σ_{k≥0} c_k·z^{−k} for a finite-Laurent exterior map (z on 𝔻*, |z| ≥ 1). */
export function evalPhi(map: ExteriorMap, z: Cx): Cx {
  let acc: Cx = { re: map.c * z.re, im: map.c * z.im }; // c·z
  let zpow: Cx = { re: 1, im: 0 }; // z^{−k}, starting at z^0
  const zinv = Complex.inv(z);
  for (let k = 0; k < map.laurent.length; k++) {
    acc = Complex.add(acc, Complex.mul(map.laurent[k], zpow));
    zpow = Complex.mul(zpow, zinv);
  }
  return acc;
}

/** φ({|z| = radius}) as a polyline. radius = 1 gives ∂K; radius = R > 1 gives the equipotential Γ_R. */
export function mapCircle(map: ExteriorMap, radius: number, samples = 512): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const theta = (2 * Math.PI * i) / samples;
    const w = evalPhi(map, { re: radius * Math.cos(theta), im: radius * Math.sin(theta) });
    pts.push([w.re, w.im]);
  }
  return pts;
}

/** Sample ∂K = φ(unit circle) as a polyline (the boundary of the bounded complement K). */
export function boundaryK(map: ExteriorMap, samples = 512): [number, number][] {
  return mapCircle(map, 1, samples);
}

/** Taylor coefficients on the unit disk of the monomial f(z) = zⁿ (an ascending Cx[]). */
export function monomialTaylor(n: number): Cx[] {
  const b: Cx[] = [];
  for (let k = 0; k <= n; k++) b.push({ re: k === n ? 1 : 0, im: 0 });
  return b;
}

/** Φφ(f) coefficients (ascending Cx[]) from f's Taylor coefficients on the unit disk. */
export function transformCoeffs(map: ExteriorMap, taylor: Cx[]): Cx[] {
  return faberTransform(map, taylor);
}

/**
 * The corner-suppressing weighted Faber polynomial Q_{n,m} for a monomial input f(z) = zⁿ on a polygonal K
 * (M3): Φφ(zⁿ) = Fₙ, and Q_{n,m} = Σⱼ gⱼ F_{n−j} damps the corner overshoot toward the smooth-arc floor.
 * `cornerImages` are the exterior-SC z-plane prevertices wₖ = 1/uₖ on |w| = 1 (NOT φ(zₖ); empty ⇒ returns Fₙ unchanged).
 */
export function weightedMonomialCoeffs(map: ExteriorMap, cornerImages: readonly Cx[], n: number, m: number): Cx[] {
  return weightedFaberPolynomial(map, cornerImages, n, m);
}

/** Evaluate an ascending-power complex polynomial at w by Horner. */
export function evalPoly(coeffs: Cx[], w: Cx): Cx {
  return P.eval(coeffs, w);
}

/** A rational function num(z)/den(z) as ascending-power coefficient arrays (the renderer's input). */
export interface Rational {
  readonly num: Cx[];
  readonly den: Cx[];
}

const ONE_POLY: Cx[] = [{ re: 1, im: 0 }];

/** A polynomial f as the rational f/1 (for the monomial and Faber-image polynomial cases). */
export function polynomialRational(coeffs: Cx[]): Rational {
  return { num: coeffs, den: ONE_POLY.slice() };
}

/** The pole input f(z) = 1/(z − z₀)^order as num/den. */
export function poleInputRational(z0: Cx, order: number): Rational {
  return { num: ONE_POLY.slice(), den: P.linearPower(z0, order) };
}

/** The exact rational image of the pole input, as num/den over the common denominator (w − p)^order. */
export function poleImageRational(img: RationalImage, order: number): Rational {
  const p = img.poleAt;
  let num = P.zero();
  for (let j = 1; j <= order; j++) {
    num = P.add(num, P.scale(P.linearPower(p, order - j), img.terms[j - 1]));
  }
  return { num, den: P.linearPower(p, order) };
}

/** Evaluate a {@link Rational} at w (the CPU-fallback path). */
export function evalRational(r: Rational, w: Cx): Cx {
  return Complex.div(P.eval(r.num, w), P.eval(r.den, w));
}

/**
 * The zeros of a transform's numerator polynomial — for a monomial input these are the roots of the
 * Faber polynomial Fₙ (the classic "roots cluster on/around K" picture); for the truncated series they
 * approximate the zeros of Φφ(f). Returns [] for a constant numerator or when Durand–Kerner did not
 * converge (ill-conditioned high degree), so unreliable roots are never scattered.
 */
export function transformRoots(num: Cx[]): Cx[] {
  if (num.length < 2) return [];
  const r = polynomialRoots(num);
  return r.converged ? r.roots : [];
}
