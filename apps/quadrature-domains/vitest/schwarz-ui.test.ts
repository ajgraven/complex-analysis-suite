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
  const QD: any = (await import("../app/solver.mjs")).default;
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
});
