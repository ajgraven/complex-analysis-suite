// @cas/ui — the suite app registry (navigation DATA, never imports).
//
// The single source of truth for cross-app navigation: `id` (= deployed subpath segment = workspace dir
// name), a human `label`, a short category `badge`, and a `soon` flag for a built-but-unpublished app.
// Seeded from the launcher's card list (apps/launcher/index.html). These are plain data — @cas/ui never
// imports an app, so the dependency rule (no package → app; ARCHITECTURE.md §4, dependency-cruiser) holds.

export interface SuiteApp {
  /** Deployed subpath segment / workspace dir name (e.g. "complex-dynamics"). Stable id. */
  readonly id: string;
  /** Human label — matches the launcher card. */
  readonly label: string;
  /** Short category tag (the launcher badge). */
  readonly badge: string;
  /** Built but not yet published (Correspondences) — shown in the nav, not linked. */
  readonly soon?: boolean;
}

/** The suite's apps, in launcher order. Correspondences is built but unpublished (`soon`). */
export const SUITE_APPS: readonly SuiteApp[] = [
  { id: "complex-dynamics", label: "Complex Dynamics", badge: "Dynamics" },
  { id: "quadrature-domains", label: "Quadrature Domains", badge: "Quadrature" },
  { id: "riemann-map", label: "Riemann Map", badge: "Conformal maps" },
  { id: "complex-function-plotter", label: "Complex Function Plotting Tool", badge: "Plotter" },
  { id: "argument-principle", label: "Argument Principle", badge: "Winding" },
  { id: "faber-transform", label: "Faber Transform", badge: "Faber" },
  { id: "2d-electrostatics", label: "2D Electrostatics", badge: "Fields & flow" },
  { id: "2d-hydrodynamics", label: "2D Hydrodynamics", badge: "Ideal flow" },
  { id: "hele-shaw-flow", label: "Hele-Shaw Flow", badge: "Free-boundary flow" },
  { id: "potential-theory", label: "Potential Theory", badge: "Potential theory" },
  { id: "correspondences", label: "Correspondences", badge: "Coming soon", soon: true },
];
