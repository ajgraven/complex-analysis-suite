// @vitest-environment jsdom
//
// The page a reader meets, at the MOUNTED new shell — M8 step 1.7's parity port.
//
// `test/shell2.test.ts` owns the builder, the session and the stage controller; `test/cards.test.ts`
// owns each card's sentences by rendering it; `test/contrasts.test.ts` owns the modal's focus and
// `inert` contract against a stub. What is left over — and what this file is — is the behaviour that
// exists only when all of those are wired into one app: the strip's generated description, the
// reader's vocabulary on the live rail, the ladder reached through the bar's own button, and the pen
// driven by the controls the Contour card puts on screen.
//
// Ported from the old shell's `test/shell.test.ts` (the page's structure, the contrast grid, the
// rail's vocabulary) and `test/pen.test.ts` (drawing at the shell). Every test keeps the finding the
// old one recorded; what changed is the mechanics, which are named where they did.
//
// Query by role, accessible name or `data-card` / `data-testid`, never by card position — plan
// §4.0's rule, for the reason `test/shell2.test.ts` states: a test that says "the third card" passes
// for the wrong reason the day a card moves.
import { describe, expect, it } from "vitest";

import { constraintLabel, roleLabel } from "../src/engine/vocabulary.js";
import { sameShape } from "../src/engine/contour/pen.js";
import { mountShell2 } from "../src/shell/app.js";
import { decodeShell, encodeShell } from "../src/shell/viewState.js";

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

const byLabel = <T extends HTMLElement = HTMLElement>(root: ParentNode, label: string): T =>
  q<T>(root, `[aria-label="${label}"]`);

/**
 * Wait for the coalesced draw.
 *
 * The strip's accessible name is written in `drawNow`, which `schedule` coalesces onto a frame — so
 * a test that reads the label has to let the frame run. Asserting synchronously would be asserting
 * that the coalescing is absent.
 */
const frame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()));

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
 * `extra` goes into the CONSTRUCTOR: `altKey` and its siblings are getter-only on `MouseEvent`, so
 * assigning them throws rather than being ignored. `pointerId` is not a `MouseEvent` field at all,
 * which is why that one is assigned.
 */
function pointer(type: string, x: number, y: number, extra: Record<string, unknown> = {}): Event {
  const ev = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, buttons: 1, ...extra });
  Object.assign(ev, { pointerId: 1 });
  return ev;
}

/**
 * The app, with the stage at a REAL size.
 *
 * jsdom performs no layout, so `clientWidth`/`clientHeight` are 0 and `StageView.viewport()`'s `|| 1`
 * guard returns a 1×1 box — in which the 11 px grab radius covers the whole plane and every point
 * snaps. The old `test/pen.test.ts` drew in exactly that box and paid for it twice: a magnification
 * of 4 it had recorded as a collapse, and a test that had to choose its two points so that nothing
 * snapped at a tolerance of 44 world units. 900 × 600 is the stage's own box at the shell's default
 * rail widths, so the points below are the points a reader's pointer is at.
 */
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

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The page's structure, live.
//
// The four DOM invariants M6.4 established are asserted at the first render in
// `test/shell2.test.ts`. What needs the app RUNNING is the one description that is generated rather
// than written: the strip's, which is computed from the accumulation on every draw.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("the page's structure, live", () => {
  it("reports the accumulator's REAL step count, not a placeholder", async () => {
    const { root } = mount();
    await frame();
    const acc = q(root, "canvas.acc").getAttribute("aria-label") ?? "";
    const m = /over (\d+) steps/.exec(acc);
    expect(m, acc).not.toBeNull();
    // One sample per quadrature node along the contour: a real number, and not zero.
    expect(Number(m?.[1])).toBeGreaterThan(8);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The reader's vocabulary, on the live rail.
//
// Step 0.2's decision — ids are data, labels are display, and neither is spelled from the other.
// `test/vocabulary.test.ts` owns the maps and `test/cards.test.ts` asserts each card's own sentence
// by rendering it; what these three add is that the app a reader opens shows the labels, so an id
// cannot reach the screen through a path no card test happens to render.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("the rail speaks the reader's vocabulary, not the engine's ids", () => {
  it("tags a contour piece with its role's NAME", () => {
    const { root } = mount();
    // The sandbox opens on the circle template, whose single closed piece carries the `residue`
    // role — measured, not assumed: the first draft of this test guessed `free` and was wrong.
    const tags = [...root.querySelectorAll('[data-card="contour"] .pieces2 > li .tag')].map((t) =>
      t.textContent?.trim(),
    );
    expect(tags.length).toBeGreaterThan(0);
    expect(tags).toContain(roleLabel("residue"));
    expect(tags).not.toContain("residue");
  });

  it("tags a record's pieces with their roles' names too", () => {
    const { root, app } = mount();
    app.applyState({ ...app.currentState(), mode: "gallery", record: "jordan-cosine-kernel", fixture: 0 });
    const tags = [...root.querySelectorAll('[data-card="contour"] .pieces2 > li .tag')].map((t) =>
      t.textContent?.trim(),
    );
    // B1's real segment is the target and its arc vanishes: two roles, both named.
    expect(tags).toContain(roleLabel("target"));
    expect(tags).toContain(roleLabel("vanish"));
    expect(tags).not.toContain("vanish");
  });

  it("heads each ledger row with the group's label", () => {
    const { root } = mount();
    // The Result card's own table, one row per ledger row, each headed by its constraint's name.
    const groups = [...root.querySelectorAll(".checkRow .tag")].map((c) => c.textContent?.trim());
    expect(groups.length).toBeGreaterThan(0);
    expect(groups).toContain(constraintLabel("LEGALITY"));
    for (const id of ["LEGALITY", "CATCH", "KILL", "COVER"] as const) expect(groups).not.toContain(id);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The contrast ladder, reached the way a reader reaches it.
//
// `test/contrastGrid.test.ts` owns the claim that the declared differences are real, and
// `test/contrasts.test.ts` owns the modal — focus, the trap, `inert`, and which cell a button asks
// for. What is left is the wiring: that the bar's button puts it up, that what the columns SAY is
// the record's answer, and that opening a cell moves the app.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** The dialog's own element, or null when it is not in the document. */
const dialogOf = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="dialog"]');

/** Put the ladder up the way a reader does, and hand back the dialog it built. */
function openLadder(root: ParentNode): HTMLElement {
  byLabel<HTMLButtonElement>(root, "compare five arguments that differ by one row of the checks").click();
  const dialog = dialogOf();
  if (dialog === null) throw new Error("the Contrasts button put no dialog up");
  return dialog;
}

/** What each column comes to — the answer line of its heading, or its refusal. */
const answersOf = (dialog: ParentNode): (string | undefined)[] =>
  [...dialog.querySelectorAll("thead th")]
    .slice(1)
    .map((th) => th.querySelector(".num, .verdict, .muted:not(.small)")?.textContent ?? undefined);

/** The Open button of the column whose name contains `text`. */
function openColumn(dialog: ParentNode, text: string): void {
  const button = [...dialog.querySelectorAll<HTMLButtonElement>("thead button")].find((b) =>
    (b.getAttribute("aria-label") ?? "").includes(text),
  );
  if (button === undefined) throw new Error(`no column named ${text}`);
  button.click();
}

describe("the contrast ladder, from the bar", () => {
  it("is closed at boot, and costs nothing until it is opened", () => {
    const { root, app } = mount();
    // **Not merely hidden: not in the document and not BUILT.** The old shell laid a `hidden`
    // `<section>` over the page, which is what made "is it modal?" a question at all; here the
    // dialog's DOM does not exist until the first open. Five full solves — four of them gallery
    // records — in front of the app's first frame would be the cost of a panel most readers never
    // open, and the ladder is memoised at module scope so the second open is free.
    expect(dialogOf()).toBeNull();
    expect(root.querySelector(".modalBackdrop")).toBeNull();
    expect(app.session().contrastsOpen).toBe(false);

    // The bar's button is what puts it up, and the session flag is what the bar reads back — both
    // written in one place so the two cannot disagree about whether it is up.
    const dialog = openLadder(root);
    expect(dialog.querySelector("table"), "the ladder was not built on the first open").not.toBeNull();
    expect(app.session().contrastsOpen).toBe(true);
  });

  it("closes on Escape, tells the shell, and gives focus back to the bar", () => {
    const { root, app } = mount();
    const button = byLabel<HTMLButtonElement>(root, "compare five arguments that differ by one row of the checks");
    button.focus();
    const dialog = openLadder(root);
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(dialogOf()).toBeNull();
    expect(document.activeElement).toBe(button);
    // The shell's own flag, which `test/contrasts.test.ts` can only see as a call on a stub: a
    // dialog that came down while the bar still thought it was up would refuse the next open.
    expect(app.session().contrastsOpen).toBe(false);
  });

  it("prints C1's ANSWER, π/2 — not the 0 its ∮ evaluates to", () => {
    const { root } = mount();
    const dialog = openLadder(root);
    // C1's contour encloses nothing, so its `∮` is exactly 0 while the integral it determines is
    // π/2 — the last rung's whole lesson. Printing the ledger's number here would make it read as
    // a mistake. The wrong-way column has no answer at all and says which group refused instead.
    expect(answersOf(dialog)).toEqual([
      "π",
      "π/e",
      `⚠ incomplete (${constraintLabel("KILL").toLowerCase()})`,
      "π/e",
      "π/2",
    ]);
  });

  it("marks the wrong-way column's FAILED row as the step's own declared change", () => {
    const { root } = mount();
    const dialog = openLadder(root);
    // `test/contrasts.test.ts` requires the two markers to be disjoint and both to appear. This is
    // the one cell where the declared change and a failure COINCIDE — the rung's whole content, that
    // closing the same integral the other way fails at exactly the row the step names — and there is
    // exactly one of it in the ladder.
    expect(dialog.querySelectorAll('td[data-change="declared"][data-status="failed"]')).toHaveLength(1);
  });

  it("OPENS a cell into the app, which is the only thing the ladder does to the state", () => {
    const { root, app } = mount();
    openColumn(openLadder(root), "∫₀^∞ sin x/x dx");
    expect(dialogOf(), "the dialog stayed up over the state it had just applied").toBeNull();
    const state = app.currentState();
    expect(state.mode).toBe("gallery");
    expect(state.record).toBe("indented-sinc");
  });

  it("opens the WRONG-WAY cell into the sandbox, since no record can be closed wrongly", () => {
    const { root, app } = mount();
    // B1 derives its closing side from its own parameter, and a `derived` parameter is read-only
    // precisely so the geometry cannot desync from its definition — so the record is INCAPABLE of
    // being closed wrongly, and the cell is a sandbox state instead. `test/contrasts.test.ts`
    // asserts which state the button asks for; this asserts that the app arrives in it.
    openColumn(openLadder(root), "closed downward");
    const state = app.currentState();
    expect(state.mode).toBe("sandbox");
    expect(state.contourSource?.template).toBe("semicircleDown");
    expect(state.expr).toBe("exp(i*z)/(1+z^2)");
  });

  it("leaves M6.4's structure intact — one <main>, one <h1>, and the dialog outside both", () => {
    const { root } = mount();
    const dialog = openLadder(root);
    expect(root.querySelectorAll("main")).toHaveLength(1);
    expect(root.querySelectorAll("h1")).toHaveLength(1);
    // The panel's own heading is a level 2, under the page's one level 1.
    expect(q(dialog, "h2").textContent).toBe("Contrasting arguments");
    // **And it is NOT inside the landmark**, which is the new shell's reason for mounting it on the
    // root: `inert` is not defeasible from CSS, so a modal inside the element it makes inert is a
    // modal nobody can reach. That makes "outside `<main>`" a correctness fact rather than a
    // stylistic one.
    expect(q(root, "main.shell2").contains(dialog)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The pen, through the controls the card puts on screen.
//
// `test/shell2.test.ts` drives the pen through the CONTROLLER — what a click does to the draft, what
// Enter and Escape do, what `applyState` does to a half-drawn path — and `test/cards.test.ts`
// renders the card against a synthetic session. Neither can see the wiring between them: whether a
// reader who presses `Draw` is given the grammar, the count and the three buttons at all.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("the pen, at the mounted shell", () => {
  /** The vertex count the card prints — the pen row's, not a piece's value. */
  const count = (root: ParentNode): string =>
    q(root, '[data-card="contour"] .btnRow .num').textContent ?? "";

  it("shows the GRAMMAR while drawing, because an undiscoverable gesture is no gesture", () => {
    const { root } = mountStage();
    byLabel<HTMLButtonElement>(root, "draw a contour by hand").click();
    const card = q(root, '[data-card="contour"]');
    const text = card.textContent ?? "";
    expect(text).toContain("Click to place a corner");
    expect(text).toContain("drag to bow");
    expect(text).toContain("Backspace");
    expect(text).toContain("Escape");
    // And the controls that do the same jobs for a pointer-only reader.
    expect(root.querySelector('[aria-label="close the drawn path and adopt it as the contour"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="remove the last vertex"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="abandon the drawn path"]')).not.toBeNull();
  });

  it("counts vertices as they are placed, and Undo removes ONE — object-level, not per-sample", () => {
    const { root, ink } = mountStage();
    byLabel<HTMLButtonElement>(root, "draw a contour by hand").click();
    expect(count(root)).toContain("0 vertexes");
    ink.dispatchEvent(pointer("pointerdown", 200, 150));
    expect(count(root)).toContain("1 vertex");
    ink.dispatchEvent(pointer("pointerdown", 400, 150));
    ink.dispatchEvent(pointer("pointerdown", 400, 420));
    expect(count(root)).toContain("3 vertexes");
    byLabel<HTMLButtonElement>(root, "remove the last vertex").click();
    expect(count(root)).toContain("2 vertexes");
  });

  it("ABANDONS on Cancel, leaving the contour that was there", () => {
    const { root, app, ink } = mountStage();
    const before = app.currentState().contour.pieces;
    byLabel<HTMLButtonElement>(root, "draw a contour by hand").click();
    ink.dispatchEvent(pointer("pointerdown", 200, 150));
    ink.dispatchEvent(pointer("pointerdown", 400, 150));
    byLabel<HTMLButtonElement>(root, "abandon the drawn path").click();
    expect(app.currentState().contour.pieces).toEqual(before);
    expect(app.session().pen).toBeNull();
    // And the pen is offered afresh, rather than left half out with no way back to the templates.
    expect(root.querySelector('[aria-label="draw a contour by hand"]')).not.toBeNull();
  });

  it("does NOT rebuild the card on a move that changes nothing — a focused control keeps focus", async () => {
    // A sweep survivor of M7.2's whose consequence is not cosmetic: the old shell's card REPLACED
    // its children, so rebuilding it on every pointer sample destroyed and recreated the buttons,
    // and a reader who had tabbed to `Cancel` lost focus to the document the moment the mouse
    // crossed the stage. The keyed builder is what makes this true here rather than a guard, which
    // is why the assertion is on the FOCUS rather than on whether a render happened.
    //
    // **BOTH POINTS ARE CHOSEN SO THAT NOTHING SNAPS.** The stage is 900 × 600 about the origin, so
    // the plane's axes run through its middle; at 11 px of tolerance a point near either one snaps
    // and names its constraint, which is a legitimate change and would make a rebuild honest.
    const { root, ink } = mountStage();
    byLabel<HTMLButtonElement>(root, "draw a contour by hand").click();
    ink.dispatchEvent(pointer("pointerdown", 200, 150));
    await frame();
    expect(root.querySelector(".overlay2 .stageChip.snap"), "the click snapped, so it is not a control").toBeNull();

    const cancel = byLabel<HTMLButtonElement>(root, "abandon the drawn path");
    cancel.focus();
    expect(document.activeElement).toBe(cancel);
    ink.dispatchEvent(pointer("pointermove", 240, 160, { buttons: 0 }));
    await frame();
    expect(root.querySelector(".overlay2 .stageChip.snap"), "the move must snap to nothing, or the rebuild is honest").toBeNull();
    expect(document.activeElement, "a pointer move took the focus off a control the reader was on").toBe(cancel);
  });

  it("and the adopted contour gets a LINK, which is what M7.2b's wire form is for", () => {
    // A drawn contour has no template recipe, so M6.2's codec refused to mint a link for one until
    // M7.2b gave it a wire form: the VERTICES, with the shared endpoints, ids, names and colours
    // derived rather than carried. The link is read back out of the geometry, which is why the
    // round trip is compared by SHAPE — the bulge goes out through `atan2` and back through
    // `cos`/`sin`, and one of four measured cases differed by 2.0e-13.
    const { app, ink } = mountStage();
    app.stage().penStart();
    for (const [x, y] of [[200, 150], [400, 150], [300, 420]]) ink.dispatchEvent(pointer("pointerdown", x, y));
    app.stage().penCommit(true);
    expect(app.currentState().contourSource, "the drawn contour claimed a template").toBeNull();

    const enc = encodeShell(app.currentState());
    expect(enc.ok, enc.ok ? "" : enc.reason).toBe(true);
    if (!enc.ok) return;
    const back = decodeShell(enc.hash);
    expect(back?.ok).toBe(true);
    if (back === null || !back.ok) return;
    expect(sameShape(back.state.contour, app.currentState().contour)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The hovered piece, across BOTH rails.
//
// `test/shell2.test.ts` asserts that a Contour row puts the piece's own id on the session, and
// `test/cards.test.ts` renders each card against a session that already carries one. Neither can
// see the REPAINT between them — whether the id a row sets reaches every card that reads it.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("the hovered piece, lit in both rails", () => {
  it("lights the LEFT rail's row and the RIGHT rail's derivation line from ONE hover", () => {
    // **A sweep survivor of step 1.7's.** The mutant is the OLD `hover`: `repaint`'s
    // `scheduleDraw(); render2();` replaced by `scheduleDraw(); patch(left, render(…).left);`, which
    // throws the rest of the description away. `cards/derivation.ts` is a RIGHT-rail card and puts
    // `hot` on the line whose piece is hovered, so a left-only patch lights half of a three-surface
    // link — measured with B1 open, one row in each rail here against one and none under the mutant.
    //
    // The clearing half is what stops this passing on a node that is permanently hot: `hover(null)`
    // has to take BOTH rows back down again.
    const { root, app } = mount();
    app.applyState({ ...app.currentState(), mode: "gallery", record: "jordan-cosine-kernel", fixture: 0 });
    // Through the Contour card's own row, which is the reader's path to `actions.hover`.
    const row = q(root, '[data-card="contour"] .pieces2 > li');
    row.dispatchEvent(new Event("pointerenter", { bubbles: true }));
    // B1's real segment is its target piece, and the derivation attributes a line to it.
    expect(app.session().hover.piece, "the row set no id, so the rails have nothing to light").not.toBeNull();
    expect(root.querySelectorAll(".rail2.left .hot"), "the piece list did not light").toHaveLength(1);
    expect(root.querySelectorAll(".rail2.right .hot"), "the derivation line stayed cold").toHaveLength(1);

    row.dispatchEvent(new Event("pointerleave", { bubbles: true }));
    expect(app.session().hover.piece).toBeNull();
    expect(root.querySelectorAll(".rail2 .hot"), "a hot node outlived the hover").toHaveLength(0);
  });
});
