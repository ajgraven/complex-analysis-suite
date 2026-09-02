// Line-art builders for the interior-droplet Hele-Shaw view (M4c.2). Pure geometry — the page
// (main-droplet.ts) draws the returned curves with Net2D. Everything is an exact pushforward through the
// current interior map f(w) = Σ a_k w^k (heleShawInterior.ts); the evolution in time is the numerical PG
// stepper (heleShawInteriorStepper.ts). For a source at the droplet's center (the image of w = 0), the
// image of the disk's polar grid IS the flow net: images of the circles |w| = r are the equipotentials
// (constant-pressure contours), and images of the rays arg w = const are the streamlines running from the
// central source out to the free boundary.
import type { Pt, NetCurve } from "@cas/flow";
import { evalMap, type Cx } from "../heleShawInterior.js";

const TWO_PI = 2 * Math.PI;

/** The inverse disk automorphism φ_a⁻¹(ζ) = (ζ + a)/(1 + ā·ζ), which maps 0 ↦ a and the disk to itself.
 *  The source's pressure field in the disk is −log|φ_a(w)|, so its equipotentials are {|φ_a(w)| = r} =
 *  φ_a⁻¹({|ζ| = r}) and its streamlines are φ_a⁻¹({arg ζ = θ}); pushing these through f draws the correct
 *  off-centre flow net. At a = 0 this is the identity, recovering the plain polar grid. */
function blaschkeInv(a: Cx, zeta: Cx): Cx {
  const nr = zeta[0] + a[0];
  const ni = zeta[1] + a[1];
  // den = 1 + ā·ζ  (ā = [a0, −a1])
  const dr = 1 + (a[0] * zeta[0] + a[1] * zeta[1]);
  const di = a[0] * zeta[1] - a[1] * zeta[0];
  const d = dr * dr + di * di;
  return [(nr * dr + ni * di) / d, (ni * dr - nr * di) / d];
}

/** ∂D = f(∂𝔻): the droplet boundary as a closed polyline. */
export function dropletBoundary(coeffs: readonly Cx[], samples = 480): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= samples; i++) {
    const th = (TWO_PI * i) / samples;
    pts.push(evalMap(coeffs, [Math.cos(th), Math.sin(th)]));
  }
  return pts;
}

export interface FlowNet {
  /** f of circles |w| = r < 1 — the equipotentials (constant-pressure contours) nested around the source. */
  readonly equipotentials: NetCurve[];
  /** f of rays arg w = θ from the center out to ∂D — the streamlines of the central-source outflow. */
  readonly streamlines: NetCurve[];
}

/** The interior flow net of f: the pushforward of the source's pressure grid. `rings` equipotentials at
 *  pressure levels in (0,1) and `rays` streamlines from the source to the boundary. `at` is the source's
 *  disk preimage (default 0, the centre): for an off-centre source the grid is the disk's polar grid warped
 *  by the automorphism φ_a (so the streamlines fan out from the actual source point). */
export function dropletFlowNet(
  coeffs: readonly Cx[],
  opts: { rings?: number; rays?: number; samples?: number; at?: Cx } = {},
): FlowNet {
  const rings = opts.rings ?? 5;
  const rays = opts.rays ?? 24;
  const samples = opts.samples ?? 240;
  const a = opts.at ?? [0, 0];
  const equipotentials: NetCurve[] = [];
  for (let k = 1; k <= rings; k++) {
    const r = k / (rings + 1); // pressure levels 1/(rings+1) … rings/(rings+1)
    const pts: Pt[] = [];
    for (let i = 0; i <= samples; i++) {
      const th = (TWO_PI * i) / samples;
      pts.push(evalMap(coeffs, blaschkeInv(a, [r * Math.cos(th), r * Math.sin(th)])));
    }
    equipotentials.push({ color: "#2b6cb0", pts });
  }
  const streamlines: NetCurve[] = [];
  for (let j = 0; j < rays; j++) {
    const th = (TWO_PI * j) / rays;
    const ct = Math.cos(th), st = Math.sin(th);
    const pts: Pt[] = [];
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const r = i / steps; // from the source (ζ = 0 ↦ w = a) out to the boundary (|ζ| = 1)
      pts.push(evalMap(coeffs, blaschkeInv(a, [r * ct, r * st])));
    }
    streamlines.push({ color: "#3a4d6b", pts });
  }
  return { equipotentials, streamlines };
}

/** Coarse streamlines of a MULTI-source flow (a schematic — the full domain-coloured pressure/velocity
 *  field is idea B2). The disk velocity potential of a set of wells is Ω(w) = −Σⱼ (Qⱼ/2π)·log φ_{aⱼ}(w),
 *  so fluid flows along conj(G'(w)) with G'(w) = Σⱼ (Qⱼ/2π)·(1−|aⱼ|²)/((w−aⱼ)(1−āⱼw)) — outward from each
 *  injector, into the sinks and the boundary. Seed a fan around each injector and integrate, pushing the
 *  disk path through f. `sources` carry their disk preimage `at` and `strength`. */
export function multiSourceStreamlines(
  coeffs: readonly Cx[],
  sources: readonly { at: Cx; strength: number }[],
  opts: { perSource?: number; steps?: number } = {},
): NetCurve[] {
  const perSource = opts.perSource ?? 10;
  const steps = opts.steps ?? 300;
  const h = 0.008; // disk-space step length
  const gPrime = (w: Cx): Cx => {
    let re = 0;
    let im = 0;
    for (const s of sources) {
      const a = s.at;
      const c = s.strength / (2 * Math.PI);
      const r2 = a[0] * a[0] + a[1] * a[1];
      const pr = w[0] - a[0];
      const pi = w[1] - a[1]; // w − a
      const qr = 1 - (a[0] * w[0] + a[1] * w[1]);
      const qi = a[1] * w[0] - a[0] * w[1]; // 1 − ā w  (ā = [a0, −a1])
      const dr = pr * qr - pi * qi;
      const di = pr * qi + pi * qr; // (w−a)(1−āw)
      const dd = dr * dr + di * di;
      if (dd < 1e-30) continue;
      re += (c * (1 - r2) * dr) / dd; // Re[(1−|a|²)/denom]·c
      im += (-c * (1 - r2) * di) / dd; // Im[…]
    }
    return [re, im];
  };
  const curves: NetCurve[] = [];
  for (const s of sources) {
    if (s.strength <= 0) continue; // seed only at injectors; the flow terminates at sinks / the boundary
    for (let j = 0; j < perSource; j++) {
      const th = (TWO_PI * j) / perSource;
      let w: Cx = [s.at[0] + 0.03 * Math.cos(th), s.at[1] + 0.03 * Math.sin(th)];
      const pts: Pt[] = [evalMap(coeffs, w)];
      for (let i = 0; i < steps; i++) {
        const g = gPrime(w);
        const gm = Math.hypot(g[0], g[1]);
        if (gm < 1e-12) break;
        w = [w[0] + (h * g[0]) / gm, w[1] - (h * g[1]) / gm]; // += h·conj(G')/|G'| — down-pressure
        pts.push(evalMap(coeffs, w));
        if (w[0] * w[0] + w[1] * w[1] >= 0.9985) break; // reached the boundary
      }
      curves.push({ color: "#3a4d6b", pts });
    }
  }
  return curves;
}
