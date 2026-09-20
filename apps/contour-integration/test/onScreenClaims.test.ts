// What the record card SAYS, checked against what the engine computes.
//
// M8 step 0.1. The review that opened M8 found three sentences on this card that a referee would
// strike, and the suite was green through all of them — because **nothing asserted any of them**.
// The claim line, the relation line and the contour-integrand line were rendered inside
// `shell/app.ts`'s closure and read by no test, so a sentence could contradict the number beside it
// indefinitely. The three functions now live in `families/describe.ts`, which is DOM-free, and this
// file is what stands between them and that happening again.
//
// The properties, each falsifiable against the code as it was:
//
//  1. the claim printed at a fixture, evaluated at that fixture's parameters, IS the fixture's value
//     — false before, at five records (`2*pi/sqrt(a^2 - b^2)` printed at `a = -2`);
//  2. a general closed form is shown only where it holds — the same defect, from the other side;
//  3. no relation sentence says the target is a functional of `∮` — false before, at seventeen
//     records, and on C1 it printed the exact misconception the record exists to correct;
//  4. the printed contour integrand has the pole order the residues table reports — false before,
//     at A4, whose auxiliary is pre-Jacobian;
//  5. a record's declared kernel bound is stated for ITS kernel — false before, at G3, which carried
//     G1's `cot` bound.
import { describe, expect, it } from "vitest";
import { evaluate, parse, type Complex } from "@cas/expr";

import {
  closedFormClaim,
  contourIntegrandExpr,
  contourIntegrandText,
  relationText,
} from "../src/families/describe.js";
import { loadFamilies } from "../src/families/index.js";
import { findPoles } from "../src/kernel/poles.js";
import type { Family, Golden } from "../src/families/schema.js";

const { families } = loadFamilies();
const ALL = [...families.values()];

function bindings(params: Golden["params"]): Record<string, Complex> {
  const scope: Record<string, Complex> = {};
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === "number") scope[name] = [value, 0];
  }
  return scope;
}

function asComplex(v: unknown): Complex {
  if (!Array.isArray(v) || v.length !== 2) throw new Error(`not a complex value: ${String(v)}`);
  return v as Complex;
}

/**
 * Read a DISPLAY closed form as an expression — **verbatim**.
 *
 * This used to rewrite three spellings the language did not have (`sech`, `coth`, and a capitalised
 * `Gamma`), which was the honest thing to do while the gap was real but left the corpus written in a
 * notation nothing could read. M8 step 0.4 closed it from both ends: `sech`/`csch`/`coth` are
 * builtins now, because rewriting them as `1/cosh` and `1/tanh` would have typeset a different form
 * of the same number; and `Gamma` was normalised to the table's `gamma`, which prints `\Gamma` and so
 * loses nothing. Every fixture's value is therefore parsed exactly as it is displayed, and a value
 * that does not parse fails the test by name.
 */
function evaluateAt(text: string, params: Golden["params"]): Complex {
  return asComplex(evaluate(parse(text), [0, 0], [0, 0], undefined, bindings(params)));
}

function want(g: Golden): Complex {
  return typeof g.numeric === "number" ? [g.numeric, 0] : [g.numeric[0], g.numeric[1]];
}

function close(got: Complex, expected: Complex): boolean {
  const scale = Math.max(1, Math.abs(expected[0]), Math.abs(expected[1]));
  return (
    Math.abs(got[0] - expected[0]) <= 1e-9 * scale && Math.abs(got[1] - expected[1]) <= 1e-9 * scale
  );
}

const fixtures: { family: Family; golden: Golden; where: string }[] = ALL.flatMap((family) =>
  family.golden.map((golden, k) => ({
    family,
    golden,
    where: `${family.id}[${k}] {${
      Object.entries(golden.params)
        .map(([n, v]) => `${n}=${String(v)}`)
        .join(", ") || "-"
    }}`,
  })),
);

describe("the claim the record card prints", () => {
  it("covers every record and fixture", () => {
    expect(ALL).toHaveLength(28);
    expect(fixtures.length).toBeGreaterThanOrEqual(79);
  });

  it("evaluates, at that fixture's parameters, to that fixture's value", () => {
    const wrong: string[] = [];
    for (const { family, golden, where } of fixtures) {
      const claim = closedFormClaim(family, golden);
      let got: Complex;
      try {
        got = evaluateAt(claim.atFixture, golden.params);
      } catch (e) {
        wrong.push(`${where}: "${claim.atFixture}" did not evaluate — ${(e as Error).message}`);
        continue;
      }
      if (!close(got, want(golden))) {
        wrong.push(
          `${where}: "${claim.atFixture}" is ${got[0]} + ${got[1]}i, but the fixture's value is ${want(golden)[0]} + ${want(golden)[1]}i`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  it("shows a general closed form only where that form is true here", () => {
    const wrong: string[] = [];
    const prose = new Set<string>();
    let proseFixtures = 0;
    let evaluated = 0;
    for (const { family, golden, where } of fixtures) {
      const { general } = closedFormClaim(family, golden);
      if (general === null) continue;
      let got: Complex;
      try {
        got = evaluateAt(general, golden.params);
      } catch {
        // A general form need not be an evaluable expression: D4 and D5 state a relation between
        // named unknowns ("T1 = -pi/4 and T0 = pi/4 for R = 1/(1+x^2)^2"). Those carry their own
        // scope in words and are gated by `simplifiedWhen`, which the next test pins.
        //
        // **Counted rather than swallowed.** An unbounded `continue` here would let the whole test
        // go vacuous the day a general form stopped parsing — every record would land in this
        // branch and the assertion below would be about nothing. So the records that take it are
        // pinned BY NAME, and the count of fixtures with them.
        prose.add(family.id);
        proseFixtures += 1;
        continue;
      }
      evaluated += 1;
      if (!close(got, want(golden))) {
        wrong.push(
          `${where}: the general form "${general}" is ${got[0]} + ${got[1]}i here, but the value is ${want(golden)[0]} + ${want(golden)[1]}i`,
        );
      }
    }
    expect(wrong).toEqual([]);
    expect([...prose].sort()).toEqual(["log-cubed-keyhole", "log-squared-keyhole"]);
    expect(proseFixtures).toBe(2);
    expect(evaluated).toBe(55);
  });

  // The five records whose simplified form is restricted. Each must be WITHHELD somewhere and SHOWN
  // somewhere: a condition that never fires is a guard in name only, and one that always fires is
  // the defect back again.
  it.each([
    ["circle-linear-cos", "a > 0"],
    ["circle-poisson", "abs(a) < 1"],
    ["log-squared-keyhole", "p == 2"],
    ["log-cubed-keyhole", "p == 1"],
  ])("gates %s's closed form on %s, and the gate both fires and holds", (id, condition) => {
    const family = families.get(id);
    expect(family, id).toBeDefined();
    if (family === undefined) return;
    expect(family.closedForm.simplifiedWhen).toBe(condition);
    const shown = family.golden.filter((g) => closedFormClaim(family, g).general !== null);
    const withheld = family.golden.filter((g) => closedFormClaim(family, g).general === null);
    expect(shown.length, `${id}: shown at no fixture`).toBeGreaterThan(0);
    expect(withheld.length, `${id}: withheld at no fixture`).toBeGreaterThan(0);
  });

  it("shows A3's closed form at every fixture, because it is general in n", () => {
    const a3 = families.get("circle-cos-n-theta");
    expect(a3).toBeDefined();
    if (a3 === undefined) return;
    // Its `simplified` was `pi/6` — the value at `n = 2` and at no other `n`. A gate would have
    // hidden it at four fixtures out of five; the general form needs none.
    expect(a3.closedForm.simplifiedWhen).toBeUndefined();
    for (const g of a3.golden) {
      expect(closedFormClaim(a3, g).general, JSON.stringify(g.params)).toBe("(2*pi/3)*2^(-n)");
    }
  });

  it("names a refusing fixture's value as one the derivation does not establish", () => {
    const refusing = fixtures.filter(({ family, golden }) => closedFormClaim(family, golden).refusal !== null);
    // D3's two integer-`a` fixtures, where the keyhole collapses and the value survives.
    expect(refusing.map((f) => f.where)).toHaveLength(2);
    for (const { family, golden } of refusing) {
      expect(closedFormClaim(family, golden).refusal).toBeTruthy();
    }
  });
});

describe("the relation the record card prints", () => {
  it("never says the target is a functional of ∮", () => {
    const wrong: string[] = [];
    for (const family of ALL) {
      const text = relationText(family);
      if (text === "") continue;
      const relation = family.auxiliary?.relation ?? "";
      if (text.includes(`is ${relation} of ∮`)) wrong.push(`${family.id}: "${text}"`);
    }
    expect(wrong).toEqual([]);
  });

  it("applies the functional to the integral over the target pieces", () => {
    const missing: string[] = [];
    for (const family of ALL) {
      const aux = family.auxiliary;
      if (aux === undefined) continue;
      if (family.residueSelection.targetTerms?.[0] !== undefined) continue; // tier G: a residue term
      if (aux.relation === "components") continue; // several unknowns, no one functional
      const text = relationText(family);
      if (!text.includes(`${aux.relation} of the integral over the target piece`)) {
        missing.push(`${family.id}: "${text}"`);
      }
    }
    expect(missing).toEqual([]);
    // The clause is worth nothing if no record reaches it.
    expect(ALL.filter((f) => relationText(f).includes("of the integral over the target piece")).length)
      .toBeGreaterThan(10);
  });

  it("counts the target pieces the record actually declares", () => {
    const c1 = families.get("indented-sinc");
    expect(c1).toBeDefined();
    if (c1 === undefined) return;
    // C1's real axis is cut in two by the indentation, so it carries two target pieces.
    expect(c1.contour.pieces.filter((p) => p.role === "target")).toHaveLength(2);
    expect(relationText(c1)).toContain("the integral over the target pieces in the limit");
    const b1 = families.get("jordan-cosine-kernel");
    expect(b1).toBeDefined();
    if (b1 === undefined) return;
    expect(relationText(b1)).toContain("the integral over the target piece in the limit");
  });
});

describe("the contour integrand the record card prints", () => {
  it("is what the engine integrates, including the substitution's Jacobian", () => {
    const a4 = families.get("circle-cif-taylor");
    expect(a4).toBeDefined();
    if (a4 === undefined) return;
    const printed = contourIntegrandExpr(a4);
    // The auxiliary alone is `exp(z)/z^n`, whose pole at 0 has order n; the Jacobian dθ = dz/(iz)
    // raises it to n + 1, which is the order the residues table reports.
    expect(printed).toContain(a4.auxiliary?.integrand ?? "?");
    expect(printed).toContain("1/(i*z)");
    for (const golden of a4.golden) {
      const n = golden.params.n;
      if (typeof n !== "number") continue;
      const src = printed.replace(/\bn\b/g, String(n));
      const report = findPoles(parse(src));
      const atOrigin = report.poles.find((p) => Math.hypot(p.at[0], p.at[1]) < 1e-12);
      expect(atOrigin, `A4 at n = ${n}: no pole at the origin in "${src}"`).toBeDefined();
      expect(atOrigin?.order, `A4 at n = ${n}`).toBe(n + 1);
    }
  });

  it("names the Jacobian once, not twice", () => {
    const a4 = families.get("circle-cif-taylor");
    expect(a4).toBeDefined();
    if (a4 === undefined) return;
    const jacobian = a4.targets[0]?.substitution?.jacobian;
    expect(jacobian).toBe("1/(i*z)");
    const text = contourIntegrandText(a4);
    // Once in the integrand, where it belongs; the suffix names the substitution's map instead.
    expect(text.split(String(jacobian)).length - 1).toBe(1);
    expect(text).toContain("with  z = exp(i*theta)");
  });

  it("leaves a record with no substitution as it was", () => {
    const b1 = families.get("jordan-cosine-kernel");
    expect(b1).toBeDefined();
    if (b1 === undefined) return;
    expect(contourIntegrandExpr(b1)).toBe(b1.auxiliary?.integrand);
  });
});

describe("a record's declared bounds name its own kernel", () => {
  it("states the csc bound in the csc record, not cot's", () => {
    const g3 = families.get("series-csc-kernel-collision");
    expect(g3).toBeDefined();
    if (g3 === undefined) return;
    const bound = g3.hypotheses.find((h) => h.id === "kernel-uniformly-bounded");
    expect(bound).toBeDefined();
    expect(bound?.statement).not.toContain("cot");
    expect(bound?.check).not.toContain("cot");
    expect(bound?.statement).toContain("csc");
    for (const lemma of g3.vanishingLemmas) {
      expect(lemma.sideCondition, lemma.piece).not.toContain("cot");
      expect(lemma.discharge, lemma.piece).not.toContain("coth");
    }
  });

  it("keeps cot's bound in the cot record", () => {
    const g1 = families.get("series-cot-collision");
    expect(g1).toBeDefined();
    if (g1 === undefined) return;
    expect(g1.hypotheses.find((h) => h.id === "kernel-uniformly-bounded")?.statement).toContain("cot");
  });
});
