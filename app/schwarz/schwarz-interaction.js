// =============================================================================
// schwarz-interaction.js -- Canvas interaction for the Schwarz tab.
//
// Extracted from schwarz-ui.js by the Phase-3 UI modularization (item E).
// Exposes QD_UI.installSchwarzInteraction(sCtx); schwarz-ui.js captures the
// public handlers (attachCanvasHandlers + the click/dblclick/mousemove/hover/
// pin handlers the test hook drives) into IIFE-local bindings, so all call
// sites are unchanged. CLICK_DELAY (the single-click pin debounce) lives here;
// the test hook reads/writes it via the returned getClickDelay/setClickDelay.
//
// Pan/zoom, the hover σ-orbit preview, single-click pin (deferred), double-click
// preimage-tree seed (tiling-set gated), and the shift-drag curve gesture. Bodies
// are VERBATIM moves. Deps via sCtx: sState, canvas/geometry helpers (getCanvas /
// getCtx / pixelToWorld / worldToPixel / syncCanvasSize), the renderers
// (renderImmediate / requestRecompute), the paint fns, the per-feature recompute
// hooks, gateMaxIter, and the KIND_* constants. `QD` is the solver global.
// =============================================================================

(function (global) {
  'use strict';
  global.QD_UI = global.QD_UI || {};

  global.QD_UI.installSchwarzInteraction = function installSchwarzInteraction(s) {
    const sState                  = s.sState;
    const getCanvas               = s.getCanvas;
    const getCtx                  = s.getCtx;
    const pixelToWorld            = s.pixelToWorld;
    const worldToPixel            = s.worldToPixel;
    const syncCanvasSize          = s.syncCanvasSize;
    const activeRenderer          = s.activeRenderer;
    const renderImmediate         = s.renderImmediate;
    const requestRecompute        = s.requestRecompute;
    const paintBoundaryOnTop      = s.paintBoundaryOnTop;
    const paintOrbit              = s.paintOrbit;
    const paintAll                = s.paintAll;
    const paintPreimageTree       = s.paintPreimageTree;
    const gateMaxIter             = s.gateMaxIter;
    const _recomputeLevelCurves   = s._recomputeLevelCurves;
    const _recomputeDomainColoring = s._recomputeDomainColoring;
    const _recomputeZPanelOrbit   = s._recomputeZPanelOrbit;
    const _refreshPreimageTreeStats = s._refreshPreimageTreeStats;
    const KIND_FUND               = s.KIND_FUND;
    const KIND_ESC                = s.KIND_ESC;
    const KIND_INT                = s.KIND_INT;
    const KIND_INV                = s.KIND_INV;
    const KIND_OUTSIDE            = s.KIND_OUTSIDE;

    // Interaction tuning. CLICK_DELAY defers the single-click orbit-pin long
    // enough that a double-click (tree seed) can cancel it. Mutable for tests
    // (exposed via getClickDelay/setClickDelay).
    let CLICK_DELAY = 250;                  // ms; single-click -> pin debounce
  let dragging = false, dragMoved = false, lastX = 0, lastY = 0;
  function attachCanvasHandlers() {
    const c = getCanvas();
    if (!c) return;
    c.addEventListener('mousemove', onMouseMove);
    c.addEventListener('mouseleave', () => {
      const r = document.getElementById('schwarz-readout');
      if (r) r.textContent = '—';
      // Drop the transient hover orbit when the cursor leaves the canvas.
      if (sState._hoverRaf != null) { cancelAnimationFrame(sState._hoverRaf); sState._hoverRaf = null; }
      if (sState.hoverOrbit) { sState.hoverOrbit = null; paintBoundaryOnTop(); }
    });
    // Fractal-mode interaction (plane view):
    //   • single click → pin the forward σ-orbit (deferred so a double-click
    //     can cancel it — see onCanvasClick / CLICK_DELAY);
    //   • double click → seed a preimage tree (onCanvasDblClick);
    //   • click-and-drag → pan (dragMoved suppresses the click).
    c.addEventListener('click', onCanvasClick);
    c.addEventListener('dblclick', onCanvasDblClick);
    c.addEventListener('wheel', onWheel, { passive: false });
    c.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      // S5 / E11: shift-drag draws a curve in Ω for forward-image rendering.
      if (e.shiftKey && sState.schwarz) {
        sState.isDrawingCurve = true;
        sState.curveImageDraft = [];
        const rect = c.getBoundingClientRect();
        const w = pixelToWorld(e.clientX - rect.left, e.clientY - rect.top);
        if (sState.schwarz.isInOmega(w)) sState.curveImageDraft.push(w);
        c.style.cursor = 'crosshair';
        return;
      }
      dragging = true; dragMoved = false;
      lastX = e.clientX; lastY = e.clientY;
      c.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
      if (sState.isDrawingCurve && isSchwarzActive()) {
        const rect = c.getBoundingClientRect();
        const w = pixelToWorld(e.clientX - rect.left, e.clientY - rect.top);
        if (sState.schwarz && sState.schwarz.isInOmega(w)) {
          // Add point only if it's noticeably distinct from the last (≥ 3 px).
          const last = sState.curveImageDraft[sState.curveImageDraft.length - 1];
          if (!last) sState.curveImageDraft.push(w);
          else {
            const lp = worldToPixel(last.re, last.im);
            const np = worldToPixel(w.re, w.im);
            if (Math.hypot(np.x - lp.x, np.y - lp.y) > 3) sState.curveImageDraft.push(w);
          }
          paintBoundaryOnTop();
        }
        return;
      }
      if (!dragging || !isSchwarzActive()) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (dx !== 0 || dy !== 0) dragMoved = true;
      lastX = e.clientX; lastY = e.clientY;
      sState.view.cx -= dx / sState.view.scale;
      sState.view.cy += dy / sState.view.scale;          // screen y is flipped
      // GPU is fast enough (10-30 ms typical) to render every mousemove
      // without debounce. CPU mode debounces because the pyramid is slow.
      if (activeRenderer() === 'gpu') renderImmediate();
      else { clearOverlay(); requestRecompute(); }
    });
    window.addEventListener('mouseup', () => {
      if (sState.isDrawingCurve) {
        sState.isDrawingCurve = false;
        c.style.cursor = '';
        const draft = sState.curveImageDraft || [];
        if (draft.length >= 2 && sState.schwarz) {
          sState.curveImage = QD.Schwarz.iterateCurveForward(
            draft, sState.schwarz, sState.curveImageDepth);
        } else {
          sState.curveImage = null;
        }
        sState.curveImageDraft = null;
        paintBoundaryOnTop();
        return;
      }
      if (!dragging) return;
      dragging = false;
      c.style.cursor = '';
      // After a real drag (mouse moved), trigger a fresh render so the
      // final position is sharp even in CPU mode.
      if (dragMoved && activeRenderer() !== 'gpu') requestRecompute();
      // S4 / F12: re-compute level curves to the new viewport. Expensive
      // (~10k σ-evals); only do this on mouseup, not on every move event.
      if (dragMoved && sState.showLevelCurves) {
        _recomputeLevelCurves();
        paintBoundaryOnTop();
      }
      // S5 / F6: same for domain-coloring mode — re-render to new viewport.
      if (dragMoved && sState.mode === 'domain-coloring') {
        _recomputeDomainColoring();
        paintAll();
      }
    });
  }


  function clearOverlay() {
    const ctx = getCtx(); if (!ctx) return;
    syncCanvasSize();
    ctx.clearRect(0, 0, sState.view.cssW, sState.view.cssH);
  }
  function isSchwarzActive() {
    const panel = document.getElementById('controls-schwarz');
    return panel && !panel.hidden;
  }
  function onWheel(e) {
    if (!isSchwarzActive() || !sState.schwarz) return;
    e.preventDefault();
    const c = getCanvas();
    const rect = c.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w = pixelToWorld(sx, sy);
    const k = (e.deltaY > 0) ? 0.85 : 1.18;
    sState.view.scale *= k;
    // Keep the world point under the cursor pinned in screen space.
    const after = pixelToWorld(sx, sy);
    sState.view.cx += w.re - after.re;
    sState.view.cy += w.im - after.im;
    if (activeRenderer() === 'gpu') renderImmediate();
    else { clearOverlay(); requestRecompute(); }
  }
  function onMouseMove(e) {
    if (!isSchwarzActive() || !sState.schwarz) return;
    const c = getCanvas();
    const rect = c.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w = pixelToWorld(sx, sy);
    let info = `w = (${w.re.toFixed(3)}, ${w.im.toFixed(3)})`;
    if (sState.field && sState.fieldW > 0) {
      const gx = Math.floor(sx / sState.view.cssW  * sState.fieldW);
      const gy = Math.floor(sy / sState.view.cssH  * sState.fieldH);
      if (gx >= 0 && gx < sState.fieldW && gy >= 0 && gy < sState.fieldH) {
        const idx = gy * sState.fieldW + gx;
        const n = sState.field[idx];
        const kind = sState.fieldKind ? sState.fieldKind[idx] : KIND_OUTSIDE;
        info += '  ' + describeKind(kind, n);
      }
    } else if (activeRenderer() === 'gpu' && QD.Schwarz && QD.Schwarz.escapeTime) {
      // GPU-mode parity (HANDOFF #33): the field array isn't populated in
      // GPU mode, so do an ad-hoc per-cursor CPU iteration. Cheap — at most
      // `maxIter` σ-evals (μs scale on typical scenarios).
      try {
        const et = QD.Schwarz.escapeTime(w, sState.schwarz, { maxIter: sState.grid.maxIter });
        // escapeTime returns kind as a string; map to the KIND_* enum
        // used by describeKind. Note: a pixel that was already outside Ω
        // returns kind='fundamental' n=0 — display it as KIND_OUTSIDE.
        const kindMap = { fundamental: KIND_FUND, escaped: KIND_ESC,
                          interior: KIND_INT, invalid: KIND_INV };
        let kindI = (et && kindMap[et.kind] != null) ? kindMap[et.kind] : KIND_OUTSIDE;
        if (kindI === KIND_FUND && (et.n | 0) === 0) kindI = KIND_OUTSIDE;
        info += '  ' + describeKind(kindI, et ? (et.n | 0) : 0);
      } catch (err) { /* swallow; coordinate readout still shown */ }
    }
    const r = document.getElementById('schwarz-readout');
    if (r) r.textContent = info;

    // Live forward-orbit preview on hover (fractal/plane only, when enabled
    // and not mid-pan / mid-curve-draw). σ is defined on Ω, so only points
    // inside Ω get an orbit; outside Ω we clear any stale hover orbit.
    if (sState.viewMode === 'plane' && sState.mode === 'fractal' &&
        sState.hoverOrbitEnabled && !dragging && !sState.isDrawingCurve) {
      if (sState.schwarz.isInOmega(w)) {
        sState._pendingHoverW = w;
        if (sState._hoverRaf == null) sState._hoverRaf = requestAnimationFrame(runHoverOrbit);
      } else if (sState.hoverOrbit) {
        sState.hoverOrbit = null;
        paintBoundaryOnTop();
      }
    }
  }
  // rAF-coalesced hover-orbit recompute: at most one makeOrbit per frame, no
  // matter how fast the cursor moves. Uses the small display maxIter (cheap
  // forward σ-iteration), not the generous seed-gate cap.
  function runHoverOrbit() {
    sState._hoverRaf = null;
    if (!isSchwarzActive() || !sState.schwarz) return;
    if (sState.viewMode !== 'plane' || sState.mode !== 'fractal' || !sState.hoverOrbitEnabled) return;
    const w = sState._pendingHoverW;
    if (!w || !sState.schwarz.isInOmega(w)) { sState.hoverOrbit = null; paintBoundaryOnTop(); return; }
    try {
      sState.hoverOrbit = QD.Schwarz.makeOrbit(w, sState.schwarz, { maxIter: sState.grid.maxIter });
    } catch (_) { sState.hoverOrbit = null; }
    paintBoundaryOnTop();
  }
  function describeKind(kind, n) {
    switch (kind) {
      case KIND_FUND:    return 'escape time n=' + n;
      case KIND_ESC:     return 'in escaping set';
      case KIND_INT:     return 'still in Ω after maxIter (tiling-set interior)';
      case KIND_INV:     return 'Newton diverged';
      case KIND_OUTSIDE: return 'in Ω^c (fundamental tile)';
      default:           return '';
    }
  }
  // Shared guard for the click / double-click handlers: fractal plane view,
  // not a drag-release, not a shift-drag curve gesture. Returns the world
  // point on success, or null if the event should be ignored.
  function _interactionPoint(e) {
    if (!isSchwarzActive() || !sState.schwarz) return null;
    if (sState.viewMode !== 'plane' || sState.mode !== 'fractal') return null;
    if (dragMoved) return null;   // a pan just ended — not a click
    if (e.shiftKey) return null;  // reserved for the E11 curve-draw gesture
    const c = getCanvas();
    const rect = c.getBoundingClientRect();
    return pixelToWorld(e.clientX - rect.left, e.clientY - rect.top);
  }

  // Double-click → seed a preimage tree at the clicked point. Restricted to
  // the tiling set: a point qualifies iff its forward σ-orbit escapes Ω into
  // the fundamental tile in finitely many steps (escapeTime kind
  // 'fundamental', which also covers Ω^c at n=0). Points in the limit set
  // ('interior' / non-escaping), the escaping set, or where σ is invalid are
  // ignored. Seeds exactly at the click (no fold-back to the fundamental tile).
  function onCanvasDblClick(e) {
    // Cancel the pending single-click pin so a double-click never also pins.
    if (sState._clickTimer != null) { clearTimeout(sState._clickTimer); sState._clickTimer = null; }
    const w = _interactionPoint(e);
    if (!w) return;
    let et;
    try { et = QD.Schwarz.escapeTime(w, sState.schwarz, { maxIter: gateMaxIter() }); }
    catch (_) { return; }                       // σ/ψ blew up — not seedable
    if (!et || et.kind !== 'fundamental') return; // outside the tiling set
    sState.preimageTree = QD.Schwarz.buildPreimageTree(w, sState.schwarz, {
      depth:        sState.preimageDepth,
      visualBudget: sState.preimageBudget,
    });
    paintBoundaryOnTop();
    paintPreimageTree();
    _refreshPreimageTreeStats();
  }

  // Single-click → pin the forward σ-orbit at the clicked point. Deferred by
  // CLICK_DELAY so a double-click (tree seed) can cancel it via the dblclick
  // handler above. Clicking outside Ω clears the pin.
  function onCanvasClick(e) {
    const w = _interactionPoint(e);
    if (!w) return;
    if (sState._clickTimer != null) clearTimeout(sState._clickTimer);
    sState._clickTimer = setTimeout(() => { sState._clickTimer = null; pinOrbitAt(w); }, CLICK_DELAY);
  }

  // Commit the pinned forward orbit at world point w (inside Ω → its σ-orbit;
  // outside Ω → clear the pin). Kept in sync with sState.orbit so downstream
  // consumers (z-panel, sphere, sweep, PNG export) see the pinned orbit.
  function pinOrbitAt(w) {
    if (!isSchwarzActive() || !sState.schwarz) return;
    sState.pinnedOrbit = sState.schwarz.isInOmega(w)
      ? QD.Schwarz.makeOrbit(w, sState.schwarz, { maxIter: sState.grid.maxIter })
      : [];
    sState.orbit = sState.pinnedOrbit;
    // S6 / F4: also refresh the z-pullback for the z-panel inset.
    if (sState.showZPanel) _recomputeZPanelOrbit();
    // Just redraw the overlay; the GPU fractal layer doesn't need re-render.
    if (activeRenderer() === 'gpu') { paintBoundaryOnTop(); paintOrbit(); }
    else paintAll();
  }



    return {
      attachCanvasHandlers, onCanvasClick, onCanvasDblClick, onMouseMove,
      runHoverOrbit, pinOrbitAt,
      getClickDelay: () => CLICK_DELAY,
      setClickDelay: (v) => { CLICK_DELAY = v; },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
