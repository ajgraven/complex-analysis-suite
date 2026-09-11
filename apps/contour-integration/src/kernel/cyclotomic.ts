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
      /** `Σₖ Res(z^{a−1}/Q, zₖ)`, exactly, as `n` terms of the exponent basis. */
      readonly value: ExpSum;
      /** `arg zₖ / π` for each root, in declared order — what the argRange check reads. */
      readonly arguments: readonly Frac[];
      readonly certificate: Certificate;
    }
  | { readonly ok: false; readonly reason: string; readonly certificate: Certificate };

/**
 * The residue sum of `z^{alpha}·(1/Q)` over every root of `Q`.
 *
 * `alpha` is the exponent as the integrand has it, so a caller holding `z^{a−1}` passes `a − 1`; the
 * `a` of `−zₖ^a/(n b₀)` is therefore `alpha + 1`, which is where that `+1` below comes from.
 *
 * Every root must lie inside the declared determination. D3's `roots-of-minus-one-mislabelled` trap
 * is exactly this check: "for k = n−1 that is (2n−1)π/n < 2π — all inside the declared argRange.
 * Using the principal determination puts roughly half of them at negative arguments and silently
 * changes their zₖ^a factors; the answer stays real and plausible."
 */
export function cyclotomicResidueSum(
  form: CyclotomicForm,
  alpha: Frac,
  argRange: readonly [Frac, Frac],
): CyclotomicSum {
  const a = alpha.add(Frac.ONE);
  const n = BigInt(form.n);

  // `−1/(n b₀)`, the common factor of every residue.
  const scale = form.constant.mul(new Gauss(Frac.of(n), Frac.ZERO)).inv().neg();

  const args: Frac[] = [];
  let sum = ExpSum.ZERO;
  for (let k = 0n; k < n; k++) {
    // `arg zₖ / π = (ψ + 2k)/n`, and it must be the representative lying in the declared window.
    const theta = form.psi.add(Frac.of(2n * k, 1n)).div(Frac.of(n));
    if (theta.sub(argRange[0]).n < 0n || theta.sub(argRange[1]).n >= 0n) {
      const reason =
        `the root at arg = ${theta.n}/${theta.d}·π lies outside the declared determination ` +
        `[${argRange[0].n}/${argRange[0].d}·π, ${argRange[1].n}/${argRange[1].d}·π) — every residue must be ` +
        "evaluated in the declared range, and half of these would change under the principal one";
      return { ok: false, reason, certificate: refuse("the residue sum", reason) };
    }
    args.push(theta);
    // `zₖ^a = e^{i·a·θₖ·π}`.
    sum = sum.add(
      ExpSum.of(SqrtExt.fromGauss(scale), Exponent.piTimes(new Gauss(Frac.ZERO, a.mul(theta)))),
    );
  }

  return {
    ok: true,
    value: sum,
    arguments: args,
    certificate: exact(
      `Σₖ Res = −(1/(n·${formatGauss(form.constant)}))·Σₖ e^{ia(ψ+2k)π/n} over the ${form.n} roots`,
      "the roots of a rotated regular n-gon: each residue is −zₖ^a/(n b₀), and the sum is carried term by term with no root ever represented",
      {
        restriction: `arg z ∈ [${argRange[0].n}/${argRange[0].d}·π, ${argRange[1].n}/${argRange[1].d}·π)`,
        provenance: [
          {
            ok: true,
            text: `zₖ^n = e^{i(${form.psi.n}/${form.psi.d})π} was verified exactly, so arg zₖ = (ψ + 2k)π/n for k = 0…${form.n - 1}`,
          },
          {
            ok: true,
            text: "no individual root is expressed: a fifth or seventh root of −1 needs a degree-4 or degree-6 field, and the SUM needs none",
          },
        ],
      },
    ),
  };
}
