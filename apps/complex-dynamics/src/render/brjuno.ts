/**
 * brjuno.ts — continued fractions and the Brjuno / Diophantine arithmetic that decides
 * whether an irrationally-indifferent fixed point carries a Siegel disc.
 *
 * For a quadratic germ f(z) = e^{2πiθ}·z + O(z²), Yoccoz's theorem says the map is
 * linearizable — i.e. a Siegel disc exists — **iff θ is a Brjuno number**:
 *
 *     B(θ) = Σ_{n≥0} log(q_{n+1}) / q_n  <  ∞,
 *
 * where pₙ/qₙ are the convergents of the continued fraction θ = [a₀; a₁, a₂, …]. A larger
 * Brjuno sum means a smaller disc: log r(θ) ≈ −B(θ) + O(1) (Yoccoz; Buff–Chéritat), with
 * r(θ) the conformal radius of the Siegel disc.
 *
 * Numerical reality: every IEEE-754 double is rational, so we can never *prove* a value
 * irrational. We expand the continued fraction only to the reliability horizon of a double
 * (convergent denominators up to ~1e7, beyond which the tail is rounding noise) and then
 * *interpret* the result for a UI label — a clean low-order termination ⇒ rational
 * (parabolic); uniformly small partial quotients ⇒ bounded type (the nicest discs, whose
 * boundary is a quasicircle through the critical point); a huge partial quotient ⇒ a
 * near-Cremer value with a negligibly small (or absent) disc. The caller is responsible for
 * first establishing that |λ| = 1 (see the inspector's indifferent branch).
 *
 * Pure module — no DOM / GL. See FEATURE_RESEARCH.md §1.3 / §5.1.
 */

/** A continued-fraction expansion with its convergent denominators. */
export interface ContinuedFraction {
  /** Partial quotients [a₀, a₁, …]; a₀ = ⌊x⌋ (0 for a rotation number in [0,1)). */
  terms: number[];
  /** Convergent denominators q₀, q₁, … (q₀ = 1 always). */
  denominators: number[];
  /** True if the expansion terminated exactly — x is, to working precision, rational. */
  terminated: boolean;
}

export type RotationKind = "rational" | "bounded" | "brjuno" | "cremer";

/** A UI-facing verdict on a rotation number θ = arg(λ)/2π. */
export interface RotationClass {
  kind: RotationKind;
  cf: ContinuedFraction;
  /** Partial Brjuno sum Σ log(q_{n+1})/q_n over the reliable convergents. */
  brjunoSum: number;
  /** Largest partial quotient aₙ (n ≥ 1); small ⇒ bounded type, huge ⇒ near-Cremer. */
  maxTerm: number;
  /** Estimated conformal radius of the Siegel disc ≈ exp(−B(θ)); 0 for rational / Cremer. */
  conformalRadius: number;
}

/** A double's continued fraction is trustworthy only while qₙ stays well below 1/√ε ≈ 1e8;
 *  past ~1e7 the partial quotients are representation noise, so we stop accumulating there. */
const DEFAULT_Q_LIMIT = 1e7;
const DEFAULT_MAX_TERMS = 64;
/** Absolute remainder below which x is treated as exactly rational (terminate the CF). Set
 *  below the ~1e-11 remainder a genuine Cremer-sized partial quotient produces, but above the
 *  ~1e-15 cancellation of a true low-order rational, so the two are not confused. */
const RATIONAL_TOL = 1e-13;
/** A partial quotient ≤ this (for all n ≥ 1) ⇒ "bounded type". Heuristic for labelling. */
const BOUNDED_MAX_TERM = 25;
/** Brjuno sum above this ⇒ disc radius ≲ e⁻²⁵ ≈ 1e-11, i.e. effectively no disc ("cremer"). */
const CREMER_SUM = 25;

/**
 * Continued-fraction expansion of `x` with its convergent denominators, computed until the
 * remainder is negligible (rational), qₙ exceeds the precision horizon, or `maxTerms` is hit.
 * The convergent recurrence qₙ = aₙ·q_{n-1} + q_{n-2} is seeded q₋₁ = 0, q₋₂ = 1.
 */
export function continuedFraction(
  x: number,
  qLimit = DEFAULT_Q_LIMIT,
  maxTerms = DEFAULT_MAX_TERMS,
): ContinuedFraction {
  const terms: number[] = [];
  const denominators: number[] = [];
  let qPrev = 0; // q_{-1}
  let qPrevPrev = 1; // q_{-2}
  let frac = x;
  let terminated = false;
  for (let n = 0; n < maxTerms; n++) {
    const a = Math.floor(frac);
    const q = a * qPrev + qPrevPrev; // = 1 at n = 0 (a₀·0 + 1)
    terms.push(a);
    denominators.push(q);
    qPrevPrev = qPrev;
    qPrev = q;
    const r = frac - a;
    if (r <= RATIONAL_TOL) {
      terminated = true;
      break;
    }
    if (q > qLimit) break; // the crossing term is already recorded above
    frac = 1 / r;
  }
  return { terms, denominators, terminated };
}

/** Evaluate a finite continued fraction [a₀; a₁, …] back to a real number (exact, for tests
 *  and for generating known Siegel/Cremer rotation numbers). */
export function fromContinuedFraction(terms: number[]): number {
  if (terms.length === 0) return 0;
  let x = terms[terms.length - 1];
  for (let i = terms.length - 2; i >= 0; i--) x = terms[i] + 1 / x;
  return x;
}

/** Partial Brjuno sum B(θ) = Σ log(q_{n+1})/q_n over the available convergents. */
export function brjunoSum(cf: ContinuedFraction): number {
  const q = cf.denominators;
  let sum = 0;
  for (let n = 0; n + 1 < q.length; n++) sum += Math.log(q[n + 1]) / q[n];
  return sum;
}

/**
 * Classify a rotation number θ = arg(λ)/2π for a UI label (rational / bounded / brjuno /
 * cremer), with the Brjuno sum and an estimated Siegel-disc conformal radius. θ is reduced
 * to its fractional part first. The kind is a *heuristic* interpretation of the
 * double-precision continued fraction — not a rigorous arithmetic classification (see the
 * module header on why that is impossible at f64).
 */
export function classifyRotationNumber(theta: number): RotationClass {
  const t = theta - Math.floor(theta); // fractional part → [0, 1)
  const cf = continuedFraction(t);
  const sum = brjunoSum(cf);
  const tail = cf.terms.slice(1); // drop a₀ (= 0 for a rotation number)
  const maxTerm = tail.length > 0 ? Math.max(...tail) : 0;

  let kind: RotationKind;
  if (cf.terminated) kind = "rational";
  else if (sum > CREMER_SUM) kind = "cremer";
  else if (maxTerm <= BOUNDED_MAX_TERM) kind = "bounded";
  else kind = "brjuno";

  const conformalRadius = kind === "rational" || kind === "cremer" ? 0 : Math.exp(-sum);
  return { kind, cf, brjunoSum: sum, maxTerm, conformalRadius };
}
