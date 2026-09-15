// The Target card — what the record is about. Gallery only.
//
// M8 step 1.4. The old shell's "Gallery record" card carried this AND the answer; M8 splits them,
// because the left rail is *what is being integrated* and the right rail is *what it proves*. So
// nothing here reads a verdict: the title, the unknowns, the fixture, and where to read the argument.
//
// The card is absent in the sandbox rather than empty — `render.ts` filters it out — since a card
// reading "—" forever teaches a reader the app has a target it is failing to find.
import { fixtureLabel, isVariant } from "../../families/describe.js";
import { targetLatex } from "../../families/latex.js";
import { h } from "../dom.js";
import { math, mathText } from "../math.js";
import { card, nothing, type Card } from "./card.js";

/** `Ahlfors, Ch. 4 §5.3 — Jordan's lemma`, with the covering phrase only where the record gives one. */
const citationLine = (c: { text: string; book: string; where: string }): string =>
  c.text === "" ? `${c.book}, ${c.where}` : `${c.book}, ${c.where} — ${c.text}`;

export const targetCard: Card = ({ state, resolution, actions }) => {
  if (resolution.kind !== "gallery") return card("target", nothing("The sandbox has no record."));
  const { family, golden } = resolution;

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
        math(targetLatex(t, { at: golden.params }), { display: true, key: "m" }),
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
    h(
      "ul",
      { key: "cites", class: "cites" },
      ...family.description.citations.map((c, i) =>
        h("li", { key: `c${i}`, class: "muted small" }, citationLine(c)),
      ),
    ),
  );
};
