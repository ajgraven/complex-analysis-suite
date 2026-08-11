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
  /** True if the mode's colour comes from the colormap ramp (vs hue / checker) — drives whether the
   *  Colormap picker is relevant (the shader reads uColormap only in modes 4, 5, 10). */
  readonly usesColormap: boolean;
}

export const RENDER_MODES: readonly RenderMode[] = [
  // The primary (default) view: the image of the unit disk under φ, drawn as a pushed-forward polar
  // grid of filled cells (code 30 — a 2D-overlay picture, not a GLSL field, so the shader never sees it).
  { id: "disk-image", name: "Image of the disk (conformal)", code: 30, usesDeriv: false, usesColormap: false },
  { id: "phase", name: "Phase portrait", code: 0, usesDeriv: false, usesColormap: false },
  { id: "phase-plain", name: "Phase (flat)", code: 1, usesDeriv: false, usesColormap: false },
  { id: "conformal", name: "Conformal grid (Wegert)", code: 2, usesDeriv: false, usesColormap: false },
  { id: "checker", name: "Checkerboard", code: 3, usesDeriv: false, usesColormap: false },
  { id: "abs-deriv", name: "|φ′| — scale", code: 4, usesDeriv: true, usesColormap: true },
  { id: "log-deriv", name: "log|φ′|", code: 5, usesDeriv: true, usesColormap: true },
  { id: "arg-deriv", name: "arg φ′ — rotation", code: 6, usesDeriv: true, usesColormap: false },
  { id: "julia", name: "Julia exterior — Green's fn (iterate f)", code: 10, usesDeriv: false, usesColormap: true },
  { id: "domain-map", name: "Riemann map: domain → disk (numeric)", code: 20, usesDeriv: false, usesColormap: false },
] as const;

/** Dynamics modes (code ≥ 10) ITERATE the map f rather than evaluating φ once — they need a degree. */
export function modeIsDynamics(id: string): boolean {
  const c = modeCode(id);
  return c >= 10 && c < 20;
}

/** The numerical-Riemann-map mode (code 20): fits f for a chosen DOMAIN, drawn as an overlay, not a
 *  GLSL field — so main clears the GL pane and skips the φ-expression pipeline for it. */
export function modeIsDomain(id: string): boolean {
  return modeCode(id) === 20;
}

/** The primary disk-image mode (code 30): pushes the unit disk's polar grid forward through φ and
 *  draws the image cells — a 2D overlay, so main clears the GL pane (as the domain mode does). */
export function modeIsDiskImage(id: string): boolean {
  return modeCode(id) === 30;
}

const modeById = new Map(RENDER_MODES.map((m) => [m.id, m]));

/** `uMode` code for a mode id (falls back to the phase portrait for an unknown id). */
export function modeCode(id: string): number {
  return modeById.get(id)?.code ?? 0;
}
/** Whether the mode id reads the derivative field. */
export function modeUsesDeriv(id: string): boolean {
  return modeById.get(id)?.usesDeriv ?? false;
}
/** Whether the mode id colours from the colormap ramp (so the Colormap picker is relevant). */
export function modeUsesColormap(id: string): boolean {
  return modeById.get(id)?.usesColormap ?? false;
}
