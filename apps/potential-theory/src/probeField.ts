// apps/potential-theory — the hover-probe / test-charge field evaluator (PT-6b). Reads the three
// potential-theory quantities at an ARBITRARY point z (not just on ∂K): the Green's function g_K(z), the
// equilibrium logarithmic potential U^μ(z), and the field magnitude |E| = |∇g_K|, plus the field
// direction. Two honest roads, matching the app's split:
//
//   • EXTERIOR-MAP K (exact, `=`): g_K(z) = log|Ψ⁻¹(z)|, where Ψ⁻¹ is a Newton inverse of the exterior map
//     Ψ: 𝔻* → ext(K). The field follows from Ψ′: with w = Ψ⁻¹(z), ∇g_K(z) = (w·Ψ′(w))⁻¹ read as a plane
//     vector, so |E| = 1/(|w|·|Ψ′(w)|). (Verified against the disk |∇g|=1/|z| and the segment 1/|√(z²−1)|.)
//   • GENERAL K (`≈`): g_K straight from the log-lightning greenFn, its gradient by central differences.
//
// The equilibrium potential is the Frostman companion U^μ(z) = −log cap(K) − g_K(z): it equals the Robin
// constant γ = −log cap on/inside K (the grounded conductor surface) and decreases outward. Pure +
// node-testable (no canvas): the DOM wiring lives in main-potential.ts.
import type { Pt } from "@cas/flow";
import type { ExteriorDomain } from "./potentialDomain.js";
import type { GeneralDomain } from "./generalDomains.js";

export interface Probe {
  /** z lies on/inside K (g_K ≈ 0) — the grounded conductor surface, where U^μ = the Robin constant γ. */
  readonly inside: boolean;
  /** Green's function g_K(z) ≥ 0 (0 on ∂K, ~ log|z| − log cap at ∞). */
  readonly gK: number;
  /** Equilibrium logarithmic potential U^μ(z) = −log cap(K) − g_K(z) (= γ on/inside K). */
  readonly potential: number;
  /** Field magnitude |E| = |∇g_K| (0 on/inside K, or where the gradient is undefined). */
  readonly field: number;
  /** Unit field direction ∇g_K/|∇g_K| (outward from K), [0, 0] if undefined. */
  readonly fieldDir: Pt;
  /** |Ψ⁻¹(z)| = e^{g_K}, the uniformizing radius (which nested Green curve). NaN for general K. */
  readonly wAbs: number;
}

const { hypot, log } = Math;
const mul = (a: Pt, b: Pt): Pt => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];

/** Newton inverse of the exterior map: find w with |w| ≥ 1 and Ψ(w) = z. Seeded at w₀ = z/cap (Ψ ~ cap·w
 *  at ∞ in the real-positive capacity gauge), a finite-difference (holomorphic) Ψ′, and a projection back
 *  onto |w| ≥ 1 each step (Ψ is only defined on 𝔻*). Returns the root w and Ψ′(w) there, or null when z
 *  lies on/inside K (no |w| ≥ 1 preimage) or the iteration does not converge. */
export function invertPsi(d: ExteriorDomain, z: Pt, iters = 100): { w: Pt; dpsi: Pt } | null {
  const cap = d.capacity || 1;
  let wx = z[0] / cap;
  let wy = z[1] / cap;
  let r = hypot(wx, wy);
  // Seed on/outside the unit circle — Ψ is only defined on 𝔻*. Keep z's direction, but fall back to
  // [1, 0] when z ≈ 0 (deep inside K): there a radial rescale can't recover a direction, and evalPsi([0,0])
  // divides by |w|² = 0. (Such a point is inside K anyway; Newton then fails to converge → inside.)
  if (r < 1) {
    if (r > 1e-9) {
      const s = 1 / r;
      wx *= s;
      wy *= s;
    } else {
      wx = 1;
      wy = 0;
    }
  }
  const h = 1e-6;
  let dpsi: Pt = [cap, 0];
  const zscale = 1 + hypot(z[0], z[1]);
  for (let i = 0; i < iters; i++) {
    const F = d.evalPsi([wx, wy]);
    const ex = F[0] - z[0];
    const ey = F[1] - z[1];
    // Ψ′(w) via a central difference along the real axis (holomorphic ⇒ this is dΨ/dw).
    const Fp = d.evalPsi([wx + h, wy]);
    const Fm = d.evalPsi([wx - h, wy]);
    const dre = (Fp[0] - Fm[0]) / (2 * h);
    const dim = (Fp[1] - Fm[1]) / (2 * h);
    dpsi = [dre, dim];
    const dd = dre * dre + dim * dim;
    if (dd < 1e-30) return null;
    // Newton step w ← w − (Ψ(w) − z)/Ψ′(w)   (complex division).
    const sx = (ex * dre + ey * dim) / dd;
    const sy = (ey * dre - ex * dim) / dd;
    wx -= sx;
    wy -= sy;
    r = hypot(wx, wy);
    if (r < 1) {
      // Project back onto the unit circle (boundary of Ψ's domain).
      if (r > 1e-9) {
        const s = 1 / r;
        wx *= s;
        wy *= s;
      } else {
        wx = 1;
        wy = 0;
      }
    }
    if (hypot(sx, sy) < 1e-13 * (1 + r)) break;
  }
  if (!Number.isFinite(wx) || !Number.isFinite(wy)) return null;
  const F = d.evalPsi([wx, wy]);
  if (hypot(F[0] - z[0], F[1] - z[1]) > 1e-6 * zscale) return null;
  return { w: [wx, wy], dpsi };
}

/** Probe an exterior-map K at z — exact (`=`). Off K: g_K = log|w|, |E| = 1/(|w|·|Ψ′|). On/inside: the
 *  grounded surface, g_K = 0, U^μ = γ. */
export function probeExterior(d: ExteriorDomain, z: Pt): Probe {
  const cap = d.capacity || 1;
  const gamma = -log(cap);
  const inv = invertPsi(d, z);
  if (!inv) return { inside: true, gK: 0, potential: gamma, field: 0, fieldDir: [0, 0], wAbs: 1 };
  const wAbs = hypot(inv.w[0], inv.w[1]);
  const gK = log(wAbs);
  if (gK <= 1e-9) return { inside: true, gK: 0, potential: gamma, field: 0, fieldDir: [0, 0], wAbs: 1 };
  // ∇g_K = w·Ψ′ / |w·Ψ′|² (a plane vector); |∇g_K| = 1/(|w|·|Ψ′|).
  const wd = mul(inv.w, inv.dpsi);
  const denom = wd[0] * wd[0] + wd[1] * wd[1];
  let field = 0;
  let fieldDir: Pt = [0, 0];
  if (denom > 1e-300) {
    const gx = wd[0] / denom;
    const gy = wd[1] / denom;
    field = hypot(gx, gy);
    if (field > 0) fieldDir = [gx / field, gy / field];
  }
  return { inside: false, gK, potential: gamma - gK, field, fieldDir, wAbs };
}

/** Probe a general (log-lightning) K at z — approximate (`≈`). g_K from the fit; ∇g_K by central
 *  differences. */
export function probeGeneral(d: GeneralDomain, z: Pt): Probe {
  const cap = d.capacity || 1;
  const gamma = -log(cap);
  const g = d.greenFn(z);
  if (g <= 1e-6) return { inside: true, gK: 0, potential: gamma, field: 0, fieldDir: [0, 0], wAbs: NaN };
  const h = 1e-4 * (1 + hypot(z[0], z[1]));
  const gx = (d.greenFn([z[0] + h, z[1]]) - d.greenFn([z[0] - h, z[1]])) / (2 * h);
  const gy = (d.greenFn([z[0], z[1] + h]) - d.greenFn([z[0], z[1] - h])) / (2 * h);
  const field = hypot(gx, gy);
  const fieldDir: Pt = field > 0 ? [gx / field, gy / field] : [0, 0];
  return { inside: false, gK: g, potential: gamma - g, field, fieldDir, wAbs: NaN };
}
