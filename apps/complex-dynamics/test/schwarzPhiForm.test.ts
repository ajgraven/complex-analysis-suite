import { describe, expect, it } from "vitest";
import {
  parseComplex,
  parseComplexList,
  parsePoles,
  buildSchwarzPhi,
  buildBoundedSchwarzPhi,
  SCHWARZ_PRESETS,
} from "../src/render/schwarzPhiForm";

describe("schwarzPhiForm.parseComplex", () => {
  it("parses reals, pure imaginaries, and a ± bi", () => {
    expect(parseComplex("0.5")).toEqual([0.5, 0]);
    expect(parseComplex("0")).toEqual([0, 0]);
    expect(parseComplex("-1.5")).toEqual([-1.5, 0]);
    expect(parseComplex("i")).toEqual([0, 1]);
    expect(parseComplex("-i")).toEqual([0, -1]);
    expect(parseComplex("2i")).toEqual([0, 2]);
    expect(parseComplex("0.5+0.1i")).toEqual([0.5, 0.1]);
    expect(parseComplex("0.05-0.03i")).toEqual([0.05, -0.03]);
    expect(parseComplex("1+i")).toEqual([1, 1]);
    expect(parseComplex("1-i")).toEqual([1, -1]);
  });

  it("tolerates whitespace and the `*i` spelling", () => {
    expect(parseComplex("  0.5 + 0.1 i ")).toEqual([0.5, 0.1]);
    expect(parseComplex("0.5*i")).toEqual([0, 0.5]);
    expect(parseComplex("-0.7 - 0.4*i")).toEqual([-0.7, -0.4]);
  });

  it("throws on empty / unparseable input", () => {
    expect(() => parseComplex("")).toThrow();
    expect(() => parseComplex("abc")).toThrow(/cannot parse|not a number/);
  });
});

describe("schwarzPhiForm.parseComplexList", () => {
  it("empty → [] and a comma list → the coefficients", () => {
    expect(parseComplexList("")).toEqual([]);
    expect(parseComplexList("0, 0, 0.5")).toEqual([[0, 0], [0, 0], [0.5, 0]]);
    expect(parseComplexList("0.5+0.1i, -0.03i")).toEqual([[0.5, 0.1], [0, -0.03]]);
  });
});

describe("schwarzPhiForm.parsePoles", () => {
  it("parses `z ; A…` lines, single and higher order", () => {
    expect(parsePoles("0.3 ; 0.4")).toEqual([{ z: [0.3, 0], A: [[0.4, 0]] }]);
    expect(parsePoles("0.25+0.1i ; 0.12, 0.05-0.03i")).toEqual([
      { z: [0.25, 0.1], A: [[0.12, 0], [0.05, -0.03]] },
    ]);
  });

  it("parses multiple poles (one per line) and ignores blank lines", () => {
    expect(parsePoles("0.2 ; 0.15\n\n-0.1+0.2i ; 0.05+0.1i")).toEqual([
      { z: [0.2, 0], A: [[0.15, 0]] },
      { z: [-0.1, 0.2], A: [[0.05, 0.1]] },
    ]);
  });

  it("empty → []", () => {
    expect(parsePoles("")).toEqual([]);
    expect(parsePoles("  \n  ")).toEqual([]);
  });

  it("rejects a missing ';', a pole on/outside the unit circle, and an empty coefficient list", () => {
    expect(() => parsePoles("0.3 0.4")).toThrow(/;/);
    expect(() => parsePoles("1.5 ; 0.4")).toThrow(/unit disk/);
    expect(() => parsePoles("1 ; 0.4")).toThrow(/unit disk/); // |z| = 1 is on the boundary, not inside
    expect(() => parsePoles("0.3 ;")).toThrow(/at least one coefficient/);
  });
});

describe("schwarzPhiForm.buildSchwarzPhi", () => {
  it("builds a pole-free deltoid and a pole-bearing domain", () => {
    expect(buildSchwarzPhi({ c: "1", F: "0, 0, 0.5", poles: "" })).toEqual({
      c: [1, 0],
      F: [[0, 0], [0, 0], [0.5, 0]],
      branches: [],
    });
    expect(buildSchwarzPhi({ c: "1", F: "", poles: "0.3 ; 0.4" })).toEqual({
      c: [1, 0],
      F: [],
      branches: [{ z: [0.3, 0], A: [[0.4, 0]] }],
    });
  });

  it("accepts a complex leading coefficient c (S5-C1)", () => {
    expect(buildSchwarzPhi({ c: "1+0.5i", F: "0, 0, 0.4", poles: "" }).c).toEqual([1, 0.5]);
    expect(buildSchwarzPhi({ c: "-i", F: "0, 0, 0.4", poles: "" }).c).toEqual([0, -1]);
  });

  it("rejects empty / zero c, and a c·z-only domain with no boundary structure", () => {
    expect(() => buildSchwarzPhi({ c: "", F: "0,0,0.5", poles: "" })).toThrow(/enter a leading coefficient/);
    expect(() => buildSchwarzPhi({ c: "0", F: "0,0,0.5", poles: "" })).toThrow(/non-zero/);
    expect(() => buildSchwarzPhi({ c: "0+0i", F: "0,0,0.5", poles: "" })).toThrow(/non-zero/);
    expect(() => buildSchwarzPhi({ c: "1", F: "", poles: "" })).toThrow(/just a circle/);
    expect(() => buildSchwarzPhi({ c: "1", F: "0, 0", poles: "" })).toThrow(/just a circle/);
  });
});

describe("schwarzPhiForm.buildSchwarzPhi — bounded family (S5-C2)", () => {
  it("builds a bounded φ from w₀ + interior poles (family:'bounded' dispatches to the bounded builder)", () => {
    // The single-lobe golden's φ: w₀ = 0, one interior pole z_j = 0.3, A = 0.5. No leading c / Laurent tail.
    expect(buildSchwarzPhi({ family: "bounded", c: "", F: "", w0: "0", poles: "0.3 ; 0.5" })).toEqual({
      family: "bounded",
      c: [0, 0],
      F: [],
      w0: [0, 0],
      branches: [{ z: [0.3, 0], A: [[0.5, 0]] }],
    });
  });

  it("buildBoundedSchwarzPhi: the unit disk (z_j=0, A=1 ⇒ φ(z)=z), an empty w₀ ⇒ 0, and a complex centre", () => {
    expect(buildBoundedSchwarzPhi({ w0: "0", poles: "0 ; 1" })).toEqual({
      family: "bounded",
      c: [0, 0],
      F: [],
      w0: [0, 0],
      branches: [{ z: [0, 0], A: [[1, 0]] }],
    });
    expect(buildBoundedSchwarzPhi({ w0: "", poles: "0.3 ; 0.5" }).w0).toEqual([0, 0]); // absent centre ⇒ 0
    expect(buildBoundedSchwarzPhi({ w0: "0.2-0.1i", poles: "0.3 ; 0.5" }).w0).toEqual([0.2, -0.1]);
  });

  it("rejects a bounded domain with no interior pole (a degenerate point), and a pole outside 𝔻", () => {
    expect(() => buildSchwarzPhi({ family: "bounded", c: "", F: "", w0: "0", poles: "" })).toThrow(
      /at least one interior pole/,
    );
    expect(() => buildBoundedSchwarzPhi({ w0: "0", poles: "1.5 ; 0.5" })).toThrow(/unit disk/); // |z_j| ≥ 1
    expect(() => buildBoundedSchwarzPhi({ w0: "bad", poles: "0.3 ; 0.5" })).toThrow(/cannot parse|not a number/);
  });
});

describe("schwarzPhiForm presets", () => {
  it("every preset builds without error (the fields are valid by construction)", () => {
    expect(SCHWARZ_PRESETS.length).toBeGreaterThanOrEqual(3);
    // A bounded preset builds a bounded φ (family + w₀); the family is carried on the preset itself.
    expect(SCHWARZ_PRESETS.some((p) => p.family === "bounded")).toBe(true);
    for (const p of SCHWARZ_PRESETS) {
      expect(() => buildSchwarzPhi({ family: p.family, c: p.c, F: p.F, w0: p.w0, poles: p.poles }), p.id).not.toThrow();
    }
  });

  it("the deltoid preset is the classical z + 1/(2z²)", () => {
    const deltoid = SCHWARZ_PRESETS.find((p) => p.id === "deltoid");
    if (!deltoid) throw new Error("deltoid preset missing");
    expect(buildSchwarzPhi({ c: deltoid.c, F: deltoid.F, poles: deltoid.poles })).toEqual({
      c: [1, 0],
      F: [[0, 0], [0, 0], [0.5, 0]],
      branches: [],
    });
  });
});
