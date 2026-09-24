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

import { declaredOrder } from "../../shell/state.js";
import { PRESETS } from "../../shell/presets.js";
import { contourIntegrandLatex } from "../../families/latex.js";
import { h } from "@cas/ui";
import { math, mathText } from "@cas/ui/math";
import { card, type Card } from "./card.js";
import { integrandEmpty } from "../errors.js";

export const integrandCard: Card = ({ state, resolution, actions }) => {
  if (resolution.kind === "gallery") {
    // **At the bindings the RUN used, not at the fixture's** — the 2026-09-20 review. `run.bindings`
    // is `{...golden.params, ...state.bindings}`, the merge `solveFamily` performs and the one the
    // Result card's number comes out of, so reading it here is what makes the two rails describe one
    // function. Reading `golden.params` instead is how A1 at `a = 5` answered `= π√6/6` under a left
    // rail headed *what is being integrated* still typesetting `1/(2 + \cos θ)` — the `a = 2`
    // fixture, with no error and nothing on screen to say which one was being integrated.
    const at = resolution.run?.bindings ?? resolution.golden.params;
    return card(
      "integrand",
      h("p", { key: "src", class: "muted small" }, "The record's, at these values:"),
      math(contourIntegrandLatex(resolution.family, { at }), {
        display: true,
        key: "m",
      }),
    );
  }

  // Under a declaration the box holds `R(z)`, and the declared factor is shown above it typeset —
  // which is the same fact the old shell carried in a swapped label, moved somewhere a reader who
  // cannot see the label still gets it.
  //
  // **`declaredOrder`, NOT `state.declaration !== null`**, and the difference is a live defect this
  // card shipped at 1.4a. A declaration names a branch POINT, and removing that point leaves the
  // declaration orphaned: `declaredOrder` then returns null and `resolveState` falls through to the
  // plain branch, integrating the box WHOLE — while a card keyed on the field alone goes on calling
  // it the cofactor. That is M6.1's own finding in a new place, where the box held `R(z)` under an
  // `R(z) =` label and the app integrated it as the integrand with a plausible number beside it.
  const declared = declaredOrder(state) !== null;
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
          resolution.kind === "declared-refused"
            ? resolution.reason
            : integrandEmpty(state.expr, resolution.kind === "empty" ? resolution.reason : null),
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
