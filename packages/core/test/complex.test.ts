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
