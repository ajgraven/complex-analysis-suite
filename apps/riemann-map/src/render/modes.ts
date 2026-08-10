// modes.ts — the render-mode and colormap registries (catalog items C1–C4, C6).
//
// Pure id↔shader-code mapping so the UI, the view-state, and the shader agree. Each mode's `code` is
// the `uMode` int the fragment shader switches on; colormaps drive `uColormap` for the scalar
// (distortion) modes. Node-tested; the shader that consumes these codes is browser-tested.
export interface RenderMode {
  readonly id: string;
  readonly name: string;
  readonly code: number;
  /** True if the mode reads φ′ (so it needs the derivative / distortion field). */
  readonly usesDeriv: boolean;
}

export const RENDER_MODES: readonly RenderMode[] = [
  { id: "phase", name: "Phase portrait", code: 0, usesDeriv: false },
  { id: "phase-plain", name: "Phase (flat)", code: 1, usesDeriv: false },
  { id: "conformal", name: "Conformal grid (Wegert)", code: 2, usesDeriv: false },
  { id: "checker", name: "Checkerboard", code: 3, usesDeriv: false },
  { id: "abs-deriv", name: "|φ′| — scale", code: 4, usesDeriv: true },
  { id: "log-deriv", name: "log|φ′|", code: 5, usesDeriv: true },
  { id: "arg-deriv", name: "arg φ′ — rotation", code: 6, usesDeriv: true },
  { id: "julia", name: "Julia exterior — Green's fn (iterate f)", code: 10, usesDeriv: false },
] as const;

/** Dynamics modes (code ≥ 10) ITERATE the map f rather than evaluating φ once — they need a degree. */
export function modeIsDynamics(id: string): boolean {
  return modeCode(id) >= 10;
}

export interface Colormap {
  readonly id: string;
  readonly name: string;
  readonly code: number;
}

export const COLORMAPS: readonly Colormap[] = [
  { id: "viridis", name: "Viridis", code: 0 },
  { id: "grayscale", name: "Grayscale", code: 1 },
] as const;

const modeById = new Map(RENDER_MODES.map((m) => [m.id, m]));
const cmapById = new Map(COLORMAPS.map((c) => [c.id, c]));

/** `uMode` code for a mode id (falls back to the phase portrait for an unknown id). */
export function modeCode(id: string): number {
  return modeById.get(id)?.code ?? 0;
}
/** Whether the mode id reads the derivative field. */
export function modeUsesDeriv(id: string): boolean {
  return modeById.get(id)?.usesDeriv ?? false;
}
/** `uColormap` code for a colormap id (falls back to viridis). */
export function colormapCode(id: string): number {
  return cmapById.get(id)?.code ?? 0;
}
