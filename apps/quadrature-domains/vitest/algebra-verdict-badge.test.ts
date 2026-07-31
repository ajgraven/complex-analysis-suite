// @vitest-environment jsdom
//
// Characterization net for _verdictBadge — the pure classify-result → chip-badge builder lifted out of
// installAlgebra to IIFE scope (refactor D, installAlgebra carve-out 2). It powers the per-branch verdict
// chips (cacheActiveVerdict / classifyAllBranches): the `state` drives the chip COLOUR and the `title` is the
// honest-labeling tooltip. Two guardrails matter most and had NO executable coverage before (the fn was
// reachable only through a full DOM+solver mount): (1) a lone real ALGEBRAIC solution is state 'multi' with an
// "upper bound on #QD" tooltip — never a green 'unique' (finding C-1); (2) a slice/branch count is starred and
// tagged a LOWER BOUND so a specialization never reads as the general count. Pins the badge glyph, state and
// title exactly. Reached via QD_UI (the fn stays module-private on the registry, like the T1 helpers).
import { describe, it, expect, beforeAll } from "vitest";

let verdictBadge: (r: unknown) => { badge: string; state: string; title: string } | null;

beforeAll(async () => {
  await import("../app/solver.mjs");
  const reg: any = await import("../app/ui-registry.mjs");
  await import("../app/algebra/algebra-ui.mjs");
  verdictBadge = reg.QD_UI._verdictBadge;
});

describe("_verdictBadge — defensive / non-result inputs", () => {
  it("returns null for a missing or aborted result (no chip to draw)", () => {
    expect(verdictBadge(null)).toBeNull();
    expect(verdictBadge({ aborted: true })).toBeNull();
  });
  it("a failed classify → a '?' unknown badge carrying the reason (defensive, not a claim)", () => {
    expect(verdictBadge({ ok: false, reason: "solver crashed" }))
      .toEqual({ badge: "?", state: "unknown", title: "solver crashed" });
    expect(verdictBadge({ ok: false })).toEqual({ badge: "?", state: "unknown", title: "classify unavailable" });
  });
});

describe("_verdictBadge — the four base verdict states (badge glyph + colour-state + tooltip)", () => {
  it("inconsistent ⇒ ∅ / none / 'no QD — system inconsistent (1 ∈ I)'", () => {
    expect(verdictBadge({ ok: true, inconsistent: true }))
      .toEqual({ badge: "∅", state: "none", title: "no QD — system inconsistent (1 ∈ I)" });
  });
  it("positive-dimensional ⇒ ∞ / open / 'positive-dimensional family (…)' via posDimDesc", () => {
    expect(verdictBadge({ ok: true, zeroDim: false, numVars: 3 }))
      .toEqual({ badge: "∞", state: "open", title: "positive-dimensional family (3 real variables)" });
  });
  it("zero-dim but real count over the cap ⇒ fin / unknown (never a silent count)", () => {
    expect(verdictBadge({ ok: true, zeroDim: true, realCount: null, multiplicity: 4 }))
      .toEqual({ badge: "fin", state: "unknown", title: "4 complex solution(s); real count over the cap" });
  });
  it("no real solutions ⇒ 0 QD / none / 'no real quadrature domain'", () => {
    expect(verdictBadge({ ok: true, zeroDim: true, realCount: 0 }))
      .toEqual({ badge: "0 QD", state: "none", title: "no real quadrature domain" });
  });
});

describe("_verdictBadge — HONEST LABELING (C-1): an algebraic real count is an upper bound, never 'unique'", () => {
  it("exactly one real solution ⇒ '1 alg' / MULTI (not a green 'unique') / 'upper bound on #QD'", () => {
    const b = verdictBadge({ ok: true, zeroDim: true, realCount: 1 })!;
    expect(b.badge).toBe("1 alg");
    expect(b.state).toBe("multi"); // the load-bearing guardrail: NOT 'unique'/'none' — no certified count from an unfiltered solve
    expect(b.title).toBe("1 real algebraic solution — an upper bound on #QD; run Certify univalence for the genuine-QD count");
  });
  it("several real solutions ⇒ 'N alg' / multi / the same 'upper bound' steer to Certify", () => {
    expect(verdictBadge({ ok: true, zeroDim: true, realCount: 3 })).toEqual({
      badge: "3 alg",
      state: "multi",
      title: "3 real algebraic solutions — an upper bound on #QD; run Certify univalence for the genuine-QD count",
    });
  });
});

describe("_verdictBadge — specialization suffix (a slice/branch count must not read as the general one)", () => {
  it("a reality slice stars the badge and appends a LOWER-BOUND tooltip note", () => {
    const b = verdictBadge({ ok: true, zeroDim: true, realCount: 2, realVars: ["z1"] })!;
    expect(b.badge).toBe("2 alg*"); // the '*' is the visible "this is narrowed" mark
    expect(b.title).toContain("on the real slice (z̄≡z: z1) only — a LOWER BOUND; off-slice QDs not counted");
  });
  it("a factor CASE names the branch and (when capped) says the components may not cover V(I)", () => {
    const complete = verdictBadge({ ok: true, zeroDim: true, realCount: 1, partialBranch: true, caseIndex: 0, caseCount: 3 })!;
    expect(complete.title).toContain("case 1/3 of a factor split");
    const capped = verdictBadge({
      ok: true, zeroDim: true, realCount: 1,
      partialBranch: true, branchOp: "component", caseIndex: 1, caseCount: 2, branchIncomplete: true,
    })!;
    expect(capped.title).toContain("case 2/2 of a component decomposition (capped — components may not cover V(I))");
  });
});
