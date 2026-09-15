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
import { h, patch } from "../src/shell2/dom.js";
import { math, mathText, renderedCount } from "../src/shell2/math.js";
import { mountShell2 } from "../src/shell2/app.js";
import { defaultSession, resetTransient } from "../src/shell2/session.js";

function mount(): { root: HTMLElement; app: ReturnType<typeof mountShell2> } {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
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
    expect(q(root, '[data-testid="mode"]').textContent).toBe("sandbox");
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
    // The reader's own preferences are not theirs to lose, so the folded rail survives the link.
    expect(s.rails).toEqual({ left: true, right: false });
  });

  it("re-renders through one door, keeping the card nodes it already built", () => {
    const { root, app } = mount();
    const before = q(root, '[data-card="integrand"]');
    app.applyState({ ...app.currentState(), expr: "1/(1+z^2)" });
    expect(q(root, '[data-card="integrand"]')).toBe(before);
    expect(app.currentState().expr).toBe("1/(1+z^2)");
  });
});
