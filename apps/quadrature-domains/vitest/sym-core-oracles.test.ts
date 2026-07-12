// =============================================================================
// sym-core-oracles -- INDEPENDENT-oracle tests for the exact engine's foundations.
// The existing differential tests (packed==naive, GVW==classic, FGLM==direct) all
// compare implementations built on the SAME MPoly/Gaussian/Rational primitives, so
// a corrupting bug in a shared primitive can pass both sides. These oracles don't
// share that fate:
//   (A) Rational/Gaussian arithmetic is fuzzed against a from-scratch BigInt ℚ and
//       ℚ(i) reference (independent code path) -- a bug in QD's field arithmetic
//       diverges from the reference.
//   (B) Buchberger is checked by STRUCTURAL INVARIANTS that hold by theorem regardless
//       of the primitives: the reduced Gröbner basis (hence its leading-monomial set)
//       is unique/order-independent, and a permuted-input GB must generate the same
//       ideal (cross-reduction to 0) -- plus every input generator lies in its own GB.
// (The external-CAS golden corpus is the companion sym-core-cas-corpus test.)
import { describe, it, expect } from "vitest";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { Rational, Gaussian, MPoly, monomialOrder, buchberger, reduceGroebner, normalForm } = S;

// ---- deterministic PRNG (mulberry32) — reproducible, no Math.random ----
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- from-scratch BigInt reference for ℚ and ℚ(i) (shares no code with QD) ----
type Q = [bigint, bigint];
type Gi = [Q, Q];
const bgcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; };
const qN = (n: bigint, d: bigint): Q => { if (d < 0n) { n = -n; d = -d; } const g = bgcd(n, d) || 1n; return [n / g, d / g]; };
const qAdd = ([an, ad]: Q, [bn, bd]: Q): Q => qN(an * bd + bn * ad, ad * bd);
const qSub = ([an, ad]: Q, [bn, bd]: Q): Q => qN(an * bd - bn * ad, ad * bd);
const qMul = ([an, ad]: Q, [bn, bd]: Q): Q => qN(an * bn, ad * bd);
const qDiv = ([an, ad]: Q, [bn, bd]: Q): Q => qN(an * bd, ad * bn);
const qEq = ([an, ad]: Q, [bn, bd]: Q): boolean => an === bn && ad === bd;
const qIsZero = ([n]: Q): boolean => n === 0n;
const giAdd = ([ar, ai]: Gi, [br, bi]: Gi): Gi => [qAdd(ar, br), qAdd(ai, bi)];
const giSub = ([ar, ai]: Gi, [br, bi]: Gi): Gi => [qSub(ar, br), qSub(ai, bi)];
const giMul = ([ar, ai]: Gi, [br, bi]: Gi): Gi => [qSub(qMul(ar, br), qMul(ai, bi)), qAdd(qMul(ar, bi), qMul(ai, br))];
const giNorm2 = ([r, i]: Gi): Q => qAdd(qMul(r, r), qMul(i, i));
const giDiv = (a: Gi, b: Gi): Gi => { const n2 = giNorm2(b); const conj: Gi = [b[0], qN(-b[1][0], b[1][1])]; const num = giMul(a, conj); return [qDiv(num[0], n2), qDiv(num[1], n2)]; };
const giEq = ([ar, ai]: Gi, [br, bi]: Gi): boolean => qEq(ar, br) && qEq(ai, bi);

// QD ⇄ reference bridges
const qdRatToRef = (r: any): Q => qN(r.n, r.d);
const qdGauToRef = (g: any): Gi => [qdRatToRef(g.re), qdRatToRef(g.im)];
const refToQdRat = ([n, d]: Q) => new Rational(n, d);
const refToQdGau = ([r, i]: Gi) => new Gaussian(refToQdRat(r), refToQdRat(i));

describe("Rational / Gaussian arithmetic vs an independent BigInt reference", () => {
  it("ℚ: 3000-case add/sub/mul/div fuzz matches the reference", () => {
    const rnd = mulberry32(0x51a7);
    const ri = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
    const randQ = (): Q => qN(BigInt(ri(-12, 12)), BigInt(ri(1, 12)));
    let bad: string | null = null;
    for (let t = 0; t < 3000 && !bad; t++) {
      const a = randQ(), b = randQ(), qa = refToQdRat(a), qb = refToQdRat(b);
      if (!qEq(qdRatToRef(qa.add(qb)), qAdd(a, b))) bad = `add ${a}+${b}`;
      else if (!qEq(qdRatToRef(qa.sub(qb)), qSub(a, b))) bad = `sub ${a}-${b}`;
      else if (!qEq(qdRatToRef(qa.mul(qb)), qMul(a, b))) bad = `mul ${a}*${b}`;
      else if (!qIsZero(b) && !qEq(qdRatToRef(qa.div(qb)), qDiv(a, b))) bad = `div ${a}/${b}`;
    }
    expect(bad).toBeNull();
  });

  it("ℚ(i): 3000-case add/sub/mul/div fuzz matches the reference", () => {
    const rnd = mulberry32(0xc0ffee);
    const ri = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
    const randQ = (): Q => qN(BigInt(ri(-9, 9)), BigInt(ri(1, 9)));
    const randGi = (): Gi => [randQ(), randQ()];
    const giIsZero = (g: Gi) => qIsZero(g[0]) && qIsZero(g[1]);
    let bad: string | null = null;
    for (let t = 0; t < 3000 && !bad; t++) {
      const a = randGi(), b = randGi(), Qa = refToQdGau(a), Qb = refToQdGau(b);
      if (!giEq(qdGauToRef(Qa.add(Qb)), giAdd(a, b))) bad = `add ${t}`;
      else if (!giEq(qdGauToRef(Qa.sub(Qb)), giSub(a, b))) bad = `sub ${t}`;
      else if (!giEq(qdGauToRef(Qa.mul(Qb)), giMul(a, b))) bad = `mul ${t}`;
      else if (!giIsZero(b) && !giEq(qdGauToRef(Qa.div(Qb)), giDiv(a, b))) bad = `div ${t}`;
    }
    expect(bad).toBeNull();
  });

  it("ℚ(i): i·i = −1 and (a)(conj a) = |a|² in the reference and QD agree", () => {
    const I = Gaussian.I;
    expect(giEq(qdGauToRef(I.mul(I)), [[-1n, 1n], [0n, 1n]])).toBe(true);
    const a = new Gaussian(new Rational(3n, 1n), new Rational(4n, 1n));
    expect(giEq(qdGauToRef(a.mul(a.conj())), [[25n, 1n], [0n, 1n]])).toBe(true);
  });
});

describe("Buchberger: structural invariants (permutation-invariance + ideal membership)", () => {
  const V = (n: string) => MPoly.variable(n);
  const I = (k: number) => MPoly.fromInt(k);
  const mul = (...xs: any[]) => xs.reduce((p, x) => p.mul(x));

  // Named systems + seeded random small ℚ(i) ideals, so the invariants are exercised on
  // both structured and unstructured input.
  const named: { name: string; vars: string[]; polys: any[] }[] = [
    { name: "twisted cubic ⟨x²−y, xy−1⟩", vars: ["x", "y"], polys: [V("x").pow(2).sub(V("y")), V("x").mul(V("y")).sub(I(1))] },
    { name: "grid ⟨x²−1, y²−1⟩", vars: ["x", "y"], polys: [V("x").pow(2).sub(I(1)), V("y").pow(2).sub(I(1))] },
    { name: "cyclic-4", vars: ["a", "b", "c", "d"], polys: [
      V("a").add(V("b")).add(V("c")).add(V("d")),
      mul(V("a"), V("b")).add(mul(V("b"), V("c"))).add(mul(V("c"), V("d"))).add(mul(V("d"), V("a"))),
      mul(V("a"), V("b"), V("c")).add(mul(V("b"), V("c"), V("d"))).add(mul(V("c"), V("d"), V("a"))).add(mul(V("d"), V("a"), V("b"))),
      mul(V("a"), V("b"), V("c"), V("d")).sub(I(1)),
    ] },
    { name: "3-var ⟨x+y+z−1, x²+y²−z, xz−y⟩", vars: ["x", "y", "z"], polys: [
      V("x").add(V("y")).add(V("z")).sub(I(1)), V("x").pow(2).add(V("y").pow(2)).sub(V("z")), V("x").mul(V("z")).sub(V("y"))] },
  ];
  const rnd = mulberry32(0xa1ce);
  const ri = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const randGauss = () => new Gaussian(new Rational(BigInt(ri(-3, 3)), 1n), new Rational(BigInt(ri(-3, 3)), 1n));
  const randPoly = (vars: string[]) => {
    let p = MPoly.zero();
    const nTerms = ri(2, 3);
    for (let t = 0; t < nTerms; t++) {
      let m = MPoly.fromInt(1);
      for (const v of vars) { const e = ri(0, 2); for (let k = 0; k < e; k++) m = m.mul(V(v)); }
      p = p.add(m.scale(randGauss()));
    }
    return p;
  };
  const random: { name: string; vars: string[]; polys: any[] }[] = [];
  for (let s = 0; s < 6; s++) {
    const vars = ["x", "y"];
    random.push({ name: `random ℚ(i) ideal #${s + 1}`, vars, polys: [randPoly(vars), randPoly(vars), randPoly(vars)] });
  }

  const key = (G: any[]) => G.map((g) => JSON.stringify(g.termList())).sort().join("|");
  const lmKey = (G: any[], ord: any) => G.map((g) => JSON.stringify([...g.leadingMono(ord)].sort())).sort().join("|");
  const perms = (arr: any[]) => [arr.slice().reverse(), [...arr.slice(1), arr[0]], [arr[arr.length - 1], ...arr.slice(0, -1)]];

  for (const sys of [...named, ...random]) {
    it(`${sys.name}: reduced GB is order-independent + permuted GBs share the ideal + generators are members`, () => {
      const ord = monomialOrder("grevlex", sys.vars);
      const nonzero = sys.polys.filter((p: any) => !p.isZero());
      if (!nonzero.length) return; // degenerate random draw (all-zero); nothing to assert
      const G0 = reduceGroebner(buchberger(nonzero, ord), ord);
      // Every original generator lies in ⟨G0⟩ (reduces to 0).
      for (const p of nonzero) expect(normalForm(p, G0, ord).isZero()).toBe(true);
      const lm0 = lmKey(G0, ord);
      const k0 = key(G0);
      for (const perm of perms(nonzero)) {
        const Gp = reduceGroebner(buchberger(perm, ord), ord);
        // The initial ideal (leading-monomial set) is unique — a theorem, primitive-independent.
        expect(lmKey(Gp, ord)).toBe(lm0);
        // The full reduced GB is canonical, so it is byte-identical across input orders.
        expect(key(Gp)).toBe(k0);
        // And regardless, both bases generate the same ideal: cross-reduce to 0.
        for (const g of Gp) expect(normalForm(g, G0, ord).isZero()).toBe(true);
        for (const g of G0) expect(normalForm(g, Gp, ord).isZero()).toBe(true);
      }
    });
  }
});
