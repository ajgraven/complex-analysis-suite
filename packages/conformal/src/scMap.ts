// scMap.ts — the public Schwarz–Christoffel surface (roadmap step E, Phase 3): fitSchwarzChristoffel,
// wiring Option A (ADR-0019). Two modes share one honestly-flagged result type:
//
//   fast    = the existing lightning engine — sample the polygon boundary, fit f: Ω → 𝔻 with
//             corner-clustered poles, read the prevertices wₖ = f(vₖ)/|f(vₖ)| for free, and render
//             via the lightning forward map g: 𝔻 → Ω. Instant, warm-startable, ≈-labelled; no
//             nonlinear solve. converged: false by nature.
//   precise = the classical parameter solve (scParameterProblem), SEEDED by the fast prevertices,
//             then the exact SC forward map (buildForwardMap). ≥12 digits; converged when it reaches
//             tolerance. This is the lightning-seeded SC thesis.
//
// Outputs: prevertices, the accessory constants C (= f′(0)) and A (= f(0), the conformal centre),
// the conformal modulus for the quadrilateral case, and an honest residual. Pure; node-tested.
import type { C } from "./vandermondeArnoldi.js";
import { fitConformalMap } from "./lightning.js";
import { fitForwardMap } from "./forwardMap.js";
import { buildForwardMap } from "./schwarzChristoffel.js";
import { interiorAngles, solveParameterProblem } from "./scParameterProblem.js";

const csub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const nrm = (v: C): C => {
  const r = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / r, v[1] / r];
};

export interface Polygon {
  /** Polygon vertices in the Ω-plane, counter-clockwise. */
  readonly vertices: readonly C[];
  /** Interior angles / π (αₖ); inferred from the vertices if omitted. */
  readonly angles?: readonly number[];
}

export interface SCMap {
  readonly mode: "fast" | "precise";
  /** precise: reached tolerance. fast: always false (it is the approximate lightning fit). */
  readonly converged: boolean;
  /** Crowding wall hit ⇒ accuracy honestly reduced. */
  readonly degraded: boolean;
  /** Interior angles / π (αₖ), exact from the geometry. */
  readonly angles: readonly number[];
  /** Prevertices on ∂𝔻 (≈). */
  readonly prevertices: readonly C[];
  /** Multiplicative accessory constant C = f′(0) (≈). */
  readonly constant: C;
  /** Additive accessory constant A = f(0), the conformal centre (≈). */
  readonly center: C;
  /** Conformal modulus (quadrilateral case, n = 4). */
  readonly modulus?: number;
  /** Honest ≈ accuracy tag (max vertex error for precise; the lightning boundary residual for fast). */
  readonly residual: number;
  /** f: 𝔻 → polygon. */
  forward(w: C): C;
  forwardMany(ws: readonly C[]): C[];
}

export interface SCOptions {
  /** "precise" (default) or "fast". */
  mode?: "fast" | "precise";
  /** precise: stop tolerance on the parameter-problem residual (default 1e-11). */
  tol?: number;
  /** precise: Gauss–Newton iteration cap. */
  maxIter?: number;
  /** precise: reuse a prior solve's prevertices as the seed (continuation — the real-time path). */
  warmStart?: SCMap | readonly C[];
  /** Lightning fit: polynomial degree (default 20). */
  degree?: number;
  /** Lightning fit: boundary samples per edge (default 40). */
  samplesPerEdge?: number;
  /** Lightning fit: clustered poles per corner (default 8). */
  polesPerCorner?: number;
  nGaussJacobi?: number;
  nGaussLegendre?: number;
}

// ---- geometry helpers ----

/** Signed-area (shoelace) centroid — robustly interior for the moderate non-convex polygons v1 targets. */
function areaCentroid(v: readonly C[]): C {
  const n = v.length;
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = v[i];
    const [x1, y1] = v[(i + 1) % n];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  a *= 0.5;
  return [cx / (6 * a), cy / (6 * a)];
}

function pointInPolygon(p: C, v: readonly C[]): boolean {
  const n = v.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = v[i];
    const [xj, yj] = v[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Boundary samples clustered toward the corners of each edge (better lightning corner resolution). */
function sampleBoundary(v: readonly C[], perEdge: number): C[] {
  const n = v.length;
  const out: C[] = [];
  for (let k = 0; k < n; k++) {
    const a = v[k];
    const b = v[(k + 1) % n];
    for (let i = 0; i < perEdge; i++) {
      const t = (1 - Math.cos((Math.PI * (i + 0.5)) / perEdge)) / 2; // Chebyshev-ish, clusters at 0 and 1
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

const poleScale = (v: readonly C[]): number => {
  const n = v.length;
  return v.reduce((m, _, k) => Math.min(m, Math.hypot(v[(k + 1) % n][0] - v[k][0], v[(k + 1) % n][1] - v[k][1])), Infinity) * 0.5;
};

/** Outward unit direction at each vertex (away from Ω), disambiguated by a point-in-polygon test. */
function outwardDirs(v: readonly C[], scale: number): C[] {
  const n = v.length;
  return v.map((vk, k): C => {
    const ep = nrm(csub(v[(k - 1 + n) % n], vk));
    const en = nrm(csub(v[(k + 1) % n], vk));
    let d: C = [ep[0] + en[0], ep[1] + en[1]];
    if (Math.hypot(d[0], d[1]) < 1e-9) d = [-en[1], en[0]]; // straight vertex: use a normal
    d = nrm(d);
    if (pointInPolygon([vk[0] + 1e-4 * scale * d[0], vk[1] + 1e-4 * scale * d[1]], v)) d = [-d[0], -d[1]];
    return d;
  });
}

/** Poles clustered exponentially toward each corner, outside ∂Ω (the lightning method). */
function cornerPoles(v: readonly C[], outward: readonly C[], scale: number, perCorner: number, sigma = 4): C[] {
  const out: C[] = [];
  for (let k = 0; k < v.length; k++) {
    for (let j = 1; j <= perCorner; j++) {
      const rho = scale * Math.exp(-sigma * (Math.sqrt(perCorner) - Math.sqrt(j)));
      out.push([v[k][0] + rho * outward[k][0], v[k][1] + rho * outward[k][1]]);
    }
  }
  return out;
}

interface LightningFit {
  prevertices: C[];
  forward: (w: C) => C;
  forwardMany: (ws: readonly C[]) => C[];
  center: C;
  constant: C;
  residual: number;
}

/** Fit f: Ω → 𝔻 and g: 𝔻 → Ω by the lightning method; read the prevertices for free. Ω is shifted so its
 *  centroid is the conformal centre (0 must lie inside for the fit). */
function lightningFit(vertices: readonly C[], opts?: SCOptions): LightningFit {
  const c = areaCentroid(vertices);
  const shifted = vertices.map((z): C => csub(z, c));
  const degree = opts?.degree ?? 20;
  const perEdge = opts?.samplesPerEdge ?? 40;
  const perCorner = opts?.polesPerCorner ?? 8;
  const scale = poleScale(shifted);
  const outward = outwardDirs(shifted, scale);
  const boundary = sampleBoundary(shifted, perEdge);
  const poles = cornerPoles(shifted, outward, scale, perCorner);
  const f = fitConformalMap(boundary, degree, poles);
  const g = fitForwardMap(f, boundary, degree, shifted);
  // Read the prevertices just INSIDE each corner — f evaluated AT a vertex overflows on the pole cluster.
  const nudge = 5e-3 * scale;
  const prevertices = shifted.map((z, k) => nrm(f.eval([z[0] - nudge * outward[k][0], z[1] - nudge * outward[k][1]])));
  const forward = (w: C): C => cadd(g.eval(w), c);
  const h = 1e-5;
  const g0 = g.eval([0, 0]);
  const gh = g.eval([h, 0]);
  const constant: C = [(gh[0] - g0[0]) / h, (gh[1] - g0[1]) / h]; // g′(0) = C
  return {
    prevertices,
    forward,
    forwardMany: (ws) => ws.map(forward),
    center: cadd(g0, c),
    constant,
    residual: Math.max(f.boundaryResidual, g.boundaryResidual),
  };
}

// ---- conformal modulus (quadrilateral) ----

function agm(a: number, b: number): number {
  for (let i = 0; i < 100; i++) {
    const na = (a + b) / 2;
    const nb = Math.sqrt(a * b);
    if (Math.abs(na - nb) <= 1e-16 * na) return na;
    a = na;
    b = nb;
  }
  return a;
}

/** Conformal modulus of a quadrilateral from its prevertices (K(k)/K′(k) = AGM(1,k)/AGM(1,k′)); 1 for a square. */
function quadModulus(prevertices: readonly C[]): number | undefined {
  if (prevertices.length !== 4) return undefined;
  const d = (a: C, b: C) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const [w0, w1, w2, w3] = prevertices;
  const lambda = (d(w0, w1) * d(w2, w3)) / (d(w0, w2) * d(w1, w3)); // cross-ratio (real on the circle)
  return agm(1, Math.sqrt(lambda)) / agm(1, Math.sqrt(1 - lambda));
}

const seedFrom = (ws?: SCOptions["warmStart"]): readonly C[] | undefined =>
  ws == null ? undefined : Array.isArray(ws) ? (ws as readonly C[]) : (ws as SCMap).prevertices;

/** Build the Schwarz–Christoffel map of a bounded simple polygon (vertices counter-clockwise). */
export function fitSchwarzChristoffel(poly: Polygon, opts?: SCOptions): SCMap {
  const vertices = poly.vertices;
  const angles = poly.angles ?? interiorAngles(vertices);
  const mode = opts?.mode ?? "precise";

  if (mode === "fast") {
    const fit = lightningFit(vertices, opts);
    return {
      mode: "fast",
      converged: false,
      // Honest flag: the lightning polygon fit is reliable for convex/mild corners; a high boundary
      // residual (strongly reentrant polygons) marks the fast approximation as untrustworthy — use
      // precise mode there, which handles reentrant corners at machine precision.
      degraded: fit.residual > 1e-2,
      angles,
      prevertices: fit.prevertices,
      constant: fit.constant,
      center: fit.center,
      modulus: quadModulus(fit.prevertices),
      residual: fit.residual,
      forward: fit.forward,
      forwardMany: fit.forwardMany,
    };
  }

  // precise: seed from a warm start (the "fast → refine" path — the lightning-seeded thesis) if given,
  // else a uniform cold start (robust; Gauss–Newton converges from it on moderate polygons).
  const seed = seedFrom(opts?.warmStart);
  const sol = solveParameterProblem(vertices, {
    seedPrevertices: seed,
    tol: opts?.tol,
    maxIter: opts?.maxIter,
    nGaussJacobi: opts?.nGaussJacobi,
    nGaussLegendre: opts?.nGaussLegendre,
  });
  const map = buildForwardMap(sol.prevertices, sol.angles, {
    targetVertices: vertices,
    nGaussJacobi: opts?.nGaussJacobi,
    nGaussLegendre: opts?.nGaussLegendre,
  });
  let vertexError = 0;
  for (let k = 0; k < vertices.length; k++) {
    const f = map.forward(sol.prevertices[k]);
    vertexError = Math.max(vertexError, Math.hypot(f[0] - vertices[k][0], f[1] - vertices[k][1]));
  }
  return {
    mode: "precise",
    converged: sol.converged,
    degraded: sol.degraded,
    angles: sol.angles,
    prevertices: sol.prevertices,
    constant: map.constant,
    center: map.center,
    modulus: quadModulus(sol.prevertices),
    residual: Math.max(sol.residual, vertexError),
    forward: map.forward,
    forwardMany: map.forwardMany,
  };
}
