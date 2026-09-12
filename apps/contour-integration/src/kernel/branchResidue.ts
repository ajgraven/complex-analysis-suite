// `Res(z^α·R(z), z₀)` — the residue of a branch factor times a rational function.
//
// At a SIMPLE pole `z₀` of `R`, `z^α` is holomorphic and non-zero there, so the residue is just
// `z₀^α·Res(R, z₀)`. The whole difficulty is the first factor, and it is not arithmetic — it is a
// question about which determination of `z^α` is meant. D1's `residue-with-the-wrong-argument` trap
// says it exactly:
//
//   > "The pole is at z = −1 = exp(iπ) with arg = π, which IS in (0, 2π). Evaluating (−1)^{α−1} as
//   > exp(−iπ(α−1)) — i.e. with arg = −π, the principal determination — changes the answer by
//   > exp(2πi(α−1)) and NOTHING warns you. Every residue must be evaluated in the declared argRange;
//   > **the check is arithmetic, not a convention.**"
//
// So the argument is not read off `Math.atan2` and used. It is DECIDED: the candidate `r` with
// `z₀ = e^{irπ}` is guessed numerically and then **verified exactly**, and only a candidate lying
// inside the declared range is admitted. That is the same guess-then-verify discipline `poles.ts`
// uses for the poles themselves ("floating roots make excellent candidates, and a candidate is only
// promoted once the exact denominator vanishes there").
//
// TWO BOUNDS, BOTH DECLARED.
//
// **The modulus must be a rational times a square root.** `z₀ = r e^{iθ}` gives
// `z₀^α = e^{α ln r + iαθ}`, so the exponent needs `ln r` — which M4.5 added (`kernel/logPart.ts`).
// What it holds is `Σ(ℚ)·ln(ℚ₊)`, so `r ∈ ℚ₊` works (D2's poles at `−2` and `−4`) and so does
// `r = q√d`, since `ln(q√d) = ln q + ½ln d`. A modulus like `1 + √2` is outside it and is refused by
// name. Through M4.4 every pole in the corpus sat on the circle and `ln r` was zero.
//
// **`arg z₀ / π` has denominator 1, 2, 3, 4 or 6.** Those are precisely the roots of unity that live
// in a quadratic extension of ℚ(i) — `±1`, `±i`, `(±1±i)/√2`, `(±1±i√3)/2`, `(±√3±i)/2` — and
// `SqrtExt` is one quadratic extension. A fifth or seventh root of `−1` is not representable here at
// all, so `exactPolesOf` will not have pinned it either; refusing is honest rather than restrictive,
// and D3's `n = 5` and `n = 7` fixtures reach their answer by summing the residues as a GEOMETRIC
// SERIES instead, which never names an individual root.
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { exact, refuse, type Certificate } from "@cas/rigor";
import { ExpSum, formatExpSum } from "./expSum.js";
import { Exponent } from "./exponent.js";
import { formatSqrtExt } from "./formatExact.js";
import { LogPart, formatLogPart } from "./logPart.js";
import type { AlgebraicPole } from "./algebraic.js";

/** The branch factor `z^α`, and the determination it is read in. */
export interface PowerFactor {
  readonly alpha: Frac;
  /**
   * `arg z ∈ [lo·π, hi·π)`, as rational multiples of π.
   *
   * `[0, 2)` is the keyhole's `(0,2π)`; `[−1, 1)` is the principal determination. The width must be
   * exactly 2, since a determination of `arg` covers one turn and no more.
   */
  readonly argRange: readonly [Frac, Frac];
}

export type BranchResidue =
  | {
      readonly ok: true;
      readonly value: ExpSum;
      /** `arg z₀ = argMultiple·π`, exactly — what the record's trap is about. */
      readonly argMultiple: Frac;
      readonly certificate: Certificate;
    }
  | { readonly ok: false; readonly reason: string; readonly certificate: Certificate };

/** Complex conjugate of `a + b√d`: conjugate each Gaussian coefficient, since `√d` is real. */
const conjugate = (x: SqrtExt): SqrtExt => SqrtExt.of(x.a.conj(), x.b.conj(), x.d);

/**
 * `e^{iπ/m}` for the five `m` whose primitive root lives in one quadratic extension of ℚ(i).
 *
 * These are not a convenient subset — they are all of them. `ℚ(i)(ζ)` for `ζ = e^{iπ/m}` is a
 * quadratic extension exactly when `m ∈ {1, 2, 3, 4, 6}`; `m = 5` needs degree 4 and `m = 7` degree 6.
 */
const PRIMITIVE: Readonly<Record<number, SqrtExt>> = {
  1: SqrtExt.fromGauss(Gauss.ONE.neg()),
  2: SqrtExt.fromGauss(Gauss.I),
  3: SqrtExt.of(Gauss.rat(1n, 2n), Gauss.rat(0n, 1n, 1n, 2n), 3n),
  4: SqrtExt.of(Gauss.ZERO, Gauss.rat(1n, 2n, 1n, 2n), 2n),
  6: SqrtExt.of(Gauss.rat(0n, 1n, 1n, 2n), Gauss.rat(1n, 2n), 3n),
};

/** `e^{i(k/m)π}` exactly, or null when `m` is outside the representable set. */
export function unitRoot(k: bigint, m: bigint): SqrtExt | null {
  const base = PRIMITIVE[Number(m)];
  if (base === undefined) return null;
  // `e^{iπ/m}` has order `2m`, so reduce the exponent first: it keeps the intermediate products
  // small and makes a negative `k` no different from a positive one.
  const period = 2n * m;
  const e = ((k % period) + period) % period;
  let acc = SqrtExt.ONE;
  for (let j = 0n; j < e; j++) {
    try {
      acc = acc.mul(base);
    } catch {
      return null;
    }
  }
  return acc;
}

/**
 * The denominators to try, smallest first — READ OFF {@link PRIMITIVE} rather than written again.
 *
 * A second list would be a second source of truth, and the kind that fails silently: adding a
 * denominator to it without a primitive root just makes every candidate at that denominator fail to
 * verify, so the list would look load-bearing while doing nothing.
 */
const DENOMINATORS: readonly bigint[] = Object.keys(PRIMITIVE)
  .map((k) => BigInt(k))
  .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * The POSITIVE REAL modulus `z₀·conj(ζ)` for a candidate root of unity `ζ` — or null.
 *
 * This is the verification, and it is exact. `z₀ = r·ζ` exactly when `z₀·ζ⁻¹` is a positive real,
 * and `ζ⁻¹ = conj(ζ)` on the unit circle; dividing rather than comparing is what lets the same test
 * serve a pole OFF the circle, where `r ≠ 1` and `ζ` alone can never equal `z₀`.
 */
function modulusAlong(at: SqrtExt, root: SqrtExt): SqrtExt | null {
  let w: SqrtExt;
  try {
    w = at.mul(conjugate(root));
  } catch {
    return null;
  }
  // Real: no `i` in either coefficient. Positive: the value is, and it is checked numerically only
  // to pick the sign — the EQUALITY that matters was decided exactly above.
  if (!w.a.im.isZero() || !w.b.im.isZero()) return null;
  const [re, im] = w.toTuple();
  if (Math.abs(im) > 1e-12 || re <= 0) return null;
  return w;
}

/**
 * `ln r` for a positive `r ∈ ℚ(√d)`, when the basis holds it — `ℚ₊` or `q√d`.
 *
 * `ln(q√d) = ln q + ½ln d`, so a pure radical is fine. `1 + √2` is not: its logarithm is not a
 * rational combination of logarithms of rationals at all, and refusing beats inventing an atom for
 * it (which would break `logPart.ts`'s canonicity, and with it the decidability of `equals`).
 */
function logModulusOf(r: SqrtExt): LogPart | null {
  const rational = r.b.isZero() ? r.a.re : null;
  if (rational !== null) return LogPart.ln(rational);
  if (!r.a.isZero()) return null;
  const coefficient = LogPart.ln(r.b.re);
  const radical = LogPart.ln(Frac.of(r.d));
  if (coefficient === null || radical === null) return null;
  return coefficient.add(radical.scale(Frac.of(1n, 2n)));
}

/**
 * `arg z₀ / π` as an exact rational inside the declared range, with `ln|z₀|` — guessed, then VERIFIED.
 *
 * The guess comes from `atan2` and the verification from exact arithmetic, so a near miss is a
 * refusal rather than a plausible answer.
 */
function argumentMultiple(
  at: SqrtExt,
  range: readonly [Frac, Frac],
): { r: Frac; modulus: SqrtExt } | null {
  const [re, im] = at.toTuple();
  const guess = Math.atan2(im, re) / Math.PI; // in (−1, 1]
  const lo = range[0].toNumber();
  const hi = range[1].toNumber();
  for (const m of DENOMINATORS) {
    // Lift the guess by whole turns into the declared window, then check the neighbours: the float
    // may land a hair outside, and the exact test below is what decides either way.
    const turns = Math.round((lo - guess) / 2);
    for (const nudge of [0, 1, -1]) {
      const k = BigInt(Math.round((guess + 2 * (turns + nudge)) * Number(m)));
      const r = Frac.of(k, m);
      const value = r.toNumber();
      if (value < lo || value >= hi) continue;
      const candidate = unitRoot(k, m);
      if (candidate === null) continue;
      const modulus = modulusAlong(at, candidate);
      if (modulus !== null) return { r, modulus };
    }
  }
  return null;
}

/**
 * `arg z₀ / π`, decided in the declared determination — the one place that question is answered.
 *
 * Both bounds of the module header live here, because both are about the POLE and the RANGE and
 * neither is about what is raised to what: `z₀^α` and `log z₀` need exactly the same fact, and a
 * second copy of this reasoning is a second place for the determination to drift.
 */
export function argumentOfPole(
  at: SqrtExt,
  argRange: readonly [Frac, Frac],
): { readonly ok: true; readonly r: Frac; readonly logModulus: LogPart } | { readonly ok: false; readonly reason: string } {
  const width = argRange[1].sub(argRange[0]);
  if (!width.equals(Frac.of(2n))) {
    return {
      ok: false,
      reason: `the declared argument range has width ${width.n}/${width.d}·π, but a determination of arg covers exactly one turn (2π)`,
    };
  }

  const found = argumentMultiple(at, argRange);
  if (found === null) {
    return {
      ok: false,
      reason:
        `arg(${formatSqrtExt(at)}) was not verified to be a rational multiple of π with denominator ` +
        `1, 2, 3, 4 or 6 inside the declared range — those are the only roots of unity one quadratic ` +
        "extension of ℚ(i) can hold, and a fifth or seventh root reaches its answer by summing the " +
        "residues as a geometric series instead",
    };
  }

  const logModulus = logModulusOf(found.modulus);
  if (logModulus === null) {
    return {
      ok: false,
      reason:
        `the pole ${formatSqrtExt(at)} has modulus ${formatSqrtExt(found.modulus)}, whose logarithm ` +
        "is not a rational combination of logarithms of rationals — this basis holds ℚ₊ and q√d, " +
        "and inventing an atom for anything else would break the canonical form that makes exponents comparable",
    };
  }
  return { ok: true, r: found.r, logModulus };
}

/**
 * `z₀^α` in the declared determination, as a one-term element of the output basis.
 *
 * `z₀ = e^{irπ}` on the unit circle, so `z₀^α = e^{iαrπ}` — an exponent with a π component and
 * nothing else, which is exactly what {@link Exponent} carries.
 */
export function powerAtPole(at: SqrtExt, factor: PowerFactor): BranchResidue {
  const argument = argumentOfPole(at, factor.argRange);
  if (!argument.ok) {
    return { ok: false, reason: argument.reason, certificate: refuse("the branch factor", argument.reason) };
  }
  const r = argument.r;

  // `z₀^α = e^{α·ln r} · e^{iαθ}` with `θ = rπ`. On the unit circle the first factor is `e^0` and
  // this is exactly what M4.2 computed; off it, the logarithm is the only new thing.
  const exponent = Exponent.of(
    SqrtExt.ZERO,
    new Gauss(Frac.ZERO, factor.alpha.mul(r)),
    argument.logModulus.scale(factor.alpha),
  );
  return {
    ok: true,
    value: ExpSum.of(SqrtExt.ONE, exponent),
    argMultiple: r,
    certificate: exact(
      `z₀^α at ${formatSqrtExt(at)} is ${formatExpSum(ExpSum.of(SqrtExt.ONE, exponent))}`,
      "the argument is DECIDED: a rational multiple of π is guessed numerically and then verified in exact arithmetic",
      {
        restriction: `arg z ∈ [${factor.argRange[0].n}/${factor.argRange[0].d}·π, ${factor.argRange[1].n}/${factor.argRange[1].d}·π)`,
        provenance: [
          {
            ok: true,
            text: `arg(${formatSqrtExt(at)}) = ${r.n}/${r.d}·π, verified exactly over ℚ(i)(√d) by dividing z₀ by e^{irπ} and finding a positive real${
              argument.logModulus.isZero() ? " of modulus 1" : ` modulus with ln = ${formatLogPart(argument.logModulus)}`
            }`,
          },
          {
            ok: true,
            text: "the determination is an INPUT to the answer: the principal branch would change it by e^{2πiα} with nothing to warn you",
          },
        ],
      },
    ),
  };
}

/**
 * `Res(z^α·R(z), z₀) = z₀^α·Res(R, z₀)` at a simple pole.
 *
 * SIMPLE ONLY. At order `m > 1` the residue needs derivatives of `z^α`, which introduce powers of
 * `ln z` as well — a different basis, not a longer computation. Every keyhole in the gallery has a
 * squarefree denominator, so nothing in the corpus is lost.
 */
export function branchResidue(pole: AlgebraicPole, factor: PowerFactor): BranchResidue {
  if (pole.order !== 1) {
    const reason = `the pole ${formatSqrtExt(pole.at)} has order ${pole.order}; z^α times a higher-order pole needs powers of log z, which are outside this basis`;
    return { ok: false, reason, certificate: refuse("the residue", reason) };
  }
  const power = powerAtPole(pole.at, factor);
  if (!power.ok) return power;
  return { ...power, value: power.value.scale(pole.residue) };
}
