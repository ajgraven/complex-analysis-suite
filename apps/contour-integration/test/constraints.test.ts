// **A slider that offers a value the record has nothing to say about** — the 2026-09-20 review's
// items 1.2(b) and 1.10, and the two defects they cost.
//
// `parameters[].constraints` was declared by 19 records and read by nothing, so every family
// parameter got `[−max(10, 2|v|), +…]`. Dragging D1's `α` to 1.5 put the app on
// `∫₀^∞ x^{1/2}/(1+x) dx` — DIVERGENT — with the ledger correctly refusing and the Result card
// printing `= −π` beside it; and D7's `mu` slider offered −1.9, where the residue-at-infinity phase
// is raised to the power `2·lcm` of the exponents' denominators and the tab wedged permanently
// (13 min 32 s of renderer CPU, `about:blank` timing out at 30 s).
//
// Two fixes, and the second is not optional given the first: **the clamp does NOT make the hang
// unreachable.** Measured below — `mu = 0.7000000000000002` is *inside* the record's own
// `0 < mu < 1` and has denominator 4.7e14, so the exponent cap in `branchFactor.ts` is what stops
// it and the clamp only stops the app offering nonsense.
//
// The posture of the reader is the ledger's: **total, or refused by name.** A constraint form
// nothing recognises must not fall through to "no opinion", because that is indistinguishable from
// one the reader understood and found vacuous — which is how the field became prose in the first
// place. So the enumeration below is of EVERY distinct string in the corpus, and each is pinned to
// the reading it gets.
import { describe, expect, it } from "vitest";

import { multiFactorOf } from "../src/families/branchFactor.js";
import { narrowRange, readConstraint, type ConstraintReading } from "../src/families/constraints.js";
import { FAMILIES } from "../src/families/index.js";
import { instantiate } from "../src/families/instantiate.js";
import { numericBindings, primaryGolden, solveFamily } from "../src/families/runFamily.js";
import type { Family } from "../src/families/schema.js";

/** Every `(parameter, constraint)` the corpus declares, with the fixture the reader sees it at. */
function corpus(): { self: string; text: string; values: Record<string, number>; where: string }[] {
  const rows: { self: string; text: string; values: Record<string, number>; where: string }[] = [];
  for (const f of FAMILIES) {
    const values = numericBindings(primaryGolden(f).params);
    for (const p of f.parameters) {
      for (const text of p.constraints) rows.push({ self: p.name, text, values, where: `${f.id}.${p.name}` });
    }
  }
  return rows;
}

const ROWS = corpus();

describe("the constraint reader is total", () => {
  it("reads every one of the 36 constraints the corpus declares, in 27 distinct forms", () => {
    const unread = ROWS.filter((r) => readConstraint(r.text, r.self, r.values).kind === "unreadable").map(
      (r) => `${r.where}: ${r.text} — ${(readConstraint(r.text, r.self, r.values) as { reason: string }).reason}`,
    );
    expect(unread).toEqual([]);
    // The anti-vacuity counts. `instantiate` THROWS on an unreadable constraint rather than
    // widening the range in silence, so a form the reader loses would be caught there too — but
    // only for a record that is instantiated, and this asks the whole corpus at once.
    expect(ROWS.length).toBe(36);
    expect(new Set(ROWS.map((r) => r.text)).size).toBe(27);
  });

  it("gives each distinct form the reading its shape deserves, and no other", () => {
    // Pinned string by string. Three of the four readings narrow NOTHING and each has its own
    // reason (see `constraints.ts`); filing one of them as a `bound` would be a range that is FALSE
    // rather than merely wide, which is the failure mode worth guarding.
    const kinds = new Map<string, ConstraintReading["kind"]>();
    for (const r of ROWS) kinds.set(r.text, readConstraint(r.text, r.self, r.values).kind);
    expect(Object.fromEntries([...kinds].sort())).toEqual({
      "a < 1": "bound",
      "a < n": "bound",
      "a > 0": "bound",
      "a not in Z": "excluded",
      "abs(a) != 1": "excluded",
      "abs(a) > abs(b)": "magnitude",
      "abs(b) < abs(a)": "magnitude",
      "alpha < 1": "bound",
      "alpha > 0": "bound",
      "alpha not in Z": "excluded",
      "b != 0": "excluded",
      "b > 0": "bound",
      "b >= 0": "bound",
      "c > b": "bound",
      "isReal(a)": "domain",
      "mu < 1": "bound",
      "mu > 0": "bound",
      "mu not in Z": "excluded",
      "n >= 0": "bound",
      "n >= 2": "bound",
      "p > 0": "bound",
      "p >= 1": "bound",
      "q != p": "excluded",
      "q > 0": "bound",
      "s < 2": "bound",
      "s > 0": "bound",
      "s not in Z": "excluded",
    });
  });

  it("refuses by NAME what it does not know, rather than falling through to no opinion", () => {
    const cases: [string, string, RegExp][] = [
      ["a^2 < 4", "a", /not a comparison this reader knows/],
      ["a in (0, 1)", "a", /not a comparison this reader knows/],
      ["sin(a) > 0", "a", /not a comparison this reader knows/],
      ["b > 0", "a", /is about 'b', not 'a'/],
      ["a > k", "a", /names 'k', which this instantiation does not bind/],
      ["a > abs(b)", "a", /bounds 'a' by a magnitude, which this reader does not resolve/],
      ["b not in Z", "a", /is about 'b', not 'a'/],
      ["isReal(b)", "a", /is about 'b', not 'a'/],
    ];
    for (const [text, self, reason] of cases) {
      const read = readConstraint(text, self, { a: 1, b: 2 });
      expect(read.kind, text).toBe("unreadable");
      if (read.kind !== "unreadable") continue;
      expect(read.reason, text).toMatch(reason);
    }
  });
});

describe("the slider stops where the record stops", () => {
  const rangeOf = (id: string, name: string): readonly [number, number] => {
    const f = FAMILIES.find((x) => x.id === id);
    if (f === undefined) throw new Error(`no record ${id}`);
    const c = instantiate(f, { values: numericBindings(primaryGolden(f).params) });
    return c.params[name].range;
  };

  it("keeps D1's `alpha` strictly inside (0, 1), where it ran −10 … 10", () => {
    const [lo, hi] = rangeOf("mellin-keyhole", "alpha");
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeLessThan(1);
    // **The margin is ONE STOP of the control**, so the endpoint stop is the first value strictly
    // inside and no stop is outside. `cards/parameters.ts` puts a thousand on the track.
    expect(hi - lo).toBeCloseTo(1 - 2 / 1000, 12);
    expect(lo).toBeCloseTo(0.001, 12);
    expect(hi).toBeCloseTo(0.999, 12);
  });

  it("keeps D7's `mu` strictly inside (0, 1), and its `c` above `b`", () => {
    const [lo, hi] = rangeOf("dogbone-two-fractional-powers", "mu");
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeLessThan(1);
    // `c > b` is a bound by ANOTHER PARAMETER, resolved at this binding (b = 3). The whole range is
    // rebuilt on every recompute, so it follows `b` rather than freezing at instantiation.
    const [clo] = rangeOf("dogbone-two-fractional-powers", "c");
    expect(clo).toBeGreaterThan(3);
    expect(clo).toBeLessThan(3.01);
  });

  it("takes a CLOSED bound closed — E3 opens at `b = 0`, which `b >= 0` admits", () => {
    expect(rangeOf("gaussian-shift-zero-residue", "b")[0]).toBe(0);
  });

  it("leaves a magnitude and an exclusion alone, with their reasons", () => {
    // A1's `abs(a) > abs(b)` is two rays: at `a = 2, b = 1` the record admits `a < −1` as readily
    // as `a > 1`, so narrowing to the ray the value sits in would make the other half unreachable.
    expect(rangeOf("circle-linear-cos", "a")).toEqual([-10, 10]);
    // A2's `abs(a) != 1` removes two points from a line; a slider cannot express the holes, and
    // A2's own trap is what reports them.
    expect(rangeOf("circle-poisson", "a")).toEqual([-10, 10]);
    // E2 declares no constraint at all, and gets the unconstrained span — `cosh` cannot degenerate,
    // which is E2's "no condition" claim arriving as a property of the range.
    expect(rangeOf("strip-sech-fourier", "xi")).toEqual([-10, 10]);
  });

  it("reaches every fixture of every record — 94 of them, through `bindings` and not the slider", () => {
    // The clamp must never put a fixture outside its own slider: `Golden.params` goes in through
    // `bindings`, and a trap fixture sitting AT a bound is exactly the state the record exists to
    // demonstrate. Measured: none of the 94 needs the widening today, and the assertion is that
    // the picker could reach all of them.
    const outside: string[] = [];
    let checked = 0;
    for (const f of FAMILIES) {
      for (const g of f.golden) {
        const c = instantiate(f, { values: numericBindings(g.params) });
        for (const p of f.parameters) {
          const q = c.params[p.name];
          checked += 1;
          if (q.value < q.range[0] || q.value > q.range[1]) {
            outside.push(`${f.id}.${p.name} = ${q.value} outside [${q.range[0]}, ${q.range[1]}]`);
          }
        }
      }
    }
    expect(outside).toEqual([]);
    expect(checked).toBe(104);
  });

  it("WIDENS back to a value handed in from outside the declared range, rather than clamping it", () => {
    // The other half of the rule, and the one that keeps a permalink honest: a link carrying
    // `alpha = 1.5` opens AT 1.5 — where the ledger refuses — instead of at some clamped neighbour
    // the sharer never chose. The range reaches back to the bound so the reader can walk in.
    const f = FAMILIES.find((x) => x.id === "mellin-keyhole");
    if (f === undefined) throw new Error("no D1");
    const c = instantiate(f, { values: { ...numericBindings(primaryGolden(f).params), alpha: 1.5 } });
    expect(c.params.alpha.value).toBe(1.5);
    expect(c.params.alpha.range[1]).toBe(1.5);
    expect(c.params.alpha.range[0]).toBeCloseTo(0.001, 12);
  });
});

describe("the exponent denominator is a cost, and it is capped", () => {
  const D7 = FAMILIES.find((x) => x.id === "dogbone-two-fractional-powers");
  if (D7 === undefined) throw new Error("no D7");

  it("refuses a dragged `mu` by NAME, inside a second, where the tab used to wedge permanently", () => {
    // `0.7000000000000002` is what a drag leaves behind and it is INSIDE `0 < mu < 1`, so this is
    // not reachable-only-through-a-bad-slider: `simplestRational` of it has denominator 4.7e14, and
    // `multiPowerAtPole` would raise the product to twice that in exact arithmetic. Measured on the
    // tree before the cap: no result in 30 s, then no result in 13 minutes.
    const g = primaryGolden(D7);
    const started = Date.now();
    const r = solveFamily(D7, g, { bindings: { ...g.params, mu: 0.7000000000000002 } });
    const elapsed = Date.now() - started;
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // The refusal names the QUANTITY that is too large, not merely "too hard": a reader who moved
    // one slider is owed the reason it is the exponents' common denominator.
    expect(r.reason).toMatch(/common denominator 469124961184427/);
    expect(r.reason).toMatch(/raising it to the power 938249922368854/);
    expect(r.reason).toMatch(/not a computation this app will finish/);
    expect(`${elapsed < 1000 ? "under" : "over"} a second`).toBe("under a second");
  });

  it("still answers at every denominator a record declares, and AT the cap, which is 124 ms", () => {
    // The cap is 10 000 and the corpus is far below it; the negation is what says the cap is not
    // simply switching the record off. `0.37175` is `1487/4000` and `0.3717` is `3717/10000` —
    // values no record declares, the second EXACTLY at the cap, so the boundary is decided here
    // rather than left to whichever way the comparison happens to be written.
    const g = primaryGolden(D7);
    for (const mu of [0.75, 0.25, 0.5, 0.37175, 0.3717]) {
      const r = solveFamily(D7, g, { bindings: { ...g.params, mu } });
      expect(`mu = ${mu}: ${r.ok}`).toBe(`mu = ${mu}: true`);
    }
  });
});

/**
 * **What the CORPUS cannot reach, built by hand** — the four mutants the sweep left alive.
 *
 * Every one of them survived for the same reason: the clause it mutates is about a record the
 * corpus does not contain. That is not the same as dead code — a record may acquire any of these
 * shapes tomorrow and the schema admits all four — so each is exercised on a synthetic record
 * rather than recorded as an equivalent. The records are shallow clones of real ones, so only the
 * field under test differs from something that already loads.
 */
describe("the shapes the corpus does not have", () => {
  const D7 = FAMILIES.find((x) => x.id === "dogbone-two-fractional-powers");
  const D1 = FAMILIES.find((x) => x.id === "mellin-keyhole");
  const A3 = FAMILIES.find((x) => x.id === "circle-cos-n-theta");
  if (D7 === undefined || D1 === undefined || A3 === undefined) throw new Error("missing record");

  /** The same record with one parameter's declaration replaced. */
  function withParameter(f: Family, name: string, patch: Partial<Family["parameters"][number]>): Family {
    return { ...f, parameters: f.parameters.map((p) => (p.name === name ? { ...p, ...patch } : p)) };
  }

  it("REFUSES to instantiate a record whose constraint it cannot read, naming the constraint", () => {
    // The alternative is the unconstrained span, silently — which is where the field was before,
    // and the whole point of the reader being total. Every corpus constraint is readable, so this
    // guard fires on nothing today and would fire on the first record that invented a form.
    const odd = withParameter(D1, "alpha", { constraints: ["alpha in (0, 1)"] });
    expect(() => instantiate(odd, { values: numericBindings(primaryGolden(D1).params) })).toThrow(
      /'alpha in \(0, 1\)' is not a comparison this reader knows/,
    );
    // And it names the record and the parameter, because a reader of the message has neither.
    expect(() => instantiate(odd, { values: numericBindings(primaryGolden(D1).params) })).toThrow(
      /instantiating 'mellin-keyhole': parameter 'alpha'/,
    );
  });

  it("insets an INTEGER parameter's open bound by one, not by a thousandth of the range", () => {
    // `n > 2` means `n = 3`. Every integer constraint in the corpus is closed (`n >= 0`, `n >= 2`,
    // `p >= 1`), so the lattice branch of the margin is unreachable from a record — and a margin of
    // `(hi − lo)/1000` would put the slider's end at 2.008, which `admissibleValue` then snaps back
    // onto 2, the value the record excludes.
    const strict = withParameter(A3, "n", { constraints: ["n > 2"] });
    const built = instantiate(strict, { values: { ...numericBindings(primaryGolden(A3).params), n: 4 } });
    expect(built.params.n.range[0]).toBe(3);
    expect(built.params.n.admits).toBe("integers");
    // The closed form of the same record keeps its bound exactly, which is the contrast.
    expect(instantiate(A3, { values: { ...numericBindings(primaryGolden(A3).params), n: 4 } }).params.n.range[0]).toBe(0);
  });

  it("takes the LCM of the exponents' denominators, not the last one", () => {
    // D6's two exponents are both `−1/2` and D7's are `μ` and `1 − μ`, so in the corpus the two
    // agree identically and the difference is invisible. It is not invisible in general: with
    // `1/101` and `1/9901` the last denominator is under the cap and their lcm is 1 000 001, which
    // is the number the phase would actually be raised to.
    const branch = D7.branch;
    if (branch === undefined) throw new Error("D7 has no branch");
    const coprime: Family = {
      ...D7,
      branch: {
        ...branch,
        factors: branch.factors.map((x, k) => ({
          ...x,
          order: { kind: "power" as const, alpha: k === 0 ? "1/101" : "1/9901" },
        })),
      },
    };
    const r = multiFactorOf(coprime, primaryGolden(D7).params);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/common denominator 1000001/);
    expect(r.reason).toMatch(/raising it to the power 2000002/);
    // Each denominator ALONE is under the cap, so a reader that took one of them would answer.
    const single: Family = {
      ...D7,
      branch: {
        ...branch,
        factors: branch.factors.map((x) => ({ ...x, order: { kind: "power" as const, alpha: "1/9901" } })),
      },
    };
    expect(multiFactorOf(single, primaryGolden(D7).params).ok).toBe(true);
  });

  it("TIGHTENS the openness when a record bounds the same parameter twice", () => {
    // An intersection: `a > 0` and `a >= 0` is `a > 0`, whichever order they are listed in. No
    // corpus record declares a bound twice, so the rule is stated here rather than inherited from
    // whichever comparison the accumulator happens to use.
    const step = (): number => 0.5;
    const both = narrowRange("a", ["a >= 0", "a > 0"], {}, [-10, 10], 5, step);
    const reversed = narrowRange("a", ["a > 0", "a >= 0"], {}, [-10, 10], 5, step);
    expect(both.range).toEqual([0.5, 10]);
    expect(reversed.range).toEqual(both.range);
    // **And the same on the UPPER side**, which is not free: the first re-sweep killed the lower
    // clause and left the upper one alive, because only one of the two was being asked.
    const up = narrowRange("a", ["a <= 10", "a < 10"], {}, [-10, 20], 5, step);
    expect(up.range).toEqual([-10, 9.5]);
    expect(narrowRange("a", ["a < 10", "a <= 10"], {}, [-10, 20], 5, step).range).toEqual(up.range);
    // And a pair of closed ones is still closed, so the `||` is not simply forcing `open`.
    expect(narrowRange("a", ["a >= 0", "a >= 0"], {}, [-10, 10], 5, step).range).toEqual([0, 10]);
    expect(narrowRange("a", ["a <= 10", "a <= 10"], {}, [-10, 20], 5, step).range).toEqual([-10, 10]);
  });
});
