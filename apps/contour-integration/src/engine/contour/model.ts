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
export type Scalar = number | { readonly param: string; readonly mul?: number; readonly add?: number };

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

export interface Piece {
  readonly id: string;
  readonly name: string;
  readonly geom: Geom;
  readonly role: PieceRole;
  /** Pins which limit is meant where the piece runs along a branch cut. Unused until M4. */
  readonly side?: "above" | "below";
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
  return p.value * (s.mul ?? 1) + (s.add ?? 0);
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
