// The @cas/conformal glue for the polygon transplant (M2.4). Given a bounded polygon K (counter-
// clockwise corners), fit the EXTERIOR Schwarz–Christoffel map Ψ: 𝔻* = {|ζ| ≥ 1} → the exterior of K
// and expose it as a cheap forward evaluator. The exterior fit itself returns data only (prevertices,
// capacity, side integrals); the intended per-point evaluation is the Laurent-at-∞ expansion
// Ψ(ζ) = c·ζ + Σ cₖ·ζ⁻ᵏ (exactly what @cas/faber consumes), so we sum that series — no inverse SC, no
// per-pixel quadrature. Everything is rendered in the Laurent (real-capacity) frame: ∂K = Ψ(∂𝔻) and the
// pushed-forward flow net share one Ψ, so the body and the flow are automatically consistent. The
// picture is honestly `≈` (a truncated series over a machine-precision SC fit); `converged`/`degraded`/
// `residual` from the fit are surfaced verbatim.
import { fitExteriorSchwarzChristoffel, exteriorMapLaurentAtInfinity, fitSchwarzChristoffel, type C, type SCMap } from "@cas/conformal";
import type { Pt } from "./transplant.js";

export interface PolygonFlowMap {
  /** Ψ(ζ) → z, the exterior map, for |ζ| ≥ 1 (summed Laurent series). */
  evalPsi(zeta: Pt): Pt;
  /** ∂K = Ψ(unit circle), the polygon boundary in the Laurent frame, as a closed polyline. */
  boundary(samples?: number): Pt[];
  /** Logarithmic capacity cap(K) = |leading coefficient| (an `=` quantity of the fit). */
  readonly capacity: number;
  /** Corner preimages wₖ = 1/uₖ on ∂𝔻 (ζ-plane), realigned to the INPUT corner order. */
  readonly cornerPreimages: Pt[];
  /** Corner images Ψ(wₖ) = the polygon vertices in the Laurent frame, INPUT corner order. */
  readonly cornerImages: Pt[];
  /** Interior angles / π (αₖ), INPUT corner order. */
  readonly angles: number[];
  readonly converged: boolean;
  readonly degraded: boolean;
  readonly residual: number;
  /** Number of Laurent terms kept (for the honesty readout). */
  readonly laurentTerms: number;
}

/** Nearest-index match of `q` among `pts` (the exterior solver reverses vertex order, so prevertices are
 *  aligned to `orderedVertices`, which we map back to the caller's input order by coordinate). */
function nearestIndex(pts: readonly C[], q: C): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = (pts[i][0] - q[0]) ** 2 + (pts[i][1] - q[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Fit the exterior SC map of a bounded polygon and return a forward evaluator + geometry. `maxOrder`
 * caps the Laurent expansion (default 300; reentrant corners need more terms to resolve near ∂K); the
 * trailing near-zero tail is trimmed. Throws are the caller's to catch — a degenerate polygon can make
 * the parameter solve fail; the caller falls back to a coarser preset or flags `⚠`.
 */
export function fitPolygonFlow(corners: readonly Pt[], opts: { maxOrder?: number } = {}): PolygonFlowMap {
  const input: C[] = corners.map((p) => [p[0], p[1]]);
  const fit = fitExteriorSchwarzChristoffel(input);
  const reentrant = fit.angles.some((a) => a > 1.0001);
  const maxOrder = opts.maxOrder ?? (reentrant ? 400 : 300);
  const { c, laurent } = exteriorMapLaurentAtInfinity(fit, maxOrder);

  // Trim the trailing near-zero Laurent tail (keep at least a few terms), like faber-transform.
  const mag = laurent.map((z) => Math.hypot(z[0], z[1]));
  const peak = Math.max(1e-300, ...mag);
  let last = Math.min(8, laurent.length - 1);
  for (let k = 0; k < laurent.length; k++) if (mag[k] > 1e-13 * peak) last = Math.max(last, k);
  const lau = laurent.slice(0, last + 1);

  const evalPsi = (zeta: Pt): Pt => {
    let accRe = c * zeta[0];
    let accIm = c * zeta[1];
    const d = zeta[0] * zeta[0] + zeta[1] * zeta[1];
    const invRe = zeta[0] / d;
    const invIm = -zeta[1] / d;
    let pRe = 1;
    let pIm = 0; // ζ^{−k}
    for (let k = 0; k < lau.length; k++) {
      accRe += lau[k][0] * pRe - lau[k][1] * pIm;
      accIm += lau[k][0] * pIm + lau[k][1] * pRe;
      const nRe = pRe * invRe - pIm * invIm;
      const nIm = pRe * invIm + pIm * invRe;
      pRe = nRe;
      pIm = nIm;
    }
    return [accRe, accIm];
  };

  // Corner preimages wₖ = 1/uₖ = conj(uₖ) (|uₖ| = 1), realigned prevertices[k] ↔ orderedVertices[k] back
  // to the caller's input order.
  const cornerPreimages: Pt[] = new Array(corners.length);
  const cornerImages: Pt[] = new Array(corners.length);
  const angles: number[] = new Array(corners.length);
  for (let k = 0; k < fit.prevertices.length; k++) {
    const u = fit.prevertices[k];
    const w: Pt = [u[0], -u[1]]; // 1/uₖ
    const idx = nearestIndex(input, fit.orderedVertices[k]);
    cornerPreimages[idx] = w;
    cornerImages[idx] = evalPsi(w);
    angles[idx] = fit.angles[k];
  }

  return {
    evalPsi,
    boundary(samples = 512): Pt[] {
      const pts: Pt[] = [];
      for (let i = 0; i <= samples; i++) {
        const t = (2 * Math.PI * i) / samples;
        pts.push(evalPsi([Math.cos(t), Math.sin(t)]));
      }
      return pts;
    },
    capacity: c,
    cornerPreimages,
    cornerImages,
    angles,
    converged: fit.converged,
    degraded: fit.degraded,
    residual: fit.residual,
    laurentTerms: lau.length,
  };
}

// --- Interior map: f: 𝔻 → the bounded polygon K (flow INSIDE K) --------------------------------------

export interface PolygonInteriorMap {
  /** f(ζ) → z, the interior SC map, for ζ ∈ 𝔻. */
  forward(zeta: Pt): Pt;
  /** Batched forward (one polyline through the map). */
  forwardMany(zetas: readonly Pt[]): Pt[];
  /** ∂K — the polygon itself (the target corners), as a closed polyline. */
  boundary(): Pt[];
  /** Prevertices wₖ on ∂𝔻, INPUT corner order (matched to the polygon vertices). */
  readonly cornerPreimages: Pt[];
  /** The polygon vertices (the input corners), INPUT order. */
  readonly cornerImages: Pt[];
  /** Interior angles αₖ / π, INPUT order. */
  readonly angles: number[];
  /** The conformal centre f(0). */
  readonly center: Pt;
  readonly converged: boolean;
  readonly degraded: boolean;
  readonly residual: number;
}

/**
 * Fit the interior Schwarz–Christoffel map of a bounded polygon (f: 𝔻 → K) for flow INSIDE K. Precise mode
 * (machine precision on convex + reentrant), falling back to fast (lightning) if the precise solve throws
 * on a degenerate polygon. The forward map carries polylines from the disk into the polygon; the polygon
 * boundary is the input corners themselves (the precise map sends prevertices to them exactly).
 */
export function fitPolygonInterior(corners: readonly Pt[]): PolygonInteriorMap {
  const vertices: C[] = corners.map((p) => [p[0], p[1]]);
  let sc: SCMap;
  try {
    sc = fitSchwarzChristoffel({ vertices }, { mode: "precise" });
    if (!sc.converged) {
      const fast = fitSchwarzChristoffel({ vertices }, { mode: "fast" });
      if (fast.residual < sc.residual) sc = fast;
    }
  } catch {
    sc = fitSchwarzChristoffel({ vertices }, { mode: "fast" });
  }

  // Prevertices are returned in the solver's order; the precise map sends prevertex k to a polygon vertex.
  // Align each prevertex to the nearest input corner by its forward image.
  const cornerPreimages: Pt[] = new Array(corners.length);
  const cornerImages: Pt[] = new Array(corners.length);
  const angles: number[] = new Array(corners.length);
  for (let k = 0; k < sc.prevertices.length; k++) {
    const image = sc.forward(sc.prevertices[k]);
    const idx = nearestIndex(vertices, image);
    cornerPreimages[idx] = [sc.prevertices[k][0], sc.prevertices[k][1]];
    cornerImages[idx] = [corners[idx][0], corners[idx][1]];
    angles[idx] = sc.angles[k];
  }

  return {
    forward: (zeta: Pt): Pt => {
      const z = sc.forward([zeta[0], zeta[1]]);
      return [z[0], z[1]];
    },
    forwardMany: (zetas: readonly Pt[]): Pt[] =>
      sc.forwardMany(zetas.map((p) => [p[0], p[1]])).map((z) => [z[0], z[1]] as Pt),
    boundary: (): Pt[] => {
      const pts = corners.map((p) => [p[0], p[1]] as Pt);
      pts.push([corners[0][0], corners[0][1]]); // close
      return pts;
    },
    cornerPreimages,
    cornerImages,
    angles,
    center: [sc.center[0], sc.center[1]],
    converged: sc.converged,
    degraded: sc.degraded,
    residual: sc.residual,
  };
}
