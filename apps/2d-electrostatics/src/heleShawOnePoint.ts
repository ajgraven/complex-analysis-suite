// The Graven–Makarov one-point unbounded-QD family (M4a, the exact spine of the Hele-Shaw "twisting"
// showpiece). A single quadrature node w₀ with a COMPLEX charge α = q + iγ (q = injection rate, γ = spin)
// generates a monotone family {Ω_t} of simply connected unbounded quadrature domains — the growing,
// twisting Hele-Shaw droplet complement. Everything here is CLOSED FORM (`=`): the exact Riemann map,
// the admissible region, the conserved quadrature datum, and the critical (blow-up) time.
//
// Source: A. Graven, thesis §3.3 (Theorem/Corollary 3.3.1, Eqs 3.10–3.11) + the §2.2.3 charge relation;
// Graven–Makarov, *Quadrature Domains and the Faber Transform* (arXiv:2509.03777). Conventions match the
// author's; areas are π-normalized (QD's `dA = dx dy/π`, ADR-0006) so the time t = A(Ω_t)/π.
//
// We fix the normalized node **w₀ = 2** (the frame of the §2.2.3 relation and the QD `unb-1pt-*` presets);
// a general node reduces here by the Eq-3.9 change of variables (a later extension). The charge α is the
// control. Ω_t is the image of the exterior disk 𝔻* = {|z| ≥ 1} under
//
//   φ_t(z) = c·z · [ z − z₀ + (w₀/c)·(|z₀|²−1)/|z₀|² ] / ( z − 1/z̄₀ )                          (Eq 3.10)
//
// with c = c(t) the conformal radius (the time-like parameter, φ_t(z) ~ c·z at ∞), z₀ = z₀(α, c) the
// prevertex, and a single pole at 1/z̄₀ inside 𝔻. As t grows only c grows; the pair (α, w₀) — the
// conserved Hele-Shaw datum — is fixed (recoverCharge pins this exactly).

export type Cx = readonly [re: number, im: number];

const re = (a: Cx): number => a[0];
const add = (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Cx, b: Cx): Cx => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const conj = (a: Cx): Cx => [a[0], -a[1]];
const abs2 = (a: Cx): number => a[0] * a[0] + a[1] * a[1];
const cabs = (a: Cx): number => Math.hypot(a[0], a[1]);
const scale = (a: Cx, s: number): Cx => [a[0] * s, a[1] * s];
const cdiv = (a: Cx, b: Cx): Cx => {
  const d = abs2(b);
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

/** The normalized quadrature node (the family's frame). */
export const W0 = 2;

/** Admissibility (Theorem 3.3.1): QD(α/(w−w₀)) ≠ ∅ ⟺ |w₀|² + 2·Re(α) > 2|α|. At w₀ = 2: 2 + Re(α) > |α|. */
export function admissible(alpha: Cx): boolean {
  return W0 * W0 + 2 * re(alpha) > 2 * cabs(alpha);
}

// --- the prevertex z₀ ---------------------------------------------------------------------------------

// The charge ↔ prevertex relation (§2.2.3), at w₀ = 2:  α = (c·z₀·|z₀|² − 2)(c·z̄₀ − 2) / |z₀|².
// For real α, z₀ is real and this is exactly the Eq-3.11 quartic  c²z₀⁴ − 2c·z₀³ − α·z₀² − 2c·z₀ + 4 = 0.
function chargeOf(z0: Cx, c: number): Cx {
  const z2 = abs2(z0);
  const t1 = sub(scale(mul(z0, [z2, 0]), c), [2, 0]); // c z₀ |z₀|² − 2
  const t2 = sub(scale(conj(z0), c), [2, 0]); // c z̄₀ − 2
  return scale(mul(t1, t2), 1 / z2);
}

/** φ_t(1) for a real prevertex z₀ — the value the Eq-3.11 selector `φ_t(1) < w₀` tests. Real for real z₀
 *  (pole = 1/z₀); singular at z₀ = 1 (the double-point limit). */
function phiAtOne(z0: number, c: number): number {
  const k = (W0 / c) * (z0 * z0 - 1) / (z0 * z0);
  return (c * (1 - z0 + k)) / (1 - 1 / z0); // c·1·(1 − z₀ + k)/(1 − 1/z₀)
}

/** The physical real root ≥ 1 of the Eq-3.11 quartic (real α): the unique root ≥ 1 with φ_t(1) < w₀ (the
 *  thesis's secondary selector — it disambiguates when several roots ≥ 1 exist). Null past the critical
 *  time, where that root collides and leaves the reals (a (3,2)-cusp). */
function realRootGeq1(c: number, a: number): number | null {
  const f = (z: number): number => c * c * z ** 4 - 2 * c * z ** 3 - a * z * z - 2 * c * z + 4;
  const fp = (z: number): number => 4 * c * c * z ** 3 - 6 * c * z * z - 2 * a * z - 2 * c;
  const roots: number[] = [];
  let prev = f(0.01);
  for (let z = 0.02; z <= 80; z += 0.005) {
    const v = f(z);
    if (prev === 0 || prev < 0 !== v < 0) {
      let zr = z - 0.0025;
      for (let i = 0; i < 80; i++) {
        const d = f(zr) / fp(zr);
        zr -= d;
        if (Math.abs(d) < 1e-15) break;
      }
      roots.push(zr);
    }
    prev = v;
  }
  const geq1 = roots.filter((r) => r >= 1 - 1e-9).sort((p, q) => p - q);
  const physical = geq1.filter((r) => phiAtOne(r, c) < W0);
  if (physical.length) return physical[0];
  return geq1.length ? geq1[0] : null; // fall back to the smallest root ≥ 1
}

/** Solve `chargeOf(z₀, c) = α` for the prevertex z₀ by damped 2-D Newton (the relation is non-holomorphic
 *  in z₀), from `seed`. Returns null if it fails to converge (past the critical time / bad seed). */
function newtonZ0(alpha: Cx, c: number, seed: Cx): Cx | null {
  let z0: Cx = seed;
  const h = 1e-7;
  for (let it = 0; it < 200; it++) {
    const r = sub(chargeOf(z0, c), alpha);
    if (cabs(r) < 1e-14) return z0;
    const rx = sub(chargeOf([z0[0] + h, z0[1]], c), alpha);
    const ry = sub(chargeOf([z0[0], z0[1] + h], c), alpha);
    const j00 = (rx[0] - r[0]) / h, j01 = (ry[0] - r[0]) / h;
    const j10 = (rx[1] - r[1]) / h, j11 = (ry[1] - r[1]) / h;
    const det = j00 * j11 - j01 * j10;
    if (Math.abs(det) < 1e-300 || !Number.isFinite(det)) return null;
    const dx = (j11 * r[0] - j01 * r[1]) / det;
    const dy = (-j10 * r[0] + j00 * r[1]) / det;
    z0 = [z0[0] - dx, z0[1] - dy];
    if (!Number.isFinite(z0[0]) || !Number.isFinite(z0[1])) return null;
  }
  return cabs(sub(chargeOf(z0, c), alpha)) < 1e-10 ? z0 : null;
}

/** The prevertex z₀(α, c). Real α uses the exact quartic root ≥ 1; complex α solves the §2.2.3 relation,
 *  seeded either from `seed` (marching in c) or, cold, by continuing in arg(α) from the real |α| root at
 *  the same c. Returns null when no admissible prevertex exists at this c (past the critical time). */
export function solveZ0(alpha: Cx, c: number, seed?: Cx): Cx | null {
  // A seed always marches the current branch by Newton (real α included — the physical root is smooth in
  // c, so seeded continuation avoids the root-identity ambiguity a fresh per-c selection would hit in the
  // transition region where roots merge/leave [≥1]).
  if (seed) return newtonZ0(alpha, c, seed);
  if (Math.abs(alpha[1]) < 1e-12) {
    const r = realRootGeq1(c, alpha[0]);
    return r === null ? null : [r, 0];
  }
  // cold start: continue in arg(α) from the real |α| root at this c.
  const mag = cabs(alpha);
  const base = realRootGeq1(c, mag);
  if (base === null) return null;
  const argTarget = Math.atan2(alpha[1], alpha[0]);
  let z0: Cx = [base, 0];
  const steps = 64;
  for (let s = 1; s <= steps; s++) {
    const th = (argTarget * s) / steps;
    const next = newtonZ0([mag * Math.cos(th), mag * Math.sin(th)], c, z0);
    if (next === null) return null;
    z0 = next;
  }
  return z0;
}

// --- the map φ_t (Eq 3.10) ----------------------------------------------------------------------------

export interface OnePointMap {
  /** The conformal radius (time-like parameter); φ(z) ~ c·z at ∞. */
  readonly c: number;
  /** The prevertex z₀(α, c). */
  readonly z0: Cx;
  /** The single finite pole, at 1/z̄₀ (inside 𝔻). */
  readonly pole: Cx;
  /** φ_t(z), the Riemann map 𝔻* → Ω_t. */
  evalPhi(z: Cx): Cx;
  /** φ'_t(z), the exact derivative. */
  evalPhiPrime(z: Cx): Cx;
}

/** Build φ_t for a given (α, c). Returns null past the critical time (no admissible prevertex). `seed`
 *  passes the previous z₀ when marching c (keeps the complex-α branch continuous). */
export function onePointMap(alpha: Cx, c: number, seed?: Cx): OnePointMap | null {
  const z0 = solveZ0(alpha, c, seed);
  if (z0 === null) return null;
  const z2 = abs2(z0);
  const k = (W0 / c) * (z2 - 1) / z2; // the real constant added in the Eq-3.10 numerator
  const pole = cdiv([1, 0], conj(z0)); // 1 / z̄₀
  // φ(z) = c·z·(z − z₀ + k)/(z − pole). Quotient rule for φ' with N = c·z·(z − z₀ + k), D = z − pole:
  //   N' = c·(2z − z₀ + k),  D' = 1  ⇒  φ' = (N'·D − N·D')/D².
  const evalPhi = (z: Cx): Cx => {
    const numer = add(sub(z, z0), [k, 0]);
    const denom = sub(z, pole);
    return mul(scale(z, c), cdiv(numer, denom));
  };
  const evalPhiPrime = (z: Cx): Cx => {
    const D = sub(z, pole);
    const N = mul(scale(z, c), add(sub(z, z0), [k, 0]));
    const Np = scale(sub(add(scale(z, 2), [k, 0]), z0), c); // c·(2z − z₀ + k)
    return cdiv(sub(mul(Np, D), N), mul(D, D));
  };
  return { c, z0, pole, evalPhi, evalPhiPrime };
}

// --- invariants & diagnostics -------------------------------------------------------------------------

/** The conserved quadrature datum recovered from a map (via the §2.2.3 relation): the charge α it encodes.
 *  It equals the family's input α at EVERY t — the exact Hele-Shaw invariant (only the area grows). */
export function recoverCharge(m: OnePointMap): Cx {
  return chargeOf(m.z0, m.c);
}

/** The π-normalized area t = A(Ω_t)/π (the thesis time parameter). Standard signed area of the bounded
 *  droplet enclosed by φ(∂𝔻), divided by π. */
export function normalizedArea(m: OnePointMap, samples = 4000): number {
  let a = 0;
  let prev = m.evalPhi([1, 0]);
  for (let i = 1; i <= samples; i++) {
    const t = (2 * Math.PI * i) / samples;
    const w = m.evalPhi([Math.cos(t), Math.sin(t)]);
    a += 0.5 * (prev[0] * w[1] - prev[1] * w[0]); // ½ Im(w̄_{i-1} w_i) accumulates the signed area
    prev = w;
  }
  return Math.abs(a) / Math.PI;
}

/** min over |z| = 1 of |φ'(z)| — the cusp gauge (→ 0 at a (3,2)-cusp). */
export function minAbsPhiPrime(m: OnePointMap, samples = 1440): number {
  let mn = Infinity;
  for (let i = 0; i < samples; i++) {
    const t = (2 * Math.PI * i) / samples;
    mn = Math.min(mn, cabs(m.evalPhiPrime([Math.cos(t), Math.sin(t)])));
  }
  return mn;
}

// --- the critical (blow-up) time ----------------------------------------------------------------------

export interface Critical {
  /** The critical conformal radius c*. */
  readonly cStar: number;
  /** The critical (π-normalized) time t* = A(Ω_{t*})/π. */
  readonly tStar: number;
  /** How the family terminates: a self-tangency (α > 0) or a (3,2)-cusp (α < 0 or complex). */
  readonly mechanism: "double-point" | "cusp";
}

/** The critical time at which the family {Ω_t} terminates.
 *  - Real α > 0: a **double point** (self-tangency); closed form c* = w₀ + √α, t* = w₀(w₀ + 2√α).
 *  - Real α < 0 / complex α: a **(3,2)-cusp**; c* is found numerically as the edge where the prevertex
 *    z₀ solution ceases to exist (the selected root collides and leaves the branch). */
export function criticalTime(alpha: Cx): Critical {
  if (!admissible(alpha)) {
    return { cStar: 0, tStar: 0, mechanism: alpha[1] === 0 && alpha[0] > 0 ? "double-point" : "cusp" };
  }
  if (Math.abs(alpha[1]) < 1e-12 && alpha[0] > 0) {
    // Closed form (exact): at c* = w₀+√α the prevertex hits z₀ = 1 (the pole meets ∂𝔻) and ∂Ω self-
    // tangents into a double point. t* = w₀(w₀+2√α); the numeric area is unreliable this close to the
    // pole-on-boundary limit, so we return the closed form.
    const s = Math.sqrt(alpha[0]);
    return { cStar: W0 + s, tStar: W0 * (W0 + 2 * s), mechanism: "double-point" };
  }
  // Cusp: the family occupies a c-interval [c_min, c*] (for negative/complex α there is no domain as
  // c → 0). MARCH c upward, seeding each prevertex from the previous one (the cold arg-continuation is
  // only robust away from the parabola edge), and bisect the UPPER edge — that is c*, where the selected
  // prevertex collides and ∂Ω forms a (3,2)-cusp. `trySolve` prefers the marched seed, falling back to a
  // cold solve so an interior continuation hiccup doesn't read as the edge.
  const trySolve = (c: number, seed: Cx | null): Cx | null =>
    (seed !== null ? solveZ0(alpha, c, seed) : null) ?? solveZ0(alpha, c);
  const step = 0.02;
  let seed: Cx | null = null;
  let lastGood = -1;
  for (let c = step; c <= 20; c += step) {
    const z0 = trySolve(c, seed);
    if (z0 !== null) {
      seed = z0;
      lastGood = c;
    } else if (lastGood >= 0) {
      break; // both the marched and cold solves failed → the true upper edge
    }
  }
  if (lastGood < 0) return { cStar: 0, tStar: 0, mechanism: "cusp" };
  let lo = lastGood;
  let hi = lastGood + step;
  let seedLo = seed;
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    const z0 = trySolve(mid, seedLo);
    if (z0 !== null) {
      lo = mid;
      seedLo = z0;
    } else {
      hi = mid;
    }
  }
  const cStar = lo;
  // The area integral is ill-conditioned exactly at the near-singular cusp edge, so evaluate it a hair
  // inside c* (area is continuous, and a cusp t* is an `≈` quantity — the ill-posed edge, RISKS §3).
  const map = onePointMap(alpha, cStar * (1 - 1e-3), seedLo ?? undefined);
  const tStar = map ? normalizedArea(map) : 0;
  return { cStar, tStar, mechanism: "cusp" };
}

// --- the growing family (for animation) ---------------------------------------------------------------

export interface Frame {
  /** The conformal radius at this frame. */
  readonly c: number;
  /** The π-normalized area t = A(Ω_t)/π at this frame. */
  readonly t: number;
  /** The Riemann map φ_t. */
  readonly map: OnePointMap;
}

/** Build the growing family {Ω_t} as an ordered sequence of frames from birth (t → 0) up to just before
 *  the critical time — the animation timeline. The physical prevertex z₀ grows without bound as c → 0
 *  (an empty droplet), so we ANCHOR at c just below c* — where z₀ is small and unambiguous for every
 *  family — and MARCH the branch DOWNWARD with seeded continuation, then reverse into increasing-t order.
 *  Returns [] when α is inadmissible. */
export function buildFamily(alpha: Cx, frames = 60): { frames: Frame[]; critical: Critical } {
  const critical = criticalTime(alpha);
  if (!admissible(alpha) || critical.cStar <= 0) return { frames: [], critical };
  const cHi = critical.cStar * (1 - 1e-3);
  const cLo = cHi * 0.06; // a small droplet — but not so small that z₀ → ∞ makes the area quadrature noisy
  let seed = solveZ0(alpha, cHi); // cold-anchored at the well-behaved large-c end
  if (seed === null) return { frames: [], critical };
  const collected: Frame[] = [];
  const n = Math.max(2, frames);
  for (let i = 0; i < n; i++) {
    const c = cHi - ((cHi - cLo) * i) / (n - 1); // march c downward
    const map = onePointMap(alpha, c, seed ?? undefined);
    if (map === null) continue;
    seed = map.z0;
    collected.push({ c, t: normalizedArea(map), map });
  }
  collected.reverse(); // birth (small c, small t) → critical time (large c)
  return { frames: collected, critical };
}
