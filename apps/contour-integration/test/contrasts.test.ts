// @vitest-environment jsdom
//
// The contrast ladder AS A STRIP OF CARDS — M8 step 3.5.
//
// **This file was the MODAL's until this step, and none of that survives here.** A dialog's
// properties are about a reader's hands in a box that covers the page — where focus goes, what Tab
// does at the ends, whether the page behind is reachable, whether Escape shuts it — and the strip
// has no box, so every one of those questions is now about `test/modal.test.ts`'s front door rather
// than about this panel. What replaces them is the only thing a strip of five cards can be wrong
// about: whether the right five are drawn, in the right order, saying the right thing about the
// step into each of them, and asking for the right rung when one is pressed.
//
// **What is asserted here is the PRESENTATION, not the ladder.** `test/contrastGrid.test.ts` already
// derives each step's real difference set from the engine and requires it to match the declared one
// in both directions; re-checking any of that here would be a second copy of a claim that has an
// owner. So every expectation about WHICH rows change is read out of `changesAt(ladder(), i)` — the
// datum itself — and only the sentence built from it is this file's business. The counts are
// additionally pinned as literals, because a `changesAt` that returned nothing at all would satisfy
// a test that only compared the screen against its output.
//
// Every test below names the defect it prevents.
import { afterEach, describe, expect, it, vi } from "vitest";

import { CONTRAST_CELLS } from "../src/shell/contrastGrid.js";
import { changesAt, contrastStrip, ladder } from "../src/shell/contrasts.js";
import { constraintLabel } from "../src/engine/vocabulary.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import { compile, defaultState, resolveState, type ShellState } from "../src/shell/state.js";
import { patch } from "../src/shell/dom.js";
import { defaultSession, type Session } from "../src/shell/session.js";
import type { CardContext, ShellActions } from "../src/shell/cards/card.js";

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Helpers — `cards.test.ts`'s and `drillPanel.test.ts`'s, copied rather than imported for their own
// stated reason: step 3.5 does not own either file, and a shared harness would make a change to one
// panel's test a change to three.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Actions that record what was asked for, so a card can be pressed and the ask inspected. */
function spyActions(): ShellActions & { calls: string[]; applied: ShellState[] } {
  const calls: string[] = [];
  const applied: ShellState[] = [];
  return {
    calls,
    applied,
    fitContour: () => calls.push("fit"),
    setExpr: (s) => calls.push(`expr:${s}`),
    setFixture: (i) => calls.push(`fixture:${i}`),
    setParam: (n, v) => calls.push(`param:${n}=${v}`),
    setScrubbing: (on) => calls.push(`scrub:${on}`),
    hover: (p) => calls.push(`hover:${p}`),
    setTemplate: (id) => calls.push(`template:${id}`),
    reverseContour: () => calls.push("reverse"),
    penStart: () => calls.push("pen:start"),
    penStop: () => calls.push("pen:stop"),
    penBack: () => calls.push("pen:back"),
    penCommit: (closed) => calls.push(`pen:commit:${closed}`),
    setBranch: () => calls.push("branch"),
    setIso: (on) => calls.push(`iso:${on}`),
    setStageMode: (m) => calls.push(`stageMode:${m}`),
    undo: () => calls.push("undo"),
    redo: () => calls.push("redo"),
    declare: (id) => calls.push(`declare:${id}`),
    undeclare: () => calls.push("undeclare"),
    setDeclaration: () => calls.push("decl"),
    setOpen: (id, open) => calls.push(`open:${id}:${open}`),
    setStep: (step) => calls.push(`step:${step}`),
    playSweep: (a: { stepId: string }) => calls.push(`playSweep:${a.stepId}`),
    stopSweep: () => calls.push("stopSweep"),
    copyLink: () => calls.push("copyLink"),
    saveFigure: (t) => calls.push(`saveFigure:${t}`),
    copyFigure: () => calls.push("copyFigure"),
    setMode: (m) => calls.push(`mode:${m}`),
    setRail: (side, folded) => calls.push(`rail:${side}:${folded}`),
    toSandbox: () => calls.push("toSandbox"),
    setContrastsOpen: (open) => calls.push(`contrasts:${open}`),
    openContrast: (id: string) => calls.push(`contrast:${id}`),
    applyState: (next) => {
      applied.push(next);
      calls.push("applyState");
    },
    openFrontDoor: () => calls.push("frontDoor"),
    notify: (text, level) => calls.push(`notify:${level}:${text}`),
    redraw: () => calls.push("redraw"),
  };
}

/**
 * A context for the strip.
 *
 * The state is a real one and is resolved for real, though the strip reads neither: a context
 * assembled out of placeholders would stop being the object the app passes the moment the strip
 * grew a second reader, and the resolve costs one sandbox solve.
 */
function contextOf(session: Session, actions: ShellActions): CardContext {
  const state = defaultState(circleTemplate([0, 0], 1.5));
  const compiled = compile(state.expr);
  const resolution = resolveState(state, compiled);
  return {
    state,
    resolution,
    session,
    poles: compiled.ok ? compiled.poles : null,
    actions,
  };
}

interface Harness {
  readonly host: HTMLElement;
  readonly session: Session;
  readonly actions: ReturnType<typeof spyActions>;
}

/**
 * Draw the strip into a host that is IN the document.
 *
 * In the document because the panel's name is an `aria-labelledby` and the only honest way to check
 * one is to dereference the id, which needs a document to look it up in.
 */
function strip(over: Partial<Session> = {}): Harness {
  const session: Session = { ...defaultSession(), contrastsOpen: true, ...over };
  const actions = spyActions();
  const host = document.createElement("div");
  document.body.append(host);
  patch(host, contrastStrip(contextOf(session, actions)));
  return { host, session, actions };
}

afterEach(() => {
  document.body.replaceChildren();
});

/** The five case cards, in the order they were drawn. */
const cardsIn = (root: ParentNode): HTMLButtonElement[] => [
  ...root.querySelectorAll<HTMLButtonElement>("button.ladderCard"),
];

/**
 * What a reader SEES.
 *
 * `.katex-mathml` carries the LaTeX source for a screen reader, so a bare `textContent` reads the
 * mathematics twice — once typeset and once as `\int_{-\infty}`. Stripping it is what makes "no
 * `$…$` reached the screen" a statement about the rendered text rather than about KaTeX's internals.
 */
function seen(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement;
  for (const m of clone.querySelectorAll(".katex-mathml")) m.remove();
  return clone.textContent ?? "";
}

/**
 * What one card's ANSWER slot says.
 *
 * Its own reader because the slot is the only part of a card whose exact text is a claim: three of
 * the five cards carry a `0` somewhere innocent (`∫₀^∞`, `Res(f, 0)`), so an assertion about the
 * whole card could never say "and nothing else".
 */
function answerOf(card: Element): string {
  const slot = card.querySelector(".caseAnswer");
  if (slot === null) throw new Error(`card ${card.getAttribute("data-cell") ?? "?"} has no answer slot`);
  return seen(slot);
}

/** The declared counts, as literals. Named here so every test that leans on them says so. */
const DECLARED_COUNTS = [0, 1, 1, 1, 5] as const;

describe("the contrast strip — whether it is there at all", () => {
  it("draws NOTHING while the ladder is shut, so the stage keeps its height", () => {
    // The defect: rendering the section with `hidden` or an empty class instead of returning
    // nothing. It looks identical in a screenshot and costs the stage a grid row for a panel the
    // reader never asked for — and, worse, pays the five solves below on every mount.
    const session: Session = { ...defaultSession(), contrastsOpen: false };
    expect(contrastStrip(contextOf(session, spyActions()))).toEqual([]);

    const open = contrastStrip(contextOf({ ...defaultSession(), contrastsOpen: true }, spyActions()));
    expect(open.length, "an open ladder drew no section").toBe(1);
    expect(open[0].tag).toBe("section");
  });

  it("pays no SOLVE while it is shut, and pays it exactly once when it opens", async () => {
    // The defect the shape of `contrastStrip` exists to prevent: reading `ladder()` before the
    // guard. Five full solves, four of them gallery records, on every mount of an app whose ladder
    // is shut by default — invisible except as a slow boot, and `toEqual([])` above cannot see it
    // because a strip that solved and then threw the table away returns `[]` just the same.
    //
    // **`ladder()` memoises at module scope, so the call cannot be observed from outside the
    // module** — which is why this is the one test here that re-imports. A fresh registry gives a
    // fresh (empty) memo, and `contrastTable` is spied through the module `contrasts.ts` imports it
    // from, so what is counted is the solve itself and not a proxy for it.
    vi.resetModules();
    let solves = 0;
    vi.doMock("../src/shell/contrastGrid.js", async (importOriginal) => {
      const real = await importOriginal<typeof import("../src/shell/contrastGrid.js")>();
      return {
        ...real,
        contrastTable: (...args: Parameters<typeof real.contrastTable>) => {
          solves += 1;
          return real.contrastTable(...args);
        },
      };
    });
    try {
      const fresh = await import("../src/shell/contrasts.js");
      const shut = contextOf({ ...defaultSession(), contrastsOpen: false }, spyActions());
      expect(fresh.contrastStrip(shut)).toEqual([]);
      expect(solves, "the ladder was solved for a panel that is not on screen").toBe(0);

      // The anti-vacuity half: a `contrastStrip` that solved nothing ever would pass the line above
      // perfectly. Opening it must really reach the table — and reach it once, because the memo is
      // the reason the dialog could be rebuilt on every keystroke and this strip on every frame.
      const live = contextOf({ ...defaultSession(), contrastsOpen: true }, spyActions());
      expect(fresh.contrastStrip(live).length).toBe(1);
      expect(solves, "opening the ladder solved nothing").toBe(1);
      expect(fresh.contrastStrip(live).length).toBe(1);
      expect(solves, "the module-scope memo is not a memo — a second render re-solved").toBe(1);
    } finally {
      vi.doUnmock("../src/shell/contrastGrid.js");
      vi.resetModules();
    }
  });
});

describe("the contrast strip — the five cases", () => {
  it("draws one card per cell, in CONTRAST_CELLS order, each addressable by its own id", () => {
    // Two defects at once. A strip built from `contrastTable().rows` rather than `.cells`, or from
    // a filtered list, quietly drops a rung; and a card whose `data-cell` is its INDEX rather than
    // its id addresses the right thing today and the wrong thing the moment a cell is inserted —
    // which is what every other test here, and the shell's own highlight, look the card up by.
    const { host } = strip();
    const cards = cardsIn(host);
    expect(cards.length, "the ladder is five rungs").toBe(5);
    expect(
      cards.map((b) => b.getAttribute("data-cell")),
      "the cards are not the declared cells, in the declared order",
    ).toEqual(CONTRAST_CELLS.map((c) => c.id));
    // The whole card is the control, not a card with an Open button inside it: a second target
    // would be a second thing to name and a second thing for a reader to find.
    for (const b of cards) expect(b.getAttribute("type"), "a button with no type submits a form").toBe("button");
  });

  it("names each card by the cell's SPOKEN twin, never by its LaTeX", () => {
    // Step 2.1's defect, which is invisible on screen: the labels are typeset now, so an
    // `aria-label` built from `cell.label` (or from `mathPlain` of it, which only strips the `$`)
    // is read out as "backslash int underscore zero caret open brace infinity". Four of the five
    // labels carry a formula, so this bites — and the names must differ from each other, since five
    // rows reading "open" in a screen reader's element list name nothing at all.
    const { host } = strip();
    const names = cardsIn(host).map((b) => b.getAttribute("aria-label") ?? "");
    expect(new Set(names).size, "two cards offer the same accessible name").toBe(5);
    CONTRAST_CELLS.forEach((cell, i) => {
      expect(names[i], `card ${i} (${cell.id}) is not named after its own cell`).toContain(cell.labelText);
      expect(names[i], "an accessible name carrying LaTeX").not.toContain("\\");
    });
    // The anti-vacuity clause, read off the datum: `labelText` would be a pointless twin if it were
    // the same string as `label`, and then `not.toContain("\\")` would be satisfied by either.
    const typeset = CONTRAST_CELLS.filter((c) => c.label.includes("\\"));
    expect(typeset.length, "no cell label carries LaTeX — the spoken twin no longer bites").toBeGreaterThan(2);
  });

  it("prints the record's ANSWER, so the indented case reads π/2 and not the 0 its ∮ evaluates to", () => {
    // C1's whole lesson, and the reason `ContrastTableCell.answer` is the record's solved value
    // rather than the ledger's `∮`: its contour encloses nothing, so `∮` is exactly 0 while the
    // integral it determines is π/2. A card that printed the ledger's value would show `0` under
    // the one rung that exists to say the two are different.
    const { host } = strip();
    const table = ladder();
    const cards = cardsIn(host);
    table.cells.forEach((cell, i) => {
      if (cell.answer === null) return;
      expect(answerOf(cards[i]), `card ${i} (${cell.id}) does not print its answer`).toContain(cell.answer);
    });
    // **Read out of the answer slot, not out of the card.** The whole card's text contains a `0` in
    // three innocent places — the label's `∫₀^∞`, the `Res(f, 0)` in its sentence — so "the card
    // does not say 0" is unwritable, while "the answer slot says π/2 and only that" is exactly the
    // claim. Named outright rather than only derived, so a `contrastSideOf` that started handing
    // back the ledger's value would fail here by name instead of agreeing with itself.
    const indented = cards[CONTRAST_CELLS.findIndex((c) => c.id === "indented")];
    expect(
      answerOf(indented).trim(),
      "the indented case printed the ledger's ∮ rather than the record's answer",
    ).toBe("π/2");
  });

  it("stamps the case that does NOT close with ⚠ and the constraint it failed at", () => {
    // The honest-labelling guardrail on the one rung that is a failure: the wrong-way argument has
    // no value, and a card that left the slot blank — or drew an em-dash, which is what a cell with
    // nothing to say gets — would read as an argument that simply has no answer yet rather than one
    // whose boundary terms diverge. The constraint is NAMED, so the card says WHICH part failed.
    const { host } = strip();
    const at = CONTRAST_CELLS.findIndex((c) => c.id === "wrong-way");
    const text = answerOf(cardsIn(host)[at]);
    expect(text, "the failing case carries no ⚠").toContain("⚠");
    expect(text, "the failing case does not name what it failed at").toContain(
      `incomplete (${constraintLabel("KILL").toLowerCase()})`,
    );
    // And the datum agrees that this is the failing one — otherwise the two lines above would be a
    // claim about whichever card happens to sit third.
    expect(ladder().cells[at].closes, "the wrong-way case closes — this test is about another cell").toBe(false);
    expect(ladder().cells[at].failedAt).toBe("KILL");
  });
});

describe("the contrast strip — the declared change, in words", () => {
  it("names the ONE row that changed and what it did, on each of the three single-row steps", () => {
    // The strip's whole reason for replacing the grid: five columns × nine rows of glyphs made a
    // reader decode a table before it said anything, and what a rung has to say is one row label and
    // one verb. The defect this prevents is a card that highlights a row somewhere else on the page
    // and says nothing itself — which is what the grid did, and which leaves the strip a list of
    // five integrals in no stated relation.
    //
    // The verb is derived from the datum's STATUS rather than written down per card, so a `became`
    // that always returned "now holds" fails on the wrong-way rung instead of passing three times.
    const { host } = strip();
    const table = ladder();
    const cards = cardsIn(host);
    const said: Record<string, string> = { satisfied: "now holds", failed: "now fails" };
    for (const id of ["oscillatory", "wrong-way", "forced-downward"]) {
      const at = CONTRAST_CELLS.findIndex((c) => c.id === id);
      const changes = changesAt(table, at);
      expect(changes.length, `${id} no longer declares exactly one row`).toBe(1);
      const verb = said[changes[0].status];
      expect(verb, `${id}'s row landed on an unexpected status`).not.toBeUndefined();
      expect(seen(cards[at]), `${id} does not name its changed row and what it did`).toContain(
        `${changes[0].label} ${verb}`,
      );
    }
    // The pair the ladder exists for: the SAME row, satisfied on one rung and failed on the next.
    // A card that printed the label without the verb would read identically on both.
    const wrong = cards[CONTRAST_CELLS.findIndex((c) => c.id === "wrong-way")];
    expect(seen(wrong), "the failing rung reads as though its estimate still holds").not.toContain("now holds");
  });

  it("says the COUNT out loud on the rung that moves five rows, and names all five", () => {
    // M7.1 measured the step into C1 and it moves FIVE rows, not the plan's two. A card that
    // printed the first of them would make the plan's sentence — "the one row that changed" — true
    // by hiding the other four, which is the one way this panel could lie about the ladder.
    const { host } = strip();
    const at = CONTRAST_CELLS.findIndex((c) => c.id === "indented");
    const changes = changesAt(ladder(), at);
    const text = seen(cardsIn(host)[at]);
    expect(text, "the count is not said out loud").toContain(`${changes.length} checks change`);
    for (const change of changes) {
      expect(text, `the rung does not name '${change.label}'`).toContain(change.label);
    }
  });

  it("declares 0, 1, 1, 1 and 5 rows — the counts as literals, not as whatever `changesAt` returns", () => {
    // **The tests above compare the screen against `changesAt`, so a `changesAt` that returned an
    // empty list for every rung would agree with a card that printed nothing.** This is the datum
    // asserted independently: the first three steps are one row apart and it is the same row all
    // three times, and the last is five. Both halves have to hold for the pair to mean anything.
    const table = ladder();
    expect(table.cells.map((_, i) => changesAt(table, i).length)).toEqual([...DECLARED_COUNTS]);
    const single = [1, 2, 3].map((i) => changesAt(table, i)[0].key);
    expect(new Set(single).size, "the first three rungs no longer turn on ONE shared row").toBe(1);
  });

  it("says nothing about a step into the FIRST rung, because there is no step into it", () => {
    // The defect: a `changes.length >= 0` guard, or a card that prints an empty change line. The
    // first case is the one the ladder is measured FROM; a sentence there would have to be about a
    // comparison that does not exist.
    const { host } = strip();
    expect(changesAt(ladder(), 0).length, "the first cell declares a difference from nothing").toBe(0);
    expect(
      cardsIn(host)[0].querySelector(".caseChange"),
      "the first card carries a change line",
    ).toBeNull();
    for (const at of [1, 2, 3, 4]) {
      expect(cardsIn(host)[at].querySelector(".caseChange"), `card ${at} carries no change line`).not.toBeNull();
    }
  });
});

describe("the contrast strip — how it prints mathematics", () => {
  it("prints mathematics, never `$…$` source", () => {
    // The app's convention (`mathText`) applied to a panel whose labels became typeset at step 2.1.
    // A card that dropped a label straight into a text node would print
    // `$\int_{-\infty}^{\infty} \frac{dx}{x^2+1}$` on screen — visible, but only to someone reading
    // the strip rather than the tests.
    //
    // **This bites, and the datum says so**: four of the five cell labels, three of the five notes
    // and one `because` carry `$…$`. That is asserted below rather than assumed, because the same
    // test written against the old grid's column headings said nothing at all — none of them
    // carried a dollar, so no implementation of the panel could have failed it.
    const { host } = strip();
    const text = seen(host);
    expect(text, "LaTeX delimiters reached the screen").not.toContain("$");
    expect(text, "LaTeX source reached the screen").not.toMatch(/\\int|\\frac|\\oint|\\operatorname/);
    // And the typesetting really happened: stripping `$` and printing the LaTeX body would satisfy
    // both lines above. KaTeX leaves its own markup, which is the evidence that a formula was built.
    expect(host.querySelectorAll(".katex").length, "nothing was typeset at all").toBeGreaterThan(3);

    const dollars = CONTRAST_CELLS.filter((c) => c.label.includes("$")).length;
    expect(dollars, "no cell label carries `$…$` — this test no longer bites").toBeGreaterThan(3);
  });
});

describe("the contrast strip — the rung the reader is on", () => {
  it("marks exactly the card the session names, and none when it names nothing", () => {
    // The strip's reason for existing is that it STAYS OPEN while the reader walks it, so the one
    // thing it must never lose is which rung is showing. The defect: `aria-current` on the first
    // card, or on all of them, or on none — each of which looks like a stylesheet problem and is
    // not. Every cell is checked, because marking `cards[0]` unconditionally passes a test that
    // only ever opens the first.
    for (const cell of CONTRAST_CELLS) {
      document.body.replaceChildren();
      const { host } = strip({ contrast: { cell: cell.id, rows: [] } });
      const marked = cardsIn(host).filter((b) => b.getAttribute("aria-current") === "true");
      expect(marked.length, `${cell.id}: ${marked.length} cards claim to be the current rung`).toBe(1);
      expect(marked[0].getAttribute("data-cell"), "the wrong card is marked as current").toBe(cell.id);
    }
    document.body.replaceChildren();
    const { host } = strip({ contrast: null });
    expect(
      cardsIn(host).filter((b) => b.hasAttribute("aria-current")).length,
      "a card claims to be current while the reader has opened none",
    ).toBe(0);
  });
});

describe("the contrast strip — what a press asks for", () => {
  it("asks to open the card that was pressed, by id, and asks for nothing else", () => {
    // Two defects, and the sweep found the first of them on the dialog: every button bound to
    // `CONTRAST_CELLS[0]` survives a test that presses one card and checks that something plausible
    // happened. Each card is therefore pressed and checked against its OWN id.
    //
    // The second is `applyState(cell.state())` from the strip. Opening a rung is three writes in one
    // order — apply, then record which rung and which rows it declares, then open the check list
    // that is about to show them — and only the first survives `resetTransient`, so a strip that
    // applied the state itself would leave the rung unmarked and its declared row unhighlighted.
    // `toEqual` on the whole call list is what makes "and nothing else" an assertion.
    CONTRAST_CELLS.forEach((cell, i) => {
      document.body.replaceChildren();
      const { host, actions } = strip();
      cardsIn(host)[i].click();
      expect(actions.calls, `card ${i} (${cell.id}) asked for the wrong thing`).toEqual([`contrast:${cell.id}`]);
      expect(actions.applied, "the strip applied a state itself instead of asking for the rung").toEqual([]);
    });
  });
});

describe("the contrast strip — the panel's own chrome", () => {
  it("carries one heading, and that heading is the panel's accessible name", () => {
    // Two defects in one property. The shell asserts a single `<h1>` and a flat list of `<h2>`s as a
    // structural invariant (M6.4), so a panel that shipped two headings — or a heading at the wrong
    // level — breaks the page's outline for everyone using it to navigate. And `aria-labelledby`
    // pointing at an id that is in no document is invisible in every browser and every screenshot:
    // the section simply has no name. The id is therefore dereferenced and the text it lands on read.
    const { host } = strip();
    const section = host.querySelector("section");
    expect(section, "no section at all").not.toBeNull();
    expect(host.querySelectorAll("h2").length, "the panel's heading count is not one").toBe(1);
    const id = section?.getAttribute("aria-labelledby") ?? "";
    expect(id, "the panel has no aria-labelledby").not.toBe("");
    const label = document.getElementById(id);
    expect(label, `aria-labelledby names '${id}', which is in no document`).not.toBeNull();
    expect((label?.textContent ?? "").trim().length, "the panel's name is empty").toBeGreaterThan(0);
    expect(label?.tagName.toLowerCase(), "the name is not the heading").toBe("h2");
  });

  it("offers a Close that asks the SHELL to shut, rather than removing itself", () => {
    // `session.contrastsOpen` is the single source of truth for whether the strip is drawn, so a
    // Close that took its own DOM away would be undone by the next render — and a render happens on
    // every recompute, which is every frame of a contour drag. The ask is what is asserted.
    const { host, actions } = strip();
    const close = [...host.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Close"));
    expect(close, "no Close button").not.toBeUndefined();
    expect(close?.classList.contains("ladderCard"), "the Close control is one of the case cards").toBe(false);
    close?.click();
    expect(actions.calls, "Close did not ask the shell to shut the ladder").toEqual(["contrasts:false"]);
  });
});
