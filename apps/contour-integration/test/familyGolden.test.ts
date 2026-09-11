import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";
import { resolveAll } from "../src/engine/contour/model.js";
import { semicircleTemplate } from "../src/engine/contour/templates.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { applyResidueTheorem } from "../src/engine/residueTheorem.js";
import { findPoles } from "../src/kernel/poles.js";
import { FAMILIES, loadFamilies } from "../src/families/index.js";
import { contourIntegrandOf, instantiate } from "../src/families/instantiate.js";
import type { Cx } from "../src/kernel/geom.js";
import type { Family } from "../src/families/schema.js";

/** Run one record through the real engine at a given limit-parameter value. */
function run(family: Family, values: Record<string, number>) {
  const ast = parse(contourIntegrandOf(family));
  const fn = makeComplexFn(ast);
  const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
  const poles = findPoles(ast);
  const contour = instantiate(family, { values });
  const resolved = resolveAll(contour);
  const singular = poles.poles.map((p) => ({ at: p.at, order: p.order }));
  const integral = integrateContour(f, resolved, singular);
  return { poles, integral, theorem: applyResidueTheorem(poles, integral) };
}

/** The primary fixture — the one with no variant flag. */
const primary = (family: Family) =>
  family.golden.find((g) => Object.keys(g.params).length === 0) ?? family.golden[0];

describe("every loaded record reproduces its own golden value through the engine", () => {
  it.each(FAMILIES.map((f) => [f.id, f] as const))("%s", (_id, family) => {
    const g = primary(family);
    const want = typeof g.numeric === "number" ? g.numeric : g.numeric[0];

    const { theorem } = run(family, { R: 4 });
    expect(theorem.exactValue).toBeDefined();
    const [re, im] = must(theorem.exactValue, "an exact value").value;

    expect(re).toBeCloseTo(want, 13);
    expect(Math.abs(re - want)).toBeLessThanOrEqual(g.verifiedTo * Math.max(1, Math.abs(want)));
    // The imaginary row of `M t = r` asserts the answer is real; check the engine agrees.
    expect(Math.abs(im)).toBeLessThan(g.verifiedTo);
  });
});

describe("the residue-theorem value does not depend on the contour's radius", () => {
  // `instantiate`'s DEFAULT_LIMIT_VALUE is a display default, not a claim. This is what makes that
  // true: once every selected pole is enclosed, 2πi Σ n·Res is independent of R, so the two runs
  // must agree EXACTLY — not to a tolerance. A difference would mean the winding numbers changed,
  // which is the one thing R is allowed to do and the one thing these radii must not straddle.
  it.each(FAMILIES.map((f) => [f.id, f] as const))("%s", (_id, family) => {
    const near = run(family, { R: 3 });
    const far = run(family, { R: 40 });
    const atThree = must(near.theorem.exactValue, "an exact value at R = 3");
    const atForty = must(far.theorem.exactValue, "an exact value at R = 40");
    expect(atForty.value).toEqual(atThree.value);
    expect(atForty.text).toBe(atThree.text);
  });
});

describe("the quadrature agrees with the residue theorem, as the records claim", () => {
  it.each(FAMILIES.map((f) => [f.id, f] as const))("%s", (_id, family) => {
    const { theorem } = run(family, { R: 4 });
    // Two routes that share no machinery. `agrees` is the engine's own comparison against the
    // quadrature's error estimate, which is the claim each record's `method` field records.
    expect(theorem.agrees).toBe(true);
  });
});

describe("A6's closing-down cross-check — the record's own trap, executed", () => {
  it("gets the same value closing through the lower half-plane", () => {
    // traps.closing-down-disagrees: −2πi Σ_{Im z<0} Res must equal +2πi Σ_{Im z>0} Res. The two
    // residue sums here are exact negatives (∓i√2/4), and the orientation of the lower semicircle
    // supplies the other sign. Running it is the only way to know both were applied.
    const ast = parse("1/(1 + z^4)");
    const fn = makeComplexFn(ast);
    const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
    const poles = findPoles(ast);
    const singular = poles.poles.map((p) => ({ at: p.at, order: p.order }));

    const up = applyResidueTheorem(
      poles,
      integrateContour(f, resolveAll(semicircleTemplate(4, "upper")), singular),
    );
    const down = applyResidueTheorem(
      poles,
      integrateContour(f, resolveAll(semicircleTemplate(4, "lower")), singular),
    );

    const closedUp = must(up.exactValue, "an exact value closing upward");
    const closedDown = must(down.exactValue, "an exact value closing downward");

    // The two ∮ values are EQUAL, not opposite. The residue sums are exact negatives (∓i√2/4) and
    // the lower template's traversal — real axis −R→R, then θ: 0 → −π — is clockwise, so its
    // identity carries the other sign. The two cancel, and both closures land on the same number.
    expect(closedDown.value[0]).toBeCloseTo(closedUp.value[0], 13);
    expect(closedUp.value[0]).toBeCloseTo(2.2214414690791831, 13);

    // Equality alone is NOT evidence, and the record says why: an engine with both the orientation
    // and the half-plane predicate backwards "would agree with itself while being wrong twice".
    // What rules that out is that the two contours enclose genuinely different poles — two above
    // the axis and two below — so the agreement comes from two different residue sums.
    const enclosed = (r: ReturnType<typeof integrateContour>): Cx[] =>
      r.windings.filter((w) => w.decided && w.n !== 0).map((w) => w.at);
    const above = enclosed(integrateContour(f, resolveAll(semicircleTemplate(4, "upper")), singular));
    const below = enclosed(integrateContour(f, resolveAll(semicircleTemplate(4, "lower")), singular));
    expect(above).toHaveLength(2);
    expect(below).toHaveLength(2);
    expect(above.every(([, im]) => im > 0)).toBe(true);
    expect(below.every(([, im]) => im < 0)).toBe(true);
  });
});

describe("instantiate", () => {
  it("marks the limit parameter so the UI can animate R → ∞", () => {
    const R = must(instantiate(FAMILIES[0], { values: { R: 7 } }).params.R, "the R parameter");
    expect(R.value).toBe(7);
    expect(R.limit).toEqual({ to: "inf" });
    expect(R.scale).toBe("log");
  });

  it("drops the Pass-5 fields, which belong to the ledger and not to geometry", () => {
    const contour = instantiate(FAMILIES[0]);
    for (const piece of contour.pieces) {
      expect(piece).not.toHaveProperty("coefficients");
      expect(piece).not.toHaveProperty("bonus");
    }
  });

  it("refuses to guess a missing family parameter", () => {
    const withParam: Family = {
      ...FAMILIES[0],
      parameters: [{ name: "a", domain: "real", constraints: [] }],
    };
    expect(() => instantiate(withParam)).toThrow(/parameter 'a' has no value/);
  });

  it("rewrites the target's real variable into z", () => {
    expect(contourIntegrandOf(FAMILIES[0])).toBe("1/(1 + z^2)^2");
  });
});

describe("the loaded corpus is the one the engine ran", () => {
  it("offers exactly the records that passed every invariant", () => {
    const { families } = loadFamilies();
    expect([...families.keys()]).toEqual(FAMILIES.map((f) => f.id));
  });
});

/** Narrow an optional without a non-null assertion — the repo forbids `!`, and a thrown message
 *  names what was missing instead of producing a TypeError three lines later. */
function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`expected ${what} to be present`);
  return v;
}
