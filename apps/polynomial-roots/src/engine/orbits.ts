// Enumerating one polynomial per symmetry orbit — and getting the DENSITY right while doing it.
//
// The saving is large and the trap is subtle. For `{−1, +1}` at degree 20 there are 2²¹ proper
// polynomials; quotienting by the units (`P` and `−P` have identical roots) and by the group generated
// by `z ↦ −z` and `z ↦ 1/z` leaves 2¹⁸ — four seconds of solving instead of half a minute. The trap is
// that mirroring a representative's roots once per group element OVERCOUNTS every polynomial the group
// fixes. A palindrome is its own reversal; at degree 12 about one Littlewood polynomial in 64 is fixed
// by something, and each such polynomial would contribute its roots two or four times over. The picture
// would be right in outline and wrong in density along exactly the symmetric loci — the real axis and
// the unit circle, which is to say the two features the app exists to show.
//
// So each representative carries its STABILISER size `h = #{g ∈ G : gP = P}`, and its images are splatted
// at weight `1/h`. Summed over the group that is `|G|/h` — the orbit's true size — so the accumulated
// density is exactly the multiset of roots of the whole family, scaled by the constant `|units|`.
// `test/orbits.test.ts` pins that against brute-force enumeration of every polynomial at small degree,
// bin for bin.
//
// A polynomial is a vector of DIGIT INDICES into the alphabet, encoded in mixed radix:
// `a_0` over the unit-orbit representatives, `a_1 … a_{d−1}` over the whole alphabet, `a_d` over the
// non-zero values. Every symmetry is a permutation of digits followed by a renormalisation of `a_0`, so
// the canonical-form test is integer work only.
import type { Alphabet, SymmetryElement } from "./alphabet.js";

/** The index space of one degree: the mixed-radix shape and its size. */
export interface OrbitSpace {
  readonly degree: number;
  /** How many raw indices — i.e. proper polynomials up to unit scaling. */
  readonly total: number;
  /** `|A|`, the radix of the middle digits. */
  readonly radix: number;
  /** `leading.length` — the radix of `a_0`. */
  readonly leadRadix: number;
  /** `nonZero.length` — the radix of `a_d`. */
  readonly nzRadix: number;
  /** `leadPos[j]` — the position of digit `j` among the constant-term representatives, or −1. */
  readonly leadPos: Int32Array;
  /** `nzPos[j]` — the position of digit `j` among the non-zero values, or −1. */
  readonly nzPos: Int32Array;
}

/** Build the index space for one degree (degree ≥ 1; degree 0 has no roots). */
export function orbitSpace(alphabet: Alphabet, degree: number): OrbitSpace {
  const m = alphabet.values.length;
  const leadPos = new Int32Array(m).fill(-1);
  alphabet.leading.forEach((j, pos) => {
    leadPos[j] = pos;
  });
  const nzPos = new Int32Array(m).fill(-1);
  alphabet.nonZero.forEach((j, pos) => {
    nzPos[j] = pos;
  });
  const middle = Math.max(0, degree - 1);
  const total = alphabet.leading.length * Math.pow(m, middle) * alphabet.nonZero.length;
  return {
    degree,
    total,
    radix: m,
    leadRadix: alphabet.leading.length,
    nzRadix: alphabet.nonZero.length,
    leadPos,
    nzPos,
  };
}

/** How many proper polynomials of this degree there are over the alphabet (units NOT quotiented). */
export function properCount(alphabet: Alphabet, degree: number): number {
  const m = alphabet.values.length;
  const nz = alphabet.nonZero.length;
  return nz * nz * Math.pow(m, Math.max(0, degree - 1));
}

/** Decode a raw index into digit indices `out[0 … degree]`. */
export function decodeDigits(alphabet: Alphabet, space: OrbitSpace, index: number, out: Int32Array): void {
  const d = space.degree;
  let rest = index;
  const last = rest % space.nzRadix;
  rest = (rest - last) / space.nzRadix;
  out[d] = alphabet.nonZero[last];
  for (let k = d - 1; k >= 1; k--) {
    const digit = rest % space.radix;
    rest = (rest - digit) / space.radix;
    out[k] = digit;
  }
  out[0] = alphabet.leading[rest];
}

/** Encode digit indices back to a raw index. Assumes `out[0]` is a representative and `out[d]` non-zero. */
export function encodeDigits(space: OrbitSpace, digits: Int32Array): number {
  const d = space.degree;
  let idx = space.leadPos[digits[0]];
  for (let k = 1; k <= d - 1; k++) idx = idx * space.radix + digits[k];
  return idx * space.nzRadix + space.nzPos[digits[d]];
}

/**
 * Apply one group element to a digit vector and renormalise its constant term, writing into `out`.
 *
 * Order is conjugate, then negate, then reverse, then normalise. Negation and reversal commute only up
 * to a global factor `(−1)^d` — which is a UNIT whenever negation is available at all (`−A = A` means
 * `−1·A = A`), so the normalisation that follows removes it and the group is well defined on
 * representatives. `test/orbits.test.ts` checks closure by brute force rather than trusting that
 * argument.
 */
export function applySymmetry(
  alphabet: Alphabet,
  degree: number,
  digits: Int32Array,
  g: SymmetryElement,
  out: Int32Array,
): void {
  for (let k = 0; k <= degree; k++) out[k] = digits[k];
  if (g.conj) {
    const perm = alphabet.conjPerm;
    for (let k = 0; k <= degree; k++) out[k] = perm[out[k]];
  }
  if (g.neg) {
    const perm = alphabet.negPerm;
    for (let k = 1; k <= degree; k += 2) out[k] = perm[out[k]];
  }
  if (g.rev) {
    for (let k = 0, j = degree; k < j; k++, j--) {
      const t = out[k];
      out[k] = out[j];
      out[j] = t;
    }
  }
  const u = alphabet.normUnit[out[0]];
  if (u !== 0) {
    const perm = alphabet.unitPerm[u];
    for (let k = 0; k <= degree; k++) out[k] = perm[out[k]];
  }
}

/**
 * Is this digit vector the canonical representative of its orbit, and if so how big is its stabiliser?
 *
 * Canonical means "has the smallest raw index in its orbit". Returns `stabiliser = 0` for a
 * non-representative so a caller cannot use the weight of a polynomial it should have skipped.
 */
export function canonicalOf(
  alphabet: Alphabet,
  space: OrbitSpace,
  digits: Int32Array,
  scratch: Int32Array,
): { canonical: boolean; stabiliser: number } {
  const self = encodeDigits(space, digits);
  let stabiliser = 0;
  for (const g of alphabet.group) {
    applySymmetry(alphabet, space.degree, digits, g, scratch);
    const idx = encodeDigits(space, scratch);
    if (idx < self) return { canonical: false, stabiliser: 0 };
    if (idx === self) stabiliser++;
  }
  return { canonical: true, stabiliser };
}
