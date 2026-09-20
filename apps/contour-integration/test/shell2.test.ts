// @vitest-environment jsdom
//
// The new shell's scaffold — M8 step 1.1.
//
// Two things are under test and they are different in kind. The BUILDER's three properties are
// what make the old shell's focus and listener defects unrepresentable, so they are tested
// directly, on bare nodes, where a failure names the rule rather than a symptom. The page's four
// STRUCTURAL invariants are ported from `test/shell.test.ts` unchanged, because they must hold from
// the first commit of the new shell rather than be fixed at the end of Phase 1 — which is how M6.4
// came to find the nav reading last after four milestones.
//
// Query by role and accessible name or `data-testid`, never by card position (plan §4.0's rule from
// the review): a test that says "the third card" passes for the wrong reason the day a card moves.
import katex from "katex";
import { describe, expect, it, vi } from "vitest";

import { LEFT_CARDS, RIGHT_CARDS, cardTitle } from "../src/engine/vocabulary.js";
import { handlesOf, onContour } from "../src/engine/contour/edit.js";
import { resolveAll } from "../src/engine/contour/model.js";
import { CENTER_MAX, plotToScreen, scale, screenToPlot } from "../src/kernel/camera.js";
import { makeComplexFn, parse } from "@cas/expr";
import { analyse } from "../src/engine/analyse.js";
import { arcThroughBulge, bulgeFromApex, type PenNode } from "../src/engine/contour/pen.js";
import { findPoles } from "../src/kernel/poles.js";
import { pointAt } from "../src/kernel/geom.js";
import { translateContour } from "../src/engine/contour/edit.js";
import { STAGE_MODES } from "../src/ui/stage/mode.js";
import { h, patch } from "../src/shell/dom.js";
import { math, mathPlain, mathText, renderedCount } from "../src/shell/math.js";
import { mountShell2 } from "../src/shell/app.js";
import { createStageController } from "../src/shell/stageController.js";
import { createStageView } from "../src/shell/stageView.js";
import { COLD_START_RECORD, compile, defaultState, shellMode } from "../src/shell/state.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import { defaultSession, resetTransient } from "../src/shell/session.js";
import { resolveState } from "../src/shell/state.js";

/**
 * Mount a fresh app. jsdom has no canvas, and the shell already handles not getting a context.
 *
 * **ONE jsdom `window` SERVES THE WHOLE FILE, SO THE ADDRESS BAR IS CLEARED HERE.** `mountShell2`
 * opens whatever `#vs=` link it finds, and `syncHash` writes one from every commit on a 250 ms
 * coalescing timer — so without this a test inherits whichever EARLIER test's permalink happened to
 * land before it mounted, which is a race rather than an order. Measured: the wheel-zoom test's
 * `deltaY: 100000` leaves the camera at `center [1.05e64, -6.97e63]` (`clampView` bounds the half
 * height and not the centre), and a later mount that inherits it is 1e64 from every point its
 * pointer events name.
 */
/** The app exactly as it opens — a record, since M8 step 1.8b. For tests whose subject is the boot. */
function mountCold(): { root: HTMLElement; app: ReturnType<typeof mountShell2> } {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  window.history.replaceState(null, "", window.location.pathname);
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  return { root, app: mountShell2(root) };
}

/**
 * The app as a reader finds it, then the Sandbox button.
 *
 * **The cold start is a RECORD** (M8 step 1.8b), and most of this file is about the sandbox — the
 * pen, the template picker, a declared factor, the typed expression. So the helpers take the reader's
 * own route into it, through `toSandbox` rather than by assembling a state: that is the path that has
 * to keep working, and it is what hands back `sandboxContour`, which `coldStartState` sets from the
 * circle it is built on. {@link mountCold} is for the tests whose subject IS the boot.
 */
function mount(): { root: HTMLElement; app: ReturnType<typeof mountShell2> } {
  const m = mountCold();
  m.app.actions().toSandbox();
  return m;
}

const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T => {
  const e = root.querySelector<T>(sel);
  if (e === null) throw new Error(`no ${sel}`);
  return e;
};

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The builder. Three rules, each of which was a real defect in the old shell.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("the keyed builder", () => {
  it("keeps the same NODE when a key persists, even across a reorder", () => {
    // The rule M7.2's sweep bought: `replaceChildren` destroys the buttons, so a reader who has
    // tabbed to one loses focus. Identity is the property; text is only how it is observed.
    const host = document.createElement("div");
    patch(host, [h("button", { key: "a" }, "A"), h("button", { key: "b" }, "B")]);
    const [a, b] = [...host.children];
    patch(host, [h("button", { key: "b" }, "B"), h("button", { key: "a" }, "A2")]);
    expect(host.children[0]).toBe(b);
    expect(host.children[1]).toBe(a);
    expect(host.children[1].textContent).toBe("A2");
    // And a key that goes away takes its node with it.
    patch(host, [h("button", { key: "b" }, "B")]);
    expect([...host.children]).toEqual([b]);
  });

  it("writes an `aria-*` boolean as a WORD, not as presence or absence", () => {
    // HTML's boolean attributes are present-or-absent and `true` means the empty string; ARIA's are
    // values. `aria-pressed="false"` says *this toggle is off* where an absent one says *this is not
    // a toggle*, and `aria-pressed=""` is read as undefined rather than as pressed — so the general
    // rule got BOTH directions wrong, invisibly, since `theme.css` styles `[aria-pressed="true"]`
    // and that selector simply never matched.
    const host = document.createElement("div");
    patch(host, [
      h("button", { key: "off", "aria-pressed": false }),
      h("button", { key: "on", "aria-pressed": true }),
      h("div", { key: "hidden", hidden: true }),
      h("div", { key: "shown", hidden: false }),
    ]);
    expect(host.children[0].getAttribute("aria-pressed")).toBe("false");
    expect(host.children[1].getAttribute("aria-pressed")).toBe("true");
    // And the ordinary rule is untouched: a non-ARIA boolean is still presence-or-absence.
    expect(host.children[2].getAttribute("hidden")).toBe("");
    expect(host.children[3].hasAttribute("hidden")).toBe(false);
  });

  it("REFUSES two children of one parent that share a key", () => {
    // A duplicate key is a caller's bug that used to be silent and permanent: the map holds one node
    // per key, so the first is never matched and never removed, and the app draws it twice forever.
    // Step 1.4 shipped exactly that for one render — a card's table taking the `<h2>`'s key.
    const host = document.createElement("div");
    expect(() => patch(host, [h("h2", { key: "t" }, "A"), h("table", { key: "t" })])).toThrow(/share the key 't'/);
  });

  it("OWNS its parent's children: anything it did not put there is removed", () => {
    // Removal by "what is left in the key map" misses a node that has no key at all, so a stray
    // appended into a patched parent lives there forever. Removing by "not wanted" makes the
    // contract statable: a patched parent is the patch's, and the shell appends to its own hosts.
    const host = document.createElement("div");
    patch(host, [h("p", { key: "a" }, "A")]);
    host.append(document.createElement("hr"));
    expect(host.children.length).toBe(2);
    patch(host, [h("p", { key: "a" }, "A")]);
    expect(host.children.length, "a foreign node survived a patch").toBe(1);
  });

  it("removes a node whose key another child TOOK, rather than stranding it", () => {
    // The other half of the same defect: removal used to be "whatever is left in the key map", and a
    // node that had been displaced from that map was in neither list.
    const host = document.createElement("div");
    patch(host, [h("h2", { key: "t" }, "A")]);
    patch(host, [h("p", { key: "t" }, "B")]);
    expect(host.children.length).toBe(1);
    expect(host.children[0].tagName).toBe("P");
  });

  it("leaves a FOCUSED input focused, with its caret, across a patch", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const draw = (value: string, label: string): void => {
      patch(host, [h("input", { key: "expr", type: "text", value, "aria-label": label })]);
    };
    draw("1/z", "integrand f(z)");
    const input = q<HTMLInputElement>(host, "input");
    input.focus();
    input.setSelectionRange(1, 1);
    expect(document.activeElement).toBe(input);

    // A patch that changes a NEIGHBOURING attribute must not touch the value, and so must not move
    // the caret. This is the case that actually happens: the reader types, and something else on
    // the card re-renders.
    draw("1/z", "cofactor R(z)");
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(1);
    expect(input.getAttribute("aria-label")).toBe("cofactor R(z)");
    // The node was never re-created, which is what makes the above true rather than lucky.
    expect(q<HTMLInputElement>(host, "input")).toBe(input);
  });

  it("REPLACES a listener rather than adding one, so a button fires once", () => {
    const host = document.createElement("div");
    let first = 0;
    let second = 0;
    patch(host, [h("button", { key: "go", onClick: () => (first += 1) }, "go")]);
    patch(host, [h("button", { key: "go", onClick: () => (second += 1) }, "go")]);
    patch(host, [h("button", { key: "go", onClick: () => (second += 1) }, "go")]);
    q<HTMLButtonElement>(host, "button").click();
    // Three renders, one click: the first handler is gone and the current one ran exactly once.
    expect(first).toBe(0);
    expect(second).toBe(1);
  });

  it("removes a listener the description drops, and one it sets to undefined", () => {
    // TWO paths, and the sweep found only one of them covered. A card that writes
    // `onClick: enabled ? fn : undefined` keeps the KEY and drops the function, which the removal
    // loop over the previous props never sees — so it is the second loop's `else` that must clear it.
    const host = document.createElement("div");
    let fired = 0;
    const on = (): number => (fired += 1);

    patch(host, [h("button", { key: "go", onClick: on }, "go")]);
    patch(host, [h("button", { key: "go" }, "go")]);
    q<HTMLButtonElement>(host, "button").click();
    expect(fired, "dropped from the props entirely").toBe(0);

    patch(host, [h("button", { key: "go", onClick: on }, "go")]);
    patch(host, [h("button", { key: "go", onClick: undefined }, "go")]);
    q<HTMLButtonElement>(host, "button").click();
    expect(fired, "present but not a function").toBe(0);
  });

  it("writes a property only when it DIFFERS — counted, not inferred", () => {
    // **The first draft of this rule was tested vacuously and a sweep found it.** The caret test
    // above patches twice with the same string, and jsdom does not move the selection on a
    // same-value write — so "unconditional" survived it. What the guard actually does is skip the
    // WRITE, and a write is countable.
    const host = document.createElement("div");
    patch(host, [h("input", { key: "i", type: "text", value: "1/z" })]);
    const input = q<HTMLInputElement>(host, "input");
    const writes: string[] = [];
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => proto?.get?.call(input) as string,
      set: (v: string) => {
        writes.push(v);
        proto?.set?.call(input, v);
      },
    });
    patch(host, [h("input", { key: "i", type: "text", value: "1/z" })]);
    expect(writes).toEqual([]);
    patch(host, [h("input", { key: "i", type: "text", value: "1/(1+z^2)" })]);
    expect(writes).toEqual(["1/(1+z^2)"]);
  });

  it("clears an attribute the description drops", () => {
    const host = document.createElement("div");
    patch(host, [h("input", { key: "i", type: "checkbox", checked: true, "data-x": "1" })]);
    const input = q<HTMLInputElement>(host, "input");
    expect(input.checked).toBe(true);
    expect(input.getAttribute("data-x")).toBe("1");
    patch(host, [h("input", { key: "i", type: "checkbox", checked: false })]);
    expect(input.checked).toBe(false);
    expect(input.hasAttribute("data-x")).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// KaTeX, memoised.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("typeset mathematics", () => {
  it("CALLS KaTeX once however many times a formula is described", () => {
    // **A sweep found the first draft of this vacuous.** It compared the two descriptions' html and
    // watched the cache grow by one — both of which stay true when the cache is written and never
    // read, which is exactly the defect "memoised" is supposed to exclude. What the cache buys is
    // that KaTeX does not PARSE again, and a call is countable.
    const spy = vi.spyOn(katex, "renderToString");
    const before = renderedCount();
    const latex = "\\oint_{\\gamma_{\\mathrm{sweep}}} f(z)\\,dz";
    const one = math(latex);
    const two = math(latex);
    const three = math(latex, { key: "elsewhere" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(two.props.html).toBe(one.props.html);
    expect(three.props.html).toBe(one.props.html);
    expect(renderedCount()).toBe(before + 1);
    // Display mode is a different rendering of the same source, so it is a different cache entry.
    math(latex, { display: true });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(renderedCount()).toBe(before + 2);
    spy.mockRestore();
  });

  it("carries the plain-text form as its accessible name", () => {
    // KaTeX's HTML is positioned spans and its MathML is unevenly supported, so the name is the
    // sentence a reader would say — step 0.4's text sibling, which the app already has.
    const d = math("\\pi", { label: "π" });
    expect(d.props["aria-label"]).toBe("π");
    expect(d.props.role).toBe("math");
  });

  it("splits a sentence on `$…$`, leaving the text outside alone", () => {
    const parts = mathText("the value is $\\pi/2$ exactly");
    expect(parts.map((p) => p.tag)).toEqual(["#text", "span", "#text"]);
    expect(parts[0].props.nodeValue).toBe("the value is ");
    expect(parts[2].props.nodeValue).toBe(" exactly");
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The session — what a permalink must not carry.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("the session", () => {
  it("clears what a restored state must not inherit, and keeps the reader's own preferences", () => {
    // M7.4 found two of these by reading rather than by failing: a grading that outlived its rung
    // would unmask the derivation at a rung whose whole point is that it is masked, and a half-drawn
    // pen path survived leaving the sandbox.
    const s = defaultSession();
    s.gesture = "pen";
    s.drillGraded = true;
    s.undo = [defaultState(circleTemplate())];
    s.hover = { z: [1, 0], piece: "arc", handle: 2 };
    s.rails = { left: true, right: false };
    s.open = { numerics: true };
    resetTransient(s);
    expect(s.gesture).toBe("none");
    expect(s.drillGraded).toBe(false);
    // **The undo stacks SURVIVE this, and that changed at M8 step 1.11.** They used to be on the
    // list, which was right while `applyState` was its only caller — and wrong the moment `restore`
    // became the second, because clearing them there wiped the redo stack the undo had just filled
    // and a reader could step back and never forward. A link still clears them; `undo.ts`'s
    // `"link"` rule does it, in the module that owns them.
    expect(s.undo).toHaveLength(1);
    expect(s.hover.piece).toBeNull();
    // Opening a link should not fold a reader's panels or close their disclosures.
    expect(s.rails).toEqual({ left: true, right: false });
    expect(s.open).toEqual({ numerics: true });
  });

  it("gives every mount its own session", () => {
    const a = defaultSession();
    a.gesture = "contour";
    expect(defaultSession().gesture).toBe("none");
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The page's structure — ported from `test/shell.test.ts`, which is where M6.4 established them.
// jsdom has no axe, but it has a DOM, and all four are DOM facts.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("the new shell's structure", () => {
  it("has exactly one <main> and exactly one <h1> above the cards' <h2>s", () => {
    const { root } = mount();
    expect(root.querySelectorAll("main")).toHaveLength(1);
    expect(root.querySelectorAll("h1")).toHaveLength(1);
    expect(q(root, "h1").textContent).toBe("Contour Integration");
    expect(root.querySelectorAll("h2").length).toBeGreaterThan(3);
  });

  it("mounts NO suite nav, and <main> is the root's first element", () => {
    // **The invariant that survives ADR-0044.** This was *"puts the suite nav BEFORE `<main>`, so
    // it reads where it draws"* — M6.4's finding, where `mountNavHeader` ended with `appendChild`
    // while `.cas-nav` drew fixed at the top, so the bar read last, after the entire rail. The
    // header is withdrawn from every app in the suite, so there is nothing to order: what has to
    // stay true is that the landmark is not preceded by chrome that is not in it.
    const { root } = mount();
    expect(root.querySelector("nav.cas-nav")).toBeNull();
    expect(root.querySelector("nav")).toBeNull();
    const main = q(root, "main");
    // `linkBox` sits before `<main>` but is `hidden` until a link is refused (M6.2's third
    // finding), so the first element a reader meets is the landmark.
    const visible = [...root.children].filter((e) => !(e as HTMLElement).hidden);
    expect(visible[0]).toBe(main);
  });

  it("names every canvas, or hides it explicitly", () => {
    const { root } = mount();
    const canvases = [...root.querySelectorAll("canvas")];
    expect(canvases.length).toBe(3);
    for (const c of canvases) {
      const named = (c.getAttribute("aria-label") ?? "").length > 0;
      const hidden = c.getAttribute("aria-hidden") === "true";
      expect(named || hidden, `${c.className} is neither named nor hidden`).toBe(true);
    }
    expect(q(root, "canvas.gl").getAttribute("aria-hidden")).toBe("true");
    expect(q(root, "canvas.ink").getAttribute("role")).toBe("application");
    expect(q(root, "canvas.acc").getAttribute("role")).toBe("img");
  });

  it("boots on A6 in Explore, with both rails open and every card titled", () => {
    // **Through `mountCold`, and that is the point of the helper.** This test's subject IS the boot,
    // so it must not go through the Sandbox button the rest of the file takes — under `mount()` it
    // would pass while asserting `toSandbox`, which is a different claim wearing this one's name.
    const { root, app } = mountCold();
    const state = app.currentState();
    expect(state.mode).toBe("gallery");
    expect(state.record).toBe(COLD_START_RECORD);
    expect(state.fixture).toBe(0);
    expect(shellMode(state), "the cold start opens in a teaching mode rather than Explore").toBe("explore");

    const shell = q(root, "main.shell2");
    expect(shell.dataset.left).toBe("open");
    expect(shell.dataset.right).toBe("open");
    // A record has all nine, the Target card included — which is the half that changed, and the
    // clause that makes this an assertion about the RECORD rather than about any state at all.
    const titles = [...root.querySelectorAll("h2")].map((e) => e.textContent);
    for (const id of [...LEFT_CARDS, ...RIGHT_CARDS]) {
      expect(titles, `${id} is missing`).toContain(cardTitle(id));
    }

    // And the engine actually ran, which is what the boot has to prove: the headline is the ledger's
    // own sentence for a closing argument. **Not "Hypotheses verified."** — the plan's acceptance
    // string, which exists nowhere in this app; `HEADLINES.closes` is this, and `result.ts` records
    // a deliberate decision AGAINST the word "Hypotheses" here, because a browser pass found it
    // sitting beside the Derivation card's own `Hypotheses` two cards away.
    expect(q(root, '[data-card="result"] .headline').textContent).toContain("The argument is complete.");
    expect(q(root, '[data-testid="mode"] button[aria-pressed="true"]').textContent).toBe("Explore");
    expect(q(root, '[data-testid="record"]').textContent).not.toBe("Choose a record");
  });

  it("OPENS the front door from the bar, and tells the shell it is up", () => {
    // **Two mutants survived here, one in each direction**, because `test/frontDoor.test.ts` drives
    // the dialog object and no test pressed the button a reader presses. `openFrontDoor` could set
    // `session.frontDoorOpen` and never call `open()` — a control that swallows a click — or call
    // `open()` and never set the flag, which is the bar and the dialog disagreeing about whether the
    // panel is up, exactly what `setContrastsOpen` has a comment about avoiding.
    const { root, app } = mountCold();
    expect(root.querySelector('[role="dialog"]'), "a panel nobody opened was already up").toBeNull();
    expect(app.session().frontDoorOpen).toBe(false);

    q<HTMLButtonElement>(root, '[data-testid="record"]').click();

    const dialog = root.querySelector('[role="dialog"]');
    expect(dialog, "the record button did not raise the picker").not.toBeNull();
    expect(app.session().frontDoorOpen, "the shell does not know its own panel is up").toBe(true);
    // And it is the front door rather than the ladder — both are dialogs, and the bar has a button
    // for each, so the name is what tells them apart.
    expect(dialog?.textContent).toContain("Worked examples");
    // The page behind it is inert, which is `modal.ts`'s half and is asserted here only because a
    // panel raised by the wrong call would have skipped it.
    expect(q(root, "main.shell2").hasAttribute("inert")).toBe(true);
  });

  it("gives the SANDBOX its circle at 1/z, framed, when the reader asks for it", () => {
    // The plan's clause that the cold start must not cost: *the sandbox's default expression stays
    // `1/z` on the circle for when Sandbox is chosen*. It holds because `coldStartState` layers the
    // record on top of `defaultState`, so `sandboxContour` is still the circle handed in — and the
    // camera is FRAMED, which `toSandbox` did not do until the cold start made it visible: from A6's
    // fitted view the circle is a small mark off to one side.
    const { app } = mountCold();
    const framed = app.currentState().view.halfHeight;
    app.actions().toSandbox();
    const state = app.currentState();
    expect(state.mode).toBe("sandbox");
    expect(state.expr).toBe("1/z");
    expect(state.contourSource?.template).toBe("circle");
    expect(state.view.halfHeight, "the sandbox kept the record's camera").not.toBe(framed);
    // The circle has radius 1.5, so a frame of it is nowhere near A6's R = 4.
    expect(state.view.halfHeight).toBeLessThan(framed);
  });

  it("clears the session's transient half on applyState — M7.4's defect, structurally", () => {
    // **Testing `resetTransient` alone let a sweep through.** The helper is right and was always
    // right; what M7.4 actually found is that `applyState` did not CALL it, so a restored state
    // showed a grading that unmasked the very rung it was meant to mask. The property is about the
    // door, so it is tested at the door.
    const { app } = mount();
    const s = app.session();
    s.gesture = "pen";
    s.drillGraded = true;
    s.hover = { z: [0, 1], piece: "arc", handle: 0 };
    s.rails = { left: true, right: false };
    app.applyState({ ...app.currentState(), expr: "1/(1+z^2)" });
    expect(s.gesture).toBe("none");
    expect(s.drillGraded).toBe(false);
    expect(s.hover.piece).toBeNull();
    // The reader's own preferences are not theirs to lose, so a folded rail survives a link that
    // stays in the same MODE. A link that changes the mode resets the fold instead — the test below
    // — because a worked example whose left rail arrives open is not the one that was shared.
    expect(s.rails).toEqual({ left: true, right: false });
  });

  it("resets the fold when the link changes the MODE, and only then", () => {
    const { app } = mount();
    const s = app.session();
    s.rails = { left: true, right: true };
    // Same mode: the reader keeps what they folded.
    app.applyState({ ...app.currentState(), expr: "1/(1+z^2)" });
    expect(s.rails).toEqual({ left: true, right: true });
    // Into a worked example: the left rail collapses, because that is what the mode IS.
    app.applyState({ ...app.currentState(), workedExample: true });
    expect(s.rails).toEqual({ left: true, right: false });
    // And back out of it, the layout is Explore's again rather than the worked example's.
    app.applyState({ ...app.currentState(), workedExample: false });
    expect(s.rails).toEqual({ left: false, right: false });
  });

  it("re-renders through one door, keeping the card nodes it already built", () => {
    const { root, app } = mount();
    const before = q(root, '[data-card="integrand"]');
    app.applyState({ ...app.currentState(), expr: "1/(1+z^2)" });
    expect(q(root, '[data-card="integrand"]')).toBe(before);
    expect(app.currentState().expr).toBe("1/(1+z^2)");
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The stage controller — M8 step 1.3.
//
// Driven through the controller rather than through the DOM where the DOM adds nothing: jsdom has
// no `PointerEvent` and no layout, so a synthesised drag is a synthesised drag either way, and the
// property under test is what the GESTURE does to the state. The browser suite drives real pointers
// over a real layout, which is where a hit test can be wrong.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** jsdom has no pointer capture; the controller calls it on every gesture. */
function stubPointer(el: Element): void {
  const e = el as Element & Record<string, unknown>;
  e.setPointerCapture = (): void => {};
  e.releasePointerCapture = (): void => {};
  e.hasPointerCapture = (): boolean => false;
}

/**
 * A pointer event jsdom will dispatch. `PointerEvent` does not exist there; the fields do.
 *
 * `extra` goes into the CONSTRUCTOR, not onto the instance: `altKey` and its siblings are getter-only
 * on `MouseEvent`, so assigning them throws rather than being ignored. `pointerId` is not a
 * `MouseEvent` field at all, which is why that one is assigned.
 */
function pointer(type: string, x: number, y: number, extra: Record<string, unknown> = {}): Event {
  const ev = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, buttons: 1, ...extra });
  Object.assign(ev, { pointerId: 1 });
  return ev;
}

/**
 * The stage, at a REAL size.
 *
 * jsdom performs no layout, so `clientWidth`/`clientHeight` are 0 and `StageView.viewport()`'s
 * `|| 1` guard returns a 1×1 box — in which `scale()` is enormous, the 11 px grab radius covers the
 * whole plane, and every `pointerdown` lands on a handle. M7.2 found the same class of artefact in
 * the browser harness (a suite aimed at an unsized stage is aiming at an artefact) and step 1.1 found
 * the same `|| 1` magnifying the pen's geometry by 4. So the size is stubbed rather than the
 * assertion weakened: 900 × 600 is the stage's own box at the shell's default rail widths.
 */
/**
 * Wait for the coalesced draw.
 *
 * The overlay is painted in `StageView.drawNow`, which `schedule` coalesces onto a frame — a drag
 * asks far more often than a frame can answer, and a chip re-created per pointer move would be a
 * fresh node for the accessibility tree sixty times a second. So a test that asserts a chip has to
 * let the frame run; asserting synchronously would be asserting that the coalescing is absent.
 */
const frame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()));

function mountStage(): { root: HTMLElement; app: ReturnType<typeof mountShell2>; ink: HTMLCanvasElement } {
  const { root, app } = mount();
  const host = q(root, ".stage2");
  for (const [prop, value] of [["clientWidth", 900], ["clientHeight", 600]] as const) {
    Object.defineProperty(host, prop, { configurable: true, get: () => value });
  }
  const ink = q<HTMLCanvasElement>(root, "canvas.ink");
  stubPointer(ink);
  return { root, app, ink };
}

describe("the pen, through the controller", () => {
  it("places a vertex per click and Backspace takes one back", () => {
    const { app, ink } = mountStage();
    const pen = app.stage();
    pen.penStart();
    for (const [x, y] of [[10, 10], [40, 10], [40, 40]]) ink.dispatchEvent(pointer("pointerdown", x, y));
    const session = app.session() as { pen: { nodes: unknown[] } | null };
    expect(session.pen?.nodes.length).toBe(3);
    pen.penBack();
    expect(session.pen?.nodes.length).toBe(2);
  });

  it("WILL NOT CLOSE on two vertices — a degenerate loop the ledger cannot read", () => {
    const { app, ink } = mountStage();
    const before = app.currentState().contour;
    app.stage().penStart();
    ink.dispatchEvent(pointer("pointerdown", 10, 10));
    ink.dispatchEvent(pointer("pointerdown", 40, 10));
    // A third click back on the FIRST vertex would close a path of three; on a path of two it must
    // place a vertex instead.
    ink.dispatchEvent(pointer("pointerdown", 10, 10));
    const session = app.session() as { pen: { nodes: unknown[] } | null };
    expect(session.pen, "the pen was put away, so something committed").not.toBeNull();
    expect(app.currentState().contour, "the contour changed").toBe(before);
  });

  it("Escape keeps the contour that was already there", () => {
    const { app, ink } = mountStage();
    const before = app.currentState().contour;
    app.stage().penStart();
    ink.dispatchEvent(pointer("pointerdown", 10, 10));
    ink.dispatchEvent(pointer("pointerdown", 40, 10));
    ink.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(app.session().pen).toBeNull();
    expect(app.currentState().contour).toBe(before);
  });

  it("Enter commits a drawn path, and the drawn contour has NO recipe", () => {
    const { app, ink } = mountStage();
    const before = app.currentState().contour;
    app.stage().penStart();
    for (const [x, y] of [[10, 10], [60, 10], [60, 60]]) ink.dispatchEvent(pointer("pointerdown", x, y));
    ink.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const after = app.currentState();
    expect(app.session().pen, "the pen stayed out after committing").toBeNull();
    expect(after.contour).not.toBe(before);
    // `contourSource` is NULL for a drawn contour — the truth about it rather than a gap. M6.2's
    // codec reads the vertices back out of the geometry instead.
    expect(after.contourSource).toBeNull();
    expect(after.sandboxContour).toBe(after.contour);
  });

  it("is PUT AWAY by applyState — M7.4's defect, at the door", () => {
    const { app, ink } = mountStage();
    app.stage().penStart();
    ink.dispatchEvent(pointer("pointerdown", 10, 10));
    ink.dispatchEvent(pointer("pointerdown", 40, 10));
    expect(app.session().pen).not.toBeNull();
    app.applyState({ ...app.currentState(), expr: "1/(1+z^2)" });
    // A half-drawn path is not a state worth restoring, and leaving it out would let a click in a
    // mode with no pen controls place a vertex the reader never asked for.
    expect(app.session().pen).toBeNull();
    expect(app.session().gesture).toBe("none");
  });

  // **M7.4's finding, reopened through two more doors** — the review's 4.3. M7.4 put the pen away on
  // leaving the sandbox and on every `applyState`; folding the left rail is neither, and neither is
  // the mode control. Both take the Contour card — which is where Close / Undo / Cancel live — off
  // screen while `session.pen` stays non-null, and `pointerdown` takes the pen's click BEFORE any
  // grab test, deliberately. So the reader's next click on the stage placed a vertex into a path
  // with no visible controls and Enter committed it.
  //
  // The card's absence is asserted first, because that is what makes the armed pen unreachable
  // rather than merely untidy; then the click, because "put away" has to mean the stage is a stage
  // again and not just that a field is null.
  const stillArmed = (app: ReturnType<typeof mountShell2>): string =>
    `pen ${app.session().pen === null ? "away" : "out"}, gesture ${app.session().gesture}`;

  it("is put away when the rail holding its controls FOLDS", () => {
    const { root, app, ink } = mountStage();
    app.stage().penStart();
    ink.dispatchEvent(pointer("pointerdown", 10, 10));
    ink.dispatchEvent(pointer("pointerdown", 40, 10));
    expect(app.session().pen).not.toBeNull();
    expect(root.querySelector('[data-card="contour"]'), "the card is on screen while the pen is out").not.toBeNull();

    app.actions().setRail("left", true);
    expect(root.querySelector('[data-card="contour"]'), "a folded rail draws its name and its toggle only").toBeNull();
    expect(stillArmed(app)).toBe("pen away, gesture none");

    // And the stage is a stage again: this click grabbed or panned before the pen existed, and must
    // do so again rather than placing a third vertex into a path nothing can finish.
    const before = app.currentState().contour;
    ink.dispatchEvent(pointer("pointerdown", 70, 70));
    expect(`${stillArmed(app)}, contour ${app.currentState().contour === before ? "unchanged" : "MOVED"}`).toBe(
      "pen away, gesture view, contour unchanged",
    );
  });

  it("is put away by a change of MODE, which folds that same rail from the bar", () => {
    const { root, app, ink } = mountStage();
    app.stage().penStart();
    ink.dispatchEvent(pointer("pointerdown", 10, 10));
    ink.dispatchEvent(pointer("pointerdown", 40, 10));
    app.actions().setMode("worked");
    expect(root.querySelector('[data-card="contour"]')).toBeNull();
    expect(stillArmed(app)).toBe("pen away, gesture none");
  });

  // **Escape had been bound on the ink canvas alone**, so the one key that abandons a path did
  // nothing once focus had moved — and the way a reader loses the pen's controls is by clicking the
  // fold toggle, which puts focus on a button. The shell's own document listener carries it now;
  // `modal.ts` stops Escape on its backdrop, so a dialog over the stage still shuts itself.
  it("Escape abandons the path from wherever focus is, not only on the canvas", () => {
    const { app, ink } = mountStage();
    const before = app.currentState().contour;
    app.stage().penStart();
    ink.dispatchEvent(pointer("pointerdown", 10, 10));
    ink.dispatchEvent(pointer("pointerdown", 40, 10));
    // On the DOCUMENT, not on `ink` — the event the controller's own handler never sees.
    const took = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.dispatchEvent(took);
    expect(app.session().pen).toBeNull();
    expect(app.currentState().contour).toBe(before);
    expect(took.defaultPrevented, "the key the app acted on was not claimed").toBe(true);

    // **And with no path open Escape is NOT the app's**, which is what the guard buys and what a
    // mutation sweep found nothing asserting: `penStop()` on a null pen is a visible no-op, so
    // dropping the guard changes only whether the app CLAIMS the key. Escape belongs to whatever
    // else the page is doing — a dialog, a `<select>`, the browser's own find bar — and a handler
    // that calls `preventDefault` on every press has taken it from all of them.
    const left = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.dispatchEvent(left);
    expect(left.defaultPrevented, "Escape was claimed with no path to abandon").toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The pen's two ORIGIN snaps — M8 step 4.2.
//
// **What they are for.** `ledger.ts`'s `arcRadius` refuses an arc whose centre is not EXACTLY the
// origin, because every certified arc bound reasons on `|z| = R` about 0 (M4.6c). So a drawn
// semicircle certified nothing: a reader dragging the apex of a chord from `(−8, 0)` to `(8, 0)` to
// `(0.3, 7.6)` gets a bulge of `7.6`, a `k` of `−0.4105`, and a centre at `(0, −0.4105)`. The engine
// was right and the tool could not reach it. The mirror snap makes the base exactly antipodal and
// the bow snap then lands the centre exactly on 0 — one feature in two gestures, which is why the
// last test here draws the whole semicircle and asks the ledger.
//
// Every number below is in the 900 × 600 stage at the default view (centre 0, half-height 2), so a
// plot unit is 150 px and the 11 px grab radius is 0.0733 plot units. The offsets are chosen
// against that, and each test says which mutant its assertion kills.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** The stage `mountStage` stubs, for reading a pointer position back as the plane sees it. */
const STAGE_BOX = { width: 900, height: 600 };

/** Where a pointer at these stage pixels lands BEFORE any snap — what a suppressed snap must give. */
function rawPlot(app: ReturnType<typeof mountShell2>, px: number, py: number): readonly [number, number] {
  return screenToPlot(px, py, app.currentState().view, STAGE_BOX);
}

/** The nodes the pen is currently holding. */
function penNodes(app: ReturnType<typeof mountShell2>): readonly PenNode[] {
  return app.session().pen?.nodes ?? [];
}

describe("the pen's snaps to the origin", () => {
  it("snaps to the REFLECTION of a placed vertex, exactly", () => {
    const { app, ink } = mountStage();
    app.stage().penStart();
    // A vertex off both axes, so the mirror is the only snap that can fire: on the real axis the
    // axis snap agrees about `y` and the test would be weaker by exactly the coordinate it is about.
    const [ax, ay] = screenOf(app, [-1.2, 0.8]);
    ink.dispatchEvent(pointer("pointerdown", ax, ay));
    const [mx, my] = screenOf(app, [1.2, -0.8]);
    // 4 px right and 3 px down of the mirror: 5 px, inside the 11 px radius.
    ink.dispatchEvent(pointer("pointerdown", mx + 4, my + 3));
    const [a, b] = penNodes(app);
    // **Exact negation, not a rounded one** — the mutant is a mirror that lands "near enough",
    // which is the whole defect this feature exists to remove. `toBe` is `Object.is`.
    expect(b.at[0]).toBe(-a.at[0]);
    expect(b.at[1]).toBe(-a.at[1]);
    expect(app.session().pen?.snap).toBe("the reflection of a vertex in the origin");
    // And it is not vacuous: the pointer was somewhere else, so the snap MOVED the vertex. Kills a
    // "snap" that names the constraint and places the raw point anyway (`penClick` could do that,
    // and M7.2's sweep found exactly that survivor on the first-vertex snap).
    const raw = rawPlot(app, mx + 4, my + 3);
    expect(Math.hypot(raw[0] - b.at[0], raw[1] - b.at[1])).toBeGreaterThan(0.01);
  });

  it("does NOT fire outside the grab radius", () => {
    const { app, ink } = mountStage();
    app.stage().penStart();
    const [ax, ay] = screenOf(app, [-1.2, 0.8]);
    ink.dispatchEvent(pointer("pointerdown", ax, ay));
    const [mx, my] = screenOf(app, [1.2, -0.8]);
    // 20 px away, comfortably outside 11 — and off both axes, so nothing else fires either.
    ink.dispatchEvent(pointer("pointerdown", mx + 14, my + 14));
    const [, b] = penNodes(app);
    const raw = rawPlot(app, mx + 14, my + 14);
    // Kills a mirror snap with no distance test at all, and one measured against a tolerance of its
    // own rather than the shared `tolerance()`.
    expect(b.at[0]).toBe(raw[0]);
    expect(b.at[1]).toBe(raw[1]);
    expect(app.session().pen?.snap).toBeNull();
  });

  it("is suppressed by the free modifier, like every other snap", () => {
    const { app, ink } = mountStage();
    app.stage().penStart();
    const [ax, ay] = screenOf(app, [-1.2, 0.8]);
    ink.dispatchEvent(pointer("pointerdown", ax, ay));
    const [mx, my] = screenOf(app, [1.2, -0.8]);
    ink.dispatchEvent(pointer("pointerdown", mx + 4, my + 3, { altKey: true }));
    const [, b] = penNodes(app);
    const raw = rawPlot(app, mx + 4, my + 3);
    // Kills a mirror snap added ABOVE `snapTo`'s `if (free)` guard, or one written into `penClick`
    // where the modifier is not consulted — a reader who cannot place a vertex where they meant to
    // has lost the tool.
    expect(b.at[0]).toBe(raw[0]);
    expect(b.at[1]).toBe(raw[1]);
    expect(app.session().pen?.snap).toBeNull();
  });

  /**
   * The base `[−R, R]` both bow tests start from, drawn the way a reader draws it.
   *
   * Right end first, so the arc that follows runs right-to-left over the top — counter-clockwise,
   * which is the traversal every worked semicircle in the gallery has.
   */
  function drawBase(app: ReturnType<typeof mountShell2>, ink: HTMLCanvasElement): void {
    app.stage().penStart();
    const [rx, ry] = screenOf(app, [1.5, 0]);
    ink.dispatchEvent(pointer("pointerdown", rx, ry));
    const [lx, ly] = screenOf(app, [-1.5, 0]);
    ink.dispatchEvent(pointer("pointerdown", lx + 5, ly + 2));
  }

  it("snaps the BOW to an arc centred at the origin — exactly, and says so", async () => {
    const { root, app, ink } = mountStage();
    drawBase(app, ink);
    const [a, b] = penNodes(app);
    expect(b.at[0], "the base is antipodal, which is the mirror snap's doing").toBe(-a.at[0]);
    // Drag the apex to about `(0, 1.45)`: a bulge of 1.4467 where the origin wants 1.5, so the snap
    // has 0.053 to travel and the 0.0733 radius to do it in.
    const apex = screenOf(app, [0, 1.45]);
    ink.dispatchEvent(pointer("pointermove", apex[0], apex[1]));
    const bowed = penNodes(app)[0];
    const bulge = bowed.bulge ?? 0;
    const arc = arcThroughBulge(bowed.at, b.at, bulge);
    if (arc === null) throw new Error("the drag left a segment");
    // **THE CLAIM, AND THE REASON THE SNAP EXISTS**: `toBe(0)`, not `toBeCloseTo`. `arcRadius` tests
    // `center[0] !== 0 || center[1] !== 0`, so a centre of `1e-17` is refused exactly as `−0.41` is,
    // and a snap that merely got close would have bought nothing at all.
    expect(arc.center[0]).toBe(0);
    expect(arc.center[1]).toBe(0);
    // The closed form for an antipodal base: the bulge IS the half-chord, so the arc is a
    // semicircle. Kills a snap that lands on the other root (which is `+h` here, the same circle
    // bowed the other way) while the drag was plainly on this side.
    const half = Math.hypot(b.at[0] - bowed.at[0], b.at[1] - bowed.at[1]) / 2;
    expect(bulge).toBe(-half);
    // Not vacuous: the pointer asked for a different number, and the snap moved it. Kills the
    // do-nothing mutant, whose centre is `(0, −0.054)` — plausible on screen and refused by the
    // engine, which is the state of the world this step is fixing.
    expect(Math.abs(Math.abs(bulge) - 1.45)).toBeGreaterThan(0.01);
    // Research 07 rule 5: named, and named BESIDE THE POINTER rather than only in the session, or a
    // reader watching the apex jump is not told why.
    expect(app.session().pen?.snap).toBe("an arc centred at the origin, $|z| = R$");
    await frame();
    expect(q(root, ".overlay2 .stageChip.snap").textContent ?? "").toContain("centred at the origin");
  });

  it("is suppressed by the free modifier, and then the arc is centred nowhere in particular", () => {
    const { app, ink } = mountStage();
    drawBase(app, ink);
    const b = penNodes(app)[1];
    const apex = screenOf(app, [0, 1.45]);
    ink.dispatchEvent(pointer("pointermove", apex[0], apex[1], { altKey: true }));
    const bowed = penNodes(app)[0];
    const bulge = bowed.bulge ?? 0;
    // The raw measurement, through the same function the gesture uses.
    expect(bulge).toBe(bulgeFromApex(bowed.at, b.at, rawPlot(app, apex[0], apex[1])));
    const arc = arcThroughBulge(bowed.at, b.at, bulge);
    if (arc === null) throw new Error("the drag left a segment");
    // Kills a bow snap that ignores `free` — and the number says what the reader loses by holding
    // it: a centre 0.05 off the origin, which no arc bound in the app will read.
    expect(Math.hypot(arc.center[0], arc.center[1])).toBeGreaterThan(0.01);
    expect(app.session().pen?.snap).toBeNull();
  });

  it("leaves a SHALLOW arc alone — the snap has a grab radius like every other", () => {
    // Kills a bow snap with no distance test: every drag would be yanked into a semicircle, and a
    // reader could not draw a shallow arc at all. Measured here as 0.7 plot units of travel against
    // a 0.073 radius — an order of magnitude outside, which is an ordinary drag and not a corner case.
    const { app, ink } = mountStage();
    drawBase(app, ink);
    const b = penNodes(app)[1];
    const apex = screenOf(app, [0, 0.8]);
    ink.dispatchEvent(pointer("pointermove", apex[0], apex[1]));
    const bowed = penNodes(app)[0];
    expect(bowed.bulge).toBe(bulgeFromApex(bowed.at, b.at, rawPlot(app, apex[0], apex[1])));
    expect(app.session().pen?.snap).toBeNull();
  });

  it("takes the root the DRAG is nearer, when the chord puts both in reach", () => {
    // The two roots `k₀ ± R` are the two arcs the chord cuts its circle into, one bowing to each
    // side, so which one the reader means is the side their drag is on. Kills a snap that takes the
    // far root, or simply the first.
    //
    // **Reachable only just.** The roots are `2R` apart, so both are inside the grab radius only
    // when the circle is SMALLER than that radius on screen — and then the origin's own snap is
    // within reach of both endpoints and takes the first click before the base exists. So the first
    // vertex goes down with the modifier held (raw, unsnapped) and the second on the mirror, which
    // is checked before the origin: an odd gesture, and the only one that puts a reader in front of
    // this choice at all.
    const { app, ink } = mountStage();
    app.applyState({ ...app.currentState(), view: { center: [0, 0], halfHeight: 50 } });
    app.stage().penStart();
    const start = screenOf(app, [1.4, 0]);
    ink.dispatchEvent(pointer("pointerdown", start[0], start[1], { altKey: true }));
    const placed = penNodes(app)[0].at;
    const mirror = screenOf(app, [-placed[0], -placed[1]]);
    ink.dispatchEvent(pointer("pointerdown", mirror[0], mirror[1]));
    const [a, b] = penNodes(app);
    expect(b.at[0], "the base is antipodal, so both roots are `±h`").toBe(-a.at[0]);
    const half = Math.hypot(b.at[0] - a.at[0], b.at[1] - a.at[1]) / 2;
    const tol = 11 * scale(app.currentState().view, STAGE_BOX);
    const apex = screenOf(app, [0, -0.2]);
    const raw = bulgeFromApex(a.at, b.at, rawPlot(app, apex[0], apex[1]));
    expect(raw, "the drag is on the positive side, which is the side it must keep").toBeGreaterThan(0);
    // Asserted rather than assumed: unless BOTH roots are in reach the choice is made by the grab
    // radius and this test says nothing about the ordering.
    expect(Math.abs(half - raw)).toBeLessThan(tol);
    expect(Math.abs(-half - raw)).toBeLessThan(tol);
    ink.dispatchEvent(pointer("pointermove", apex[0], apex[1]));
    expect(penNodes(app)[0].bulge).toBe(half);
  });

  it("reaches a circle about the origin from a chord that does not pass near it", () => {
    // **The snap is not "make it a semicircle".** The condition is that the two ends are equidistant
    // from the origin — the statement that some circle about 0 passes through both — and the chord
    // `(1, 1) → (−1, 1)` satisfies it without being a diameter. There `k₀` is 1 rather than a signed
    // zero, so this is the only test in the file in which `k₀ = −(M·n)` carries any information:
    // kills the dropped minus sign, and kills `R = √(k₀² + h²)` reduced to `h`. Both mutants make
    // the roots miss, the built arc's centre fails the check, and the snap silently stops firing.
    const { app, ink } = mountStage();
    app.stage().penStart();
    const start = screenOf(app, [1, 1]);
    ink.dispatchEvent(pointer("pointerdown", start[0], start[1]));
    const end = screenOf(app, [-1, 1]);
    ink.dispatchEvent(pointer("pointerdown", end[0], end[1]));
    const [a, b] = penNodes(app);
    expect(Math.hypot(a.at[0], a.at[1]), "the ends are equidistant from 0").toBe(Math.hypot(b.at[0], b.at[1]));
    // Not antipodal — the midpoint is `(0, 1)` and nowhere near the origin, which is what makes
    // `k₀` carry information here where an antipodal base leaves it a signed zero.
    expect(Math.hypot(a.at[0] + b.at[0], a.at[1] + b.at[1])).toBeGreaterThan(1);
    // Bow it the LONG way round, under the origin: the major arc of `|z| = √2`, bulge `k₀ + R =
    // 2.414`. **Measured, and the reason it is this root and not the other**: exactness is a
    // property of the root as well as of the chord, and for this chord the minor root's arc lands
    // at `(0, 2.2e-16)` — so the snap declines it, which is the honest answer (a bound would be
    // refused there anyway) and not a gap. Over 20,000 random chords mirrored in an axis, 26% of
    // roots come out exact; over antipodal ones, 100% of 40,000. That is why the semicircle above —
    // the base the mirror snap builds — is the case the feature is FOR.
    const apex = screenOf(app, [0, -1.36]);
    ink.dispatchEvent(pointer("pointermove", apex[0], apex[1]));
    const bowed = penNodes(app)[0];
    const arc = arcThroughBulge(bowed.at, b.at, bowed.bulge ?? 0);
    if (arc === null) throw new Error("the drag left a segment");
    expect(arc.center[0]).toBe(0);
    expect(arc.center[1]).toBe(0);
    expect(arc.radius).toBeCloseTo(Math.SQRT2, 12);
    expect(app.session().pen?.snap).toBe("an arc centred at the origin, $|z| = R$");
  });

  it("does not DROP what the reader declared about the piece it is bowing", () => {
    // A node carries a role and a lemma as well as a position (step 4.1), and a drag rebuilds the
    // node. Kills `nodes[i] = { at: from.at, bulge }`, which loses both — silently, and only for the
    // piece the reader happened to bow, which is the one they were paying most attention to.
    const { app, ink } = mountStage();
    drawBase(app, ink);
    const draft = app.session().pen;
    if (draft === null) throw new Error("the pen is away");
    draft.nodes = [{ ...draft.nodes[0], role: "vanish", lemma: "L1" }, draft.nodes[1]];
    const apex = screenOf(app, [0, 1.45]);
    ink.dispatchEvent(pointer("pointermove", apex[0], apex[1]));
    const bowed = penNodes(app)[0];
    expect(bowed.role).toBe("vanish");
    expect(bowed.lemma).toBe("L1");
  });

  it("does not fire where the origin is UNREACHABLE — and the base cannot reach it, by construction", () => {
    const { app, ink } = mountStage();
    app.stage().penStart();
    const [rx, ry] = screenOf(app, [2, 0]);
    ink.dispatchEvent(pointer("pointerdown", rx, ry));
    // The far end placed with the modifier down, so the mirror snap does not make it symmetric: the
    // base runs `2 → −1.5`, whose perpendicular bisector is `x = 0.25` and therefore misses 0.
    const [lx, ly] = screenOf(app, [-1.5, 0]);
    ink.dispatchEvent(pointer("pointerdown", lx, ly, { altKey: true }));
    const [a, b] = penNodes(app);
    expect(Math.hypot(a.at[0], a.at[1])).not.toBe(Math.hypot(b.at[0], b.at[1]));
    // **By construction, not by hoping**: EVERY bulge puts the centre on that bisector, so no value
    // the snap could have chosen would have been honest. Swept rather than argued, because the claim
    // is about the whole family and one sample would only say the gesture missed.
    let nearest = Infinity;
    for (let i = -400; i <= 400; i++) {
      const arc = arcThroughBulge(a.at, b.at, i / 100);
      if (arc !== null) nearest = Math.min(nearest, Math.hypot(arc.center[0], arc.center[1]));
    }
    expect(nearest).toBeGreaterThan(0.2);
    // Now drag to within the grab radius of the bulge the algebra WOULD offer — `k₀ ± R` is `±1.75`
    // here — so the test is aimed at the mutant rather than merely far from it. Without the built
    // arc's centre being checked the snap fires, names the origin, and hands the reader an arc
    // centred at `(0.25, 0)`: a bound refused with a sentence about somebody else's dogbone.
    const apex = screenOf(app, [0.25, 1.7]);
    ink.dispatchEvent(pointer("pointermove", apex[0], apex[1]));
    const bowed = penNodes(app)[0];
    const bulge = bowed.bulge ?? 0;
    expect(Math.abs(Math.abs(bulge) - 1.75), "the drag is not even in range of the mutant").toBeLessThan(
      11 * scale(app.currentState().view, STAGE_BOX),
    );
    expect(bulge).toBe(bulgeFromApex(bowed.at, b.at, rawPlot(app, apex[0], apex[1])));
    expect(app.session().pen?.snap).toBeNull();
  });

  it("DRAWS A SEMICIRCLE THE LEDGER CERTIFIES — the two snaps, end to end", () => {
    // The payoff, and the one test that would have caught the whole gap before this step: three
    // clicks and a drag, and the arc earns an ML bound.
    //
    // **The ledger is driven directly rather than through `app.resolution()`** for one reason: a
    // drawn piece arrives `free`, and it is step 4.1's card — not the pen — that lets a reader call
    // it a vanishing one. Setting the role on the committed contour is what that card does; routing
    // the assertion through the card as well would make a geometry test fail whenever the card moved.
    const { app, ink } = mountStage();
    app.stage().penStart();
    const right = screenOf(app, [1.5, 0]);
    ink.dispatchEvent(pointer("pointerdown", right[0], right[1]));
    const left = screenOf(app, [-1.5, 0]);
    ink.dispatchEvent(pointer("pointerdown", left[0] + 5, left[1] + 2));
    const apex = screenOf(app, [0, 1.45]);
    ink.dispatchEvent(pointer("pointermove", apex[0], apex[1]));
    // A third vertex on the way back, because Enter closes a path of three and not of two.
    const mid = screenOf(app, [0, 0]);
    ink.dispatchEvent(pointer("pointerdown", mid[0], mid[1], { buttons: 0 }));
    ink.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    const drawn = app.currentState().contour;
    const arcs = drawn.pieces.filter((piece) => piece.geom.kind === "arc");
    expect(arcs, "the drag left exactly one arc, and the two segments are the diameter").toHaveLength(1);
    const contour = {
      ...drawn,
      pieces: drawn.pieces.map((piece) => (piece.geom.kind === "arc" ? { ...piece, role: "vanish" as const } : piece)),
    };
    const ast = parse("1/(1+z^2)");
    const fn = makeComplexFn(ast);
    const rows = analyse({
      ast,
      f: (z: readonly [number, number]) => fn(z as [number, number], [0, 0]) as readonly [number, number],
      poles: findPoles(ast),
      contour,
    }).ledger.rows;
    const row = rows.find((r) => r.pieceId === arcs[0].id && r.constraint === "KILL");
    if (row === undefined) throw new Error("the arc got no disposal row at all");
    // **The verdict is the assertion.** With the snaps the arc is `|z| = 3/2` about the origin and
    // the ML estimate discharges it; without them the same three clicks and the same drag produce
    // the row below instead. Kills BOTH snaps at once — drop either and the base stops being
    // antipodal or the bulge stops being the half-chord, and the centre is no longer 0.
    expect(row.status).toBe("satisfied");
    // The sentence lives in the certificate's METHOD — what was done to establish the row — which
    // is where the refusal below prints it, so the two assertions are about the same field.
    expect(row.evidence.method).not.toContain("centred elsewhere");
    // The honest-labelling guardrail, read off the row: a RIGOROUS BOUND, not an estimate and not
    // "nothing was established" — which is the `?` the refusing twin below carries.
    expect(row.evidence.level).toBe("≤");
  });

  it("and WITHOUT the snaps the same gesture certifies nothing — the contrast that makes the last test mean something", () => {
    // The same three clicks and the same drag with the modifier held throughout. A test that only
    // showed the certified case would pass for an app that certified every arc it was handed.
    const { app, ink } = mountStage();
    app.stage().penStart();
    const right = screenOf(app, [1.5, 0]);
    ink.dispatchEvent(pointer("pointerdown", right[0], right[1], { altKey: true }));
    const left = screenOf(app, [-1.5, 0]);
    ink.dispatchEvent(pointer("pointerdown", left[0] + 5, left[1] + 2, { altKey: true }));
    const apex = screenOf(app, [0, 1.45]);
    ink.dispatchEvent(pointer("pointermove", apex[0], apex[1], { altKey: true }));
    const mid = screenOf(app, [0, 0]);
    ink.dispatchEvent(pointer("pointerdown", mid[0], mid[1], { altKey: true, buttons: 0 }));
    ink.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    const drawn = app.currentState().contour;
    const arc = drawn.pieces.find((piece) => piece.geom.kind === "arc");
    if (arc === undefined) throw new Error("the drag left no arc");
    const contour = {
      ...drawn,
      pieces: drawn.pieces.map((piece) => (piece.id === arc.id ? { ...piece, role: "vanish" as const } : piece)),
    };
    const ast = parse("1/(1+z^2)");
    const fn = makeComplexFn(ast);
    const rows = analyse({
      ast,
      f: (z: readonly [number, number]) => fn(z as [number, number], [0, 0]) as readonly [number, number],
      poles: findPoles(ast),
      contour,
    }).ledger.rows;
    const row = rows.find((r) => r.pieceId === arc.id && r.constraint === "KILL");
    if (row === undefined) throw new Error("the arc got no disposal row at all");
    expect(row.status).toBe("unknown");
    expect(row.evidence.method).toContain("centred elsewhere");
    expect(row.evidence.level, "nothing was established, and the row says so").toBe("?");
  });
});

/** Plot coordinates to the stage-local pixels a jsdom pointer event carries (the rect is all zeros). */
function screenOf(app: ReturnType<typeof mountShell2>, z: readonly [number, number]): readonly [number, number] {
  return plotToScreen(z[0], z[1], app.currentState().view, { width: 900, height: 600 });
}

describe("the stage's gestures", () => {
  it("clamps a wheel zoom, so a flick cannot lose the plane", () => {
    // **It asserted the half-height and nothing else, and the plane was lost anyway.** `zoomAt`
    // folds the factor into the CENTRE as well, and `clampView` passed the centre through — so this
    // event left the camera 1e64 from the origin at a perfectly ordinary half-height of 200, which
    // is the reader looking at nothing. It went unnoticed for three steps and then polluted this
    // file, because `syncHash` minted a permalink to that camera and the next mount opened it.
    const { app, ink } = mountStage();
    const deep = new WheelEvent("wheel", { deltaY: -100000, bubbles: true, cancelable: true });
    ink.dispatchEvent(deep);
    expect(app.currentState().view.halfHeight).toBeGreaterThanOrEqual(0.05);
    const far = new WheelEvent("wheel", { deltaY: 100000, bubbles: true, cancelable: true });
    ink.dispatchEvent(far);
    const { center, halfHeight } = app.currentState().view;
    expect(halfHeight).toBeLessThanOrEqual(200);
    // The clause the name always promised. A bound rather than the exact centre, because where one
    // clamped flick lands is arithmetic nobody should have to reproduce to change the constant —
    // what must hold is that the reader is still somewhere a contour can be.
    // Per axis, which is what the clamp promises — the magnitude bound is `CENTER_MAX·√2`.
    expect(Math.abs(center[0]), "a flick lost the plane").toBeLessThanOrEqual(CENTER_MAX);
    expect(Math.abs(center[1]), "a flick lost the plane").toBeLessThanOrEqual(CENTER_MAX);
    expect(Number.isFinite(center[0]) && Number.isFinite(center[1])).toBe(true);
  });

  it("keeps a flick NEAR where the reader was, which the plane bound alone does not", () => {
    // **The two clamps overlap, and this is the half only the FACTOR one holds.** With the centre
    // bounded, dropping the factor clamp still leaves the camera inside the plane — `clampView`
    // catches the 1e64 and pulls it to the corner — so "a flick cannot lose the plane" passes
    // either way and says nothing about the factor. What it cannot pass is this: a gesture zooms,
    // it does not teleport. Measured by the sweep, which is how the overlap showed at all.
    const { app, ink } = mountStage();
    app.applyState({ ...app.currentState(), view: { center: [1, 1], halfHeight: 2 } });
    const before = app.currentState().view.center;
    ink.dispatchEvent(new WheelEvent("wheel", { deltaY: 100000, bubbles: true, cancelable: true }));
    const after = app.currentState().view.center;
    // A bound in SCREENS at the widest view, rather than a distance: what a reader loses is their
    // place, and a place is measured against what is on screen.
    const screens = Math.hypot(after[0] - before[0], after[1] - before[1]) / 200;
    expect(screens, "a single wheel event moved the reader off their own page").toBeLessThan(2);
  });

  it("keeps ONE wheel notch a notch, so the clamp is not the only thing holding the plane", () => {
    // The factor is clamped before the zoom, so the ordinary case must be untouched: a real notch
    // is `deltaY` of about ±100, well inside `[1/4, 4]`, and clamping it there would turn every
    // scroll into a jump. Measured against `zoomAt`'s own arithmetic rather than a literal.
    const { app, ink } = mountStage();
    const before = app.currentState().view.halfHeight;
    ink.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }));
    const after = app.currentState().view.halfHeight;
    expect(after / before).toBeCloseTo(Math.exp(100 * 0.0015), 10);
  });

  it("fits the contour into the view, from the TOOLBAR as well as the controller", () => {
    const { root, app } = mountStage();
    app.applyState({ ...app.currentState(), view: { center: [500, 500], halfHeight: 0.1 } });
    // Through the rendered button, which is how a reader who does not know about the double-click
    // gets back from a zoom into nothing.
    q<HTMLButtonElement>(root, '[data-testid="fit"]').click();
    const v = app.currentState().view;
    // The default contour is the circle |z| = 1.5 about the origin, so a fit lands on it.
    expect(Math.hypot(v.center[0], v.center[1])).toBeLessThan(0.5);
    expect(v.halfHeight).toBeGreaterThan(1);
    expect(v.halfHeight).toBeLessThan(10);
  });

  it("names what is held ON THE STAGE, not only in the live region", async () => {
    // The plan's "a **visible label** of what is held (a small chip near the handle, not only the
    // live region)". A live region announces once and is then gone; a reader who tabs away and back
    // — or who is not using a screen reader at all — has no way left to ask what Enter selected.
    const { root, app } = mountStage();
    await frame();
    expect(root.querySelector(".overlay2 .stageChip.held"), "nothing is held yet").toBeNull();
    app.stage().onCanvasKey({ kind: "commit" }, new KeyboardEvent("keydown", { key: "Enter" }));
    await frame();
    const chip = q(root, ".overlay2 .stageChip.held");
    expect(chip.textContent).toBe(app.stage().grabLabel());
    // **What it says is derived from the state, not from the chip.** Comparing the chip to
    // `grabLabel()` alone asserts only that two readers of one function agree — a label of "held"
    // would satisfy it. The first stop after "nothing" is the contour itself, in the sandbox.
    expect(chip.textContent).toBe("the whole contour");
    // The next is a radius handle, which must name the piece AND the parameter it edits — a reader
    // holding one of four handles needs to know which.
    const state = app.currentState();
    const handle = handlesOf(state.contour, resolveAll(state.contour))[0];
    app.stage().onCanvasKey({ kind: "commit" }, new KeyboardEvent("keydown", { key: "Enter" }));
    await frame();
    const chip2 = q(root, ".overlay2 .stageChip.held");
    // **A piece name is a SENTENCE in the `$…$` convention**, so the chip is typeset and its
    // `textContent` is KaTeX's (which repeats the formula three times over). The label is where the
    // sentence is readable, and `$` appearing ON SCREEN is the defect a browser found here.
    expect(chip2.getAttribute("aria-label")).toBe(mathPlain(app.stage().grabLabel() ?? ""));
    expect(chip2.textContent ?? "", "the chip printed its delimiters").not.toContain("$");
    expect(chip2.querySelector(".katex"), "the piece name was not typeset").not.toBeNull();
    // **`toContain(handle.param)` alone is bought by the piece name**, measured: the circle is named
    // `the circle $|z - a| = R$`, so a label that dropped the parameter entirely would still contain
    // `R`. The parenthesised suffix is the content — WHICH parameter of this piece, for a reader
    // holding one of four handles.
    const next = chip2.getAttribute("aria-label") ?? "";
    expect(next).toContain(mathPlain(handle.pieceName));
    expect(next).toContain(`(${handle.param})`);
    expect(next).not.toBe(mathPlain(handle.pieceName));
  });

  it("LETS GO at the door — M7.4's defect, for a controller local", async () => {
    // `resetTransient` clears `session.held`, but `grab` is the controller's own variable and the
    // door cannot see it. That is exactly the shape of M7.4's `drillGraded`, which outlived its rung
    // because `applyState` did not clear a local it did not own.
    const { root, app } = mountStage();
    app.stage().onCanvasKey({ kind: "commit" }, new KeyboardEvent("keydown", { key: "Enter" }));
    expect(app.stage().grabLabel()).not.toBeNull();
    app.applyState({ ...app.currentState(), expr: "1/(1+z^2)" });
    await frame();
    expect(app.stage().grabLabel(), "a handle from a contour the new state may not have").toBeNull();
    expect(app.session().held).toBeNull();
    expect(root.querySelector(".overlay2 .stageChip.held")).toBeNull();
  });

  it("shows the pen's SNAP by name, beside the pointer", async () => {
    const { root, app, ink } = mountStage();
    app.stage().penStart();
    // The stage is 900 x 600 about the origin, so the plane's y = 0 runs across its middle: a move
    // one pixel off that line is within the 11 px grab radius of the real axis.
    ink.dispatchEvent(pointer("pointermove", 200, 301));
    await frame();
    const chip = q(root, ".overlay2 .stageChip.snap");
    expect(chip.textContent).toBe("the real axis");
    expect(app.session().pen?.snap).toBe("the real axis");
    // Alt suppresses the lot — and the chip goes with it, or the reader is told about a snap that
    // did not fire.
    ink.dispatchEvent(pointer("pointermove", 200, 301, { altKey: true }));
    await frame();
    expect(root.querySelector(".overlay2 .stageChip.snap")).toBeNull();
  });

  it("puts a DRAFT budget on a slider scrub, not only on a stage gesture", () => {
    // `gesture` covers the stage; a rail slider's drag is the same thing happening somewhere the
    // stage cannot see. The sliders arrive with the cards at 1.4/1.5; the budget reads the flag now.
    const { app } = mountStage();
    expect(app.session().scrubbing).toBe(false);
    app.session().scrubbing = true;
    app.applyState({ ...app.currentState(), expr: "1/(1+z^2)" });
    expect(app.session().scrubbing, "a link arrives with nobody's finger down").toBe(false);
  });

  it("will not commit a path of ONE vertex", () => {
    // `penCommit` needs two. One vertex is not a curve, and `penContour` would hand the ledger a
    // contour with nothing to integrate along.
    const { app, ink } = mountStage();
    const before = app.currentState().contour;
    app.stage().penStart();
    ink.dispatchEvent(pointer("pointerdown", 10, 10));
    ink.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(app.currentState().contour, "a one-vertex path was adopted").toBe(before);
    expect(app.session().pen, "and the pen was put away over it").not.toBeNull();
  });

  it("LETS GO of the handle when the pen comes out", () => {
    // Nothing is held while drawing. Leaving the chip up would tell a reader the arrows move a
    // handle when what they do is nothing at all — the pen takes the keyboard as well as the click.
    const { app } = mountStage();
    app.stage().onCanvasKey({ kind: "commit" }, new KeyboardEvent("keydown", { key: "Enter" }));
    expect(app.session().held).not.toBeNull();
    app.stage().penStart();
    expect(app.session().held).toBeNull();
    expect(app.stage().grabLabel()).toBeNull();
  });

  it("BOWS the piece that ENDS at the new vertex, not the one leaving it", () => {
    // M7.2's shipped defect, at the shell. Bowing the piece LEAVING the vertex measures against a
    // chord whose far end is still the click, so the chord is zero and the gesture does nothing.
    const { app, ink } = mountStage();
    app.stage().penStart();
    ink.dispatchEvent(pointer("pointerdown", 200, 200));
    ink.dispatchEvent(pointer("pointerdown", 400, 200));
    ink.dispatchEvent(pointer("pointermove", 400, 260));
    const nodes = app.session().pen?.nodes ?? [];
    expect(nodes.length).toBe(2);
    expect(nodes[0].bulge, "the piece arriving at the new vertex did not bow").toBeTypeOf("number");
    expect(Math.abs(nodes[0].bulge ?? 0)).toBeGreaterThan(0);
    expect(nodes[1].bulge, "the piece LEAVING it bowed instead").toBeUndefined();
  });

  it("names the FIRST vertex as the snap that closes the path", async () => {
    const { root, app, ink } = mountStage();
    app.stage().penStart();
    for (const [x, y] of [[200, 200], [400, 200], [400, 320]]) ink.dispatchEvent(pointer("pointerdown", x, y));
    // `buttons: 0` — a HELD button bows the piece just placed instead of moving the pending end,
    // and `pointer()` presses one by default because most of these tests are drags.
    ink.dispatchEvent(pointer("pointermove", 202, 201, { buttons: 0 }));
    await frame();
    expect(q(root, ".overlay2 .stageChip.snap").textContent).toContain("click to close");
    expect(app.session().pen?.nodes.length, "the move committed something").toBe(3);
  });

  it("gives the CUT's handle the click when it sits on a radius handle", () => {
    // The controller's declared order: a cut vertex first, because it is the smaller target and
    // usually sits on top. A drag that took the contour instead would move the one object the
    // reader was trying to hold still. Put the two in the same place and the order is the property.
    const { app, ink } = mountStage();
    const s0 = app.currentState();
    const handle = handlesOf(s0.contour, resolveAll(s0.contour))[0];
    app.applyState({
      ...s0,
      branch: {
        ...s0.branch,
        points: [{ id: "b", at: handle.at, order: { kind: "log" }, label: "b" }],
      },
    });
    // The handle is at (-1.5, 0) in a 900 x 600 stage centred on the origin.
    const [px, py] = screenOf(app, handle.at);
    ink.dispatchEvent(pointer("pointerdown", px, py));
    expect(app.session().gesture, "the radius handle took a click meant for the cut").toBe("branch");
  });

  // **A record's cuts are the record's — the review's 2.1, and it is a gate that has to exist
  // BEFORE the stage draws them.** `nearestBranch` and `cycleGrab` hit-tested
  // `branchHandles(getState().branch)` with no mode test at all. That was harmless only by
  // accident: `ShellState.branch` is by its own doc the SANDBOX's cut system and a record mounts
  // with none, so the hit test found nothing to hit. The stage is being changed to draw the
  // RECORD's branch under a record, at which moment an ungated hit test makes D1's keyhole ray and
  // D7's dogbone draggable — a reader editing a declaration the record's whole argument is about.
  //
  // So the branch is put where a record's own cut WILL be, on the state, and the two doors are
  // asked separately: the keyboard walk must not offer it, and a press on it must pan.
  it("will not let a GALLERY record's cut be grabbed, by pointer or by Enter", () => {
    const { app, ink } = mountStage();
    const s0 = app.currentState();
    const point = { id: "b", at: [0.8, 0.6] as const, order: { kind: "log" as const }, label: "b" };
    const withCut = { ...s0.branch, points: [point] };

    // First in the SANDBOX, so the gate is shown to be about the MODE and not about the handle
    // being unreachable — an anti-vacuity clause the gallery half cannot supply for itself.
    app.applyState({ ...s0, branch: withCut });
    const walk = (): string[] => {
      const seen: string[] = [];
      for (let i = 0; i < 8; i++) {
        app.stage().onCanvasKey({ kind: "commit" }, new KeyboardEvent("keydown", { key: "Enter" }));
        seen.push(app.stage().grabLabel() ?? "«the view»");
      }
      return seen;
    };
    const sandboxStops = walk();
    expect(sandboxStops.some((x) => x.includes("branch point")), `the sandbox never offered it: ${sandboxStops.join(" / ")}`).toBe(true);
    const [px, py] = screenOf(app, point.at);
    ink.dispatchEvent(pointer("pointerdown", px, py));
    expect(app.session().gesture, "the sandbox could not grab its own branch point").toBe("branch");
    ink.dispatchEvent(pointer("pointerup", px, py));

    // Then the same cut system under a record. Nothing about the geometry has moved.
    app.applyState({ ...app.currentState(), mode: "gallery", record: "circle-linear-cos", fixture: 0, branch: withCut });
    const galleryStops = walk();
    expect(
      galleryStops.filter((x) => x.includes("branch")),
      `Enter offered a record's cut to the arrows: ${galleryStops.join(" / ")}`,
    ).toHaveLength(0);
    ink.dispatchEvent(pointer("pointerdown", ...(screenOf(app, point.at) as [number, number])));
    expect(app.session().gesture, "a press on a record's branch point grabbed it instead of panning").toBe("view");
  });

  // **Escape LETS GO**, which the stage could not do: `onKeyDown` handled keys only while the pen
  // was out, so with a handle grabbed the only way back to panning was to press Enter through the
  // whole cycle — and the live region went on saying the arrows moved what was held. `STAGE_KEYS`
  // never named a way out because there was none.
  it("Escape releases a grabbed handle, and the stage says so", () => {
    const { root, app, ink } = mountStage();
    app.stage().onCanvasKey({ kind: "commit" }, new KeyboardEvent("keydown", { key: "Enter" }));
    expect(app.stage().grabLabel(), "nothing was grabbed, so the release is vacuous").not.toBeNull();
    ink.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(app.stage().grabLabel()).toBeNull();
    expect(app.session().held).toBeNull();
    // And the key is in the stage's own instructions, which is the half a reader can find.
    expect(q(root, "canvas.ink").getAttribute("aria-label")).toContain("Press Escape to let go");
  });

  it("will NOT move a gallery record's contour bodily", () => {
    // Under a record the contour is the record's, and translating it would leave a worked example
    // whose pieces no longer match the argument it is making. The radius handles still work, because
    // those edit parameters the record itself declares.
    const { app } = mountStage();
    const sandboxStops: string[] = [];
    const walk = (): string[] => {
      const seen: string[] = [];
      for (let i = 0; i < 8; i++) {
        app.stage().onCanvasKey({ kind: "commit" }, new KeyboardEvent("keydown", { key: "Enter" }));
        seen.push(app.stage().grabLabel() ?? "«the view»");
      }
      return seen;
    };
    sandboxStops.push(...walk());
    expect(sandboxStops, "the sandbox cannot move its own contour").toContain("the whole contour");
    app.applyState({ ...app.currentState(), mode: "gallery", record: "circle-linear-cos", fixture: 0 });
    expect(walk(), "a record's contour was offered to the arrows").not.toContain("the whole contour");
  });

  it("offers a record NO handle belonging to the parked sandbox contour", () => {
    // **`handles` resolved the wrong curve**, because its resolution was optional and three of its
    // four call sites — the DRAW path among them — omitted it. In gallery mode the contour on screen
    // is the record's output (M6.1) while `state.contour` is the sandbox curve the reader parked, so
    // a record drew and offered as a keyboard stop a radius handle labelled for the sandbox's
    // circle, at a point on no curve in view. A drag of it is a no-op today only because
    // `paramChannel` sends `R` to `derived`; it becomes a live edit for any record whose limit
    // parameter shares a template parameter's name, which is why tier B renames its radius `R_lim`.
    //
    // The assertion is on the stops' NAMES rather than on a count, because the record has radius
    // handles of its own and the defect is an EXTRA one that names a curve that is not there.
    const { app } = mountStage();
    const sandboxName = app.currentState().contour.pieces[0]?.name ?? "";
    expect(sandboxName, "the sandbox's own piece has a name to look for").not.toBe("");
    app.applyState({ ...app.currentState(), mode: "gallery", record: "circle-linear-cos", fixture: 0 });
    const drawn = app.resolution();
    const onScreen =
      drawn.kind === "gallery" ? (drawn.run?.contour.pieces ?? []).map((piece) => piece.name) : [];
    expect(onScreen, "the record resolved a contour of its own").not.toHaveLength(0);
    expect(onScreen, "the test is vacuous unless the two contours differ").not.toContain(sandboxName);
    const stops: string[] = [];
    for (let i = 0; i < 8; i++) {
      app.stage().onCanvasKey({ kind: "commit" }, new KeyboardEvent("keydown", { key: "Enter" }));
      stops.push(app.stage().grabLabel() ?? "«the view»");
    }
    expect(
      stops.filter((label) => label.includes(sandboxName)),
      "a record offered a handle from the contour parked in the sandbox",
    ).toHaveLength(0);
  });

  it("HIT-TESTS the contour the resolution draws, not the one the state parks", () => {
    // The other half of the test above, for the other reader of the resolution. `handles` is covered
    // there; **`pieces()` — what the controller hit-tests, and what `bodyAnchor()` measures the
    // whole-contour chip against — was covered by nothing**, and a sweep of step 1.7 found it:
    // dropping its argument (`stage.resolvedPieces(getState(), undefined)`) killed no test. An
    // omitted resolution sends `contourOf` down its `state.contour` branch, so the press below would
    // be measured against the parked sandbox circle while the unit circle is what is on screen.
    //
    // **The state and the resolution are held APART here, and the app cannot pair them that way
    // today** — measured, not assumed: `pieces()` is reached only through `canMoveBody()`, which is
    // `mode === "sandbox"`, and `resolveState` returns a `gallery` resolution only for
    // `mode === "gallery"`, so the two guards make the omission invisible from the app's own
    // surface. Making `pieces()` throw on a gallery resolution leaves the whole node gate green
    // (115 files, 2208 tests). That is a property of one policy gate rather than of this function,
    // and the day the body becomes movable under a record — or a fifth caller lands outside the
    // guard — the hit test would silently answer about a curve that is not in view. So the
    // controller's own two inputs are given deliberately different contours, which is the only place
    // the question "which one does it read?" has an answer.
    const { app } = mount();
    const parked = app.currentState();
    const drawn = resolveState({ ...parked, mode: "gallery", record: "circle-linear-cos", fixture: 0 }, null);
    if (drawn.kind !== "gallery" || drawn.run === null) throw new Error("the record did not run");
    const onScreen = resolveAll(drawn.run.contour);
    const parkedPieces = resolveAll(parked.contour);

    const host = document.createElement("div");
    document.body.append(host);
    for (const [prop, value] of [["clientWidth", 900], ["clientHeight", 600]] as const) {
      Object.defineProperty(host, prop, { configurable: true, get: () => value });
    }
    const port = { width: 900, height: 600 };
    const view = createStageView(host);
    stubPointer(view.ink);
    const session = defaultSession();
    let state = parked;
    const controller = createStageController({
      view,
      getState: () => state,
      getSession: () => session,
      getPoles: () => null,
      getResolution: () => drawn,
      commit: (next) => {
        state = next;
      },
      redraw: () => {},
      redrawStage: () => {},
      announce: () => {},
    });

    /** What a press at a point in the plane turns out to MEAN. */
    const press = (z: readonly [number, number]): string => {
      const [px, py] = plotToScreen(z[0], z[1], state.view, port);
      view.ink.dispatchEvent(pointer("pointerdown", px, py));
      const meant = session.gesture;
      view.ink.dispatchEvent(pointer("pointerup", px, py));
      return meant;
    };

    const atDrawn = pointAt(onScreen[0], 0.25);
    const atParked = pointAt(parkedPieces[0], 0.25);
    // The record draws $|z| = 1$ and the sandbox parks $|z| = 1.5$, half a unit apart against an
    // 11 px grab radius that is 0.073 units wide at the default view — so neither point is within
    // reach of the other curve, and neither assertion below can be satisfied by both at once.
    const tol = 11 * scale(parked.view, port);
    expect(onContour(parkedPieces, atDrawn, tol), "the two curves overlap, so the test is vacuous").toBe(false);
    expect(onContour(onScreen, atParked, tol), "the two curves overlap, so the test is vacuous").toBe(false);

    // **This is the assertion the mutant breaks**: with the resolution omitted the drawn point is
    // measured against the parked circle, misses it, and the press pans the view instead.
    expect(press(atDrawn), "a press on the contour ON SCREEN did not grab it").toBe("contour");
    expect(press(atParked), "a press on the parked contour grabbed a curve nobody can see").toBe("view");

    controller.destroy();
    view.destroy();
    host.remove();
  });

  // **Where a budget becomes visible.** Read off the quadrature's own certificate rather than a
  // field: `integrateContour` records `"gauss-legendre, N nodes"` as its method, and a scan for
  // that number does not have to transcribe the shape of `ContourIntegral` into the test. Two
  // tests use it — the slider's draft budget, and the keystroke's.
  const nodes = (app: ReturnType<typeof mountShell2>): number => {
    const r = app.resolution();
    if (r.kind !== "plain" && r.kind !== "declared") throw new Error(`nothing was integrated (${r.kind})`);
    const found = /(\d+) nodes/.exec(JSON.stringify(r.analysis.integral));
    if (found === null) throw new Error("no quadrature node count in the integral");
    return Number(found[1]);
  };

  it("spends the DRAFT budget while a slider is being scrubbed", () => {
    // `gesture` covers the stage; a rail slider's drag is the same thing happening somewhere the
    // stage cannot see, and without this a parameter scrub recomputes at full precision on every
    // pointer move. The sliders that set the flag arrive with the cards at 1.4/1.5 — the budget
    // reads it today, and the node count is where a budget becomes visible.
    const { app } = mountStage();
    // **The DEFAULT state is too easy for the budget to bite**, measured: `1/z` inside `|z| = 1.5`
    // puts the pole 1.5 away from every node, so the rule wants 56 nodes and the draft ceiling of
    // 768/3 never comes near it. A pole just inside the circle is what a reader dragging a contour
    // actually has under the pointer, and there the ceiling is the whole point.
    app.applyState({ ...app.currentState(), expr: "1/(z-1.4)" });
    const full = nodes(app);
    app.session().scrubbing = true;
    app.stage().fitContour();
    const draft = nodes(app);
    expect(draft, "the scrub ran at full precision").toBeLessThan(full);
  });

  // **A KEYSTROKE is a frame of a gesture too — the review's 4.4.** `setExpr` committed `"edit"`,
  // and the draft rule above reads only `session.gesture`, `session.scrubbing` and
  // `why === "gesture"`, so every prefix a reader typed was solved at the full quadrature budget on
  // the main thread. Measured on the keyhole, typing `1/(1+z^4)/(z^2+2)`, best of three: the
  // seventeen keystrokes cost **1,031.9 ms before and 340.0 ms after**, with the intermediate `"1"`
  // alone 553.1 → 52.9 ms; isolating `resolveState` on that one prefix, **689.1 ms at the full
  // budget against 3.0 ms at the draft one**, 230×. The page was frozen for half a second on one
  // character.
  //
  // Two clauses, because either alone would be satisfied by the wrong thing: the keystroke has to
  // land at the DRAFT budget, and the picture the reader is then left looking at has to be the FULL
  // one — a draft resolution that never settled would be cheap and wrong.
  it("spends the DRAFT budget on a KEYSTROKE and settles at the full one", async () => {
    const { app } = mountStage();
    // The scrub test's integrand and for its measured reason: with the pole 1.5 away from every
    // node the rule wants 56 and the draft ceiling never comes near it, so a budget change would be
    // invisible. Typed a character at a time, which is the gesture under test.
    const src = "1/(z-1.4)";
    // The DELTA, because `mountStage` reaches the sandbox through the Sandbox button and that is an
    // entry of its own — measured, and the absolute count would have pinned the helper's route
    // rather than the typing.
    const before = app.session().undo.length;
    for (let k = 1; k <= src.length; k += 1) app.actions().setExpr(src.slice(0, k));
    const typed = nodes(app);
    // The settle rides `syncHash`'s 250 ms idle timer — one timer, one moment at which the app
    // agrees the reader has stopped — so 320 ms is the same wait a permalink test makes.
    await new Promise((done) => setTimeout(done, 320));
    const settled = nodes(app);
    // 512 against 830, measured: the keystroke is bound by `DRAFT_EVALUATIONS` and the settle by
    // the quadrature's own refinement. Both numbers are in the message, so a failure says which
    // half moved.
    expect(typed, `the keystroke ran at full precision (${typed} nodes typed, ${settled} settled)`).toBeLessThan(settled);
    // And the history a reader has is untouched: `undo.ts`'s rule 7 coalesces `"type"` exactly as
    // it coalesces `"edit"`, so the nine keystrokes are ONE entry, not nine.
    expect(`${app.session().undo.length - before} entries for the typed expression`).toBe(
      "1 entries for the typed expression",
    );
  });

  it("pans the VIEW when a drag starts on nothing grabbable", () => {
    const { app, ink } = mountStage();
    const before = app.currentState().view.center;
    ink.dispatchEvent(pointer("pointerdown", 5, 5));
    expect(app.session().gesture).toBe("view");
    ink.dispatchEvent(pointer("pointermove", 40, 5));
    ink.dispatchEvent(pointer("pointerup", 40, 5));
    expect(app.session().gesture).toBe("none");
    // And the gesture let go of whatever it held: the arrows go back to panning, and no chip is
    // left pinned to the stage.
    expect(app.session().held).toBeNull();
    // jsdom gives the stage a 1×1 viewport, so the pan's magnitude is not the property — that it
    // panned at all, and released, is.
    expect(app.currentState().view.center).not.toEqual(before);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Insert-by-drag — M8 step 4.3's stage half.
//
// The gesture is a SHIFT-drag on the curve, and every test below is written against the rule that
// choice was made under: **a new gesture may not take an old one away.** So the plain drag is
// asserted beside the modified one in the same test wherever the two could be confused, because
// "the split fires" and "the body drag still fires" are one property read in two directions, and a
// mutant that dropped the `ev.shiftKey` guard passes either half on its own.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("insert-by-drag: a new vertex on a piece — M8 step 4.3", () => {
  /** The boot sandbox contour is the circle `|z| = 1.5`, one piece. A point on it, by angle. */
  const onCircle = (app: ReturnType<typeof mountShell2>, theta: number): readonly [number, number] => {
    const r = app.currentState().contour.params.R.value;
    return screenOf(app, [r * Math.cos(theta), r * Math.sin(theta)]);
  };

  /** Where the app says the vertex is: the end of the first half, read off the resolved geometry. */
  const vertexOf = (app: ReturnType<typeof mountShell2>): readonly [number, number] =>
    pointAt(resolveAll(app.currentState().contour)[0], 1);

  it("divides the piece under SHIFT, and still moves the body without it", () => {
    const { app, ink } = mountStage();
    const [x, y] = onCircle(app, Math.PI / 2);

    // Without the modifier: the affordance that was there before this step, unchanged. A mutant
    // that made the split unconditional fails here and nowhere else — the piece count would be the
    // only thing that noticed, since both gestures report the same `session.gesture`.
    const before = app.currentState().contour;
    ink.dispatchEvent(pointer("pointerdown", x, y));
    expect(app.session().gesture).toBe("contour");
    expect(app.currentState().contour.pieces, "a plain drag divided the piece").toHaveLength(1);
    ink.dispatchEvent(pointer("pointerup", x, y));

    // With it: one piece becomes two, meeting where the reader pressed.
    ink.dispatchEvent(pointer("pointerdown", x, y, { shiftKey: true }));
    expect(app.session().gesture).toBe("contour");
    const pieces = app.currentState().contour.pieces;
    expect(pieces, "Shift did not divide the piece").toHaveLength(2);
    expect(pieces[0].id, "the divided piece lost the id every other surface addresses it by").toBe(
      before.pieces[0].id,
    );
    const [vx, vy] = vertexOf(app);
    expect(Math.atan2(vy, vx), "the vertex is not where the reader pressed").toBeCloseTo(Math.PI / 2, 6);
    ink.dispatchEvent(pointer("pointerup", x, y));
  });

  it("leaves the ANSWER exactly where it was — the whole claim of the operation", () => {
    // The curve does not move, so the number does not move. Asserted through what the app reports
    // rather than through the geometry, because that is where a reader would notice: the boot
    // contour's role is `residue`, which `splitPiece` lets both halves inherit, so the division is
    // a no-op on the argument and `∮` is still `2πi`. A mutant that honoured the reader's point
    // instead of projecting it would move the curve, and a circle that is no longer a circle
    // integrates to something else.
    const { app, ink } = mountStage();
    const value = (): string => {
      const r = app.resolution();
      if (r.kind !== "plain" && r.kind !== "declared") throw new Error(`nothing was integrated (${r.kind})`);
      return r.analysis.theorem?.exactValue?.text ?? JSON.stringify(r.analysis.integral.value);
    };
    const was = value();
    expect(was).toContain("2");
    const [x, y] = onCircle(app, 0.7);
    ink.dispatchEvent(pointer("pointerdown", x, y, { shiftKey: true }));
    ink.dispatchEvent(pointer("pointerup", x, y));
    expect(app.currentState().contour.pieces).toHaveLength(2);
    expect(value(), "dividing the piece changed the integral").toBe(was);
  });

  it("adds ONE vertex however far the pointer travels, and the vertex follows it", () => {
    // **Anchored, not accumulated.** Re-splitting the contour on screen rather than the one the
    // gesture began on would add a vertex per pointer move: five moves, six pieces. The count is
    // the assertion that kills it; the angle is the assertion that the drag does anything at all.
    const { app, ink } = mountStage();
    const [x, y] = onCircle(app, Math.PI / 2);
    ink.dispatchEvent(pointer("pointerdown", x, y, { shiftKey: true }));
    for (let k = 1; k <= 5; k++) {
      const [mx, my] = onCircle(app, Math.PI / 2 + (k * Math.PI) / 10);
      ink.dispatchEvent(pointer("pointermove", mx, my));
    }
    expect(app.currentState().contour.pieces, "the drag split the split").toHaveLength(2);
    const [vx, vy] = vertexOf(app);
    expect(Math.atan2(vy, vx), "the vertex did not follow the pointer").toBeCloseTo(Math.PI, 5);
    // **And the pointer may leave the curve.** During the drag the vertex is CONSTRAINED to the
    // piece, so the question *is the pointer on it?* has already been answered — a move measured at
    // the grab radius would make the vertex vanish the moment a hand wandered. Here the pointer is
    // three radii out, well past any tolerance the press could have used, and the vertex still
    // follows its angle. A mutant re-using `tolerance()` on the move leaves it at π.
    const r = app.currentState().contour.params.R.value;
    const [fx, fy] = screenOf(app, [3 * r * Math.cos(-Math.PI / 4), 3 * r * Math.sin(-Math.PI / 4)]);
    ink.dispatchEvent(pointer("pointermove", fx, fy));
    const [ox, oy] = vertexOf(app);
    expect(Math.hypot(ox, oy), "the vertex left the circle").toBeCloseTo(r, 9);
    expect(Math.atan2(oy, ox), "the vertex stopped following a pointer off the curve").toBeCloseTo(
      -Math.PI / 4,
      5,
    );
    ink.dispatchEvent(pointer("pointerup", x, y));
    // …and the modifier is not required to KEEP dragging: `shiftKey` is read at the press, where
    // the decision is made. A reader who lets go of the key mid-drag has not asked for a different
    // gesture, and the moves above carry no `shiftKey` at all, which is what pins that.
    expect(app.currentState().contour.pieces).toHaveLength(2);
  });

  it("is ONE undo entry, back to the contour before the press", () => {
    // The step's own rule. `undo.ts` rule 6: a `"gesture"` run pushes once, at its first frame.
    // A mutant committing `"edit"` at the press pushes there AND lets the first drag frame open a
    // run of its own, so the stack grows by two and one Ctrl+Z leaves a contour the reader never
    // had — divided, at the angle they pressed rather than the angle they released.
    const { app, ink } = mountStage();
    const before = app.currentState().contour;
    const depth = app.session().undo.length;
    const [x, y] = onCircle(app, Math.PI / 2);
    ink.dispatchEvent(pointer("pointerdown", x, y, { shiftKey: true }));
    for (let k = 1; k <= 5; k++) {
      const [mx, my] = onCircle(app, Math.PI / 2 + (k * Math.PI) / 10);
      ink.dispatchEvent(pointer("pointermove", mx, my));
    }
    ink.dispatchEvent(pointer("pointerup", x, y));
    expect(app.session().undo.length - depth, "the gesture left more than one entry").toBe(1);
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(app.currentState().contour).toEqual(before);
    expect(app.currentState().contour.pieces).toHaveLength(1);
  });

  it("RECORDS the division on the recipe, as a fraction along the piece", () => {
    // **Revised at step 4.4b.** Until then this branch set `contourSource` to null, on the reading
    // that `translate(build(t), shift)` is not a divided template — true, and it cost the reader
    // the link. The recipe carries the reader's own operations now, so the field stays true; the
    // fraction is what is recorded rather than the point, because a point would re-divide at a
    // place the geometry no longer passes through once a slider moved.
    const { app, ink } = mountStage();
    expect(app.currentState().contourSource, "the sandbox did not start from a template").not.toBeNull();
    expect(app.currentState().contourSource?.ops ?? []).toHaveLength(0);
    const [x, y] = onCircle(app, Math.PI / 2);
    ink.dispatchEvent(pointer("pointerdown", x, y, { shiftKey: true }));
    ink.dispatchEvent(pointer("pointerup", x, y));
    const source = app.currentState().contourSource;
    expect(source?.template).toBe("circle");
    expect(source?.ops).toHaveLength(1);
    const op = source?.ops?.[0];
    expect(op?.k).toBe("s");
    // A quarter turn along a full circle, which is where the press was — the number, not just its
    // presence, because an op recording the wrong fraction rebuilds a different contour.
    expect(op !== undefined && op.k === "s" ? op.at : -1).toBeCloseTo(0.25, 6);
    // The parked sandbox contour moves with it, as it does for every other contour edit — a state
    // whose `contour` and `sandboxContour` disagree loses the edit at the next mode switch.
    expect(app.currentState().sandboxContour).toBe(app.currentState().contour);
  });

  it("will NOT divide a gallery record's contour", () => {
    // Sandbox only, through the same gate as the body drag and for the same reason: under a record
    // the contour belongs to the argument being made. A mutant dropping `canMoveBody()` from the
    // split's guard would let a Shift-press edit a worked example.
    const { app, ink } = mountStage();
    app.applyState({ ...app.currentState(), mode: "gallery", record: "circle-linear-cos", fixture: 0 });
    const r = app.resolution();
    if (r.kind !== "gallery" || r.run === null) throw new Error("the record did not run");
    const drawn = resolveAll(r.run.contour);
    const parked = app.currentState().contour;
    const [px, py] = pointAt(drawn[0], 0.25);
    const [x, y] = screenOf(app, [px, py]);
    ink.dispatchEvent(pointer("pointerdown", x, y, { shiftKey: true }));
    ink.dispatchEvent(pointer("pointerup", x, y));
    // `toBe`: a split replaces the object, so identity is the exact question. Both the record's
    // contour and the sandbox contour parked behind it are asserted, because the gesture reads one
    // and writes the other.
    expect(app.currentState().contour, "a record's contour was edited").toBe(parked);
    const after = app.resolution();
    if (after.kind !== "gallery" || after.run === null) throw new Error("the record stopped running");
    expect(after.run.contour.pieces).toHaveLength(r.run.contour.pieces.length);

    // **And the same press with the two contours in agreement, which is where the gate is the only
    // thing holding.** The sweep found the assertions above satisfied for the wrong reason: the
    // gesture reads the DRAWN pieces for the id and divides `state.contour`, so with the sandbox
    // parked on a different curve the id lookup misses and a mutant that dropped `canMoveBody()`
    // refused anyway. Park the sandbox on the record's OWN contour — a state a reader reaches by
    // opening a record while the sandbox holds the same shape — and the id and the geometry both
    // match, so nothing but the gate refuses.
    app.applyState({ ...app.currentState(), contour: r.run.contour });
    const twinned = app.currentState().contour;
    ink.dispatchEvent(pointer("pointerdown", x, y, { shiftKey: true }));
    ink.dispatchEvent(pointer("pointerup", x, y));
    expect(app.currentState().contour, "the parked sandbox contour was divided under a record").toBe(
      twinned,
    );
  });

  it("falls through to the BODY drag where the division would be degenerate", () => {
    // The circle's own seam is at `theta = 0`, so a press there asks for a half of zero length and
    // `splitPiece` refuses it. The press is still ON the contour, so the reader gets what a press
    // there does without the modifier — rather than nothing at all, which is what a guard written
    // as "Shift means split, full stop" would give them.
    const { app, ink } = mountStage();
    const before = app.currentState().contour;
    const [x, y] = onCircle(app, 0);
    ink.dispatchEvent(pointer("pointerdown", x, y, { shiftKey: true }));
    expect(app.currentState().contour.pieces, "a degenerate division was minted").toHaveLength(1);
    expect(app.session().gesture).toBe("contour");
    const [fx] = screenOf(app, [3 * before.params.R.value, 0]);
    ink.dispatchEvent(pointer("pointermove", fx, y));
    ink.dispatchEvent(pointer("pointerup", fx, y));
    expect(app.currentState().contour, "the press grabbed nothing at all").not.toEqual(before);
    expect(app.currentState().contour.pieces).toHaveLength(1);
  });

  it("keeps the last good division when a move would be degenerate", () => {
    // Dragging the vertex onto the piece's own seam asks for a half of zero length, which
    // `splitPiece` refuses — and a refusal must commit NOTHING. The sweep found this uncovered:
    // committing the refusal's return value writes back the contour the gesture began on, so the
    // vertex the reader is holding vanishes as they drag it past the seam and the piece is whole
    // again, mid-gesture, with the pointer still down.
    const { app, ink } = mountStage();
    const [x, y] = onCircle(app, Math.PI / 2);
    ink.dispatchEvent(pointer("pointerdown", x, y, { shiftKey: true }));
    expect(app.currentState().contour.pieces).toHaveLength(2);
    const [sx, sy] = onCircle(app, 0);
    ink.dispatchEvent(pointer("pointermove", sx, sy));
    expect(app.currentState().contour.pieces, "a refused move undid the division").toHaveLength(2);
    const [vx, vy] = vertexOf(app);
    expect(Math.atan2(vy, vx), "the vertex moved to the seam it was refused at").toBeCloseTo(
      Math.PI / 2,
      5,
    );
    ink.dispatchEvent(pointer("pointerup", sx, sy));
  });

  it("gives a HANDLE the Shift-press, because a handle is the smaller target", () => {
    // The header's decision order, at the one place it could go wrong: the circle's radius handle
    // sits at the arc's mid-sweep, which is ON the curve, so a split computed before the handles
    // were asked would take every Shift-press meant for the `R → ∞` drag. The order is the
    // property, as it is for the cut vertex two branches up.
    const { app, ink } = mountStage();
    const s0 = app.currentState();
    const handle = handlesOf(s0.contour, resolveAll(s0.contour))[0];
    const [px, py] = screenOf(app, handle.at);
    ink.dispatchEvent(pointer("pointerdown", px, py, { shiftKey: true }));
    expect(app.session().gesture, "the split took a press meant for the radius handle").toBe("handle");
    expect(app.currentState().contour.pieces).toHaveLength(1);
  });

  it("says SPLIT with the cursor, which is the gesture's only affordance before it is used", () => {
    // A modifier nothing announces is a modifier nobody finds. `cell` rather than the pen's
    // `crosshair` (two point-placing tools, told apart) and rather than `grab` (which is what the
    // press would do without the key) — and it follows the same order the press does, so it cannot
    // promise a split where a handle will take the click.
    const { app, ink } = mountStage();
    const [x, y] = onCircle(app, Math.PI / 2);
    ink.dispatchEvent(pointer("pointermove", x, y, { buttons: 0 }));
    expect(ink.style.cursor).toBe("grab");
    ink.dispatchEvent(pointer("pointermove", x, y, { buttons: 0, shiftKey: true }));
    expect(ink.style.cursor).toBe("cell");
    const handle = handlesOf(app.currentState().contour, resolveAll(app.currentState().contour))[0];
    const [hx, hy] = screenOf(app, handle.at);
    ink.dispatchEvent(pointer("pointermove", hx, hy, { buttons: 0, shiftKey: true }));
    expect(ink.style.cursor, "the cursor promised a split on a handle").toBe("grab");
  });

  it("speaks the piece's NAME into the live region, not its LaTeX — found here, older than the step", () => {
    // M8 step 3.6's defect in the one surface that pass could not read: `announce` only puts text
    // into the region once a reader has pressed something, and the roster audits a page in the
    // state a link opens it in. A piece name is a sentence in the `$…$` convention, so both the
    // split's announcement and `cycleGrab`'s — which predates this step — went in with their
    // delimiters, and on the records that have one, with their backslashes.
    const { root, app, ink } = mountStage();
    const spoken = (): string =>
      [...root.querySelectorAll('[role="status"]')].map((n) => n.textContent ?? "").join(" ");
    app.stage().onCanvasKey({ kind: "commit" }, new KeyboardEvent("keydown", { key: "Enter" }));
    app.stage().onCanvasKey({ kind: "commit" }, new KeyboardEvent("keydown", { key: "Enter" }));
    expect(app.stage().grabLabel(), "the walk did not reach a piece-named handle").toContain("$");
    expect(spoken(), "the live region read the LaTeX source aloud").not.toContain("$");
    const [x, y] = onCircle(app, Math.PI / 2);
    ink.dispatchEvent(pointer("pointerdown", x, y, { shiftKey: true }));
    expect(spoken()).toContain("A new vertex on");
    expect(spoken(), "the split announced its LaTeX source").not.toContain("$");
    ink.dispatchEvent(pointer("pointerup", x, y));
  });

  it("NAMES the vertex it is holding, and lets go of it at the end", async () => {
    // The file's own rule — what is held is said on the stage, not only in the live region — and
    // M7.4's, that the controller's locals are let go of at the door. `grabLabel` is null again
    // after the release, so the arrows do not silently rebind to a vertex that no longer exists.
    const { root, app, ink } = mountStage();
    const [x, y] = onCircle(app, Math.PI / 2);
    ink.dispatchEvent(pointer("pointerdown", x, y, { shiftKey: true }));
    expect(app.stage().grabLabel()).toBe(`a new vertex on ${app.currentState().contour.pieces[0].name}`);
    await frame();
    const chip = q(root, ".overlay2 .stageChip.held");
    expect(chip.textContent ?? "", "the chip printed its delimiters").not.toContain("$");
    ink.dispatchEvent(pointer("pointerup", x, y));
    expect(app.stage().grabLabel()).toBeNull();
    expect(app.session().held).toBeNull();
    // And the door clears it too, which is the local `applyState` cannot see.
    ink.dispatchEvent(pointer("pointerdown", x, y, { shiftKey: true }));
    app.stage().reset();
    expect(app.stage().grabLabel()).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The left rail, at the mounted shell — M8 step 1.4.
//
// The cards' own sentences are asserted in `test/cards.test.ts`, by rendering them. What needs a
// MOUNTED app is the thing M7.2's sweep bought: that an element a reader is holding survives the
// recompute their own gesture caused.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("the left rail, live", () => {
  it("keeps the SAME slider element, and its focus, across ten keyboard presses", () => {
    // `replaceChildren` destroys the control, so a reader who has tabbed to a slider loses it the
    // moment their first arrow key recomputes — and every press after that goes to the body. The
    // keyed builder is what makes this true; this is the test that says so for a parameter scrub.
    const { root, app } = mount();
    const slider = q<HTMLInputElement>(root, '[data-card="parameters"] input.slider');
    slider.focus();
    expect(document.activeElement).toBe(slider);
    const before = app.currentState().contour.params;
    for (let i = 0; i < 10; i++) {
      slider.value = String(Number(slider.value) + 7);
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      expect(q(root, '[data-card="parameters"] input.slider'), `press ${i} re-created the slider`).toBe(slider);
      expect(document.activeElement, `press ${i} lost the focus`).toBe(slider);
    }
    const after = app.currentState().contour.params;
    const name = Object.keys(before)[0];
    expect(after[name].value, "ten presses moved nothing").not.toBe(before[name].value);
  });

  it("follows the box: the preview is what the ENGINE parsed", () => {
    const { root, app } = mount();
    const input = q<HTMLInputElement>(root, '[data-card="integrand"] input.expr');
    input.value = "1/(1+z^4)";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(app.currentState().expr).toBe("1/(1+z^4)");
    // Four poles, so the singularities table follows the box too — one edit, both cards.
    expect(root.querySelectorAll('[data-card="singularities"] tbody tr').length).toBe(4);
    // And the SAME input node, with the caret where the reader left it.
    expect(q(root, '[data-card="integrand"] input.expr')).toBe(input);
  });

  it("clears a fixture's overrides when the fixture changes", () => {
    // In gallery mode the contour is the RECORD's output (M6.1), so a binding a reader set on the
    // previous fixture describes parameters this one may not have.
    const { app } = mount();
    app.applyState({
      ...app.currentState(),
      mode: "gallery",
      record: "circle-linear-cos",
      fixture: 0,
      bindings: { a: 9 },
    });
    expect(app.currentState().bindings).toEqual({ a: 9 });
    app.actions().setFixture(1);
    expect(app.currentState().fixture).toBe(1);
    expect(app.currentState().bindings, "a stale binding rode into the new fixture").toEqual({});
  });
});

describe("the hover, across three surfaces", () => {
  it("records the piece's OWN id, and clears it", () => {
    // The rail's half. **The stage's half cannot be seen here**: jsdom has no 2D context, so
    // `drawNow` returns before it strokes anything — `test/shell2.browser.test.ts` asserts the index
    // `drawContour` is actually given, where there is a context to give it to.
    const { root, app } = mountStage();
    const row = q(root, '[data-card="contour"] .pieces2 > li');
    row.dispatchEvent(new Event("pointerenter", { bubbles: true }));
    expect(app.session().hover.piece).toBe("circle");
    row.dispatchEvent(new Event("pointerleave", { bubbles: true }));
    expect(app.session().hover.piece).toBeNull();
  });
});

describe("the contour and the cuts, live", () => {
  it("SEEDS the cut system a template presupposes, and never overwrites the reader's own", () => {
    // The keyhole's argument needs a branch point and a ray; the dogbone needs two points and a
    // bounded arc. Offering the shape without the cuts would open a contour whose ledger refuses for
    // a reason the reader did not cause.
    const { app } = mount();
    expect(app.currentState().branch.points.length).toBe(0);
    app.actions().setTemplate("keyhole");
    const seeded = app.currentState().branch;
    expect(seeded.points.length, "the keyhole seeded no branch point").toBe(1);
    // A second template must not overwrite what is now the reader's cut system.
    app.actions().setTemplate("dogbone");
    expect(app.currentState().branch.points, "a template overwrote the reader's own points").toEqual(seeded.points);
  });

  it("puts what was TYPED back in the box when the factor is undeclared", () => {
    // The box holds `R(z)` once a factor is declared, so leaving it alone and merely dropping the
    // declaration would take the cofactor and CALL it the integrand — silently a different problem,
    // and one that still looks plausible.
    const { app } = mount();
    app.actions().setExpr("z^(-0.5)/(1+z)");
    app.actions().setTemplate("keyhole");
    const pointId = app.currentState().branch.points[0].id;
    app.actions().declare(pointId);
    expect(app.currentState().beforeDeclaration, "nothing was remembered to put back").toBe("z^(-0.5)/(1+z)");
    app.actions().setExpr("1/(1+z)");
    app.actions().undeclare();
    expect(app.currentState().expr).toBe("z^(-0.5)/(1+z)");
    expect(app.currentState().declaration).toBeNull();
    expect(app.currentState().beforeDeclaration).toBeNull();
  });
});

describe("a disclosure, live", () => {
  it("REMEMBERS an explicit open across a recompute", () => {
    // The old shell's disclosures lost their state whenever a card re-rendered, because the state
    // was the DOM's. Here it is the session's, and `setOpen` is what puts it there.
    const { root, app } = mount();
    const numerics = [...root.querySelectorAll('[data-card="result"] details')].find(
      (d) => (d.querySelector("summary")?.textContent ?? "") === "Numerics",
    ) as HTMLDetailsElement | undefined;
    expect(numerics, "no Numerics disclosure").toBeDefined();
    expect(numerics?.open).toBe(false);
    // jsdom fires `toggle` asynchronously in some versions; drive the property and the event the
    // way a click does, so what is under test is the handler rather than jsdom's scheduling.
    (numerics as HTMLDetailsElement).open = true;
    numerics?.dispatchEvent(new Event("toggle"));
    expect(app.session().open["result:numerics"], "the click was not recorded").toBe(true);
    app.applyState({ ...app.currentState(), expr: "1/(1+z^4)" });
    const after = [...root.querySelectorAll('[data-card="result"] details')].find(
      (d) => (d.querySelector("summary")?.textContent ?? "") === "Numerics",
    ) as HTMLDetailsElement | undefined;
    expect(after?.open, "a recompute shut a disclosure the reader opened").toBe(true);
  });
});

describe("the stage's text alternative — M6.4's generated description, ported at M8 step 1.9", () => {
  const ink = (root: HTMLElement): string => q(root, "canvas.ink").getAttribute("aria-label") ?? "";

  it("DERIVES the stage's description from the ledger, and keeps it current", () => {
    // The old shell's row, against the new one. The sandbox's boot state is `1/z` on a circle,
    // which closes at 2πi; opening a record must move every clause, because a hand-written
    // alternative would now be describing the previous picture — which is the whole reason these
    // are generated.
    const { root, app } = mount();
    expect(ink(root)).toContain("Arrow keys pan");
    expect(ink(root)).toContain("winds about 1 pole");
    expect(ink(root)).toContain("2πi");

    // The sandbox's circle is ONE piece, and the record's is not — which is the clause that says
    // the count comes from the contour the stage DREW. In gallery mode that is the record's output
    // (M6.1's finding) and `state.contour` is still the reader's parked sandbox curve, so a
    // description reading the state would go on saying "1 piece" about a four-piece figure.
    expect(ink(root)).toContain("1 piece;");

    const s = app.currentState();
    app.applyState({ ...s, mode: "gallery", record: "indented-sinc", fixture: 0 });
    expect(app.currentState().record).toBe("indented-sinc");
    // C1's contour winds about NO pole — its whole answer comes from the indentation — so the
    // description has to say so rather than implying a residue sum carried it.
    expect(ink(root)).toContain("winds about no pole");
    const pieces = /(\d+) pieces?;/.exec(ink(root));
    expect(pieces, "the description does not say how many pieces the record has").not.toBeNull();
    expect(Number(pieces?.[1]), "C1's contour is more than one piece").toBeGreaterThan(1);
    // And the parked sandbox contour is untouched, so the two really are different curves.
    expect(app.currentState().sandboxContour?.pieces.length).toBe(1);
  });

  it("counts a pole's winding only where it was DECIDED, so a contour parked on one claims nothing", () => {
    // The app's own headline property, in the text alternative: "park it on the pole and there is
    // no number at all". Shifted by the circle's OWN radius, read off the state, so the pole lands
    // exactly on it — a hardcoded 1 would merely enclose it at any other R and the test would pass
    // for the wrong reason (measured in the old shell: it did, at the boot radius).
    const { root, app } = mount();
    expect(ink(root)).toContain("winds about 1 pole");
    const s = app.currentState();
    const r = s.contour.params.R.value;
    app.applyState({
      ...s,
      contour: translateContour(s.contour, [r, 0]),
      contourSource: { template: "circle", shift: [r, 0] },
    });
    expect(ink(root)).toContain("winds about no pole");
    expect(ink(root)).not.toContain("winds about 1 pole");
  });

  it("says WHAT THE BACKDROP IS, differently in each of the four stage modes", () => {
    // **The clause exists because the mode decides whether the sentence is true.** The old shell's
    // keyboard preamble opened by naming the picture — "the integrand's phase portrait with the
    // contour drawn over it" — which on the textbook plate describes a picture nobody is showing.
    // Four modes, four distinct sentences, and the one that draws no portrait says so.
    const { root, app } = mount();
    const seen = new Set<string>();
    for (const mode of STAGE_MODES) {
      app.applyState({ ...app.currentState(), stageMode: mode });
      const label = ink(root);
      const m = /The contour is drawn ([^.]+)\./.exec(label);
      expect(m, `${mode}: the description does not say what the backdrop is`).not.toBeNull();
      seen.add(m?.[1] ?? "");
    }
    expect(seen.size, "two modes describe the same backdrop").toBe(STAGE_MODES.length);
    app.applyState({ ...app.currentState(), stageMode: "textbook" });
    expect(ink(root)).toContain("no phase portrait behind it");
    app.applyState({ ...app.currentState(), stageMode: "full" });
    expect(ink(root)).not.toContain("no phase portrait");
  });

  it("keeps the KEYS out of the picture's description", () => {
    // Two halves with two lifetimes: what the keys do never changes, what is on screen changes on
    // every recompute. They were one string in the old shell, which is how a claim came to live
    // inside a set of instructions.
    const { root, app } = mount();
    app.applyState({ ...app.currentState(), stageMode: "textbook" });
    const label = ink(root);
    expect(label).toContain("Arrow keys pan");
    expect(label.indexOf("Arrow keys pan")).toBeLessThan(label.indexOf("The contour is drawn"));
  });
});

describe("an expression that parses and cannot be evaluated — found at M8 step 1.10", () => {
  it("is REFUSED by `compile`, so the app never shows the previous answer beside it", () => {
    // **Measured in Chromium**: typing `1/(z-q)` into the sandbox threw an uncaught `ExprError` out
    // of `resolveState` and left `∮ = 2πi` — `1/z`'s answer — on screen beside the new expression.
    // `makeComplexFn` builds a LAZY evaluator, so an unknown variable survives `parse` and throws on
    // the first call. The old shell shows the same stale answer without the throw, so the dishonest
    // half is older than the rebuild.
    const bad = compile("1/(z-q)");
    expect(bad.ok).toBe(false);
    expect(bad.ok === false ? bad.error : "").toContain("q");

    // And the app SAYS so rather than going quiet: the resolution is empty with the reason.
    const { root, app } = mount();
    const before = q(root, '[data-card="result"]').textContent ?? "";
    expect(before).toContain("2");
    app.applyState({ ...app.currentState(), expr: "1/(z-q)" });
    const after = q(root, '[data-card="result"]').textContent ?? "";
    expect(after, "the previous integrand's answer is still on screen").not.toEqual(before);
  });

  it("still accepts an expression that is merely UNDEFINED somewhere", () => {
    // The probe must not reject a function the app is built to draw: `1/z` is `NaN` at the origin
    // and `log z` is an infinity there, and both are values the readout prints a word for rather
    // than errors the box refuses. A probe that confused the two would take the poles away.
    for (const expr of ["1/z", "log(z)", "z^(1/2)", "1/(1+z^4)"]) {
      expect({ expr, ok: compile(expr).ok }).toEqual({ expr, ok: true });
    }
  });
});

describe("the hover: one id, three surfaces — M8 step 1.10", () => {
  /**
   * Let the stage's rAF coalescer draw.
   *
   * **The readout is on the STAGE's overlay, so it appears a frame later**, which is not a defect to
   * work around: a pointer move that repainted the overlay synchronously would patch it once per
   * pointer event rather than once per frame, and a pointer emits far more of those than a display
   * can show. Every test that asks about the overlay waits, exactly as the browser suite does.
   */
  const drawn = async (): Promise<void> => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  };

  /** A point ON the sandbox circle: the boot contour is |z| = R, so a point at angle θ on it. */
  const onCircle = (app: ReturnType<typeof mountShell2>, theta: number): readonly [number, number] => {
    const r = app.currentState().contour.params.R.value;
    return screenOf(app, [r * Math.cos(theta), r * Math.sin(theta)]);
  };

  it("lights the PIECE the pointer is over, by the id the rail row uses", () => {
    const { root, app, ink } = mountStage();
    const contour = app.currentState().contour;
    expect(contour.pieces).toHaveLength(1);
    const id = contour.pieces[0].id;

    const [x, y] = onCircle(app, 0.7);
    ink.dispatchEvent(pointer("pointermove", x, y, { buttons: 0 }));
    expect(app.session().hover.piece).toBe(id);
    // **The rail, from the same field.** This is the direction that did not exist: the piece list
    // has set `session.hover.piece` since step 1.4, and the stage READ it — so hovering a row lit
    // the curve and hovering the curve lit nothing.
    const hot = root.querySelectorAll(".hot");
    expect(hot.length, "no rail row went hot for the hovered piece").toBeGreaterThan(0);
  });

  it("keeps `z` current on a move that changes nothing else", () => {
    // **The guard was `the handle changed OR z is null`**, so after the first move the position only
    // refreshed when the pointer crossed into or out of a handle. Invisible while nothing read `z`;
    // the whole readout the moment something does.
    const { app, ink } = mountStage();
    const a = screenOf(app, [0.31, 0.17]);
    ink.dispatchEvent(pointer("pointermove", a[0], a[1], { buttons: 0 }));
    const first = app.session().hover.z;
    const b = screenOf(app, [0.62, 0.41]);
    ink.dispatchEvent(pointer("pointermove", b[0], b[1], { buttons: 0 }));
    const second = app.session().hover.z;
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second?.[0]).not.toBeCloseTo(first?.[0] ?? 0, 6);
  });

  it("clears the whole hover when the pointer LEAVES the stage", () => {
    // Otherwise the readout sits there reporting a point the pointer left, and the row the curve lit
    // stays lit while the reader hovers a different one — two pieces hot at once.
    const { app, ink } = mountStage();
    const [x, y] = onCircle(app, 1.1);
    ink.dispatchEvent(pointer("pointermove", x, y, { buttons: 0 }));
    expect(app.session().hover.piece).not.toBeNull();
    ink.dispatchEvent(pointer("pointerleave", x, y, { buttons: 0 }));
    expect(app.session().hover).toEqual({ z: null, piece: null, handle: null });
  });

  it("does NOT clear it mid-gesture, when the drag leaves the canvas under pointer capture", () => {
    // **The first draft was vacuous and a sweep said so.** It pressed without moving first, so the
    // hover was still `NO_HOVER` and "unchanged" and "cleared" were the same object — the mutant
    // that removes the gesture guard passed. The move is what gives the assertion something to lose.
    const { app, ink } = mountStage();
    const [x, y] = onCircle(app, 0.4);
    ink.dispatchEvent(pointer("pointermove", x, y, { buttons: 0 }));
    ink.dispatchEvent(pointer("pointerdown", x, y));
    const held = app.session().hover;
    expect(held.piece, "the pointer is not on the contour — the test has nothing to hold").not.toBeNull();
    expect(app.session().gesture, "no gesture started, so there is nothing to protect").not.toBe("none");
    ink.dispatchEvent(pointer("pointerleave", -50, -50));
    expect(app.session().hover).toEqual(held);
  });

  it("shows the READOUT on the stage while the pointer is on it, and not after", async () => {
    const { root, app, ink } = mountStage();
    const find = (): Element | null => root.querySelector('[data-testid="readout"]');
    expect(find(), "a readout before the pointer has been anywhere").toBeNull();
    const [x, y] = onCircle(app, 0.9);
    ink.dispatchEvent(pointer("pointermove", x, y, { buttons: 0 }));
    await drawn();
    const block = find();
    expect(block).not.toBeNull();
    const text = block?.textContent ?? "";
    // The four numeric rows and the piece, from one hover.
    for (const label of ["z", "f(z)", "|f|", "arg f"]) expect(text).toContain(label);
    // **The piece's name TYPESET, not its source.** A browser pass at this step read
    // `piece the $R \to \infty$ semicircle` off the stage — piece names carry LaTeX, and the
    // readout was printing it raw. The prose survives; the `$` delimiters do not.
    const name = app.currentState().contour.pieces[0].name;
    expect(name, "this test needs a piece whose name carries maths").toContain("$");
    expect(text).toContain(name.slice(0, name.indexOf("$")).trim());
    expect(text, "the readout is printing LaTeX source").not.toContain("$");
    ink.dispatchEvent(pointer("pointerleave", x, y, { buttons: 0 }));
    await drawn();
    expect(find()).toBeNull();
  });

  it("names the piece of the contour ON SCREEN, not of the parked sandbox curve", async () => {
    // M6.1's trap, in the readout: under a record the drawn contour is the RECORD's output while
    // `state.contour` is still the reader's parked circle. A readout reading the state would hover
    // A6's semicircle and print "the circle |z - a| = R" — a name for a curve that is not on screen.
    const { root, app } = mountCold();
    for (const [prop, value] of [["clientWidth", 900], ["clientHeight", 600]] as const) {
      Object.defineProperty(q(root, ".stage2"), prop, { configurable: true, get: () => value });
    }
    const canvas = q<HTMLCanvasElement>(root, "canvas.ink");
    stubPointer(canvas);
    // A6's real segment runs along the real axis through the origin.
    const [x, y] = screenOf(app, [0.5, 0]);
    canvas.dispatchEvent(pointer("pointermove", x, y, { buttons: 0 }));
    await drawn();
    const text = root.querySelector('[data-testid="readout"]')?.textContent ?? "";
    expect(text, "no readout at all").not.toBe("");
    const parked = app.currentState().contour.pieces[0].name;
    expect(parked).toContain("circle");
    expect(text, "the readout named the PARKED contour's piece").not.toContain("circle");
    expect(text).toContain("segment");
  });

  it("gives the readout NO number at a pole, rather than `Infinity`", async () => {
    // `1/z` at the origin is one drag from anywhere, and it is where a reader being taught about
    // poles aims first. `fmtNum` prints a non-finite number as `String(v)`, so an unguarded readout
    // says `Infinity` in the same column and face as `2.0000`.
    const { root, app, ink } = mountStage();
    const [x, y] = screenOf(app, [0, 0]);
    ink.dispatchEvent(pointer("pointermove", x, y, { buttons: 0 }));
    await drawn();
    const text = root.querySelector('[data-testid="readout"]')?.textContent ?? "";
    expect(text, "the readout was not drawn at all").not.toBe("");
    expect(text).not.toContain("Infinity");
    expect(text).not.toContain("NaN");
  });
});

describe("undo and redo — M8 step 1.11", () => {
  /**
   * What the app says the integral IS, as the one thing an undo has to bring back.
   *
   * The THEOREM's exact value where there is one, because that is the number on screen and the one
   * the residue theorem establishes; the quadrature's value is the cross-check and moves with the
   * geometry for reasons of its own.
   */
  const verdict = (app: ReturnType<typeof mountShell2>): string => {
    const r = app.resolution();
    if (r.kind !== "plain" && r.kind !== "declared") throw new Error(`nothing was integrated (${r.kind})`);
    return r.analysis.theorem?.exactValue?.text ?? JSON.stringify(r.analysis.integral.value);
  };

  const ctrlZ = (shift = false): void => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: shift, bubbles: true, cancelable: true }),
    );
  };

  it("A DRAG ACROSS A POLE, UNDONE, RESTORES THE VERDICT — the step's own gate", () => {
    const { app, ink } = mountStage();
    // The sandbox's `1/z` on the unit-ish circle: the pole is inside, so the integral is 2πi.
    const inside = verdict(app);
    expect(inside).toContain("2");

    // Drag the contour bodily off the pole. The press lands ON the curve, which is what makes it a
    // body drag rather than a pan — `pointer()` presses with a button down, as most of these do.
    const r = app.currentState().contour.params.R.value;
    const [x, y] = screenOf(app, [r, 0]);
    // **The shift is computed from R**, not a round number of pixels: at the boot camera a pixel is
    // about 1/150 of a unit, so a 200 px drag moves the circle 1.33 units and a circle of radius
    // 1.5 still has the origin inside it. The first draft asserted the answer had changed and it
    // had not, for exactly that reason.
    const [far] = screenOf(app, [3 * r, 0]);
    ink.dispatchEvent(pointer("pointermove", x, y, { buttons: 0 }));
    ink.dispatchEvent(pointer("pointerdown", x, y));
    expect(app.session().gesture, "the press did not take the contour").toBe("contour");
    for (let k = 1; k <= 5; k++) ink.dispatchEvent(pointer("pointermove", x + ((far - x) * k) / 5, y));
    ink.dispatchEvent(pointer("pointerup", far, y));
    const outside = verdict(app);
    expect(outside, "the drag did not move the contour off the pole").not.toEqual(inside);

    // **One entry for the whole drag**, and one press of Ctrl+Z brings the answer back. A push per
    // frame would need six.
    ctrlZ();
    expect(verdict(app)).toEqual(inside);
    ctrlZ(true);
    expect(verdict(app), "redo did not return to the dragged state").toEqual(outside);
  });

  it("makes TEN ARROW NUDGES one entry", () => {
    // The plan's second gate. Each nudge commits `"edit"` on its own, so without coalescing this
    // would take ten presses of Ctrl+Z to undo — which is what a reader would call broken.
    const { app } = mountStage();
    // Enter cycles what the arrows move; take it round to the contour itself, which is the thing a
    // reader nudges. `onCanvasKey` is the route `@cas/ui` translates a key into, and the route the
    // rest of this file's keyboard tests use.
    for (let i = 0; i < 8 && app.stage().grabLabel() !== "the whole contour"; i++) {
      app.stage().onCanvasKey({ kind: "commit" }, new KeyboardEvent("keydown", { key: "Enter" }));
    }
    expect(app.stage().grabLabel(), "the arrows are not on the contour").toBe("the whole contour");
    const grabbed = app.currentState().contour;
    for (let k = 0; k < 10; k++) {
      // `"pan"` with something held MOVES what is held — the controller's own branch, and what an
      // arrow key means once Enter has taken hold of the contour.
      app.stage().onCanvasKey({ kind: "pan", dx: 1, dy: 0 }, new KeyboardEvent("keydown", { key: "ArrowRight" }));
    }
    const nudged = app.currentState().contour;
    expect(nudged, "the arrows moved nothing — the grab did not take").not.toEqual(grabbed);
    ctrlZ();
    expect(app.currentState().contour).toEqual(grabbed);
  });

  it("does NOT make an entry of a camera move", () => {
    // `ShellState`'s own comment files the camera under "none of this can change a number", and an
    // undo stack full of pans is one a reader cannot get back through.
    const { app, ink } = mountStage();
    const start = app.currentState().expr;
    app.actions().setExpr("1/(z-1)");
    const edited = app.currentState().expr;

    ink.dispatchEvent(pointer("pointerdown", 5, 5));
    ink.dispatchEvent(pointer("pointermove", 60, 5));
    ink.dispatchEvent(pointer("pointerup", 60, 5));
    app.stage().onCanvasKey({ kind: "pan", dx: -1, dy: 0 }, new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(app.currentState().expr, "the camera moves changed the problem").toBe(edited);

    // One press, and it steps over every camera move to the edit underneath.
    ctrlZ();
    expect(app.currentState().expr).toBe(start);
  });

  it("leaves Ctrl+Z ALONE inside a text field", () => {
    // The integrand box is an `<input>`, and a reader who has typed `1/z^` and wants the `^` back
    // means their keystrokes rather than the app's edit history.
    const { root, app } = mount();
    app.actions().setExpr("1/(z-1)");
    const edited = app.currentState().expr;
    const box = root.querySelector("input[type='text']");
    expect(box, "no text box to type into").not.toBeNull();
    box?.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
    expect(app.currentState().expr, "the app's undo fired inside a text field").toBe(edited);
  });

  it("CLEARS the history when a link arrives", () => {
    // A link is an arrival, not an edit: the states before it belong to a different reading, and an
    // undo that walked back into one would take the reader somewhere they have never been.
    const { app } = mount();
    app.actions().setExpr("1/(z-1)");
    expect(app.session().undo.length).toBeGreaterThan(0);
    app.applyState({ ...app.currentState(), expr: "1/(z-2)" });
    expect(app.session().undo).toHaveLength(0);
    expect(app.session().redo).toHaveLength(0);
  });

  it("gives Ctrl+Z to the PEN while a path is open", () => {
    // An undo that went to the app here would put the path away (`restore` clears the transient
    // half, M7.4's rule) and discard every vertex the reader had placed, to step back over an edit
    // made before they started drawing — data loss under the key whose meaning is that nothing is
    // lost.
    const { app, ink } = mountStage();
    app.actions().setExpr("1/(z-1)");
    const edited = app.currentState().expr;
    app.stage().penStart();
    for (const [x, y] of [[10, 10], [40, 10], [40, 40]]) ink.dispatchEvent(pointer("pointerdown", x, y));
    const session = app.session() as { pen: { nodes: unknown[] } | null };
    expect(session.pen?.nodes).toHaveLength(3);
    ctrlZ();
    expect(session.pen?.nodes, "Ctrl+Z did not drop a vertex").toHaveLength(2);
    expect(session.pen, "the path was put away").not.toBeNull();
    expect(app.currentState().expr, "the app's undo fired under the pen").toBe(edited);
  });

  it("keeps the READER's camera, not the entry's", () => {
    // A camera move is not an entry, so an entry carries whatever the camera happened to be when it
    // was pushed — restoring that would teleport the view as a side effect of undoing an edit
    // somewhere else. The move here happens AFTER the edit, so the entry's camera is the older one
    // and a `commit(target, ...)` would visibly jump back to it.
    // **The camera has to move AFTER the push**, which the first draft got wrong: it moved the view
    // through `applyState`, which clears the stacks, so the entry that survived carried the same
    // camera the app was already showing and the assertion compared a number with itself.
    const { app } = mountStage();
    const entryCamera = app.currentState().view;
    app.actions().setExpr("1/(z-1)");
    // A keyboard pan — an `"edit"` commit that changes `view` alone, so it is not an entry and the
    // one on the stack still carries the camera from before it.
    for (let k = 0; k < 3; k++) {
      app.stage().onCanvasKey({ kind: "pan", dx: 1, dy: 0 }, new KeyboardEvent("keydown", { key: "ArrowRight" }));
    }
    const camera = app.currentState().view;
    expect(camera, "the pan moved nothing — the test has no camera to keep").not.toEqual(entryCamera);
    ctrlZ();
    expect(app.currentState().expr).toBe("1/z");
    expect(app.currentState().view, "the undo moved the camera").toEqual(camera);
  });

  it("clears the transient half of the session, as a link does", () => {
    // M7.4's rule, and `restore` is its second caller: a state arriving from the stacks must not
    // bring back a hover pointing at a piece it does not have.
    const { app, ink } = mountStage();
    app.actions().setExpr("1/(z-1)");
    const [x, y] = screenOf(app, [app.currentState().contour.params.R.value, 0]);
    ink.dispatchEvent(pointer("pointermove", x, y, { buttons: 0 }));
    expect(app.session().hover.piece, "the pointer is not on the contour").not.toBeNull();
    app.actions().undo();
    expect(app.session().hover, "the restored state inherited a hover").toEqual({
      z: null,
      piece: null,
      handle: null,
    });
  });

  it("SAYS SO when there is nothing to undo, rather than going silent", () => {
    // The app's one visible notice channel is the Share card, in the right rail, where a reader who
    // has just pressed Ctrl+Z is not looking — so the reply belongs in the live region, which is
    // also the only way a screen-reader user can tell a no-op from a broken key.
    // **`mountCold`, not `mount`**, because `toSandbox` is an edit: going to the sandbox is
    // something the reader did, so by the time `mount()` returns there is already one entry and the
    // first press of Ctrl+Z is an ordinary undo. The cold start's only commit is `"init"`, which
    // pushes nothing — so this is the one moment the stack is genuinely empty.
    const { root, app } = mountCold();
    const status = (): string => root.querySelector('[role="status"]')?.textContent ?? "";
    ctrlZ();
    expect(status()).toContain("Nothing to undo");
    app.actions().setExpr("1/(z-1)");
    ctrlZ();
    expect(status()).toContain("Undone");
    ctrlZ(true);
    expect(status()).toContain("Redone");
  });

  it("needs the MODIFIER — a bare `z` is not an undo", () => {
    // Without the guard, typing `z` anywhere outside a text field would step the reader backwards.
    const { app } = mountStage();
    app.actions().setExpr("1/(z-1)");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "z", bubbles: true, cancelable: true }));
    expect(app.currentState().expr).toBe("1/(z-1)");
  });

  it("LETS GO of the document when the shell is destroyed", () => {
    // The listener is on the document, so a destroyed shell that kept it would go on answering
    // Ctrl+Z for a page it is no longer part of — and this suite mounts a fresh shell per test.
    const { app } = mountStage();
    app.actions().setExpr("1/(z-1)");
    const before = app.currentState().expr;
    app.destroy();
    ctrlZ();
    expect(app.currentState().expr, "a destroyed shell answered Ctrl+Z").toBe(before);
  });

  it("does not push the state it just restored", () => {
    // `"restore"` is its own commit reason for exactly this: an `"edit"` would push the state the
    // reader has just stepped away from, and the second press of Ctrl+Z would bring it back.
    const { app } = mount();
    const start = app.currentState().expr;
    app.actions().setExpr("1/(z-1)");
    app.actions().setExpr("1/(z-2)");
    ctrlZ();
    ctrlZ();
    expect(app.currentState().expr).toBe(start);
    // And a third press, with nothing left, changes nothing rather than oscillating.
    ctrlZ();
    expect(app.currentState().expr).toBe(start);
  });
});

describe("the pen's controls, ported from `test/pen.test.ts` at the cutover — M8 step 1.12", () => {
  const byLabel = (root: HTMLElement, label: string): HTMLButtonElement | null =>
    root.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);

  it("offers the pen only in the SANDBOX, since a record's contour is the record's", () => {
    const { root, app } = mount();
    expect(byLabel(root, "draw a contour by hand"), "no pen in the sandbox").not.toBeNull();
    app.applyState({ ...app.currentState(), mode: "gallery", record: COLD_START_RECORD, fixture: 0 });
    expect(byLabel(root, "draw a contour by hand"), "the pen is offered on a record").toBeNull();
  });

  it("shows the GRAMMAR while drawing, because an undiscoverable gesture is no gesture", () => {
    const { root } = mount();
    byLabel(root, "draw a contour by hand")?.click();
    const text = q(root, '[data-card="contour"]').textContent ?? "";
    for (const clause of ["Click to place a corner", "drag to bow", "Backspace", "Escape", "Alt"]) {
      expect(text, `the grammar does not mention ${clause}`).toContain(clause);
    }
  });

  it("ABANDONS on Cancel, leaving the contour that was there", () => {
    const { root, app, ink } = mountStage();
    const before = app.currentState().contour.pieces;
    byLabel(root, "draw a contour by hand")?.click();
    for (const [x, y] of [[10, 10], [40, 10]]) ink.dispatchEvent(pointer("pointerdown", x, y));
    expect(app.session().pen, "the clicks placed nothing").not.toBeNull();
    byLabel(root, "abandon the drawn path")?.click();
    expect(app.currentState().contour.pieces).toEqual(before);
    // And the pen is put away, so the button that starts it is back.
    expect(byLabel(root, "draw a contour by hand")).not.toBeNull();
    expect(app.session().pen).toBeNull();
  });
});
