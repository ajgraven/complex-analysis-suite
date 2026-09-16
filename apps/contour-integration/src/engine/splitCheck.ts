// **DOES THE DECLARED SPLIT REPRODUCE WHAT WAS TYPED?**
//
// Once the sandbox declares a branch factor, the integrand box holds only the rational cofactor
// `R(z)` and the whole integrand is `c·(s(z − b))^α·R(z)`. That is a claim the reader made, and an
// app that simply believed it would be asking them to trust a split they cannot check — the exact
// thing M4.1 refused to do when it made the cut editor a DECLARATION rather than a detector.
//
// It cannot be verified as a statement about intent. It can be verified as arithmetic, against the
// expression that was in the box immediately before the declaration: multiply the declared product
// by the cofactor and see whether the result is that expression.
//
// **WHERE the comparison is legitimate is the whole problem, and it is decided rather than guessed.**
// `@cas/expr` compiles `z^α` in its PRINCIPAL branch. The declared determination is whatever the
// window says, and for D1's `[0, 2π)` the two disagree on the entire lower half plane — where the
// split is perfectly correct and the numbers differ by `e^{2πiα}` anyway. Testing there would
// report a false failure; testing only "somewhere" would let a wrong split through.
//
// So the region is computed, not assumed: evaluate the declared product a second time with every
// factor's window moved to the PRINCIPAL edge, and compare. Where those two agree, the declared
// determination *is* the one `@cas/expr` compiled, and the split must reproduce the typed expression
// exactly. Where they differ, nothing is claimed. This needs no special case for the window being
// principal already (the twin is then the product itself, and every sample counts) and no special
// case for a log (whose determinations differ additively rather than by a phase — the twin
// comparison notices either way).
import { makeComplexFn, type Node } from "@cas/expr";
import { Frac } from "@cas/exact";
import { evaluateDeclared, type DeclaredProduct } from "../kernel/branch/declared.js";
import type { Cx } from "../kernel/geom.js";

export interface SplitCheck {
  /** True only when the split was CHECKED and held. An unverifiable split is not ok. */
  readonly ok: boolean;
  /** How many sample points the two determinations agreed at — where the claim is testable at all. */
  readonly checked: number;
  /** Worst relative discrepancy among those points; `0` when nothing was checkable. */
  readonly worst: number;
  /** What to tell the reader, in the app's voice. */
  readonly detail: string;
}

/** Radii and angles of the sample ring. Chosen to miss the unit circle's poles and the origin. */
const RADII = [0.63, 1.37, 2.11, 3.29] as const;
const ANGLES = 24;

/** Above this a sample is too near a pole of something for a relative comparison to mean anything. */
const HUGE = 1e6;
/** Below this the typed expression is too near a zero to divide by. */
const TINY = 1e-12;

/** Agreement to a little worse than float64, because three evaluations compose their roundings. */
const TOLERANCE = 1e-9;

/** How many checkable points are needed before "it holds" is worth more than "it was not tested". */
const ENOUGH = 8;

const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const abs = (z: Cx): number => Math.hypot(z[0], z[1]);
const finite = (z: Cx): boolean => Number.isFinite(z[0]) && Number.isFinite(z[1]);

/**
 * The same product read in the PRINCIPAL determination — the one `@cas/expr` compiles.
 *
 * `[−π, π)` as this app writes it: the window's lower edge is `−1` in units of π. It differs from
 * C99's `(−π, π]` only ON ℝ₋, which is one ray and not a region, so it cannot move a sample that
 * is not exactly on it.
 */
const principalTwin = (product: DeclaredProduct): DeclaredProduct => ({
  constant: product.constant,
  factors: product.factors.map((f) => ({ ...f, window: Frac.of(-1n) })),
});

/**
 * Whether `declared · cofactor` is the expression that was typed.
 *
 * `original` is the whole integrand as it stood BEFORE the factor was declared. Returning `ok:
 * false` with `checked: 0` is a refusal rather than a failure — it says the claim could not be put
 * to a test, which is a different thing from its being wrong and must read differently.
 */
export function checkSplit(
  product: DeclaredProduct,
  cofactor: Node,
  original: Node,
): SplitCheck {
  // **COMPILING IS NOT EVALUATING, and a sandbox expression can throw at either.** `makeComplexFn`
  // builds a closure for `a*z^0.5` quite happily and then throws `Unknown variable 'a'` at the first
  // point — which a reader reaches by typing a parameter the box does not bind. So the throw is
  // caught per sample and reported by name, rather than escaping into the render loop or being
  // reported as "the determinations never agree", which is true and useless.
  let co: (z: Cx) => Cx;
  let orig: (z: Cx) => Cx;
  try {
    const a = makeComplexFn(cofactor);
    const b = makeComplexFn(original);
    co = (z) => a(z as [number, number], [0, 0]) as Cx;
    orig = (z) => b(z as [number, number], [0, 0]) as Cx;
  } catch (e) {
    return {
      ok: false,
      checked: 0,
      worst: 0,
      detail: `the split could not be checked: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const twin = principalTwin(product);
  /** Samples where the declared determination IS the compiled one — where a comparison is legitimate. */
  let agreed = 0;
  /** Of those, samples whose values were finite and big enough for a relative comparison. */
  let checked = 0;
  let worst = 0;
  let threw: string | null = null;
  for (const r of RADII) {
    for (let k = 0; k < ANGLES; k++) {
      const theta = (2 * Math.PI * (k + 0.5)) / ANGLES;
      const z: Cx = [r * Math.cos(theta), r * Math.sin(theta)];

      const declared = evaluateDeclared(product, z);
      const asPrincipal = evaluateDeclared(twin, z);
      if (!finite(declared) || !finite(asPrincipal)) continue;
      // Only where the declared determination IS the compiled one is there anything to compare.
      if (abs([declared[0] - asPrincipal[0], declared[1] - asPrincipal[1]]) > TOLERANCE * Math.max(1, abs(declared))) {
        continue;
      }

      agreed += 1;

      let want: Cx;
      let factor: Cx;
      try {
        want = orig(z);
        factor = co(z);
      } catch (e) {
        threw = e instanceof Error ? e.message : String(e);
        continue;
      }
      if (!finite(want) || !finite(factor)) continue;
      const scale = abs(want);
      if (scale < TINY || scale > HUGE || abs(factor) > HUGE) continue;

      const got = cmul(declared, factor);
      if (!finite(got)) continue;
      checked += 1;
      worst = Math.max(worst, abs([got[0] - want[0], got[1] - want[1]]) / scale);
    }
  }

  if (checked < ENOUGH) {
    // **THREE REASONS NOTHING COULD BE CHECKED, AND THEY READ DIFFERENTLY.** Collapsing them into one
    // message was the first draft's mistake: a reader who typed an unbound parameter was told that
    // two determinations disagree, which is true, useless, and about the wrong thing.
    let why: string;
    if (threw !== null) {
      why = `the expression does not evaluate — ${threw}`;
    } else if (agreed < ENOUGH) {
      why =
        `the declared determination and the one the typed expression compiles in agree at only ` +
        `${agreed} of the sample points, so there is nowhere to compare them`;
    } else {
      // `@cas/expr` evaluates an UNBOUND variable to zero rather than refusing, so `a*z^0.5/(1+z)`
      // is silently the zero function and every sample is skipped for having nothing to divide by.
      // That is by far the likeliest way to land here, so it is the repair that gets named.
      why =
        `the expression is zero or unbounded at every sample point, so there is nothing to compare ` +
        `— most often a parameter the box does not bind, which evaluates to zero rather than refusing`;
    }
    return { ok: false, checked, worst, detail: `the split could not be checked: ${why}. Nothing is claimed either way` };
  }
  if (worst > TOLERANCE) {
    return {
      ok: false,
      checked,
      worst,
      detail:
        `the declared factor times $R(z)$ is not the expression that was in the box: they differ by ` +
        `${worst.toExponential(2)} relative, at points where the two determinations agree and so ` +
        "ought to be identical. Either the branch factor is still inside $R(z)$, or the exponent, " +
        "orientation or constant does not match it",
    };
  }
  return {
    ok: true,
    checked,
    worst,
    detail:
      `the declared factor times R(z) reproduces the expression that was in the box, to ` +
      `${worst.toExponential(2)} relative over ${checked} sample points where the two ` +
      "determinations agree",
  };
}
