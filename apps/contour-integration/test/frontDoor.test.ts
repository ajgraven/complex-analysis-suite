// @vitest-environment jsdom
//
// The front door — M8 step 1.8.
//
// **What is asserted here is the PANEL, not the container and not the corpus.**
// `test/modal.test.ts` already pins the focus trap, `inert`, Escape, the backdrop click and the
// focus return, and `test/records.test.ts` already pins that `frontRow` is eight distinct ranks and
// that every record names one of the eight groups. Re-checking either would be a second copy of a
// claim that has an owner. What has no owner until this file is the reader's side of it: that the
// eight classics are listed in rank order, that the eight groups account for all 28 records, that a
// group's cards are not built until it is opened, that the arrows move by a row rather than by one,
// and that opening a card lands on the record.
import { afterEach, describe, expect, it } from "vitest";

import { FAMILIES } from "../src/families/index.js";
import { TAXONOMY_SECTIONS } from "../src/families/schema.js";
import { createFrontDoor, frontDoorState, FRONT_DOOR_GROUPS, FRONT_ROW, type FrontDoorDialog } from "../src/shell/frontDoor.js";
import { defaultState, resolveState, type ShellState } from "../src/shell/state.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import { mathPlain, splitMath } from "../src/shell/math.js";
import { DRILL_TASKS, type DrillTask } from "../src/shell/drill.js";
import { PROGRESS_KEY, stageFor, type DrillProgress, type KeyStore } from "../src/shell/drillProgress.js";

interface Harness {
  readonly dialog: FrontDoorDialog;
  readonly opener: HTMLButtonElement;
  /** `apply` and `close`, in the order they were called — the shut-before-apply claim. */
  readonly calls: string[];
  readonly applied: ShellState[];
  /** Which records were asked for a thumbnail, in order. The laziness measurement. */
  readonly thumbed: string[];
  readonly base: ShellState;
  /** Which drill tasks were handed to the shell, and at which rung. */
  readonly opened: { readonly task: DrillTask; readonly stage: number }[];
  /** Every key the progress store was asked for — the read-it-ONCE measurement. */
  readonly reads: string[];
}

let live: FrontDoorDialog | null = null;

afterEach(() => {
  live?.destroy();
  live = null;
  document.body.replaceChildren();
});

/**
 * A progress store carrying exactly the given progress.
 *
 * An object rather than `localStorage`: `drillProgress.ts` takes the store as a parameter precisely
 * so a test can hand it one, and a shared `localStorage` would leak one case's rungs into the next.
 * Every `getItem` is recorded, which is what makes "read once for the whole list" measurable rather
 * than a sentence in a comment.
 */
function fakeStore(progress: DrillProgress, reads: string[]): KeyStore {
  const data = new Map<string, string>([[PROGRESS_KEY, JSON.stringify(progress)]]);
  return {
    getItem: (key) => {
      reads.push(key);
      return data.get(key) ?? null;
    },
    setItem: (key, value) => void data.set(key, value),
  };
}

/**
 * A mounted dialog, with a stub thumbnail.
 *
 * **The stub returns a FRESH canvas on every call**, which is the contract `frontDoor.ts` states and
 * the reason it states it: the eight front-row records appear twice, and one DOM node cannot be in
 * two places. A stub that returned one cached element per record would make the front row lose its
 * picture the moment a group was expanded, and the test below would not see it.
 */
function mount(opts: { readonly state?: ShellState; readonly progress?: DrillProgress } = {}): Harness {
  const page = document.createElement("main");
  const opener = document.createElement("button");
  opener.textContent = "Choose a record";
  page.append(opener);
  const host = document.createElement("div");
  document.body.append(page, host);

  const base = opts.state ?? defaultState(circleTemplate([0, 0], 2));
  const calls: string[] = [];
  const applied: ShellState[] = [];
  const thumbed: string[] = [];
  const opened: { task: DrillTask; stage: number }[] = [];
  const reads: string[] = [];
  const progress = opts.progress ?? {};
  const dialog = createFrontDoor(host, page, {
    state: () => base,
    apply: (next) => {
      calls.push("apply");
      applied.push(next);
    },
    close: () => calls.push("close"),
    thumbnail: (id) => {
      thumbed.push(id);
      return document.createElement("canvas");
    },
    progressStore: () => fakeStore(progress, reads),
    openTask: (task, stage) => {
      calls.push("openTask");
      opened.push({ task, stage });
    },
  });
  live = dialog;
  return { dialog, opener, calls, applied, thumbed, base, opened, reads };
}

const dialogOf = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="dialog"]');

/** The front row's card controls, in document order. */
const frontCards = (): HTMLElement[] => [
  ...(dialogOf()?.querySelectorAll<HTMLElement>('[data-grid="front"] button[data-door]') ?? []),
];

/** Every card control anywhere in the panel. */
const allCards = (): HTMLElement[] => [...(dialogOf()?.querySelectorAll<HTMLElement>("button[data-door]") ?? [])];

/**
 * A group's disclosure button, found by its attribute VALUE rather than by a selector.
 *
 * The section names carry `[`, `]`, `,` and `π`, and this jsdom has no `CSS.escape` to build a
 * selector out of them safely — so the attribute is compared in JavaScript, which needs no escaping
 * and cannot silently match the wrong group.
 */
function disclosure(section: string): HTMLElement {
  const found = [...(dialogOf()?.querySelectorAll<HTMLElement>("[data-disclosure]") ?? [])].find(
    (b) => b.getAttribute("data-disclosure") === section,
  );
  expect(found, `no disclosure for '${section}'`).toBeDefined();
  return found as HTMLElement;
}

/**
 * The longest plain-text run of a `$…$` sentence — what a reader sees outside the mathematics.
 *
 * Through `splitMath`, which is the app's single reader of the delimiter rule: a second copy here
 * would be a second place for that rule to live, and the rule is what decides whether a stray dollar
 * swallows the rest of the sentence. Every record's contour phrase and point carry mathematics, and
 * several BEGIN with it, so taking the text before the first `$` finds an empty string for five of
 * the eight.
 */
function longestPlain(sentence: string): string {
  const plain = splitMath(sentence)
    .filter((_, i) => i % 2 === 0)
    .map((s) => s.trim())
    .sort((a, b) => b.length - a.length);
  return plain[0] ?? "";
}

/** Send a key to whatever has focus. Returns `false` when the handler called `preventDefault`. */
function press(key: string): boolean {
  const target = document.activeElement ?? document.body;
  return target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("the front door — what it lists", () => {
  it("leads with the eight front-row records, in `frontRow` order", () => {
    // The defect: a front row drawn in corpus order. It looks perfectly reasonable — eight cards,
    // all of them classics — and the rank field, which is the one thing that says which classic a
    // reader should meet FIRST, would be doing nothing at all. So the ids are read off the DOM and
    // compared against the ranks, not against a list written down here.
    const { dialog } = mount();
    dialog.open();
    const shown = frontCards().map((b) => b.getAttribute("data-door"));
    expect(shown.length, "the front row is not eight cards").toBe(8);
    // The RANKS as drawn, read back through the corpus: 1, 2, … 8 and each one once. Not a list of
    // ids written down here, which would go stale the first time a rank moved.
    const ranks = shown.map((id) => FAMILIES.find((f) => f.id === id)?.frontRow);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(FRONT_ROW.map((f) => f.id)).toEqual(shown);

    // **This is an obligation on the panel rather than a discriminating test, and measuring said so.**
    // The eight ranks currently run in the same order as the records do in `FAMILIES`, so removing
    // the sort would leave the assertion above green. It is kept because the coincidence is the
    // corpus's and not the panel's — a record inserted or a rank moved makes it bite immediately —
    // and the line below is what says so out loud instead of the claim quietly stopping to mean
    // anything.
    expect(
      FAMILIES.filter((f) => f.frontRow !== undefined).map((f) => f.id),
      "corpus order and rank order have parted company — the sort is now observable, and this note is stale",
    ).toEqual(shown);
  });

  it("files all 28 records under the eight groups, with the count on each disclosure", () => {
    // Two claims in one, and the second is what makes the first worth anything: a panel that listed
    // eight groups and dropped a record would still list eight groups. The counts come off the
    // SUMMARIES a reader can see, and their total is checked against the corpus.
    const { dialog } = mount();
    dialog.open();
    const buttons = [...(dialogOf()?.querySelectorAll<HTMLElement>("[data-disclosure]") ?? [])];
    expect(buttons.length).toBe(8);
    expect(buttons.map((b) => b.getAttribute("data-disclosure"))).toEqual([...TAXONOMY_SECTIONS]);

    let total = 0;
    for (const b of buttons) {
      const shown = /\((\d+)\)\s*$/.exec(b.textContent ?? "");
      expect(shown, `no count on '${b.getAttribute("data-disclosure") ?? "?"}'`).not.toBeNull();
      const n = Number(shown?.[1]);
      const section = b.getAttribute("data-disclosure") ?? "";
      expect(n, `the count on '${section}' is not the corpus's`).toBe(
        FAMILIES.filter((f) => f.taxonomySection === section).length,
      );
      total += n;
    }
    expect(total, "the eight groups do not account for the whole corpus").toBe(28);
    expect(total).toBe(FAMILIES.length);
    // And the module's own partition, so a group drawn from the records rather than from the
    // taxonomy could not quietly drop an empty one.
    expect(FRONT_DOOR_GROUPS.flatMap((g) => g.families).length).toBe(28);
    expect(FRONT_ROW.length).toBe(8);
  });

  it("gives every card its identity, its contour phrase, its point and a citation", () => {
    // The plan's four lines. Asserted on the front row by CONTENT rather than by element count: a
    // card that drew four empty paragraphs would pass a structural check and say nothing.
    const { dialog } = mount();
    dialog.open();
    for (const f of FRONT_ROW) {
      const card = dialogOf()?.querySelector<HTMLElement>(`[data-grid="front"] [data-record="${f.id}"]`);
      expect(card, `no card for '${f.id}'`).not.toBeNull();
      const text = card?.textContent ?? "";
      // The contour phrase and the point, with `$…$` stripped by `mathText` — so a fragment outside
      // the delimiters is what is looked for, which is what a reader actually sees.
      expect(longestPlain(f.description.contour).length, `'${f.id}' has an all-math contour phrase`).toBeGreaterThan(3);
      expect(text, `'${f.id}' is missing its contour phrase`).toContain(longestPlain(f.description.contour));
      expect(text, `'${f.id}' is missing its point`).toContain(longestPlain(f.description.point));
      const cite = f.description.citations[0];
      expect(text, `'${f.id}' is missing its citation`).toContain(cite.book);
      expect(text, `'${f.id}' is missing the citation's location`).toContain(cite.where);
      // The thumbnail SLOT is there and the injected canvas landed in it.
      expect(card?.querySelector(`[data-thumb="${f.id}"] canvas`), `'${f.id}' has no thumbnail`).not.toBeNull();
    }
  });

  it("prints the target WITH its answer, typeset, and never `$…$` source", () => {
    // The two halves of the plan's `\int...=\frac{\pi}{\sqrt2}`. The first is that the answer is
    // there at all — a card showing only the integral is a list of problems rather than a gallery of
    // worked ones — and it is read out of KaTeX's own MathML, which carries the source, so this is a
    // claim about what was TYPESET rather than about a string the module happened to build.
    const { dialog } = mount();
    dialog.open();
    const card = dialogOf()?.querySelector<HTMLElement>('[data-grid="front"] [data-record="semicircle-quartic"]');
    const source = card?.querySelector(".katex-mathml")?.textContent ?? "";
    expect(source, "A6's card typesets no identity").not.toBe("");
    const rendered = card?.querySelector<HTMLElement>(".math") ?? null;
    expect(rendered, "the identity is not a `math` node").not.toBeNull();
    // The accessible name is the PLAIN form, not the LaTeX — `math()`'s `label`, the app's rule for
    // every formula. It must carry both sides, which is what makes the `=` audible.
    const label = rendered?.getAttribute("aria-label") ?? "";
    expect(label, "the identity's name carries no integral").toContain("∫");
    expect(label, "the identity's name carries no answer").toContain("=");
    expect(label, "raw LaTeX reached an accessible name").not.toContain("\\frac");

    // And no delimiter reached the screen anywhere in the panel. `.katex-mathml` holds the source, so
    // it is stripped before reading — otherwise this would be measuring KaTeX's own output.
    const clone = dialogOf()?.cloneNode(true) as HTMLElement;
    for (const m of clone.querySelectorAll(".katex-mathml")) m.remove();
    expect(clone.textContent ?? "", "LaTeX delimiters reached the screen").not.toContain("$");
  });

  it("draws no refusal badge, because no record's FIRST fixture documents one", () => {
    // The measurement `frontDoor.ts` records, asserted rather than written in a comment. A card shows
    // fixture 0, and the corpus's only two refusing fixtures are D3's fourth and fifth — so the card's
    // refusal branch is unreachable today. Both halves are here: the corpus's, which is what makes the
    // branch dead, and the panel's, which is what a reader sees. The day a record lands a refusing
    // first fixture the first goes red and the second becomes a real test of the badge.
    const { dialog } = mount();
    dialog.open();
    const refusingFirst = FAMILIES.filter((f) => f.golden[0].refuses !== undefined).map((f) => f.id);
    expect(refusingFirst, "a record's first fixture now documents a refusal — the card must show it").toEqual([]);
    expect(FAMILIES.some((f) => f.golden.some((g) => g.refuses !== undefined)), "no fixture refuses at all — the branch is pointless").toBe(
      true,
    );
    expect(dialogOf()?.querySelectorAll('[data-level="⚠"]').length).toBe(0);
  });

  it("names every card control by its record's TITLE, not by its formula", () => {
    // The bar's argument, applied: KaTeX's HTML is positioned spans that read as nonsense, so a
    // control whose name came from the card's contents would be announced as a wall of them. The
    // card's prose stays outside the button precisely so it is still reachable in document order.
    const { dialog } = mount();
    dialog.open();
    for (const b of frontCards()) {
      const id = b.getAttribute("data-door") ?? "";
      const family = FAMILIES.find((f) => f.id === id);
      expect(b.getAttribute("aria-label")).toBe(`open ${family?.title ?? "?"}`);
      expect(b.textContent ?? "", "the control's own text is empty").not.toBe("");
    }
  });
});

describe("the front door — the groups are lazy", () => {
  it("builds no group's cards until it is opened", () => {
    // `modal.ts`'s reason one level down, and MEASURED rather than argued: the panel asks for a
    // thumbnail per card and typesets an identity per card, so building all eight groups on open is
    // 28 of each for the twenty records most readers never look at. The thumbnail count is the half
    // a stub can see.
    const { dialog, thumbed } = mount();
    dialog.open();
    expect(thumbed.length, "the closed groups drew their cards anyway").toBe(8);
    expect(allCards().length).toBe(8);

    const section = "Rational functions on ℝ";
    const button = disclosure(section);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    const region = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(region, "the disclosure controls nothing").not.toBeNull();
    expect(region?.hasAttribute("hidden"), "a collapsed region is not hidden").toBe(true);
    expect(region?.querySelectorAll("button[data-door]").length).toBe(0);

    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(region?.hasAttribute("hidden")).toBe(false);
    const inGroup = FAMILIES.filter((f) => f.taxonomySection === section).map((f) => f.id);
    expect([...(region?.querySelectorAll<HTMLElement>("button[data-door]") ?? [])].map((b) => b.getAttribute("data-door"))).toEqual(
      inGroup,
    );
    // The cost is exactly this group's, not the whole corpus's.
    expect(thumbed.length).toBe(8 + inGroup.length);

    // Collapsing takes them away again, so "open" is one fact rather than a flag beside a DOM that
    // has stopped agreeing with it.
    button.click();
    expect(region?.querySelectorAll("button[data-door]").length).toBe(0);
    expect(region?.hasAttribute("hidden")).toBe(true);
  });

  it("gives a front-row record a thumbnail in BOTH places", () => {
    // The contract the repeats impose, stated as an assertion rather than as a comment: a provider
    // that returned one cached element per record would move the picture out of the front row when
    // the group opened, leaving a card that is simply blank. Two nodes, and they are not the same
    // node.
    const { dialog } = mount();
    dialog.open();
    const id = "semicircle-quartic";
    const front = dialogOf()?.querySelector(`[data-grid="front"] [data-thumb="${id}"] canvas`) ?? null;
    disclosure("Rational functions on ℝ").click();
    const inGroup = dialogOf()?.querySelector(`[data-grid="g1"] [data-thumb="${id}"] canvas`) ?? null;
    expect(front, "the front-row card lost its thumbnail").not.toBeNull();
    expect(inGroup, "the group card has no thumbnail").not.toBeNull();
    expect(front).not.toBe(inGroup);
  });
});

describe("the front door — the keyboard", () => {
  it("moves by ONE across a row and by a whole row down it", () => {
    // The grid is a grid, so Down that moved by one would walk the row a reader is already on and
    // Down would mean the same thing as Right. The step is `data-columns`, which is the number the
    // stylesheet must lay the grid out with — read off the DOM here so the two cannot drift silently.
    const { dialog } = mount();
    dialog.open();
    const cards = frontCards();
    const grid = dialogOf()?.querySelector<HTMLElement>('[data-grid="front"]');
    const columns = Number(grid?.getAttribute("data-columns"));
    expect(columns, "the grid declares no column count").toBeGreaterThan(1);
    expect(cards.length).toBeGreaterThan(columns);

    cards[0].focus();
    expect(press("ArrowRight"), "the handler did not take the key").toBe(false);
    expect(document.activeElement).toBe(cards[1]);
    press("ArrowLeft");
    expect(document.activeElement).toBe(cards[0]);

    press("ArrowDown");
    expect(document.activeElement, "Down moved by one rather than by a row").toBe(cards[columns]);
    press("ArrowUp");
    expect(document.activeElement).toBe(cards[0]);
  });

  it("clamps at the edges rather than wrapping", () => {
    // Wrapping Right at the end of a row onto the start of the next makes one gesture mean two
    // things, and Down off the bottom would otherwise have to pick a card — a different one every
    // time the corpus changes length.
    const { dialog } = mount();
    dialog.open();
    const cards = frontCards();
    cards[0].focus();
    press("ArrowUp");
    expect(document.activeElement, "Up from the first row left the row").toBe(cards[0]);
    press("ArrowLeft");
    expect(document.activeElement).toBe(cards[0]);

    cards[cards.length - 1].focus();
    press("ArrowDown");
    expect(document.activeElement).toBe(cards[cards.length - 1]);
    press("ArrowRight");
    expect(document.activeElement).toBe(cards[cards.length - 1]);
  });

  it("keeps the arrows inside one grid", () => {
    // Down from the last front-row card must not drop into a group the reader has just opened: Tab
    // is the move between regions and the modal's trap already owns it. Asserted with a group OPEN,
    // because with every group shut there is nowhere to fall to and the claim would be vacuous.
    const { dialog } = mount();
    dialog.open();
    disclosure("Rational functions on ℝ").click();
    expect(allCards().length).toBeGreaterThan(frontCards().length);
    const cards = frontCards();
    const last = cards[cards.length - 1];
    last.focus();
    press("ArrowDown");
    expect(document.activeElement, "the arrows crossed out of the front row").toBe(last);
  });

  it("opens the focused card on Enter, and takes the key so the browser does not open it twice", () => {
    // jsdom does not synthesise a click from a keydown, so the native button path cannot be asserted
    // in this gate at all — which is why Enter is handled and why `preventDefault` is part of the
    // claim: without it a browser would fire its own activation on top and `applyState` would run
    // twice on one keystroke.
    const { dialog, applied, calls } = mount();
    dialog.open();
    const cards = frontCards();
    cards[2].focus();
    expect(press("Enter"), "Enter was left to the browser").toBe(false);
    expect(calls).toEqual(["close", "apply"]);
    expect(applied.length).toBe(1);
    expect(applied[0].record).toBe(cards[2].getAttribute("data-door"));
  });
});

describe("the front door — opening a card", () => {
  it("shuts first, then applies — and lands on the record", () => {
    // Two claims. The ORDER is `contrasts.ts`'s and its reason: `applyState` clears the shell's own
    // open flag and re-renders, so applying first would leave this dialog standing over a page the
    // shell had already decided was uncovered. And the state must actually RESOLVE to the record —
    // field equality would pass a state that names a record the corpus cannot run.
    const { dialog, calls, applied } = mount();
    dialog.open();
    const card = dialogOf()?.querySelector<HTMLElement>('[data-record="jordan-cosine-kernel"]');
    card?.click();
    expect(calls, "the dialog applied before it shut").toEqual(["close", "apply"]);
    expect(dialog.isOpen).toBe(false);

    const next = applied[0];
    expect(next.mode).toBe("gallery");
    expect(next.record).toBe("jordan-cosine-kernel");
    expect(next.fixture).toBe(0);
    const resolved = resolveState(next, null);
    expect(resolved.kind, "the state the card applied does not resolve to a record").toBe("gallery");
    expect(resolved.kind === "gallery" ? resolved.family.id : null).toBe("jordan-cosine-kernel");
    // The verdict comes from the RESOLUTION, which is what makes this a claim about the app rather
    // than about a string: B1 at its first fixture closes and reports a value.
    expect(resolved.kind === "gallery" ? resolved.solved : null, "the record did not solve").not.toBeNull();
  });

  it("opens exactly once however the card is pressed", () => {
    // The double-open defect: a handler on the card AND a handler on its button, with a click on the
    // button bubbling into both. One handler, on the article, and the button carries none — so this
    // is the assertion that keeps it that way.
    const { dialog, applied } = mount();
    dialog.open();
    frontCards()[0].click();
    expect(applied.length, "one press applied two states").toBe(1);
  });

  it("clears the previous record's parameter moves", () => {
    // The defect a shared `bindings` map produces: `a` is a parameter of several records, so opening
    // B1 after scrubbing another record's `a` would land on a number nobody chose — and it would look
    // like a correct reading of a record the reader had never set. `setFixture` already clears both
    // maps for the same reason.
    const scrubbed: ShellState = {
      ...defaultState(circleTemplate([0, 0], 2)),
      mode: "gallery",
      record: "circle-linear-cos",
      bindings: { a: 7 },
      geometry: { R: 99 },
      workedExample: true,
    };
    const next = frontDoorState(scrubbed, "jordan-cosine-kernel");
    expect(next.bindings).toEqual({});
    expect(next.geometry).toEqual({});
    // Explore, which is `drill` and `workedExample` both cleared — `shellMode` reads those two and
    // nothing else, so this is the mode rather than a field that announces it.
    expect(next.workedExample).toBe(false);
    expect(next.drill).toBeNull();
    // And the rest of the state is the reader's, untouched: a front door is not a reset.
    expect(next.expr).toBe(scrubbed.expr);
    expect(next.view).toBe(scrubbed.view);
  });
});

describe("the front door — what it announces itself as", () => {
  it("is a modal dialog whose label resolves to text inside it", () => {
    // `modal.ts` supplies the mechanics; what it cannot supply is a heading carrying the id it
    // generated. The defect is invisible in every browser and in every screenshot — the dialog simply
    // has no name — so the id is dereferenced and the text it lands on is read.
    const { dialog } = mount();
    dialog.open();
    const d = dialogOf();
    expect(d?.getAttribute("aria-modal")).toBe("true");
    const id = d?.getAttribute("aria-labelledby") ?? "";
    const label = document.getElementById(id);
    expect(label, `aria-labelledby names '${id}', which is in no document`).not.toBeNull();
    // **One name covering BOTH tabs**, which is what the strip cost the heading: the dialog is
    // announced by this text when focus lands on it, and that happens before any tab switch, so a
    // per-tab name would describe whichever half was up rather than what the reader opened.
    expect((label?.textContent ?? "").trim()).toBe("Worked examples and practice");
    expect(d?.contains(label)).toBe(true);
  });

  it("puts every heading under the dialog's own, and every disclosure in one", () => {
    // The panel is a document in its own right: one `<h2>` naming it and an `<h3>` per section. A
    // group whose name was a bare button would be unreachable by a reader navigating by heading,
    // which is how a screen-reader user moves through a list of twenty-eight things.
    const { dialog } = mount();
    dialog.open();
    expect((dialogOf()?.querySelectorAll("h2") ?? []).length).toBe(1);
    const h3s = [...(dialogOf()?.querySelectorAll("h3") ?? [])];
    expect(h3s.length, "eight groups and the front row").toBe(9);
    for (const section of TAXONOMY_SECTIONS) {
      expect(disclosure(section).closest("h3"), `'${section}' is a button outside any heading`).not.toBeNull();
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The strip and the practice list — M8 step 3.4.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** One tab of the strip, by the id it carries for the arrow keys and the click handler. */
function tab(id: string): HTMLElement {
  const found = dialogOf()?.querySelector<HTMLElement>(`[role="tab"][data-tab="${id}"]`) ?? null;
  expect(found, `no '${id}' tab`).not.toBeNull();
  return found as HTMLElement;
}

/** The panel a tab's `aria-controls` names — dereferenced, never guessed from a class. */
function panelFor(id: string): HTMLElement {
  const owner = tab(id);
  const panel = document.getElementById(owner.getAttribute("aria-controls") ?? "");
  expect(panel, `the '${id}' tab controls nothing in any document`).not.toBeNull();
  return panel as HTMLElement;
}

/** The practice list's rows, in order. */
const taskRows = (): HTMLElement[] => [...(dialogOf()?.querySelectorAll<HTMLElement>("li[data-task]") ?? [])];

/** One row's `tag` text — "stage n of 4", and the `complete` tag where there is one. */
const tagsOf = (row: HTMLElement): string[] => [...row.querySelectorAll(".tag")].map((t) => t.textContent ?? "");

describe("the front door — the two tabs", () => {
  it("is a tab strip, with each tab controlling the panel that names it back", () => {
    // The ARIA tabs pattern, dereferenced in BOTH directions. A tab whose `aria-controls` names a
    // panel that in turn is labelled by some other tab is the defect this catches, and it is
    // invisible on screen and in every screenshot: the picture is right and the panel has the wrong
    // name. The ids are generated per mounted dialog, so they are read off the DOM rather than
    // written down here.
    const { dialog } = mount();
    dialog.open();
    const strip = dialogOf()?.querySelector('[role="tablist"]') ?? null;
    expect(strip, "the dialog has no tablist").not.toBeNull();
    expect([...(strip?.querySelectorAll('[role="tab"]') ?? [])].map((t) => t.getAttribute("data-tab"))).toEqual([
      "records",
      "practice",
    ]);
    for (const id of ["records", "practice"]) {
      const panel = panelFor(id);
      expect(panel.getAttribute("role"), `'${id}' controls something that is not a tabpanel`).toBe("tabpanel");
      expect(panel.getAttribute("aria-labelledby"), `the '${id}' panel is not labelled by its own tab`).toBe(
        tab(id).id,
      );
    }
    // Exactly one panel is up, and the ROVING tabindex says which — `aria-selected` alone is a
    // claim about the strip that the tab order does not back.
    expect(`records: ${tab("records").getAttribute("aria-selected")}`).toBe("records: true");
    expect(`practice: ${tab("practice").getAttribute("aria-selected")}`).toBe("practice: false");
    expect(tab("records").getAttribute("tabindex")).toBe("0");
    expect(tab("practice").getAttribute("tabindex")).toBe("-1");
    expect(`records hidden: ${panelFor("records").hasAttribute("hidden")}`).toBe("records hidden: false");
    expect(`practice hidden: ${panelFor("practice").hasAttribute("hidden")}`).toBe("practice hidden: true");
    // And the records panel is the dialog's existing content rather than a new empty box beside it.
    expect(panelFor("records").querySelectorAll("button[data-door]").length).toBe(8);
  });

  it("moves between tabs with Left and Right, wrapping, and takes the key", () => {
    // The strip WRAPS where the card grid clamps, and the reason is the grid's read the other way:
    // a grid's Right at the end of a row could only land on the next ROW, which is one gesture
    // meaning two things, while a strip is one row and a dead key on a two-item list is the only
    // other option. Selection follows focus, so the panel is asserted alongside the tab — a strip
    // whose `aria-selected` moved and whose panels did not is the defect that looks right.
    const { dialog } = mount();
    dialog.open();
    tab("records").focus();
    expect(press("ArrowRight"), "the strip left the key to the browser").toBe(false);
    expect(document.activeElement).toBe(tab("practice"));
    expect(`selected: ${tab("practice").getAttribute("aria-selected")}`).toBe("selected: true");
    expect(`practice hidden: ${panelFor("practice").hasAttribute("hidden")}`).toBe("practice hidden: false");
    expect(`records hidden: ${panelFor("records").hasAttribute("hidden")}`).toBe("records hidden: true");

    // Right again wraps back to the first: two tabs, so this is also Left's move, and asserting it
    // from the other end is what keeps the wrap from being a modulo that happens to be an identity.
    press("ArrowRight");
    expect(document.activeElement).toBe(tab("records"));
    press("ArrowLeft");
    expect(document.activeElement, "Left did not wrap onto the last tab").toBe(tab("practice"));
    // A key that is not a strip move is left alone, so the modal's own Escape and Tab still arrive.
    expect(press("Escape"), "the strip swallowed a key that is not its own").toBe(true);
  });

  it("keeps Tab out of the HIDDEN panel, on whichever tab is up", () => {
    // **The trap cycled through the panel it had just hidden** — the 2026-09-20 review. `syncTabs`
    // hides a panel without emptying it and `modal.ts`'s `FOCUSABLE` had no visibility filter, so
    // on the Practice tab 16 of 23 matches sat inside the hidden records panel, between the tab
    // strip and the practice list. `focus()` on a `display: none` element is a no-op in a browser,
    // so Tab stalled there; jsdom focuses them, which is why the trap's own tests passed.
    const { dialog } = mount();
    dialog.open("practice");
    const root = dialogOf();
    expect(root, "no dialog").not.toBeNull();
    if (root === null) return;
    const all = [...root.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")];
    const buried = all.filter((el) => el.closest("[hidden]") !== null);
    // The measurement, as an anti-vacuity clause: a panel that were emptied on hide would make the
    // rest of this test true of nothing.
    expect(buried.length, "the hidden panel holds no controls, so there is nothing to skip").toBeGreaterThan(5);

    // Twenty Tabs from the tab strip, and not one of them lands on a buried control.
    const visited: Element[] = [];
    tab("practice").focus();
    for (let i = 0; i < 20; i++) {
      press("Tab");
      visited.push(document.activeElement ?? document.body);
    }
    expect(visited.filter((el) => buried.includes(el as HTMLElement)), "Tab reached the hidden panel").toEqual([]);
    // And it went SOMEWHERE — a trap that held focus on the dialog would satisfy the line above.
    expect(new Set(visited).size, "Tab did not move at all").toBeGreaterThan(2);
  });

  it("opens on the tab the caller names, and on Records with no argument", () => {
    // The bar's two segments name the tab they want. The no-argument call is the one that existed
    // before the strip did, so it must still be the records list — and the PAIRING is the second
    // open: a dialog that simply remembered the last tab would pass the first assertion and fail
    // here, which is the whole difference between "the caller decides" and "the dialog remembers".
    const { dialog } = mount();
    dialog.open("practice");
    expect(`selected: ${tab("practice").getAttribute("aria-selected")}`).toBe("selected: true");
    expect(taskRows().length, "the practice panel is empty on a direct open").toBe(DRILL_TASKS.length);
    dialog.close();

    dialog.open();
    expect(`selected: ${tab("records").getAttribute("aria-selected")}`).toBe("selected: true");
    expect(`practice: ${tab("practice").getAttribute("aria-selected")}`).toBe("practice: false");
  });

  it("asks for no thumbnail at all when the tabs are switched", () => {
    // **The measurement, and the defect it prevents.** `patch` recurses into a node whose
    // description has no children and removes what is there, so a switch that re-rendered the
    // dialog would take the adopted canvases with it and the next `fillThumbnails` would ask for
    // all eight again — `toggleGroup`'s 19-requests-for-11-cards, reached by a second route, and
    // measured at 16 against 8 on the first switch alone. The
    // count alone is not evidence (a panel that drew no cards at all would also ask for nothing),
    // so the same canvas NODES are required to still be there afterwards.
    const { dialog, thumbed } = mount();
    dialog.open();
    expect(thumbed.length, "the front row did not draw").toBe(8);
    const before = [...(dialogOf()?.querySelectorAll("[data-thumb] canvas") ?? [])];
    expect(before.length).toBe(8);

    tab("practice").click();
    expect(thumbed.length, "switching to Practice re-asked for the records' thumbnails").toBe(8);
    tab("records").click();
    expect(thumbed.length, "switching back re-asked for the records' thumbnails").toBe(8);
    const after = [...(dialogOf()?.querySelectorAll("[data-thumb] canvas") ?? [])];
    expect(after.length, "the records panel lost its pictures across the switch").toBe(8);
    // IDENTITY, not equality: two freshly created canvases are deeply equal and are exactly what a
    // re-render would have produced, so `toEqual` would pass on the defect this test is about.
    expect(
      `same nodes: ${after.every((n, i) => n === before[i])}`,
      "the canvases were re-created rather than left alone",
    ).toBe("same nodes: true");
  });
});

describe("the front door — the practice tab", () => {
  it("lists the four tasks, each at the rung it has REACHED", () => {
    // The PAIRING that makes the stage a measurement rather than a constant: one task carries
    // progress and the other three do not, so a panel that printed `stage 1 of 4` everywhere — or
    // read `LAST_STAGE` for both numbers — shows the two rows agreeing where they must differ.
    const { dialog } = mount({ progress: { rational: { stage: 2 } } });
    dialog.open("practice");
    const rows = taskRows();
    expect(rows.map((r) => r.getAttribute("data-task"))).toEqual(DRILL_TASKS.map((t) => t.id));

    const withProgress = rows[0];
    const without = rows[1];
    expect(`${withProgress.getAttribute("data-task")}: ${tagsOf(withProgress)[0]}`).toBe("rational: stage 3 of 4");
    expect(`${without.getAttribute("data-task")}: ${tagsOf(without)[0]}`).toBe("oscillatory: stage 1 of 4");
    const shown = (row: HTMLElement): number => Number(row.querySelector(".tag")?.getAttribute("data-stage"));
    expect(
      `cleared two rungs is later than cleared none: ${shown(withProgress) > shown(without)}`,
      "the rung a task has reached is not on screen",
    ).toBe("cleared two rungs is later than cleared none: true");

    // The label is TYPESET, and the control's name is the spoken twin rather than the source — a
    // `$…$` in an `aria-label` is read out in the app's own syntax.
    expect(withProgress.querySelector(".katex-mathml"), "the task's integral is not typeset").not.toBeNull();
    const go = withProgress.querySelector("button[data-open-task]");
    expect(go?.getAttribute("aria-label")).toBe(`open ${mathPlain(DRILL_TASKS[0].labelText)} at stage 3`);
    expect(go?.getAttribute("aria-label") ?? "", "raw LaTeX reached an accessible name").not.toContain("$");
  });

  it("says `complete` where the stage number no longer can", () => {
    // `stageFor` CAPS at the last rung, so a task that has cleared three and one that has cleared
    // all four both read "stage 4 of 4" — which is the whole reason `isComplete` is drawn beside
    // it. Both rows are asserted, because the claim is precisely that the numbers AGREE and the
    // tags do not.
    const { dialog } = mount({ progress: { rational: { stage: 4 }, oscillatory: { stage: 3 } } });
    dialog.open("practice");
    const [done, nearly] = taskRows();
    expect(`${tagsOf(done)[0]} / ${tagsOf(nearly)[0]}`, "the two stages are distinguishable after all").toBe(
      "stage 4 of 4 / stage 4 of 4",
    );
    expect(`finished: ${tagsOf(done).includes("complete")}`).toBe("finished: true");
    expect(`one rung short: ${tagsOf(nearly).includes("complete")}`).toBe("one rung short: false");
  });

  it("reads the progress store ONCE for the whole list", () => {
    // `drillPanel.ts`'s own rule for the list it draws in the rail: four rows that each read the
    // store are four rows that can describe four different moments, and how far along they are is
    // the one thing a reader compares them on. A per-row read measures four; the row count is
    // asserted beside it, because a list that drew nothing would also read once — or none.
    const { dialog, reads } = mount({ progress: { rational: { stage: 2 } } });
    dialog.open("practice");
    expect(taskRows().length).toBe(4);
    expect(reads, "the store was read more than once for one list").toEqual([PROGRESS_KEY]);
  });

  it("opens a task at its reached rung, shutting the dialog first", () => {
    // Two claims, and the ORDER is `openCard`'s and its reason: `applyState` clears the shell's own
    // open flag and re-renders, so handing the task over first would leave this dialog standing
    // over a page the shell had already decided was uncovered. The rung is computed here from the
    // same progress through `stageFor` and checked to DIFFER from the default, so a handler that
    // passed a hardcoded 1 — or the last rung — cannot pass.
    const progress: DrillProgress = { rational: { stage: 2 } };
    const { dialog, calls, opened } = mount({ progress });
    dialog.open("practice");
    taskRows()[0].querySelector<HTMLElement>("button[data-open-task]")?.click();

    expect(calls, "the dialog handed the task over before it shut").toEqual(["close", "openTask"]);
    expect(dialog.isOpen).toBe(false);
    expect(opened.length).toBe(1);
    expect(opened[0].task.id).toBe(DRILL_TASKS[0].id);
    const want = stageFor(progress, DRILL_TASKS[0].id);
    expect(`${opened[0].task.id} at ${opened[0].stage}`).toBe(`${DRILL_TASKS[0].id} at ${want}`);
    expect(`${want} is past the first rung: ${want > 1}`, "the expected rung is the default after all").toBe(
      `${want} is past the first rung: true`,
    );
  });
});
