// G2 — `Σ_{n∈ℤ} 1/(n²+a²) = (π/a)coth(πa)`, the twenty-fourth loaded record and the first in tier G.
//
// What is worth testing beyond the golden corpus (which already pins the four values) is the record's
// own TRAPS, because each names an error that produces a plausible wrong number rather than a
// failure. Three of them are about a single term or a single sign:
//
//   - the two residues at `±ia` are EQUAL, not opposite, so a conjugate pair does not cancel;
//   - `Σ_{n∈ℤ}` includes `n = 0`, contributing `1/a²`, which is invisible in the closed form;
//   - `Σ_{n≥1}` is `½(Σ_ℤ − f(0))`, not `½Σ_ℤ`.
//
// Each is checked against a number, not against the engine agreeing with itself.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { parse } from "@cas/expr";
import { FAMILIES } from "../src/families/index.js";
import { isVariant, primaryGolden, runFamily, solveFamily } from "../src/families/runFamily.js";
import { asSummationKernel } from "../src/kernel/summationKernel.js";
import { cofactorResidues, kernelOverPi, ratioToTuple, scaleRatio } from "../src/kernel/kernelResidue.js";
import { ledgerHeadline } from "../src/engine/ledger.js";
import { assembleVerdict } from "@cas/rigor";
import type { Family, Golden } from "../src/families/schema.js";

const G2: Family = (() => {
  const found = FAMILIES.find((f) => f.id === "series-cot-kernel");
  if (found === undefined) throw new Error("G2 is not loaded");
  return found;
})();

const solved = (g: Golden) => {
  const r = solveFamily(G2, g);
  if (!r.ok) throw new Error(r.reason);
  return r;
};

/** `(π/a)coth(πa)`, from `Math.tanh` — nothing the engine touches. */
const closedForm = (a: number): number => Math.PI / a / Math.tanh(Math.PI * a);

describe("the record is loaded and it closes", () => {
  it("is in tier G, with no target piece at all", () => {
    expect(G2.tier).toBe("G");
    expect(G2.contour.pieces.every((p) => p.role === "vanish")).toBe(true);
    expect(G2.residueSelection.targetTerms?.[0]).toEqual({
      targetId: "S",
      terms: "poles(K) ∩ Z",
      weight: 1,
    });
  });

  it("its target is a SUM, not an integral", () => {
    const target = G2.targets[0];
    expect(target.kind).toBe("sum");
    expect(target.variable).toBe("n");
    expect(target.summand).toBe("1/(n^2 + a^2)");
    expect(target.integrand).toBeUndefined();
  });

  it.each(G2.golden.filter((g) => !isVariant(G2, g)).map((g) => [JSON.stringify(g.params), g] as const))(
    "%s solves to its closed form, labelled =",
    (_params, g) => {
      const r = solved(g);
      expect(r.route).toBe("sum");
      const want = typeof g.numeric === "number" ? g.numeric : g.numeric[0];
      expect(r.solved.value).toBeCloseTo(want, 12);
      expect(r.solved.value).toBeCloseTo(closedForm(Number(g.params.a)), 12);
      expect(assembleVerdict(r.solved.certificates).level).toBe("=");
      expect(r.solved.text).toMatch(/coth\(/);
      expect(r.run.ledger.closes).toBe(true);
      expect(ledgerHeadline(r.run.ledger)).toBe("This argument closes.");
    },
  );

  it("and the ledger's own ∮ is corroborated by the quadrature at every fixture", () => {
    for (const g of G2.golden.filter((x) => !isVariant(G2, x))) {
      const r = runFamily(G2, g);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.run.theorem.agrees, `${JSON.stringify(g.params)}`).toBe(true);
    }
  });
});

describe("residues-cancel-by-symmetry — the two at ±ia are EQUAL, not opposite", () => {
  it("each is −(π/2a)coth(πa), so they ADD", () => {
    const a = 0.75;
    const kernel = asSummationKernel(parse("pi*cot(pi*z)/(z^2+(3/4)^2)"));
    if (kernel === null) throw new Error("no kernel");
    const r = cofactorResidues(kernel);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.at.length).toBe(2);
    // Both residues, in units of π, against `−coth(πa)/(2a)` computed from `Math.tanh`.
    const each = -1 / (2 * a) / Math.tanh(Math.PI * a);
    for (const pole of r.at) expect(ratioToTuple(pole.value)[0]).toBeCloseTo(each, 12);
    // …and the total is twice one of them, which is what "they add" means.
    expect(ratioToTuple(r.total)[0]).toBeCloseTo(2 * each, 12);
    // The reflex that a conjugate pair cancels would return 0 for a sum that is 4.26.
    expect(Math.abs(ratioToTuple(r.total)[0])).toBeGreaterThan(1);
  });

  it("because cot and 1/z are both odd, and the two sign flips cancel", () => {
    // Read straight off the kernel evaluator, with no cofactor in the way. `cot(πz₀)` at `z₀ = ±ia`
    // is `∓i·coth(πa)` — purely imaginary and OPPOSITE — which is one of the two flips; the other is
    // `Res(f, ±ia) = 1/(±2ia)`, and their product is the same at both poles.
    const a = 0.75;
    const at = (sign: bigint) => kernelOverPi("cot", new Gauss(Frac.ZERO, Frac.of(sign * 3n, 4n)));
    const [up, down] = [at(1n), at(-1n)];
    if (up === null || down === null) throw new Error("the kernel declined a non-integer pole");
    expect(ratioToTuple(up)[0]).toBeCloseTo(0, 12);
    expect(ratioToTuple(up)[1]).toBeCloseTo(-1 / Math.tanh(Math.PI * a), 12);
    expect(ratioToTuple(down)[1]).toBeCloseTo(+1 / Math.tanh(Math.PI * a), 12);
    // Now the second flip: `Res(f, ±ia) = 1/(±2ia) = ∓i/(2a)`. Scaling each by its own makes them
    // EQUAL, which is the trap's whole content.
    const res = (sign: bigint) => SqrtExt.fromGauss(new Gauss(Frac.ZERO, Frac.of(-sign * 2n, 3n)));
    expect(ratioToTuple(scaleRatio(up, res(1n)))[0]).toBeCloseTo(
      ratioToTuple(scaleRatio(down, res(-1n)))[0],
      12,
    );
  });
});

describe("the n = 0 bookkeeping — two traps about one term", () => {
  const a = 0.75;
  const twoSided = closedForm(a);

  it("forgot-the-n-equals-zero-term: Σ_{n∈ℤ} INCLUDES n = 0, contributing 1/a²", () => {
    // The record's own numbers: the true two-sided sum against the n ≠ 0 sum, which differ by
    // exactly `f(0) = 1/a²` and are both perfectly plausible.
    expect(twoSided).toBeCloseTo(4.2647306427126592, 12);
    expect(twoSided - 1 / (a * a)).toBeCloseTo(2.4869528649348815, 12);
    // And the engine solves the one the record declares.
    expect(solved(primaryGolden(G2)).solved.value).toBeCloseTo(4.2647306427126592, 12);
  });

  it("double-counted-by-naive-halving: Σ_{n≥1} is ½(Σ_ℤ − f(0)), not ½Σ_ℤ", () => {
    const honest = (twoSided - 1 / (a * a)) / 2;
    const naive = twoSided / 2;
    expect(honest).toBeCloseTo(1.2434764324674408, 12);
    expect(naive).toBeCloseTo(2.1323653213563296, 12);
    // The variant fixture records the honest one, and is skipped by the corpus BECAUSE this contour
    // establishes the two-sided sum — the record says so with its target's own range.
    const variant = G2.golden.find((g) => g.params.sided === "one");
    expect(variant).toBeDefined();
    expect(isVariant(G2, variant as Golden)).toBe(true);
    expect((variant as Golden).numeric).toBeCloseTo(honest, 12);
  });

  it("and the engine REFUSES to halve this contour, because f(0) ≠ 0", () => {
    // The halving is not a formatting choice the record could make: `Σ_ℤ = 2Σ_{n≥1}` needs an even
    // summand whose `n = 0` term vanishes, and `1/(n²+a²)` fails the second. A record declaring the
    // one-sided range would be refused by name rather than quietly halved.
    const oneSided: Family = {
      ...G2,
      targets: [{ ...G2.targets[0], lower: "1" }],
      residueSelection: {
        ...G2.residueSelection,
        targetTerms: [{ targetId: "S", terms: "poles(K) ∩ Z", weight: 2 }],
      },
    };
    const r = solveFamily(oneSided, primaryGolden(G2));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/f\(0\) ≠ 0/);
  });
});

describe("square-at-arbitrary-radius — the half-width must be N + ½", () => {
  it("an INTEGER half-width runs the sides through the kernel's poles, and is refused", () => {
    // `squareTemplate` binds the half-width to `N + ½`, so reaching an integer takes a half-step in
    // `N` — which is exactly what a drag does. The bound refuses by name and the ledger does not
    // close: at half-width 1 the sampled sup of |cot πz| is 8.2e15.
    const r = runFamily(G2, primaryGolden(G2), { geometry: { N: 3.5 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run.ledger.closes).toBe(false);
    expect(r.run.ledger.failedAt).not.toBeNull();
  });

  it("…while the declared half-integer family closes at every N that encloses ±ia", () => {
    for (const N of [1, 4, 9, 25]) {
      const r = runFamily(G2, primaryGolden(G2), { geometry: { N } });
      expect(r.ok, `N = ${N}`).toBe(true);
      if (!r.ok) return;
      expect(r.run.ledger.closes, `N = ${N}`).toBe(true);
    }
  });

  it("and N = 0 does NOT, because half-width ½ < a — the record's own 'once N+½ > a'", () => {
    // Measured, not assumed: at `a = 3/4` the square of half-width ½ leaves both cofactor poles
    // outside, and summing all of them would state a number for a different contour. A first draft
    // of this test asserted that every half-integer width closes; it does not, and the condition is
    // the record's own.
    const r = runFamily(G2, primaryGolden(G2), { geometry: { N: 0 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run.ledger.closes).toBe(false);
    expect(
      r.run.theorem.verdict.certificates.some((c) => /does not enclose the cofactor's pole/.test(c.method)),
    ).toBe(true);
  });
});
