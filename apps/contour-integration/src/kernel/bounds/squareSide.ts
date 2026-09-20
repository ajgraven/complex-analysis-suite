// The summation square's vanishing bound — and the one the research states is not a bound.
//
//     |∮_{Γ_N} K·f dz|  ≤  sup|K| · perimeter · sup|f|  =  8π·coth(π/2) · (N+½) · max|f|
//
// Three factors, each exact in ℚ and each with its own reason.
//
// **`sup|K| = coth(π(N+½)) ≤ coth(π/2)`, attained at `N = 0`.** On a horizontal side
// `|cot πz|² = (cos²πx + sinh²πy)/(sin²πx + sinh²πy) ≤ coth²(πy)`; on a vertical side `cos πx = 0`,
// so `|cot πz| = |tanh πy| < 1`. The sup over the whole FAMILY is therefore the `N = 0` value, which
// is what makes one constant serve every contour in the limit — and it is also why the half-integers
// are forced: at an integer half-width the vertical sides run through the kernel's own poles and the
// sup is infinite, and at anything else the sup is finite for each contour but not uniformly bounded
// as the half-width approaches an integer, so there is no limit argument at all. For `csc` the same
// split gives `≤ 1/sinh(π/2)` horizontally and `≤ 1` vertically, so `sup|csc πz| = 1` exactly, for
// every `N`.
//
// **The perimeter is `8(N+½)`**, which research 03 §8 writes as `4(2N+1)` and is the same number.
//
// **`max|f|` is taken at `|z| = N+½`, and bounds `|f|` on the whole square.** Every point of `Γ_N`
// has `|z| ≥ N+½`, and the reverse-triangle quotient `U(r)/L(r)` is DECREASING in `r` once both
// halves are divided by `r^{deg D}`: the numerator's exponents `j − deg D` are then all non-positive
// and the denominator's subtracted sum shrinks, so `U(r)/L(r) ≤ U(h)/L(h)` for every `r ≥ h`. No
// monotonicity of `|f|` is assumed — it is a term-by-term inequality using only `|z| ≥ h`, which is
// what lets the existing `maxModulusBound` be reused unchanged and the whole bound collapse to one
// product.
//
// **FINDING D-2.** Research 03 §8 states this bound as `(M/N^k)·coth(π/2)·4(2N+1)`, which drops the
// `π` from `π cot(πz)`. That is not a slack bound — it is not a bound: against the measured
// `|∮ π cot(πz)/z² dz|` it reads 3.392 vs 3.567 at `N = 3` and 0.356 vs 0.493 at `N = 25`, failing by
// 30–40% at every `N` tested. Both figures are recomputed in this app's own suite, so the wrong
// statement is refuted by a test rather than only by a paragraph. The corrected bound holds with
// slack ~2.2× on the same fixtures.
import { Frac, QiPoly } from "@cas/exact";
import { piLower, piUpper } from "@cas/exact";
import { bound, refuse } from "@cas/rigor";
import { maxModulusBound, type ArcBound } from "./mlRational.js";
import type { KernelKind } from "../summationKernel.js";

/** How far the exponential series is taken when bracketing `e^π` from below. */
const EXP_TERMS = 40;

/**
 * Digits of `π` to keep before raising it to the 40th power.
 *
 * TRUNCATING A LOWER BOUND DOWNWARD LEAVES A LOWER BOUND, so this costs certainty nothing — and it
 * costs a great deal of arithmetic. `piLower()` is a rational accurate to far more digits than the
 * series needs; `x^40/40!` over it produces BigInts with thousands of digits, and the ledger was
 * spending 3.1 seconds per square side on a CONSTANT. Twenty digits leaves the bracket tighter than
 * float64 can resolve, which the tests assert in ℚ for exactly that reason.
 */
const PI_DIGITS = 20n;

/**
 * A certified LOWER bound on `e^π`, in ℚ.
 *
 * `e^x ≥ Σ_{k≤n} x^k/k!` for `x > 0` because every omitted term is positive, and `e^x` is increasing,
 * so evaluating the truncated series at a certified lower bracket for π bounds `e^π` from below
 * twice over — two truncations, both downward, both in the direction the bound needs.
 *
 * Kept here rather than in `@cas/exact` beside `piBounds`: one consumer (ADR-0007), and the moment a
 * second needs `e^x` at another argument this becomes the extraction rather than the special case.
 */
function expPiLower(terms = EXP_TERMS): Frac {
  const scale = 10n ** PI_DIGITS;
  const exact = piLower();
  // `floor(π_lower · 10^d)/10^d` — down, so still below π.
  const x = Frac.of((exact.n * scale) / exact.d, scale);
  let sum = Frac.ZERO;
  let term = Frac.ONE;
  for (let k = 0; k < terms; k++) {
    sum = sum.add(term);
    term = term.mul(x).div(Frac.of(BigInt(k + 1)));
  }
  return sum;
}

/** `coth(π/2)`'s bracket, computed once: it is a constant, and the ledger asks per side. */
let cothHalfPi: Frac | null = null;

/**
 * A certified UPPER bound on `sup_{Γ_N}|K|`, in ℚ — `coth(π/2)` for `cot`, exactly `1` for `csc`.
 *
 * `coth(π/2) = 1 + 2/(e^π − 1)`, so an upper bound on it is a LOWER bound on `e^π`. The `csc` case
 * needs no bracket at all: its sup is `1` for every `N`, which is why G3's slack is an order of
 * magnitude better than G1's on the same contours.
 */
export function kernelSupBound(kind: KernelKind): Frac {
  if (kind === "csc") return Frac.ONE;
  cothHalfPi ??= Frac.ONE.add(Frac.of(2n).div(expPiLower().sub(Frac.ONE)));
  return cothHalfPi;
}

/** The square's half-width as `N + ½`, or null when it is not one. */
export function asHalfInteger(halfWidth: Frac): bigint | null {
  const twice = halfWidth.mul(Frac.of(2n));
  if (twice.d !== 1n) return null;
  if (twice.n < 1n || twice.n % 2n === 0n) return null;
  return (twice.n - 1n) / 2n;
}

/**
 * `|∫ over ONE side| ≤ π·sup|K|·2(N+½)·max|f|`, exact in ℚ — a quarter of the contour bound.
 *
 * Per SIDE rather than per contour, because that is what the ledger's KILL pass asks about and each
 * side's ML bound is a genuine bound for that side; four of them sum to the
 * `8π·coth(π/2)·(N+½)·max|f|` the header derives, which a reader can see is four times one row. The
 * `π` is the kernel's own and is the factor research 03 drops (finding D-2).
 *
 * `halfWidth` must be `N + ½`: anything else is refused by name rather than bounded from the wrong
 * geometry, since at an integer the sup is infinite and in between there is no uniform bound.
 */
export function squareSideBound(
  kind: KernelKind,
  num: QiPoly,
  den: QiPoly,
  halfWidth: Frac,
  param = "N",
): ArcBound {
  const n = asHalfInteger(halfWidth);
  if (n === null) {
    const reason =
      `the square's half-width is ${halfWidth.n}/${halfWidth.d}, which is not N + ½: at an INTEGER ` +
      "half-width the vertical sides run through the kernel's poles and sup|K| is infinite, and at " +
      "any other width sup|K| is finite for this one contour but not uniformly bounded as the width " +
      "approaches an integer — so there is no limit argument to make";
    return {
      R: halfWidth,
      asymptotics: "bounded",
      exponent: Number.POSITIVE_INFINITY,
      certificate: refuse("the square's vanishing bound", reason),
    };
  }

  const gap = den.degree() - num.degree();
  if (gap < 0 || den.degree() < 1) {
    const reason =
      "the cofactor must be a proper rational function for |f| ≤ M/|z|^k to hold with k ≥ 0; this one has deg N > deg D";
    return {
      R: halfWidth,
      asymptotics: "diverges",
      exponent: Number.POSITIVE_INFINITY,
      certificate: refuse("the square's vanishing bound", reason),
    };
  }

  const maxF = maxModulusBound(num, den, halfWidth);
  if (maxF === null) {
    const reason =
      `the reverse-triangle bound on |D(z)| is not positive at |z| = ${halfWidth.n}/${halfWidth.d}, ` +
      "so a root of the cofactor may lie on or outside the square and max|f| cannot be certified there";
    return {
      R: halfWidth,
      asymptotics: "bounded",
      exponent: Number.POSITIVE_INFINITY,
      certificate: refuse("the square's vanishing bound", reason),
    };
  }

  const sup = kernelSupBound(kind);
  // One side: `sup|K| · length · max|f|` with `sup|K| = π·coth(π/2)` and `length = 2(N+½)`.
  const value = Frac.of(2n).mul(piUpper()).mul(sup).mul(halfWidth).mul(maxF);
  // `max|f| = O(h^{−k})`, so `h·max|f| = O(h^{1−k})` and the bound vanishes exactly when `k > 1` —
  // which is the classical hypothesis, arrived at through the geometry rather than asserted.
  const exponent = 1 - gap;
  const vanishes = exponent < 0;
  return {
    R: halfWidth,
    value,
    // **`at` IS `N`, NOT THE HALF-WIDTH.** The contour's parameter is `N` and the geometry is
    // `N + ½`, so a scrub handed `halfWidth` would write 3.5 into a field whose slider reads 3 and
    // move the square by half a unit on the first drag. `asHalfInteger` has already decided the
    // question exactly, and the claim beside it prints `at $N = ${n}$` for the same reason.
    evaluated: { param, at: Number(n), bound: value.toNumber() },
    asymptotics: vanishes ? "vanishes" : "bounded",
    exponent,
    degreeGap: gap,
    certificate: bound(
      "≤",
      `this side: $\\left|\\int Kf\\,dz\\right| \\le ${value.toNumber().toExponential(3)}$ at $N = ${n}$, and ${
        vanishes
          ? `$\\to 0$ as $N \\to \\infty$, because the bound is $O((N+\\tfrac12)^{${exponent}})$`
          : "does not vanish"
      }`,
      `the ML-estimate on one side of $\\Gamma_N$: $\\sup|K| \\cdot \\text{length} \\cdot \\max|f| = \\pi${
        kind === "csc" ? "" : "\\coth(\\pi/2)"
      } \\cdot 2(N+\\tfrac12) \\cdot \\max|f|$, exact in $\\mathbb{Q}$ with $\\pi$ and $\\coth(\\pi/2)$ entering only through certified brackets`,
      {
        restriction: `$N + \\tfrac12 = ${halfWidth.n}/${halfWidth.d}$; $\\deg D - \\deg N = ${gap}$`,
        provenance: [
          {
            ok: true,
            text:
              kind === "csc"
                ? "$\\sup|\\csc \\pi z| = 1$ on $\\Gamma_N$ for every $N$: $\\le 1/\\sinh(\\pi/2)$ on the horizontal sides and $\\le 1$ on the vertical ones"
                : "$\\sup|\\cot \\pi z| = \\coth(\\pi(N+\\tfrac12)) \\le \\coth(\\pi/2)$, attained at $N = 0$ — one constant for every $N$, which is what the limit needs",
          },
          {
            ok: true,
            text: "$\\max|f|$ is read at $|z| = N+\\tfrac12$ and bounds $|f|$ on the whole square: $U(r)/L(r)$ decreases in $r$ once both are divided by $r^{\\deg D}$, so the closest point of $\\Gamma_N$ is the worst",
          },
        ],
      },
    ),
  };
}

/**
 * The whole square's bound: four sides, one number — what `8π·coth(π/2)·(N+½)·max|f|` is.
 *
 * Exists so the D-2 comparison is against the quantity research 03 §8 states, which is about the
 * closed contour. Null exactly when the side bound refuses.
 */
export function squareContourBound(
  kind: KernelKind,
  num: QiPoly,
  den: QiPoly,
  halfWidth: Frac,
): Frac | null {
  const side = squareSideBound(kind, num, den, halfWidth);
  return side.value === undefined ? null : side.value.mul(Frac.of(4n));
}

/**
 * The bound research 03 §8 states — computed so the suite can show that it FAILS.
 *
 * Not used by the engine, and it is here rather than in a test because a refutation belongs beside
 * the thing it refutes: `(M/N^k)·coth(π/2)·4(2N+1)`, with `M` the same quantity the corrected bound
 * uses. Returns null at `N = 0`, where `1/N^k` is not a number.
 */
export function researchSquareBound(kind: KernelKind, num: QiPoly, den: QiPoly, n: bigint): Frac | null {
  if (n < 1n) return null;
  const gap = den.degree() - num.degree();
  const halfWidth = Frac.of(2n * n + 1n, 2n);
  const maxF = maxModulusBound(num, den, halfWidth);
  if (maxF === null) return null;
  // `M` is `sup |z|^k |f|`, which is `h^k · max|f|` — the same quantity, stated the way §8 states it.
  const M = maxF.mul(power(halfWidth, gap));
  return M.div(power(Frac.of(n), gap)).mul(kernelSupBound(kind)).mul(Frac.of(4n * (2n * n + 1n)));
}

/** `x^k` for `k ≥ 0`. `Frac` has no `pow`, and a loop is clearer than reaching for one. */
function power(x: Frac, k: number): Frac {
  let out = Frac.ONE;
  for (let i = 0; i < k; i++) out = out.mul(x);
  return out;
}
