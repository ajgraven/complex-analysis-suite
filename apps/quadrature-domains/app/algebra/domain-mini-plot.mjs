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

// momentPlotData(w, order, node, opts) → { boundary, nodes, view } for the MOMENT route (Phase C1).
// The genuine map there is a POLYNOMIAL Riemann map φ(z) = a + Σ_{k=1}^{order} w_k zᵏ (rotation gauge
// w₁>0 real), where a = φ(0) is the quadrature node. So the boundary φ(∂𝔻) is a direct trig sum of the
// coefficients — no evalPhi and no (z_j,A) ansatz. Pure, unit-testable. Returns null on bad input / a
// non-finite sample (same SVG y-down convention as domainPlotData).
//   w    : [null, w1, {re,im}₂, …, {re,im}_order]  (w1 may be a number or {re}).
//   node : {re,im} = a (the constant term / quadrature node); defaults to the origin.
export function momentPlotData(w, order, node, opts) {
  opts = opts || {};
  const N = Math.max(24, opts.samples || 240);
  if (!Array.isArray(w) || !(order >= 1)) return null;
  const a = node || { re: 0, im: 0 };
  const coef = [];   // coef[k] = {re,im} for k = 1..order
  for (let k = 1; k <= order; k++) {
    if (k === 1) { const w1 = (w[1] && w[1].re != null) ? w[1].re : w[1]; coef[k] = { re: w1 || 0, im: 0 }; }
    else coef[k] = { re: (w[k] && w[k].re) || 0, im: (w[k] && w[k].im) || 0 };
  }
  const boundary = [];
  for (let j = 0; j < N; j++) {
    const th = (2 * Math.PI * j) / N;
    let re = a.re || 0, im = a.im || 0;
    for (let k = 1; k <= order; k++) { const c = Math.cos(k * th), s = Math.sin(k * th); re += coef[k].re * c - coef[k].im * s; im += coef[k].re * s + coef[k].im * c; }
    if (!isFinite(re) || !isFinite(im)) return null;
    boundary.push([re, -im]);   // SVG y grows downward
  }
  const nodes = [[a.re || 0, a.im ? -a.im : 0]];   // the single quadrature node a = φ(0) (avoid −0)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of boundary) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (!isFinite(minX) || !isFinite(minY)) return null;
  const bw = maxX - minX, bh = maxY - minY, pad = 0.1 * Math.max(bw, bh, 1e-6);
  return { boundary, nodes, view: [minX - pad, minY - pad, bw + 2 * pad, bh + 2 * pad] };
}

// rationalPlotData(m, nodes, opts) → { boundary, nodes, view } for the MULTI-NODE rational route (Phase C2).
// The genuine map there is the degree-2 RATIONAL map φ(z) = w0 + R(z + d·z²)/(1 − c·z²) (real w0,R,d,c in
// this increment), so its boundary φ(∂𝔻) samples straight from the reconstructed shape — no evalPhi. Pure.
//   m     : { c, d, R, w0 } (numeric; w0 a number or {re,im}); c = t² < 1 (poles outside 𝔻̄).
//   nodes : the quadrature nodes a_j to mark (each {re,im} or a real number); [] to omit.
export function rationalPlotData(m, nodes, opts) {
  opts = opts || {};
  const N = Math.max(24, opts.samples || 240);
  if (!m || m.R == null || m.c == null || !(m.c < 1)) return null;
  const c = m.c, d = m.d || 0, R = m.R;
  const w0re = (m.w0 && m.w0.re != null) ? m.w0.re : (m.w0 || 0), w0im = (m.w0 && m.w0.im != null) ? m.w0.im : 0;
  const boundary = [];
  for (let k = 0; k < N; k++) {
    const th = (2 * Math.PI * k) / N, zr = Math.cos(th), zi = Math.sin(th);
    const z2r = zr * zr - zi * zi, z2i = 2 * zr * zi;
    const nr = zr + d * z2r, ni = zi + d * z2i;         // z + d z²
    const dr = 1 - c * z2r, di = -c * z2i;              // 1 − c z²
    const den = dr * dr + di * di;
    if (den < 1e-14) return null;                        // a pole hit the circle
    const qr = (nr * dr + ni * di) / den, qi = (ni * dr - nr * di) / den;   // (z+dz²)/(1−cz²)
    const re = w0re + R * qr, im = w0im + R * qi;
    if (!isFinite(re) || !isFinite(im)) return null;
    boundary.push([re, -im]);                            // SVG y grows downward
  }
  const nds = (nodes || []).map((a) => { const ar = (a && a.re != null) ? a.re : (a || 0), ai = (a && a.im != null) ? a.im : 0; return [ar, ai ? -ai : 0]; });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of boundary) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (!isFinite(minX) || !isFinite(minY)) return null;
  const bw = maxX - minX, bh = maxY - minY, pad = 0.1 * Math.max(bw, bh, 1e-6);
  return { boundary, nodes: nds, view: [minX - pad, minY - pad, bw + 2 * pad, bh + 2 * pad] };
}

// trianglePlotData(m, nodes, opts) → { boundary, nodes, view } for the EQUILATERAL-TRIANGLE route (Phase C3).
// The genuine map is φ(z) = R·z/(1 − c·z³) (real R, c<1, centred at 0), so its boundary φ(∂𝔻) samples straight
// from the reconstructed shape. Pure.  m: { c, R } (numeric); nodes: the 3 quadrature nodes to mark.
export function trianglePlotData(m, nodes, opts) {
  opts = opts || {};
  const N = Math.max(24, opts.samples || 240);
  if (!m || m.R == null || m.c == null || !(Math.abs(m.c) < 1)) return null;
  const c = m.c, R = m.R;
  const boundary = [];
  for (let k = 0; k < N; k++) {
    const th = (2 * Math.PI * k) / N, zr = Math.cos(th), zi = Math.sin(th);
    const z3r = zr * (zr * zr - 3 * zi * zi), z3i = zi * (3 * zr * zr - zi * zi);   // z³
    const dr = 1 - c * z3r, di = -c * z3i;             // 1 − c z³ (c real)
    const den = dr * dr + di * di;
    if (den < 1e-14) return null;                       // a pole hit the circle
    const nr = R * zr, ni = R * zi;                     // R z
    const re = (nr * dr + ni * di) / den, im = (ni * dr - nr * di) / den;   // Rz/(1−cz³)
    if (!isFinite(re) || !isFinite(im)) return null;
    boundary.push([re, -im]);                           // SVG y grows downward
  }
  const nds = (nodes || []).map((a) => { const ar = (a && a.re != null) ? a.re : (a || 0), ai = (a && a.im != null) ? a.im : 0; return [ar, ai ? -ai : 0]; });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of boundary) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (!isFinite(minX) || !isFinite(minY)) return null;
  const bw = maxX - minX, bh = maxY - minY, pad = 0.1 * Math.max(bw, bh, 1e-6);
  return { boundary, nodes: nds, view: [minX - pad, minY - pad, bw + 2 * pad, bh + 2 * pad] };
}
