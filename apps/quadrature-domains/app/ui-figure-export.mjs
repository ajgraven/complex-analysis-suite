// =============================================================================
// ui-figure-export.mjs -- The "Figure & export" sidebar card (Inverse tab).
//
// Formatting + export controls for producing publication-quality figures and
// mathematical art from the domain plot. Authored as a QD_UI factory
// (QD_UI.installFigureExport(ui)); ui.mjs invokes it among the late installs
// with the shared uiCtx (state, $, plot, ...), same as the other sidebar cards.
//
// This slice wires the ELEMENT-VISIBILITY toggles: each checkbox writes the
// matching state.figure.* flag (defined in ui-state.mjs) and repaints via
// plot.render(). The DomainPlot renderer already gates every draw layer on
// those flags (ui-domain-plot.mjs), so the plot updates on the next frame.
// Boundary colour / width and image export are added to this same card in
// later slices.
// =============================================================================
import { QD_UI } from './ui-registry.mjs';
import _QD from './solver.mjs';
const QD = _QD;

(function () {
  'use strict';

  // Checkbox id → state.figure flag. One table drives the wiring and keeps the
  // markup (index.html) and the state model (ui-state.mjs) in lockstep. Every
  // flag is stored "checked = the natural reading of the label": showX flags are
  // checked-means-shown; hideOverlays is checked-means-hidden — so the checkbox
  // state maps straight onto the flag with no inversion.
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

  QD_UI.installFigureExport = function installFigureExport(ui) {
    const state = ui.state || {};
    const $ = ui.$ || ((sel) => (typeof document !== 'undefined' ? document.querySelector(sel) : null));
    const card = $('#figure-export-card');
    if (!card) return {};                       // card absent (e.g. a trimmed test DOM)

    const fig = state.figure || (state.figure = {});
    const repaint = () => { if (ui.plot && typeof ui.plot.render === 'function') ui.plot.render(); };

    // Element-visibility checkboxes. For each: reflect the current model onto the
    // control first (so a preset / share-link restore that set the flag shows
    // through), then drive the model from the control on change. hideOverlays
    // defaults false (unchecked); every showX flag defaults true, and is treated
    // as shown unless EXPLICITLY false, matching the renderer's _show() gate.
    for (const [id, flag] of ELEMENT_TOGGLES) {
      const el = $('#' + id);
      if (!el) continue;
      el.checked = (flag === 'hideOverlays') ? !!fig[flag] : fig[flag] !== false;
      el.addEventListener('change', () => {
        fig[flag] = el.checked;
        repaint();
      });
    }

    // ----- Boundary colour + width -----------------------------------------
    // The color <input> can't represent "no override", so a checkbox owns on/off:
    // unchecked → boundaryColor = null (status-based default blue/red), checked →
    // the picker's value. The renderer applies it to a UNIVALENT boundary only; a
    // non-univalent ∂Ω stays warning-red (honest labelling), which the status
    // note below spells out.
    const customCb = $('#fig-boundary-custom');
    const colorInp = $('#fig-boundary-color');
    const applyBoundaryColor = () => {
      if (customCb && customCb.checked && colorInp) {
        fig.boundaryColor = colorInp.value;
        colorInp.disabled = false;
      } else {
        fig.boundaryColor = null;
        if (colorInp) colorInp.disabled = true;
      }
      repaint();
    };
    if (customCb) {
      customCb.checked = !!fig.boundaryColor;
      customCb.addEventListener('change', applyBoundaryColor);
    }
    if (colorInp) {
      if (fig.boundaryColor) colorInp.value = fig.boundaryColor;
      colorInp.disabled = !(customCb && customCb.checked);
      colorInp.addEventListener('input', applyBoundaryColor);
    }

    // Width override. Empty → null → the family default (1.6 bounded / 1.8 unbounded).
    const widthInp = $('#fig-boundary-width');
    if (widthInp) {
      if (typeof fig.boundaryWidth === 'number') widthInp.value = String(fig.boundaryWidth);
      widthInp.addEventListener('input', () => {
        const v = parseFloat(widthInp.value);
        fig.boundaryWidth = (isFinite(v) && v > 0) ? v : null;
        repaint();
      });
    }

    // ----- Honest-labelling status note ------------------------------------
    // Tells the figure-maker whether the CURRENT boundary is a valid (univalent)
    // QD, so a recolour is never applied blind. Reads the exact data on the plot
    // (what is actually drawn); refreshed on each solve.
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
        // setData runs synchronously in the solve handler; defer a frame so the
        // note reads the freshly-set plot.data, not the previous solve's.
        const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
        QD.PrimarySolution.subscribe(() => raf(refreshNote));
      }
    } catch (e) { /* the note is diagnostic only — never break install over it */ }
    refreshNote();

    // ----- PNG export ------------------------------------------------------
    // Re-render the plot off-screen at the chosen resolution (crisp lines, not a
    // bitmap upscale) on white or a transparent background, then download it. The
    // download is the user's own click on their own figure — no network egress.
    const exportPng = () => {
      const plot = ui.plot;
      if (!plot || typeof plot.renderToCanvas !== 'function') return;
      const cssW = plot.cssW || 0, cssH = plot.cssH || 0;
      if (!(cssW > 0 && cssH > 0)) return;
      const scaleSel = $('#fig-export-scale');
      const widthInp2 = $('#fig-export-width');
      const bgSel = $('#fig-export-bg');
      const scale = scaleSel ? (parseFloat(scaleSel.value) || 1) : 2;
      const customW = widthInp2 ? parseInt(widthInp2.value, 10) : NaN;
      const targetW = (isFinite(customW) && customW > 0) ? customW : Math.round(cssW * scale);
      const targetH = Math.round(cssH * (targetW / cssW));
      const transparent = bgSel ? (bgSel.value === 'transparent') : false;
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

    // Small surface for tests / later slices.
    return { ELEMENT_TOGGLES, refreshNote, applyBoundaryColor, exportPng };
  };
})();
