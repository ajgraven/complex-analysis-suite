// The contour: a free substrate of segments and arcs, with geometry bound to named parameters.
//
// Parameter binding is what makes "templates on a free substrate" (PLAN.md round 2) work: a template
// is a contour whose geometry references `R` or `ε`, and it stays fully editable after loading, so
// dragging the `R` handle and scrubbing `R` in the derivation prose are the same store field.
//
// The pure geometry lives one layer down in `kernel/geom.ts`. What a segment *is* belongs there;
// what a piece *means* — its role in the argument, the parameter its radius is bound to, the lemma
// that will dispose of it — belongs here.
//
// Three deliberate omissions, each from DESIGN.md §2.2. There is **no sampled-point representation**
// — sampling is a function of (contour, params, N), computed on demand and never serialised. There
// is **no orientation flag** — traversal order and the sign of `θ1 − θ0` carry it, so the two cannot
// disagree. And closure is *derived* and then checked, so a contour cannot claim one it lacks.
import type { Cx, Resolved } from "../../kernel/geom.js";

/**
 * A geometric quantity: a literal, or an affine function of one named parameter.
 *
 * DESIGN.md §2.1 specifies a full expression here. This is the affine subset, which covers every
 * contour template in the gallery (`radius = R`, `radius = ε`, endpoints at `±R`, a rectangle's
 * height) and keeps geometry independent of the complex expression evaluator. The type is shaped so
 * the general form can be added later without touching call sites.
 */
/**
 * A coordinate: a number, or an affine function of a parameter — with `add` allowed to be another,
 * and the coefficient allowed to be a THIRD.
 *
 * `add` was a number until D7, whose dogbone hugs `[0, b]` with `b` a PARAMETER: its upper edge runs
 * to `b − η`, which is affine in two of them. One nesting is enough for every record in the gallery
 * and keeps the type an affine form rather than an expression language, which is what `derived`
 * already exists for — and unlike `derived`, this stays live under a drag, so scrubbing `η` does not
 * leave the picture a hair open and the ledger refusing a contour that had been closed.
 *
 * **`mul` was a literal until F1, and the claim above about covering every template was false.** A
 * wedge's return ray runs from `R·e^{2πi/n}` to `0`, so its endpoint is `R·cos(2π/n)` — a PRODUCT of
 * two parameters, which no affine form in one of them can write. The two routes that look like they
 * would avoid it both fail for reasons worth keeping: `derived` is evaluated in `instantiate.ts`
 * BEFORE the limit parameters exist, deliberately, so `R·cos(2π/n)` cannot be a derived value; and
 * were it computed afterwards it would be frozen at instantiation, leaving the ray behind while the
 * arc — bound to `{param:"R"}` — followed the drag, silently opening a contour the ledger had just
 * certified closed.
 *
 * What the widening does NOT do is make the form nonlinear where it matters. A `derived` coefficient
 * is computed once from the record's bindings and never moves under a drag, so a product like
 * `R·wedgeX` still has exactly ONE live factor: the geometry stays affine in every parameter a user
 * can actually scrub, which is the property the substrate needs. That was always the real claim —
 * until F1 there was no record in which "one parameter" and "one LIVE parameter" differed.
 */
export type Scalar =
  | number
  | {
      readonly param: string;
      /** A literal coefficient, or a parameter supplying one — see the type's own note. */
      readonly mul?: number | { readonly param: string };
      readonly add?: number | Scalar;
    };

export interface PointSpec {
  readonly x: Scalar;
  readonly y: Scalar;
}

export type Geom =
  | { readonly kind: "segment"; readonly from: PointSpec; readonly to: PointSpec }
  | {
      readonly kind: "arc";
      readonly center: PointSpec;
      readonly radius: Scalar;
      readonly theta0: Scalar;
      readonly theta1: Scalar;
    };

/** DESIGN.md §4: `target` is the unknown, `vanish` must be killed by a lemma, `reproduces` returns a
 *  multiple of the unknown, `residue` encircles poles, `free` is merely computed. */
export type PieceRole = "target" | "vanish" | "reproduces" | "residue" | "free";

/**
 * Which limiting value a piece lying on a branch cut carries.
 *
 * Defined in `kernel/branch/model.ts` and re-exported here, so the declaration ({@link Piece.side}),
 * the evaluator that honours it, and the quadrature that asks for it per piece all name one type.
 * It is owned one layer down because the kernel's evaluator needs it and `kernel/` may not import
 * upward — see the type's own doc for why that is the right layering rather than a lint workaround.
 */
import type { CutSide } from "../../kernel/branch/model.js";
export type { CutSide };

/** The eight vanishing lemmas of research 03 §14. L2 = the large-arc ML lemma, L3 = Jordan, L4 = the
 *  small-arc lemma, which is the one that does NOT vanish. */
export type LemmaId = "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7" | "L8";

export interface Piece {
  readonly id: string;
  readonly name: string;
  readonly geom: Geom;
  readonly role: PieceRole;
  /**
   * Which lemma disposes of this piece (DESIGN §2.2).
   *
   * Optional in the SANDBOX, where the right lemma is a fact about the integrand and the ledger
   * reads it off the shape — a rational integrand has no frequency and Jordan has nothing to say
   * about it. Required for L4, because no shape test distinguishes an indentation from a closing
   * arc: in C1 the two share a centre, and only their radii differ.
   */
  readonly lemma?: LemmaId;
  /**
   * Pins which limit is meant where the piece runs along a branch cut.
   *
   * Research 06 §3.3: *"Don't offset the contour; offset the branch."* The keyhole's two lips lie
   * EXACTLY on `ℝ₊`, where the declared determination's argument is discontinuous, and this says
   * which of the two limiting values the piece carries — "the same idea as C99's signed zero, lifted
   * from a float bit to a data field", which also makes it serialisable and inspectable.
   *
   * LEGALITY has required it of any piece meeting a cut since M4.1. From M5.0 it is also HONOURED:
   * `kernel/branch/declared.ts` reads it to choose the edge of the window, which is what lets the
   * quadrature cross-check run over a multivalued integrand at all.
   */
  readonly side?: CutSide;
  readonly colour: 0 | 1 | 2 | 3 | 4 | 5;
}

/**
 * The lattice a parameter is confined to, when it is confined to one.
 *
 * One member, and the name is about the PARAMETER rather than about the contour it draws.
 * `families/schema.ts` says `through: "halfIntegers"`, which is a statement about tier G's `Γ_N` —
 * its HALF-WIDTH is `N + ½` — while the number a control moves is `N`, an integer. The translation
 * between the two vocabularies happens once, in `families/instantiate.ts`, so that no reader of a
 * `Param` has to know that `squareTemplate` adds the half.
 */
export type Admissible = "integers";

/** Each lattice's spacing, in the parameter's own units — the one place the enum is read. */
const SPACING: Readonly<Record<Admissible, number>> = { integers: 1 };

export interface Param {
  readonly name: string;
  readonly value: number;
  readonly range: readonly [number, number];
  readonly scale: "linear" | "log";
  /** The limit this parameter is heading to in the argument, if any — what lets the UI animate R → ∞. */
  readonly limit?: { readonly to: "inf" | "0+" | number };
  /**
   * The values this parameter may take, when it may not take every real one — M8 step 3.2.
   *
   * **Absent for all but three parameters in the corpus, and it must stay that way**: every other
   * one is genuinely continuous, and a lattice imposed on `R` would take the sweep's own
   * measurement (five and a half decades of ease-out) and quantise it.
   *
   * It is here because step 3.2 gave the app two controls that can put a parameter anywhere — the
   * limit sweep's ladder and the scrubbable number's drag — and tier G's `N` is not anywhere.
   * Measured over `series-cot-kernel`, `series-cot-collision` and `series-csc-kernel-collision`:
   * the ladder's first rung off `start: 4` is 9.19 as interpolated, and at that value all four
   * sides of `Γ_N` FAIL, because `kernel/bounds/squareSide.ts` refuses any half-width that is not `N + ½` (at an
   * integer the kernel's sup is infinite, and in between it is finite for one contour but not
   * uniformly so as the width approaches an integer). The scrub's arrow key is worse: one stop of
   * a thousand over `[0.25, 256]` is a factor of 1.0070, so the FIRST press leaves the lattice.
   *
   * **That refusal is not relaxed and must not be** — it is read off the geometry, so it catches a
   * contour the reader has dragged, which no declaration can. What this field changes is the other
   * side: the controls stop producing values the bound has to refuse.
   */
  readonly admits?: Admissible;
}

/**
 * The nearest value the lattice admits — and, given a range, the nearest one INSIDE it.
 *
 * The identity on a continuous parameter, which is what lets both controls route every value they
 * produce through it rather than branching on `admits` at each site.
 *
 * The range is not a clamp to its endpoints: `N`'s range starts at 0.25, so rounding 0.3 gives 0 and
 * a clamp would hand back 0.25 — a number outside the lattice, from the function whose name promises
 * otherwise. It returns the first admissible value instead.
 */
export function admissibleValue(
  v: number,
  admits: Admissible | undefined,
  range?: readonly [number, number],
): number {
  if (admits === undefined || !Number.isFinite(v)) return v;
  const s = SPACING[admits];
  const snapped = Math.round(v / s) * s;
  if (range === undefined) return snapped;
  const [lo, hi] = range;
  const first = Math.ceil(lo / s) * s;
  const last = Math.floor(hi / s) * s;
  // A range containing no admissible value at all is left alone rather than snapped out of itself:
  // a parameter pinned to one value is a thing a template may legitimately declare, and a control
  // that moved it outside its own bounds would be worse than one that does not move it.
  if (!(first <= last)) return Math.min(hi, Math.max(lo, v));
  return Math.min(last, Math.max(first, snapped));
}

/** The next admissible value strictly past `v` in `direction` — one arrow press, one ladder nudge. */
export function admissibleStep(
  v: number,
  admits: Admissible,
  direction: -1 | 1,
  range?: readonly [number, number],
): number {
  if (!Number.isFinite(v)) return v;
  const s = SPACING[admits];
  // Floor/ceil rather than round, so a value already ON the lattice advances by exactly one spacing
  // and one off it advances to the next in that direction rather than back to the one it is nearest.
  const next = direction > 0 ? Math.floor(v / s) * s + s : Math.ceil(v / s) * s - s;
  return admissibleValue(next, admits, range);
}

export type Params = Readonly<Record<string, Param>>;

export interface Contour {
  readonly pieces: readonly Piece[];
  readonly params: Params;
}

export function resolveScalar(s: Scalar, params: Params): number {
  if (typeof s === "number") return s;
  const p = params[s.param];
  if (p === undefined) throw new Error(`Contour references unknown parameter '${s.param}'`);
  return p.value * coefficientOf(s.mul, params) + resolveScalar(s.add ?? 0, params);
}

/** A `mul`, resolved. An unknown parameter throws rather than defaulting to 1: a coefficient that
 *  silently became the identity would draw a wedge as a straight line and call it closed. */
function coefficientOf(mul: number | { readonly param: string } | undefined, params: Params): number {
  if (mul === undefined) return 1;
  if (typeof mul === "number") return mul;
  const p = params[mul.param];
  if (p === undefined) throw new Error(`Contour references unknown parameter '${mul.param}'`);
  return p.value;
}

const resolvePoint = (p: PointSpec, params: Params): Cx => [
  resolveScalar(p.x, params),
  resolveScalar(p.y, params),
];

export function resolve(geom: Geom, params: Params): Resolved {
  if (geom.kind === "segment") {
    return {
      kind: "segment",
      from: resolvePoint(geom.from, params),
      to: resolvePoint(geom.to, params),
    };
  }
  return {
    kind: "arc",
    center: resolvePoint(geom.center, params),
    radius: resolveScalar(geom.radius, params),
    theta0: resolveScalar(geom.theta0, params),
    theta1: resolveScalar(geom.theta1, params),
  };
}

export function resolveAll(contour: Contour): Resolved[] {
  return contour.pieces.map((p) => resolve(p.geom, contour.params));
}

/** Convenience for a plain literal point. */
export const pt = (x: Scalar, y: Scalar): PointSpec => ({ x, y });
