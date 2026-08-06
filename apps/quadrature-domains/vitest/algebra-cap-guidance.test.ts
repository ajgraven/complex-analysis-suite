// Characterization net for the cap-failure guidance helpers carved out of installAlgebra (refactor D,
// installAlgebra carve-out 6): _isCapFailure (does a failure reason look like a resource/too-large cap?) +
// withGuidance (append the CAS-export escape-hatch hint to a cap failure, pass everything else through).
// withGuidance decorates ~19 operation failure paths and _isCapFailure also gates the DOM-coupled
// capFailVerdict, but neither had executable coverage. The recognizer is a substring regex, so it matches
// inside words too (e.g. "escape" contains "cap") — that behavior is pinned, not "fixed". The guidance
// sentence is user-facing (including its leading double space), so it's pinned verbatim. Pure ⇒ no jsdom.
import { describe, it, expect } from "vitest";
import { _isCapFailure, withGuidance } from "../app/algebra/algebra-labeling.mjs";

const HINT = "  Try: assume variables real (simplifies the system), eliminate fewer variables, or use the CAS export.";

describe("_isCapFailure — recognizes cap / too-large / resource-limit failures", () => {
  it("matches each keyword the recognizer looks for", () => {
    for (const r of [
      "exceeded the S-pair budget",
      "step limit hit",
      "the basis grew too large",
      "degree cap reached",
      "too many terms",
      "use the CAS export",
      "capacity exceeded", // 'cap' + 'exceed'
    ]) {
      expect(_isCapFailure(r)).toBe(true);
    }
  });
  it("is false for a failure with none of the cap keywords, and for empty / missing input", () => {
    expect(_isCapFailure("the system is inconsistent")).toBe(false);
    expect(_isCapFailure("no solution")).toBe(false);
    expect(_isCapFailure("")).toBe(false);
    expect(_isCapFailure(null)).toBe(false);
    expect(_isCapFailure(undefined)).toBe(false);
  });
  it("matches by SUBSTRING, including inside a larger word (pinned quirk, not a bug)", () => {
    expect(_isCapFailure("escape route")).toBe(true); // "escape" contains "cap"
  });
});

describe("withGuidance — append the CAS-route hint to a cap failure, pass everything else through", () => {
  it("appends the exact guidance sentence (with its leading double space) to a cap failure", () => {
    expect(withGuidance("basis too large")).toBe("basis too large" + HINT);
    expect(withGuidance("exceeded 100 steps")).toBe("exceeded 100 steps" + HINT);
  });
  it("returns a non-cap failure unchanged (no hint appended)", () => {
    expect(withGuidance("the system is inconsistent")).toBe("the system is inconsistent");
  });
  it("passes a null/undefined reason straight through (never fabricates a hint)", () => {
    expect(withGuidance(null)).toBeNull();
    expect(withGuidance(undefined)).toBeUndefined();
  });
});
