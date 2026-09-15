// =============================================================================
// schwarz-features.js -- Feature-compute methods for the Schwarz tab.
//
// Extracted from schwarz-ui.js by the Phase-3 UI modularization (item E).
// Exposes QD_UI.installSchwarzFeatures(sCtx); schwarz-ui.js captures the
// returned functions into IIFE-local bindings (forward-declared near the top),
// so every card-builder event handler + the interaction-install dep list calls
// them by their original names, unchanged.
//
// These are the per-feature compute/recompute routines wired to the analysis,
// limit-set, and forward-dynamics cards (plus the PNG export action): the
// preimage-tree rebuild + stats, σ domain-coloring, the limit-set chaos game,
// σ level curves, critical orbits, the cycle finder, the orbit-family sweep,
// the z-panel ψ-pullback, and high-res PNG export. Bodies are VERBATIM moves.
//
// Deps via sCtx: sState + the paint fns (paintBoundaryOnTop / paintAll / paintOrbit
// / paintZView, from schwarz-paint.js) + activeRenderer and setOverlayCapture, the
// two the image exporter needs. `QD` is the global; `document` / `performance` /
// `URL` / `console` are browser globals.
// =============================================================================

// ESM (Phase 2 port). QD_UI factory module.
import { QD_UI } from '../ui/ui-registry.mjs';
import _QD from '../solvers/solver.mjs';
import { planExportSize, describeExportDetail, exportFileName } from './schwarz-export-plan.mjs';
const QD = _QD;

// Fallback edge cap when there is no GL context to ask (a CPU-only export). Browsers
// cap 2D canvas AREA rather than edge, and do not publish the number; 8192 is the
// smallest edge any WebGL2-capable target reports here, so it is the safe stand-in.
const CANVAS_2D_MAX_EDGE = 8192;

(function (global) {
  'use strict';

  QD_UI.installSchwarzFeatures = function installSchwarzFeatures(s) {
    const sState             = s.sState;
    const paintBoundaryOnTop = s.paintBoundaryOnTop;
    const paintAll           = s.paintAll;
    const paintOrbit         = s.paintOrbit;
    const paintZView         = s.paintZView;
    const activeRenderer     = s.activeRenderer;
    // Redirects every painter's getCtx() at a capture context for the duration of
    // one export, so the overlay re-renders at size instead of being upscaled.
    const setOverlayCapture  = s.setOverlayCapture;

  function _recomputeDomainColoring() {
    if (!sState.schwarz) { sState.domainColor = null; return; }
    const v = sState.view;
    const viewport = {
      reMin: v.cx - (v.cssW / 2) / v.scale,
      reMax: v.cx + (v.cssW / 2) / v.scale,
      imMin: v.cy - (v.cssH / 2) / v.scale,
      imMax: v.cy + (v.cssH / 2) / v.scale,
    };
    const W = 256, H = 256;
    try {
      const buf = QD.Schwarz.domainColoringField(sState.schwarz, viewport, { W, H });
      sState.domainColor = { buf, W, H, viewport };
    } catch (_) { sState.domainColor = null; }
  }

  // Re-build the tree from the existing seed (root of the previous tree)
  // when depth or budget changes. Cheap: σ⁻¹ runs are millisecond-scale.
  function _rebuildPreimageTreeIfActive() {
    if (sState.mode !== 'fractal') return;
    if (!sState.schwarz || !sState.preimageTree) return;
    const seed = sState.preimageTree.generations[0][0];
    sState.preimageTree = QD.Schwarz.buildPreimageTree(seed, sState.schwarz, {
      depth:        sState.preimageDepth,
      visualBudget: sState.preimageBudget,
    });
    // paintBoundaryOnTop draws the tree for the active view; no bare w-plane
    // paintPreimageTree() (it would mis-draw onto the z-disk in z-view).
    paintBoundaryOnTop();
    _refreshPreimageTreeStats();
  }

  function _refreshPreimageTreeStats() {
    const el = document.getElementById('schwarz-preimage-count');
    if (!el || !sState.preimageTree) { if (el) el.textContent = ''; return; }
    let total = 0;
    for (const g of sState.preimageTree.generations) total += g.length;
    const trunc = sState.preimageTree.truncatedByBudget ? ' (capped)' : '';
    el.textContent = total + ' pts' + trunc;
  }

  function _computeLimitSet() {
    if (!sState.schwarz) {
      const el = document.getElementById('schwarz-ls-status');
      if (el) el.textContent = 'No φ captured.';
      return;
    }
    const statusEl = document.getElementById('schwarz-ls-status');
    const dimEl    = document.getElementById('schwarz-ls-dim');
    if (statusEl) statusEl.textContent = 'Computing…';
    if (dimEl)    dimEl.textContent    = '';
    // Defer one frame so the "Computing…" text actually paints.
    setTimeout(() => {
      const t0 = performance.now();
      try {
        sState.limitSet = QD.Schwarz.sampleLimitSet(sState.schwarz, {
          n: sState.limitSetN,
          burnIn: 200,
        });
      } catch (err) {
        if (statusEl) statusEl.textContent = 'Error: ' + (err.message || err);
        return;
      }
      const t1 = performance.now();
      const n = sState.limitSet.length / 2;
      if (statusEl) statusEl.textContent = n + ' pts in ' + (t1 - t0).toFixed(0) + ' ms';
      // Dimension estimate.
      if (n >= 200) {
        try {
          const r = QD.Schwarz.boxCountingDimension(sState.limitSet);
          sState.limitSetDim = r.dim;
          if (dimEl) dimEl.textContent = 'dim ≈ ' + (isFinite(r.dim) ? r.dim.toFixed(3) : 'NaN');
        } catch (_) { /* ignore */ }
      }
      // paintBoundaryOnTop draws the limit set for the active view (paintZView
      // in z); no bare w-plane paintLimitSet() (it would mis-draw in the z-view).
      paintBoundaryOnTop();
    }, 30);
  }

  function _clearLimitSet() {
    sState.limitSet = null;
    sState.limitSetDim = null;
    const el = document.getElementById('schwarz-ls-status');
    const dimEl = document.getElementById('schwarz-ls-dim');
    if (el) el.textContent = '';
    if (dimEl) dimEl.textContent = '';
    paintBoundaryOnTop();
  }

  function _recomputeCriticalOrbits() {
    if (!sState.schwarz) { sState.criticalOrbits = null; return; }
    const seeds = QD.Schwarz.canonicalSeeds(sState.schwarz);
    const out = [];
    for (const s of seeds) {
      const orbit = QD.Schwarz.makeOrbit(s.w, sState.schwarz,
                                          { maxIter: sState.grid.maxIter });
      out.push({ label: s.label, orbit });
    }
    sState.criticalOrbits = out;
  }

  function _findCycles() {
    if (!sState.schwarz) return;
    const n = +(document.getElementById('schwarz-cycle-n').value || 2);
    const statusEl = document.getElementById('schwarz-cycle-count');
    if (statusEl) statusEl.textContent = '…';
    setTimeout(() => {
      const t0 = performance.now();
      let cycles = [];
      try {
        cycles = QD.Schwarz.findCycles(sState.schwarz, n, { gridSize: 18 });
      } catch (_) { /* ignore */ }
      const t1 = performance.now();
      sState.cycles = cycles;
      if (statusEl) statusEl.textContent =
        '≈ ' + cycles.length + ' cycles (advisory) in ' + (t1 - t0).toFixed(0) + ' ms';
      paintBoundaryOnTop();
    }, 30);
  }

  // S6 / F8: high-resolution PNG export. Composites what the Schwarz tab is
  // showing into one PNG at `mult` times the display size, for all three view
  // modes (plane / z-disk / sphere).
  //
  // THREE THINGS THIS HAS TO GET RIGHT, each measured rather than assumed:
  //
  // 1. RE-RENDER, ALWAYS. Both GL contexts are created with
  //    `preserveDrawingBuffer: false`, so once the browser has composited a
  //    frame the canvas reads back EMPTY — measured 1 distinct colour against 26
  //    (Schwarz) and 1 against 2858 (sphere). The export therefore renders
  //    synchronously and copies before yielding; there is no fast path that
  //    skips the render at 1×, which is what used to make a 1× export a picture
  //    of nothing.
  // 2. THE VIEW MODE IS PART OF THE FRAME. The z-disk view has its own camera
  //    (sState.zView) and its own shader branch (viewMode:'z'); passing neither
  //    exports the plane at the plane's camera — a different picture from the
  //    one on screen.
  // 3. OVERLAYS ARE RE-DRAWN, NOT UPSCALED. Scaling the display canvas gives a
  //    blocky boundary and blocky markers, which is a big screenshot rather than
  //    a high-resolution figure. `worldToPixel` yields display-space coordinates
  //    and no painter touches the transform, so ONE setTransform(mult) on a
  //    capture context makes every existing painter draw vector-crisp at size,
  //    with no change to any of them. The painters clear their whole canvas, so
  //    the overlay gets its own layer and is composited over the field.
  //
  // What cannot be made sharper is said out loud instead (describeExportDetail):
  // a CPU escape-time field exists only at the resolution slider's size, and the
  // sphere's fractal is a texture of a fixed size mapped onto geometry.
  // The size + honest label for the CURRENT state, shared by the preview and the
  // export itself so the line the user reads before clicking is the one the file
  // is made to. Returns null when this view has nothing exportable.
  function _planCurrentExport() {
    const inZ      = sState.viewMode === 'z';
    const onSphere = sState.viewMode === 'sphere';
    const view     = inZ ? sState.zView : sState.view;
    const onGpu    = !onSphere && activeRenderer() === 'gpu' && !!sState.gpu;
    const sphere   = sState.sphereView;
    if (onSphere && !(sphere && sphere.captureFrame)) return null;

    const el = document.getElementById('schwarz-export-mult');
    const requested = +((el && el.value) || 1);
    let maxDim = 0;
    if (onSphere && sphere.maxOutputSize) maxDim = sphere.maxOutputSize() | 0;
    else if (onGpu && sState.gpu.maxOutputSize) maxDim = sState.gpu.maxOutputSize() | 0;
    if (!maxDim) maxDim = CANVAS_2D_MAX_EDGE;

    const plan = planExportSize({ cssW: view.cssW, cssH: view.cssH, mult: requested, maxDim });
    const detail = describeExportDetail({
      view:    sState.viewMode,
      onGpu,
      outW:    plan.outW,
      outH:    plan.outH,
      fieldW:  sState.fieldW,
      fieldH:  sState.fieldH,
      texSize: onSphere && sphere.fractalTexSize ? sphere.fractalTexSize() : 0,
    });
    const clampNote = plan.clamped
      ? '  \u26a0 capped at this renderer\u2019s ' + plan.maxDim + ' px limit (asked ' +
        plan.requestedMult + '\u00d7, got ' + plan.mult.toFixed(2) + '\u00d7).'
      : '';
    return { inZ, onSphere, view, onGpu, sphere, plan, detail, clampNote };
  }

  // Live readout under the multiplier, so the output size and the cap are visible
  // BEFORE the click rather than discovered in the saved file.
  function _refreshExportPreview() {
    const statusEl = document.getElementById('schwarz-export-png-status');
    if (!statusEl) return;
    const p = _planCurrentExport();
    if (!p) { statusEl.textContent = 'Nothing to export in this view yet.'; statusEl.style.color = '#555'; return; }
    statusEl.style.color = p.plan.clamped ? '#b06000' : '#555';
    statusEl.textContent = p.plan.outW + '\u00d7' + p.plan.outH + ' \u2014 ' + p.detail.detail + '.' + p.clampNote;
  }

  function _exportPng() {
    const statusEl = document.getElementById('schwarz-export-png-status');
    const say = (msg, ok) => {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.style.color = ok === false ? '#b00020' : '#555';
    };

    const inZ      = sState.viewMode === 'z';
    const onSphere = sState.viewMode === 'sphere';
    const view     = inZ ? sState.zView : sState.view;
    const onGpu    = !onSphere && activeRenderer() === 'gpu' && !!sState.gpu;
    const sphere   = sState.sphereView;

    const planned = _planCurrentExport();
    if (!planned) {
      say('The sphere view has no renderer to export.', false);
      return;
    }
    const plan = planned.plan;
    const outW = plan.outW, outH = plan.outH;

    const out    = document.createElement('canvas');
    out.width    = outW;
    out.height   = outH;
    const outCtx = out.getContext('2d');
    if (!outCtx) { say('Could not allocate a ' + outW + '\u00d7' + outH + ' canvas.', false); return; }

    let rendered = false;
    if (onSphere) {
      // The sphere draws its own overlay geometry in GL and clears opaque, so its
      // frame IS the export — nothing to composite over it.
      const cv = sphere.captureFrame({ W: outW, H: outH });
      if (cv) { outCtx.drawImage(cv, 0, 0, outW, outH); rendered = true; }
      if (sphere.restoreFrame) sphere.restoreFrame();
      if (!rendered) { say('The sphere view is not ready to export.', false); return; }
    } else {
      // --- 1) Field layer ---
      const glCanvas = document.getElementById('schwarz-gl-canvas');
      if (onGpu && glCanvas) {
        try {
          sState.gpu.setColormap(sState.grid.colormap);
          sState.gpu.render(view, {
            maxIter:   sState.grid.maxIter,
            scaleMode: sState.grid.scaleMode,
            modK:      sState.grid.modK,
            viewMode:  inZ ? 'z' : 'w',
            pixelSize: { W: outW, H: outH },
          });
          outCtx.drawImage(glCanvas, 0, 0, outW, outH);   // before any yield — see (1)
          rendered = true;
        } catch (e) {
          console.warn('[schwarz export] high-res GPU render failed:', e);
        }
      }
      if (!rendered) {
        // CPU / domain-colouring: paintAll() below blits the field it has. Fill the
        // painter's own backdrop first so the PNG is not transparent where nothing
        // was drawn (schwarz-paint's paintField uses the same colour).
        outCtx.fillStyle = '#fafafa';
        outCtx.fillRect(0, 0, outW, outH);
      }

      // --- 2) Overlay layer, re-drawn at size --- see (3)
      const ov = document.createElement('canvas');
      ov.width = outW; ov.height = outH;
      const ovCtx = ov.getContext('2d');
      if (ovCtx) {
        ovCtx.setTransform(plan.mult, 0, 0, plan.mult, 0, 0);
        setOverlayCapture(ovCtx);
        try {
          // Exactly the painters the live render picks for this mode
          // (schwarz-render.js), so the export cannot drift from the screen.
          if (inZ)            paintZView(onGpu);
          else if (onGpu)   { paintBoundaryOnTop(); paintOrbit(); }
          else                paintAll();
        } catch (e) {
          console.warn('[schwarz export] overlay re-render failed:', e);
        } finally {
          setOverlayCapture(null);
        }
        outCtx.drawImage(ov, 0, 0);
      }

      // --- 3) Restore the display-size render ---
      if (onGpu && glCanvas) {
        try {
          sState.gpu.render(view, {
            maxIter:   sState.grid.maxIter,
            scaleMode: sState.grid.scaleMode,
            modK:      sState.grid.modK,
            viewMode:  inZ ? 'z' : 'w',
          });
        } catch (_) { /* the next interaction re-renders anyway */ }
      }
    }

    // --- 4) Download, and say what the file actually contains ---
    const detail = planned.detail, clampNote = planned.clampNote;
    say('Exporting ' + outW + '\u00d7' + outH + ' \u2014 ' + detail.detail + '.' + clampNote);

    out.toBlob((blob) => {
      if (!blob) { say('Export failed: the browser declined a ' + outW + '\u00d7' + outH + ' PNG.', false); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFileName({ view: sState.viewMode, outW, outH });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      say('Saved ' + outW + '\u00d7' + outH + ' \u2014 ' + detail.detail + '.' + clampNote);
    }, 'image/png');
  }

  // F4: ψ-pullback of the current w-orbit. Each w in sState.orbit is run
  // through sw.psi to get the corresponding z in 𝔻 (or 𝔻*); used to render
  // the z-history in the z-disk view (paintZOverlays).
  function _recomputeZPanelOrbit() {
    if (!sState.schwarz || !sState.orbit || sState.orbit.length === 0) {
      sState.zPanelOrbit = null;
      return;
    }
    const out = [];
    for (const w of sState.orbit) {
      let z;
      try { z = sState.schwarz.psi(w); } catch (_) { z = null; }
      if (z && isFinite(z.re) && isFinite(z.im)) out.push(z);
      else out.push(null);
    }
    sState.zPanelOrbit = out;
  }

  function _computeSweep() {
    if (!sState.schwarz) return;
    const N     = +(document.getElementById('schwarz-sweep-n').value     || 16);
    const depth = +(document.getElementById('schwarz-sweep-depth').value || 12);
    // Default sweep: horizontal line across the boundary bbox at y = centroid.
    const bdy = sState.schwarz._boundaryPts || [];
    let minRe = -1, maxRe = 1, cy = 0;
    if (bdy.length > 0) {
      minRe = Infinity; maxRe = -Infinity;
      let cyAcc = 0;
      for (const p of bdy) {
        if (p.re < minRe) minRe = p.re;
        if (p.re > maxRe) maxRe = p.re;
        cyAcc += p.im;
      }
      cy = cyAcc / bdy.length;
      const dx = maxRe - minRe;
      minRe += 0.1 * dx; maxRe -= 0.1 * dx;
    }
    const seeds = QD.Schwarz.sampleSweepSeeds('line',
      { from: { re: minRe, im: cy }, to: { re: maxRe, im: cy }, n: N });
    const out = [];
    for (const seed of seeds) {
      if (!sState.schwarz.isInOmega(seed)) { out.push([]); continue; }
      const orb = QD.Schwarz.makeOrbit(seed, sState.schwarz, { maxIter: depth });
      out.push(orb);
    }
    sState.sweepOrbits = out;
    paintBoundaryOnTop();
  }

  // Compute level curves on the current viewport. Triggered on toggle-on
  // and on pan/zoom (so contours follow the view).
  function _recomputeLevelCurves() {
    if (!sState.schwarz) { sState.levelCurves = null; return; }
    const v = sState.view;
    const viewport = {
      reMin: v.cx - (v.cssW / 2) / v.scale,
      reMax: v.cx + (v.cssW / 2) / v.scale,
      imMin: v.cy - (v.cssH / 2) / v.scale,
      imMax: v.cy + (v.cssH / 2) / v.scale,
    };
    try {
      sState.levelCurves = QD.Schwarz.computeSigmaLevelCurves(sState.schwarz,
        { gridSize: 96, viewport });
    } catch (_) { sState.levelCurves = null; }
  }

    return {
      _recomputeDomainColoring, _rebuildPreimageTreeIfActive,
      _refreshPreimageTreeStats, _computeLimitSet, _clearLimitSet,
      _recomputeCriticalOrbits, _findCycles, _exportPng, _refreshExportPreview,
      _recomputeZPanelOrbit, _computeSweep, _recomputeLevelCurves,
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
