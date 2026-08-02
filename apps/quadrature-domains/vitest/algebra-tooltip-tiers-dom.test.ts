// @vitest-environment jsdom
// The three-tier tooltip rule — the RENDERED half (refactor Phase 2, QD-ALG-3). After mount,
// QD.Strings.apply() + applyOpHelp() materialise every data-str-title / algebraOps hook into a real
// `title`, so we can assert the actual affordance the user gets rather than regexing the markup: no
// rendered title is a wall of text, and the six controls that used to carry their own
// data-str-title="tooltips.*" no longer do (their text moved to algebraOps). The ui-strings DATA
// checks (algebraOps record shape, 36-record coverage, per-record 120-char shorts) and the mount
// wiring-order stay in the node-env companion algebra-tooltip-tiers.test.ts.
import { describe, it, expect, beforeAll } from "vitest";
import { mountAlgebra, type AlgebraMount } from "./_algebra-mount";

let m: AlgebraMount;
beforeAll(async () => { m = await mountAlgebra(); });

describe("tier 1 — every rendered title is one line", () => {
  it("no control in the mounted sidebar carries a title over the ~120-char rule", () => {
    // The materialised end state: whatever the source (a literal title=, a data-str-title hook, or an
    // algebraOps `short`), the string the platform actually shows as a tooltip must clear the rule.
    const long = m.$$("[title]")
      .map((el) => el.getAttribute("title") || "")
      .filter((t) => t.length > 120);
    expect(long, "titles over 120 chars: " + long.map((t) => t.slice(0, 40)).join(" | ")).toEqual([]);
  });

  it('the six relocated tooltips no longer reach their control via data-str-title="tooltips.*"', () => {
    // They now come through algebraOps; a data-str-title="tooltips.X" survivor would bypass the
    // section's `?` and, being over 120, reintroduce the wall-of-text tooltip.
    for (const k of ["assumeReal", "gaugeElim", "groebner", "dimension", "solveNumeric", "algFixW0"]) {
      expect(m.$$('[data-str-title="tooltips.' + k + '"]').length, k + " should come from algebraOps now").toBe(0);
    }
  });
});
