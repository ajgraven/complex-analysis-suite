// The front door — M8 step 1.8, plan §1.8.
//
// The gallery as the reader meets it: eight classics across the top, then the whole corpus filed
// under the eight groups it is organised into. It is a MODAL on `modal.ts`, the second consumer that
// justified extracting it, so the focus trap, `inert`, Escape, the backdrop click and the focus
// return are not restated here — and `contrasts.ts` is the pattern this file follows, including the
// backdrop class trick and the shut-before-apply order, both for their recorded reasons.
//
// **Nothing here computes.** No verdict, no value, no contour: every sentence on a card is a field
// of `Family`, and the identity is `targetLatex` over `closedFormLatex`, which are the Target card's
// own readers. A panel that derived a number would be a second place for the app to say what a
// record comes to, and the first time the two disagreed the more decorative one would be the one on
// screen.
import { FAMILIES } from "../families/index.js";
import { citationLine } from "../families/describe.js";
import { identityLatex, identityText } from "../families/latex.js";
import { TAXONOMY_SECTIONS, type Family, type TaxonomySection } from "../families/schema.js";
import type { ShellState } from "./state.js";
import { h, patch, type Child, type Desc } from "@cas/ui";
import { DRILL_TASKS, type DrillTask } from "./drill.js";
import { LAST_STAGE, isComplete, readProgress, stageFor, type KeyStore } from "./drillProgress.js";
import { math, mathSpoken, mathText } from "./math.js";
import { createModal } from "./modal.js";

/**
 * How many cards a row of the grid holds — the plan's four-column front row.
 *
 * **Declared here rather than measured, and that makes it a contract on the stylesheet.** Up and
 * Down move by a ROW, so the keyboard needs the column count; the only instrument that could read
 * the real one is layout, and jsdom reports every box as zero-sized, so a measured version would be
 * asserted nowhere in the blocking gate and would disagree with the keyboard exactly when a reader
 * narrowed the window. One number, written into the DOM as `data-columns` so the key handler and the
 * stylesheet read the same thing: the grid must be `repeat(4, …)` and NOT `auto-fill`, or the
 * arrows and the picture part company. The group grids use it too, so a card moves the same way
 * wherever it is.
 */
const COLUMNS = 4;

/** What the dialog needs the shell to do, and the one thing it needs the shell to draw. */
export interface FrontDoorInput {
  /** The state to build a card's target on top of — read at click time, never captured. */
  readonly state: () => ShellState;
  /** Open the card's state. The shell's `applyState`, which resets the session and recomputes. */
  readonly apply: (next: ShellState) => void;
  /** Shut the dialog. The shell clears its own open flag and re-renders. */
  readonly close: () => void;
  /**
   * A record's thumbnail, or `null` where there is none.
   *
   * **INJECTED rather than imported**, for two reasons. It makes the panel testable without a canvas
   * — every assertion below runs in jsdom, where a real thumbnail renderer has no context to draw
   * into — and it is the seam the cache lives behind: whether a picture is drawn once or once per
   * open is `thumbnails.ts`'s question, and a panel that knew the answer would be a second cache.
   *
   * **The contract the repeats impose: each call yields an element the caller may ADOPT.** The eight
   * front-row records appear twice — once across the top, once inside their own group — and one DOM
   * node cannot be in two places, so a provider that returned one cached canvas per record would
   * silently move the picture out of the front row the moment a reader expanded that group. Cache
   * the pixels, not the element.
   */
  readonly thumbnail: (recordId: string) => HTMLCanvasElement | null;
  /** The drill's progress store, or null where there is none (a private window, a test). */
  readonly progressStore: () => KeyStore | null;
  /** Open a drill task at the rung it has reached. The shell's `applyState`. */
  readonly openTask: (task: DrillTask, stage: 1 | 2 | 3 | 4) => void;
}

/**
 * Which half of the dialog is on screen.
 *
 * Two tabs rather than two dialogs, because both are the same gesture — *show me something to
 * work on* — and a reader who opened the wrong one would otherwise have to shut a modal, find a
 * different control in the bar and open another. The bar's two segments name the tab they want;
 * see {@link FrontDoorDialog.open}.
 */
export type DoorTab = "records" | "practice";

/** The tabs, in strip order. The ARROW keys move along this list, so it is the one order. */
const TABS: readonly { readonly id: DoorTab; readonly label: string }[] = [
  { id: "records", label: "Records" },
  { id: "practice", label: "Practice" },
];

export interface FrontDoorDialog {
  /**
   * Show it, on the named tab. Traps focus, makes the rest of the page `inert`, remembers what to
   * return focus to.
   *
   * **No argument is `"records"`, not "whatever was selected last time".** Every caller is a bar
   * segment naming what it wants, so a remembered tab would make one control open two different
   * panels depending on a gesture the reader made minutes ago — and the no-argument call then
   * shows exactly what this dialog showed before the strip existed.
   */
  open(tab?: DoorTab): void;
  /** Hide it, restore `inert`, and put focus back where it was. Idempotent. */
  close(): void;
  readonly isOpen: boolean;
  destroy(): void;
}

/** The eight classics in `frontRow` order — one per group, so the row is a tour of the taxonomy. */
export const FRONT_ROW: readonly Family[] = FAMILIES.filter((f) => f.frontRow !== undefined).sort(
  (a, b) => (a.frontRow ?? 0) - (b.frontRow ?? 0),
);

/** One taxonomy group and its records, in corpus order. */
export interface FrontDoorGroup {
  readonly section: TaxonomySection;
  readonly families: readonly Family[];
}

/**
 * The eight groups.
 *
 * Driven from {@link TAXONOMY_SECTIONS} rather than from the records, so the order is the taxonomy's
 * own and a group that lost its last record would appear empty rather than vanish — which is a
 * finding about the corpus and should look like one.
 */
export const FRONT_DOOR_GROUPS: readonly FrontDoorGroup[] = TAXONOMY_SECTIONS.map((section) => ({
  section,
  families: FAMILIES.filter((f) => f.taxonomySection === section),
}));

/**
 * What opening a card comes to: this record, at its first fixture, in Explore mode.
 *
 * **Exported and pure**, so the transition is asserted without a DOM — and so the one judgement in
 * it is in front of a reader. `bindings` and `geometry` are CLEARED: they are the open record's
 * parameter moves, and carrying `a = 1` from one record into another that also calls a parameter `a`
 * would open the new record at a number nobody chose. `setFixture` already clears both for the same
 * reason; this is that decision applied to the larger move.
 *
 * Explore is `drill: null` and `workedExample: false` — `shellMode` derives the mode from those two
 * and nothing else, so clearing them is what "in Explore" means rather than a third field saying so.
 *
 * **The camera is not touched.** Framing a contour is the stage controller's, which a dialog cannot
 * reach; the shell frames after applying, exactly as `setTemplate` does.
 */
export function frontDoorState(current: ShellState, recordId: string): ShellState {
  return {
    ...current,
    mode: "gallery",
    record: recordId,
    fixture: 0,
    bindings: {},
    geometry: {},
    drill: null,
    workedExample: false,
  };
}

/**
 * One card.
 *
 * **The card is an `<article>` and the control inside it is a `<button>`**, which is
 * `contrasts.ts`'s `caseCard` shape (it was `columnHead` until step 3.5 made the ladder an inline
 * strip; the shape survived the rename) and is here for a sharper reason: the card carries four
 * sentences and a formula, and a `<button>` wrapping all of it would have every one of them read out
 * as its name. The button is named by the record's TITLE — the bar's argument, that KaTeX's HTML
 * reads as nonsense and a control is not named by its formula — and everything else is ordinary
 * content a screen reader walks in order.
 *
 * **The click handler is on the ARTICLE and the button carries none.** A click on a button bubbles,
 * so Enter, Space and a pointer anywhere on the card all arrive at one handler; the alternative —
 * a handler on each, with the inner one stopping propagation — is two paths for one gesture and the
 * way a card comes to open twice.
 */
function cardOf(family: Family, onOpen: (id: string) => void, keyPrefix: string): Desc {
  const golden = family.golden[0];
  const body: Child[] = [
    // The thumbnail's SLOT. `dom.ts` describes elements and cannot adopt one, so the canvas is put
    // in after the patch — see `fillThumbnails`. `aria-hidden` because a picture of a contour that
    // the card's own sentences already name adds nothing a reader would hear.
    h("div", { key: "thumb", class: "doorThumb", "data-thumb": family.id, "aria-hidden": "true" }),
    h(
      "div",
      { key: "id", class: "doorIdentity" },
      math(identityLatex(family, golden), { key: "m", display: true, label: identityText(family, golden) }),
    ),
    h("p", { key: "contour", class: "small" }, ...mathText(family.description.contour, `${keyPrefix}dc`)),
    h("p", { key: "point", class: "muted small" }, ...mathText(family.description.point, `${keyPrefix}dp`)),
  ];
  // The FIRST citation. A card is a door rather than a bibliography, and the Target card carries all
  // of them for the record a reader actually opened.
  const cite = family.description.citations[0];
  if (cite !== undefined) body.push(h("p", { key: "cite", class: "muted small cites" }, ...mathText(citationLine(cite), "cite")));
  // A fixture documenting a REFUSAL states a value its own derivation does not establish, and a card
  // that printed it plain would present a collapsed argument as a worked one.
  //
  // **Unreachable today, and kept for the one reason an unreachable branch is worth keeping.**
  // Measured: the corpus's only two refusing fixtures are D3's fourth and fifth, and a card always
  // shows the FIRST — so nothing draws this. It stays because what it prevents is the honest-labelling
  // guardrail broken in its plainest form, the card has no way to tell, and the corpus is data that
  // grows. The test asserts the measurement rather than the branch, so the day a record lands a
  // refusing first fixture the claim goes red instead of quietly becoming false.
  if (golden.refuses !== undefined) {
    body.push(
      h(
        "p",
        { key: "refuses", class: "verdict" },
        h("span", { key: "b", class: "badge", "data-level": "⚠" }, "⚠"),
        ` this fixture documents a refusal: ${golden.refuses}`,
      ),
    );
  }
  body.push(
    h(
      "div",
      { key: "open", class: "btnRow" },
      h("button", { key: "b", type: "button", "data-door": family.id, "aria-label": `open ${family.title}` }, "Open"),
    ),
  );
  return h(
    "article",
    { key: `${keyPrefix}:${family.id}`, class: "doorCard", "data-record": family.id, onClick: () => onOpen(family.id) },
    ...body,
  );
}

/** The id a disclosure's `aria-controls` names, and the one its own region carries. One spelling. */
const regionId = (index: number): string => `door-group-${index}`;

/**
 * Distinguishes one mounted dialog's tab ids from another's — `modal.ts`'s `SEQ` and its reason.
 *
 * `aria-controls` and `aria-labelledby` are resolved by `getElementById`, which returns the FIRST
 * match in the document: two front doors mounted at once (which is what a test file that mounts
 * per case does) would have the second dialog's tabs naming the first dialog's panels, and the
 * defect is invisible on screen because the CSS and the click handlers never go through an id.
 */
let DOOR_SEQ = 0;

/** A grid of cards. `data-columns` is the number the arrow keys move by — see {@link COLUMNS}. */
function gridOf(families: readonly Family[], onOpen: (id: string) => void, keyPrefix: string): Desc {
  return h(
    "div",
    { key: "grid", class: "doorGrid", "data-columns": String(COLUMNS), "data-grid": keyPrefix },
    ...families.map((f) => cardOf(f, onOpen, keyPrefix)),
  );
}

export function createFrontDoor(host: HTMLElement, page: HTMLElement, input: FrontDoorInput): FrontDoorDialog {
  /** Which groups the reader has opened. Empty on the first open — see {@link groupSection}. */
  const expanded = new Set<TaxonomySection>();

  const seq = ++DOOR_SEQ;
  const tabId = (tab: DoorTab): string => `door-tab-${tab}-${seq}`;
  const panelId = (tab: DoorTab): string => `door-panel-${tab}-${seq}`;

  /** Which tab is up. Written by {@link openDoor} before the first render, so nothing flashes. */
  let selected: DoorTab = "records";

  const modal = createModal({
    host,
    page,
    // `shell2` on the BACKDROP, `contrasts.ts`'s trick and its reason: `inert` is not defeasible from
    // CSS, so the dialog cannot be a descendant of the shell, and wearing the class is how it gets
    // the visual system without the containment. `modalBackdrop` is the fixed, centred, dimmed
    // plate — a rule that never said anything about the ladder it was first written for, renamed
    // when this panel became its second consumer. `doorBackdrop` is this one's own hook.
    backdropClass: "shell2 modalBackdrop doorBackdrop",
    dialogClass: "modalDialog frontDoorDialog card2",
    onClose: input.close,
    build: (dialog, titleId) => {
      render(dialog, titleId);
    },
  });

  function openCard(id: string): void {
    const family = FAMILIES.find((f) => f.id === id);
    if (family === undefined) return;
    // **Shut BEFORE applying**, `contrasts.ts`'s order and its reason: `applyState` clears the
    // shell's own open flag and re-renders, so applying first would leave this dialog's DOM standing
    // over an `inert` page the shell had already decided was uncovered.
    modal.dismiss();
    input.apply(frontDoorState(input.state(), family.id));
  }

  /**
   * Open or shut one group, patching THAT REGION and nothing else.
   *
   * **A whole-dialog re-render would destroy the front row's thumbnails**, and measuring is how that
   * was found: `patch` recurses into a node whose description has no children and removes what is
   * there, so the adopted canvases went with it and the next `fillThumbnails` asked for all eight
   * again — 19 requests for 11 cards, with the laziness this file exists to establish paid back on
   * every disclosure a reader touched. Patching the region alone leaves the front row untouched, so a
   * picture is requested exactly once per card that appears.
   */
  function toggleGroup(section: TaxonomySection): void {
    const open = !expanded.has(section);
    if (open) expanded.add(section);
    else expanded.delete(section);
    const index = TAXONOMY_SECTIONS.indexOf(section);
    const region = modal.dialog.querySelector<HTMLElement>(`#${regionId(index)}`);
    const button = [...modal.dialog.querySelectorAll<HTMLElement>("[data-disclosure]")].find(
      (b) => b.getAttribute("data-disclosure") === section,
    );
    if (region === null || button === undefined) return;
    button.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) region.removeAttribute("hidden");
    else region.setAttribute("hidden", "");
    // The one dynamic part of the panel, and it is built by the same `gridOf` the front row is — so
    // "not built yet" is an empty child list rather than a second mode the cards could differ in.
    patch(region, [open ? gridOf(FRONT_DOOR_GROUPS[index].families, openCard, `g${index}`) : null]);
    fillThumbnails(region);
  }

  /**
   * One group: a disclosure, and its cards only once it is open.
   *
   * **A `<button aria-expanded>` and a region, not `<details>`.** The pattern is the same to a
   * reader and the difference is what can be asserted: jsdom's `<details>` support does not run the
   * activation behaviour, so a test would have to set `open` by hand and the thing being tested —
   * that a click reveals the cards — would be assumed rather than checked.
   *
   * **The cards are not built until the group is opened**, which is `modal.ts`'s own reason one level
   * down. Measured rather than argued: each card typesets an identity through KaTeX and asks
   * {@link FrontDoorInput.thumbnail} for a picture, so building all eight groups on open is 28 KaTeX
   * parses and 28 thumbnails for the twenty records most readers never look at — and the test counts
   * the thumbnail calls, which is the half of that cost a stub can see. Re-expanding is cheap for a
   * reason that belongs to `math.ts`: a formula's HTML is cached by its source, so the second open of
   * a group is a map read.
   *
   * So the region is drawn EMPTY and shut here, always, and {@link toggleGroup} is the only thing
   * that fills it. Reading `expanded` here as well would be a branch that cannot be taken — the panel
   * is built once, on the first open, with every group shut — and an untakeable branch is how a
   * mutation sweep comes back with an equivalent mutant and no information.
   */
  function groupSection(group: FrontDoorGroup): Desc {
    const index = TAXONOMY_SECTIONS.indexOf(group.section);
    return h(
      "section",
      { key: `g:${group.section}`, class: "doorGroup", "data-group": group.section },
      h(
        "h3",
        { key: "h" },
        h(
          "button",
          {
            key: "b",
            type: "button",
            class: "doorDisclosure",
            "data-disclosure": group.section,
            "aria-expanded": "false",
            "aria-controls": regionId(index),
            onClick: () => toggleGroup(group.section),
          },
          `${group.section} (${group.families.length})`,
        ),
      ),
      h("div", { key: "r", id: regionId(index), class: "doorRegion", hidden: true }),
    );
  }

  /**
   * Arrow keys over a grid of cards.
   *
   * Left and Right move by one, Up and Down by a whole ROW — `data-columns`, the number the grid is
   * laid out with. Both CLAMP rather than wrap: a reader at the end of the row who presses Right
   * again has asked for a card that is not there, and silently landing them at the start of the next
   * row is the same gesture meaning two things.
   *
   * **Movement stays inside one grid.** The front row and each open group are separate grids, so
   * Down from the last front-row card does not drop into a group the reader may not have opened —
   * Tab is the move between regions, and the modal's trap already owns it.
   *
   * **Enter is handled here and not left to the button**, with `preventDefault` so the browser does
   * not also fire its own activation. jsdom does not synthesise a click from a keydown, so the native
   * path is unassertable in the blocking gate; handling it makes "Enter opens" a claim this file's
   * test can falsify. Space is untouched and activates the button natively.
   */
  function onGridKey(event: KeyboardEvent): void {
    const grid = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-grid]");
    if (grid === null || grid === undefined) return;
    const cards = [...grid.querySelectorAll<HTMLElement>("button[data-door]")];
    const at = cards.indexOf(document.activeElement as HTMLElement);
    if (at === -1) return;
    if (event.key === "Enter") {
      event.preventDefault();
      openCard(cards[at].getAttribute("data-door") ?? "");
      return;
    }
    const columns = Number(grid.getAttribute("data-columns")) || COLUMNS;
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? columns : event.key === "ArrowUp" ? -columns : 0;
    if (step === 0) return;
    const next = at + step;
    // Out of the grid is NO MOVE. Clamping to the ends instead would make Down from the last row
    // land on the last card, which is a different card every time the corpus changes length.
    if (next < 0 || next >= cards.length) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    cards[next].focus();
  }

  /**
   * Put each thumbnail into its slot, after the patch that made the slot.
   *
   * `dom.ts` describes elements; it does not adopt them, deliberately — a description that could
   * carry a live node would be a description that is not comparable. So the canvases go in here, and
   * a slot that already holds one is left alone, which is what keeps a re-render from asking for a
   * picture that is already on screen.
   */
  function fillThumbnails(root: HTMLElement): void {
    for (const slot of root.querySelectorAll<HTMLElement>("[data-thumb]")) {
      if (slot.firstChild !== null) continue;
      const canvas = input.thumbnail(slot.getAttribute("data-thumb") ?? "");
      if (canvas !== null) slot.append(canvas);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // The strip — M8 step 3.4.
  //
  // **The two panels are SIBLINGS, and switching between them writes attributes rather than
  // re-rendering.** The records half adopts a canvas per card ({@link fillThumbnails}), and
  // `patch` recurses into a node whose description has no children and removes what is there — so
  // a switch that re-rendered the dialog would take every adopted canvas with it and the next
  // `fillThumbnails` would ask for all of them again. That is {@link toggleGroup}'s measurement
  // (19 requests for 11 cards) reached by a second route — measured here at **8 requests against
  // 16** for a single switch to Practice and back, which is why the test counts the thumbnail calls
  // across one. Only the selected panel is `hidden`-free, so only one
  // is on screen, in the accessibility tree, or in a browser's tab order.
  //
  // The practice list is the other way round: it is rebuilt on every selection, because it reports
  // a store that a rung cleared in this same session can have moved under it.
  // ────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Open a drill task at the rung it has reached.
   *
   * **Shut BEFORE handing over**, {@link openCard}'s order and its reason: `applyState` clears the
   * shell's own open flag and re-renders, so opening first would leave this dialog's DOM standing
   * over an `inert` page the shell had already decided was uncovered.
   */
  function openDrillTask(task: DrillTask, stage: 1 | 2 | 3 | 4): void {
    modal.dismiss();
    input.openTask(task, stage);
  }

  /**
   * The four drill tasks, each at the rung it has REACHED.
   *
   * **The store is read ONCE for the whole list**, which is `drillPanel.ts`'s own rule for the
   * list it draws in the rail: four rows that each read the store are four rows that can describe
   * four different moments, and the one thing a reader compares them on is how far along they are.
   *
   * `stageFor` CAPS at the last rung, so a task that has cleared three rungs and one that has
   * cleared all four both read "stage 4 of 4" — which is why `isComplete` is shown beside it
   * rather than left for a reader to infer from a number that cannot go any higher.
   */
  function practiceList(): readonly Child[] {
    const progress = readProgress(input.progressStore());
    return [
      h(
        "p",
        { key: "legend", class: "muted small" },
        "Four stages: the worked argument; the boundary terms to fill in; a choice of contour; a " +
          "blank plane. Where you start is where you left off.",
      ),
      h(
        "ul",
        { key: "tasks", class: "doorTasks" },
        ...DRILL_TASKS.map((task) => {
          const stage = stageFor(progress, task.id);
          const done = isComplete(progress, task.id);
          return h(
            "li",
            { key: task.id, class: "pickRow", "data-task": task.id },
            h("span", { key: "n", class: "pieceName" }, ...mathText(task.label, `dt${task.id}`)),
            h("span", { key: "s", class: "tag", "data-stage": String(stage) }, `stage ${stage} of ${LAST_STAGE}`),
            done ? h("span", { key: "c", class: "tag", "data-complete": "true" }, "complete") : null,
            h(
              "button",
              {
                key: "go",
                type: "button",
                "data-open-task": task.id,
                // **The SPOKEN twin, through `mathPlain`**, which is the rail list's rule and the
                // bar's argument: a raw `$…$` in an accessible name is read out in the app's own
                // source syntax ("dollar R backslash to"). Measured: none of the four labels
                // carries a delimiter today, so `mathPlain` is the identity on all four — it is
                // here so that the day one does, the name is a sentence rather than source.
                // `mathSpoken` since step 3.6: `labelText` is already a spoken twin, so this is a
                // belt on a brace — but a twin that grew a macro would announce it, and the corpus
                // sweep in `test/spoken.test.ts` is what would then say so.
                "aria-label": `open ${mathSpoken(task.labelText)} at stage ${stage}`,
                onClick: () => openDrillTask(task, stage),
              },
              "Open",
            ),
          );
        }),
      ),
    ];
  }

  /**
   * The tab strip.
   *
   * The ARIA tabs pattern, spelled out: `role="tablist"`, a `role="tab"` carrying `aria-selected`
   * and `aria-controls`, and a roving `tabindex` so Tab reaches the strip once and the arrows move
   * within it. **The roving half is markup that this gate cannot observe and a browser can**:
   * `modal.ts`'s focus trap matches `button:not([disabled])`, which is true of a tab whatever its
   * `tabindex`, so in jsdom Tab visits both — the attribute is still what an assistive technology
   * and a real browser's own tab order read, and changing the trap's selector is that file's
   * business rather than this one's.
   */
  function tabStrip(): Desc {
    return h(
      "div",
      {
        key: "tabs",
        class: "doorTabs",
        role: "tablist",
        "aria-label": "worked examples or practice",
        onKeydown: (e: Event) => onTabKey(e as KeyboardEvent),
      },
      ...TABS.map((tab) =>
        h(
          "button",
          {
            key: tab.id,
            type: "button",
            class: "doorTab",
            id: tabId(tab.id),
            role: "tab",
            "data-tab": tab.id,
            "aria-selected": tab.id === selected,
            "aria-controls": panelId(tab.id),
            tabindex: tab.id === selected ? "0" : "-1",
            onClick: () => selectTab(tab.id, false),
          },
          tab.label,
        ),
      ),
    );
  }

  /**
   * Left and Right along the strip, and they WRAP.
   *
   * The opposite of {@link onGridKey}, deliberately and for that function's own reason read the
   * other way: a grid's Right at the end of a row could only wrap onto the next ROW, which is one
   * gesture meaning two things — a strip is one row and there is nowhere else to land, so the
   * pattern's cyclic move is the only one that is not a dead key on a two-tab list.
   *
   * **Selection follows focus**, which the pattern admits where switching costs nothing: the
   * records panel is already built and the practice list is four rows off a store read.
   */
  function onTabKey(event: KeyboardEvent): void {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const at = TABS.findIndex((t) => t.id === selected);
    selectTab(TABS[(at + step + TABS.length) % TABS.length].id, true);
  }

  /** Put the DOM in step with {@link selected}. The ONLY thing a tab switch writes. */
  function syncTabs(): void {
    for (const tab of TABS) {
      const button = modal.dialog.querySelector<HTMLElement>(`#${tabId(tab.id)}`);
      const panel = modal.dialog.querySelector<HTMLElement>(`#${panelId(tab.id)}`);
      if (button === null || panel === null) return;
      const on = tab.id === selected;
      button.setAttribute("aria-selected", String(on));
      button.setAttribute("tabindex", on ? "0" : "-1");
      if (on) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
      // The practice list reports a store, so it is built on SELECTION rather than once — a rung
      // cleared while the dialog was shut, or on a rail card behind it, must not leave four rows
      // describing a moment that has passed.
      if (on && tab.id === "practice") patch(panel, practiceList());
    }
  }

  function selectTab(tab: DoorTab, focus: boolean): void {
    selected = tab;
    syncTabs();
    if (focus) modal.dialog.querySelector<HTMLElement>(`#${tabId(tab)}`)?.focus();
  }

  function render(dialog: HTMLElement, titleId: string): void {
    patch(dialog, [
      h(
        "div",
        { key: "bar", class: "btnRow" },
        // **One name for both tabs.** The dialog is announced by this heading when focus lands on
        // it, and a name that changed under the reader would describe whichever half happened to
        // be up rather than what they opened.
        h("h2", { key: "t", id: titleId }, "Worked examples and practice"),
        h(
          "button",
          { key: "x", type: "button", "aria-label": "close the worked examples", onClick: () => modal.dismiss() },
          "Close",
        ),
      ),
      tabStrip(),
      h(
        "div",
        {
          key: "p-records",
          class: "doorPanel",
          id: panelId("records"),
          role: "tabpanel",
          "aria-labelledby": tabId("records"),
          hidden: selected !== "records",
        },
        h(
          "p",
          { key: "legend", class: "muted small" },
          "Eight classics, one from each group. Every record in the gallery is below, filed under the " +
            "group it belongs to. Arrow keys move between cards; Enter opens one.",
        ),
        h(
          "section",
          { key: "front", class: "doorFront", onKeydown: (e: Event) => onGridKey(e as KeyboardEvent) },
          h("h3", { key: "h" }, "Start here"),
          gridOf(FRONT_ROW, openCard, "front"),
        ),
        h(
          "div",
          { key: "groups", class: "doorGroups", onKeydown: (e: Event) => onGridKey(e as KeyboardEvent) },
          ...FRONT_DOOR_GROUPS.map(groupSection),
        ),
      ),
      // Empty here, always, and filled by {@link syncTabs} — `groupSection`'s shape and its reason:
      // building it during the render would put a second place in the file that reads the store.
      h(
        "div",
        {
          key: "p-practice",
          class: "doorPanel",
          id: panelId("practice"),
          role: "tabpanel",
          "aria-labelledby": tabId("practice"),
          hidden: selected !== "practice",
        },
      ),
    ]);
    fillThumbnails(dialog);
  }

  /**
   * Show it, on the named tab.
   *
   * The tab is written BEFORE `modal.open()`, which is what builds the panel on the first open —
   * so a dialog opened straight onto Practice never draws the records half visible first.
   * `syncTabs` afterwards is for every LATER open, where the build has already happened and the
   * practice list has a store to re-read.
   */
  function openDoor(tab?: DoorTab): void {
    selected = tab ?? "records";
    modal.open();
    syncTabs();
  }

  return {
    open: openDoor,
    close: modal.close,
    get isOpen(): boolean {
      return modal.isOpen;
    },
    destroy: modal.destroy,
  };
}
