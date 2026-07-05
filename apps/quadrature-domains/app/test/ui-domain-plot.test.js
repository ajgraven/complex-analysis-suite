'use strict';
// DomainPlot double-click → add-pole (jsdom). Split from the former monolithic
// node-test.js (Phase 2). Runs the REAL ui-domain-plot.js source in a jsdom
// window; skipped gracefully if jsdom is absent. `ok` is a bootstrap global.
const fs = require('fs');
const path = require('path');
const APP_DIR = path.join(__dirname, '..');
require('./bootstrap');

module.exports = async function run() {
  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); }
  catch (e) { ok('DomainPlot dblclick: jsdom present (else skipped)', true, 'jsdom unavailable — skipped'); return; }
  try {
    const html = '<!DOCTYPE html><body>' +
      '<button class="tab-btn active" data-tab="qd"></button><canvas id="c"></canvas></body>';
    const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
    const W = dom.window;
    // ui-domain-plot.js is a factory IIFE: it installs QD_UI.installDomainPlot(deps)
    // which returns the DomainPlot class with ui.js closures injected. Run the
    // source in W's realm, then call the factory with dummy deps (the dblclick
    // path uses none of them; render — the only heavy consumer — is stubbed).
    const srcText = fs.readFileSync(path.join(APP_DIR, 'ui-domain-plot.js'), 'utf8');
    W.eval(srcText);
    const DP = W.QD_UI.installDomainPlot({
      state: { poles: [], viewMode: 'inverse' },
      modeDescriptor: () => ({}),
      formatTick: (v) => String(v),
      sub: (n) => String(n),
    });
    ok('DomainPlot dblclick: class loads in jsdom', typeof DP === 'function');
    if (typeof DP !== 'function') return;
    DP.prototype.render = function () {};                 // jsdom has no 2D ctx — stub drawing
    const canvas = W.document.getElementById('c');
    const plot = new DP(canvas, { textContent: '' });
    plot.setData({ poles: [{ re: 0.5, im: -0.5 }], boundaryPts: [] });

    // (1) double-click empty space → onAddPole fires with w === toWorld(click).
    let added = null;
    plot.onAddPole = (w) => { added = w; };
    canvas.dispatchEvent(new W.MouseEvent('dblclick', { clientX: 5, clientY: 5, bubbles: true, cancelable: true }));
    const want = plot.toWorld(5, 5);
    ok('DomainPlot dblclick: empty space fires onAddPole', added !== null);
    ok('DomainPlot dblclick: onAddPole receives the clicked w (toWorld)',
       !!added && Math.abs(added.re - want.re) < 1e-9 && Math.abs(added.im - want.im) < 1e-9,
       added ? ('got ' + added.re + ',' + added.im) : 'no call');

    // (2) double-click ON the existing pole dot → ignored (no stacked duplicate).
    added = null;
    const sp = plot.toScreen(0.5, -0.5);
    canvas.dispatchEvent(new W.MouseEvent('dblclick', { clientX: sp.x, clientY: sp.y, bubbles: true, cancelable: true }));
    ok('DomainPlot dblclick: on an existing pole is ignored', added === null);

    // (3) setLivePole (1A) moves one marker in-place — decoupled from any solve —
    // and no-ops on out-of-range index or missing data (never throws).
    plot.setLivePole(0, { re: 1.25, im: -0.75 });
    ok('DomainPlot setLivePole: moves the targeted pole',
       plot.data.poles[0].re === 1.25 && plot.data.poles[0].im === -0.75);
    plot.setLivePole(5, { re: 9, im: 9 });                // out of range → ignored
    ok('DomainPlot setLivePole: out-of-range index is a no-op',
       plot.data.poles.length === 1 && plot.data.poles[0].re === 1.25);
    const savedData = plot.data;
    plot.data = null;
    let threwLive = false;
    try { plot.setLivePole(0, { re: 0, im: 0 }); } catch (e) { threwLive = true; }
    plot.data = savedData;
    ok('DomainPlot setLivePole: no-op when data is null (no throw)', !threwLive);
  } catch (e) {
    ok('DomainPlot dblclick: jsdom test ran without error', false, String((e && e.stack) || e));
  }
};
