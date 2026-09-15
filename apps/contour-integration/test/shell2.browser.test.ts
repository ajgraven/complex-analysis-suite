// The new shell, in a real browser — M8 step 1.1.
//
// The step's own gate is *"`?shell=new` boots to an empty two-rail layout over a LIVE phase portrait
// of the default state"*, and the node suite structurally cannot see the second half: jsdom has no
// WebGL2, so `mountShell2` takes its `catch` branch and every stage assertion there is about a stage
// that does not exist. That is the standing warning in CLAUDE.md — the contour-integration browser
// suite was red for three milestones because the node gate cannot compile GLSL — met on the first
// step of the new shell rather than on the last.
//
// It also holds the one guard the node sweep could not kill: the portrait's program is relinked when
// the INTEGRAND changes and not when the camera moves. M5.1's review found the old shell relinking
// on every frame of a contour drag, which is invisible to every test that does not count.
import { expect, describe, it, vi } from "vitest";

import { mountShell2 } from "../src/shell2/app.js";
import { GLStage } from "../src/ui/stage/glStage.js";
// **The stylesheets `main.ts` loads, all of them.** Mounting without one does not give a plainer
// layout, it gives a DIFFERENT one — M7.2 lost a slice to that. Without `nav.css` the suite nav is
// an unstyled 287 px block instead of a fixed 48 px bar, so the first draft of the viewport test
// below measured the shell against a window the nav was wrongly claiming a third of.
import "katex/dist/katex.min.css";
import "@cas/ui/nav.css";
import "../src/ui/app.css";
import "../src/ui/theme.css";
import "../src/ui/shell2.css";

function mount(): { root: HTMLElement; app: ReturnType<typeof mountShell2> } {
  const root = document.createElement("div");
  // The app's grid needs a box with a size; the browser harness's default body has none, and M7.2
  // spent a slice discovering that a test aimed at an unsized stage is aimed at an artefact.
  root.style.cssText = "position:fixed;inset:0;width:1280px;height:900px";
  document.body.replaceChildren(root);
  return { root, app: mountShell2(root) };
}

/** Mount straight into the body, so the shell's own sizing is what is measured. */
function mountInBody(): ReturnType<typeof mountShell2> {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  return mountShell2(root);
}

/** Wait for the rAF coalescer to have drawn. */
const drawn = async (): Promise<void> => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};

describe("the new shell in a browser", () => {
  it("boots over a LIVE phase portrait of the default state", async () => {
    const { root } = mount();
    await drawn();
    const gl = root.querySelector<HTMLCanvasElement>("canvas.gl");
    expect(gl).not.toBeNull();
    // The stage really got a WebGL2 context — in jsdom this is where the shell takes its catch.
    expect(gl?.getContext("webgl2")).toBeTruthy();
    // And it really drew. `1/z` is a pole at the origin, so the portrait sweeps the whole hue
    // circle; a blank or single-coloured canvas is what a stage that never rendered looks like.
    // `preserveDrawingBuffer` is on (M6.3's finding), so a read after compositing is not empty.
    const readback = document.createElement("canvas");
    readback.width = 64;
    readback.height = 64;
    const ctx = readback.getContext("2d");
    if (ctx === null || gl === null) throw new Error("no 2d context to read the portrait with");
    ctx.drawImage(gl, 0, 0, 64, 64);
    const { data } = ctx.getImageData(0, 0, 64, 64);
    const colours = new Set<number>();
    for (let i = 0; i < data.length; i += 4) colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    expect(colours.size, "the portrait is blank — the stage never rendered").toBeGreaterThan(12);
  });

  it("FILLS the viewport below the fixed nav, rather than collapsing to its content", async () => {
    // The first draft used `height: 100%`, which needs a sized ancestor `#app` does not provide: the
    // shell collapsed to 440 px in a 900 px window, leaving the stage 186 px tall — and, worse, it
    // was anchored at y = 0 under a `position: fixed` nav that sits at z-index 6 and swallows the
    // clicks in that band. This app shipped that defect once already; the old shell's own comment
    // records it. Measured against the WINDOW, because that is the claim.
    mountInBody();
    await drawn();
    const shell = document.querySelector("main.shell2");
    const nav = document.querySelector("nav.cas-nav");
    if (shell === null) throw new Error("no shell");
    const r = shell.getBoundingClientRect();
    const navH = nav?.getBoundingClientRect().height ?? 0;
    expect(r.height).toBeCloseTo(window.innerHeight - navH, 0);
    // It starts BELOW the nav rather than underneath it.
    expect(r.top).toBeGreaterThanOrEqual(navH - 1);
    // And the stage gets the space, rather than the rails keeping it.
    const stage = document.querySelector("div.stage2")?.getBoundingClientRect();
    expect(stage?.height ?? 0).toBeGreaterThan(r.height / 2);
  });

  it("has the two rails and the stage as real boxes, not a collapsed grid", async () => {
    const { root } = mount();
    await drawn();
    const rect = (sel: string): DOMRect => {
      const e = root.querySelector(sel);
      if (e === null) throw new Error(`no ${sel}`);
      return e.getBoundingClientRect();
    };
    const left = rect("aside.rail2.left");
    const right = rect("aside.rail2.right");
    const stage = rect("div.stage2");
    for (const [name, r] of [["left", left], ["right", right], ["stage", stage]] as const) {
      expect(r.width, `${name} has no width`).toBeGreaterThan(20);
      expect(r.height, `${name} has no height`).toBeGreaterThan(20);
    }
    // The stage is between the rails and is the widest of the three — the layout, measured rather
    // than assumed from the stylesheet.
    expect(stage.left).toBeGreaterThanOrEqual(left.right - 1);
    expect(stage.right).toBeLessThanOrEqual(right.left + 1);
    expect(stage.width).toBeGreaterThan(Math.max(left.width, right.width));
  });

  it("relinks the portrait's program for a NEW integrand, and not for a moved camera", async () => {
    // The guard the node sweep cannot kill, because in jsdom there is no stage to relink. M5.1's
    // review found the old shell recompiling and relinking its GLSL on every frame of a contour
    // drag — invisible to every test that does not count the calls.
    const spy = vi.spyOn(GLStage.prototype, "setIntegrand");
    const { app } = mount();
    await drawn();
    const afterBoot = spy.mock.calls.length;
    expect(afterBoot).toBe(1);

    // A camera move is not a new integrand.
    app.applyState({ ...app.currentState(), view: { center: [0.5, 0], halfHeight: 1 } });
    await drawn();
    expect(spy.mock.calls.length, "a pan relinked the program").toBe(afterBoot);

    // A new expression is.
    app.applyState({ ...app.currentState(), expr: "1/(1+z^2)" });
    await drawn();
    expect(spy.mock.calls.length, "a new integrand did NOT relink the program").toBe(afterBoot + 1);
    spy.mockRestore();
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The visual system — M8 step 1.2.
//
// **The controls and badges render nowhere until steps 1.4 and 1.5**, so without this they would be
// eighty lines of stylesheet carried unexercised through a whole phase and discovered to be wrong
// when a card first used them. A probe element is not the app, but it is the same sheet against the
// same cascade, and it makes the rules falsifiable now.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Mount the shell, then a probe INSIDE it so the `.shell2`-scoped rules apply as they will. */
function probe(html: string): HTMLElement {
  mountInBody();
  const shell = document.querySelector("main.shell2");
  if (shell === null) throw new Error("no shell");
  const host = document.createElement("div");
  host.innerHTML = html;
  shell.append(host);
  return host;
}

const rgb = (css: string): string => css.replace(/\s+/g, "");

/** A token's value as the browser computes it, so a hex and an `rgb(...)` compare equal. */
function resolved(token: string): string {
  const probeEl = document.createElement("span");
  probeEl.style.color = `var(${token})`;
  document.body.append(probeEl);
  const out = getComputedStyle(probeEl).color;
  probeEl.remove();
  return out;
}

describe("the visual system", () => {
  it("gives the RESULT card an accent rule and every other card none", async () => {
    const { root } = mount();
    await drawn();
    const result = root.querySelector('[data-card="result"]');
    const other = root.querySelector('[data-card="integrand"]');
    if (result === null || other === null) throw new Error("cards missing");
    const rs = getComputedStyle(result);
    const os = getComputedStyle(other);
    // The answer is the one card a reader should find without reading any of them.
    expect(parseFloat(rs.borderLeftWidth)).toBeGreaterThan(0);
    // The rule is the ACCENT, not just some rule. Resolved through the browser so the token's hex
    // and the computed `rgb(...)` are compared as the same thing.
    expect(rgb(rs.borderLeftColor)).toBe(rgb(resolved("--g-accent")));
    // Two adjacent bordered boxes make four rules where the eye needs one edge.
    expect(parseFloat(os.borderLeftWidth)).toBe(0);
    expect(parseFloat(os.borderTopWidth)).toBe(0);
    // And a card is distinguishable from the rail it sits in by its GROUND.
    const rail = root.querySelector("aside.rail2.left");
    expect(getComputedStyle(other).backgroundColor).not.toBe(getComputedStyle(rail as Element).backgroundColor);
  });

  it("draws the three honest-labelling badges as 22px squares, each its own colour", () => {
    const host = probe(
      '<span class="badge" data-level="=">=</span>' +
        '<span class="badge" data-level="≤">≤</span>' +
        '<span class="badge" data-level="≈">≈</span>',
    );
    const [eq, le, ap] = [...host.querySelectorAll(".badge")].map((e) => getComputedStyle(e));
    for (const s of [eq, le, ap]) {
      expect(parseFloat(s.width)).toBe(22);
      expect(parseFloat(s.height)).toBe(22);
    }
    // `=` exact, `≤` a bound, `≈` an estimate — three meanings, so three colours, all distinct.
    const colours = new Set([eq, le, ap].map((s) => rgb(s.backgroundColor)));
    expect(colours.size).toBe(3);
  });

  it("marks the pressed position of a segmented control, and only that one", () => {
    const host = probe(
      '<div class="segmented"><button aria-pressed="true">A</button><button aria-pressed="false">B</button></div>',
    );
    const [on, off] = [...host.querySelectorAll("button")].map((e) => getComputedStyle(e));
    expect(rgb(on.backgroundColor)).not.toBe(rgb(off.backgroundColor));
    // One control with several positions, not a row of buttons: the segment itself has no border.
    expect(parseFloat(on.borderTopWidth)).toBe(0);
  });

  it("is NOT restyled by the old shell's unscoped rules", () => {
    // **Scoping `theme.css` under `.shell2` protects the OLD shell from the NEW rules and does
    // nothing in the other direction.** `index.html` loads `app.css` for both, and its rules carry
    // no scope at all, so every class the new shell names the same way inherits them. Step 1.3 found
    // this twice: `.ink { pointer-events: none }` made the whole stage dead to a real mouse, and
    // `.chip { width: 9px; height: 9px }` — the old shell's colour swatch — collapsed the stage's
    // snap chip to a 9 px square with its text spilling out of it.
    const host = probe(
      '<span class="num">1.25</span><p class="muted">m</p><span class="badge" data-level="=">=</span>',
    );
    const [num, muted, badge] = [...host.children].map((e) => getComputedStyle(e));
    // A tabular number is not machine syntax; the old sheet makes every `.num` monospace.
    expect(num.fontFamily.toLowerCase(), "the old sheet's monospace leaked in").not.toContain("mono");
    expect(parseFloat(muted.marginTop), "the old sheet's margin leaked in").toBe(0);
    // The badge is a stamp: a flat 22 px square, no border and no margin of its own.
    expect(parseFloat(badge.borderTopWidth)).toBe(0);
    expect(parseFloat(badge.marginRight)).toBe(0);
    expect(parseFloat(badge.width)).toBe(22);
  });

  it("uses the five-size type scale, with numbers tabular and prose NOT monospace", () => {
    const { root } = mount();
    const h1 = getComputedStyle(root.querySelector("h1") as Element);
    const h2 = getComputedStyle(root.querySelector("h2") as Element);
    expect(parseFloat(h1.fontSize)).toBeGreaterThan(parseFloat(h2.fontSize));
    // Monospace is a signal that the text is machine syntax; spending it on prose is what made the
    // old shell read as a terminal.
    expect(h1.fontFamily.toLowerCase()).not.toContain("mono");
    const host = probe('<span class="num">1.25</span><span class="mono">1/z</span>');
    const [num, mono] = [...host.children].map((e) => getComputedStyle(e));
    expect(num.fontVariantNumeric).toContain("tabular-nums");
    expect(mono.fontFamily.toLowerCase()).toContain("mono");
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The stage controller — M8 step 1.3.
//
// **A hit test is exactly what jsdom cannot check.** There, `clientWidth` is 0, `getBoundingClientRect`
// is all zeros and `scale()` is whatever the `|| 1` viewport guard makes it — the node suite has to
// stub a size, and what it then drives is the gesture's EFFECT rather than its aim. Here the stage has
// a real box, so a drag that starts on the contour starts on the contour.
//
// Synthetic `PointerEvent`s carry a `pointerId` the browser has no active pointer for, and
// `setPointerCapture` throws `NotFoundError` on one. Stubbing the three capture calls is the harness
// accommodating a synthetic pointer; everything the assertions are about — the layout, the hit test,
// the camera — is the product's own.
// ──────────────────────────────────────────────────────────────────────────────────────────────

import { handlesOf } from "../src/engine/contour/edit.js";
import { resolveAll } from "../src/engine/contour/model.js";
import { plotToScreen } from "../src/kernel/camera.js";
import { pointAt } from "../src/kernel/geom.js";

function stubCapture(el: Element): void {
  const e = el as Element & Record<string, unknown>;
  e.setPointerCapture = (): void => {};
  e.releasePointerCapture = (): void => {};
  e.hasPointerCapture = (): boolean => false;
}

/** A stage with a real box, its ink canvas, and plot → client coordinates through the live camera. */
function mountDrag(): {
  app: ReturnType<typeof mountShell2>;
  ink: HTMLCanvasElement;
  client: (z: readonly [number, number]) => { x: number; y: number };
  drag: (from: readonly [number, number], to: { x: number; y: number }) => void;
} {
  const { root, app } = mount();
  const ink = root.querySelector<HTMLCanvasElement>("canvas.ink");
  const host = root.querySelector<HTMLElement>("div.stage2");
  if (ink === null || host === null) throw new Error("no stage");
  stubCapture(ink);
  const client = (z: readonly [number, number]): { x: number; y: number } => {
    const rect = ink.getBoundingClientRect();
    const [sx, sy] = plotToScreen(z[0], z[1], app.currentState().view, {
      width: host.clientWidth,
      height: host.clientHeight,
    });
    return { x: rect.left + sx, y: rect.top + sy };
  };
  const send = (type: string, at: { x: number; y: number }): void => {
    ink.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, buttons: 1, pointerId: 1 }),
    );
  };
  const drag = (from: readonly [number, number], to: { x: number; y: number }): void => {
    send("pointerdown", client(from));
    send("pointermove", to);
    send("pointerup", to);
  };
  return { app, ink, client, drag };
}

describe("the stage's gestures, aimed at a real layout", () => {
  it("MOVES the contour when the drag starts on it", async () => {
    const { app, client, drag } = mountDrag();
    await drawn();
    const before = app.currentState().contour;
    const pieces = resolveAll(before);
    const handles = handlesOf(before, pieces);
    // A point on the curve and AWAY from every handle, because a handle wins the hit test — which is
    // the decision the controller makes and so the one the aim has to respect.
    let best: readonly [number, number] = pointAt(pieces[0], 0);
    let bestGap = -1;
    for (let i = 0; i < 64; i++) {
      const z = pointAt(pieces[0], i / 64);
      const gap = Math.min(...handles.map((h) => Math.hypot(h.at[0] - z[0], h.at[1] - z[1])));
      if (gap > bestGap) {
        bestGap = gap;
        best = z;
      }
    }
    const at = client(best);
    drag(best, { x: at.x + 60, y: at.y });
    const after = app.currentState();
    expect(after.contour, "the contour did not move").not.toBe(before);
    // Rightwards on screen is rightwards in the plane, and the recipe moved with the geometry so a
    // link cannot reopen a different shape (M6.2).
    const [cx] = pointAt(resolveAll(after.contour)[0], 0);
    expect(cx).toBeGreaterThan(pointAt(pieces[0], 0)[0]);
    expect(after.contourSource?.shift[0] ?? 0).toBeGreaterThan(0);
  });

  it("CHANGES the parameter when the drag starts on a radius handle", async () => {
    const { app, client, drag } = mountDrag();
    await drawn();
    const state = app.currentState();
    const handle = handlesOf(state.contour, resolveAll(state.contour))[0];
    expect(handle, "the circle has no radius handle to grab").toBeTruthy();
    const before = state.geometry[handle.param];
    // Outwards along the handle's own ray, so the new radius is unambiguously larger.
    const out: readonly [number, number] = [handle.at[0] * 1.5, handle.at[1] * 1.5];
    drag(handle.at, client(out));
    const after = app.currentState().geometry[handle.param];
    expect(after, "the radius parameter was not set").toBeTypeOf("number");
    expect(after).toBeGreaterThan(before ?? 0);
    // The CONTOUR is untouched as an object — a radius handle edits a parameter, not the geometry.
    expect(app.currentState().contourSource?.shift).toEqual([0, 0]);
  });

  it("CLEARS the portrait when the expression stops parsing", async () => {
    // Leaving the last good portrait up is the worst of both: the reader is told the expression is
    // broken while looking at a picture of something else. Only a browser can see this — in jsdom
    // there is no GL stage to clear.
    const { app } = mountDrag();
    await drawn();
    const gl = document.querySelector<HTMLCanvasElement>("canvas.gl");
    if (gl === null) throw new Error("no gl canvas");
    const colours = (): Set<number> => {
      const read = document.createElement("canvas");
      read.width = 48;
      read.height = 48;
      const ctx = read.getContext("2d");
      if (ctx === null) throw new Error("no 2d context");
      ctx.drawImage(gl, 0, 0, 48, 48);
      const { data } = ctx.getImageData(0, 0, 48, 48);
      const out = new Set<number>();
      for (let i = 0; i < data.length; i += 4) out.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      return out;
    };
    expect(colours().size, "the portrait never drew, so clearing it proves nothing").toBeGreaterThan(12);
    app.applyState({ ...app.currentState(), expr: "1/(" });
    await drawn();
    // One colour: the ground. Not "fewer colours" — a stale portrait with a band over it would pass
    // that, and the claim is that nothing of the old integrand is left.
    expect(colours().size).toBe(1);
  });

  it("lets a real pointer REACH the ink canvas", async () => {
    // Every other gesture test dispatches straight at the canvas, which skips hit testing entirely —
    // so all of them passed while the stage was dead to an actual mouse. `app.css` carries an
    // unscoped `.ink { pointer-events: none }` for the OLD shell, whose gestures land on a separate
    // overlay div, and `index.html` loads both sheets. `elementFromPoint` is the primitive: it is
    // the same hit test the browser does for a click.
    mountDrag();
    await drawn();
    const host = document.querySelector("div.stage2");
    if (host === null) throw new Error("no stage");
    const r = host.getBoundingClientRect();
    for (const [dx, dy] of [[0.5, 0.5], [0.25, 0.3], [0.8, 0.7]] as const) {
      const hit = document.elementFromPoint(r.left + r.width * dx, r.top + r.height * dy);
      expect(hit?.className, `the pointer landed on ${hit?.tagName}.${hit?.className}`).toBe("ink");
    }
  });

  it("says with the CURSOR what a click would do", async () => {
    // One convention, set by the controller and never by CSS: `grab` over anything grabbable,
    // `crosshair` while drawing, `default` otherwise. The old shell's cursor came from three places
    // and disagreed with itself over a handle in pen mode. Only a browser can check it — jsdom
    // computes no styles and, with a 1x1 viewport, has no "over" to be over.
    const { app, ink, client } = mountDrag();
    await drawn();
    const state = app.currentState();
    const handle = handlesOf(state.contour, resolveAll(state.contour))[0];
    const move = (at: { x: number; y: number }): void => {
      ink.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: at.x, clientY: at.y, buttons: 0, pointerId: 1 }),
      );
    };
    const corner = ink.getBoundingClientRect();
    move({ x: corner.left + 3, y: corner.top + 3 });
    expect(ink.style.cursor, "the empty plane offered a grab").toBe("default");
    move(client(handle.at));
    expect(ink.style.cursor, "a radius handle did not offer a grab").toBe("grab");
    // With the pen out the stage is a drawing surface, over a handle as much as anywhere else.
    app.stage().penStart();
    move(client(handle.at));
    expect(ink.style.cursor).toBe("crosshair");
  });

  it("draws the POLE on the ink canvas, where the figure export can see it", async () => {
    // M6.3's lesson: assert the PRIMITIVE. The old shell drew pole markers into the DOM overlay, so
    // they were absent from every exported figure and no pixel test could have told the difference.
    // The control is an ENTIRE integrand, which has no pole to draw and leaves the same box empty —
    // without it, "some ink near the middle" is bought by anything at all.
    const { app, ink } = mountDrag();
    await drawn();
    const inkNear = (): number => {
      const box = 24;
      const r = ink.getBoundingClientRect();
      const dpr = ink.width / r.width;
      const read = document.createElement("canvas");
      read.width = box;
      read.height = box;
      const ctx = read.getContext("2d");
      if (ctx === null) throw new Error("no 2d context");
      // The pole of `1/z` is at the origin, which is the camera's centre.
      const cx = Math.round((r.width / 2) * dpr);
      const cy = Math.round((r.height / 2) * dpr);
      ctx.drawImage(ink, cx - box / 2, cy - box / 2, box, box, 0, 0, box, box);
      const { data } = ctx.getImageData(0, 0, box, box);
      let lit = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 24) lit++;
      return lit;
    };
    const withPole = inkNear();
    expect(withPole, "no pole ring was drawn at the origin").toBeGreaterThan(20);

    app.applyState({ ...app.currentState(), expr: "z^2" });
    await drawn();
    expect(inkNear(), "an ENTIRE integrand left a ring behind").toBe(0);
  });
});
