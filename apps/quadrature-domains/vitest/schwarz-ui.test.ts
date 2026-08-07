// @vitest-environment jsdom
//
// Schwarz fractal-mode interaction (jsdom). Migrated from app/test/schwarz-ui.test.js at the
// Phase-2 flip. Instead of W.eval-ing the classic schwarz-{paint,render,features,interaction,ui}.js
// in a hand-built JSDOM window, it sets the test hook + mocks QD.Schwarz on the shared namespace,
// then DYNAMIC-imports the ESM twins in order (dynamic so the hook + mock are in place before each
// module's IIFE runs). schwarz-ui.mjs exposes window.__schwarzUiTest exactly as the classic did.
import { describe, it, expect, beforeAll } from "vitest";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stub: { kind: string } = { kind: "fundamental" };
let T: any;

beforeAll(async () => {
  document.body.innerHTML = '<div id="controls-schwarz"></div><canvas id="canvas"></canvas>';
  // Opt into the test hook BEFORE the schwarz-ui IIFE runs; provide the mock QD.Schwarz it needs.
  (window as any).__SCHWARZ_UI_TEST_HOOK__ = true;
  const QD: any = (await import("../app/solvers/solver.mjs")).default;
  QD.Schwarz = {
    escapeTime: () => ({ kind: stub.kind, n: stub.kind === "fundamental" ? 2 : 0 }),
    makeOrbit: (w: any) => [{ re: w.re, im: w.im }, { re: w.re + 1, im: w.im }],
    buildPreimageTree: (w: any) => ({ generations: [[{ re: w.re, im: w.im }]], edges: [], truncatedByBudget: false }),
  };
  // The four installX factories must attach onto QD_UI before schwarz-ui consumes them.
  await import("../app/schwarz/schwarz-paint.mjs");
  await import("../app/schwarz/schwarz-render.mjs");
  await import("../app/schwarz/schwarz-features.mjs");
  await import("../app/schwarz/schwarz-interaction.mjs");
  await import("../app/schwarz/schwarz-ui.mjs");
  T = (window as any).__schwarzUiTest;
});

describe("Schwarz fractal-mode interaction (jsdom)", () => {
  it("installs the test hook", () => {
    expect(!!T && typeof T.onCanvasClick === "function").toBe(true);
  });

  // S0a (SIGMA-HANDOFF): the export hands off φ (the Riemann map), NOT the Schwarz reflection σ.
  // The label must say so — "Export map" over a Schwarz-reflection tool reads as exporting σ.
  it("export card honestly labels the hand-off as φ (Riemann map), not σ", () => {
    expect(!!T && typeof T.makeOverlaysCard === "function").toBe(true);
    const card = T.makeOverlaysCard();
    const btn = card.querySelector("#schwarz-export-map") as HTMLButtonElement;
    expect(btn).toBeTruthy();
    // The button names the Riemann map φ — not the bare "Export map".
    expect(btn.textContent).toMatch(/Riemann map/);
    expect(btn.textContent).toContain("φ");
    // The card copy makes clear it exports φ, and disclaims the Schwarz reflection σ.
    const text = card.textContent || "";
    expect(text).toMatch(/Riemann map φ/);
    expect(text).toMatch(/\bnot\b[\s\S]{0,40}(Schwarz reflection|σ)/i);
  });

  it("click pins (deferred), dblclick cancels + seeds tree, gate + hover behave", async () => {
    if (!T) return;
    T.sState.mode = "fractal";
    T.sState.viewMode = "plane";
    T.sState.schwarz = { isInOmega: () => true };
    T.CLICK_DELAY = 10;
    const evt = (over?: any) => Object.assign({ clientX: 12, clientY: 9, shiftKey: false }, over || {});

    // (1) single click schedules a deferred pin that actually commits after the delay
    T.sState._clickTimer = null; T.sState.pinnedOrbit = []; T.sState.orbit = [];
    T.onCanvasClick(evt());
    expect(T.sState._clickTimer != null).toBe(true);
    await delay(30);
    expect(T.sState.pinnedOrbit.length > 0 && T.sState.orbit === T.sState.pinnedOrbit).toBe(true);

    // (2) pinOrbitAt: inside Ω pins, outside Ω clears
    T.pinOrbitAt({ re: 0.3, im: 0.1 });
    expect(T.sState.pinnedOrbit.length > 0 && T.sState.orbit === T.sState.pinnedOrbit).toBe(true);
    T.sState.schwarz = { isInOmega: () => false };
    T.pinOrbitAt({ re: 9, im: 9 });
    expect(T.sState.pinnedOrbit.length).toBe(0);
    T.sState.schwarz = { isInOmega: () => true };

    // (3) dblclick cancels the pending pin AND seeds the tree; the pin never commits
    T.sState._clickTimer = null; T.sState.preimageTree = null; T.sState.pinnedOrbit = []; T.sState.orbit = [];
    stub.kind = "fundamental";
    T.onCanvasClick(evt());
    expect(T.sState._clickTimer != null).toBe(true);
    T.onCanvasDblClick(evt());
    expect(T.sState._clickTimer == null).toBe(true);
    expect(T.sState.preimageTree != null).toBe(true);
    await delay(30);
    expect(T.sState.pinnedOrbit.length).toBe(0);

    // (4) gate rejects a non-tiling-set point (escapeTime kind 'interior')
    T.sState.preimageTree = null; stub.kind = "interior";
    T.onCanvasDblClick(evt());
    expect(T.sState.preimageTree == null).toBe(true);

    // (5) shift+dblclick is ignored (curve-draw reserved)
    T.sState.preimageTree = null; stub.kind = "fundamental";
    T.onCanvasDblClick(evt({ shiftKey: true }));
    expect(T.sState.preimageTree == null).toBe(true);

    // (6) hover orbit: enabled+inside computes; disabled or outside does not
    T.sState.hoverOrbitEnabled = true; T.sState.hoverOrbit = null;
    T.sState._pendingHoverW = { re: 0.2, im: 0.1 };
    T.runHoverOrbit();
    expect(Array.isArray(T.sState.hoverOrbit) && T.sState.hoverOrbit.length > 0).toBe(true);
    T.sState.hoverOrbit = null; T.sState.hoverOrbitEnabled = false;
    T.sState._pendingHoverW = { re: 0.2, im: 0.1 };
    T.runHoverOrbit();
    expect(T.sState.hoverOrbit == null).toBe(true);
    T.sState.hoverOrbitEnabled = true; T.sState.schwarz = { isInOmega: () => false };
    T.sState._pendingHoverW = { re: 9, im: 9 };
    T.runHoverOrbit();
    expect(T.sState.hoverOrbit == null).toBe(true);
  });

  // A disabled sphere handle stands in for a browser without WebGL 2 (createRenderer
  // returns null → sphere-ui returns _disabledHandle with isAvailable() === false).
  const disabledSphereHandle = () => ({
    isAvailable: () => false,
    activate() {}, deactivate() {}, setPhi: () => false,
    setRenderParams() {}, setDisplayParams() {}, resetCamera() {},
    requestRender() {}, markFractalDirty() {}, destroy() {},
  });
  const liveSphereHandle = (onActivate: () => void) => ({
    isAvailable: () => true,
    activate() { onActivate(); }, deactivate() {}, setPhi: () => false,
    setRenderParams() {}, setDisplayParams() {}, resetCamera() {},
    requestRender() {}, markFractalDirty() {}, destroy() {},
  });

  it("sphere view without WebGL 2: notifies the user and reverts to the prior 2-D view", async () => {
    if (!T) return;
    const QD: any = (await import("../app/solvers/solver.mjs")).default;
    const toasts: any[] = [];
    QD.QoL = { toast: (msg: string, opts: any) => toasts.push({ msg, opts }) };
    QD.SphereView = { mount: () => disabledSphereHandle() };

    T.sState.sphereView = null;      // force a fresh mount
    T.sState.viewMode = "plane";
    T.setViewMode("sphere");

    // Reverted to where the user was, and told them why (an error-kind toast).
    expect(T.sState.viewMode).toBe("plane");
    expect(toasts.length).toBe(1);
    expect(toasts[0].opts.kind).toBe("error");
    expect(/WebGL 2/i.test(toasts[0].msg)).toBe(true);
  });

  it("sphere view with WebGL 2: activates and stays on the sphere view", async () => {
    if (!T) return;
    const QD: any = (await import("../app/solvers/solver.mjs")).default;
    const toasts: any[] = [];
    QD.QoL = { toast: (msg: string, opts: any) => toasts.push({ msg, opts }) };
    let activated = false;
    QD.SphereView = { mount: () => liveSphereHandle(() => { activated = true; }) };

    T.sState.sphereView = null;
    T.sState.viewMode = "plane";
    T.setViewMode("sphere");

    expect(T.sState.viewMode).toBe("sphere");
    expect(activated).toBe(true);
    expect(toasts.length).toBe(0);   // no fallback notice when it works
  });
});
