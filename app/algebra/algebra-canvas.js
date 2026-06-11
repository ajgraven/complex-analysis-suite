// =============================================================================
// algebra-canvas.js -- DAG renderer for the Algebra workspace (QD.AlgebraCanvas).
//
// Renders a QD.AlgebraStore as a horizontal derivation graph: equation nodes laid
// out in columns (column = reduction depth — column 0 is the original system, each
// successive column an applied assumption/reduction, labeled by a per-column header
// band from handlers.colHeaderOf), SVG cubic-Bézier edges for derivations, and
// absolutely-positioned HTML cards (KaTeX math) so nodes stay selectable / copyable /
// scrollable. Pan (drag background) + zoom (wheel) via a
// single CSS transform on the wrapper holding both the SVG and the card layer.
// Selection (≤2 nodes) drives the elimination panel in algebra-ui.js.
//
// Each card has a header toolbar: a collapse chevron (cards are COLLAPSED by
// default — only the one-line equation preview shows; expand to see the full
// typeset form), up/down arrows that reorder the card within its column (delegated
// to store.moveNode), and a copy button that copies the equation as LaTeX (via
// handlers.onCopy). A title (hovertext) summarizing the node — variable count,
// real-equation contribution, per-variable order, degree, provenance — is supplied
// by handlers.titleOf. Rows are stacked by MEASURED card height so expanded cards
// don't overlap, and conjugate pairs sit adjacent (the store's display order).
//
// SVG+HTML (not the raster #canvas used by the plot/sphere tabs) because nodes
// need real typeset math, text selection, and per-card hit-testing.
// =============================================================================

(function () {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const DISPLAY_CAP = 120;            // elide KaTeX above this term count
  const COLW = 360, CARDW = 300;      // column pitch (x) and card width
  const ROWGAP = 18, TOP = 48, LEFT = 24;   // vertical gap between stacked cards; layout origin (TOP leaves room for column headers)
  const HEADERY = 6;                  // y of the per-column header band (cards start at TOP)

  // KaTeX render with the codebase's plain-text fallback (shared helper in
  // riemann-latex.js; a local wrapper keeps the call sites + a fallback if it's absent).
  function renderKatex(el, expr, display) {
    const RL = window.QD && window.QD.RiemannLatex;
    if (RL && RL.render) { RL.render(el, expr, display); return; }
    if (typeof katex === 'undefined') { el.textContent = expr; return; }
    try { katex.render(expr, el, { displayMode: !!display, throwOnError: false }); }
    catch (e) { el.textContent = expr; }
  }
  function div(cls) { const d = document.createElement('div'); if (cls) d.className = cls; return d; }
  function relSuffix(rel) { return rel === '>' ? ' > 0' : rel === '≠' ? ' \\neq 0' : ' = 0'; }
  function relTag(rel) { return rel === '>' ? ' (inequality)' : rel === '≠' ? ' (≠ 0)' : ''; }
  // A small header toolbar button. `onClick` is wrapped to stop propagation so it
  // never triggers card selection or background pan.
  function iconBtn(cls, glyph, title, onClick) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'algebra-icon ' + cls; b.textContent = glyph;
    if (title) b.title = title;
    b.addEventListener('mousedown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
    return b;
  }

  function create(container, handlers) {
    handlers = handlers || {};
    container.innerHTML = '';
    container.classList.add('algebra-graph');
    const viewport = div('algebra-viewport');
    const wrap = div('algebra-wrap');
    const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('class', 'algebra-edges');
    const layer = div('algebra-nodes');
    const headers = div('algebra-col-headers');   // per-column header band (audit-trail labels)
    wrap.appendChild(svg); wrap.appendChild(headers); wrap.appendChild(layer); viewport.appendChild(wrap); container.appendChild(viewport);

    let tx = LEFT, ty = TOP, scale = 1;
    let selected = [];
    let lastStore = null, lastLatexOf = null;
    const collapsed = new Map();        // id -> bool (default: collapsed). Persists across rerenders.
    function isCollapsed(id) { return collapsed.has(id) ? collapsed.get(id) : true; }

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

    // Build one card's DOM (header toolbar + math body). Collapse state controls
    // whether the math is the one-line preview or the full typeset form.
    function buildCard(store, latexOf, n) {
      const card = div('algebra-node algebra-' + n.kind);
      card.dataset.id = n.id;
      card.style.width = CARDW + 'px';
      if (handlers.titleOf) { const t = handlers.titleOf(n.id); if (t) card.title = t; }

      const head = div('algebra-node-head');
      const chevron = iconBtn('algebra-chevron', isCollapsed(n.id) ? '▸' : '▾',
        isCollapsed(n.id) ? 'Expand' : 'Collapse', () => setCollapsed(n.id, !isCollapsed(n.id)));
      const title = div('algebra-node-title'); title.textContent = n.label + relTag(n.rel);
      const tools = div('algebra-node-tools');
      tools.appendChild(iconBtn('algebra-up', '▲', 'Move up', () => { if (handlers.onMove) handlers.onMove(n.id, -1); }));
      tools.appendChild(iconBtn('algebra-down', '▼', 'Move down', () => { if (handlers.onMove) handlers.onMove(n.id, 1); }));
      tools.appendChild(iconBtn('algebra-copy', '⧉', 'Copy LaTeX', () => { if (handlers.onCopy) handlers.onCopy(n.id); }));
      head.appendChild(chevron); head.appendChild(title); head.appendChild(tools);
      card.appendChild(head);

      const math = div('algebra-node-math' + (isCollapsed(n.id) ? ' collapsed' : ''));
      if (n.poly.size() > DISPLAY_CAP) {
        math.innerHTML = '<span class="hint">[' + n.poly.size() + ' terms — Copy / Export]</span>';
      } else {
        renderKatex(math, n.poly.toLatex(latexOf) + relSuffix(n.rel), false);
      }
      card.appendChild(math);

      // A click anywhere on the card body toggles selection (buttons stopPropagation).
      card.addEventListener('click', (ev) => { ev.stopPropagation(); toggleSelect(n.id); if (handlers.onClick) handlers.onClick(n.id); });
      return card;
    }

    // Toggle collapse for one card in place (no full rerender): swap the body class
    // and the chevron, then restack + redraw edges since the height changed.
    function setCollapsed(id, val) {
      collapsed.set(id, val);
      const card = layer.querySelector('.algebra-node[data-id="' + id + '"]');
      if (!card) return;
      const math = card.querySelector('.algebra-node-math');
      const chev = card.querySelector('.algebra-chevron');
      if (math) math.classList.toggle('collapsed', val);
      if (chev) { chev.textContent = val ? '▸' : '▾'; chev.title = val ? 'Expand' : 'Collapse'; }
      relayout();
    }

    function render(store, latexOf) {
      lastStore = store; lastLatexOf = latexOf;
      layer.innerHTML = '';
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      selected = selected.filter((id) => store.get(id));

      // Cards first (so offsetHeight is measurable), then position + edges.
      for (const n of store.list()) layer.appendChild(buildCard(store, latexOf, n));
      renderSelection();
      relayout();
    }

    // Position every card by MEASURED height (so expanded cards don't overlap):
    // columns by store display order, stacked top-to-bottom with ROWGAP. Then draw
    // edges between actual card anchor points and size the SVG to the content.
    function relayout() {
      const store = lastStore; if (!store) return;
      const cols = new Map();
      for (const n of store.list()) { const c = n.column || 0; if (!cols.has(c)) cols.set(c, []); cols.get(c).push(n); }

      headers.innerHTML = '';
      const pos = new Map();
      for (const [c, arr] of cols) {
        arr.sort((a, b) => (store.orderOf(a.id) - store.orderOf(b.id)) || a.id.localeCompare(b.id));
        let y = TOP;
        const x = LEFT + c * COLW;
        // Per-column header: the audit-trail label for the reduction that produced it.
        const htext = handlers.colHeaderOf ? handlers.colHeaderOf(c, arr) : null;
        if (htext) {
          const h = div('algebra-col-header');
          h.textContent = htext; h.title = htext;
          h.style.left = x + 'px'; h.style.top = HEADERY + 'px'; h.style.width = CARDW + 'px';
          headers.appendChild(h);
        }
        for (const n of arr) {
          const el = layer.querySelector('.algebra-node[data-id="' + n.id + '"]');
          if (!el) continue;
          el.style.left = x + 'px'; el.style.top = y + 'px';
          const h = el.offsetHeight || 60;
          pos.set(n.id, { x, y, w: el.offsetWidth || CARDW, h });
          y += h + ROWGAP;
        }
      }

      while (svg.firstChild) svg.removeChild(svg.firstChild);
      for (const e of store.edges) {
        const a = pos.get(e.from), b = pos.get(e.to);
        if (!a || !b) continue;
        const ax = a.x + a.w, ay = a.y + a.h / 2;
        const bx = b.x, by = b.y + b.h / 2;
        const mx = (ax + bx) / 2;
        const path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('d', 'M' + ax + ',' + ay + ' C' + mx + ',' + ay + ' ' + mx + ',' + by + ' ' + bx + ',' + by);
        path.setAttribute('class', 'algebra-edge');
        svg.appendChild(path);
      }

      let maxX = 0, maxY = 0;
      for (const [, p] of pos) { maxX = Math.max(maxX, p.x + p.w); maxY = Math.max(maxY, p.y + p.h); }
      svg.style.width = (maxX + 60) + 'px'; svg.style.height = (maxY + 60) + 'px';
    }
    function rerender() { if (lastStore) render(lastStore, lastLatexOf); }
    function fit() { tx = LEFT; ty = TOP; scale = 1; applyTransform(); }

    applyTransform();
    return { render, rerender, fit, getSelection, clearSelection };
  }

  window.QD = window.QD || {};
  window.QD.AlgebraCanvas = { create };
})();
