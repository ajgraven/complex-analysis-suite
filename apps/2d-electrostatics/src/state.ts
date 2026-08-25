// The mutable app state: the uniform background, the placed singularities (each with a stable id for
// selection / drag / edit), the view, the active lens, and the current selection. A render-input
// `Field` (../field.ts) is derived from it on demand — the model stays a pure snapshot, the app owns
// identity and interaction.
import type { Complex, Field, Singularity } from "./field.js";
import { uniformFromSpeedAngle } from "./field.js";
import type { View } from "./view.js";
import type { Rect } from "./probe.js";

export type Id = number;

/** The active canvas tool: move/drag singularities, or draw a flux/circulation probe rectangle. */
export type Tool = "move" | "probe";

/** A singularity plus the identity the app tracks it by. Structurally still a `Singularity`, so an
 *  array of these is a valid `Field.singularities`. */
export type Placed = Singularity & { readonly id: Id };

/** Which reading of the same complex potential the UI presents (relabel only — no recompute). */
export type Lens = "electrostatic" | "hydrodynamic";

export interface AppState {
  /** Uniform-stream contribution to the field E (constant); [0,0] = no background. */
  uniform: Complex;
  singularities: Placed[];
  view: View;
  lens: Lens;
  selected: Id | null;
  /** The active canvas tool. */
  tool: Tool;
  /** The flux/circulation probe rectangle (world coords), or null when none is drawn. */
  probe: Rect | null;
  /** The sensor puck's world position (reads the field where it sits), or null when off. */
  sensor: [number, number] | null;
}

let nextId = 1;
/** Allocate a fresh singularity id (monotonic within a session). */
export function freshId(): Id {
  return nextId++;
}

/** The render-input field derived from the current state. */
export function fieldOf(state: AppState): Field {
  return { uniform: state.uniform, singularities: state.singularities };
}

export function findSingularity(state: AppState, id: Id | null): Placed | undefined {
  return id === null ? undefined : state.singularities.find((s) => s.id === id);
}

/** The opening state: a uniform stream with a source, a vortex, and a doublet — the demo that shows
 *  radial, circular, and spiral structure at once (M0's DEMO_FIELD, now identified + interactive). */
export function initialState(): AppState {
  return {
    uniform: uniformFromSpeedAngle(0.6, 0),
    singularities: [
      { id: freshId(), kind: "monopole", at: [-1.2, 0], c: [1, 0] }, // a source (charge)
      { id: freshId(), kind: "monopole", at: [1.2, 0], c: [0, 1] }, // a vortex (circulation)
      { id: freshId(), kind: "doublet", at: [0, 1.1], mu: [0.4, 0] }, // a doublet
    ],
    view: { center: [0, 0], halfSpan: 3 },
    lens: "electrostatic",
    selected: null,
    tool: "move",
    probe: null,
    sensor: null,
  };
}
