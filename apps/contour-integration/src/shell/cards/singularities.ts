// The Singularities card — ONE table, where the old shell had three places.
//
// M8 step 1.4. The old shell listed poles in its Poles card, listed the winding numbers again under
// the Result card, and named them a third time inside the derivation; a reader comparing them had to
// match `0.5 + 0.866i` against `0.5 + 0.8660254i` by eye. Here each pole is one row — where it is,
// its order, its residue, and `Ind(γ, z₀)` — so the residue and the coefficient that multiplies it
// sit next to each other, which is what `2πi Σ n·Res` actually says.
//
// **Three sentences that are not the same sentence**, and until M5.3a the app printed the second for
// all three: `f` is entire and the singular set is EMPTY; `f` could not be read, so nothing is
// claimed; `f` was read and has no poles. The card asks the decision first, for that reason.
import { fmt, fmtCx } from "../../kernel/decimal.js";
import { declaredOrder } from "../../shell/state.js";
import type { ContourIntegral } from "../../engine/contour/integrate.js";
import { tagLabel } from "../../engine/vocabulary.js";
import { h, type Desc } from "@cas/ui";
import { math, mathText } from "@cas/ui/math";
import { card, nothing, type Card } from "./card.js";
import { drillMask } from "../drillPanel.js";

/** How close two points must be to be the same pole. `residueTheorem.ts`'s own tolerance. */
const SAME = 1e-6;

/** The rows `integrateContour` decided, so the table does not name a second type for them. */
type Windings = ContourIntegral["windings"];

const windingAt = (windings: Windings, at: readonly [number, number]): Windings[number] | undefined =>
  windings.find((w) => Math.hypot(w.at[0] - at[0], w.at[1] - at[1]) < SAME);

export const singularitiesCard: Card = (ctx) => {
  const { state, resolution, session, poles, actions } = ctx;
  if (poles === null) return card("singularities", nothing("There is no integrand to read."));

  // With a factor declared these are the poles of `R(z)` and not of the integrand: a branch point is
  // not a pole and carries no residue, so the two lists are genuinely different and a reader
  // comparing this card to the expression box would otherwise be misled.
  // `declaredOrder`, not the field — an orphaned declaration resolves to nothing and the poles are
  // the integrand's again. See `integrand.ts` for the defect this prevents.
  const cofactorOnly =
    (state.mode === "sandbox" && declaredOrder(state) !== null) ||
    (resolution.kind === "gallery" && resolution.family.branch !== undefined);

  if (poles.entire === true) {
    return card(
      "singularities",
      nothing("None: f is entire, so the singular set is empty and Σ Res is the empty sum."),
    );
  }
  if (!poles.rational) {
    return card(
      "singularities",
      nothing("f could not be read exactly, so no poles are claimed — which is not the same as there being none."),
    );
  }
  if (poles.poles.length === 0) return card("singularities", nothing("f was read, and it has no poles."));

  // **The WINDING column is about the contour, so it goes with the contour** — M8 step 3.4. The
  // poles stay, for the reason `stageView.ts` gives for still drawing them at this rung: at the
  // rung whose question is "which contour?" the singularities are the question's DATA. Which of
  // them the record's own contour encloses is its answer, and `Ind(γ, 0 + 1i) = 1` beside
  // `Ind(γ, 0 - 1i) = 0` says "the upper half-plane" as plainly as the prose this step removed from
  // the Target card.
  const masked = drillMask(ctx) === "argument";
  const windings: Windings = masked
    ? []
    : resolution.kind === "gallery"
      ? (resolution.run?.integral.windings ?? [])
      : resolution.kind === "plain" || resolution.kind === "declared"
        ? resolution.analysis.integral.windings
        : [];

  const rows: Desc[] = poles.poles.map((pole) => {
    const w = windingAt(windings, pole.at);
    const id = `pole:${pole.at[0]},${pole.at[1]}`;
    return h(
      "tr",
      {
        key: id,
        class: session.hover.piece === id ? "hot" : undefined,
        onPointerenter: () => actions.hover(id),
        onPointerleave: () => actions.hover(null),
      },
      h("td", { key: "at", class: "num" }, fmtCx(pole.at)),
      h(
        "td",
        { key: "ord", class: "num" },
        String(pole.order),
        // Two different doubts, and neither is the order being wrong: one says the multiplicity was
        // inferred from a cluster, the other that the pole may not be there at all.
        pole.orderCertain ? null : h("span", { key: "u", class: "tag warn" }, tagLabel("order-uncertain")),
        pole.possiblyRemovable ? h("span", { key: "r", class: "tag warn" }, tagLabel("possibly-removable")) : null,
      ),
      h(
        "td",
        { key: "res" },
        pole.residue === undefined
          ? h("span", { key: "n", class: "muted small" }, pole.isExact ? "—" : tagLabel("numerical"))
          : math(pole.residue.latex, { key: "m", label: pole.residue.text }),
      ),
      // **A winding nobody DECIDED is not a winding of zero.** `integrateContour` weighs every pole
      // the report found; a missing or undecided entry means the geometry said nothing, and printing
      // `0` for it would put a coefficient into `2πi Σ n·Res` that no predicate established.
      h(
        "td",
        { key: "ind", class: "num" },
        w === undefined
          ? h("span", { key: "q", class: "muted" }, "—")
          : w.decided
            ? fmt(w.n)
            : h("span", { key: "u", class: "tag warn" }, ...mathText(tagLabel("winding-undecided"), "wu")),
      ),
    );
  });

  return card(
    "singularities",
    cofactorOnly
      ? h(
          "p",
          { key: "cof", class: "muted small" },
          "of the cofactor R(z) — the branch point carries no residue of its own, and Res(f, z₀) is this times the branch factor there.",
        )
      : null,
    // **The SCROLL is on this wrapper, not on the card.** It was on the card, where `overflow-x:
    // auto` silently computes `overflow-y: auto` as well — so under a record the rail's flex crushed
    // the card to 22 px of 114 and the poles were effectively gone. Moving it here leaves the card
    // its natural height; `tabindex` and a name are what axe's `scrollable-region-focusable` asks
    // for, and this region has no focusable content of its own to satisfy it (a table of numbers).
    // Measured by hand, because the a11y roster audits a page's DEFAULT state and the sandbox's one
    // pole never overflows: 0 rules on the sandbox, one `serious` the moment a record opens.
    h(
      "div",
      {
        key: "scroll",
        class: "tableScroll",
        tabIndex: 0,
        role: "group",
        "aria-label": "the singular set — scroll sideways for the residues",
      },
      h(
        "table",
        { key: "tbl", class: "poleTable" },
        h(
          "thead",
          { key: "h" },
          h(
            "tr",
            { key: "hr" },
            h("th", { key: "a", scope: "col" }, "z₀"),
            h("th", { key: "o", scope: "col" }, "order"),
            h("th", { key: "res", scope: "col" }, "Res(f, z₀)"),
            h("th", { key: "ind", scope: "col" }, "Ind(γ, z₀)"),
          ),
        ),
        h("tbody", { key: "b" }, ...rows),
      ),
    ),
  );
};
