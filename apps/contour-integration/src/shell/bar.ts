// The top bar — M8 step 1.7, plan §1.7.
//
// Brand, the mode control, which problem is open, and the four things a reader does TO a state
// rather than to the mathematics. It is a description-returning function of the same
// {@link CardContext} every card gets, for the same reason: the bar has no closure, so everything it
// can do is a named action and everything it can read is the state — and it can be asserted in jsdom
// without mounting the app.
//
// **The bar states the mode; it does not own it.** `shellMode(state)` is the single derivation
// (`drill` wins, then `workedExample`, then Explore) and this module asks it rather than reading
// either field. Two readers of one choice is how they come to disagree — which is not hypothetical
// here: a bar that lit **Worked example** from `state.workedExample` would go on lighting it while a
// drill rung was open, because the drill does not clear that field, and the segment a reader could
// see would name a mode the app was not in.
//
// What the old shell's bar carried and this one does not: the preset picker (moved into the
// Integrand card at step 1.4, which is what makes the plan's overflow claim arguable at all) and the
// `role="status"` notice (the Share card's, step 1.5b — whether a state can be linked to is a
// property of the STATE, so it belongs beside the control that says so, not in a strip that fills in
// on a click and empties itself six seconds later).
import { targetText } from "../families/describe.js";
import { targetLatex } from "../families/latex.js";
import { shellMode, type ShellMode } from "./state.js";
import { STAGE_MODE_LABELS, STAGE_MODES } from "../ui/stage/mode.js";
import type { CardContext } from "./cards/card.js";
import { h, type Desc } from "./dom.js";
import { math } from "./math.js";

/** The three positions, in the order they fade: the app as it is, then with its argument shown, then masked. */
const MODES: readonly { readonly id: ShellMode; readonly label: string; readonly hint: string }[] = [
  { id: "explore", label: "Explore", hint: "the app as it is — every card readable" },
  { id: "worked", label: "Worked example", hint: "the argument laid out stage by stage" },
  { id: "drill", label: "Drill", hint: "the faded drill — part of the argument masked" },
];

/**
 * The segmented mode control.
 *
 * **`aria-pressed` is written as a STRING on purpose.** `dom.ts` maps a boolean prop to attribute
 * presence — `true` sets it empty and `false` REMOVES it — so `aria-pressed: mode === m.id` would
 * leave the two unpressed segments with no `aria-pressed` at all, which is not "this toggle is off"
 * but "this is an ordinary button". A reader on a screen reader would then hear one toggle and two
 * plain buttons where the truth is one control with three positions, exactly one of them taken.
 *
 * Every segment is rendered and none is disabled, `drill` included. `setMode("drill")` refuses when
 * there is no task open and says so through the notice channel; that refusal is the action's, and a
 * bar that pre-empted it would have to re-derive "is a drill available?" — a second reader of a
 * question one module already answers, and the way the two come to disagree.
 */
function modeControl(ctx: CardContext): Desc {
  const mode = shellMode(ctx.state);
  return h(
    "div",
    {
      key: "modes",
      class: "segmented",
      role: "group",
      "aria-label": "mode",
      // Step 1.1's scaffold spent this id on a `<span>` printing what the resolution WAS — a debug
      // line, not a control. The mode control is what the id names, so it takes it.
      "data-testid": "mode",
    },
    ...MODES.map((m) =>
      h(
        "button",
        {
          key: m.id,
          "aria-pressed": mode === m.id ? "true" : "false",
          // The visible label is one or two words; the hint is what the position MEANS. `title` is
          // not an accessible name, so the name carries both.
          "aria-label": `${m.label} — ${m.hint}`,
          title: m.hint,
          onClick: () => ctx.actions.setMode(m.id),
        },
        m.label,
      ),
    ),
  );
}

/**
 * The stage-mode control — M8 step 1.9.
 *
 * A second segmented group, and the shape is deliberately the SAME as the mode control's: three
 * positions there, four here, `aria-pressed` written as a string for the same reason (`dom.ts` maps
 * a boolean prop to attribute PRESENCE, so `false` would remove it and turn an unpressed segment
 * into a plain button — one toggle and three ordinary buttons where the truth is one control with
 * four positions, exactly one taken).
 *
 * **It is in the bar and not in a card**, unlike the modulus-contour toggle it sits beside in
 * spirit, because it is a property of the whole stage rather than of the branch cuts: a reader who
 * wants the portrait out of the way wants it out of the way whatever card they are reading. The two
 * are independent by construction — `iso` the mode draws phase isolines every 30°, `iso` the toggle
 * draws |f| contours, and the shader takes both.
 */
function stageModeControl(ctx: CardContext): Desc {
  const current = ctx.state.stageMode;
  return h(
    "div",
    {
      key: "stageModes",
      class: "segmented",
      role: "group",
      "aria-label": "what the stage draws behind the contour",
      "data-testid": "stageMode",
    },
    ...STAGE_MODES.map((m) => {
      const { label, hint } = STAGE_MODE_LABELS[m];
      return h(
        "button",
        {
          key: m,
          "aria-pressed": current === m ? "true" : "false",
          "aria-label": `${label} — ${hint}`,
          title: hint,
          onClick: () => ctx.actions.setStageMode(m),
        },
        label,
      );
    }),
  );
}

/**
 * The record button: what is open, typeset, and the door to opening another.
 *
 * **It shows the target AT THIS FIXTURE**, which is the Target card's idiom (`targetLatex(t, {at})`)
 * and for its reason: the family's symbols name a family, and the reader is looking at one member of
 * it. INLINE rather than display, because this is a button — display mode sets `\int`'s limits above
 * and below and the glyph grows past the bar's 3.25rem.
 *
 * A record may carry several unknowns (D4 carries three); the bar shows the FIRST, which is the one
 * the record is titled for, and the Target card is where all of them are. A bar that listed them all
 * would be a card in the wrong place.
 *
 * **The accessible name is the record's own title, not the formula.** KaTeX's HTML is positioned
 * spans that read as nonsense and its MathML half is unevenly supported, so `math()` labels each
 * formula with its LaTeX — which is right inside a sentence and wrong as the whole name of a
 * control, where `\int_{0}^{\infty}...` is what a reader would hear instead of "by the unit circle".
 *
 * The front door is step 1.8's and `openFrontDoor` announces that it is not built yet. The button is
 * neither disabled nor apologetic: it is in the shape it will keep, and a control that swallows a
 * click is the thing being avoided, not a missing one.
 */
function recordButton(ctx: CardContext): Desc {
  const { resolution, actions } = ctx;
  // Driven off the RESOLUTION rather than off `state.mode`: gallery mode with an id nothing matches
  // resolves `empty`, and a button that read `state.mode` would try to typeset a record that is not
  // there. "Choose a record" is true in both of those cases, and is the invitation the sandbox wants.
  const open = resolution.kind === "gallery" ? resolution : null;
  const target = open?.family.targets[0];
  return h(
    "button",
    {
      key: "record",
      // **The one elastic control in the bar**, and the class says so: it is the only one whose
      // width is CONTENT the app cannot choose, so it is the one that truncates. Measured at 1024px,
      // 9 of 94 (record, fixture) pairs did not fit — the plan's "overflow is impossible by
      // construction" is not established — and the bar's fixed row height turned that into a silent
      // 5 px clip rather than something a reader could see. The accessible name above carries the
      // record in full, so an ellipsis costs nothing a screen reader would have heard.
      class: "barRecord",
      "data-testid": "record",
      "aria-label":
        open === null || target === undefined
          ? "choose a record from the gallery"
          : `the record now open — ${open.family.title}. Choose another.`,
      onClick: () => actions.openFrontDoor(),
    },
    open === null || target === undefined
      ? "Choose a record"
      : math(targetLatex(target, { at: open.golden.params }), { key: "t", label: targetText(target) }),
  );
}

/**
 * The whole bar, as descriptions. `render.ts` patches these into `<header class="bar2">`.
 *
 * **Five children and exactly ONE of them carries `.barBtn`.** `shell.css` gives that class
 * `margin-left: auto`, and a flex line distributes free space EQUALLY among every auto margin on it
 * — so four `.barBtn` buttons would not sit together at the right end, they would be strewn evenly
 * across the bar with the gaps growing as the window does. The tools go in one wrapper, the wrapper
 * takes the margin, and the cluster is a cluster.
 *
 * The left group is *which problem*: the record now open, and the way back to the sandbox. The right
 * group is *what to do with the view of it*. Nothing here reads a verdict or a number — this is the
 * bar, and what is established is the right rail's business.
 */
export function bar(ctx: CardContext): readonly Desc[] {
  const { state, actions } = ctx;
  return [
    // The page's one `<h1>`, and the reason there is exactly one: `test/shell2.test.ts` asserts the
    // heading outline structurally, and every card's heading is an `<h2>` under it. M6.4 found the
    // old shell's nav reading LAST because its host was appended after the content; an outline that
    // is right from the first render cannot acquire that defect later.
    h("h1", { key: "brand", class: "brand2" }, "Contour Integration"),
    modeControl(ctx),
    recordButton(ctx),
    // **Present in BOTH modes, and enabled in both.** Hiding it in the sandbox would change the bar's
    // control count with the mode, so the widths would jump under the reader's pointer and the
    // overflow question would have two answers; disabling it costs a screen-reader user the tab stop
    // and announces "unavailable" where the truth is "you are already here". `aria-current` says that
    // truth without taking anything away, and pressing it while there is idempotent by construction —
    // `toSandbox` keeps the parked sandbox contour, so the reader lands back exactly where they are.
    // It is the same licence the segmented control gives: pressing the position you are in is allowed.
    h(
      "button",
      {
        key: "sandbox",
        "data-testid": "sandbox",
        ...(state.mode === "sandbox" ? { "aria-current": "true" } : {}),
        "aria-label":
          state.mode === "sandbox"
            ? "the sandbox — already open"
            : "leave this record for the sandbox, keeping the contour parked there",
        onClick: () => actions.toSandbox(),
      },
      "Sandbox",
    ),
    stageModeControl(ctx),
    h(
      "div",
      { key: "tools", class: "barBtn btnRow" },
      // M7.1's ladder. Five arguments, each one declared ledger row from the last — a panel rather
      // than a mode, because a third mode would make every mode check (the codec's included) grow a
      // case meaning "none of the above".
      h(
        "button",
        {
          key: "contrasts",
          "aria-label": "compare five arguments that differ by one row of the checks",
          onClick: () => actions.setContrastsOpen(true),
        },
        "Contrasts",
      ),
      // The stage's one toolbar control, kept from step 1.1's scaffold with its id. Double-click on
      // the stage does the same thing; a reader who has zoomed into nothing needs a way back that
      // does not require knowing about the double-click.
      h(
        "button",
        {
          key: "fit",
          "data-testid": "fit",
          "aria-label": "frame the whole contour",
          onClick: () => actions.fitContour(),
        },
        "Fit contour",
      ),
      // **No refusal is re-derived here.** Whether this state can be linked to is a pure question
      // about the state, the Share card asks `encodeShell` and prints the codec's own sentence, and
      // a second copy of that decision in the bar would be a second place for it to drift — and the
      // one that drifts is the one nobody is reading when the link comes out wrong. The action
      // reports its own outcome through `session.notice`.
      h(
        "button",
        { key: "copy", "aria-label": "copy a permalink to this state", onClick: () => actions.copyLink() },
        "Copy link",
      ),
      // The dark plate, which is the one Phase 1 draws. The light and print plates are offered in the
      // Share card, where there is room to say that they are Phase 2's; the bar takes the default
      // rather than repeating a three-way choice that would not fit beside it.
      h(
        "button",
        {
          key: "save",
          "aria-label": "download this figure as a PNG carrying its own permalink",
          onClick: () => actions.saveFigure("dark"),
        },
        "Save figure",
      ),
    ),
  ];
}
