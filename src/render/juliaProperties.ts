/**
 * Computed properties of the filled Julia set K_c at the current parameter c — the data behind
 * the collapsible "Julia properties" panel. Pure (no DOM / no GL), so it is unit-tested; `main.ts`
 * formats the result into display strings. The cheap "Tier-1" metrics here reuse the existing CPU
 * dynamics machinery (the critical-orbit classifier `inspect`, the exterior Laurent coefficients);
 * the expensive image-based metrics (box-counting dimension, pixel-area) live separately and run
 * only on demand.
 *
 * The analytic, capacity-based pieces (area, small-c dimension, capacity, bounding disk) assume the
 * monic family z^d + c — they are returned as null for an arbitrary f, where only the orbit-based
 * facts (connectivity, parameter class, Lyapunov exponent) still apply. The Tier-2 image estimates
 * (interior mask, pixel area, box-counting dimension, bounding extent, and symmetry) work for any f.
 */

import type { Complex } from "../complex";
import type { Node } from "../expr/ast";
import { differentiate } from "../expr/derivative";
import { makeComplexFn, getComplexFn, getEscapeFn } from "../expr/evaluate";
import { lyapunovJacobian } from "./jacobian";
import { inspect } from "./inspect";
import { polynomialCoeffs } from "./critical";
import { juliaExteriorCoeffs } from "./uniformize";

const cabs = (z: Complex): number => Math.hypot(z[0], z[1]);

/** Coarse parameter classification for the headline. */
export type ParamClass = "outside" | "hyperbolic" | "neutral" | "bounded";

export interface JuliaProperties {
  /** Degree d when f = z^d + c, else null (an arbitrary f gates out the monic-only rows). */
  degree: number | null;
  /** Critical orbit bounded ⟺ K_c connected ⟺ c in the connectedness locus. */
  connected: boolean;
  /** The attracting/landed cycle, when one is found (period, |λ|, internal angle p/q); else null. */
  cycle: {
    period: number;
    multiplierMag: number;
    rotation: { p: number; q: number } | null;
  } | null;
  paramClass: ParamClass;
  /** Critical-orbit Lyapunov exponent (nats/iter): −∞ at a superattracting centre, > 0 chaotic.
   *  null when the orbit escapes (see `escapes`) or f is non-holomorphic (no f′). */
  lyapunov: number | null;
  /** The critical orbit escapes (⇒ disconnected / Cantor, Lyapunov → +∞). */
  escapes: boolean;
  /** Bounding-disk radius R_c (monic z^d + c): the real root > 1 of R^d − R − |c| = 0; else null. */
  boundingRadius: number | null;
  /** Filled-area upper bound π(1 − Σ k|b_k|²) from the exterior coefficients; 0 if disconnected;
   *  null for a non-monic f. A monotone upper bound — tight for interior c, loose near ∂M. */
  analyticArea: number | null;
  /** Exact small-c Hausdorff dimension 1 + |c|²/(4 ln d); null unless monic and in the principal
   *  (period-1) cardioid, where the perturbative formula applies. */
  smallCDimension: number | null;
  /** Logarithmic capacity: exactly 1 for monic z^d + c, |a_d|^{−1/(d−1)} for any polynomial f
   *  (numerically detected), null for a non-polynomial map where it is undefined. */
  capacity: number | null;
}

const AREA_COEFFS = 64; // exterior Laurent coefficients used for the area upper bound
const LYAP_ITERS = 400; // critical-orbit length for the Lyapunov accumulation (chaotic case)

/** Bounding-disk radius for z^d + c: the real root > 1 of R^d − R − |c| = 0 (escape radius). */
export function boundingRadius(d: number, c: Complex): number {
  const ac = cabs(c);
  if (d === 2) return (1 + Math.sqrt(1 + 4 * ac)) / 2; // closed form
  let r = Math.max(2, Math.pow(Math.max(ac, 1), 1 / (d - 1)) + 1); // safe Newton seed
  for (let i = 0; i < 50; i++) {
    const g = Math.pow(r, d) - r - ac;
    const gp = d * Math.pow(r, d - 1) - 1;
    if (gp === 0) break;
    const next = r - g / gp;
    if (!Number.isFinite(next)) break;
    const done = Math.abs(next - r) < 1e-13;
    r = next;
    if (done) break;
  }
  return r;
}

/**
 * Filled-Julia-set area upper bound π(1 − Σ_{k≥1} k·|b_k|²) from the exterior Laurent coefficients
 * (Gronwall's area theorem; the monic z^d + c map has capacity 1 so the leading coefficient is 1).
 * Assumes K_c connected — the caller gates on connectivity. Clamped to ≥ 0.
 */
export function analyticAreaUpperBound(d: number, c: Complex, nCoeffs = AREA_COEFFS): number {
  const coeffs = juliaExteriorCoeffs(d, c, nCoeffs); // [b_0, b_1, …, b_n]
  let s = 0;
  for (let k = 1; k < coeffs.length; k++) {
    const m = cabs(coeffs[k]);
    s += k * m * m;
  }
  return Math.max(0, Math.PI * (1 - s));
}

/**
 * Logarithmic capacity of the filled Julia set for a POLYNOMIAL f: cap = |a_d|^{−1/(d−1)} where a_d
 * is the degree-d leading coefficient (Baker–Hsia) — exactly 1 for monic z^d + c, 1/|λ| for the
 * logistic λz(1−z), etc. The exact leading coefficient comes from the shared far-field/DFT extraction
 * ({@link polynomialCoeffs} in critical.ts), which is more robust than a bespoke far-field fit (3-radius
 * degree probe + a residual certification that rejects a rational/transcendental sharing the growth
 * rate). Returns null for a non-polynomial map (rational / Newton / transcendental) or a
 * non-holomorphic one (abs-maps), where the capacity is genuinely undefined.
 */
export function polynomialCapacity(fAst: Node, a: Complex, c: Complex): number | null {
  try {
    differentiate(fAst, "z"); // non-holomorphic (abs/conjugate/…) ⇒ capacity undefined
  } catch {
    return null;
  }
  const coeffs = polynomialCoeffs(fAst, a, c);
  if (!coeffs) return null; // not a genuine polynomial in z
  const d = coeffs.length - 1;
  if (d < 2) return null; // degree < 2 (rational/constant) ⇒ no filled-Julia capacity
  const mag = cabs(coeffs[d]); // exact leading coefficient a_d
  if (!Number.isFinite(mag) || mag <= 0) return null;
  return Math.pow(mag, -1 / (d - 1));
}

/**
 * Critical-orbit Lyapunov exponent (1/n)·Σ log|f′(z_k)|. Returns `escapes: true` (value null) if
 * the orbit leaves the set. For a non-holomorphic f (no symbolic f′) it falls back to the real
 * 2×2-Jacobian (Benettin) Lyapunov, which reduces to the same value when f is holomorphic. A
 * log|f′| = −∞ term (the orbit hits the critical point — a superattracting cycle) collapses the
 * average to −∞, the correct value there.
 */
function criticalLyapunov(
  fAst: Node,
  escAst: Node,
  crit: Complex,
  c: Complex,
  a: Complex,
  n = LYAP_ITERS,
): { value: number | null; escapes: boolean } {
  let fz: (z: Complex, c: Complex) => Complex;
  try {
    fz = makeComplexFn(differentiate(fAst, "z"), a);
  } catch {
    // non-holomorphic ⇒ no analytic f′; use the real-Jacobian (Benettin) Lyapunov instead.
    return lyapunovJacobian(getComplexFn(fAst, a), getEscapeFn(escAst, fAst, a), crit, c, n);
  }
  const f = getComplexFn(fAst, a);
  const esc = getEscapeFn(escAst, fAst, a);
  let z: Complex = [crit[0], crit[1]];
  let sum = 0;
  let count = 0;
  for (let k = 0; k < n; k++) {
    if (esc(z, c)) return { value: null, escapes: true };
    sum += Math.log(cabs(fz(z, c))); // log(0) = −∞ at the critical point ⇒ superattracting
    count++;
    z = f(z, c);
    if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) return { value: null, escapes: true };
  }
  return { value: count > 0 ? sum / count : null, escapes: false };
}

/** Compute the Tier-1 (cheap, analytic / orbit-based) properties of K_c at the current c. */
export function computeJuliaProperties(opts: {
  degree: number | null;
  c: Complex;
  fAst: Node;
  escAst: Node;
  criticalPoint: Complex;
  a: Complex;
}): JuliaProperties {
  const { degree, c, fAst, escAst, criticalPoint, a } = opts;
  const monic = degree !== null;

  // The critical orbit decides connectivity, the cycle, and the parameter class.
  const info = inspect(fAst, escAst, "param", criticalPoint, c, a);
  const escapes = info.fate === "escaped";
  const connected = !escapes;
  const cycle =
    info.period >= 1 && info.multiplierMag !== null
      ? { period: info.period, multiplierMag: info.multiplierMag, rotation: info.rotation }
      : null;

  let paramClass: ParamClass;
  if (escapes) paramClass = "outside";
  else if (cycle && cycle.multiplierMag < 1 - 1e-6) paramClass = "hyperbolic";
  else if (cycle && Math.abs(cycle.multiplierMag - 1) <= 1e-3) paramClass = "neutral";
  else paramClass = "bounded";

  // Lyapunov: the cycle multiplier when one was found (clean), else accumulate along the orbit.
  let lyapunov: number | null = null;
  if (!escapes) {
    if (cycle) {
      lyapunov = cycle.multiplierMag > 0 ? Math.log(cycle.multiplierMag) / cycle.period : -Infinity;
    } else {
      lyapunov = criticalLyapunov(fAst, escAst, criticalPoint, c, a).value;
    }
  }

  // Principal-cardioid gate for the perturbative small-c dimension: an attracting fixed point.
  const inPrincipalCardioid = !!cycle && cycle.period === 1 && cycle.multiplierMag < 1;

  return {
    degree,
    connected,
    cycle,
    paramClass,
    lyapunov,
    escapes,
    boundingRadius: monic ? boundingRadius(degree, c) : null,
    analyticArea: monic ? (escapes ? 0 : analyticAreaUpperBound(degree, c)) : null,
    // Ruelle / Bodart–Zinsmeister small-|c| asymptotic, dim_H J_c = 1 + |c|²/(4 ln 2) + O(|c|³).
    // It is established for the QUADRATIC family z²+c and is exact only at c = 0; restricted to d = 2
    // because the 1/(4 ln d) generalization to higher degree is not a citable result. Every other
    // map (incl. d ≥ 3) leaves this null and shows the box-counting estimate instead.
    smallCDimension:
      degree === 2 && inPrincipalCardioid ? 1 + (cabs(c) * cabs(c)) / (4 * Math.LN2) : null,
    capacity: monic ? 1 : polynomialCapacity(fAst, a, c),
  };
}

// --- Tier-2: image-based estimates (box-counting dimension + pixel area) ---------------------
// These sample an interior mask on a CPU grid (reusing the compiled evaluator) rather than the
// GPU, so they are deterministic, pure, and don't perturb the live render. They are heavier than
// Tier-1, so the caller debounces them and only runs while the panel is open.

/**
 * Interior (bounded-orbit) mask of the set over the square window centred at (cx, cy) with the
 * given half-width, row-major (1 = the orbit of that point stays bounded within `maxIter`).
 */
export function interiorMask(
  fAst: Node,
  escAst: Node,
  c: Complex,
  a: Complex,
  cx: number,
  cy: number,
  halfWidth: number,
  size: number,
  maxIter: number,
): Uint8Array {
  const f = getComplexFn(fAst, a);
  const esc = getEscapeFn(escAst, fAst, a);
  const mask = new Uint8Array(size * size);
  const step = (2 * halfWidth) / size;
  for (let py = 0; py < size; py++) {
    const y = cy - halfWidth + (py + 0.5) * step;
    for (let px = 0; px < size; px++) {
      const x = cx - halfWidth + (px + 0.5) * step;
      let z: Complex = [x, y];
      let bounded = true;
      for (let k = 0; k < maxIter; k++) {
        if (esc(z, c)) {
          bounded = false;
          break;
        }
        z = f(z, c);
        if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) {
          bounded = false;
          break;
        }
      }
      if (bounded) mask[py * size + px] = 1;
    }
  }
  return mask;
}

/** Number of interior cells in a mask (× the per-cell area gives the pixel-area estimate). */
export function countInterior(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  return n;
}

/** Numerically-estimated extent of the bounded set: a snug square mask window plus the tight
 *  bounding box, found by a coarse interior-mask pass. Generalizes the monic bounding disk to any f.
 *  `clipped` flags that the set reached the search-window edge (so the box under-covers the set). */
export interface Extent {
  cx: number;
  cy: number;
  halfWidth: number;
  bbox: { xMin: number; xMax: number; yMin: number; yMax: number };
  clipped: boolean;
}

/**
 * Locate the bounded set numerically: rasterize a coarse interior mask over the search window
 * [cx0±searchHalfWidth]×[cy0±searchHalfWidth], take the bounding box of the bounded cells, and
 * return a snug square window (10% padded) centred on it. Returns null when no bounded cell is
 * found (an empty interior / escaping parameter). Used to area-count and symmetry-test a general f,
 * which has no closed-form bounding disk.
 */
export function estimateExtent(
  fAst: Node,
  escAst: Node,
  c: Complex,
  a: Complex,
  cx0: number,
  cy0: number,
  searchHalfWidth: number,
  size: number,
  maxIter: number,
): Extent | null {
  const mask = interiorMask(fAst, escAst, c, a, cx0, cy0, searchHalfWidth, size, maxIter);
  let minPx = size;
  let maxPx = -1;
  let minPy = size;
  let maxPy = -1;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      if (!mask[py * size + px]) continue;
      if (px < minPx) minPx = px;
      if (px > maxPx) maxPx = px;
      if (py < minPy) minPy = py;
      if (py > maxPy) maxPy = py;
    }
  }
  if (maxPx < 0) return null; // no bounded cell ⇒ empty interior
  const step = (2 * searchHalfWidth) / size;
  const toX = (px: number): number => cx0 - searchHalfWidth + (px + 0.5) * step;
  const toY = (py: number): number => cy0 - searchHalfWidth + (py + 0.5) * step;
  const xMin = toX(minPx) - step / 2;
  const xMax = toX(maxPx) + step / 2;
  const yMin = toY(minPy) - step / 2;
  const yMax = toY(maxPy) + step / 2;
  const clipped = minPx === 0 || maxPx === size - 1 || minPy === 0 || maxPy === size - 1;
  const cx = (xMin + xMax) / 2;
  const cy = (yMin + yMax) / 2;
  const halfWidth = Math.max((Math.max(xMax - xMin, yMax - yMin) / 2) * 1.1, step);
  return { cx, cy, halfWidth, bbox: { xMin, xMax, yMin, yMax }, clipped };
}

/** Symmetries of an interior mask, measured by overlap (IoU) under candidate transforms. For a
 *  mask centred on the set: `central` = z→−z, `realAxis` = z→z̄, `imagAxis` = z→−z̄, `rotation` =
 *  the largest k∈[2,8] invariant under rotation by 2π/k (null if none). Generalizes the z^d+c
 *  symmetry string to any f — a measured estimate. */
export interface Symmetries {
  central: boolean;
  realAxis: boolean;
  imagAxis: boolean;
  rotation: number | null;
}

export function detectSymmetries(
  mask: Uint8Array,
  size: number,
  flipThreshold = 0.9,
  rotThreshold = 0.85,
): Symmetries {
  // Intersection-over-union of the mask with its image under an index remap (a discrete symmetry).
  const ioU = (mapIndex: (px: number, py: number) => number): number => {
    let inter = 0;
    let uni = 0;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const dst = mask[py * size + px];
        const src = mask[mapIndex(px, py)];
        if (dst || src) uni++;
        if (dst && src) inter++;
      }
    }
    return uni > 0 ? inter / uni : 0;
  };
  const central = ioU((px, py) => (size - 1 - py) * size + (size - 1 - px));
  const realAxis = ioU((px, py) => (size - 1 - py) * size + px);
  const imagAxis = ioU((px, py) => py * size + (size - 1 - px));

  // Rotational: resample the mask rotated by 2π/k about the grid centre (nearest-neighbour) and
  // measure overlap. k=2 reuses the exact central flip (no resampling loss).
  const rotatedIoU = (k: number): number => {
    const cg = (size - 1) / 2;
    const ang = (2 * Math.PI) / k;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    let inter = 0;
    let uni = 0;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const dx = px - cg;
        const dy = py - cg;
        const spx = Math.round(cg + ca * dx + sa * dy); // source pixel = rotate (px,py) by −ang
        const spy = Math.round(cg - sa * dx + ca * dy);
        const src = spx >= 0 && spx < size && spy >= 0 && spy < size ? mask[spy * size + spx] : 0;
        const dst = mask[py * size + px];
        if (dst || src) uni++;
        if (dst && src) inter++;
      }
    }
    return uni > 0 ? inter / uni : 0;
  };
  let rotation: number | null = null;
  for (let k = 8; k >= 2; k--) {
    const score = k === 2 ? central : rotatedIoU(k);
    if (score >= (k === 2 ? flipThreshold : rotThreshold)) {
      rotation = k;
      break;
    }
  }
  return {
    central: central >= flipThreshold,
    realAxis: realAxis >= flipThreshold,
    imagAxis: imagAxis >= flipThreshold,
    rotation,
  };
}

/**
 * Box-counting (Minkowski) dimension of the interior/exterior boundary in `mask` (size×size):
 * the slope of log(occupied boxes) vs log(1/δ) over a dyadic ladder of box sizes. Returns null
 * when there is too little boundary to fit. An estimate (typically ±0.05–0.1), not exact.
 */
export function boxCountDimension(mask: Uint8Array, size: number): number | null {
  // Boundary = an interior cell touching the exterior (or the window edge) in 4-connectivity.
  const boundary = new Uint8Array(size * size);
  let nb = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (!mask[i]) continue;
      const edge =
        x === 0 ||
        x === size - 1 ||
        y === 0 ||
        y === size - 1 ||
        !mask[i - 1] ||
        !mask[i + 1] ||
        !mask[i - size] ||
        !mask[i + size];
      if (edge) {
        boundary[i] = 1;
        nb++;
      }
    }
  }
  if (nb < 16) return null; // too little structure for a meaningful fit

  const logInvDelta: number[] = [];
  const logCount: number[] = [];
  for (let box = size >> 1; box >= 2; box >>= 1) {
    let occupied = 0;
    for (let by = 0; by < size; by += box) {
      for (let bx = 0; bx < size; bx += box) {
        let hit = false;
        const yEnd = Math.min(by + box, size);
        const xEnd = Math.min(bx + box, size);
        for (let y = by; y < yEnd && !hit; y++) {
          for (let x = bx; x < xEnd && !hit; x++) {
            if (boundary[y * size + x]) hit = true;
          }
        }
        if (hit) occupied++;
      }
    }
    if (occupied > 0) {
      logInvDelta.push(Math.log(size / box));
      logCount.push(Math.log(occupied));
    }
  }
  // Drop the 2 finest scales when we can: a ~1-pixel-thick boundary saturates there (the slope
  // flattens toward 1), biasing the estimate low. The coarse scales carry the fractal signal.
  const drop = logInvDelta.length >= 5 ? 2 : 0;
  const xs = logInvDelta.slice(0, logInvDelta.length - drop);
  const ys = logCount.slice(0, logCount.length - drop);
  if (xs.length < 3) return null;

  // Least-squares slope of logCount vs logInvDelta.
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxx += xs[i] * xs[i];
    sxy += xs[i] * ys[i];
  }
  const denom = n * sxx - sx * sx;
  return denom === 0 ? null : (n * sxy - sx * sy) / denom;
}

// --- PR γ: image-based connectivity (connected-component labelling) ------------------------------
// Component structure of the bounded set straight from the interior mask — needs NO critical point,
// so it works for an arbitrary custom f (the existing per-critical-point test is unreliable there).
// The mask samples the filled set K (bounded-orbit points, boundary included). Caveat: a dendrite /
// Cantor set has ~empty interior (measure zero), and from the mask alone the two are
// indistinguishable — the caller resolves that case via the critical-orbit fate. An estimate.

export interface Components {
  /** Number of distinct 8-connected components. */
  count: number;
  /** Cells in the largest component. */
  largest: number;
  /** Total interior cells. */
  total: number;
  /** largest / total (→ 1 for a single blob). */
  largestFraction: number;
  /** Components with at least `minCells` cells (ignores single-pixel sampling specks). */
  nontrivial: number;
}

/** 8-connected component statistics of an interior mask, via a two-pass union-find labelling. */
export function connectedComponents(mask: Uint8Array, size: number, minCells = 4): Components {
  const labels = new Int32Array(size * size);
  const parent: number[] = [];
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const nx = parent[x];
      parent[x] = r;
      x = nx;
    }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  let next = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (!mask[i]) continue;
      // Merge with already-labelled 8-neighbours: left, up, up-left, up-right.
      let lab = -1;
      const consider = (j: number): void => {
        if (!mask[j]) return;
        if (lab === -1) lab = labels[j];
        else union(lab, labels[j]);
      };
      if (x > 0) consider(i - 1);
      if (y > 0) consider(i - size);
      if (x > 0 && y > 0) consider(i - size - 1);
      if (x < size - 1 && y > 0) consider(i - size + 1);
      if (lab === -1) {
        lab = next;
        parent[next] = next;
        next++;
      }
      labels[i] = lab;
    }
  }

  const counts = new Map<number, number>();
  let total = 0;
  for (let i = 0; i < size * size; i++) {
    if (!mask[i]) continue;
    const r = find(labels[i]);
    counts.set(r, (counts.get(r) ?? 0) + 1);
    total++;
  }
  let largest = 0;
  let nontrivial = 0;
  for (const v of counts.values()) {
    if (v > largest) largest = v;
    if (v >= minCells) nontrivial++;
  }
  return {
    count: counts.size,
    largest,
    total,
    largestFraction: total > 0 ? largest / total : 0,
    nontrivial,
  };
}

export type Connectivity = "connected" | "disconnected" | "indeterminate" | "empty";

/**
 * Heuristic connectivity verdict from component statistics. "empty" = the bounded set has no
 * substantial interior (a dendrite or a Cantor dust — both measure zero, indistinguishable from the
 * mask, so the caller resolves them via the critical-orbit fate). Otherwise: one dominant component
 * → connected; several substantial components → disconnected; in between → indeterminate.
 */
export function connectivityVerdict(comp: Components, size: number): Connectivity {
  if (comp.total < Math.max(8, 0.003 * size * size) || comp.nontrivial === 0) return "empty";
  if (comp.largestFraction >= 0.85 && comp.nontrivial <= 1) return "connected";
  if (comp.nontrivial >= 2) return "disconnected";
  return "indeterminate";
}

/** Morphological dilation by a Chebyshev radius (square structuring element). Used to bridge the
 *  measure-zero pinches where a connected filled Julia set's Fatou components touch (the pixel grid
 *  misses the single Julia point joining them, so the raw mask splits there). */
export function dilateMask(mask: Uint8Array, size: number, radius: number): Uint8Array {
  if (radius <= 0) return mask;
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!mask[y * size + x]) continue;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(size - 1, y + radius);
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(size - 1, x + radius);
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) out[yy * size + xx] = 1;
    }
  }
  return out;
}

/**
 * Image connectivity of the bounded set: `empty` when the interior is measure-zero (dendrite /
 * Cantor dust — the caller disambiguates via the critical-orbit fate), else the number of
 * components AFTER bridging the thin pinches that only join a connected K at Julia points (so a
 * connected filled set reports 1, not its many Fatou components). `components` ≥ 1 when not empty.
 */
export function imageConnectivity(
  mask: Uint8Array,
  size: number,
): { empty: boolean; components: number } {
  const raw = connectedComponents(mask, size);
  if (connectivityVerdict(raw, size) === "empty") return { empty: true, components: 0 };
  if (raw.nontrivial <= 1) return { empty: false, components: 1 };
  // Several raw pieces: bridge measure-zero pinches, then re-count.
  const bridged = connectedComponents(dilateMask(mask, size, 2), size);
  return { empty: false, components: Math.max(1, bridged.nontrivial) };
}

/**
 * Display-ready Tier-2 image metrics — the result of {@link computeJuliaImageMetrics}. `boxDim` and
 * `pixelArea` apply to any f. `extent`/`symmetry`/`connectivity` are present only for a general
 * (non-monic) f — the monic family keeps its analytic rows, so they are omitted to leave those
 * untouched — and `connectivity` is also omitted when a rigorous Tier-1 verdict already stands.
 */
export interface JuliaImageMetrics {
  boxDim: number | null;
  pixelArea: number | null;
  extent?: Extent | null;
  symmetry?: string | null;
  connectivity?: string | null;
}

/** A measured-symmetry display string from {@link detectSymmetries} (general f, any map class). */
function describeSymmetry(s: Symmetries): string {
  const parts: string[] = [];
  if (s.rotation && s.rotation >= 3) parts.push(`${s.rotation}-fold rotational`);
  else if (s.central) parts.push("central (z → −z)");
  if (s.realAxis) parts.push("real-axis mirror");
  if (s.imagAxis) parts.push("imag-axis mirror");
  return parts.length ? `≈ ${parts.join(" · ")}` : "none detected";
}

/** Image-based connectivity estimate for a general f (no critical point needed); the measure-zero
 *  (dendrite vs Cantor dust) case is resolved by the critical-orbit fate. */
function describeConnectivity(mask: Uint8Array, size: number, escapes: boolean): string {
  const r = imageConnectivity(mask, size);
  if (r.empty) return escapes ? "≈ Cantor dust (no interior)" : "≈ connected dendrite (no interior)";
  return r.components <= 1 ? "≈ connected (one component)" : `≈ ${r.components} bounded components`;
}

/**
 * The heavy Tier-2 image metrics (bounding extent, box-counting dimension, pixel area, symmetry,
 * connectivity) from a CPU interior mask. Pure (no DOM), so it runs identically on the main thread
 * or inside a Web Worker (see {@link ./juliaMetricsClient}). The mask window is the exact bounding
 * disk for monic z^d + c, else a numerically-located snug window around the whole set. Monic returns
 * only `boxDim`/`pixelArea` (its extent/symmetry/connectivity rows are analytic); a general f also
 * returns the measured extent/symmetry, and the connectivity unless a rigorous Tier-1 verdict stands.
 */
export function computeJuliaImageMetrics(opts: {
  fAst: Node;
  escAst: Node;
  a: Complex;
  c: Complex;
  centerX: number;
  centerY: number;
  zoom: number;
  boundingRadius: number | null;
  escapes: boolean;
  rigorousConnectivity: boolean;
  size: number;
}): JuliaImageMetrics {
  const { fAst, escAst, a, c, centerX, centerY, zoom, boundingRadius, escapes, size } = opts;

  if (boundingRadius !== null) {
    // Monic z^d + c: the bounding disk encloses the whole set exactly; the symmetry / connectivity /
    // bounding rows stay analytic (omitted here so the caller leaves them untouched).
    const mask = interiorMask(fAst, escAst, c, a, 0, 0, boundingRadius, size, 150);
    const interior = countInterior(mask);
    return {
      boxDim: boxCountDimension(mask, size),
      pixelArea: escapes ? 0 : interior * ((2 * boundingRadius) / size) ** 2,
    };
  }

  // General f: locate the set numerically. A generous coarse sweep, then a snug refine pass (a small
  // set in a big window is under-resolved, clipping thin tips / filaments).
  const searchHalf = Math.max(4, 3 / zoom);
  let ext = estimateExtent(fAst, escAst, c, a, centerX, centerY, searchHalf, 96, 120);
  if (ext) {
    const span = Math.max(ext.bbox.xMax - ext.bbox.xMin, ext.bbox.yMax - ext.bbox.yMin);
    const refined = estimateExtent(fAst, escAst, c, a, ext.cx, ext.cy, span * 1.3, 96, 150);
    if (refined) ext = refined;
  }
  if (!ext) {
    // No bounded interior located (empty / escaping).
    const out: JuliaImageMetrics = {
      boxDim: null,
      pixelArea: escapes ? 0 : null,
      extent: null,
      symmetry: "none detected",
    };
    if (!opts.rigorousConnectivity)
      out.connectivity = escapes
        ? "≈ Cantor dust (no interior)"
        : "≈ connected dendrite (no interior)";
    return out;
  }

  const mask = interiorMask(fAst, escAst, c, a, ext.cx, ext.cy, ext.halfWidth, size, 150);
  const interior = countInterior(mask);
  const out: JuliaImageMetrics = {
    boxDim: boxCountDimension(mask, size),
    pixelArea: escapes ? 0 : interior * ((2 * ext.halfWidth) / size) ** 2,
    extent: ext,
    symmetry: describeSymmetry(detectSymmetries(mask, size)),
  };
  if (!opts.rigorousConnectivity) out.connectivity = describeConnectivity(mask, size, escapes);
  return out;
}
