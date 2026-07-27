import { describe, expect, it } from "vitest";
import { Complex, type Cx } from "../src/index.js";

// Golden corpus for the object-representation complex arithmetic (@cas/core's first leaf).
// Ported from the Quadrature app's vitest/leaves/complex.test.ts — these are now the package's
// own golden values, and this file is the single home for them (the app-side copy is retired
// when QD adopts @cas/core). Later commits parameterize the shared corpus over BOTH
// representations (object + tuple); for now it pins the object instance.

const near = (a: number, b: number, tol = 1e-12) => Math.abs(a - b) < tol;
const cNear = (z: Cx, re: number, im: number, tol = 1e-12) =>
  near(z.re, re, tol) && near(z.im, im, tol);

describe("@cas/core Complex (object representation)", () => {
  it("basic arithmetic golden values", () => {
    expect(cNear(Complex.add({ re: 1, im: 2 }, { re: 3, im: 4 }), 4, 6)).toBe(true);
    expect(cNear(Complex.sub({ re: 1, im: 2 }, { re: 3, im: 4 }), -2, -2)).toBe(true);
    expect(cNear(Complex.mul({ re: 1, im: 2 }, { re: 3, im: 4 }), -5, 10)).toBe(true);
    expect(cNear(Complex.neg({ re: 1, im: -2 }), -1, 2)).toBe(true);
    expect(cNear(Complex.scale({ re: 1, im: -2 }, 3), 3, -6)).toBe(true);
    expect(cNear(Complex.conj({ re: 1, im: 2 }), 1, -2)).toBe(true);
    expect(cNear(Complex.inv({ re: 1, im: 1 }), 0.5, -0.5)).toBe(true);
    // 1 / i = -i
    expect(cNear(Complex.div({ re: 1, im: 0 }, { re: 0, im: 1 }), 0, -1)).toBe(true);
    // (1+2i)/(3+4i) = (11 + 2i)/25
    expect(cNear(Complex.div({ re: 1, im: 2 }, { re: 3, im: 4 }), 11 / 25, 2 / 25)).toBe(true);
  });

  it("throws on division by zero", () => {
    expect(() => Complex.inv({ re: 0, im: 0 })).toThrow();
    expect(() => Complex.div({ re: 1, im: 0 }, { re: 0, im: 0 })).toThrow();
  });

  it("in-place ops match their functional twins and may alias", () => {
    const out: Cx = { re: 0, im: 0 };
    Complex.mulInto({ re: 1, im: 2 }, { re: 3, im: 4 }, out);
    expect(cNear(out, -5, 10)).toBe(true);
    // aliasing: square a in place
    const a: Cx = { re: 0, im: 1 };
    Complex.mulInto(a, a, a);
    expect(cNear(a, -1, 0)).toBe(true);
    const acc: Cx = { re: 1, im: 1 };
    Complex.addMulInto({ re: 1, im: 0 }, { re: 0, im: 1 }, acc); // acc += i
    expect(cNear(acc, 1, 2)).toBe(true);
    // ...and addMulInto must honour the "SAFE TO ALIAS" contract too, not just mulInto.
    // acc2 += acc2 * i  with acc2 = 1+i  ⇒  (1+i) + (1+i)i = (1+i) + (-1+i) = 0 + 2i.
    // Pre-fix this returned 0+1i: `out.re` was written first, so the imaginary line read the
    // ALREADY-UPDATED `a.re` (0) instead of the original (1).
    const acc2: Cx = { re: 1, im: 1 };
    Complex.addMulInto(acc2, { re: 0, im: 1 }, acc2);
    expect(cNear(acc2, 0, 2)).toBe(true);

    // addInto / subInto / scaleInto complete the documented in-place API (the perf-only sibling set of
    // add/sub/scale). They are currently opted into by no consumer — the review's cd-dead-10 proposed
    // deleting them as dead — but they are a deliberate, symmetric substrate API (@cas/core exists to
    // provide such primitives; cf. the intentional conjFR/MM_H in review #4 Batch A), and the natural
    // completion the next allocation-free kernel reaches for. Rather than delete useful API on a
    // finding that was itself wrong about half its content (it mislocated a non-existent
    // `BiPoly.monomial` to @cas/core), we KEEP them and CLOSE the real risk it gestures at — that
    // untested code rots — by exercising them here, including the "SAFE TO ALIAS" contract. For these
    // three the contract is trivially safe (component-wise, no cross term, unlike mul), and this pins
    // that so a future refactor cannot regress it silently.
    const s1: Cx = { re: 5, im: 7 };
    Complex.addInto({ re: 1, im: 2 }, { re: 3, im: -1 }, s1);
    expect(cNear(s1, 4, 1)).toBe(true);
    const s2: Cx = { re: 0, im: 0 };
    Complex.subInto({ re: 1, im: 2 }, { re: 3, im: -1 }, s2);
    expect(cNear(s2, -2, 3)).toBe(true);
    const s3: Cx = { re: 0, im: 0 };
    Complex.scaleInto({ re: 2, im: -3 }, 4, s3);
    expect(cNear(s3, 8, -12)).toBe(true);
    // aliasing (out === a): add/sub/scale in place must read the original before overwriting.
    const al1: Cx = { re: 1, im: 1 };
    Complex.addInto(al1, al1, al1); // 2(1+i)
    expect(cNear(al1, 2, 2)).toBe(true);
    const al2: Cx = { re: 3, im: 5 };
    Complex.subInto(al2, { re: 1, im: 2 }, al2);
    expect(cNear(al2, 2, 3)).toBe(true);
    const al3: Cx = { re: 1, im: -1 };
    Complex.scaleInto(al3, -2, al3);
    expect(cNear(al3, -2, 2)).toBe(true);
  });

  it("abs / abs2 / arg", () => {
    expect(near(Complex.abs({ re: 3, im: 4 }), 5)).toBe(true);
    expect(near(Complex.abs2({ re: 3, im: 4 }), 25)).toBe(true);
    expect(near(Complex.arg({ re: 0, im: 1 }), Math.PI / 2)).toBe(true);
  });

  it("integer pow (binary exponentiation)", () => {
    expect(cNear(Complex.pow({ re: 0, im: 1 }, 2), -1, 0)).toBe(true); // i^2 = -1
    expect(cNear(Complex.pow({ re: 2, im: 0 }, 10), 1024, 0)).toBe(true);
    expect(cNear(Complex.pow({ re: 0, im: 1 }, -1), 0, -1)).toBe(true); // i^-1 = -i
    expect(cNear(Complex.pow({ re: 5, im: -3 }, 0), 1, 0)).toBe(true); // z^0 = 1
  });

  it("cpow (principal branch), agreeing with integer pow", () => {
    expect(cNear(Complex.cpow({ re: 4, im: 0 }, 0.5), 2, 0)).toBe(true);
    expect(cNear(Complex.cpow({ re: 0, im: 1 }, 2), -1, 0)).toBe(true);
    // cpow with an integer exponent matches Complex.pow on the principal branch
    const p = Complex.pow({ re: 1, im: 1 }, 3);
    expect(cNear(Complex.cpow({ re: 1, im: 1 }, 3), p.re, p.im, 1e-10)).toBe(true);
    expect(cNear(Complex.cpow({ re: 0, im: 0 }, 2), 0, 0)).toBe(true); // 0^p = 0 for p>0
  });

  it("parse", () => {
    expect(cNear(Complex.parse("1+2i") as Cx, 1, 2)).toBe(true);
    expect(cNear(Complex.parse("-i") as Cx, 0, -1)).toBe(true);
    expect(cNear(Complex.parse("3") as Cx, 3, 0)).toBe(true);
    expect(cNear(Complex.parse("1.5e-3+2.1e2i") as Cx, 1.5e-3, 2.1e2)).toBe(true);
    expect(cNear(Complex.parse(2 as unknown) as Cx, 2, 0)).toBe(true); // number passthrough
    expect(Complex.parse("garbage")).toBeNull();
  });

  it("parse rejects malformed tokens instead of silently truncating (strict | null contract)", () => {
    expect(Complex.parse("2i3")).toBeNull(); // was {re:2} (parseFloat stopped at 'i')
    expect(Complex.parse("1.2.3")).toBeNull(); // was {re:1.2}
    expect(Complex.parse("3x")).toBeNull(); // was {re:3}
    expect(Complex.parse("1e")).toBeNull(); // dangling exponent, was {re:1}
    // ...but well-formed values (bare/short imaginary, leading-dot, sci-notation) still parse:
    expect(cNear(Complex.parse("2.5i") as Cx, 0, 2.5)).toBe(true);
    expect(cNear(Complex.parse(".5-1.5e1i") as Cx, 0.5, -15)).toBe(true);
    expect(cNear(Complex.parse("+i") as Cx, 0, 1)).toBe(true);
  });

  it("format", () => {
    expect(Complex.format({ re: 1, im: 0 })).toBe("1");
    expect(Complex.format({ re: 0, im: 1 })).toBe("i");
    expect(Complex.format({ re: 0, im: -1 })).toBe("-i");
    expect(Complex.format({ re: 1, im: -1 })).toBe("1-i");
    expect(Complex.format({ re: -5, im: 10 })).toBe("-5+10i");
    expect(Complex.format(null)).toBe("0");
    // snap-to-integer drift
    expect(Complex.format({ re: 0.999999999999, im: 0 })).toBe("1");
  });

  it("toString (fixed decimals)", () => {
    expect(Complex.toString({ re: 1, im: 0 })).toBe("1");
    expect(Complex.toString({ re: 0, im: 1 })).toBe("i");
    expect(Complex.toString({ re: 1.23456, im: -2.5 }, 2)).toBe("1.23-2.5i");
  });

  it("eq honors tolerance", () => {
    expect(Complex.eq({ re: 1, im: 1 }, { re: 1 + 1e-13, im: 1 })).toBe(true);
    expect(Complex.eq({ re: 1, im: 1 }, { re: 1.1, im: 1 })).toBe(false);
  });

  it("clone is independent", () => {
    const a: Cx = { re: 1, im: 2 };
    const b = Complex.clone(a);
    b.re = 99;
    expect(a.re).toBe(1);
  });
});

// Forming |b|² costs half the exponent range, so the naive quotient and the naive modulus fail on
// perfectly representable numbers: |b| ≳ 1.34e154 overflows the intermediate, |b| ≲ 1.49e-162
// underflows it to exactly 0. Both are silent wrong answers in a SHARED kernel — no current consumer
// reaches them, but that is a fact about today's callers, not about the contract. (cd-div-02, cd-cpow-05)
describe("@cas/core Complex — magnitudes outside the squareable range", () => {
  const relClose = (got: number, want: number, tol = 1e-12) =>
    Number.isFinite(got) && Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));

  it("div survives an operand whose square overflows", () => {
    // Previously {re: NaN, im: 0} — |b|² = Infinity, so both components divided by Infinity.
    expect(relClose(Complex.div({ re: 1e200, im: 0 }, { re: 1e200, im: 0 }).re, 1)).toBe(true);
    expect(relClose(Complex.div({ re: 1, im: 0 }, { re: 1e200, im: 0 }).re, 1e-200)).toBe(true);
    const q = Complex.div({ re: 3, im: 4 }, { re: 0, im: 1e200 }); // (3+4i)/(1e200 i)
    expect(relClose(q.re, 4e-200)).toBe(true);
    expect(relClose(q.im, -3e-200)).toBe(true);
    expect(relClose(Complex.inv({ re: 1e200, im: 0 }).re, 1e-200)).toBe(true);
  });

  it("div survives an operand whose square underflows, instead of claiming division by zero", () => {
    // Previously threw "division by zero" for a divisor that is emphatically not zero.
    expect(relClose(Complex.div({ re: 1, im: 0 }, { re: 1e-200, im: 0 }).re, 1e200)).toBe(true);
    expect(relClose(Complex.div({ re: 1e-200, im: 0 }, { re: 1e-200, im: 0 }).re, 1)).toBe(true);
    expect(relClose(Complex.inv({ re: 1e-200, im: 0 }).re, 1e200)).toBe(true);
  });

  it("still throws on an exact zero divisor", () => {
    expect(() => Complex.div({ re: 1, im: 1 }, { re: 0, im: 0 })).toThrow(/division by zero/);
    expect(() => Complex.inv({ re: 0, im: 0 })).toThrow(/division by zero/);
  });

  it("cpow takes roots of an operand 150 orders below the old cutoff", () => {
    // The old guard returned exactly 0 for every |a| < 1e-150 while documenting itself as the a = 0
    // case. The 4th root of 1e-160 is 1e-40 — an ordinary, meaningful number.
    expect(relClose(Complex.cpow({ re: 1e-160, im: 0 }, 0.25).re, 1e-40)).toBe(true);
    expect(relClose(Complex.cpow({ re: 1e-160, im: 0 }, 0.5).re, 1e-80)).toBe(true);
    expect(relClose(Complex.cpow({ re: 1e-160, im: 0 }, -1).re, 1e160)).toBe(true);
  });

  it("cpow returns a consistent pair above the overflow threshold", () => {
    // Previously {Infinity, NaN}: r*cos(0) overflowed while r*sin(0) was Infinity*0, so the two
    // components disagreed about what had gone wrong.
    expect(relClose(Complex.cpow({ re: 1e200, im: 0 }, 0.5).re, 1e100)).toBe(true);
    expect(Number.isNaN(Complex.cpow({ re: 1e200, im: 0 }, 0.5).im)).toBe(false);
  });

  it("cpow(0) is still exactly 0 — the case the docstring actually means", () => {
    expect(Complex.cpow({ re: 0, im: 0 }, 2)).toEqual({ re: 0, im: 0 });
    expect(Complex.cpow({ re: 0, im: 0 }, 0.5)).toEqual({ re: 0, im: 0 });
  });

  it("leaves the reachable range bit-for-bit unchanged", () => {
    // The whole point of the two-path shape: the fallback must be unobservable to every operand a
    // current consumer produces, so this pins the fast path against the original expressions.
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 4 - 2;
    for (let i = 0; i < 4000; i++) {
      const a: Cx = { re: rnd(), im: rnd() };
      const b: Cx = { re: rnd(), im: rnd() };
      const d = b.re * b.re + b.im * b.im;
      if (d === 0) continue;
      const q = Complex.div(a, b);
      expect(Object.is(q.re, (a.re * b.re + a.im * b.im) / d)).toBe(true);
      expect(Object.is(q.im, (a.im * b.re - a.re * b.im) / d)).toBe(true);

      const p = rnd() * 1.5;
      const mag2 = a.re * a.re + a.im * a.im;
      if (mag2 < 1e-300) continue;
      const r = Math.pow(mag2, 0.5 * p);
      const ang = Math.atan2(a.im, a.re) * p;
      const w = Complex.cpow(a, p);
      expect(Object.is(w.re, r * Math.cos(ang))).toBe(true);
      expect(Object.is(w.im, r * Math.sin(ang))).toBe(true);
    }
  });
});
