// qd-varscheme — the canonical conjugate-model variable decoder (parseVar / encodeVar / conjVar /
// latexVar). Pure string logic, so imported directly. Golden values are the pre-refactor outputs
// of qd-equations' conjVarName + latexOfConjugate (and qd-constraints' shared block), locking the
// single source of truth: parse round-trip, the conjugate bar-toggle (self-inverse), non-scheme
// passthrough, and the exact LaTeX.
import { describe, it, expect } from "vitest";
import { parseVar, encodeVar, conjVar, latexVar } from "../app/qd-varscheme.mjs";

describe("qd-varscheme (conjugate-model variable scheme)", () => {
  const SCHEME = ["A1_2", "Ab1_2", "C3_1", "Cb3_1", "z1", "zb1", "a2", "ab2", "w0", "wb0"];
  const NON_SCHEME = ["p1_2", "q1_2", "x1", "y1", "ax1", "ay1", "Cx1_2", "Cy1_2", "wx0", "wy0", "Z", "Zb", "cosL", "sinL", "Wsat", "i"];

  it("parseVar ∘ encodeVar round-trips every scheme name", () => {
    for (const n of SCHEME) expect(encodeVar(parseVar(n) as any)).toBe(n);
  });

  it("parseVar returns null for non-scheme names (reim / boundary / aux)", () => {
    for (const n of NON_SCHEME) expect(parseVar(n)).toBeNull();
  });

  it("conjVar is the reality-slice bar toggle + self-inverse (golden partners)", () => {
    const pairs: [string, string][] = [["A1_2", "Ab1_2"], ["C3_1", "Cb3_1"], ["z1", "zb1"], ["a2", "ab2"], ["w0", "wb0"]];
    for (const [x, y] of pairs) {
      expect(conjVar(x)).toBe(y);
      expect(conjVar(y)).toBe(x);
      expect(conjVar(conjVar(x))).toBe(x);
    }
  });

  it("conjVar passes non-scheme names through unchanged (reim / boundary / aux)", () => {
    for (const n of ["cosL", "sinL", "Wsat", "p1_2", "x1", "Z", "Zb"]) expect(conjVar(n)).toBe(n);
  });

  it("latexVar matches the pre-refactor latexOfConjugate (golden)", () => {
    expect(latexVar("A1_2")).toBe("A_{1,2}");
    expect(latexVar("Ab1_2")).toBe("\\bar{A}_{1,2}");
    expect(latexVar("C3_1")).toBe("C_{3,1}");
    expect(latexVar("Cb3_1")).toBe("\\bar{C}_{3,1}");
    expect(latexVar("z1")).toBe("z_{1}");
    expect(latexVar("zb1")).toBe("\\bar{z}_{1}");
    expect(latexVar("a2")).toBe("a_{2}");
    expect(latexVar("ab2")).toBe("\\bar{a}_{2}");
    expect(latexVar("w0")).toBe("w_0");
    expect(latexVar("wb0")).toBe("\\bar{w}_0");
    expect(latexVar("cosL")).toBe("cosL"); // non-scheme passthrough
  });
});
