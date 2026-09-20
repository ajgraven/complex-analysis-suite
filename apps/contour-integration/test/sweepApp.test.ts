// @vitest-environment jsdom
//
// **The seam between the sweep's driver and the app** — M8 step 3.2.
//
// Three files already cover the step's parts: `scrub.test.ts` the element, `sweep.test.ts` the
// driver's arithmetic, `limitSweep.test.ts` the card's rendering with rows INJECTED by hand. Every
// one of them was green while the feature was dead, because the defect lived in exactly the place
// none of them looks — `advanceSweep`, the forty lines that turn a driver's answer into a committed
// parameter and a table row.
//
// Two defects were there, and both were found by pressing the control rather than by reading:
//
//  1. **The table never gained a single row, on any record, under Play or Step alike.**
//     `advanceSweep(driver.advance(t))` evaluates the driver's call FIRST, so the crossing was
//     already in `passed()` by the time `advanceSweep` took its "before" snapshot from it — the
//     guard `passed.length <= before` was therefore always true.
//  2. **`Step` rebuilt the plan on every press**, because the reuse guard was `sweepFrame !== 0`
//     and a stepped run never sets it. Each press planned afresh from the value the last one had
//     moved to, so tier G's `N` walked 9, 18, 30, … — a geometric series converging on 256 and
//     never arriving — while `rows` was emptied each time.
//
// So what this file asserts is the thing neither a driver test nor a renderer test can: that
// pressing the control the reader presses fills the table with the ladder the plan promised.
import { afterEach, describe, expect, it } from "vitest";

import { mountShell2 } from "../src/shell/app.js";
import { planSweep } from "../src/shell/sweep.js";
import { converged } from "../src/engine/contour/integrate.js";
import { argumentOf } from "../src/shell/argument.js";
import type { DerivationStep } from "../src/engine/steps.js";
import type { Param, Params } from "../src/engine/contour/model.js";

const mounts: { destroy: () => void }[] = [];
afterEach(() => {
  for (const m of mounts.splice(0)) m.destroy();
  for (const r of restore.splice(0)) r();
});

// ── a controllable clock, so the ANIMATED path can be asserted too ─────────────────────────────
//
// `playSweep`'s other branch drives `driver.advance(performance.now() - t0)` from
// `requestAnimationFrame`, and everything that distinguishes an animation from a step lives there:
// the draft budget, the settle, the loop that `endSweep` has to stop. A jsdom test that let the
// real rAF run would be a race; one that never ran it would assert nothing. So both are replaced —
// the frames are queued and flushed by hand, and the clock is a number this file sets.
//
// It is torn down in `afterEach` with the mounts, because a shell that outlived its stubbed rAF
// would schedule against a function this file had swapped back.
interface Clock {
  /** Run `ticks` whole frames. Each one drains the queue as it stood, which is what a frame does. */
  readonly flush: (ticks: number, atMs?: number) => void;
}

function fakeClock(): Clock {
  const queue = new Map<number, FrameRequestCallback>();
  let id = 0;
  let now = 0;
  const realRaf = window.requestAnimationFrame;
  const realCancel = window.cancelAnimationFrame;
  const realNow = performance.now.bind(performance);
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    id += 1;
    queue.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (handle: number): void => {
    queue.delete(handle);
  };
  performance.now = (): number => now;
  restore.push(() => {
    window.requestAnimationFrame = realRaf;
    window.cancelAnimationFrame = realCancel;
    performance.now = realNow;
  });
  return {
    flush: (ticks: number, atMs?: number): void => {
      for (let k = 0; k < ticks; k += 1) {
        // **The whole queue, not the first callback.** The shell schedules its own draws and its
        // strip redraw through `requestAnimationFrame` as well, so a flush that took one entry
        // would spend most of its ticks on those and the sweep would barely move — which is how
        // the first draft of this harness measured a working sweep as a dead one.
        const due = [...queue.values()];
        queue.clear();
        // The shell reads `performance.now() - t0`, and `t0` was taken at the press, when `now` was
        // 0 — so setting `now` here sets the sweep's own elapsed time directly.
        now = atMs ?? now + 16;
        for (const cb of due) cb(now);
      }
    },
  };
}

const restore: (() => void)[] = [];


/** A6 as the app opens, with the stepper parked on its limit step. */
function onLimitStep(): { app: ReturnType<typeof mountShell2>; step: DerivationStep; param: string } {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  window.history.replaceState(null, "", window.location.pathname);
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const app = mountShell2(root);
  mounts.push(app);
  const steps = stepsOf(app);
  const at = steps.findIndex((s) => s.kind === "limit" && s.focus.param !== undefined);
  expect(at, "the cold-start record must have a limit step, or this file is measuring nothing").toBeGreaterThanOrEqual(0);
  const step = steps[at] as DerivationStep;
  app.actions().setStep(at);
  return { app, step, param: step.focus.param as string };
}

/** Through the same accessor the card uses, so a step index here means what it means there. */
function stepsOf(app: ReturnType<typeof mountShell2>): readonly DerivationStep[] {
  return argumentOf({ state: app.currentState(), resolution: app.resolution(), poles: null }).steps;
}

describe("pressing Step fills the table", () => {
  it("adds exactly ONE row per press, at the plan's own rungs and in order", () => {
    const { app, step, param } = onLimitStep();
    const plan = planSweep(paramOf(app, param));
    expect(plan, "the parameter must be sweepable, or the control would not be drawn").not.toBeNull();
    const rungs = [...(plan?.checkpoints ?? [])];
    expect(rungs.length).toBe(5);

    const got: number[] = [];
    for (let k = 0; k < rungs.length; k += 1) {
      app.actions().playSweep({ stepId: step.id, param, pieceId: null, stepOnce: true });
      const rows = app.session().sweep?.rows ?? [];
      // ONE per press — the first defect, which showed as zero, and the guard against a fix that
      // over-corrects into appending the whole remaining ladder on the first press.
      expect(`press ${k + 1}: ${rows.length} rows`).toBe(`press ${k + 1}: ${k + 1} rows`);
      got.push(rows[rows.length - 1]?.at ?? Number.NaN);
      // **`running` is the animation's, and a step is not one.** It had been set true here too, so
      // the Play button read `Stop` after a step while nothing was moving — and pressing it then
      // started an animation instead of stopping anything.
      expect(`press ${k + 1}: running ${String(app.session().sweep?.running)}`).toBe(`press ${k + 1}: running false`);
    }
    // The ladder, not a walk converging on it — the second defect. A replanning `Step` gives
    // strictly smaller rungs at every press after the first and never reaches the endpoint.
    expect(got).toEqual(rungs);
    expect(got[got.length - 1]).toBe(plan?.to);
  });

  it("commits the parameter TO the rung, so the row's numbers are the value it names", () => {
    const { app, step, param } = onLimitStep();
    const rungs = [...(planSweep(paramOf(app, param))?.checkpoints ?? [])];
    for (let k = 0; k < rungs.length; k += 1) {
      app.actions().playSweep({ stepId: step.id, param, pieceId: null, stepOnce: true });
      // The eased value between two rungs would label a row `4` while the app sat at 4.07, which is
      // one value's evidence under another's name. `sweepValueAt` is clamped to the rung for this.
      expect(`${k}: ${paramOf(app, param).value}`).toBe(`${k}: ${rungs[k] ?? Number.NaN}`);
    }
  });

  it("a row carries the bound the LEDGER certified, and it falls along the ladder", () => {
    const { app, step } = onLimitStep();
    const piece = pieceWithBound(app);
    expect(piece, "A6's arc must carry a certified bound, or the table's `≤` column is vacuous").not.toBeNull();
    const param = step.focus.param as string;
    for (let k = 0; k < 5; k += 1) {
      app.actions().playSweep({ stepId: step.id, param, pieceId: piece, stepOnce: true });
    }
    const bounds = (app.session().sweep?.rows ?? []).map((r) => r.bound);
    expect(bounds.every((b) => b !== null)).toBe(true);
    // Strictly decreasing: the whole point of the picture is a `≤` column a reader watches shrink.
    for (let i = 1; i < bounds.length; i += 1) {
      expect(`${i}: ${(bounds[i] ?? 1) < (bounds[i - 1] ?? 0)}`).toBe(`${i}: true`);
    }
  });
});

describe("a sweep does not outlive its argument", () => {
  it("is put away when the record's fixture changes, and the draft budget with it", () => {
    const { app, step, param } = onLimitStep();
    app.actions().playSweep({ stepId: step.id, param, pieceId: null, stepOnce: true });
    expect(app.session().sweep).not.toBeNull();
    // A fixture is a different binding and a different contour (M6.1), so a run started against the
    // old one has nothing left to sweep. `resetTransient` nulls the state; what it cannot do is stop
    // the loop or clear `scrubbing`, which is the defect `endSweep` exists for.
    app.actions().setFixture(1);
    expect(app.session().scrubbing).toBe(false);
  });

  it("is put away by `applyState`, which is the permalink and the undo stack both", () => {
    const { app, step, param } = onLimitStep();
    app.actions().playSweep({ stepId: step.id, param, pieceId: null, stepOnce: true });
    app.applyState(app.currentState());
    expect(app.session().sweep).toBeNull();
    expect(app.session().scrubbing).toBe(false);
  });
});

function paramOf(app: ReturnType<typeof mountShell2>, name: string): Param {
  const p = paramsOf(app)[name];
  if (p === undefined) throw new Error(`no parameter ${name}`);
  return p;
}

function paramsOf(app: ReturnType<typeof mountShell2>): Params {
  const r = app.resolution();
  return r.kind === "gallery" ? (r.run?.contour.params ?? app.currentState().contour.params) : app.currentState().contour.params;
}

/** The first piece in the drawn argument whose bound names the limit parameter. */
function pieceWithBound(app: ReturnType<typeof mountShell2>): string | null {
  const stages = argumentOf({ state: app.currentState(), resolution: app.resolution(), poles: null }).derivation?.stages ?? [];
  for (const stage of stages) {
    for (const line of stage.lines) {
      if (line.evaluated !== undefined && line.pieceId !== undefined) return line.pieceId;
    }
  }
  return null;
}

describe("the animated path", () => {
  it("fills the SAME table as `Step`, and marks itself running while it does", () => {
    const clock = fakeClock();
    const { app, step, param } = onLimitStep();
    const rungs = [...(planSweep(paramOf(app, param))?.checkpoints ?? [])];
    app.actions().playSweep({ stepId: step.id, param, pieceId: null });
    // **`running` is the ANIMATION, not the run.** It had been set true by the stepped branch too,
    // so the Play button read `Stop` after a step while nothing was moving and pressing it started
    // an animation instead of stopping one.
    expect(app.session().sweep?.running).toBe(true);
    clock.flush(200, undefined);
    // Drive the clock to the end and past it, so the pending rungs and the settle both land.
    for (let k = 0; k < 12; k += 1) clock.flush(1, 3000 + k);
    const rows = app.session().sweep?.rows ?? [];
    expect(rows.map((r) => r.at)).toEqual(rungs);
    expect(app.session().sweep?.running).toBe(false);
    // **The loop is gone rather than merely idle**, asserted by its effect rather than by counting
    // callbacks — the shell queues its own draws through the same rAF, so a queue length says
    // nothing. Twenty more frames at a clock that keeps moving must change no number.
    const settled = paramOf(app, param).value;
    for (let k = 0; k < 20; k += 1) clock.flush(1, 6000 + k * 100);
    expect(`${paramOf(app, param).value} after, ${(app.session().sweep?.rows ?? []).length} rows`).toBe(
      `${settled} after, ${rows.length} rows`,
    );
    expect(app.session().scrubbing).toBe(false);
  });

  it("takes every row at the FULL budget, so an animated row is not a draft of a stepped one", () => {
    // Measured on A6 before this: under Play every one of the five rows read `—` in the target
    // column, because the draft resolve's successive refinement does not converge over a segment
    // of length `2R`, while the same rungs under `Step` read 2.22144. The two controls are
    // documented as filling one table; this is the assertion that makes that a fact about numbers.
    const clock = fakeClock();
    const { app, step, param } = onLimitStep();
    app.actions().playSweep({ stepId: step.id, param, pieceId: null });
    clock.flush(200, undefined);
    for (let k = 0; k < 12; k += 1) clock.flush(1, 3000 + k);
    const played = (app.session().sweep?.rows ?? []).map((r) => r.target);

    const stepped = steppedRows();
    expect(played.length).toBe(stepped.length);
    // The first rung's target is a NUMBER under both, and the same number: a draft row reports
    // `null` here, which is what the mutant restores.
    expect(`played[0] known: ${played[0] !== null}`).toBe("played[0] known: true");
    expect(played[0]?.[0] ?? 0).toBeCloseTo(stepped[0]?.[0] ?? -1, 6);
  });

  it("a frame that moved nothing is not committed — the snapped parameter's case", () => {
    // Tier G's `N` is an integer lattice, so the eased value repeats across frames; the driver
    // answers `undefined` there and the caller must not commit it. A commit of `undefined` reaches
    // `withParam` and makes the parameter NaN, which is a contour nothing can resolve.
    const clock = fakeClock();
    const { app } = onRecord("series-cot-kernel");
    const steps = stepsOf(app);
    const at = steps.findIndex((s) => s.kind === "limit" && s.focus.param !== undefined);
    const step = steps[at] as DerivationStep;
    app.actions().setStep(at);
    app.actions().playSweep({ stepId: step.id, param: "N", pieceId: null });
    // **The parameter must never go BACKWARDS**, which is what a committed `undefined` does: it
    // reaches `withParam` and is written into `state.geometry`, where an absent override and an
    // `undefined` one are the same thing — so the contour is rebuilt at `N`'s DEFAULT start and the
    // sweep visibly snaps back to 4. Measured on this record's own ladder: 44 of 191 frames answer
    // `undefined`, because an integer lattice over `[0.25, 256]` has fewer values than the run has
    // frames. Asserting the final value alone would miss it — the last frame commits a number.
    const seen: number[] = [];
    for (let k = 0; k < 400; k += 1) {
      clock.flush(1, undefined);
      seen.push(paramOf(app, "N").value);
    }
    for (let k = 0; k < 12; k += 1) clock.flush(1, 3000 + k);
    seen.push(paramOf(app, "N").value);
    const fell = seen.findIndex((v, i) => i > 0 && v < (seen[i - 1] ?? 0));
    expect(`first fall at frame ${fell} (of ${seen.length})`).toBe(`first fall at frame -1 (of ${seen.length})`);
    expect(`N finite: ${Number.isFinite(paramOf(app, "N").value)}`).toBe("N finite: true");
    expect((app.session().sweep?.rows ?? []).every((r) => Number.isFinite(r.at))).toBe(true);
  });

  it("walks the rungs it missed ONE PER FRAME when the clock is already spent", () => {
    // A backgrounded tab or a slow commit leaves the clock past `durationMs` with rungs unvisited.
    // Filling them from the endpoint's numbers would put four different labels on one commit's
    // evidence, so the driver hands them out one call at a time — and the caller indexes
    // `passed()` by its own row count, so each row is its own rung rather than the newest one.
    const clock = fakeClock();
    const { app, step, param } = onLimitStep();
    const rungs = [...(planSweep(paramOf(app, param))?.checkpoints ?? [])];
    app.actions().playSweep({ stepId: step.id, param, pieceId: null });
    const seen: number[][] = [];
    for (let k = 0; k < 8; k += 1) {
      clock.flush(1, 5000 + k);
      seen.push((app.session().sweep?.rows ?? []).map((r) => r.at));
    }
    // One row per frame, in ladder order — not five rows on the first frame, and not five copies
    // of the last rung.
    expect(seen[0]).toEqual(rungs.slice(0, 1));
    expect(seen[1]).toEqual(rungs.slice(0, 2));
    expect(seen[4]).toEqual(rungs);
  });

  it("is interrupted by the reader's own gesture, and by a change of argument", () => {
    // Two paths, one rule. A drag on the scrubbable number writes the same parameter the sweep is
    // writing, so both committed on every frame and the value fought the hand; and a record,
    // fixture, mode or expression change leaves the run writing into a contour that is no longer
    // there. Both end the run completely — the loop with it, which `resetTransient` cannot do.
    const clock = fakeClock();
    const { app, step, param } = onLimitStep();
    app.actions().playSweep({ stepId: step.id, param, pieceId: null });
    // **Asserted by EFFECT, not by counting callbacks.** The shell schedules its own draws and its
    // strip redraw through the same `requestAnimationFrame`, so a queue length says nothing about
    // whether the sweep's loop is still alive; what says it is whether the parameter keeps moving
    // when the clock does.
    clock.flush(10, undefined);
    const moving = paramOf(app, param).value;
    expect(moving).toBeGreaterThan(4);
    app.actions().setScrubbing(true);
    const held = paramOf(app, param).value;
    for (let k = 0; k < 20; k += 1) clock.flush(1, 2000 + k * 50);
    expect(`after a drag — ${paramOf(app, param).value}, running ${String(app.session().sweep?.running)}`).toBe(
      `after a drag — ${held}, running false`,
    );

    const second = fakeClock();
    const again = onLimitStep();
    again.app.actions().playSweep({ stepId: again.step.id, param: again.param, pieceId: null });
    second.flush(10, undefined);
    again.app.actions().setFixture(1);
    const frozen = paramOf(again.app, again.param).value;
    for (let k = 0; k < 20; k += 1) second.flush(1, 2000 + k * 50);
    expect(
      `after a fixture — ${paramOf(again.app, again.param).value}, scrubbing ${String(again.app.session().scrubbing)}`,
    ).toBe(`after a fixture — ${frozen}, scrubbing false`);
  });
});

describe("what the table will not print", () => {
  it("withholds a cell the quadrature's own refinement does not stand behind", () => {
    // A6's target is 2.22144 and the ladder's top is `R = 1e6`, where a uniform rule over a segment
    // of length `2R` reads 2.0766 at the full budget — an `errorEstimate` of 8.0e-1 against a
    // threshold of 2.2e-10. The row keeps its `≤` column, which is exact arithmetic; the `≈` one is
    // left empty rather than printing a number the engine declines to certify.
    const { app, step, param } = onLimitStep();
    for (let k = 0; k < 5; k += 1) {
      app.actions().playSweep({ stepId: step.id, param, pieceId: null, stepOnce: true });
    }
    const rows = app.session().sweep?.rows ?? [];
    expect(rows).toHaveLength(5);
    // The anti-vacuity half: the EARLY rungs do print a target, so this is a rule about the
    // quadrature and not a column that is always blank.
    expect(`first known: ${rows[0]?.target !== null}`).toBe("first known: true");
    expect(`last known: ${rows[4]?.target !== null}`).toBe("last known: false");
  });

  it("and `converged` is what decides it, on both of its clauses", () => {
    // Written once and read twice — `integratePiece`'s own certificate row and the sweep's table —
    // so the threshold cannot drift between the number the engine certifies and the number the
    // table prints.
    const value: [number, number] = [2.2214414690791831, 0];
    expect(converged({ value, errorEstimate: 8.88e-16, capped: false })).toBe(true);
    expect(converged({ value, errorEstimate: 8.0e-1, capped: false })).toBe(false);
    // `capped` alone is disqualifying: the budget bound the resolution, so the spacing rule was
    // never met and the refinement is comparing two under-resolved answers to each other.
    expect(converged({ value, errorEstimate: 8.88e-16, capped: true })).toBe(false);
    // And the threshold is RELATIVE above 1, absolute below it, which is what lets a boundary term
    // of 6.7e-19 be certified at all.
    expect(converged({ value: [6.6667e-19, 0], errorEstimate: 6.81e-34, capped: false })).toBe(true);
  });
});

/** The five rows the STEPPED control fills, for the comparison the animated test makes. */
function steppedRows(): (readonly [number, number] | null)[] {
  const { app, step, param } = onLimitStep();
  for (let k = 0; k < 5; k += 1) {
    app.actions().playSweep({ stepId: step.id, param, pieceId: null, stepOnce: true });
  }
  return (app.session().sweep?.rows ?? []).map((r) => r.target);
}

/** A named gallery record, parked on nothing in particular. */
function onRecord(record: string): { app: ReturnType<typeof mountShell2> } {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  window.history.replaceState(null, "", window.location.pathname);
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const app = mountShell2(root);
  mounts.push(app);
  app.applyState({ ...app.currentState(), mode: "gallery", record, fixture: 0, bindings: {}, geometry: {} });
  return { app };
}
