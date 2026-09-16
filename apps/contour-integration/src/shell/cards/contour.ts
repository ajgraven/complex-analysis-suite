// The Contour card — the piece list, and the ways to replace it.
//
// M8 step 1.4b. **Phase 1 is READ-ONLY on the list**; editing a piece is Phase 4. What is here is
// the template picker, the pen, `Reverse orientation`, and one row per piece: its colour, its name,
// what the argument uses it FOR, and what the quadrature made of it.
//
// The row's colour chip is the stroke on the stage — the same six hues, from `theme.css`'s
// `--piece-N`, which `inkTheme.ts` also draws with. A reader matching a row to a curve is matching
// one colour, not two that have to be kept in step.
//
// **Under a record there is no picker and no pen.** The contour is the record's, and swapping it
// would leave a worked example whose pieces no longer match the argument it is making.
import { fmtCx } from "../../kernel/decimal.js";
import { roleLabel, tagLabel, templateLabel } from "../../engine/vocabulary.js";
import { penPath } from "../../engine/contour/pen.js";
import { TEMPLATES } from "../../shell/templates.js";
import type { ContourIntegral } from "../../engine/contour/integrate.js";
import { h, type Child } from "../dom.js";
import { mathText } from "../math.js";
import { card, type Card } from "./card.js";

/** The integral the current resolution computed, or null — the source of each piece's own value. */
function integralOf(ctx: Parameters<Card>[0]): ContourIntegral | null {
  const { resolution } = ctx;
  if (resolution.kind === "gallery") return resolution.run?.integral ?? null;
  if (resolution.kind === "plain" || resolution.kind === "declared") return resolution.analysis.integral;
  return null;
}

export const contourCard: Card = (ctx) => {
  const { state, resolution, session, actions } = ctx;
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

  const rows = contour.pieces.map((piece, k) => {
    const value = integral?.pieces[k];
    return h(
      "li",
      {
        key: `p:${piece.id}`,
        class: session.hover.piece === piece.id ? "hot" : undefined,
        onPointerenter: () => actions.hover(piece.id),
        onPointerleave: () => actions.hover(null),
      },
      h("span", { key: "c", class: "swatch", style: `background: var(--piece-${piece.colour % 6})` }),
      h("span", { key: "n", class: "pieceName" }, ...mathText(piece.name, `pn${k}`)),
      h("span", { key: "r", class: "tag" }, roleLabel(piece.role)),
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
  });

  return card("contour", ...tools, h("ul", { key: "pieces", class: "pieces2" }, ...rows));
};
