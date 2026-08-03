// @vitest-environment jsdom
//
// Q5 — the compact complex-value formatter (QD_UI.fmtComplex). There used to be TWO shadowed in-closure
// `_fmtComplex` declarations with divergent rounding; JS hoisting silently used the LATER one, and that
// live copy had lost the earlier copy's null-guard — so `_fmtComplex(known.w0)` on an unpinned value THREW
// instead of yielding '?'. This pins the consolidated module-scope copy: the live rounding/format (re
// snapped at 1e-10, im rounded, |im| < 1e-8 ⇒ real, 6-decimal rounding) AND the restored guard.
import { describe, it, expect, beforeAll } from "vitest";

let fmt: (v: unknown) => string;
beforeAll(async () => {
  await import("../app/solvers/solver.mjs");             // installs the QD namespace
  const reg: any = await import("../app/ui/ui-registry.mjs");
  await import("../app/algebra/algebra-ui.mjs"); // IIFE side-effect: QD_UI.fmtComplex = _fmtComplex
  fmt = reg.QD_UI.fmtComplex;
});

describe("QD_UI.fmtComplex — compact { re, im } inline formatter", () => {
  it("returns '?' for a null/absent value (the RESTORED guard — the live copy threw here)", () => {
    expect(fmt(null)).toBe("?");
    expect(fmt(undefined)).toBe("?");
  });

  it("drops a negligible imaginary part (|im| < 1e-8) → the real part only", () => {
    expect(fmt({ re: 2, im: 0 })).toBe("2");
    expect(fmt({ re: -1.5, im: 1e-12 })).toBe("-1.5");
  });

  it("snaps a negligible real part (|re| < 1e-10) to 0", () => {
    expect(fmt({ re: 1e-14, im: 3 })).toBe("0 + 3i");
  });

  it("formats a genuine complex value with the ± join (U+2212 minus)", () => {
    expect(fmt({ re: 1, im: 2 })).toBe("1 + 2i");
    expect(fmt({ re: 1, im: -2 })).toBe("1 − 2i");
  });

  it("rounds to 6 decimals", () => {
    expect(fmt({ re: 0.12345678, im: 0 })).toBe("0.123457");
  });
});
