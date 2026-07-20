// Differential test: @cas/exact's ℚ(i) vs sym-core's ℚ(i).
//
// ADR-0008 extracted @cas/exact and deliberately left QD's sym-core.mjs separate, accepting one
// named cost: **ℚ over BigInt and ℚ(i) are now implemented twice**, in two languages, by two
// engines that never call each other. That duplication is fine right up until they disagree —
// at which point one of them is quietly wrong about the field that every exactness claim in the
// suite rests on, and nothing would notice.
//
// This is ADR-0008's open Action Item 4: the cheap guard that makes the duplication safe.
//
// WHAT MAKES THIS A REAL TEST, not a formality:
//
//   • It compares CANONICAL FORM — the (n, d) BigInt pairs of re and im — never toNumber().
//     Both engines normalize to d > 0 with gcd(|n|, d) = 1, so equal values have *identical*
//     tuples and there is no tolerance to tune. Comparing floats would make the test pass on
//     inputs where the engines genuinely differ, which is precisely the failure it exists to
//     catch.
//   • The corpus targets NORMALIZATION, because that is where two independent implementations
//     of the same field actually drift: negative denominators, unreduced inputs, signed zero,
//     and the gcd fast paths sym-core added for speed (d === 1n, n === 0n, d === -1n) which
//     @cas/exact does not have. A fast path that is subtly wrong is exactly the bug this
//     catches and unit tests on either side alone would not.
//   • Division by zero is compared too: agreeing on values but disagreeing on which inputs are
//     legal is still a divergence.
//
// Note on the dependency: this adds @cas/exact to the QD app's devDependencies. QD's RUNTIME
// still does not use it — the app ships sym-core — and ADR-0008's boundary is unchanged. The
// dependency exists solely so this cross-check can import both engines into one process, which
// is the only way to compare them at all.
import { describe, it, expect, beforeAll } from "vitest";
import { Frac, Gauss } from "@cas/exact";
import _QD from "../app/solver.mjs";

let Rational: any, Gaussian: any;
beforeAll(async () => {
  await import("../app/sym-core.mjs");
  Rational = (_QD as any).Sym.Rational;
  Gaussian = (_QD as any).Sym.Gaussian;
});

// ---------------------------------------------------------------------------
// The shared corpus. Each entry is a raw (numerator, denominator) pair per component,
// deliberately UNNORMALIZED where that stresses the two engines' reduction paths.
// ---------------------------------------------------------------------------
type Raw = { rn: bigint; rd: bigint; in_: bigint; id: bigint; why: string };
const CORPUS: Raw[] = [
  { rn: 0n, rd: 1n, in_: 0n, id: 1n, why: "zero" },
  { rn: 1n, rd: 1n, in_: 0n, id: 1n, why: "one" },
  { rn: 0n, rd: 1n, in_: 1n, id: 1n, why: "i" },
  { rn: -1n, rd: 1n, in_: 0n, id: 1n, why: "minus one" },
  { rn: 3n, rd: 4n, in_: -5n, id: 6n, why: "ordinary fractions, mixed sign" },
  // Negative denominators: both must move the sign to the numerator. A fast path that
  // forgets this produces d < 0 and every later gcd/compare is off.
  { rn: 1n, rd: -2n, in_: 3n, id: -4n, why: "negative denominators (sign migration)" },
  { rn: -7n, rd: -9n, in_: 0n, id: 1n, why: "both negative → positive" },
  // Unreduced: exercises the gcd path on both sides.
  { rn: 6n, rd: 8n, in_: 10n, id: 4n, why: "unreduced, needs gcd" },
  { rn: 120n, rd: 36n, in_: -84n, id: 56n, why: "unreduced with larger gcd" },
  // sym-core has explicit fast paths for d===1n, n===0n, d===-1n that @cas/exact lacks.
  { rn: 5n, rd: 1n, in_: -3n, id: 1n, why: "d === 1 fast path" },
  { rn: 0n, rd: 7n, in_: 0n, id: -3n, why: "n === 0 with odd denominators" },
  { rn: 4n, rd: -1n, in_: -9n, id: -1n, why: "d === -1 fast path" },
  // Big values: past Number.MAX_SAFE_INTEGER, where anything float-backed would diverge.
  { rn: 9007199254740993n, rd: 3n, in_: -9007199254740991n, id: 7n, why: "beyond 2^53" },
  { rn: 123456789012345678901234567890n, rd: 987654321098765432109876543210n, in_: 1n, id: 1n, why: "very large, shared factors" },
  { rn: 1n, rd: 3n, in_: 1n, id: 3n, why: "repeating decimal — no float has this value" },
];

// Canonical fingerprint. Identical values MUST produce identical strings in both engines.
const fpExact = (g: InstanceType<typeof Gauss>) =>
  `${g.re.n}/${g.re.d}+${g.im.n}/${g.im.d}i`;
const fpSym = (g: any) => `${g.re.n}/${g.re.d}+${g.im.n}/${g.im.d}i`;

const mkExact = (r: Raw) => Gauss.rat(r.rn, r.rd, r.in_, r.id);
const mkSym = (r: Raw) => new Gaussian(new Rational(r.rn, r.rd), new Rational(r.in_, r.id));

describe("construction and normalization agree", () => {
  it.each(CORPUS)("$why", (r) => {
    expect(fpExact(mkExact(r))).toBe(fpSym(mkSym(r)));
  });

  it("both put the sign on the numerator and keep the denominator positive", () => {
    // Stated as its own assertion because it is the invariant every later comparison relies on:
    // if one engine allowed d < 0, equal values could still print differently and every test
    // above would fail for a reason that has nothing to do with arithmetic.
    for (const r of CORPUS) {
      const e = mkExact(r), s = mkSym(r);
      expect(e.re.d > 0n && e.im.d > 0n, `@cas/exact kept d > 0 for ${r.why}`).toBe(true);
      expect(s.re.d > 0n && s.im.d > 0n, `sym-core kept d > 0 for ${r.why}`).toBe(true);
    }
  });
});

describe("binary operations agree across the whole corpus", () => {
  const OPS = ["add", "sub", "mul"] as const;

  for (const op of OPS) {
    it(`${op}: every ordered pair`, () => {
      const disagreements: string[] = [];
      for (const a of CORPUS) {
        for (const b of CORPUS) {
          const e = fpExact((mkExact(a) as any)[op](mkExact(b)));
          const s = fpSym((mkSym(a) as any)[op](mkSym(b)));
          if (e !== s) disagreements.push(`${a.why} ${op} ${b.why}: exact=${e} sym=${s}`);
        }
      }
      expect(disagreements).toEqual([]);
    });
  }

  it("div: every ordered pair with a non-zero divisor", () => {
    const disagreements: string[] = [];
    for (const a of CORPUS) {
      for (const b of CORPUS) {
        if (mkExact(b).isZero()) continue;
        const e = fpExact(mkExact(a).div(mkExact(b)));
        const s = fpSym(mkSym(a).div(mkSym(b)));
        if (e !== s) disagreements.push(`${a.why} / ${b.why}: exact=${e} sym=${s}`);
      }
    }
    expect(disagreements).toEqual([]);
  });

  it("covers a non-trivial number of pairs (guards the loops themselves)", () => {
    // A corpus that silently shrank, or a `continue` that swallowed everything, would leave the
    // loops above asserting nothing while still passing.
    const nonZero = CORPUS.filter((r) => !mkExact(r).isZero()).length;
    expect(CORPUS.length).toBeGreaterThanOrEqual(15);
    expect(CORPUS.length * nonZero).toBeGreaterThanOrEqual(150);
  });
});

describe("unary operations agree", () => {
  it.each(CORPUS)("neg / conj / isZero: $why", (r) => {
    expect(fpExact(mkExact(r).neg())).toBe(fpSym(mkSym(r).neg()));
    expect(fpExact(mkExact(r).conj())).toBe(fpSym(mkSym(r).conj()));
    expect(mkExact(r).isZero()).toBe(mkSym(r).isZero());
  });
});

describe("equality agrees, including on values reached by different routes", () => {
  it("both call 3/4 and 6/8 the same number", () => {
    const a = Gauss.rat(3n, 4n), b = Gauss.rat(6n, 8n);
    const x = new Gaussian(new Rational(3n, 4n), new Rational(0n, 1n));
    const y = new Gaussian(new Rational(6n, 8n), new Rational(0n, 1n));
    expect(a.equals(b)).toBe(true);
    expect(x.equals(y)).toBe(true);
  });

  it("agree on every pair's equality verdict", () => {
    const disagreements: string[] = [];
    for (const a of CORPUS) {
      for (const b of CORPUS) {
        const e = mkExact(a).equals(mkExact(b));
        const s = mkSym(a).equals(mkSym(b));
        if (e !== s) disagreements.push(`${a.why} == ${b.why}: exact=${e} sym=${s}`);
      }
    }
    expect(disagreements).toEqual([]);
  });
});

describe("they agree on what is ILLEGAL, not just on values", () => {
  // Agreeing on every value while disagreeing on which inputs are admissible is still a
  // divergence — and the more dangerous kind, because one engine would return a number where
  // the other refuses.
  it("both reject a zero denominator", () => {
    expect(() => Frac.of(1n, 0n)).toThrow();
    expect(() => new Rational(1n, 0n)).toThrow();
  });

  it("both reject division by zero", () => {
    expect(() => Gauss.rat(1n, 1n).div(Gauss.ZERO)).toThrow();
    expect(() => new Gaussian(new Rational(1n), new Rational(0n))
      .div(new Gaussian(new Rational(0n), new Rational(0n)))).toThrow();
  });
});

describe("field laws hold identically in both", () => {
  // Cross-checking against laws catches a *shared* misconception that pairwise comparison
  // cannot: if both engines implement the same wrong rule, the differential above stays green.
  const nz = CORPUS.filter((r) => !mkExact(r).isZero());

  it("(a / b) · b = a, in both", () => {
    for (const a of CORPUS) {
      for (const b of nz) {
        expect(fpExact(mkExact(a).div(mkExact(b)).mul(mkExact(b)))).toBe(fpExact(mkExact(a)));
        expect(fpSym(mkSym(a).div(mkSym(b)).mul(mkSym(b)))).toBe(fpSym(mkSym(a)));
      }
    }
  });

  it("z · conj(z) is real, in both", () => {
    for (const r of CORPUS) {
      expect(mkExact(r).mul(mkExact(r).conj()).im.n).toBe(0n);
      expect(mkSym(r).mul(mkSym(r).conj()).im.n).toBe(0n);
    }
  });

  it("multiplication distributes over addition, in both", () => {
    const [a, b, c] = [CORPUS[4], CORPUS[5], CORPUS[8]];
    const lhsE = mkExact(a).mul(mkExact(b).add(mkExact(c)));
    const rhsE = mkExact(a).mul(mkExact(b)).add(mkExact(a).mul(mkExact(c)));
    expect(fpExact(lhsE)).toBe(fpExact(rhsE));
    const lhsS = mkSym(a).mul(mkSym(b).add(mkSym(c)));
    const rhsS = mkSym(a).mul(mkSym(b)).add(mkSym(a).mul(mkSym(c)));
    expect(fpSym(lhsS)).toBe(fpSym(rhsS));
  });
});
