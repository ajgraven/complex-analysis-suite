// Polygon presets for the transplant view (M2.4b). Each is a bounded polygon K given by
// COUNTER-CLOCKWISE corners (the orientation the exterior Schwarz–Christoffel solver expects). Flow
// past K is drawn by carrying flow past the unit disk through the exterior map Ψ: 𝔻* → ext(K).
import type { Pt } from "./transplant.js";

export interface PolygonPreset {
  readonly id: string;
  readonly label: string;
  readonly corners: Pt[];
}

/** A regular n-gon of circumradius r, counter-clockwise, with a flat side facing the flow (θ offset). */
function regular(n: number, r: number, offset = 0): Pt[] {
  return Array.from({ length: n }, (_, k): Pt => {
    const t = offset + (2 * Math.PI * k) / n;
    return [r * Math.cos(t), r * Math.sin(t)];
  });
}

export const POLYGON_PRESETS: readonly PolygonPreset[] = [
  { id: "triangle", label: "Triangle", corners: regular(3, 1.3, Math.PI / 2) },
  { id: "square", label: "Square", corners: regular(4, 1.25, Math.PI / 4) },
  { id: "pentagon", label: "Pentagon", corners: regular(5, 1.25, Math.PI / 2) },
  {
    id: "plate",
    label: "Flat plate",
    // A 4-long, thin rectangle — the flat plate as a (near-)degenerate polygon; the exterior map
    // approaches the closed-form Joukowski slit map as the thickness → 0.
    corners: [
      [2, -0.06],
      [2, 0.06],
      [-2, 0.06],
      [-2, -0.06],
    ],
  },
  {
    id: "lshape",
    label: "L-shape",
    // A reentrant hexagon (the 270° corner is where the precise SC solve earns its keep).
    corners: [
      [-1, -1],
      [1, -1],
      [1, 0],
      [0, 0],
      [0, 1],
      [-1, 1],
    ],
  },
] as const;

export const DEFAULT_PRESET = "square";
