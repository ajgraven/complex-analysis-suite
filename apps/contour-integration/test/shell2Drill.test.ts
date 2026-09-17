// @vitest-environment jsdom
//
// The drill AT THE SHELL — M8 step 1.7.
//
// `drill.test.ts` pins the model (what a rung asks, what the ledger says about a pick, what a
// drawing has to enclose) and `drillPanel.test.ts` pins the CARD, rendered in isolation against a
// session it owns. What is left is what only a MOUNTED shell can show: that the drill has a door a
// reader can press and that the door offers each task at the rung it has REACHED, that a link opens
// a rung and a link naming a rung this build does not have is refused without opening the drill on
// nothing, that the fade survives a remount and a garbage store, and that `applyState` drops a
// grading which must not outlive its rung.
//
// Ported from `test/drillShell.test.ts`; the parity table is in `M8/parity.md`. Queried by role, by
// accessible name or by `data-card`, never by card position.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { constraintLabel } from "../src/engine/vocabulary.js";
import { DRILL_STAGES, DRILL_TASKS, runTask, taskById, taskState, type DrillTask } from "../src/shell/drill.js";
import { PROGRESS_KEY, readProgress } from "../src/shell/drillProgress.js";
import { encodeShell } from "../src/shell/viewState.js";
import { mountShell2, type Shell2Handle } from "../src/shell/app.js";

/**
 * Mount a fresh app, optionally with a hash already in the address bar — which is how a shared rung
 * arrives.
 *
 * **Every mount is torn down** (`shell2State.test.ts`'s discipline): `syncHash` is a 250 ms timer on
 * `window`, so an abandoned app goes on owning one and the next test's `location.hash` would be
 * written by a shell nobody is looking at.
 */
const mounted: Shell2Handle[] = [];
function mount(hash = ""): { root: HTMLElement; app: Shell2Handle } {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  window.history.replaceState(null, "", hash === "" ? window.location.pathname : hash);
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const app = mountShell2(root);
  mounted.push(app);
  return { root, app };
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  for (const app of mounted.splice(0)) app.destroy();
  window.localStorage.clear();
});

const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T => {
  const e = root.querySelector<T>(sel);
  if (e === null) throw new Error(`no ${sel}`);
  return e;
};

/**
 * What a region SAYS, as one line — `shell2State.test.ts`'s helper.
 *
 * Every typeset formula stands for the sentence it is NAMED with: KaTeX renders each one twice, so a
 * raw `textContent` carries three copies of every symbol and buries a failure in them.
 */
function textOf(host: Element): string {
  const clone = host.cloneNode(true) as HTMLElement;
  for (const m of clone.querySelectorAll('[role="math"]')) {
    m.replaceChildren(clone.ownerDocument.createTextNode(m.getAttribute("aria-label") ?? ""));
  }
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** The drill's card — the chooser or the open rung — or null when the drill is nowhere. */
const drillCard = (root: ParentNode): HTMLElement | null => root.querySelector('[data-card="drill"]');
const theDrillCard = (root: ParentNode): HTMLElement => q(root, '[data-card="drill"]');

/** The button in `host` whose label IS `label` — never a substring, since "circle" is inside
 *  "upper semicircle" and the substring clicker silently picked the wrong one. */
const clickExact = (host: ParentNode, label: string): void => {
  const b = [...host.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim() === label);
  if (b === undefined) throw new Error(`no button labelled exactly '${label}'`);
  b.click();
};

const task = (id: string): DrillTask => {
  const t = taskById(id);
  if (t === null) throw new Error(`no task '${id}'`);
  return t;
};

/** Press the bar's Drill segment, which is the drill's only door for a reader. */
const openPicker = (app: Shell2Handle): void => app.actions().setMode("drill");

/**
 * The chooser's row for a task, found by the words on its own button.
 *
 * By `aria-label` prefix rather than by text, because `forced-downward`'s label EXTENDS
 * `oscillatory`'s (`∫ cos x/(x²+1) dx, a < 0`) — a `textContent.includes` matches both, and the row
 * a test then reads is whichever came first.
 */
function taskRow(root: ParentNode, label: string): { row: HTMLElement; open: HTMLButtonElement } {
  const open = [...root.querySelectorAll<HTMLButtonElement>('[data-card="drill"] button')].find((b) =>
    (b.getAttribute("aria-label") ?? "").startsWith(`open ${label} at stage `),
  );
  const row = open?.closest("li");
  if (open === undefined || row === null || row === undefined) throw new Error(`no chooser row for '${label}'`);
  return { row, open };
}

/** A hash for a state, refusing loudly rather than minting a link the codec would not. */
const link = (id: string, stage: (typeof DRILL_STAGES)[number]): string => {
  const enc = encodeShell(taskState(task(id), stage));
  if (!enc.ok) throw new Error(`${id}/${stage}: ${enc.reason}`);
  return enc.hash;
};

/** The ledger's constraint names, in the order the Result card lists them. */
const constraints = (root: ParentNode): string[] =>
  [...root.querySelectorAll(".checkRow .tag")].map((t) => (t.textContent ?? "").trim());

/**
 * The hypothesis disclosure's summary — the sentence a reader decides on WITHOUT opening it.
 *
 * By its own words rather than by position: the Result card carries a second disclosure (`Numerics`)
 * and a third would silently re-point an index.
 */
function checkedSummary(root: ParentNode): string {
  const s = [...root.querySelectorAll('[data-card="result"] summary')].find((x) =>
    textOf(x).startsWith("What was checked"),
  );
  if (s === undefined) throw new Error("no 'What was checked' summary");
  return textOf(s);
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The drill's own surface.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("the drill's own surface", () => {
  it("offers the four tasks, each at the rung it has reached", () => {
    // The old shell raised this from a button labelled "practise choosing a contour, with less given
    // each time"; here it is the bar's third segment and the list is the drill card's own top slot.
    const { root, app } = mount();
    expect(drillCard(root), "nothing is offered until the reader asks").toBeNull();
    openPicker(app);
    const card = theDrillCard(root);
    const rows = [...card.querySelectorAll("li")];
    expect(rows).toHaveLength(DRILL_TASKS.length);
    // Nothing cleared yet, so every task opens at stage 1 — the worked example.
    for (const li of rows) expect(textOf(li)).toContain("stage 1 of 4");
    // **Still not IN the drill**: the chooser is a session flag and `shellMode` says Drill when a
    // RUNG is open, so a reader picking a task has nothing masked and nothing to leave.
    expect(app.currentState().drill).toBeNull();
  });

  it("opens a task on its RECORD, with the drill card FIRST in the right rail", () => {
    // The card is the right rail's TOP SLOT rather than a member of `RIGHT_CARDS` (`render.ts`), so
    // the position is part of the claim: a drill card that arrived under the Result card would put
    // the rung's question below the answer to it.
    const { root, app } = mount();
    openPicker(app);
    taskRow(root, "∫ cos x/(x²+1) dx").open.click();

    const state = app.currentState();
    expect(state.drill).toEqual({ task: "oscillatory", stage: 1 });
    expect(state.mode).toBe("gallery");
    expect(state.record).toBe("jordan-cosine-kernel");

    const right = q(root, ".rail2.right");
    // The first CARD, not the first child: since M8 step 3.1b every rail opens with its own
    // fold control, which is chrome rather than a card.
    expect(right.querySelector("[data-card]")?.getAttribute("data-card")).toBe("drill");
    const card = theDrillCard(root);
    expect(textOf(card)).toContain("stage 1 of 4");
    expect(card.querySelector("li"), "the chooser is put away by the pick").toBeNull();
    // Rung i masks nothing: this is the app as it otherwise is — the record's own pieces on the left
    // and its ledger, every constraint of it, on the right.
    expect(textOf(q(root, ".rail2.left"))).toContain("the real segment");
    expect(constraints(root)).toContain(constraintLabel("KILL"));
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// What the mask DOES to the page.
//
// `drillPanel.test.ts` pins `drillMask`'s return value over all four rungs in both modes; what it
// cannot pin is that anything acts on it. A mask read by nobody leaves every one of those tests
// green with the drill giving its own answers away — which is exactly the state this shell was in
// until the three readers were wired.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("rung ii — the KILL column is MASKED, and comes back", () => {
  it("takes the KILL rows off the ledger and folds the derivation", () => {
    const { root, app } = mount();
    app.applyState(taskState(task("oscillatory"), 1));
    const before = constraints(root);
    expect(before, "rung i is the app as it otherwise is").toContain(constraintLabel("KILL"));

    app.applyState(taskState(task("oscillatory"), 2));
    const rows = constraints(root);
    // The KILL rows are gone and the others are not: a mask, not a blank.
    expect(rows.length).toBeLessThan(before.length);
    expect(rows).not.toContain(constraintLabel("KILL"));
    expect(rows).toContain(constraintLabel("LEGALITY"));
    // The derivation says which lemma kills which piece, so masking one and not the other would be
    // masking nothing.
    expect(textOf(q(root, '[data-card="derivation"]'))).toContain("Hidden");

    // **And both come back on a CHECK, whatever the answers were.** The ledger is the answer sheet
    // from that moment — `drillMask` reads `drillGraded` and not whether the reader was right, which
    // is the clause the old shell's `renderLedger` and `renderDerivation` each spelled out for
    // themselves. The grading itself is `drillPanel.test.ts`'s.
    for (const s of theDrillCard(root).querySelectorAll<HTMLSelectElement>("select")) {
      s.value = "target";
      s.dispatchEvent(new Event("change", { bubbles: true }));
    }
    clickExact(theDrillCard(root), "Check");
    expect(constraints(root)).toContain(constraintLabel("KILL"));
    expect(textOf(q(root, '[data-card="derivation"]'))).not.toContain("Hidden");
  });

  it("counts the rows the table HAS in its summary, not the rows the ledger has", () => {
    // **The mutant this kills**: the hypothesis disclosure's `${shown.length} rows` →
    // `${ledger.rows.length} rows`. `shown` is the ledger with its KILL rows filtered out, and that
    // filter is the whole of the mask on this card — so the ledger's own count promises a reader
    // deciding whether to open the disclosure rows the table cannot show, and states in a number
    // exactly the column the rung is asking them to supply.
    const t = task("oscillatory");
    const run = runTask(t);
    if (run === null) throw new Error("the drill's own record did not solve");
    const killed = run.ledger.rows.filter((r) => r.constraint === "KILL").length;
    expect(killed, "a ledger with no KILL row masks nothing, and the mutant would survive it").toBeGreaterThan(0);

    const { root, app } = mount();
    app.applyState(taskState(t, 1));
    const unmasked = constraints(root).length;
    expect(unmasked, "rung i renders the ledger the engine solved").toBe(run.ledger.rows.length);

    app.applyState(taskState(t, 2));
    const rendered = constraints(root).length;
    expect(rendered).toBe(unmasked - killed);
    // **Both numbers are read, neither is transcribed** — the rendered count from the page, the
    // unmasked one from the engine — so the day the record's ledger grows a row the claim still
    // holds rather than going stale.
    expect(checkedSummary(root)).toBe(`What was checked — ${rendered} rows`);
    expect(rendered, "the summary of a masked table must not quote the unmasked total").toBeLessThan(unmasked);
  });
});

describe("rung iii — the whole argument is masked", () => {
  it("masks the ledger, the derivation AND the value — the record's answer is the answer", () => {
    // **The VALUE card too, which a sweep survivor once said nothing was checking.** `∮ f dz` is the
    // answer in the most authoritative place on the page; leaving it up while the ledger is masked
    // would give the rung away twice over. The CONTOUR is the mask's fourth reader and is the
    // browser suite's — jsdom has no canvas — which is why that half lives in `drillInk`.
    const { root, app } = mount();
    app.applyState(taskState(task("oscillatory"), 3));
    expect(constraints(root)).toHaveLength(0);
    expect(textOf(q(root, '[data-card="result"]'))).toContain("Hidden");
    expect(textOf(q(root, '[data-card="derivation"]'))).toContain("Hidden");
    // The rung's own question is still on screen — a masked page with nothing asking anything is
    // just a broken one.
    expect(theDrillCard(root).querySelectorAll('[aria-label^="close over"]').length).toBeGreaterThan(0);
  });
});

describe("rung iv — the sandbox, and the pen", () => {
  it("lands on the record's twin with the pen on offer, and masks nothing", () => {
    // `drillPanel.test.ts` asserts the state the card ASKS for; this asserts the app is in it — the
    // pen lives in the Contour card and the card offers it in the sandbox only, so the two facts
    // meet nowhere else.
    const { root, app } = mount();
    app.applyState(taskState(task("oscillatory"), 4));
    const state = app.currentState();
    expect(state.drill).toEqual({ task: "oscillatory", stage: 4 });
    expect(state.mode).toBe("sandbox");
    expect(state.expr).toBe("exp(i*z)/(z^2 + 1)");
    expect(root.querySelector('[aria-label="draw a contour by hand"]')).not.toBeNull();
    // The goal, and the limitation — said rather than implied.
    const card = textOf(theDrillCard(root));
    expect(card).toContain("winds about the singularities exactly as the worked one does");
    expect(card).toContain("A drawn contour is fixed");
    // Nothing is hidden here: the reader's own contour is what the ledger is judging.
    expect(constraints(root)).toContain(constraintLabel("KILL"));
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// A rung opened by LINK — M7's gate clause 2, at the shell.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("a rung opened by a link", () => {
  it("opens MASKED, which is the half `drill.test.ts` cannot see", () => {
    // The model test round-trips every rung by verdict; what it cannot check is that a link arriving
    // at stage ii lands with the ledger actually masked. The rung travels in the state and the mask is
    // read off it — but nothing asserted the two meet on the way IN, where the mask is applied by a
    // render the reader never asked for.
    const two = mount(link("oscillatory", 2));
    expect(two.app.currentState().drill).toEqual({ task: "oscillatory", stage: 2 });
    const card = theDrillCard(two.root);
    expect(textOf(card)).toContain("stage 2 of 4");
    expect(card.querySelectorAll("select").length, "rung ii is the questions").toBeGreaterThan(0);
    expect(constraints(two.root)).not.toContain(constraintLabel("KILL"));
    expect(q(two.root, ".linkRefusal").hidden).toBe(true);

    const three = mount(link("indented", 3));
    expect(textOf(q(three.root, '[data-card="result"]'))).toContain("Hidden");
    expect(constraints(three.root)).toHaveLength(0);
    expect(q(three.root, ".linkRefusal").hidden).toBe(true);
  });

  it("REFUSES an unknown rung without opening the drill", () => {
    // A link naming a rung this build does not have. The refusal has its own box outside `<main>`,
    // and the drill stays shut rather than opening on a rung nothing can render: `rungBody` has
    // exactly four branches, so a ninth would fall through one of them with `state.drill` set and the
    // mask reading a stage the card is not describing.
    const payload = { v: 1, app: "ci", state: { dr: ["oscillatory", 9] } };
    const bad = `#vs=${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
    const { root, app } = mount(bad);
    expect(app.currentState().drill).toBeNull();
    expect(drillCard(root), "not the chooser either — a refusal is not an invitation").toBeNull();
    const box = q(root, ".linkRefusal");
    expect(box.hidden).toBe(false);
    // The reader's sentence, not the codec's — M8 step 2.4 put one module between them. The codec's
    // own reason still names the stage, and `test/errors.test.ts` is what pins the mapping.
    expect(box.textContent).toContain("opens practice at a stage that does not exist");
  });

  it("opens every rung of every task without refusing — the roster the gate names", () => {
    for (const t of DRILL_TASKS) {
      for (const stage of DRILL_STAGES) {
        const { root, app } = mount(link(t.id, stage));
        expect(app.currentState().drill, `${t.id}/${stage}`).toEqual({ task: t.id, stage });
        expect(q(root, ".linkRefusal").hidden, `${t.id}/${stage} refused its own link`).toBe(true);
        expect(textOf(theDrillCard(root)), `${t.id}/${stage}`).toContain(`stage ${stage} of 4`);
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The fade, and the way out.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("the fade", () => {
  it("offers the next rung once one is cleared, and survives a remount", () => {
    const first = mount();
    openPicker(first.app);
    taskRow(first.root, "∫ cos x/(x²+1) dx").open.click();
    // Reading the worked argument IS rung i's task, so moving off it clears it.
    clickExact(theDrillCard(first.root), "Next stage");
    expect(readProgress(window.localStorage).oscillatory).toBe(1);

    // A FRESH app, which knows nothing of the above: the store is the only thing carried over.
    const second = mount();
    openPicker(second.app);
    const { row, open } = taskRow(second.root, "∫ cos x/(x²+1) dx");
    expect(textOf(row)).toContain("stage 2 of 4");
    // The button's own name says the same thing, which is the half a screen reader is given.
    expect(open.getAttribute("aria-label")).toBe("open ∫ cos x/(x²+1) dx at stage 2");
    open.click();
    expect(second.app.currentState().drill).toEqual({ task: "oscillatory", stage: 2 });
  });

  it("ignores a GARBAGE store rather than un-fading or throwing", () => {
    // Absence and garbage read identically (`drillProgress.ts` rule 2). At the shell that means a
    // mount over one works and every task is offered at stage 1 — and that a rung cleared afterwards
    // REPLACES the payload rather than being written beside it, since the store is read and then
    // written on every clear.
    window.localStorage.setItem(PROGRESS_KEY, "{not json");
    const { root, app } = mount();
    expect(() => openPicker(app)).not.toThrow();
    for (const li of theDrillCard(root).querySelectorAll("li")) expect(textOf(li)).toContain("stage 1 of 4");

    taskRow(root, "∫ cos x/(x²+1) dx").open.click();
    clickExact(theDrillCard(root), "Next stage");
    expect(readProgress(window.localStorage)).toEqual({ oscillatory: 1 });
  });

  it("does not carry a GRADING into another rung, however the rung changes", () => {
    // **M7.4's defect, at the surface it was found on.** The derivation is unmasked once rung ii has
    // been checked (it is then the answer sheet), and `drillGraded` was a shell local `applyState`
    // did not clear — so a state restored while graded would show the whole argument at stage iii,
    // where the argument is exactly what is masked. `enterDrill` happened to clear it and a link did
    // not. Here the flag is `session.drillGraded` and the door is `resetTransient`, so the property
    // is structural; this is the assertion that says the door really is on the path.
    const { root, app } = mount();
    app.applyState(taskState(task("oscillatory"), 2));
    for (const s of theDrillCard(root).querySelectorAll<HTMLSelectElement>("select")) {
      s.value = "target";
      s.dispatchEvent(new Event("change", { bubbles: true }));
    }
    clickExact(theDrillCard(root), "Check");
    expect(app.session().drillGraded).toBe(true);
    expect(textOf(theDrillCard(root))).toContain("not all correct");
    expect(root.querySelectorAll("[data-feedback]").length, "the answer sheet is on screen").toBeGreaterThan(0);

    // Straight to rung iii by restoring the state, as a link does.
    app.applyState(taskState(task("oscillatory"), 3));
    expect(app.session().drillGraded).toBe(false);
    expect(app.session().drillAnswers).toEqual({});
    expect(root.querySelectorAll("[data-feedback]"), "the answer sheet is gone rather than half-filled").toHaveLength(0);
    expect(textOf(theDrillCard(root))).toContain("stage 3 of 4");
    // **And this is what the grading would have bought** — a grading that outlived its rung unmasks
    // the derivation, at the rung where the argument is exactly what is masked.
    expect(textOf(q(root, '[data-card="derivation"]')), "the derivation must stay masked").toContain("Hidden");
    expect(constraints(root)).toHaveLength(0);
  });

  it("LEAVES the drill on request, unmasking everything", () => {
    // **This cannot see whether Explore puts the CHOOSER away**, though the assertion below says so
    // in its own words: the rung is reached through `applyState`, which never sets
    // `session.drillPicker`, so the flag is false throughout and `setMode`'s clear of it is removing
    // a `false`. The test below presses the chooser's only door first, which is the one path on
    // which that line does anything.
    const { root, app } = mount();
    app.applyState(taskState(task("oscillatory"), 2));
    expect(constraints(root), "masked to begin with").not.toContain(constraintLabel("KILL"));
    clickExact(theDrillCard(root), "Leave practice");
    expect(app.currentState().drill).toBeNull();
    expect(drillCard(root), "the card goes with the rung, and the chooser does not take its place").toBeNull();
    // Every row is back, KILL included, and the derivation with them.
    expect(constraints(root)).toContain(constraintLabel("KILL"));
    expect(textOf(q(root, '[data-card="derivation"]'))).not.toContain("Hidden");
  });

  it("puts the CHOOSER away on Explore, not only the rung", () => {
    // **The mutant this kills**: `setMode`'s `session.drillPicker = false`, the line before its final
    // `commit`, removed. Pressing Drill with no rung open is the chooser's only door and the only
    // thing that raises the flag, so it is also the only route on which clearing it is observable —
    // reaching a rung by `applyState` or by a link never sets it, which is why the test above claims
    // the property and passes without it. A list left standing after the reader said Explore is a
    // menu outliving its mode, over the page they asked to be given back.
    const { root } = mount();
    const press = (label: string): void => clickExact(q(root, '[data-testid="mode"]'), label);

    press("Drill");
    expect(theDrillCard(root).querySelectorAll("li"), "the chooser is on screen to be put away").toHaveLength(
      DRILL_TASKS.length,
    );

    press("Explore");
    expect(drillCard(root), "Explore means the same thing from the chooser as from a rung").toBeNull();
  });
});
