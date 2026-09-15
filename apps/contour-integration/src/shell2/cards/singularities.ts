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
import type { ContourIntegral } from "../../engine/contour/integrate.js";
import { h, type Desc } from "../dom.js";
import { math } from "../math.js";
import { card, nothing, type Card } from "./card.js";

/** How close two points must be to be the same pole. `residueTheorem.ts`'s own tolerance. */
const SAME = 1e-6;

/** The rows `integrateContour` decided, so the table does not name a second type for them. */
type Windings = ContourIntegral["windings"];

const windingAt = (windings: Windings, at: readonly [number, number]): Windings[number] | undefined =>
  windings.find((w) => Math.hypot(w.at[0] - at[0], w.at[1] - at[1]) < SAME);

export const singularitiesCard: Card = ({ state, resolution, session, poles, actions }) => {
  if (poles === null) return card("singularities", nothing("There is no integrand to read."));

  // With a factor declared these are the poles of `R(z)` and not of the integrand: a branch point is
  // not a pole and carries no residue, so the two lists are genuinely different and a reader
  // comparing this card to the expression box would otherwise be misled.
  const cofactorOnly =
    (state.mode === "sandbox" && state.declaration !== null) ||
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

  const windings: Windings =
    resolution.kind === "gallery"
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
        pole.orderCertain ? null : h("span", { key: "u", class: "tag warn" }, "uncertain"),
        pole.possiblyRemovable ? h("span", { key: "r", class: "tag warn" }, "may be removable") : null,
      ),
      h(
        "td",
        { key: "res" },
        pole.residue === undefined
          ? h("span", { key: "n", class: "muted small" }, pole.isExact ? "—" : "located numerically")
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
            : h("span", { key: "u", class: "tag warn" }, "undecided"),
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
  );
};
