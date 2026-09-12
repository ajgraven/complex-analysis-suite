// **THE DECLARED BRANCH PRODUCT — what the ledger computes in, and now what the picture draws.**
//
// A record with a branch factor declares its integrand as
//
//     f(z) = c · ∏ⱼ (sⱼ·(z − bⱼ))^{αⱼ} · R(z)        (or log^m(z − b) · R(z))
//
// with each factor read in ITS OWN window `argRange`, an orientation `sⱼ` saying whether the record
// wrote `(z − b)` or `(b − z)`, and `R` a single-valued rational cofactor. Every exact number in a
// tier-D answer comes from that formula: `multiPowerAtPole` evaluates it at a pole to get the
// residue, and `branchResidueAtInfinity` expands it at ∞.
//
// **WHY THE PICTURE IS CONSTRUCTED FROM IT RATHER THAN CORRECTED INTO IT.** The phase portrait used
// to come from `@cas/expr`'s compiled AST, which takes the PRINCIPAL branch of every sub-expression,
// so behind D7 it drew a seam on `(b, ∞)` where the composite is continuous — research 06 §2.2's
// `rendering-the-union-of-sub-cuts`, the app teaching the misconception it exists to break. The
// obvious repair is to multiply the compiled value by `exp(2πi·cutCorrection(z))` and be done. That
// repair is subtly wrong, and D6 is why: `csqrt(1 − z·z)` is ONE principal square root of a
// quadratic, whose cut is where `1 − z² ∈ ℝ₋`, and in general the principal cut of a composite is a
// CURVE, not a union of rays from its branch points. A correction whose reference is a ray system
// would then be right about D6 by luck and wrong about the next record, with nothing to warn you.
//
// So there is nothing to correct: the declared product IS the definition, and both backends evaluate
// it directly. `cutCorrection` keeps its job, one level up — a cut DRAGGED off its declared window's
// ray, where the declared product is the reference and the correction is exact by construction.
//
// **THE CONSEQUENCE THAT MAKES IT CHECKABLE — AND ONLY FOR THE POWERS.** Two determinations of a
// POWER product differ by a unimodular factor, so `|f|` does not depend on the determination at all.
// That is research 06 §5.1's device #2 — level curves of `|f|` run straight through the seam, "the
// strongest honest device available" — and it is also this module's parity test: for D1, D2, D3, D6
// and D7 the declared picture and the principal picture agree in modulus everywhere (measured: to
// 1e-9 at every sample) while differing in phase by `e^{2πiΣα}` below the cut.
//
// **It is FALSE for a log**, and the research says so precisely where a generalisation would not:
// §5.1 states the device for `f = ∏(z−bₖ)^{αₖ}`. A log's monodromy is ADDITIVE — `log_{[0,2π)} =
// log_{(−π,π]} + 2πi` below the cut — and `(L + 2πi)^m` is not `L^m` times a phase, so for D4 the
// two determinations differ in MODULUS by a factor of 18.7 at `0.6 − 1.3i` and for D5 by 80.7.
// Measured, not assumed: the first draft of this header claimed the unimodular factor for the whole
// module. So the modulus contours are a *demonstration that the seam is an artefact* only for a
// power product; over a log they break at the cut, which is the honest picture of an infinite-order
// monodromy that no choice of argument window can hide. The app says which case it is showing, and
// `test/declaredProduct.test.ts` asserts both — equality for the powers, inequality for the logs —
// so a refactor that folded the log path into the power path would fail rather than lie.
import type { Frac } from "@cas/exact";
import type { Cx } from "../geom.js";
import { logCut, powCut } from "./correction.js";

/**
 * One factor of the declared product, as both backends need it.
 *
 * `window` is the `argRange`'s LOWER edge as an exact multiple of π, which is both the determination
 * and the direction of this factor's cut — declaring one IS declaring the other
 * (`branchFactor.ts`'s `cutFromDetermination`). It stays a `Frac` rather than an angle because
 * {@link declaredReference} hands it to the correction, where a float would put the reference ray a
 * rounding error off the cut it is meant to cancel.
 */
export type DeclaredFactor = {
  /**
   * The id of this factor's branch point in the `BranchChoice` geometry.
   *
   * **Carried, not derived, and review found out why.** {@link declaredReference} used to key its
   * map `b1, b2, …` by position — which is right for a multi-point record and WRONG for every
   * single-point one, because `branchFactor.ts` names that point `"b"`. `cutSegments` looks the
   * direction up by `point.id`, finds nothing, and adds no reference ray at all: the correction then
   * silently becomes `m_Γ` instead of `m_Γ − m_ref` for five of the seven records. Both the product
   * and the geometry are built in one place, so the id travels with the factor and there is one
   * source of truth for it.
   */
  readonly id: string;
  /** `bⱼ`. */
  readonly at: Cx;
  /** The window's lower edge, in multiples of π. */
  readonly window: Frac;
} & (
  | {
      readonly kind: "power";
      readonly alpha: number;
      /** `+1` for a factor the record wrote `(z − b)`, `−1` for `(b − z)`. */
      readonly sign: 1 | -1;
    }
  | {
      readonly kind: "log";
      /** `m` in `log^m`, a multiplicity and always a positive integer. */
      readonly power: number;
    }
);

/** `c · ∏ⱼ (…)` — the branch half of the integrand. `R` is the caller's, and single-valued. */
export interface DeclaredProduct {
  readonly constant: Cx;
  readonly factors: readonly DeclaredFactor[];
}

const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];

/** This factor's window origin as an angle — the only place the exact `Frac` becomes a float. */
export const windowOrigin = (factor: DeclaredFactor): number => factor.window.toNumber() * Math.PI;

/** `sⱼ·(z − bⱼ)`, which for `sⱼ = −1` is `(bⱼ − z)`: the same number, not the same power. */
const difference = (factor: DeclaredFactor, z: Cx): Cx =>
  factor.kind === "power" && factor.sign === -1
    ? [factor.at[0] - z[0], factor.at[1] - z[1]]
    : [z[0] - factor.at[0], z[1] - factor.at[1]];

/**
 * The declared product at `z`, each factor in its own window.
 *
 * The CPU twin of `ui/stage/declared.glsl.ts`. Not the route the ANSWER takes — that is
 * `multiPowerAtPole`, in exact arithmetic — but the route a reader's eye takes, and the two are
 * checked against each other at the poles, which is the one place both are defined.
 */
export function evaluateDeclared(product: DeclaredProduct, z: Cx): Cx {
  let acc = product.constant;
  for (const factor of product.factors) {
    const d = difference(factor, z);
    const theta0 = windowOrigin(factor);
    if (factor.kind === "power") {
      acc = cmul(acc, powCut(d, factor.alpha, theta0));
    } else {
      // `log^m` is the logarithm in the declared window raised to an INTEGER power by repeated
      // complex multiplication — not `exp(m·log(log z))`, which would introduce a second branch
      // choice the record never made.
      const l = logCut(d, theta0);
      let p: Cx = [1, 0];
      for (let k = 0; k < factor.power; k++) p = cmul(p, l);
      acc = cmul(acc, p);
    }
  }
  return acc;
}

/**
 * Where each factor's cut runs, as a direction per branch point — the correction's reference, for
 * the system the picture is now drawn in.
 *
 * Keyed by each factor's own {@link DeclaredFactor.id} — the id `branchFactor.ts` gave that point in
 * the geometry — so `cutSegments`' `reference.get(point.id)` finds it. A cut dragged away from here
 * is measured from here, which is what makes the correction exact by construction rather than by a
 * guess about what `@cas/expr` compiled.
 */
export function declaredReference(product: DeclaredProduct): ReadonlyMap<string, Frac> {
  const out = new Map<string, Frac>();
  for (const factor of product.factors) out.set(factor.id, factor.window);
  return out;
}
