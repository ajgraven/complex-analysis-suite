'use strict';
// Schwarz fractal-mode interaction (jsdom). Split from the former monolithic
// node-test.js (Phase 2) and UPGRADED to real async: the single-click pin is
// deferred via setTimeout(CLICK_DELAY), and the async runner now lets us AWAIT
// it — so we verify the pin actually commits after the delay, and that a
// double-click within the window truly prevents it from ever committing (the
// old sync test could only check the timer was scheduled). `ok` is a bootstrap
// global. Skipped gracefully if jsdom is absent.
const fs = require('fs');
const path = require('path');
const APP_DIR = path.join(__dirname, '..');
require('./bootstrap');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function run() {
  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); }
  catch (e) { ok('Schwarz UI: jsdom present (else skipped)', true, 'jsdom unavailable — skipped'); return; }
  try {
    const html = '<!DOCTYPE html><body>' +
      '<div id="controls-schwarz"></div><canvas id="canvas"></canvas></body>';
    const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
    const W = dom.window;
    // Opt into the test hook BEFORE the IIFE runs, and provide the QD global
    // it needs (the module bails if QD is undefined).
    W.__SCHWARZ_UI_TEST_HOOK__ = true;
    const stub = { kind: 'fundamental' };                    // mutable gate verdict
    W.QD = {
      Schwarz: {
        escapeTime: () => ({ kind: stub.kind, n: stub.kind === 'fundamental' ? 2 : 0 }),
        makeOrbit: (w) => [{ re: w.re, im: w.im }, { re: w.re + 1, im: w.im }],
        buildPreimageTree: (w) => ({ generations: [[{ re: w.re, im: w.im }]], edges: [], truncatedByBudget: false }),
      },
    };
    const srcText = fs.readFileSync(path.join(APP_DIR, 'schwarz', 'schwarz-ui.js'), 'utf8');
    W.eval(srcText);
    const T = W.__schwarzUiTest;
    ok('Schwarz UI: test hook installed', !!T && typeof T.onCanvasClick === 'function');
    if (!T) return;

    // Minimal active fractal-mode state. Use a SHORT-but-nonzero pin delay so we
    // can await the real deferred behaviour (the old test forced CLICK_DELAY=0).
    T.sState.mode = 'fractal';
    T.sState.viewMode = 'plane';
    T.sState.schwarz = { isInOmega: () => true };
    T.CLICK_DELAY = 10;
    const evt = (over) => Object.assign({ clientX: 12, clientY: 9, shiftKey: false }, over || {});

    // (1) Single click schedules a deferred pin that ACTUALLY COMMITS after the delay.
    T.sState._clickTimer = null; T.sState.pinnedOrbit = []; T.sState.orbit = [];
    T.onCanvasClick(evt());
    ok('Schwarz UI: single click schedules a deferred pin', T.sState._clickTimer != null);
    await delay(30);
    ok('Schwarz UI: deferred pin commits after CLICK_DELAY',
       T.sState.pinnedOrbit.length > 0 && T.sState.orbit === T.sState.pinnedOrbit);

    // (2) pinOrbitAt body: inside Ω → orbit pinned; outside Ω → pin cleared.
    T.pinOrbitAt({ re: 0.3, im: 0.1 });
    ok('Schwarz UI: pinOrbitAt inside Ω pins the orbit',
       Array.isArray(T.sState.pinnedOrbit) && T.sState.pinnedOrbit.length > 0 &&
       T.sState.orbit === T.sState.pinnedOrbit);
    T.sState.schwarz = { isInOmega: () => false };
    T.pinOrbitAt({ re: 9, im: 9 });
    ok('Schwarz UI: pinOrbitAt outside Ω clears the pin', T.sState.pinnedOrbit.length === 0);
    T.sState.schwarz = { isInOmega: () => true };           // restore

    // (3) Double-click within the window cancels the pin AND seeds the tree —
    //     and, crucially, the pin NEVER commits even after the delay elapses.
    T.sState._clickTimer = null; T.sState.preimageTree = null; T.sState.pinnedOrbit = []; T.sState.orbit = [];
    stub.kind = 'fundamental';
    T.onCanvasClick(evt());                                  // arm the pin
    ok('Schwarz UI: pin armed before dblclick', T.sState._clickTimer != null);
    T.onCanvasDblClick(evt());
    ok('Schwarz UI: dblclick cancels the pending pin', T.sState._clickTimer == null);
    ok('Schwarz UI: dblclick on tiling-set point seeds the tree', T.sState.preimageTree != null);
    await delay(30);
    ok('Schwarz UI: cancelled pin never commits (no orbit after the delay)',
       T.sState.pinnedOrbit.length === 0);

    // (4) Gate rejects a non-tiling-set point (escapeTime kind 'interior').
    T.sState.preimageTree = null; stub.kind = 'interior';
    T.onCanvasDblClick(evt());
    ok('Schwarz UI: dblclick on non-escaping point seeds NO tree', T.sState.preimageTree == null);

    // (5) shift-drag gesture is ignored by both handlers (curve-draw reserved).
    T.sState.preimageTree = null; stub.kind = 'fundamental';
    T.onCanvasDblClick(evt({ shiftKey: true }));
    ok('Schwarz UI: shift+dblclick is ignored (no tree)', T.sState.preimageTree == null);

    // (6) Hover orbit: enabled+inside Ω computes; disabled or outside Ω does not.
    T.sState.hoverOrbitEnabled = true; T.sState.hoverOrbit = null;
    T.sState._pendingHoverW = { re: 0.2, im: 0.1 };
    T.runHoverOrbit();
    ok('Schwarz UI: hover (enabled, inside Ω) computes an orbit',
       Array.isArray(T.sState.hoverOrbit) && T.sState.hoverOrbit.length > 0);
    T.sState.hoverOrbit = null; T.sState.hoverOrbitEnabled = false;
    T.sState._pendingHoverW = { re: 0.2, im: 0.1 };
    T.runHoverOrbit();
    ok('Schwarz UI: hover disabled → no orbit', T.sState.hoverOrbit == null);
    T.sState.hoverOrbitEnabled = true; T.sState.schwarz = { isInOmega: () => false };
    T.sState._pendingHoverW = { re: 9, im: 9 };
    T.runHoverOrbit();
    ok('Schwarz UI: hover outside Ω → no orbit', T.sState.hoverOrbit == null);
  } catch (e) {
    ok('Schwarz UI: jsdom interaction test ran without error', false, String((e && e.stack) || e));
  }
};
