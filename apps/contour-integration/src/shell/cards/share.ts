// The Share card — the link, the plate, and the reason there may be no link.
//
// M8 step 1.5b. The old shell put `Copy link` / `Save figure` / `Copy figure` in the top bar beside a
// `role="status"` span that filled in on a click and emptied itself six seconds later. That is the
// wrong shape for the one thing this card has to say: **whether this state can be linked to at all
// is a property of the STATE, not of the click.** A reader who has drawn a contour the codec cannot
// rebuild was told so by a button that looked ready, went nowhere, and then forgot its own sentence.
//
// So the card asks `encodeShell` for itself, before anything is pressed. That is exactly the
// division `card.ts` records on `copyLink`: the REFUSAL is a pure question about the state and
// belongs in the description, and the action is the side effect — which reports its own outcome
// through `session.notice`, because a description cannot await a promise.
//
// **The plates are three and only one is built.** Phase 2 draws the light and print ones; the plan
// wants them SHOWN rather than hidden, so a reader learns what is coming instead of discovering it.
// They are rendered disabled with `title="Phase 2"` and the card never re-derives WHY — `saveFigure`
// already refuses a non-dark theme in its own words, and a second copy of that sentence here would
// be a second place for it to drift.
import { encodeShell } from "../../shell/viewState.js";
import { fmtNum } from "../format.js";
import { h, type Child, type Desc } from "../dom.js";
import { mathText } from "../math.js";
import { card, type Card, type CardContext } from "./card.js";

/** `=` / `≤` / `≈` / `⚠` as the square stamp `theme.css` draws. `result.ts`'s helper, same shape. */
const badge = (level: string, key = "b"): Desc =>
  h("span", { key, class: "badge", "data-level": level }, level);

/**
 * Where research 07 §6 puts its warning on a URL, in bytes of fragment.
 *
 * M6.2's own measurement is the reason a number is shown at all: the worst case it found was 2,838 B
 * as a piece list and 1,078 B as a recipe, and M7.2's twenty-corner pen path is 4,635 B carried the
 * first way. A reader who has drawn something enormous should see it coming rather than find out
 * from whichever client silently truncated it. The hash is `#vs=` plus base64url — ASCII throughout,
 * so its character count IS its byte count and no encoder is needed to say so honestly.
 */
const URL_WARNING_BYTES = 2000;

/** Everything the card reads, gathered once — one `encodeShell`, asked and answered. */
interface Facts {
  /** The codec's own sentence, or null when the state can be linked to. */
  readonly refusal: string | null;
  /** The fragment's length in bytes, or null when there is no fragment. */
  readonly bytes: number | null;
}

function factsOf(ctx: CardContext): Facts {
  // Cheap and PURE: a template rebuild and a structural compare, which is nothing beside the solve
  // the resolution already ran. Asking it on every render is what makes the refusal current rather
  // than a stale answer from whenever the reader last pressed something.
  const enc = encodeShell(ctx.state);
  return enc.ok ? { refusal: null, bytes: enc.hash.length } : { refusal: enc.reason, bytes: null };
}

export const shareCard: Card = (ctx) => {
  const { session, actions } = ctx;
  const { refusal, bytes } = factsOf(ctx);

  const head: Child[] = [];
  if (refusal !== null) {
    // **The reason, in the codec's own words.** Paraphrasing it here would put a second sentence in
    // front of the reader for a decision one module makes — and the sentences are specific on
    // purpose ("the contour's recipe … does not rebuild the contour on screen"), which a friendlier
    // summary would spend. It goes through `mathText` for the same reason every engine sentence in
    // the rail does: the `$…$` rule is the rail's, not each card's, and a sentence that grows a
    // formula must not start rendering its delimiters.
    // **And no repair line.** `EncodeResult` carries a reason and no repair, and one guessed here
    // would be false for at least one of the reasons it has to cover: "redraw the contour" is the
    // answer to a recipe that does not rebuild and nonsense for gallery mode with no record open,
    // which is repaired by opening one. A row that says something false is the defect M5.6c found
    // three of; the codec's sentence alone says less and says it truly.
    head.push(h("p", { key: "no", class: "verdict" }, badge("⚠"), ...mathText(` ${refusal}`, "rf")));
  } else if (bytes !== null) {
    const over = bytes > URL_WARNING_BYTES;
    head.push(
      h(
        "p",
        { key: "size", class: "muted small" },
        h("span", { key: "n", class: "num" }, `${fmtNum(bytes, 0)} B`),
        " of link fragment; a URL is safe to about 2 kB.",
        over ? h("span", { key: "w", class: "tag warn" }, "over the warning") : null,
      ),
    );
  }

  return card(
    "share",
    ...head,
    h(
      "div",
      { key: "links", class: "btnRow" },
      h(
        "button",
        {
          key: "copy",
          // **Disabled is the honest control here**, not a button that fails on press. It costs a
          // screen-reader user the tab stop, which is why the refusal is a sentence in the card
          // above it rather than a tooltip on the button itself — the card reads as a paragraph
          // whether or not its controls can be reached.
          disabled: refusal !== null,
          "aria-label": "copy a permalink to this state",
          onClick: () => actions.copyLink(),
        },
        "Copy link",
      ),
      // **A figure whose state has no link is still a figure.** `figureBytes` stamps `cas:state`
      // with `null` when `encodeShell` refuses, so the plate is drawn, captioned and stamped with
      // its verdict either way — disabling these on a refused link would withhold a picture the app
      // can perfectly well make.
      h(
        "button",
        { key: "fig", "aria-label": "copy this figure to the clipboard", onClick: () => actions.copyFigure() },
        "Copy figure",
      ),
    ),
    h(
      "div",
      { key: "save", class: "btnRow" },
      h("span", { key: "l", class: "muted small" }, "Save figure"),
      h(
        "button",
        {
          key: "dark",
          "aria-label": "download this figure as a PNG carrying its own permalink",
          onClick: () => actions.saveFigure("dark"),
        },
        "Dark",
      ),
      h(
        "button",
        { key: "light", disabled: true, title: "Phase 2", "aria-label": "download this figure as a light plate — Phase 2" },
        "Light",
      ),
      h(
        "button",
        { key: "print", disabled: true, title: "Phase 2", "aria-label": "download this figure as a print plate — Phase 2" },
        "Print",
      ),
    ),
    // **The level is the notice's own**, never a literal: `say` already chose `=` for a copy that
    // landed and `⚠` for one that did not, and a card that stamped its own badge could report a
    // failure under an `=`. It is transient by construction — `resetTransient` clears it — so a
    // restored state never opens claiming a link was copied.
    //
    // **The region is always here and only its CONTENTS come and go**, which is the old shell's
    // shape and the reason for it: a `role="status"` element inserted with its text already inside
    // is not reliably announced — assistive technology watches a live region it was given the
    // chance to observe empty. Rendering it conditionally would make every notice silent for
    // exactly the readers who cannot see the badge.
    h(
      "p",
      { key: "notice", class: "verdict", role: "status" },
      ...(session.notice === null
        ? []
        : [badge(session.notice.level, "nb"), ...mathText(` ${session.notice.text}`, "nt")]),
    ),
  );
};
