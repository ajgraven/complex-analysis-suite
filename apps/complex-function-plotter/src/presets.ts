/**
 * Preset / example gallery (catalog A4): a curated set that loads a function together with a framing.
 * Each expression is valid in the `@cas/expr` language (verified in presets.test.ts). This is the
 * teaching on-ramp and the fastest way to exercise the tool's range — zeros, poles, essential
 * singularities, transcendentals, and the canonical Wegert plate.
 */
export interface Preset {
  label: string;
  expr: string;
  /** World half-height that frames the interesting structure. */
  span: number;
}

export const PRESETS: Preset[] = [
  { label: "Γ(z) — gamma", expr: "gamma(z)", span: 4 },
  { label: "z² — double zero", expr: "z^2", span: 2 },
  { label: "1/z — simple pole", expr: "1/z", span: 2 },
  { label: "Möbius (z−1)/(z+1)", expr: "(z - 1)/(z + 1)", span: 3 },
  { label: "Blaschke product (deg 2)", expr: "(z - 0.5)/(1 - 0.5*z) * (z - 0.4*i)/(1 + 0.4*i*z)", span: 1.6 },
  { label: "exp(z)", expr: "exp(z)", span: 4 },
  { label: "sin(z)", expr: "sin(z)", span: 5 },
  { label: "tan(z)", expr: "tan(z)", span: 4 },
  { label: "Joukowski z + 1/z", expr: "z + 1/z", span: 3 },
  { label: "Essential singularity e^(1/z)", expr: "exp(1/z)", span: 1.4 },
  { label: "sinh(z) / z", expr: "sinh(z)/z", span: 6 },
  { label: "Wegert plate", expr: "(z^2 - 1)*(z - 2 - i)^2/(z^2 + 2 + 2*i)", span: 3.2 },
];
