// Finding the poles of an integrand, and saying honestly how well they are known.
//
// Two paths, and which one applies is a fact about `f` rather than a setting:
//
// - **Exact.** When `f` is a rational function over ℚ(i), the denominator's multiplicity structure,
//   the pole locations (where they are Gaussian rational) and their residues are all *decided* in
//   exact arithmetic. Those poles carry `=`.
// - **Numeric.** Otherwise, `@cas/core`'s Durand–Kerner iteration — which is an iteration, not a
//   root-finder: seeding, deflation, multiplicity and polish all live here (research 08 §2) — and
//   everything it reports is `≈`, including a multiplicity that was *inferred* from a cluster of
//   nearly coincident floats rather than computed.
//
// The exact path still uses the numeric one: floating roots make excellent **candidates**, and a
// candidate is only promoted once the exact denominator vanishes there. Guess, then verify.
import { tupleAlgebra, makeDurandKerner, type ComplexTuple } from "@cas/core";
import type { Frac } from "@cas/exact";
import { fToRational, type Node } from "@cas/expr";
import { estimate, exact as exactCert, unknown, type Certificate } from "@cas/rigor";
import { toExactRational } from "./exactRational.js";
import { asExponentialTimesRational } from "./exponentialFactor.js";
import { exactPolesOf, weightedSum, type AlgebraicPole } from "./algebraic.js";
import { formatSqrtExt } from "./formatExact.js";
import { ExpSum, formatExpSum, jordanExponent, weightedExpSum } from "./expSum.js";

export type Cx = ComplexTuple;
type Poly = Cx[]; // ascending: p[k] is the coefficient of z^k

const durandKerner = makeDurandKerner(tupleAlgebra);

export interface Pole {
  readonly at: Cx;
  readonly order: number;
  /** True when the multiplicity was COMPUTED (exact path) rather than inferred from a cluster. */
  readonly orderCertain: boolean;
  /** Only ever true on the numeric path: exactly, a removable singularity is cancelled and gone. */
  readonly possiblyRemovable: boolean;
  /** Present when the pole and its residue are exact. */
  readonly residue?: { readonly value: Cx; readonly text: string };
  readonly isExact: boolean;
}

export interface PoleReport {
  readonly poles: readonly Pole[];
  /** False when f is not a rational function of z, in which case nothing is claimed. */
  readonly rational: boolean;
  /** True when every pole was pinned exactly — the condition for an exact residue SUM. */
  readonly exactlyComplete: boolean;
  /** Σ Res over all poles, exact, present only when `exactlyComplete`. */
  readonly exactResidueSum?: { readonly value: Cx; readonly text: string };
  /** The exactly-pinned poles in exact form, for arithmetic that must stay in ℚ(i) or ℚ(i)(√d). */
  readonly exactPoles?: readonly AlgebraicPole[];
  /** The quadratic extension the exact data needed, or null when ℚ(i) sufficed. */
  readonly radicand?: bigint | null;
  /**
   * The frequency `a` of `f = g(z)·e^{iaz}`, when f has that shape.
   *
   * Present means every exact residue carries a factor `e^{iaz₀}`, so the residue SUM lives in the
   * exponential basis rather than in ℚ(i)(√d) — `π/e`, not a decimal. Absent is the rational case
   * and nothing about it changes.
   */
  readonly exponentialFrequency?: Frac;
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

function trim(p: Poly): Poly {
  let n = p.length;
  while (n > 1 && p[n - 1][0] === 0 && p[n - 1][1] === 0) n--;
  return p.slice(0, n);
}

/** Cauchy's root bound: every root satisfies `|z| ≤ 1 + max|a_k/a_n|`. */
function cauchyBound(p: Poly): number {
  const lead = abs(p[p.length - 1]);
  if (lead === 0) return 1;
  let m = 0;
  for (let k = 0; k < p.length - 1; k++) m = Math.max(m, abs(p[k]) / lead);
  return 1 + m;
}

/** Aberth-style seeding: `n` points on a circle, offset so no seed is real. */
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
    const next: Cx = [
      z[0] - (v[0] * d[0] + v[1] * d[1]) / d2,
      z[1] - (v[1] * d[0] - v[0] * d[1]) / d2,
    ];
    if (!Number.isFinite(next[0]) || !Number.isFinite(next[1])) break;
    z = next;
  }
  return z;
}

/**
 * Group roots that agree to `tol` into multiplicities — the numeric path's honest weak point.
 *
 * A double root and two distinct roots `1e-9` apart look identical to a floating root-finder, which
 * is why every order from this path carries `orderCertain: false` when the separation is marginal.
 * The exact path removes the inference entirely.
 */
function cluster(roots: Cx[], scaleHint: number): { at: Cx; order: number; certain: boolean }[] {
  const tol = Math.max(1e-7, 1e-7 * scaleHint);
  const ambiguousBelow = tol * 100;
  const out: { at: Cx; order: number; certain: boolean }[] = [];

  for (const r of roots) {
    const hit = out.find((g) => Math.hypot(g.at[0] - r[0], g.at[1] - r[1]) < tol);
    if (hit) {
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

/** Float coefficients of an exact polynomial, ascending. */
function toFloatPoly(p: import("@cas/exact").QiPoly): Poly {
  const out: Poly = [];
  for (let k = 0; k <= p.degree(); k++) out.push(p.coeff(k).toTuple());
  return out;
}

/** Numerically locate the roots of a denominator, as candidates for the exact path or as the answer. */
function rootsOf(den: Poly): { roots: Cx[]; converged: boolean; iterations: number; radius: number } {
  const degree = den.length - 1;
  const radius = cauchyBound(den);
  const lead = den[degree];
  const d2 = lead[0] * lead[0] + lead[1] * lead[1];
  const monic: Poly = den.map((k) => [
    (k[0] * lead[0] + k[1] * lead[1]) / d2,
    (k[1] * lead[0] - k[0] * lead[1]) / d2,
  ]);
  const result = durandKerner((z) => evalPoly(monic, z), seeds(degree, radius), {
    tol: 1e-13,
    maxIter: 300,
  });
  return {
    roots: (result?.roots ?? []).map((r) => polish(den, r)),
    converged: result?.converged ?? false,
    iterations: result?.iterations ?? 0,
    radius,
  };
}

const toPole = (p: AlgebraicPole): Pole => ({
  at: p.at.toTuple(),
  order: p.order,
  orderCertain: true,
  possiblyRemovable: false,
  residue: { value: p.residue.toTuple(), text: formatSqrtExt(p.residue) },
  isExact: true,
});

/**
 * Locate the poles of `f`, exactly where possible.
 *
 * Returns `rational: false` — claiming nothing — when `f` is not rational in `z`. That is not a
 * failure: every transcendental integrand in the gallery lands there, and the numeric path for them
 * (AAA from samples) is later work.
 */
export function findPoles(ast: Node, c: Cx = [0, 0], a: Cx = [0, 0]): PoleReport {
  // --- the exact path ------------------------------------------------------------------------
  const exactForm = toExactRational(ast);
  if (exactForm.ok) {
    const { num, den } = exactForm.value;
    if (den.degree() < 1 && num.degree() >= 0) {
      return {
        poles: [],
        rational: true,
        exactlyComplete: true,
        certificates: [exactCert("f has no poles: the denominator is constant", "exact reading over ℚ(i)")],
      };
    }

    const denFloat = trim(toFloatPoly(den));
    // Root-finding is injected, and each squarefree factor is solved separately — see exactResidues
    // for why that matters for a repeated root.
    const report = exactPolesOf(num, den, (factor) => {
      const coeffs = trim(toFloatPoly(factor));
      return coeffs.length <= 1 ? [] : rootsOf(coeffs).roots;
    });

    const certificates: Certificate[] = [
      exactCert(
        `f is a rational function over ℚ(i) of degree ${num.degree()}/${den.degree()}`,
        "exact reading of the expression, refusing anything not representable in ℚ(i)",
      ),
    ];

    if (report.removableDegree > 0) {
      certificates.push(
        exactCert(
          `${report.removableDegree} removable singularit${report.removableDegree === 1 ? "y" : "ies"} cancelled`,
          "exact gcd of numerator and denominator",
        ),
      );
    }

    if (report.poles.length > 0) {
      const field = report.radicand === null || report.radicand === undefined
        ? "ℚ(i)"
        : `ℚ(i)(√${report.radicand})`;
      certificates.push(
        exactCert(
          `${report.poles.length} pole${report.poles.length === 1 ? "" : "s"} with exact location, order and residue in ${field}`,
          report.radicand === null || report.radicand === undefined
            ? "Taylor shift, exact series inverse, one convolution"
            : "roots split by the quadratic formula and binomial recursion; residues by P/Q′ at the root",
        ),
      );
    }

    if (report.complete) {
      const sum = weightedSum(report.poles, () => 1);
      return {
        poles: report.poles.map(toPole),
        rational: true,
        exactlyComplete: true,
        exactResidueSum: { value: sum.toTuple(), text: formatSqrtExt(sum) },
        exactPoles: report.poles,
        radicand: report.radicand,
        certificates: [
          ...certificates,
          exactCert(
            `Σ Res = ${formatSqrtExt(sum)} over every pole of f`,
            "exact sum over exactly-pinned poles",
          ),
        ],
      };
    }

    // Some poles are algebraic. The exact ones stay exact; the rest fall back, and the report says
    // which is which rather than averaging the two claims into one.
    const { roots, converged, iterations } = rootsOf(denFloat);
    const exactAt = report.poles.map((p) => p.at.toTuple());
    const numericOnly = roots.filter(
      (r) => !exactAt.some((e) => Math.hypot(e[0] - r[0], e[1] - r[1]) < 1e-6),
    );
    const clustered = cluster(numericOnly, cauchyBound(trim(denFloat)));

    const unpinned = den.degree() - report.poles.reduce((n, p) => n + p.order, 0);
    certificates.push(
      unknown(
        `${unpinned} pole${unpinned === 1 ? "" : "s"} of f could not be pinned exactly`,
        "their residues need more than one quadratic extension of ℚ(i) — a general number field, which PLAN.md §3.3 puts on a later rung (printed as a RootSum)",
      ),
      estimate("those poles are located numerically", "Durand–Kerner from Cauchy-bound seeds, Newton-polished", {
        provenance: [{ ok: converged, text: `Durand–Kerner converged in ${iterations} iterations` }],
      }),
    );

    return {
      poles: [
        ...report.poles.map(toPole),
        ...clustered.map((g) => ({
          at: g.at,
          order: g.order,
          orderCertain: g.certain,
          possiblyRemovable: false,
          isExact: false,
        })),
      ],
      rational: true,
      exactlyComplete: false,
      exactPoles: report.poles,
      radicand: report.radicand,
      certificates,
    };
  }

  // --- g(z)·e^{iaz}: exact locations AND exact residues, in the exponential basis --------------
  // The exponential is entire, so the poles are exactly those of the rational part and their orders
  // are exactly known. The residues carry a factor e^{iaz₀} which is not an algebraic number — but
  // it does not need to be EVALUATED to be exact, only CARRIED, which is what `ExpSum` is for. That
  // is the difference between reporting 1.1557273 and reporting π/e.
  //
  // SIMPLE POLES ONLY. At order m > 1 the residue is p(z₀)·e^{iaz₀} for a polynomial p built from
  // derivatives of g·e^{iaz}; representable here, but it needs machinery this does not have, so a
  // repeated pole declines to the locations-only report rather than guessing.
  const exponential = asExponentialTimesRational(ast);
  if (exponential) {
    const structure = exactPolesOf(exponential.num, exponential.den, (factor) => {
      const coeffs = trim(toFloatPoly(factor));
      return coeffs.length <= 1 ? [] : rootsOf(coeffs).roots;
    });
    if (structure.poles.length > 0) {
      const allSimple = structure.poles.every((p) => p.order === 1);
      const exactResidues = structure.complete && allSimple;
      const field =
        structure.radicand === null || structure.radicand === undefined
          ? "ℚ(i)"
          : `ℚ(i)(√${structure.radicand})`;

      const certificates: Certificate[] = [
        exactCert(
          `${structure.poles.length} pole${structure.poles.length === 1 ? "" : "s"} at exactly known locations, of exactly known order`,
          "f = g(z)·e^{iaz} with g rational; the exponential is entire, so the poles are g's",
        ),
      ];

      if (!exactResidues) {
        certificates.push(
          unknown(
            "the residues",
            !allSimple
              ? "a pole of order > 1 needs the derivative of g·e^{iaz}, which the exponential basis does not yet carry — the numeric value stands"
              : `not every pole of g is expressible in ${field}; the numeric value stands`,
          ),
        );
        return {
          poles: structure.poles.map((p) => ({
            at: p.at.toTuple(),
            order: p.order,
            orderCertain: true,
            possiblyRemovable: false,
            isExact: false,
          })),
          rational: true,
          exactlyComplete: false,
          // The LOCATIONS and ORDERS are exact even when the residues are not, so they are handed
          // over. L4 needs them precisely here: its refusal at an order-2 pole should say "order 2,
          // and L4 is false for order ≥ 2", not "no pole found" — which is what withholding them
          // made it say.
          exactPoles: structure.poles,
          radicand: structure.radicand,
          certificates,
        };
      }

      // A zero frequency is `e^0 = 1`: the residues carry no exponential factor at all, and the
      // output must be byte-identical to what the purely rational path would have produced.
      const frequency = exponential.a.isZero() ? undefined : exponential.a;
      const residueOf = (p: AlgebraicPole): { value: Cx; text: string } => {
        const r =
          frequency === undefined
            ? ExpSum.fromSqrtExt(p.residue)
            : ExpSum.of(p.residue, jordanExponent(frequency, p.at));
        return { value: r.toTuple(), text: formatExpSum(r) };
      };
      const sum = weightedExpSum(structure.poles, () => 1, frequency);
      certificates.push(
        exactCert(
          `every residue is ${field} × e^{iaz₀}, exactly`,
          "Res(g·e^{iaz}, z₀) = Res(g, z₀)·e^{iaz₀} at a simple pole; the exponential factor is carried, not evaluated",
        ),
        exactCert(
          `Σ Res = ${formatExpSum(sum)} over every pole of f`,
          "exact sum over exactly-pinned simple poles",
        ),
      );

      return {
        poles: structure.poles.map((p) => ({
          at: p.at.toTuple(),
          order: p.order,
          orderCertain: true,
          possiblyRemovable: false,
          residue: residueOf(p),
          isExact: true,
        })),
        rational: true,
        exactlyComplete: true,
        exactResidueSum: { value: sum.toTuple(), text: formatExpSum(sum) },
        exactPoles: structure.poles,
        radicand: structure.radicand,
        exponentialFrequency: frequency,
        certificates,
      };
    }
  }

  // --- the numeric path ----------------------------------------------------------------------
  const rat = fToRational(ast, c, a);
  if (!rat) {
    return {
      poles: [],
      rational: false,
      exactlyComplete: false,
      certificates: [
        unknown(
          "the poles of f",
          `f is not a rational function of z (${exactForm.reason}); the numeric pole search is not implemented yet`,
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
      exactlyComplete: false,
      certificates: [estimate("f has no poles: the denominator is constant", "floating rational decomposition")],
    };
  }

  const { roots, converged, iterations, radius } = rootsOf(den);
  const numScale = Math.max(...num.map(abs), 1e-300);

  const poles: Pole[] = cluster(roots, radius).map((g) => {
    const nv = abs(evalPoly(num, g.at));
    const possiblyRemovable = nv < 1e-8 * numScale * Math.max(1, Math.pow(radius, num.length - 1));
    return {
      at: g.at,
      order: g.order,
      orderCertain: g.certain && !possiblyRemovable,
      possiblyRemovable,
      isExact: false,
    };
  });

  const certificates: Certificate[] = [
    estimate(
      `${poles.length} pole${poles.length === 1 ? "" : "s"} of f, located numerically`,
      "Durand–Kerner from Cauchy-bound seeds, Newton-polished",
      {
        provenance: [
          { ok: converged, text: `Durand–Kerner converged in ${iterations} iterations` },
          { ok: true, text: `denominator degree ${degree}` },
        ],
      },
    ),
  ];
  if (poles.some((p) => !p.orderCertain)) {
    certificates.push(
      unknown(
        "the multiplicity of at least one pole",
        "roots too close to separate in floating point; the exact path settles this when f is rational over ℚ(i)",
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

  return { poles, rational: true, exactlyComplete: false, certificates };
}
