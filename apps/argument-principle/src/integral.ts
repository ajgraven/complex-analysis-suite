// integral.ts — the analytic side of the argument principle (§11 B4): the contour integral
//
//     (1 / 2πi) ∮_γ f′/f dz  =  Z − P
//
// computed as a numerical quadrature of f′/f along the sampled contour, INDEPENDENTLY of the winding
// accumulation. The winding (A1) is the topological reading — turns of the image about 0; this is the
// analytic reading — a Riemann sum of the logarithmic derivative. That the two agree, and both round to
// the exact Z − P count, is the whole theorem, and showing all three side by side is the pedagogy.
//
// Honest labelling: this is a quadrature, so it is `≈` even for a rational f — the point is precisely that
// the estimate rounds to the exact `=` count. The 1/2πi normalization lives HERE, at the app edge, never
// in a core package (ADR-0006): @cas/core carries no π/2πi constants.

export type Cplx = readonly [number, number];

const cdiv = (a: Cplx, b: Cplx): Cplx => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const cmul = (a: Cplx, b: Cplx): Cplx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const finite = (z: Cplx): boolean => Number.isFinite(z[0]) && Number.isFinite(z[1]);

/**
 * The running ∮ f′/f dz along the CLOSED polyline `zPts`, by the trapezoidal rule. Returns an array of
 * length n+1 of partial complex integrals: entry `k` is the integral over the first `k` edges (entry 0 is
 * 0, entry n is the full loop). If the integrand is non-finite at a sample (a zero or pole sitting on the
 * contour), that edge contributes nothing and the running value from there is flagged non-finite.
 */
export function logDerivCumulative(
  f: (z: Cplx) => Cplx,
  fp: (z: Cplx) => Cplx,
  zPts: readonly Cplx[],
): Cplx[] {
  const n = zPts.length;
  if (n < 2) return [[0, 0]];
  const g = (z: Cplx): Cplx => cdiv(fp(z), f(z)); // the logarithmic derivative f′/f
  const out: Cplx[] = new Array<Cplx>(n + 1);
  out[0] = [0, 0];
  let acc: Cplx = [0, 0];
  let gPrev = g(zPts[0]);
  let broke = false;
  for (let i = 1; i <= n; i++) {
    const zi = zPts[i % n];
    const zPrev = zPts[(i - 1) % n];
    const gi = g(zi);
    const dz: Cplx = [zi[0] - zPrev[0], zi[1] - zPrev[1]];
    if (broke || !finite(gPrev) || !finite(gi)) {
      broke = true;
      out[i] = [NaN, NaN];
    } else {
      const avg: Cplx = [0.5 * (gPrev[0] + gi[0]), 0.5 * (gPrev[1] + gi[1])];
      const term = cmul(avg, dz);
      acc = [acc[0] + term[0], acc[1] + term[1]];
      out[i] = acc;
    }
    gPrev = gi;
  }
  return out;
}

/** The full-loop ∮ f′/f dz (its last cumulative entry). */
export function logDerivIntegral(
  f: (z: Cplx) => Cplx,
  fp: (z: Cplx) => Cplx,
  zPts: readonly Cplx[],
): Cplx {
  const c = logDerivCumulative(f, fp, zPts);
  return c[c.length - 1];
}

/** The partial ∮ f′/f dz through fraction `upto` ∈ [0,1] of the loop, linearly interpolated within an edge. */
export function partialLogDerivIntegral(
  f: (z: Cplx) => Cplx,
  fp: (z: Cplx) => Cplx,
  zPts: readonly Cplx[],
  upto: number,
): Cplx {
  const c = logDerivCumulative(f, fp, zPts);
  const n = c.length - 1; // edge count
  if (n < 1) return [0, 0];
  const x = Math.max(0, Math.min(1, upto)) * n;
  const whole = Math.floor(x);
  if (whole >= n) return c[n];
  const a = c[whole];
  const b = c[whole + 1];
  if (!finite(a) || !finite(b)) return [NaN, NaN];
  const frac = x - whole;
  return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
}

/**
 * (1 / 2πi) · I, the value that equals Z − P. Dividing I = a + bi by 2πi gives (b − ai)/2π, so the
 * theorem's real integer count is Im(I)/2π and the (vanishing, for a closed loop) modulus part is
 * −Re(I)/2π.
 */
export function normalizeByTwoPiI(I: Cplx): Cplx {
  return [I[1] / (2 * Math.PI), -I[0] / (2 * Math.PI)];
}
