// **A parameter that may not take every value, over the whole corpus** — M8 step 3.2.
//
// `Family.contour.limitParams[].through` had been declared by tier G and dropped by
// `families/instantiate.ts`, which cost nothing while nothing could move `N` off the integers.
// Step 3.2 built two controls that can: the limit sweep's ladder and the scrubbable number. So the
// question this file asks is not "is the field carried" but the one a reader would ask — **does the
// contour the control produces still have a certified bound?** — and it asks it by running the real
// ledger at every rung rather than by checking `Number.isInteger` and calling it done.
//
// **The anti-vacuity posture.** Every claim below is paired with its negation somewhere: the counts
// are asserted so a `filter` that silently emptied would fail rather than pass over nothing; the
// "does not refuse" assertions are paired with the UNSNAPPED value, which must refuse (if it did
// not, the whole constraint would be unnecessary and these tests would be measuring nothing); and
// the continuous parameters are asserted UNCHANGED, with a count, so a lattice accidentally applied
// to all 62 of them would fail here instead of quantising `R`'s five and a half decades in silence.
import { describe, expect, it } from "vitest";

import { admissibleStep, admissibleValue, type Param } from "../src/engine/contour/model.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import { loadFamilies } from "../src/families/index.js";
import { compile, defaultState, resolveState } from "../src/shell/state.js";
import { createSweep, planSweep, type SweepPlan } from "../src/shell/sweep.js";
import { TRACK_PX, scrubbedValue, steppedValue } from "../src/shell/scrub.js";

/** The three records the GALLERY declares the constraint on — asserted, not assumed, below. */
const TIER_G = ["series-cot-kernel", "series-cot-collision", "series-csc-kernel-collision"];

interface Row {
  readonly record: string;
  readonly param: Param;
}

/** Every record's parameter scope, through the path the app itself takes (`steps.test.ts`'s). */
function corpus(): { readonly records: number; readonly rows: Row[] } {
  const base = defaultState(circleTemplate([0, 0], 1.5));
  const rows: Row[] = [];
  let records = 0;
  for (const id of loadFamilies().families.keys()) {
    const state = { ...base, mode: "gallery" as const, record: id, fixture: 0 };
    const r = resolveState(state, compile(state.expr));
    if (r.kind !== "gallery" || r.run === null) continue;
    records += 1;
    for (const param of Object.values(r.run.contour.params)) rows.push({ record: id, param });
  }
  return { records, rows };
}

const CORPUS = corpus();
const CONSTRAINED = CORPUS.rows.filter((r) => r.param.admits !== undefined);
const CONTINUOUS = CORPUS.rows.filter((r) => r.param.admits === undefined && r.param.limit !== undefined);

const planOf = (p: Param): SweepPlan => {
  const plan = planSweep(p);
  if (plan === null) throw new Error(`expected a plan for ${p.name}`);
  return plan;
};

/**
 * The record run at one value of its limit parameter, with the square's KILL rows picked out.
 *
 * `geometry` is the app's own channel for a move on a limit parameter — a scrub and a sweep commit
 * through `setParam`, which lands in the same field — so this is the contour the control produces
 * and not a reconstruction of it.
 */
function killRowsAt(record: string, param: string, value: number): { statuses: string[]; levels: string[] } {
  const base = defaultState(circleTemplate([0, 0], 1.5));
  const state = { ...base, mode: "gallery" as const, record, fixture: 0, geometry: { [param]: value } };
  const r = resolveState(state, compile(state.expr));
  if (r.kind !== "gallery" || r.run === null) throw new Error(`${record} did not run at ${param} = ${value}`);
  const rows = r.run.ledger.rows.filter((row) => row.constraint === "KILL");
  return { statuses: rows.map((row) => row.status), levels: rows.map((row) => row.evidence.level) };
}

describe("which parameters the corpus constrains", () => {
  it("is exactly what tier G declares — three records, one parameter each", () => {
    const declaring = [...loadFamilies().families.values()]
      .filter((f) => f.contour.limitParams.some((l) => l.through !== undefined))
      .map((f) => f.id);
    expect([...declaring].sort()).toEqual([...TIER_G].sort());

    // The anti-vacuity clause for every filter in this file, and the count that would fail if a
    // lattice were applied to the corpus at large: 65 parameters over 28 records, 3 constrained.
    expect(CORPUS.records).toBe(28);
    expect(CORPUS.rows.length).toBe(65);
    expect(CONSTRAINED).toHaveLength(3);
    expect(CONSTRAINED.map((r) => r.record).sort()).toEqual([...TIER_G].sort());
    expect(new Set(CONSTRAINED.map((r) => r.param.name))).toEqual(new Set(["N"]));
    for (const { param } of CONSTRAINED) expect(param.admits).toBe("integers");
    // 31 limit parameters in the corpus, so 28 of them are continuous and stay so.
    expect(CONTINUOUS).toHaveLength(28);
  });
});

describe("the sweep's ladder, on a constrained parameter", () => {
  it("lands only on admissible values, with the limit endpoint still last", () => {
    for (const { record, param } of CONSTRAINED) {
      const plan = planOf(param);
      const where = `${record}/${param.name}`;
      expect(`${where}: ${plan.checkpoints.join(",")}`).toBe(`${where}: 9,21,49,111,256`);
      for (const c of plan.checkpoints) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(param.range[0]);
        expect(c).toBeLessThanOrEqual(param.range[1]);
      }
      // The certified limit row must carry the endpoint the certificate is computed at, so the last
      // rung is the endpoint itself and is not moved — it happens to be admissible here anyway.
      expect(plan.checkpoints[plan.checkpoints.length - 1]).toBe(plan.to);
      expect(plan.to).toBe(param.range[1]);
    }
  });

  it("emits admissible values every FRAME too, not only at the rungs", () => {
    // The caller commits what `advance` returns, so an unsnapped frame is a refusing contour on
    // screen for the whole sweep.
    //
    // **80 of 91 frames emit, and the eleven that do not are the point.** This assertion read "91
    // frames, 91 distinct integers" while the range still ran to 1e6 — a range at which a single
    // commit takes the better part of an hour, which `instantiate.ts` then capped at 256. Over the
    // shorter run the eased value crosses fewer integers than there are frames, so eleven frames
    // snap onto the value before them — the last of which is the clock's own final frame, where the
    // easing had already rounded up to the endpoint. The driver answers `undefined` rather than
    // asking the app
    // to re-resolve the state it is already in. What is asserted is therefore what was always
    // meant: every emitted value is an integer, they are all distinct, and the ladder is passed in
    // full.
    for (const { record, param } of CONSTRAINED) {
      const plan = planOf(param);
      const driver = createSweep(plan);
      const values: number[] = [];
      for (let i = 0; i <= 90; i += 1) {
        const v = driver.advance((i * plan.durationMs) / 90);
        if (v !== null && v !== undefined) values.push(v);
      }
      const where = `${record}/${param.name}`;
      expect(`${where}: ${values.filter((v) => !Number.isInteger(v)).length}`).toBe(`${where}: 0`);
      expect(values.length, where).toBe(80);
      expect(new Set(values).size, `${where}: a frame repeated a value`).toBe(values.length);
      expect(driver.passed()).toEqual(plan.checkpoints);
    }
  });
});

describe("the real ledger at every rung", () => {
  it("does NOT refuse the square's bound at any of them", () => {
    // Run, not assumed: `kernel/bounds/squareSide.ts` is the module that decides this and it reads
    // the half-width off the GEOMETRY, so the only honest check is to build the contour the control
    // would build and ask the ledger. Four sides per record, five rungs, three records.
    const bad: string[] = [];
    for (const { record, param } of CONSTRAINED) {
      for (const rung of planOf(param).checkpoints) {
        const { statuses, levels } = killRowsAt(record, param.name, rung);
        const where = `${record} at ${param.name} = ${rung}`;
        if (statuses.length !== 4) bad.push(`${where}: ${statuses.length} KILL rows, not 4`);
        if (statuses.some((s) => s !== "satisfied")) bad.push(`${where}: ${statuses.join(",")}`);
        if (levels.includes("⚠")) bad.push(`${where}: a refusal — ${levels.join(",")}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("and DOES refuse at the value the unsnapped ladder produced — so the check above is not free", () => {
    // The first rung AS INTERPOLATED, before `Param.admits` existed — derived from the live range
    // rather than quoted, so a cap that moves keeps this pinned to the ladder the app would build.
    // All four sides fail on all three records: the defect this step closes, kept as the negation
    // of the assertion above rather than as a paragraph.
    for (const { record, param } of CONSTRAINED) {
      const plan = planOf(param);
      const raw = plan.from * Math.exp(Math.log(plan.to / plan.from) / 5);
      expect(Number.isInteger(raw)).toBe(false);
      expect(raw).toBeCloseTo(9.19, 2);
      const { statuses, levels } = killRowsAt(record, param.name, raw);
      expect(`${record}: ${statuses.join(",")}`).toBe(`${record}: failed,failed,failed,failed`);
      expect(levels).toEqual(["⚠", "⚠", "⚠", "⚠"]);
    }
  });
});

describe("the endpoint is what the app can COMPUTE, not what it may enumerate", () => {
  it("caps the range at 256, and the last rung resolves in a frame's worth of work rather than an hour", () => {
    // **The wall that binds is cost, and it is not linear.** `analyse.ts` refuses a kernel band
    // wider than 4096, so the first draft of this step capped `N` there — and the gate HUNG: one
    // resolve of `series-cot-kernel` is 50 ms at `N = 128`, 179 ms at 256, 342 ms at 320, 700 ms
    // at 384, 2.2 s at 512 and 25.6 s at 1024, doubling about every 64 past 256. The draft budget
    // does not touch it (25.5 s against 25.8 s at 1024) — the cost is the exact residue sum, not
    // the quadrature — so a ladder ending at 4095 is the better part of an hour in ONE commit.
    //
    // The range is asserted so a change to it is deliberate, and the TIME is asserted so a change
    // that keeps the number and moves the arithmetic is caught as well. The threshold is 8× the
    // measured worst case and a third of what `N = 512` costs: it is a hang guard, not a
    // benchmark, and it is the one assertion in this file that a slower machine could move.
    for (const { record, param } of CONSTRAINED) {
      expect(`${record}: ${param.range[1]}`).toBe(`${record}: 256`);
      const plan = planOf(param);
      expect(plan.to).toBe(256);
      const t0 = Date.now();
      killRowsAt(record, param.name, plan.to);
      expect(`${record}: under 1.5 s`).toBe(`${record}: ${Date.now() - t0 < 1500 ? "under 1.5 s" : `${Date.now() - t0} ms`}`);
    }
  });
});

describe("the scrub, on a constrained parameter", () => {
  it("steps by ONE admissible value on an arrow press, where a stop of a thousand would not move it off 4.03", () => {
    for (const { param } of CONSTRAINED) {
      expect(param.value).toBe(4);
      expect(steppedValue(param, 1)).toBe(5);
      expect(steppedValue(param, -1)).toBe(3);
      // What the thousand stops would have asked for, quoted so the two are compared rather than
      // one of them merely asserted.
      const [lo, hi] = param.range;
      const stop = Math.exp(Math.log(4) + (Math.log(hi) - Math.log(lo)) / 1000);
      expect(stop).toBeGreaterThan(4.02);
      expect(stop).toBeLessThan(4.04);
    }
  });

  it("drags onto the lattice at every pixel, and never outside the range", () => {
    const [{ param }] = CONSTRAINED as [Row];
    const [lo, hi] = param.range;
    for (let dx = -3 * TRACK_PX; dx <= 3 * TRACK_PX; dx += 7) {
      const v = scrubbedValue(param, param.value, dx);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(lo);
      expect(v).toBeLessThanOrEqual(hi);
    }
    // The ends are the range's own admissible ends, not the range's endpoints: 0.25 is not an
    // integer, and a clamp that returned it would hand `squareSide` a width it must refuse.
    expect(scrubbedValue(param, param.value, -99 * TRACK_PX)).toBe(1);
    expect(scrubbedValue(param, param.value, 99 * TRACK_PX)).toBe(hi);
  });
});

describe("a continuous parameter is untouched", () => {
  it("keeps its unrounded ladder and its thousandth-of-a-range key step", () => {
    let offLattice = 0;
    for (const { record, param } of CONTINUOUS) {
      const plan = planOf(param);
      const where = `${record}/${param.name}`;
      for (const c of plan.checkpoints) {
        if (!Number.isInteger(c)) offLattice += 1;
        expect(`${where}: ${Number.isFinite(c)}`).toBe(`${where}: true`);
      }
      const up = steppedValue(param, 1);
      const down = steppedValue(param, -1);
      // A log parameter's press is a RATIO, and one stop of a thousand — the rail slider's own
      // step. An integer lattice applied here would make both of these whole numbers.
      expect(up / param.value).toBeCloseTo(
        Math.pow(param.range[1] / param.range[0], 1 / 1000),
        9,
      );
      expect(param.value / down).toBeCloseTo(
        Math.pow(param.range[1] / param.range[0], 1 / 1000),
        9,
      );
    }
    // The count that makes the loop's silence mean something: 28 continuous limit parameters, and
    // the great majority of their rungs are NOT integers, which is what a global snap would break.
    expect(CONTINUOUS).toHaveLength(28);
    expect(offLattice).toBeGreaterThan(100);
  });

  it("and the model's own primitives are the identity on one", () => {
    const [{ param }] = CONTINUOUS as [Row];
    expect(param.admits).toBeUndefined();
    expect(admissibleValue(48.0449, param.admits, param.range)).toBe(48.0449);
    expect(admissibleValue(Number.NaN, "integers")).toBeNaN();
    // And on a constrained one they are not, including the range-aware end: rounding 0.3 gives 0,
    // which is outside a range starting at 0.25, and the answer is the first admissible value in it.
    expect(admissibleValue(48.0449, "integers")).toBe(48);
    expect(admissibleValue(0.3, "integers", [0.25, 1e6])).toBe(1);
    expect(admissibleStep(4, "integers", 1)).toBe(5);
    expect(admissibleStep(4.3, "integers", -1)).toBe(4);
    expect(admissibleStep(4.3, "integers", 1)).toBe(5);
    // Clamped at the top by the range, so a press at the endpoint stays admissible rather than
    // stepping one past it.
    expect(admissibleStep(1e6, "integers", 1, [0.25, 1e6])).toBe(1e6);
  });
});
