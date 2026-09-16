// The contrast ladder, as a MODAL — M8 step 1.7, plan §4.0.
//
// M7.1 built the ladder itself: five arguments in an order where each differs from the one above it
// in a declared, verified set of ledger rows. `shell/contrastGrid.ts` computes the whole table and
// `test/contrastGrid.test.ts` requires the real difference set to match the declared one in both
// directions. **Nothing here recomputes any of that.** This file is the presentation, and the only
// judgement it makes is about the reader's hands.
//
// **The dialog MECHANICS moved to `modal.ts` at step 1.8**, on the second-consumer rule: the front
// door needs the same focus trap, the same `inert`, the same Escape and the same focus return, and
// two copies of a forty-line trap is how two dialogs come to disagree about what Escape does. What
// is left here is what has an opinion about the ladder — its grid, its heading, and the order in
// which a cell shuts the panel and applies its state. The reasons the mechanics are shaped as they
// are went with them, including why this is a `<div role="dialog">` rather than `<dialog>`.
//
// **Sweep at 1.7: 38 mutants, 33 killed, five equivalents kept with their reasons.** Three were
// about the mechanics and are recorded in `modal.ts` now. The two that are this file's: the
// `cell === undefined` guard in `openCell` is unreachable, because the only ids that reach it come
// out of `CONTRAST_CELLS`, and it exists because `find` returns `| undefined`; and the {@link ladder}
// memo is a cost rather than a behaviour, since dropping it changes nothing a test can see and
// asserting it would mean asserting how many times a pure function was called.
import { CONTRAST_CELLS, contrastTable, type ContrastTable, type ContrastTableCell, type ContrastTableRow } from "../shell/contrastGrid.js";
import { constraintLabel, type ConstraintId } from "../engine/vocabulary.js";
import type { ShellState } from "../shell/state.js";
import { h, patch, type Child, type Desc } from "./dom.js";
import { createModal } from "./modal.js";
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
  // **`shell2` on the BACKDROP, and it is load-bearing.** Every class this dialog reuses — `card2`,
  // `muted`, `badge`, `verdict`, `numTable` — is scoped `.shell2 …` in `theme.css`, and the dialog
  // cannot be a DESCENDANT of the shell: `inert` is not defeasible from CSS, so a modal inside the
  // element it makes inert is a modal nobody can reach. Wearing the class rather than living under
  // it gets the visual system without the containment; `shell2.css` cancels the grid on
  // `.shell2.modalBackdrop`.
  const modal = createModal({
    host,
    page,
    backdropClass: "shell2 modalBackdrop",
    dialogClass: "modalDialog card2",
    onClose: input.close,
    build: (dialog, titleId) => {
      patch(dialog, [
        h(
          "div",
          { key: "bar", class: "btnRow" },
          h("h2", { key: "t", id: titleId }, "One step at a time"),
          h(
            "button",
            { key: "x", type: "button", "aria-label": "close the contrasts dialog", onClick: () => modal.dismiss() },
            "Close",
          ),
        ),
        h(
          "p",
          { key: "legend", class: "muted small" },
          "Each column differs from the one on its left in the highlighted row, and in nothing else. " +
            "A dotted cell is the same claim about a differently-named piece.",
        ),
        gridOf(ladder(), openCell),
      ]);
    },
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
    modal.dismiss();
    input.apply(cell.state());
  }

  return {
    open: modal.open,
    close: modal.close,
    get isOpen(): boolean {
      return modal.isOpen;
    },
    destroy: modal.destroy,
  };
}
