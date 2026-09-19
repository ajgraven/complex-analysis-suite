// @vitest-environment jsdom
//
// The top bar — M8 step 1.7.
//
// **Rendered, not mounted**, exactly as `test/cards.test.ts` renders a rail: `bar(ctx)` is a pure
// function of the same `CardContext` a card gets, so the honest instrument is to call it and patch
// the result into a detached node. The helpers below are that file's, copied rather than imported —
// a test file is not a module other tests build on, and the duplication is what keeps each suite
// able to change its own fixtures without breaking the other.
//
// What is asserted here is PROPERTIES of the bar, not its wording: exactly one `<h1>`, exactly one
// pressed segment and that it follows the derivation, and — for every control — WHICH action the
// press asked for. A test that finds a button by its text and clicks it proves only that a button
// with that text exists; it passes just as well when the handler is wired to the wrong action, which
// is the defect that matters.
import { describe, expect, it } from "vitest";

import { circleTemplate } from "../src/engine/contour/templates.js";
import { DRILL_TASKS } from "../src/shell/drill.js";
import {
  compile,
  defaultState,
  offeredCorpus,
  resolveState,
  shellMode,
  type ShellState,
} from "../src/shell/state.js";
import { bar } from "../src/shell/bar.js";
import type { ShellActions } from "../src/shell/cards/card.js";
import { patch } from "../src/shell/dom.js";
import { defaultSession } from "../src/shell/session.js";
import { STAGE_MODE_LABELS, STAGE_MODES } from "../src/ui/stage/mode.js";

/** Actions that record what was asked for, so a control can be pressed and the ask inspected. */
function spyActions(): ShellActions & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fitContour: () => calls.push("fit"),
    setExpr: (s) => calls.push(`expr:${s}`),
    setFixture: (i) => calls.push(`fixture:${i}`),
    setParam: (n, v) => calls.push(`param:${n}=${v}`),
    setScrubbing: (on) => calls.push(`scrub:${on}`),
    hover: (p) => calls.push(`hover:${p}`),
    setTemplate: (id) => calls.push(`template:${id}`),
    reverseContour: () => calls.push("reverse"),
    penStart: () => calls.push("pen:start"),
    penStop: () => calls.push("pen:stop"),
    penBack: () => calls.push("pen:back"),
    penCommit: (closed) => calls.push(`pen:commit:${closed}`),
    setBranch: (b) => calls.push(`branch:${b.points.length}:${b.cuts.length}:${b.shadow === true}:${b.sheet}`),
    setIso: (on) => calls.push(`iso:${on}`),
    setStageMode: (m) => calls.push(`stageMode:${m}`),
    undo: () => calls.push("undo"),
    redo: () => calls.push("redo"),
    declare: (id) => calls.push(`declare:${id}`),
    undeclare: () => calls.push("undeclare"),
    setDeclaration: (d, cut) =>
      calls.push(`decl:${d.sign}:${d.logPower}:${d.window[0].n}/${d.window[0].d}:${cut === undefined ? "nocut" : "cut"}`),
    setOpen: (id, open) => calls.push(`open:${id}:${open}`),
    setStep: (step) => calls.push(`step:${step}`),
    playSweep: (a: { stepId: string }) => calls.push(`playSweep:${a.stepId}`),
    stopSweep: () => calls.push("stopSweep"),
    copyLink: () => calls.push("copyLink"),
    saveFigure: (t) => calls.push(`saveFigure:${t}`),
    copyFigure: () => calls.push("copyFigure"),
    setMode: (m) => calls.push(`mode:${m}`),
    setRail: (side, folded) => calls.push(`rail:${side}:${folded}`),
    toSandbox: () => calls.push("toSandbox"),
    setContrastsOpen: (open) => calls.push(`contrasts:${open}`),
    applyState: () => calls.push("applyState"),
    openFrontDoor: () => calls.push("frontDoor"),
    notify: (text, level) => calls.push(`notify:${level}:${text}`),
    redraw: () => calls.push("redraw"),
  };
}

/** Draw the bar for a state, and hand back the host plus the actions it will call. */
function barOf(state: ShellState): { host: HTMLElement; actions: ReturnType<typeof spyActions> } {
  const compiled = compile(state.expr);
  const resolution = resolveState(state, compiled);
  const poles = resolution.kind === "gallery" ? (resolution.run?.poles ?? null) : compiled.ok ? compiled.poles : null;
  const actions = spyActions();
  const host = document.createElement("div");
  // **Patched, not appended as a fragment.** `patch` is what throws on a repeated key among one
  // parent's children, so every test in this file carries that check for free — and the bar's five
  // children plus two nested groups are exactly the shape in which a copied key goes unnoticed.
  patch(host, bar({ state, resolution, session: defaultSession(), poles, actions }));
  return { host, actions };
}

const sandbox = (over: Partial<ShellState> = {}): ShellState => ({
  ...defaultState(circleTemplate([0, 0], 1.5)),
  ...over,
});

const gallery = (record: string, fixture = 0): ShellState => sandbox({ mode: "gallery", record, fixture });

/** A state in Worked example, and a state in Drill — built the way the app builds them. */
const worked = (): ShellState => sandbox({ workedExample: true });
const drilling = (): ShellState => sandbox({ drill: { task: DRILL_TASKS[0].id, stage: 2 } });

const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T => {
  const e = root.querySelector<T>(sel);
  if (e === null) throw new Error(`no ${sel}`);
  return e;
};

const buttonsOf = (host: HTMLElement): HTMLButtonElement[] => [...host.querySelectorAll("button")];

const segments = (host: HTMLElement): HTMLButtonElement[] => [
  ...host.querySelectorAll<HTMLButtonElement>('[data-testid="mode"] button'),
];

const stageSegments = (host: HTMLElement): HTMLButtonElement[] => [
  ...host.querySelectorAll<HTMLButtonElement>('[data-testid="stageMode"] button'),
];

/** What a reader actually SEES: KaTeX's MathML sibling carries the raw LaTeX, so it is stripped. */
const visibleText = (el: Element): string => {
  const clone = el.cloneNode(true) as HTMLElement;
  for (const m of clone.querySelectorAll(".katex-mathml")) m.remove();
  return clone.textContent ?? "";
};

const RECORD_IDS = offeredCorpus()
  .tiers.flatMap((t) => t.families)
  .map((f) => f.id);

describe("the bar's heading", () => {
  it("is the page's ONE `<h1>`, and it is the brand", () => {
    // One of `test/shell2.test.ts`'s four structural invariants, asserted at the source rather than
    // only at the mounted app: every card's heading is an `<h2>`, so the outline is right from the
    // first render and cannot be fixed at the end of the phase — which is how M6.4 found the nav
    // reading LAST, after the whole rail, because nothing checked the structure until then.
    const { host } = barOf(sandbox());
    const h1s = [...host.querySelectorAll("h1")];
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("Contour Integration");
    expect(h1s[0].className).toContain("brand2");
  });

  it("has no OTHER heading in it, so a card cannot be outranked by a control", () => {
    // The bar sits above `<main>`; an `<h2>` here would put a heading outside the landmark and
    // between the page title and the first card, which is the outline defect in its other direction.
    const { host } = barOf(gallery("circle-linear-cos"));
    expect([...host.querySelectorAll("h2, h3, h4, h5, h6")]).toHaveLength(0);
  });
});

describe("the segmented mode control", () => {
  it("carries `aria-pressed` on EVERY segment — not only on the pressed one", () => {
    // **The defect this exists for is `dom.ts`'s boolean-prop rule.** A boolean `false` REMOVES an
    // attribute, so `aria-pressed: mode === m.id` leaves the two unpressed segments with no
    // `aria-pressed` at all — which announces one toggle and two ordinary buttons where the truth is
    // one control with three positions. The "exactly one true" test below passes under that defect,
    // which is precisely why it is not the only assertion here.
    const { host } = barOf(sandbox());
    const seg = segments(host);
    expect(seg).toHaveLength(3);
    for (const b of seg) {
      expect(b.getAttribute("aria-pressed"), `${b.textContent} carries no aria-pressed`).toMatch(/^(true|false)$/);
    }
    expect(seg.map((b) => b.textContent)).toEqual(["Explore", "Worked example", "Drill"]);
  });

  it("presses exactly one segment, and it is the one `shellMode` names — in all three states", () => {
    // The mode is DERIVED; the bar must ask for it rather than re-deriving it. Asserting against
    // `shellMode(state)` rather than against a literal is what makes this a test of the AGREEMENT
    // between the bar and the derivation instead of a test of three hardcoded labels.
    const label: Record<string, string> = { explore: "Explore", worked: "Worked example", drill: "Drill" };
    for (const state of [sandbox(), worked(), drilling()]) {
      const { host } = barOf(state);
      const pressed = segments(host).filter((b) => b.getAttribute("aria-pressed") === "true");
      expect(pressed, `${shellMode(state)}: not exactly one segment is pressed`).toHaveLength(1);
      expect(pressed[0].textContent).toBe(label[shellMode(state)]);
    }
  });

  it("lights DRILL over Worked example when both fields are set", () => {
    // `taskState` does not clear `workedExample`, so the two really do coexist — and `shellMode`
    // resolves it one way (`drill` wins). A bar that read `state.workedExample` itself would light
    // the wrong segment here and be right everywhere else, so this is the state that separates
    // "asks the derivation" from "happens to agree with it".
    const both = sandbox({ workedExample: true, drill: { task: DRILL_TASKS[0].id, stage: 3 } });
    expect(shellMode(both)).toBe("drill");
    const pressed = segments(barOf(both).host).filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed.map((b) => b.textContent)).toEqual(["Drill"]);
  });

  it("asks `setMode` for the segment that was pressed — each of the three, by name", () => {
    // Clicking a button and asserting that SOME call happened would pass with all three wired to
    // `setMode("explore")`. The mode asked for is the whole content of the control.
    for (const [i, mode] of ["explore", "worked", "drill"].entries()) {
      const { host, actions } = barOf(sandbox());
      segments(host)[i].click();
      expect(actions.calls).toEqual([`mode:${mode}`]);
    }
  });

  it("offers Drill even where it will be refused, and does not disable it", () => {
    // `setMode("drill")` refuses when no task is open and says so through the notice channel. A bar
    // that pre-empted that would have to answer "is a drill available?" for itself — a second reader
    // of a question one module already decides, which is how the two come to disagree. The reader
    // gets the refusal's sentence; they do not get a control that is grey for an unstated reason.
    const drill = segments(barOf(sandbox()).host)[2];
    expect(drill.disabled).toBe(false);
    expect(drill.getAttribute("aria-disabled")).toBeNull();
  });
});

describe("the record button", () => {
  it("shows the open record's target TYPESET, with no LaTeX source on screen", () => {
    const { host } = barOf(gallery("circle-linear-cos"));
    const btn = q(host, '[data-testid="record"]');
    expect(btn.querySelector(".katex"), "the target was not typeset").not.toBeNull();
    // **`.katex-mathml` carries the raw LaTeX**, so `textContent` is not what a reader sees — the
    // trap `test/cards.test.ts` met on the crossing factor. Strip it and read what is drawn.
    const seen = visibleText(btn);
    expect(seen, "LaTeX source reached the screen").not.toMatch(/\\int|\\frac|\\cos|\\pi/);
    expect(seen, "a delimiter of the `$…$` convention reached the screen").not.toContain("$");
    expect(seen.length, "the button is empty").toBeGreaterThan(0);
  });

  it("substitutes the FIXTURE's bindings, so the button shows the integral on screen", () => {
    // `targetLatex(t, { at })` is the Target card's idiom and this is its reason: the family's
    // symbols name a family, and a button reading `a + b\cos\theta` while the app runs `a = 2, b = 1`
    // states something the reader cannot check against anything in front of them. The two fixtures
    // of this record differ in their parameters, so the typeset targets must differ too.
    const first = visibleText(q(barOf(gallery("circle-linear-cos", 0)).host, '[data-testid="record"]'));
    const second = visibleText(q(barOf(gallery("circle-linear-cos", 1)).host, '[data-testid="record"]'));
    expect(first).not.toBe(second);
  });

  it("names itself by the record's TITLE, not by the formula's LaTeX", () => {
    // KaTeX's HTML is a pile of positioned spans and `math()` labels each formula with its LaTeX —
    // right inside a sentence, wrong as the whole accessible name of a control, where a reader would
    // hear `\int_{0}^{2\pi}\frac{1}{...}` instead of what the record is.
    const name = q(barOf(gallery("circle-linear-cos")).host, '[data-testid="record"]').getAttribute("aria-label") ?? "";
    expect(name).toContain("unit circle");
    expect(name).not.toContain("\\");
  });

  it("invites a choice in the sandbox, where there is no record to state", () => {
    const btn = q(barOf(sandbox()).host, '[data-testid="record"]');
    expect(visibleText(btn)).toBe("Choose a record");
    expect(btn.querySelector(".katex"), "the sandbox typeset something").toBeNull();
    expect((btn as HTMLButtonElement).disabled, "the front door is step 1.8's, not a reason to disable").toBe(false);
  });

  it("invites a choice for a gallery state whose record id matches NOTHING", () => {
    // Driven off the RESOLUTION rather than off `state.mode`: an unknown id resolves `empty`, and a
    // button reading `state.mode` would reach for a family that is not there and throw in the bar —
    // taking down the one strip that could tell the reader what had happened.
    const { host } = barOf(gallery("no-such-record"));
    expect(visibleText(q(host, '[data-testid="record"]'))).toBe("Choose a record");
  });
});

describe("the Sandbox button", () => {
  it("is present and enabled in BOTH modes, and marks itself current in the sandbox", () => {
    // Hiding it in the sandbox would change the bar's control count with the mode — widths jumping
    // under the reader's pointer, and two different answers to the overflow question. Disabling it
    // costs a screen-reader user the tab stop and announces "unavailable" where the truth is "you
    // are already here". `aria-current` says that truth and takes nothing away.
    const here = q<HTMLButtonElement>(barOf(sandbox()).host, '[data-testid="sandbox"]');
    const away = q<HTMLButtonElement>(barOf(gallery("circle-linear-cos")).host, '[data-testid="sandbox"]');
    expect(here.disabled).toBe(false);
    expect(away.disabled).toBe(false);
    expect(here.getAttribute("aria-current")).toBe("true");
    expect(away.getAttribute("aria-current"), "a record is open — the sandbox is not where we are").toBeNull();
  });

  it("still asks `toSandbox` when it is already current", () => {
    // Idempotent by construction: `toSandbox` keeps the parked sandbox contour, so pressing it from
    // the sandbox lands exactly where the reader is. That is the same licence the segmented control
    // gives — pressing the position you are in is allowed — and a handler stripped "because it would
    // do nothing" is a control that swallows a click, which is the thing being avoided.
    const { host, actions } = barOf(sandbox());
    q<HTMLButtonElement>(host, '[data-testid="sandbox"]').click();
    expect(actions.calls).toEqual(["toSandbox"]);
  });
});

describe("what a press asks for", () => {
  it("asks the MATCHING action exactly once, for every control in the bar", () => {
    // The whole array with `toEqual`, not `toContain`: `toContain` passes when a press also fires a
    // second action, and "Copy link wired to `copyFigure`" survives any test that only checks that
    // something happened. Thirteen controls, thirteen asks, in the order a reader tabs through them
    // — which is also the assertion that the stage-mode segments went in beside the Sandbox button
    // rather than into the tool cluster, since the order here is DOM order.
    const { host, actions } = barOf(gallery("circle-linear-cos"));
    const buttons = buttonsOf(host);
    expect(buttons, "a control has appeared or vanished").toHaveLength(13);
    for (const b of buttons) b.click();
    expect(actions.calls).toEqual([
      "mode:explore",
      "mode:worked",
      "mode:drill",
      "frontDoor",
      "toSandbox",
      "stageMode:quiet",
      "stageMode:full",
      "stageMode:iso",
      "stageMode:textbook",
      "contrasts:true",
      "fit",
      "copyLink",
      "saveFigure:dark",
    ]);
  });

  it("opens the contrasts panel rather than toggling it", () => {
    // `setContrastsOpen(false)` from the bar would shut a panel the reader had just asked for; the
    // panel closes itself. Pinned as the ARGUMENT, because `contrasts:true` and `contrasts:false`
    // are the same call to any test that only counts them.
    const { host, actions } = barOf(sandbox());
    q<HTMLButtonElement>(host, 'button[aria-label*="five arguments"]').click();
    expect(actions.calls).toEqual(["contrasts:true"]);
  });

  it("saves the DARK plate, which is the one Phase 1 draws", () => {
    // `saveFigure` refuses a light or print theme in its own words. A bar asking for one would hand
    // the reader that refusal from a button labelled "Save figure" with nothing to explain it.
    const { host, actions } = barOf(sandbox());
    q<HTMLButtonElement>(host, '[data-testid="fit"]').click();
    q<HTMLButtonElement>(host, 'button[aria-label*="PNG"]').click();
    expect(actions.calls).toEqual(["fit", "saveFigure:dark"]);
  });

  it("gives every control a name that is a complete description of it", () => {
    // "Fit contour" and "Sandbox" are two words each; what they DO is a sentence. An `aria-label`
    // that merely repeated the visible text would satisfy an audit and tell a reader nothing, so the
    // assertion is that the name is longer than the label and not equal to it.
    for (const state of [sandbox(), gallery("circle-linear-cos")]) {
      for (const b of buttonsOf(barOf(state).host)) {
        const name = b.getAttribute("aria-label");
        expect(name, `a control has no accessible name: "${b.textContent}"`).not.toBeNull();
        expect(name, `the name of "${b.textContent}" only repeats its label`).not.toBe(b.textContent);
        expect((name ?? "").length).toBeGreaterThan(8);
      }
    }
  });
});

describe("the bar's shape", () => {
  it("carries exactly ONE `.barBtn` among the bar's own children", () => {
    // **`shell.css` gives `.barBtn` `margin-left: auto`, and a flex line splits the free space
    // EQUALLY among every auto margin on it.** Four `.barBtn` buttons are not a cluster at the right
    // end — they are strewn across the bar with the gaps growing as the window does. The tools go in
    // one wrapper and the wrapper takes the margin.
    for (const state of [sandbox(), gallery("circle-linear-cos")]) {
      const { host } = barOf(state);
      expect([...host.children].filter((e) => e.classList.contains("barBtn"))).toHaveLength(1);
    }
  });

  it("keeps step 1.1's two testids addressable", () => {
    // `[data-testid="fit"]` is clicked by `test/shell2.test.ts`; `[data-testid="mode"]` was that
    // scaffold's resolution line and is now the mode control, which is what the id names.
    const { host } = barOf(sandbox());
    expect(q(host, '[data-testid="fit"]').tagName).toBe("BUTTON");
    expect(q(host, '[data-testid="mode"]').className).toContain("segmented");
  });

  it("renders for every record in the corpus without throwing", () => {
    // The teeth here are `patch`'s duplicate-key throw, which no single-state test can reach: a key
    // collision in the bar is silent until two descriptions want the same node, and the record
    // button's content is the one child whose shape changes with the record.
    expect(RECORD_IDS.length, "the gallery is complete at 28 records (M5.8)").toBeGreaterThanOrEqual(28);
    for (const id of RECORD_IDS) {
      const { host } = barOf(gallery(id));
      // Nine until M8 step 1.9, thirteen with the stage-mode control's four segments.
      expect(buttonsOf(host), `${id}: the bar lost a control`).toHaveLength(13);
      expect(host.querySelector('[data-testid="record"] .katex'), `${id}: no typeset target`).not.toBeNull();
    }
  });
});

describe("the bar's stage-mode control — M8 step 1.9", () => {
  it("offers every mode the codec knows, in the module's own order", () => {
    // Read from `STAGE_MODES` rather than spelled out here, because the list is the thing that must
    // not fork: a mode present in the bar and absent from `viewState.ts` is a control whose state
    // cannot be shared, and a mode in the codec and not in the bar is a link that opens into a
    // picture the reader cannot get back out of.
    const { host } = barOf(sandbox());
    expect(stageSegments(host).map((b) => b.textContent)).toEqual(
      STAGE_MODES.map((m) => STAGE_MODE_LABELS[m].label),
    );
  });

  it("carries `aria-pressed` on EVERY segment, with exactly one taken", () => {
    // The same trap as the mode control's, for the same reason: `dom.ts` maps a boolean prop to
    // attribute PRESENCE, so a `false` would remove the attribute and announce three plain buttons
    // beside one toggle where the truth is one control with four positions.
    for (const mode of STAGE_MODES) {
      const { host } = barOf(sandbox({ stageMode: mode }));
      const segs = stageSegments(host);
      for (const b of segs) {
        expect(b.getAttribute("aria-pressed"), `${b.textContent} carries no aria-pressed`).toMatch(/^(true|false)$/);
      }
      const pressed = segs.filter((b) => b.getAttribute("aria-pressed") === "true");
      expect(pressed.map((b) => b.textContent)).toEqual([STAGE_MODE_LABELS[mode].label]);
    }
  });

  it("asks for the mode it names, and for no other", () => {
    for (const mode of STAGE_MODES) {
      const { host, actions } = barOf(sandbox());
      const seg = stageSegments(host).find((b) => b.textContent === STAGE_MODE_LABELS[mode].label);
      seg?.click();
      expect(actions.calls).toEqual([`stageMode:${mode}`]);
    }
  });

  it("names each position by what it DOES, not only by its label", () => {
    // `title` is not an accessible name, so the name carries both halves — the mode control's own
    // idiom, and the reason a screen-reader user hears "the phase portrait muted, so the contour is
    // the subject" rather than the single word "Quiet".
    const { host } = barOf(sandbox());
    for (const [i, mode] of STAGE_MODES.entries()) {
      const seg = stageSegments(host)[i];
      expect(seg.getAttribute("aria-label")).toBe(
        `${STAGE_MODE_LABELS[mode].label} — ${STAGE_MODE_LABELS[mode].hint}`,
      );
    }
  });
});
