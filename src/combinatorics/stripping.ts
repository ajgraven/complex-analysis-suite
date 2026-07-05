/**
 * stripping.ts — the symbolic layer: internal address ↔ kneading sequence ↔ external angles.
 *
 * A hyperbolic component of the Mandelbrot set is pinned down combinatorially three equivalent ways:
 *
 *   • its **internal address** 1 = S₀ → S₁ → … → S_k (the strictly-increasing periods of the
 *     principal components passed through from the main cardioid to the target — e.g. the rabbit is
 *     1-3, the period-6 satellite on the rabbit is 1-3-6, the period-doubling cascade is 1-2-4-8…);
 *   • its **kneading sequence** ν (a ⋆-periodic word over {A,B} of period S_k — the itinerary of an
 *     external angle landing on the component, relative to the critical-value partition);
 *   • the two **characteristic external angles** θ⁻ < θ⁺ (periodic of period S_k) whose parameter
 *     rays co-land at the component's root and bound its wake.
 *
 * This module computes the chain  address → kneading → {θ⁻, θ⁺}  (the "stripping algorithm"), and
 * the inverse  kneading → address  (Lau–Schleicher's ρ-function) for round-tripping.
 *
 *   Phase 1 (address → kneading).  Build ν of period S_k recursively. Start from the cardioid
 *   (period 1, resolved word "1"). To extend a resolved period-Sᵢ word to period Sᵢ₊₁, repeat it
 *   periodically out to length Sᵢ₊₁ and **flip** the final entry; the ⋆ marks that final (period-
 *   boundary) position. This is the inverse of the ρ-function below.
 *
 *   Phase 2 (kneading → angles).  The two characteristic angles are the period-n angles whose own
 *   kneading sequence (the A/B/⋆ itinerary already defined in angles.ts) equals ν. We find them by
 *   exact enumeration over m/(2ⁿ−1): a candidate matches iff its length-n kneading word equals ν.
 *   Matches come in disjoint co-landing pairs (one per wake sharing this kneading — e.g. ν = "AA⋆"
 *   is realised by both the rabbit {1/7,2/7} and its mirror co-rabbit {5/7,6/7}); the canonical
 *   answer for a plain internal address is the **lowest** wake, i.e. the two smallest matches.
 *   Enumeration checks the *defining* property directly, so it cannot silently land the wrong root,
 *   and an address whose ν has **no** matching angle is simply not realised in M (a non-admissible
 *   internal address in the sense of Bruin–Schleicher) — reported rather than guessed.
 *
 * All arithmetic is exact integer/rational (float angles smear the doubling combinatorics). Pure
 * module — no DOM / GL. See FEATURE_RESEARCH.md §3.2. Oracles: 1-2 → {1/3,2/3}; 1-3 → {1/7,2/7};
 * 1-2-4 → {2/5,3/5}; 1-3-6 → {10/63,17/63}.
 */
import { type Angle, type KneadingSymbol, angle, classifyDoubling, kneadingSequence } from "./angles";

/**
 * Largest internal-address period we strip interactively. Phase 2 enumerates 2ⁿ−1 candidate angles
 * (with an early-out on the first mismatched symbol, so the effective cost is far below the bound),
 * which stays well under a frame's budget up to here; deeper towers are rejected rather than hung on.
 */
export const MAX_STRIP_PERIOD = 24;

/** Result of stripping an internal address down to its external angles. */
export interface StripResult {
  /** The (validated) internal address, e.g. [1, 3, 6]. */
  address: number[];
  /** Period of the target component = the last address entry. */
  period: number;
  /** The ⋆-periodic kneading sequence ν (length = period). */
  kneading: KneadingSymbol[];
  /** True iff the address is admissible (realised by an external angle in M). */
  realized: boolean;
  /** Lower characteristic angle θ⁻ (null when not realised). */
  lower: Angle | null;
  /** Upper characteristic angle θ⁺ (null when not realised). */
  upper: Angle | null;
  /**
   * Every co-landing pair sharing this kneading sequence, smallest wake first. The canonical pair
   * {lower, upper} is wakes[0]; deeper entries are the mirror / conjugate components (e.g. the
   * co-rabbit for the rabbit). Empty when not realised.
   */
  wakes: [Angle, Angle][];
}

/**
 * Phase 1 — internal address → kneading sequence ν (⋆-periodic, length = last address entry).
 *
 * `address` must start with 1 and be strictly increasing (validated by {@link parseInternalAddress}
 * / {@link stripExternalAngles}; this low-level builder trusts its input). Returns one period of ν,
 * with the sole ⋆ at the final position.
 */
export function kneadingFromAddress(address: number[]): KneadingSymbol[] {
  // `resolved` holds one period of the kneading word with the ⋆ resolved to its underlying bit, so
  // it can be repeated when we extend. The cardioid (period 1) is the all-ones word "1".
  let resolved: (0 | 1)[] = [1];
  let period = 1;
  for (let i = 1; i < address.length; i++) {
    const S = address[i];
    const next: (0 | 1)[] = [];
    for (let m = 0; m < S; m++) next.push(resolved[m % period]); // repeat the old period
    next[S - 1] = (next[S - 1] ^ 1) as 0 | 1; // flip the new period-boundary entry
    resolved = next;
    period = S;
  }
  const nu: KneadingSymbol[] = resolved.map((b) => (b ? "A" : "B"));
  nu[period - 1] = "*"; // the period boundary carries the ⋆
  return nu;
}

/**
 * Inverse of Phase 1 — kneading sequence → internal address, via Lau–Schleicher's ρ-function
 * ρ(k) = min{ m > k : ν_m ≠ ν_{m−k} } (with ⋆ counted as differing from every symbol). The address
 * is the orbit of 1 under ρ, stopping once it reaches the period. Used to round-trip / validate.
 */
export function addressFromKneading(nu: KneadingSymbol[]): number[] {
  const n = nu.length;
  const sym = (k: number): KneadingSymbol => nu[(k - 1) % n]; // 1-indexed, periodic
  const differ = (i: number, j: number): boolean => {
    const a = sym(i);
    const b = sym(j);
    if (a === "*" || b === "*") return true; // ⋆ matches nothing
    return a !== b;
  };
  const rho = (k: number): number => {
    for (let m = k + 1; ; m++) if (differ(m, m - k)) return m;
  };
  const address = [1];
  let s = 1;
  while (s < n) {
    s = rho(s);
    address.push(s);
  }
  return address;
}

/** The internal address of the hyperbolic component whose root ray has external angle θ, + its combinatorics. */
export interface AngleAddress {
  /** The internal address 1 = S₀ < … < S_k = period. */
  address: number[];
  /** The period of the component (= the last address entry). */
  period: number;
  /** The ⋆-periodic kneading sequence ν of θ (length = period). */
  kneading: KneadingSymbol[];
  /** The external angle in lowest terms. */
  angle: Angle;
}

/**
 * The **inverse** of {@link stripExternalAngles}: given the external angle θ of a parameter ray landing
 * at a component's root, recover its **internal address** — by reading off θ's kneading sequence
 * ({@link kneadingSequence}) and applying the ρ-function ({@link addressFromKneading}). Returns null when
 * θ is not a hyperbolic-component root angle (pre-periodic / Misiurewicz — a strictly positive preperiod).
 *
 * This is what distinguishes components of the *same* period: rabbit 1/7 → 1-3 (a satellite of the main
 * cardioid) vs airplane 3/7 → 1-2-3 (primitive — its vein passes through period 2). Both root angles of a
 * component give the same address. Exact integer arithmetic throughout (a rigorous combinatorial fact).
 */
export function internalAddressFromAngle(a: Angle): AngleAddress | null {
  const norm = angle(a.p, a.q); // reduce (5/15 → 1/3)
  const { preperiod, period } = classifyDoubling(norm);
  if (preperiod > 0 || period < 1) return null; // Misiurewicz / not periodic ⇒ not a component root
  const kneading = kneadingSequence(norm, period);
  return { address: addressFromKneading(kneading), period, kneading, angle: norm };
}

/**
 * Phase 2 — kneading sequence ν (period n) → its characteristic external angle pairs.
 *
 * Enumerates m/(2ⁿ−1) and keeps those whose length-n kneading word equals ν. Because all candidates
 * share the denominator D = 2ⁿ−1, sorting by numerator m sorts by angle; consecutive matches form
 * the disjoint co-landing wakes, smallest first. Returns the pairs (empty ⇒ ν not admissible).
 *
 * The kneading word of m/D is computed inline in integers: writing Dᵏθ = vₖ/D with vₖ = m·2ᵏ mod D,
 * the critical-value cuts θ/2 = m/(2D) and (θ+1)/2 = (m+D)/(2D) give symbol A iff m < 2vₖ < m+D,
 * and ⋆ exactly when 2vₖ ∈ {m, m+D} (i.e. Dᵏθ is a preimage of θ). A genuine period-n angle has its
 * single ⋆ at k = n−1, matching ν's lone ⋆, so lower-period m are rejected automatically.
 */
export function externalAnglePairs(nu: KneadingSymbol[]): [Angle, Angle][] {
  const n = nu.length;
  if (n < 1) return [];
  const D = Math.pow(2, n) - 1;
  const matches: number[] = [];
  for (let m = 1; m < D; m++) {
    let v = m;
    let stars = 0;
    let ok = true;
    for (let k = 0; k < n; k++) {
      const twice = 2 * v;
      let s: KneadingSymbol;
      if (twice === m || twice === m + D) s = "*";
      else s = twice > m && twice < m + D ? "A" : "B";
      if (s !== nu[k]) {
        ok = false;
        break;
      }
      if (s === "*") stars++;
      v = (v * 2) % D;
    }
    if (ok && stars === 1) matches.push(m); // exactly one ⋆ ⇒ genuine period-n angle
  }
  matches.sort((a, b) => a - b);
  // Invariant: kneading matches co-land in disjoint pairs (θ⁻, θ⁺ per wake), so the count is even.
  // An odd count means a malformed ν reached enumeration — surface it rather than quietly dropping
  // the unpaired tail match (the loop below stops one short of it).
  if (matches.length % 2 !== 0) {
    console.warn(
      `externalAnglePairs: odd match count ${matches.length} for kneading ${nu.join("")} — dropping the unpaired tail.`,
    );
  }
  const wakes: [Angle, Angle][] = [];
  for (let i = 0; i + 1 < matches.length; i += 2) {
    wakes.push([angle(matches[i], D), angle(matches[i + 1], D)]);
  }
  return wakes;
}

/** Validation error thrown by {@link parseInternalAddress} with a user-facing message. */
export class AddressError extends Error {}

/**
 * Parse and validate an internal address from free text — accepts "1-3-6", "1 3 6", "1,3,6", etc.
 * Must begin with 1, be strictly increasing positive integers, and end at a period ≤
 * {@link MAX_STRIP_PERIOD}. Throws {@link AddressError} with an explanatory message otherwise.
 */
export function parseInternalAddress(text: string): number[] {
  const parts = text
    .split(/[^0-9]+/)
    .filter((s) => s.length > 0)
    .map((s) => Number.parseInt(s, 10));
  if (parts.length === 0) throw new AddressError("Enter an internal address, e.g. 1-3-6.");
  if (parts.some((x) => !Number.isFinite(x) || x < 1)) {
    throw new AddressError("Internal-address entries must be positive integers.");
  }
  if (parts[0] !== 1) throw new AddressError("An internal address must start with 1 (the main cardioid).");
  for (let i = 1; i < parts.length; i++) {
    if (parts[i] <= parts[i - 1]) {
      throw new AddressError("Internal-address periods must strictly increase (e.g. 1-3-6).");
    }
  }
  const last = parts[parts.length - 1];
  if (last > MAX_STRIP_PERIOD) {
    throw new AddressError(`Period ${last} exceeds the interactive limit of ${MAX_STRIP_PERIOD}.`);
  }
  return parts;
}

/**
 * Full stripping: internal address → kneading sequence + characteristic external angles {θ⁻, θ⁺}.
 *
 * The main cardioid (address [1]) is handled directly: its root is the cusp at angle 0, so
 * θ⁻ = θ⁺ = 0. Otherwise we build ν (Phase 1) and enumerate its angle pairs (Phase 2); a non-empty
 * result is admissible and we return the lowest wake as {θ⁻, θ⁺}.
 */
export function stripExternalAngles(address: number[]): StripResult {
  const period = address[address.length - 1];
  const kneading = kneadingFromAddress(address);
  if (period === 1) {
    const cusp = angle(0, 1);
    return { address, period, kneading, realized: true, lower: cusp, upper: cusp, wakes: [[cusp, cusp]] };
  }
  const wakes = externalAnglePairs(kneading);
  if (wakes.length === 0) {
    return { address, period, kneading, realized: false, lower: null, upper: null, wakes: [] };
  }
  return { address, period, kneading, realized: true, lower: wakes[0][0], upper: wakes[0][1], wakes };
}

/** Format a kneading sequence as a compact string, e.g. ["A","A","*"] → "AA⋆". */
export function formatKneading(nu: KneadingSymbol[]): string {
  return nu.map((s) => (s === "*" ? "⋆" : s)).join("");
}
