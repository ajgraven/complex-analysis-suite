// @vitest-environment jsdom
// **THE FIRST TEST THAT REACHES `src/shell/app.ts`.**
//
// 2,500 lines of it had no test at all, which is not an oversight so much as a consequence: the
// stage is WebGL2, so the only way in looked like the browser suite. It is not. `mountApp` builds
// its stage inside a `try`, the fatal boundary catches WebGL2's absence, and everything else — the
// bar, the rail's seven cards, the strip, and every handler on them — is ordinary DOM that jsdom
// runs perfectly well. jsdom has no canvas either, so `getContext` is stubbed to `null` up front
// and the drawing code takes the guarded path it already has for a context it could not get.
//
// What that buys is a test over the app as a USER reaches it: set the box, fire `change`, click the
// template, read the rail. No seam between what is asserted and what is shown.
import { describe, expect, it } from "vitest";
import { mountApp, type ShellHandle } from "../src/shell/app.js";
import { offeredCorpus, type ShellState } from "../src/shell/state.js";
import { encodeShell } from "../src/shell/viewState.js";
import { DEFAULT_VIEW } from "../src/kernel/camera.js";

/** Mount a fresh app. jsdom has no canvas, and the shell already handles not getting a context. */
function mount(hash = ""): { root: HTMLElement; app: ShellHandle } {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  window.history.replaceState(null, "", hash === "" ? window.location.pathname : hash);
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  return { root, app: mountApp(root) };
}

const q = <T extends HTMLElement = HTMLElement>(root: Element, sel: string): T => {
  const e = root.querySelector<T>(sel);
  if (e === null) throw new Error(`no ${sel}`);
  return e;
};
const byLabel = <T extends HTMLElement = HTMLElement>(root: Element, label: string): T =>
  q<T>(root, `[aria-label="${label}"]`);
const fire = (e: Element, kind: string): void => {
  e.dispatchEvent(new Event(kind, { bubbles: true }));
};
function clickIn(host: Element, text: string): void {
  const b = [...host.querySelectorAll("button")].find((x) => x.textContent === text);
  if (b === undefined) {
    throw new Error(`no "${text}": ${[...host.querySelectorAll("button")].map((x) => x.textContent).join(" | ")}`);
  }
  b.click();
}
/** The CONTOUR card's template picker — the first `.presets` in the rail, before the branch card's. */
const templates = (root: Element): HTMLElement => q(root, ".rail .presets");
/** What a reader can actually see: hidden cards contribute nothing, as on screen. */
const visibleText = (root: Element, sel: string): string =>
  [...root.querySelectorAll<HTMLElement>(`${sel} > *`)]
    .filter((e) => !e.hidden)
    .map((e) => e.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/** Type an integrand, pick the keyhole, and declare a factor on the point it seeds. */
function declaredKeyhole(root: Element): void {
  const input = byLabel<HTMLInputElement>(root, "integrand f(z)");
  input.value = "1/(1+z)";
  fire(input, "change");
  clickIn(templates(root), "keyhole");
  const declare = [...root.querySelectorAll<HTMLButtonElement>(".declaration button")].find((b) =>
    (b.textContent ?? "").startsWith("declare a factor on"));
  if (declare === undefined) throw new Error("no declare button");
  declare.click();
}

describe("the argument window", () => {
  // **The declaration used to VANISH when the window changed**, and nothing in the app said so.
  // `buildDeclaration`'s canonical system carries the point id `"b"` while the reader's is `"b1"`,
  // and the shell adopted that system wholesale — so `declaredOrder()` went null, the card reverted
  // to "declare a factor on …", and the integrand box went on holding the COFACTOR under its
  // `R(z) =` label. The app then integrated `R(z)` as the whole integrand and printed a plausible
  // number beside it: the same defect the "undeclare" button exists to prevent, through a different
  // door. It also meant M5.1c's own demonstration — switch to the principal window and watch
  // LEGALITY refuse — did not happen at all.
  it("keeps the declared factor when the determination changes", () => {
    const { root } = mount();
    declaredKeyhole(root);
    expect(visibleText(root, ".rail")).toContain("Declared factor");

    const window = byLabel<HTMLSelectElement>(root, "argument window of the declared factor");
    window.value = [...window.options][1].value;
    fire(window, "change");

    const rail = visibleText(root, ".rail");
    expect(rail).toContain("Declared factor");
    expect(rail).not.toContain("declare a factor on");
    // The box still holds the cofactor, and its label still says so — which is only honest while
    // the factor is still declared.
    expect(byLabel<HTMLInputElement>(root, "rational cofactor R(z)").value).toBe("1/(1+z)");
  });

  it("moves the cut, so LEGALITY refuses and no ∮ is printed", () => {
    const { root } = mount();
    declaredKeyhole(root);
    // The keyhole's determination: the cut is on ℝ₊, down the middle of the two lips, and the
    // argument closes.
    expect(visibleText(root, ".rail")).not.toContain("⚠ Refused");

    const window = byLabel<HTMLSelectElement>(root, "argument window of the declared factor");
    window.value = [...window.options][1].value;
    fire(window, "change");

    // Principal: the cut swings onto ℝ₋, straight through the R → ∞ circle, which declares no side.
    const rail = visibleText(root, ".rail");
    expect(rail).toContain("crosses the cut");
    expect(rail).toContain("without declaring which side it runs on");
    expect(rail).toContain("⚠ Refused");
    // **AND the factor is still declared**, which is the half a mutation sweep says this test needs.
    // The pre-fix app ALSO refused here — its orphaned cut still crossed the circle — so a refusal
    // on its own passes for the wrong reason. The claim is that the determination the reader chose
    // moved the cut, not that something somewhere is broken.
    expect(rail).toContain("Declared factor");
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// M6.1's gate: `applyState(currentState())` is a fixed point.
//
// **WHY THIS IS THE PROPERTY AND NOT SOMETHING WEAKER.** Everything M6 builds on top of the state
// object is a round trip: a `#vs=` permalink is `currentState()` encoded and `applyState` decoded,
// and a PNG carries the same bytes. A field dropped from either half is invisible to every other
// test in the suite — the app draws the same picture and computes a DIFFERENT integral, which is
// M5.1's shadowed-`branch` bug wearing new clothes. So the fixed point is asserted on what a reader
// can SEE, the whole visible rail and strip, rather than on the state object alone; and it is
// asserted alongside its converse, that perturbing a problem field does change what is on screen,
// because a round trip that carried nothing at all would satisfy the first claim perfectly.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Everything a reader can see, in one string.
 *
 * The bar contributes its control VALUES rather than its text: the record `<select>`'s option list
 * is 28 ids long, constant, and would bury every assertion failure in it.
 */
function screen(root: Element): string {
  const value = (sel: string): string => {
    const e = root.querySelector<HTMLSelectElement | HTMLInputElement>(sel);
    return e === null ? "-" : e.value;
  };
  const pressed = [...q(root, ".sourceToggle").querySelectorAll("button")]
    .map((b) => `${b.textContent}=${b.getAttribute("aria-pressed")}`)
    .join(",");
  return [
    `${pressed}  box: ${value(".expr")}  label: ${q(root, ".flabel").textContent}`,
    `record: ${value('[aria-label="gallery record"]')} #${value('[aria-label="fixture"]')}`,
    visibleText(root, ".rail"),
    visibleText(root, ".strip"),
  ].join("\n");
}

describe("applyState(currentState()) is a fixed point", () => {
  it("for all 28 gallery records at their primary fixture", () => {
    const { root, app } = mount();
    const ids = offeredCorpus().tiers.flatMap((t) => t.families.map((fam) => fam.id));
    expect(ids).toHaveLength(28);

    clickIn(q(root, ".sourceToggle"), "Gallery");
    const records = byLabel<HTMLSelectElement>(root, "gallery record");
    for (const id of ids) {
      records.value = id;
      fire(records, "change");
      const before = screen(root);
      const state = app.currentState();
      expect(state.record).toBe(id);

      app.applyState(state);

      expect(screen(root), id).toBe(before);
      expect(app.currentState(), id).toEqual(state);
    }
  });

  // **A FIXED POINT ALONE PROVES ALMOST NOTHING, AND A MUTATION SWEEP IS HOW THAT WAS FOUND.**
  //
  // The first version of this file asserted only the gate's own sentence — apply the state the app
  // is already in, and nothing moves — and 11 of 20 mutants survived it. Ten were one defect, not
  // ten: **a round trip that is CONSISTENTLY lossy is still a fixed point.** `currentState` that
  // forgets `expr` and an `applyState` that never reads it agree perfectly with each other; every
  // state the test could reach was already in the lossy image, so nothing moved. Taken literally the
  // gate is satisfied by `currentState = () => ({})` and `applyState = () => {}`.
  //
  // So the property is the one a PERMALINK actually needs: restore a state the app is **not in**,
  // and land on the state that was APPLIED. Two states as unlike as this app gets, applied in both
  // directions, with every field differing between them — which is what makes each field's loss
  // observable rather than mutually cancelling.
  it("restores a state the app is NOT in — both directions, every field", () => {
    const { root, app } = mount();

    // ── A: the sandbox, with everything the gate names — a declared branch, a sheet offset and a
    //      dragged cut — plus a moved camera and the view fields off their defaults.
    declaredKeyhole(root);
    const sandbox = app.currentState();
    const a: ShellState = {
      ...sandbox,
      branch: {
        ...sandbox.branch,
        sheet: 2,
        cuts: sandbox.branch.cuts.map((c) => ({ ...c, via: [[3, 2] as const] })),
      },
      view: { center: [1.25, -0.5], halfHeight: 7 },
      contrast: "sumZ",
      scrub: 0.25,
      iso: true,
    };
    app.applyState(a);
    const aScreen = screen(root);
    expect(app.currentState()).toEqual(a);
    expect(aScreen).toContain("Declared factor");

    // ── B: a record, at a fixture that is NOT its primary, with both kinds of override moved, no
    //      declaration, a different integrand in the box, and every view field back at its default.
    clickIn(q(root, ".sourceToggle"), "Gallery");
    const records = byLabel<HTMLSelectElement>(root, "gallery record");
    records.value = "jordan-cosine-kernel";
    fire(records, "change");
    const fixtures = byLabel<HTMLSelectElement>(root, "fixture");
    fixtures.value = "1";
    fire(fixtures, "change");
    const gallery = app.currentState();
    const b: ShellState = {
      ...gallery,
      fixture: 1,
      expr: "1/(1+z^4)",
      declaration: null,
      beforeDeclaration: null,
      // The sandbox's cut system survives a mode switch — `ShellState.branch` is the sandbox's, and
      // gallery mode simply does not draw it — so `currentState()` hands back A's dragged, sheet-2
      // one here. Put the undragged sheet-0 system back, so the pair differs in `branch` too.
      branch: sandbox.branch,
      bindings: { a: 1, b: 1 },
      geometry: { R_lim: 9 },
      view: DEFAULT_VIEW,
      contrast: "none",
      scrub: 1,
      iso: null,
    };
    // Every field that can differ, does — otherwise the pair cannot see that field being dropped.
    expect(b.mode).not.toBe(a.mode);
    expect(b.expr).not.toBe(a.expr);
    expect(b.record).not.toBe(a.record);
    expect(b.contour).not.toBe(a.contour);
    expect(b.sandboxContour).not.toBe(a.sandboxContour);
    expect(b.branch).not.toEqual(a.branch);

    app.applyState(b);
    // **IN GALLERY MODE THE CONTOUR IS AN OUTPUT, NOT AN INPUT** — `adopt` takes `run.contour`, and
    // the record rebuilds it from `(record, fixture, bindings, geometry)` on every run. So a state
    // carrying a stale contour is CORRECTED rather than obeyed, and that is right: a family
    // parameter changes the integrand as well as the geometry, so the contour cannot be restored
    // independently of the bindings that produced it. Every other field must land exactly.
    const bNorm = app.currentState();
    expect({ ...bNorm, contour: b.contour }).toEqual(b);
    expect(bNorm.contour.params["R_lim"]?.value).toBe(9);
    expect(bNorm.contour.params["a"]?.value).toBe(1);
    const bScreen = screen(root);
    expect(bScreen).not.toBe(aScreen);

    // Said out loud, because it is what makes M6.2's gallery link `{record, fixture}` and nothing
    // else: hand the record the SANDBOX's keyhole and it still draws its own contour.
    app.applyState({ ...bNorm, contour: a.contour });
    expect(app.currentState().contour).toEqual(bNorm.contour);
    expect(screen(root)).toBe(bScreen);

    // ── and back. This is the direction a dropped field shows in: the app is in B and has to land
    //      exactly on A, from a state that shares nothing with it.
    app.applyState(a);
    expect(app.currentState()).toEqual(a);
    expect(screen(root)).toBe(aScreen);

    app.applyState(bNorm);
    expect(app.currentState()).toEqual(bNorm);
    expect(screen(root)).toBe(bScreen);
  });

  it("and carries the VIEW, which no number may depend on", () => {
    const { root, app } = mount();
    const moved: ShellState = {
      ...app.currentState(),
      view: { center: [1.25, -0.5], halfHeight: 42 },
    };
    app.applyState(moved);
    const before = screen(root);
    app.applyState(app.currentState());
    expect(app.currentState().view).toEqual({ center: [1.25, -0.5], halfHeight: 42 });
    expect(screen(root)).toBe(before);
  });
});

describe("the round trip is not vacuous", () => {
  // Each of these drops or changes ONE problem field and requires the screen to move. Without them
  // the fixed point above is satisfied by a `currentState` that returns nothing and an `applyState`
  // that does nothing.
  it("the declaration decides the integrand, so dropping it changes the answer", () => {
    const { root, app } = mount();
    declaredKeyhole(root);
    const declared = screen(root);
    app.applyState({ ...app.currentState(), declaration: null });
    const bare = screen(root);
    expect(bare).not.toBe(declared);
    // And the cofactor is now being read as the whole integrand, which is what the label says.
    expect(bare).toContain("declare a factor on");
    expect(bare).not.toContain("Declared factor");
  });

  it("the sheet decides the value — M5.1d's e^(2πisα), through the shell", () => {
    const { root, app } = mount();
    declaredKeyhole(root);
    const sheet0 = screen(root);
    app.applyState({ ...app.currentState(), branch: { ...app.currentState().branch, sheet: 1 } });
    // α = 1/2, so one whole turn multiplies the answer by e^(iπ) = −1: the same cut, a different
    // number. If the round trip dropped `sheet` this would be the identity.
    expect(screen(root)).not.toBe(sheet0);
    expect(screen(root)).toContain("sheet");
  });

  it("a family binding decides a record's numbers, so a moved one shows", () => {
    const { root, app } = mount();
    clickIn(q(root, ".sourceToggle"), "Gallery");
    const records = byLabel<HTMLSelectElement>(root, "gallery record");
    records.value = "circle-linear-cos";
    fire(records, "change");
    const at2 = screen(root);
    app.applyState({ ...app.currentState(), bindings: { a: 3, b: 1 } });
    expect(screen(root)).not.toBe(at2);
    // Round-tripping the MOVED state is still a fixed point.
    const moved = screen(root);
    app.applyState(app.currentState());
    expect(screen(root)).toBe(moved);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The permalink, at the shell. `test/viewState.test.ts` judges the CODEC by verdict over the whole
// corpus; what is left to check here is the wiring — that the link is read exactly once and late
// enough not to be clobbered, that a refusal is SHOWN rather than drawn over, and that the address
// bar tracks the state without a `pushState` per drag frame.
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("the `#vs=` permalink, at the shell", () => {
  const link = (s: ShellState): string => {
    const e = encodeShell(s);
    if (!e.ok) throw new Error(e.reason);
    return e.hash;
  };

  it("opens the state a link names, not the app's defaults", () => {
    const wanted = mount();
    clickIn(q(wanted.root, ".sourceToggle"), "Gallery");
    const records = byLabel<HTMLSelectElement>(wanted.root, "gallery record");
    records.value = "log-cubed-keyhole";
    fire(records, "change");
    const target = wanted.app.currentState();
    const want = screen(wanted.root);

    // A FRESH app, which knows nothing of the above — the only thing it is given is the link.
    const opened = mount(link(target));
    expect(screen(opened.root)).toBe(want);
    expect(opened.app.currentState().record).toBe("log-cubed-keyhole");
    expect(q(opened.root, ".linkError").hidden).toBe(true);
    // The CAMERA travels too. A draft reframed the contour after applying the link, which silently
    // threw away the view the sharer had chosen; `screen()` cannot see a camera, so it is asserted.
    expect(opened.app.currentState().view).toEqual(target.view);
  });

  it("opens a sandbox link carrying a declared factor and a sheet offset", () => {
    const built = mount();
    declaredKeyhole(built.root);
    const base = built.app.currentState();
    const target: ShellState = { ...base, branch: { ...base.branch, sheet: 2 } };
    built.app.applyState(target);
    const want = screen(built.root);
    expect(want).toContain("Declared factor");

    const opened = mount(link(target));
    expect(screen(opened.root)).toBe(want);
    expect(opened.app.currentState().branch.sheet).toBe(2);
  });

  it("SHOWS a refusal and keeps its own starting state — it never opens something plausible", () => {
    const clean = mount();
    const defaults = clean.app.currentState();

    const opened = mount("#vs=" + btoa(JSON.stringify({ v: 1, app: "ci", state: { m: "g", r: "no-such-record" } }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
    const box = q(opened.root, ".linkError");
    expect(box.hidden).toBe(false);
    expect(box.textContent).toContain("no-such-record");
    expect(box.textContent).toContain("could not be opened");
    // And the app itself is exactly where it would have been with no link at all. Compared on the
    // STATE rather than on the screen, because the refusal box lives in the rail and so the screen
    // differs by precisely the message — which is the point, not a discrepancy.
    expect(opened.app.currentState()).toEqual(defaults);
    // Nothing of the refused link leaked in: not the mode, not the record.
    expect(opened.app.currentState().mode).toBe("sandbox");
    expect(opened.app.currentState().record).toBeNull();
  });

  it("says nothing at all when there is no link", () => {
    const opened = mount();
    expect(q(opened.root, ".linkError").hidden).toBe(true);
  });

  it("writes the address bar on settle, and the result reopens the same state", () => {
    const app = mount();
    clickIn(q(app.root, ".sourceToggle"), "Gallery");
    const records = byLabel<HTMLSelectElement>(app.root, "gallery record");
    records.value = "dogbone-inverse-sqrt";
    fire(records, "change");
    expect(window.location.hash).toMatch(/^#vs=/);
    const want = screen(app.root);

    const reopened = mount(window.location.hash);
    expect(screen(reopened.root)).toBe(want);
  });

  it("uses replaceState, so a session leaves ONE history entry rather than one per change", () => {
    const before = window.history.length;
    const app = mount();
    const records = (): HTMLSelectElement => byLabel<HTMLSelectElement>(app.root, "gallery record");
    clickIn(q(app.root, ".sourceToggle"), "Gallery");
    for (const id of ["circle-poisson", "semicircle-order2", "jordan-strict", "mellin-keyhole"]) {
      records().value = id;
      fire(records(), "change");
    }
    expect(window.history.length).toBe(before);
  });

  it("the copy control says WHY when a state cannot be linked to", () => {
    const app = mount();
    // The pen tool's case, which is the only one today: a contour with no recipe behind it.
    app.app.applyState({ ...app.app.currentState(), contourSource: null });
    const button = byLabel<HTMLButtonElement>(app.root, "copy a permalink to this state");
    button.click();
    const note = q(app.root, ".shareNote");
    expect(note.textContent).toContain("No link");
    expect(note.textContent).toContain("pen tool");
  });
});
