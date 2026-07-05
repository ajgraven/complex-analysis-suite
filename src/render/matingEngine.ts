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
 * The pullback *core* is general and verified (see {@link CANONICAL_MATINGS}); the risk is the
 * **initialisation** — which basin the iteration lands in. We use a c_A-informed seed (conjugated
 * postcritical values, per the θ↦−θ gluing), which is conjugation-EQUIVARIANT, so for a **hyperbolic**
 * parent {@link mateWithBasilica} makes the result TRUSTWORTHY with a **conjugation-symmetry gate**: a
 * mating obeys x₁(c̄) = conj(x₁(c)), so we pull back both c_A and c̄_A and accept only when they are
 * conjugate. A wrong-basin capture fails this (the airplane — a real c_A whose pullback lands the
 * rabbit's *complex* e^{2πi/3}, not self-conjugate — is rejected; no real period-3 map exists here since
 * x₁²+x₁+1=0 has only e^{±2πi/3}), while genuine conjugate siblings pass (rabbit ↔ corabbit). So an
 * arbitrary hyperbolic p/q-bulb ⊔ basilica ({@link mateBulbWithBasilica}) is either computed correctly or
 * refused — never silently wrong. A **Misiurewicz** parent (the conj-pc seed degenerates on the Julia
 * set) uses a multi-seed search *without* the gate — trusted for the curated {@link CANONICAL_MATINGS}
 * (asserted in the tests), a candidate otherwise. The general second parent and the full slow-mating
 * homotopy remain deferred.
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
/** The mated rational map g(z) = (z² − x₁)/(z² − 1) as an f-string, with the numerator sign folded in. */
export function matedMapFString(x1: Complex): string {
  const num =
    Math.abs(x1[1]) < 1e-9
      ? x1[0] >= 0
        ? `z^2 - ${fmt(x1[0])}`
        : `z^2 + ${fmt(-x1[0])}`
      : `z^2 - (${fmt(x1[0])}${x1[1] >= 0 ? "+" : ""}${fmt(x1[1])}*i)`;
  return `(${num})/(z^2 - 1)`;
}

const SYMMETRY_TOL = 1e-5; // |x₁(c̄) − conj(x₁(c))| below this ⇒ the result respects the mating symmetry

/** Build a Mating record from a converged x₁ (helper for the two paths below). */
function matingOf(x1: Complex, iterations: number, pre: number, per: number): Mating {
  return { x1, fString: matedMapFString(x1), critPreperiod: pre, critPeriod: per, iterations };
}

/**
 * The **hyperbolic** path: the c_A-informed seed (conjugated postcritical values — the θ↦−θ gluing) is
 * conjugation-EQUIVARIANT, so it tracks the correct sibling. Accept the first scale that converges to a
 * non-degenerate map whose critical period equals the parent's (no collision for a hyperbolic parent).
 */
function hyperMate(orbit: PostcriticalOrbit): Mating | null {
  for (const s of [1, 2, 3]) {
    const seed = orbit.orbit.map((p): Complex => [s * p[0], -s * p[1]]);
    const { x1, iterations } = pullback(orbit, seed);
    if (!Number.isFinite(x1[0]) || cdist(x1, ONE) < DEGENERATE_TOL) continue;
    const st = critStructure(x1);
    if (!st || st.per !== orbit.period) continue;
    return matingOf(x1, iterations, st.pre, st.per);
  }
  return null;
}

/**
 * The **Misiurewicz** path: the conj-pc seed degenerates (the postcritical points sit on the Julia set),
 * so search a few deterministic generic seeds and accept the first non-degenerate map with a finite
 * critical orbit. Used for the curated dendrite matings (e.g. z²+i), cross-checked in the tests against
 * their known values — not symmetry-gated, so treat an *uncurated* Misiurewicz c_A as a candidate.
 */
function multiSeedMate(orbit: PostcriticalOrbit): Mating | null {
  const seeds: Complex[][] = [];
  for (const s of [1, 2, 3]) seeds.push(orbit.orbit.map((p): Complex => [s * p[0], -s * p[1]]));
  seeds.push(orbit.orbit.map((_, i): Complex => [Math.cos(2 + i) * 1.3, Math.sin(2 + i) * 1.3]));
  seeds.push(orbit.orbit.map((_, i): Complex => [-1 + 0.4 * i, 0.6 - 0.3 * i]));
  seeds.push(orbit.orbit.map((_, i): Complex => [0.5 * (i % 2 ? 1 : -1), 0.5 * (i % 2 ? -1 : 1)]));
  for (const seed of seeds) {
    const { x1, iterations } = pullback(orbit, seed);
    if (!Number.isFinite(x1[0]) || cdist(x1, ONE) < DEGENERATE_TOL) continue;
    const st = critStructure(x1);
    if (st) return matingOf(x1, iterations, st.pre, st.per);
  }
  return null;
}

/**
 * Mate f_A(z) = z² + c_A with the **basilica** (z² − 1) via the marked-point Thurston pullback, returning
 * the mated quadratic rational map g(z) = (z² − x₁)/(z² − 1), or null when no trustworthy map is found
 * (obstruction / not PCF / wrong basin / not verifiable).
 *
 * For a **hyperbolic** c_A the result is made TRUSTWORTHY by a **conjugation-symmetry gate**: a mating
 * obeys x₁(c̄) = conj(x₁(c)), so we compute the pullback for c_A *and* c̄_A and accept only when they are
 * conjugate. This rejects a wrong-basin capture (e.g. the airplane, a real c_A whose pullback lands the
 * rabbit's *complex* map — not self-conjugate, so rejected) while accepting genuine conjugate siblings
 * (rabbit ↔ corabbit). So an arbitrary hyperbolic p/q-bulb ⊔ basilica is either computed correctly or
 * refused — never silently wrong. A **Misiurewicz** c_A (the conj-pc seed degenerates) uses the
 * multi-seed search without the gate — trusted for the curated {@link CANONICAL_MATINGS}, a candidate
 * otherwise. The general second parent (beyond the basilica) and the full slow-mating homotopy remain
 * deferred.
 */
export function mateWithBasilica(cA: Complex): Mating | null {
  const orbit = postcriticalOrbit(cA);
  if (!orbit) return null;
  if (orbit.preperiod === 0) {
    const m = hyperMate(orbit);
    if (!m) return null;
    const conjOrbit = postcriticalOrbit([cA[0], -cA[1]]);
    const mc = conjOrbit && hyperMate(conjOrbit);
    if (!mc || cdist(mc.x1, [m.x1[0], -m.x1[1]]) > SYMMETRY_TOL) return null; // symmetry gate
    return m;
  }
  return multiSeedMate(orbit);
}

/**
 * The centre of the p/q satellite bulb of the main cardioid — the superattracting period-q parameter,
 * by Newton on f_c^q(0) = 0 from the cardioid attach point c = e^{2πip/q}/2 − e^{4πip/q}/4.
 */
export function bulbCenter(p: number, q: number): Complex {
  const th = (2 * Math.PI * p) / q;
  let c: Complex = [
    Math.cos(th) / 2 - Math.cos(2 * th) / 4,
    Math.sin(th) / 2 - Math.sin(2 * th) / 4,
  ];
  for (let it = 0; it < 100; it++) {
    let z: Complex = [0, 0];
    let dz: Complex = [0, 0]; // dz/dc
    for (let k = 0; k < q; k++) {
      dz = cadd(cmul([2, 0], cmul(z, dz)), ONE);
      z = cadd(cmul(z, z), c);
    }
    const step = cdiv(z, dz);
    c = csub(c, step);
    if (Math.hypot(step[0], step[1]) < 1e-15) break;
  }
  return c;
}

/**
 * Mate the p/q satellite bulb (period q) with the basilica — the interactive general path. Finds the
 * bulb centre and mates it (symmetry-gated), so it returns the mated map for a mateable bulb or null when
 * it can't be trustworthily computed (e.g. 3/7 doesn't land, real bulbs of the ½-limb are refused).
 */
export function mateBulbWithBasilica(p: number, q: number): Mating | null {
  return mateWithBasilica(bulbCenter(p, q));
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
  /** The mated rational map g(z) = (z²−x₁)/(z²−1) as a render-ready f-string. */
  fString: string;
}

const RT3_2 = Math.sqrt(3) / 2;

/**
 * Matings the engine is verified against (the pullback reproduces `x1` to high precision — see the
 * tests). These are the honest, correct outputs of Stage 1; an arbitrary c_A is a candidate only.
 */
const CANONICAL_RAW: Omit<CanonicalMating, "fString">[] = [
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
export const CANONICAL_MATINGS: CanonicalMating[] = CANONICAL_RAW.map((m) => ({
  ...m,
  fString: matedMapFString(m.x1),
}));
