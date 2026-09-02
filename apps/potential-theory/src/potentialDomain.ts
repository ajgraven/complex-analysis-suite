// Potential theory on a compact set K (M3.1). The electrostatic lens made literal: the equilibrium
// measure μ_K IS the charge density on a grounded conductor K, the (logarithmic) capacity cap(K) is its
// capacitance, and the Green's function g_K(·,∞) is its exterior potential. Every quantity comes from the
// EXTERIOR map Ψ: 𝔻* = {|w| ≥ 1} → ext(K), Ψ(w) = c·w + Σ_{k≥1} aₖ·w⁻ᵏ with c = cap(K):
//
//   • capacity      cap(K) = |c|                        (the leading coefficient)               [=]
//   • equilibrium μ = Ψ⁎(dθ/2π): the images Ψ(e^{iθ}) at UNIFORM θ — their density on ∂K is the charge
//   • Green curves  g_K = t  ⇔  Ψ(|w| = eᵗ)             (exterior equipotentials, t = 0 is ∂K)   [=]
//
// Polygons get Ψ from the exterior Schwarz–Christoffel fit (polygonMap.ts); the closed-form classes
// (disk / ellipse / segment / deltoid) carry Ψ as an explicit finite Laurent map. Both reduce to one
// evalPsi, so the samplers below are domain-agnostic. All `=` for these classes.
import { fitPolygonFlow, type Pt } from "@cas/flow";

/** A compact set K exposed through its exterior map Ψ: 𝔻* → ext(K). */
export interface ExteriorDomain {
  readonly id: string;
  readonly name: string;
  /** Ψ(w) → z for |w| ≥ 1 (Ψ(w) ~ c·w at ∞). */
  evalPsi(w: Pt): Pt;
  /** Logarithmic capacity cap(K) = |c|. */
  readonly capacity: number;
  /** The Laurent tail c₀, c₁, … of Ψ (c₀ = 0, centred): laurent[k] = coeff of w⁻ᵏ. Feeds @cas/faber. */
  readonly laurent: readonly Pt[];
  /** `=` (closed-form / converged SC) vs `≈` (degraded / truncated). */
  readonly exact: boolean;
  /** Whether ∂K is analytic-smooth (no corners/cusps). This — not the finite-n zero positions — decides
   *  whether the Faber-zero counting measure converges to μ_K: a smooth boundary keeps the zeros on an
   *  interior set (disk → centre, ellipse → focal segment), while corners/cusps drive them onto ∂K. */
  readonly smoothBoundary: boolean;
  /** An optional rigid transform (rotation + translation) already folded into `evalPsi`, carrying the map
   *  out of its internal real-capacity Laurent frame and into the caller's INPUT frame. `capacity` and
   *  `laurent` stay in the real-capacity frame (the @cas/faber contract needs a real-positive leading
   *  coefficient), so any geometry derived from `laurent` — e.g. the Faber zeros — must be pushed through
   *  this frame to land on the same drawn K as `evalPsi`. Absent (⇔ identity) for the closed-form classes,
   *  which are already canonical (real-positive capacity, natural orientation). */
  readonly frame?: Frame;
  /** An optional ground-truth note (e.g. the arcsine law on a segment). */
  readonly note?: string;
}

/** A rigid transform (rotation + translation) between the exterior map's internal real-capacity frame and
 *  the caller's input frame. `rot` is a UNIT complex number [cos, sin]; applied as z ↦ rot·z + [tx, ty]. */
export interface Frame {
  readonly rot: Pt;
  readonly tx: number;
  readonly ty: number;
}

/** The identity transform. */
export const IDENTITY_FRAME: Frame = { rot: [1, 0], tx: 0, ty: 0 };

/** Apply a rigid transform to a point: z ↦ rot·z + [tx, ty] (complex multiply, then translate). */
export function applyFrame(f: Frame, z: Pt): Pt {
  return [f.rot[0] * z[0] - f.rot[1] * z[1] + f.tx, f.rot[1] * z[0] + f.rot[0] * z[1] + f.ty];
}

/** Ψ(w) = c·w + Σ_{k≥1} laurent[k]·w⁻ᵏ (laurent[0] = 0, the centred convention). Shared by every class. */
export function laurentEval(c: number, laurent: readonly Pt[], w: Pt): Pt {
  let accRe = c * w[0];
  let accIm = c * w[1];
  const d = w[0] * w[0] + w[1] * w[1];
  const invRe = w[0] / d;
  const invIm = -w[1] / d;
  let pRe = 1;
  let pIm = 0; // w^{−k}
  for (let k = 0; k < laurent.length; k++) {
    accRe += laurent[k][0] * pRe - laurent[k][1] * pIm;
    accIm += laurent[k][0] * pIm + laurent[k][1] * pRe;
    const nRe = pRe * invRe - pIm * invIm;
    const nIm = pRe * invIm + pIm * invRe;
    pRe = nRe;
    pIm = nIm;
  }
  return [accRe, accIm];
}

/** A closed-form exterior-map domain from an explicit finite Laurent map (capacity = c, real-positive). */
function laurentDomain(id: string, name: string, c: number, laurent: readonly Pt[], smoothBoundary: boolean, note?: string): ExteriorDomain {
  return { id, name, evalPsi: (w) => laurentEval(c, laurent, w), capacity: c, laurent, exact: true, smoothBoundary, note };
}

// --- Closed-form classes (exact Ψ) -------------------------------------------------------------------

/** The disk |z| ≤ r: Ψ(w) = r·w, uniform equilibrium measure, cap = r. Smooth boundary. */
export const diskDomain = (r: number): ExteriorDomain => laurentDomain("disk", `Disk (r=${r})`, r, [], true, "μ uniform on |z|=r");

/** The ellipse with semi-axes a (x), b (y): Ψ(w) = ((a+b)/2)·w + ((a−b)/2)·w⁻¹, cap = (a+b)/2. Smooth. */
export const ellipseDomain = (a: number, b: number): ExteriorDomain =>
  laurentDomain("ellipse", `Ellipse (${a}:${b})`, (a + b) / 2, [[0, 0], [(a - b) / 2, 0]], true);

/** The segment [−h, h] (a degenerate ellipse, b = 0): Ψ(w) = (h/2)(w + w⁻¹), cap = h/2, arcsine law. The
 *  segment IS its own boundary, so the Faber (Chebyshev) zeros land on it → μ_K (not analytic-smooth). */
export const segmentDomain = (h: number): ExteriorDomain =>
  laurentDomain("segment", `Segment [−${h}, ${h}]`, h / 2, [[0, 0], [h / 2, 0]], false, "μ = arcsine law 1/(π√(h²−x²))");

/** The deltoid (hypocycloid): Ψ(w) = w + ½·w⁻², cap = 1. Its 3 cusps drive the Faber zeros onto ∂K. */
export const deltoidDomain = (): ExteriorDomain => laurentDomain("deltoid", "Deltoid", 1, [[0, 0], [0, 0], [0.5, 0]], false);

// --- Polygon class (exterior SC fit) -----------------------------------------------------------------

/** The rigid transform (rotation + translation) that best carries `source[k]` onto `target[k]`: a complex
 *  least-squares fit whose rotation is then normalized to unit magnitude, so the result stays a pure rigid
 *  motion (the true real-capacity → input-frame relation is an exact rotation + translation). Returns the
 *  identity when the correspondence is degenerate (coincident or non-finite source points). */
function alignFrame(target: readonly Pt[], source: readonly Pt[]): Frame {
  const n = Math.min(target.length, source.length);
  if (n === 0) return IDENTITY_FRAME;
  let txm = 0;
  let tym = 0;
  let sxm = 0;
  let sym = 0;
  for (let k = 0; k < n; k++) {
    if (!Number.isFinite(target[k][0]) || !Number.isFinite(target[k][1]) || !Number.isFinite(source[k][0]) || !Number.isFinite(source[k][1])) return IDENTITY_FRAME;
    txm += target[k][0];
    tym += target[k][1];
    sxm += source[k][0];
    sym += source[k][1];
  }
  txm /= n;
  tym /= n;
  sxm /= n;
  sym /= n;
  // rot = Σ (target − t̄)·conj(source − s̄) / Σ |source − s̄|²  (complex).
  let numRe = 0;
  let numIm = 0;
  let den = 0;
  for (let k = 0; k < n; k++) {
    const ax = target[k][0] - txm;
    const ay = target[k][1] - tym;
    const bx = source[k][0] - sxm;
    const by = source[k][1] - sym;
    numRe += ax * bx + ay * by;
    numIm += ay * bx - ax * by;
    den += bx * bx + by * by;
  }
  if (den < 1e-30) return IDENTITY_FRAME;
  let rre = numRe / den;
  let rim = numIm / den;
  const mag = Math.hypot(rre, rim);
  if (mag < 1e-12) return IDENTITY_FRAME;
  rre /= mag; // normalize to a pure rotation
  rim /= mag;
  const rot: Pt = [rre, rim];
  return { rot, tx: txm - (rot[0] * sxm - rot[1] * sym), ty: tym - (rot[1] * sxm + rot[0] * sym) };
}

/** A polygon K via the exterior Schwarz–Christoffel fit (polygonMap.ts). `exact` reflects the fit's
 *  converged/degraded flags — a degraded fit is honestly `≈`. Throws propagate to the caller (a
 *  degenerate polygon), which flags `⚠`.
 *
 *  The exterior-SC fit reconstructs Ψ in a REAL-CAPACITY frame (the leading coefficient is rotated to
 *  |C| > 0, so the domain "rotates freely"): the drawn conductor is therefore a rotated/translated copy of
 *  the caller's `corners`. We realign the forward map onto `corners` via a rigid transform (folded into
 *  `evalPsi`), so the drawn K coincides with what the caller drew (e.g. the custom-polygon editor's
 *  handles, or a preset's declared vertices) rather than appearing rotated. `capacity`/`laurent` are left
 *  in the real-capacity frame for the @cas/faber contract; the same transform is exposed as `frame` so any
 *  laurent-derived geometry (the Faber zeros) can be pushed into the input frame to match. */
export function polygonDomain(id: string, name: string, corners: readonly Pt[]): ExteriorDomain {
  const m = fitPolygonFlow(corners);
  const frame = alignFrame(corners, m.cornerImages);
  return {
    id,
    name,
    evalPsi: (w) => applyFrame(frame, m.evalPsi(w)),
    capacity: m.capacity,
    laurent: m.laurent,
    exact: m.converged && !m.degraded,
    smoothBoundary: false, // a polygon has corners → the Faber zeros equidistribute onto ∂K
    frame,
  };
}

// --- Samplers (domain-agnostic) ----------------------------------------------------------------------

const TWO_PI = 2 * Math.PI;

/** The equilibrium charge: Ψ(e^{iθ}) at n UNIFORM angles θ — points ON ∂K whose density is the charge
 *  density (they crowd where Ψ stretches ∂𝔻: corners, tips). μ_K = Ψ⁎(dθ/2π). */
export function equilibriumDots(domain: ExteriorDomain, n = 180): Pt[] {
  const dots: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const t = (TWO_PI * k) / n;
    dots.push(domain.evalPsi([Math.cos(t), Math.sin(t)]));
  }
  return dots;
}

/** Local charge density at each equilibrium dot, ≈ (dθ/2π)/ds with ds the arc length to the next dot —
 *  a relative measure (its integral over ∂K is 1). Peaks at corners/tips, dips on flats, and is flat
 *  (uniform, nonzero) on a disk. */
export function chargeDensity(dots: readonly Pt[]): number[] {
  const n = dots.length;
  const gap = (i: number): number => {
    const a = dots[i];
    const b = dots[(i + 1) % n];
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  };
  // density_i ∝ 1 / (mean arc gap around dot i); normalise so Σ density_i · ds_i = 1.
  const ds = dots.map((_, i) => 0.5 * (gap(i) + gap((i - 1 + n) % n)));
  const raw = ds.map((s) => (s > 0 ? 1 / s : 0));
  const total = raw.reduce((acc, r, i) => acc + r * ds[i], 0) || 1;
  return raw.map((r) => r / total);
}

/** A Green's-function equipotential g_K = t: Ψ({|w| = eᵗ}) as a closed polyline. t = 0 gives ∂K itself;
 *  larger t gives curves nested farther out (g_K(z) ~ log|z| − log cap at ∞). */
export function greenCurve(domain: ExteriorDomain, t: number, samples = 360): Pt[] {
  const R = Math.exp(t);
  const pts: Pt[] = [];
  for (let i = 0; i <= samples; i++) {
    const th = (TWO_PI * i) / samples;
    pts.push(domain.evalPsi([R * Math.cos(th), R * Math.sin(th)]));
  }
  return pts;
}

/** A field line of the conductor: Ψ({arg w = θ₀, |w| ≥ 1}) — orthogonal to the equipotentials, running
 *  from ∂K out to ∞. */
export function fieldLine(domain: ExteriorDomain, theta0: number, tMax = 1.6, samples = 80): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= samples; i++) {
    const R = Math.exp((tMax * i) / samples);
    pts.push(domain.evalPsi([R * Math.cos(theta0), R * Math.sin(theta0)]));
  }
  return pts;
}
