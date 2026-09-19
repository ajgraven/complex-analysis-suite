// The limit step's **play** control, as a driver with no DOM and no clock — M8 step 3.2.
//
// The plan's sentence is *"sweeps the parameter from its current value toward `Param.limit.to`
// (∞ → the range's maximum; 0⁺ → the minimum) over about three seconds with an ease-out, as a series
// of `commit`s at draft budget and one at full budget at the end"*. Everything in that sentence
// except the commits is arithmetic, so it lives here and runs in the node gate; the commits, the
// `requestAnimationFrame` and the `prefers-reduced-motion` query stay at the call site, which is why
// `advance` takes the time rather than reading one. A driver that owned a clock could only be tested
// by waiting, and a test that waits is a test that is flaky on a loaded CI box.
//
// **Why the sweep is not a scrub that happens to move.** It shares the scrub's write path
// (`actions.setParam`) and a drag stops it — but a scrub goes where the finger goes, while this
// knows where it is HEADING, which is what lets it fill a table at checkpoints and put the certified
// limit in the last row. That knowledge is `Param.limit`, and a parameter without one gets no play
// control at all rather than a sweep to an arbitrary edge.
//
// **Not every parameter may be swept through every value, and the corpus found it by running.**
// Tier G's `N` got a ladder of interpolated reals — 9.19, 21.1, 48.5, … on today's range, and
// 48.04, 577.1, 6931, … on the wider one it was found over — and `squareTemplate` draws the square at
// half-width `N + ½`, which `kernel/bounds/squareSide.ts` certifies only at INTEGER `N`, refusing
// anything else by name, so G1/G2/G3's table filled five rows of refusals. The information was
// declared (`Family.contour.limitParams[].through`) and dropped on the way in; it now arrives as
// `Param.admits`, and the ladder lands on it. The rounding is NOT done here on a guess — it is one
// function in `engine/contour/model.ts` that the scrub goes through too, so the next parameter
// needing a different lattice changes one place and both controls follow.
import { admissibleStep, admissibleValue, type Admissible, type Param } from "../engine/contour/model.js";

/**
 * About three seconds, the plan's figure.
 *
 * Not adjustable per parameter, though the sweeps differ enormously in what they traverse (`R` runs
 * 4 → 1e6, five and a half decades; `eta` runs 0.05 → 1e-6, four and a half the other way). Measured
 * over the corpus, every plan has the same five checkpoints at the same five MOMENTS — the times
 * depend on the eased fractions and this duration alone, never on the distance — so a duration
 * proportional to the distance would only make the wide sweeps slower without giving a reader one
 * more row or one more second to read a row in.
 */
const DURATION_MS = 3000;

/**
 * Five checkpoints — four on the way and the limit endpoint last.
 *
 * The plan's own example is *"for R: 2, 4, 8, 16, then ∞ as the certified limit row"* — five rows —
 * and those four numbers are NOT hardcoded here, because they are a doubling ladder from a starting
 * value of 2 and the corpus does not start there: `R` starts at 4 or 6 and its range reaches 1e6, so
 * doubling would need nineteen rows to arrive, and `eta` doubles the wrong way entirely. What is
 * kept from the example is its cardinality and its shape — a GEOMETRIC ladder for a log parameter,
 * arithmetic for a linear one, the last rung being the endpoint itself.
 *
 * **The count was chosen against the TIMES the rows arrive at, which the ease-out does not space
 * evenly.** The rungs are evenly spaced in the parameter's own scale, so their times are
 * `D·(1 − (1 − k/n)^{1/3})`: with five, they land at 215, 470, 790, 1246 and 3000 ms — gaps of 215,
 * 255, 320, 456 and 1754 ms, the last being the settle. Three would leave gaps of 470/790/1740 ms
 * but only TWO intermediate rows, which is a ratio rather than a trend: one bad row could not then
 * be told from a bound that stopped decreasing. Ten halves every gap — the first two rows arrive
 * 103 ms and 215 ms in — which is below the time it takes to read one, and each checkpoint is also
 * a full-budget commit, so the count is the sweep's cost as well as its resolution. Five is the
 * largest count whose rows can all be read as they appear.
 */
const CHECKPOINTS = 5;

export interface SweepPlan {
  readonly param: string;
  readonly from: number;
  readonly to: number;
  /**
   * The parameter's own scale, carried so `sweepValueAt` is a pure function of the PLAN.
   *
   * Not in the signature the step was specified with, and added rather than inferred: "both
   * endpoints positive" would read the sandbox's linear `N` (range `[0, 1e4]`, started anywhere
   * above zero) as logarithmic and ease it on a curve its own slider does not use.
   */
  readonly scale: "linear" | "log";
  /**
   * The parameter's lattice, carried for the same reason `scale` is: `sweepValueAt` is a pure
   * function of the PLAN, and every value it hands a caller to commit has to be one the argument
   * admits — not only the rows of the table.
   */
  readonly admits?: Admissible;
  /** Values the table fills a row at, in sweep order, `to` last. */
  readonly checkpoints: readonly number[];
  readonly durationMs: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Where `limit.to` lands, as a number in the range. `∞` is the maximum and `0⁺` the minimum — the
 *  plan says so, and `instantiate.ts` builds the ranges (`[0.25, 1e6]`, `[1e-6, 1]`) to be exactly
 *  that: the furthest the app is willing to evaluate at, not a value anything is true at. */
const endpointOf = (to: "inf" | "0+" | number, lo: number, hi: number): number =>
  to === "inf" ? hi : to === "0+" ? lo : clamp(to, lo, hi);

/** One point along the sweep, in the parameter's own scale. */
const interpolate = (from: number, to: number, u: number, scale: SweepPlan["scale"]): number =>
  scale === "log"
    ? Math.exp(Math.log(from) + u * (Math.log(to) - Math.log(from)))
    : from + u * (to - from);

/** `null` when the parameter takes no limit, or its limit has nowhere to go. */
export function planSweep(p: Param, opts?: { readonly reducedMotion?: boolean }): SweepPlan | null {
  // Reduced motion takes the SAME plan, deliberately: the caller drives it with `stepOnce` instead
  // of `advance`, and the checkpoints are what `stepOnce` steps through. A shorter ladder under the
  // media query would mean the two controls report DIFFERENT tables — the same argument evidenced
  // by fewer rows for the reader who asked for less movement, which is the one thing the setting
  // must not cost. The flag is accepted so the call site need not branch, and its only effect is
  // this line: it is read, and then the same plan is built.
  void opts?.reducedMotion;
  if (p.limit === undefined) return null;
  const [lo, hi] = p.range;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(lo < hi)) return null;
  const from = clamp(p.value, lo, hi);
  const to = endpointOf(p.limit.to, lo, hi);
  // Both of the next two refusals are SUBSUMED by the ladder check below — measured, each as a
  // surviving mutant: with `from === to` every rung is `from`, and with a log endpoint at 0 every
  // rung is 0 or NaN, so the strict-advance check returns null either way. They are kept because
  // "the limit has nowhere to go" is decided here, and a refusal that depended on a ladder
  // collapsing would be an edit to the ladder away from minting a plan.
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return null;
  // A log parameter reaching 0 has no geometric ladder to it and no logarithm to ease in, so it is
  // refused rather than swept on the linear curve: a control that silently changed easing would put
  // the whole sweep in one frame (see `sweepValueAt`'s measurement). No corpus range does this —
  // the two limit ranges bottom out at 1e-6 and 0.25 — so this is a guard, not a case.
  if (p.scale === "log" && !(from > 0 && to > 0)) return null;

  const checkpoints: number[] = [];
  let prevRung = from;
  for (let k = 1; k <= CHECKPOINTS; k += 1) {
    // The last rung is ASSIGNED `to` rather than interpolated at `u = 1`: `exp(log(a) + 1·(log(b) −
    // log(a)))` is 1e6 − 1.2e-10 for the `R` sweep, and the table's last row is the certified limit
    // row, which must carry the endpoint the certificate was computed at. It is also the one rung
    // NOT moved onto the lattice, for the same reason — the certificate names the endpoint. Nothing
    // is lost on the corpus, measured: tier G's endpoint is 256, which is an integer already.
    const rung =
      k === CHECKPOINTS
        ? to
        : nextRung(p, interpolate(from, to, k / CHECKPOINTS, p.scale), prevRung, to > from);
    checkpoints.push(rung);
    prevRung = rung;
  }
  // A ladder with a repeated rung would fill two table rows with one number and pass a checkpoint
  // twice; refuse it here rather than letting the driver decide what to do about it.
  const rising = to > from;
  let prev = from;
  for (const cur of checkpoints) {
    if (!Number.isFinite(cur) || (rising ? !(cur > prev) : !(cur < prev))) return null;
    prev = cur;
  }

  return {
    param: p.name,
    from,
    to,
    scale: p.scale,
    ...(p.admits === undefined ? {} : { admits: p.admits }),
    checkpoints,
    durationMs: DURATION_MS,
  };
}

/**
 * One rung, moved onto the lattice the parameter admits — the identity on a continuous one.
 *
 * **A rung may not merely round.** Two rungs of a short ladder can round to the same value, and the
 * strict-advance check below would then refuse the whole plan, taking the play control off a
 * parameter that has a perfectly good coarser ladder; so a collision steps to the next admissible
 * value BEYOND the previous rung, in the sweep's own direction. It does not arise on the corpus —
 * tier G's ladder is 9, 21, 49, 111, 256 — but it does the moment a reader scrubs `N` to 250 and
 * then presses play, which is two gestures away.
 */
function nextRung(p: Param, raw: number, prev: number, rising: boolean): number {
  if (p.admits === undefined) return raw;
  const snapped = admissibleValue(raw, p.admits, p.range);
  if (rising ? snapped > prev : snapped < prev) return snapped;
  return admissibleStep(prev, p.admits, rising ? 1 : -1, p.range);
}

/**
 * Where the sweep is at `tMs`, ease-out. Pure.
 *
 * **The easing is applied in the parameter's own scale, and for a log parameter that is the whole
 * difference between a sweep and a jump.** Measured on the corpus's own `R` (4 → 1e6, the A5/A6
 * sweep): eased in LINEAR space, the value passes 40 — one decade, the last magnification at which
 * anything on the stage is still distinguishable — at t = 0.04 ms, one frame in 75 at 60 Hz, and it
 * spends the last half of the three seconds between 875,000 and 1,000,000, a change of 0.06 decades
 * nobody can see. Eased in LOG space the same sweep passes 40 at 199 ms and 400 at 428 ms, and spends
 * the last half of the three seconds covering 0.67 of a decade against the linear-space sweep's
 * 0.058. Same endpoints, same curve, same duration; one shows five and a half decades and the other
 * shows one frame of them.
 *
 * Ease-OUT rather than ease-in: the limit is where the argument is going, so the sweep should settle
 * there rather than arrive at speed. Cubic rather than quadratic because the settle has to be
 * visible against the commit cadence — a quadratic's last 10% of distance takes 0.32 of the time
 * against a cubic's 0.46, and at a draft budget's frame rate the shorter one reads as a stop.
 */
export function sweepValueAt(plan: SweepPlan, tMs: number): number {
  // Both endpoints are returned EXACTLY rather than computed: the caller commits this number, and
  // `from` off by an ulp is a recompute of a contour that did not move, while `to` off by an ulp is
  // a certified limit row taken at a value the certificate does not name.
  if (!(tMs > 0)) return plan.from;
  if (tMs >= plan.durationMs) return plan.to;
  const s = tMs / plan.durationMs;
  // Every emitted value is on the lattice, not only the checkpoints: the caller COMMITS this
  // number, so an unsnapped frame would put a refusing square on screen for the whole three
  // seconds of a tier-G sweep and fill the stage with the one row the ladder exists to avoid. Both
  // endpoints are exempt above — `from` is where the parameter already is, and `to` is the
  // certified limit row. Measured on tier G's own sweep (4 → 256, 91 frames): 80 emitted values,
  // all distinct and strictly increasing, with the eleven that snapped onto their predecessor
  // reported as `undefined` rather than committed (see `SweepDriver.advance`).
  return admissibleValue(interpolate(plan.from, plan.to, 1 - (1 - s) ** 3, plan.scale), plan.admits);
}

export interface SweepDriver {
  readonly running: () => boolean;
  /**
   * Advance to `tMs` since start. Three answers, and the third is not a convenience.
   *
   * A number is the value to commit; `null` is "finished"; **`undefined` is "this frame moved
   * nothing"**, which only a SNAPPED parameter can produce and which the caller must not commit.
   *
   * **At most ONE checkpoint passes per call, and that is a contract rather than an accident.** A
   * frame whose eased value has gone past a rung emits the RUNG, so the row the caller then takes
   * is computed at the value it is labelled with — and a caller that skipped frames (a backgrounded
   * tab, a slow commit) walks the rungs it missed one call at a time rather than filling four rows
   * from one commit's evidence. The clock is held at its maximum throughout, so this never moves a
   * value backwards; what it does mean is that a rewound call can still ADVANCE the ladder, when
   * rungs are owed at the clock the driver has already reached.
   * Measured on tier G's `N` over its real range (4 → 256, 91 frames): the eased value crosses 80
   * integers, so eleven frames snapped onto the value before them — and each of those would be a
   * full re-resolve of a state the app is already in, at 179 ms apiece near the top of the ladder.
   * The driver reports "nothing moved" rather than asking for that work, which is also why the
   * corpus's strict-advance contract survives the snapping.
   */
  readonly advance: (tMs: number) => number | null | undefined;
  /** Jump straight to the next checkpoint — the reduced-motion control. */
  readonly stepOnce: () => number | null;
  readonly stop: () => void;
  /** Checkpoints already passed, in order, for the table. */
  readonly passed: () => readonly number[];
}

export function createSweep(plan: SweepPlan): SweepDriver {
  const rising = plan.to > plan.from;
  const reached = (v: number, c: number): boolean => (rising ? v >= c : v <= c);
  const passed: number[] = [];
  let next = 0;
  let finished = false;
  // The clock is held rather than trusted. A caller drives this from `requestAnimationFrame`
  // timestamps, and a driver that honoured a time going backwards would emit a value moving AWAY
  // from the limit — the table's rows are the sweep's evidence, so a row must not be reachable
  // twice and a commit must not undo the one before it.
  let lastT = 0;
  /** The last value handed out, so a snapped sweep does not ask for the same commit twice. */
  let emitted: number | null = null;

  const take = (v: number): void => {
    for (;;) {
      const c = plan.checkpoints[next];
      if (c === undefined || !reached(v, c)) return;
      passed.push(c);
      next += 1;
    }
  };

  return {
    running: () => !finished,
    advance: (tMs: number): number | null | undefined => {
      if (finished) return null;
      lastT = Math.max(lastT, Number.isFinite(tMs) ? tMs : lastT);
      if (lastT >= plan.durationMs) {
        const pending = plan.checkpoints[next];
        if (pending !== undefined && pending !== plan.to) {
          // **The clock is spent but the ladder is not.** A slow machine can run fewer frames than
          // there are rungs, and a row must be computed AT the value it names — so the rest are
          // walked one frame each rather than filled from the endpoint's numbers, which would put
          // four different labels on one commit's evidence. The sweep then takes a little longer
          // than `durationMs`, which is the honest direction.
          take(pending);
          emitted = pending;
          return pending;
        }
        // The clock's end. `take` normally has nothing left to do here, because the rung before was
        // committed exactly — and on a SNAPPED ladder the easing can round up to `to` a frame or
        // two early, in which case this branch answers `undefined` for the same reason every other
        // frame does: the app is already in that state. `finished` is set either way, so the next
        // call returns `null` and the caller makes its full-budget settle regardless.
        finished = true;
        take(plan.to);
        if (emitted !== null && plan.to === emitted) return undefined;
        emitted = plan.to;
        return plan.to;
      }
      const eased = sweepValueAt(plan, lastT);
      // **A frame that crosses a rung commits the RUNG, not the eased value past it.** The table's
      // row is labelled with the checkpoint and its three numbers are read off the resolution the
      // commit produced, so committing 4.07 and labelling the row `4` would print one value's
      // evidence under another's name — the drift M6.3's caption rule exists to prevent, one
      // surface along. It also makes at most ONE checkpoint pass per frame, which is what lets the
      // caller append rows in step with `passed()` instead of guessing how many it missed.
      const c = plan.checkpoints[next];
      const v = c !== undefined && reached(eased, c) ? c : eased;
      if (emitted !== null && v === emitted) return undefined;
      emitted = v;
      take(v);
      return v;
    },
    stepOnce: (): number | null => {
      if (finished) return null;
      const c = plan.checkpoints[next];
      if (c === undefined) {
        finished = true;
        return null;
      }
      passed.push(c);
      next += 1;
      // The step control and the played sweep share one driver, so stepping has to move the clock
      // too: otherwise a reader who steps twice and then hits play would see the value jump
      // backwards to where the easing says 0 ms is.
      lastT = Math.max(lastT, timeOfValue(plan, c));
      emitted = c;
      if (next >= plan.checkpoints.length) finished = true;
      return c;
    },
    stop: () => {
      finished = true;
    },
    passed: () => passed,
  };
}

/** The inverse of {@link sweepValueAt} — when the eased sweep reaches `v`. Used only to keep a
 *  stepped driver's clock honest, so it is allowed to be approximate at the endpoints. */
function timeOfValue(plan: SweepPlan, v: number): number {
  if (v === plan.to) return plan.durationMs;
  const u =
    plan.scale === "log"
      ? (Math.log(v) - Math.log(plan.from)) / (Math.log(plan.to) - Math.log(plan.from))
      : (v - plan.from) / (plan.to - plan.from);
  return plan.durationMs * (1 - Math.cbrt(1 - clamp(u, 0, 1)));
}
