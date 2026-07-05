import { describe, expect, it } from "vitest";
import { Complex } from "../../app/complex.mjs";

// Golden + invariant tests for the ESM leaf port. These are the target test form (native
// ESM import, Vitest) and become part of @cas/core's golden corpus in Phase 3.

type C = { re: number; im: number };
const near = (a: number, b: number, tol = 1e-12) => Math.abs(a - b) < tol;
const cNear = (z: C, re: number, im: number, tol = 1e-12) =>
  near(z.re, re, tol) && near(z.im, im, tol);

describe("Complex (ESM leaf)", () => {
  it("basic arithmetic golden values", () => {
    expect(cNear(Complex.add({ re: 1, im: 2 }, { re: 3, im: 4 }), 4, 6)).toBe(true);
    expect(cNear(Complex.sub({ re: 1, im: 2 }, { re: 3, im: 4 }), -2, -2)).toBe(true);
    expect(cNear(Complex.mul({ re: 1, im: 2 }, { re: 3, im: 4 }), -5, 10)).toBe(true);
    expect(cNear(Complex.conj({ re: 1, im: 2 }), 1, -2)).toBe(true);
    expect(cNear(Complex.inv({ re: 1, im: 1 }), 0.5, -0.5)).toBe(true);
    // 1 / i = -i
    expect(cNear(Complex.div({ re: 1, im: 0 }, { re: 0, im: 1 }), 0, -1)).toBe(true);
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
  });

  it("cpow (principal branch)", () => {
    expect(cNear(Complex.cpow({ re: 4, im: 0 }, 0.5), 2, 0, 1e-12)).toBe(true);
    expect(cNear(Complex.cpow({ re: 0, im: 1 }, 2), -1, 0, 1e-12)).toBe(true);
  });

  it("parse", () => {
    expect(cNear(Complex.parse("1+2i"), 1, 2)).toBe(true);
    expect(cNear(Complex.parse("-i"), 0, -1)).toBe(true);
    expect(cNear(Complex.parse("3"), 3, 0)).toBe(true);
    expect(cNear(Complex.parse("1.5e-3+2.1e2i"), 1.5e-3, 2.1e2)).toBe(true);
  });

  it("format", () => {
    expect(Complex.format({ re: 1, im: 0 })).toBe("1");
    expect(Complex.format({ re: 0, im: 1 })).toBe("i");
    expect(Complex.format({ re: 0, im: -1 })).toBe("-i");
    expect(Complex.format({ re: 1, im: -1 })).toBe("1-i");
    expect(Complex.format({ re: -5, im: 10 })).toBe("-5+10i");
  });

  it("eq honors tolerance", () => {
    expect(Complex.eq({ re: 1, im: 1 }, { re: 1 + 1e-13, im: 1 })).toBe(true);
    expect(Complex.eq({ re: 1, im: 1 }, { re: 1.1, im: 1 })).toBe(false);
  });
});
