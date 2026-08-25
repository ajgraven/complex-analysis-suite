// The flux/circulation probe: for a rectangular loop Γ, the residue theorem gives the normalized
// contour integral ∮_Γ E dz = Σ(residues inside) = Σ c = (Σq) + i(Σγ) over the enclosed monopoles.
// Re = enclosed charge / net flux (Gauss's law); Im = enclosed circulation (Kelvin's theorem). A
// doublet (order-2 pole) has residue 0, so it is enclosed but contributes nothing. Because the field
// is closed-form, this is EXACT — no numerical integration — so the readout is `=`, not `≈`.
import type { Placed } from "./state.js";

/** An axis-aligned rectangle in world (complex-plane) coordinates; corners in any order. */
export interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface Enclosed {
  /** Σ q over enclosed monopoles — the enclosed charge / net flux (Gauss). */
  readonly charge: number;
  /** Σ γ over enclosed monopoles — the enclosed circulation (Kelvin). */
  readonly circulation: number;
  /** How many singularities lie inside (monopoles + doublets). */
  readonly count: number;
}

function inside(r: Rect, at: readonly [number, number]): boolean {
  const [x, y] = at;
  return (
    x >= Math.min(r.x0, r.x1) &&
    x <= Math.max(r.x0, r.x1) &&
    y >= Math.min(r.y0, r.y1) &&
    y <= Math.max(r.y0, r.y1)
  );
}

/** The enclosed residue sum (exact) for the singularities inside `r`. */
export function enclosedResidue(singularities: readonly Placed[], r: Rect): Enclosed {
  let charge = 0;
  let circulation = 0;
  let count = 0;
  for (const s of singularities) {
    if (!inside(r, s.at)) continue;
    count++;
    if (s.kind === "monopole") {
      charge += s.c[0];
      circulation += s.c[1];
    }
  }
  return { charge, circulation, count };
}
