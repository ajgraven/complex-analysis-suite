/**
 * internalAddress.ts — the **internal address** of a hyperbolic component of the Mandelbrot set, the
 * combinatorial "GPS coordinates" that record the sequence of renormalization periods on the way from the
 * main cardioid to a component (Lau–Schleicher, Bruin–Schleicher; Schleicher, "Internal Addresses in the
 * Mandelbrot Set and Galois Groups of Polynomials").
 *
 * The internal address is a strictly increasing sequence 1 = S₀ < S₁ < … < Sₖ = period. It is what
 * distinguishes hyperbolic components of the *same* period: the rabbit (period 3, a satellite of the main
 * cardioid) has address 1→3, while the airplane (period 3, primitive) has 1→2→3 — its vein passes through
 * a period-2 component first. It is computed from the **external angle** θ = p/q of a parameter ray
 * landing at the component's root (both of a component's two root angles give the same address).
 *
 * Everything here is EXACT integer/rational arithmetic on the doubling map d(θ)=2θ mod 1 — no floating
 * point, so the answer is a rigorous combinatorial fact, not a numerical estimate.
 *
 * Algorithm:
 *  • **Kneading sequence** ν(θ): partition the circle by the two doubling-preimages of θ — θ/2 and
 *    (θ+1)/2 — into arc "1" = (θ/2, (θ+1)/2) (the half containing θ) and arc "0" (the half containing 0).
 *    νₖ is the arc of the k-th iterate 2^{k−1}θ, or '*' when it lands exactly on a boundary. In integers
 *    over q (with a = 2^{k−1}p mod q): νₖ = 1 iff p < 2a < p+q, 0 outside, '*' if 2a = p or 2a = p+q.
 *  • **Internal address** via the ρ-function: S₀ = 1, and Sᵢ₊₁ = ρ(Sᵢ) where
 *    ρ(k) = min{ j > k : ν_j ≠ ν_{j−k} } (a '*' counts as different from everything). Iterate until the
 *    period is reached.
 */

/** The internal address of a hyperbolic component together with its supporting combinatorics. */
export interface InternalAddress {
  /** The strictly increasing sequence of periods 1 = S₀ < S₁ < … < Sₖ = period. */
  address: number[];
  /** The kneading sequence over {0, 1, '*'}, one period long (the '*' marks the period). */
  kneading: (0 | 1 | "*")[];
  /** The period of the component (the period of θ under doubling). */
  period: number;
  /** The reduced external angle p/q the address was computed from. */
  angle: { p: number; q: number };
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * The period of θ = p/q under doubling (the multiplicative order of 2 mod q for a reduced angle with odd
 * q), or 0 when θ is pre-periodic (even q ⇒ a Misiurewicz angle, not a hyperbolic-component root).
 */
export function doublingPeriod(p: number, q: number): number {
  if (q <= 0) return 0;
  const g = gcd(Math.abs(p), q);
  const qr = q / g;
  if (qr % 2 === 0) return 0; // even denominator ⇒ pre-periodic (Misiurewicz)
  const pr = ((p / g) % qr + qr) % qr;
  let a = pr;
  let n = 0;
  do {
    a = (2 * a) % qr;
    n++;
  } while (a !== pr && n <= qr);
  return a === pr ? n : 0;
}

/** The kneading symbol of the iterate whose numerator over q is `a`, for θ = p/q. */
function kneadingSymbol(a: number, p: number, q: number): 0 | 1 | "*" {
  const twoA = 2 * a;
  if (twoA === p || twoA === p + q) return "*";
  return p < twoA && twoA < p + q ? 1 : 0;
}

/**
 * The kneading sequence ν(θ) of θ = p/q, `len` symbols long. p/q need not be reduced; symbols are over
 * {0, 1, '*'} with ν₁ = 1 always (θ itself lies in arc "1").
 */
export function kneadingSequence(p: number, q: number, len: number): (0 | 1 | "*")[] {
  const g = gcd(Math.abs(p), q) || 1;
  const qr = q / g;
  let a = (((p / g) % qr) + qr) % qr;
  const nu: (0 | 1 | "*")[] = [];
  for (let k = 0; k < len; k++) {
    nu.push(kneadingSymbol(a, ((p / g) % qr + qr) % qr, qr));
    a = (2 * a) % qr;
  }
  return nu;
}

/** ρ(k) = min{ j > k : ν_j ≠ ν_{j−k} } on the 1-indexed kneading sequence; '*' differs from everything. */
function rho(nu: (0 | 1 | "*")[], k: number): number {
  for (let j = k + 1; j <= nu.length; j++) {
    const a = nu[j - 1];
    const b = nu[j - 1 - k];
    const differ = a === "*" || b === "*" ? true : a !== b;
    if (differ) return j;
  }
  return -1;
}

/**
 * The internal address of the hyperbolic component whose root has external angle θ = p/q. Returns null
 * when θ is not a hyperbolic-component root angle (pre-periodic / Misiurewicz — even reduced denominator).
 * p/q need not be reduced; the two root angles of a component yield the same address.
 */
export function internalAddress(p: number, q: number): InternalAddress | null {
  const g = gcd(Math.abs(p), q) || 1;
  const pr = ((p / g) % (q / g) + q / g) % (q / g);
  const qr = q / g;
  const period = doublingPeriod(pr, qr);
  if (period < 1) return null;
  const nu = kneadingSequence(pr, qr, 4 * period + 4);
  const address = [1];
  let guard = 0;
  while (address[address.length - 1] !== period && guard++ < period + 4) {
    const next = rho(nu, address[address.length - 1]);
    if (next < 0 || next > period) break;
    address.push(next);
  }
  return { address, kneading: nu.slice(0, period), period, angle: { p: pr, q: qr } };
}
