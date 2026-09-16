// The contrast ladder, as a MODAL — M8 step 1.7, plan §4.0.
//
// M7.1 built the ladder itself: five arguments in an order where each differs from the one above it
// in a declared, verified set of ledger rows. `shell/contrastGrid.ts` computes the whole table and
// `test/contrastGrid.test.ts` requires the real difference set to match the declared one in both
// directions. **Nothing here recomputes any of that.** This file is the presentation, and the only
// judgement it makes is about the reader's hands.
//
// **Why a dialog and not the old shell's overlay.** `shell/app.ts` draws the grid into a `hidden`
// `<section>` laid over the page. It already did the two easy halves — it remembers
// `document.activeElement` and closes on Escape — and it is still not a modal, because the app
// underneath stays in the tab order and stays in the accessibility tree. A reader who Tabs past the
// last cell lands on the record picker behind the panel, with the panel still covering it; a screen
// reader walks straight out of the grid into a rail that is not visible. The three things that fix
// that are `aria-modal`, `inert` on the page, and a trap that makes Tab cycle — and a trap is the
// one of the three no browser will do for you inside a plain `<div>`.
//
// **A `<div role="dialog">` rather than `<dialog>.showModal()`**, deliberately. The native element
// would supply the trap, the backdrop and the top layer; what it would not supply is a testable
// `aria-modal` (it is implied by the top layer rather than carried as an attribute) — and jsdom
// implements neither `showModal` nor the top layer, so every property asserted below would have to
// be asserted in a browser instead, which puts the a11y contract of a panel into the one suite the
// node gate structurally cannot run. The mechanics are forty lines and they are the step's content.
//
// **Sweep: 38 mutants, 33 killed, five equivalents kept with their reasons** — the `cell === undefined`
// guard in `openCell` is unreachable, because the only ids that reach it come out of
// `CONTRAST_CELLS`, and it exists because `find` returns `| undefined`; the `:not([disabled])`
// clauses in {@link FOCUSABLE} are unreachable while nothing in the dialog is disabled; the
// empty-`items` branch of `cycle` is unreachable while the dialog always has six buttons, and
// prevents `items[next].focus()` throwing if it ever is not; and `dialog.tabIndex = -1` versus `0`
// is genuinely unobservable, since `dialog.querySelectorAll` never returns the dialog itself, so
// the value cannot change the cycle. It is `-1` because a container is not a control, and because
// the page-level tab order it would otherwise join is covered by `inert` anyway. The fifth is the
// {@link ladder} memo, which is a cost and not a behaviour: dropping it changes nothing a test can
// see, and asserting it would mean asserting how many times a pure function was called.
import { CONTRAST_CELLS, contrastTable, type ContrastTable, type ContrastTableCell, type ContrastTableRow } from "../shell/contrastGrid.js";
import { constraintLabel, type ConstraintId } from "../engine/vocabulary.js";
import type { ShellState } from "../shell/state.js";
import { h, patch, type Child, type Desc } from "./dom.js";
import { mathPlain, mathText } from "./math.js";

/** What the dialog needs the shell to do. Two functions, and no reach into the shell's closure. */
export interface ContrastsInput {
  /** Open the cell's state. The shell's `applyState`, which resets the session and recomputes. */
  readonly apply: (next: ShellState) => void;
  /** Shut the dialog. The shell clears `session.contrastsOpen` and re-renders. */
  readonly close: () => void;
}

export interface ContrastsDialog {
  /** Show it. Traps focus, makes the rest of the page `inert`, remembers what to return focus to. */
  open(): void;
  /** Hide it, restore `inert`, and put focus back where it was. Idempotent. */
  close(): void;
  readonly isOpen: boolean;
  destroy(): void;
}

/**
 * The ladder, computed once for the whole module.
 *
 * Five full solves, four of them gallery records — the old shell built the panel on first open for
 * exactly that reason, and then never rebuilt it. **The cache is at module scope rather than per
 * dialog** because the stronger fact is available: `CONTRAST_CELLS` are five fixed `ShellState`s and
 * `contrastSideOf` resolves them through `resolveState`, so nothing a reader does to the app can
 * change what they resolve to. A per-instance cache would pay the five solves again every time the
 * shell is re-mounted, which in the suite is once per test.
 */
let LADDER: ContrastTable | null = null;

function ladder(): ContrastTable {
  if (LADDER === null) LADDER = contrastTable();
  return LADDER;
}

/**
 * Everything Tab may land on, in document order.
 *
 * No visibility filter. Every control in this dialog is visible by construction, and the filter that
 * would be written for one — `offsetParent !== null` — is `null` for everything in jsdom, so a trap
 * guarded by it would pass its tests by having nothing to cycle through.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Distinguishes one mounted dialog's heading id from another's, so `aria-labelledby` resolves. */
let SEQ = 0;

/** `⚠` as the square stamp `theme.css` draws. `result.ts`'s helper, same shape and same rule. */
const badge = (level: string, key = "b"): Desc =>
  h("span", { key, class: "badge", "data-level": level }, level);

/**
 * One ledger row in one column.
 *
 * A GLYPH with its word beside it in `srOnly`, which is the old shell's shape and is kept for its
 * reason: five columns of "satisfied" spelled out is a wall of text where the contrast is supposed
 * to be readable at a glance, and a glyph alone names nothing at all. `tag` / `tag warn` carry the
 * colour, so the status is not conveyed by a shape the stylesheet has to know about.
 *
 * **`data-change` rather than a class**, because the two states it marks — the step's DECLARED
 * difference, and a row whose wording moved without the argument doing so — are data the grid is
 * about, and M7.1's finding is that the second must never be drawn as the first. The `srOnly`
 * sentence says which it is, so the distinction survives a stylesheet that has not been written yet
 * and a reader who cannot see an outline.
 */
function entryCell(row: ContrastTableRow, index: number): Desc {
  const entry = row.cells[index];
  const key = `c:${index}`;
  if (entry === null || entry === undefined) {
    return h(
      "td",
      { key, "data-status": "absent" },
      h("span", { key: "g", class: "muted", "aria-hidden": "true" }, "—"),
      h("span", { key: "s", class: "srOnly" }, "this argument has no such row"),
    );
  }
  const declared = row.highlight.includes(index);
  const reworded = !declared && row.muted.includes(index);
  // **`"true"`, spelled out.** `dom.ts` writes a boolean `true` prop as an EMPTY attribute value,
  // and `aria-hidden=""` is not `aria-hidden="true"` — an empty string is invalid and the element is
  // exposed, so the glyph would be announced beside the word it is standing in for. Found by the
  // test below rather than by reading, which is the only way this one is ever found.
  const glyph = entry.status === "satisfied" ? "✓" : entry.status === "failed" ? "✗" : "?";
  return h(
    "td",
    {
      key,
      "data-status": entry.status,
      ...(declared ? { "data-change": "declared" } : reworded ? { "data-change": "wording" } : {}),
      // The claim itself, for a pointer. It is NOT the accessible name — a `title` is announced by
      // some readers and not others — which is why the status word below is real text.
      title: mathPlain(entry.claim),
    },
    h("span", { key: "g", class: entry.status === "failed" ? "tag warn" : "tag", "aria-hidden": "true" }, glyph),
    h(
      "span",
      { key: "s", class: "srOnly" },
      declared
        ? `${entry.status}, and this is the step's declared change`
        : reworded
          ? `${entry.status}, reworded`
          : entry.status,
    ),
  );
}

/**
 * A column's heading: what the argument is, what the step isolates, and what it comes to.
 *
 * **The ANSWER, not `∮`.** C1's contour encloses nothing, so its `∮` is exactly 0 while the integral
 * it determines is π/2 — which is the cell's whole lesson, and the reason `ContrastTableCell.answer`
 * is the record's solved value rather than the ledger's. Printing the ledger's number here would
 * make the last rung of the ladder read as a mistake.
 *
 * **No level beside it.** `ContrastTableCell` carries `answer`, `closes` and `failedAt` and no
 * certificate, so there is nothing here from which an `=` or a `≈` could honestly be derived, and
 * writing one would be the guardrail broken in its plainest form. The one badge drawn is `⚠` on a
 * column that does NOT close, and that comes from `ledger.closes` — a verdict — rather than from a
 * literal choice made here.
 */
function columnHead(cell: ContrastTableCell, onOpen: (id: string) => void): Desc {
  const failed = cell.failedAt === null ? null : constraintLabel(cell.failedAt as ConstraintId);
  const body: Child[] = [
    // Through `mathText` like every other engine-produced sentence in the app: a cell's label is a
    // sentence in the `$…$` convention, and a label that grows a formula must not start printing
    // its own delimiters on screen. Today none of the five carry one, which is precisely why a
    // plain-text set would look right and fail the first time one did.
    h("div", { key: "label" }, ...mathText(cell.label, `l:${cell.id}`)),
    h("div", { key: "note", class: "muted small" }, ...mathText(cell.note, `n:${cell.id}`)),
  ];
  // The step's own sentence — what this column changes about the one before it. Absent on the first
  // column, which changes nothing because there is nothing above it.
  if (cell.because !== null) {
    body.push(h("div", { key: "because", class: "small" }, "↑ ", ...mathText(cell.because, `b:${cell.id}`)));
  }
  body.push(
    cell.answer !== null
      ? h("div", { key: "answer", class: "num" }, ...mathText(cell.answer, `a:${cell.id}`))
      : cell.closes
        ? h("div", { key: "answer", class: "muted" }, "—")
        : h(
            "div",
            { key: "answer", class: "verdict" },
            badge("⚠", `w:${cell.id}`),
            ` does not close (${failed ?? "?"})`,
          ),
  );
  body.push(
    h(
      "div",
      { key: "open", class: "btnRow" },
      h(
        "button",
        {
          key: "b",
          type: "button",
          // The label names the column, because five buttons all reading "Open" name nothing. It is
          // the plain-text form: an `aria-label` is read aloud, and a `$` in it would be spelled.
          "aria-label": `open ${mathPlain(cell.label)} in the app`,
          onClick: () => onOpen(cell.id),
        },
        "Open",
      ),
    ),
  );
  return h("th", { key: `h:${cell.id}`, scope: "col" }, ...body);
}

/** The grid. Rows in `mergedRowOrder`'s order, which is every column's own argument's order. */
function gridOf(table: ContrastTable, onOpen: (id: string) => void): Desc {
  return h(
    "table",
    { key: "grid", class: "numTable contrastGrid" },
    h(
      "thead",
      { key: "h" },
      h(
        "tr",
        { key: "r" },
        // **NOT EMPTY.** axe's `empty-table-header` fired on exactly this corner cell when M7.1 ran
        // it against the OPEN panel, and it is also the one place to say what the row headings are.
        // The a11y roster audits a page in its DEFAULT state, so a panel nothing opens is never
        // audited — which is why the emptiness survived to be found by hand.
        h("th", { key: "corner", scope: "col" }, "Ledger row"),
        ...table.cells.map((cell) => columnHead(cell, onOpen)),
      ),
    ),
    h(
      "tbody",
      { key: "b" },
      ...table.rows.map((row) =>
        h(
          "tr",
          { key: `r:${row.key}` },
          // The bucket's name from `vocabulary.ts`, through `contrastGrid`'s own label —
          // `Boundary terms · vanishing piece 2`, never `KILL/vanish#1`. Step 0.2: the ids are data
          // and the labels are display, and neither is spelled from the other.
          h("th", { key: "rh", scope: "row" }, row.label),
          ...table.cells.map((_, i) => entryCell(row, i)),
        ),
      ),
    ),
  );
}

export function createContrastsDialog(host: HTMLElement, page: HTMLElement, input: ContrastsInput): ContrastsDialog {
  const titleId = `contrasts-title-${++SEQ}`;

  const backdrop = document.createElement("div");
  // **`shell2` TOO, and it is load-bearing.** Every class this dialog reuses — `card2`, `muted`,
  // `badge`, `verdict`, `numTable` — is scoped `.shell2 …` in `theme.css`, and the dialog cannot be
  // a DESCENDANT of the shell: `inert` is not defeasible from CSS, so a modal inside the element it
  // makes inert is a modal nobody can reach. Wearing the class rather than living under it gets the
  // visual system without the containment; `shell2.css` cancels the grid on `.shell2.contrastBackdrop`.
  backdrop.className = "shell2 contrastBackdrop";
  const dialog = document.createElement("div");
  dialog.className = "contrastDialog card2";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", titleId);
  // **Focusable, but never in the tab order.** `-1` is what lets `open()` put focus on the dialog
  // itself rather than on a control — see below — while leaving Tab to cycle the controls alone.
  dialog.tabIndex = -1;
  backdrop.append(dialog);

  let opened = false;
  /** What to give focus back to. Captured on the open that shows it, and only that one. */
  let returnTo: HTMLElement | null = null;
  /** Whether the page already carried `inert` when we arrived, so restoring restores rather than clears. */
  let pageWasInert = false;

  function focusables(): HTMLElement[] {
    return [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
  }

  /**
   * Tab, both ways, entirely by hand.
   *
   * **Every Tab is intercepted, not only the two at the ends.** Letting the browser do the interior
   * moves and stepping in at the wrap would be less code and would be untestable: jsdom implements
   * no tab traversal at all, so a trap written that way would have exactly one observable behaviour
   * in the node gate — the wrap — and the interior would be asserted nowhere. Driving it from the
   * index also means the dialog itself (`tabIndex = -1`, so not in the list) is handled by the same
   * branch that handles the ends: Tab from it goes to the first control, Shift+Tab to the last.
   */
  function cycle(event: KeyboardEvent): void {
    const items = focusables();
    // No controls at all: there is nowhere to send focus, so hold it on the dialog rather than let
    // Tab walk out into a page that is `inert` and cannot be interacted with anyway.
    if (items.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const at = items.indexOf(document.activeElement as HTMLElement);
    const last = items.length - 1;
    const next = event.shiftKey ? (at <= 0 ? last : at - 1) : at === -1 || at === last ? 0 : at + 1;
    event.preventDefault();
    items[next].focus();
  }

  /**
   * Shut it and tell the shell, in that order.
   *
   * Both halves, every time: `close()` takes the DOM down and gives focus back, `input.close()`
   * clears `session.contrastsOpen` so the next render agrees. **Calling only the second would leave
   * the dialog standing whenever the shell did not re-render** — a modal that outlives its own
   * Escape key has trapped the reader, which is the failure this whole file exists to prevent.
   */
  function dismiss(): void {
    closeDialog();
    input.close();
  }

  backdrop.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      // Stopped here: the stage's own Escape abandons a half-drawn pen path, and a reader shutting
      // a dialog over the stage did not ask for that.
      event.stopPropagation();
      dismiss();
      return;
    }
    if (event.key === "Tab") cycle(event);
  });

  // A click on the backdrop and not on the dialog is a click on the page the dialog is covering,
  // which is the gesture every modal reads as "shut this". `event.target` rather than a bubbling
  // check, so a click that began inside the dialog and ended outside it does not close anything.
  backdrop.addEventListener("click", (event: MouseEvent) => {
    if (event.target === backdrop) dismiss();
  });

  function openCell(id: string): void {
    const cell = CONTRAST_CELLS.find((c) => c.id === id);
    if (cell === undefined) return;
    // **Shut BEFORE applying, and the order is not cosmetic.** `applyState` runs `resetTransient`,
    // which clears `session.contrastsOpen` itself and re-renders — so applying first would have the
    // shell decide the dialog is closed while this dialog's DOM is still up and the page is still
    // `inert`, with focus inside a panel the shell has stopped drawing. Shutting first leaves one
    // order: the dialog goes away, focus lands back on the control that opened it (which is still
    // in the document, because nothing has re-rendered yet), and only then does what is behind it
    // change. It is also the old shell's order, which is worth keeping where nothing argues against.
    dismiss();
    input.apply(cell.state());
  }

  /**
   * Fill it in, once, on the first open.
   *
   * Five full solves — four gallery records and a sandbox state — so doing it at mount would put
   * them in front of the app's first frame for a panel most readers never open. It is not rebuilt
   * afterwards either: the ladder is a constant (see {@link ladder}), and a `patch` against an
   * identical description would in any case be a no-op.
   */
  let built = false;
  function build(): void {
    if (built) return;
    built = true;
    patch(dialog, [
      h(
        "div",
        { key: "bar", class: "btnRow" },
        h("h2", { key: "t", id: titleId }, "One step at a time"),
        h("button", { key: "x", type: "button", "aria-label": "close the contrasts dialog", onClick: () => dismiss() }, "Close"),
      ),
      h(
        "p",
        { key: "legend", class: "muted small" },
        "Each column differs from the one on its left in the highlighted row, and in nothing else. " +
          "A dotted cell is the same claim about a differently-named piece.",
      ),
      gridOf(ladder(), openCell),
    ]);
  }

  function openDialog(): void {
    // **A second `open()` must not re-capture the return target.** It would capture whatever is
    // focused now — which, the dialog being up, is a control inside it — and closing would then put
    // focus on a node that has just been removed from the document, dropping the reader at the top
    // of the page with no announcement at all.
    if (opened) return;
    opened = true;
    build();
    returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // `inert` is written as an ATTRIBUTE. The property reflects it in every engine that implements
    // the feature, and jsdom implements neither — measured: `"inert" in document.createElement("div")`
    // is false and there is no accessor on `HTMLElement.prototype`, so `el.inert = true` merely
    // creates an expando that reflects nowhere and tells a test nothing. The attribute is the one
    // write that is true in a browser and observable in the gate.
    pageWasInert = page.hasAttribute("inert");
    if (!pageWasInert) page.setAttribute("inert", "");

    host.append(backdrop);

    // **Focus lands on the DIALOG, not on its first control.** Its first control is `Close`, and a
    // reader who opens a panel and presses Space — to scroll the grid, which is the natural next
    // keystroke — would shut it again immediately. Focusing the container announces the dialog by
    // its `aria-labelledby` heading, puts nothing under the space bar, and leaves the very next Tab
    // landing on `Close` anyway, which is where focusing it would have started.
    dialog.focus();
  }

  function closeDialog(): void {
    // Idempotent, and the guard is what makes it so: a second call must not move focus a second
    // time. `dismiss()` is reached from Escape, from the button, from the backdrop AND from the
    // shell's own re-render, so being called twice about one gesture is the normal case rather than
    // the defensive one.
    if (!opened) return;
    opened = false;

    backdrop.remove();
    if (!pageWasInert) page.removeAttribute("inert");

    // Back where it came from. `isConnected` because the state behind the dialog may have changed
    // while it was up; focusing a detached node silently does nothing in a browser and leaves the
    // reader on `<body>`, so the null case is at least honest about having nowhere to go.
    //
    // **`returnTo` is deliberately NOT cleared here.** Clearing it would be a second guard against
    // the same defect — a second close moving focus a second time — and `open()` reassigns it
    // anyway, so the only thing it would buy is that neither guard could be removed observably.
    // Two sufficient guards for one property is how a mutation sweep comes back with two equivalent
    // mutants and no information; the idempotency is stated once, above, where a test can reach it.
    if (returnTo !== null && returnTo.isConnected) returnTo.focus();
  }

  return {
    open: openDialog,
    close: closeDialog,
    get isOpen(): boolean {
      return opened;
    },
    destroy: (): void => {
      closeDialog();
      backdrop.remove();
    },
  };
}
