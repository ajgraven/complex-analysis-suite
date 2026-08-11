// modes.ts — the render-mode registry (catalog items C1–C4, C6).
//
// Riemann Map is a conformal-map studio: after the domain-coloring modes were retired (C), the two
// modes both draw a 2D-canvas picture (source pane + linked image pane), not a GLSL field —
// `disk-image` pushes the unit disk's polar grid forward through φ, and `domain-map` fits the
// numerical Riemann map of a chosen region. Pure id registry so the UI + the view-state agree.
export interface RenderMode {
  readonly id: string;
  readonly name: string;
}

export const RENDER_MODES: readonly RenderMode[] = [
  // The primary (default) view: the image of the unit disk under φ, drawn as a pushed-forward polar grid.
  { id: "disk-image", name: "Image of the disk (conformal)" },
  { id: "domain-map", name: "Riemann map: domain → disk (numeric)" },
] as const;

/** The numerical-Riemann-map mode: fits f for a chosen DOMAIN, drawn as a 2D overlay (source Ω + disk). */
export function modeIsDomain(id: string): boolean {
  return id === "domain-map";
}

/** The primary disk-image mode: pushes the unit disk's polar grid forward through φ and draws the image
 *  cells — a 2D overlay. Any non-domain mode falls back to it (it is the default view). */
export function modeIsDiskImage(id: string): boolean {
  return id !== "domain-map";
}
