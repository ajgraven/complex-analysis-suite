// The mating glue — M1 of the mating visualizer. The group side (the ideal triangle group Γ tessellating
// 𝔻) is pushed onto the deltoid σ-plane by Ψ = φ ∘ η : 𝔻 → Ω. Since η and the Γ-reflections all commute
// (η inverts the unit circle; each reflection circle is orthogonal to it), Ψ carries the Γ-tessellation of
// 𝔻 onto the Γ-tessellation of 𝔻* = η(𝔻) and thence, via φ, onto σ's tiling of Ω — so Ψ(tessellation)
// must coincide with the σ tiling we already render. That coincidence is the correctness anchor validated
// in test/matingGlue.test.ts (ideal vertices → cusps; fundamental edges run cusp→cusp; group tessellation
// depth tracks σ escape-generation).
import { DELTOID, type Complex } from "../deltoid.js";
import { eta } from "../correspondence.js";
import type { Tile } from "../models/idealTriangleGroup.js";

/** Ψ = φ ∘ η : the unit disk 𝔻 (group side) → Ω, the deltoid exterior (σ-plane). */
export function glue(z: Complex): Complex {
  return DELTOID.evalPhi(eta(z));
}

/** Push a set of 𝔻-side polylines (e.g. a tile's edges = g applied to the fundamental edges) into the
 *  σ-plane via Ψ, for overlaying the group tessellation on the σ render. */
export function glueTilePolylines(tile: Tile, fundamentalEdges: readonly Complex[][]): Complex[][] {
  return fundamentalEdges.map((edge) => edge.map((p) => glue(tile.apply(p))));
}
