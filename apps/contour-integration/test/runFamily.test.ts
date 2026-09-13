// The door between the corpus and the UI (`src/families/runFamily.ts`).
//
// Three properties are tested here rather than left to inspection, because each of them is the kind
// that fails silently: a record that should not be offered being offered, a fixture that selects an
// alternative derivation being treated as a parameter binding, and a geometry override leaking into
// the integrand. None of the three would make a number look wrong.
import { describe, expect, it } from "vitest";
import { makeComplexFn } from "@cas/expr";
import { FAMILIES } from "../src/families/index.js";
import { a1CircleLinearCos } from "../src/families/records/a1-circle-linear-cos.js";
import { a4CircleCifTaylor } from "../src/families/records/a4-circle-cif-taylor.js";
import { a5SemicircleOrder2 } from "../src/families/records/a5-semicircle-order2.js";
import { a6SemicircleQuartic } from "../src/families/records/a6-semicircle-quartic.js";
import { b2JordanStrict } from "../src/families/records/b2-jordan-strict.js";
import {
  isVariant,
  numericBindings,
  offeredFamilies,
  primaryGolden,
  runFamily,
  solveFamily,
} from "../src/families/runFamily.js";
import type { Family, Golden } from "../src/families/schema.js";

const must = <T,>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new Error(`expected ${what} to be present`);
  return v;
};

describe("offeredFamilies is the only door, and it is the loader's", () => {
  it("offers every record that passed the invariants, grouped by tier", () => {
    const offered = offeredFamilies();
    expect(offered.count).toBe(FAMILIES.length);
    expect(offered.dropped).toEqual([]);
    expect(offered.tiers.map((t) => t.tier)).toEqual(["A", "B", "C", "D", "E"]);
    expect(offered.tiers.flatMap((t) => t.families.map((f) => f.id))).toEqual(
      FAMILIES.map((f) => f.id),
    );
  });

  it("does NOT offer a record that fails an invariant", () => {
    // Invariant 2: every family declares at least one trap. The clone is otherwise a good record, so
    // a door wired to `FAMILIES` instead of to `loadFamilies` would hand this straight to the UI as a
    // worked example — and a worked example that cannot be worked is worse than a missing one.
    const untrapped: Family = { ...a5SemicircleOrder2, traps: [] };
    const offered = offeredFamilies([untrapped]);
    expect(offered.count).toBe(0);
    expect(offered.tiers).toEqual([]);
    expect(offered.dropped.map((v) => v.invariant)).toContain(2);
  });

  it("offers the same record once it is intact — so the check above discriminates", () => {
    // Without this, a door that offered NOTHING would pass the test above (review §8.6: a test that
    // does not fail against the broken code is not guarding anything).
    expect(offeredFamilies([a5SemicircleOrder2]).count).toBe(1);
  });
});

describe("isVariant — a fixture that selects a derivation, not a binding", () => {
  const fixture = (family: Family, key: string): Golden =>
    must(
      family.golden.find((g) => Object.keys(g.params).includes(key)),
      `a ${family.id} fixture keyed by ${key}`,
    );

  it("recognises the three variant keys the corpus actually uses", () => {
    // Decided by NAME. `halfRange` and `closeDown` are booleans but B2's `companion: "re"` is a
    // string, so keying off the type would treat that one as a parameter binding — which is exactly
    // how a test came to compare the wrong half of the contour value against zero.
    expect(isVariant(a5SemicircleOrder2, fixture(a5SemicircleOrder2, "halfRange"))).toBe(true);
    expect(isVariant(a6SemicircleQuartic, fixture(a6SemicircleQuartic, "closeDown"))).toBe(true);
    expect(isVariant(b2JordanStrict, fixture(b2JordanStrict, "companion"))).toBe(true);
  });

  it("does not mistake a declared SYMBOL for a variant", () => {
    // A4's fixtures name `g: "exp(z)"` — the entire function whose Taylor coefficients the contour
    // reads off. Counting that as a variant skipped every one of A4's fixtures.
    const withG = fixture(a4CircleCifTaylor, "g");
    expect(isVariant(a4CircleCifTaylor, withG)).toBe(false);
  });

  it("treats an ordinary parameter binding as executable", () => {
    for (const family of FAMILIES) {
      expect(isVariant(family, primaryGolden(family))).toBe(false);
    }
  });
});

describe("the two override channels stay separate", () => {
  // A1's parameters live in the INTEGRAND (`1/(a + b·cos θ)`) and not in its geometry, which is
  // always the unit circle. That makes it the record that can tell the channels apart.
  const g = primaryGolden(a1CircleLinearCos);
  const at = (family: Family, opts: Parameters<typeof runFamily>[2]): number => {
    const r = runFamily(family, g, opts);
    if (!r.ok) throw new Error(r.reason);
    const fn = makeComplexFn(r.run.ast);
    return fn([0.5, 0.25], [0, 0])[0];
  };

  it("a BINDING override changes the integrand", () => {
    expect(at(a1CircleLinearCos, { bindings: { a: 17 } })).not.toBeCloseTo(
      at(a1CircleLinearCos, {}),
      6,
    );
  });

  it("a GEOMETRY override does NOT — even when it shares the name of a bound parameter", () => {
    // The whole reason for two channels. Tier B renames its radius `R_lim` precisely because `R`
    // there is the rational function `R(x)`, a declared symbol of the integrand; one merged channel
    // works for today's corpus and substitutes a number for a function the first time a record
    // reuses a name.
    expect(at(a1CircleLinearCos, { geometry: { a: 17 } })).toBeCloseTo(
      at(a1CircleLinearCos, {}),
      12,
    );
  });

  it("still lets a geometry override move the geometry", () => {
    const base = runFamily(a6SemicircleQuartic, primaryGolden(a6SemicircleQuartic), {});
    const wide = runFamily(a6SemicircleQuartic, primaryGolden(a6SemicircleQuartic), {
      geometry: { R: 40 },
    });
    if (!base.ok || !wide.ok) throw new Error("A6 should run at both radii");
    expect(must(wide.run.contour.params.R, "R").value).toBe(40);
    expect(must(base.run.contour.params.R, "R").value).not.toBe(40);
  });
});

describe("failure about a record is a value, not an exception", () => {
  it("reports a fixture that binds nothing instead of throwing", () => {
    // `contourIntegrandOf` refuses before `instantiate` is reached, and that order is the right one:
    // an unbound parameter makes the INTEGRAND unbuildable, which is a stronger statement than a
    // slider having no value to show.
    const empty: Golden = { params: {}, value: "", numeric: 0, verifiedTo: 1, method: "test" };
    const r = runFamily(a1CircleLinearCos, empty);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/parameter 'a' is unbound/);
  });

  it("carries no run when the record never built, so a caller cannot show half of one", () => {
    const empty: Golden = { params: {}, value: "", numeric: 0, verifiedTo: 1, method: "test" };
    const r = solveFamily(a1CircleLinearCos, empty);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.run).toBeUndefined();
  });
});

describe("numericBindings", () => {
  it("keeps only what a slider can hold", () => {
    expect(numericBindings({ a: 5, flag: true, name: "re", b: -1.5 })).toEqual({ a: 5, b: -1.5 });
  });
});
