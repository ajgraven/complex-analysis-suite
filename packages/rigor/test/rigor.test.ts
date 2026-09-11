import { describe, expect, it } from "vitest";
import {
  assembleVerdict,
  bound,
  describeLevel,
  estimate,
  exact,
  failures,
  LEVELS,
  mayReportValue,
  meet,
  meetAll,
  refuse,
  unknown,
  type Level,
} from "../src/index.js";

describe("meet", () => {
  // Exhaustive over all 36 pairs: the lattice is small enough that "for a sample of inputs" would
  // be a needless weakening.
  it("is commutative", () => {
    for (const a of LEVELS) for (const b of LEVELS) expect(meet(a, b)).toBe(meet(b, a));
  });

  it("is associative", () => {
    for (const a of LEVELS)
      for (const b of LEVELS)
        for (const c of LEVELS) expect(meet(meet(a, b), c)).toBe(meet(a, meet(b, c)));
  });

  it("is idempotent", () => {
    for (const a of LEVELS) expect(meet(a, a)).toBe(a);
  });

  it("lets ⚠ absorb everything — one refused step refuses the whole claim", () => {
    for (const a of LEVELS) expect(meet(a, "⚠")).toBe("⚠");
  });

  it("treats = as the identity", () => {
    for (const a of LEVELS) expect(meet("=", a)).toBe(a);
  });

  it("degrades an upper bound meeting a lower bound to ≈, never to either bound", () => {
    // An enclosure is not a one-sided bound. Taking the rank tie at face value would relabel it as
    // whichever direction happened to come first, which is a claim nobody established.
    expect(meet("≤", "≥")).toBe("≈");
    expect(meet("≥", "≤")).toBe("≈");
    expect(meet("≤", "≤")).toBe("≤");
    expect(meet("≥", "≥")).toBe("≥");
  });

  it("does not let an unknown step pass as a passing step", () => {
    expect(meet("=", "?")).toBe("?");
    expect(meet("≤", "?")).toBe("?");
    expect(meet("≈", "?")).toBe("?");
  });

  it("never invents strength: the meet is no stronger than either input", () => {
    const strength: Record<Level, number> = { "=": 4, "≤": 3, "≥": 3, "≈": 2, "?": 1, "⚠": 0 };
    for (const a of LEVELS)
      for (const b of LEVELS) {
        const m = meet(a, b);
        expect(strength[m]).toBeLessThanOrEqual(Math.min(strength[a], strength[b]));
      }
  });
});

describe("meetAll", () => {
  it("is ? on an empty list — no evidence is unknown, not exact", () => {
    expect(meetAll([])).toBe("?");
  });

  it("reduces a list to its weakest member", () => {
    expect(meetAll(["=", "=", "≤"])).toBe("≤");
    expect(meetAll(["=", "≈", "≤"])).toBe("≈");
    expect(meetAll(["=", "=", "⚠", "="])).toBe("⚠");
  });
});

describe("assembleVerdict", () => {
  it("reports = only when every certificate is exact", () => {
    const v = assembleVerdict([
      exact("Res(f, i) = −i/2", "P/Q′ in ℚ(i)[z]/⟨Q⟩"),
      exact("n(γ, i) = 1", "exact-sign crossing"),
    ]);
    expect(v.level).toBe("=");
  });

  it("cannot reach = when any single certificate is weaker", () => {
    for (const weaker of [
      bound("≤", "|∫_arc| ≤ 3.2e−4", "exact ℚ coefficient bound"),
      estimate("∮ ≈ 6.2832i", "trapezoid N=4096"),
      unknown("the target integral"),
      refuse("∮ through a pole", "the contour meets a singularity"),
    ]) {
      const v = assembleVerdict([exact("a", "m"), weaker, exact("b", "m")]);
      expect(v.level).not.toBe("=");
    }
  });

  it("is ? with no certificates, so an unevidenced value cannot print =", () => {
    expect(assembleVerdict([]).level).toBe("?");
  });

  it("carries every restriction through, deduplicated and in first-seen order", () => {
    // A restricted claim that sheds its restriction is FALSE, not vague — the whole reason this
    // field exists (and the defect QD's scopeCaveat was written to fix).
    const v = assembleVerdict([
      exact("Σ Res = −i/2", "residues", { restriction: "over poles with Im z > 0" }),
      exact("2 poles enclosed", "argument principle", { restriction: "for |a| < 1" }),
      exact("orientation ccw", "signed area", { restriction: "over poles with Im z > 0" }),
    ]);
    expect(v.restrictions).toEqual(["over poles with Im z > 0", "for |a| < 1"]);
  });

  it("keeps every certificate for the audit trail", () => {
    const cs = [exact("a", "m"), estimate("b", "m")];
    expect(assembleVerdict(cs).certificates).toHaveLength(2);
  });

  it("is unaffected by the order of its evidence", () => {
    const cs = [exact("a", "m"), bound("≥", "b", "m"), estimate("c", "m")];
    const forward = assembleVerdict(cs).level;
    const backward = assembleVerdict([...cs].reverse()).level;
    expect(forward).toBe(backward);
  });
});

describe("mayReportValue", () => {
  it("permits a value at every level except ⚠", () => {
    expect(mayReportValue(assembleVerdict([exact("a", "m")]))).toBe(true);
    expect(mayReportValue(assembleVerdict([estimate("a", "m")]))).toBe(true);
    expect(mayReportValue(assembleVerdict([unknown("a")]))).toBe(true);
    expect(mayReportValue(assembleVerdict([refuse("a", "pole on the contour")]))).toBe(false);
  });

  it("refuses the whole report when one step refused, however good the rest were", () => {
    const v = assembleVerdict([
      exact("Res(f, i) = −i/2", "P/Q′"),
      exact("n(γ, i) = 1", "exact-sign crossing"),
      refuse("the contour passes within 1e−9 of z = i", "singularity on the contour"),
    ]);
    expect(mayReportValue(v)).toBe(false);
  });
});

describe("failures", () => {
  it("collects the failed provenance steps for a 'why not?' disclosure", () => {
    const v = assembleVerdict([
      bound("≤", "|∫_arc| ≤ B(R)", "ML bound", {
        provenance: [
          { ok: false, text: "sharp bound from certified roots: unavailable" },
          { ok: true, text: "coefficient bound: applied" },
        ],
      }),
    ]);
    expect(failures(v)).toEqual(["sharp bound from certified roots: unavailable"]);
  });
});

describe("describeLevel", () => {
  it("gives a phrase for every level", () => {
    for (const l of LEVELS) expect(describeLevel(l).length).toBeGreaterThan(0);
  });
});
