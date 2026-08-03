// The Direct tab's "Verify" round-trip must hand the inverse solver a bag that selects the SAME
// family the forward construction used.
//
// selectFamily walks each family's matches(opts). boundedLQD's is `opts.lqd && !opts.unbounded`;
// boundedQD is the catch-all (`matches(){ return true; }`) and is walked last. direct-verify built
// `{ weight: 'log', w0 }` for the bounded log-weighted case — and NO solver reads `opts.weight`, so
// that bag matched nothing specific, fell through to the classical boundedQD, and the round-trip
// reported the classical solver's verdict as a pass for the log-weighted construction.
//
// These assertions pin the dispatch keys themselves, which is what actually decides the family.
import { describe, expect, it, beforeAll } from "vitest";

type Family = Record<string, unknown>;
let selectFamily: (opts: unknown) => Family;
let registry: Record<string, Family>;

beforeAll(async () => {
  // Families self-register on import, and the seed modules must precede their solvers — the same
  // ordered chain main.mjs uses. Without it the registry is empty and selectFamily returns
  // undefined, so this setup is load-bearing, not ceremony.
  const QD = (await import("../app/solvers/solver.mjs")).default as Record<string, unknown>;
  await import("../app/solvers/seeds/seeds-qd.mjs");
  await import("../app/solvers/solver-qd.mjs");
  await import("../app/solvers/seeds/seeds-uqd.mjs");
  await import("../app/solvers/solver-uqd.mjs");
  await import("../app/solvers/solver-lqd-common.mjs");
  await import("../app/solvers/seeds/seeds-lqd.mjs");
  await import("../app/solvers/solver-lqd.mjs");
  await import("../app/solvers/seeds/seeds-uqd-lqd.mjs");
  await import("../app/solvers/solver-uqd-lqd.mjs");
  await import("../app/solvers/solver-pqd-common.mjs");
  await import("../app/solvers/seeds/seeds-pqd.mjs");
  await import("../app/solvers/solver-pqd.mjs");
  selectFamily = QD.selectFamily as typeof selectFamily;
  registry = QD.Family as Record<string, Family>;
});

/** selectFamily returns the family OBJECT; name it by its registry key. */
const nameOf = (f: Family): string => {
  for (const [k, v] of Object.entries(registry)) if (v === f) return k;
  return "(unregistered)";
};

describe("direct-verify round-trip family dispatch", () => {
  it("exposes selectFamily", () => {
    expect(typeof selectFamily).toBe("function");
  });

  it("`weight: 'log'` is NOT a dispatch key — it silently selects the classical family", () => {
    // The pre-fix bag. Documented here so the trap is not re-introduced: it does not throw, it does
    // not warn, it just quietly resolves to the wrong family.
    const wrong = nameOf(selectFamily({ weight: "log", w0: { re: 1, im: 0 } }));
    const classical = nameOf(selectFamily({}));
    expect(wrong).toBe(classical);
    expect(wrong.toLowerCase()).not.toContain("lqd");
  });

  it("`lqd: true` selects the bounded LQD family — the bag direct-verify now builds", () => {
    const f = nameOf(selectFamily({ lqd: true, w0: { re: 1, im: 0 } }));
    expect(f.toLowerCase()).toContain("lqd");
    expect(f).not.toBe(nameOf(selectFamily({})));
  });

  it("the log bag and the classical bag must resolve to DIFFERENT families", () => {
    // The invariant the bug violated, stated directly.
    expect(nameOf(selectFamily({ lqd: true, w0: { re: 1, im: 0 } }))).not.toBe(nameOf(selectFamily({})));
  });

  it("the power branch was already correct: `alpha` is a real dispatch key", () => {
    // Why only the log branch broke — solver-pqd matches on alpha.
    const f = nameOf(selectFamily({ alpha: 0.5 }));
    expect(f).not.toBe(nameOf(selectFamily({})));
  });

  it("bounded LQD is distinct from UNBOUNDED LQD (matches() also excludes opts.unbounded)", () => {
    const bounded = nameOf(selectFamily({ lqd: true }));
    const unbounded = nameOf(selectFamily({ lqd: true, unbounded: true }));
    expect(bounded).not.toBe(unbounded);
  });
});
