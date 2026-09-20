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
 *
 * **The name FALLS BACK to `data-tex`** — M8 step 3.6. A node carries an `aria-label` only where the
 * caller has a real plain-text twin now; everywhere else the label used to be the LaTeX source, and
 * that is what this helper was reading. `data-tex` is where that source went, so `label ?? tex` is
 * character for character the string this helper used to build — without it every formula on the
 * page reads as the empty string here, and a mask test asking whether the integral is still on
 * screen would pass with the whole card blank.
 */
function textOf(host: Element): string {
  const clone = host.cloneNode(true) as HTMLElement;
  for (const m of clone.querySelectorAll('[role="math"]')) {
    const said = m.getAttribute("aria-label") ?? m.getAttribute("data-tex") ?? "";
    m.replaceChildren(clone.ownerDocument.createTextNode(said));
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
/**
 * Press Drill with no rung open — which since M8 step 3.4 opens the FRONT DOOR's Practice tab.
 *
 * The chooser was a rail card between steps 1.7 and 3.4 and is now a tab in the dialog the app's
 * other "which one shall I open?" already lives in, so these tests read the dialog. The helper is
 * the only thing that knows that, which is why the assertions below did not have to change with it.
 */
const openPicker = (app: Shell2Handle): void => app.actions().setMode("drill");

/** The Practice list, wherever the dialog mounted it — it is a sibling of the shell, not a child. */
const practicePanel = (): HTMLElement => {
  const el = document.querySelector<HTMLElement>(".doorTasks");
  if (el === null) throw new Error("the Practice list is not on screen");
  return el;
};

/**
 * The chooser's row for a task, found by the words on its own button.
 *
 * By `aria-label` prefix rather than by text, because `forced-downward`'s label EXTENDS
 * `oscillatory`'s (`∫ cos x/(x²+1) dx, a < 0`) — a `textContent.includes` matches both, and the row
 * a test then reads is whichever came first.
 */
function taskRow(_root: ParentNode, label: string): { row: HTMLElement; open: HTMLButtonElement } {
  const open = [...document.querySelectorAll<HTMLButtonElement>(".doorTasks button")].find((b) =>
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
    const rows = [...practicePanel().querySelectorAll("li")];
    expect(rows).toHaveLength(DRILL_TASKS.length);
    // Nothing cleared yet, so every task opens at stage 1 — the worked example.
    for (const li of rows) expect(textOf(li)).toContain("stage 1 of 4");
    // **The rail card is still absent**, which is the shape of the change: the drill's card has one
    // meaning again (a rung is open) rather than two (a rung, or a menu) sharing an id.
    expect(drillCard(root), "the chooser is the dialog's, not the rail's").toBeNull();
    // **Still not IN the drill**: `shellMode` says Drill when a RUNG is open, so a reader picking a
    // task has nothing masked and nothing to leave.
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

    // **THE LEFT RAIL WAS GIVING THE ANSWER AWAY, in four places** — M8 step 3.4, found by opening
    // the rung in a browser and reading the page rather than the card. The drill's own sentence at
    // this rung is *"Only the integral is given"*, and what was given was: the closed form
    // (`= π/e`) on the Target card, its strategy line (*closed by $\Gamma_R$ in the half-plane
    // $a\operatorname{Im} z \ge 0$*, which is the prediction's answer in words), the Contour
    // card's piece list (*the $R \to \infty$ semicircle (upper when $a > 0$)*), the Singularities
    // table's `Ind(γ, z₀)` column (1 beside the upper pole, 0 beside the lower), and the
    // accumulator drawing the record's own semicircle with `1.15565557035` under it — `π/e` to
    // eleven figures. Older than this step; the step is what made it acute, because a forced choice
    // whose answer is three inches to the left is a reading exercise.
    //
    // The accumulator's half is asserted in `strip.test.ts` rather than here: the strip draws on a
    // COALESCED frame (`schedule`, not `drawNow`), so in jsdom it has drawn nothing at all by the
    // time this runs — and an assertion that passes because a canvas is empty for an unrelated
    // reason is the vacuity this file's own style forbids.
    const target = textOf(q(root, '[data-card="target"]'));
    expect(target, "the integral IS the question and stays").toContain("cos");
    for (const given of ["Jordan", "half-plane", "pi/e"]) {
      expect(target, `the target card still says '${given}'`).not.toContain(given);
    }
    expect(textOf(q(root, '[data-card="contour"]'))).toContain("Hidden");
    // The poles STAY — at the rung whose question is "which contour?" they are the question's data,
    // which is `stageView.ts`'s own reason for still drawing them — and the winding column goes,
    // because which of them the record's contour encloses is its answer.
    const sing = q(root, '[data-card="singularities"]');
    const winding = (): string[] =>
      [...sing.querySelectorAll("tbody tr")].map((tr) => (tr.querySelector("td:last-child")?.textContent ?? "").trim());
    expect(sing.querySelectorAll("tbody tr").length, "the poles are the question's data").toBeGreaterThan(0);
    // The em-dash `integrateContour` already prints for a winding nobody decided — the same cell,
    // rather than a second empty state that could come to differ from it.
    expect(winding().every((w) => w === "—"), `windings read ${winding().join("/")}`).toBe(true);

    // The rung's own question is still on screen — a masked page with nothing asking anything is
    // just a broken one. Since M8 step 3.4 that question is the PREDICTION, and the contour menu
    // does not exist until it is answered, so the assertion is the prediction's options and the
    // menu's appearance afterwards.
    expect(theDrillCard(root).querySelectorAll("[data-predict-option]").length).toBeGreaterThan(0);

    // **The pairing, and it is what makes every line above a claim about the RUNG**: the same
    // record outside the drill shows all of it. Asserted LAST, because leaving the drill takes the
    // card with it.
    app.applyState({ ...app.currentState(), drill: null });
    // In jsdom KaTeX does not typeset, so what a card's `textContent` carries is the LaTeX SOURCE
    // and the `label` beside it — which is why the closed form reads `pi/e` here and `π/e` on
    // screen. Asserted in the form this environment actually produces rather than the one a browser
    // would, because a test that asserted the rendered glyph would pass by never finding it.
    const open = textOf(q(root, '[data-card="target"]'));
    expect(open, "the closed form is back").toContain("pi/e");
    expect(open, "and so is the strategy line the prediction asks about").toContain("half-plane");
    expect(winding(), "and the windings are back — 1 about the enclosed pole").toContain("1");
    expect(textOf(q(root, '[data-card="contour"]')), "the piece list is back").not.toContain("Hidden");
    expect(drillCard(root), "and the drill card goes with the rung").toBeNull();
  });
});

describe("rung iii's PREDICTION — M8 step 3.4", () => {
  /** The prediction's option buttons, and the reveal once there is one. */
  const options = (root: ParentNode): HTMLButtonElement[] =>
    [...theDrillCard(root).querySelectorAll<HTMLButtonElement>("[data-predict-option]")];
  const menu = (root: ParentNode): Element[] => [...theDrillCard(root).querySelectorAll('[aria-label^="close over"]')];
  const reveal = (root: ParentNode): HTMLElement | null =>
    theDrillCard(root).querySelector<HTMLElement>("[data-predict-verdict]");
  /** The reveal, or a refusal — so a missing one names itself rather than reading as empty text. */
  function said(root: ParentNode): HTMLElement {
    const el = reveal(root);
    if (el === null) throw new Error("the prediction was answered and there is no reveal");
    return el;
  }

  it("asks BEFORE the menu exists, which is the whole ordering", () => {
    // Research 02 §7: commit to an answer, then be shown the argument. A menu on screen beside the
    // question would let a reader read the options for the answer — which is the one thing the
    // ordering is for — so the assertion is that the menu is ABSENT and not merely below it.
    const { root, app } = mount();
    app.applyState(taskState(task("oscillatory"), 3));
    expect(`options ${options(root).length}, menu ${menu(root).length}`).toBe("options 3, menu 0");
    options(root)[0].click();
    expect(`after answering — menu ${menu(root).length > 0}`).toBe("after answering — menu true");
  });

  it("routes the QUESTION off the ledgers, not off a declared field", () => {
    // The three kernel tasks get the half-plane question because at least one semicircle closes with
    // the target on it; `indented` gets the enclosure question because NEITHER does — its pole sits
    // on the real axis, so both semicircles fail LEGALITY before any limit is taken. Measured over
    // the four, which is the pairing: a router that asked one question everywhere would fail here.
    const seen: string[] = [];
    for (const id of ["rational", "oscillatory", "forced-downward", "indented"]) {
      const { root, app } = mount();
      app.applyState(taskState(task(id), 3));
      const ask = theDrillCard(root).querySelector("[data-predict]");
      seen.push(`${id}:${ask?.getAttribute("data-predict") ?? "none"}/${options(root).length}`);
    }
    expect(seen).toEqual([
      "rational:half-plane/3",
      "oscillatory:half-plane/3",
      "forced-downward:half-plane/3",
      "indented:encloses/2",
    ]);
  });

  it("grades against the two closures, and gives the LEDGER's row as the reason", () => {
    // `oscillatory` is `e^{iz}/(z²+1)`: the upper semicircle closes and the lower diverges, so the
    // right answer is `upper` and the reason is the lower side's own failing row. Nothing here
    // compares strings against a declared answer — `predictionFor` runs both templates.
    const { root, app } = mount();
    app.applyState(taskState(task("oscillatory"), 3));
    const lower = options(root).find((b) => b.getAttribute("data-predict-option") === "lower");
    expect(lower).toBeDefined();
    lower?.click();
    const shown = said(root);
    expect(`verdict ${shown.getAttribute("data-predict-verdict") ?? "none"}`).toBe("verdict wrong");
    // The ledger's own sentence, which is what makes this a reason rather than a mark.
    expect(textOf(shown)).toContain("the lower semicircle diverges");
    // And the right option is NAMED even on a wrong answer, so a reader knows what the app agreed
    // with rather than only that they did not.
    expect(textOf(shown)).toContain("the upper half-plane");
  });

  it("says `either` where the ledgers do, with both values rather than a shrug", () => {
    // Measured: `1/(z²+1)` closes in BOTH half-planes and reports π either way — nothing forces the
    // side without a kernel. There is then no failing row to quote, so the reason is the two values,
    // which is the only form in which "either" is a claim.
    const { root, app } = mount();
    app.applyState(taskState(task("rational"), 3));
    options(root).find((b) => b.getAttribute("data-predict-option") === "either")?.click();
    const shown = said(root);
    expect(`verdict ${shown.getAttribute("data-predict-verdict") ?? "none"}`).toBe("verdict right");
    expect(textOf(shown)).toContain("Both close");
  });

  it("answers the enclosure question from the record's own windings", () => {
    // `indented` is `e^{iz}/z`: the closed contour encloses NOTHING, and its whole value comes from
    // the limit the indentation takes. A reader who expects a residue is exactly the reader this
    // record is for, so `yes` is the interesting wrong answer.
    const { root, app } = mount();
    app.applyState(taskState(task("indented"), 3));
    options(root).find((b) => b.getAttribute("data-predict-option") === "yes")?.click();
    const shown = said(root);
    expect(`verdict ${shown.getAttribute("data-predict-verdict") ?? "none"}`).toBe("verdict wrong");
    expect(textOf(shown)).toContain("No singularity is enclosed");
  });

  it("is recorded ONCE and not asked again on a revisit", () => {
    // `withPrediction` is first-answer-wins, so a second visit would either re-record the visit or
    // refuse the click with no explanation. The rung shows the reveal straight away instead — and
    // the SESSION's own pick is gone (a link carries no answer), so what is being read is the store.
    const first = mount();
    first.app.applyState(taskState(task("oscillatory"), 3));
    options(first.root).find((b) => b.getAttribute("data-predict-option") === "upper")?.click();
    expect(readProgress(window.localStorage).oscillatory?.predicted).toBe(true);

    const second = mount();
    second.app.applyState(taskState(task("oscillatory"), 3));
    expect(`revisit — reveal ${reveal(second.root) !== null}, menu ${menu(second.root).length > 0}`).toBe(
      "revisit — reveal true, menu true",
    );
    // Every option is disabled, so the question cannot be answered twice — and the pairing is the
    // FIRST visit above, where they were live.
    expect(options(second.root).every((b) => b.disabled)).toBe(true);
    // A wrong first answer is still an answer: it is not re-offered until it is right.
    const third = mount();
    third.app.applyState(taskState(task("rational"), 3));
    options(third.root).find((b) => b.getAttribute("data-predict-option") === "upper")?.click();
    expect(readProgress(window.localStorage).rational?.predicted).toBe(false);
    const fourth = mount();
    fourth.app.applyState(taskState(task("rational"), 3));
    expect(options(fourth.root).every((b) => b.disabled)).toBe(true);
  });

  it("does not carry a pick into another rung or another task", () => {
    // M7.4's finding in its own shape: `drillGraded` outlived its rung because a shell local was not
    // cleared on `applyState`. `drillPredicted` is in the session for exactly that reason, so the
    // claim is that leaving the rung takes the pick with it.
    const { root, app } = mount();
    app.applyState(taskState(task("oscillatory"), 3));
    options(root).find((b) => b.getAttribute("data-predict-option") === "upper")?.click();
    expect(app.session().drillPredicted).toBe("upper");
    app.applyState(taskState(task("forced-downward"), 3));
    expect(app.session().drillPredicted).toBeNull();
    // And the new task's question is live, because its own outcome is not on the record yet.
    expect(options(root).every((b) => !b.disabled)).toBe(true);
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
    expect(readProgress(window.localStorage).oscillatory).toEqual({ stage: 1 });

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
    for (const li of practicePanel().querySelectorAll("li")) expect(textOf(li)).toContain("stage 1 of 4");

    taskRow(root, "∫ cos x/(x²+1) dx").open.click();
    clickExact(theDrillCard(root), "Next stage");
    expect(readProgress(window.localStorage)).toEqual({ oscillatory: { stage: 1 } });
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

  it("opens the chooser on the front door's PRACTICE tab, and leaves nothing behind", () => {
    // **The test this replaces guarded `session.drillPicker = false` in `setMode`**, and that flag
    // is gone with the rail chooser: pressing Drill with no rung open now opens the front door on
    // its Practice tab, which is where the app's other "which one shall I open?" already lives.
    //
    // The old defect cannot recur in its old shape, and measuring is how that was established
    // rather than assumed: the dialog is MODAL and `inert`s the page behind it, so a reader cannot
    // reach the bar to press Explore while the list is up — the sequence the old test drove is one
    // only a test can perform. What replaces it is the two claims that are now load-bearing: the
    // door opens on the right TAB (a bar segment naming Practice that showed Records would be one
    // control opening the wrong panel), and dismissing it leaves no flag set.
    const { root, app } = mount();
    const press = (label: string): void => clickExact(q(root, '[data-testid="mode"]'), label);

    press("Drill");
    expect(practicePanel().querySelectorAll("li"), "the tasks are on screen to be chosen").toHaveLength(
      DRILL_TASKS.length,
    );
    const selected = [...document.querySelectorAll('[role="tab"]')].filter((t) => t.getAttribute("aria-selected") === "true");
    expect(selected.map((t) => t.getAttribute("data-tab"))).toEqual(["practice"]);
    expect(app.currentState().drill, "choosing is not yet being IN the drill").toBeNull();

    // Dismissing is the reader's own Escape, and it must leave the shell's flag down — the dialog
    // and the session agreeing is what `close` exists for. Dispatched on the dialog rather than on
    // the document, which is where `modal.ts` listens and deliberately so: it stops the event
    // there, because the stage's own Escape abandons a half-drawn pen path and a reader shutting a
    // dialog over the stage did not ask for that.
    practicePanel().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(app.session().frontDoorOpen).toBe(false);
    expect(drillCard(root), "no rung was opened, so no card").toBeNull();
  });
});
