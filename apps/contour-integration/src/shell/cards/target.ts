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

export const targetCard: Card = (ctx) => {
  const { state, resolution, actions } = ctx;
  if (resolution.kind !== "gallery") return card("target", nothing("The sandbox has no record."));
  const { family, golden } = resolution;
  // **The answer belongs to the FIRST target, and only at a fixture that computes it.** A variant
  // fixture computes something else — A5's half-range corollary is `π/4` under a target written
  // `\int_{-\infty}^{\infty}` — so appending `golden.value` there would print a false identity.
  // The picker already says what a variant is; the line below says the integral alone.
  const variant = isVariant(family, golden);

  return card(
    "target",
    // The typeset title, because every other formula in the rail is typeset and a Unicode one beside
    // them is the inconsistency step 0.5b removed.
    h("p", { key: "title", class: "muted small" }, ...mathText(family.titleLatex, "ti")),

    // **Each unknown AT THIS FIXTURE.** `targetLatex(t, { at })` substitutes the bindings, so the
    // reader sees the integral they are looking at rather than the family's symbols — which is the
    // difference between `∫₀^∞ x^{α−1}/(1+x) dx` and the one with α = 3/10 in it.
    ...family.targets.map((t, i) =>
      h(
        "div",
        { key: `t${i}`, class: "targetLine" },
        i === 0 && !variant
          ? math(identityLatex(family, golden), { display: true, key: "m", label: identityText(family, golden) })
          : math(targetLatex(t, { at: golden.params }), { display: true, key: "m" }),
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

    h("p", { key: "contour", class: "small" }, ...mathText(family.description.contour, "dc")),
    // What the argument turns ON — the record's own one line, and the front door's second line.
    h("p", { key: "point", class: "muted small" }, ...mathText(family.description.point, "dp")),
    h(
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
    disclosure(
      ctx,
      "target:method",
      false,
      "How the value was checked",
      h("p", { key: "m", class: "muted small" }, ...mathText(golden.method, "gm")),
    ),
  );
};
