// @vitest-environment jsdom
//
// The state door, at the new shell — M8 step 1.7.
//
// Ported from `test/shell.test.ts` lines 79–510, which is where every one of these properties was
// established: the declared factor's survival, M6.1's both-directions restore, the three
// non-vacuity checks beneath it, and the permalink's wiring. The MECHANICS are re-expressed — the
// old shell's source toggle and record `<select>` are the front door at step 1.8, and its rail is
// nine keyed cards here — but no finding is dropped, because each of these comments is the record
// of something that was measured.
//
// Queried by role, by accessible name or by `data-testid`, never by card position (plan §4.0's rule
// from the review): a test that says "the third card" passes for the wrong reason the day a card
// moves. `screen()` below is the same idea one level up — everything a reader could be told, as one
// string, with each typeset formula standing for the sentence it is NAMED with rather than for
// KaTeX's three copies of its own spans.
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_VIEW } from "../src/kernel/camera.js";
import type { Contour } from "../src/engine/contour/model.js";
import { penContour, sameShape } from "../src/engine/contour/pen.js";
import { offeredCorpus, type ShellState } from "../src/shell/state.js";
import { decodeShell, encodeShell } from "../src/shell/viewState.js";
import { mountShell2, type Shell2Handle } from "../src/shell2/app.js";

/**
 * Mount a fresh app. jsdom has no canvas, and the shell already handles not getting a context.
 *
 * **Every mount is torn down after the test**, because `syncHash` is a 250 ms timer on `window`: an
 * abandoned app goes on owning one, and the next test's `location.hash` would then be written by a
 * shell nobody is looking at. `destroy()` clears it.
 */
const mounted: Shell2Handle[] = [];
function mount(hash = ""): { root: HTMLElement; app: Shell2Handle } {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  window.history.replaceState(null, "", hash === "" ? window.location.pathname : hash);
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const app = mountShell2(root);
  mounted.push(app);
  return { root, app };
}
afterEach(() => {
  for (const app of mounted.splice(0)) app.destroy();
});

const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T => {
  const e = root.querySelector<T>(sel);
  if (e === null) throw new Error(`no ${sel}`);
  return e;
};
const byLabel = <T extends HTMLElement = HTMLElement>(root: ParentNode, label: string): T =>
  q<T>(root, `[aria-label="${label}"]`);
const fire = (e: Element, kind: string): void => {
  e.dispatchEvent(new Event(kind, { bubbles: true }));
};
/**
 * Wait out `syncHash`'s coalescing window.
 *
 * The URL write is debounced — a wheel zoom has no end event, and `replaceState` is rate-limited by
 * the browser — so a test that reads `location.hash` has to let the timer fire.
 */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 320));

/**
 * Wait for the coalesced draw.
 *
 * The strip's controls are rebuilt in `StripView.drawNow`, which `schedule` coalesces onto a frame,
 * so a shell read in the same task as its mount has an EMPTY strip — measured, and it is the whole
 * 158-character difference between two apps in the same state. A test comparing one app with
 * another therefore has to let both reach the same point.
 */
const frame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()));

/** A control found by the words ON it — never by where it sits in its card. */
function clickNamed(host: ParentNode, startsWith: string): void {
  const b = [...host.querySelectorAll("button")].find((x) => (x.textContent ?? "").startsWith(startsWith));
  if (b === undefined) {
    throw new Error(`no button starting "${startsWith}": ${[...host.querySelectorAll("button")].map((x) => x.textContent).join(" | ")}`);
  }
  b.click();
}

/**
 * What a region SAYS, as one line.
 *
 * Every typeset formula is replaced by its accessible name. KaTeX renders each formula twice — once
 * as MathML and once as positioned spans — so a raw `textContent` carries three copies of every
 * symbol and buries an assertion failure in them; the name is the sentence a reader would hear, and
 * comparing on it is comparing on what was said rather than on how it was drawn.
 */
function textOf(host: Element): string {
  const clone = host.cloneNode(true) as HTMLElement;
  for (const m of clone.querySelectorAll('[role="math"]')) {
    m.replaceChildren(clone.ownerDocument.createTextNode(m.getAttribute("aria-label") ?? ""));
  }
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Everything a reader can see, in one string.
 *
 * The bar contributes the mode it is showing, the record button's NAME (the record's title — its
 * text is a typeset target, and its name is what a screen reader is given) and whether the Sandbox
 * button reports itself as current; then the grid's fold, the integrand box with the label saying
 * WHICH function is in it, and the two rails and the strip in full.
 */
function screen(root: Element): string {
  const shell = q(root, "main.shell2");
  const box = root.querySelector<HTMLInputElement>('[data-card="integrand"] input.expr');
  const record = q(root, '[data-testid="record"]');
  const mode = q(root, '[data-testid="mode"] button[aria-pressed="true"]');
  return [
    `mode: ${mode.textContent}  record: ${record.getAttribute("aria-label")}`,
    `sandbox: ${q(root, '[data-testid="sandbox"]').getAttribute("aria-current") ?? "-"}`,
    `rails: ${shell.dataset.left}/${shell.dataset.right}`,
    `box: ${box?.value ?? "-"} as ${box?.getAttribute("aria-label") ?? "-"}`,
    textOf(q(root, ".rail2.left")),
    textOf(q(root, ".rail2.right")),
    textOf(q(root, ".strip2")),
  ].join("\n");
}

const rails = (root: Element): string => `${textOf(q(root, ".rail2.left"))}\n${textOf(q(root, ".rail2.right"))}`;

/**
 * Type an integrand, pick the keyhole, and declare a factor on the point it seeds — through the
 * controls a reader uses, because the declare button's own presence is half of what the first block
 * below is about.
 */
function declaredKeyhole(root: Element): void {
  const input = byLabel<HTMLInputElement>(root, "integrand f(z)");
  input.value = "1/(1+z)";
  fire(input, "input");
  const template = byLabel<HTMLSelectElement>(root, "replace the contour with a template");
  template.value = "keyhole";
  fire(template, "change");
  clickNamed(q(root, ".rail2.left"), "declare a factor on");
}

describe("the argument window", () => {
  // **The declaration used to VANISH when the window changed**, and nothing in the app said so.
  // `buildDeclaration`'s canonical system carries the point id `"b"` while the reader's is `"b1"`,
  // and the old shell adopted that system wholesale — so `declaredOrder()` went null, the card
  // reverted to "declare a factor on …", and the integrand box went on holding the COFACTOR under
  // its `R(z) =` label. The app then integrated `R(z)` as the whole integrand and printed a
  // plausible number beside it: the same defect the "undeclare" button exists to prevent, through a
  // different door. It also meant M5.1c's own demonstration — switch to the principal window and
  // watch LEGALITY refuse — did not happen at all.
  //
  // In this shell the box's LABEL is the claim rather than a visible `R(z) =` span, which is step
  // 1.4's own finding: the old shell said which function was in the box only in a way no screen
  // reader reached.
  it("keeps the declared factor when the determination changes", () => {
    const { root } = mount();
    declaredKeyhole(root);
    expect(rails(root)).toContain("Declared factor");

    const window = byLabel<HTMLSelectElement>(root, "argument window of the declared factor");
    window.value = [...window.options][1].value;
    fire(window, "change");

    const rail = rails(root);
    expect(rail).toContain("Declared factor");
    expect(rail).not.toContain("declare a factor on");
    // The box still holds the cofactor, and its accessible name still says so — which is only
    // honest while the factor is still declared.
    expect(byLabel<HTMLInputElement>(root, "cofactor R(z)").value).toBe("1/(1+z)");
  });

  it("moves the cut, so LEGALITY refuses and no ∮ is printed", () => {
    const { root } = mount();
    declaredKeyhole(root);
    // The keyhole's determination: the cut is on ℝ₊, down the middle of the two lips, and the
    // argument closes.
    expect(rails(root)).not.toContain("Refused");

    const window = byLabel<HTMLSelectElement>(root, "argument window of the declared factor");
    window.value = [...window.options][1].value;
    fire(window, "change");

    // Principal: the cut swings onto ℝ₋, straight through the R → ∞ circle, which declares no side.
    const rail = rails(root);
    expect(rail).toContain("crosses the cut");
    expect(rail).toContain("with no side assigned");
    expect(rail).toContain("Refused");
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
// **WHY THIS IS THE PROPERTY AND NOT SOMETHING WEAKER.** Everything built on top of the state
// object is a round trip: a `#vs=` permalink is `currentState()` encoded and `applyState` decoded,
// and a PNG carries the same bytes. A field dropped from either half is invisible to every other
// test in the suite — the app draws the same picture and computes a DIFFERENT integral, which is
// M5.1's shadowed-`branch` bug wearing new clothes. So the fixed point is asserted on what a reader
// can SEE, the whole visible rail and strip, rather than on the state object alone; and it is
// asserted alongside its converse, that perturbing a problem field does change what is on screen,
// because a round trip that carried nothing at all would satisfy the first claim perfectly.
//
// **A record is opened through `applyState` rather than through a picker**, which is not a
// concession: the front door is step 1.8, and opening a record IS applying a state — M6.2's
// "a gallery link is `{record, fixture}` and nothing else" arriving as the shell's own shape.
// ──────────────────────────────────────────────────────────────────────────────────────────────

const openRecord = (app: Shell2Handle, id: string, fixture = 0): void => {
  app.applyState({ ...app.currentState(), mode: "gallery", record: id, fixture, bindings: {}, geometry: {} });
};

describe("applyState(currentState()) is a fixed point", () => {
  it("for all 28 gallery records at their primary fixture", () => {
    const { root, app } = mount();
    const ids = offeredCorpus().tiers.flatMap((t) => t.families.map((fam) => fam.id));
    expect(ids).toHaveLength(28);

    for (const id of ids) {
      openRecord(app, id);
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
  // The first version of the old shell's file asserted only the gate's own sentence — apply the
  // state the app is already in, and nothing moves — and 11 of 20 mutants survived it. Ten were one
  // defect, not ten: **a round trip that is CONSISTENTLY lossy is still a fixed point.**
  // `currentState` that forgets `expr` and an `applyState` that never reads it agree perfectly with
  // each other; every state the test could reach was already in the lossy image, so nothing moved.
  // Taken literally the gate is satisfied by `currentState = () => ({})` and `applyState = () => {}`.
  //
  // So the property is the one a PERMALINK actually needs: restore a state the app is **not in**,
  // and land on the state that was APPLIED. Two states as unlike as this app gets, applied in both
  // directions, with every field differing between them — which is what makes each field's loss
  // observable rather than mutually cancelling.
  it("restores a state the app is NOT in — both directions, every field", () => {
    const { root, app } = mount();
    const boot = app.currentState();

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
      // M7.3's rung, which is in the state for the same reason everything else here is: a field the
      // pair does not differ in is a field whose loss this test cannot see.
      drill: { task: "oscillatory", stage: 2 },
      workedExample: false,
    };
    app.applyState(a);
    const aScreen = screen(root);
    expect(app.currentState()).toEqual(a);
    expect(aScreen).toContain("Declared factor");

    // ── B: a record, at a fixture that is NOT its primary, with both kinds of override moved, no
    //      declaration, a different integrand in the box, and every view field back at its default.
    openRecord(app, "jordan-cosine-kernel", 1);
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
      // The boot circle, so the pair differs in `contour` and `sandboxContour` too. **In gallery
      // mode neither is read**: the contour a reader sees is derived from the run on every render
      // (`contourOf`), which is M6.1's "the contour is an OUTPUT" one step further than the old
      // shell took it — that one adopted `run.contour` into the state, this one never puts it there.
      // So the field is carried and ignored rather than carried and corrected, and the assertions
      // below are about what is DRAWN.
      contour: boot.contour,
      sandboxContour: boot.contour,
      bindings: { a: 1, b: 1 },
      geometry: { R_lim: 9 },
      view: DEFAULT_VIEW,
      contrast: "none",
      scrub: 1,
      iso: null,
      drill: null,
      // M8's own view field, and it is here for the same reason `drill` is: the mode is DERIVED
      // (`drill` wins, then this), so a pair that agreed on it would be a pair blind to its loss.
      workedExample: true,
    };
    // Every field that can differ, does — otherwise the pair cannot see that field being dropped.
    expect(b.mode).not.toBe(a.mode);
    expect(b.expr).not.toBe(a.expr);
    expect(b.record).not.toBe(a.record);
    expect(b.contour).not.toBe(a.contour);
    expect(b.sandboxContour).not.toBe(a.sandboxContour);
    expect(b.branch).not.toEqual(a.branch);
    expect(b.drill).not.toEqual(a.drill);
    expect(b.workedExample).not.toBe(a.workedExample);

    app.applyState(b);
    expect(app.currentState()).toEqual(b);
    const bScreen = screen(root);
    expect(bScreen).not.toBe(aScreen);

    // **IN GALLERY MODE THE CONTOUR IS AN OUTPUT, NOT AN INPUT** — the record rebuilds it from
    // `(record, fixture, bindings, geometry)` on every run, and both overrides have to reach it or
    // a permalink would restore a picture nobody shared. Read off the RESOLUTION, because that is
    // where the contour a reader sees now lives.
    const drawn = (): Contour => {
      const r = app.resolution();
      if (r.kind !== "gallery" || r.run === null) throw new Error(`no record ran (${r.kind})`);
      return r.run.contour;
    };
    expect(drawn().params["R_lim"]?.value).toBe(9);
    expect(drawn().params["a"]?.value).toBe(1);

    // Said out loud, because it is what makes M6.2's gallery link `{record, fixture}` and nothing
    // else: hand the record the SANDBOX's keyhole and it still draws its own contour, and nothing
    // a reader can see moves.
    const record = drawn();
    app.applyState({ ...b, contour: a.contour });
    expect(drawn()).toEqual(record);
    expect(screen(root)).toBe(bScreen);

    // ── and back. This is the direction a dropped field shows in: the app is in B and has to land
    //      exactly on A, from a state that shares nothing with it.
    app.applyState(a);
    expect(app.currentState()).toEqual(a);
    expect(screen(root)).toBe(aScreen);

    app.applyState(b);
    expect(app.currentState()).toEqual(b);
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
    // And the cofactor is now being read as the whole integrand, which is what the box's own
    // accessible name says.
    expect(bare).toContain("declare a factor on");
    expect(bare).not.toContain("Declared factor");
    expect(byLabel<HTMLInputElement>(root, "integrand f(z)").value).toBe("1/(1+z)");
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
    openRecord(app, "circle-linear-cos");
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
  /** The refusal box — its own element outside `<main>`, never the Share card's notice region. */
  const refusal = (root: Element): HTMLElement => q(root, ".linkRefusal");

  it("opens the state a link names, not the app's defaults", () => {
    const wanted = mount();
    openRecord(wanted.app, "log-cubed-keyhole");
    const target = wanted.app.currentState();
    const want = screen(wanted.root);

    // A FRESH app, which knows nothing of the above — the only thing it is given is the link.
    const opened = mount(link(target));
    expect(screen(opened.root)).toBe(want);
    expect(opened.app.currentState().record).toBe("log-cubed-keyhole");
    expect(refusal(opened.root).hidden).toBe(true);
    // The CAMERA travels too. A draft of the old shell reframed the contour after applying the
    // link, which silently threw away the view the sharer had chosen; `screen()` cannot see a
    // camera, so it is asserted.
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
    const box = refusal(opened.root);
    expect(box.hidden).toBe(false);
    expect(box.textContent).toContain("no-such-record");
    expect(box.textContent).toContain("could not be opened");
    // And the app itself is exactly where it would have been with no link at all. Compared on the
    // STATE rather than on the screen, because the refusal box is part of the page — which is the
    // point, not a discrepancy.
    expect(opened.app.currentState()).toEqual(defaults);
    // Nothing of the refused link leaked in: not the mode, not the record.
    expect(opened.app.currentState().mode).toBe("sandbox");
    expect(opened.app.currentState().record).toBeNull();
  });

  it("says nothing at all when there is no link", () => {
    const opened = mount();
    expect(refusal(opened.root).hidden).toBe(true);
  });

  it("clears the arrival refusal once the reader has acted — by EITHER route", async () => {
    // **The banner outlived its own field.** It was written at the two places that set
    // `session.linkRefusal`, so `applyState` — which nulls the field through `resetTransient` and
    // redraws nothing — left the page still saying a link could not be opened about a state the
    // reader had since left, while `writeHash`'s `!== null` guard then declined to clear a box it
    // believed was already clear. The repair is that the banner is DRAWN FROM THE FIELD on every
    // repaint; the two routes are asserted separately because it is the second that failed.
    const bad = "#vs=" + btoa(JSON.stringify({ v: 1, app: "ci", state: { m: "g", r: "no-such-record" } }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const typed = mount(bad);
    expect(refusal(typed.root).hidden, "the refusal is showing to begin with").toBe(false);
    typed.app.actions().setExpr("1/(1+z^2)");
    await settle();
    expect(refusal(typed.root).hidden, "an ordinary edit left the refusal up").toBe(true);

    const restored = mount(bad);
    expect(refusal(restored.root).hidden).toBe(false);
    restored.app.applyState({ ...restored.app.currentState(), expr: "1/(1+z^4)" });
    expect(restored.app.session().linkRefusal, "the door cleared the field").toBeNull();
    expect(refusal(restored.root).hidden, "the door cleared the field and not the banner").toBe(true);
  });

  it("writes the address bar on settle, and the result reopens the same state", async () => {
    const app = mount();
    openRecord(app.app, "dogbone-inverse-sqrt");
    await settle();
    expect(window.location.hash).toMatch(/^#vs=/);
    const want = screen(app.root);

    const reopened = mount(window.location.hash);
    // One frame, because the strip is a coalesced PICTURE and not a card: read in the same task as
    // the mount it is still empty, and the first app has had a frame while the timer ran.
    await frame();
    expect(screen(reopened.root)).toBe(want);
  });

  it("marks the hash dirty for a VIEW-ONLY change — the three the old shell forgot", async () => {
    // The scrub, the modulus-contour toggle and the comparison mode move nothing a ledger reads, so
    // the old shell's five `syncHash` call sites did not cover them and the address bar fell behind
    // whenever a reader used one. Here `commit` is the only caller and every state change goes
    // through `commit`, so the property is structural rather than five things remembered — and this
    // is the assertion that says so, on the three that used to be missed.
    const app = mount();
    app.app.applyState({ ...app.app.currentState(), contrast: "sumZ", scrub: 0.25, iso: true });
    await settle();
    const decoded = decodeShell(window.location.hash);
    expect(decoded?.ok).toBe(true);
    if (decoded?.ok !== true) return;
    expect(decoded.state.contrast).toBe("sumZ");
    expect(decoded.state.scrub).toBe(0.25);
    expect(decoded.state.iso).toBe(true);
  });

  it("the URL carries the camera the state is actually showing", async () => {
    // Opening a record in the old shell refit the camera AFTER the recompute that wrote the URL, so
    // the address bar kept the previous view — measured in a browser at `halfHeight 1.2` in the bar
    // against 4.8 on screen. The copy button hid it by writing its own hash first, so the SHARED
    // link was right while the one a reader could select and paste was a step behind. Here every
    // state change goes through one `commit` and `commit` is the only caller of `syncHash`, which is
    // what makes the question about ORDER stop existing; `screen()` cannot see a camera, which is
    // why this reads the hash itself.
    const app = mount();
    openRecord(app.app, "keyhole-two-poles");
    app.app.stage().fitContour();
    await settle();
    const decoded = decodeShell(window.location.hash);
    expect(decoded?.ok).toBe(true);
    if (decoded?.ok !== true) return;
    expect(decoded.state.view).toEqual(app.app.currentState().view);
  });

  it("uses replaceState, so a session leaves ONE history entry rather than one per change", async () => {
    const before = window.history.length;
    const app = mount();
    for (const id of ["circle-poisson", "semicircle-order2", "jordan-strict", "mellin-keyhole"]) {
      openRecord(app.app, id);
    }
    await settle();
    // The payload is base64, so the id is not a substring of the hash — decode it, which also
    // checks the coalesced write landed on the LAST change rather than an earlier one.
    const decoded = decodeShell(window.location.hash);
    expect(decoded?.ok === true && decoded.state.record).toBe("mellin-keyhole");
    expect(window.history.length).toBe(before);
  });

  it("the Share card says WHY a state cannot be linked to, BEFORE the control is pressed", () => {
    // The old shell put this in the top bar: a button that looked ready, went nowhere, and then
    // forgot its own sentence six seconds later. Whether a state can be linked to is a property of
    // the STATE, so the card asks `encodeShell` on every render and the control that cannot work is
    // disabled beside the reason — a contour with no recipe whose pieces the pen did not draw
    // either, which is the case M7.2 narrowed this refusal down to.
    const { root, app } = mount();
    app.applyState({ ...app.currentState(), contourSource: null });
    const share = q(root, '[data-card="share"]');
    expect(textOf(share)).toContain("neither a template nor the pen");
    expect(byLabel<HTMLButtonElement>(share, "copy a permalink to this state").disabled).toBe(true);
  });

  it("but a DRAWN contour does get a link, which is the point of M7.2's wire form", () => {
    const { root, app } = mount();
    const drawn = penContour({ nodes: [{ at: [-2, -2] }, { at: [2, -2] }, { at: [0, 2] }], closed: true });
    app.applyState({ ...app.currentState(), contour: drawn, contourSource: null, sandboxContour: drawn });
    const share = q(root, '[data-card="share"]');
    expect(textOf(share)).not.toContain("neither a template nor the pen");
    expect(byLabel<HTMLButtonElement>(share, "copy a permalink to this state").disabled).toBe(false);
    // And the link reopens the same shape.
    const enc = encodeShell(app.currentState());
    expect(enc.ok, enc.ok ? "" : enc.reason).toBe(true);
    if (!enc.ok) return;
    const back = decodeShell(enc.hash);
    expect(back?.ok).toBe(true);
    if (back === null || !back.ok) return;
    expect(sameShape(back.state.contour, drawn)).toBe(true);
  });
});
