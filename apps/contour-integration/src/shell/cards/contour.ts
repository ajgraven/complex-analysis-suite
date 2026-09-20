// The Contour card — the piece list, and the ways to replace it.
//
// M8 step 1.4b, and **editable since step 4.3**. What is here is the template picker, the pen,
// `Reverse orientation`, and one row per piece: its colour, its name, what the argument uses it
// FOR, what the ledger made of it, and — in the sandbox — the controls that change all of that.
//
// **THE ROLE MENU IS NOT THE PLAN'S LIST, AND STEP 4.1 IS WHY.** The plan offers *ML estimate /
// Jordan's lemma / large-arc limit / branch arc / log arc / wedge bound / strip side / square
// side*, written before the lemma catalogue was read against the code. Measured there: `L7` is the
// periodic-side cancellation, which is the `reproduces` ROLE rather than a bound, and `L8` is
// Sokhotski–Plemelj, an identity about the whole integral; the strip and square sides are `L1`/`L2`
// on a SEGMENT, dispatched by geometry rather than chosen; and the branch and log arcs are the same
// `L1`/`L2` under a declared branch factor. So what a reader can actually choose between is four
// vanishing lemmas and two known limits, and a menu offering eight would offer two that cannot
// bound anything and three that are the same two under other names.
//
// **`reproduces` is not offered at all**, which is the plan's own recorded scope limit for Phase 4:
// its coefficient needs a solve the sandbox does not have, and M7.3 found the ledger takes that
// role on faith. Offering it would let a reader mark a piece with a claim nothing checks.
//
// The row's colour chip is the stroke on the stage — the same six hues, from `theme.css`'s
// `--piece-N`, which `inkTheme.ts` also draws with. A reader matching a row to a curve is matching
// one colour, not two that have to be kept in step.
//
// **Under a record there is no picker and no pen.** The contour is the record's, and swapping it
// would leave a worked example whose pieces no longer match the argument it is making.
import { fmtCx } from "../../kernel/decimal.js";
import { lemmaLabel, roleLabel, tagLabel, templateLabel } from "../../engine/vocabulary.js";
import { drillMask } from "../drillPanel.js";
import { penPath } from "../../engine/contour/pen.js";
import { TEMPLATES } from "../../shell/templates.js";
import type { ContourIntegral } from "../../engine/contour/integrate.js";
import type { LedgerResult, LedgerRow } from "../../engine/ledger.js";
import type { LemmaId, Piece, PieceRole } from "../../engine/contour/model.js";
import { h, type Child } from "../dom.js";
import { mathSpoken, mathText } from "../math.js";
import { card, nothing, type Card } from "./card.js";

/**
 * What a reader may set a piece to, as one flat list of choices.
 *
 * Flat rather than the plan's nested `vanishes ▸ …`, because a `<select>` with `<optgroup>`s says
 * the same thing with one control and one keystroke instead of two — and the grouping IS the
 * optgroup's own label, so nothing is lost. Each entry is a `(role, lemma)` pair, which is exactly
 * what `setRole` takes: the two are one choice for a reader and two fields in the model, and the
 * translation lives here rather than in six places that each have to remember `L4` is a role.
 */
const ROLE_CHOICES: readonly {
  readonly id: string;
  readonly group: string;
  readonly role: PieceRole;
  readonly lemma?: LemmaId;
}[] = [
  { id: "target", group: "what it is", role: "target" },
  { id: "free", group: "what it is", role: "free" },
  // **A vanishing piece with NO lemma declared is a real state, and the first draft had no entry
  // for it.** Every sandbox template produces one — the semicircle's arc is `vanish` with nothing
  // declared — and step 4.1's rule is that an undeclared piece keeps the shape-driven pick, which
  // is the behaviour a reader gets before they have chosen anything. Without this entry the menu
  // opened on a DISABLED option reading *vanishing piece*, so the commonest state in the app was
  // the one the control could not return to. Found in a browser; the card renders identically
  // either way in jsdom, because a `<select>` with no matching value shows its first option and
  // `choiceOf` was returning `""` for a piece the menu simply did not describe.
  { id: "vanish", group: "what it is", role: "vanish" },
  { id: "L1", group: "vanishes by", role: "vanish", lemma: "L1" },
  { id: "L2", group: "vanishes by", role: "vanish", lemma: "L2" },
  { id: "L3", group: "vanishes by", role: "vanish", lemma: "L3" },
  { id: "L6", group: "vanishes by", role: "vanish", lemma: "L6" },
  // **`L4` and `L5` are `vanish` too, and do NOT vanish** — the role is where a piece is filed and
  // the lemma is what happens to it. Both contribute a known limit to Pass 5 (`iα·Res` and `iα·L`),
  // which is why the ledger files them under the same role and reads the lemma to tell them apart.
  // A reader choosing "carries a known limit" is choosing the second field, not the first.
  { id: "L4", group: "carries a known limit", role: "vanish", lemma: "L4" },
  { id: "L5", group: "carries a known limit", role: "vanish", lemma: "L5" },
];

/** What a choice is CALLED. The role's own word where there is no lemma, the lemma's where there is. */
const choiceLabel = (choice: (typeof ROLE_CHOICES)[number]): string =>
  choice.lemma === undefined ? roleLabel(choice.role) : lemmaLabel(choice.lemma);

/** The groups, in the order they are offered. Derived from the list so a new entry cannot be lost. */
const ROLE_GROUPS = [...new Set(ROLE_CHOICES.map((c) => c.group))];

/** Which choice a piece currently is, or `""` for one no menu entry describes (`reproduces`). */
function choiceOf(piece: Piece): string {
  const found = ROLE_CHOICES.find((c) => c.role === piece.role && c.lemma === piece.lemma);
  return found?.id ?? "";
}

/** The ledger the current resolution produced, or null — the source of each piece's own status. */
function ledgerOf(ctx: Parameters<Card>[0]): LedgerResult | null {
  const { resolution } = ctx;
  if (resolution.kind === "gallery") return resolution.run?.ledger ?? null;
  if (resolution.kind === "plain" || resolution.kind === "declared") return resolution.analysis.ledger;
  return null;
}

/**
 * The row's own status: the ledger row that names this piece, if any.
 *
 * **The LEDGER's row and not a second judgement.** The card could ask whether a piece has a lemma
 * and whether the lemma suits the integrand, and it would then be a second reader of a question
 * `engine/ledger.ts` answers — the two would agree until one of them was edited. What the row shows
 * is that row's own status and its own sentence.
 */
function statusOf(ledger: LedgerResult | null, piece: Piece): LedgerRow | undefined {
  return ledger?.rows.find((r) => r.pieceId === piece.id && r.constraint === "KILL");
}

/** The integral the current resolution computed, or null — the source of each piece's own value. */
function integralOf(ctx: Parameters<Card>[0]): ContourIntegral | null {
  const { resolution } = ctx;
  if (resolution.kind === "gallery") return resolution.run?.integral ?? null;
  if (resolution.kind === "plain" || resolution.kind === "declared") return resolution.analysis.integral;
  return null;
}

export const contourCard: Card = (ctx) => {
  const { state, resolution, session, actions } = ctx;
  // **The PIECE LIST is the record's contour, written out** — M8 step 3.4. At rung iii the stage
  // already draws an empty piece list, because the record's contour is the answer to the rung's
  // question; this card was printing the same contour in words, *the $R \to \infty$ semicircle
  // (upper when $a > 0$)* and all, one card below the question asking which half-plane. Masking the
  // drawing and leaving the caption is masking nothing, which is the lesson `drillMask`'s own
  // header records about the ledger and the derivation.
  if (drillMask(ctx) === "argument") {
    return card("contour", nothing("Hidden: the contour is the question."));
  }
  const sandbox = state.mode === "sandbox";
  // In gallery mode the contour is the RECORD's output, rebuilt on every run (M6.1's finding).
  const contour =
    resolution.kind === "gallery" ? (resolution.run?.contour ?? state.contour) : state.contour;
  const integral = integralOf(ctx);
  const pen = session.pen;

  const tools: Child[] = [];
  if (sandbox) {
    tools.push(
      h(
        "label",
        { key: "tpl", class: "pickRow" },
        h("span", { key: "l", class: "muted small" }, "Template"),
        h(
          "select",
          {
            key: "s",
            "aria-label": "replace the contour with a template",
            value: state.contourSource?.template ?? "",
            onChange: (e: Event) => actions.setTemplate((e.target as HTMLSelectElement).value),
          },
          // The empty option is what a HAND-DRAWN contour selects: it has no template, and a picker
          // claiming it is a circle would be the one place the app lies about what is on screen.
          h("option", { key: "none", value: "" }, penPath(contour) === null ? "—" : "drawn by hand"),
          ...TEMPLATES.map((t) => h("option", { key: t.id, value: t.id }, templateLabel(t.id))),
        ),
      ),
    );

    if (pen === null) {
      tools.push(
        h(
          "div",
          { key: "pen", class: "btnRow" },
          h(
            "button",
            { key: "draw", "aria-label": "draw a contour by hand", onClick: () => actions.penStart() },
            "Draw",
          ),
          // **`∮` changes SIGN**, which is the point: the orientation is part of the residue
          // theorem's statement rather than a convention the app applied on the reader's behalf.
          h(
            "button",
            { key: "rev", "aria-label": "walk the same contour the other way", onClick: () => actions.reverseContour() },
            "Reverse orientation",
          ),
          penPath(contour) === null
            ? null
            : h("span", { key: "tag", class: "tag" }, `drawn · ${contour.pieces.length} pieces`),
        ),
      );
    } else {
      // **THE GRAMMAR, WRITTEN DOWN** (research 07 rule 6). Not a lesson — the keys ARE the
      // affordance, and a tool whose gestures are undiscoverable is a tool nobody finds.
      tools.push(
        h(
          "div",
          { key: "pen", class: "btnRow" },
          h("span", { key: "n", class: "num" }, `${pen.nodes.length} vertex${pen.nodes.length === 1 ? "" : "es"}`),
          h(
            "button",
            {
              key: "close",
              disabled: pen.nodes.length < 3,
              "aria-label": "close the drawn path and adopt it as the contour",
              onClick: () => actions.penCommit(true),
            },
            "Close",
          ),
          h(
            "button",
            { key: "back", disabled: pen.nodes.length === 0, "aria-label": "remove the last vertex", onClick: () => actions.penBack() },
            "Undo",
          ),
          h("button", { key: "stop", "aria-label": "abandon the drawn path", onClick: () => actions.penStop() }, "Cancel"),
        ),
        h(
          "p",
          { key: "help", class: "muted small" },
          "Click to place a corner, drag to bow the piece into an arc, click the first vertex to " +
            "close. Backspace drops the last corner, Escape abandons the path, Alt suppresses snapping.",
        ),
      );
    }
  }

  const ledger = ledgerOf(ctx);
  const editing = session.renaming;

  const rows = contour.pieces.map((piece, k) => {
    const value = integral?.pieces[k];
    const status = statusOf(ledger, piece);
    const body: Child[] = [
      h("span", { key: "c", class: "swatch", style: `background: var(--piece-${piece.colour % 6})` }),
      // **The name is a text box while it is being renamed and a name otherwise**, rather than an
      // always-present input: a rail of eight text fields reads as a form, and the piece list is a
      // statement about the contour that happens to be editable.
      editing === piece.id
        ? h("input", {
            key: "rn",
            class: "pieceRename",
            type: "text",
            value: piece.name,
            "aria-label": `rename ${mathSpoken(piece.name)}`,
            onKeydown: (e: Event) => {
              const ev = e as KeyboardEvent;
              if (ev.key === "Enter") {
                ev.preventDefault();
                actions.renamePiece(piece.id, (ev.target as HTMLInputElement).value);
                actions.setRenaming(null);
              } else if (ev.key === "Escape") {
                // **Escape abandons, and it stops HERE — and the stopping is load-bearing now.**
                // This comment said twice that it was not: the first draft claimed the guard
                // protects the pen and the modals, and the correction said nothing the event
                // bubbles through acts on Escape at all, so the line only stated the ROW's
                // contract. Both readings are out of date. The shell takes Escape on the DOCUMENT
                // while a pen path is open, and the rename box is inside that subtree — so without
                // `stopPropagation` a cancel pressed in this box would also throw away a half-drawn
                // contour. The contract is the same and it now has a consequence: a cancel key
                // pressed in this box cancels this box and nothing else. Asserted by a listener on
                // an ancestor, because a test aimed at the pen passed with the line removed.
                ev.preventDefault();
                ev.stopPropagation();
                actions.setRenaming(null);
              }
            },
            onBlur: () => actions.setRenaming(null),
          })
        : h("span", { key: "n", class: "pieceName" }, ...mathText(piece.name, `pn${k}`)),
    ];

    if (sandbox) {
      body.push(
        h(
          "select",
          {
            key: "role",
            class: "pieceRole",
            "aria-label": `what ${mathSpoken(piece.name)} is for`,
            value: choiceOf(piece),
            onChange: (e: Event) => {
              const chosen = ROLE_CHOICES.find((c) => c.id === (e.target as HTMLSelectElement).value);
              if (chosen !== undefined) actions.setPieceRole(piece.id, chosen.role, chosen.lemma);
            },
          },
          // The empty option exists for `reproduces`, which no entry describes and the sandbox
          // cannot solve for. It is `disabled` so it cannot be CHOSEN, only shown — a record's piece
          // carrying it reads honestly instead of reading as a `target`.
          choiceOf(piece) === ""
            ? h("option", { key: "none", value: "", disabled: true }, roleLabel(piece.role))
            : null,
          ...ROLE_GROUPS.map((group) =>
            h(
              "optgroup",
              { key: `g:${group}`, label: group },
              ...ROLE_CHOICES.filter((c) => c.group === group).map((c) =>
                h("option", { key: c.id, value: c.id }, choiceLabel(c)),
              ),
            ),
          ),
        ),
      );
    } else {
      body.push(h("span", { key: "r", class: "tag" }, roleLabel(piece.role)));
    }

    // **The ledger's own verdict on this piece, where the reader is choosing it.** A role menu with
    // no answer beside it is a menu of guesses; the badge and the sentence come straight off the
    // row `engine/ledger.ts` wrote, so a lemma that does not apply says so here and in the Result
    // card with one voice.
    if (status !== undefined) {
      // **The NAME is the verdict; the SENTENCE is not put here** — M8 step 3.6's finding, in the
      // one place step 4.3 could have repeated it. A vanishing row's claim is a formula (`\left|\int
      // f\,dz\right| \le 4.928e-2 …`) and `mathPlain` strips the `$` and leaves the macros, so an
      // `srOnly` copy of it would put LaTeX source on screen and read it aloud character by
      // character. The full sentence is in the Result card's check list, typeset, which is where a
      // reader looking for WHY goes; this row says only which of the three verdicts it got.
      //
      // **And that argument applies to a `title` too, which is what the 2026-09-20 review measured.**
      // There was one here, `mathPlain(status.claim)`, under a comment claiming it was neither on
      // screen nor in the accessible name — both halves false: a browser draws a `title` as a
      // tooltip, and where an `aria-label` is present the tree takes the `title` as the accessible
      // DESCRIPTION. Across the 43 mounted states it carried a backslash 52 times. `mathSpoken`
      // would not rescue it either, since it maps NAMES and not integrals, so the attribute is gone
      // and the claim stays where it is already typeset.
      const said =
        status.status === "failed"
          ? "not certified"
          : status.status === "satisfied"
            ? "certified"
            : "undecided";
      body.push(
        h(
          "span",
          {
            key: "st",
            class: status.status === "failed" ? "tag warn" : "tag",
            "data-status": status.status,
            "aria-label": `${said} — ${mathSpoken(piece.name)}`,
          },
          status.status === "failed" ? "⚠" : status.status === "satisfied" ? "✓" : "?",
        ),
      );
    }

    body.push(
      // **A SKIPPED QUADRATURE HAS NO VALUE, AND `0 + 0i` IS NOT IT.** `integrateContour` fills the
      // piece list with zeros when it declines to sample a multivalued integrand, which is fine as a
      // placeholder and a lie on screen: D6's upper edge is worth 2.22, and printing `0 + 0i` beside
      // it is exactly the number a reader would go looking for the bug in.
      value === undefined
        ? null
        : integral?.quadratureSkipped === undefined
          ? h("span", { key: "v", class: "num pieceValue" }, fmtCx(value.value))
          : h("span", { key: "v", class: "tag" }, tagLabel("not-sampled")),
      value?.capped === true ? h("span", { key: "cap", class: "tag warn" }, tagLabel("quadrature-capped")) : null,
    );

    if (sandbox) {
      const tool = (key: string, label: string, glyph: string, onClick: () => void): Child =>
        h("button", { key, class: "pieceTool", type: "button", "aria-label": `${label} ${mathSpoken(piece.name)}`, onClick }, glyph);
      body.push(
        h(
          "span",
          { key: "tools", class: "pieceTools" },
          tool("up", "move earlier in the list,", "↑", () => actions.movePiece(piece.id, -1)),
          tool("down", "move later in the list,", "↓", () => actions.movePiece(piece.id, 1)),
          tool("rev", "walk the other way,", "⇄", () => actions.reversePiece(piece.id)),
          tool("ins", "insert a piece after", "＋", () => actions.insertPiece(piece.id, "segment")),
          tool("ren", "rename", "✎", () => actions.setRenaming(piece.id)),
          tool("del", "delete", "✕", () => actions.deletePiece(piece.id)),
        ),
      );
    }

    return h(
      "li",
      {
        key: `p:${piece.id}`,
        class: session.hover.piece === piece.id ? "hot" : undefined,
        "data-piece": piece.id,
        onPointerenter: () => actions.hover(piece.id),
        onPointerleave: () => actions.hover(null),
        // **Alt+↑/↓ reorders from the keyboard**, on the ROW rather than on the grip: a reader
        // moving a row with the keyboard has focus wherever they last were inside it, and a handler
        // on the grip alone would work only when the grip itself was focused. Alt because ↑/↓ alone
        // belong to whatever control has focus — a `<select>` most of all.
        onKeydown: (e: Event) => {
          const ev = e as KeyboardEvent;
          if (!sandbox || !ev.altKey || (ev.key !== "ArrowUp" && ev.key !== "ArrowDown")) return;
          ev.preventDefault();
          actions.movePiece(piece.id, ev.key === "ArrowUp" ? -1 : 1);
        },
      },
      ...body,
    );
  });

  return card("contour", ...tools, h("ul", { key: "pieces", class: "pieces2" }, ...rows));
};
