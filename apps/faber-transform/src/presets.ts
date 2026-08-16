// presets.ts — the curated univalent exterior maps φ: 𝔻* → Ω (M1: interval + ellipse; the k-cusped
// star and general m-fold families arrive at M2). Each is a closed-form finite Laurent map, so no
// numerical Riemann solver is needed. Fixed presets have `shape: null`; parametrized ones expose one
// clamped shape slider whose range keeps φ univalent (a valid domain).
import type { Cx } from "@cas/core";
import type { ExteriorMap } from "@cas/faber";
import { polygonMap, regularPolygonMap } from "./polygon.js";

const re = (x: number): Cx => ({ re: x, im: 0 });

/** A preset for an arbitrary polygon: fit the exterior SC map once (lazily) and cache the resulting map. */
function polygonPreset(id: string, name: string, vertices: readonly (readonly [number, number])[], kHalf: number): PhiPreset {
  let cached: ExteriorMap | null = null;
  return {
    id,
    name,
    build: () => {
      if (!cached) {
        const r = polygonMap(vertices);
        if (!r.converged) console.warn(`faber-transform: polygon "${id}" SC fit did not converge (residual ${r.residual.toExponential(2)})`);
        cached = r.map;
      }
      return cached;
    },
    shape: null,
    kHalf,
    approximate: true,
  };
}

export interface ShapeControl {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly default: number;
}

export interface PhiPreset {
  readonly id: string;
  readonly name: string;
  /** Build the exterior map from the shape-slider value (fixed presets ignore it). */
  readonly build: (shape: number) => ExteriorMap;
  /** The clamped shape slider, or null when the preset is fixed. */
  readonly shape: ShapeControl | null;
  /** World half-height framing K for the right panel's default view. */
  readonly kHalf: number;
  /**
   * True when K has empty 2-D interior (a slit), so there is nothing to render inside K — the image is
   * masked to K per request 1. The interval [−2,2] is the only such preset; it is kept for the Chebyshev
   * correctness test but hidden from the domain menu (a slit renders nothing).
   */
  readonly degenerate?: boolean;
  /**
   * True when φ is a TRUNCATED (not closed-form finite-Laurent) exterior map — the polygon domains, whose
   * exterior SC series is cut off at a finite order. Everything derived from them is `≈`, so the app
   * downgrades the `=` badge to `≈` for these domains (plan §6).
   */
  readonly approximate?: boolean;
}

export const PHI_PRESETS: readonly PhiPreset[] = [
  {
    id: "interval",
    name: "Interval [−2, 2] — Joukowski z + 1/z",
    build: () => ({ c: 1, laurent: [re(0), re(1)] }),
    shape: null,
    kHalf: 2.6,
    degenerate: true, // K is the slit [−2,2]; nothing to render inside it (hidden from the menu)
  },
  {
    id: "ellipse",
    name: "Ellipse — z + m/z",
    // K is an ellipse with semi-axes 1 ± m; univalent for |m| < 1 (m → 1 degenerates to the interval).
    build: (m: number) => ({ c: 1, laurent: [re(0), re(m)] }),
    shape: { label: "m", min: 0, max: 0.95, default: 0.5 },
    kHalf: 2.4,
  },
  {
    id: "deltoid",
    name: "Deltoid — z + a/(2z²)",
    // φ(z) = z + a·z^{−2}/2. The coefficient of z^{−2} is a/2, so the area-type univalence bound
    // Σ n|aₙ| ≤ 1 reads 2·(a/2) = a ≤ 1; a → 1 is the 3-cusped deltoid (the ground-truth QD cusp case).
    build: (a: number) => ({ c: 1, laurent: [re(0), re(0), re(a / 2)] }),
    shape: { label: "a", min: 0, max: 0.98, default: 0.85 },
    kHalf: 1.7,
  },
  {
    id: "star5",
    name: "5-cusped star — z + a/(4z⁴)",
    // φ(z) = z + a·z^{−4}/4. Coefficient a/4 at n = 4 ⇒ 4·(a/4) = a ≤ 1 univalent; a → 1 gives 5 cusps.
    build: (a: number) => ({ c: 1, laurent: [re(0), re(0), re(0), re(0), re(a / 4)] }),
    shape: { label: "a", min: 0, max: 0.98, default: 0.85 },
    kHalf: 1.45,
  },
  // Regular polygons (M1a): exterior Schwarz–Christoffel maps, closed-form by symmetry (prevertices = the
  // n-th roots of unity), truncated to a finite Laurent order — hence `approximate: true`. Capacity = 1.
  // kHalf frames each polygon's circumradius (triangle 1.369 … hexagon 1.087 at c = 1) with margin.
  {
    id: "triangle",
    name: "Triangle — regular 3-gon",
    build: () => regularPolygonMap(3),
    shape: null,
    kHalf: 1.81,
    approximate: true,
  },
  {
    id: "square",
    name: "Square — regular 4-gon",
    build: () => regularPolygonMap(4),
    shape: null,
    kHalf: 1.58,
    approximate: true,
  },
  {
    id: "pentagon",
    name: "Pentagon — regular 5-gon",
    build: () => regularPolygonMap(5),
    shape: null,
    kHalf: 1.49,
    approximate: true,
  },
  {
    id: "hexagon",
    name: "Hexagon — regular 6-gon",
    build: () => regularPolygonMap(6),
    shape: null,
    kHalf: 1.43,
    approximate: true,
  },
  // General (non-regular) polygons via the exterior parameter solve (M1b): the prevertices are solved, not
  // symmetric. Vertices are counter-clockwise; the map is centred at its conformal centre and rotated so the
  // capacity is real, so the rendered K is a centred/rotated copy of the shape.
  polygonPreset("rectangle", "Rectangle 2 : 1", [[1, 0.5], [-1, 0.5], [-1, -0.5], [1, -0.5]], 1.7),
  polygonPreset("iso-triangle", "Tall isosceles triangle", [[0, 1.4], [-0.7, -0.7], [0.7, -0.7]], 1.7),
  polygonPreset("house", "House pentagon", [[1, -0.6], [1, 0.5], [0, 1.2], [-1, 0.5], [-1, -0.6]], 1.7),
];

/** The presets shown in the domain menu — the non-degenerate (2-D interior) ones. */
export const MENU_PRESETS: readonly PhiPreset[] = PHI_PRESETS.filter((p) => !p.degenerate);

/** Look up a preset by id, falling back to the first non-degenerate preset for an unknown id. */
export function phiPresetById(id: string): PhiPreset {
  return PHI_PRESETS.find((p) => p.id === id) ?? MENU_PRESETS[0];
}

/**
 * Curated free-form input functions f, all analytic on the closed unit disk (any singularities sit
 * OUTSIDE |z| ≤ 1, so the Taylor series exists there). Entire functions (exp, sin) converge everywhere;
 * the rational ones have a finite radius of convergence R (the distance to the nearest pole), which the
 * app draws as the convergence equipotential Γ_R.
 */
export const F_PRESETS: readonly string[] = [
  "exp(z)",
  "sin(z)",
  "1/(z - 2)",
  "z/(1 - z/3)",
  "exp(z)/(z - 2)",
  "1/(1 + z^2/4)",
  "cos(z) + z^2",
];
