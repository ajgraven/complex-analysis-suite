// The contrast ladder, as a STRIP OF CARDS above the stage — M8 step 3.5, plan §6.
//
// M7.1 built the ladder itself: five arguments in an order where each differs from the one above it
// in a declared, verified set of ledger rows. `shell/contrastGrid.ts` computes the whole table and
// `test/contrastGrid.test.ts` requires the real difference set to match the declared one in both
// directions. **Nothing here recomputes any of that.** This file is the presentation, and the only
// judgement it makes is about the reader's hands.
//
// **IT WAS A MODAL UNTIL THIS STEP, AND THE SHAPE WAS THE DEFECT.** A dialog over the stage had to
// shut before it applied a cell, because it covered the thing it was about to change — so the
// ladder could only ever be walked one rung at a time, each rung costing a reopen, and the panel
// was never on screen beside the argument it was making a claim about. A ladder whose whole content
// is *this differs from that in one row* is a comparison, and a comparison that cannot be seen next
// to what it compares is a list. The strip stays open while the reader steps along it
// (`resetTransient` no longer clears `contrastsOpen`), marks the rung that is showing, and puts the
// declared row under a highlight in the Result card's own check list.
//
// **The grid went with it.** Five columns × nine rows of glyphs was a table a reader had to decode
// before it said anything, and four fifths of its cells were `✓` against `✓` — the agreement that
// makes the ladder work, drawn as the bulk of the picture. What a rung has to say is which row
// moved, and that is one sentence and one row label. `contrastTable` still computes every cell,
// because the row LABELS and the changed row's new STATUS come out of it, and because the table is
// what `contrastGrid.test.ts` checks the declarations against.
import { CONTRAST_CELLS, contrastTable, type ContrastTable, type ContrastTableCell } from "./contrastGrid.js";
import { constraintLabel, type ConstraintId } from "../engine/vocabulary.js";
import type { CardContext } from "./cards/card.js";
import { h, type Child, type Desc } from "./dom.js";
import { mathText } from "./math.js";

/**
 * The ladder, computed once for the whole module.
 *
 * Five full solves, four of them gallery records — the old shell built the panel on first open for
 * exactly that reason, and then never rebuilt it. **The cache is at module scope** because the
 * stronger fact is available: `CONTRAST_CELLS` are five fixed `ShellState`s and `contrastSideOf`
 * resolves them through `resolveState`, so nothing a reader does to the app can change what they
 * resolve to. Kept from the dialog, where the alternative was paying five solves per re-mount.
 */
let LADDER: ContrastTable | null = null;

export function ladder(): ContrastTable {
  if (LADDER === null) LADDER = contrastTable();
  return LADDER;
}

/** `⚠` as the square stamp `theme.css` draws. `result.ts`'s helper, same shape and same rule. */
const badge = (level: string, key = "b"): Desc =>
  h("span", { key, class: "badge", "data-level": level }, level);

/** One rung's declared difference: the rows it moves, with the status each one lands on. */
export interface LadderChange {
  readonly key: string;
  readonly label: string;
  readonly status: "satisfied" | "failed" | "unknown" | "absent";
}

/**
 * What the step into column `index` declares, read off the table rather than off the datum.
 *
 * Through `ContrastTableRow.highlight`, which is where `contrastGrid` already put the declaration —
 * so a row this names is a row the grid's own test has checked against the engine, and a second
 * reader of `differsAbove.rows` cannot drift from the first.
 */
export function changesAt(table: ContrastTable, index: number): readonly LadderChange[] {
  return table.rows
    .filter((row) => row.highlight.includes(index))
    .map((row) => ({
      key: row.key,
      label: row.label,
      status: row.cells[index]?.status ?? "absent",
    }));
}

/** Past-tense, for a sentence rather than a column heading: what the row DID at this rung. */
function became(status: LadderChange["status"]): string {
  if (status === "failed") return "now fails";
  if (status === "satisfied") return "now holds";
  if (status === "unknown") return "is now undecided";
  return "is gone";
}

/**
 * One rung.
 *
 * **The whole card is the button**, not a card with an Open button in it. The grid had the second
 * shape because a `<th>` cannot be pressed; here the card IS the control, so its accessible name is
 * the column's spoken twin and there is no second target to explain. Its children are `<span>`s
 * rather than `<div>`s for one reason: a `<button>`'s content model is phrasing content, and a
 * `<div>` inside one is invalid HTML that happens to render.
 *
 * **One sentence, not two.** `note` says what the cell IS and `because` says what the step
 * ISOLATES; the first is the only thing to say about the first rung, which has no step into it, and
 * the second is the only thing worth saying about the other four. A card carrying both is a
 * paragraph in a strip 5 cards wide.
 */
function caseCard(
  cell: ContrastTableCell,
  changes: readonly LadderChange[],
  current: boolean,
  onOpen: (id: string) => void,
): Desc {
  const failed = cell.failedAt === null ? null : constraintLabel(cell.failedAt as ConstraintId);
  const body: Child[] = [
    // Through `mathText` like every other engine-produced sentence in the app: a cell's label is a
    // sentence in the `$…$` convention, and a label that grows a formula must not start printing
    // its own delimiters on screen.
    h("span", { key: "label", class: "caseLabel" }, ...mathText(cell.label, `l:${cell.id}`)),
    h(
      "span",
      { key: "why", class: "muted small caseWhy" },
      ...mathText(cell.because ?? cell.note, `w:${cell.id}`),
    ),
  ];
  if (changes.length > 0) {
    body.push(
      h(
        "span",
        { key: "chg", class: "small caseChange" },
        // **The COUNT is said out loud when it is not one**, because the plan's sentence for this
        // card is "the one row that changed" and for the last rung that is false: C1 declares five.
        // M7.1 measured it and the datum says so; a card that printed the first of five would be
        // the plan's sentence made true by hiding the other four.
        changes.length === 1
          ? `${changes[0].label} ${became(changes[0].status)}`
          : `${changes.length} checks change: ${changes.map((c) => c.label).join(", ")}`,
      ),
    );
  }
  body.push(
    // **The ANSWER, not `∮`.** C1's contour encloses nothing, so its `∮` is exactly 0 while the
    // integral it determines is π/2 — which is the cell's whole lesson, and the reason
    // `ContrastTableCell.answer` is the record's solved value rather than the ledger's.
    //
    // **No level beside it.** `ContrastTableCell` carries `answer`, `closes` and `failedAt` and no
    // certificate, so there is nothing here from which an `=` or a `≈` could honestly be derived.
    // The one badge drawn is `⚠` on a column that does NOT close, and that comes from
    // `ledger.closes` — a verdict — rather than from a literal choice made here.
    cell.answer !== null
      ? h("span", { key: "answer", class: "num caseAnswer" }, ...mathText(cell.answer, `a:${cell.id}`))
      : cell.closes
        ? h("span", { key: "answer", class: "muted caseAnswer" }, "—")
        : h(
            "span",
            { key: "answer", class: "verdict caseAnswer" },
            badge("⚠", `w:${cell.id}`),
            ` incomplete (${failed === null ? "?" : failed.toLowerCase()})`,
          ),
  );
  return h(
    "button",
    {
      key: `case:${cell.id}`,
      type: "button",
      class: "ladderCard",
      "data-cell": cell.id,
      // **`aria-current`, not `aria-pressed`.** The rungs are not five independent toggles; one of
      // them is the argument on screen, and that is what `current` means everywhere else on the web.
      ...(current ? { "aria-current": "true" } : {}),
      // The cell's SPOKEN twin, not `mathPlain` of the typeset one, which since step 2.1 would be
      // the LaTeX source read out backslash by backslash.
      "aria-label": `open ${cell.labelText} in the app`,
      onClick: () => onOpen(cell.id),
    },
    ...body,
  );
}

/**
 * The strip, or nothing at all.
 *
 * **Nothing rather than a hidden element**, so the grid row collapses and a closed ladder costs the
 * stage no height — and so the five solves are not paid on a mount that never opens it, `ladder()`
 * being called only from here.
 */
export function contrastStrip(ctx: CardContext): readonly Desc[] {
  if (!ctx.session.contrastsOpen) return [];
  const table = ladder();
  const current = ctx.session.contrast?.cell ?? null;
  return [
    h(
      "section",
      { key: "ladder", class: "ladder2", "aria-labelledby": "ladderTitle" },
      h(
        "div",
        { key: "head", class: "ladderHead" },
        h("h2", { key: "t", id: "ladderTitle" }, "Contrasting arguments"),
        h(
          "p",
          { key: "legend", class: "muted small" },
          // **NOT "rung".** That is this program's word for a step of the drill (`denylist.test.ts`
          // polices it), and the word for one of these on screen is the research's own:
          // contrasting CASES. Two panels using one word for two things is how a reader comes to
          // think the ladder is a fifth rung of the drill.
          "Each case differs from the one before it in the named check, and in nothing else. " +
            "Open one and that check is highlighted under What was checked.",
        ),
        h(
          "button",
          {
            key: "x",
            type: "button",
            "aria-label": "close the contrast ladder",
            onClick: () => ctx.actions.setContrastsOpen(false),
          },
          "Close",
        ),
      ),
      h(
        "ol",
        { key: "ladderList", class: "ladderList" },
        ...table.cells.map((cell, i) =>
          h(
            "li",
            { key: `c:${cell.id}` },
            caseCard(cell, changesAt(table, i), cell.id === current, (id) => ctx.actions.openContrast(id)),
          ),
        ),
      ),
    ),
  ];
}

/** The cell a rung names, for the shell's action. `undefined` for an id that is not one. */
export function contrastCell(id: string): (typeof CONTRAST_CELLS)[number] | undefined {
  return CONTRAST_CELLS.find((c) => c.id === id);
}
