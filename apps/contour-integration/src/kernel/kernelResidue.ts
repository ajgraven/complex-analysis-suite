// `Res(K·f, z₀)` at a pole of the COFACTOR — the other half of tier G's residue sum.
//
// `kernel/summationKernel.ts` handles the kernel's own poles, at every integer, where the residue is
// `1` or `(−1)ⁿ` and `f` is merely evaluated. This file is the poles of `f`, where it is the other
// way round: `f`'s residue is ordinary and exact, and the KERNEL is the thing that has to be
// evaluated at a point. For G2 those are the two poles `±ia` of `1/(z²+a²)`, and they are where the
// answer comes from — `Σ_{n∈ℤ} f(n) = −Σ_j Res(Kf, z_j)`, because the contour integral tends to zero
// and takes the whole left-hand side with it.
//
// **THE `2πi` CANCELS, AND THAT IS STRUCTURAL.** Every other tier ends with `∮ = 2πi Σ n·Res` and
// carries the `2πi` into the answer. Here `∮ → 0`, so the identity is `0 = 2πi[Σ_n f(n) + Σ_j Res]`
// and the factor divides out. What is left is one π — the kernel's own — which is why this returns
// the kernel value in UNITS OF π, matching `piUnits` everywhere else.
//
// **`cot` AND `csc` ARE MÖBIUS FUNCTIONS OF ONE EXPONENTIAL.** With `q = e^{2πiz₀}`,
//
//     cot(πz₀) = i(q + 1)/(q − 1),        csc(πz₀) = 2i·e^{iπz₀}/(q − 1)
//
// — so the value is a RATIO of two elements of the existing basis, and nothing new is needed to
// represent it. That is the whole reason this file introduces {@link ExpRatio} rather than a named
// `coth`: at `z₀ = ia` the ratio IS `−i·coth(πa)`, but the name is a property of that particular
// `z₀`, while the ratio is what the arithmetic works in. Naming it belongs at the end, where the
// answer is formatted, not here where residues are summed.
//
// **ONE STATED RESTRICTION: `z₀` must be a GAUSSIAN rational.** `e^{2πiz₀}` sits in the basis only
// when `2iz₀` is a Gaussian multiple of π, and `Exponent.pi` is a `Gauss` — so a pole carrying a `√d`
// has no representable `q` and is refused by name rather than approximated. G2's `±ia` at rational
// `a` are Gaussian, which is the case the tier is about.
import { Frac, Gauss, QiPoly, SqrtExt } from "@cas/exact";
import { exact, refuse, type Certificate } from "@cas/rigor";
import { ExpSum } from "./expSum.js";
import { Exponent } from "./exponent.js";
import { exactPolesOf } from "./algebraic.js";
import { numericRoots } from "./poles.js";
import type { KernelKind, SummationKernel } from "./summationKernel.js";

/**
 * An exact quotient of two elements of the output basis.
 *
 * The basis `Σ cₖe^{βₖ}` is closed under `+` and `×` but not under `÷`, and `π cot(πz₀)` is a
 * quotient. Rather than widen the basis, the quotient is carried as a PAIR and the arithmetic is
 * schoolbook: cross-multiply to add, multiply componentwise to multiply. Every operation is exact,
 * and the single division that eventually has to happen is deferred to the point where the answer is
 * named — where `sineForm.ts` already knows how to recognise one.
 */
export interface ExpRatio {
  readonly num: ExpSum;
  readonly den: ExpSum;
}

/** `x/1`, for a value that is not a quotient at all. */
export const ratioOf = (num: ExpSum): ExpRatio => ({ num, den: ExpSum.fromSqrtExt(SqrtExt.ONE) });

/** `a + b`, by cross-multiplication — null when a coefficient product leaves one quadratic field. */
export function addRatio(a: ExpRatio, b: ExpRatio): ExpRatio | null {
  const left = a.num.mul(b.den);
  const right = b.num.mul(a.den);
  const den = a.den.mul(b.den);
  if (left === null || right === null || den === null) return null;
  return { num: left.add(right), den };
}

/** `x·c` for an algebraic `c`. */
export const scaleRatio = (x: ExpRatio, c: SqrtExt): ExpRatio => ({ num: x.num.scale(c), den: x.den });

/** The one crossing into the numeric plane, for the cross-check and for display. */
export function ratioToTuple(x: ExpRatio): [number, number] {
  const [nr, ni] = x.num.toTuple();
  const [dr, di] = x.den.toTuple();
  const d = dr * dr + di * di;
  return [(nr * dr + ni * di) / d, (ni * dr - nr * di) / d];
}

const TWO = Frac.of(2n);

/**
 * `cot(πz₀)` or `csc(πz₀)` — the kernel WITHOUT its leading π, exactly.
 *
 * Null when `z₀` is an integer, where `q = 1` and the quotient's denominator vanishes: that is the
 * COLLISION with the kernel's own pole, and `summationKernel.ts` refuses it by name from the other
 * side. Reporting it here as well costs nothing and means neither caller can reach a division by
 * zero through the other's silence.
 */
export function kernelOverPi(kind: KernelKind, z0: Gauss): ExpRatio | null {
  const [re, im] = [z0.re, z0.im];
  // **THE INTEGER TEST IS ON `z₀`, NOT ON THE DENOMINATOR.** `q − 1` vanishes exactly when `z₀ ∈ ℤ`,
  // but `ExpSum` deliberately does NOT reduce exponents modulo `2πi` (halving one is what the sine
  // recogniser does, and halving is not well defined there) — so `e^{2πin}` is a live one-term sum
  // with a non-zero exponent and `q.sub(one).isZero()` is false for every integer. Asking about `z₀`
  // is both correct and the thing actually meant: this is the COLLISION with the kernel's own pole.
  if (im.isZero() && re.d === 1n) return null;
  // `q = e^{2πi z₀}`: the exponent is `π` times the Gaussian `2i·z₀ = −2·Im + 2i·Re`.
  const q = ExpSum.of(SqrtExt.ONE, Exponent.piTimes(new Gauss(im.mul(TWO).neg(), re.mul(TWO))));
  const one = ExpSum.fromSqrtExt(SqrtExt.ONE);
  const den = q.sub(one);
  if (kind === "cot") return { num: q.add(one).scale(SqrtExt.fromGauss(Gauss.I)), den };
  // `csc(πz₀) = 2i·p/(q − 1)` with `p = e^{iπz₀}` — the same denominator, a different numerator.
  const p = ExpSum.of(SqrtExt.ONE, Exponent.piTimes(new Gauss(im.neg(), re)));
  return { num: p.scale(SqrtExt.fromGauss(Gauss.int(0, 2))), den };
}

export type CofactorResidues =
  | {
      readonly ok: true;
      /** `Σ_j Res(K·f, z_j) / π` over the cofactor's poles, exactly. */
      readonly total: ExpRatio;
      readonly at: readonly { readonly z: SqrtExt; readonly value: ExpRatio }[];
      readonly certificate: Certificate;
    }
  | { readonly ok: false; readonly reason: string; readonly certificate: Certificate };

/**
 * `Σ_j Res(K·f, z_j)/π` over every pole of the cofactor, exactly.
 *
 * `Res(K·f, z₀) = K(z₀)·Res(f, z₀)` at a SIMPLE pole of `f` where `K` is regular — the kernel is
 * holomorphic and non-zero there, so the residue of the product is the value times the residue, the
 * same identity `branchResidue.ts` uses for `z^α·R`. A higher-order pole of `f` would mix the
 * kernel's own derivatives in and is refused rather than approximated: no record in the tier has one
 * away from the integers, and one that did would be a different computation rather than a harder case.
 *
 * Poles AT integers are excluded: there the kernel is not regular, the two merge, and the residue is
 * `mergedResidue.ts`'s. The two functions partition the pole set between them.
 */
export function cofactorResidues(kernel: SummationKernel): CofactorResidues {
  // With the root finder, so that the refusal below is about the cofactor and not about this call:
  // without it the cubic `(z²+¼)(z−⅓)` was declined as not exactly pinned, where all three poles are
  // Gaussian rationals.
  const report = exactPolesOf(kernel.num, kernel.den, numericRoots);
  if (!report.complete) {
    const reason =
      "not every pole of the cofactor was pinned exactly, so the kernel cannot be evaluated at them — " +
      "and a residue sum missing a term is the one failure this tier could have and not notice";
    return { ok: false, reason, certificate: refuse("$\\sum_j \\operatorname{Res}(Kf, z_j)$", reason) };
  }

  let total: ExpRatio = ratioOf(ExpSum.ZERO);
  const at: { z: SqrtExt; value: ExpRatio }[] = [];
  for (const pole of report.poles) {
    // **A POLE AT AN INTEGER IS NOT THIS FUNCTION'S.** This is the set where the kernel is REGULAR
    // and `Res(K·f, z₀) = K(z₀)·Res(f, z₀)` holds; at an integer the kernel has a pole too, the two
    // MERGE, and `mergedResidue.ts` computes that instead. Skipping them by construction rather than
    // by a parameter is what keeps the two lists a partition: before this, G1's `1/z²` reached the
    // order-2 refusal below — true of the identity this function applies, and beside the point,
    // because the identity that applies there is a different one.
    const g = pole.at.asGauss();
    if (g !== null && g.im.isZero() && g.re.d === 1n) continue;
    if (pole.order !== 1) {
      const reason =
        `the cofactor has a pole of order ${pole.order}, where Res(K·f, z₀) = K(z₀)·Res(f, z₀) does ` +
        "not hold — the kernel's own derivatives enter, which is a different computation";
      return { ok: false, reason, certificate: refuse("$\\sum_j \\operatorname{Res}(Kf, z_j)$", reason) };
    }
    const z = pole.at.asGauss();
    if (z === null) {
      const reason =
        "a pole of the cofactor carries a √d, so e^{2πiz₀} is not in the basis (Exponent.pi is a " +
        "Gaussian multiple of π) and the kernel cannot be evaluated there exactly";
      return { ok: false, reason, certificate: refuse("$\\sum_j \\operatorname{Res}(Kf, z_j)$", reason) };
    }
    // `kernelOverPi` returns null only at an INTEGER `z₀`, and the partition above has already
    // skipped every one of those — so this cannot be null here. It is read as a value rather than
    // guarded, because a refusal that cannot fire reads as a guard and is not one (M5.6d's lesson,
    // from the invariant that asserted `rank(M) = 0`).
    const k = kernelOverPi(kernel.kind, z);
    if (k === null) throw new Error("unreachable: an integer pole is not in this partition");
    const value = scaleRatio(k, pole.residue);
    at.push({ z: pole.at, value });
    const next = addRatio(total, value);
    if (next === null) {
      const reason =
        "two of the kernel-weighted residues do not share one quadratic extension, so their sum is " +
        "not an element of the output basis";
      return { ok: false, reason, certificate: refuse("$\\sum_j \\operatorname{Res}(Kf, z_j)$", reason) };
    }
    total = next;
  }

  return {
    ok: true,
    total,
    at,
    certificate: exact(
      `Σ_j Res(K·f, z_j) = π·(${at.length} term${at.length === 1 ? "" : "s"}), each K(z_j)·Res(f, z_j)`,
      `the kernel is holomorphic and non-zero at every pole of f, so the residue of the product is the value times the residue; ${
        kernel.kind === "cot" ? "$\\cot" : "$\\csc"
      }(\\pi z_0)$ is a Möbius function of $e^{2\\pi i z_0}$ and therefore an exact quotient of basis elements`,
      {
        provenance: [
          {
            ok: true,
            text: "the $2\\pi i$ of the residue theorem cancels here, because the contour integral tends to zero and the identity is $0 = 2\\pi i[\\sum f(n) + \\sum \\operatorname{Res}]$ — so the answer carries the kernel's own $\\pi$ and no other",
          },
          {
            ok: true,
            text: "every pole is simple and Gaussian, which is what makes $e^{2\\pi i z_0}$ representable and $K(z_0)\\operatorname{Res}(f, z_0)$ the whole residue",
          },
        ],
      },
    ),
  };
}

/** The cofactor's own poles, exactly — exposed so a caller can ask what the sum ran over. */
export function cofactorPoles(num: QiPoly, den: QiPoly): ReturnType<typeof exactPolesOf> {
  return exactPolesOf(num, den);
}
