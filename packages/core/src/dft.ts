// dft.ts — the discrete Fourier transform of samples taken uniformly around a circle. Convention-neutral
// (ADR-0006): a bare, unscaled analysis transform with no π/2πi normalization baked in — callers attach
// whatever scaling their geometry needs (a radius power for a Taylor extraction, a factor-of-2 harmonic
// completion for a Dirichlet solve). The single home for the "DFT of a ring of samples → analytic
// coefficients" step that the exterior-map Taylor extraction (Faber Transform's `taylorViaFFT`) and the
// interior-droplet Hele-Shaw velocity solve (2D Electrostatics' Polubarinova–Galin stepper) each need
// (ADR-0007, second-consumer extraction).
//
// This is a direct O(M·N) evaluation, not a fast O(M log M) FFT — M is a few hundred and N a few dozen in
// both consumers, so the naive transform is ample and keeps the result bit-for-bit reproducible.

import type { Cx } from "./complex.js";

/**
 * The discrete Fourier coefficients of `samples`, taken as the values of a function at the M-th roots of
 * unity e^{2πik/M} (k = 0…M−1):
 *
 *   ĉₙ = (1/M) · Σ_{k=0}^{M−1} samplesₖ · e^{−2πi·n·k/M}
 *
 * Returns ĉ₀…ĉ_maxIndex (default: all M coefficients, ĉ₀…ĉ_{M−1}). The 1/M normalization makes ĉₙ the
 * mean of `sample · e^{−inθ}`, so for a genuine trigonometric series Σ cₙ e^{inθ} sampled with M > degree,
 * ĉₙ recovers cₙ exactly (no aliasing). Empty input yields an empty result.
 */
export function dftOnCircle(samples: readonly Cx[], maxIndex?: number): Cx[] {
  const M = samples.length;
  if (M === 0) return [];
  const top = maxIndex === undefined ? M - 1 : Math.min(maxIndex, M - 1);
  const out: Cx[] = [];
  for (let n = 0; n <= top; n++) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < M; k++) {
      const ang = (-2 * Math.PI * n * k) / M; // convention-ok: a polar angle (root of unity), not a normalization
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      // samplesₖ · (c + i·s)
      re += samples[k].re * c - samples[k].im * s;
      im += samples[k].re * s + samples[k].im * c;
    }
    out.push({ re: re / M, im: im / M });
  }
  return out;
}
