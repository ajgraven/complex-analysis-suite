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

  // Logarithmic spirals ρ = rMin·exp(κ·(φ − φ₀)) with κ = γ/q, anchored at rMin and swept out to rMax.
  // Each arm spans `wind = ln(rMax/rMin)/|κ|` radians. Draw N of them, evenly spaced in start angle φ₀
  // over the full [0, 2π), so the family fills the whole annulus around w₀. (The old code fixed the level
  // constant C to the φ = 0 slice [q ln rMin, q ln rMax], so the arms covered only one `wind`-wide wedge —
  // the "partial" fan at large spin.) N scales with the spin to preserve the original angular density.
  const kappa = gamma / q; // spiral tightness; its sign is the handedness
  const wind = Math.log(rMax / rMin) / Math.abs(kappa); // radians one arm takes to go rMin → rMax
  const gap = wind / levels; // the original angular spacing between adjacent arms
  const N = Math.max(levels, Math.min(160, Math.round(TWO_PI / gap)));
  const dir = kappa >= 0 ? 1 : -1; // sweep φ so ρ grows from rMin to rMax
  for (let n = 0; n < N; n++) {
    const phi0 = (TWO_PI * n) / N;
    const pts: Pt[] = [];
    for (let i = 0; i <= samples; i++) {
      const phi = phi0 + dir * wind * (i / samples);
      const rho = rMin * Math.exp(kappa * (phi - phi0)); // rMin at i=0, rMax at i=samples
      pts.push([w0[0] + rho * Math.cos(phi), w0[1] + rho * Math.sin(phi)]);
    }
    curves.push({ color, pts });
  }
  return curves;
}
