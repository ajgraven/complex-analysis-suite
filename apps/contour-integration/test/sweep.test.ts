// **The limit step's play control, driven by a fake clock** — M8 step 3.2.
//
// The driver was built with no DOM and no real clock precisely so this file can exist in the node
// gate, and the shape of these tests follows from that: every time is passed IN, so "three seconds
// of sweep" is 61 calls and not three seconds of waiting.
//
// **The anti-vacuity posture.** A driver that returned a constant satisfies "monotone" and "passes
// its checkpoints" if either is asserted loosely enough, so both are asserted with their negations
// in mind: 61 frames must produce 61 DISTINCT values spanning the whole sweep, and a checkpoint must
// be passed exactly once, in order, with the full ladder passed by the end. The corpus pass then
// asserts the COUNT of parameters it covered, so a `filter` that silently emptied would fail rather
// than pass over nothing.
import { describe, expect, it } from "vitest";

import type { Param } from "../src/engine/contour/model.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import { loadFamilies } from "../src/families/index.js";
import { compile, defaultState, resolveState } from "../src/shell/state.js";
import { createSweep, planSweep, sweepValueAt, type SweepPlan } from "../src/shell/sweep.js";

/** The corpus's own `R`: `instantiate.ts` gives every `to: "inf"` parameter this range and this scale. */
const R: Param = {
  name: "R",
  value: 4,
  range: [0.25, 1e6],
  scale: "log",
  limit: { to: "inf" },
};

/** The sandbox's `N` — `squareTemplate`'s, the one LINEAR limit parameter the app builds. */
const N: Param = {
  name: "N",
  value: 3,
  range: [0, 1e4],
  scale: "linear",
  limit: { to: "inf" },
};

const planOf = (p: Param): SweepPlan => {
  const plan = planSweep(p);
  if (plan === null) throw new Error(`expected a plan for ${p.name}`);
  return plan;
};

describe("planning a sweep", () => {
  it("heads for the range's maximum at `inf` and its minimum at `0+`", () => {
    expect(planOf(R).to).toBe(1e6);
    expect(planOf(R).from).toBe(4);
    const eps: Param = { name: "eps", value: 0.05, range: [1e-6, 1], scale: "log", limit: { to: "0+" } };
    expect(planOf(eps).to).toBe(1e-6);
    expect(planOf(eps).from).toBe(0.05);
  });

  it("clamps a NUMERIC `to` into the range", () => {
    // `Param.limit.to` admits a number and `families/schema.ts` does not — no record can declare one
    // (its `limitParams[].to` is `"inf" | "0+"`), so this case is reachable only from the sandbox
    // and is therefore tested here rather than over the corpus.
    const p: Param = { ...R, limit: { to: 1e9 } };
    expect(planOf(p).to).toBe(1e6);
    expect(planOf({ ...R, limit: { to: 100 } }).to).toBe(100);
  });

  it("refuses when there is no limit, or nowhere to go", () => {
    const noLimit: Param = { name: R.name, value: R.value, range: R.range, scale: R.scale };
    expect(planSweep(noLimit)).toBeNull();
    // Already at the endpoint: a sweep of zero length would fill five table rows with one number.
    expect(planSweep({ ...R, value: 1e6 })).toBeNull();
    // A log parameter that reaches 0 has no geometric ladder and no logarithm to ease in.
    expect(planSweep({ ...R, range: [0, 1e6] as const, limit: { to: "0+" } })).toBeNull();
    expect(planSweep({ ...R, range: [1e6, 1e6] as const })).toBeNull();
    expect(planSweep({ ...R, range: [0.25, Number.POSITIVE_INFINITY] as const })).toBeNull();
  });

  it("builds a GEOMETRIC ladder for a log parameter and an ARITHMETIC one for a linear one", () => {
    const log = planOf(R);
    expect(log.checkpoints).toHaveLength(5);
    // Equal ratios, not equal differences — the property the plan's own `2, 4, 8, 16` has.
    const ratios = log.checkpoints.map((c, i) => c / (i === 0 ? log.from : (log.checkpoints[i - 1] ?? 0)));
    for (const r of ratios) expect(r).toBeCloseTo(Math.pow(1e6 / 4, 1 / 5), 9);

    const lin = planOf(N);
    const gaps = lin.checkpoints.map((c, i) => c - (i === 0 ? lin.from : (lin.checkpoints[i - 1] ?? 0)));
    for (const g of gaps) expect(g).toBeCloseTo((1e4 - 3) / 5, 9);
  });

  it("puts the endpoint in the last row EXACTLY", () => {
    // Not `toBeCloseTo`: interpolating at `u = 1` in log space gives 999999.9999999999 for this
    // sweep, and the last row is the certified limit row.
    const last = (plan: SweepPlan): number => plan.checkpoints[plan.checkpoints.length - 1] ?? 0;
    expect(last(planOf(R))).toBe(1e6);
    expect(last(planOf(N))).toBe(1e4);
  });

  it("gives reduced motion the SAME plan", () => {
    // The checkpoints ARE the reduced-motion path (`stepOnce` walks them), so a shorter ladder would
    // report a different table to the reader who asked for less movement.
    expect(planSweep(R, { reducedMotion: true })).toEqual(planSweep(R));
    expect(planSweep(R, { reducedMotion: false })).toEqual(planSweep(R));
  });
});

describe("the easing", () => {
  it("returns both endpoints exactly, and nothing outside them", () => {
    const plan = planOf(R);
    expect(sweepValueAt(plan, 0)).toBe(plan.from);
    expect(sweepValueAt(plan, plan.durationMs)).toBe(plan.to);
    expect(sweepValueAt(plan, -100)).toBe(plan.from);
    expect(sweepValueAt(plan, 1e9)).toBe(plan.to);
    expect(sweepValueAt(plan, Number.NaN)).toBe(plan.from);
  });

  it("is monotone and eases OUT", () => {
    const plan = planOf(R);
    let prev = -Infinity;
    for (let t = 0; t <= plan.durationMs; t += 10) {
      const v = sweepValueAt(plan, t);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
    // Ease-out cubic: at half the time, `1 − (1−s)³` has covered 87.5% of the distance — in the
    // parameter's own scale, so 87.5% of the DECADES.
    const half = sweepValueAt(plan, plan.durationMs / 2);
    expect(Math.log(half / plan.from) / Math.log(plan.to / plan.from)).toBeCloseTo(0.875, 12);
  });

  it("eases in LOG space, and easing in linear space would put the whole picture in one frame", () => {
    const plan = planOf(R);
    // The measurement the module's comment quotes. `R = 40` is one decade up from the start.
    const timeToReach = (v: number, f: (t: number) => number): number => {
      let lo = 0;
      let hi = plan.durationMs;
      for (let i = 0; i < 200; i += 1) {
        const mid = (lo + hi) / 2;
        if (f(mid) < v) lo = mid;
        else hi = mid;
      }
      return hi;
    };
    const linearSpace = (t: number): number => {
      const s = Math.min(1, Math.max(0, t / plan.durationMs));
      return plan.from + (1 - (1 - s) ** 3) * (plan.to - plan.from);
    };
    const inLog = timeToReach(40, (t) => sweepValueAt(plan, t));
    const inLinear = timeToReach(40, linearSpace);
    expect(inLog).toBeGreaterThan(195);
    expect(inLog).toBeLessThan(205); // 199 ms — a fifteenth of the sweep for the first decade
    expect(inLinear).toBeLessThan(0.05); // 0.036 ms: gone before the first frame is drawn
    expect(inLog / inLinear).toBeGreaterThan(5000);
    // And the converse end: linear-space easing spends the last half of the sweep inside 0.06 of a
    // decade, where log-space easing spends it covering 0.67 of one.
    const decadesInLastHalf = (f: (t: number) => number): number =>
      Math.log10(f(plan.durationMs) / f(plan.durationMs / 2));
    expect(decadesInLastHalf(linearSpace)).toBeCloseTo(0.058, 3);
    expect(decadesInLastHalf((t) => sweepValueAt(plan, t))).toBeCloseTo(0.675, 3);
  });
});

/** Drive a plan frame by frame, as a caller would from `requestAnimationFrame`. */
function play(plan: SweepPlan, frames: number): { values: number[]; driver: ReturnType<typeof createSweep> } {
  const driver = createSweep(plan);
  const values: number[] = [];
  for (let i = 0; i <= frames; i += 1) {
    const v = driver.advance((i * plan.durationMs) / frames);
    // `undefined` is "this frame moved nothing" — only a SNAPPED parameter produces one, and the
    // caller must not commit it (see `SweepDriver.advance`). It is not a value, so it is not one.
    if (v !== null && v !== undefined) values.push(v);
  }
  return { values, driver };
}

describe("the driver", () => {
  it("emits a strictly monotone series of DISTINCT values spanning the sweep", () => {
    const plan = planOf(R);
    const { values } = play(plan, 60);
    // 61 frames, 61 distinct values: a driver returning a constant — or one that only moved at the
    // checkpoints — fails here, which is the whole point of counting rather than range-checking.
    expect(values).toHaveLength(61);
    expect(new Set(values).size).toBe(61);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i] ?? 0).toBeGreaterThan(values[i - 1] ?? 0);
    }
    expect(values[0]).toBe(plan.from);
    expect(values[values.length - 1]).toBe(plan.to);
  });

  it("passes each checkpoint exactly once, in order", () => {
    const plan = planOf(R);
    const { driver } = play(plan, 240);
    expect(driver.passed()).toEqual(plan.checkpoints);
  });

  it("passes NO checkpoint before the sweep reaches it", () => {
    const plan = planOf(R);
    const driver = createSweep(plan);
    // The first checkpoint is at 215 ms under the ease-out; nothing may be in the table before then.
    driver.advance(100);
    expect(driver.passed()).toEqual([]);
    driver.advance(214);
    expect(driver.passed()).toEqual([]);
    driver.advance(216);
    expect(driver.passed()).toEqual([plan.checkpoints[0]]);
    // **And AT MOST ONE per call, which is the other half of the same rule.** A frame emits the
    // rung it crossed rather than the eased value past it, so a caller that skipped several frames
    // walks the rungs it missed one call at a time — each row is then computed at the value it
    // names. `advance(durationMs - 1)` therefore adds ONE row, not the three the eased value has
    // gone by; the loop below collects the rest.
    driver.advance(plan.durationMs - 1);
    expect(driver.passed()).toHaveLength(2);
    for (let k = 0; k < 4; k += 1) driver.advance(plan.durationMs);
    expect(driver.passed()).toEqual(plan.checkpoints);
    expect(driver.running()).toBe(false);
  });

  it("fills its rows at the times the checkpoint count was chosen against", () => {
    // The module's own measurement, run rather than quoted: the rungs are evenly spaced in the
    // parameter's scale, so the EASE-OUT decides when they arrive, and the gaps are 215, 255, 320,
    // 456 and 1754 ms. That the times do not depend on the distance is the other half of it — the
    // `0+` sweep, four and a half decades the other way, fills its table at the same five moments.
    const arrivals = (plan: SweepPlan): number[] => {
      const driver = createSweep(plan);
      const out: number[] = [];
      let seen = 0;
      for (let t = 0; t <= plan.durationMs; t += 1) {
        driver.advance(t);
        while (seen < driver.passed().length) {
          out.push(t);
          seen += 1;
        }
      }
      return out;
    };
    const rTimes = arrivals(planOf(R));
    // Sampled at whole milliseconds, so each is the first frame at or past the exact 215.0, 469.7,
    // 789.6, 1245.6 and 3000.
    expect(rTimes).toEqual([216, 470, 790, 1246, 3000]);
    const epsTimes = arrivals(
      planOf({ name: "eps", value: 0.05, range: [1e-6, 1], scale: "log", limit: { to: "0+" } }),
    );
    expect(epsTimes).toEqual(rTimes);
  });

  it("finishes: the last `advance` returns the endpoint, then null, and `running` goes false", () => {
    const plan = planOf(R);
    const driver = createSweep(plan);
    expect(driver.running()).toBe(true);
    expect(driver.advance(1500)).toBeGreaterThan(plan.from);
    // The clock is spent, but the LADDER is not — three rungs are still pending at 1500 ms — so the
    // driver walks them before it ends, one per call, rather than filling them all from the
    // endpoint's numbers. It ends on the call that emits `to`.
    const walked: number[] = [];
    for (let k = 0; k < 8 && driver.running(); k += 1) {
      const v = driver.advance(plan.durationMs);
      if (typeof v === "number") walked.push(v);
    }
    expect(walked[walked.length - 1]).toBe(plan.to);
    expect(driver.running()).toBe(false);
    expect(driver.advance(plan.durationMs + 16)).toBeNull();
    expect(driver.advance(1e9)).toBeNull();
    // Finishing does not lose the table it filled.
    expect(driver.passed()).toEqual(plan.checkpoints);
  });

  it("refuses a clock that goes backwards", () => {
    // A caller drives this from rAF timestamps; a value moving away from the limit would be a commit
    // undoing the one before it, and a checkpoint would become reachable twice.
    const plan = planOf(R);
    const driver = createSweep(plan);
    // **What a rewind may not do is lower the value.** It may still ADVANCE it: three rungs are due
    // by 1000 ms and a call emits one, so the rewound call hands out the next one that is already
    // owed rather than nothing — the clock is held at its maximum, and the ladder is behind it.
    const at1000 = driver.advance(1000) ?? 0;
    const at500 = driver.advance(500) ?? 0;
    expect(at1000).toBeGreaterThan(plan.from);
    expect(at500).toBeGreaterThan(at1000);
    // The rung it hands out is the ladder's, not a value derived from the rewound clock: 500 ms is
    // before the SECOND checkpoint's own arrival time, so a driver that honoured the rewind would
    // emit something below it.
    expect(at500).toBe(plan.checkpoints[1]);
    // And once the ladder has caught up — three rungs owed, three handed out, then the eased value
    // at the held clock — a rewind emits nothing at all, because there is nothing left that the
    // clock's maximum has not already produced.
    driver.advance(1000);
    const settled = driver.advance(1000);
    expect(settled).toBeGreaterThan(plan.checkpoints[2] ?? 0);
    expect(driver.advance(500)).toBeUndefined();
    // Three rows are due by 1000 ms (215, 470, 790) and no rewind adds a fourth.
    expect(driver.passed()).toHaveLength(3);
  });

  it("`stepOnce` lands EXACTLY on the checkpoints and then finishes", () => {
    const plan = planOf(R);
    const driver = createSweep(plan);
    const stepped: number[] = [];
    for (let i = 0; i < plan.checkpoints.length; i += 1) {
      const v = driver.stepOnce();
      expect(v).not.toBeNull();
      if (v !== null) stepped.push(v);
    }
    // Identical numbers, not close ones: the reduced-motion control fills the SAME table rows.
    expect(stepped).toEqual([...plan.checkpoints]);
    expect(driver.passed()).toEqual(plan.checkpoints);
    expect(driver.running()).toBe(false);
    expect(driver.stepOnce()).toBeNull();
  });

  it("does not jump backwards when a stepped sweep is then played", () => {
    const plan = planOf(R);
    const driver = createSweep(plan);
    const first = driver.stepOnce() ?? 0;
    const second = driver.stepOnce() ?? 0;
    // `advance(0)` after two steps must not return `from`: the clock moved with the steps.
    const played = driver.advance(0);
    expect(played).not.toBeNull();
    // `undefined`: the clock moved with the steps, so 0 ms is BEHIND where the sweep already is and
    // the frame moves nothing. What must not happen is a number below `second`, which is asserted
    // on the next frame rather than on this one.
    expect(played).toBeUndefined();
    expect(second).toBeGreaterThan(first);
    expect(driver.passed()).toEqual([...plan.checkpoints].slice(0, 2));
    // Asserted last, because it advances the clock and so fills more rows: the frame that DOES move
    // resumes from where the steps left the sweep rather than from `from`.
    expect(driver.advance(plan.durationMs / 2) ?? 0).toBeGreaterThanOrEqual(second);
  });

  it("`stop` is idempotent, and a stopped sweep emits nothing more", () => {
    const plan = planOf(R);
    const driver = createSweep(plan);
    driver.advance(500);
    const table = [...driver.passed()];
    driver.stop();
    driver.stop();
    driver.stop();
    expect(driver.running()).toBe(false);
    expect(driver.advance(2000)).toBeNull();
    expect(driver.stepOnce()).toBeNull();
    expect(driver.passed()).toEqual(table);
  });

  it("sweeps DOWNWARD for a `0+` parameter, with the same guarantees", () => {
    const plan = planOf({ name: "eps", value: 0.05, range: [1e-6, 1], scale: "log", limit: { to: "0+" } });
    const { values, driver } = play(plan, 60);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i] ?? 0).toBeLessThan(values[i - 1] ?? 0);
    }
    expect(driver.passed()).toEqual(plan.checkpoints);
    expect(driver.running()).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The corpus.

interface Covered {
  readonly record: string;
  readonly param: string;
  readonly p: Param;
  readonly plan: SweepPlan | null;
}

function coverCorpus(): { readonly records: number; readonly rows: Covered[] } {
  const ids = [...loadFamilies().families.keys()];
  const base = defaultState(circleTemplate([0, 0], 1.5));
  const rows: Covered[] = [];
  let records = 0;
  for (const id of ids) {
    const state = { ...base, mode: "gallery" as const, record: id, fixture: 0 };
    const r = resolveState(state, compile(state.expr));
    if (r.kind !== "gallery" || r.run === null) continue;
    records += 1;
    for (const p of Object.values(r.run.contour.params)) {
      rows.push({ record: id, param: p.name, p, plan: planSweep(p) });
    }
  }
  return { records, rows };
}

const CORPUS = coverCorpus();
const SWEPT = CORPUS.rows.filter((r) => r.plan !== null);

describe("every record's parameters, through `planSweep`", () => {
  it("covered all 28 records and counted what it swept", () => {
    // The anti-vacuity clause for everything below: these counts are what a silently-emptied filter
    // would fail. 31 limit parameters over 65 parameters in all: 22 heading to `∞` and 9 to `0⁺`,
    // which is one per record except the four unit-circle records (none at all — nothing there tends
    // to a limit) and the seven indented/keyhole records, which carry BOTH an `R → ∞` and an
    // `ε → 0⁺`, and the two dogbones, whose only limit parameter is `η → 0⁺`.
    expect(CORPUS.records).toBe(28);
    expect(CORPUS.rows.length).toBe(65);
    expect(SWEPT.length).toBe(31);
    expect(SWEPT.filter((r) => r.p.limit?.to === "inf").length).toBe(22);
    expect(SWEPT.filter((r) => r.p.limit?.to === "0+").length).toBe(9);
  });

  it("plans a sweep for EVERY limit parameter and for no other", () => {
    const missing = CORPUS.rows.filter((r) => r.p.limit !== undefined && r.plan === null);
    expect(missing.map((r) => `${r.record}/${r.param}`)).toEqual([]);
    const spurious = CORPUS.rows.filter((r) => r.p.limit === undefined && r.plan !== null);
    expect(spurious.map((r) => `${r.record}/${r.param}`)).toEqual([]);
  });

  it("sends every sweep to an endpoint that exists and is sane", () => {
    const bad: string[] = [];
    for (const { record, param, p, plan } of SWEPT) {
      if (plan === null) continue;
      const [lo, hi] = p.range;
      const want = p.limit?.to === "inf" ? hi : lo;
      const where = `${record}/${param}`;
      if (plan.to !== want) bad.push(`${where}: to ${plan.to} is not the range's ${want}`);
      if (plan.from !== p.value) bad.push(`${where}: from ${plan.from} is not the current value`);
      if (!Number.isFinite(plan.to) || plan.to <= 0) bad.push(`${where}: endpoint ${plan.to} is not usable`);
      if (plan.durationMs < 2000 || plan.durationMs > 4000) bad.push(`${where}: ${plan.durationMs} ms`);
    }
    expect(bad).toEqual([]);
  });

  it("produces no degenerate ladder anywhere in the corpus", () => {
    const bad: string[] = [];
    for (const { record, param, p, plan } of SWEPT) {
      if (plan === null) continue;
      const where = `${record}/${param}`;
      const [lo, hi] = p.range;
      if (plan.checkpoints.length !== 5) bad.push(`${where}: ${plan.checkpoints.length} checkpoints`);
      if (new Set(plan.checkpoints).size !== plan.checkpoints.length) bad.push(`${where}: a repeated rung`);
      if (plan.checkpoints[plan.checkpoints.length - 1] !== plan.to)
        bad.push(`${where}: the last rung is not the endpoint`);
      const rising = plan.to > plan.from;
      let prev = plan.from;
      for (const c of plan.checkpoints) {
        if (c < lo || c > hi) bad.push(`${where}: rung ${c} is outside [${lo}, ${hi}]`);
        if (rising ? c <= prev : c >= prev) bad.push(`${where}: rung ${c} does not advance`);
        prev = c;
      }
    }
    expect(bad).toEqual([]);
  });

  it("drives every corpus sweep to completion, filling its whole table exactly once", () => {
    // The part that would be vacuous if it only PLANNED: each plan is played frame by frame and the
    // table it fills is compared to the ladder it promised.
    let played = 0;
    const bad: string[] = [];
    for (const { record, param, plan } of SWEPT) {
      if (plan === null) continue;
      const { values, driver } = play(plan, 90);
      played += 1;
      const where = `${record}/${param}`;
      if (driver.running()) bad.push(`${where}: still running after the full duration`);
      if (driver.passed().length !== plan.checkpoints.length) bad.push(`${where}: ${driver.passed().length} rows`);
      if (driver.passed().some((c, i) => c !== plan.checkpoints[i])) bad.push(`${where}: rows out of order`);
      if (new Set(values).size !== values.length) bad.push(`${where}: a frame repeated a value`);
      const rising = plan.to > plan.from;
      for (let i = 1; i < values.length; i += 1) {
        const a = values[i - 1] ?? 0;
        const b = values[i] ?? 0;
        if (rising ? b <= a : b >= a) bad.push(`${where}: frame ${i} did not advance`);
      }
    }
    expect(bad).toEqual([]);
    expect(played).toBe(31);
  });
});

// ---------------------------------------------------------------------------------------------
// A parameter that does not admit every value — the step's follow-up defect.
//
// The module's header used to record tier G's `N` as the one thing the corpus could not be swept
// honestly: its ladder ran through 48.04, 577.1, 6931, … and `kernel/bounds/squareSide.ts` refuses
// every half-width that is not `N + ½`, so the table filled with five refusals. `Param.admits` now
// carries the record's own declaration this far and the ladder lands on it. The ledger end of that
// — the rows a reader actually sees — is asserted over the corpus in `halfIntegerParam.test.ts`;
// what is asserted here is the arithmetic, and its counterpart on a parameter with no lattice.

/**
 * A lattice parameter over `R`'s OWN range — synthetic, and deliberately so.
 *
 * The corpus builds tier G's `N` over `[0.25, 256]` (a cost cap, `families/instantiate.ts`), and
 * the real one is asserted in `halfIntegerParam.test.ts` against the real ledger. What is wanted
 * HERE is the arithmetic of snapping, isolated: this differs from `R` in exactly one field, so the
 * pair below is a contrast rather than two unrelated assertions.
 */
const GN: Param = {
  name: "N",
  value: 4,
  range: [0.25, 1e6],
  scale: "log",
  limit: { to: "inf" },
  admits: "integers",
};

describe("a parameter whose values are a lattice", () => {
  it("rounds every rung onto it — the SAME sweep as `R`, which keeps its unrounded one", () => {
    // `R` and tier G's `N` run from 4 to 1e6 on a log scale, so their raw ladders are the same five
    // numbers: the pair is the contrast, not two separate assertions.
    const loose = planOf({ ...R, name: "N" });
    const tight = planOf(GN);
    expect(loose.checkpoints[0]).toBeCloseTo(48.045, 3);
    expect(tight.checkpoints).toEqual([48, 577, 6931, 83255, 1e6]);
    expect(loose.admits).toBeUndefined();
    expect(tight.admits).toBe("integers");
  });

  it("puts the ENDPOINT in the last row, admissible or not — it is the certified limit row", () => {
    expect(planOf(GN).checkpoints[4]).toBe(1e6);
    // A range whose top is not on the lattice still ends there: the certificate names the endpoint,
    // and a rung rounded away from it would be a limit row taken at a value nothing was computed at.
    const odd = planOf({ ...GN, value: 4, range: [0.25, 1234.5] });
    expect(odd.checkpoints[4]).toBe(1234.5);
    expect(odd.checkpoints.slice(0, 4).every((c) => Number.isInteger(c))).toBe(true);
  });

  it("emits admissible values every FRAME, not only at the rungs", () => {
    // The caller commits what `advance` returns, so an unsnapped frame is three seconds of a
    // contour whose bound refuses. 91 frames, 91 distinct integers — the driver's own
    // monotone-and-distinct contract is untouched, which is what makes the snap affordable here.
    const plan = planOf(GN);
    const { values, driver } = play(plan, 90);
    expect(values).toHaveLength(91);
    expect(values.filter((v) => !Number.isInteger(v))).toEqual([]);
    expect(new Set(values).size).toBe(91);
    expect(driver.passed()).toEqual(plan.checkpoints);
  });

  it("walks the same rungs under `stepOnce`, so reduced motion lands on the lattice too", () => {
    const plan = planOf(GN);
    const driver = createSweep(plan);
    const stepped = plan.checkpoints.map(() => driver.stepOnce());
    expect(stepped).toEqual([...plan.checkpoints]);
  });

  it("nudges past a collision rather than refusing the whole ladder", () => {
    // A ladder tight enough that two rungs round to the same value — a reader who has scrubbed the
    // parameter close to its endpoint. Rounding alone gives 1, 1, 2, 3, 5: a repeated rung, which
    // the strict-advance check refuses, taking the play control off a parameter that has a
    // perfectly good coarser ladder. The nudge steps to the next admissible value beyond the
    // previous rung instead.
    const tight: Param = { ...GN, value: 0.5, range: [0.25, 5] };
    const raw = [1, 2, 3, 4].map((k) => Math.round(0.5 * Math.exp((k / 5) * Math.log(10))));
    expect(raw).toEqual([1, 1, 2, 3]);
    expect(planOf(tight).checkpoints).toEqual([1, 2, 3, 4, 5]);
  });

  it("refuses when the lattice leaves no ladder at all", () => {
    // Four rungs are needed below the endpoint and there are not four integers between 4.2 and 5,
    // so the nudge runs past `to` and the strict-advance check refuses — the play control
    // disappears rather than offering a table with a rung outside the sweep.
    expect(planSweep({ ...GN, value: 4.2, range: [0.25, 5] })).toBeNull();
  });
});
