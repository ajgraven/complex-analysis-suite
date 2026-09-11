// Poles and residues in ℚ(i)(√d) — PLAN.md §3.3's ladder, rungs two and three.
//
// M2's first half pinned every pole that happens to be a Gaussian rational. That covers `1/z` and
// `1/(1+z²)` and stops dead at `1/(1+z⁴)`, whose poles are `(±1±i)/√2` — and whose answer, `π√2/2`,
// is the M2 gate. This is the rung that reaches it.
//
// Two mechanisms, deliberately narrow, because the general case is a number-field tower and the
// honest response to that is a `RootSum` rather than a bigger implementation:
//
//  - **The quadratic formula.** Any degree-2 factor over ℚ(i) splits, with the discriminant's square
//    root supplied by `sqrtOfGauss`.
//  - **Recursive binomial splitting.** `a·z^{2k} + c` is a difference of squares whenever `√(−c/a)`
//    lands in ℚ(i): `z⁴ + 1 = (z² − i)(z² + i)`, and each half is then a quadratic. This is what
//    makes the whole `1/(1+zⁿ)` family reachable without a general factoriser.
//
// Everything else declines. Declining is a result — the caller falls back to the numeric path, which
// says `≈` and means it.
import { Frac, Gauss, QiPoly, SqrtExt, multiplicityAt, sqrtOfGauss, yunSquarefree } from "@cas/exact";
import { cancelCommon, exactPoleAt, rationalCandidate, type Cx } from "./exactResidue.js";

export interface AlgebraicPole {
  readonly at: SqrtExt;
  readonly order: number;
  readonly residue: SqrtExt;
  /** The quadratic extension this pole's data lives in; 1 when it is a Gaussian rational. */
  readonly radicand: bigint;
}

export interface AlgebraicReport {
  readonly poles: readonly AlgebraicPole[];
  /** True when every pole of f was pinned — the condition for an exact residue sum. */
  readonly complete: boolean;
  readonly removableDegree: number;
  /** The single quadratic extension all the poles share, or null when none was needed. */
  readonly radicand: bigint | null;
}

/** Horner evaluation of a ℚ(i) polynomial at a point of the extension. */
export function evalSqrt(p: QiPoly, z: SqrtExt): SqrtExt {
  let acc = SqrtExt.ZERO;
  for (let k = p.degree(); k >= 0; k--) {
    acc = acc.mul(z).add(SqrtExt.fromGauss(p.coeff(k)));
  }
  return acc;
}

/** True when `p` has non-zero coefficients only at degree 0 and its leading degree. */
function isBinomial(p: QiPoly): boolean {
  const n = p.degree();
  if (n < 1) return false;
  for (let k = 1; k < n; k++) if (!p.coeff(k).isZero()) return false;
  return true;
}

/**
 * Every root of a **squarefree** polynomial over ℚ(i), as elements of one quadratic extension — or
 * null when they do not all fit in one.
 *
 * Null is common and expected: a general quintic has no such form, and saying so is the point.
 */
export function splitRoots(F: QiPoly): SqrtExt[] | null {
  const n = F.degree();
  if (n <= 0) return [];

  if (n === 1) {
    return [SqrtExt.fromGauss(F.coeff(0).neg().div(F.coeff(1)))];
  }

  if (n === 2) {
    const a = F.coeff(2);
    const b = F.coeff(1);
    const c = F.coeff(0);
    const four = new Gauss(Frac.of(4n), Frac.ZERO);
    const discriminant = b.mul(b).sub(four.mul(a).mul(c));
    const root = sqrtOfGauss(discriminant);
    if (!root) return null;
    const twoA = SqrtExt.fromGauss(a.add(a));
    const minusB = SqrtExt.fromGauss(b.neg());
    return [minusB.add(root).div(twoA), minusB.sub(root).div(twoA)];
  }

  // a·zⁿ + c with n even: a difference of squares, provided the square root stays in ℚ(i).
  if (isBinomial(F) && n % 2 === 0) {
    const a = F.coeff(n);
    const c = F.coeff(0);
    const target = c.neg().div(a); // zⁿ = target
    const s = sqrtOfGauss(target);
    const sGauss = s?.asGauss();
    if (!sGauss) return null; // the split would need coefficients outside ℚ(i)
    const half = QiPoly.monomial(n / 2);
    const left = splitRoots(half.sub(QiPoly.constant(sGauss)));
    const right = splitRoots(half.add(QiPoly.constant(sGauss)));
    if (!left || !right) return null;
    const all = [...left, ...right];
    return sameExtension(all) ? all : null;
  }

  return null;
}

/** Locates the roots of a polynomial numerically, to propose rational candidates for deflation. */
export type RootFinder = (p: QiPoly) => readonly Cx[];

/**
 * `splitRoots`, with one more move available: deflate any **Gaussian-rational** roots first.
 *
 * A cubic is neither a quadratic nor an even binomial, so `splitRoots` declines `z³ − 1` outright —
 * even though its roots are `1` and the two primitive cube roots, which sit comfortably in ℚ(i)(√3).
 * Dividing out the rational root leaves a quadratic, and the quadratic formula finishes the job.
 *
 * The candidates come from the numeric root finder and are **verified exactly** before use, so a
 * wrong guess costs a wasted division and never a wrong root.
 */
function splitWithDeflation(F: QiPoly, findRoots?: RootFinder): SqrtExt[] | null {
  const direct = splitRoots(F);
  if (direct) return direct;
  if (!findRoots) return null;

  const { roots: found, rest } = deflateRationalRoots(F, findRoots);
  if (found.length === 0) return null;

  const remaining = rest.degree() < 1 ? [] : splitRoots(rest);
  if (!remaining) return null;
  const all = [...found.map(SqrtExt.fromGauss), ...remaining];
  return sameExtension(all) ? all : null;
}

/**
 * Divide out every Gaussian-rational root the numeric finder proposes and that exact evaluation
 * confirms, returning them and what is left.
 *
 * Verified before use, so a wrong snap costs a wasted evaluation and never a wrong root.
 */
function deflateRationalRoots(
  F: QiPoly,
  findRoots: RootFinder,
): { roots: Gauss[]; rest: QiPoly } {
  const roots: Gauss[] = [];
  let rest = F;
  for (const z of findRoots(F)) {
    const a = rationalCandidate(z);
    if (!a) continue;
    if (rest.degree() < 1 || !rest.eval(a).isZero()) continue;
    rest = rest.divExact(QiPoly.fromCoeffs([a.neg(), Gauss.ONE]));
    roots.push(a);
  }
  return { roots, rest };
}

/** True when every element lies in one quadratic extension (rationals are compatible with any). */
function sameExtension(xs: readonly SqrtExt[]): boolean {
  let d: bigint | null = null;
  for (const x of xs) {
    if (x.isRational()) continue;
    if (d === null) d = x.d;
    else if (d !== x.d) return false;
  }
  return true;
}

const radicandOf = (xs: readonly SqrtExt[]): bigint | null => {
  for (const x of xs) if (!x.isRational()) return x.d;
  return null;
};

/**
 * Pin every pole of `num/den` exactly, in ℚ(i) or one quadratic extension of it.
 *
 * Per squarefree factor:
 *  - **multiplicity 1** — split the factor into roots, and take each residue as `N(α)/D′(α)`, which
 *    is valid precisely because α is a *simple* root of the full denominator.
 *  - **multiplicity m > 1** — only Gaussian-rational roots are handled, by the Taylor-shift and
 *    series route from M2's first half. A repeated ALGEBRAIC pole would need series arithmetic over
 *    the extension, which is real work for a case the gallery does not contain; it declines.
 */
export function exactPolesOf(num: QiPoly, den: QiPoly, findRoots?: RootFinder): AlgebraicReport {
  const cancelled = cancelCommon(num, den);
  const dPrime = cancelled.den.derivative();
  const poles: AlgebraicPole[] = [];
  let accounted = 0;
  let complete = true;

  for (const { factor, multiplicity } of yunSquarefree(cancelled.den)) {
    if (multiplicity === 1) {
      let roots = splitWithDeflation(factor, findRoots);
      if (!roots) {
        // The factor does not split entirely. Its Gaussian-rational roots are still exactly
        // knowable, and reporting those while admitting the rest is better than reporting nothing:
        // a mixed integrand keeps whatever exactness it has instead of losing all of it.
        complete = false;
        roots = findRoots
          ? deflateRationalRoots(factor, findRoots).roots.map(SqrtExt.fromGauss)
          : [];
        if (roots.length === 0) continue;
      }
      for (const alpha of roots) {
        const denom = evalSqrt(dPrime, alpha);
        if (denom.isZero()) {
          complete = false;
          continue;
        }
        poles.push({
          at: alpha,
          order: 1,
          residue: evalSqrt(cancelled.num, alpha).div(denom),
          radicand: alpha.d,
        });
        accounted += 1;
      }
      continue;
    }

    // A repeated factor: only the Gaussian-rational roots of it are within reach.
    const roots = splitWithDeflation(factor, findRoots);
    const rationalRoots = roots?.map((r) => r.asGauss()) ?? null;
    if (!roots || !rationalRoots || rationalRoots.some((r) => r === null)) {
      complete = false;
      continue;
    }
    for (const alpha of rationalRoots as Gauss[]) {
      const p = exactPoleAt(cancelled.num, cancelled.den, alpha);
      if (!p) {
        complete = false;
        continue;
      }
      poles.push({
        at: SqrtExt.fromGauss(alpha),
        order: p.order,
        residue: SqrtExt.fromGauss(p.residue),
        radicand: 1n,
      });
      accounted += multiplicityAt(cancelled.den, alpha);
    }
  }

  const all = poles.map((p) => p.at).concat(poles.map((p) => p.residue));
  if (!sameExtension(all)) {
    // Defence in depth, and honestly labelled as such: **no input reaches this today.** Every
    // `splitRoots`-derived pole comes from the single multiplicity-1 factor, and `splitRoots`
    // already enforces one extension internally; the repeated-factor branch only admits rational
    // roots, which are compatible with anything. Deleting the check with the suite green was how
    // that was established. It stays because the cost is one comparison and the failure it would
    // prevent — summing √2 and √3 as if they lived in one field — is silent.
    return { poles: [], complete: false, removableDegree: Math.max(0, cancelled.removable.degree()), radicand: null };
  }

  return {
    poles,
    complete: complete && accounted === cancelled.den.degree(),
    removableDegree: Math.max(0, cancelled.removable.degree()),
    radicand: radicandOf(all),
  };
}

/** Σ n(γ,α)·Res(f,α) over the pinned poles, exactly. */
export function weightedSum(
  poles: readonly AlgebraicPole[],
  windingOf: (at: SqrtExt) => number,
): SqrtExt {
  let acc = SqrtExt.ZERO;
  for (const p of poles) {
    const n = windingOf(p.at);
    if (n === 0) continue;
    let term = SqrtExt.ZERO;
    for (let k = 0; k < Math.abs(n); k++) term = term.add(p.residue);
    acc = n > 0 ? acc.add(term) : acc.sub(term);
  }
  return acc;
}
