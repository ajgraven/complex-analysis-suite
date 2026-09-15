// =============================================================================
// schwarz-export-plan.mjs -- the DOM-free half of the Schwarz tab's image export.
//
// Two decisions that are worth making without a canvas, so the node gate can hold
// them: how big the exported image may actually BE, and where its detail really
// comes from. The compositing half lives in schwarz-features.js.
//
// WHY A CAP. The export asks the renderer for a drawing buffer `mult` times the
// display size. A GPU refuses one past MAX_VIEWPORT_DIMS / MAX_RENDERBUFFER_SIZE,
// and it refuses it by failing the render — not by returning a smaller image — so
// an uncapped multiplier is a blank or truncated PNG rather than a slow one. The
// cap is therefore part of the plan, not an error path, and the effective
// multiplier it yields is a REAL number: clamping has to preserve the aspect
// ratio of what is on screen, and snapping back to a whole multiplier would throw
// away resolution the GPU was willing to give.
//
// WHY AN HONEST LABEL. "High resolution" is only true of the layer the renderer
// redraws. The 2D overlays are re-drawn under a scale transform, so they are
// genuinely vector-crisp at any size; the GPU fractal is genuinely re-rendered.
// But a CPU field is computed once at the resolution slider (192-768) and can
// only be UPSCALED into the export, and the sphere's fractal arrives as a texture
// of a fixed size mapped onto geometry. Presenting either as "4x" would claim
// detail that is not in the file, which the suite's honest-labelling guardrail
// exists to prevent — so `describeExportDetail` says which layer got what.
// =============================================================================

/** Multipliers offered in the UI. 8x is reachable only on a roomy GPU + a small view. */
export const EXPORT_MULTIPLIERS = [1, 2, 4, 8];

/**
 * Decide the exported pixel size.
 *
 *   cssW/cssH — the view's size in CSS pixels (what is on screen).
 *   mult      — the multiplier the user asked for.
 *   maxDim    — the largest edge this renderer will accept, in device pixels
 *               (0/absent ⇒ unknown, no cap applied).
 *
 * Returns { outW, outH, mult, requestedMult, clamped, maxDim }, where `mult` is
 * what was actually applied. `clamped` is true only when the cap BOUND — i.e. the
 * user asked for more than the GPU would give — so the UI can say so.
 */
export function planExportSize(opts) {
  const o = opts || {};
  const cssW = Math.max(1, Math.round(+o.cssW || 0));
  const cssH = Math.max(1, Math.round(+o.cssH || 0));
  const requestedMult = Math.max(1, +o.mult || 1);
  const maxDim = Number.isFinite(+o.maxDim) && +o.maxDim > 0 ? Math.floor(+o.maxDim) : 0;

  let mult = requestedMult;
  if (maxDim) {
    // The longest edge is what the cap binds on; scaling both by the same factor
    // is what keeps the exported frame the frame the user is looking at.
    const fits = maxDim / Math.max(cssW, cssH);
    if (fits < mult) mult = fits;
  }
  // A display already larger than the cap yields mult < 1 — a genuine downscale.
  // It is still the right answer (a truncated render is worse), and `clamped`
  // reports it.
  const outW = Math.max(1, Math.floor(cssW * mult));
  const outH = Math.max(1, Math.floor(cssH * mult));
  return { outW, outH, mult, requestedMult, clamped: mult < requestedMult, maxDim };
}

/**
 * Say where the exported image's detail actually comes from.
 *
 *   view     — 'plane' | 'z' | 'sphere'
 *   onGpu    — the escape-time field is being rendered by the GPU shader
 *   outW/outH— the planned output size
 *   fieldW/H — the CPU field's own resolution, when there is one
 *   texSize  — the sphere's fractal texture size, when in sphere view
 *
 * Returns { detail, fieldUpscaled }. `fieldUpscaled` is the decision a test can
 * pin: true exactly when the field layer carries less detail than the file's
 * pixel count implies.
 */
export function describeExportDetail(opts) {
  const o = opts || {};
  const size = o.outW + '×' + o.outH;
  if (o.view === 'sphere') {
    const tex = +o.texSize || 0;
    // The sphere is geometry: its silhouette, boundary curve and markers are
    // re-rendered at the export size and genuinely sharpen. The fractal is a
    // texture pinned to the sphere, so its detail is texSize, whatever the frame.
    return {
      fieldUpscaled: true,
      detail: 'sphere rendered at ' + size +
              (tex ? '; its fractal texture stays ' + tex + '×' + tex +
                     ' — raise it in the sphere card for more detail on the surface' : ''),
    };
  }
  if (onGpuField(o)) {
    return { fieldUpscaled: false, detail: 'fractal re-rendered at ' + size + '; overlays drawn at full size' };
  }
  const fw = +o.fieldW || 0, fh = +o.fieldH || 0;
  if (fw && fh) {
    return {
      fieldUpscaled: true,
      detail: 'overlays drawn at ' + size + '; the escape-time field was computed at ' +
              fw + '×' + fh + ' and is upscaled — raise Resolution, or switch the renderer to GPU, for a sharper field',
    };
  }
  return { fieldUpscaled: false, detail: 'drawn at ' + size };
}

function onGpuField(o) { return !!o.onGpu && o.view !== 'sphere'; }

/** Filename for a downloaded export. Kept here so the node gate can pin its shape. */
export function exportFileName(opts) {
  const o = opts || {};
  const stamp = (o.now instanceof Date ? o.now : new Date()).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const view = o.view === 'sphere' ? 'sphere' : o.view === 'z' ? 'zdisk' : 'plane';
  return 'qd-schwarz-' + view + '-' + stamp + '-' + o.outW + 'x' + o.outH + '.png';
}
