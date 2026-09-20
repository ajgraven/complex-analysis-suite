// A number you can drag — M8 step 3.2, plan §"Step 3.2 — scrubbable numbers".
//
// The claim in the derivation prose and the parameter it is about are the same store field, so
// *"let $R = $ ⟨4⟩"* is not a rendering of `R` but a CONTROL over it: the value goes out through the
// same `actions.setParam` the rail slider and the stage's radius handle write, and there is exactly
// one place a parameter can change.
//
// **The plan names two things this repo does not have.** It says the pixels map into "the
// parameter's range from `frozenRanges`" and that the element writes through `applyParam`; neither
// identifier exists anywhere in the app. The ranges are `Param.range`, straight off the template —
// `cards/parameters.ts`'s own comment records that the old shell's frozen-track snapshot was
// measured and not needed (moving a limit parameter by 1.7× moved zero tracks over all 28 records)
// — and the write is `ShellActions.setParam`. So this module reads `Param` and takes its channel as
// a callback, which is also what lets the arithmetic below be tested without a shell.
//
// The pixel→value map goes through `Param.scale` and `Param.range` exactly as `cards/parameters.ts`'s
// `toStop`/`fromStop` do, because a log parameter dragged linearly would spend eleven of `R`'s twelve
// decades in the last pixel.
import { fmt } from "../kernel/decimal.js";
import { admissibleStep, admissibleValue, type Param } from "../engine/contour/model.js";
import { h, type Desc } from "./dom.js";

/**
 * How many pixels a drag across the WHOLE range takes.
 *
 * Measured against the two things it has to agree with. **Reachability:** the scrub appears in the
 * right rail's derivation card, and `ui/shell.css` gives that rail `24rem` = 384 px — but a drag
 * holds the pointer (`setPointerCapture`), so it is bounded by the window rather than by the card,
 * and the narrowest window this app supports is 1024 px (the stylesheet declares no breakpoint
 * below 1024 and the phone notice takes the page below 900). 400 px is a comfortable single gesture
 * inside either. **Sensitivity:** `cards/parameters.ts` puts `STOPS` = 1000 on a track at most the
 * left rail's `19rem` = 304 px wide, so one slider pixel is ~3.3 stops; 400 px over the full range
 * is 2.5 stops per pixel, which puts the two controls at the same order of sensitivity rather than
 * making the inline number a coarser or twitchier way of asking for the same thing.
 */
export const TRACK_PX = 400;

/**
 * Stops per full range, for the arrow keys — `cards/parameters.ts`'s number.
 *
 * The same granularity as one arrow press on the rail slider, which is what a native
 * `<input type="range">` gives for a `step` of one stop. Two controls over one field that moved it
 * by different amounts per press would be two controls.
 */
const STOPS = 1000;

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** Where `v` sits in the parameter's own scale, as a fraction of the range. */
function fraction(p: Param, v: number): number {
  const [lo, hi] = p.range;
  const x = clamp(v, lo, hi);
  return p.scale === "log"
    ? (Math.log(x) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))
    : (x - lo) / (hi - lo);
}

/**
 * The inverse of {@link fraction}, with the fraction clamped — which is where BOTH ends clamp.
 *
 * **The ends return the endpoint ITSELF rather than the formula's value at it.** Measured on the
 * semicircle's `R`, whose range is `[1e-6, 1e6]` on a log scale: `exp(log(1e-6) + 1·(log(1e6) −
 * log(1e-6)))` is `1000000.0000000013`, so a drag pinned hard against the stop produced a value
 * 1.3e-9 ABOVE the declared maximum — a clamp that does not clamp, with `aria-valuemax` then
 * naming a bound the value had passed. It is float64's rounding through `log`/`exp` and no
 * tolerance fixes it; returning the endpoint does, exactly, in both scales.
 */
function valueAt(p: Param, u: number): number {
  const [lo, hi] = p.range;
  if (u <= 0) return lo;
  if (u >= 1) return hi;
  return p.scale === "log" ? Math.exp(Math.log(lo) + u * (Math.log(hi) - Math.log(lo))) : lo + u * (hi - lo);
}

/**
 * Pixels → a value, respecting the parameter's own scale and range.
 *
 * `from` is the value the gesture STARTED at and `dx` the whole displacement since, never the last
 * frame's: the stage controller's own posture ("anchored, not accumulated"), so a long drag cannot
 * drift and a recompute landing mid-drag cannot feed its own output back in.
 *
 * A degenerate range returns the clamped value rather than `NaN`: `hi === lo` divides by zero in
 * both scales, and a parameter pinned to one value is a thing a template may legitimately declare.
 */
export function scrubbedValue(p: Param, from: number, dx: number, trackPx: number = TRACK_PX): number {
  const [lo, hi] = p.range;
  if (!(hi > lo) || !(trackPx > 0)) return clamp(from, Math.min(lo, hi), Math.max(lo, hi));
  // The pixels still map continuously; only the value that LEAVES does not. Snapping the fraction
  // instead would quantise the gesture, and a drag that stops responding for 40 px reads as a
  // broken control rather than as a coarse parameter.
  return admissibleValue(valueAt(p, fraction(p, from) + dx / trackPx), p.admits, p.range);
}

/**
 * One step of the ← → keys, from the parameter's current value. Clamped at both ends.
 *
 * **A constrained parameter steps by one admissible value, not by one stop of a thousand.** They
 * are not the same thing and the stop is not even a rounding away from it: measured on tier G's
 * `N`, one stop over `[0.25, 256]` on a log scale is a factor of 1.0070, so from `N = 4` a press
 * asks for 4.03 — off the lattice on the FIRST press, and every press after it, with
 * `kernel/bounds/squareSide.ts` refusing all four sides each time. The thousand stops stay for
 * every other parameter, where they are what makes this control and the rail's slider one control.
 */
export function steppedValue(p: Param, direction: -1 | 1): number {
  const [lo, hi] = p.range;
  if (!(hi > lo)) return clamp(p.value, Math.min(lo, hi), Math.max(lo, hi));
  if (p.admits !== undefined) return admissibleStep(p.value, p.admits, direction, p.range);
  return valueAt(p, fraction(p, p.value) + direction / STOPS);
}

export interface ScrubSpec {
  readonly param: Param;
  /** Where the value goes. The SAME channel the slider and the stage handle write. */
  readonly onChange: (value: number) => void;
  /** Pointer down / up, for the draft budget — the slider's own `setScrubbing`. */
  readonly onScrubbing?: (on: boolean) => void;
  readonly key?: string;
  /** `toPrecision`'s digits; absent is the plain decimal the ledger already prints. */
  readonly digits?: number;
}

/**
 * Where a gesture started, keyed by the NODE rather than held in a closure.
 *
 * `scrub` is a description builder: the shell calls it again on every recompute, and a recompute
 * happens on every frame of the drag it is describing. A `let` in the closure would therefore be a
 * fresh `let` per frame and the anchor would be lost on the first move. The node is what persists
 * (`dom.ts` rule 1 keeps it while the key does), so the anchor persists with it — and `WeakMap`
 * means an element the patch removes takes its anchor with it.
 */
const ANCHOR = new WeakMap<Element, { readonly x: number; readonly value: number }>();

/** What the reader sees. `digits` is `toPrecision`'s; absent is `fmt`, which is what the ledger prints. */
function shown(spec: ScrubSpec): string {
  return spec.digits === undefined ? fmt(spec.param.value) : spec.param.value.toPrecision(spec.digits);
}

/**
 * The inline element: the number with a dashed underline, draggable and focusable.
 *
 * `role="slider"` rather than a bare span with a listener, because it IS a slider — the same value,
 * the same bounds and the same two keys as the rail's — and a reader who cannot see the dashes has
 * no other way to learn the number is a control. `tabindex="0"` is what makes the keys reachable at
 * all; without it the element never takes focus and `ArrowRight` scrolls the page instead.
 */
export function scrub(spec: ScrubSpec): Desc {
  const p = spec.param;
  const [lo, hi] = p.range;
  const label = shown(spec);
  return h(
    "span",
    {
      // Keyed by the parameter's name by default, so a recompute mid-drag updates this node instead
      // of replacing it. Replacing it would drop the pointer capture — and with it the rest of the
      // gesture — which is `cards/parameters.ts`'s reason for keying its slider the same way.
      key: spec.key ?? `scrub:${p.name}`,
      class: "scrub num",
      role: "slider",
      tabindex: "0",
      "aria-label": `${p.name}, currently ${label}`,
      "aria-valuenow": String(p.value),
      // **What is ANNOUNCED is what is DRAWN.** With `digits` set the element reads `0.333` while
      // `aria-valuenow` carries `0.3333333333333333`, and a screen reader prefers `valuenow` in the
      // absence of this — so the two readers of one control would hear and see different numbers.
      "aria-valuetext": label,
      "aria-valuemin": String(lo),
      "aria-valuemax": String(hi),
      onPointerdown: (e: Event) => {
        const ev = e as PointerEvent;
        const el = ev.currentTarget as Element & { setPointerCapture?: (id: number) => void };
        ANCHOR.set(el, { x: ev.clientX, value: p.value });
        // Guarded: jsdom implements neither capture call, and the description is the same object in
        // both environments. Without capture a drag that leaves the word stops; with it, it does not.
        el.setPointerCapture?.(ev.pointerId);
        spec.onScrubbing?.(true);
      },
      onPointermove: (e: Event) => {
        const ev = e as PointerEvent;
        const at = ANCHOR.get(ev.currentTarget as Element);
        // A move with no anchor is an ordinary hover over the word, which must not move anything.
        if (at === undefined) return;
        spec.onChange(scrubbedValue(p, at.value, ev.clientX - at.x));
      },
      onPointerup: (e: Event) => endGesture(e, spec),
      // **`pointercancel` is the case worth pinning.** A gesture the browser takes away (a touch
      // becoming a scroll, a window losing focus) fires this and never `pointerup`, so a handler
      // that only listened for the latter would leave `setScrubbing(true)` set and hold the whole
      // app at the draft budget for the rest of the session, with nothing on screen to say why.
      onPointercancel: (e: Event) => endGesture(e, spec),
      onKeydown: (e: Event) => {
        const ev = e as KeyboardEvent;
        const up = ev.key === "ArrowRight" || ev.key === "ArrowUp";
        const down = ev.key === "ArrowLeft" || ev.key === "ArrowDown";
        // **Up and Down as well as Left and Right**, which ARIA's slider pattern requires and the
        // first draft did not have: a reader who reaches for Up got nothing at all from a control
        // announcing itself as a slider.
        if (!up && !down) return;
        // `preventDefault` before the write: the arrow keys scroll the page by default, and a number
        // that changes while the rail scrolls away from it is worse than one that does not change.
        ev.preventDefault();
        // **And `stopPropagation`, which is not tidiness.** This span sits inside the Derivation
        // card's `.stepper`, whose own `keydown` moves the argument a step on ← / →. Without this,
        // one press both scrubbed the number AND advanced the stepper — and `repaint` then replaced
        // the step body, destroying the focused node, so focus fell to `<body>` and a keyboard
        // reader could not press the key twice. `onStepKey`'s own doc had named this span as the
        // case its tag test would miss and concluded the guard would arrive with its consumer.
        ev.stopPropagation();
        spec.onChange(steppedValue(p, up ? 1 : -1));
        // **The settle the pointer path makes, on the keyboard too.** `setParam` commits at the
        // DRAFT budget while a gesture is live, and a press is a gesture with no end event — so
        // without this the reader is left looking at draft numbers with nothing to release.
        spec.onScrubbing?.(false);
      },
    },
    label,
  );
}

function endGesture(e: Event, spec: ScrubSpec): void {
  const ev = e as PointerEvent;
  const el = ev.currentTarget as Element & {
    hasPointerCapture?: (id: number) => boolean;
    releasePointerCapture?: (id: number) => void;
  };
  // Released whether or not a drag was in progress: the flag is the app's budget, and clearing one
  // that is already clear costs a render at full precision that was going to happen anyway. The
  // capture is released only where it is HELD — `stageController.ts`'s guard, for the same reason:
  // `releasePointerCapture` on a pointer that was never captured throws `NotFoundError`, and a
  // throw here would skip `onScrubbing(false)` and leave the flag this handler exists to clear.
  ANCHOR.delete(el);
  if (el.hasPointerCapture?.(ev.pointerId) === true) el.releasePointerCapture?.(ev.pointerId);
  spec.onScrubbing?.(false);
}
