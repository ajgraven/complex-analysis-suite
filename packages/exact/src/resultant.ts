// Exact resultants, discriminants, and content-clearing for polynomials whose coefficients are QiPolys —
// i.e. bivariate polynomials given as a little-endian list of QiPoly (inner-variable) coefficients in an
// outer variable. Eliminating the outer variable by a Sylvester resultant collapses to a fraction-free
// (Bareiss) determinant over the integral domain ℚ(i)[inner], so it stays exact in QiPoly with no
// denominators. Used to eliminate a variable between two curves (the correspondence cusp locus disc_w C;
// CD's multiplier-specialization Res_z(Φ_n, (fⁿ)′ − λ₀)).
import { bigGcd, Frac, Gauss } from "./gaussian.js";
import { QiPoly } from "./qiPoly.js";

/** LCM of two non-negative BigInts (lcm(_, 0) = 0). */
function bigLcm(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n;
  return (a / bigGcd(a, b)) * b;
}

/**
 * Content-clear a list of polynomials JOINTLY: scale every coefficient by one common rational so that (a)
 * all become Gaussian integers and (b) their overall integer content is 1, then fix the sign from the
 * leading coefficient of the last polynomial. E.g. turns w² − (z̄²/2)w − z̄/2 into 2w² − z̄²w − z̄.
 */
export function integerPrimitive(polys: readonly QiPoly[]): QiPoly[] {
  const all: Gauss[] = [];
  for (const p of polys) for (const g of p.coeffs) if (!g.isZero()) all.push(g);
  if (all.length === 0) return polys.map((p) => p);

  let L = 1n; // common denominator so L·g is a Gaussian integer for every coefficient g
  for (const g of all) {
    L = bigLcm(L, g.re.d);
    L = bigLcm(L, g.im.d);
  }
  let G = 0n; // integer content = gcd of all (scaled) real and imaginary parts
  for (const g of all) {
    G = bigGcd(G, g.re.n * (L / g.re.d));
    G = bigGcd(G, g.im.n * (L / g.im.d));
  }
  if (G === 0n) G = 1n;

  // Sign: make the leading coefficient of the last polynomial "positive" (re > 0, or im > 0 if re = 0).
  let sign = 1n;
  for (let j = polys.length - 1; j >= 0; j--) {
    const lead = polys[j]?.leadingCoeff() ?? Gauss.ZERO;
    if (!lead.isZero()) {
      const s = lead.re.isZero() ? lead.im.n : lead.re.n;
      if (s < 0n) sign = -1n;
      break;
    }
  }

  const scale = (g: Gauss): Gauss =>
    new Gauss(Frac.of((sign * g.re.n * (L / g.re.d)) / G), Frac.of((sign * g.im.n * (L / g.im.d)) / G));
  return polys.map((p) => QiPoly.fromCoeffs(p.coeffs.map(scale)));
}

/** Content-clear a single polynomial to its canonical integer-primitive form (leading coefficient positive). */
export function primitivePoly(p: QiPoly): QiPoly {
  return integerPrimitive([p])[0] ?? QiPoly.zero();
}

/**
 * Fraction-free (Bareiss) determinant of a square matrix over ℚ(i)[inner]; every intermediate division is
 * exact in the integral domain, so it stays in QiPoly without denominators.
 */
export function bareissDet(matrix: readonly (readonly QiPoly[])[]): QiPoly {
  const n = matrix.length;
  if (n === 0) return QiPoly.int(1);
  const a: QiPoly[][] = matrix.map((row) => row.slice());
  let prev = QiPoly.int(1);
  let sign = 1;
  for (let k = 0; k < n - 1; k++) {
    if ((a[k]?.[k] ?? QiPoly.zero()).isZero()) {
      let r = k + 1;
      while (r < n && (a[r]?.[k] ?? QiPoly.zero()).isZero()) r++;
      if (r === n) return QiPoly.zero();
      const tmp = a[k] ?? [];
      a[k] = a[r] ?? [];
      a[r] = tmp;
      sign = -sign;
    }
    const akk = a[k]?.[k] ?? QiPoly.zero();
    for (let i = k + 1; i < n; i++) {
      const ai = a[i] ?? [];
      const ak = a[k] ?? [];
      for (let j = k + 1; j < n; j++) {
        const num = (ai[j] ?? QiPoly.zero()).mul(akk).sub((ai[k] ?? QiPoly.zero()).mul(ak[j] ?? QiPoly.zero()));
        ai[j] = num.divExact(prev);
      }
      ai[k] = QiPoly.zero();
    }
    prev = akk;
  }
  const det = a[n - 1]?.[n - 1] ?? QiPoly.zero();
  return sign === 1 ? det : det.neg();
}

/**
 * Drop trailing zero entries so a coefficient LIST reflects its true outer-variable degree.
 *
 * `QiPoly.fromCoeffs` trims within a single polynomial, but nothing trims the `QiPoly[]` list that
 * `resultant` / `discriminant` take — so an untrimmed list was previously read at its *declared* length,
 * which is a different (and generally wrong) elimination. Trimming is a no-op for both shipped callers,
 * whose top entries are provably nonzero.
 */
function trimTop(coeffs: readonly QiPoly[]): readonly QiPoly[] {
  let n = coeffs.length;
  while (n > 0 && (coeffs[n - 1] ?? QiPoly.zero()).isZero()) n--;
  return n === coeffs.length ? coeffs : coeffs.slice(0, n);
}

/**
 * The Sylvester resultant Res(A, B) in the OUTER variable, eliminating it. A and B are little-endian
 * outer-variable coefficient lists (each entry a QiPoly in the inner variable); the result is a QiPoly in
 * the inner variable. Res = 0 ⟺ A and B share a root (in the outer variable) over the algebraic closure.
 *
 * Lists are trimmed to their true degree first, and the degenerate cases are resolved *against that
 * contract* rather than by falling through to the determinant — see the guard below.
 */
export function resultant(Ain: readonly QiPoly[], Bin: readonly QiPoly[]): QiPoly {
  const A = trimTop(Ain);
  const B = trimTop(Bin);
  const p = A.length - 1;
  const q = B.length - 1;
  // An empty (post-trim) list IS the zero polynomial, which vanishes everywhere. Reading the contract
  // literally: 0 shares a root with anything that HAS a root, i.e. anything of degree ≥ 1 — so
  //   0 vs degree ≥ 1  ⇒ 0        0 vs nonzero constant ⇒ 1 (a constant has no roots to share)
  //   0 vs 0           ⇒ 0 (they agree everywhere)
  // Previously ANY empty list drove N = p + q ≤ 0 and returned the constant 1, reporting "no shared
  // root" for the polynomial that shares them all — a false negative on an elimination result, which is
  // the direction that reads as a certified absence. (cd-res-11)
  if (p < 0 || q < 0) {
    if (p < 0 && q < 0) return QiPoly.zero();
    return (p < 0 ? q : p) >= 1 ? QiPoly.zero() : QiPoly.int(1);
  }
  const N = p + q;
  if (N <= 0) return QiPoly.int(1); // two nonzero constants: neither has a root, so none is shared
  const M: QiPoly[][] = Array.from({ length: N }, () => new Array<QiPoly>(N).fill(QiPoly.zero()));
  for (let i = 0; i < q; i++) {
    for (let kk = 0; kk <= p; kk++) M[i][i + kk] = A[p - kk] ?? QiPoly.zero(); // high-to-low
  }
  for (let i = 0; i < p; i++) {
    for (let kk = 0; kk <= q; kk++) M[q + i][i + kk] = B[q - kk] ?? QiPoly.zero();
  }
  return bareissDet(M);
}

/**
 * The discriminant in the outer variable of a polynomial given as its little-endian coefficient list —
 * disc(A) = (−1)^{d(d−1)/2} · Res(A, A′) / lc(A), returned in content-cleared (primitive) form. Its roots
 * (in the inner variable) are where A has a repeated outer-variable root. A degree < 2 polynomial has no
 * repeated roots, so the discriminant is the constant 1.
 */
export function discriminant(coeffsIn: readonly QiPoly[]): QiPoly {
  // Trim first, so `d` is the TRUE degree and `lead` is nonzero. An untrimmed list used to reach
  // `divExact(QiPoly.zero())` and surface `QiPoly.divmod: division by zero polynomial` — an internal
  // helper's message, naming neither this function nor the actual cause. A degree-dropped input now
  // yields the correct lower-degree discriminant instead of an error. (cd-disc-12)
  const coeffs = trimTop(coeffsIn);
  const d = coeffs.length - 1;
  if (d < 2) return QiPoly.int(1);
  const B: QiPoly[] = [];
  for (let j = 1; j <= d; j++) B.push((coeffs[j] ?? QiPoly.zero()).scale(Gauss.int(j))); // A′
  const res = resultant(coeffs, B);
  const lead = coeffs[d] ?? QiPoly.zero();
  let disc = res.divExact(lead);
  if (Math.floor((d * (d - 1)) / 2) % 2 === 1) disc = disc.neg();
  return primitivePoly(disc);
}
