// Characterization net for classifyVerdict + posDimDesc — the pure honest-labeling verdict prose carved
// out of installAlgebra's doClassify (refactor D, installAlgebra carve-out 1).
//
// doClassify built this verdict inline inside an async DOM handler, so the =/≤ honest-labeling wording —
// the project's central guardrail — had NO executable coverage. These assertions pin the exact strings
// (derived from the source, not the extraction) so the carve is provably behavior-preserving and a later
// unification of the three drifted verdict builders can't silently change the mapping. Pure ⇒ no DOM/jsdom.
import { describe, it, expect } from "vitest";
import { classifyVerdict, posDimDesc } from "../app/algebra/algebra-labeling.mjs";

describe("posDimDesc — honest one-line size of a positive-dimensional verdict", () => {
  it("names the true Krull DIMENSION when carried (≥ 1)", () => {
    expect(posDimDesc({ krullDim: 2, numVars: 4 })).toBe("dimension 2, 4 real variables");
  });
  it("degrades to the ambient variable count alone when no dimension is carried (dim 0 is not positive-dim)", () => {
    expect(posDimDesc({ numVars: 3 })).toBe("3 real variables");
    expect(posDimDesc({ krullDim: 0, numVars: 4 })).toBe("4 real variables");
  });
  it("shows '?' for an absent variable count rather than inventing a number", () => {
    expect(posDimDesc({})).toBe("? real variables");
    expect(posDimDesc(null)).toBe("? real variables");
  });
});

describe("classifyVerdict — the classify-result → verdict-prose decision tree", () => {
  it("inconsistent ⇒ the one exact 'no QD' certificate (wins over any other field)", () => {
    expect(classifyVerdict({ inconsistent: true })).toBe(
      "No quadrature domain: the system is inconsistent (1 ∈ I).",
    );
    // precedence: inconsistent is checked first, so a bound-ish realCount does not override it.
    expect(classifyVerdict({ inconsistent: true, zeroDim: true, realCount: 3 })).toBe(
      "No quadrature domain: the system is inconsistent (1 ∈ I).",
    );
  });

  it("positive-dimensional ⇒ 'Infinitely many', sized by posDimDesc (with and without a Krull dimension)", () => {
    expect(classifyVerdict({ zeroDim: false, numVars: 4, krullDim: 2 })).toBe(
      "Infinitely many: a positive-dimensional family (dimension 2, 4 real variables).",
    );
    expect(classifyVerdict({ zeroDim: false, numVars: 3 })).toBe(
      "Infinitely many: a positive-dimensional family (3 real variables).",
    );
  });

  it("zero-dimensional but real count unavailable ⇒ complex multiplicity + the reason", () => {
    expect(classifyVerdict({ zeroDim: true, realCount: null, multiplicity: 5, reason: "over cap" })).toBe(
      "Zero-dimensional: 5 complex solution(s) with multiplicity (real count unavailable: over cap).",
    );
  });

  it("no real solutions ⇒ 'No real quadrature domain', with the distinct-complex tail (mult>cx adds the multiplicity clause)", () => {
    // mult === cx ⇒ no "with multiplicity" clause
    expect(classifyVerdict({ zeroDim: true, realCount: 0, complexCount: 6, multiplicity: 6 })).toBe(
      "No real quadrature domain (of 6 distinct complex).",
    );
    // mult > cx ⇒ the "; N with multiplicity" clause appears
    expect(classifyVerdict({ zeroDim: true, realCount: 0, complexCount: 6, multiplicity: 8 })).toBe(
      "No real quadrature domain (of 6 distinct complex; 8 with multiplicity).",
    );
  });

  it("exactly one real solution ⇒ the honest 'upper bound' wording, NOT 'the unique QD'", () => {
    expect(classifyVerdict({ zeroDim: true, realCount: 1, complexCount: 3, multiplicity: 3 })).toBe(
      "A unique real algebraic solution (of 3 distinct complex) — an upper bound on the quadrature-domain count;"
        + " run Certify univalence for the genuine-QD count (gauge copies merged, non-univalent ones filtered).",
    );
  });

  it("multiple real solutions ⇒ the count + Certify prompt; empty tail when no complex count is carried", () => {
    expect(classifyVerdict({ zeroDim: true, realCount: 2, complexCount: null })).toBe(
      "2 real algebraic solutions — run Certify univalence for the genuine-QD count"
        + " (gauge copies merged, non-univalent ones filtered).",
    );
  });

  it("PINS the deliberate ==1 vs >=2 asymmetry: only the ==1 string carries 'an upper bound on the quadrature-domain count;'", () => {
    // The comment at the source (C-1) makes this asymmetry intentional — pin it so nobody 'harmonizes' the two.
    const one = classifyVerdict({ zeroDim: true, realCount: 1 });
    const two = classifyVerdict({ zeroDim: true, realCount: 2 });
    expect(one).toContain("an upper bound on the quadrature-domain count;");
    expect(two).not.toContain("an upper bound on the quadrature-domain count;");
    // both still steer the user to Certify univalence
    expect(one).toContain("run Certify univalence for the genuine-QD count");
    expect(two).toContain("run Certify univalence for the genuine-QD count");
  });

  it("PINS the loose `== null` guard: realCount undefined routes to 'real count unavailable', reason absent ⇒ empty", () => {
    expect(classifyVerdict({ zeroDim: true, realCount: undefined, multiplicity: 2 })).toBe(
      "Zero-dimensional: 2 complex solution(s) with multiplicity (real count unavailable: ).",
    );
  });
});
