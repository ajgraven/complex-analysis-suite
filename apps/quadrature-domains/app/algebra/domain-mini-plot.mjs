// =============================================================================
// domain-mini-plot.js -- a small, PURE geometry helper for the Algebra tab's verdict
// card: from a reconstructed bounded-QD map φ, produce the SVG-ready points of the
// domain boundary φ(∂𝔻) and the quadrature nodes φ(z_j), so the verdict can draw a
// thumbnail of the solved quadrature domain next to the exact boundary curve (roadmap
// #3 — closing the algebra→geometry loop). Pure: no DOM, no QD namespace; the φ
// evaluator is injected (algebra-ui passes QD.evalPhi, the same evaluator the geometry
// tab uses), so this stays unit-testable and self-contained.
// =============================================================================

// domainPlotData(phi, evalPhi, opts) → { boundary:[[x,y],…], nodes:[[x,y],…],
//   view:[minX,minY,w,h] } in SVG coordinates (y flipped so mathematical +i points UP),
// or null if φ is not a bounded QD / the evaluator fails / a sample is non-finite.
//   phi     : the phiFromAlgebraSolution shape { w0, branches:[{ z, A:[…] }] } (numeric).
//   evalPhi : (zeta:{re,im}, phi) → {re,im}, the boundary map evaluator (QD.evalPhi).
//   opts.samples : boundary sample count (default 240; min 24).
export function domainPlotData(phi, evalPhi, opts) {
  opts = opts || {};
  const N = Math.max(24, opts.samples || 240);
  if (!phi || !Array.isArray(phi.branches) || typeof evalPhi !== 'function') return null;
  const boundary = [];
  for (let k = 0; k < N; k++) {
    const th = (2 * Math.PI * k) / N;
    let w;
    try { w = evalPhi({ re: Math.cos(th), im: Math.sin(th) }, phi); }
    catch (e) { return null; }
    if (!w || !isFinite(w.re) || !isFinite(w.im)) return null;
    boundary.push([w.re, -w.im]);   // SVG y grows downward
  }
  // Quadrature nodes a_j = φ(z_j) (the pole PRE-images map to the interior node data).
  const nodes = [];
  for (const b of phi.branches) {
    let a;
    try { a = evalPhi(b.z, phi); } catch (e) { a = null; }
    if (a && isFinite(a.re) && isFinite(a.im)) nodes.push([a.re, -a.im]);
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of boundary) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (!isFinite(minX) || !isFinite(minY)) return null;
  const bw = maxX - minX, bh = maxY - minY, pad = 0.1 * Math.max(bw, bh, 1e-6);
  return { boundary, nodes, view: [minX - pad, minY - pad, bw + 2 * pad, bh + 2 * pad] };
}
