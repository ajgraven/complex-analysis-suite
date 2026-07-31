// Characterization net for the pure domain-mode algebra extracted from ui.mjs (refactor D — ui.mjs seam).
//
// ui.mjs is a ~1931-line DOM orchestrator with no export seam, so composeMode / decomposeMode / modeSummary
// were module-private and untested. This pins their behavior — including two DELIBERATE quirks (classical
// drops `singular`; modeSummary emits the ungrammatical "a unbounded") — so the extraction is provably
// behavior-preserving and a later ui.mjs decomposition can't silently change the mode mapping. No DOM needed.
import { describe, it, expect } from "vitest";
import { composeMode, decomposeMode, modeSummary } from "../app/ui-domain-mode.mjs";

describe("ui-domain-mode: composeMode (controls → MODES key)", () => {
  it("classical → the bare domain (weight + singular dropped)", () => {
    expect(composeMode("classical", "bounded", false)).toBe("bounded");
    // quirk: classical has no singular variant, so `singular` is ignored here.
    expect(composeMode("classical", "unbounded", true)).toBe("unbounded");
  });
  it("weighted → <weight>-<domain>[-singular]", () => {
    expect(composeMode("pqd", "bounded", true)).toBe("pqd-bounded-singular");
    expect(composeMode("lqd", "unbounded", false)).toBe("lqd-unbounded");
  });
});

describe("ui-domain-mode: decomposeMode (MODES key → controls)", () => {
  it("bare classical keys", () => {
    expect(decomposeMode("bounded")).toEqual({ weight: "classical", domain: "bounded", singular: false });
    expect(decomposeMode("unbounded")).toEqual({ weight: "classical", domain: "unbounded", singular: false });
  });
  it("weighted keys, with/without singular", () => {
    expect(decomposeMode("pqd-bounded-singular")).toEqual({ weight: "pqd", domain: "bounded", singular: true });
    expect(decomposeMode("lqd-unbounded")).toEqual({ weight: "lqd", domain: "unbounded", singular: false });
  });
  it("an unrecognized key falls back to classical/bounded", () => {
    expect(decomposeMode("nonsense")).toEqual({ weight: "classical", domain: "bounded", singular: false });
    expect(decomposeMode("")).toEqual({ weight: "classical", domain: "bounded", singular: false });
  });
});

describe("ui-domain-mode: compose ∘ decompose round-trips (except the classical-singular asymmetry)", () => {
  const MODES = [
    "bounded", "unbounded",
    "pqd-bounded", "pqd-bounded-singular", "pqd-unbounded", "pqd-unbounded-singular",
    "lqd-bounded", "lqd-bounded-singular", "lqd-unbounded", "lqd-unbounded-singular",
  ];
  for (const m of MODES) {
    it(`round-trips ${m}`, () => {
      const d = decomposeMode(m);
      expect(composeMode(d.weight, d.domain, d.singular)).toBe(m);
    });
  }
  it("classical + singular does NOT round-trip — singular is dropped, by design", () => {
    expect(composeMode("classical", "bounded", true)).toBe("bounded");
  });
});

describe("ui-domain-mode: modeSummary (plain-language description; exact strings + glyphs)", () => {
  it("bounded classical", () => {
    expect(modeSummary("bounded")).toBe(
      "Solving for a bounded classical (unweighted) quadrature domain Ω from your h(w).",
    );
  });
  it("unbounded power-weighted (preserves the literal 'a unbounded' + α/−/∞ glyphs)", () => {
    expect(modeSummary("pqd-unbounded")).toBe(
      "Solving for a unbounded (reaches ∞) power-weighted (|w|^(2(α−1))) quadrature domain Ω from your h(w).",
    );
  });
  it("bounded log-weighted singular (origin-inside clause)", () => {
    expect(modeSummary("lqd-bounded-singular")).toBe(
      "Solving for a bounded log-weighted (1/|w|²) quadrature domain Ω from your h(w), with the origin inside Ω.",
    );
  });
});
