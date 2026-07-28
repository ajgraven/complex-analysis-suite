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

    // Small surface for tests / later slices.
    return { ELEMENT_TOGGLES };
  };
})();
