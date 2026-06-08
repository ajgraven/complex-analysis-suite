// =============================================================================
// algebra-canvas.js -- DAG renderer for the Algebra workspace (QD.AlgebraCanvas).
//
// Renders a QD.AlgebraStore as a horizontal derivation graph: equation nodes laid
// out in columns (column = elimination depth), SVG cubic-Bézier edges for
// derivations, and absolutely-positioned HTML cards (KaTeX math) so nodes stay
// selectable / copyable / scrollable. Pan (drag background) + zoom (wheel) via a
// single CSS transform on the wrapper holding both the SVG and the card layer.
// Selection (≤2 nodes) drives the elimination panel in algebra-ui.js.
//
// SVG+HTML (not the raster #canvas used by the plot/sphere tabs) because nodes
// need real typeset math, text selection, and per-card hit-testing.
// =============================================================================

(function () {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const DISPLAY_CAP = 120;            // elide KaTeX above this term count
  const COLW = 340, ROWH = 130, CARDW = 300;

  // Local KaTeX renderer with the codebase's plain-text fallback.
  function renderKatex(el, expr, display) {
    if (typeof katex === 'undefined') { el.textContent = expr; return; }
    try { katex.render(expr, el, { displayMode: !!display, throwOnError: false }); }
    catch (e) { el.textContent = expr; }
  }
  function div(cls) { const d = document.createElement('div'); if (cls) d.className = cls; return d; }
  function relSuffix(rel) { return rel === '>' ? ' > 0' : rel === '≠' ? ' \\neq 0' : ' = 0'; }

  function create(container, handlers) {
    handlers = handlers || {};
    container.innerHTML = '';
    container.classList.add('algebra-graph');
    const viewport = div('algebra-viewport');
    const wrap = div('algebra-wrap');
    const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('class', 'algebra-edges');
    const layer = div('algebra-nodes');
    wrap.appendChild(svg); wrap.appendChild(layer); viewport.appendChild(wrap); container.appendChild(viewport);

    let tx = 24, ty = 24, scale = 1;
    let selected = [];
    let lastStore = null, lastLatexOf = null;

    function applyTransform() { wrap.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; }

    // Pan when the drag starts on the empty background (not on a card).
    viewport.addEventListener('mousedown', (e) => {
      if (e.target !== viewport && e.target !== wrap && e.target !== svg) return;
      const sx = e.clientX, sy = e.clientY, ox = tx, oy = ty;
      const mv = (ev) => { tx = ox + (ev.clientX - sx); ty = oy + (ev.clientY - sy); applyTransform(); };
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
    // Zoom about the cursor.
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = viewport.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const ns = Math.max(0.25, Math.min(3, scale * f));
      tx = mx - (mx - tx) * (ns / scale); ty = my - (my - ty) * (ns / scale); scale = ns;
      applyTransform();
    }, { passive: false });

    function renderSelection() {
      layer.querySelectorAll('.algebra-node').forEach((el) =>
        el.classList.toggle('selected', selected.indexOf(el.dataset.id) >= 0));
    }
    function toggleSelect(id) {
      const i = selected.indexOf(id);
      if (i >= 0) selected.splice(i, 1);
      else { selected.push(id); if (selected.length > 2) selected.shift(); }
      renderSelection();
      if (handlers.onSelect) handlers.onSelect(selected.slice());
    }
    function getSelection() { return selected.slice(); }
    function clearSelection() { selected = []; renderSelection(); if (handlers.onSelect) handlers.onSelect([]); }

    function render(store, latexOf) {
      lastStore = store; lastLatexOf = latexOf;
      layer.innerHTML = '';
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      selected = selected.filter((id) => store.get(id));

      const cols = new Map();
      for (const n of store.list()) { const c = n.column || 0; if (!cols.has(c)) cols.set(c, []); cols.get(c).push(n); }
      const pos = new Map();
      for (const [c, arr] of cols) arr.forEach((n, row) => pos.set(n.id, { x: 24 + c * COLW, y: 24 + row * ROWH }));

      for (const n of store.list()) {
        const p = pos.get(n.id);
        const card = div('algebra-node algebra-' + n.kind);
        card.dataset.id = n.id;
        card.style.left = p.x + 'px'; card.style.top = p.y + 'px'; card.style.width = CARDW + 'px';
        const head = div('algebra-node-head');
        head.textContent = n.label + (n.rel === '>' ? '  (inequality)' : n.rel === '≠' ? '  (≠ 0)' : '');
        card.appendChild(head);
        const math = div('algebra-node-math');
        if (n.poly.size() > DISPLAY_CAP) math.innerHTML = '<span class="hint">[' + n.poly.size() + ' terms — Inspect / Export]</span>';
        else renderKatex(math, n.poly.toLatex(latexOf) + relSuffix(n.rel), false);
        card.appendChild(math);
        card.addEventListener('click', (ev) => { ev.stopPropagation(); toggleSelect(n.id); if (handlers.onClick) handlers.onClick(n.id); });
        layer.appendChild(card);
        p.el = card;
      }

      for (const e of store.edges) {
        const a = pos.get(e.from), b = pos.get(e.to);
        if (!a || !b || !a.el || !b.el) continue;
        const ax = a.x + a.el.offsetWidth, ay = a.y + a.el.offsetHeight / 2;
        const bx = b.x, by = b.y + b.el.offsetHeight / 2;
        const mx = (ax + bx) / 2;
        const path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('d', 'M' + ax + ',' + ay + ' C' + mx + ',' + ay + ' ' + mx + ',' + by + ' ' + bx + ',' + by);
        path.setAttribute('class', 'algebra-edge');
        svg.appendChild(path);
      }

      let maxX = 0, maxY = 0;
      for (const [, p] of pos) if (p.el) { maxX = Math.max(maxX, p.x + p.el.offsetWidth); maxY = Math.max(maxY, p.y + p.el.offsetHeight); }
      svg.style.width = (maxX + 60) + 'px'; svg.style.height = (maxY + 60) + 'px';
      renderSelection();
    }
    function rerender() { if (lastStore) render(lastStore, lastLatexOf); }
    function fit() { tx = 24; ty = 24; scale = 1; applyTransform(); }

    applyTransform();
    return { render, rerender, fit, getSelection, clearSelection };
  }

  window.QD = window.QD || {};
  window.QD.AlgebraCanvas = { create };
})();
