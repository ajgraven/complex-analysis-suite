// @vitest-environment jsdom
//
// The Algebra sidebar's auto-detected suggestion list. It is UNBOUNDED (one row per detected
// symmetry / abbreviation — a single order-1 pole already produces 7), and it used to render
// inside the `position: sticky` .algebra-head, which pinned 525px of a 720px viewport and left
// ~195px for every workflow section below. It now lives outside the header and collapses to a
// counted <summary> past AUTO_OPEN_MAX. These lock the two pure decisions behind that:
// the summary label, and the expand/collapse resolution (where the subtle case is an explicit
// user toggle surviving the re-render that every dismissal triggers).
import { describe, it, expect, beforeAll } from "vitest";

let UI: any;
beforeAll(async () => {
  await import("../app/solver.mjs");              // installs the QD namespace
  const reg: any = await import("../app/ui-registry.mjs");
  await import("../app/algebra/algebra-ui.mjs");  // IIFE side-effect: attaches the helpers
  UI = reg.QD_UI;
});

describe("suggestSummaryLabel — the collapsed <summary> text", () => {
  it("pluralizes each kind independently and joins both with '·'", () => {
    expect(UI.suggestSummaryLabel(1, 0)).toBe("1 symmetry suggested");
    expect(UI.suggestSummaryLabel(3, 0)).toBe("3 symmetries suggested");
    expect(UI.suggestSummaryLabel(0, 1)).toBe("1 abbreviation suggested");
    expect(UI.suggestSummaryLabel(0, 4)).toBe("4 abbreviations suggested");
    expect(UI.suggestSummaryLabel(3, 2)).toBe("3 symmetries · 2 abbreviations suggested");
    expect(UI.suggestSummaryLabel(1, 1)).toBe("1 symmetry · 1 abbreviation suggested");
  });
  it("omits a zero count rather than saying '0'", () => {
    expect(UI.suggestSummaryLabel(2, 0)).not.toContain("0 ");
    expect(UI.suggestSummaryLabel(0, 2)).not.toContain("0 ");
  });
});

describe("suggestAutoOpen — expanded or collapsed", () => {
  const MAX = 2;   // mirrors AUTO_OPEN_MAX; the export is asserted against it below

  it("exports the threshold these cases were written against", () => {
    expect(UI.SUGGEST_AUTO_OPEN_MAX).toBe(MAX);
  });
  it("untouched (null): expands a short list, collapses a long one", () => {
    expect(UI.suggestAutoOpen(1, null)).toBe(true);
    expect(UI.suggestAutoOpen(MAX, null)).toBe(true);
    expect(UI.suggestAutoOpen(MAX + 1, null)).toBe(false);
    expect(UI.suggestAutoOpen(7, null)).toBe(false);
  });
  // The subtle one: renderSuggestions re-runs on every dismissal and on every store rerender.
  // An explicit toggle has to win in BOTH directions or the list fights the user.
  it("an explicit toggle overrides the threshold both ways", () => {
    expect(UI.suggestAutoOpen(7, true)).toBe(true);    // opened a long list — stays open
    expect(UI.suggestAutoOpen(1, false)).toBe(false);  // closed a short list — stays closed
  });
  it("treats only null as 'untouched' (false is a real preference, not absence)", () => {
    expect(UI.suggestAutoOpen(1, false)).toBe(false);
    expect(UI.suggestAutoOpen(1, undefined)).toBe(true);
  });
});
