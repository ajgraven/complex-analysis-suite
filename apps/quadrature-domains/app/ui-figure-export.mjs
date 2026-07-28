// =============================================================================
// ui-figure-export.mjs -- The "Figure & export" sidebar card (Inverse tab).
//
// Formatting + export controls for producing publication-quality figures and
// mathematical art from the domain plot. Authored as a QD_UI factory
// (QD_UI.installFigureExport(ui)); ui.mjs invokes it among the late installs
// with the shared uiCtx (state, $, plot, ...), same as the other sidebar cards.
//
// Controls write the nested state.figure model (defined in ui-state.mjs) and
// repaint via plot.render(); the DomainPlot renderer gates every draw layer and
// resolves every colour/width against state.figure (ui-domain-plot.mjs), so the
// plot updates on the next frame. Sections: element visibility, boundary colour
// / width, plot-surface colours, one-click style presets, and PNG export.
// reflect() is the single place that syncs every control FROM the model (after a
// preset / reset, and once at install — also the seam a future share-link
// restore would use).
// =============================================================================
import { QD_UI } from './ui-registry.mjs';
import _QD from './solver.mjs';
const QD = _QD;

(function () {
  'use strict';

  // Checkbox id → state.figure flag. showX flags are checked-means-shown;
  // hideOverlays is checked-means-hidden — so the checkbox maps straight on with
  // no inversion.
  const ELEMENT_TOGGLES = [
    ['fig-axes',          'showAxes'],
    ['fig-grid',          'showGrid'],
    ['fig-ticks',         'showTickLabels'],
    ['fig-fill',          'showFill'],
    ['fig-nodes',         'showNodes'],
    ['fig-w0',            'showW0'],
    ['fig-cusps',         'showCusps'],
    ['fig-hide-overlays', 'hideOverlays'],
  ];

  // Baseline figure settings — the reset target for the "Default" preset and the
  // base every other preset is overlaid on. Mirrors ui-state.mjs's state.figure
  // defaults (kept in sync by hand; the figure-export test asserts the keys).
  const DEFAULT_FIGURE = {
    showAxes: true, showGrid: true, showTickLabels: true, showFill: true,
    showNodes: true, showW0: true, showCusps: true, hideOverlays: false,
    boundaryColor: null, boundaryWidth: null,
    bg: null, grid: null, gridLabel: null, axis: null,
  };

  // One-click style presets — each a PARTIAL state.figure overlaid on
  // DEFAULT_FIGURE, so switching presets never leaves a stray setting from the
  // last. These are pure presentation: a preset's boundaryColor still applies to
  // a UNIVALENT boundary only (the renderer keeps a non-univalent ∂Ω warning-red
  // and the status note says so), so no preset can make an invalid QD read as
  // valid.
  const PRESETS = {
    publication: { hideOverlays: true, bg: '#ffffff', boundaryWidth: 2 },
    print:       { hideOverlays: true, showFill: false, showGrid: false, showNodes: false, showW0: false, showCusps: false,
                   bg: '#ffffff', axis: '#000000', gridLabel: '#000000', boundaryColor: '#000000', boundaryWidth: 2 },
    dark:        { hideOverlays: true, bg: '#12141a', grid: '#2a2e3a', gridLabel: '#aab2c5', axis: '#556070',
                   boundaryColor: '#7fb0ff', boundaryWidth: 2 },
    grayscale:   { hideOverlays: true, bg: '#ffffff', grid: '#dddddd', gridLabel: '#666666', axis: '#888888',
                   boundaryColor: '#222222', boundaryWidth: 2 },
    colorblind:  { hideOverlays: true, bg: '#ffffff', boundaryColor: '#0072b2', boundaryWidth: 2 },
  };

  const COLOUR_PICKERS = [['fig-color-bg', 'bg'], ['fig-color-grid', 'grid'], ['fig-color-axis', 'axis']];
  const COLOUR_DEFAULTS = { 'fig-color-bg': '#fafafa', 'fig-color-grid': '#e8eaef', 'fig-color-axis': '#bbbbbb' };

  QD_UI.installFigureExport = function installFigureExport(ui) {
    const state = ui.state || {};
    const $ = ui.$ || ((sel) => (typeof document !== 'undefined' ? document.querySelector(sel) : null));
    const card = $('#figure-export-card');
    if (!card) return {};                       // card absent (e.g. a trimmed test DOM)

    const fig = state.figure || (state.figure = {});
    const repaint = () => { if (ui.plot && typeof ui.plot.render === 'function') ui.plot.render(); };

    // --- Element-visibility checkboxes -------------------------------------
    for (const [id, flag] of ELEMENT_TOGGLES) {
      const el = $('#' + id);
      if (!el) continue;
      el.addEventListener('change', () => { fig[flag] = el.checked; repaint(); });
    }

    // --- Boundary colour + width -------------------------------------------
    // The color <input> can't represent "no override", so a checkbox owns on/off:
    // unchecked → boundaryColor = null (status-based default), checked → the
    // picker's value. The renderer applies it to a UNIVALENT boundary only.
    const customCb = $('#fig-boundary-custom');
    const colorInp = $('#fig-boundary-color');
    const applyBoundaryColor = () => {
      if (customCb && customCb.checked && colorInp) { fig.boundaryColor = colorInp.value; colorInp.disabled = false; }
      else { fig.boundaryColor = null; if (colorInp) colorInp.disabled = true; }
      repaint();
    };
    if (customCb) customCb.addEventListener('change', applyBoundaryColor);
    if (colorInp) colorInp.addEventListener('input', applyBoundaryColor);

    const widthInp = $('#fig-boundary-width');
    if (widthInp) {
      widthInp.addEventListener('input', () => {
        const v = parseFloat(widthInp.value);
        fig.boundaryWidth = (isFinite(v) && v > 0) ? v : null;
        repaint();
      });
    }

    // --- Plot-surface colour pickers ---------------------------------------
    for (const [id, key] of COLOUR_PICKERS) {
      const el = $('#' + id);
      if (!el) continue;
      el.addEventListener('input', () => { fig[key] = el.value; repaint(); });
    }

    // --- reflect(): sync every control FROM state.figure -------------------
    // Called after a preset / reset (which rewrite fig wholesale) and once at
    // install, so the controls always mirror the model. Also the seam a future
    // share-link restore hooks into.
    const reflect = () => {
      for (const [id, flag] of ELEMENT_TOGGLES) {
        const el = $('#' + id);
        if (el) el.checked = (flag === 'hideOverlays') ? !!fig[flag] : fig[flag] !== false;
      }
      if (customCb) customCb.checked = !!fig.boundaryColor;
      if (colorInp) { colorInp.value = fig.boundaryColor || '#1a3e7a'; colorInp.disabled = !(customCb && customCb.checked); }
      if (widthInp) widthInp.value = (typeof fig.boundaryWidth === 'number') ? String(fig.boundaryWidth) : '';
      for (const [id, key] of COLOUR_PICKERS) {
        const el = $('#' + id);
        if (el) el.value = fig[key] || COLOUR_DEFAULTS[id];
      }
    };

    // "Reset colours" — clear the surface + boundary colours (not the element
    // toggles or width), then re-sync the pickers.
    const colorsReset = $('#fig-colors-reset');
    if (colorsReset) {
      colorsReset.addEventListener('click', () => {
        fig.bg = null; fig.grid = null; fig.gridLabel = null; fig.axis = null;
        fig.boundaryColor = null;
        reflect();
        repaint();
      });
    }

    // --- Style presets -----------------------------------------------------
    const applyPreset = (name) => {
      Object.assign(fig, DEFAULT_FIGURE);       // clear first, so no stale setting
      const p = PRESETS[name];
      if (p) Object.assign(fig, p);
      reflect();
      repaint();
    };
    const presetSel = $('#fig-preset');
    if (presetSel) presetSel.addEventListener('change', () => applyPreset(presetSel.value));

    // --- Honest-labelling status note --------------------------------------
    // Tells the figure-maker whether the CURRENT boundary is a valid (univalent)
    // QD, so a recolour is never applied blind. Reads the exact data on the plot;
    // refreshed on each solve.
    const refreshNote = () => {
      const note = $('#fig-univalence-note');
      if (!note) return;
      const d = ui.plot && ui.plot.data;
      const hasBoundary = !!(d && d.boundaryPts && d.boundaryPts.length > 0);
      if (!hasBoundary) {
        note.textContent = 'No solved boundary yet — solve a domain to recolour it.';
        note.dataset.kind = 'muted';
      } else if (d.univalent) {
        note.textContent = 'Boundary is univalent ✓ — a custom colour applies to it.';
        note.dataset.kind = 'ok';
      } else {
        note.textContent = 'Boundary is non-univalent — drawn in warning red regardless of the colour above.';
        note.dataset.kind = 'warn';
      }
    };
    try {
      if (typeof QD !== 'undefined' && QD.PrimarySolution && QD.PrimarySolution.subscribe) {
        // Defer to a macrotask so the note reads the freshly-set plot.data (setData
        // runs synchronously later in the same solve handler). setTimeout, NOT
        // requestAnimationFrame: rAF PAUSES in a background/hidden tab, which would
        // leave this honest-labelling note stale until the tab is refocused; a
        // throttled timeout still fires.
        QD.PrimarySolution.subscribe(() => setTimeout(refreshNote, 0));
      }
    } catch (e) { /* the note is diagnostic only — never break install over it */ }

    // --- PNG export --------------------------------------------------------
    // Re-render the plot off-screen at the chosen resolution (crisp lines, not a
    // bitmap upscale) on white or a transparent background, then download it. The
    // download is the user's own click on their own figure — no network egress.
    // Target pixel size + background for export/copy, from the Export controls.
    // Shared so the downloaded PNG and the clipboard image are byte-for-byte the
    // same framing.
    const exportTargetSize = () => {
      const plot = ui.plot;
      const cssW = (plot && plot.cssW) || 0, cssH = (plot && plot.cssH) || 0;
      const scaleSel = $('#fig-export-scale');
      const widthInp2 = $('#fig-export-width');
      const bgSel = $('#fig-export-bg');
      const scale = scaleSel ? (parseFloat(scaleSel.value) || 1) : 2;
      const customW = widthInp2 ? parseInt(widthInp2.value, 10) : NaN;
      const targetW = (isFinite(customW) && customW > 0) ? customW : Math.round(cssW * scale);
      const targetH = cssW > 0 ? Math.round(cssH * (targetW / cssW)) : 0;
      const transparent = bgSel ? (bgSel.value === 'transparent') : false;
      return { cssW, cssH, targetW, targetH, transparent };
    };

    // Transient feedback for the Copy button (the export downloads, so it's
    // self-evident; copy needs a word since nothing visibly changes).
    const copyStatus = (msg, kind) => {
      const el = $('#fig-copy-status');
      if (!el) return;
      el.textContent = msg;
      el.dataset.kind = (kind === 'ok') ? 'ok' : 'warn';
      setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 4000);
    };

    const exportPng = () => {
      const plot = ui.plot;
      if (!plot || typeof plot.renderToCanvas !== 'function') return;
      const { cssW, cssH, targetW, targetH, transparent } = exportTargetSize();
      if (!(cssW > 0 && cssH > 0)) return;
      const canvas = plot.renderToCanvas(targetW, targetH, { transparent });
      if (!canvas) return;
      const name = 'quadrature-domain-' + targetW + 'x' + targetH + '.png';
      const download = (href, revoke) => {
        const a = document.createElement('a');
        a.href = href; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        if (revoke) setTimeout(() => { try { URL.revokeObjectURL(href); } catch (e) {} }, 1000);
      };
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((blob) => { if (blob) download(URL.createObjectURL(blob), true); }, 'image/png');
      } else if (typeof canvas.toDataURL === 'function') {
        download(canvas.toDataURL('image/png'), false);
      }
    };
    const exportBtn = $('#fig-export-png');
    if (exportBtn) exportBtn.addEventListener('click', exportPng);

    // Copy the same framing/size/background to the clipboard as a PNG. Uses the
    // ClipboardItem-with-a-Promise form so navigator.clipboard.write is called
    // synchronously in the click gesture (the async toBlob would otherwise lose
    // the user-activation and the write would be rejected).
    const copyImage = () => {
      const plot = ui.plot;
      if (!plot || typeof plot.renderToCanvas !== 'function') return;
      const canWrite = typeof navigator !== 'undefined' && navigator.clipboard &&
        typeof navigator.clipboard.write === 'function' && typeof ClipboardItem !== 'undefined';
      if (!canWrite) { copyStatus('Clipboard image copy isn’t supported here', 'warn'); return; }
      const { cssW, cssH, targetW, targetH, transparent } = exportTargetSize();
      if (!(cssW > 0 && cssH > 0)) return;
      const canvas = plot.renderToCanvas(targetW, targetH, { transparent });
      if (!canvas || typeof canvas.toBlob !== 'function') { copyStatus('Copy failed', 'warn'); return; }
      const blob = new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        .then(() => copyStatus('Copied to clipboard ✓', 'ok'))
        .catch(() => copyStatus('Copy blocked by the browser', 'warn'));
    };
    const copyBtn = $('#fig-copy-image');
    if (copyBtn) copyBtn.addEventListener('click', copyImage);

    reflect();       // initial control sync
    refreshNote();

    // Small surface for tests / later slices.
    return { ELEMENT_TOGGLES, PRESETS, DEFAULT_FIGURE, reflect, applyPreset, refreshNote, applyBoundaryColor, exportPng, copyImage, exportTargetSize };
  };
})();
