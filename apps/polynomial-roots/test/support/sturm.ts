// An EXACT real-root counter for integer polynomials — the oracle the sweep's real-root statistic is
// checked against. It shares nothing with the solver: Sturm sequences over ℚ in BigInt, with
// multiplicity from the square-free tower `g₀ = p, g_{k+1} = gcd(g_k, g_k′)` (the distinct real roots
// of `g_k` are the real roots of `p` of multiplicity > k, so their counts sum to the count with
// multiplicity).
type Q = readonly [bigint, bigint]; // numerator, positive denominator, lowest terms
type Poly = Q[]; // low → high, no trailing zeros

const babs = (a: bigint): bigint => (a < 0n ? -a : a);
function bgcd(a: bigint, b: bigint): bigint {
  let x = babs(a);
  let y = babs(b);
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}
function q(n: bigint, d: bigint = 1n): Q {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = bgcd(n, d) || 1n;
  return [n / g, d / g];
}
const sub = (a: Q, b: Q): Q => q(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const mul = (a: Q, b: Q): Q => q(a[0] * b[0], a[1] * b[1]);
const div = (a: Q, b: Q): Q => q(a[0] * b[1], a[1] * b[0]);
const isZero = (a: Q): boolean => a[0] === 0n;

function trim(p: Poly): Poly {
  const out = [...p];
  while (out.length > 0 && isZero(out[out.length - 1])) out.pop();
  return out;
}
function deriv(p: Poly): Poly {
  return trim(p.slice(1).map((c, k) => mul(c, q(BigInt(k + 1)))));
}
function rem(a: Poly, b: Poly): Poly {
  let r = trim(a);
  const lead = b[b.length - 1];
  while (r.length >= b.length && r.length > 0) {
    const f = div(r[r.length - 1], lead);
    const shift = r.length - b.length;
    const next = [...r];
    for (let k = 0; k < b.length; k++) next[k + shift] = sub(next[k + shift], mul(f, b[k]));
    r = trim(next);
  }
  return r;
}
function gcd(a: Poly, b: Poly): Poly {
  let x = trim(a);
  let y = trim(b);
  while (y.length > 0) [x, y] = [y, rem(x, y)];
  return x;
}
const sign = (a: Q): number => (a[0] > 0n ? 1 : a[0] < 0n ? -1 : 0);

/** Distinct real roots of `p` (degree ≥ 1), by Sturm's theorem. */
function distinctReal(p: Poly): number {
  const seq: Poly[] = [trim(p), deriv(p)];
  while (seq[seq.length - 1].length > 1) {
    const r = rem(seq[seq.length - 2], seq[seq.length - 1]);
    if (r.length === 0) break;
    seq.push(r.map((c) => q(-c[0], c[1])));
  }
  const changes = (atPlusInf: boolean): number => {
    let n = 0;
    let last = 0;
    for (const s of seq) {
      if (s.length === 0) continue;
      const lead = sign(s[s.length - 1]);
      const v = atPlusInf || (s.length - 1) % 2 === 0 ? lead : -lead;
      if (v !== 0 && last !== 0 && v !== last) n++;
      if (v !== 0) last = v;
    }
    return n;
  };
  return changes(false) - changes(true);
}

/** Real roots of an integer polynomial `Σ c_k z^k`, counted with multiplicity. */
export function realRootsWithMultiplicity(coeffs: readonly number[]): number {
  let g: Poly = trim(coeffs.map((c) => q(BigInt(c))));
  let total = 0;
  while (g.length > 1) {
    total += distinctReal(g);
    g = gcd(g, deriv(g));
  }
  return total;
}

/** Distinct real roots of an integer polynomial — with the count above, detects a repeated real root. */
export function distinctRealRoots(coeffs: readonly number[]): number {
  return distinctReal(trim(coeffs.map((c) => q(BigInt(c)))));
}
