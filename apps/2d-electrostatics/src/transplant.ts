// The conformal-transplant reference flow (M2.4). Flow *past a polygon* K is flow past the unit disk
// carried through the exterior Schwarz–Christoffel map Ψ: 𝔻* = {|ζ| ≥ 1} → the exterior of K
// (@cas/conformal, wired in polygonMap.ts). This module owns the closed-form *reference* half — the
// flow past the unit disk in the ζ-plane — plus the flow-net curves we push forward through Ψ.
//
// The clean trick that keeps the picture faithful without ever inverting Ψ (the "map the grid" idiom,
// mirroring the Riemann-map SC studio): a streamline ψ = Im W_ref = ψ₀ is the preimage of a horizontal
// line under the reference potential W_ref, and W_ref past the unit disk inverts in closed form — a
// quadratic when Γ = 0, a cheap Newton continuation when Γ ≠ 0. So we build the flow-net curves exactly
// in the ζ-plane here, and polygonMap.ts maps each curve FORWARD through Ψ onto the polygon plane. No
// per-pixel inverse SC, no traced-streamline drift. Conventions match ../airfoil.ts and ../field.ts.

export type Complex = readonly [re: number, im: number];
export type Pt = readonly [number, number];

const add = (a: Complex, b: Complex): Complex => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Complex, b: Complex): Complex => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Complex, b: Complex): Complex => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: Complex, b: Complex): Complex => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const scale = (a: Complex, s: number): Complex => [a[0] * s, a[1] * s];
const cabs = (a: Complex): number => Math.hypot(a[0], a[1]);
const clog = (a: Complex): Complex => [0.5 * Math.log(a[0] * a[0] + a[1] * a[1]), Math.atan2(a[1], a[0])];
/** Principal complex square root. */
function csqrt(a: Complex): Complex {
  const r = Math.hypot(a[0], a[1]);
  const re = Math.sqrt(Math.max((r + a[0]) * 0.5, 0));
  const im = Math.sqrt(Math.max((r - a[0]) * 0.5, 0));
  return [re, a[1] < 0 ? -im : im];
}

/** Reference free-stream: speed U, angle of attack α (radians), circulation Γ about the disk. */
export interface RefFlow {
  readonly U: number;
  readonly alpha: number;
  readonly gamma: number;
}

const TWO_PI = 2 * Math.PI;

/** W_ref(ζ) = U(e^{−iα}ζ + e^{iα}/ζ) − (iΓ/2π)·log ζ — flow past the unit disk (ζ₀ = 0, R = 1). */
export function refPotential(zeta: Complex, p: RefFlow): Complex {
  const ea: Complex = [Math.cos(p.alpha), -Math.sin(p.alpha)];
  const eb: Complex = [Math.cos(p.alpha), Math.sin(p.alpha)];
  const uni = scale(add(mul(ea, zeta), div(eb, zeta)), p.U);
  const vor = mul([0, -p.gamma / TWO_PI], clog(zeta));
  return add(uni, vor);
}

/** W_ref′(ζ) = U(e^{−iα} − e^{iα}/ζ²) − (iΓ/2π)/ζ — the complex velocity in the ζ-plane. */
export function refVelocity(zeta: Complex, p: RefFlow): Complex {
  const ea: Complex = [Math.cos(p.alpha), -Math.sin(p.alpha)];
  const eb: Complex = [Math.cos(p.alpha), Math.sin(p.alpha)];
  const z2 = mul(zeta, zeta);
  const uni = scale(sub(ea, div(eb, z2)), p.U);
  const vor = div([0, -p.gamma / TWO_PI], zeta);
  return add(uni, vor);
}

/** The Γ = 0 exterior root of W_ref(ζ) = w in closed form: U e^{−iα}ζ² − w ζ + U e^{iα} = 0, take the
 *  root with |ζ| ≥ 1 (the two roots are exterior/interior reflections). Used directly when Γ = 0 and as
 *  the Newton seed otherwise. */
function exteriorRootNoCirc(w: Complex, p: RefFlow): Complex {
  const ea: Complex = [Math.cos(p.alpha), -Math.sin(p.alpha)];
  const A = scale(ea, p.U); // U e^{−iα}
  const C = scale([Math.cos(p.alpha), Math.sin(p.alpha)], p.U); // U e^{iα}
  const disc = csqrt(sub(mul(w, w), scale(mul(A, C), 4)));
  const twoA = scale(A, 2);
  const r1 = div(add(w, disc), twoA);
  const r2 = div(sub(w, disc), twoA);
  return cabs(r1) >= cabs(r2) ? r1 : r2;
}

/**
 * Solve W_ref(ζ) = w for the exterior preimage (|ζ| ≥ 1), seeded for continuity along a curve. With
 * Γ = 0 the closed-form root is exact; with Γ ≠ 0 we Newton-polish (W_ref is transcendental) from `seed`
 * if given, else the Γ = 0 root. Returns null if it lands inside the disk or fails to converge.
 */
export function invertToExterior(w: Complex, p: RefFlow, seed?: Complex): Complex | null {
  let zeta = seed ?? exteriorRootNoCirc(w, p);
  if (p.gamma !== 0 || seed) {
    for (let i = 0; i < 40; i++) {
      const g = sub(refPotential(zeta, p), w);
      if (cabs(g) < 1e-12) break;
      const gp = refVelocity(zeta, p);
      if (cabs(gp) < 1e-14) break; // stagnation — Jacobian degenerate
      zeta = sub(zeta, div(g, gp));
    }
  }
  if (!Number.isFinite(zeta[0]) || !Number.isFinite(zeta[1])) return null;
  if (cabs(zeta) < 1 - 1e-6) return null; // inside the body
  if (cabs(sub(refPotential(zeta, p), w)) > 1e-6) return null; // did not converge
  return zeta;
}

/** One flow-net curve in the ζ-plane: a polyline plus a hue key shared with its Ψ-image (linked colour). */
export interface NetCurve {
  readonly color: string;
  readonly pts: Pt[];
}

export interface FlowNetOptions {
  /** Number of streamlines on each side of the centre streamline (total ≈ 2·streamlines). */
  readonly streamlines?: number;
  /** Number of equipotential lines. */
  readonly equipotentials?: number;
  /** Half-range of the potential sweep (φ or ψ runs over [−span, span]). */
  readonly span?: number;
  /** Samples per curve. */
  readonly samples?: number;
}

/** Perceptual-ish hue key for curve i of n — the same key colours a ζ-curve and its Ψ-image. */
function keyColor(i: number, n: number, sat = 72, light = 62): string {
  const h = (i / Math.max(1, n)) * 320;
  return `hsl(${h.toFixed(0)}, ${sat}%, ${light}%)`;
}

/**
 * The reference flow net in the ζ-plane: streamlines (ψ = const) and equipotentials (φ = const) of flow
 * past the unit disk, each an exact level curve built by inverting W_ref. Curves carry a colour key so
 * the polygon-plane pushforward can be drawn in the matching colour (the disk↔polygon linking). The
 * body |ζ| = 1 clips the curves (points inside the disk are dropped, so `drawLines`/`pushforward` break
 * the polyline there).
 */
export function flowNet(p: RefFlow, opts: FlowNetOptions = {}): { streamlines: NetCurve[]; equipotentials: NetCurve[] } {
  const nS = opts.streamlines ?? 9;
  const nE = opts.equipotentials ?? 11;
  const span = opts.span ?? 6;
  const samples = opts.samples ?? 240;
  const U = p.U || 1;

  const streamlines: NetCurve[] = [];
  // ψ₀ = U·y₀ far upstream; sweep a symmetric rake excluding 0 (the dividing streamline wraps the body).
  for (let k = -nS; k <= nS; k++) {
    if (k === 0) continue;
    const psi0 = (U * span * k) / nS;
    const pts: Pt[] = [];
    let seed: Complex | undefined;
    for (let j = 0; j <= samples; j++) {
      const phi = -span * U + (2 * span * U * j) / samples;
      const zeta = invertToExterior([phi, psi0], p, seed);
      if (zeta) {
        pts.push([zeta[0], zeta[1]]);
        seed = zeta;
      } else {
        seed = undefined; // break the pen; re-seed from the closed-form root next time
      }
    }
    streamlines.push({ color: keyColor(k + nS, 2 * nS, 60, 66), pts });
  }

  const equipotentials: NetCurve[] = [];
  for (let k = 0; k < nE; k++) {
    const phi0 = -span * U + (2 * span * U * k) / (nE - 1);
    const pts: Pt[] = [];
    let seed: Complex | undefined;
    for (let j = 0; j <= samples; j++) {
      const psi = -span * U + (2 * span * U * j) / samples;
      const zeta = invertToExterior([phi0, psi], p, seed);
      if (zeta) {
        pts.push([zeta[0], zeta[1]]);
        seed = zeta;
      } else {
        seed = undefined;
      }
    }
    equipotentials.push({ color: "rgba(150,170,210,0.34)", pts });
  }

  return { streamlines, equipotentials };
}

/** Push every vertex of every curve forward through Ψ (ζ ↦ z), keeping each curve's colour key. */
export function pushforward(curves: readonly NetCurve[], psi: (zeta: Pt) => Pt): NetCurve[] {
  return curves.map((c) => ({ color: c.color, pts: c.pts.map((z) => psi(z)) }));
}

/** The unit circle ∂𝔻 as a reference polyline (the body in the ζ-plane). */
export function unitCircle(samples = 361): Pt[] {
  return Array.from({ length: samples }, (_, i): Pt => {
    const t = (TWO_PI * i) / (samples - 1);
    return [Math.cos(t), Math.sin(t)];
  });
}

// --- Interior flow: a source–sink pair driving flow INSIDE the disk (→ inside a polygon) --------------
// For flow inside a bounded polygon (the interior SC map f: 𝔻 → K), the reference is flow inside the unit
// disk. To keep the wall ∂𝔻 (hence ∂K) impermeable, the driving source and sink sit ON the boundary — an
// inlet and an outlet port. W_ref(ζ) = log(ζ−a) − log(ζ−b); its streamlines ψ = arg((ζ−a)/(ζ−b)) = const
// are ARCS OF CIRCLES through a and b (∂𝔻 itself is one such circle, so the wall is a streamline). Each
// arc has the exact Möbius parametrization ζ = (a − R·b)/(1 − R), R = t·e^{iθ₀} (t ∈ (0,∞)) — no tracing.

/** Two diametrically-opposite boundary ports at inlet angle β: source a = e^{iβ}, sink b = −e^{iβ}, set
 *  just inside ∂𝔻 so the forward SC map is evaluated off the prevertex singularities. */
export function inletPorts(beta: number, radius = 0.999): { a: Complex; b: Complex } {
  return {
    a: [radius * Math.cos(beta), radius * Math.sin(beta)],
    b: [-radius * Math.cos(beta), -radius * Math.sin(beta)],
  };
}

/**
 * The source→sink flow net INSIDE the unit disk: streamlines (circle arcs through the ports a, b) and
 * equipotentials (Apollonius circles |ζ−a|/|ζ−b| = const), each clipped to |ζ| ≤ 1 and carrying a colour
 * key for the linked pushforward. Exact — no tracing — via the Möbius parametrisation of each level curve.
 */
export function sourceSinkNet(a: Complex, b: Complex, opts: FlowNetOptions = {}): { streamlines: NetCurve[]; equipotentials: NetCurve[] } {
  const nS = opts.streamlines ?? 13;
  const nE = opts.equipotentials ?? 7;
  const samples = opts.samples ?? 240;
  const inDisk = (z: Complex): boolean => z[0] * z[0] + z[1] * z[1] <= 1 - 1e-4;
  // ζ on the level curve for a given ratio R = (ζ−a)/(ζ−b): ζ = (a − R·b)/(1 − R).
  const zetaOf = (R: Complex): Complex => div(sub(a, mul(R, b)), sub([1, 0], R));

  const streamlines: NetCurve[] = [];
  for (let k = 1; k < nS; k++) {
    const theta = -Math.PI + (TWO_PI * k) / nS; // ψ = θ (skip θ = ±π, the degenerate boundary line)
    const pts: Pt[] = [];
    for (let j = 0; j <= samples; j++) {
      const s = -7 + (14 * j) / samples;
      const zeta = zetaOf([Math.exp(s) * Math.cos(theta), Math.exp(s) * Math.sin(theta)]);
      if (inDisk(zeta)) pts.push([zeta[0], zeta[1]]);
    }
    if (pts.length > 1) streamlines.push({ color: keyColor(k, nS, 62, 66), pts });
  }

  const equipotentials: NetCurve[] = [];
  for (let k = 1; k <= nE; k++) {
    const rho = Math.exp(-2.6 + (5.2 * k) / (nE + 1)); // |R| = const → an Apollonius circle
    const pts: Pt[] = [];
    for (let j = 0; j <= samples; j++) {
      const tau = -Math.PI + (TWO_PI * j) / samples;
      const zeta = zetaOf([rho * Math.cos(tau), rho * Math.sin(tau)]);
      if (inDisk(zeta)) pts.push([zeta[0], zeta[1]]);
    }
    if (pts.length > 1) equipotentials.push({ color: "rgba(150,170,210,0.34)", pts });
  }

  return { streamlines, equipotentials };
}
