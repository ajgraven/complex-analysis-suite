// Line-art builders for the Hele-Shaw "twisting" view (M4b). Pure geometry — the page (main-twist.ts)
// draws the returned curves with Net2D. Everything is an exact pushforward through the closed-form map
// φ_t (heleShawOnePoint.ts), plus the closed-form spiral equipotentials of the driving complex charge.
import type { Pt, NetCurve } from "@cas/flow";
import type { OnePointMap, Cx } from "../heleShawOnePoint.js";

const TWO_PI = 2 * Math.PI;

/** ∂Ω_t = φ_t(∂𝔻): the growing, twisting droplet boundary as a closed polyline. */
export function boundaryOf(map: OnePointMap, samples = 480): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= samples; i++) {
    const th = (TWO_PI * i) / samples;
    pts.push(map.evalPhi([Math.cos(th), Math.sin(th)]));
  }
  return pts;
}

export interface ConformalNet {
  /** φ_t of circles |z| = r > 1 — the exterior "Green" curves nested around the droplet. */
  readonly rings: NetCurve[];
  /** φ_t of rays arg z = θ (|z| ≥ 1) — the orthogonal field lines running out to ∞. */
  readonly rays: NetCurve[];
}

/** The exterior conformal grid of φ_t: images of circles and rays in 𝔻*. For a twisted (γ ≠ 0) charge the
 *  rays spiral — the visual signature of the spin. `rMax` bounds how far out the exterior grid is drawn. */
export function conformalNet(
  map: OnePointMap,
  opts: { rings?: number; rays?: number; rMax?: number; samples?: number } = {},
): ConformalNet {
  const rings = opts.rings ?? 6;
  const rays = opts.rays ?? 24;
  const rMax = opts.rMax ?? 6;
  const samples = opts.samples ?? 360;
  const ringCurves: NetCurve[] = [];
  for (let k = 1; k <= rings; k++) {
    const r = 1 + ((rMax - 1) * k) / rings;
    const pts: Pt[] = [];
    for (let i = 0; i <= samples; i++) {
      const th = (TWO_PI * i) / samples;
      pts.push(map.evalPhi([r * Math.cos(th), r * Math.sin(th)]));
    }
    ringCurves.push({ color: "#2b6cb0", pts });
  }
  const rayCurves: NetCurve[] = [];
  for (let j = 0; j < rays; j++) {
    const th = (TWO_PI * j) / rays;
    const ct = Math.cos(th), st = Math.sin(th);
    const pts: Pt[] = [];
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const r = 1 + ((rMax - 1) * i) / steps;
      pts.push(map.evalPhi([r * ct, r * st]));
    }
    rayCurves.push({ color: "#3a4d6b", pts });
  }
  return { rings: ringCurves, rays: rayCurves };
}

/** Equipotentials of the driving complex charge α = q + iγ at w₀: level curves of Re(α·log(z−w₀)) =
 *  q·ln|z−w₀| − γ·arg(z−w₀). For γ ≠ 0 these are logarithmic SPIRALS about w₀ (the "spin"); for γ = 0
 *  they are circles, and for q = 0 (pure vortex) they are rays. Drawn out to `rMax` from w₀. */
export function spiralEquipotentials(
  alpha: Cx,
  w0: Pt,
  opts: { levels?: number; rMax?: number; rMin?: number; samples?: number } = {},
): NetCurve[] {
  const [q, gamma] = alpha;
  const levels = opts.levels ?? 11;
  const rMax = opts.rMax ?? 6;
  const rMin = opts.rMin ?? 0.04;
  const samples = opts.samples ?? 400;
  const curves: NetCurve[] = [];
  const color = "#7a5cc0";

  if (Math.abs(q) < 1e-9) {
    // Pure vortex (q = 0): equipotentials are rays arg(z−w₀) = const.
    for (let k = 0; k < levels; k++) {
      const phi = (TWO_PI * k) / levels;
      const c = Math.cos(phi), s = Math.sin(phi);
      curves.push({ color, pts: [[w0[0] + rMin * c, w0[1] + rMin * s], [w0[0] + rMax * c, w0[1] + rMax * s]] });
    }
    return curves;
  }
  if (Math.abs(gamma) < 1e-9) {
    // Pure source (γ = 0): equipotentials are circles |z−w₀| = const.
    for (let k = 0; k < levels; k++) {
      const rho = rMin * Math.pow(rMax / rMin, (k + 0.5) / levels);
      const pts: Pt[] = [];
      for (let i = 0; i <= samples; i++) {
        const phi = (TWO_PI * i) / samples;
        pts.push([w0[0] + rho * Math.cos(phi), w0[1] + rho * Math.sin(phi)]);
      }
      curves.push({ color, pts });
    }
    return curves;
  }

  // ρ(φ) = exp((C + γ·φ)/q) on Re(α log) = C; sweep φ over the range that keeps ρ ∈ [rMin, rMax].
  const cLo = q * Math.log(rMin);
  const cHi = q * Math.log(rMax);
  for (let k = 0; k < levels; k++) {
    const C = cLo + ((cHi - cLo) * (k + 0.5)) / levels;
    const pts: Pt[] = [];
    // φ range: ρ ∈ [rMin, rMax] ⇔ (q ln rMin − C)/γ and (q ln rMax − C)/γ (order depends on signs).
    const p1 = (q * Math.log(rMin) - C) / gamma;
    const p2 = (q * Math.log(rMax) - C) / gamma;
    const phiLo = Math.min(p1, p2), phiHi = Math.max(p1, p2);
    const span = Math.min(phiHi - phiLo, 8 * Math.PI); // cap the winding drawn
    for (let i = 0; i <= samples; i++) {
      const phi = phiLo + (span * i) / samples;
      const rho = Math.exp((C + gamma * phi) / q);
      if (rho < rMin * 0.5 || rho > rMax * 1.5) continue;
      pts.push([w0[0] + rho * Math.cos(phi), w0[1] + rho * Math.sin(phi)]);
    }
    if (pts.length > 1) curves.push({ color, pts });
  }
  return curves;
}
