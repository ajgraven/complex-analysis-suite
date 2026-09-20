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
import { limitTag, tagLabel } from "../../engine/vocabulary.js";
import { mathText } from "../math.js";
import { h, type Desc } from "../dom.js";
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
    const readout = h(
      "span",
      { key: "v", class: "num paramValue" },
      `${p.name} = ${fmt(p.value)}`,
    );
    if (channel === "derived") {
      return h(
        "div",
        { key: `p:${p.name}`, class: "paramRow2" },
        readout,
        // Named rather than hidden: a reader who expects a slider should be told why there is none.
        h("span", { key: "t", class: "tag" }, tagLabel("derived")),
      );
    }
    return h(
      "label",
      { key: `p:${p.name}`, class: "paramRow2" },
      readout,
      h("input", {
        key: "s",
        type: "range",
        class: "slider",
        min: "0",
        max: String(STOPS),
        value: String(Math.round(toStop(p, p.value))),
        "aria-label": `${p.name}, currently ${fmt(p.value)}`,
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
