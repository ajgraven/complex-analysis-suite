// @vitest-environment jsdom
//
// Behavioural net for the session-autosave core. Written NET-FIRST for refactor Phase 3 · D1d seam 4,
// which lifts the localStorage debounce (AUTOSAVE_KEY/MAX/DEBOUNCE + _saveTimer/_saveBlocked +
// _writeAutosave / scheduleAutosave / _readAutosave) into app/algebra/algebra-autosave.mjs. The core
// had no dedicated coverage — only algebra-results-drawer.test.ts cross-checks that _writeAutosave does
// NOT serialize the results drawer. This drives the real integration: a mutation SCHEDULES a debounced
// write (not a synchronous one), and the beforeunload flush commits a faithful, restorable session.
// It must pass against the UNMODIFIED algebra-ui.mjs, then guard the carve.
//
// Feasible headlessly: jsdom provides window.localStorage + a dispatchable beforeunload; #alg-seed-moment
// seeds the A–S moment system (store.seedFromPolys, no solve) and rerender()'s scheduleAutosave() arms
// the debounce — the pickers/drawer are not needed, so a sidebar-only mount suffices.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { mountAlgebra, seedMoments, type AlgebraMount } from "./_algebra-mount";

const KEY = "qd-algebra-autosave-v1";
let m: AlgebraMount;

beforeAll(async () => {
  m = await mountAlgebra(); // sidebar-only — autosave needs the store + window, not the canvas
});
// Seed (→ rerender → scheduleAutosave arms the 800ms debounce), then wipe the key so each test starts
// from "scheduled but not yet written". The debounce timer will not fire within a synchronous test.
beforeEach(() => {
  seedMoments(m);
  localStorage.removeItem(KEY);
});

describe("autosave debounces the write and commits it on unload", () => {
  it("does not write synchronously — the save is scheduled, not immediate", () => {
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("a beforeunload flush commits the pending save to localStorage", () => {
    expect(localStorage.getItem(KEY)).toBeNull(); // still only scheduled
    window.dispatchEvent(new Event("beforeunload")); // flush the pending timer
    expect(localStorage.getItem(KEY)).not.toBeNull(); // now committed
  });

  it("the autosaved payload is a faithful, restorable session (the exported DAG + a summary)", () => {
    window.dispatchEvent(new Event("beforeunload"));
    const raw = localStorage.getItem(KEY);
    expect(raw).toBeTruthy();
    const p = JSON.parse(raw as string);
    expect(p.dag).toBeTruthy(); // the round-trippable derivation (store.exportDAG)
    expect(p.nodes).toBeGreaterThan(0); // the seeded moment system
    expect(p.columns).toBeGreaterThanOrEqual(1);
    expect(typeof p.at).toBe("number"); // a timestamp, so "restore from N ago" can be honest
  });
});
