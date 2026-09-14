// G1 and G3 — the COLLISION, and the hypothesis that fails while the argument stays rigorous.
//
// `Σ_{n≥1} 1/n² = π²/6` and `Σ_{n≥1} (−1)ⁿ/n² = −π²/12` are the twenty-fifth and twenty-sixth loaded
// records, and they complete tier G. What is worth testing beyond the corpus's own value check is the
// ESCALATION — the schema's first three-valued hypothesis outcome — and the arithmetic it obliges the
// record to declare. `refuse` would stop a correct argument; `warn` would flag a certainty; and the
// thing that makes `escalate` more than the permissive third option is that the record must then say
// what the merged pole IS, and be falsified against the engine's own Laurent computation.
import { describe, expect, it } from "vitest";
import { assembleVerdict } from "@cas/rigor";
import { parse } from "@cas/expr";
import { FAMILIES, loadFamilies } from "../src/families/index.js";
import { isVariant, primaryGolden, runFamily, solveFamily } from "../src/families/runFamily.js";
import { asSummationKernel } from "../src/kernel/summationKernel.js";
import { checkDeclaredCollisions } from "../src/families/collisionCheck.js";
import { ledgerHeadline } from "../src/engine/ledger.js";
import type { Family } from "../src/families/schema.js";

const record = (id: string): Family => {
  const found = FAMILIES.find((f) => f.id === id);
  if (found === undefined) throw new Error(`${id} is not loaded`);
  return found;
};
const G1 = record("series-cot-collision");
const G3 = record("series-csc-kernel-collision");

const solved = (family: Family) => {
  const r = solveFamily(family, primaryGolden(family));
  if (!r.ok) throw new Error(r.reason);
  return r;
};

describe("both records load, close, and land on their closed form", () => {
  it.each([
    ["series-cot-collision", G1, Math.PI ** 2 / 6, "π²/6"],
    ["series-csc-kernel-collision", G3, -(Math.PI ** 2) / 12, "−π²/12"],
  ])("%s", (_id, family, want, text) => {
    const r = solved(family);
    expect(r.solved.text).toBe(text);
    expect(r.solved.value).toBeCloseTo(want, 14);
    expect(assembleVerdict(r.solved.certificates).level).toBe("=");
    expect(r.run.ledger.closes).toBe(true);
    expect(ledgerHeadline(r.run.ledger)).toBe("This argument closes.");
    // ℚ(i)(π), not the exponential basis: the kernel's Laurent expansion at an integer is EVEN.
    expect(r.route).toBe("sum");
    if (r.route !== "sum") return;
    expect(r.solved.solvedIn.ring).toBe("Q(i)(pi)");
  });

  it("the two differ by ONE number, and it is the merged residue", () => {
    // Identical cofactor `1/z²`, identical contour, identical weight. `π cot` gives `−π²/3` at the
    // collision and `π csc` gives `+π²/6`, and dividing each by `−2` is the whole gap between
    // `ζ(2) = π²/6` and `−η(2) = −π²/12`.
    expect(G1.auxiliary?.integrand.replace("cot", "K")).toBe(G3.auxiliary?.integrand.replace("csc", "K"));
    expect(G1.collisions?.[0].residue).toBe("-pi^2/3");
    expect(G3.collisions?.[0].residue).toBe("pi^2/6");
    expect(solved(G1).solved.value).toBeCloseTo(-(-(Math.PI ** 2) / 3) / 2, 14);
    expect(solved(G3).solved.value).toBeCloseTo(-(Math.PI ** 2 / 6) / 2, 14);
  });

  it("and the quadrature corroborates ∮ on the contour actually drawn", () => {
    for (const family of [G1, G3]) {
      const r = runFamily(family, primaryGolden(family));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.run.theorem.agrees, family.id).toBe(true);
      // `∮` is exact in ℚ(i)(π) here — the log families' seat, reused.
      expect(r.run.theorem.exactInPi, family.id).toBeDefined();
    }
  });
});

describe("SG-6 — the escalation is an obligation, not a licence", () => {
  it("the failing hypothesis declares `escalate`, and the ledger says so", () => {
    for (const family of [G1, G3]) {
      const h = family.hypotheses.find((x) => x.id === "no-pole-of-f-at-an-integer");
      expect(h?.onFail, family.id).toBe("escalate");
      expect(h?.escalateTo, family.id).toBe("merge-collision");
      const rows = solved(family).run.ledger.rows.filter((r) => r.constraint === "CATCH");
      const row = rows.find((r) => /a stated hypothesis FAILS/.test(r.claim));
      expect(row?.status, family.id).toBe("satisfied");
      expect(row?.claim, family.id).toMatch(/merge-collision, over 1 declared collision/);
    }
  });

  it("the declared merged ORDER is checked against the engine's, not trusted", () => {
    const kernel = asSummationKernel(parse(G1.auxiliary?.integrand ?? ""));
    if (kernel === null) throw new Error("no kernel");
    expect(checkDeclaredCollisions(G1, kernel).ok).toBe(true);
    const wrongOrder: Family = {
      ...G1,
      collisions: [{ ...(G1.collisions ?? [])[0], mergedOrder: 2 }],
    };
    const r = checkDeclaredCollisions(wrongOrder, kernel);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/declares a merged order of 2.*orders ADD to 3/s);
  });

  it("and so is the declared RESIDUE — G1's own `kernel-residue-used-at-the-collision` trap", () => {
    const kernel = asSummationKernel(parse(G1.auxiliary?.integrand ?? ""));
    if (kernel === null) throw new Error("no kernel");
    // `+π²/3` instead of `−π²/3` returns `−π²/6` for `ζ(2)` — negative, and otherwise plausible.
    const wrongSign: Family = {
      ...G1,
      collisions: [{ ...(G1.collisions ?? [])[0], residue: "pi^2/3" }],
    };
    const r = checkDeclaredCollisions(wrongSign, kernel);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/declares Res = pi\^2\/3 at z = 0, and the Laurent route gives −π²\/3/);
  });

  it("and a wrong declaration STOPS THE SOLVE, not merely the checker", () => {
    // The difference between the check existing and the check being wired. `+π²/3` would return
    // `−π²/6` for ζ(2) — negative, plausible, and printed with a `=` badge if nothing refused.
    const wrongSign: Family = {
      ...G1,
      collisions: [{ ...(G1.collisions ?? [])[0], residue: "pi^2/3" }],
    };
    const r = solveFamily(wrongSign, primaryGolden(G1));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/the Laurent route gives −π²\/3/);
  });

  it("a record that escalates and declares NOTHING to merge is dropped by the loader", () => {
    const empty: Family = { ...G1, collisions: [] };
    const loaded = loadFamilies([empty]);
    expect(loaded.families.size).toBe(0);
    expect(loaded.violations[0].message).toMatch(/declares no collision to merge.*not a licence/s);
  });

  it("…and so is one escalating to something this engine does not implement", () => {
    const unknown: Family = {
      ...G1,
      hypotheses: G1.hypotheses.map((h) =>
        h.onFail === "escalate" ? { ...h, escalateTo: "wave-it-through" } : h,
      ),
    };
    const loaded = loadFamilies([unknown]);
    expect(loaded.families.size).toBe(0);
    expect(loaded.violations[0].message).toMatch(/'wave-it-through', which this engine does not implement/);
  });
});

describe("weight 2, and the term that is NOT there", () => {
  it("the target is one-sided and the contour establishes twice it", () => {
    for (const [family, one] of [
      [G1, Math.PI ** 2 / 6],
      [G3, -(Math.PI ** 2) / 12],
    ] as const) {
      expect(family.residueSelection.targetTerms?.[0].weight).toBe(2);
      expect(family.targets[0].lower).toBe("1");
      const twoSided = family.golden.find((g) => g.params.sided === "two");
      expect(twoSided).toBeDefined();
      expect(isVariant(family, twoSided as never)).toBe(true);
      expect(twoSided?.numeric).toBeCloseTo(2 * one, 14);
      // Forgetting the weight reports the two-sided sum — a factor of two that looks plausible.
      expect(solved(family).solved.value).toBeCloseTo(one, 14);
    }
  });

  it("f(0) is NOT asked about, because n = 0 is excluded — and it is infinite", () => {
    // G2 must have `f(0) = 0` before it will halve; these records must not, and the difference is
    // the predicate. Asking here would refuse a correct record for a value that does not exist.
    expect(G1.residueSelection.targetTerms?.[0].terms).toBe("poles(K) ∩ Z \\ {0}");
    expect(record("series-cot-kernel").residueSelection.targetTerms?.[0].terms).toBe("poles(K) ∩ Z");
    expect(solved(G1).ok).not.toBe(false);
  });
});
