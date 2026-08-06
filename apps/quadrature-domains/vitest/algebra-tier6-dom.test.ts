// @vitest-environment jsdom
// Tier 6 busy-lock (5.9) — the RENDERED half (refactor Phase 2, QD-ALG-3). Whether a control carries
// the js-busy-lock marker is now read off the mounted DOM: the two re-seeding controls are locked, and
// EVERY heavy-op (worker-backed) control also carries the marker (a second worker run must not be
// startable while one is in flight). The setBusy MECHANISM (querySelectorAll by marker, the id-array's
// absence, the dynamic .classList.add sites), the WCAG colour-token contrast (style.css), and the
// Undo/_busy + export-stamp source checks stay in the node companion algebra-tier6.test.ts.
import { describe, it, expect, beforeAll } from "vitest";
import { mountAlgebra, type AlgebraMount } from "./_algebra-mount";

let m: AlgebraMount;
beforeAll(async () => { m = await mountAlgebra(); });

describe("5.9 — busy-lockable controls carry the marker (rendered)", () => {
  it("the two re-seeding controls are locked", () => {
    for (const id of ["alg-seed-moment", "alg-w0-fix"]) {
      const el = m.$("#" + id);
      expect(el, id + " renders").toBeTruthy();
      expect(el!.classList.contains("js-busy-lock"), id + " must carry js-busy-lock").toBe(true);
    }
  });

  it("every heavy-op (worker-backed) control also carries js-busy-lock", () => {
    const heavy = m.$$(".heavy-op");
    expect(heavy.length, "there are heavy-op controls in the sidebar").toBeGreaterThan(0);
    const missing = heavy.filter((el) => !el.classList.contains("js-busy-lock"))
      .map((el) => el.id || el.className);
    expect(missing, "heavy-op controls missing js-busy-lock: " + missing.join(", ")).toEqual([]);
  });
});
