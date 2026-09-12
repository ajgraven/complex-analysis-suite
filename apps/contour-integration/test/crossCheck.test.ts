// The differential check the three coefficient walks share.
//
// It exists to catch a coding error in an exact walker, and the only way to guard a check like that
// is to hand it a disagreement on purpose: a walker with a sign bug would produce exactly this.
import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr";
import { crossCheckNumeric, evaluatorBindings } from "../src/families/crossCheck.js";
import { exactPiConstant } from "../src/families/piConstant.js";
import { exactConstant } from "../src/families/system.js";
import { exactBasisConstant } from "../src/families/basisConstant.js";
import type { Bindings } from "../src/families/schema.js";

describe("crossCheckNumeric", () => {
  it("is silent when the exact value agrees with the evaluator", () => {
    expect(crossCheckNumeric(parse("2*pi*i"), {}, [0, 2 * Math.PI])).toBeNull();
    expect(crossCheckNumeric(parse("-(2*pi*i)^2"), {}, [4 * Math.PI ** 2, 0])).toBeNull();
    expect(crossCheckNumeric(parse("a*pi"), { a: 0.25 }, [Math.PI / 4, 0])).toBeNull();
  });

  it("reports a sign error, which is the bug it is here for", () => {
    const got = crossCheckNumeric(parse("-(2*pi*i)^2"), {}, [-4 * Math.PI ** 2, 0]);
    expect(got).toMatch(/disagree/);
  });

  it("is RELATIVE, so a large coefficient is not reported for float64's own error", () => {
    // π³ to float64, perturbed in its last bits: a correct walk, and an absolute 1e-9 bound would
    // report it as a disagreement purely because the magnitude is 31.
    const cubed = Math.PI ** 3;
    expect(crossCheckNumeric(parse("pi^3"), {}, [cubed * (1 + 1e-15), 0])).toBeNull();
    // An error of one part in 10^8 is not rounding, at any magnitude.
    expect(crossCheckNumeric(parse("pi^3"), {}, [cubed * (1 + 1e-8), 0])).toMatch(/disagree/);
  });

  it("packs bindings for the evaluator, ignoring what is not a number", () => {
    expect(evaluatorBindings({ a: 2, b: "3", c: "inf", d: true })).toEqual({ a: [2, 0], b: [3, 0] });
  });
});

describe("the check is actually WIRED into all three coefficient walks", () => {
  // A correct walker never disagrees with the evaluator, so "is the check called?" cannot be tested
  // by handing a walker ordinary input — break-testing the wiring found exactly that gap. What makes
  // it testable is that the exact walk and the numeric evaluator read the bindings SEPARATELY, the
  // walk first: a binding whose getter answers differently the second time makes the two see
  // different parameters, which is precisely the disagreement the check exists to catch.
  //
  // Exotic, deliberately. The alternative was a check that could be deleted without any test
  // noticing, in a walker whose whole job is to be exact.
  const shifting = (): Bindings => {
    let reads = 0;
    return {
      get a(): number {
        reads += 1;
        return reads === 1 ? 0.25 : 0.5;
      },
    };
  };

  it("refuses when the walk and the evaluator saw different parameters", () => {
    const pi = exactPiConstant(parse("a*pi"), shifting());
    expect(pi.ok).toBe(false);
    expect(!pi.ok && pi.reason).toMatch(/disagree/);

    const gauss = exactConstant(parse("a*i"), shifting());
    expect(gauss.ok).toBe(false);
    expect(!gauss.ok && gauss.reason).toMatch(/disagree/);

    const basis = exactBasisConstant(parse("a*exp(2*pi*i)"), shifting());
    expect(basis.ok).toBe(false);
    expect(!basis.ok && basis.reason).toMatch(/disagree/);
  });

  it("accepts the same expressions when the binding holds still", () => {
    expect(exactPiConstant(parse("a*pi"), { a: 0.25 }).ok).toBe(true);
    expect(exactConstant(parse("a*i"), { a: 0.25 }).ok).toBe(true);
    expect(exactBasisConstant(parse("a*exp(2*pi*i)"), { a: 0.25 }).ok).toBe(true);
  });
});
