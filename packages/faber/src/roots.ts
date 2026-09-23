// Complex polynomial root-finder: Durand–Kerner (Weierstrass) via @cas/core's shared kernel, then a
// Newton polish. Ascending-power `Cx[]` in (index i = coeff of ζ^i). Monomial-basis root-finding is
// ill-conditioned at high degree, so on non-convergence we return `converged:false` (callers surface a
// warning) rather than emitting garbage. Ported verbatim from the QD app's faber-analysis.mjs.
import { Complex, cauchyBound, makeDurandKerner, objAlgebra, polishRoot } from "@cas/core";
import type { ComplexTuple, Cx } from "@cas/core";

const C = Complex;
// Durand–Kerner over the {re,im} algebra — the same kernel QD's other root-finders and CD use.
const durandKernerKernel = makeDurandKerner(objAlgebra);

export interface PolynomialRootsOptions {
  maxIter?: number;
  tol?: number;
  polish?: boolean;
}

export interface PolynomialRootsResult {
  roots: Cx[];
  converged: boolean;
  iterations: number;
  degree: number;
}

export function polynomialRoots(
  coeffs: readonly Cx[],
  opts: PolynomialRootsOptions = {},
): PolynomialRootsResult {
  const tol = opts.tol != null ? opts.tol : 1e-12;
  const maxIter = opts.maxIter != null ? opts.maxIter : 200;
  const polish = opts.polish !== false;

  // Strip trailing (highest-degree) near-zero coefficients to find the true degree.
  const a: Cx[] = coeffs ? coeffs.slice() : [];
  while (a.length > 1 && Math.hypot(a[a.length - 1].re, a[a.length - 1].im) < 1e-14) a.pop();
  const d = a.length - 1;
  if (d <= 0) return { roots: [], converged: true, iterations: 0, degree: Math.max(0, d) };

  // Monic normalization (improves DK conditioning).
  const lead = a[d];
  const mon = a.map((co) => C.div(co, lead)); // ascending; mon[d] = 1

  // Cauchy root bound R = 1 + max_{k<d} |a_k| (monic, so |a_d| = 1 and the bound is exactly this).
  const monT: ComplexTuple[] = mon.map((c) => [c.re, c.im]);
  const R = cauchyBound(monT);

  const evalP = (pt: Cx): Cx => {
    let acc: Cx = { re: mon[d].re, im: mon[d].im };
    for (let k = d - 1; k >= 0; k--) acc = C.add(C.mul(acc, pt), mon[k]);
    return acc;
  };

  // Initial guesses on a circle of radius R, angle 2πj/d + 0.4. The phase offset breaks symmetry so no
  // iterate lands exactly on a real root of a highly symmetric polynomial (ζ^n, Chebyshev).
  const seeds: Cx[] = new Array(d);
  for (let j = 0; j < d; j++) {
    const ang = (2 * Math.PI * j) / d + 0.4;
    seeds[j] = { re: R * Math.cos(ang), im: R * Math.sin(ang) };
  }

  // We never pass bailOnNonFinite, so the kernel never returns null.
  const dk = durandKernerKernel(evalP, seeds, { tol, maxIter })!;
  const z = dk.roots;
  const converged = dk.converged;
  const iter = dk.iterations;

  // Newton polish on the monic form (≤ 8 steps, stop below 1e-15) — @cas/core's polishRoot, lifted
  // from this loop and Contour Integration's copy (ADR-0047).
  if (polish) {
    for (let j = 0; j < d; j++) {
      const [re, im] = polishRoot(monT, [z[j].re, z[j].im]);
      z[j] = { re, im };
    }
  }

  return { roots: z, converged, iterations: iter, degree: d };
}
