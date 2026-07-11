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
import { makeDurandKerner, tupleAlgebra } from "@cas/core";
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
  // Clamp each radicand to ≥ 0: for a (near-)negative real, (r ± Re z)/2 can round a hair below 0 in
  // float64 (hypot's r landing just under |Re z|) → Math.sqrt(NaN). The suite's canonical principal-√
  // copies (@cas/expr complexJs, correspondence.ts, the GLSL csqrt) clamp for exactly this. (Review XCUT-numeric-02)
  const re = Math.sqrt(Math.max((r + p[0]) / 2, 0));
  const im = Math.sqrt(Math.max((r - p[0]) / 2, 0));
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

// ===================================================================================================
// GENERAL SECOND PARENT — mate two arbitrary **hyperbolic** PCF quadratics f_A = z²+c_A ⊔ f_B = z²+c_B
// (the basilica path above hardcodes c_B = −1). The closed form g(z) = (z²−x₁)/(z²−1) bakes the basilica
// in: it pins B's period-2 cycle to {∞,1}, so x₁ = cv_A is the single free parameter. For a general B,
// BOTH critical values are free, so we use the **Boyd–Henriksen normal form** (arXiv:1102.5047):
//
//     F_{u,v}(z) = (v(u−1)z² − u(v−1)) / ((u−1)z² − (v−1)),
//
// which has critical points 0, ∞ and fixes 1, with F(0)=u, F(∞)=v the two free critical values (u = the
// A-side critical value, v = the B-side). The pullback now tracks BOTH parents' postcritical marked
// points — the A-orbit closes onto the critical point 0, the B-orbit onto ∞ — iterating each toward its
// predecessor under F⁻¹ (two roots; sign by nearest-continuity), with the canonical **conjugated-A /
// as-is-B** seed realising the θ↦−θ gluing.
//
// TRUSTWORTHINESS (never silently wrong — the north-star):
//  • **Obstruction** is gated by the **Tan Lei criterion** ({@link mateableLimbs}): two bulbs of the
//    main cardioid mate iff they are NOT in conjugate limbs (p₁/q₁ + p₂/q₂ ≠ 1). With the canonical
//    seed the pullback additionally *diverges* for an obstructed pair, so obstruction is caught twice.
//  • **Basin selection** is the fragile part (a single seed can land a spurious period-valid map). We
//    resolve it by a **swap-consistency** gate: the true mating's frame is order-independent up to the
//    Möbius swap z↦1/z, which sends (u,v)↦(1/v,1/u). So we gather period-validated candidates from both
//    argument orders and accept only the map whose swapped partner appears in the opposite order — which
//    for a **diagonal** mating A⊔A reduces to the exact structural identity **u·v = 1**. No consensus ⇒
//    honest null.
//
// Oracles (see the tests): rabbit ⊔ basilica through this engine equals the shipped (z²−ω)/(z²−1) up to
// Möbius (same multiplier invariant {@link mapInvariant}); every diagonal A⊔A satisfies u·v=1; the
// argument orders are consistent under (u,v)↦(1/v,1/u); conjugate-limb bulbs are refused.
// Scope: hyperbolic both parents. A Misiurewicz second parent and the full slow-mating homotopy remain
// deferred (the existing {@link mateWithBasilica} still handles the curated Misiurewicz ⊔ basilica set).

const cinv = (p: Complex): Complex => cdiv(ONE, p);

/** A mating of two hyperbolic PCF quadratics (general second parent), as a Boyd–Henriksen F_{u,v}. */
export interface GeneralMating {
  /** The A-side critical value u = F(0) in the Boyd–Henriksen frame. */
  u: Complex;
  /** The B-side critical value v = F(∞) in the Boyd–Henriksen frame. */
  v: Complex;
  /** The mated quadratic rational map, render-ready: (v·z² − u·k)/(z² − k), k = (v−1)/(u−1). */
  fString: string;
  /** Critical period realising the first parent f_A (the critical point 0). */
  periodA: number;
  /** Critical period realising the second parent f_B (the critical point ∞). */
  periodB: number;
}

/** F_{u,v}(z) = (v(u−1)z² − u(v−1)) / ((u−1)z² − (v−1)); crit pts 0,∞; F(0)=u, F(∞)=v, F(1)=1. */
function fuvEval(u: Complex, v: Complex): (z: Complex) => Complex {
  const um1 = csub(u, ONE);
  const vm1 = csub(v, ONE);
  return (z) => {
    const z2 = cmul(z, z);
    return cdiv(csub(cmul(cmul(v, um1), z2), cmul(u, vm1)), csub(cmul(um1, z2), vm1));
  };
}

/**
 * The principal (+) square-root preimage of `w` under F_{u,v}: z² = (v−1)(u−w) / [(u−1)(v−w)]. The
 * symbol "inf" requests the preimage of ∞ (the pole), z² = (v−1)/(u−1). The caller picks the ± branch.
 */
function fuvInvRoot(w: Complex | "inf", u: Complex, v: Complex): Complex {
  const um1 = csub(u, ONE);
  const vm1 = csub(v, ONE);
  const z2 = w === "inf" ? cdiv(vm1, um1) : cdiv(cmul(vm1, csub(u, w)), cmul(um1, csub(v, w)));
  return csqrt(z2);
}

const GEN_MAX_ITERS = 3000;

/**
 * The marked-point pullback for two parents: iterate the A-orbit (closing onto the critical point 0) and
 * the B-orbit (closing onto ∞) toward their predecessors under F⁻¹, sign by continuity. u = xa[0] and
 * v = xb[0] (the two critical values) drive F each step. Returns the converged (u,v), or null on blow-up.
 */
function pullbackGeneral(
  orbA: PostcriticalOrbit,
  orbB: PostcriticalOrbit,
  seedA: Complex[],
  seedB: Complex[],
): { u: Complex; v: Complex } | null {
  const xa = seedA.map((p): Complex => [p[0], p[1]]);
  const xb = seedB.map((p): Complex => [p[0], p[1]]);
  for (let it = 0; it < GEN_MAX_ITERS; it++) {
    const u = xa[0];
    const v = xb[0];
    const na = xa.map((_, i): Complex => {
      const s = orbA.succ[i];
      return branch(fuvInvRoot(s < 0 ? ZERO : xa[s], u, v), xa[i]); // A closes onto crit point 0
    });
    const nb = xb.map((_, i): Complex => {
      const s = orbB.succ[i];
      return branch(fuvInvRoot(s < 0 ? "inf" : xb[s], u, v), xb[i]); // B closes onto crit point ∞
    });
    let delta = 0;
    for (let i = 0; i < xa.length; i++) delta += cdist(na[i], xa[i]);
    for (let i = 0; i < xb.length; i++) delta += cdist(nb[i], xb[i]);
    for (let i = 0; i < xa.length; i++) xa[i] = na[i];
    for (let i = 0; i < xb.length; i++) xb[i] = nb[i];
    if (!Number.isFinite(delta)) return null; // obstructed / degenerate seed
    if (delta < CONVERGE_TOL) break;
  }
  return { u: xa[0], v: xb[0] };
}

/** The (pre)period of the critical point 0 under F_{u,v} (realising f_A); null if it blows up. */
function fuvPeriod0(u: Complex, v: Complex): { pre: number; per: number } | null {
  const F = fuvEval(u, v);
  const seq: Complex[] = [ZERO];
  let z: Complex = ZERO;
  for (let i = 0; i < 80; i++) {
    z = F(z);
    if (!Number.isFinite(z[0]) || Math.hypot(z[0], z[1]) > 1e7) return null;
    seq.push(z);
  }
  for (let per = 1; per <= 14; per++)
    for (let pre = 0; pre + per < seq.length - 1; pre++)
      if (cdist(seq[seq.length - 1], seq[seq.length - 1 - per]) < 1e-6 && cdist(seq[pre], seq[pre + per]) < 1e-5)
        return { pre, per };
  return null;
}

/**
 * The (pre)period of the critical point ∞ under F_{u,v} (realising f_B). ∞ is tracked as a symbol: F(∞)=v
 * starts the orbit, and a pole (den (u−1)z²−(v−1) ≈ 0) sends the orbit back to ∞. Null if it blows up.
 */
function fuvPeriodInf(u: Complex, v: Complex): { pre: number; per: number } | null {
  const F = fuvEval(u, v);
  const um1 = csub(u, ONE);
  const vm1 = csub(v, ONE);
  const seq: (Complex | "inf")[] = ["inf", [v[0], v[1]]];
  let z: Complex = [v[0], v[1]];
  for (let i = 0; i < 80; i++) {
    const den = csub(cmul(um1, cmul(z, z)), vm1);
    if (Math.hypot(den[0], den[1]) < 1e-7) {
      seq.push("inf");
      z = [v[0], v[1]];
      seq.push([v[0], v[1]]); // ∞ → F(∞) = v
    } else {
      z = F(z);
      seq.push([z[0], z[1]]);
    }
    if (Math.hypot(z[0], z[1]) > 1e8) return null;
  }
  const eq = (a: Complex | "inf", b: Complex | "inf"): boolean =>
    a === "inf" || b === "inf" ? a === b : cdist(a, b) < 1e-5;
  for (let per = 1; per <= 14; per++)
    for (let pre = 0; pre + 2 * per < seq.length; pre++)
      if (eq(seq[pre], seq[pre + per]) && eq(seq[pre + per], seq[pre + 2 * per])) return { pre, per };
  return null;
}

/** Horner evaluation of a complex polynomial given low-to-high coefficients. */
function polyEval(coeff: Complex[], z: Complex): Complex {
  let s: Complex = ZERO;
  for (let k = coeff.length - 1; k >= 0; k--) s = cadd(cmul(s, z), coeff[k]);
  return s;
}

// @cas/core's generic Weierstrass kernel — the FIFTH copy of this iteration, consolidated here (the other
// four already import it: CD critical.ts, QD faber-analysis / direct-common, correspondences deltoid).
const durandKernerKernel = makeDurandKerner(tupleAlgebra);

/**
 * Durand–Kerner roots of a complex polynomial (low-to-high coefficients); used for fixed points.
 * Delegates to the shared kernel with `onCoincident:"skip"` — the collision guard this hand-rolled copy
 * LACKED: for a rational map with (near-)coincident fixed points (a parabolic / degenerate cubic — exactly
 * the parabolic centres this mating code targets), the old ∏_{j≠i}(z_i−z_j)→0 divided into a NaN and
 * silently corrupted the multiplier invariant. The kernel skips the collided update instead. Generic
 * well-separated cubics are unchanged (same monic normalization, same lattice seed, same in-place Seidel
 * update, well-converged tol). (Review XCUT-numeric-01)
 */
function durandKerner(coeff: Complex[]): Complex[] {
  const n = coeff.length - 1;
  const lead = coeff[n];
  const c = coeff.map((k) => cdiv(k, lead)); // monic
  const seeds: Complex[] = [];
  for (let i = 0; i < n; i++)
    seeds.push([Math.cos(0.7 * i + 0.3) * (1 + 0.2 * i), Math.sin(0.7 * i + 0.3) * (1 + 0.2 * i)]);
  const res = durandKernerKernel((z) => polyEval(c, z), seeds, {
    mode: "seidel",
    onCoincident: "skip",
    tol: 1e-14,
    maxIter: 800,
  });
  // onCoincident:"skip" keeps every iterate finite (no bailOnNonFinite), so the kernel always returns a
  // result; `seeds` is an unreachable, finite fallback that satisfies the return type.
  return res ? res.roots : seeds;
}

/**
 * The **multiplier invariant** (σ₁, σ₂) of a degree-2 rational map P(z)/Q(z) (low-to-high complex
 * coefficient arrays): the elementary symmetric functions of the multipliers at its three fixed points.
 * This is a complete conjugacy invariant for a generic quadratic rational map (Milnor), so two maps with
 * equal (σ₁, σ₂) are Möbius-conjugate — the basis of the reduction oracle in the tests.
 */
export function rationalInvariant(P: Complex[], Q: Complex[]): { s1: Complex; s2: Complex } {
  // fixed points solve P(z) − z·Q(z) = 0 (a cubic).
  const cub: Complex[] = [P[0], csub(P[1], Q[0]), csub(P[2], Q[1]), csub(ZERO, Q[2])];
  const fps = durandKerner(cub);
  const Pd: Complex[] = [P[1], cmul([2, 0], P[2])];
  const Qd: Complex[] = [Q[1], cmul([2, 0], Q[2])];
  const lam = fps.map((z): Complex => {
    const p = polyEval(P, z);
    const q = polyEval(Q, z);
    const pd = polyEval(Pd, z);
    const qd = polyEval(Qd, z);
    return cdiv(csub(cmul(pd, q), cmul(p, qd)), cmul(q, q)); // R'(z) = (P'Q − PQ')/Q²
  });
  return {
    s1: cadd(cadd(lam[0], lam[1]), lam[2]),
    s2: cadd(cadd(cmul(lam[0], lam[1]), cmul(lam[0], lam[2])), cmul(lam[1], lam[2])),
  };
}

/** The multiplier invariant (σ₁, σ₂) of the Boyd–Henriksen map F_{u,v} (see {@link rationalInvariant}). */
export function mapInvariant(u: Complex, v: Complex): { s1: Complex; s2: Complex } {
  const um1 = csub(u, ONE);
  const vm1 = csub(v, ONE);
  const P: Complex[] = [csub(ZERO, cmul(u, vm1)), ZERO, cmul(v, um1)];
  const Q: Complex[] = [csub(ZERO, vm1), ZERO, um1];
  return rationalInvariant(P, Q);
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * The **Tan Lei mateability criterion** for two satellite bulbs p₁/q₁, p₂/q₂ of the main cardioid: they
 * mate iff they are NOT in complex-conjugate limbs of M, i.e. p₁/q₁ + p₂/q₂ ≠ 1 (Rees–Shishikura–Tan).
 */
export function mateableLimbs(p1: number, q1: number, p2: number, q2: number): boolean {
  const g1 = gcd(p1, q1);
  const g2 = gcd(p2, q2);
  const a1 = p1 / g1;
  const b1 = q1 / g1;
  const a2 = p2 / g2;
  const b2 = q2 / g2;
  return a1 * b2 + a2 * b1 !== b1 * b2; // p₁/q₁ + p₂/q₂ ≠ 1
}

// The seed sweep for the general pullback: scales × {conjugated-postcritical seed, generic seed}. Broad
// enough that the true mating is reached from both argument orders for periods up to ~7 (see the de-risk).
const GEN_SEED_SCALES = [0.5, 0.8, 1.1, 1.5, 2.0, 2.6];

/** Period-validated candidate maps (u,v) from the seed sweep — crit 0 realises f_A, crit ∞ realises f_B. */
function generalCandidates(
  orbA: PostcriticalOrbit,
  orbB: PostcriticalOrbit,
  qA: number,
  qB: number,
): Complex[][] {
  const out: Complex[][] = [];
  for (const sa of GEN_SEED_SCALES)
    for (const sb of GEN_SEED_SCALES)
      for (const ph of [0, 1]) {
        const seedA = orbA.orbit.map((p, i): Complex =>
          ph ? [sa * Math.cos(1 + i), sa * Math.sin(1 + i)] : [sa * p[0], -sa * p[1]],
        );
        const seedB = orbB.orbit.map((p, i): Complex =>
          ph ? [sb * Math.cos(2 + i), sb * Math.sin(2 + i)] : [sb * p[0], sb * p[1]],
        );
        const r = pullbackGeneral(orbA, orbB, seedA, seedB);
        if (!r || !Number.isFinite(r.u[0])) continue;
        if (cdist(r.u, ONE) < 1e-3 || cdist(r.v, ONE) < 1e-3) continue; // degenerate (u or v = 1)
        const c0 = fuvPeriod0(r.u, r.v);
        const cI = fuvPeriodInf(r.u, r.v);
        if (!c0 || c0.pre !== 0 || c0.per !== qA || !cI || cI.pre !== 0 || cI.per !== qB) continue;
        out.push([r.u, r.v]);
      }
  return out;
}

/**
 * Mate two **hyperbolic** PCF quadratics f_A = z²+c_A ⊔ f_B = z²+c_B via the Boyd–Henriksen F_{u,v}
 * pullback, returning the mated quadratic rational map — or null when no trustworthy map is found
 * (non-PCF / Misiurewicz parent, obstruction, or no swap-consistent basin).
 *
 * Basin selection is by **swap consistency**: the true mating is order-independent up to z↦1/z (which
 * sends (u,v)↦(1/v,1/u)), so a candidate is accepted only when its swapped partner appears among the
 * opposite-order candidates — for a diagonal mating A⊔A this is exactly u·v=1. The most-agreed candidate
 * wins; if none is swap-consistent the result is null (never a silently-wrong map).
 */
export function generalMate(cA: Complex, cB: Complex): GeneralMating | null {
  const orbA = postcriticalOrbit(cA);
  const orbB = postcriticalOrbit(cB);
  if (!orbA || !orbB || orbA.preperiod !== 0 || orbB.preperiod !== 0) return null; // hyperbolic scope
  const qA = orbA.period;
  const qB = orbB.period;
  const diagonal = cdist(cA, cB) < 1e-12;
  const ab = generalCandidates(orbA, orbB, qA, qB);
  const ba = diagonal ? ab : generalCandidates(orbB, orbA, qB, qA);
  const tally: { u: Complex; v: Complex; n: number }[] = [];
  for (const [u, v] of ab) {
    const pu = cinv(v); // swap partner (1/v, 1/u)
    const pv = cinv(u);
    const consistent = diagonal
      ? cdist(pu, u) < 3e-3 && cdist(pv, v) < 3e-3 // self-swap ⇒ u·v = 1
      : ba.some(([ju, jv]) => cdist(ju, pu) < 3e-3 && cdist(jv, pv) < 3e-3);
    if (!consistent) continue;
    const t = tally.find((e) => cdist(e.u, u) < 3e-3 && cdist(e.v, v) < 3e-3);
    if (t) t.n++;
    else tally.push({ u, v, n: 1 });
  }
  tally.sort((a, b) => b.n - a.n);
  const win = tally[0];
  if (!win) return null;
  return {
    u: win.u,
    v: win.v,
    fString: generalMatedFString(win.u, win.v),
    periodA: qA,
    periodB: qB,
  };
}

/**
 * Mate the p₁/q₁ satellite bulb with the p₂/q₂ satellite bulb (both period-q centres). Refuses conjugate
 * limbs up front (Tan Lei, {@link mateableLimbs}) and otherwise runs {@link generalMate} on the bulb
 * centres — so it returns the mated map for a mateable pair or null when obstructed / not computable.
 */
export function mateBulbs(p1: number, q1: number, p2: number, q2: number): GeneralMating | null {
  if (!mateableLimbs(p1, q1, p2, q2)) return null; // obstructed: conjugate limbs
  return generalMate(bulbCenter(p1, q1), bulbCenter(p2, q2));
}

/** Render a complex number as an f-string coefficient literal, always parenthesised (e.g. "(0.5-0.3*i)"). */
function coefStr(a: Complex): string {
  if (Math.abs(a[1]) < 1e-12) return `(${fmt(a[0])})`;
  return `(${fmt(a[0])}${a[1] >= 0 ? "+" : ""}${fmt(a[1])}*i)`;
}

/**
 * The mated map of a general mating as a render-ready f-string in the reduced Boyd–Henriksen form
 * F(z) = (v·z² − u·k) / (z² − k), with k = (v−1)/(u−1) (monic denominator).
 */
export function generalMatedFString(u: Complex, v: Complex): string {
  const k = cdiv(csub(v, ONE), csub(u, ONE));
  const uk = cmul(u, k);
  return `(${coefStr(v)}*z^2 - ${coefStr(uk)})/(z^2 - ${coefStr(k)})`;
}
