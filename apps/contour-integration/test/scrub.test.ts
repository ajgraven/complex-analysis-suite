// @vitest-environment jsdom
//
// The scrubbable number — M8 step 3.2.
//
// Two subjects, different in kind. The ARITHMETIC is pure and is driven directly, because a pixel
// count that goes through `Param.scale` is a fact about the parameter and not about the DOM. The
// ELEMENT is patched into a real node and driven with real events, because what it has to be is a
// control a reader can reach: a role, a name, bounds, a pointer and two keys.
//
// **Anti-vacuity.** Every assertion below was asked what else could produce it. The drag tests
// therefore assert the VALUE that arrives rather than that `onChange` fired at all (a handler that
// fired with `NaN`, or with the value it already had, would pass the weaker form), the keyboard
// tests assert `defaultPrevented` as well as the value (the page-scroll half is the half a reader
// notices), and the `pointercancel` test asserts the flag is CLEAR after a gesture that was taken
// away — the state a `pointerup`-only handler leaves behind, which nothing on screen would show.
import { describe, expect, it, vi } from "vitest";

import { circleTemplate, semicircleTemplate } from "../src/engine/contour/templates.js";
import type { Param } from "../src/engine/contour/model.js";
import { patch } from "../src/shell/dom.js";
import { TRACK_PX, scrub, scrubbedValue, steppedValue } from "../src/shell/scrub.js";

/** A hand-built parameter: a decade-free linear range, so a pixel count is arithmetic in the head. */
const linear: Param = { name: "R", value: 5, range: [0, 10], scale: "linear" };

/** A hand-built log one over exactly four decades, for the same reason. */
const log: Param = { name: "eps", value: 1, range: [0.01, 100], scale: "log" };

/** The circle's `R` — a REAL parameter, twelve decades on a log scale. */
const realR = (): Param => circleTemplate().params.R;

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The arithmetic.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("scrubbedValue", () => {
  it("maps pixels linearly for a linear parameter, anchored at the value the drag started from", () => {
    // A tenth of the track is a tenth of the range: 40 px of 400 is 1 of 10.
    expect(scrubbedValue(linear, 5, TRACK_PX / 10)).toBeCloseTo(6, 12);
    expect(scrubbedValue(linear, 5, -TRACK_PX / 10)).toBeCloseTo(4, 12);
    // Zero displacement is the identity, not "wherever the parameter happens to be": `from` is the
    // anchor, and passing a value the parameter does not hold is what a mid-drag recompute does.
    expect(scrubbedValue(linear, 2.5, 0)).toBe(2.5);
  });

  it("maps pixels GEOMETRICALLY for a log parameter — the whole point of reading `scale`", () => {
    // Four decades over the track, so a quarter of it is one decade: 1 → 10, and back to 0.1.
    expect(scrubbedValue(log, 1, TRACK_PX / 4)).toBeCloseTo(10, 9);
    expect(scrubbedValue(log, 1, -TRACK_PX / 4)).toBeCloseTo(0.1, 9);
    // And it is NOT the linear answer, which would be 1 + 100/4 · … — stated because the two agree
    // nowhere except at the ends, and a linear implementation passes no test that only checks a sign.
    expect(scrubbedValue(log, 1, TRACK_PX / 4)).not.toBeCloseTo(
      scrubbedValue({ ...log, scale: "linear" }, 1, TRACK_PX / 4),
      3,
    );
  });

  it("clamps at BOTH ends, in both scales", () => {
    expect(scrubbedValue(linear, 5, 100 * TRACK_PX)).toBe(10);
    expect(scrubbedValue(linear, 5, -100 * TRACK_PX)).toBe(0);
    expect(scrubbedValue(log, 1, 100 * TRACK_PX)).toBeCloseTo(100, 9);
    expect(scrubbedValue(log, 1, -100 * TRACK_PX)).toBeCloseTo(0.01, 9);
    // A `from` outside the range is clamped before the pixels are added, so an out-of-range anchor
    // cannot buy a drag extra room at the far end.
    expect(scrubbedValue(linear, 1e6, 0)).toBe(10);
  });

  it("takes a track width, and a degenerate range returns a number rather than NaN", () => {
    expect(scrubbedValue(linear, 5, 100, 200)).toBeCloseTo(10, 12);
    const pinned: Param = { name: "N", value: 3, range: [3, 3], scale: "linear" };
    expect(scrubbedValue(pinned, 3, 999)).toBe(3);
    expect(scrubbedValue(linear, 5, 40, 0)).toBe(5);
  });

  it("moves a REAL template parameter across its twelve decades", () => {
    const p = realR();
    expect(p.scale).toBe("log");
    expect(p.range).toEqual([1e-6, 1e6]);
    // One twelfth of the track is one decade, because the range is twelve of them.
    expect(scrubbedValue(p, 1, TRACK_PX / 12)).toBeCloseTo(10, 6);
    expect(scrubbedValue(p, 1, TRACK_PX)).toBeCloseTo(1e6, 0);
  });
});

describe("steppedValue", () => {
  it("steps by one stop of the rail slider's thousand, and clamps", () => {
    expect(steppedValue(linear, 1)).toBeCloseTo(5.01, 12);
    expect(steppedValue(linear, -1)).toBeCloseTo(4.99, 12);
    expect(steppedValue({ ...linear, value: 10 }, 1)).toBe(10);
    expect(steppedValue({ ...linear, value: 0 }, -1)).toBe(0);
  });

  it("steps MULTIPLICATIVELY on a log parameter", () => {
    // Four decades over a thousand stops: one press is a factor of 10^(4/1000).
    expect(steppedValue(log, 1)).toBeCloseTo(Math.pow(10, 4 / 1000), 12);
    expect(steppedValue({ ...log, value: 50 }, 1) / 50).toBeCloseTo(Math.pow(10, 4 / 1000), 12);
    // The ratio is what is constant, not the difference — which is the assertion a linear
    // implementation fails: at 50 a linear step is 0.0999… and this is 0.464.
    expect(steppedValue({ ...log, value: 50 }, 1) - 50).toBeGreaterThan(0.4);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The element.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** jsdom implements no pointer capture; `scrub` calls it on every gesture. */
function stubPointer(el: Element): void {
  const e = el as Element & Record<string, unknown>;
  e.setPointerCapture = (): void => {};
  e.releasePointerCapture = (): void => {};
  e.hasPointerCapture = (): boolean => false;
}

/** A pointer event jsdom will dispatch — `shell2.test.ts`'s helper: `PointerEvent` is absent, the fields are not. */
function pointer(type: string, x: number): Event {
  const ev = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 0, buttons: 1 });
  Object.assign(ev, { pointerId: 1 });
  return ev;
}

function key(name: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
}

interface Mounted {
  readonly root: HTMLElement;
  readonly el: HTMLElement;
  readonly changes: number[];
  readonly flags: boolean[];
  readonly render: (p: Param) => HTMLElement;
}

function mount(p: Param, digits?: number): Mounted {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const changes: number[] = [];
  const flags: boolean[] = [];
  const render = (q: Param): HTMLElement => {
    patch(root, [
      scrub({
        param: q,
        onChange: (v) => changes.push(v),
        onScrubbing: (on) => flags.push(on),
        ...(digits === undefined ? {} : { digits }),
      }),
    ]);
    const el = root.firstElementChild as HTMLElement;
    stubPointer(el);
    return el;
  };
  return { root, el: render(p), changes, flags, render };
}

describe("the scrub element", () => {
  it("is a slider with a name, a value and both bounds, reachable by keyboard", () => {
    const { el } = mount(log);
    expect(el.getAttribute("role")).toBe("slider");
    expect(el.getAttribute("aria-valuenow")).toBe("1");
    expect(el.getAttribute("aria-valuemin")).toBe("0.01");
    expect(el.getAttribute("aria-valuemax")).toBe("100");
    // The NAME carries the parameter, so a reader hears which of several numbers this one is.
    expect(el.getAttribute("aria-label")).toContain("eps");
    expect(el.getAttribute("tabindex")).toBe("0");
    expect(el.className).toContain("scrub");
    expect(el.textContent).toBe("1");
  });

  it("prints the ledger's own decimal by default and `toPrecision` where asked", () => {
    expect(mount({ ...linear, value: 1 / 3 }).el.textContent).toBe("0.33333333");
    expect(mount({ ...linear, value: 1 / 3 }, 3).el.textContent).toBe("0.333");
  });

  it("ANNOUNCES the number it DRAWS — with `digits`, that is not `aria-valuenow`", () => {
    // A screen reader prefers `aria-valuenow` when there is no `aria-valuetext`, so without the text
    // the two readers of one control take different numbers off it: the element renders `0.333`
    // while `valuenow` carries the full `0.3333333333333333`.
    const { el } = mount({ ...linear, value: 1 / 3 }, 3);
    expect(`drawn ${el.textContent} / announced ${el.getAttribute("aria-valuetext")}`).toBe(
      "drawn 0.333 / announced 0.333",
    );
    // The half that makes the line above non-vacuous: `valuenow` really does carry a DIFFERENT
    // string here, so the agreement cannot have come from the two attributes being the same thing.
    expect(el.getAttribute("aria-valuenow")).toBe("0.3333333333333333");
    expect(el.getAttribute("aria-valuetext")).not.toBe(el.getAttribute("aria-valuenow"));
  });

  it("a horizontal drag writes the value, and only while the pointer is DOWN", () => {
    const { el, changes } = mount(linear);
    // A move with no gesture is an ordinary hover over a word in a sentence.
    el.dispatchEvent(pointer("pointermove", 500));
    expect(changes).toEqual([]);

    el.dispatchEvent(pointer("pointerdown", 100));
    el.dispatchEvent(pointer("pointermove", 100 + TRACK_PX / 10));
    expect(changes).toEqual([6]);
    // Anchored, not accumulated: the second move is measured from the SAME start, so two moves to
    // the same place give the same value rather than twice the displacement.
    el.dispatchEvent(pointer("pointermove", 100 + TRACK_PX / 10));
    expect(changes).toEqual([6, 6]);
    el.dispatchEvent(pointer("pointermove", 100 - TRACK_PX / 5));
    expect(changes[2]).toBeCloseTo(3, 12);

    el.dispatchEvent(pointer("pointerup", 100));
    el.dispatchEvent(pointer("pointermove", 900));
    expect(changes).toHaveLength(3);
  });

  it("clamps under the pointer too, so a drag off the end of the range stays in it", () => {
    const { el, changes } = mount(log);
    el.dispatchEvent(pointer("pointerdown", 0));
    el.dispatchEvent(pointer("pointermove", 10 * TRACK_PX));
    el.dispatchEvent(pointer("pointermove", -10 * TRACK_PX));
    expect(changes[0]).toBeCloseTo(100, 9);
    expect(changes[1]).toBeCloseTo(0.01, 9);
  });

  it("raises the draft-budget flag on pointerdown and drops it on pointerup", () => {
    const { el, flags } = mount(linear);
    el.dispatchEvent(pointer("pointerdown", 0));
    expect(flags).toEqual([true]);
    el.dispatchEvent(pointer("pointerup", 0));
    expect(flags).toEqual([true, false]);
  });

  it("drops it on POINTERCANCEL too — a gesture taken away must not leave the app at draft budget", () => {
    const { el, flags, changes } = mount(linear);
    el.dispatchEvent(pointer("pointerdown", 100));
    el.dispatchEvent(pointer("pointermove", 100 + TRACK_PX / 10));
    el.dispatchEvent(pointer("pointercancel", 100 + TRACK_PX / 10));
    expect(flags).toEqual([true, false]);
    // And the gesture is over: a move after the cancel writes nothing, which is what says the
    // anchor was dropped rather than the flag merely toggled.
    el.dispatchEvent(pointer("pointermove", 900));
    expect(changes).toHaveLength(1);
  });

  it("steps on ← and →, prevents the page scroll, and ignores every other key", () => {
    const { el, changes } = mount(linear);
    el.focus();
    const right = key("ArrowRight");
    el.dispatchEvent(right);
    expect(changes[0]).toBeCloseTo(5.01, 12);
    expect(right.defaultPrevented).toBe(true);

    const left = key("ArrowLeft");
    el.dispatchEvent(left);
    expect(changes[1]).toBeCloseTo(4.99, 12);
    expect(left.defaultPrevented).toBe(true);

    // `Home`/`End` are not required, and a key that does nothing must not eat the browser's own.
    const home = key("Home");
    el.dispatchEvent(home);
    expect(changes).toHaveLength(2);
    expect(home.defaultPrevented).toBe(false);
  });

  it("steps on \u2191 and \u2193 as well \u2014 ARIA's slider pattern, which the first draft had not", () => {
    // A reader who reaches for Up got nothing at all from a control announcing itself as a slider.
    // What is claimed is that the vertical pair is the SAME step as the horizontal one, not merely
    // that it does something, so the values are compared against `steppedValue`'s own and quoted as
    // the numbers the \u2190 / \u2192 test already pins.
    const { el, changes } = mount(linear);
    el.focus();
    const upEv = key("ArrowUp");
    el.dispatchEvent(upEv);
    const downEv = key("ArrowDown");
    el.dispatchEvent(downEv);
    // Pinned first so a failure names the reason rather than an `undefined`: the claim is that
    // both vertical keys reached the handler at all.
    expect(`writes from \u2191\u2193: ${changes.length}`).toBe("writes from \u2191\u2193: 2");
    expect(changes[0]).toBeCloseTo(steppedValue(linear, 1), 12);
    expect(changes[1]).toBeCloseTo(steppedValue(linear, -1), 12);
    expect(`up ${changes[0].toFixed(4)}, down ${changes[1].toFixed(4)}`).toBe("up 5.0100, down 4.9900");
    // Up is UP: a handler that read every arrow as one direction passes any test that only checks
    // both keys fired.
    expect(changes[0]).toBeGreaterThan(changes[1]);
    expect(`${upEv.defaultPrevented} ${downEv.defaultPrevented}`).toBe("true true");
  });

  it("SWALLOWS the key, so the Derivation card's stepper does not ALSO advance", () => {
    // This span sits inside the card's `.stepper`, whose own `keydown` moves the argument a step on
    // \u2190 / \u2192. Measured before the guard: one press both scrubbed the number AND advanced the
    // stepper, and the repaint that followed replaced the step body \u2014 destroying the focused node,
    // so focus fell to `<body>` and a keyboard reader could not press the key twice. The parent here
    // IS that listener.
    const { root, el, changes } = mount(linear);
    const heard: string[] = [];
    root.addEventListener("keydown", (e) => heard.push((e as KeyboardEvent).key));
    el.focus();
    el.dispatchEvent(key("ArrowRight"));
    // Both halves together, because either alone passes for the wrong reason: a handler that
    // swallowed the key without writing reads the same as one that wrote without swallowing.
    expect(`scrubbed ${changes.length}, parent heard ${heard.length}`).toBe("scrubbed 1, parent heard 0");
    expect(changes[0]).toBeCloseTo(5.01, 12);

    // And the parent's listener is REACHABLE \u2014 a key the scrub ignores does arrive at it, which is
    // what says the silence above is `stopPropagation` rather than a listener that never fires.
    el.dispatchEvent(key("Home"));
    expect(heard).toEqual(["Home"]);
  });

  it("SETTLES on a key press, exactly as the pointer path does on pointerup", () => {
    // `setParam` commits at the DRAFT evaluation budget while a gesture is live, and a key press is
    // a gesture with no end event \u2014 so without a release the reader is left looking at draft-budget
    // numbers with nothing to clear them. The two paths are asserted together rather than the
    // keyboard one alone, because what is claimed is that they AGREE about the flag.
    const byKey = mount(linear);
    byKey.el.focus();
    byKey.el.dispatchEvent(key("ArrowRight"));
    const byPointer = mount(linear);
    byPointer.el.dispatchEvent(pointer("pointerdown", 0));
    byPointer.el.dispatchEvent(pointer("pointermove", TRACK_PX / 10));
    byPointer.el.dispatchEvent(pointer("pointerup", TRACK_PX / 10));
    expect(`key [${byKey.flags.join(",")}] pointer [${byPointer.flags.join(",")}]`).toBe(
      "key [false] pointer [true,false]",
    );
    // Non-vacuous from the other side: a key that is not a step releases nothing, so the `false`
    // above is this handler's and not something every keydown emits.
    const ignored = mount(linear);
    ignored.el.focus();
    ignored.el.dispatchEvent(key("Home"));
    expect(ignored.flags).toEqual([]);
  });

  it("does not step when the element is not focused", () => {
    const { el, changes } = mount(linear);
    el.focus();
    el.blur();
    // A real key press goes to `document.activeElement`; dispatching at the body is that, and it
    // does not reach a span that is not an ancestor of the target.
    document.body.dispatchEvent(key("ArrowRight"));
    expect(document.activeElement).not.toBe(el);
    expect(changes).toEqual([]);
  });

  it("KEEPS ITS NODE across a recompute, so a drag survives the render it causes", () => {
    const { el, changes, render } = mount(linear);
    el.dispatchEvent(pointer("pointerdown", 100));
    el.dispatchEvent(pointer("pointermove", 100 + TRACK_PX / 10));
    expect(changes).toEqual([6]);

    // What the shell does with that value: it re-renders. `dom.ts` rule 1 must give back the SAME
    // element — a replacement would drop the pointer capture and end the gesture mid-drag.
    const again = render({ ...linear, value: 6 });
    expect(again).toBe(el);
    expect(again.getAttribute("aria-valuenow")).toBe("6");
    expect(again.textContent).toBe("6");

    // …and the anchor is still the value the drag STARTED at, not the one just written: the same
    // pointer position must still mean 6, where an anchor rebuilt per render would read 7.
    el.dispatchEvent(pointer("pointermove", 100 + TRACK_PX / 10));
    expect(changes).toEqual([6, 6]);
  });

  it("is keyed by the PARAMETER, so the node follows its number rather than its position", () => {
    // The identity test above would pass with no key at all — a lone child keeps the positional
    // key `@0:span` on every render — so the reason is pinned here instead: two scrubs, swapped.
    // A keyed node follows its key across the reorder; a positionally keyed one is handed to the
    // other parameter, which in a rail that gains a row mid-drag is the gesture landing on the
    // wrong field.
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const one = (q: Param): ReturnType<typeof scrub> => scrub({ param: q, onChange: () => {} });
    patch(root, [one(linear), one(log)]);
    const [first, second] = [...root.children] as HTMLElement[];
    expect(first.getAttribute("aria-label")).toContain("R");
    expect(second.getAttribute("aria-label")).toContain("eps");

    patch(root, [one(log), one(linear)]);
    const swapped = [...root.children] as HTMLElement[];
    expect(swapped[0]).toBe(second);
    expect(swapped[1]).toBe(first);
  });

  it("drives a REAL template parameter through the channel the slider writes", () => {
    const contour = semicircleTemplate();
    const p = contour.params.R;
    const setParam = vi.fn();
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    patch(root, [scrub({ param: p, onChange: (v) => setParam(p.name, v) })]);
    const el = root.firstElementChild as HTMLElement;
    stubPointer(el);
    el.dispatchEvent(pointer("pointerdown", 0));
    el.dispatchEvent(pointer("pointermove", TRACK_PX));
    expect(setParam).toHaveBeenCalledTimes(1);
    const [name, value] = setParam.mock.calls[0] as [string, number];
    expect(name).toBe("R");
    expect(value).toBe(p.range[1]);
    // The parameter itself is untouched — the element writes through the callback and owns nothing.
    expect(contour.params.R.value).toBe(p.value);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// A parameter that does not admit every value — the step's follow-up defect.
//
// Tier G's `N` draws a square of half-width `N + ½`, and `kernel/bounds/squareSide.ts` refuses any
// other width by name. The scrub could put it anywhere: one stop of the rail's thousand over
// `[0.25, 256]` is a factor of 1.0070, so the FIRST arrow press asked for 4.03 and every side's
// bound refused. `Param.admits` now carries the record's declaration this far. The ledger end — the
// rows a reader sees, over the whole corpus — is asserted in `halfIntegerParam.test.ts`.

/** Tier G's `N`, exactly as `families/instantiate.ts` now builds it — the 256 cap included. */
const constrained: Param = {
  name: "N",
  value: 4,
  range: [0.25, 256],
  scale: "log",
  limit: { to: "inf" },
  admits: "integers",
};

describe("a parameter whose values are a lattice", () => {
  it("steps by ONE admissible value, where the thousandth stop would not have left 4", () => {
    expect(steppedValue(constrained, 1)).toBe(5);
    expect(steppedValue(constrained, -1)).toBe(3);
    // What the continuous rule asks for on the same parameter, quoted so the two are compared
    // rather than one of them merely asserted: 4.03, off the lattice on the first press.
    const stop = steppedValue({ name: "N", value: 4, range: constrained.range, scale: "log" }, 1);
    expect(stop).toBeGreaterThan(4.02);
    expect(stop).toBeLessThan(4.07);
    expect(Number.isInteger(stop)).toBe(false);
  });

  it("steps by one value and not by one PIXEL'S worth, however wide the range", () => {
    // The lattice is in the parameter's units, so a press moves by 1 at either end of the range —
    // where the log stop moves by a FACTOR and is therefore 1.8 wide at the top of this one and
    // 15,000 wide at the top of a twelve-decade one.
    expect(steppedValue({ ...constrained, value: 250 }, 1)).toBe(251);
    expect(steppedValue({ ...constrained, value: 250 }, -1)).toBe(249);
    const wide = { ...constrained, admits: undefined, value: 250 };
    expect(steppedValue(wide, 1) - 250).toBeGreaterThan(1.7);
    // Clamped at the endpoint rather than stepping one past it.
    expect(steppedValue({ ...constrained, value: 256 }, 1)).toBe(256);
  });

  it("drags onto the lattice at every pixel, and to the first admissible value at the ends", () => {
    for (let dx = -TRACK_PX; dx <= TRACK_PX; dx += 13) {
      expect(Number.isInteger(scrubbedValue(constrained, constrained.value, dx))).toBe(true);
    }
    // The bottom of the range is 0.25, so the clamp cannot be the range's own endpoint: it is the
    // first integer inside it, which is a width `squareSide` accepts.
    expect(scrubbedValue(constrained, 4, -100 * TRACK_PX)).toBe(1);
    expect(scrubbedValue(constrained, 4, 100 * TRACK_PX)).toBe(256);
    // The pixels still map continuously — only the value that leaves does not: a quarter of the
    // track from 4 covers 0.75 of the range's 3.0 decades, so the drag is not quantised in the hand.
    expect(scrubbedValue(constrained, 4, TRACK_PX / 4)).toBeGreaterThan(20);
  });

  it("writes only admissible values through the ELEMENT, on both the pointer and the keys", () => {
    const { el, changes } = mount(constrained);
    el.dispatchEvent(pointer("pointerdown", 100));
    for (const x of [140, 180, 220, 260, 300]) el.dispatchEvent(pointer("pointermove", x));
    el.dispatchEvent(pointer("pointerup", 300));
    expect(changes).toHaveLength(5);
    expect(changes.filter((v) => !Number.isInteger(v))).toEqual([]);

    el.focus();
    const right = key("ArrowRight");
    el.dispatchEvent(right);
    expect(changes[5]).toBe(5);
    expect(right.defaultPrevented).toBe(true);
  });

  it("leaves a CONTINUOUS parameter exactly as it was", () => {
    // The negation of everything above: `admits` is absent on 62 of the corpus's 65 parameters, and
    // the numbers here are the ones the existing tests pin — asserted again beside the lattice so a
    // snap applied to every parameter fails in this file rather than quantising `R` in silence.
    expect(linear.admits).toBeUndefined();
    expect(steppedValue(linear, 1)).toBeCloseTo(5.01, 12);
    expect(scrubbedValue(linear, 5, TRACK_PX / 10)).toBeCloseTo(6, 12);
    expect(scrubbedValue(log, 1, TRACK_PX / 4)).toBeCloseTo(10, 9);
  });
});
