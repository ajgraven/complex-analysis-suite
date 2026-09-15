// The Integrand card — the expression, typeset back at the reader.
//
// M8 step 1.4. Three things the old shell did not do: the input's accessible name says WHICH
// function is in it (under a declaration the box holds the COFACTOR, and the old shell said so only
// by swapping a visible `f(z) = ` / `R(z) = ` label that no screen reader reached); a live typeset
// preview under the box, so what the engine parsed is visible before anything is computed; and a
// parse failure reads as a sentence rather than as the parser's own token names.
//
// **In gallery mode the expression is the RECORD's**, so the box is read-only and says so — the same
// decision as the contour's, for the same reason: a worked example whose integrand a reader edits is
// no longer the example the ledger is arguing about.
import { toLatex } from "@cas/expr";

import { PRESETS } from "../../shell/presets.js";
import { contourIntegrandLatex } from "../../families/latex.js";
import { h } from "../dom.js";
import { math, mathText } from "../math.js";
import { card, type Card } from "./card.js";
import { parseErrorText } from "./parseError.js";

export const integrandCard: Card = ({ state, resolution, actions }) => {
  if (resolution.kind === "gallery") {
    return card(
      "integrand",
      h("p", { key: "src", class: "muted small" }, "The record's, at this fixture:"),
      math(contourIntegrandLatex(resolution.family, { at: resolution.golden.params }), {
        display: true,
        key: "m",
      }),
    );
  }

  // Under a declaration the box holds `R(z)`, and the declared factor is shown above it typeset —
  // which is the same fact the old shell carried in a swapped label, moved somewhere a reader who
  // cannot see the label still gets it.
  const declared = state.declaration !== null;
  // **The preview's source depends on which branch ran**, and that is content rather than plumbing:
  // with a factor declared the box holds `R(z)`, so the AST to typeset is the COFACTOR and not the
  // product — which is exactly what the label above the box says it is.
  const preview =
    resolution.kind === "plain"
      ? toLatex(resolution.ast)
      : resolution.kind === "declared"
        ? toLatex(resolution.cofactor)
        : null;

  return card(
    "integrand",
    declared
      ? h("p", { key: "dec", class: "small" }, ...mathText("the declared factor times $R(z)$", "dl"))
      : null,
    h(
      "label",
      { key: "box", class: "exprRow" },
      h("span", { key: "l", class: "muted small mono" }, declared ? "R(z) =" : "f(z) ="),
      h("input", {
        key: "i",
        type: "text",
        class: "expr mono",
        value: state.expr,
        spellcheck: "false",
        autocomplete: "off",
        "aria-label": declared ? "cofactor R(z)" : "integrand f(z)",
        onInput: (e: Event) => actions.setExpr((e.target as HTMLInputElement).value),
      }),
    ),
    // The preview is what the ENGINE read, not a re-rendering of what was typed: it comes from the
    // parsed AST, so `1/1+z` shows as `\frac{1}{1}+z` and the precedence mistake is visible before
    // the reader goes looking for it in the answer.
    preview === null
      ? h(
          "p",
          { key: "err", class: "parseError small" },
          // **Through `parseErrorText`**, which the first draft of this card forgot — it printed
          // `resolution.reason` straight, so the whole mapping existed, passed its own suite, and
          // reached no reader. `test/cards.test.ts` asserts the sentence AND the absence of the
          // parser's own wording, which is what caught it.
          resolution.kind === "empty" && resolution.reason !== null
            ? parseErrorText(resolution.reason)
            : resolution.kind === "declared-refused"
              ? resolution.reason
              : "this expression cannot be read",
        )
      : math(preview, { display: true, key: "pv" }),
    h(
      "div",
      { key: "presets", class: "pickRow" },
      h("span", { key: "l", class: "muted small" }, "Presets"),
      h(
        "select",
        {
          key: "s",
          "aria-label": "replace the integrand with a preset",
          // A menu rather than a row of pills (the plan's wording): seven pills is a wall of
          // syntax competing with the box a reader is meant to type in.
          value: PRESETS.some((p) => p.src === state.expr) ? state.expr : "",
          onChange: (e: Event) => {
            const picked = (e.target as HTMLSelectElement).value;
            if (picked !== "") actions.setExpr(picked);
          },
        },
        h("option", { key: "none", value: "" }, "choose…"),
        ...PRESETS.map((p) => h("option", { key: p.src, value: p.src }, p.label)),
      ),
    ),
  );
};
