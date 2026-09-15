// What a card IS — M8 step 1.4, plan §4.0.
//
// `(state, resolution, session, actions) → description`. Four arguments and no closure: a card never
// reaches into the shell, so everything it can do is a named function on {@link ShellActions} and
// everything it can read is one of the three objects above. That is what lets every card be rendered
// and asserted in jsdom without mounting anything, and what stops the old shell's habit of a render
// path recomputing a number the ledger already decided.
//
// **The card builds its own `<section>`**, heading included, so the rail is a `map` rather than a
// list of special cases — and the page's heading outline (one of the four structural invariants
// `test/shell2.test.ts` asserts) holds by construction rather than by each card remembering.
import { cardTitle, type CardId } from "../../engine/vocabulary.js";
import type { PoleReport } from "../../kernel/poles.js";
import type { ShellState, StateResolution } from "../../shell/state.js";
import { h, type Child, type Desc } from "../dom.js";
import type { Session } from "../session.js";

/** Everything a card may CALL. Implemented once, in `mountShell2`. */
export interface ShellActions {
  /** Frame the whole contour. Also on double-click — one function, two ways to ask for it. */
  readonly fitContour: () => void;
  /** Replace the sandbox expression (the integrand, or the cofactor under a declaration). */
  readonly setExpr: (src: string) => void;
  /** Choose a record's fixture, by index into `family.golden`. */
  readonly setFixture: (index: number) => void;
  /** Move one parameter, through whichever channel owns it (`withParam`). */
  readonly setParam: (name: string, value: number) => void;
  /**
   * A slider's pointer is down, or up.
   *
   * The stage's `gesture` cannot see a rail slider, and without this a parameter scrub recomputes at
   * full precision on every pointer move. It redraws rather than recomputing: the flag is read by
   * the NEXT commit, which the slider's own `input` handler makes.
   */
  readonly setScrubbing: (on: boolean) => void;
  /** What the pointer is over, by piece id or `pole:x,y` — the three-way highlight (step 1.10). */
  readonly hover: (piece: string | null) => void;
}

/** What every card is handed. */
export interface CardContext {
  readonly state: ShellState;
  readonly resolution: StateResolution;
  readonly session: Session;
  /**
   * The poles, passed in rather than read off the resolution — the stage's own reason (1.3): a
   * record's come from its `run`, the sandbox's from the cached `compile`, and `resolveState`
   * returns neither, since `Analysis` carries the ledger and not the pole report.
   */
  readonly poles: PoleReport | null;
  readonly actions: ShellActions;
}

export type Card = (ctx: CardContext) => Desc;

/**
 * A card's shell: the keyed `<section>`, its `<h2>`, and whatever the card put in it.
 *
 * `data-card` is how every test addresses a card, and `key` is what keeps the node — and so the
 * focus in its inputs — across a patch (`dom.ts` rule 1).
 */
export function card(id: CardId, ...body: Child[]): Desc {
  return h(
    "section",
    { key: `card:${id}`, class: "card2", "data-card": id },
    h("h2", { key: "t" }, cardTitle(id)),
    ...body,
  );
}

/** The em-dash a card shows where there is nothing to show. Never a number, never a blank. */
export function nothing(reason: string): Desc {
  return h("p", { key: "none", class: "placeholder" }, reason);
}
