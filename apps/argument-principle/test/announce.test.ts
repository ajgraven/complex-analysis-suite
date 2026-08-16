import { describe, expect, it } from "vitest";
import { equalitySentence } from "../src/announce.js";

describe("equalitySentence (ARIA live verdict)", () => {
  it("states the holding equality with the counts", () => {
    expect(equalitySentence({ kind: "ok", winding: 3, count: 3, poles: 0 })).toBe(
      "Argument principle holds: winding 3 equals zeros 3 minus poles 0.",
    );
  });

  it("uses 'solutions' when a target w₀ is set", () => {
    expect(equalitySentence({ kind: "ok", winding: 1, count: 1, poles: 0, noun: "solutions" })).toMatch(
      /winding 1 equals solutions 1 minus poles 0/,
    );
  });

  it("spells out the special cases without symbols", () => {
    expect(equalitySentence({ kind: "branchcut" })).toMatch(/branch cut.*does not apply/);
    expect(equalitySentence({ kind: "nonholomorphic" })).toMatch(/not holomorphic/);
    expect(equalitySentence({ kind: "unreliable" })).toMatch(/near a singularity/);
    expect(equalitySentence({ kind: "mismatch", winding: 0, count: 1, poles: 0 })).toMatch(/Mismatch/);
  });

  it("announces nothing for the empty state", () => {
    expect(equalitySentence({ kind: "none" })).toBe("");
  });

  it("carries no math symbols a screen reader would mis-speak", () => {
    for (const kind of ["ok", "mismatch", "branchcut", "nonholomorphic", "unreliable"] as const) {
      const s = equalitySentence({ kind, winding: 2, count: 2, poles: 0 });
      expect(s).not.toMatch(/[=−✓⚠∮·]/);
    }
  });
});
