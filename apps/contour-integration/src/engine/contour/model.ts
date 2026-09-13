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
 * A coordinate: a number, or an affine function of a parameter — with `add` allowed to be another.
 *
 * `add` was a number until D7, whose dogbone hugs `[0, b]` with `b` a PARAMETER: its upper edge runs
 * to `b − η`, which is affine in two of them. One nesting is enough for every record in the gallery
 * and keeps the type an affine form rather than an expression language, which is what `derived`
 * already exists for — and unlike `derived`, this stays live under a drag, so scrubbing `η` does not
 * leave the picture a hair open and the ledger refusing a contour that had been closed.
 */
export type Scalar =
  | number
  | { readonly param: string; readonly mul?: number; readonly add?: number | Scalar };

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

export interface Param {
  readonly name: string;
  readonly value: number;
  readonly range: readonly [number, number];
  readonly scale: "linear" | "log";
  /** The limit this parameter is heading to in the argument, if any — what lets the UI animate R → ∞. */
  readonly limit?: { readonly to: "inf" | "0+" | number };
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
  return p.value * (s.mul ?? 1) + resolveScalar(s.add ?? 0, params);
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
