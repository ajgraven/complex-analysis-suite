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
import { CENTER_MAX, plotToScreen, scale } from "../src/kernel/camera.js";
import { pointAt } from "../src/kernel/geom.js";
import { h, patch } from "../src/shell2/dom.js";
import { math, mathPlain, mathText, renderedCount } from "../src/shell2/math.js";
import { mountShell2 } from "../src/shell2/app.js";
import { createStageController } from "../src/shell2/stageController.js";
import { createStageView } from "../src/shell2/stageView.js";
import { defaultSession, resetTransient } from "../src/shell2/session.js";
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
function mount(): { root: HTMLElement; app: ReturnType<typeof mountShell2> } {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  window.history.replaceState(null, "", window.location.pathname);
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  return { root, app: mountShell2(root) };
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
    s.undo = [{}];
    s.hover = { z: [1, 0], piece: "arc", handle: 2 };
    s.rails = { left: true, right: false };
    s.open = { numerics: true };
    resetTransient(s);
    expect(s.gesture).toBe("none");
    expect(s.drillGraded).toBe(false);
    expect(s.undo).toEqual([]);
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

  it("puts the suite nav BEFORE <main>, so it reads where it draws", () => {
    const { root } = mount();
    const nav = q(root, "nav.cas-nav");
    const main = q(root, "main");
    expect(nav.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main.contains(nav)).toBe(false);
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

  it("boots into the sandbox with both rails open and every card titled", () => {
    const { root, app } = mount();
    expect(app.currentState().mode).toBe("sandbox");
    const shell = q(root, "main.shell2");
    expect(shell.dataset.left).toBe("open");
    expect(shell.dataset.right).toBe("open");
    // The Target card is gallery-only; the other five of the left rail are here.
    const titles = [...root.querySelectorAll("h2")].map((e) => e.textContent);
    for (const id of [...LEFT_CARDS, ...RIGHT_CARDS]) {
      if (id === "target") {
        expect(titles).not.toContain(cardTitle(id));
        continue;
      }
      expect(titles, `${id} is missing`).toContain(cardTitle(id));
    }
    // And the engine actually ran: the bar states what the resolution is.
    // `data-testid="mode"` NAMES THE MODE CONTROL now, not the scaffold's debug line — which is
    // what the id always said and what 1.1 spent it on for want of anything else. The property is
    // the same: the engine ran and the shell knows which state it is in.
    expect(q(root, '[data-testid="mode"] button[aria-pressed="true"]').textContent).toBe("Explore");
    expect(q(root, '[data-testid="record"]').textContent).toBe("Choose a record");
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

  it("spends the DRAFT budget while a slider is being scrubbed", () => {
    // `gesture` covers the stage; a rail slider's drag is the same thing happening somewhere the
    // stage cannot see, and without this a parameter scrub recomputes at full precision on every
    // pointer move. The sliders that set the flag arrive with the cards at 1.4/1.5 — the budget
    // reads it today, and the node count is where a budget becomes visible.
    // Read off the quadrature's own certificate rather than a field: `integrateContour` records
    // `"gauss-legendre, N nodes"` as its method, and a scan for that number does not have to
    // transcribe the shape of `ContourIntegral` into the test.
    const nodes = (app: ReturnType<typeof mountShell2>): number => {
      const r = app.resolution();
      if (r.kind !== "plain" && r.kind !== "declared") throw new Error(`nothing was integrated (${r.kind})`);
      const found = /(\d+) nodes/.exec(JSON.stringify(r.analysis.integral));
      if (found === null) throw new Error("no quadrature node count in the integral");
      return Number(found[1]);
    };
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
