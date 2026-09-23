import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr";
import { Frac, QiPoly, simplestRational, toExactRational } from "../src/index.js";

// Moved from Contour Integration with the module (ADR-0047). Its behaviour inside that app is pinned by
// the app's own suites; this pins the contract a second consumer — Polynomial Root Analysis, which reads
// every typed polynomial through it — relies on.

const read = (src: string) => toExactRational(parse(src));

describe("simplestRational", () => {
  it("returns the literal a reader meant, not its binary expansion", () => {
    expect(simplestRational(0.1).equals(Frac.of(1n, 10n))).toBe(true);
    expect(simplestRational(-2.5).equals(Frac.of(-5n, 2n))).toBe(true);
    expect(simplestRational(7).equals(Frac.of(7n))).toBe(true);
  });

  it("round-trips every result back to the same double", () => {
    for (const x of [1 / 3, Math.PI, 1e-7, 123.456, -0.3]) {
      const f = simplestRational(x);
      expect(Number(f.n) / Number(f.d)).toBe(x);
    }
  });

  it("falls back to the exact dyadic value on a subnormal rather than throwing", () => {
    const f = simplestRational(5e-324);
    expect(f.d).toBe(1n << 1074n);
    expect(f.n).toBe(1n);
  });

  it("refuses a non-finite input", () => {
    expect(() => simplestRational(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
  });
});

describe("toExactRational", () => {
  it("reads a polynomial exactly, with decimals taken as the rationals they name", () => {
    const r = read("0.1*z^2 - 1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.den.equals(QiPoly.int(1))).toBe(true);
    expect(r.value.num.degree()).toBe(2);
    expect(r.value.num.coeff(2).re.equals(Frac.of(1n, 10n))).toBe(true);
    expect(r.value.num.coeff(0).re.equals(Frac.of(-1n))).toBe(true);
  });

  it("carries Gaussian coefficients and negative powers as a quotient", () => {
    const r = read("(1+i)*z + 1/z^2");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.den.degree()).toBe(2);
    expect(r.value.num.degree()).toBe(3);
  });

  it("refuses by name what is not rational over ℚ(i)", () => {
    const cases: [string, RegExp][] = [
      ["sin(z)", /not a rational function/],
      ["pi*z", /not a Gaussian rational/],
      ["z^0.5", /constant integer exponent/],
      ["z + w", /free variable 'w'/],
      ["1/(z-z)", /division by zero|identically zero/],
      ["z^300", /degree over 256/],
    ];
    for (const [src, why] of cases) {
      const r = read(src);
      expect(r.ok, src).toBe(false);
      if (!r.ok) expect(r.reason, src).toMatch(why);
    }
  });

  it("reads another variable when asked", () => {
    const r = toExactRational(parse("t^2 + 1"), "t");
    expect(r.ok && r.value.num.degree()).toBe(2);
  });
});
