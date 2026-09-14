// `c·coth(π r)` and `c·csch(π r)` — the form tier G's sums land in, and the one recogniser that
// names them.
//
// A SIBLING OF `sineForm.ts`, NOT A THIRD RULE INSIDE IT. That module's warning is explicit — "a
// second and third rule accreting into a simplifier is the failure mode" — and it is about a
// DIVISION: `divideCarryingSine` takes a numerator and a two-term coefficient and recognises what
// dividing by the latter produces. This recognises something else entirely: an {@link ExpRatio}
// that arose because `cot(πz₀)` is a Möbius function of `e^{2πiz₀}` (`kernelResidue.ts`), so the
// answer was a quotient before any solve touched it. Different input, different provenance, its own
// module — and one shared output type, because the E2 lesson (a right value under a wrong form) was
// caused by a value and a text computed from different objects.
//
// **AND IT IS A MULTIPLIER, NOT A DENOMINATOR.** `sine` and `cosh` divide — `π/sin(πα)` is how D1's
// record writes its answer. G2's record writes `(π/a)·coth(πa)`, a product, and `1/tanh` shown as a
// second division would be the same number in a form no reader is looking for. That is why this
// takes its own field on `SineForm` rather than reusing one of the two that are there.
//
// ── THE DECLARED SHAPE, AND NOTHING ELSE ──────────────────────────────────────────────────────────
// The cofactor's residues cross-multiply (`addRatio`) into exactly one shape for a two-pole
// conjugate cofactor, which is what tier G's records have:
//
//     num = c·e^{δ} − c·e^{−δ} = 2c·sinh(δ)
//     den = −e^{γ} + 2 − e^{−γ} = −4·sinh²(γ/2)
//
// and `δ` is `γ` or `γ/2` — the two cases being the two kernels, not two patterns:
//
//     δ = γ    (cot)  ⇒  2c·sinh(γ)/(−4 sinh²(γ/2))   = −c·coth(γ/2)
//     δ = γ/2  (csc)  ⇒  2c·sinh(γ/2)/(−4 sinh²(γ/2)) = −(c/2)·csch(γ/2)
//
// Everything else refuses. `γ` is `2πa` for a cofactor with poles at `±ia`, so `γ/2 = πa` and the
// recognised `r` is `a` itself — which is why the answer prints in the parameter the record declared
// rather than in a multiple of it.
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { exact, refuse, type Certificate } from "@cas/rigor";
import { ExpSum } from "./expSum.js";
import { Exponent } from "./exponent.js";
import type { ExpRatio } from "./kernelResidue.js";
import type { SineForm } from "./sineForm.js";

export type CothRecognition =
  | { readonly ok: true; readonly form: SineForm; readonly certificate: Certificate }
  | { readonly ok: false; readonly reason: string; readonly certificate: Certificate };

const no = (reason: string): CothRecognition => ({
  ok: false,
  reason,
  certificate: refuse("the hyperbolic form", reason),
});

/**
 * A REAL exponent `π·t` with `t > 0` rational, or null.
 *
 * Real because these exponents come from `e^{2πiz₀}` at a purely imaginary `z₀`; the recogniser
 * refuses anything carrying an algebraic part, a logarithm or an imaginary π coefficient rather than
 * guessing what `sinh` of it would mean.
 */
function realPiPart(e: Exponent): Frac | null {
  if (!e.algebraic.isZero() || !e.log.isZero() || !e.pi.im.isZero()) return null;
  return e.pi.re;
}

/** `−e^{γ} + 2 − e^{−γ}` with `γ = π·g`, `g > 0` — the square of a sinh, and the only denominator here. */
function denominatorHalfTurn(den: ExpSum): Frac | null {
  if (den.terms.length !== 3) return null;
  const constant = den.terms.find((t) => t.exponent.isZero());
  if (constant === undefined || !constant.coefficient.equals(SqrtExt.fromGauss(Gauss.int(2)))) return null;
  const wings = den.terms.filter((t) => !t.exponent.isZero());
  if (wings.length !== 2) return null;
  const minusOne = SqrtExt.fromGauss(Gauss.int(-1));
  if (!wings.every((t) => t.coefficient.equals(minusOne))) return null;
  const g = realPiPart(wings[0].exponent);
  const h = realPiPart(wings[1].exponent);
  if (g === null || h === null || !g.add(h).isZero()) return null;
  // `g` and `−g` name the same denominator; take the positive one so `r` is positive and the
  // printed `coth(πr)` matches the record, which states its parameter as positive.
  return g.n > 0n ? g : h;
}

/** `c·e^{δ} − c·e^{−δ} = 2c·sinh(δ)`, returning `(c, δ/π)`. */
function numeratorSinh(num: ExpSum): { readonly c: SqrtExt; readonly d: Frac } | null {
  if (num.terms.length !== 2) return null;
  const [x, y] = num.terms;
  if (!x.coefficient.add(y.coefficient).isZero()) return null;
  const dx = realPiPart(x.exponent);
  const dy = realPiPart(y.exponent);
  if (dx === null || dy === null || !dx.add(dy).isZero()) return null;
  // Orient on the POSITIVE exponent, so `c` is the coefficient of `e^{+δ}` and the sign of
  // `2c·sinh(δ)` is not a function of which term the normal form happened to put first.
  //
  // **A RECORDED EQUIVALENT MUTANT.** Dropping the branch and always taking `x` passes every test,
  // and measurably so rather than for want of one: `ExpSum.normalise` re-sorts, so building the pair
  // in either order yields the IDENTICAL object with `e^{+δ}` first, and no test constructed from an
  // `ExpSum` can distinguish the two. The branch is kept because it states the contract — return the
  // coefficient of `e^{+δ}` — rather than an ordering that happens to hold; the mutant would silently
  // refuse every input if that ordering ever changed, and nothing here would say why.
  return dx.n > 0n ? { c: x.coefficient, d: dx } : { c: y.coefficient, d: dy };
}

/**
 * Name an {@link ExpRatio} as `c·coth(π r)` or `c·csch(π r)`, exactly — or refuse.
 *
 * The result is a {@link SineForm} so that ONE formatter and ONE number-reader serve every solved
 * target in the app. `form.sum` is `c` in units of π, as everywhere else.
 */
export function asHyperbolicForm(ratio: ExpRatio): CothRecognition {
  const g = denominatorHalfTurn(ratio.den);
  if (g === null) {
    return no(
      "the denominator is not `−e^{γ} + 2 − e^{−γ}` with a real `γ`, which is the only shape this " +
        "names — a two-pole conjugate cofactor's cross-multiplied `(q − 1)(q′ − 1)`, i.e. `−4sinh²(γ/2)`",
    );
  }
  const n = numeratorSinh(ratio.num);
  if (n === null) {
    return no(
      "the numerator is not `c·e^{δ} − c·e^{−δ}` with a real `δ`, so it is not `2c·sinh(δ)` and the " +
        "quotient is not a hyperbolic cotangent or cosecant",
    );
  }

  // `r = γ/(2π)`: the half-turn of the denominator's own exponent, which for poles at `±ia` is `a`.
  const r = g.div(Frac.of(2n));
  const two = SqrtExt.fromGauss(Gauss.int(2));
  let kind: "coth" | "csch";
  let c: SqrtExt;
  if (n.d.equals(g)) {
    // `2c·sinh(γ) / (−4sinh²(γ/2))` — the double-angle identity, exactly: `sinh γ = 2 sinh(γ/2) cosh(γ/2)`.
    kind = "coth";
    c = n.c.neg();
  } else if (n.d.equals(r)) {
    kind = "csch";
    c = n.c.neg().div(two);
  } else {
    return no(
      `the numerator's half-exponent is π·${n.d.n}/${n.d.d} and the denominator's is π·${r.n}/${r.d}: ` +
        "a hyperbolic cotangent needs them equal after doubling and a cosecant needs them equal, and " +
        "neither holds — the two cases are the two KERNELS, not two patterns to search among",
    );
  }
  if (r.isZero()) {
    return no("the recognised argument is zero, where coth and csch both have a pole");
  }

  return {
    ok: true,
    form: { sum: ExpSum.fromSqrtExt(c), hyperbolic: { kind, r } },
    certificate: exact(
      `the residue sum is c·${kind}(π·${r.n}/${r.d})`,
      kind === "coth"
        ? "2c·sinh(γ) / (−4 sinh²(γ/2)) = −c·coth(γ/2), by the double-angle identity sinh γ = 2 sinh(γ/2) cosh(γ/2)"
        : "2c·sinh(γ/2) / (−4 sinh²(γ/2)) = −(c/2)·csch(γ/2)",
      {
        provenance: [
          {
            ok: true,
            text: "the denominator is the cross-multiplied (q − 1)(q′ − 1) of a conjugate pair of cofactor poles, which is exactly −4sinh²(γ/2)",
          },
          {
            ok: true,
            text: `which of the two the quotient is was decided by comparing two exponents exactly, not by matching a pattern: ${
              kind === "coth" ? "the π cot kernel puts δ = γ" : "the π csc kernel puts δ = γ/2"
            }`,
          },
        ],
      },
    ),
  };
}
