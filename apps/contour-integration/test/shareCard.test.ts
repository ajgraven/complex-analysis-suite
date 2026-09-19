// @vitest-environment jsdom
//
// The Share card — M8 step 1.5b.
//
// **Rendered, not mounted**, exactly as `test/cards.test.ts` does it: a card is
// `(state, resolution, session, actions) → description` with no closure, so the honest instrument is
// to call it and patch the result into a detached node. The spy actions are what make a button press
// falsifiable — finding a control by its text and clicking it proves nothing on its own, since a
// button wired to the wrong action, or to none, passes that test just as well. Every assertion below
// names WHICH action was asked for, or asserts something a missing feature could not produce.
import { describe, expect, it } from "vitest";

import { circleTemplate, semicircleTemplate } from "../src/engine/contour/templates.js";
import { penContour } from "../src/engine/contour/pen.js";
import {
  compile,
  defaultState,
  offeredCorpus,
  resolveState,
  type ShellState,
} from "../src/shell/state.js";
import { encodeShell } from "../src/shell/viewState.js";
import { shareRefusal } from "../src/shell/errors.js";
import { patch } from "../src/shell/dom.js";
import { render } from "../src/shell/render.js";
import { defaultSession, type Session } from "../src/shell/session.js";
import type { ShellActions } from "../src/shell/cards/card.js";

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
    openContrast: (id: string) => calls.push(`contrast:${id}`),
    applyState: () => calls.push("applyState"),
    openFrontDoor: () => calls.push("frontDoor"),
    notify: (text, level) => calls.push(`notify:${level}:${text}`),
    redraw: () => calls.push("redraw"),
  };
}

/** Draw one rail for a state, and hand back the host plus the actions it will call. */
function railOf(
  state: ShellState,
  side: "left" | "right",
  session: Session = defaultSession(),
): { host: HTMLElement; actions: ReturnType<typeof spyActions> } {
  const compiled = compile(state.expr);
  const resolution = resolveState(state, compiled);
  const poles =
    resolution.kind === "gallery" ? (resolution.run?.poles ?? null) : compiled.ok ? compiled.poles : null;
  const actions = spyActions();
  const host = document.createElement("div");
  patch(host, render(state, resolution, session, actions, poles)[side]);
  return { host, actions };
}

const sandbox = (over: Partial<ShellState> = {}): ShellState => ({
  ...defaultState(circleTemplate([0, 0], 1.5)),
  ...over,
});

const gallery = (record: string, fixture = 0): ShellState => sandbox({ mode: "gallery", record, fixture });

const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T => {
  const e = root.querySelector<T>(sel);
  if (e === null) throw new Error(`no ${sel}`);
  return e;
};

/** The Share card itself, for a state (and optionally a session). */
function shareCardOf(state: ShellState, session?: Session): { card: HTMLElement; actions: ReturnType<typeof spyActions> } {
  const { host, actions } = railOf(state, "right", session);
  return { card: q(host, '[data-card="share"]'), actions };
}

/** A control by its ACCESSIBLE NAME, which is what a reader who cannot see the card has. */
const byName = (root: ParentNode, name: string): HTMLButtonElement => {
  const hit = [...root.querySelectorAll<HTMLButtonElement>("button")].filter((b) =>
    (b.getAttribute("aria-label") ?? "").startsWith(name),
  );
  if (hit.length !== 1) throw new Error(`${hit.length} buttons named '${name}…'`);
  return hit[0];
};

const COPY_LINK = "copy a permalink to this state";
/** The three plates share this prefix and differ after the dash — see the card. */
const SAVE_FIGURE = "download this figure as a PNG carrying its own permalink — the stage as it is on screen";
const COPY_FIGURE = "copy this figure to the clipboard";

const RECORD_IDS = offeredCorpus()
  .tiers.flatMap((t) => t.families)
  .map((f) => f.id);

/**
 * A sandbox whose contour the codec REFUSES to put in a link.
 *
 * `contourSource: null` says "not from a template", which since M7.2 means "the pen drew it" — and a
 * drawn contour IS serialisable. A circle with its provenance cleared is neither, so `contourOut`
 * has nothing to carry: no recipe to rebuild from and no vertices either. That is a state the app
 * can genuinely reach (the old shell's `moveContour` is what keeps recipe and geometry in step) and
 * the cheapest real refusal to build.
 */
const noRecipe = (): ShellState => sandbox({ contourSource: null });

describe("the Share card", () => {
  it("wires each of the three controls to ITS OWN action, exactly once", () => {
    // The defect this prevents is a button wired to the neighbouring action — `Copy figure` calling
    // `copyLink`, or `Save figure` calling `copyFigure`. Every one of those passes a test that only
    // checks a button with the right words is present and clickable, and every one of them ships a
    // control that silently does the wrong thing. Pressing and reading the SPY is the only version
    // of this assertion with any content. "Exactly once" additionally catches `dom.ts`'s own named
    // hazard — a listener ADDED per render rather than swapped — which doubles a download.
    const { card, actions } = shareCardOf(sandbox());
    byName(card, COPY_LINK).click();
    byName(card, SAVE_FIGURE).click();
    byName(card, COPY_FIGURE).click();
    expect(actions.calls).toEqual(["copyLink", "saveFigure:dark", "copyFigure"]);
  });

  it("says WHY there can be no link, and disables Copy link", () => {
    // **A card that says why beats a button that fails when pressed.** The sentence is compared
    // against `shareRefusal` of the codec's own return rather than a transcription of it, so a card
    // that paraphrased — or that printed a friendlier summary of its own invention — fails here; and
    // the enabled control on the default state is what stops `disabled` being vacuously true.
    //
    // It was the codec's own words until M8 step 2.4, which is why that is the shape of the check:
    // one module decides the wording, and the card asks it.
    const state = noRecipe();
    const enc = encodeShell(state);
    expect(enc.ok, "this state is linkable, so the test asserts nothing about a refusal").toBe(false);
    const reason = enc.ok ? "" : shareRefusal(enc.reason);

    const { card, actions } = shareCardOf(state);
    expect(card.textContent ?? "").toContain(reason);
    expect(byName(card, COPY_LINK).disabled).toBe(true);
    // The refusal is stamped `⚠` — the honest-labelling vocabulary, not a colour.
    expect(q(card, ".verdict .badge").getAttribute("data-level")).toBe("⚠");
    // A disabled button must also be INERT, not merely styled: `click()` on it asks for nothing.
    byName(card, COPY_LINK).click();
    expect(actions.calls).not.toContain("copyLink");

    // The control is live wherever the codec does not refuse — otherwise "disabled" above is a
    // constant and this whole test passes with the refusal feature absent.
    expect(byName(shareCardOf(sandbox()).card, COPY_LINK).disabled).toBe(false);
  });

  it("prints EVERY refusal the codec can reach, and they are three distinct sentences", () => {
    // The test above could be satisfied by a card that prints one hardcoded apology whenever
    // anything goes wrong. So every refusal a state can actually be built into is rendered, and the
    // sentences are required to be DISTINCT — which is what makes the mapping a claim rather than a
    // coincidence, and is also what caught step 2.4's own first draft: a rule keyed on the word
    // *vertices* answered "this contour came from neither a template nor the pen" with a repair
    // ("until it is committed") for a case that has nothing to commit. The third is the one a reader meets most: `moveContour` keeps the
    // recipe and the geometry in step, and this is the state where they have come apart.
    const states: Record<string, ShellState> = {
      "no record": sandbox({ mode: "gallery", record: null }),
      "no recipe and no vertices": noRecipe(),
      // A semicircle flying a circle's recipe. `encodeShell` rebuilds the recipe and compares, so it
      // refuses rather than minting a link that would open a different shape.
      "recipe does not rebuild": sandbox({
        contour: semicircleTemplate(3, "upper"),
        contourSource: { template: "circle", shift: [0, 0] },
      }),
    };
    const seen = new Set<string>();
    for (const [name, state] of Object.entries(states)) {
      const enc = encodeShell(state);
      expect(enc.ok, `${name}: this state is linkable, so it asserts nothing`).toBe(false);
      const reason = enc.ok ? "" : shareRefusal(enc.reason);
      seen.add(reason);
      const { card } = shareCardOf(state);
      expect(card.textContent ?? "", `${name}: the card did not say why`).toContain(reason);
      expect(byName(card, COPY_LINK).disabled, `${name}: Copy link is still live`).toBe(true);
    }
    expect(seen.size, "two of the refusals print the same sentence").toBe(3);
  });

  it("does not withhold the FIGURE from a state that has no link", () => {
    // `figureBytes` stamps `cas:state` with `null` when `encodeShell` refuses, so the plate is still
    // drawn, captioned and stamped with its verdict. Disabling these alongside Copy link would
    // withhold a picture the app can perfectly well make.
    const { card, actions } = shareCardOf(noRecipe());
    expect(byName(card, SAVE_FIGURE).disabled).toBe(false);
    expect(byName(card, COPY_FIGURE).disabled).toBe(false);
    byName(card, SAVE_FIGURE).click();
    byName(card, COPY_FIGURE).click();
    expect(actions.calls).toEqual(["saveFigure:dark", "copyFigure"]);
  });

  it("offers three plates, each asking for ITS OWN", () => {
    // **The defect this prevents is three buttons wired to one plate.** Until step 2.3 two of them
    // were disabled with `title="Phase 2"`; now all three work, and a button that read `Print` while
    // asking for the dark plate would save the wrong picture in silence — a failure with no symptom
    // on screen at all, since the download is a file the app never shows.
    const { card, actions } = shareCardOf(sandbox());
    const plates = [...card.querySelectorAll<HTMLButtonElement>(".btnRow button")].filter((b) =>
      ["Dark", "Light", "Print"].includes((b.textContent ?? "").trim()),
    );
    expect(plates.length, "the three plates are not offered").toBe(3);
    for (const p of plates) {
      expect(p.disabled, `${p.textContent} is offered as though it did not work`).toBe(false);
      // Each name says which PICTURE, not just which colour scheme.
      expect((p.getAttribute("aria-label") ?? "").length).toBeGreaterThan(50);
      p.click();
    }
    expect(actions.calls).toEqual(["saveFigure:dark", "saveFigure:light", "saveFigure:print"]);
  });

  it("stamps a notice with the level the NOTICE carries, not one of its own", () => {
    // The honest-labelling guardrail at its smallest: `say` chose `⚠` for a copy that failed, and a
    // card that stamped a literal `=` beside "Could not copy" would report a failure as a success.
    // Both levels are exercised, because a card hardcoding either passes a test that checks one.
    const ok: Session = { ...defaultSession(), notice: { text: "Link copied.", level: "=" } };
    const bad: Session = { ...defaultSession(), notice: { text: "Could not copy the figure.", level: "⚠" } };
    const okCard = shareCardOf(sandbox(), ok).card;
    const badCard = shareCardOf(sandbox(), bad).card;
    const noticeOf = (card: HTMLElement): HTMLElement => q(card, '[role="status"]');
    expect(noticeOf(okCard).textContent ?? "").toContain("Link copied.");
    expect(q(noticeOf(okCard), ".badge").getAttribute("data-level")).toBe("=");
    expect(noticeOf(badCard).textContent ?? "").toContain("Could not copy the figure.");
    expect(q(noticeOf(badCard), ".badge").getAttribute("data-level")).toBe("⚠");
  });

  it("says NOTHING when there is no notice, from a region that was there to begin with", () => {
    // Two claims, and the second is why the region is not rendered conditionally: a `role="status"`
    // element inserted with its text already inside is not reliably announced, so a notice that
    // arrives with its own container is silent for exactly the readers who cannot see the badge.
    // The region is therefore present and EMPTY — which is also the honest reading of "absent": a
    // restored state must never open claiming a link was copied.
    const { card } = shareCardOf(sandbox());
    const region = q(card, '[role="status"]');
    expect((region.textContent ?? "").trim()).toBe("");
    expect(region.querySelector(".badge"), "an empty notice still stamped a badge").toBeNull();
  });

  it("reports the link's real size, and the threshold it is measured against", () => {
    // A constant would pass "a number is shown". So the printed figure is compared to the fragment
    // `encodeShell` actually produced, and a second, much larger state must print a LARGER number —
    // which no hardcoded byte count can do.
    const small = sandbox();
    const enc = encodeShell(small);
    expect(enc.ok).toBe(true);
    const bytes = enc.ok ? enc.hash.length : 0;
    const { card } = shareCardOf(small);
    expect(q(card, ".num").textContent).toBe(`${bytes} B`);
    // The threshold is stated rather than merely enforced — a reader watching a number grow needs to
    // know what it is growing towards.
    expect(card.textContent ?? "").toContain("2 kB");

    const drawn = penContour({
      nodes: Array.from({ length: 20 }, (_, i) => ({
        at: [Math.cos((i * Math.PI) / 10) * 1.7, Math.sin((i * Math.PI) / 10) * 1.7] as const,
      })),
      closed: true,
    });
    const big = sandbox({ contour: drawn, sandboxContour: drawn, contourSource: null });
    const bigEnc = encodeShell(big);
    expect(bigEnc.ok, "the drawn contour did not encode, so there is no second size to compare").toBe(true);
    const bigBytes = bigEnc.ok ? bigEnc.hash.length : 0;
    expect(bigBytes, "the two states encode to the same size").toBeGreaterThan(bytes);
    expect(q(shareCardOf(big).card, ".num").textContent).toBe(`${bigBytes} B`);
  });

  it("renders for every one of the 28 records, with one heading and a link", () => {
    // The card takes no record and reads no run, so the risk here is not arithmetic — it is
    // `patch`'s duplicate-key throw (the Singularities card drew its heading twice at step 1.4,
    // because its table took the key `card()` had already spent on the `<h2>`). Every record is
    // rendered, and every record's link is minted: a gallery state carries `{record, fixture}` and
    // no contour, so a record that refused would mean the codec had lost one.
    expect(RECORD_IDS.length, "the corpus is not 28 records").toBe(28);
    for (const id of RECORD_IDS) {
      const state = gallery(id);
      const { card } = shareCardOf(state);
      expect(card.querySelectorAll("h2").length, `${id}: wrong heading count`).toBe(1);
      expect(byName(card, COPY_LINK).disabled, `${id}: no link`).toBe(false);
      expect(encodeShell(state).ok, `${id}: the codec refused a record`).toBe(true);
    }
  });

  it("survives a re-render onto the same host with one listener per control", () => {
    // `dom.ts` rule 3, at the one place it costs a file: a `Save figure` that accumulated listeners
    // would download two PNGs after the second recompute and three after the third. Rendering twice
    // into the SAME host and pressing once must still ask once.
    const state = sandbox();
    const compiled = compile(state.expr);
    const resolution = resolveState(state, compiled);
    const actions = spyActions();
    const host = document.createElement("div");
    const session = defaultSession();
    const poles = compiled.ok ? compiled.poles : null;
    patch(host, render(state, resolution, session, actions, poles).right);
    patch(host, render(state, resolution, session, actions, poles).right);
    patch(host, render(state, resolution, session, actions, poles).right);
    byName(q(host, '[data-card="share"]'), SAVE_FIGURE).click();
    expect(actions.calls).toEqual(["saveFigure:dark"]);
  });
});
