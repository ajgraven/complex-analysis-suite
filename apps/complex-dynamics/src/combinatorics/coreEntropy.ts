/**
 * coreEntropy.ts — core entropy and biaccessibility dimension of an external angle θ (Thurston's
 * angle-pair algorithm).
 *
 * The core entropy h(θ) of a postcritically-finite quadratic is the topological entropy of f on its
 * Hubbard tree; Thurston's theorem gives h(θ) = log λ = log 2 · B_top, where B is the
 * Hausdorff dimension of the biaccessible angles and λ ∈ [1,2] is the leading (Perron) eigenvalue
 * of a transition matrix on **pairs** of postcritical angles:
 *
 *   • Θ = forward doubling orbit {θ, 2θ, 4θ, …} (finite for rational θ; closed under doubling).
 *   • States = unordered pairs {a,b} of distinct angles in Θ.
 *   • The critical diameter joins the two preimages of θ: θ/2 and (θ+1)/2. A pair {a,b} is
 *     "separated" when exactly one of a,b lies on the arc (θ/2, (θ+1)/2).
 *       – not separated: T{a,b} = {2a, 2b}.
 *       – separated:     T{a,b} = {2a, θ} + {θ, 2b}   (the image chord crosses the critical value θ).
 *   • λ = spectral radius of T, by power iteration.
 *
 * Pure module — no DOM / GL. See FEATURE_RESEARCH.md §3.3. Oracles: 1/5 → λ⁴−λ²−1=0 (1.395337);
 * 1/6 → λ³−λ−2=0 (1.521380). (θ whose orbit reaches the β-fixed angle 0 are excluded — degenerate.)
 */
import { type Angle, angle, compare, double, equals } from "./angles";

export interface CoreEntropy {
  /** Perron eigenvalue λ ∈ [1, 2] — the growth rate. */
  lambda: number;
  /** Topological entropy h = log λ. */
  entropy: number;
  /** Biaccessibility dimension B = h / log 2 ∈ [0, 1]. */
  biaccessibility: number;
  /** Number of postcritical angles |Θ|. */
  orbitSize: number;
}

/** Forward doubling orbit of θ (distinct angles, in visitation order). */
function forwardOrbit(theta: Angle): Angle[] {
  const out: Angle[] = [];
  let cur = theta;
  while (!out.some((x) => equals(x, cur))) {
    out.push(cur);
    cur = double(cur);
  }
  return out;
}

/**
 * Core entropy of the external angle p/q. Returns null for θ = 0, a degenerate orbit (reaching the
 * β-fixed angle 0), or an orbit too large to power-iterate (|Θ| capped for the UI).
 */
export function coreEntropy(p: number, q: number, maxOrbit = 40): CoreEntropy | null {
  let theta: Angle;
  try {
    theta = angle(p, q);
  } catch {
    return null;
  }
  if (theta.p === 0) return null;
  const orbit = forwardOrbit(theta);
  const n = orbit.length;
  if (n > maxOrbit) return null;
  if (orbit.some((x) => x.p === 0)) return null; // orbit hits the β-fixed angle 0 — degenerate
  if (n < 2) return { lambda: 1, entropy: 0, biaccessibility: 0, orbitSize: n };

  const idxOf = (x: Angle): number => orbit.findIndex((y) => equals(y, x));
  const thetaIdx = idxOf(theta);
  const c1 = angle(theta.p, 2 * theta.q); // θ/2
  const c2 = angle(theta.p + theta.q, 2 * theta.q); // (θ+1)/2
  const inArc = (x: Angle): boolean => compare(c1, x) < 0 && compare(x, c2) < 0;

  // Index the unordered pairs (i < j) and build the transition matrix in COLUMN-SPARSE form:
  // cols[c] lists the (row, weight) targets of column c. Each column has at most two non-zeros, so
  // the matvec below is O(count) rather than the O(count²) of a dense form — the dense version stalls
  // for several seconds near the |Θ| cap (count = n(n−1)/2 ≈ 780 at n = 40).
  const pairId = new Map<string, number>();
  const key = (u: number, v: number): string => (u < v ? `${u},${v}` : `${v},${u}`);
  let count = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairId.set(key(i, j), count++);
  const cols: { row: number; w: number }[][] = Array.from({ length: count }, () => []);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const col = pairId.get(key(i, j)) as number;
      const dai = idxOf(double(orbit[i]));
      const dbi = idxOf(double(orbit[j]));
      const addTarget = (u: number, v: number): void => {
        if (u === v) return; // degenerate {θ,θ}
        const row = pairId.get(key(u, v));
        if (row === undefined) return;
        const e = cols[col].find((t) => t.row === row); // ≤2 entries/col ⇒ trivial scan
        if (e) e.w += 1; // both separated targets can coincide (preimage pair) ⇒ weight 2
        else cols[col].push({ row, w: 1 });
      };
      if (inArc(orbit[i]) === inArc(orbit[j])) {
        addTarget(dai, dbi); // not separated
      } else {
        addTarget(dai, thetaIdx); // separated ⇒ chord splits at the critical value θ
        addTarget(thetaIdx, dbi);
      }
    }
  }

  // Power iteration for the spectral radius (Perron eigenvalue of the non-negative matrix), with a
  // sparse matvec (w = M·v accumulated column-by-column) and an early-out once λ stabilises — the
  // Perron value typically converges in far fewer than the 4000-iteration cap.
  let v = new Array<number>(count).fill(1);
  let lambda = 1;
  for (let it = 0; it < 4000; it++) {
    const w = new Array<number>(count).fill(0);
    for (let c = 0; c < count; c++) {
      const vc = v[c];
      if (vc === 0) continue;
      for (const { row, w: weight } of cols[c]) w[row] += weight * vc;
    }
    const norm = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
    if (norm === 0) {
      lambda = 1;
      break;
    }
    v = w.map((x) => x / norm);
    const converged = Math.abs(norm - lambda) <= 1e-12 * norm;
    lambda = norm; // v is unit-norm, so ‖Mv‖ → spectral radius
    if (converged) break;
  }
  return {
    lambda,
    entropy: Math.log(lambda),
    biaccessibility: Math.log(lambda) / Math.LN2,
    orbitSize: n,
  };
}
