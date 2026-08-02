// @vitest-environment jsdom
//
// Behavioural net for the Algebra op-runner dispatch — the single-flight guard and busy lifecycle
// shared by ~15 async worker ops (QD-ALG-4). Written NET-FIRST for refactor Phase 3 · D1b: it must
// pass against the UNMODIFIED algebra-ui.mjs, then guard the runOp() extraction (Stage 2, behaviour-
// preserving) and pin the CURRENT behaviour of doSolveRadical so the Stage-3 guard (token-granted)
// shows up as a reviewed test diff rather than a silent change.
//
// Feasible headlessly because: (1) #alg-seed-moment seeds the order-2 A–S moment system with NO
// geometric solve (store.seedFromPolys, no activeEnv); (2) mounted withCanvas, that renders real
// selectable node cards → the inspector; (3) in Node, QD.SymWorker falls back to running the job in a
// resolved Promise, so `_abort` is set SYNCHRONOUSLY on click and cleared on the next microtask — the
// single-flight window is observable between a synchronous op-start and the following await.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { mountAlgebra, seedMoments, selectNode, nodeCards, type AlgebraMount } from "./_algebra-mount";

const flush = () => new Promise((r) => setTimeout(r, 60)); // let the resolved-Promise worker settle
// NB: toast feedback (QD.QoL) is deliberately NOT booted here — its presence changes the sidebar
// fingerprint the #210 snapshot pins. Single-flight is asserted by the stronger signal anyway: the
// guarded action does not EXECUTE while busy (no mutation), not merely that a toast appeared.

let m: AlgebraMount;
const $ = (s: string) => m.$(s) as HTMLElement;
const btn = (s: string) => m.$(s) as HTMLButtonElement;
const cancelHidden = () => $("#alg-cancel").classList.contains("hidden");
const graphBusy = () => !!document.getElementById("algebra-graph")?.classList.contains("is-busy");
const inspectorButton = (insp: HTMLElement, re: RegExp) =>
  Array.from(insp.querySelectorAll("button")).find((b) => re.test(b.textContent || "")) as HTMLButtonElement | undefined;

beforeAll(async () => {
  // ONE mount per file (installAlgebra stacks a tab-changed listener per call). withCanvas so node
  // selection → inspector works. Seed once; the moment system is not mutated by the ops used here.
  m = await mountAlgebra({}, { withCanvas: true });
  seedMoments(m);
});
// Start each test idle and clean: settle any op still resolving, then re-seed — which clears the
// canvas selection (seedMomentSystem → canvas.clearSelection()), so selectNode() always SELECTS a
// fresh node rather than toggling a still-selected one off.
beforeEach(async () => { await flush(); seedMoments(m); });

describe("the busy lifecycle is entered synchronously and left on completion", () => {
  it("seeded the moment system into selectable cards (harness precondition)", () => {
    expect(nodeCards(m).length).toBeGreaterThan(0);
  });

  it("starting an async op enters busy synchronously: cancel shown, graph + buttons locked", () => {
    expect(cancelHidden()).toBe(true); // idle
    btn("#alg-saturate").click(); // an async worker op
    // All synchronous — set before the resolved-Promise job's .then runs.
    expect(cancelHidden()).toBe(false);
    expect(graphBusy()).toBe(true);
    expect(btn("#alg-saturate").disabled).toBe(true);
  });

  it("leaves busy on completion (cancel hidden, locks released)", async () => {
    btn("#alg-saturate").click();
    expect(cancelHidden()).toBe(false);
    await flush();
    expect(cancelHidden()).toBe(true);
    expect(btn("#alg-groebner").disabled).toBe(false);
  });
});

describe("single-flight: a second heavy op cannot start while one is in flight", () => {
  it("every heavy-op sidebar button is disabled while busy (the primary guard)", () => {
    btn("#alg-saturate").click();
    // These carry js-busy-lock; setBusy(true) disables them, so their click paths can't fire.
    ["#alg-groebner", "#alg-triangular", "#alg-decompose", "#alg-classify", "#alg-prove", "#alg-autosolve"]
      .forEach((sel) => expect(btn(sel).disabled).toBe(true));
  });

  it("idle, the inspector's Duplicate works — establishes it is a real, functioning action", () => {
    const insp = selectNode(m, 0);
    const dup = inspectorButton(insp, /^Duplicate/);
    expect(dup).toBeTruthy();
    const before = nodeCards(m).length;
    dup!.click(); // idle
    expect(nodeCards(m).length).toBe(before + 1); // duplicated
  });

  it("busyGuard backs the NON-disabled paths: the same action BAILS while busy (toast, no mutation)", () => {
    // Duplicate is not js-busy-lock (it is rebuilt per selection), so setBusy does not disable it —
    // its own busyGuard() is the only thing stopping it. That backstop is what the runOp refactor
    // must preserve, and the exact shape doSolveRadical is missing today.
    const insp = selectNode(m, 0);
    const dup = inspectorButton(insp, /^Duplicate/);
    expect(dup).toBeTruthy();
    const before = nodeCards(m).length;
    btn("#alg-saturate").click(); // enter busy synchronously
    expect(cancelHidden()).toBe(false);
    dup!.click(); // synchronously, while busy — stays enabled, so busyGuard() must catch it
    expect(nodeCards(m).length).toBe(before); // nothing duplicated — it bailed (vs. +1 idle, above)
  });
});

describe("doSolveRadical — CURRENT behaviour (pre-guard pin; Stage 3 flips the busy case)", () => {
  it("idle: 'Solve for a variable' opens the radical solve panel", () => {
    const insp = selectNode(m, 0);
    const solve = inspectorButton(insp, /Solve for a variable/);
    expect(solve).toBeTruthy();
    solve!.click();
    expect(insp.querySelector(".algebra-solve-panel")).toBeTruthy();
  });

  it("BUSY: it STILL runs (opens the panel) — the QD-ALG-4 gap; the granted Stage-3 guard closes this", () => {
    const insp = selectNode(m, 0);
    const solve = inspectorButton(insp, /Solve for a variable/);
    expect(solve).toBeTruthy();
    btn("#alg-saturate").click(); // enter busy synchronously
    expect(cancelHidden()).toBe(false); // confirm we are busy
    solve!.click(); // synchronously, while busy — NOT js-busy-lock, and today NOT busyGuard-ed
    // CURRENT: unguarded ⇒ the panel is built even though a worker op is in flight.
    expect(insp.querySelector(".algebra-solve-panel")).toBeTruthy();
  });
});
