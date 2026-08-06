// Characterization net for the substitution ratio-prefix formatters carved out of installAlgebra (refactor
// D, installAlgebra carve-out 4): fmtRatio (a live Gaussian ratio → prefix) + ratioStrRec (a serialized
// {re:[n,d],im:[n,d]} provenance record → prefix). Both render the coefficient in front of an identified
// variable ("x = (c)·y") and were reachable only through a live DOM mount, so had NO executable coverage.
// The two special cases that keep the prefix compact — c = 1 → "" and c = −1 → "−" — are the load-bearing
// rows; everything else falls through to "(<exact value>)·". Pinned directly (pure; the module chains
// qd-equations so exactValueStr's rationalizer is wired — no jsdom). The middle dot is U+00B7, the minus is
// U+2212; both pinned so a "cleanup" can't swap them.
import { describe, it, expect } from "vitest";
import { fmtRatio, ratioStrRec } from "../app/algebra/algebra-format.mjs";

// fmtRatio takes a Gaussian whose re/im expose .toNumber(); a duck-typed stub is all it reads.
const g = (re: number, im: number) => ({ re: { toNumber: () => re }, im: { toNumber: () => im } });

describe("fmtRatio — prefix from a live Gaussian ratio", () => {
  it("collapses the two unit cases: c = 1 → '' and c = −1 → '−' (U+2212)", () => {
    expect(fmtRatio(g(1, 0))).toBe("");
    expect(fmtRatio(g(-1, 0))).toBe("−");
  });
  it("otherwise wraps the exact value in '(…)·' (middle dot U+00B7)", () => {
    expect(fmtRatio(g(2, 0))).toBe("(2)·");
    expect(fmtRatio(g(0, 1))).toBe("(1i)·");
    expect(fmtRatio(g(0.5, -0.25))).toBe("(1/2 − 1/4i)·");
  });
  it("falls back to a literal '(c)·' when the Gaussian can't be read (defensive try/catch)", () => {
    expect(fmtRatio(null)).toBe("(c)·");
    expect(fmtRatio({ re: { toNumber: () => { throw new Error("boom"); } }, im: { toNumber: () => 0 } })).toBe("(c)·");
  });
});

describe("ratioStrRec — prefix from a serialized {re:[n,d],im:[n,d]} record (or a ±1 sign fallback)", () => {
  it("no record ⇒ the sign fallback: negative → '−', otherwise ''", () => {
    expect(ratioStrRec(null, -1)).toBe("−");
    expect(ratioStrRec(null, 1)).toBe("");
    expect(ratioStrRec(null)).toBe(""); // sign absent ⇒ ''
  });
  it("collapses the two unit cases: 1 → '' and −1 → '−'", () => {
    expect(ratioStrRec({ re: [1, 1], im: [0, 1] })).toBe("");
    expect(ratioStrRec({ re: [-1, 1], im: [0, 1] })).toBe("−");
  });
  it("otherwise wraps the exact rational value in '(…)·'", () => {
    expect(ratioStrRec({ re: [1, 2], im: [0, 1] })).toBe("(1/2)·");
    expect(ratioStrRec({ re: [0, 1], im: [1, 2] })).toBe("(1/2i)·");
    expect(ratioStrRec({ re: [3, 2], im: [-1, 4] })).toBe("(3/2 − 1/4i)·");
  });
});
