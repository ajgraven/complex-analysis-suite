/**
 * matingEngine.ts — the **marked-point Thurston pullback** for polynomial matings (Wolf Jung, "The
 * Thurston Algorithm for quadratic matings", arXiv:1706.04177; Boyd–Henriksen "The Medusa Algorithm for
 * Polynomial Matings", arXiv:1102.5047).
 *
 * A **mating** glues two postcritically-finite (PCF) quadratics f_A = z²+c_A and f_B = z²+c_B along
 * their Julia-set boundaries (∂K_A(θ) ~ ∂K_B(−θ)) into a single quadratic **rational** map R, provided
 * they are not in complex-conjugate limbs of M (Rees–Shishikura–Tan Lei). Jung's theorem makes this
 * computable without encoding the postcritical ray-equivalence topology: iterate the Thurston pullback
 * of the *formal* mating — the marked (postcritical) points collide, but the rational maps converge to R
 * (except the (2,2,2,2) / Lattès orbifold, which diverges).
 *
 * SCOPE (Stage 1): the second parent is the **basilica** (c_B = −1, period 2). Its superattracting
 * 2-cycle normalises to {∞, 1}, and the two critical points to 0 (from f_A) and ∞ (from f_B), so every
 * map in the pullback has the closed form
 *
 *     g(z) = (z² − x₁) / (z² − 1),          x₁ = the position of f_A's critical value,
 *
 * with g(∞)=1, g(1)=∞ (the basilica 2-cycle) automatically, and the pullback reduces to iterating the
 * marked points of f_A (its postcritical orbit) under g⁻¹(w) = ±√((x₁−w)/(1−w)), the sign chosen by
 * continuity. At the fixed point x₁ is the mated map's parameter.
 *
 * The pullback *core* is general and verified (see {@link CANONICAL_MATINGS}); what is not yet general
 * is the **initialisation** — which basin the iteration lands in for an arbitrary c_A. We use a
 * c_A-informed seed (conjugated postcritical values, per the θ↦−θ gluing) with fallbacks, which lands
 * the correct map for the canonical matings but can capture a sibling for an unverified c_A (e.g. a real
 * period-3 map does not exist here — x₁²+x₁+1=0 gives only e^{±2πi/3} — so the airplane is not a clean
 * "⊔ basilica" period-3 mating). Guaranteeing the right basin for any pair needs the slow-mating
 * homotopy initialisation (Stage 2). So {@link mateWithBasilica} returns the pullback's fixed point as a
 * *candidate*; the rigorously-correct results are the {@link CANONICAL_MATINGS}, asserted in the tests.
 *
 * Oracles: z²+i ⊔ basilica → exactly (z²+2)/(z²−1) (Jung, Example 2.5); the rabbit and corabbit →
 * (z² − e^{±2πi/3})/(z²−1) (the only period-3 values, conjugate siblings tracking conj(c_A)); the
 * basilica ⊔ basilica is obstructed (self-conjugate ½-limb) and yields no map.
 */
import type { Complex } from "../complex";

// Self-contained complex arithmetic (this module is pure numerics; ∞ is handled combinatorially).
const cadd = (p: Complex, q: Complex): Complex => [p[0] + q[0], p[1] + q[1]];
const csub = (p: Complex, q: Complex): Complex => [p[0] - q[0], p[1] - q[1]];
const cmul = (p: Complex, q: Complex): Complex => [
  p[0] * q[0] - p[1] * q[1],
  p[0] * q[1] + p[1] * q[0],
];
const cdiv = (p: Complex, q: Complex): Complex => {
  const d = q[0] * q[0] + q[1] * q[1];
  return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d];
};
/** Principal square root. */
const csqrt = (p: Complex): Complex => {
  const r = Math.hypot(p[0], p[1]);
  if (r === 0) return [0, 0];
  const re = Math.sqrt((r + p[0]) / 2);
  const im = Math.sqrt((r - p[0]) / 2);
  return [re, p[1] < 0 ? -im : im];
};
const cdist = (p: Complex, q: Complex): number => Math.hypot(p[0] - q[0], p[1] - q[1]);
const ZERO: Complex = [0, 0];
const ONE: Complex = [1, 0];

/** The postcritical orbit of f_c(z)=z²+c (the forward orbit of the critical point 0), with combinatorics. */
export interface PostcriticalOrbit {
  /** The postcritical points f_c(0), f_c²(0), … up to the point that re-enters the orbit (excludes 0). */
  orbit: Complex[];
  /**
   * successor index of each orbit point: `succ[i]` is the index in `orbit` of f_c(orbit[i]), or −1 when
   * it is the critical point 0 itself (a periodic critical orbit returns to 0).
   */
  succ: number[];
  /** Steps before the orbit becomes periodic (0 ⇒ the critical point is periodic, e.g. hyperbolic). */
  preperiod: number;
  /** Length of the terminal cycle. */
  period: number;
}

/**
 * The postcritical orbit of z²+c: iterate 0 until it repeats (periodic) or re-enters an earlier point
 * (preperiodic / Misiurewicz). Returns null when 0 does not become (pre)periodic within `maxLen` (c not
 * PCF within the bound). Tolerance `tol` decides when two iterates coincide.
 */
export function postcriticalOrbit(c: Complex, maxLen = 64, tol = 1e-11): PostcriticalOrbit | null {
  const orbit: Complex[] = [];
  let z: Complex = ZERO;
  for (let i = 0; i < maxLen; i++) {
    z = cadd(cmul(z, z), c); // z = f^{i+1}(0)
    if (cdist(z, ZERO) < tol) {
      // periodic: the orbit closes back on the critical point 0
      const succ = orbit.map((_, k) => (k + 1 < orbit.length ? k + 1 : -1));
      return { orbit, succ, preperiod: 0, period: orbit.length + 1 };
    }
    for (let j = 0; j < orbit.length; j++) {
      if (cdist(z, orbit[j]) < tol) {
        // preperiodic (Misiurewicz): re-enters the orbit at index j
        const succ = orbit.map((_, k) => (k + 1 < orbit.length ? k + 1 : j));
        return { orbit, succ, preperiod: j + 1, period: orbit.length - j };
      }
    }
    orbit.push(z);
  }
  return null;
}

/** A quadratic rational map (z²·num[1] + num[0]) / (z²·den[1] + den[0]) as the mating of two parents. */
export interface Mating {
  /** The mated map parameter: g(z) = (z² − x1)/(z² − 1). */
  x1: Complex;
  /** Human-readable f-string for the rational map, e.g. "(z^2 - (-2))/(z^2 - 1)". */
  fString: string;
  /** Preperiod / period of the mated map's critical point 0 (realising f_A, collision-adjusted). */
  critPreperiod: number;
  critPeriod: number;
  /** Iterations the pullback took (diagnostic). */
  iterations: number;
}

const MAX_ITERS = 4000;
const CONVERGE_TOL = 1e-13;
const DEGENERATE_TOL = 1e-4; // |x1 − 1| below this ⇒ num ∝ den (constant map)

/** Choose the ± square-root branch nearer to `prev` (continuity). */
function branch(root: Complex, prev: Complex): Complex {
  const neg: Complex = [-root[0], -root[1]];
  return cdist(root, prev) <= cdist(neg, prev) ? root : neg;
}

/**
 * Run the marked-point pullback from a given seed (positions of f_A's postcritical points), returning
 * the converged x₁ of g(z) = (z²−x₁)/(z²−1). Pure iteration of x_i ← g⁻¹(x_{succ(i)}), sign by
 * continuity; the critical value x₁ = x[0] drives g each step.
 */
function pullback(orbit: PostcriticalOrbit, seed: Complex[]): { x1: Complex; iterations: number } {
  const x = seed.map((p): Complex => [p[0], p[1]]);
  let iterations = 0;
  for (let it = 0; it < MAX_ITERS; it++) {
    iterations = it + 1;
    const arg = (w: Complex): Complex => cdiv(csub(x[0], w), csub(ONE, w)); // (x1 − w)/(1 − w)
    const next = x.map((_, i): Complex => {
      const succPos = orbit.succ[i] < 0 ? ZERO : x[orbit.succ[i]];
      return branch(csqrt(arg(succPos)), x[i]);
    });
    let delta = 0;
    for (let i = 0; i < x.length; i++) delta += cdist(next[i], x[i]);
    for (let i = 0; i < x.length; i++) x[i] = next[i];
    if (delta < CONVERGE_TOL) break;
  }
  return { x1: x[0], iterations };
}

/** The (pre)period of the critical point 0 under g(z)=(z²−x₁)/(z²−1); null if it hits a pole / blows up. */
function critStructure(x1: Complex): { pre: number; per: number } | null {
  const g = (z: Complex): Complex | null => {
    const den = csub(cmul(z, z), ONE);
    if (Math.hypot(den[0], den[1]) < 1e-9) return null; // pole
    return cdiv(csub(cmul(z, z), x1), den);
  };
  const seq: Complex[] = [ZERO];
  let z: Complex = ZERO;
  for (let i = 0; i < 40; i++) {
    const w = g(z);
    if (!w || Math.hypot(w[0], w[1]) > 1e6) return null;
    seq.push(w);
    z = w;
  }
  for (let per = 1; per <= 12; per++) {
    for (let pre = 0; pre + per < seq.length - 1; pre++) {
      if (
        cdist(seq[seq.length - 1], seq[seq.length - 1 - per]) < 1e-7 &&
        cdist(seq[pre], seq[pre + per]) < 1e-6
      ) {
        return { pre, per };
      }
    }
  }
  return null;
}

function fmt(v: number): string {
  return Math.abs(v) < 1e-9 ? "0" : Number(v.toFixed(10)).toString();
}
/** The rational map g(z) = (z² − x₁)/(z² − 1) as an f-string, with the numerator sign folded in. */
function fStringOf(x1: Complex): string {
  const num =
    Math.abs(x1[1]) < 1e-9
      ? x1[0] >= 0
        ? `z^2 - ${fmt(x1[0])}`
        : `z^2 + ${fmt(-x1[0])}`
      : `z^2 - (${fmt(x1[0])}${x1[1] >= 0 ? "+" : ""}${fmt(x1[1])}*i)`;
  return `(${num})/(z^2 - 1)`;
}

/**
 * Mate f_A(z) = z² + c_A with the **basilica** (z² − 1) via the marked-point Thurston pullback, returning
 * the mated quadratic rational map g(z) = (z² − x₁)/(z² − 1), or null when no non-degenerate map is found
 * (obstruction / not PCF / no convergence). Tries a c_A-informed seed (conjugated postcritical values —
 * the θ↦−θ gluing) first, then fallbacks, accepting the first that converges to a non-degenerate map with
 * a finite critical orbit. See the module header for the correctness scope: rigorous for the
 * {@link CANONICAL_MATINGS}; a candidate (possibly a sibling) for an arbitrary c_A until the slow-mating
 * initialisation lands the basin deterministically (Stage 2).
 */
export function mateWithBasilica(cA: Complex): Mating | null {
  const orbit = postcriticalOrbit(cA);
  if (!orbit) return null;
  const seeds: Complex[][] = [];
  // c_A-informed seeds first (conjugated postcritical values, a few scales) — sibling-correct when they
  // converge (they track conj(c_A)); then deterministic generic fallbacks for the collision cases.
  for (const s of [1, 2, 3]) seeds.push(orbit.orbit.map((p): Complex => [s * p[0], -s * p[1]]));
  seeds.push(orbit.orbit.map((_, i): Complex => [Math.cos(2 + i) * 1.3, Math.sin(2 + i) * 1.3]));
  seeds.push(orbit.orbit.map((_, i): Complex => [-1 + 0.4 * i, 0.6 - 0.3 * i]));
  seeds.push(orbit.orbit.map((_, i): Complex => [0.5 * (i % 2 ? 1 : -1), 0.5 * (i % 2 ? -1 : 1)]));
  for (const seed of seeds) {
    const { x1, iterations } = pullback(orbit, seed);
    if (!Number.isFinite(x1[0]) || !Number.isFinite(x1[1])) continue;
    if (cdist(x1, ONE) < DEGENERATE_TOL) continue; // degenerate: g ≡ 1
    const st = critStructure(x1);
    if (!st) continue;
    // For a hyperbolic parent (no postcritical collision) the mated critical point must have exactly
    // the parent's period — this rejects spurious lower-period fixed points (e.g. the obstructed
    // basilica ⊔ basilica, which the pullback would otherwise collapse to period 1). A Misiurewicz
    // parent collides (its cycle collapses), so its mated period legitimately differs; accept any
    // finite structure there.
    if (orbit.preperiod === 0 && st.per !== orbit.period) continue;
    return {
      x1,
      fString: fStringOf(x1),
      critPreperiod: st.pre,
      critPeriod: st.per,
      iterations,
    };
  }
  return null;
}

/** A rigorously-verified mating (its known parameter cross-checks the pullback result). */
export interface CanonicalMating {
  name: string;
  /** The non-basilica parent f_A = z² + cA. */
  cA: Complex;
  /** Parent labels for display. */
  parentA: string;
  parentB: string;
  /** The known mated-map parameter x₁, so tests can assert the pullback reproduces it. */
  x1: Complex;
}

const RT3_2 = Math.sqrt(3) / 2;

/**
 * Matings the engine is verified against (the pullback reproduces `x1` to high precision — see the
 * tests). These are the honest, correct outputs of Stage 1; an arbitrary c_A is a candidate only.
 */
export const CANONICAL_MATINGS: CanonicalMating[] = [
  // Jung, Example 2.5: z²+i (the 1/6 Misiurewicz dendrite) ⊔ basilica → (z²+2)/(z²−1).
  { name: "z²+i ⊔ basilica", cA: [0, 1], parentA: "z²+i", parentB: "basilica", x1: [-2, 0] },
  // Rabbit (centre of the 1/3-bulb) ⊔ basilica → (z² − e^{+2πi/3})/(z²−1); e^{±2πi/3} are the only
  // period-3 values (x₁²+x₁+1=0), and the sibling tracks conj(c_A).
  {
    name: "rabbit ⊔ basilica",
    cA: [-0.12256116687665, 0.74486176661974],
    parentA: "rabbit",
    parentB: "basilica",
    x1: [-0.5, RT3_2],
  },
  {
    name: "corabbit ⊔ basilica",
    cA: [-0.12256116687665, -0.74486176661974],
    parentA: "corabbit",
    parentB: "basilica",
    x1: [-0.5, -RT3_2],
  },
];
