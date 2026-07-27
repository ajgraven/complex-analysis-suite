// @cas/exact unit tests — the exact-arithmetic primitives in isolation (the domain goldens that exercise
// them end-to-end live with their consumers: the correspondence curve in apps/correspondences, the
// dynatomic/Gleason polynomials in apps/complex-dynamics).
import { describe, it, expect } from "vitest";
import { Frac, Gauss, QiPoly, renderGaussMag, renderQiPolyText } from "../src/index.js";

describe("Frac (ℚ over BigInt)", () => {
  it("normalizes to lowest terms with a positive denominator", () => {
    expect(Frac.of(2n, 4n).n).toBe(1n);
    expect(Frac.of(2n, 4n).d).toBe(2n);
    expect(Frac.of(1n, -2n).n).toBe(-1n);
    expect(Frac.of(1n, -2n).d).toBe(2n);
  });
  it("arithmetic", () => {
    expect(Frac.of(1n, 2n).add(Frac.of(1n, 3n)).equals(Frac.of(5n, 6n))).toBe(true);
    expect(Frac.of(2n, 3n).mul(Frac.of(3n, 4n)).equals(Frac.of(1n, 2n))).toBe(true);
    expect(Frac.of(1n).div(Frac.of(3n)).equals(Frac.of(1n, 3n))).toBe(true);
  });

  // toNumber is the SOLE crossing from the exact engine into the numeric plane (Gauss.toTuple
  // delegates to it), and Number(bigint) saturates to ±Infinity past ~1.8e308. Because Frac is kept
  // in lowest terms, "both sides huge" is an ordinary state, not a degenerate one — so the direct
  // quotient returned Infinity/Infinity = NaN for ratios that are themselves perfectly tame, and a
  // NaN here propagates into a read-out labelled "= exact". (cd-frac-07)
  describe("toNumber past the double range", () => {
    const close = (got: number, want: number, tol = 1e-9) =>
      Number.isFinite(got) && Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));

    // Every fixture below must be IRREDUCIBLE, or Frac.of quietly reduces it to something small and
    // the test proves nothing: 10^400/(3·10^400) is stored as 1/3. Using a/(k·a + 1) keeps it huge,
    // since gcd(a, k·a + 1) = gcd(a, 1) = 1.
    const HUGE = 10n ** 400n;
    it("evaluates a tame ratio whose numerator and denominator both overflow", () => {
      expect(close(Frac.of(HUGE, 3n * HUGE + 1n).toNumber(), 1 / 3)).toBe(true);
      expect(close(Frac.of(-HUGE, 3n * HUGE + 1n).toNumber(), -1 / 3)).toBe(true);
      // 2^1400 / 3^900 — coprime by construction, ~422 and ~430 digits.
      expect(
        close(Frac.of(2n ** 1400n, 3n ** 900n).toNumber(), Math.exp(1400 * Math.LN2 - 900 * Math.log(3))),
      ).toBe(true);
    });

    it("Gauss.toTuple inherits the fix", () => {
      const g = new Gauss(Frac.of(HUGE, 3n * HUGE + 1n), Frac.of(HUGE, 2n * HUGE + 1n));
      const [re, im] = g.toTuple();
      expect(close(re, 1 / 3)).toBe(true);
      expect(close(im, 1 / 2)).toBe(true);
    });

    it("still saturates when the ratio itself is out of range", () => {
      expect(Frac.of(10n ** 400n, 1n).toNumber()).toBe(Infinity);
      expect(Frac.of(-(10n ** 400n), 1n).toNumber()).toBe(-Infinity);
      expect(Frac.of(1n, 10n ** 400n).toNumber()).toBe(0);
    });

    it("is unchanged for everything already in range", () => {
      let seed = 987654321;
      const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
      for (let i = 0; i < 2000; i++) {
        const f = Frac.of(BigInt(rnd() - 0x3fffffff), BigInt(rnd() + 1));
        expect(Object.is(f.toNumber(), Number(f.n) / Number(f.d))).toBe(true);
      }
      expect(Frac.of(1n, 3n).toNumber()).toBe(1 / 3);
      expect(Frac.of(0n, 7n).toNumber()).toBe(0);
    });
  });
});

describe("Gauss (ℚ(i)) is a field", () => {
  it("multiplies and conjugates", () => {
    // (1+i)(1−i) = 2
    expect(Gauss.int(1, 1).mul(Gauss.int(1, -1)).equals(Gauss.int(2))).toBe(true);
    expect(Gauss.int(3, 4).conj().equals(Gauss.int(3, -4))).toBe(true);
    expect(Gauss.int(3, 4).norm2().equals(Frac.of(25n))).toBe(true);
  });
  it("every nonzero element is invertible (z · z⁻¹ = 1)", () => {
    for (const z of [Gauss.int(2), Gauss.I, Gauss.int(1, 1), Gauss.rat(3n, 5n, -7n, 4n)]) {
      expect(z.mul(z.inv()).equals(Gauss.ONE)).toBe(true);
    }
    expect(() => Gauss.ZERO.inv()).toThrow();
  });

  describe("the real × real fast path (cd-perf-04)", () => {
    // mul() shortcuts when both imaginary parts are zero — the case CD's whole dynatomic tower and
    // the Correspondences deltoid curve are made of. It must be indistinguishable from the general
    // form, which is what these pin: same value, and the general form still used everywhere else.
    const general = (a: Gauss, b: Gauss): Gauss =>
      new Gauss(a.re.mul(b.re).sub(a.im.mul(b.im)), a.re.mul(b.im).add(a.im.mul(b.re)));

    const SAMPLES = [
      Gauss.ZERO,
      Gauss.ONE,
      Gauss.int(-1),
      Gauss.int(7),
      Gauss.int(-123456789),
      Gauss.rat(22n, 7n, 0n, 1n), // real, non-integer
      Gauss.rat(-355n, 113n, 0n, 1n),
      Gauss.I,
      Gauss.int(3, 4),
      Gauss.int(0, -9),
      Gauss.rat(3n, 5n, -7n, 4n),
    ];

    it("agrees with the general form on every pairing (real, mixed and complex)", () => {
      for (const a of SAMPLES) {
        for (const b of SAMPLES) {
          expect(a.mul(b).equals(general(a, b)), `${a.re.n}/${a.re.d}+${a.im.n}/${a.im.d}i × …`).toBe(true);
        }
      }
    });

    it("keeps a zero imaginary part exactly zero, not a normalised 0/k", () => {
      // The shortcut hands back Frac.ZERO rather than computing 0·d + 0·c. Frac is normalised, so
      // this is belt-and-braces — but a regression to an unnormalised zero would break `equals`.
      const p = Gauss.rat(22n, 7n, 0n, 1n).mul(Gauss.rat(-355n, 113n, 0n, 1n));
      expect(p.im.isZero()).toBe(true);
      expect(p.im.n).toBe(0n);
      expect(p.im.d).toBe(1n);
    });

    it("still multiplies correctly when only ONE operand is real", () => {
      // The mixed case deliberately does NOT take a shortcut — it has no consumer today, and an
      // untested branch is worse than a general one. Guard that it stays correct regardless.
      expect(Gauss.int(2).mul(Gauss.int(3, 4)).equals(Gauss.int(6, 8))).toBe(true);
      expect(Gauss.int(3, 4).mul(Gauss.int(2)).equals(Gauss.int(6, 8))).toBe(true);
    });

    it("associates and distributes across the real/complex boundary", () => {
      // A shortcut that fired on the wrong branch would show up as broken algebra here.
      const [a, b, c] = [Gauss.int(5), Gauss.int(2, -3), Gauss.rat(1n, 3n, 0n, 1n)];
      expect(a.mul(b).mul(c).equals(a.mul(b.mul(c)))).toBe(true);
      expect(a.mul(b.add(c)).equals(a.mul(b).add(a.mul(c)))).toBe(true);
      expect(c.mul(a.add(b)).equals(c.mul(a).add(c.mul(b)))).toBe(true);
    });
  });
});

describe("QiPoly (exact univariate over ℚ(i))", () => {
  const x = QiPoly.variable();
  const c = (n: number) => QiPoly.int(n);

  it("builds, trims, and reports degree", () => {
    expect(QiPoly.fromCoeffs([Gauss.int(1), Gauss.ZERO, Gauss.ZERO]).degree()).toBe(0);
    expect(QiPoly.zero().isZero()).toBe(true);
    expect(x.degree()).toBe(1);
    expect(QiPoly.monomial(3, Gauss.int(2)).equals(x.pow(3).scale(Gauss.int(2)))).toBe(true);
  });

  it("multiplies: (x+1)(x−1) = x²−1", () => {
    const got = x.add(c(1)).mul(x.sub(c(1)));
    expect(got.equals(x.pow(2).sub(c(1)))).toBe(true);
  });

  it("divmod over the field, and exact division", () => {
    // (x²−1) = (x−1)(x+1) exactly
    const { q, r } = x.pow(2).sub(c(1)).divmod(x.sub(c(1)));
    expect(r.isZero()).toBe(true);
    expect(q.equals(x.add(c(1)))).toBe(true);
    // x²+1 divided by x−1 leaves remainder 2
    const dm = x.pow(2).add(c(1)).divmod(x.sub(c(1)));
    expect(dm.q.equals(x.add(c(1)))).toBe(true);
    expect(dm.r.equals(c(2))).toBe(true);
    expect(() => x.pow(2).add(c(1)).divExact(x.sub(c(1)))).toThrow();
  });

  it("divideByVar peels a factor of the variable exactly", () => {
    // (2x³ − x²) / x = 2x² − x
    expect(x.pow(3).scale(Gauss.int(2)).sub(x.pow(2)).divideByVar().equals(x.pow(2).scale(Gauss.int(2)).sub(x))).toBe(true);
    expect(() => x.add(c(1)).divideByVar()).toThrow(); // nonzero constant term
  });

  it("Horner evaluation", () => {
    // (x²+1) at i = 0
    expect(x.pow(2).add(c(1)).eval(Gauss.I).isZero()).toBe(true);
  });
});

describe("QiPoly derivative / gcd / squarefree", () => {
  const x = QiPoly.variable();
  const c = (n: number) => QiPoly.int(n);

  it("derivative: d/dx(x³ + 2x) = 3x² + 2", () => {
    expect(x.pow(3).add(x.scale(Gauss.int(2))).derivative().equals(x.pow(2).scale(Gauss.int(3)).add(c(2)))).toBe(true);
  });

  it("monic GCD: gcd((x−1)(x−2), (x−1)(x−3)) = x−1", () => {
    const a = x.sub(c(1)).mul(x.sub(c(2)));
    const b = x.sub(c(1)).mul(x.sub(c(3)));
    expect(a.gcd(b).equals(x.sub(c(1)))).toBe(true);
  });

  it("squarefreePart collapses (x−1)²(x−2) to (x−1)(x−2)", () => {
    const p = x.sub(c(1)).pow(2).mul(x.sub(c(2)));
    expect(p.squarefreePart().equals(x.sub(c(1)).mul(x.sub(c(2))))).toBe(true);
    // an already-squarefree polynomial is returned unchanged (up to being monic here).
    expect(x.sub(c(1)).mul(x.sub(c(2))).squarefreePart().equals(x.sub(c(1)).mul(x.sub(c(2))))).toBe(true);
  });
});

describe("rendering", () => {
  it("renderQiPolyText formats a polynomial in a named variable", () => {
    const c = QiPoly.variable();
    const poly = c.pow(3).add(c.pow(2).scale(Gauss.int(2))).add(c).add(QiPoly.int(1)); // c³+2c²+c+1
    expect(renderQiPolyText(poly, "c")).toBe("c^3 + 2 c^2 + c + 1");
  });
  it("renderGaussMag splits sign and magnitude", () => {
    expect(renderGaussMag(Gauss.int(-3))).toEqual({ sign: -1, mag: "3", isUnit: false });
    expect(renderGaussMag(Gauss.int(1))).toEqual({ sign: 1, mag: "1", isUnit: true });
    expect(renderGaussMag(Gauss.I)).toEqual({ sign: 1, mag: "i", isUnit: false });
  });
});
