import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr";
import { assembleVerdict } from "@cas/rigor";
import { findPoles, type Pole } from "../src/kernel/poles.js";

const poles = (src: string): readonly Pole[] => findPoles(parse(src)).poles;

/** Sort by argument then modulus, so a comparison does not depend on the seeding order. */
const sorted = (ps: readonly Pole[]): Pole[] =>
  [...ps].sort(
    (a, b) =>
      Math.atan2(a.at[1], a.at[0]) - Math.atan2(b.at[1], b.at[0]) ||
      Math.hypot(...a.at) - Math.hypot(...b.at),
  );

const near = (p: Pole, re: number, im: number, tol = 1e-7): boolean =>
  Math.hypot(p.at[0] - re, p.at[1] - im) < tol;

describe("findPoles — locations", () => {
  it("finds the simple pole of 1/z", () => {
    const ps = poles("1/z");
    expect(ps).toHaveLength(1);
    expect(near(ps[0], 0, 0)).toBe(true);
    expect(ps[0].order).toBe(1);
  });

  it("finds ±i for the Cauchy kernel 1/(1+z^2)", () => {
    const ps = sorted(poles("1/(1+z^2)"));
    expect(ps).toHaveLength(2);
    expect(ps.some((p) => near(p, 0, 1))).toBe(true);
    expect(ps.some((p) => near(p, 0, -1))).toBe(true);
    expect(ps.every((p) => p.order === 1)).toBe(true);
  });

  it("finds the four eighth-roots of −1 for 1/(1+z^4)", () => {
    // Gallery entry A6, whose value π/√2 comes from exactly these two upper-half-plane poles.
    const ps = poles("1/(1+z^4)");
    expect(ps).toHaveLength(4);
    for (const k of [1, 3, 5, 7]) {
      const th = (k * Math.PI) / 4;
      expect(ps.some((p) => near(p, Math.cos(th), Math.sin(th), 1e-6))).toBe(true);
    }
  });

  it("finds poles off the axes", () => {
    // z² + 2z + 2 has roots −1 ± i.
    const ps = poles("z/(z^2+2z+2)");
    expect(ps).toHaveLength(2);
    expect(ps.some((p) => near(p, -1, 1, 1e-6))).toBe(true);
    expect(ps.some((p) => near(p, -1, -1, 1e-6))).toBe(true);
  });

  it("handles complex literals in the numerator", () => {
    // Exercises the @cas/expr implicit-multiplication change end to end.
    expect(poles("(3+4i)/(z^3-1)")).toHaveLength(3);
  });
});

describe("findPoles — multiplicity", () => {
  it("reports order 2 for 1/(1+z^2)^2", () => {
    const ps = poles("1/(1+z^2)^2");
    expect(ps).toHaveLength(2);
    expect(ps.every((p) => p.order === 2)).toBe(true);
    expect(ps.some((p) => near(p, 0, 1, 1e-5))).toBe(true);
  });

  it("reports order 3, and admits the order is an inference", () => {
    const ps = poles("1/z^3");
    expect(ps).toHaveLength(1);
    expect(ps[0].order).toBe(3);
    // Clustering floats is not the same as knowing the multiplicity. The honest path — squarefree
    // decomposition over ℚ(i), where the order is known before any root is approximated — is M2.
    expect(typeof ps[0].orderCertain).toBe("boolean");
  });
});

describe("findPoles — honest refusals", () => {
  it("claims nothing for a non-rational integrand", () => {
    for (const src of ["sin(z)/z", "exp(1/z)", "conjugate(z)"]) {
      const r = findPoles(parse(src));
      expect(r.rational).toBe(false);
      expect(r.poles).toEqual([]);
      expect(assembleVerdict(r.certificates).level).toBe("?");
    }
  });

  it("reports no poles for a polynomial", () => {
    const r = findPoles(parse("z^2 + 1"));
    expect(r.rational).toBe(true);
    expect(r.poles).toEqual([]);
  });

  it("flags a possibly-removable singularity instead of silently dropping it", () => {
    // fToRational does not reduce to lowest terms, so the shared factor really does survive. Quietly
    // deleting a point that might be a genuine pole would change an integral with no visible cause.
    const r = findPoles(parse("z/(z*(z-2))"));
    expect(r.poles.some((p) => p.possiblyRemovable)).toBe(true);
    expect(assembleVerdict(r.certificates).level).toBe("?");
  });

  it("never labels a numerically-located pole exact", () => {
    // Floating roots are estimates. The verdict must say so — this is the guard that stops M0's
    // numbers from quietly reading as M2's.
    for (const src of ["1/z", "1/(1+z^2)", "1/(1+z^4)", "z^2+1"]) {
      expect(assembleVerdict(findPoles(parse(src)).certificates).level).not.toBe("=");
    }
  });
});
