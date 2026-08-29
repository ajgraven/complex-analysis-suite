// The interior-droplet Hele-Shaw time-stepper (M4c.1b — the numerical evolver `≈`). Integrates the
// classical Polubarinova–Galin equation (`heleShawInterior.ts`) forward in time for an arbitrary bounded
// droplet f(w,t) = Σ_{k≥1} a_k(t) w^k fed by a point source in the fluid, and reports an honest correctness
// monitor (conserved-moment drift) and a hard cusp / ill-posedness stop.
//
// METHOD — the classical Galin–Kufarev spectral solve (no least squares). Dividing (PG) by |w f'|²,
//
//   Re[ P(w) ] = S(θ) / |w f'(w)|²  =: R(θ)  on |w|=1,   where   P(w) = ḟ(w) / (w f'(w))
//
// P is ANALYTIC in the disk (the w's cancel; P(0) = ȧ₁/a₁), so recovering it from its known boundary real
// part is a Dirichlet problem solved directly by one DFT: P(w) = R̂₀ + 2·Σ_{n≥1} R̂ₙ wⁿ (+ i·gauge). Then
// ḟ = P·(w f') is one polynomial multiply, and ȧₖ = [wᵏ]ḟ. The conformal-radius normalization (a₁ real)
// fixes the imaginary gauge constant to 0. Exact for the closed-form benchmarks in `heleShawInterior.ts`;
// `≈` for general shapes (truncation + time discretization).
//
// Well-posedness: injection (Q>0) is the forward-stable, smoothing direction. Suction (Q<0) is ill-posed
// (cusp/finger formation, RISKS §3) and is blocked unless explicitly opted into, always `⚠`.

import { dftOnCircle } from "@cas/core";
import type { Cx as CxObj } from "@cas/core";
import {
  evalMapPrime,
  sourceDensity,
  dropletArea,
  minAbsMapPrime,
  rigidSpinRate,
  type Cx,
  type Source,
} from "./heleShawInterior.js";

// tuple-complex helpers (the interior map uses readonly [re, im]; @cas/core's DFT uses {re, im})
const cadd = (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]];
const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cconj = (a: Cx): Cx => [a[0], -a[1]];
const cabs2 = (a: Cx): number => a[0] * a[0] + a[1] * a[1];
const cscale = (a: Cx, s: number): Cx => [a[0] * s, a[1] * s];
const onCircle = (theta: number): Cx => [Math.cos(theta), Math.sin(theta)];

/** A comfortable, power-of-two boundary-sample count for a degree-N map (R = S/|wf'|² is not band-limited,
 *  so oversample generously relative to N). */
function sampleCount(n: number): number {
  return Math.max(256, 1 << Math.ceil(Math.log2(16 * (n + 1))));
}

/**
 * The Polubarinova–Galin velocity ȧ = {ȧ_k} for the current droplet `coeffs` = {a_k} under `src` (a point
 * source in the fluid). The classical spectral solve above; returns the SHAPE velocity in the a₁-real gauge
 * (a physical rigid spin is added separately, {@link rigidSpinRate}). Grows ill-conditioned as the droplet
 * nears a cusp (|w f'| → 0 somewhere), where R = S/|wf'|² blows up — guard with {@link minAbsMapPrime}.
 */
export function pgVelocity(coeffs: readonly Cx[], src: Source, samples = sampleCount(coeffs.length)): Cx[] {
  const N = coeffs.length;
  const M = samples;
  // R(θ) = S / |w f'(w)|² sampled on the boundary (as {re,im} for the DFT).
  const R: CxObj[] = new Array(M);
  for (let k = 0; k < M; k++) {
    const theta = (2 * Math.PI * k) / M;
    const w = onCircle(theta);
    const u = cmul(w, evalMapPrime(coeffs, w)); // w f'(w)
    R[k] = { re: sourceDensity(src, theta) / cabs2(u), im: 0 };
  }
  // P(w) = R̂₀ + 2 Σ_{n≥1} R̂ₙ wⁿ (+ i·0 gauge): the analytic completion of Re P|∂ = R.
  const Rhat = dftOnCircle(R, N); // indices 0..N
  const P: Cx[] = Rhat.map((c, n) => (n === 0 ? [c.re, 0] : [2 * c.re, 2 * c.im]));
  // u as a polynomial: u_k = k·a_k (k = 1..N), u₀ = 0. ḟ = P·u, then ȧ_m = [wᵐ]ḟ for m = 1..N.
  const dot: Cx[] = new Array(N);
  for (let m = 1; m <= N; m++) {
    let acc: Cx = [0, 0];
    for (let j = 0; j <= m - 1; j++) {
      const kk = m - j; // u index (1..N)
      if (kk >= 1 && kk <= N) acc = cadd(acc, cmul(P[j], cscale(coeffs[kk - 1], kk)));
    }
    dot[m - 1] = acc;
  }
  return dot;
}

/** The full coefficient velocity = the source-driven shape velocity + an optional rigid co-rotation iω·f. */
function velocity(coeffs: readonly Cx[], src: Source, spin: number, samples: number): Cx[] {
  const shape = pgVelocity(coeffs, src, samples);
  if (!spin) return shape;
  const spinDot = rigidSpinRate(coeffs, spin);
  return shape.map((d, i) => cadd(d, spinDot[i]));
}

const vcombine = (a: readonly Cx[], b: readonly Cx[], sb: number): Cx[] =>
  a.map((ak, i) => cadd(ak, cscale(b[i], sb)));

/** One classical RK4 step of the (PG) flow in coefficient space. */
export function stepDroplet(coeffs: readonly Cx[], src: Source, dt: number, spin = 0): Cx[] {
  const M = sampleCount(coeffs.length);
  const k1 = velocity(coeffs, src, spin, M);
  const k2 = velocity(vcombine(coeffs, k1, dt / 2), src, spin, M);
  const k3 = velocity(vcombine(coeffs, k2, dt / 2), src, spin, M);
  const k4 = velocity(vcombine(coeffs, k3, dt), src, spin, M);
  return coeffs.map((ak, i) => [
    ak[0] + (dt / 6) * (k1[i][0] + 2 * k2[i][0] + 2 * k3[i][0] + k4[i][0]),
    ak[1] + (dt / 6) * (k1[i][1] + 2 * k2[i][1] + 2 * k3[i][1] + k4[i][1]),
  ]);
}

// --- conserved-moment monitor (the `≈` correctness gauge) ---------------------------------------------

/** The Richardson complex moments M_k = ∫∫_D z^k dA = ½∮ f^k·conj(f)·w·f' dθ, k = 1..K. Under injection
 *  at the droplet center they are CONSERVED (Richardson 1972; dM_k/dt = Q·a^k = 0 for a central source),
 *  while M₀ = area grows at rate Q — the interior analogue of M4a's conserved quadrature charge. */
export function interiorMoments(coeffs: readonly Cx[], K: number, samples = sampleCount(coeffs.length)): Cx[] {
  const M = samples;
  const out: Cx[] = Array.from({ length: K }, () => [0, 0]);
  for (let s = 0; s < M; s++) {
    const theta = (2 * Math.PI * s) / M;
    const w = onCircle(theta);
    let f: Cx = [0, 0];
    let wk: Cx = [1, 0];
    for (let k = 1; k <= coeffs.length; k++) {
      wk = cmul(wk, w);
      f = cadd(f, cmul(coeffs[k - 1], wk));
    }
    const wfp = cmul(w, evalMapPrime(coeffs, w)); // w f'(w)
    const base = cmul(cconj(f), wfp); // conj(f)·w·f'
    let fk: Cx = [1, 0]; // f^k
    for (let k = 1; k <= K; k++) {
      fk = cmul(fk, f);
      const term = cmul(fk, base);
      out[k - 1] = [out[k - 1][0] + term[0], out[k - 1][1] + term[1]];
    }
  }
  // ½ · (2π/M) Σ  = (π/M) Σ
  return out.map((m) => cscale(m, Math.PI / M));
}

/** max_k |M_k(now) − M_k(ref)| — the drift of the conserved moments, the honest `≈` error bar. */
export function momentDrift(ref: readonly Cx[], now: readonly Cx[]): number {
  let d = 0;
  for (let i = 0; i < ref.length; i++) d = Math.max(d, Math.hypot(now[i][0] - ref[i][0], now[i][1] - ref[i][1]));
  return d;
}

// --- the evolution driver -----------------------------------------------------------------------------

export interface DropletFrame {
  /** Elapsed time. */
  readonly t: number;
  /** The interior-map coefficients a₁…a_N at this frame. */
  readonly coeffs: Cx[];
  /** The droplet area A = π Σ k|a_k|². */
  readonly area: number;
  /** min over |w|=1 of |f'| — the cusp gauge. */
  readonly minFPrime: number;
  /** max_k |M_k − M_k(0)| — conserved-moment drift (the `≈` error bar). */
  readonly momentDrift: number;
}

export type StopReason = "reached-tMax" | "max-frames" | "cusp" | "diverged" | "suction-blocked";

export interface EvolveOptions {
  /** Base time step (adaptively shrunk near a cusp). */
  readonly dt?: number;
  /** Integrate until this elapsed time. */
  readonly tMax?: number;
  /** Hard cap on frames (also bounds runtime). */
  readonly maxFrames?: number;
  /** Stop when min|f'| falls below `cuspFrac·|a₁(0)|` — the (scale-invariant) ⚠ cusp stop. */
  readonly cuspFrac?: number;
  /** Number of conserved moments to monitor. */
  readonly moments?: number;
  /** A rigid co-rotation rate ω (the honest interior "twist"; area- and shape-neutral). */
  readonly spin?: number;
  /** Opt in to the ILL-POSED suction direction (Q<0). Off by default; always `⚠` when on. */
  readonly allowSuction?: boolean;
}

/**
 * Evolve a droplet from `coeffs0` under `src`, returning the timeline of frames and why it stopped. The
 * flow is `≈` (numerical); the reported `momentDrift` is its error bar and a `"cusp"` stop is the hard `⚠`
 * edge (never integrated past). Suction (Q<0) is refused unless `allowSuction` is set.
 */
export function evolveDroplet(
  coeffs0: readonly Cx[],
  src: Source,
  opts: EvolveOptions = {},
): { frames: DropletFrame[]; stop: StopReason } {
  const dt0 = opts.dt ?? 0.01;
  const tMax = opts.tMax ?? Infinity;
  const maxFrames = opts.maxFrames ?? 400;
  const cuspFrac = opts.cuspFrac ?? 0.02;
  const K = opts.moments ?? 3;
  const spin = opts.spin ?? 0;

  if (src.strength < 0 && !opts.allowSuction) {
    return { frames: [], stop: "suction-blocked" };
  }

  const a1mag0 = Math.hypot(coeffs0[0][0], coeffs0[0][1]);
  const cuspStop = cuspFrac * a1mag0;
  const refMoments = interiorMoments(coeffs0, K);

  const frameOf = (t: number, coeffs: Cx[]): DropletFrame => ({
    t,
    coeffs,
    area: dropletArea(coeffs),
    minFPrime: minAbsMapPrime(coeffs),
    momentDrift: momentDrift(refMoments, interiorMoments(coeffs, K)),
  });

  const frames: DropletFrame[] = [frameOf(0, coeffs0.map((a) => [a[0], a[1]] as Cx))];
  let coeffs: Cx[] = coeffs0.map((a) => [a[0], a[1]] as Cx);
  let t = 0;

  while (frames.length < maxFrames && t < tMax) {
    const minF = minAbsMapPrime(coeffs);
    if (minF < cuspStop) return { frames, stop: "cusp" }; // ⚠ the ill-posed edge — never step past it
    // adaptive step: shrink as the cusp approaches; never overshoot tMax
    const dt = Math.min(dt0 * Math.min(1, minF / a1mag0), tMax - t);
    if (!(dt > 0)) break;
    const next = stepDroplet(coeffs, src, dt, spin);
    if (next.some((a) => !Number.isFinite(a[0]) || !Number.isFinite(a[1]))) {
      return { frames, stop: "diverged" };
    }
    coeffs = next;
    t += dt;
    frames.push(frameOf(t, coeffs));
  }
  return { frames, stop: t >= tMax ? "reached-tMax" : "max-frames" };
}

/** Rotate the disk pre-image so a₁ is real ≥ 0 (the conformal-radius gauge): a_k ↦ a_k·e^{−ik·arg a₁}. A
 *  reparametrization — the physical droplet is unchanged — for canonicalizing initial data. */
export function canonicalize(coeffs: readonly Cx[]): Cx[] {
  const psi = Math.atan2(coeffs[0][1], coeffs[0][0]);
  if (Math.abs(psi) < 1e-15) return coeffs.map((a) => [a[0], a[1]] as Cx);
  return coeffs.map((a, i) => {
    const k = i + 1;
    const c = Math.cos(k * psi);
    const s = Math.sin(k * psi);
    return [a[0] * c + a[1] * s, -a[0] * s + a[1] * c]; // a·e^{−ikψ}
  });
}
