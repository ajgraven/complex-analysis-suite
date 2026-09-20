// The Target card — what the record is about. Gallery only.
//
// M8 step 1.4. The old shell's "Gallery record" card carried this AND the answer; M8 splits them,
// because the left rail is *what is being integrated* and the right rail is *what it proves*. So
// nothing here reads a verdict: the title, the unknowns, the fixture, and where to read the argument.
//
// The card is absent in the sandbox rather than empty — `render.ts` filters it out — since a card
// reading "—" forever teaches a reader the app has a target it is failing to find.
import { fixtureLabel, isVariant } from "../../families/describe.js";
import { citationLine } from "../../families/describe.js";
import { identityLatex, identityText, targetLatex } from "../../families/latex.js";
import { h } from "../dom.js";
import { math, mathText } from "../math.js";
import { card, disclosure, nothing, type Card } from "./card.js";
import { drillMask } from "../drillPanel.js";

export const targetCard: Card = (ctx) => {
  const { state, resolution, actions } = ctx;
  if (resolution.kind !== "gallery") return card("target", nothing("The sandbox has no record."));
  const { family, golden } = resolution;
  // **The answer belongs to the FIRST target, and only at a fixture that computes it.** A variant
  // fixture computes something else — A5's half-range corollary is `π/4` under a target written
  // `\int_{-\infty}^{\infty}` — so appending `golden.value` there would print a false identity.
  // The picker already says what a variant is; the line below says the integral alone.
  const variant = isVariant(family, golden);

  // **AT THE BINDINGS THE RUN USED** — the 2026-09-20 review, the Integrand card's finding in the
  // card beside it. `run.bindings` is `{...golden.params, ...state.bindings}`, the merge
  // `solveFamily` performs, so moving a slider now moves this card with the answer instead of
  // leaving the rail describing the fixture's function under a headline about a different one.
  const at = resolution.run?.bindings ?? golden.params;
  // **And the RIGHT HAND SIDE does not follow it, which measuring is what settled.** `golden.value`
  // is the record's answer AT ITS FIXTURE and is already a constant — A1's is `2*pi/sqrt(3)`, not
  // `2*pi/sqrt(a^2-b^2)` — so substituting new bindings into it changes nothing and would pair the
  // integral at `a = 5` with the value at `a = 2`: a false identity, printed with the authority of
  // the record. Off the fixture the record claims nothing, so the integral is shown alone, through
  // the branch a variant fixture already takes for the same reason. (The general closed form could
  // be substituted instead; `families/latex.ts` is where that would go.)
  const atFixture = Object.entries(golden.params).every(([k, v]) => at[k] === v);

  // **AT RUNG iii THE LEFT RAIL WAS PRINTING THE ANSWER, and the menu's own sentence said it was
  // not** — M8 step 3.4, found by opening the rung in a browser. *"Only the integral is given"* is
  // what the drill card says while choosing a contour; what this card was giving was the closed
  // form (`= π/e`), the record's TITLE naming the lemma (*by Jordan's lemma*), the strategy line
  // (*closed by $\Gamma_R$ in the half-plane $a\operatorname{Im} z \ge 0$* — literally the
  // prediction's answer), the point of the argument, eight citations and the method behind the
  // value. Older than this step, and the step is what made it acute: 3.4 puts a forced choice on
  // that rung, and a prediction whose answer is three inches to the left is a reading exercise.
  //
  // What stays is the INTEGRAL — through the branch that already exists for a variant fixture,
  // which prints the target alone for its own reason — and the fixture picker, because the rung is
  // about this fixture and a reader who cannot see which one they are on cannot reason about it.
  const masked = drillMask(ctx) === "argument";

  return card(
    "target",
    // The typeset title, because every other formula in the rail is typeset and a Unicode one beside
    // them is the inconsistency step 0.5b removed.
    masked ? null : h("p", { key: "title", class: "muted small" }, ...mathText(family.titleLatex, "ti")),

    // **Each unknown AT THIS FIXTURE.** `targetLatex(t, { at })` substitutes the bindings, so the
    // reader sees the integral they are looking at rather than the family's symbols — which is the
    // difference between `∫₀^∞ x^{α−1}/(1+x) dx` and the one with α = 3/10 in it.
    ...family.targets.map((t, i) =>
      h(
        "div",
        { key: `t${i}`, class: "targetLine" },
        i === 0 && !variant && !masked && atFixture
          ? math(identityLatex(family, golden), { display: true, key: "m", label: identityText(family, golden) })
          : math(targetLatex(t, { at }), { display: true, key: "m" }),
        t.convergence === "absolute"
          ? null
          : h(
              "span",
              { key: "conv", class: "tag" },
              t.convergence === "conditional" ? "converges conditionally" : "principal value",
            ),
      ),
    ),

    h(
      "label",
      { key: "fx", class: "pickRow" },
      h("span", { key: "l", class: "muted small" }, "Fixture"),
      h(
        "select",
        {
          key: "s",
          "aria-label": "which fixture of this record to run",
          value: String(state.fixture),
          onChange: (e: Event) => actions.setFixture(Number((e.target as HTMLSelectElement).value)),
        },
        // A VARIANT fixture selects an alternative derivation the engine has no route for. Offering
        // it and then failing would read as a bug in the record; disabling it and saying so is the
        // honest version, and is the old shell's own wording.
        ...family.golden.map((g, k) =>
          h(
            "option",
            { key: `o${k}`, value: String(k), disabled: isVariant(family, g) },
            isVariant(family, g)
              ? `${fixtureLabel(family, g)} — alternative derivation, not executable`
              : fixtureLabel(family, g),
          ),
        ),
      ),
    ),

    masked ? null : h("p", { key: "contour", class: "small" }, ...mathText(family.description.contour, "dc")),
    // What the argument turns ON — the record's own one line, and the front door's second line.
    masked ? null : h("p", { key: "point", class: "muted small" }, ...mathText(family.description.point, "dp")),
    masked
      ? h("p", { key: "masked", class: "muted small" }, "Hidden: the contour is the question.")
      : h(
      "ul",
      { key: "cites", class: "cites" },
      ...family.description.citations.map((c, i) =>
        // Through `mathText`: three of the eight books are cited with a `note` carrying a formula
        // — `compare the substitution $x=\\sin\\theta$` — and as a plain string that printed its own
        // delimiters. Found by the sweep that asserts no `$` reaches a reader.
        h("li", { key: `c${i}`, class: "muted small" }, ...mathText(citationLine(c), `c${i}`)),
      ),
    ),

    // **How the value was checked** — M8 step 2.2, and a capability the rebuild had dropped: the old
    // shell folded this away under "how the golden value was verified" and `shell2` rendered it
    // nowhere, so a reader had the record's answer and no way to ask what stands behind it. A value
    // with no method is an assertion, which is the whole reason the field is required; it is still
    // not what a reader needs first, so it folds.
    masked
      ? null
      : disclosure(
          ctx,
          "target:method",
          false,
          "How the value was checked",
          h("p", { key: "m", class: "muted small" }, ...mathText(golden.method, "gm")),
        ),
  );
};
