// `Σₖ Res(z^{a−1}/(b_n z^n + b₀), zₖ)` — the residue sum over the roots of `−b₀/b_n`, **without ever
// representing one of them**.
//
// D3 is why this exists. Its poles are the `n`-th roots of `−1`, and for `n = 4` those are
// `(±1±i)/√2` — one quadratic extension, which `SqrtExt` holds and `branchResidue.ts` reads
// pole by pole. For `n = 5` and `n = 7` they are not: `ℚ(ζ₁₀)` has degree 4 over ℚ and `ℚ(ζ₁₄)`
// degree 6, so no individual root is expressible and the per-pole route cannot start. Yet the record
// states exact answers at both — `(π/5)/sin(2.3π/5)` and `(π/7)/sin(3π/7)` — because **the sum has a
// closed form the summands do not.**
//
// THE STRUCTURE IS ALL THAT IS NEEDED. At a simple root `zₖ` of `Q = b_n z^n + b₀`,
//
//     Res(z^{a−1}/Q, zₖ) = zₖ^{a−1}/(n b_n zₖ^{n−1}) = zₖ^{a−n}/(n b_n) = −zₖ^a/(n b₀)
//
// using `zₖ^n = −b₀/b_n`. And if `−b₀/b_n = e^{iψπ}` then `zₖ = e^{i(ψ+2k)π/n}` for `k = 0…n−1`, so
//
//     Σₖ Res = −(1/(n b₀)) · Σₖ e^{ia(ψ+2k)π/n}
//
// — `n` terms of the exponent basis, each one a `π` multiple, and no radical anywhere. The exponents
// are in arithmetic progression with step `2iaπ/n`, which is what lets the geometric-sum recogniser
// in `sineForm.ts` collapse them against the keyhole's own `1 − e^{2πia}` and leave `sin(πa/n)`.
//
// ONE BOUND, DECLARED. `|b₀| = |b_n|` is required, so that every root sits on the unit circle. Off it
// `zₖ^a` needs `ln|zₖ|` and the exponent basis has no logarithm until M4.5 — the same bound
// `branchResidue.ts` states, for the same reason.
import { Frac, Gauss, QiPoly, SqrtExt } from "@cas/exact";
import { exact, refuse, type Certificate } from "@cas/rigor";
import { ExpSum } from "./expSum.js";
import { Exponent } from "./exponent.js";
import { formatGauss } from "./formatExact.js";
import { unitRoot } from "./branchResidue.js";

/** A denominator of the shape `b_n z^n + b₀`, with every root on the unit circle. */
export interface CyclotomicForm {
  readonly n: number;
  /** `ψ` with `zₖ^n = e^{iψπ}` at every root, i.e. `−b₀/b_n = e^{iψπ}`. */
  readonly psi: Frac;
  readonly constant: Gauss;
  readonly leading: Gauss;
}

/** The denominators whose ROOT RATIO is a representable root of unity — see `branchResidue.ts`. */
const RATIO_DENOMINATORS = [1n, 2n, 3n, 4n, 6n];

/**
 * Read `Q` as `b_n z^n + b₀` with unit-modulus roots, or report that it is not that shape.
 *
 * Every intermediate coefficient must be exactly zero — a `z^{n−1}` term makes the roots a general
 * algebraic set rather than a rotated regular `n`-gon, and there is no closed form for the sum then.
 */
export function asCyclotomic(q: QiPoly): CyclotomicForm | null {
  const n = q.degree();
  if (n < 2) return null;
  for (let k = 1; k < n; k++) if (!q.coeff(k).isZero()) return null;
  const constant = q.coeff(0);
  const leading = q.coeff(n);
  if (constant.isZero() || leading.isZero()) return null;

  // `−b₀/b_n` must be `e^{iψπ}`: guessed from the float, then verified exactly. The verification is
  // what enforces the unit-modulus bound too — `2 + z³` has ratio `−2`, which equals no root of
  // unity — so there is no separate modulus test here. One check, and it is the exact one.
  const ratio = constant.div(leading).neg();
  const [re, im] = ratio.toTuple();
  const guess = Math.atan2(im, re) / Math.PI;
  for (const m of RATIO_DENOMINATORS) {
    for (const nudge of [0, 2, -2]) {
      const k = BigInt(Math.round((guess + nudge) * Number(m)));
      const candidate = unitRoot(k, m);
      if (candidate === null) continue;
      const asGauss = candidate.asGauss();
      if (asGauss !== null && asGauss.equals(ratio)) {
        return { n, psi: Frac.of(k, m), constant, leading };
      }
    }
  }
  return null;
}

export type CyclotomicSum =
  | {
      readonly ok: true;
      /** `Σₖ wₖ·Res(z^{a−1}/Q, zₖ)`, exactly, as terms of the exponent basis. */
      readonly value: ExpSum;
      /** `arg zₖ / π` for each root that was COUNTED, in declared order. */
      readonly arguments: readonly Frac[];
      readonly certificate: Certificate;
    }
  | { readonly ok: false; readonly reason: string; readonly certificate: Certificate };

/**
 * One root of `Q`, as the residue reader sees it.
 *
 * The exact half is an ARGUMENT, not a position: `zₖ = e^{iπ·argOverPi}` and it is never written any
 * other way, which is the whole point — a fifth root of `−1` needs a degree-4 field and its argument
 * needs a fraction. `at` is a float and exists for one purpose, to ask the geometry a question.
 */
export interface CyclotomicRoot {
  readonly index: number;
  /** `arg zₖ / π`, exact: the root is `e^{iπ·argOverPi}`. */
  readonly argOverPi: Frac;
  /** Where it sits, numerically — used ONLY to look up a winding number. */
  readonly at: readonly [number, number];
}

/**
 * Every root of `Q`, in the order `k = 0…n−1` of `arg zₖ = (ψ + 2k)π/n`.
 *
 * The representatives are canonical by construction rather than by reduction, and that matters
 * symbolically even where it does not matter numerically: `e^{iπ/3}` and `e^{7iπ/3}` are the same
 * number and different {@link Exponent}s, and the sine recogniser compares exponents.
 */
export function cyclotomicRoots(form: CyclotomicForm): readonly CyclotomicRoot[] {
  const roots: CyclotomicRoot[] = [];
  for (let k = 0; k < form.n; k++) {
    const argOverPi = form.psi.add(Frac.of(BigInt(2 * k), 1n)).div(Frac.of(BigInt(form.n)));
    const theta = Math.PI * argOverPi.toNumber();
    roots.push({ index: k, argOverPi, at: [Math.cos(theta), Math.sin(theta)] });
  }
  return roots;
}

/**
 * `Σₖ wₖ · Res(z^{alpha}·(1/Q), zₖ)` over the roots a caller SELECTS.
 *
 * The all-roots case ({@link cyclotomicResidueSum}) was the only one until F1. D3's keyhole encircles
 * the whole unit circle, so "every root, once" was both what the record needed and the only thing the
 * structure could say; F1's WEDGE encircles exactly one of the `n`, and the residue theorem's own
 * statement — `Σₖ n(γ,aₖ)·Res` — is this function rather than that one. The sum is the special case
 * `wₖ ≡ 1`, and it is left as a wrapper so D3's call site is unchanged and provably so.
 *
 * `weightOf` returns `null` for a root whose winding could not be decided, which is a REFUSAL and not
 * a zero: an undecided weight means the geometry could not say whether the root is in, and a residue
 * dropped on that basis is a term silently missing from a sum reported as exact.
 *
 * `alpha` is the exponent as the integrand has it, so a caller holding `z^{a−1}` passes `a − 1`; the
 * `a` of `−zₖ^a/(n b₀)` is therefore `alpha + 1`, which is where that `+1` below comes from.
 *
 * **`argRange` may be omitted, and only when `a` is an INTEGER.** A determination is a property of
 * the integrand, not of this function: D3's `z^{a−1}` has one and must declare it, while F1's plain
 * `1/(1+zⁿ)` is single-valued and has none to declare. Defaulting a window for the second case would
 * put a convention on an integrand that does not admit one; refusing a fractional `a` without one is
 * D3's `roots-of-minus-one-mislabelled` trap kept exactly where it was.
 *
 * Every COUNTED root must lie inside the declared determination — counted, not every root, because a
 * root the contour does not enclose contributes nothing and its argument is not consulted.
 */
export function cyclotomicWeightedSum(
  form: CyclotomicForm,
  alpha: Frac,
  argRange: readonly [Frac, Frac] | undefined,
  weightOf: (root: CyclotomicRoot) => number | null,
): CyclotomicSum {
  const a = alpha.add(Frac.ONE);
  const n = BigInt(form.n);

  if (argRange === undefined && a.d !== 1n) {
    const reason =
      `z^${a.n}/${a.d} is multivalued, so its residues depend on a determination and one must be ` +
      "declared; only an integer power may be read without a window";
    return { ok: false, reason, certificate: refuse("the residue sum", reason) };
  }

  // `−1/(n b₀)`, the common factor of every residue.
  const scale = form.constant.mul(new Gauss(Frac.of(n), Frac.ZERO)).inv().neg();

  const args: Frac[] = [];
  let sum = ExpSum.ZERO;
  let counted = 0;
  for (const root of cyclotomicRoots(form)) {
    const weight = weightOf(root);
    if (weight === null) {
      const reason =
        `the winding number about the root at arg = ${root.argOverPi.n}/${root.argOverPi.d}·π was not ` +
        "decided, so its residue has no coefficient — and a term dropped for that reason is a term " +
        "missing from a sum that would still be reported as exact";
      return { ok: false, reason, certificate: refuse("the residue sum", reason) };
    }
    if (weight === 0) continue;
    const theta = root.argOverPi;
    if (argRange !== undefined && (theta.sub(argRange[0]).n < 0n || theta.sub(argRange[1]).n >= 0n)) {
      const reason =
        `the root at arg = ${theta.n}/${theta.d}·π lies outside the declared determination ` +
        `[${argRange[0].n}/${argRange[0].d}·π, ${argRange[1].n}/${argRange[1].d}·π) — every residue must be ` +
        "evaluated in the declared range, and half of these would change under the principal one";
      return { ok: false, reason, certificate: refuse("the residue sum", reason) };
    }
    args.push(theta);
    counted += 1;
    // `zₖ^a = e^{i·a·θₖ·π}`, weighted by the winding number.
    sum = sum.add(
      ExpSum.of(
        SqrtExt.fromGauss(scale.mul(new Gauss(Frac.of(BigInt(weight)), Frac.ZERO))),
        Exponent.piTimes(new Gauss(Frac.ZERO, a.mul(theta))),
      ),
    );
  }

  return {
    ok: true,
    value: sum,
    arguments: args,
    certificate: exact(
      counted === form.n
        ? `Σₖ Res = −(1/(n·${formatGauss(form.constant)}))·Σₖ e^{ia(ψ+2k)π/n} over the ${form.n} roots`
        : `Σₖ n(γ,zₖ)·Res over the ${counted} of ${form.n} roots the contour encircles, each −zₖ^a/(n·${formatGauss(form.constant)})`,
      "the roots of a rotated regular n-gon: each residue is −zₖ^a/(n b₀), and the sum is carried term by term with no root ever represented",
      {
        ...(argRange === undefined
          ? {}
          : {
              restriction: `arg z ∈ [${argRange[0].n}/${argRange[0].d}·π, ${argRange[1].n}/${argRange[1].d}·π)`,
            }),
        provenance: [
          {
            ok: true,
            text: `zₖ^n = e^{i(${form.psi.n}/${form.psi.d})π} was verified exactly, so arg zₖ = (ψ + 2k)π/n for k = 0…${form.n - 1}`,
          },
          {
            ok: true,
            text: "no individual root is expressed: a fifth or seventh root of −1 needs a degree-4 or degree-6 field, and the SUM needs none",
          },
          ...(counted === form.n
            ? []
            : [
                {
                  ok: true,
                  text: "each root's winding number was decided by the same exact-sign predicates every other winding uses; the roots are located numerically only to ASK that question",
                },
              ]),
        ],
      },
    ),
  };
}

/**
 * The residue sum of `z^{alpha}·(1/Q)` over EVERY root of `Q`, each once.
 *
 * D3's case, and the one {@link cyclotomicWeightedSum} generalises: a keyhole with `ε < 1 < R`
 * encircles the whole unit circle, where these roots live.
 */
export function cyclotomicResidueSum(
  form: CyclotomicForm,
  alpha: Frac,
  argRange: readonly [Frac, Frac],
): CyclotomicSum {
  return cyclotomicWeightedSum(form, alpha, argRange, () => 1);
}
