import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";
import { resolveAll } from "../src/engine/contour/model.js";
import { semicircleTemplate } from "../src/engine/contour/templates.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { applyResidueTheorem } from "../src/engine/residueTheorem.js";
import { findPoles } from "../src/kernel/poles.js";
import { FAMILIES, loadFamilies } from "../src/families/index.js";
import { contourIntegrandOf, instantiate } from "../src/families/instantiate.js";
import {
  isVariant,
  primaryGolden as primary,
  runFamily,
  solveFamily,
  type FamilyRun,
} from "../src/families/runFamily.js";
import type { SolvedValue } from "../src/families/solveTarget.js";
import type { Cx } from "../src/kernel/geom.js";
import type { Family, Golden } from "../src/families/schema.js";

/**
 * The corpus drives the engine through `src/families/runFamily.ts` — the SAME door the shell's
 * gallery goes through — so the numbers a user reads are the numbers these assertions pin. What used
 * to live here was a private copy of that pipeline, agreeing with the shell's by inspection.
 *
 * The two wrappers below exist only to turn `{ ok: false, reason }` back into a throw. A test wants
 * to die at the first unbuildable record, naming it; the shell wants to report it and carry on.
 */
function run(family: Family, g: Golden, geometry: Record<string, number> = {}): FamilyRun {
  const r = runFamily(family, g, { geometry });
  if (!r.ok) throw new Error(r.reason);
  return r.run;
}

/** Through Pass 5 — the step that makes `∮` stop being the answer (C1 encloses nothing). */
function solve(
  family: Family,
  g: Golden,
  geometry: Record<string, number> = {},
): FamilyRun & { solved: SolvedValue } {
  const r = solveFamily(family, g, { geometry });
  if (!r.ok) throw new Error(r.reason);
  return { ...r.run, solved: r.solved };
}

const cases = FAMILIES.map((f) => [f.id, f] as const);

describe("every loaded record reproduces its own golden value through the engine", () => {
  it.each(cases)("%s", (_id, family) => {
    const g = primary(family);
    const want = typeof g.numeric === "number" ? g.numeric : g.numeric[0];

    const { solved } = solve(family, g);
    expect(Math.abs(solved.value - want)).toBeLessThanOrEqual(
      g.verifiedTo * Math.max(1, Math.abs(want)),
    );
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
      if (isVariant(family, g)) continue;
      // A fixture marked `refuses` documents a collapsed derivation, and its `value` records what
      // the answer would be — which is exactly why it must not be printed. D3 carries two, at
      // integer `a`, where the keyhole carries no information about the target while
      // `(π/n)/sin(πa/n)` remains correct by continuity. The test is that the engine REFUSES and
      // says so, not that it reproduces the number.
      if (g.refuses !== undefined) {
        const r = solveFamily(family, g);
        expect(r.ok, `${family.id} at ${JSON.stringify(g.params)} should refuse: ${g.refuses}`).toBe(
          false,
        );
        if (!r.ok) expect(r.reason).toMatch(/carries no information|is ZERO|exactly zero/);
        continue;
      }
      const want = typeof g.numeric === "number" ? g.numeric : g.numeric[0];
      const { solved } = solve(family, g);
      expect(
        Math.abs(solved.value - want),
        `${family.id} at ${JSON.stringify(g.params)}: got ${solved.value} (${solved.text ?? "no closed form"}), want ${want}`,
      ).toBeLessThanOrEqual(g.verifiedTo * Math.max(1, Math.abs(want)));
    }
  });
});

describe("the residue-theorem value does not depend on the contour's limit radius", () => {
  // `instantiate`'s DEFAULT_LIMIT_VALUE is a display default, not a claim. This is what makes that
  // true: once every selected pole is enclosed, 2πi Σ n·Res is independent of R, so the two runs
  // must agree EXACTLY — not to a tolerance. A difference would mean the winding numbers changed,
  // which is the one thing R is allowed to do and the one thing these radii must not straddle.
  // The parameter heading to INFINITY, which is not always `limitParams[0]` and is not always
  // present: D6's dogbone has no outer circle at all, so its one limit parameter shrinks instead.
  //
  // **AND IT INVERTS FOR TIER G, WHICH IS WHY THAT TIER IS EXCLUDED HERE AND TESTED BELOW.** The
  // property rests on "once every selected pole is enclosed, more radius adds nothing". A summation
  // kernel has a pole at every integer, so more radius adds MORE POLES — `∮` is `2πi[S_N − T]` and
  // its DEPENDENCE on N is the whole content of the argument, not a defect in it. Asserting equality
  // there would demand that a partial sum not converge.
  const summation = (f: Family): boolean => f.residueSelection.targetTerms !== undefined;
  const withLimit = FAMILIES.filter(
    (f) => f.contour.limitParams.some((p) => p.to === "inf") && !summation(f),
  );

  it.each(withLimit.map((f) => [f.id, f] as const))("%s", (_id, family) => {
    const g = primary(family);
    // The limit parameter is NOT always called R — tier B names it `R_lim`, because `R` is the
    // rational function. Take the name from the record instead of assuming it.
    const limit = must(family.contour.limitParams.find((p) => p.to === "inf"), "a limit parameter to ∞");
    // BOTH radii must enclose every selected pole, or the property under test does not hold: the
    // value is independent of R once everything is inside, and changes when a pole crosses out. A
    // record whose poles need more room says so with `start`, and D2's are at −2 and −4.
    const small = Math.max(3, limit.start ?? 0);
    const large = Math.max(40, small * 10);
    const near = must(run(family, g, { [limit.name]: small }).theorem.exactValue, `an exact value at R = ${small}`);
    const far = must(run(family, g, { [limit.name]: large }).theorem.exactValue, `an exact value at R = ${large}`);
    expect(far.value).toEqual(near.value);
    expect(far.text).toBe(near.text);
  });

  it.each(FAMILIES.filter(summation).map((f) => [f.id, f] as const))(
    "%s — where the value must DEPEND on the radius, and shrink",
    (_id, family) => {
      const g = primary(family);
      const limit = must(family.contour.limitParams.find((p) => p.to === "inf"), "a limit parameter to ∞");
      const near = must(run(family, g, { [limit.name]: 4 }).theorem.exactValue, "an exact value at N = 4");
      const far = must(run(family, g, { [limit.name]: 40 }).theorem.exactValue, "an exact value at N = 40");
      expect(far.value).not.toEqual(near.value);
      // `2πi[S_N − T]` — the tail, so it shrinks toward zero as the square grows. A sign error or a
      // dropped residue would make it grow, and equality would mean the partial sums did not move.
      expect(Math.hypot(...far.value)).toBeLessThan(Math.hypot(...near.value));
      expect(Math.hypot(...far.value)).toBeLessThan(0.5);
    },
  );

  it("names which families have a limit parameter at all", () => {
    // Guards the filter above from silently emptying if a record's limitParams were dropped — and
    // records that the circle families legitimately have none, their contour being closed already.
    // A tier-G record is deliberately NOT here: it has a limit parameter and is excluded above,
    // because for it the value must depend on the radius rather than be independent of it.
    expect(withLimit.map((f) => f.id)).toEqual([
      "semicircle-order2",
      "semicircle-quartic",
      "semicircle-order3",
      "jordan-cosine-kernel",
      "jordan-strict",
      "jordan-quartic",
      "indented-sinc",
      "removable-one-minus-cos",
      "pv-sine-over-x-times-quadratic",
      "mellin-keyhole",
      "keyhole-two-poles",
      "keyhole-x-to-the-n",
      "log-squared-keyhole",
      "log-cubed-keyhole",
      // E1's R is the strip's HALF-WIDTH rather than a radius, and it heads to infinity for the same
      // reason: the two vertical sides have to leave. It has no shrinking partner — the strip has no
      // small circle, because its singular set is a lattice rather than a point on the contour.
      "strip-exponential-quasiperiod",
      "strip-sech-fourier",
      // F1's R is a sector RADIUS again, as tier A's was — the rotational twin of the strip above,
      // and the first since D2 whose limit parameter is neither a half-width nor a shrinking ε.
      "wedge-rational-power",
    ]);
  });

  // The mirror property, and D6 is why it is here: a dogbone has NO outer circle — the residue at
  // infinity stands in for it — so its only limit parameter shrinks, and a test that assumed every
  // limit was a radius heading outward simply could not run on it. Shrinking must not change the
  // value either, and it would if `η` crossed a pole, reached the other branch point, or swallowed
  // the segment the target runs along.
  const withShrinking = FAMILIES.filter((f) => f.contour.limitParams.some((p) => p.to === "0+"));

  it.each(withShrinking.map((f) => [f.id, f] as const))("%s, as its ε shrinks", (_id, family) => {
    const g = primary(family);
    const limit = must(family.contour.limitParams.find((p) => p.to === "0+"), "a limit parameter to 0⁺");
    const coarse = Math.min(0.05, limit.start ?? 0.05);
    const fine = coarse / 1000;
    const near = must(run(family, g, { [limit.name]: coarse }).theorem.exactValue, `an exact value at ε = ${coarse}`);
    const far = must(run(family, g, { [limit.name]: fine }).theorem.exactValue, `an exact value at ε = ${fine}`);
    expect(far.value).toEqual(near.value);
    expect(far.text).toBe(near.text);
  });

  it("names which families have a SHRINKING limit parameter", () => {
    expect(withShrinking.map((f) => f.id)).toEqual([
      "indented-sinc",
      "pv-sine-over-x-times-quadratic",
      "mellin-keyhole",
      "keyhole-two-poles",
      "keyhole-x-to-the-n",
      "log-squared-keyhole",
      "log-cubed-keyhole",
      "dogbone-inverse-sqrt",
      "dogbone-two-fractional-powers",
    ]);
  });
});

describe("the quadrature agrees with the residue theorem, as the records claim", () => {
  it.each(cases)("%s", (_id, family) => {
    const r = run(family, primary(family));
    // **THE BRANCH CASE IS NO LONGER SPECIAL, AND THAT IS THE ASSERTION.** Until M5.0 this block
    // forked: a multivalued integrand had no quadrature to agree with, because sampling `z^α` needs
    // a determination at every node and a compiled evaluator uses the principal one — so a
    // keyhole's two lips returned the same value, cancelled, and a "second opinion" answered a
    // different question with confidence. The absence was stated rather than dressed as agreement,
    // but it left tier D as the one tier whose values had no independent numeric corroboration.
    //
    // `evaluateDeclared(product, z, side)` removed the premise. Every record in the corpus, tier D
    // included, is now checked against floating Gauss–Legendre panels that share no machinery with
    // the exact route — so the fork is gone and an uncorroborated record cannot hide behind it.
    //
    // Two routes that share no machinery. `agrees` is the engine's own comparison against the
    // quadrature's error estimate, which is the claim each record's `method` field records.
    expect({ id: _id, agrees: r.theorem.agrees }).toEqual({ id: _id, agrees: true });
    expect({ id: _id, skipped: r.integral.quadratureSkipped }).toEqual({ id: _id, skipped: undefined });
    expect(r.theorem.crossCheck).toBeDefined();
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

describe("the closed form each record establishes", () => {
  // The M3 gate's own criterion, made executable: "each produce a closed form labelled `=`". These
  // are the SYMBOLIC answers, not decimals — the whole solve runs in units of π so that π/2 stays
  // π/2. The one `undefined` is B3, and its record says exactly why: its exponents are complex, so
  // Re does not distribute over the terms and the decimal is the honest report.
  const EXPECTED: Readonly<Record<string, string | undefined>> = {
    "circle-linear-cos": "2π√3/3",
    "circle-poisson": "8π/3",
    "circle-cos-n-theta": "π/6",
    "circle-cif-taylor": "2π",
    "semicircle-order2": "π/2",
    "semicircle-quartic": "π√2/2",
    "semicircle-order3": "π/8",
    "jordan-cosine-kernel": "π/e",
    "jordan-strict": "π/e",
    "jordan-quartic": undefined,
    "indented-sinc": "π/2",
    "removable-one-minus-cos": "π/2",
    "pv-sine-over-x-times-quadratic": "π − π/e",
    // D1, and the first answer in the corpus that is not π times an algebraic number: the
    // keyhole's coefficient `1 − e^{2πiα}` factors through a sine, which is CARRIED rather than
    // evaluated. North-star behaviour 4, in one string.
    "mellin-keyhole": "π/sin(3π/10)",
    // D2, the first record whose poles are off the unit circle: `(−2)^{1/2} = e^{(1/2)(ln 2 + iπ)}`,
    // and the `ln 2` folds back to a radical because its weight is a half. Its crossing phase is
    // REAL — `e^{iπ} = −1` — so the two edges add and the sine is `sin(π/2) = 1`, which is why the
    // answer carries no sine at all.
    "keyhole-two-poles": "π − π√2/2",
    // D3, whose sine is `sin(πa/n)` and not `sin(πa)` — the geometric sum over the n roots
    // cancels the keyhole's own `(1 − e^{2πia})`, and without that cancellation the answer is
    // numerically right in a form no reader would recognise.
    "keyhole-x-to-the-n": "(π/4)/sin(3π/8)",
    // D4, whose answer is not reached by dividing at all: `M t = r` over ℚ(i)(π), solved for the
    // two unknowns of three that this contour determines. The primary is `∫₀^∞ log x/(1+x²)² dx`;
    // `∫₀^∞ dx/(1+x²)² = π/4` comes free from the same identity and is checked in `test/d4.test.ts`.
    "log-squared-keyhole": "−π/4",
    // D5, the first record that does not close alone: its log³ keyhole determines `∫R log²x` only
    // modulo `∫R dx`, which D4's log² keyhole on the same R supplies. The borrowed value's verdict
    // meets into this one — see `test/d5.test.ts`.
    "log-cubed-keyhole": "π³/8",
    // D6, the first record whose contour encloses NO pole — and whose answer is not zero. The value
    // comes from the exterior identity, where every residue is weighted by `n − σ = 0 − (−1) = 1`,
    // and the branch factor's two values `+√2/2` and `−√2/2` at the conjugate poles are what keeps
    // them from cancelling. `π√2/2` is `π/√2`.
    "dogbone-inverse-sqrt": "π√2/2",
    // D7, where `Res(f,∞)` is most of the answer — and the first whose form carries a QUARTER power.
    // `2^{1/4}·5^{3/4}` is `250^{1/4}` over primes, which is what keeps equality a decision; the
    // record writes the same number as `40^{3/4}/4`, and recovering a record's own grouping would
    // mean remembering it. The sine is carried, never evaluated.
    "dogbone-two-fractional-powers": "(−π·2^(1/4)·5^(3/4) + 17π/4)/sin(3π/4)",
    // E1, and the form is D1's — which is the record's own closing claim: `x = log t` carries one
    // onto the other, and the keyhole's phase `e^{2πis}` and the strip's `λ` are the same number at
    // `s = a`. The `sin(πa)` here is LITERALLY Pass 5's denominator `1 − e^{2πia}`, recognised.
    "strip-exponential-quasiperiod": "π/sin(3π/10)",
    // E2 — `π sech(πξ/2)` written the way the engine carries it, and the SECOND denominator shape.
    // E1's `1 − λ` factors as a sine because λ sits on the unit circle; E2's λ = −e^{−πξ} is a
    // NEGATIVE REAL, so `1 − λ = 1 + e^{−πξ}` factors as a hyperbolic cosine instead. Which one a
    // contour produces is decided by the sign of its quasi-period, not by a simplifier.
    "strip-sech-fourier": "π/cosh(π)",
    // F1. The gallery writes this fixture's value `2π/(3√3)`, which is the SAME NUMBER — the engine's
    // normal form is the family's own closed form `(π/n)/sin(π/n)`, uniform in `n`, and the document
    // simply rendered `1/sin(π/3)` as `2/√3`. Nothing simplifies a sine into a radical here, and the
    // `n = 5` and `n = 7` fixtures could not be written that way at all.
    "wedge-rational-power": "(π/3)/sin(π/3)",
    // The first entry whose answer is a MULTIPLIER rather than a denominator — `(π/a)coth(πa)` is
    // how the record writes it, and `1/tanh` shown as a second division would be the same number in
    // a form no reader is looking for (`kernel/cothForm.ts`).
    "series-cot-kernel": "(4π/3)·coth(3π/4)",
    // The two COLLISION records, whose answers are in ℚ(i)(π) rather than the exponential basis —
    // the kernel's Laurent expansion at an integer is even, so a merged residue is a rational
    // multiple of an even power of π. Nothing in the app writes a `coth` here.
    "series-cot-collision": "π²/6",
    "series-csc-kernel-collision": "−π²/12",
  };

  it("covers every loaded record", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(FAMILIES.map((f) => f.id).sort());
  });

  it.each(cases)("%s", (id, family) => {
    const { solved } = solve(family, primary(family));
    expect(solved.text).toBe(EXPECTED[id]);
  });
});
