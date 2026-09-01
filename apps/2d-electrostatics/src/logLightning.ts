// Log-lightning: capacity, Green's function, and equilibrium charge for a GENERAL compact set K given
// only by its boundary — no conformal map (M3.4, Baddoo–Trefethen). It models K as a grounded conductor
// directly: place log-charges zⱼ just inside ∂K, with weights qⱼ summing to 1, and solve a boundary
// least-squares so the equilibrium potential U(z) = Σⱼ qⱼ·log|z − zⱼ| is CONSTANT (= the Robin constant γ)
// on ∂K. Then, exactly as for a real conductor:
//
//   capacity  cap(K) = e^{γ}                                            (γ = boundary value of U)
//   Green fn  g_K(z) = U(z) − γ          (= 0 on ∂K, ~ log|z| − log cap at ∞)
//   charge    density on ∂K ∝ |Σⱼ qⱼ/(w − zⱼ)| = |∂g/∂n|               (the normal derivative)
//
// The least squares runs on @cas/core's lstsqHouseholder. Everything here is `≈` (a numerical fit),
// in deliberate contrast to the `=` exterior-map domains (potentialDomain.ts).
import { lstsqHouseholder } from "@cas/core";
import type { Pt } from "@cas/flow";

export interface LogLightningFit {
  /** cap(K) = e^{γ} (≈). */
  readonly capacity: number;
  /** The Robin constant γ (= boundary value of the equilibrium potential = log cap). */
  readonly robin: number;
  /** Green's function g_K(z) = Σ qⱼ log|z−zⱼ| − γ (0 on ∂K, ~ log|z| − log cap at ∞). */
  greenFn(z: Pt): number;
  /** Relative equilibrium charge density at a boundary point w, ∝ |∂g/∂n| = |Σ qⱼ/(w−zⱼ)|. */
  chargeDensity(w: Pt): number;
  /** The log-charge locations (just inside ∂K). */
  readonly charges: Pt[];
  /** The charge weights qⱼ (Σ = 1). */
  readonly weights: number[];
  /** Max boundary residual of U − γ (an honest ≈ accuracy tag). */
  readonly residual: number;
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Inward unit normal at boundary sample i (from the neighbour tangent, oriented toward the centroid). */
function inwardNormal(boundary: readonly Pt[], i: number, centroid: Pt): Pt {
  const n = boundary.length;
  const a = boundary[(i - 1 + n) % n];
  const b = boundary[(i + 1) % n];
  const tx = b[0] - a[0];
  const ty = b[1] - a[1];
  const tl = Math.hypot(tx, ty) || 1;
  let nx = -ty / tl;
  let ny = tx / tl;
  // orient toward the centroid (inward)
  const cx = centroid[0] - boundary[i][0];
  const cy = centroid[1] - boundary[i][1];
  if (nx * cx + ny * cy < 0) {
    nx = -nx;
    ny = -ny;
  }
  return [nx, ny];
}

export interface LogLightningOptions {
  /** Number of log-charges (subsampled from the boundary). Default min(56, |boundary|). */
  charges?: number;
  /** Inward offset of the charges, as a fraction of the mean boundary radius. Default 0.06. */
  inset?: number;
}

/**
 * Fit the equilibrium potential of K (given ordered ∂K samples, CCW) by log-lightning. Charges sit just
 * inside ∂K; the weights + Robin constant solve a boundary-collocation least squares (`lstsqHouseholder`),
 * with Σ qⱼ = 1 enforced by a heavily-weighted row. Returns cap / Green fn / charge density (all `≈`).
 */
export function fitLogLightning(boundary: readonly Pt[], opts: LogLightningOptions = {}): LogLightningFit {
  const m = boundary.length;
  const centroid: Pt = [
    boundary.reduce((s, p) => s + p[0], 0) / m,
    boundary.reduce((s, p) => s + p[1], 0) / m,
  ];
  const meanR = boundary.reduce((s, p) => s + dist(p, centroid), 0) / m;
  const nCharges = Math.max(8, Math.min(opts.charges ?? 56, m));
  const inset = (opts.inset ?? 0.06) * meanR;

  // Charges: subsample the boundary and step inward along the normal.
  const charges: Pt[] = [];
  for (let k = 0; k < nCharges; k++) {
    const i = Math.round((k * m) / nCharges) % m;
    const nrm = inwardNormal(boundary, i, centroid);
    charges.push([boundary[i][0] + inset * nrm[0], boundary[i][1] + inset * nrm[1]]);
  }

  // Least squares for x = [q_1 … q_n, γ]: each boundary point w_i gives Σ_j q_j·log|w_i−z_j| − γ = 0;
  // one heavily-weighted row enforces Σ q_j = 1.
  const n = charges.length;
  const W = Math.sqrt(m); // constraint weight (comparable to the collocation block)
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < m; i++) {
    const row = new Array<number>(n + 1);
    for (let j = 0; j < n; j++) row[j] = Math.log(Math.max(dist(boundary[i], charges[j]), 1e-300));
    row[n] = -1;
    A.push(row);
    b.push(0);
  }
  const cons = new Array<number>(n + 1).fill(W);
  cons[n] = 0;
  A.push(cons);
  b.push(W);

  const x = lstsqHouseholder(A, b);
  const weights = x.slice(0, n);
  const robin = x[n];

  const greenFn = (z: Pt): number => {
    let u = 0;
    for (let j = 0; j < n; j++) u += weights[j] * Math.log(Math.max(dist(z, charges[j]), 1e-300));
    return u - robin;
  };
  const chargeDensity = (w: Pt): number => {
    let re = 0;
    let im = 0;
    for (let j = 0; j < n; j++) {
      const dx = w[0] - charges[j][0];
      const dy = w[1] - charges[j][1];
      const d2 = dx * dx + dy * dy || 1e-300;
      re += (weights[j] * dx) / d2; // Re[q_j/(w−z_j)]
      im += (-weights[j] * dy) / d2; // Im[q_j/(w−z_j)]
    }
    return Math.hypot(re, im);
  };

  // Honest residual: max |U − γ| over the boundary (= max |g_K| on ∂K, which should be 0).
  let residual = 0;
  for (const w of boundary) residual = Math.max(residual, Math.abs(greenFn(w)));

  return { capacity: Math.exp(robin), robin, greenFn, chargeDensity, charges, weights, residual };
}
