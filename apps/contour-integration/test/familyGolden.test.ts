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
import type { Family, Golden } from "../src/families/schema.js";

/** The numeric bindings a fixture supplies; variant flags are not parameter values. */
const numericValues = (g: Golden): Record<string, number> =>
  Object.fromEntries(Object.entries(g.params).filter(([, v]) => typeof v === "number")) as Record<
    string,
    number
  >;

/** A fixture that selects an alternative derivation rather than binding parameters. */
const isVariant = (g: Golden): boolean =>
  Object.values(g.params).some((v) => typeof v === "boolean");

/** Run one record through the real engine at one fixture. */
function run(family: Family, g: Golden, overrides: Record<string, number> = {}) {
  const built = contourIntegrandOf(family, g.params);
  if (!built.ok) throw new Error(`${family.id}: ${built.reason}`);
  const fn = makeComplexFn(built.ast);
  const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
  const poles = findPoles(built.ast);
  const contour = instantiate(family, { values: { ...numericValues(g), ...overrides } });
  const resolved = resolveAll(contour);
  const singular = poles.poles.map((p) => ({ at: p.at, order: p.order }));
  const integral = integrateContour(f, resolved, singular);
  return { poles, integral, theorem: applyResidueTheorem(poles, integral) };
}

const cases = FAMILIES.map((f) => [f.id, f] as const);

/** The primary fixture — the first one that binds parameters rather than selecting a variant. */
const primary = (family: Family): Golden =>
  family.golden.find((g) => !isVariant(g)) ?? family.golden[0];

describe("every loaded record reproduces its own golden value through the engine", () => {
  it.each(cases)("%s", (_id, family) => {
    const g = primary(family);
    const want = typeof g.numeric === "number" ? g.numeric : g.numeric[0];

    const { theorem } = run(family, g);
    expect(theorem.exactValue).toBeDefined();
    const [re, im] = must(theorem.exactValue, "an exact value").value;

    expect(Math.abs(re - want)).toBeLessThanOrEqual(g.verifiedTo * Math.max(1, Math.abs(want)));
    // The imaginary row of `M t = r` asserts the answer is real; check the engine agrees.
    expect(Math.abs(im)).toBeLessThan(g.verifiedTo);
  });
});

describe("every fixture of every record, not just the flagship one", () => {
  // This is where a fixture earns its keep: A1's sign case (where the textbook closed form is wrong
  // and the residue route is right), A2's |a| ≶ 1 switch and its a = 0 pole-count change, and A3's
  // order ladder 2π/3 · 2⁻ⁿ. A record that reproduced only its flagship value would be exactly the
  // coverage gap invariant 3 exists to close.
  it.each(cases)("%s", (_id, family) => {
    for (const g of family.golden) {
      // `halfRange` / `closeDown` select a derivation the engine has no route for; the closing-down
      // one is executed directly below instead.
      if (isVariant(g)) continue;
      const want = typeof g.numeric === "number" ? g.numeric : g.numeric[0];
      const value = must(
        run(family, g).theorem.exactValue,
        `an exact value at ${JSON.stringify(g.params)}`,
      );
      expect(
        Math.abs(value.value[0] - want),
        `${family.id} at ${JSON.stringify(g.params)}: got ${value.value[0]} (${value.text}), want ${want}`,
      ).toBeLessThanOrEqual(g.verifiedTo * Math.max(1, Math.abs(want)));
      expect(Math.abs(value.value[1])).toBeLessThan(1e-12);
    }
  });
});

describe("the residue-theorem value does not depend on the contour's limit radius", () => {
  // `instantiate`'s DEFAULT_LIMIT_VALUE is a display default, not a claim. This is what makes that
  // true: once every selected pole is enclosed, 2πi Σ n·Res is independent of R, so the two runs
  // must agree EXACTLY — not to a tolerance. A difference would mean the winding numbers changed,
  // which is the one thing R is allowed to do and the one thing these radii must not straddle.
  const withLimit = FAMILIES.filter((f) => f.contour.limitParams.length > 0);

  it.each(withLimit.map((f) => [f.id, f] as const))("%s", (_id, family) => {
    const g = primary(family);
    const atThree = must(run(family, g, { R: 3 }).theorem.exactValue, "an exact value at R = 3");
    const atForty = must(run(family, g, { R: 40 }).theorem.exactValue, "an exact value at R = 40");
    expect(atForty.value).toEqual(atThree.value);
    expect(atForty.text).toBe(atThree.text);
  });

  it("names which families have a limit parameter at all", () => {
    // Guards the filter above from silently emptying if a record's limitParams were dropped — and
    // records that the circle families legitimately have none, their contour being closed already.
    expect(withLimit.map((f) => f.id)).toEqual([
      "semicircle-order2",
      "semicircle-quartic",
      "semicircle-order3",
    ]);
  });
});

describe("the quadrature agrees with the residue theorem, as the records claim", () => {
  it.each(cases)("%s", (_id, family) => {
    // Two routes that share no machinery. `agrees` is the engine's own comparison against the
    // quadrature's error estimate, which is the claim each record's `method` field records.
    expect(run(family, primary(family)).theorem.agrees).toBe(true);
  });
});

describe("A6's closing-down cross-check — the record's own trap, executed", () => {
  it("gets the same value closing through the lower half-plane", () => {
    // traps.closing-down-disagrees: −2πi Σ_{Im z<0} Res must equal +2πi Σ_{Im z>0} Res.
    const ast = parse("1/(1 + z^4)");
    const fn = makeComplexFn(ast);
    const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
    const poles = findPoles(ast);
    const singular = poles.poles.map((p) => ({ at: p.at, order: p.order }));

    const upIntegral = integrateContour(f, resolveAll(semicircleTemplate(4, "upper")), singular);
    const downIntegral = integrateContour(f, resolveAll(semicircleTemplate(4, "lower")), singular);
    const closedUp = must(applyResidueTheorem(poles, upIntegral).exactValue, "an upward value");
    const closedDown = must(applyResidueTheorem(poles, downIntegral).exactValue, "a downward value");

    // The two ∮ values are EQUAL, not opposite. The residue sums are exact negatives (∓i√2/4) and
    // the lower template's traversal — real axis −R→R, then θ: 0 → −π — is clockwise, so its
    // identity carries the other sign. The two cancel, and both closures land on the same number.
    expect(closedDown.value[0]).toBeCloseTo(closedUp.value[0], 13);
    expect(closedUp.value[0]).toBeCloseTo(2.2214414690791831, 13);

    // Equality alone is NOT evidence, and the record says why: an engine with both the orientation
    // and the half-plane predicate backwards "would agree with itself while being wrong twice".
    // What rules that out is that the two contours enclose genuinely different poles.
    const enclosed = (r: typeof upIntegral): Cx[] =>
      r.windings.filter((w) => w.decided && w.n !== 0).map((w) => w.at);
    expect(enclosed(upIntegral)).toHaveLength(2);
    expect(enclosed(downIntegral)).toHaveLength(2);
    expect(enclosed(upIntegral).every(([, im]) => im > 0)).toBe(true);
    expect(enclosed(downIntegral).every(([, im]) => im < 0)).toBe(true);
  });
});

describe("instantiate", () => {
  it("marks the limit parameter so the UI can animate R → ∞", () => {
    const a6 = must(
      FAMILIES.find((f) => f.id === "semicircle-quartic"),
      "A6",
    );
    const R = must(instantiate(a6, { values: { R: 7 } }).params.R, "the R parameter");
    expect(R.value).toBe(7);
    expect(R.limit).toEqual({ to: "inf" });
    expect(R.scale).toBe("log");
  });

  it("drops the Pass-5 fields, which belong to the ledger and not to geometry", () => {
    for (const piece of instantiate(FAMILIES[0], { values: { a: 2, b: 1 } }).pieces) {
      expect(piece).not.toHaveProperty("coefficients");
      expect(piece).not.toHaveProperty("bonus");
    }
  });

  it("refuses to guess a missing family parameter", () => {
    expect(() => instantiate(FAMILIES[0])).toThrow(/parameter 'a' has no value/);
  });

  it("reads the real variable as z when the real line IS the contour", () => {
    const a5 = must(
      FAMILIES.find((f) => f.id === "semicircle-order2"),
      "A5",
    );
    const built = contourIntegrandOf(a5);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // 1/(1 + x²)² read in z: at z = 1 it is 1/4.
    expect(makeComplexFn(built.ast)([1, 0], [0, 0])[0]).toBeCloseTo(0.25, 14);
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
