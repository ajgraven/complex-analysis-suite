// =============================================================================
// schwarz-ui.js -- Sidebar + canvas overlay for the "Schwarz dynamics" tab.
//
// On first tab activation, mounts a sidebar with:
//   • Source-of-φ card     (mirrors the Inverse tab's last successful solve)
//   • Render controls      (resolution / maxIter / colormap / scale / renderer)
//   • Click & hover info
//
// Two renderer paths share a dispatcher (activeRenderer()):
//   • GPU (default): WebGL 2 fragment shader from schwarz-webgl.js. One full
//     frame in 10-30 ms typical. Drag/zoom calls renderImmediate() per
//     mousemove for true interactive panning.
//   • CPU (fallback): progressive 4×4 → 2×2 → 1×1 pyramid. Preferred path is
//     the dedicated QD.SchwarzCpuWorker (A7), which computes the whole pyramid
//     off the main thread and streams one field snapshot per pass; when no
//     Worker is available (file:// / clone failure) it runs in-process,
//     chunked across requestAnimationFrame ticks (~14 ms per slice) so the UI
//     stays responsive (_renderCpuPyramid). Per-pixel warm seeds from the left
//     neighbor in raster order → Newton converges in 1-3 iterations on average.
//
// Layer stacking: the GPU canvas (#schwarz-gl-canvas) is inserted behind the
// main #canvas. The 2D canvas keeps its in-flow layout but gets z-index 1 +
// position:relative so it can host transparent overlays (boundary + orbit)
// on top of the GPU pixels. The GL layer hides on tab-out.
//
// Fractal-mode canvas interaction (plane view):
//   • hover        → live forward σ-orbit preview {w₀, σ(w₀), …} (toggleable;
//                    rAF-coalesced; only inside Ω where σ is defined)
//   • single click → PIN that orbit (deferred by CLICK_DELAY so a double-click
//                    can cancel it; dragMoved guard suppresses pins after pans)
//   • double click → seed a preimage tree at the click, gated to the tiling
//                    set (escapeTime kind 'fundamental'); drawn over the fractal
// The preimage tree is a fractal-mode overlay, not a separate mode.
//
// Hover readout: pixel coords + escape time (CPU mode keeps a per-pixel field;
// GPU mode does an ad-hoc per-cursor escapeTime — see onMouseMove).
// =============================================================================

(function () {
  'use strict';
  if (typeof QD === 'undefined') return;

  const sState = {
    schwarz: null,            // built QD.Schwarz handle
    phiSnapshot: null,        // captured phi (with shape info for label)
    hDataSnapshot: null,
    boundarySnapshot: null,
    mounted: false,

    view: {
      // world ↔ pixel transform, centered on Ω
      cx: 0, cy: 0, scale: 200,           // px per unit
      cssW: 600, cssH: 600,
    },

    grid: {
      resolution: 384,                     // active sample count along the canvas's shorter side
      maxIter: 24,
      colormap: 'magma',
      scaleMode: 'smooth',                 // 'smooth' | 'discrete' | 'log' | 'sqrt' | 'modulo'
      modK: 8,                             // modulo period (modulo mode only)
      renderer: 'auto',                    // 'auto' | 'gpu' | 'cpu'
    },

    // GPU renderer handle (null until first capture or if WebGL 2 missing).
    gpu:    null,
    gpuMsg: '',

    // Computed escape-time field for the current view.
    field: null,                           // Int16Array; length = gridW*gridH
    fieldW: 0, fieldH: 0,
    fieldKind: null,                       // Uint8Array of escape kinds (0=fund, 1=esc, 2=int, 3=invalid)
    rendering: false,
    renderToken: 0,

    // Forward σ-orbit overlay. `orbit` is the AUTHORITATIVE pinned orbit
    // (kept in sync with pinnedOrbit) because downstream consumers — the
    // z-panel (_recomputeZPanelOrbit), sphere view, sweep, and PNG export —
    // all read sState.orbit. The transient hover orbit lives separately in
    // hoverOrbit and must NOT be assigned to `orbit` (so the z-panel etc.
    // don't flicker as the cursor moves).
    orbit:            [],                  // pinned forward-orbit polyline (= pinnedOrbit)
    pinnedOrbit:      [],                  // single-click-pinned orbit
    hoverOrbit:       null,                // transient hover-preview orbit (null = none)
    hoverOrbitEnabled: true,               // "Live orbit on hover" toggle (default ON)
    _hoverRaf:        null,                // rAF id coalescing hover-orbit recompute
    _pendingHoverW:   null,                // latest hovered world point awaiting the rAF
    _clickTimer:      null,                // deferred single-click pin (cancelled by dblclick)

    // View toggle (HANDOFF #29): 'plane' = Schwarz dynamics on the w-plane
    // (the original Schwarz tab), 'sphere' = same iteration textured onto a
    // Riemann sphere. The sphere renderer is lazy-mounted via QD.SphereView
    // on first switch to sphere mode.
    viewMode:   'plane',                   // 'plane' | 'sphere'
    sphereView: null,                      // QD.SphereView handle

    // Render mode. The preimage tree is no longer its own mode — it is a
    // fractal-mode OVERLAY drawn on top of the GL fractal, seeded by
    // double-clicking anywhere in the tiling set (TODO #16). Plane-view only.
    mode:           'fractal',             // 'fractal' | 'domain-coloring'
    preimageTree:   null,                  // last-built tree (S1; fractal-mode overlay)
    preimageDepth:  4,                     // current depth setting
    preimageBudget: 4096,                  // current visual budget

    // Limit-set overlay (S3). Chaos game over σ⁻¹; rendered as a point
    // cloud on the 2D canvas overlay. dim_H estimate displayed in the
    // sidebar. Sized small by default to keep compute time < 1s.
    limitSet:       null,                  // Float64Array of [re,im,...] points
    limitSetDim:    null,                  // last-computed dim_H estimate
    limitSetN:      5000,

    // S4 Analysis overlays.
    showSingularities: false,              // F3: σ-poles + branch points on canvas
    sigmaSingularities: null,              // cached { poles, branchPoints }
    showLevelCurves:   false,              // F12: |σ| solid + arg(σ) dashed contours
    levelCurves:       null,               // cached { abs, arg } contour lists
    sigmaForm:         null,               // E13: { family, phiText, fText, sigmaText, ... }

    // S5 Forward-dynamics state.
    showCriticalOrbits: false,             // H7: σ-orbits of canonical points
    criticalOrbits:     null,              // cached [{ label, orbit: [{re,im}, …] }, …]

    // E11: user-drawn curve forward-image. shift-drag on canvas to draw.
    curveImageDraft:    null,              // [{re,im}, …] being drawn live
    curveImage:         null,              // [[{re,im},…], [{re,im},…], …] σ⁰…σᵏ
    curveImageDepth:    4,
    isDrawingCurve:     false,             // true while shift-drag is active

    // E10: cycles (period-n).
    cycles:             null,              // [{period, points}, …]
    cyclePeriodMax:     2,

    // H8: orbit-family sweep — pre-baked horizontal line through Ω center.
    sweepOrbits:        null,              // [[{re,im}, …], …]
    sweepN:             16,
    sweepDepth:         12,

    // Domain-coloring (F6) backing field. When mode='domain-coloring', this
    // overlays the GPU/CPU fractal. Cached per φ-viewport.
    domainColor:        null,              // { buf, W, H, viewport }

    // S6 / F4: z-panel inset showing 𝔻 (or 𝔻*) + the z-pullback of the
    // current w-orbit. Toggle via the Forward card.
    showZPanel:         false,
    zPanelOrbit:        null,              // [{re, im}, ...] z-history of sState.orbit
  };

  // Kinds enum
  const KIND_FUND = 0, KIND_ESC = 1, KIND_INT = 2, KIND_INV = 3, KIND_OUTSIDE = 4;

  // Interaction tuning. CLICK_DELAY defers the single-click orbit-pin long
  // enough for a double-click (which seeds the preimage tree) to cancel it;
  // the dblclick handler clears the pending timer. Exposed via the test hook.
  let CLICK_DELAY = 250;                  // ms; single-click → pin debounce
  // The preimage-tree seed gate runs escapeTime with a generous iteration cap
  // so genuinely-fundamental (tiling-set) points that escape slowly aren't
  // mis-classified as non-escaping `interior`. Display/hover use the smaller
  // grid.maxIter — this larger cap is for the accept/reject decision only.
  function gateMaxIter() { return Math.max(256, (sState.grid.maxIter | 0) * 4); }

  // ---------------------------------------------------------------------------
  // Lazy mount
  // ---------------------------------------------------------------------------
  document.addEventListener('tab-changed', function (e) {
    if (!e.detail || e.detail.tab !== 'schwarz') {
      // Leaving the Schwarz tab — don't keep rendering, and hide BOTH GL
      // layers so they can't show through under another tab's drawing.
      sState.renderToken++;
      showGLLayer(false);
      // Cancel any pending interaction timers/frames so they can't fire
      // (and repaint into another tab) after we've left.
      if (sState._hoverRaf != null) { cancelAnimationFrame(sState._hoverRaf); sState._hoverRaf = null; }
      if (sState._clickTimer != null) { clearTimeout(sState._clickTimer); sState._clickTimer = null; }
      sState.hoverOrbit = null;
      // HANDOFF #34: also wipe our pixels from the shared 2D canvas so the
      // CPU-pyramid pixmap and orbit-polyline overlay don't briefly bleed
      // through into whichever tab takes over. The receiving tab's
      // tab-changed handler is responsible for repainting its own
      // background / axes (the QD tab now does this via plot.resize()).
      const ctx = getCtx();
      if (ctx) ctx.clearRect(0, 0, sState.view.cssW, sState.view.cssH);
      if (sState.sphereView) sState.sphereView.deactivate();
      return;
    }
    if (!sState.mounted) { mountSchwarzSidebar(); sState.mounted = true; }
    refreshSourceStatus();
    if (sState.viewMode === 'plane') {
      if (sState.sphereView) sState.sphereView.deactivate();
      if (sState.schwarz) {
        showGLLayer(activeRenderer() === 'gpu');
        requestRecompute();
      } else {
        showGLLayer(false);
        clearCanvas();
      }
    } else {
      // sphere mode: hide the Schwarz GL layer, activate sphere view.
      showGLLayer(false);
      _activateSphereView();
    }
  });

  function mountSchwarzSidebar() {
    const root = document.getElementById('controls-schwarz');
    if (!root) return;
    root.innerHTML = '';
    root.appendChild(makeViewToggleCard());
    root.appendChild(makeModeCard());
    root.appendChild(makeLimitSetCard());
    root.appendChild(makeAnalysisCard());
    root.appendChild(makeForwardCard());
    root.appendChild(makeSourceCard());
    root.appendChild(makeRenderCard());
    root.appendChild(makeInfoCard());
    // Mount-time placeholder for SphereView's display + camera cards. The
    // cards are lazily appended into this container when the user first
    // toggles to sphere mode (via _activateSphereView → QD.SphereView.mount).
    const sphereSlot = document.createElement('div');
    sphereSlot.id = 'schwarz-sphere-slot';
    root.appendChild(sphereSlot);
    attachCanvasHandlers();
    _applyViewModeVisibility();
    attachSchwarzHelp();      // HANDOFF #33
  }

  function attachSchwarzHelp() {
    if (!window.QD || !window.QD.QoL || !window.QD.QoL.attachHelp) return;
    const H = window.QD.QoL.attachHelp;
    const root = document.getElementById('controls-schwarz');
    if (!root) return;
    // The view-toggle card has no h2; the others do.
    const headers = root.querySelectorAll('section.card h2');
    if (headers[0]) H(headers[0],
      `<b>Source φ.</b> The Schwarz dynamics tab iterates σ(w) = φ(1/φ⁻¹(w)),
       the Schwarz reflection associated with Ω. Capture a φ from the QD tab
       (after solving). Each pixel is colored by escape time of σ-iteration.`);
    if (headers[1]) H(headers[1],
      `<b>Render.</b> The CPU fallback draws a progressive 4×4→2×2→1×1 pyramid,
       computed in a background Web Worker when available (falling back to an
       in-page, animation-frame-sliced render) so the page stays responsive
       while it refines; GPU uses a WebGL 2 fragment shader for instant frames.
       <i>Colormap</i> + <i>scaleMode</i> change the escape-time → colour
       mapping; <i>maxIter</i> caps the σ-iteration before declaring a pixel
       interior; <i>mod k</i> emphasises orbit-period structure.`);
    if (headers[2]) H(headers[2],
      `<b>Click & hover.</b> Click pixels to trace and overlay individual σ
       orbits. Hover to read the w-plane coordinate + escape time (and, in
       CPU mode, the pixel kind). In plane view, drag to pan, scroll to zoom.`);
  }

  function makeViewToggleCard() {
    const card = document.createElement('section');
    card.className = 'card';
    card.innerHTML = `
      <div class="segmented" role="tablist" aria-label="View mode">
        <button class="seg-btn active" data-view="plane" type="button">plane</button>
        <button class="seg-btn"        data-view="sphere" type="button">sphere</button>
      </div>
    `;
    setTimeout(() => {
      card.querySelectorAll('.seg-btn').forEach(btn => {
        btn.addEventListener('click', () => setViewMode(btn.dataset.view));
      });
    }, 0);
    return card;
  }

  // ---------------------------------------------------------------------------
  // Mode card: fractal vs domain-coloring. Plane-view only. The preimage tree
  // is a fractal-mode overlay (seeded by double-click), not its own mode —
  // its depth/budget controls live in the fractal-mode options block below.
  // ---------------------------------------------------------------------------
  function makeModeCard() {
    const card = document.createElement('section');
    card.className = 'card view-plane-only';
    card.id = 'schwarz-mode-card';
    card.innerHTML = `
      <h2>Mode</h2>
      <div class="segmented" role="tablist" aria-label="Schwarz mode">
        <button class="seg-btn active" data-mode="fractal"        type="button">fractal</button>
        <button class="seg-btn"        data-mode="domain-coloring" type="button">domain color</button>
      </div>
      <div id="schwarz-mode-options-fractal" style="margin-top:8px;">
        <div style="font-size:12px; color:#555; margin-bottom:6px;">
          <b>Double-click</b> in the tiling set to seed a preimage tree (each
          generation applies σ⁻¹). <b>Single-click</b> pins the forward orbit;
          hover previews it.
        </div>
        <label style="display:block; font-size:12px; margin:4px 0;">
          <input type="checkbox" id="schwarz-hover-orbit" checked
                 style="vertical-align:middle; margin-right:4px;">
          Live orbit on hover
        </label>
        <label style="display:block; font-size:12px; margin:4px 0;">
          Tree depth:
          <input type="range" min="1" max="8" value="4" id="schwarz-preimage-depth"
                 style="vertical-align:middle; margin-left:6px; width:120px;">
          <span id="schwarz-preimage-depth-val" style="font-family:monospace;">4</span>
        </label>
        <label style="display:block; font-size:12px; margin:4px 0;">
          Visual budget:
          <select id="schwarz-preimage-budget" style="font-size:12px;">
            <option value="1024">1024</option>
            <option value="4096" selected>4096</option>
            <option value="16384">16384</option>
          </select>
          <span id="schwarz-preimage-count" style="font-family:monospace; margin-left:8px; color:#777;"></span>
        </label>
      </div>
    `;
    setTimeout(() => {
      card.querySelectorAll('.seg-btn').forEach(btn => {
        btn.addEventListener('click', () => setMode(btn.dataset.mode));
      });
      const hover = card.querySelector('#schwarz-hover-orbit');
      if (hover) {
        hover.addEventListener('change', () => {
          sState.hoverOrbitEnabled = hover.checked;
          if (!hover.checked) {
            // Turning the preview off — drop any live hover orbit immediately.
            if (sState._hoverRaf != null) { cancelAnimationFrame(sState._hoverRaf); sState._hoverRaf = null; }
            sState.hoverOrbit = null;
            paintBoundaryOnTop();
          }
        });
      }
      const depthSlider = card.querySelector('#schwarz-preimage-depth');
      const depthVal    = card.querySelector('#schwarz-preimage-depth-val');
      if (depthSlider) {
        depthSlider.addEventListener('input', () => {
          sState.preimageDepth = +depthSlider.value;
          if (depthVal) depthVal.textContent = String(sState.preimageDepth);
          _rebuildPreimageTreeIfActive();
        });
      }
      const budget = card.querySelector('#schwarz-preimage-budget');
      if (budget) {
        budget.addEventListener('change', () => {
          sState.preimageBudget = +budget.value;
          _rebuildPreimageTreeIfActive();
        });
      }
    }, 0);
    return card;
  }

  function setMode(mode) {
    if (mode !== 'fractal' && mode !== 'domain-coloring') return;
    if (mode === sState.mode) return;
    sState.mode = mode;
    document.querySelectorAll('#schwarz-mode-card .seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    const opts = document.getElementById('schwarz-mode-options-fractal');
    if (opts) opts.style.display = (mode === 'fractal') ? '' : 'none';
    // All overlays (tree + orbits) are fractal-mode-only; clear them on any
    // mode transition so they don't bleed into domain-coloring or linger when
    // we re-enter fractal mode.
    sState.preimageTree = null;
    sState.orbit = []; sState.pinnedOrbit = []; sState.hoverOrbit = null;
    if (mode === 'domain-coloring') {
      // S5 / F6: render σ-domain-coloring into the 2D canvas; hide GL.
      showGLLayer(false);
      _recomputeDomainColoring();
      paintAll();
    } else {
      sState.domainColor = null;
      if (sState.schwarz) {
        showGLLayer(activeRenderer() === 'gpu');
        requestRecompute();
      }
    }
  }

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
    paintBoundaryOnTop();
    paintPreimageTree();
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

  // ---------------------------------------------------------------------------
  // Limit-set card (S3): chaos-game point cloud + dim_H readout.
  // Visible in plane view (it's an overlay on the fractal). Hidden in
  // sphere view via the view-plane-only class.
  // ---------------------------------------------------------------------------
  function makeLimitSetCard() {
    const card = document.createElement('section');
    card.className = 'card view-plane-only';
    card.id = 'schwarz-limit-set-card';
    card.innerHTML = `
      <h2>Limit set</h2>
      <div style="font-size:12px; color:#555; margin-bottom:6px;">
        Random walk through σ⁻¹ approximates the limit set (∂ tiling set).
      </div>
      <label style="display:block; font-size:12px; margin:4px 0;">
        Sample size:
        <select id="schwarz-ls-n">
          <option value="1000">1k</option>
          <option value="5000" selected>5k</option>
          <option value="20000">20k</option>
          <option value="100000">100k</option>
        </select>
      </label>
      <button type="button" id="schwarz-ls-compute"
              style="margin-top:4px; font-size:12px;">Compute limit set</button>
      <button type="button" id="schwarz-ls-clear"
              style="margin-top:4px; font-size:12px;">Clear</button>
      <div id="schwarz-ls-status" style="font-size:12px; margin-top:6px; color:#555;"></div>
      <div id="schwarz-ls-dim" style="font-size:12px; margin-top:4px; font-family:monospace;"></div>
    `;
    setTimeout(() => {
      const nSel = card.querySelector('#schwarz-ls-n');
      nSel.addEventListener('change', () => { sState.limitSetN = +nSel.value; });
      card.querySelector('#schwarz-ls-compute').addEventListener('click', _computeLimitSet);
      card.querySelector('#schwarz-ls-clear').addEventListener('click', _clearLimitSet);
    }, 0);
    return card;
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
      paintBoundaryOnTop();
      paintLimitSet();
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

  // ---------------------------------------------------------------------------
  // S4: Analysis card — explicit σ form (E13), singularities (F3), level
  // curves (F12). All overlay on the plane view; sphere mode hides this card.
  // ---------------------------------------------------------------------------
  function makeAnalysisCard() {
    const card = document.createElement('section');
    card.className = 'card view-plane-only';
    card.id = 'schwarz-analysis-card';
    card.innerHTML = `
      <h2>σ Analysis (S4)</h2>
      <div style="font-size:12px; margin-bottom:6px;">
        <button type="button" id="schwarz-show-sigma-form"
                style="font-size:12px;">Show σ(w) form</button>
      </div>
      <div id="schwarz-sigma-form-out"
           style="display:none; font-size:12px; background:#f7f7f9; padding:6px;
                  border:1px solid #e0e0e8; border-radius:4px; max-height:200px;
                  overflow:auto; margin:4px 0;"></div>
      <label style="display:block; font-size:12px; margin:4px 0;">
        <input type="checkbox" id="schwarz-show-singularities"> Show σ-poles + branch points
        <span id="schwarz-sigma-sing-count"
              style="font-family:monospace; color:#777; margin-left:6px;"></span>
      </label>
      <label style="display:block; font-size:12px; margin:4px 0;">
        <input type="checkbox" id="schwarz-show-level-curves"> Show |σ| / arg(σ) level curves
      </label>
    `;
    setTimeout(() => {
      const btn = card.querySelector('#schwarz-show-sigma-form');
      const out = card.querySelector('#schwarz-sigma-form-out');
      btn.addEventListener('click', () => {
        if (!sState.schwarz) {
          out.style.display = '';
          out.textContent = '(no φ captured)';
          return;
        }
        const f = QD.Schwarz.explicitSigmaForm(sState.schwarz);
        sState.sigmaForm = f;
        out.style.display = '';
        // Typeset the LaTeX forms (already produced by explicitSigmaForm) with
        // KaTeX; fall back per-row to the ASCII text if KaTeX is unavailable or
        // a particular expression fails to parse.
        out.innerHTML =
          '<div class="ssf-fam"></div>' +
          '<div class="ssf-row ssf-phi"></div>' +
          '<div class="ssf-row ssf-f"></div>' +
          '<div class="ssf-row ssf-sigma"></div>';
        out.querySelector('.ssf-fam').textContent = 'family: ' + f.family;
        const rk = (sel, latex, text) => {
          const el = out.querySelector(sel);
          if (!el) return;
          if (window.katex && latex) {
            try { window.katex.render(latex, el, { displayMode: true, throwOnError: false }); return; }
            catch (e) { /* fall through to text */ }
          }
          el.textContent = text || latex || '';
        };
        rk('.ssf-phi',   f.phiLatex,   f.phiText);
        rk('.ssf-f',     f.fLatex,     f.fText);
        rk('.ssf-sigma', f.sigmaLatex, f.sigmaText);
      });
      card.querySelector('#schwarz-show-singularities').addEventListener('change', (e) => {
        sState.showSingularities = e.target.checked;
        if (e.target.checked) {
          if (sState.schwarz) {
            sState.sigmaSingularities = QD.Schwarz.findSigmaSingularities(sState.schwarz);
            const el = document.getElementById('schwarz-sigma-sing-count');
            const s = sState.sigmaSingularities;
            if (el && s) el.textContent = s.poles.length + ' poles, ' + s.branchPoints.length + ' bp';
          }
        } else {
          const el = document.getElementById('schwarz-sigma-sing-count');
          if (el) el.textContent = '';
        }
        paintBoundaryOnTop();
      });
      card.querySelector('#schwarz-show-level-curves').addEventListener('change', (e) => {
        sState.showLevelCurves = e.target.checked;
        if (e.target.checked && sState.schwarz) {
          _recomputeLevelCurves();
        }
        paintBoundaryOnTop();
      });
    }, 0);
    return card;
  }

  // ---------------------------------------------------------------------------
  // S5: Forward-dynamics card. Bundles H7 (critical orbits), E11 (curve
  // forward-image), E10 (cycle finder), H8 (orbit sweep).
  // ---------------------------------------------------------------------------
  function makeForwardCard() {
    const card = document.createElement('section');
    card.className = 'card view-plane-only';
    card.id = 'schwarz-forward-card';
    card.innerHTML = `
      <h2>Forward dynamics (S5+6)</h2>
      <label style="display:block; font-size:12px; margin:4px 0;">
        <input type="checkbox" id="schwarz-show-critical-orbits"> Show canonical-point orbits (H7)
      </label>
      <label style="display:block; font-size:12px; margin:4px 0;">
        <input type="checkbox" id="schwarz-show-z-panel"> Show z-panel (z↔w split, F4)
      </label>
      <div style="font-size:12px; margin:6px 0 4px;">
        <b>Curve forward-image (E11):</b> shift-drag in Ω to draw.
      </div>
      <label style="display:block; font-size:12px; margin:4px 0;">
        Iterations:
        <input type="range" min="1" max="10" value="4" id="schwarz-curve-depth"
               style="vertical-align:middle; margin-left:6px; width:100px;">
        <span id="schwarz-curve-depth-val" style="font-family:monospace;">4</span>
        <button type="button" id="schwarz-curve-clear"
                style="font-size:11px; margin-left:6px;">Clear</button>
      </label>
      <div style="font-size:12px; margin:8px 0 4px;">
        <b>Cycle finder (E10):</b>
      </div>
      <label style="display:block; font-size:12px; margin:4px 0;">
        Period: <select id="schwarz-cycle-n">
          <option value="1">1 (fixed)</option>
          <option value="2" selected>2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
          <option value="6">6</option>
        </select>
        <button type="button" id="schwarz-cycle-find"
                style="font-size:11px; margin-left:6px;">Find</button>
        <button type="button" id="schwarz-cycle-clear"
                style="font-size:11px; margin-left:4px;">Clear</button>
        <span id="schwarz-cycle-count"
              style="font-family:monospace; color:#777; margin-left:6px;"></span>
      </label>
      <div style="font-size:12px; margin:8px 0 4px;">
        <b>Orbit-family sweep (H8):</b>
      </div>
      <label style="display:block; font-size:12px; margin:4px 0;">
        N: <input type="number" id="schwarz-sweep-n" value="16" min="2" max="64"
                  style="width:48px;">
        Depth: <input type="number" id="schwarz-sweep-depth" value="12" min="1" max="50"
                      style="width:48px;">
        <button type="button" id="schwarz-sweep-compute"
                style="font-size:11px; margin-left:6px;">Sweep horizontal</button>
        <button type="button" id="schwarz-sweep-clear"
                style="font-size:11px; margin-left:4px;">Clear</button>
      </label>
      <div style="font-size:12px; margin:8px 0 4px;">
        <b>Export (S6 / F8):</b>
      </div>
      <label style="display:block; font-size:12px; margin:4px 0;">
        Multiplier:
        <select id="schwarz-export-mult">
          <option value="1">1× (display)</option>
          <option value="2" selected>2×</option>
          <option value="4">4×</option>
        </select>
        <button type="button" id="schwarz-export-png"
                style="font-size:11px; margin-left:6px;">Export PNG</button>
      </label>
    `;
    setTimeout(() => {
      // H7
      card.querySelector('#schwarz-show-critical-orbits').addEventListener('change', (e) => {
        sState.showCriticalOrbits = e.target.checked;
        if (e.target.checked && sState.schwarz) _recomputeCriticalOrbits();
        else sState.criticalOrbits = null;
        paintBoundaryOnTop();
      });
      // F4: z-panel toggle
      card.querySelector('#schwarz-show-z-panel').addEventListener('change', (e) => {
        sState.showZPanel = e.target.checked;
        if (e.target.checked) _recomputeZPanelOrbit();
        paintBoundaryOnTop();
      });
      // E11
      const depthSlider = card.querySelector('#schwarz-curve-depth');
      const depthVal    = card.querySelector('#schwarz-curve-depth-val');
      depthSlider.addEventListener('input', () => {
        sState.curveImageDepth = +depthSlider.value;
        depthVal.textContent = String(sState.curveImageDepth);
        // Re-iterate the latest captured curve if any.
        if (sState.curveImage && sState.curveImage[0]) {
          sState.curveImage = QD.Schwarz.iterateCurveForward(
            sState.curveImage[0], sState.schwarz, sState.curveImageDepth);
          paintBoundaryOnTop();
        }
      });
      card.querySelector('#schwarz-curve-clear').addEventListener('click', () => {
        sState.curveImage = null;
        sState.curveImageDraft = null;
        paintBoundaryOnTop();
      });
      // E10
      card.querySelector('#schwarz-cycle-find').addEventListener('click', _findCycles);
      card.querySelector('#schwarz-cycle-clear').addEventListener('click', () => {
        sState.cycles = null;
        const el = document.getElementById('schwarz-cycle-count');
        if (el) el.textContent = '';
        paintBoundaryOnTop();
      });
      // H8
      card.querySelector('#schwarz-sweep-compute').addEventListener('click', _computeSweep);
      card.querySelector('#schwarz-sweep-clear').addEventListener('click', () => {
        sState.sweepOrbits = null;
        paintBoundaryOnTop();
      });
      // F8: PNG export
      card.querySelector('#schwarz-export-png').addEventListener('click', _exportPng);
    }, 0);
    return card;
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
        cycles.length + ' cycles in ' + (t1 - t0).toFixed(0) + ' ms';
      paintBoundaryOnTop();
    }, 30);
  }

  // S6 / F8: PNG export. Composites whatever is currently visible on the
  // Schwarz tab into a single PNG download. For GPU mode, that means the
  // fractal layer from #schwarz-gl-canvas + the overlay layer from #canvas.
  // For CPU / domain-coloring modes, only the 2D canvas is needed.
  //
  // High-res: when multiplier > 1, we briefly re-render the GPU canvas at
  // multiplier·display-size, re-paint the 2D overlay onto an off-screen
  // canvas of the same size, composite, export, restore.
  function _exportPng() {
    const mult = +(document.getElementById('schwarz-export-mult').value || 1);
    const view  = sState.view;
    const baseW = Math.round(view.cssW);
    const baseH = Math.round(view.cssH);
    const outW  = baseW * mult;
    const outH  = baseH * mult;

    // Off-screen composite canvas.
    const out    = document.createElement('canvas');
    out.width    = outW;
    out.height   = outH;
    const outCtx = out.getContext('2d');

    // --- 1) Fractal layer ---
    const glCanvas = document.getElementById('schwarz-gl-canvas');
    const onGpu    = activeRenderer() === 'gpu' && glCanvas && sState.gpu;
    if (onGpu && sState.mode === 'fractal') {
      if (mult > 1) {
        // Re-render at higher resolution. We construct a temporary view with
        // larger css dimensions so the renderer chooses larger drawing-buffer.
        const tmpView = Object.assign({}, view, { cssW: outW, cssH: outH });
        try {
          sState.gpu.setColormap(sState.grid.colormap);
          sState.gpu.render(tmpView, {
            maxIter:   sState.grid.maxIter,
            scaleMode: sState.grid.scaleMode,
            modK:      sState.grid.modK,
          });
          outCtx.drawImage(glCanvas, 0, 0, outW, outH);
        } catch (e) {
          console.warn('[export] high-res GPU render failed:', e);
          outCtx.drawImage(glCanvas, 0, 0, outW, outH);
        }
      } else {
        outCtx.drawImage(glCanvas, 0, 0, outW, outH);
      }
    } else {
      // CPU / domain-coloring: the 2D canvas already has the fractal layer
      // (or there isn't one). Nothing extra here.
      outCtx.fillStyle = '#fafafa';
      outCtx.fillRect(0, 0, outW, outH);
    }

    // --- 2) 2D overlay (boundary, orbits, markers, z-panel, etc.) ---
    const ctx2d = getCtx();
    if (ctx2d) {
      const mainCanvas = getCanvas();
      // Render the 2D layer at the target resolution. Easiest: scale the
      // existing canvas with imageSmoothingEnabled = false. Boundary lines
      // will be 1-px regardless of multiplier — acceptable for typical
      // print/share use; pure-vector boundaries would need a re-render.
      outCtx.imageSmoothingEnabled = false;
      outCtx.drawImage(mainCanvas, 0, 0, outW, outH);
    }

    // --- 3) Restore GPU canvas to its display size ---
    if (onGpu && mult > 1) {
      try {
        sState.gpu.render(view, {
          maxIter:   sState.grid.maxIter,
          scaleMode: sState.grid.scaleMode,
          modK:      sState.grid.modK,
        });
      } catch (_) { /* ignore */ }
    }

    // --- 4) Download ---
    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `qd-schwarz-${ts}-${outW}x${outH}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  // F4: ψ-pullback of the current w-orbit. Each w in sState.orbit is run
  // through sw.psi to get the corresponding z in 𝔻 (or 𝔻*); used to render
  // the z-history inside the z-panel inset.
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

  function setViewMode(mode) {
    if (mode !== 'plane' && mode !== 'sphere') return;
    if (mode === sState.viewMode) return;
    sState.viewMode = mode;
    // Update segmented-control highlight.
    document.querySelectorAll('#controls-schwarz .seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === mode);
    });
    _applyViewModeVisibility();
    if (mode === 'plane') {
      if (sState.sphereView) sState.sphereView.deactivate();
      if (sState.schwarz) {
        showGLLayer(activeRenderer() === 'gpu');
        requestRecompute();
      } else {
        showGLLayer(false);
        clearCanvas();
      }
    } else {
      showGLLayer(false);
      _activateSphereView();
    }
    refreshSourceStatus();
  }

  function _applyViewModeVisibility() {
    const planeShow  = sState.viewMode === 'plane';
    const sphereShow = sState.viewMode === 'sphere';
    document.querySelectorAll('#controls-schwarz .view-plane-only')
      .forEach(el => { el.style.display = planeShow ? '' : 'none'; });
    document.querySelectorAll('#controls-schwarz .view-sphere-only')
      .forEach(el => { el.style.display = sphereShow ? '' : 'none'; });
  }

  // Lazy-mount QD.SphereView the first time the user switches to sphere mode;
  // then push the current captured φ (if any) and broadcast the latest render
  // params. Subsequent invocations just activate the existing handle.
  function _activateSphereView() {
    if (!sState.sphereView) {
      if (!QD.SphereView || !QD.SphereView.mount) {
        console.warn('schwarz-ui: QD.SphereView unavailable; sphere view disabled.');
        return;
      }
      const sidebarRoot = document.getElementById('schwarz-sphere-slot')
                       || document.getElementById('controls-schwarz');
      sState.sphereView = QD.SphereView.mount({
        plotArea:   document.getElementById('plot-area'),
        mainCanvas: getCanvas(),
        sidebar:    sidebarRoot,
        isActive:   () => sState.viewMode === 'sphere',
      });
      if (!sState.sphereView || !sState.sphereView.isAvailable()) {
        console.warn('schwarz-ui: sphere view unavailable (WebGL 2 missing).');
        return;
      }
      // Re-apply visibility so the newly-built display/camera cards respect
      // the current view mode (.view-sphere-only).
      _applyViewModeVisibility();
      // Push current render params so colormap/maxIter/scale carry over.
      sState.sphereView.setRenderParams({
        maxIter:   sState.grid.maxIter,
        colormap:  sState.grid.colormap,
        scaleMode: sState.grid.scaleMode,
        modK:      sState.grid.modK,
      });
      // If we already have a captured φ, push it now.
      if (sState.phiSnapshot) {
        sState.sphereView.setPhi(sState.phiSnapshot,
                                  sState.hDataSnapshot,
                                  sState.boundarySnapshot);
      }
    }
    sState.sphereView.activate();
  }

  function makeSourceCard() {
    const card = document.createElement('section');
    card.className = 'card';
    card.innerHTML = `
      <h2>Source φ (from Inverse tab)</h2>
      <div class="hint">
        The Schwarz reflection σ(w) = conj(F(ψ(w))) is built from a Riemann
        map φ produced by the inverse solver. Solve on the Inverse tab,
        then click <b>Use this φ</b> to snapshot it here.
        <br>All six inverse families supported (classical bounded / unbounded,
        and all four LQD variants).
      </div>
      <div id="schwarz-src-status" class="hint" style="color:#333; margin-top:8px;">
        (no φ captured)
      </div>
      <div id="schwarz-bounded-warning" class="hint"
           style="display:none; color:#b8860b; margin-top:6px; background:#fffbe6;
                  border:1px solid #e8c840; border-radius:4px; padding:4px 8px;">
        ⚠ Bounded Ω: the sphere view is well-defined but visually uninformative
        (K fills most of the southern hemisphere). The render is still shown.
      </div>
      <button id="schwarz-capture" class="small" style="margin-top:8px;">Use this φ</button>
    `;
    setTimeout(() => {
      document.getElementById('schwarz-capture').addEventListener('click', captureFromInverseTab);
    }, 0);
    return card;
  }

  function makeRenderCard() {
    const card = document.createElement('section');
    card.className = 'card';
    card.innerHTML = `
      <h2>Render</h2>
      <div class="row view-plane-only">
        <label>Resolution:
          <select id="schwarz-resolution">
            <option value="192">192</option>
            <option value="256">256</option>
            <option value="384" selected>384</option>
            <option value="512">512</option>
            <option value="768">768</option>
          </select>
        </label>
      </div>
      <div class="row" style="margin-top:8px;">
        <label>Max iterations:
          <input id="schwarz-maxiter" type="number" min="1" max="200" value="24" style="width:72px;">
        </label>
      </div>
      <div class="row" style="margin-top:8px;">
        <label>Colormap:
          <select id="schwarz-colormap">
            <option value="magma" selected>magma</option>
            <option value="inferno">inferno</option>
            <option value="plasma">plasma</option>
            <option value="viridis">viridis</option>
            <option value="cividis">cividis</option>
            <option value="turbo">turbo</option>
            <option value="grayscale">grayscale</option>
            <option value="rainbow">rainbow</option>
            <option value="iceandfire">ice & fire</option>
            <option value="twotone">two-tone</option>
            <option value="cyclic">cyclic (magma)</option>
          </select>
        </label>
      </div>
      <div class="row" style="margin-top:8px;">
        <label>Scale:
          <select id="schwarz-scalemode" title="How escape time n maps to colormap position">
            <option value="smooth" selected>smooth</option>
            <option value="discrete">discrete (per-n bands)</option>
            <option value="log">log</option>
            <option value="sqrt">sqrt</option>
            <option value="modulo">modulo (cyclic)</option>
          </select>
        </label>
        <label style="margin-left:8px;" id="schwarz-modk-wrap">
          K:
          <input id="schwarz-modk" type="number" min="2" max="64" value="8" style="width:52px;">
        </label>
      </div>
      <div class="row view-plane-only" style="margin-top:8px;">
        <label>Renderer:
          <select id="schwarz-renderer">
            <option value="auto" selected>auto (GPU if available)</option>
            <option value="gpu">GPU (WebGL 2)</option>
            <option value="cpu">CPU (fallback)</option>
          </select>
        </label>
      </div>
      <div class="row view-plane-only" style="margin-top:10px;">
        <button id="schwarz-recompute" class="small">Recompute</button>
        <button id="schwarz-fit" class="small" style="margin-left:6px;">Fit to Ω</button>
      </div>
      <div id="schwarz-progress" class="hint view-plane-only" style="margin-top:8px; min-height:1.2em;"></div>
    `;
    setTimeout(() => {
      document.getElementById('schwarz-renderer').addEventListener('change', e => {
        sState.grid.renderer = e.target.value;
        showGLLayer(activeRenderer() === 'gpu');
        requestRecompute();
      });
      document.getElementById('schwarz-resolution').addEventListener('change', e => {
        sState.grid.resolution = +e.target.value;
        requestRecompute();
      });
      document.getElementById('schwarz-maxiter').addEventListener('change', e => {
        sState.grid.maxIter = Math.max(1, Math.min(200, +e.target.value || 24));
        // Broadcast to sphere view too — same shared sliders for both renderers.
        if (sState.sphereView) sState.sphereView.setRenderParams({ maxIter: sState.grid.maxIter });
        if (sState.viewMode === 'plane') requestRecompute();
      });
      document.getElementById('schwarz-colormap').addEventListener('change', e => {
        sState.grid.colormap = e.target.value;
        if (sState.sphereView) sState.sphereView.setRenderParams({ colormap: sState.grid.colormap });
        if (sState.viewMode === 'plane') {
          // For GPU, just re-render (very fast). For CPU, repaint existing field.
          if (activeRenderer() === 'gpu') renderImmediate();
          else repaintField();
        }
      });
      document.getElementById('schwarz-scalemode').addEventListener('change', e => {
        sState.grid.scaleMode = e.target.value;
        updateModKVisibility();
        if (sState.sphereView) sState.sphereView.setRenderParams({ scaleMode: sState.grid.scaleMode });
        if (sState.viewMode === 'plane') {
          if (activeRenderer() === 'gpu') renderImmediate();
          else repaintField();
        }
      });
      document.getElementById('schwarz-modk').addEventListener('change', e => {
        sState.grid.modK = Math.max(2, Math.min(64, +e.target.value || 8));
        if (sState.sphereView) sState.sphereView.setRenderParams({ modK: sState.grid.modK });
        if (sState.viewMode === 'plane' && sState.grid.scaleMode === 'modulo') {
          if (activeRenderer() === 'gpu') renderImmediate();
          else repaintField();
        }
      });
      updateModKVisibility();
      document.getElementById('schwarz-recompute').addEventListener('click', requestRecompute);
      document.getElementById('schwarz-fit').addEventListener('click', fitToOmega);
    }, 0);
    return card;
  }

  function updateModKVisibility() {
    const w = document.getElementById('schwarz-modk-wrap');
    if (w) w.style.display = (sState.grid.scaleMode === 'modulo') ? '' : 'none';
  }

  function makeInfoCard() {
    const card = document.createElement('section');
    card.className = 'card view-plane-only';
    card.innerHTML = `
      <h2>Click & hover</h2>
      <div class="hint">
        <b>Double-click</b> on Ω → plot the orbit {w₀, σ(w₀), σ²(w₀), …}<br>
        <b>Hover</b> → show pixel coords + escape time.<br>
        <b>Drag</b> to pan; <b>wheel</b> to zoom.
      </div>
      <div id="schwarz-readout" class="hint" style="font-family:ui-monospace,Consolas,monospace; margin-top:8px; min-height:1.4em;">
        —
      </div>
    `;
    return card;
  }

  // ---------------------------------------------------------------------------
  // Source-φ capture from the Inverse tab's state.current.primary.
  // ---------------------------------------------------------------------------
  function refreshSourceStatus() {
    const el = document.getElementById('schwarz-src-status');
    if (!el) return;
    if (sState.phiSnapshot) {
      const phi = sState.phiSnapshot;
      let famLabel;
      switch (phi.family) {
        case 'boundedLQD':            famLabel = 'bounded LQD';            break;
        case 'boundedLQD_singular':   famLabel = 'bounded singular LQD';   break;
        case 'unboundedLQD':          famLabel = 'unbounded LQD';          break;
        case 'unboundedLQD_singular': famLabel = 'unbounded singular LQD'; break;
        case 'powerQD':               famLabel = `bounded PQD (α=${phi.alpha || '?'})`; break;
        case 'powerQD_singular':      famLabel = `bounded singular PQD (α=${phi.alpha || '?'})`; break;
        case 'unboundedPQD':          famLabel = `unbounded PQD (α=${phi.alpha || '?'})`; break;
        case 'unboundedPQD_singular': famLabel = `unbounded singular PQD (α=${phi.alpha || '?'})`; break;
        default: famLabel = phi.unbounded ? 'unbounded QD' : 'bounded QD';
      }
      const polyLen = (phi.polyA || phi.F || []).length;
      const branchLen = (phi.branches || []).reduce((a, b) => a + (b.A || []).length, 0);
      const bits = [];
      bits.push('branch terms=' + branchLen);
      if (polyLen) bits.push('Laurent m=' + polyLen);
      if (phi.c != null && phi.unbounded) bits.push('c=' + phi.c);
      if (phi.z0) bits.push('z₀=' + QD.Complex.format(phi.z0));
      el.innerHTML = `<b>Captured:</b> ${famLabel}, ${bits.join(', ')}`;
      el.style.color = '#1a3e7a';
    } else {
      el.textContent = '(no φ captured)';
      el.style.color = '#777';
    }
    // Bounded warning: shown only in sphere view AND when φ is bounded
    // (because the sphere view is visually uninformative there).
    const warnEl = document.getElementById('schwarz-bounded-warning');
    if (warnEl) {
      const showWarn = sState.viewMode === 'sphere'
                    && !!sState.phiSnapshot
                    && !sState.phiSnapshot.unbounded;
      warnEl.style.display = showWarn ? '' : 'none';
    }
  }

  function captureFromInverseTab() {
    // Prefer the QD.PrimarySolution envelope (HANDOFF — P0 refactor); fall
    // back to the legacy state.current read for any unanticipated load order.
    const envelope = (QD.PrimarySolution && QD.PrimarySolution.get())
                  || (typeof state !== 'undefined' ? state.current : null);
    if (!envelope || !envelope.success) {
      alert('No successful Inverse-tab solution yet. Solve on the Inverse tab first.');
      return;
    }
    const sol = envelope.primary;
    if (!sol || !sol.phi) { alert('Inverse-tab primary solution missing φ.'); return; }
    // All six families are supported: classical bounded/unbounded (which
    // don't set phi.family — see HANDOFF gotcha #1) plus all four LQD
    // families. No allowlist to enforce.
    sState.phiSnapshot = clonePhi(sol.phi);
    // hData lives on the envelope, NOT on the primary sol — keep them
    // separate so we can read either path without surprise.
    const hData = envelope.hData;
    sState.hDataSnapshot = hData ? cloneHData(hData) : null;
    // Boundary samples: re-derive from φ via the adaptive sampler. 512
    // samples is the larger of plane (was 384) and sphere (512) defaults —
    // both views share the snapshot now (HANDOFF #29).
    try {
      sState.boundarySnapshot = QD.sampleBoundaryAdaptive
        ? QD.sampleBoundaryAdaptive(sState.phiSnapshot, 512, 800).map(p => ({re:p.w.re, im:p.w.im}))
        : QD.sampleBoundary(sState.phiSnapshot, 512);
    } catch (e) {
      alert('Failed to sample ∂Ω: ' + (e.message || e));
      return;
    }
    sState.schwarz = QD.Schwarz.buildSchwarzFromPhi(
      sState.phiSnapshot, sState.hDataSnapshot, sState.boundarySnapshot);
    sState.orbit = []; sState.pinnedOrbit = []; sState.hoverOrbit = null;
    sState.preimageTree = null;

    // Try to bring up the GPU renderer (idempotent: only created once).
    ensureGPU();
    if (sState.gpu) {
      const okGpu = sState.gpu.setPhi(sState.phiSnapshot, {
        boundaryPts: sState.boundarySnapshot,
        escapeR:     sState.schwarz.escapeR,
      });
      if (!okGpu) {
        sState.gpuMsg = sState.gpu.capacityError() || 'GPU rejected this φ.';
      } else {
        sState.gpu.setColormap(sState.grid.colormap);
        sState.gpuMsg = '';
      }
    }
    // Push to sphere view too (only if it's already been lazy-mounted).
    // If the user hasn't toggled to sphere yet, the snapshot will be pushed
    // on first activation (see _activateSphereView).
    if (sState.sphereView) {
      sState.sphereView.setPhi(sState.phiSnapshot,
                                sState.hDataSnapshot,
                                sState.boundarySnapshot);
    }

    refreshSourceStatus();
    if (sState.viewMode === 'plane') {
      fitToOmega();
    } else if (sState.sphereView) {
      sState.sphereView.requestRender();
    }
  }

  function ensureGPU() {
    if (sState.gpu) return;
    if (!QD.Schwarz.createGPURenderer) return;
    // We need our own canvas — the existing #canvas is already in 2D mode
    // for the Inverse tab and a canvas can only hold one context type.
    // We add a sibling, positioned under #canvas, that the WebGL renderer
    // paints into. #canvas keeps its 2D context and is used for overlays
    // (boundary + orbit) layered on top.
    const plotArea = document.getElementById('plot-area');
    const mainC    = getCanvas();
    if (!plotArea || !mainC) return;
    let glC = document.getElementById('schwarz-gl-canvas');
    if (!glC) {
      glC = document.createElement('canvas');
      glC.id = 'schwarz-gl-canvas';
      // Stack the GL canvas behind #canvas. #plot-area already has
      // position:relative (style.css). We give the GL canvas absolute
      // positioning + z-index 0. The 2D canvas keeps its in-flow
      // layout but receives a z-index 1 via position:relative — this
      // way z-index works WITHOUT removing it from normal flow (which
      // would break sizing and was the cause of the drag-flicker
      // "I see the QD" symptom).
      glC.style.cssText =
        'position:absolute; left:0; top:0; width:100%; height:100%; '
        + 'pointer-events:none; z-index:0;';
      mainC.style.position = 'relative';   // keep in flow but enable z-index
      mainC.style.zIndex   = '1';
      mainC.style.background = 'transparent';
      plotArea.insertBefore(glC, mainC);
    }
    try {
      sState.gpu = QD.Schwarz.createGPURenderer(glC);
      if (!sState.gpu) sState.gpuMsg = 'WebGL 2 unavailable; using CPU renderer.';
    } catch (e) {
      sState.gpu = null;
      sState.gpuMsg = 'GPU init failed: ' + (e.message || e);
    }
  }
  function showGLLayer(show) {
    const glC = document.getElementById('schwarz-gl-canvas');
    if (glC) glC.style.display = show ? '' : 'none';
  }

  function activeRenderer() {
    // 'auto': prefer GPU when present & no capacity-error; else CPU.
    if (sState.grid.renderer === 'cpu') return 'cpu';
    if (sState.grid.renderer === 'gpu') return sState.gpu ? 'gpu' : 'cpu';
    return (sState.gpu && !sState.gpu.capacityError()) ? 'gpu' : 'cpu';
  }

  function clonePhi(phi) {
    // Delegate to the canonical QD.clonePhi so EVERY family-specific field
    // (alpha for PQDs, lqdBeta/lqdGamma for LQDs, z0/gamma/q, polyA, branches)
    // is carried through a single source of truth. Layer on only the UI-only
    // `F` field (Laurent companion the Schwarz inverse path attaches) that the
    // canonical clone does not know about. Maintaining a second hand-rolled
    // clone here is what silently dropped lqdBeta (HANDOFF #26) and then alpha
    // (PQD captures → NaN powers); the delegation removes that drift class.
    const out = QD.clonePhi(phi);
    out.F = phi.F ? phi.F.map(c => ({ re: c.re, im: c.im })) : undefined;
    return out;
  }
  function cloneHData(h) {
    return {
      poles: (h.poles || []).map(p => ({
        a: { re: p.a.re, im: p.a.im },
        principal: p.principal.map(c => ({ re: c.re, im: c.im })),
      })),
      polyPart: (h.polyPart || []).map(c => ({ re: c.re, im: c.im })),
    };
  }

  // ---------------------------------------------------------------------------
  // Canvas plumbing (we own the shared canvas while this tab is active).
  // ---------------------------------------------------------------------------
  function getCanvas() { return document.getElementById('canvas'); }
  function getCtx()    { const c = getCanvas(); return c ? c.getContext('2d') : null; }

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

  // Synchronous GPU re-render. Used during drag/zoom in GPU mode.
  function renderImmediate() {
    if (!sState.schwarz || !sState.gpu || activeRenderer() !== 'gpu') return;
    showGLLayer(true);
    try {
      sState.gpu.setColormap(sState.grid.colormap);
      sState.gpu.render(sState.view, {
        maxIter:   sState.grid.maxIter,
        scaleMode: sState.grid.scaleMode,
        modK:      sState.grid.modK,
      });
      paintBoundaryOnTop();
      paintOrbit();
    } catch (e) {
      // Fall through silently; the next debounced recompute will surface
      // any persistent error.
    }
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

  // ---------------------------------------------------------------------------
  // Coordinate transforms.
  // ---------------------------------------------------------------------------
  function pixelToWorld(sx, sy) {
    const { cx, cy, scale, cssW, cssH } = sState.view;
    return {
      re: cx + (sx - cssW / 2) / scale,
      im: cy - (sy - cssH / 2) / scale,
    };
  }
  function worldToPixel(re, im) {
    const { cx, cy, scale, cssW, cssH } = sState.view;
    return {
      x: cssW / 2 + (re - cx) * scale,
      y: cssH / 2 - (im - cy) * scale,
    };
  }
  function fitToOmega() {
    if (!sState.boundarySnapshot || !sState.boundarySnapshot.length) return;
    const b = QD.Schwarz.polygonBounds(sState.boundarySnapshot);
    sState.view.cx = b.center.re;
    sState.view.cy = b.center.im;
    syncCanvasSize();
    const margin = sState.phiSnapshot && sState.phiSnapshot.unbounded ? 2.2 : 1.25;
    sState.view.scale = Math.min(sState.view.cssW, sState.view.cssH) / (2 * b.radius * margin);
    requestRecompute();
  }
  function syncCanvasSize() {
    const c = getCanvas();
    if (!c) return;
    const rect = c.getBoundingClientRect();
    sState.view.cssW = Math.max(50, rect.width);
    sState.view.cssH = Math.max(50, rect.height);
  }

  // ---------------------------------------------------------------------------
  // Progressive renderer.
  // ---------------------------------------------------------------------------
  let recomputeTimer = null;
  function requestRecompute() {
    if (recomputeTimer) clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => { recomputeTimer = null; doRecompute(); }, 80);
  }

  function doRecompute() {
    if (!sState.schwarz) { clearCanvas(); return; }
    syncCanvasSize();

    // Invalidate any prior render up front (covers CPU→GPU: the GPU branch
    // below returns without touching renderToken, so a stale CPU-worker pass
    // could otherwise paint over the GPU image). Cancelling the worker also
    // frees it; a fresh render re-creates it on demand.
    const myToken = ++sState.renderToken;
    if (QD.SchwarzCpuWorker) QD.SchwarzCpuWorker.cancel();

    // GPU path: synchronous, complete in one frame.
    if (activeRenderer() === 'gpu') {
      showGLLayer(true);
      const t0 = performance.now();
      try {
        sState.gpu.setColormap(sState.grid.colormap);
        sState.gpu.render(sState.view, {
          maxIter:   sState.grid.maxIter,
          scaleMode: sState.grid.scaleMode,
          modK:      sState.grid.modK,
        });
      } catch (e) {
        // GPU render failed (e.g. context lost). Fall through to CPU path.
        sState.gpuMsg = 'GPU render failed; using CPU. ' + (e.message || e);
        // Continue below — CPU pyramid.
      }
      if (!sState.gpuMsg || sState.gpuMsg.indexOf('failed') === -1) {
        // Field/fieldKind aren't populated under GPU rendering — hover readout
        // will fall back to coordinates-only.
        sState.field = null; sState.fieldKind = null;
        // Boundary + orbit overlays drawn on top (no field clearing needed).
        paintBoundaryOnTop();
        paintOrbit();
        const ms = (performance.now() - t0).toFixed(0);
        setProgress('GPU render: ' + ms + ' ms' + (sState.gpuMsg ? '  (' + sState.gpuMsg + ')' : ''));
        return;
      }
    }

    // CPU progressive pyramid path. Hide the GL layer so a stale GPU image
    // doesn't peek through edge cases. (renderToken was already bumped at the
    // top of doRecompute; myToken is captured there.)
    showGLLayer(false);
    sState.rendering = true;
    setProgress('Pass 1/3 (coarse) ...');
    // Allocate field at target resolution.
    const res = sState.grid.resolution;
    const aspect = sState.view.cssW / sState.view.cssH;
    let W, H;
    if (aspect >= 1) { W = res; H = Math.max(1, Math.round(res / aspect)); }
    else             { H = res; W = Math.max(1, Math.round(res * aspect)); }
    sState.field     = new Int16Array(W * H);
    sState.fieldKind = new Uint8Array(W * H);
    sState.fieldW = W; sState.fieldH = H;

    // Prefer the dedicated CPU worker (A7) — it computes the whole pyramid
    // off-thread and streams a field snapshot per pass. Falls back to the
    // in-process pyramid (below) on file:// / no-Worker / clone failure.
    if (QD.SchwarzCpuWorker && QD.SchwarzCpuWorker.isUsable()) {
      _renderCpuViaWorker(myToken, W, H);
      return;
    }
    _renderCpuPyramid(myToken);
  }

  // In-process progressive pyramid (main-thread fallback for doRecompute).
  // Pass 1: every 4th pixel → 4×4 blocks; pass 2: 2×2; pass 3: per-pixel.
  function _renderCpuPyramid(myToken) {
    chainPass(myToken, 4, () =>
      chainPass(myToken, 2, () =>
        chainPass(myToken, 1, () => {
          if (myToken !== sState.renderToken) return;
          sState.rendering = false;
          setProgress('');
          paintAll();
        })));
  }

  // Off-thread CPU render via QD.SchwarzCpuWorker (A7). The worker rebuilds the
  // Schwarz handle from the serializable φ + boundary samples and posts one
  // transferable field snapshot per pyramid pass; we adopt each snapshot, fill
  // the coarse cells (reusing the same routine as the in-process path), and
  // repaint. Stale snapshots (token mismatch) are discarded. Any failure path
  // falls back to the in-process pyramid so the tab always renders.
  function _renderCpuViaWorker(myToken, W, H) {
    const v = sState.view;
    const params = {
      phi:         sState.phiSnapshot,
      boundaryPts: sState.boundarySnapshot || [],
      view:        { cx: v.cx, cy: v.cy, scale: v.scale, cssW: v.cssW, cssH: v.cssH },
      W, H,
      maxIter:     sState.grid.maxIter,
      strides:     [4, 2, 1],
    };
    const fallback = () => {
      if (myToken !== sState.renderToken) return;
      _renderCpuPyramid(myToken);
    };
    sState._cpuWorkerHandle = QD.SchwarzCpuWorker.renderField(params, {
      onPass(m) {
        if (myToken !== sState.renderToken) return;   // superseded — discard
        sState.field = m.field; sState.fieldKind = m.fieldKind;
        sState.fieldW = m.W; sState.fieldH = m.H;
        if (m.stride > 1) fillFromCoarseSamples(m.stride);
        paintAll();
        if (m.done) { sState.rendering = false; setProgress(''); }
        else        { setProgress('Pass ' + ((4 / m.stride) | 0) + '/3 …'); }
      },
      onUnavailable: fallback,
      onError(e) { console.warn('[schwarz cpu worker]', e); fallback(); },
    });
  }

  function chainPass(token, stride, next) {
    if (token !== sState.renderToken) return;
    setProgress('Pass ' + (4 / stride | 0) + (stride === 1 ? '/3 (full)…' : '/3 (refining)…'));
    const W = sState.fieldW, H = sState.fieldH;
    const sw = sState.schwarz;
    const maxIter = sState.grid.maxIter;
    // Map field coords → world.
    const cssW = sState.view.cssW, cssH = sState.view.cssH;
    const cx = sState.view.cx, cy = sState.view.cy, scale = sState.view.scale;
    const pxPerCellX = cssW / W, pxPerCellY = cssH / H;

    let row = 0;
    // Per-row warm-start chain: the converged ψ-seed from the left neighbor
    // (same row, prior col) is reused as initialSeedHint for the current pixel.
    // Adjacent pixels in w-space land on adjacent z-values in 𝔻, so Newton
    // typically converges in 1–3 iters instead of 5–10. Reset at row start.
    let leftSeed = null;
    function chunk() {
      if (token !== sState.renderToken) return;
      const tStart = performance.now();
      while (row < H) {
        leftSeed = null;
        for (let col = 0; col < W; col++) {
          if ((row % stride) !== 0 || (col % stride) !== 0) continue;
          const idx = row * W + col;
          if (sState.fieldKind[idx] && stride > 1) continue;
          const px = (col + 0.5) * pxPerCellX;
          const py = (row + 0.5) * pxPerCellY;
          const wRe = cx + (px - cssW / 2) / scale;
          const wIm = cy - (py - cssH / 2) / scale;
          const wpt = { re: wRe, im: wIm };
          if (!sw.isInOmega(wpt)) {
            sState.field[idx] = 0;
            sState.fieldKind[idx] = KIND_OUTSIDE + 1;
            // leftSeed stays — outside pixels don't update the chain.
          } else {
            const et = QD.Schwarz.escapeTime(wpt, sw, { maxIter, initialSeedHint: leftSeed });
            sState.field[idx] = et.n;
            sState.fieldKind[idx] =
              (et.kind === 'fundamental' ? KIND_FUND :
               et.kind === 'escaped'     ? KIND_ESC  :
               et.kind === 'interior'    ? KIND_INT  :
                                           KIND_INV) + 1;
            // Carry forward only if ψ converged to a usable seed.
            if (et.firstZ) leftSeed = et.firstZ;
          }
        }
        row++;
        if (performance.now() - tStart > 14) {
          requestAnimationFrame(chunk);
          paintAll();
          return;
        }
      }
      // After this pass: fill in any cells skipped by larger stride with the
      // nearest sampled value (for the coarse-display effect).
      fillFromCoarseSamples(stride);
      paintAll();
      next();
    }
    requestAnimationFrame(chunk);
  }

  // Fill un-resolved cells (kind === 0) with their nearest stride-aligned
  // neighbor's value, so the coarse pass shows blocky filled-in content.
  function fillFromCoarseSamples(stride) {
    const W = sState.fieldW, H = sState.fieldH;
    for (let row = 0; row < H; row++) {
      const rAnchor = row - (row % stride);
      for (let col = 0; col < W; col++) {
        const idx = row * W + col;
        if (sState.fieldKind[idx]) continue;
        const cAnchor = col - (col % stride);
        const aIdx = rAnchor * W + cAnchor;
        sState.field[idx]     = sState.field[aIdx];
        sState.fieldKind[idx] = sState.fieldKind[aIdx];
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Painting.
  // ---------------------------------------------------------------------------
  function clearCanvas() {
    const ctx = getCtx(); if (!ctx) return;
    syncCanvasSize();
    ctx.clearRect(0, 0, sState.view.cssW, sState.view.cssH);
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, sState.view.cssW, sState.view.cssH);
    ctx.fillStyle = '#777';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Solve on the Inverse tab and click “Use this φ” to begin.',
                 sState.view.cssW/2, sState.view.cssH/2);
  }

  function paintAll() {
    const ctx = getCtx(); if (!ctx) return;
    syncCanvasSize();
    paintField();
    paintDomainColoring();               // S5 / F6: under the rest
    paintSigmaLevelCurves();             // S4 / F12: under the boundary
    paintBoundary();
    paintSweepOrbits();                  // S5 / H8
    paintCurveImage();                   // S5 / E11
    paintCriticalOrbits();               // S5 / H7
    paintOrbit();
    paintPreimageTree();
    paintCycles();                       // S5 / E10
    paintLimitSet();
    paintSigmaSingularities();           // S4 / F3: on top so markers are visible
    paintZPanel();                       // S6 / F4: on top, inset corner
  }
  function repaintField() { if (sState.field) paintAll(); }

  // Used after a GPU render: WebGL has already drawn the fractal to the
  // sibling #schwarz-gl-canvas. We clear the main 2D canvas to transparent
  // and draw only the boundary + orbit overlays on top. S1 adds the
  // preimage tree to the overlay chain.
  function paintBoundaryOnTop() {
    const ctx = getCtx(); if (!ctx) return;
    ctx.clearRect(0, 0, sState.view.cssW, sState.view.cssH);
    paintDomainColoring();               // S5 / F6
    paintSigmaLevelCurves();             // S4: contours under the boundary
    paintBoundary();
    paintSweepOrbits();                  // S5 / H8
    paintCurveImage();                   // S5 / E11
    paintCriticalOrbits();               // S5 / H7
    paintOrbit();                        // w-side orbit
    paintPreimageTree();
    paintCycles();                       // S5 / E10
    paintLimitSet();
    paintSigmaSingularities();           // S4: markers on top
    paintZPanel();                       // S6 / F4: inset corner
  }

  // Cached off-screen canvas + ImageData buffer for CPU repaint. Re-created
  // only when (W, H) change — avoids allocating a few MB on every paint
  // during the progressive pyramid passes.
  let offC = null, offCtx = null, offImg = null;
  function ensureOffscreen(W, H) {
    if (offC && offC.width === W && offC.height === H) return;
    offC = document.createElement('canvas');
    offC.width = W; offC.height = H;
    offCtx = offC.getContext('2d');
    offImg = offCtx.createImageData(W, H);
  }

  function paintField() {
    const ctx = getCtx();
    const W = sState.fieldW, H = sState.fieldH;
    if (!sState.field || !W || !H) return;
    ensureOffscreen(W, H);
    const imgData = offImg;
    const maxIter = sState.grid.maxIter;
    const cmap = sState.grid.colormap;
    for (let i = 0; i < W * H; i++) {
      const kind = sState.fieldKind[i];
      const n    = sState.field[i];
      let r = 0, g = 0, b = 0;
      if (kind === KIND_OUTSIDE + 1)        { r = 245; g = 245; b = 248; }     // fundamental tile
      else if (kind === KIND_INT + 1)       { r = 28;  g = 28;  b = 36;  }     // interior (tiling-set limit)
      else if (kind === KIND_ESC + 1)       { r = 80;  g = 80;  b = 90;  }     // escaping set
      else if (kind === KIND_INV + 1)       { r = 180; g = 90;  b = 90;  }     // bad pixel
      else if (kind === KIND_FUND + 1) {
        const t = cpuComputeT(n, maxIter, sState.grid.scaleMode, sState.grid.modK);
        const c = colormap(cmap, t);
        r = c[0]; g = c[1]; b = c[2];
      }
      const j = i * 4;
      imgData.data[j]   = r;
      imgData.data[j+1] = g;
      imgData.data[j+2] = b;
      imgData.data[j+3] = 255;
    }
    offCtx.putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, sState.view.cssW, sState.view.cssH);
    ctx.drawImage(offC, 0, 0, sState.view.cssW, sState.view.cssH);
  }

  function paintBoundary() {
    const pts = sState.boundarySnapshot;
    if (!pts || !pts.length) return;
    const ctx = getCtx();
    ctx.strokeStyle = '#1a3e7a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const p0 = worldToPixel(pts[0].re, pts[0].im);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = worldToPixel(pts[i].re, pts[i].im);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Draw one forward-orbit polyline + dots in the given style. `style.dash`
  // (optional) applies a dashed connecting line; it is reset afterwards so
  // other overlays aren't affected.
  function drawOrbitPolyline(pts, style) {
    if (!pts || pts.length === 0) return;
    const ctx = getCtx(); if (!ctx) return;
    ctx.strokeStyle = style.line;
    ctx.lineWidth   = style.lineWidth;
    if (ctx.setLineDash) ctx.setLineDash(style.dash || []);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = worldToPixel(pts[i].re, pts[i].im);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash([]);
    for (let i = 0; i < pts.length; i++) {
      const p = worldToPixel(pts[i].re, pts[i].im);
      ctx.beginPath();
      ctx.arc(p.x, p.y, i === 0 ? style.seedR : style.dotR, 0, 2 * Math.PI);
      ctx.fillStyle = i === 0 ? style.seedFill : style.dotFill;
      ctx.fill();
      if (i === 0 && style.seedHalo) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  }

  // Draw the transient hover orbit (light, dashed, underneath) then the
  // pinned orbit (solid green, on top). The hover orbit is the live preview;
  // the pinned orbit is the single-click-committed one (= sState.orbit).
  function paintOrbit() {
    drawOrbitPolyline(sState.hoverOrbit, {
      line: 'rgba(20, 160, 60, 0.45)', lineWidth: 1.0, dash: [3, 3],
      seedR: 3.2, dotR: 2.0, seedFill: 'rgba(16,138,64,0.7)',
      dotFill: 'rgba(20,160,60,0.45)', seedHalo: false,
    });
    drawOrbitPolyline(sState.pinnedOrbit, {
      line: 'rgba(20, 160, 60, 0.95)', lineWidth: 1.3,
      seedR: 4.5, dotR: 2.8, seedFill: '#108a40',
      dotFill: 'rgba(20, 160, 60, 0.85)', seedHalo: true,
    });
  }

  // ---------------------------------------------------------------------------
  // S1: paint the preimage tree (TODO #16 visualization).
  //
  // Layout: generations colored along a plasma-like ramp. Gen-0 (the seed)
  // is bright yellow; later generations interpolate toward magenta. Edges
  // are translucent thin lines parent→child. Dot radius shrinks slightly
  // with depth (5 → 1.5 px) so deeper generations don't dominate visually.
  // ---------------------------------------------------------------------------
  function paintPreimageTree() {
    const tree = sState.preimageTree;
    if (!tree || !tree.generations || tree.generations.length === 0) return;
    const ctx = getCtx(); if (!ctx) return;
    const N = tree.generations.length;

    // Plasma-like ramp: gen 0 = #fde725 (yellow) → gen N-1 = #5d01a6 (deep purple).
    function genColor(g) {
      const t = N > 1 ? (g / (N - 1)) : 0;
      // crude two-stop interpolation through #f0844a → #b3147a → #5d01a6
      if (t < 0.5) {
        const u = t * 2;
        const r = Math.round(253 + (240 - 253) * u);
        const g0 = Math.round(231 + (132 - 231) * u);
        const b = Math.round(37  + (74  - 37 ) * u);
        return `rgba(${r},${g0},${b},0.92)`;
      } else {
        const u = (t - 0.5) * 2;
        const r = Math.round(240 + (93  - 240) * u);
        const g0 = Math.round(132 + (1   - 132) * u);
        const b = Math.round(74  + (166 - 74 ) * u);
        return `rgba(${r},${g0},${b},0.92)`;
      }
    }

    // Edges first (so dots sit on top).
    ctx.lineWidth = 0.9;
    for (const e of tree.edges) {
      const p0 = worldToPixel(tree.generations[e.fromGen][e.fromIdx].re,
                              tree.generations[e.fromGen][e.fromIdx].im);
      const p1 = worldToPixel(tree.generations[e.toGen  ][e.toIdx  ].re,
                              tree.generations[e.toGen  ][e.toIdx  ].im);
      ctx.strokeStyle = genColor(e.toGen);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    // Dots — gen 0 (seed) drawn with a white halo so it's easy to spot.
    for (let g = 0; g < N; g++) {
      const r = Math.max(1.5, 5 - g * 0.55);
      ctx.fillStyle = genColor(g);
      for (const w of tree.generations[g]) {
        const p = worldToPixel(w.re, w.im);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
        ctx.fill();
        if (g === 0) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }
  }

  // S4 / F3: paint σ-poles + branch points overlay.
  function paintSigmaSingularities() {
    if (!sState.showSingularities || !sState.sigmaSingularities) return;
    const { poles, branchPoints } = sState.sigmaSingularities;
    const ctx = getCtx();
    // σ-poles: red filled circles with a thin label.
    ctx.font = '10px ui-monospace, Consolas, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'left';
    for (const pl of poles) {
      const p = worldToPixel(pl.w.re, pl.w.im);
      if (!isFinite(p.x) || !isFinite(p.y)) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
      ctx.fillStyle   = '#d12d2d';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 1.4;
      ctx.stroke();
      ctx.fillStyle = '#d12d2d';
      ctx.fillText(pl.label + ' (' + pl.kind + ')', p.x + 8, p.y);
    }
    // Branch points: blue triangle pointing up.
    for (const bp of branchPoints) {
      const p = worldToPixel(bp.w.re, bp.w.im);
      if (!isFinite(p.x) || !isFinite(p.y)) continue;
      ctx.beginPath();
      ctx.moveTo(p.x,     p.y - 6);
      ctx.lineTo(p.x + 6, p.y + 4);
      ctx.lineTo(p.x - 6, p.y + 4);
      ctx.closePath();
      ctx.fillStyle = bp.severity === 'critical' ? '#3a54ae' : '#1a3e7a';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#1a3e7a';
      ctx.fillText(bp.label, p.x + 8, p.y + 4);
    }
  }

  // S4 / F12: paint |σ| (solid) + arg(σ) (dashed) level curves.
  function paintSigmaLevelCurves() {
    if (!sState.showLevelCurves || !sState.levelCurves) return;
    const ctx = getCtx();
    const lc = sState.levelCurves;
    // |σ| solid contours — muted teal.
    ctx.lineWidth   = 1.0;
    ctx.strokeStyle = 'rgba(20, 130, 130, 0.7)';
    if (ctx.setLineDash) ctx.setLineDash([]);
    for (const c of lc.abs) {
      ctx.beginPath();
      for (const s of c.segments) {
        const a = worldToPixel(s.x0, s.y0);
        const b = worldToPixel(s.x1, s.y1);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
    // arg(σ) dashed contours — muted magenta.
    ctx.lineWidth   = 0.9;
    ctx.strokeStyle = 'rgba(170, 60, 130, 0.65)';
    if (ctx.setLineDash) ctx.setLineDash([4, 3]);
    for (const c of lc.arg) {
      ctx.beginPath();
      for (const s of c.segments) {
        const a = worldToPixel(s.x0, s.y0);
        const b = worldToPixel(s.x1, s.y1);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
    if (ctx.setLineDash) ctx.setLineDash([]);
  }

  // S6 / F4: paint the z-panel inset in the top-right corner. Shows 𝔻
  // (unit circle for bounded families, exterior of unit circle for
  // unbounded), the boundary of 𝔻 highlighted, and the ψ-pullback of the
  // current orbit colored to match the w-side orbit.
  function paintZPanel() {
    if (!sState.showZPanel) return;
    const ctx = getCtx();
    // Inset geometry: 180×180 box in top-right, 14px from edge.
    const W = 180, H = 180, pad = 14;
    const x0 = sState.view.cssW - W - pad;
    const y0 = pad;
    // Background + frame.
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.strokeStyle = '#777';
    ctx.lineWidth = 1.2;
    ctx.fillRect(x0, y0, W, H);
    ctx.strokeRect(x0, y0, W, H);
    // Header.
    ctx.fillStyle = '#444';
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const isUnbounded = sState.schwarz && sState.schwarz.unbounded;
    ctx.fillText(isUnbounded ? 'z ∈ 𝔻*  (|z|>1)' : 'z ∈ 𝔻  (|z|<1)', x0 + 6, y0 + 4);

    // z-space → panel-pixel transform.
    // For bounded: 𝔻 fits in a circle of radius 0.85·H/2 centered in the box.
    // For unbounded: same disk, but show |z|>1 region (we draw |z| up to 2.5).
    const cx = x0 + W / 2;
    const cy = y0 + H / 2 + 6;
    const Rpx = isUnbounded ? (H / 2 - 14) / 2.5 : (H / 2 - 18);
    function zToPanel(z) {
      return { x: cx + z.re * Rpx, y: cy - z.im * Rpx };
    }
    // Draw axes (faint).
    ctx.strokeStyle = '#dadde3';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x0 + 6, cy); ctx.lineTo(x0 + W - 6, cy);
    ctx.moveTo(cx, y0 + 18); ctx.lineTo(cx, y0 + H - 6);
    ctx.stroke();
    // Unit circle.
    ctx.strokeStyle = '#1a3e7a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, Rpx, 0, 2 * Math.PI);
    ctx.stroke();
    // Tint the relevant region (𝔻 for bounded, 𝔻^c for unbounded).
    ctx.beginPath();
    if (isUnbounded) {
      // Tint the EXTERIOR of the unit circle (within panel bounds).
      ctx.rect(x0 + 4, y0 + 18, W - 8, H - 22);
      ctx.arc(cx, cy, Rpx, 0, 2 * Math.PI, true);
    } else {
      ctx.arc(cx, cy, Rpx, 0, 2 * Math.PI);
    }
    ctx.fillStyle = 'rgba(86, 119, 168, 0.10)';
    ctx.fill('evenodd');

    // z-orbit polyline + dots, matching the w-orbit color palette (green).
    const zOrbit = sState.zPanelOrbit;
    if (zOrbit && zOrbit.length > 0) {
      // Connecting line.
      ctx.strokeStyle = 'rgba(20, 160, 60, 0.95)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let first = true;
      for (const z of zOrbit) {
        if (!z) { first = true; continue; }
        const p = zToPanel(z);
        if (first) { ctx.moveTo(p.x, p.y); first = false; }
        else        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      // Dots — seed (first) gets a halo.
      for (let i = 0; i < zOrbit.length; i++) {
        const z = zOrbit[i];
        if (!z) continue;
        const p = zToPanel(z);
        ctx.beginPath();
        ctx.arc(p.x, p.y, i === 0 ? 3.5 : 2.0, 0, 2 * Math.PI);
        ctx.fillStyle = i === 0 ? '#108a40' : 'rgba(20, 160, 60, 0.85)';
        ctx.fill();
        if (i === 0) {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.0;
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // S5 / F6: paint domain-coloring field into the canvas. Caches an
  // offscreen W×H ImageData and stretches to the current viewport.
  let _dcOffCanvas = null, _dcOffCtx = null;
  function paintDomainColoring() {
    if (sState.mode !== 'domain-coloring' || !sState.domainColor) return;
    const dc = sState.domainColor;
    if (!_dcOffCanvas || _dcOffCanvas.width !== dc.W || _dcOffCanvas.height !== dc.H) {
      _dcOffCanvas = document.createElement('canvas');
      _dcOffCanvas.width  = dc.W;
      _dcOffCanvas.height = dc.H;
      _dcOffCtx = _dcOffCanvas.getContext('2d');
    }
    const img = _dcOffCtx.createImageData(dc.W, dc.H);
    img.data.set(dc.buf);
    _dcOffCtx.putImageData(img, 0, 0);
    const ctx = getCtx();
    // Map source viewport → screen pixel rect.
    const a = worldToPixel(dc.viewport.reMin, dc.viewport.imMax);
    const b = worldToPixel(dc.viewport.reMax, dc.viewport.imMin);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(_dcOffCanvas, a.x, a.y, b.x - a.x, b.y - a.y);
  }

  // S5 / H7: paint critical orbits (canonical-point σ-orbits).
  function paintCriticalOrbits() {
    if (!sState.showCriticalOrbits || !sState.criticalOrbits) return;
    const ctx = getCtx();
    const palette = ['#d4570b', '#7e2d8c', '#107a40', '#b8860b'];
    for (let i = 0; i < sState.criticalOrbits.length; i++) {
      const { label, orbit } = sState.criticalOrbits[i];
      if (!orbit || orbit.length === 0) continue;
      const col = palette[i % palette.length];
      ctx.strokeStyle = col; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let k = 0; k < orbit.length; k++) {
        const p = worldToPixel(orbit[k].re, orbit[k].im);
        if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      // Seed dot + label.
      const p0 = worldToPixel(orbit[0].re, orbit[0].im);
      ctx.beginPath(); ctx.arc(p0.x, p0.y, 4.5, 0, 2*Math.PI);
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = col;
      ctx.font = '11px ui-monospace, Consolas, monospace';
      ctx.fillText(label, p0.x + 8, p0.y);
    }
  }

  // S5 / E11: paint user-drawn curve + its σ-iterates.
  function paintCurveImage() {
    const ctx = getCtx();
    // Draft (during shift-drag): light gray.
    if (sState.curveImageDraft && sState.curveImageDraft.length > 1) {
      ctx.strokeStyle = 'rgba(80, 80, 80, 0.6)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < sState.curveImageDraft.length; i++) {
        const p = worldToPixel(sState.curveImageDraft[i].re, sState.curveImageDraft[i].im);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    if (!sState.curveImage) return;
    const K = sState.curveImage.length;
    for (let it = 0; it < K; it++) {
      const pts = sState.curveImage[it];
      if (!pts || pts.length < 2) continue;
      // Color ramp blue → red as iteration grows.
      const t = (K > 1) ? (it / (K - 1)) : 0;
      const r = Math.round(40  + (180 - 40)  * t);
      const g = Math.round(80  + (50  - 80)  * t);
      const b = Math.round(180 + (40  - 180) * t);
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.85 - 0.5 * t})`;
      ctx.lineWidth = (it === 0) ? 1.8 : 1.1;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = worldToPixel(pts[i].re, pts[i].im);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }

  // S5 / E10: paint cycles as filled markers + connecting polylines.
  function paintCycles() {
    if (!sState.cycles || sState.cycles.length === 0) return;
    const ctx = getCtx();
    const palette = ['#108a40', '#b53030', '#5677a8', '#b8860b', '#7e2d8c'];
    for (let i = 0; i < sState.cycles.length; i++) {
      const c = sState.cycles[i];
      const col = palette[i % palette.length];
      // Connecting cycle polyline (closed).
      if (c.points.length >= 2) {
        ctx.strokeStyle = col; ctx.lineWidth = 1.4;
        if (ctx.setLineDash) ctx.setLineDash([3, 2]);
        ctx.beginPath();
        for (let k = 0; k < c.points.length; k++) {
          const p = worldToPixel(c.points[k].re, c.points[k].im);
          if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
      }
      // Dots at each cycle point.
      for (const w of c.points) {
        const p = worldToPixel(w.re, w.im);
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 2*Math.PI);
        ctx.fillStyle = col; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.3; ctx.stroke();
      }
      // Period label near the first point.
      const p0 = worldToPixel(c.points[0].re, c.points[0].im);
      ctx.fillStyle = col;
      ctx.font = '10px ui-monospace, Consolas, monospace';
      ctx.fillText('n=' + c.period, p0.x + 7, p0.y - 7);
    }
  }

  // S5 / H8: paint orbit-family sweep as a faint family of polylines.
  function paintSweepOrbits() {
    if (!sState.sweepOrbits || sState.sweepOrbits.length === 0) return;
    const ctx = getCtx();
    for (let i = 0; i < sState.sweepOrbits.length; i++) {
      const pts = sState.sweepOrbits[i];
      if (!pts || pts.length < 2) continue;
      const t = (sState.sweepOrbits.length > 1) ? (i / (sState.sweepOrbits.length - 1)) : 0;
      // Hue ramp around the wheel for seed position.
      const hue = Math.round(360 * t);
      ctx.strokeStyle = `hsla(${hue}, 65%, 45%, 0.65)`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let k = 0; k < pts.length; k++) {
        const p = worldToPixel(pts[k].re, pts[k].im);
        if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }

  // S3: paint the limit-set point cloud as 1-px translucent dots.
  function paintLimitSet() {
    const pts = sState.limitSet;
    if (!pts || pts.length === 0) return;
    const ctx = getCtx();
    ctx.fillStyle = 'rgba(255, 240, 80, 0.7)';      // pale yellow
    for (let i = 0; i < pts.length; i += 2) {
      const p = worldToPixel(pts[i], pts[i + 1]);
      // Use a 1×1 px rect for speed (faster than arc on dense clouds).
      ctx.fillRect(p.x - 0.5, p.y - 0.5, 1, 1);
    }
  }

  function setProgress(msg) {
    const el = document.getElementById('schwarz-progress');
    if (el) el.textContent = msg;
  }

  // ---------------------------------------------------------------------------
  // Colormaps + scale modes. Tables match schwarz-webgl.js so CPU and GPU
  // outputs render the same colors for the same input.
  // ---------------------------------------------------------------------------
  function cpuComputeT(n, maxIter, scaleMode, modK) {
    if (scaleMode === 'log') {
      return Math.min(1, Math.max(0, Math.log(n + 1) / Math.log(maxIter + 1)));
    }
    if (scaleMode === 'sqrt') {
      return Math.min(1, Math.max(0, Math.sqrt(n / maxIter)));
    }
    if (scaleMode === 'modulo') {
      const k = Math.max(2, modK | 0);
      return ((n - 1) % k) / k;
    }
    let t = (n - 1) / Math.max(1, maxIter - 1);
    if (scaleMode === 'discrete') {
      t = (Math.floor(t * maxIter) + 0.5) / maxIter;
    }
    return Math.min(1, Math.max(0, t));
  }
  function colormap(name, t) {
    t = Math.max(0, Math.min(1, t));
    if (name === 'cyclic') {
      const tt = (t * 6) % 1;
      return interpStops(tt, CMAP.magma);
    }
    return interpStops(t, CMAP[name] || CMAP.magma);
  }
  function interpStops(t, stops) {
    const n = stops.length - 1;
    const f = t * n;
    const i = Math.min(n - 1, Math.floor(f));
    const u = f - i;
    const a = stops[i], b = stops[i + 1];
    return [
      Math.round(a[0] + (b[0] - a[0]) * u),
      Math.round(a[1] + (b[1] - a[1]) * u),
      Math.round(a[2] + (b[2] - a[2]) * u),
    ];
  }
  const CMAP = {
    magma:      [[0,0,4],[28,16,68],[79,18,123],[129,37,129],[181,54,122],[229,80,100],[251,135,97],[254,194,135],[252,253,191]],
    inferno:    [[0,0,4],[31,12,72],[85,15,109],[136,34,106],[186,54,85],[227,89,51],[249,140,10],[249,201,50],[252,255,164]],
    plasma:     [[13,8,135],[75,3,161],[125,3,168],[168,34,150],[203,70,121],[229,107,93],[248,148,65],[253,195,40],[240,249,33]],
    viridis:    [[68,1,84],[72,40,120],[62,73,137],[49,104,142],[38,130,142],[31,158,137],[53,183,121],[109,205,89],[180,222,44],[253,231,37]],
    cividis:    [[0,32,76],[0,52,110],[40,75,124],[80,100,128],[120,127,128],[161,156,124],[197,187,108],[230,219,84],[253,253,51]],
    turbo:      [[48,18,59],[71,118,238],[26,196,231],[26,231,153],[97,239,71],[202,231,33],[255,184,33],[255,113,33],[224,40,9],[122,4,2]],
    grayscale:  [[0,0,0],[64,64,64],[128,128,128],[192,192,192],[255,255,255]],
    rainbow:    [[148,0,211],[75,0,130],[0,0,255],[0,255,0],[255,255,0],[255,127,0],[255,0,0]],
    iceandfire: [[10,40,100],[60,120,200],[160,210,240],[245,245,245],[250,210,90],[235,120,40],[170,30,30]],
    twotone:    [[245,245,248],[120,130,200],[40,50,110],[20,30,70]],
  };

  // ---------------------------------------------------------------------------
  // Test-only hook (see node-test.js). Opt-in via a window sentinel so a normal
  // browser load NEVER attaches it. Exposes the fractal-mode interaction
  // handlers + state so the click/dblclick disambiguation and the tiling-set
  // seed gate can be unit-tested without mounting the sidebar.
  // ---------------------------------------------------------------------------
  if (typeof window !== 'undefined' && window.__SCHWARZ_UI_TEST_HOOK__) {
    window.__schwarzUiTest = {
      sState, setMode, onCanvasClick, onCanvasDblClick, onMouseMove,
      runHoverOrbit, pinOrbitAt,
      get CLICK_DELAY() { return CLICK_DELAY; },
      set CLICK_DELAY(v) { CLICK_DELAY = v; },
    };
  }

})();
