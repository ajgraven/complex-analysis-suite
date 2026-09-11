// Finding the poles of a rational integrand, and saying honestly how well they are known.
//
// `@cas/core`'s `makeDurandKerner` is an **iteration**, not a root-finder: it takes seeds the caller
// supplies and refines them, with no seeding, deflation, multiplicity detection or polish (research
// 08 §2). All of that lives here.
//
// Everything this module reports is `≈`. Floating roots are estimates, and a pole location computed
// in floating point is an estimate wearing a decision's clothes — the exact path (squarefree
// decomposition over ℚ(i), so multiplicity is *known* rather than inferred from a cluster of nearly
// coincident floats) arrives in M2 and will upgrade these labels to `=`.
import { tupleAlgebra, makeDurandKerner, type ComplexTuple } from "@cas/core";
import { fToRational, type Node } from "@cas/expr";
import { estimate, unknown, type Certificate } from "@cas/rigor";

export type Cx = ComplexTuple;
type Poly = Cx[]; // ascending: p[k] is the coefficient of z^k

const durandKerner = makeDurandKerner(tupleAlgebra);

export interface Pole {
  readonly at: Cx;
  /**
   * Multiplicity, inferred by clustering nearly coincident roots. An inference, not a measurement —
   * see `orderCertain`.
   */
  readonly order: number;
  /** False when the cluster was tight enough to be ambiguous, or the numerator nearly vanishes too. */
  readonly orderCertain: boolean;
  /**
   * True when the numerator is also ~0 here, so the singularity may be **removable** and this may
   * not be a pole at all. `fToRational` does not reduce to lowest terms, so this happens for real.
   * Flagged rather than silently dropped: quietly removing a pole that is genuinely there would
   * change an integral's value with no visible cause.
   */
  readonly possiblyRemovable: boolean;
}

export interface PoleReport {
  readonly poles: readonly Pole[];
  /** False when f is not a rational function of z, in which case `poles` is empty and nothing is claimed. */
  readonly rational: boolean;
  readonly certificates: readonly Certificate[];
}

const abs = (z: Cx): number => Math.hypot(z[0], z[1]);

/** Horner evaluation of an ascending-coefficient polynomial. */
export function evalPoly(p: Poly, z: Cx): Cx {
  let re = 0;
  let im = 0;
  for (let k = p.length - 1; k >= 0; k--) {
    const nr = re * z[0] - im * z[1] + p[k][0];
    im = re * z[1] + im * z[0] + p[k][1];
    re = nr;
  }
  return [re, im];
}

/** Drop trailing (highest-degree) coefficients that are zero, so `deg` is honest. */
function trim(p: Poly): Poly {
  let n = p.length;
  while (n > 1 && p[n - 1][0] === 0 && p[n - 1][1] === 0) n--;
  return p.slice(0, n);
}

/**
 * Cauchy's root bound: every root satisfies `|z| ≤ 1 + max|a_k/a_n|`.
 *
 * The same inequality that certifies the ML bound in `bounds/` — here it only seeds the iteration,
 * so its exactness does not matter yet, but it is the same fact and will be shared once the exact
 * path lands.
 */
function cauchyBound(p: Poly): number {
  const lead = abs(p[p.length - 1]);
  if (lead === 0) return 1;
  let m = 0;
  for (let k = 0; k < p.length - 1; k++) m = Math.max(m, abs(p[k]) / lead);
  return 1 + m;
}

/** Aberth-style seeding: `n` points on a circle, offset so no seed is real (a real seed on a real
 *  polynomial can stay real forever and never find a conjugate pair). */
function seeds(n: number, radius: number): Cx[] {
  const out: Cx[] = [];
  for (let k = 0; k < n; k++) {
    const theta = (2 * Math.PI * k) / n + 0.7853981633974483 / n + 0.4;
    out.push([radius * Math.cos(theta), radius * Math.sin(theta)]);
  }
  return out;
}

/** A few Newton steps on the polynomial, to clean up what Durand–Kerner leaves. */
function polish(p: Poly, z0: Cx, steps = 3): Cx {
  const dp: Poly = [];
  for (let k = 1; k < p.length; k++) dp.push([p[k][0] * k, p[k][1] * k]);
  if (dp.length === 0) return z0;

  let z = z0;
  for (let s = 0; s < steps; s++) {
    const v = evalPoly(p, z);
    const d = evalPoly(dp, z);
    const d2 = d[0] * d[0] + d[1] * d[1];
    if (d2 === 0) break;
    const stepRe = (v[0] * d[0] + v[1] * d[1]) / d2;
    const stepIm = (v[1] * d[0] - v[0] * d[1]) / d2;
    const next: Cx = [z[0] - stepRe, z[1] - stepIm];
    if (!Number.isFinite(next[0]) || !Number.isFinite(next[1])) break;
    z = next;
  }
  return z;
}

/**
 * Group roots that agree to `tol` (relative to the root scale) into multiplicities.
 *
 * This is the honest weak point and it is why every order carries `orderCertain`. A double root and
 * two distinct roots `1e-9` apart look identical to a floating root-finder, and `@cas/core`'s own
 * `COINCIDENT_EPS2` refuses to paper over the same ambiguity rather than guessing. M2's squarefree
 * decomposition over ℚ(i) removes the guess entirely by computing the multiplicity structure before
 * any root is approximated.
 */
function cluster(roots: Cx[], scaleHint: number): { at: Cx; order: number; certain: boolean }[] {
  const tol = Math.max(1e-7, 1e-7 * scaleHint);
  const ambiguousBelow = tol * 100; // separations in [tol, 100·tol) are too close to call
  const out: { at: Cx; order: number; certain: boolean }[] = [];

  for (const r of roots) {
    const hit = out.find((g) => Math.hypot(g.at[0] - r[0], g.at[1] - r[1]) < tol);
    if (hit) {
      // Running mean, so the reported location is not biased toward whichever root came first.
      const n = hit.order + 1;
      hit.at = [(hit.at[0] * hit.order + r[0]) / n, (hit.at[1] * hit.order + r[1]) / n];
      hit.order = n;
    } else {
      out.push({ at: r, order: 1, certain: true });
    }
  }

  for (const g of out) {
    for (const h of out) {
      if (g === h) continue;
      if (Math.hypot(g.at[0] - h.at[0], g.at[1] - h.at[1]) < ambiguousBelow) {
        g.certain = false;
        h.certain = false;
      }
    }
  }
  return out;
}

/**
 * Locate the poles of `f` as a rational function of `z`, at the given parameter values.
 *
 * Returns `rational: false` — and claims nothing — when `f` is not rational in `z`. That is not a
 * failure: `sin(z)/z`, `exp(1/z)` and every transcendental integrand in the gallery land there, and
 * the numeric path for them (AAA from samples) is M2 work.
 */
export function findPoles(ast: Node, c: Cx = [0, 0], a: Cx = [0, 0]): PoleReport {
  const rat = fToRational(ast, c, a);
  if (!rat) {
    return {
      poles: [],
      rational: false,
      certificates: [
        unknown(
          "the poles of f",
          "f is not a rational function of z; the numeric pole search is not implemented yet",
        ),
      ],
    };
  }

  const den = trim(rat.den as Poly);
  const num = trim(rat.num as Poly);
  const degree = den.length - 1;
  if (degree < 1) {
    return {
      poles: [],
      rational: true,
      certificates: [
        estimate("f has no poles: the denominator is constant", "rational decomposition of the AST"),
      ],
    };
  }

  const radius = cauchyBound(den);
  const lead = den[degree];
  const monic: Poly = den.map((k) => {
    const d2 = lead[0] * lead[0] + lead[1] * lead[1];
    return [(k[0] * lead[0] + k[1] * lead[1]) / d2, (k[1] * lead[0] - k[0] * lead[1]) / d2] as Cx;
  });

  const result = durandKerner((z) => evalPoly(monic, z), seeds(degree, radius), {
    tol: 1e-13,
    maxIter: 300,
  });
  const raw = (result?.roots ?? []).map((r) => polish(den, r));

  // Scale for the removable-singularity test: comparing |num| against 0 is meaningless without one,
  // since scaling f by 1e-12 would make every pole look removable.
  const numScale = Math.max(...num.map(abs), 1e-300);

  const poles: Pole[] = cluster(raw, radius).map((g) => {
    const nv = abs(evalPoly(num, g.at));
    const possiblyRemovable = nv < 1e-8 * numScale * Math.max(1, Math.pow(radius, num.length - 1));
    return {
      at: g.at,
      order: g.order,
      orderCertain: g.certain && !possiblyRemovable,
      possiblyRemovable,
    };
  });

  const certificates: Certificate[] = [
    estimate(
      `${poles.length} pole${poles.length === 1 ? "" : "s"} of f, located numerically`,
      "Durand–Kerner from Cauchy-bound seeds, Newton-polished",
      {
        provenance: [
          { ok: result?.converged ?? false, text: `Durand–Kerner converged in ${result?.iterations ?? 0} iterations` },
          { ok: true, text: `denominator degree ${degree}` },
        ],
      },
    ),
  ];
  if (poles.some((p) => !p.orderCertain)) {
    certificates.push(
      unknown(
        "the multiplicity of at least one pole",
        "roots too close to separate in floating point — exact squarefree decomposition lands in M2",
      ),
    );
  }
  if (poles.some((p) => p.possiblyRemovable)) {
    certificates.push(
      unknown(
        "whether every listed point is really a pole",
        "the numerator nearly vanishes at one of them, so the singularity may be removable",
      ),
    );
  }

  return { poles, rational: true, certificates };
}
