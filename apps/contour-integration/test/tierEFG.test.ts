// The M5 gate, as a test: **every `=` in tiers E–G is earned, or honestly demoted to `≈`.**
//
// `M5-plan.md`'s gate for the whole milestone, and `tier-efg.md` §10.3's standing caveat — *"no
// entry's exact path was exercised — every number above is float64, [so] the `=` labels in the
// records are claims about what the engine WILL be able to discharge"*. This is where that claim
// stops being a claim, and it is a property of the CORPUS rather than of any one record: a new tier
// E–G entry that solved only numerically, or an engine change that quietly dropped a closed form,
// would fail here and nowhere else.
//
// Nothing was demoted. All eight records print a symbolic form at every fixture they declare, and
// the decimals beside them are `≈` as every decimal in this app is.
import { describe, expect, it } from "vitest";
import { FAMILIES } from "../src/families/index.js";
import { solveFamily } from "../src/families/runFamily.js";
import type { Family } from "../src/families/schema.js";

const LATE_TIERS = FAMILIES.filter((f) => f.tier === "E" || f.tier === "F" || f.tier === "G");
const cases = LATE_TIERS.flatMap((f) => f.golden.map((g) => [f.id, f, g] as const));

describe("the M5 gate", () => {
  it("loads all 28 records, and eight of them are tiers E–G", () => {
    expect(FAMILIES).toHaveLength(28);
    expect(LATE_TIERS.map((f) => f.id)).toEqual([
      "strip-exponential-quasiperiod",
      "strip-sech-fourier",
      "gaussian-shift-zero-residue",
      "wedge-rational-power",
      "wedge-fresnel",
      "series-cot-kernel",
      "series-cot-collision",
      "series-csc-kernel-collision",
    ]);
    // Every tier is represented, which is what "the gallery is complete" means at this level.
    expect(new Set(FAMILIES.map((f) => f.tier))).toEqual(new Set(["A", "B", "C", "D", "E", "F", "G"]));
  });

  it.each(cases)("%s solves symbolically at every fixture", (_id, family: Family, golden) => {
    const r = solveFamily(family, golden);
    expect(r.ok, r.ok ? "" : r.reason).toBe(true);
    if (!r.ok) return;

    // **A CLOSED FORM, not a decimal.** This is the gate's substance: `text` absent means the engine
    // reached the number and could not say what it is, which `solveTarget` reports honestly as `?`
    // and which would be the "demoted to ≈" half of the gate.
    expect(r.solved.text, `${family.id} ${JSON.stringify(golden.params)}`).toBeDefined();
    expect(r.solved.text).not.toBe("");

    // **EARNED, not asserted.** Every certificate the answer rests on is `=` — no `?` from an
    // unreadable exponent, no `⚠` from a refused step. A record whose form were printed on its own
    // say-so would still have a `?` here, because the engine mints these from what it established.
    expect(
      r.solved.certificates.map((c) => c.level),
      `${family.id} ${JSON.stringify(golden.params)}`,
    ).toEqual(r.solved.certificates.map(() => "="));

    // **CORROBORATED.** The closed-contour value is checked against a quadrature that shares no
    // arithmetic with it, and tiers E–G are the ones §10.3 warned had never been run exactly.
    expect(r.run.theorem.agrees, `${family.id} ${JSON.stringify(golden.params)}`).toBe(true);
  });

  it("the ledger's own verdict is `≤`, and that is the ML bounds — not a demotion", () => {
    // Worth pinning so a future reader does not read `≤` as the gate failing. Every record in tiers
    // B–G kills at least one piece with a finite-`R` ML bound, which is one-sided by nature; the
    // LIMIT those records consume is `=`, which is what the answers above carry. E1 has read `≤`
    // since M5.3d and nothing about that changed when E3 and F2 landed.
    for (const family of LATE_TIERS) {
      const r = solveFamily(family, family.golden[0]);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.run.ledger.verdict.level, family.id).toBe("≤");
      expect(r.run.ledger.closes, family.id).toBe(true);
    }
  });
});
