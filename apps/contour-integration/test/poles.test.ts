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

  it("CANCELS a removable singularity exactly, instead of hedging about it", () => {
    // M1 could only say "the numerator nearly vanishes here too, so this may not be a pole". The
    // exact path decides it: the common factor is cancelled by an exact gcd and the point is simply
    // not a pole. The hedge is replaced by a fact, which is the whole shape of M2.
    const r = findPoles(parse("z/(z*(z-2))"));
    expect(r.exactlyComplete).toBe(true);
    expect(r.poles).toHaveLength(1);
    expect(r.poles[0].at[0]).toBeCloseTo(2, 12);
    expect(r.poles[0].possiblyRemovable).toBe(false);
    expect(assembleVerdict(r.certificates).level).toBe("=");
    expect(r.certificates.some((c) => c.claim.includes("removable"))).toBe(true);
  });

  it("still hedges on the NUMERIC path, where it genuinely cannot decide", () => {
    // π is not in ℚ(i), so the exact reading refuses and the floating decomposition takes over --
    // and there the "may be removable" wording is the honest one again.
    const r = findPoles(parse("pi*z/(z*(z-2))"));
    expect(r.exactlyComplete).toBe(false);
    expect(r.poles.some((p) => p.possiblyRemovable)).toBe(true);
    expect(assembleVerdict(r.certificates).level).not.toBe("=");
  });

  it("never labels a NUMERICALLY-located pole exact", () => {
    // The guarantee M1 established, restated for the inputs where it still applies: an algebraic
    // pole (z⁴+1) and a transcendental integrand both stay below `=`.
    for (const src of ["1/(1+z^4)", "sin(z)/z", "pi/(z-1)"]) {
      const r = findPoles(parse(src));
      expect(assembleVerdict(r.certificates).level).not.toBe("=");
      for (const pole of r.poles) {
        if (!pole.isExact) expect(pole.residue).toBeUndefined();
      }
    }
  });
});

describe("findPoles — the exact path", () => {
  it("reports exact residues for a Gaussian-rational integrand", () => {
    const r = findPoles(parse("1/(1+z^2)"));
    expect(r.exactlyComplete).toBe(true);
    expect(r.poles.every((p) => p.isExact && p.orderCertain)).toBe(true);
    const texts = r.poles.map((p) => p.residue?.text).sort();
    expect(texts).toEqual(["i/2", "−i/2"]); // U+2212 sorts after ASCII letters
  });

  it("gives an exact residue SUM only when every pole was pinned", () => {
    expect(findPoles(parse("1/(1+z^2)")).exactResidueSum?.text).toBe("0");
    // z⁴+1's roots are algebraic, so no exact sum is claimed at all.
    expect(findPoles(parse("1/(1+z^4)")).exactResidueSum).toBeUndefined();
  });

  it("reports an exact order where M1 could only infer one", () => {
    const r = findPoles(parse("1/(z-1)^5"));
    expect(r.poles).toHaveLength(1);
    expect(r.poles[0].order).toBe(5);
    expect(r.poles[0].orderCertain).toBe(true);
    expect(r.poles[0].isExact).toBe(true);
  });

  it("mixes exact and numeric poles without averaging the two claims", () => {
    // (z−1) is rational, z²+2 is not (roots ±i√2). The rational one keeps its exact residue; the
    // others are reported numerically, and the verdict reflects the weaker half.
    const r = findPoles(parse("1/((z-1)*(z^2+2))"));
    expect(r.exactlyComplete).toBe(false);
    expect(r.poles.filter((p) => p.isExact)).toHaveLength(1);
    expect(r.poles.filter((p) => !p.isExact).length).toBeGreaterThan(0);
    expect(assembleVerdict(r.certificates).level).not.toBe("=");
  });
});
