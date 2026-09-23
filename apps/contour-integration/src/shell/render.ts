// `render(state, resolution, session, actions)` — the whole shell as a description.
//
// M8 step 1.1, plan §4.0. **Nothing in here computes mathematics.** The engine surface is
// `ShellState` plus `resolveState(state, compiled, budget) → StateResolution`, and this function's
// only job is to say what the DOM should look like given those two and the session. That is what
// makes the shell testable without a browser and what stops the old shell's habit of recomputing a
// number inside a render path and getting a different one from the ledger.
//
// At 1.1 the rails held placeholder cards titled from `vocabulary.ts`, and steps 1.4 and 1.5
// replaced each one with a real card — a function `(state, resolution, session, actions) → Desc`.
// Every id in `LEFT_CARDS ∪ RIGHT_CARDS` has had one since, so {@link CARDS} is TOTAL and the
// placeholder is gone: a `Partial` map would let a newly added `CardId` fall through to a silent
// `—` instead of failing to compile, which is the opposite of what a rail wants from its own list.
import { LEFT_CARDS, RIGHT_CARDS, type CardId } from "../engine/vocabulary.js";
import type { PoleReport } from "../kernel/poles.js";
import type { ShellState, StateResolution } from "./state.js";
import { bar } from "./bar.js";
import { contrastStrip } from "./contrasts.js";
import { drillPanel } from "./drillPanel.js";
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
import { h, type Desc } from "@cas/ui";
import type { Session } from "./session.js";

export type { ShellActions } from "./cards/card.js";

/** What the shell renders into: one description list per grid area, plus the grid's own state. */
export interface Rendered {
  readonly bar: readonly Desc[];
  readonly left: readonly Desc[];
  readonly right: readonly Desc[];
  /**
   * The contrast ladder above the stage — empty when it is shut (M8 step 3.5).
   *
   * A grid area like the rails, rather than a thing the shell mounts for itself, so the ladder is a
   * description of the session like every other panel and a test can assert it without a browser.
   */
  readonly ladder: readonly Desc[];
  /** Which rails are folded, as the attributes the CSS grid reads. */
  readonly rails: { readonly left: string; readonly right: string };
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
 * Which card function builds each id.
 *
 * **Total over every id the rails can hold**, `"drill"` excepted: that one is the right rail's top
 * slot rather than a member of `RIGHT_CARDS`, and {@link render} builds it directly. Total is what
 * makes adding a `CardId` a compile error here rather than a `—` a reader is left to interpret.
 */
const CARDS: Record<Exclude<CardId, "drill">, Card> = {
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
  // `LEFT_CARDS` and `RIGHT_CARDS` are declared `readonly CardId[]`, and `"drill"` is kept out of
  // both by `vocabulary.ts`'s own note rather than by their type — so the one test here is what
  // narrows it, which is also what lets {@link CARDS} be total. Neither list contains it, so the
  // `null` arm is the drill's exclusion stated once and not a card that might be missing.
  const build = (id: CardId): Desc | null => (id === "drill" ? null : CARDS[id](ctx));
  const isDesc = (d: Desc | null): d is Desc => d !== null;
  return {
    bar: bar(ctx),
    left: railOf(
      ctx,
      "left",
      LEFT_CARDS.filter((id) => gallery || id !== "target")
        .map(build)
        .filter(isDesc),
    ),
    // **The drill's card is the TOP SLOT, not a member of `RIGHT_CARDS`.** It appears only while a
    // rung is open, where every other card is always present; putting it in the list would make the
    // list's contract "a card, or nothing" for one member's sake, and every `map` over it would grow
    // a case meaning "none of the above" — which is M7.1's own reason for not making Contrasts a mode.
    right: railOf(
      ctx,
      "right",
      [drillPanel(ctx), ...RIGHT_CARDS.map(build)].filter(isDesc),
    ),
    ladder: contrastStrip(ctx),
    rails: {
      left: session.rails.left ? "folded" : "open",
      right: session.rails.right ? "folded" : "open",
    },
  };
}

/** What each rail is called when it is folded to a strip. */
const RAIL_NAME: Readonly<Record<"left" | "right", string>> = {
  left: "What is being integrated",
  right: "What it proves",
};

/**
 * A rail: its toggle, and its cards — or its toggle ALONE when it is folded.
 *
 * **Two defects, both found by looking at step 3.1b's own screenshot**, and both older than it.
 *
 * *The fold had no control at all.* `setRail` existed, was typed, was implemented, and had **no
 * caller anywhere in the app** — so the only thing that ever folded a rail was a worked-example
 * link, and there was no way back from one. M8 step 3.1b folds the left rail on the mode BUTTON,
 * which is what made an unreachable rail a state a reader can reach by pressing a control.
 *
 * *And a folded rail went on rendering its cards.* The grid shrinks the column to 38 px and the CSS
 * comment beside it says the rail "shrinks to a labelled strip" — which was never built, so what a
 * reader actually got was every card squeezed into 38 px: a column of one- and two-letter fragments
 * down the left edge, with `.targetLine` an unreachable horizontal scroll region that `axe` flags
 * `scrollable-region-focusable`. A folded rail draws its name and its control and nothing else.
 */
function railOf(ctx: CardContext, side: "left" | "right", cards: readonly Desc[]): Desc[] {
  const folded = ctx.session.rails[side];
  const toggle = h(
    "button",
    {
      key: `fold:${side}`,
      class: "railToggle",
      type: "button",
      "aria-expanded": !folded,
      // The name says what is BEHIND it, not which way the arrow points: "expand left panel" tells
      // a reader nothing about what they would be expanding.
      "aria-label": `${folded ? "show" : "hide"} the panel: ${RAIL_NAME[side]}`,
      onClick: () => ctx.actions.setRail(side, !folded),
    },
    folded ? (side === "left" ? "›" : "‹") : side === "left" ? "‹" : "›",
  );
  if (!folded) return [toggle, ...cards];
  return [
    toggle,
    // The label the CSS comment promised. `aria-hidden`, because the button beside it already
    // carries the same words in its own name and a screen reader should not read them twice.
    h("p", { key: `name:${side}`, class: "railName", "aria-hidden": true }, RAIL_NAME[side]),
  ];
}
