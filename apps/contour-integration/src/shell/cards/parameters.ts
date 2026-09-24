// The Parameters card — one slider per LIVE parameter.
//
// M8 step 1.4. The parameters are the contour's (`contour.params`), which is where a family's
// bindings, its limit parameters and the sandbox's geometry all end up; `paramChannel` decides which
// field a move writes to and a `derived` one is read-only, because it is computed from the others
// and moving it independently would desync the geometry from its own definition.
//
// **A slider is keyed by parameter NAME**, so a scrub never re-creates its own element. `dom.ts`
// rule 1 is what makes that true across a recompute, and rule 2 is what stops the value being
// written back into an input the reader is dragging; the plan's test is ten keyboard presses in a
// row still arriving at the same element.
//
// **The old shell FREEZES each track under a record** — it snapshots every range after the first run
// so a drag cannot rescale the track it is being dragged on — and this card does not, because the
// hazard was measured and not found: over all 28 records, moving the limit parameter by 1.7× moved
// ZERO tracks. The ranges come from the templates and are constants. So the freeze is carried as a
// question rather than as code, and the day a record derives a range from a value this comment is
// where to look.
import { fmt } from "../../kernel/decimal.js";
import { paramChannel } from "../../shell/state.js";
import type { Param } from "../../engine/contour/model.js";
import { limitTag, paramSymbol, tagLabel } from "../../engine/vocabulary.js";
import { mathSpoken, mathText } from "@cas/ui/math";
import { h, type Desc } from "@cas/ui";
import { card, nothing, type Card } from "./card.js";

/** How many stops the slider has. The old shell's number, so a drag feels the same in both. */
const STOPS = 1000;

const toStop = (p: Param, v: number): number => {
  const [lo, hi] = p.range;
  return p.scale === "log"
    ? (STOPS * (Math.log(v) - Math.log(lo))) / (Math.log(hi) - Math.log(lo))
    : (STOPS * (v - lo)) / (hi - lo);
};

const fromStop = (p: Param, t: number): number => {
  const [lo, hi] = p.range;
  return p.scale === "log"
    ? Math.exp(Math.log(lo) + (t / STOPS) * (Math.log(hi) - Math.log(lo)))
    : lo + (t / STOPS) * (hi - lo);
};

export const parametersCard: Card = ({ state, resolution, actions }) => {
  const family = resolution.kind === "gallery" ? resolution.family : null;
  // In gallery mode the contour is the RECORD's output (M6.1's finding), so its parameters are too.
  const contour = resolution.kind === "gallery" ? (resolution.run?.contour ?? state.contour) : state.contour;
  const params = Object.values(contour.params);
  if (params.length === 0) return card("parameters", nothing("This contour has no parameters."));

  const rows: Desc[] = params.map((p) => {
    const channel = paramChannel(state, family, p.name);
    // **`paramSymbol`, not the raw id** — the 2026-09-20 review. This card printed `R_lim = 4` and
    // `sgnA = 1` where `vocabulary.ts` exists to print `R`, and the derivation's limit step — on
    // screen at the same moment — already did: two names for one quantity at the one place the two
    // are read together, which is the defect that map's own comment is about. Typeset, like the
    // limit tag beside it; spoken through `mathSpoken` for the slider's name, since `\varepsilon`
    // read out as a macro is the other half of the same lapse.
    const symbol = paramSymbol(p.name);
    const spoken = mathSpoken(`$${symbol}$`);
    const readout = h(
      "span",
      { key: "v", class: "num paramValue" },
      ...mathText(`$${symbol}$ = ${fmt(p.value)}`, `sym:${p.name}`),
    );
    if (channel === "derived") {
      return h(
        "div",
        { key: `p:${p.name}`, class: "paramRow2", "data-param": p.name },
        readout,
        // Named rather than hidden: a reader who expects a slider should be told why there is none.
        h("span", { key: "t", class: "tag" }, tagLabel("derived")),
      );
    }
    return h(
      "label",
      // **`data-param` is the row's ADDRESS** — the symbol above is typeset, so the parameter's id
      // is no longer readable off the row's text (KaTeX lays a formula down twice, in HTML and in
      // MathML, so `textContent` for `a` is `aa`). `contour.ts`'s `data-piece` is the same idea: an
      // id belongs in an attribute a test can ask for and a reader never meets.
      { key: `p:${p.name}`, class: "paramRow2", "data-param": p.name },
      readout,
      h("input", {
        key: "s",
        type: "range",
        class: "slider",
        min: "0",
        max: String(STOPS),
        value: String(Math.round(toStop(p, p.value))),
        "aria-label": `${spoken}, currently ${fmt(p.value)}`,
        onInput: (e: Event) => actions.setParam(p.name, fromStop(p, Number((e.target as HTMLInputElement).value))),
        // The draft budget while a finger is down, and the full one when it lifts — the stage's
        // `gesture` cannot see a rail slider, so the flag is how the budget hears about this one.
        onPointerdown: () => actions.setScrubbing(true),
        onPointerup: () => actions.setScrubbing(false),
        onPointercancel: () => actions.setScrubbing(false),
      }),
      p.limit === undefined
        ? null
        : h("span", { key: "l", class: "tag" }, ...mathText(limitTag(String(p.limit.to)), `lim:${p.name}`)),
    );
  });

  return card("parameters", ...rows);
};
