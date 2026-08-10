/**
 * Height compression for the analytic-landscape surface (catalog F1): |f| → a surface height. Three
 * modes, each returning a value the vertex shader then scales by the user's exaggeration:
 *
 *   0 log         signed log|f|, clamped and normalized to [-1, 1] — zeros dip, poles rise, |f| = 1 flat.
 *   1 linear      |f| / scale, clamped to a tall-but-finite spike (the classic Jahnke–Emde modulus surface).
 *   2 stereographic  the bounded (|f|²−1)/(|f|²+1) ∈ (−1, 1) — no clamp needed; the same map the sphere uses.
 *
 * This JS twin mirrors the GLSL `surfaceHeight` in {@link "./surfaceShader"} (the GPU is authoritative);
 * it exists so the height law is unit-testable and available to any CPU-side readout. Kept in lockstep
 * with the GLSL — change both together.
 */

export const HEIGHT_MODES = ["Log |f|", "Linear |f|", "Stereographic"] as const;
export const LOG_CLAMP = 8;
export const LINEAR_CLAMP = 3;

/**
 * The normalized surface height for `|f| = m` under `mode` (0 log · 1 linear · 2 stereographic). `scale`
 * is the reference |f| (the same `modScale` the colour transfer uses). A non-finite `m` (a pole that
 * overflowed) maps to the top.
 */
export function heightAt(mode: number, m: number, scale: number): number {
  if (!Number.isFinite(m)) return mode === 2 ? 1 : mode === 1 ? LINEAR_CLAMP : 1;
  if (mode === 1) {
    const s = scale > 1e-6 ? scale : 1;
    return Math.min(m / s, LINEAR_CLAMP);
  }
  if (mode === 2) {
    const m2 = m * m;
    return (m2 - 1) / (m2 + 1);
  }
  const l = Math.log(Math.max(m, 1e-20));
  return Math.max(-LOG_CLAMP, Math.min(LOG_CLAMP, l)) / LOG_CLAMP;
}
