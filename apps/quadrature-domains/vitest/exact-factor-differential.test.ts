// Differential test: @cas/exact's factorOverZ vs sym-core's factorOverQ (ADR-0047 PRA-4).
//
// ADR-0008 left QD's sym-core separate from @cas/exact, and PRA-4 then gave @cas/exact a
// Berlekamp–Zassenhaus of its own for Polynomial Root Analysis' Galois card — so factorisation over ℚ
// is now implemented twice, as ℚ(i) was before it (exact-symcore-differential.test.ts). The two share
// no code: different prime choice, different lifting (sym-core lifts a factor tree, @cas/exact pair by
// pair), different recombination order. They must agree on the SET of irreducible factors of every
// polynomial, which is a fact about the polynomial and not about either algorithm.
//
// WHAT MAKES THIS A REAL TEST: the corpus is BUILT from factors, so each input's factorisation is known
// up to the irreducibility of its parts, and the two engines are compared on canonical form (monic
// rational coefficients as (n, d) pairs), never on floats. Random products of low-degree integer
// polynomials hit the recombination paths — many split mod every small prime into more pieces than
// there are true factors — and the fixed entries add the ones known to be hard (Swinnerton-Dyer,
// cyclotomic products).
import { beforeAll, describe, expect, it } from "vitest";
import { factorOverZ, zMul, type ZPoly } from "@cas/exact";
import _QD from "../app/solvers/solver.mjs";

let Sym: any;
beforeAll(async () => {
  await import("../app/sym/sym-core.mjs");
  Sym = (_QD as any).Sym;
});

/** Monic canonical form of an integer polynomial, as "n/d" strings, ascending. */
function monicKey(a: readonly bigint[]): string {
  const lc = a[a.length - 1];
  return a
    .map((c) => {
      let n = c;
      let d = lc;
      if (d < 0n) [n, d] = [-n, -d];
      const g = gcd(n < 0n ? -n : n, d);
      return `${n / g}/${d / g}`;
    })
    .join(",");
}
function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}

function symFactors(f: ZPoly): string[] {
  let p = Sym.mpolyInt(0);
  const X = Sym.mpolyVar("x");
  for (let k = f.length - 1; k >= 0; k--) p = p.mul(X).add(Sym.mpolyInt(f[k]));
  const out: string[] = [];
  for (const g of Sym.factorOverQ(p, "x")) {
    const coeffs = g.coeffsIn("x").map((c: any) => {
      for (const t of c.terms.values()) if (t.mono.size === 0) return t.coeff;
      return null;
    });
    out.push(
      coeffs
        .map((c: any) => {
          if (c === null) return "0/1"; // a zero coefficient is the empty MPoly
          if (!c.im.isZero()) throw new Error("non-rational factor");
          return `${c.re.n}/${c.re.d}`;
        })
        .join(","),
    );
  }
  return out.sort();
}

function exactFactors(f: ZPoly): string[] {
  return factorOverZ(f)
    .factors.map((x) => monicKey(x.poly))
    .sort();
}

function lcg(seed: number): () => number {
  let s = seed;
  return () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0);
}

const random = lcg(20260926);
const CORPUS: ZPoly[] = [];
for (let n = 0; n < 50; n++) {
  const parts = 1 + (random() % 3);
  let f: ZPoly = [1n];
  for (let k = 0; k < parts; k++) {
    const d = 1 + (random() % 4);
    const g = Array.from({ length: d + 1 }, () => BigInt((random() % 15) - 7));
    g[d] = BigInt(1 + (random() % 3));
    if (g.every((c, i) => i === d || c === 0n)) g[0] = 1n;
    f = zMul(f, g);
  }
  CORPUS.push(f);
}
const HARD: ZPoly[] = [
  [1n, 0n, -10n, 0n, 1n], // Swinnerton-Dyer, √2 ± √3
  [576n, 0n, -960n, 0n, 352n, 0n, -40n, 0n, 1n], // Swinnerton-Dyer, √2 ± √3 ± √5
  [-1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n], // x¹² − 1
];

describe("factorisation over ℚ — @cas/exact vs sym-core (PRA-4)", () => {
  it("agrees on the irreducible factors of 50 random integer products", () => {
    const bad: string[] = [];
    for (const f of CORPUS) {
      const a = exactFactors(f);
      const b = symFactors(f);
      if (a.join(" | ") !== b.join(" | ")) bad.push(`${f.join(",")}: exact ${a.join(" | ")} vs sym ${b.join(" | ")}`);
    }
    expect(bad).toEqual([]);
    // Anti-vacuity: the corpus really does exercise splitting.
    expect(CORPUS.filter((f) => exactFactors(f).length >= 3).length).toBeGreaterThan(5);
  });

  it("agrees on the hard cases", () => {
    for (const f of HARD) expect(exactFactors(f)).toEqual(symFactors(f));
    expect(exactFactors(HARD[0])).toHaveLength(1);
    expect(exactFactors(HARD[2])).toHaveLength(6);
  });
});
