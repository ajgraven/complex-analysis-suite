// `render(state, resolution, session, actions)` — the whole shell as a description.
//
// M8 step 1.1, plan §4.0. **Nothing in here computes mathematics.** The engine surface is
// `ShellState` plus `resolveState(state, compiled, budget) → StateResolution`, and this function's
// only job is to say what the DOM should look like given those two and the session. That is what
// makes the shell testable without a browser and what stops the old shell's habit of recomputing a
// number inside a render path and getting a different one from the ledger.
//
// At 1.1 the rails hold placeholder cards, titled from `vocabulary.ts`. Steps 1.4 and 1.5 replace
// each placeholder with a real card — a function `(state, resolution, session, actions) → Desc` —
// so the shape here is the shape they land into rather than scaffolding to be thrown away.
import { LEFT_CARDS, RIGHT_CARDS, cardTitle, type CardId } from "../engine/vocabulary.js";
import type { PoleReport } from "../kernel/poles.js";
import type { ShellState, StateResolution } from "../shell/state.js";
import { contourCard } from "./cards/contour.js";
import { cutsCard } from "./cards/cuts.js";
import { integrandCard } from "./cards/integrand.js";
import { derivationCard } from "./cards/derivation.js";
import { resultCard } from "./cards/result.js";
import { shareCard } from "./cards/share.js";
import { parametersCard } from "./cards/parameters.js";
import { singularitiesCard } from "./cards/singularities.js";
import { targetCard } from "./cards/target.js";
import type { Card, CardContext, ShellActions } from "./cards/card.js";
import { h, type Desc } from "./dom.js";
import type { Session } from "./session.js";

export type { ShellActions } from "./cards/card.js";

/** What the shell renders into: one description list per grid area, plus the grid's own state. */
export interface Rendered {
  readonly bar: readonly Desc[];
  readonly left: readonly Desc[];
  readonly right: readonly Desc[];
  /** Which rails are folded, as the attributes the CSS grid reads. */
  readonly rails: { readonly left: string; readonly right: string };
}

/**
 * A card that has a heading and nothing in it yet.
 *
 * The heading is a real `<h2>` from the first render — the page's heading outline is one of the four
 * structural invariants `test/shell2.test.ts` asserts, and a placeholder that is a bare `<div>` would
 * let the outline be wrong for the whole of Phase 1 and then be fixed at the end, which is exactly
 * how M6.4 found the nav reading last.
 */
function placeholder(id: CardId): Desc {
  return h(
    "section",
    { key: `card:${id}`, class: "card2", "data-card": id },
    h("h2", { key: "t" }, cardTitle(id)),
    h("p", { key: "p", class: "placeholder" }, "—"),
  );
}

/** A one-line description of what the resolution IS, so the scaffold shows the engine is live. */
function resolutionLine(resolution: StateResolution): string {
  switch (resolution.kind) {
    case "gallery":
      return resolution.fatal ?? `record ${resolution.family.id}`;
    case "declared":
      return "sandbox, with a branch factor declared";
    case "declared-refused":
      return resolution.reason;
    case "plain":
      return "sandbox";
    case "empty":
      return resolution.reason ?? "nothing to compute";
  }
}

/**
 * The whole shell, as descriptions.
 *
 * The four arguments are the contract Phase 1's cards are written against (plan §4.0: a card is
 * `(state, resolution, session, actions) → description`), so the signature is the one they land
 * into. **The Target card is gallery-only**, which is why the left rail's list is filtered rather
 * than fixed: a sandbox expression has no record to state, and a card reading "—" forever would
 * teach a reader that the app has a target it is failing to find.
 */
/**
 * Which card function builds each id — the cards that exist. A placeholder stands where one does not.
 *
 * Steps 1.4 and 1.5 fill this in a card at a time, so a half-built rail is a rail with placeholders
 * in it rather than a rail that throws, and the four structural invariants hold throughout.
 */
const CARDS: Partial<Record<CardId, Card>> = {
  target: targetCard,
  integrand: integrandCard,
  parameters: parametersCard,
  contour: contourCard,
  cuts: cutsCard,
  singularities: singularitiesCard,
  result: resultCard,
  derivation: derivationCard,
  share: shareCard,
};

export function render(
  state: ShellState,
  resolution: StateResolution,
  session: Session,
  actions: ShellActions,
  poles: PoleReport | null = null,
): Rendered {
  const gallery = state.mode === "gallery";
  const ctx: CardContext = { state, resolution, session, poles, actions };
  const build = (id: CardId): Desc => CARDS[id]?.(ctx) ?? placeholder(id);
  return {
    bar: [
      h("h1", { key: "brand", class: "brand2" }, "Contour Integration"),
      h("span", { key: "mode", class: "placeholder", "data-testid": "mode" }, resolutionLine(resolution)),
      // The stage's one toolbar control. Double-click does the same thing; a reader who has zoomed
      // into nothing needs a way back that does not require knowing about the double-click.
      h(
        "button",
        { key: "fit", class: "barBtn", "data-testid": "fit", onClick: () => actions.fitContour() },
        "Fit contour",
      ),
    ],
    left: LEFT_CARDS.filter((id) => gallery || id !== "target").map(build),
    right: RIGHT_CARDS.map(build),
    rails: {
      left: session.rails.left ? "folded" : "open",
      right: session.rails.right ? "folded" : "open",
    },
  };
}
