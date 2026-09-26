import { describe, expect, it } from "vitest";
import {
  Frac,
  distinctDegree,
  equalDegree,
  factorDegreesModP,
  factorModP,
  factorOverZ,
  isSquare,
  isqrt,
  mpDeg,
  mpDivmod,
  mpExtGcd,
  mpFromBig,
  mpMonic,
  mpMul,
  mpPowMod,
  mpSquarefree,
  primesBelow,
  rationalRoots,
  zDivExact,
  zMul,
  type ModPoly,
  type ZPoly,
} from "../src/index.js";

/** Parse "x^5-5x+12" into ascending bigints (integer coefficients, one variable x). */
function parseZ(src: string): ZPoly {
  const out: bigint[] = [];
  const s = src.replace(/\s+/g, "").replace(/^(?=[^+-])/, "+");
  for (const m of s.matchAll(/([+-])(\d*)(x(?:\^(\d+))?)?/g)) {
    if (!m[0]) continue;
    const c = BigInt(m[2] || "1") * (m[1] === "-" ? -1n : 1n);
    const k = m[3] ? Number(m[4] ?? 1) : 0;
    while (out.length <= k) out.push(0n);
    out[k] += c;
  }
  return out;
}

// Cohen's per-group polynomials (A Course in Computational Algebraic Number Theory, §6.3), as sympy's
// galois-group suite carries them — every one irreducible over ℚ by construction.
const COHEN: readonly string[] = [
  "x^2+x+1",
  "x^3+x^2-2x-1",
  "x^3+2",
  "x^4+x^3+x^2+x+1",
  "x^4+1",
  "x^4-2",
  "x^4+8x+12",
  "x^4+x+1",
  "x^5+x^4-4x^3-3x^2+3x+1",
  "x^5-5x+12",
  "x^5+2",
  "x^5+20x+16",
  "x^5-x+1",
  "x^6+x^5+x^4+x^3+x^2+x+1",
  "x^6+108",
  "x^6+2",
  "x^6-3x^2-1",
  "x^6+3x^3+3",
  "x^6-3x^2+1",
  "x^6-4x^2-1",
  "x^6-3x^5+6x^4-7x^3+2x^2+x-4",
  "x^6+2x^3-2",
  "x^6+2x^2+2",
  "x^6+10x^5+55x^4+140x^3+175x^2+170x+25",
  "x^6+10x^5+55x^4+140x^3+175x^2-3019x+25",
  "x^6+6x^4+2x^3+9x^2+6x-4",
  "x^6+2x^4+2x^3+x^2+2x+2",
  "x^6+24x-20",
  "x^6+x+1",
];

// Degree 7: the Gaussian period polynomial for p = 29 (C₇, recomputed below), Trinks' x⁷ − 7x + 3
// (PSL(3,2)), x⁷ − 2 (F₄₂), x⁷ − x − 1 (S₇).
const DEGREE_7: readonly string[] = [
  "x^7+x^6-12x^5-7x^4+28x^3+14x^2-9x+1",
  "x^7-7x+3",
  "x^7-2",
  "x^7-x-1",
];

const P = 101;

function isIrreducibleModP(f: ModPoly, p: number): boolean {
  const dd = distinctDegree(mpMonic(f, p), p);
  return dd.length === 1 && dd[0].degree === mpDeg(f);
}

describe("𝔽ₚ[x]", () => {
  it("extended gcd satisfies s·a + t·b = g", () => {
    const a = mpFromBig(parseZ("x^5+3x^2+7"), P);
    const b = mpFromBig(parseZ("x^3-x+4"), P);
    const { g, s, t } = mpExtGcd(a, b, P);
    const lhs = mpFromBig(
      zMul(s.map(BigInt), a.map(BigInt)).map(
        (c, k) => c + (zMul(t.map(BigInt), b.map(BigInt))[k] ?? 0n),
      ),
      P,
    );
    expect(lhs).toEqual(g);
    expect(g).toEqual([1]);
  });

  it("powmod agrees with repeated multiplication", () => {
    const m = mpFromBig(parseZ("x^4+x+1"), P);
    let acc: ModPoly = [1];
    for (let k = 0; k < 37; k++) acc = mpDivmod(mpMul(acc, [3, 1], P), m, P).r;
    expect(mpPowMod([3, 1], 37n, m, P)).toEqual(acc);
  });

  it("factors into irreducibles whose product is the input", () => {
    for (const src of [...COHEN, ...DEGREE_7, "x^10-1", "x^12+x^6+1"]) {
      for (const p of [3, 7, 101]) {
        const f = mpFromBig(parseZ(src), p);
        if (!mpSquarefree(f, p) || mpDeg(f) !== parseZ(src).length - 1) continue;
        const fs = factorModP(mpMonic(f, p), p);
        let prod: ModPoly = [1];
        for (const g of fs) {
          expect(isIrreducibleModP(g, p)).toBe(true);
          prod = mpMul(prod, g, p);
        }
        expect(prod).toEqual(mpMonic(f, p));
      }
    }
  });

  it("the equal-degree split refuses characteristic 2", () => {
    expect(() => equalDegree([1, 1, 1], 1, 2)).toThrow(/characteristic 2/);
  });

  it("Dedekind's cycle types for x⁵ − x − 1, and the primes where the theorem is silent", () => {
    const f = parseZ("x^5-x-1");
    expect(factorDegreesModP(f, 2)).toEqual([3, 2]);
    expect(factorDegreesModP(f, 3)).toEqual([5]);
    // disc(x⁵ − x − 1) = 2869 = 19·151: f mod 19 has a repeated factor.
    expect(factorDegreesModP(f, 19)).toBeNull();
    expect(factorDegreesModP(f, 151)).toBeNull();
    // x^(p) − x splits completely mod p.
    expect(factorDegreesModP(parseZ("x^7-x"), 7)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    // p dividing the leading coefficient drops the degree.
    expect(factorDegreesModP(parseZ("3x^2+1"), 3)).toBeNull();
  });

  it("the prime sieve", () => {
    expect(primesBelow(30)).toEqual([2, 3, 5, 7, 11, 13, 17, 19, 23, 29]);
    expect(primesBelow(1000)).toHaveLength(168);
  });
});

function product(parts: readonly ZPoly[]): ZPoly {
  return parts.reduce((a, b) => zMul(a, b), [1n] as ZPoly);
}

function reassemble(f: ReturnType<typeof factorOverZ>): ZPoly {
  let out: ZPoly = [f.unit];
  for (const { poly, multiplicity } of f.factors)
    for (let k = 0; k < multiplicity; k++) out = zMul(out, poly);
  return out;
}

describe("factorisation over ℤ", () => {
  it("every corpus polynomial is irreducible", () => {
    for (const src of [...COHEN, ...DEGREE_7]) {
      const f = factorOverZ(parseZ(src));
      expect(f.factors, src).toHaveLength(1);
      expect(f.factors[0].poly, src).toEqual(parseZ(src));
    }
  });

  it("the C₇ period polynomial is the one recomputed from the periods of ζ₂₉", () => {
    // η_j = Σ_{k<4} ζ^(2^(j+7k)), j < 7: the Gaussian periods of length 4 for p = 29, 2 a primitive root.
    const periods: number[] = [];
    for (let j = 0; j < 7; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++)
        s += Math.cos((2 * Math.PI * Number(2n ** BigInt(j + 7 * k) % 29n)) / 29);
      periods.push(s);
    }
    let c = [1];
    for (const r of periods) {
      const n = new Array<number>(c.length + 1).fill(0);
      for (let i = 0; i < c.length; i++) {
        n[i] -= r * c[i];
        n[i + 1] += c[i];
      }
      c = n;
    }
    expect(c.map((v) => BigInt(Math.round(v)))).toEqual(parseZ(DEGREE_7[0]));
  });

  it("recovers pairwise products of corpus polynomials exactly", () => {
    const polys = [...COHEN.slice(3, 13), ...DEGREE_7].map(parseZ);
    for (let i = 0; i < polys.length; i += 2) {
      const j = (i * 5 + 3) % polys.length;
      if (j === i) continue;
      const f = factorOverZ(zMul(polys[i], polys[j]));
      const key = (a: ZPoly): string => a.join(",");
      const want = [polys[i], polys[j]].map(key).sort();
      expect(f.factors.map((x) => key(x.poly)).sort()).toEqual(want);
    }
  });

  it("Swinnerton-Dyer x⁴ − 10x² + 1 is irreducible though it splits into ≥ 2 factors mod every prime", () => {
    // The recombination's worst case: no prime proves it irreducible, so only the exhaustive
    // subset search does.
    const f = parseZ("x^4-10x^2+1");
    for (const p of primesBelow(200).slice(1)) {
      const d = factorDegreesModP(f, p);
      if (d) expect(d.length).toBeGreaterThanOrEqual(2);
    }
    expect(factorOverZ(f).factors).toHaveLength(1);
    // And its product with its x → x + 1 shift, both irreducible, comes apart into exactly the two.
    const g = parseZ("x^4+4x^3-4x^2-16x-8"); // f(x+1)
    expect(factorOverZ(zMul(f, g)).factors.map((x) => x.poly)).toEqual(
      [f, g].sort((a, b) => (a[3] < b[3] ? -1 : 1)),
    );
  });

  it("non-monic, contents, signs, multiplicities", () => {
    const a = parseZ("2x+1");
    const b = parseZ("3x^2-5");
    const c = parseZ("x^2+1");
    const f = zMul([-6n], product([a, a, a, b, c, c]));
    const r = factorOverZ(f);
    expect(r.unit).toBe(-6n);
    expect(r.factors).toEqual([
      { poly: a, multiplicity: 3 },
      { poly: c, multiplicity: 2 },
      { poly: b, multiplicity: 1 },
    ]);
    expect(reassemble(r)).toEqual(f);
  });

  it("x^n − 1 into cyclotomic polynomials", () => {
    const r = factorOverZ(parseZ("x^12-1"));
    // Φ₁ Φ₂ Φ₃ Φ₄ Φ₆ Φ₁₂.
    expect(r.factors.map((x) => x.poly.length - 1)).toEqual([1, 1, 2, 2, 2, 4]);
    expect(reassemble(r)).toEqual(parseZ("x^12-1"));
    for (const { poly } of r.factors) expect(factorOverZ(poly).factors).toHaveLength(1);
  });

  it("a degree-12 product whose factors are split many ways mod small primes", () => {
    const parts = ["x^3-2", "x^4-10x^2+1", "5x^5-x+1"].map(parseZ);
    const f = product(parts);
    const r = factorOverZ(f);
    expect(r.factors.map((x) => x.poly)).toEqual(parts);
    for (const { poly } of r.factors) expect(zDivExact(f, poly)).not.toBeNull();
  });

  it("constants and the zero polynomial", () => {
    expect(factorOverZ([7n])).toEqual({ unit: 7n, factors: [] });
    expect(() => factorOverZ([])).toThrow(/zero polynomial/);
  });

  it("rational roots, from the linear factors", () => {
    const f = product(["2x-3", "x+5", "x^2+1", "4x+1"].map(parseZ));
    const roots = rationalRoots(f).map((q) => q.toString());
    expect(roots.sort()).toEqual(
      [Frac.of(-5n), Frac.of(-1n, 4n), Frac.of(3n, 2n)].map((q) => q.toString()).sort(),
    );
    expect(rationalRoots(parseZ("x^5-x-1"))).toEqual([]);
  });
});

describe("integer square test", () => {
  it("decides squares exactly, including past float64", () => {
    expect(isSquare(0n)).toBe(true);
    expect(isSquare(2869n)).toBe(false);
    expect(isSquare(-4n)).toBe(false);
    const big = 10n ** 40n + 7n;
    expect(isSquare(big * big)).toBe(true);
    expect(isSquare(big * big + 1n)).toBe(false);
    expect(isSquare(big * big - 1n)).toBe(false);
    expect(isqrt(big * big + 2n * big)).toBe(big);
  });
});
