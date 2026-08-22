// mathText parser — the pure tokenizer behind the inline-math DOM renderer (Φᵩ, zⁿ, Qₙ,ₘ, Σ bounds).
// The DOM builders (mathFrag/setMath/mathElt) need a document, so this suite covers the pure logic.
import { describe, expect, it } from "vitest";
import { parseMath, PHI } from "../src/mathText.js";

describe("parseMath", () => {
  it("renders a lone `_{…}` as a subscript run", () => {
    expect(parseMath("z_{0}")).toEqual([
      { text: "z", script: "" },
      { text: "0", script: "sub" },
    ]);
  });

  it("renders `^{…}` as a superscript run", () => {
    expect(parseMath("z^{3}")).toEqual([
      { text: "z", script: "" },
      { text: "3", script: "sup" },
    ]);
  });

  it("keeps multi-character scripts intact (Σ bound, Q indices)", () => {
    expect(parseMath("Σ_{n≤32}")).toEqual([
      { text: "Σ", script: "" },
      { text: "n≤32", script: "sub" },
    ]);
    expect(parseMath("Q_{3,2}(w)")).toEqual([
      { text: "Q", script: "" },
      { text: "3,2", script: "sub" },
      { text: "(w)", script: "" },
    ]);
  });

  it("expands the shared Φ operator to Φ + subscript φ", () => {
    expect(parseMath(PHI)).toEqual([
      { text: "Φ", script: "" },
      { text: "φ", script: "sub" },
    ]);
  });

  it("passes a lone `_`/`^` (not followed by `{`) through literally", () => {
    expect(parseMath("a_b ^ c")).toEqual([{ text: "a_b ^ c", script: "" }]);
  });

  it("treats an unterminated `_{` as literal text (no crash)", () => {
    expect(parseMath("z_{0")).toEqual([{ text: "z_{0", script: "" }]);
  });

  it("handles adjacent scripts and mixed baseline runs", () => {
    expect(parseMath("|φ^{−n}F_{n}|")).toEqual([
      { text: "|φ", script: "" },
      { text: "−n", script: "sup" },
      { text: "F", script: "" },
      { text: "n", script: "sub" },
      { text: "|", script: "" },
    ]);
  });

  it("returns a single baseline run for plain text (error readouts)", () => {
    expect(parseMath("parse error: unexpected token")).toEqual([
      { text: "parse error: unexpected token", script: "" },
    ]);
  });
});
