// @cas/exact — BiPoly (exact bivariate polynomials: an outer variable over QiPoly inner coefficients).
import { describe, it, expect } from "vitest";
import { BiPoly, Gauss, QiPoly, renderBiPolyText } from "../src/index.js";

const z = BiPoly.variable(); // outer variable
const c = QiPoly.variable(); // inner variable
const kConst = (p: QiPoly) => BiPoly.constant(p);
const one = QiPoly.constant(Gauss.ONE);

describe("BiPoly basics", () => {
  it("builds f_c(z) = z² + c with the right coefficients", () => {
    const f = z.pow(2).add(kConst(c));
    expect(f.degree()).toBe(2);
    expect(f.coeff(2).equals(one)).toBe(true); // z² coeff = 1
    expect(f.coeff(1).isZero()).toBe(true);
    expect(f.coeff(0).equals(c)).toBe(true); // z⁰ coeff = c
  });

  it("multiplies over the inner ring: (z + c)(z − c) = z² − c²", () => {
    const got = z.add(kConst(c)).mul(z.sub(kConst(c)));
    const expected = z.pow(2).sub(kConst(c.mul(c)));
    expect(got.equals(expected)).toBe(true);
  });

  it("monic division is exact: (z² − c²)/(z − c) = z + c", () => {
    const q = z.pow(2).sub(kConst(c.mul(c))).divExactMonic(z.sub(kConst(c)));
    expect(q.equals(z.add(kConst(c)))).toBe(true);
  });

  it("monic division with remainder", () => {
    // (z² + c) ÷ (z − c) = z + c, remainder c² + c
    const { q, r } = z.pow(2).add(kConst(c)).divmodMonic(z.sub(kConst(c)));
    expect(q.equals(z.add(kConst(c)))).toBe(true);
    expect(r.equals(kConst(c.mul(c).add(c)))).toBe(true);
  });

  it("rejects a divisor whose leading coefficient is not a unit", () => {
    // divisor c·z − 1 has leading (z) coefficient c, degree 1 in the inner variable → not allowed
    expect(() => z.pow(2).divmodMonic(z.scaleInner(c).sub(kConst(one)))).toThrow();
  });

  it("renders as bivariate text", () => {
    // z² + z + (c + 1)
    const p = z.pow(2).add(z).add(kConst(c.add(QiPoly.int(1))));
    expect(renderBiPolyText(p, "z", "c")).toBe("z^2 + z + c + 1");
  });
});
