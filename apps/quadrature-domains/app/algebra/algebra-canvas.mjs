// =============================================================================
// algebra-canvas.js -- DAG renderer for the Algebra workspace (QD.AlgebraCanvas).
//
// Renders a QD.AlgebraStore as a left-to-right derivation PIPELINE of STRUCTURED
// COLUMN LANES: each column (= reduction depth — column 0 is the original system,
// each later column an applied assumption) is a real DOM container with a STICKY
// header that names the transformation relating it to the previous column (from
// handlers.colInfo) and shows its equation/variable counts. The lanes live in a flex
// `.algebra-track` inside a natively-scrolling `.algebra-scroll`; a `transform:scale`
// zoom (sized via `.algebra-sizer` so the scrollbars stay correct) lets a wide
// pipeline fit. An SVG overlay inside the track draws the derivation edges (arrowed,
// `marker-end`) between card anchor points; because the SVG scales with the track it
// only needs redrawing on layout changes (render / collapse / reorder / resize / zoom),
// not on scroll.
//
// Each card keeps its header toolbar: a collapse chevron (cards COLLAPSED by default —
// a one-line preview; expand for the full typeset form), up/down reorder arrows
// (store.moveNode), and a copy-as-LaTeX button; a hovertext from handlers.titleOf.
// Cards FLOW in their column body (flex), so collapse/reorder reflow naturally.
//
// Also: an empty state (with a Generate call-to-action) before seeding, an
// expand/collapse-all hook, and a dismissible verdict panel (setVerdict) for the
// existence/uniqueness result. Public API: create() → { render, rerender, fit,
// fitWidth (zoom so all lanes fit the width), scrollToColumn (jump to + flash a lane —
// the sidebar's reduction breadcrumb drives this), getSelection, clearSelection, setZoom,
// setAllCollapsed, setVerdict }.
//
// SVG+HTML (not the raster #canvas used by the plot/sphere tabs) because nodes need
// real typeset math, text selection, and per-card hit-testing.
// =============================================================================

// ESM (Phase 2 port) — twin of algebra/algebra-canvas.js (classic stays frozen). UI orchestrator/consumer.
import { state } from '../ui-state.mjs';
import _QD from '../solver.mjs';
const QD = _QD;

(function () {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const DISPLAY_CAP = 120;            // elide KaTeX above this term count (card lane width is CSS-driven)
  const ZMIN = 0.4, ZMAX = 1.6;       // zoom clamp

  // KaTeX render with the codebase's plain-text fallback (shared helper in
  // riemann-latex.js; a local wrapper keeps the call sites + a fallback if it's absent).
  function renderKatex(el, expr, display) {
    const RL = window.QD && QD.RiemannLatex;
    if (RL && RL.render) { RL.render(el, expr, display); return; }
    if (typeof katex === 'undefined') { el.textContent = expr; return; }
    try { katex.render(expr, el, { displayMode: !!display, throwOnError: false }); }
    catch (e) { el.textContent = expr; }
  }
  function div(cls) { const d = document.createElement('div'); if (cls) d.className = cls; return d; }
  function relSuffix(rel) { return rel === '>' ? ' > 0' : rel === '≠' ? ' \\neq 0' : ' = 0'; }
  function relTag(rel) { return rel === '>' ? ' (inequality)' : rel === '≠' ? ' (≠ 0)' : ''; }
  // A small header toolbar button. `onClick` is wrapped to stop propagation so it
  // never triggers card selection.
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

    const scroll = div('algebra-scroll');
    const sizer = div('algebra-sizer');
    const track = div('algebra-track');
    const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('class', 'algebra-edges');
    // arrowhead marker (scales with the track)
    const defs = document.createElementNS(SVGNS, 'defs');
    const marker = document.createElementNS(SVGNS, 'marker');
    marker.setAttribute('id', 'alg-arrow'); marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9'); marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '7'); marker.setAttribute('markerHeight', '7');
    marker.setAttribute('orient', 'auto-start-reverse');
    const mpath = document.createElementNS(SVGNS, 'path');
    mpath.setAttribute('d', 'M0,0 L10,5 L0,10 z'); mpath.setAttribute('class', 'algebra-arrowhead');
    marker.appendChild(mpath); defs.appendChild(marker); svg.appendChild(defs);
    track.appendChild(svg);
    sizer.appendChild(track);
    scroll.appendChild(sizer);
    container.appendChild(scroll);

    const empty = div('algebra-empty hidden');
    container.appendChild(empty);
    const verdict = div('algebra-verdict hidden');
    container.appendChild(verdict);
    // B2 — DAG minimap: a scaled bird's-eye of the active track's lanes with a draggable
    // viewport box; toggled off by default. Click/drag scrolls the main view.
    const minimap = div('algebra-minimap hidden');
    const mmInner = div('algebra-minimap-inner');
    const mmView = div('algebra-minimap-view');
    minimap.appendChild(mmInner); minimap.appendChild(mmView);
    container.appendChild(minimap);

    let zoom = 1;
    let minimapOn = false;
    let selected = [];
    let lastStore = null, lastLatexOf = null;
    const collapsed = new Map();        // id -> bool (default: collapsed). Persists across rerenders.
    // KaTeX is the dominant render cost, and a full rerender rebuilds every card even when
    // only one column changed. Cache the typeset HTML keyed by the LaTeX string (a pure
    // function of the immutable poly + rel + the stable latexOf): an unchanged equation
    // reuses its rendered HTML instead of re-running KaTeX. Soft-capped to bound memory.
    const katexCache = new Map();
    function isCollapsed(id) { return collapsed.has(id) ? collapsed.get(id) : true; }

    // Redraw edges (and re-size) when the lane heights change (collapse / reorder) or the
    // viewport resizes. Scroll does NOT trigger this — the SVG scrolls with the track.
    let _ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      _ro = new ResizeObserver(() => { if (lastStore) relayout(); });
      _ro.observe(scroll);
    }

    // B1 — derivation lineage: the transitive ancestors + descendants of the selection,
    // walked over the store edges. "Propagation through the DAG" rendered as a visual lineage
    // (this store is immutable / append-only, so nodes are never stale — the useful question
    // is what a node was DERIVED FROM and what was derived FROM it).
    let lineageSet = new Set();
    function computeLineage() {
      const lin = new Set();
      if (!lastStore || !selected.length) { lineageSet = lin; return lin; }
      const fwd = new Map(), bwd = new Map();
      for (const e of lastStore.edges) {
        if (!fwd.has(e.from)) fwd.set(e.from, []);
        fwd.get(e.from).push(e.to);
        if (!bwd.has(e.to)) bwd.set(e.to, []);
        bwd.get(e.to).push(e.from);
      }
      const walk = (start, adj) => { const q = [start]; while (q.length) { const x = q.shift(); for (const y of (adj.get(x) || [])) if (!lin.has(y)) { lin.add(y); q.push(y); } } };
      for (const s of selected) { walk(s, fwd); walk(s, bwd); }
      for (const s of selected) lin.delete(s);   // the seeds carry .selected, not .lineage
      lineageSet = lin; return lin;
    }
    // Toggle the .lineage class on the edge paths whose BOTH endpoints are in the lineage
    // (selected ∪ ancestors ∪ descendants). Cheap; runs on selection change + after relayout.
    function colorEdgeLineage() {
      const inLin = (id) => selected.indexOf(id) >= 0 || lineageSet.has(id);
      svg.querySelectorAll('path.algebra-edge').forEach((p) => {
        const on = selected.length > 0 && inLin(p.getAttribute('data-from')) && inLin(p.getAttribute('data-to'));
        p.classList.toggle('lineage', !!on);
      });
    }
    function renderSelection() {
      computeLineage();
      track.querySelectorAll('.algebra-node').forEach((el) => {
        const id = el.dataset.id;
        el.classList.toggle('selected', selected.indexOf(id) >= 0);
        el.classList.toggle('lineage', lineageSet.has(id));
      });
      colorEdgeLineage();
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
        const tex = n.poly.toLatex(latexOf) + relSuffix(n.rel);
        const hit = katexCache.get(tex);
        if (hit !== undefined) { math.innerHTML = hit; }
        else {
          renderKatex(math, tex, false);
          katexCache.set(tex, math.innerHTML);
          if (katexCache.size > 800) katexCache.delete(katexCache.keys().next().value);   // drop oldest
        }
      }
      card.appendChild(math);

      card.addEventListener('click', (ev) => { ev.stopPropagation(); toggleSelect(n.id); if (handlers.onClick) handlers.onClick(n.id); });
      // Keyboard-selectable (a11y): focusable, and Enter/Space toggles selection.
      card.tabIndex = 0; card.setAttribute('role', 'button'); card.setAttribute('aria-label', n.label);
      card.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); toggleSelect(n.id); if (handlers.onClick) handlers.onClick(n.id); }
      });
      return card;
    }

    // Toggle collapse in place: swap the body class + chevron, then re-size + redraw edges
    // (flex reflows the card positions; only the heights/edges need updating).
    function setCollapsed(id, val) {
      collapsed.set(id, val);
      const card = track.querySelector('.algebra-node[data-id="' + id + '"]');
      if (card) {
        const math = card.querySelector('.algebra-node-math');
        const chev = card.querySelector('.algebra-chevron');
        if (math) math.classList.toggle('collapsed', val);
        if (chev) { chev.textContent = val ? '▸' : '▾'; chev.title = val ? 'Expand' : 'Collapse'; }
      }
      relayout();
    }
    // Expand / collapse every card (the sidebar toggle).
    function setAllCollapsed(val) {
      if (!lastStore) return;
      for (const n of lastStore.list()) collapsed.set(n.id, val);
      render(lastStore, lastLatexOf);
    }

    // One column lane: a sticky header (from handlers.colInfo) + a body of cards.
    function buildColumn(store, latexOf, c, nodes, isLast) {
      const col = div('algebra-column' + (isLast ? ' is-current' : ''));
      col.dataset.col = c;
      const head = div('algebra-column-head');
      const info = (handlers.colInfo ? handlers.colInfo(c, nodes) : null) || { step: String(c + 1), label: 'Column ' + c, stats: '', isCurrent: isLast };
      const step = div('algebra-column-step'); step.textContent = info.step;
      const label = div('algebra-column-label'); label.textContent = info.label; label.title = info.label;
      const top = div('algebra-column-top'); top.appendChild(step); top.appendChild(label);
      if (info.isCurrent) { const chip = div('algebra-column-chip'); chip.textContent = 'current system'; top.appendChild(chip); }
      head.appendChild(top);
      if (info.stats) { const s = div('algebra-column-stats'); s.textContent = info.stats; head.appendChild(s); }
      col.appendChild(head);

      const body = div('algebra-column-body');
      for (const n of nodes) body.appendChild(buildCard(store, latexOf, n));
      col.appendChild(body);
      return col;
    }

    // Full render: rebuild the column lanes from the store (grouped by node.column,
    // ordered within each by store.orderOf), then size the zoom sizer + draw the edges.
    // Shows the empty state when the store has no nodes.
    function render(store, latexOf) {
      lastStore = store; lastLatexOf = latexOf;
      verdict.classList.add('hidden');                 // a new render = a changed system; the old verdict is stale
      selected = selected.filter((id) => store.get(id));
      // clear columns (keep the svg overlay)
      track.querySelectorAll('.algebra-column').forEach((el) => el.remove());

      // Render only the ACTIVE track's lanes (branching: other tracks exist in the
      // store but are off-screen until switched to). store.columns()/orderedColumn are
      // already active-track-relative; the edge drawer skips edges to off-track nodes.
      const at = (typeof store.activeTrack !== 'undefined') ? store.activeTrack : 't0';
      const all = store.list().filter((n) => (n.track || 't0') === at);
      if (!all.length) { empty.classList.remove('hidden'); scroll.classList.add('hidden'); relayout(); return; }
      empty.classList.add('hidden'); scroll.classList.remove('hidden');

      const cols = new Map();
      for (const n of all) { const c = n.column || 0; if (!cols.has(c)) cols.set(c, []); cols.get(c).push(n); }
      const idxs = [...cols.keys()].sort((a, b) => a - b);
      const last = idxs[idxs.length - 1];
      for (const c of idxs) {
        const arr = cols.get(c).sort((a, b) => (store.orderOf(a.id) - store.orderOf(b.id)) || a.id.localeCompare(b.id));
        track.appendChild(buildColumn(store, latexOf, c, arr, c === last));
      }
      renderSelection();
      relayout();
    }

    // Size the zoom sizer + draw the edges. The track is `transform:scale(zoom)`; its
    // natural (unscaled) box is offsetWidth/offsetHeight, so the sizer is that × zoom to
    // keep the scrollbars correct, and the SVG (inside the track) uses NATURAL coords.
    function relayout() {
      const w = track.offsetWidth, h = track.offsetHeight;
      sizer.style.width = (w * zoom) + 'px';
      sizer.style.height = (h * zoom) + 'px';
      svg.setAttribute('width', w); svg.setAttribute('height', h);
      svg.style.width = w + 'px'; svg.style.height = h + 'px';
      drawEdges();
      updateMinimap();
    }

    // Redraw the derivation edges: for each store edge, anchor source-right → target-left
    // in NATURAL track coordinates (measured screen rects ÷ zoom, since the track is scaled)
    // and draw an arrowed cubic bézier. Called from relayout (render/collapse/reorder/resize/zoom).
    function drawEdges() {
      // remove old paths + labels (keep <defs>)
      svg.querySelectorAll('path.algebra-edge, text.algebra-edge-label').forEach((p) => p.remove());
      if (!lastStore) return;
      const tr = track.getBoundingClientRect();
      const anchor = (id) => {
        const el = track.querySelector('.algebra-node[data-id="' + id + '"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        // screen rect → natural track coords (track is scaled by `zoom`)
        return { l: (r.left - tr.left) / zoom, r: (r.right - tr.left) / zoom, cy: (r.top + r.height / 2 - tr.top) / zoom };
      };
      const seenLabel = new Set();   // B3: dedupe the visible op label per (fromCol→toCol, op) bundle
      for (const e of lastStore.edges) {
        const a = anchor(e.from), b = anchor(e.to);
        if (!a || !b) continue;
        const ax = a.r, ay = a.cy, bx = b.l, by = b.cy;
        const mx = (ax + bx) / 2;
        const path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('d', 'M' + ax + ',' + ay + ' C' + mx + ',' + ay + ' ' + mx + ',' + by + ' ' + bx + ',' + by);
        path.setAttribute('class', 'algebra-edge');
        path.setAttribute('marker-end', 'url(#alg-arrow)');
        path.setAttribute('data-from', e.from); path.setAttribute('data-to', e.to);   // B1: lineage hit-testing
        const inLin = (id) => selected.indexOf(id) >= 0 || lineageSet.has(id);
        if (selected.length && inLin(e.from) && inLin(e.to)) path.classList.add('lineage');
        svg.appendChild(path);
        // B3 — operation label on the arrow: a hover <title> on every edge, plus a small
        // visible label at the midpoint of CROSS-column edges (deduped per transition bundle,
        // so a fan of parallel arrows shows the op once). handlers.edgeLabelOf(edge) → string|null.
        const lbl = handlers.edgeLabelOf ? handlers.edgeLabelOf(e) : null;
        if (lbl) {
          const title = document.createElementNS(SVGNS, 'title'); title.textContent = lbl; path.appendChild(title);
          const fn = lastStore.get(e.from), tn = lastStore.get(e.to);
          const fc = fn && fn.column, tc = tn && tn.column;
          if (fc != null && tc != null && fc !== tc) {
            const key = fc + '>' + tc + '>' + lbl;
            if (!seenLabel.has(key)) {
              seenLabel.add(key);
              const t = document.createElementNS(SVGNS, 'text');
              t.setAttribute('x', mx); t.setAttribute('y', (ay + by) / 2 - 3);
              t.setAttribute('class', 'algebra-edge-label'); t.setAttribute('text-anchor', 'middle');
              t.textContent = lbl;
              svg.appendChild(t);
            }
          }
        }
      }
    }

    // ---- B2: DAG minimap ----------------------------------------------------
    const MM_W = 168, MM_H = 116;     // minimap inner coordinate box (matches the CSS size)
    function mmScale() {
      const natW = track.offsetWidth || 1, natH = track.offsetHeight || 1;
      return Math.min(MM_W / natW, MM_H / natH) || 0;
    }
    // Rebuild the minimap lanes (one mini-rect per column lane) + the viewport box.
    function updateMinimap() {
      if (!minimapOn || !lastStore) return;
      const s = mmScale(); if (!s) return;
      const tr = track.getBoundingClientRect();
      mmInner.innerHTML = '';
      track.querySelectorAll('.algebra-column').forEach((col) => {
        const cr = col.getBoundingClientRect();
        const x = (cr.left - tr.left) / zoom, y = (cr.top - tr.top) / zoom, w = cr.width / zoom, h = cr.height / zoom;
        const lane = document.createElement('div');
        lane.className = 'algebra-mm-lane' + (col.classList.contains('is-current') ? ' is-current' : '');
        lane.style.left = (x * s) + 'px'; lane.style.top = (y * s) + 'px';
        lane.style.width = Math.max(2, w * s) + 'px'; lane.style.height = Math.max(2, h * s) + 'px';
        mmInner.appendChild(lane);
      });
      updateMinimapView(s);
    }
    // Move the viewport box to reflect the main scroll window (cheap — runs on scroll).
    function updateMinimapView(s) {
      if (!minimapOn) return;
      s = s || mmScale(); if (!s) return;
      mmView.style.left = ((scroll.scrollLeft / zoom) * s) + 'px';
      mmView.style.top = ((scroll.scrollTop / zoom) * s) + 'px';
      mmView.style.width = ((scroll.clientWidth / zoom) * s) + 'px';
      mmView.style.height = ((scroll.clientHeight / zoom) * s) + 'px';
    }
    function setMinimap(on) {
      minimapOn = !!on;
      minimap.classList.toggle('hidden', !minimapOn);
      if (minimapOn) updateMinimap();
      return minimapOn;
    }
    // Click / drag the minimap to centre the main view on that point.
    function mmScrollTo(ev) {
      const s = mmScale(); if (!s) return;
      const r = mmInner.getBoundingClientRect();
      const natX = (ev.clientX - r.left) / s, natY = (ev.clientY - r.top) / s;
      scroll.scrollLeft = Math.max(0, natX * zoom - scroll.clientWidth / 2);
      scroll.scrollTop = Math.max(0, natY * zoom - scroll.clientHeight / 2);
    }
    let mmDrag = false;
    minimap.addEventListener('mousedown', (ev) => { mmDrag = true; mmScrollTo(ev); ev.preventDefault(); });
    window.addEventListener('mousemove', (ev) => { if (mmDrag) mmScrollTo(ev); });
    window.addEventListener('mouseup', () => { mmDrag = false; });
    scroll.addEventListener('scroll', () => { if (minimapOn) updateMinimapView(); });

    function rerender() { if (lastStore) render(lastStore, lastLatexOf); }
    // Set the track zoom (clamped to [ZMIN, ZMAX]); re-size the sizer + redraw edges.
    // Returns the applied zoom so the caller can track it.
    function setZoom(z) {
      zoom = Math.max(ZMIN, Math.min(ZMAX, z));
      track.style.transform = 'scale(' + zoom + ')';
      relayout();
      return zoom;
    }
    function fit() { setZoom(1); scroll.scrollLeft = 0; scroll.scrollTop = 0; }
    // Zoom so all lanes fit the viewport width (clamped by setZoom's [ZMIN, ZMAX]).
    function fitWidth() {
      const natural = track.offsetWidth || 1;
      const avail = (scroll.clientWidth || natural) - 8;
      scroll.scrollLeft = 0;
      return setZoom(avail / natural);
    }
    // Scroll a column lane into view (left-aligned) and pulse a brief highlight. `offsetLeft`
    // is the NATURAL layout x within the track; the sizer is scaled by `zoom`, so the scroll
    // position is that × zoom.
    function scrollToColumn(c) {
      const el = track.querySelector('.algebra-column[data-col="' + c + '"]');
      if (!el) return;
      scroll.scrollTo({ left: Math.max(0, el.offsetLeft * zoom - 16), behavior: 'smooth' });
      el.classList.add('algebra-column-flash');
      el.addEventListener('animationend', () => el.classList.remove('algebra-column-flash'), { once: true });
    }

    // The verdict result card. data: { text, title?, solutionsLatex?:[…], solutionsText?, assumptions?:[…], plot?, actions?:[…] }.
    // solutionsLatex entries are TYPESET (KaTeX); solutionsText is shown verbatim in a
    // <pre> (for already-formatted / non-math detail). assumptions is a persistent "computed under"
    // ledger of the active specializations (real/imaginary slice, φ(0) gauge fix, factor case) — so a
    // specialized/slice count never reads as the certified general one (CLAUDE.md honest labeling).
    function setVerdict(data) {
      if (!data || !data.text) { verdict.classList.add('hidden'); return; }
      verdict.innerHTML = '';
      const close = iconBtn('algebra-verdict-close', '×', 'Dismiss', () => verdict.classList.add('hidden'));
      const head = div('algebra-verdict-head'); head.textContent = data.title || 'Existence / uniqueness'; head.appendChild(close);
      const body = div('algebra-verdict-body'); body.textContent = data.text;
      verdict.appendChild(head);
      if (data.assumptions && data.assumptions.length) {
        const led = div('algebra-verdict-assume');
        const lab = document.createElement('strong'); lab.textContent = 'Computed under: '; led.appendChild(lab);
        led.appendChild(document.createTextNode(data.assumptions.join(' · ')));
        verdict.appendChild(led);
      }
      verdict.appendChild(body);
      if (data.solutionsLatex && data.solutionsLatex.length) {
        const box = div('algebra-verdict-math');
        data.solutionsLatex.forEach((tex) => { const d = div('algebra-verdict-mathrow'); renderKatex(d, tex, true); box.appendChild(d); });
        verdict.appendChild(box);
      }
      if (data.solutionsText) { const pre = document.createElement('pre'); pre.className = 'algebra-verdict-sols'; pre.textContent = data.solutionsText; verdict.appendChild(pre); }
      // Optional reconstructed-domain thumbnail (roadmap #3): data.plot = { boundary:[[x,y]…],
      // nodes:[[x,y]…], view:[x,y,w,h] } in SVG coordinates (numeric only — built via DOM, never
      // untrusted markup). Draws the solved domain φ(∂𝔻) + its quadrature nodes beside the exact curve.
      if (data.plot && data.plot.boundary && data.plot.boundary.length > 2 && data.plot.view) {
        const P = data.plot, NS = 'http://www.w3.org/2000/svg';
        const wrap = div('algebra-verdict-plotwrap'); wrap.style.marginTop = '8px';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', P.view.join(' '));
        svg.setAttribute('width', '176'); svg.setAttribute('height', '176');
        svg.setAttribute('class', 'algebra-verdict-plot'); svg.style.display = 'block'; svg.style.maxWidth = '100%';
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', 'M' + P.boundary.map((p) => p[0] + ',' + p[1]).join('L') + 'Z');
        path.setAttribute('fill', 'rgba(91,140,255,0.16)'); path.setAttribute('stroke', '#5b8cff');
        path.setAttribute('stroke-width', '1.6'); path.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.appendChild(path);
        const nr = Math.max(P.view[2], P.view[3]) * 0.028;
        (P.nodes || []).forEach((n) => {
          const c = document.createElementNS(NS, 'circle');
          c.setAttribute('cx', n[0]); c.setAttribute('cy', n[1]); c.setAttribute('r', nr); c.setAttribute('fill', '#e0603a');
          svg.appendChild(c);
        });
        wrap.appendChild(svg);
        const cap = div('algebra-verdict-plotcap'); cap.textContent = 'reconstructed domain φ(∂𝔻) · quadrature node(s) φ(zⱼ)';
        cap.style.fontSize = '11px'; cap.style.opacity = '0.7'; cap.style.marginTop = '2px';
        wrap.appendChild(cap);
        verdict.appendChild(wrap);
      }
      // Optional one-click actions (e.g. spurious-component pin/split suggestions).
      if (data.actions && data.actions.length) {
        const bar = div('algebra-verdict-actions');
        data.actions.forEach((a) => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'small'; b.textContent = a.label;
          if (a.title) b.title = a.title;
          b.addEventListener('click', () => { try { a.onClick(); } catch (e) { /* ignore */ } });
          bar.appendChild(b);
        });
        verdict.appendChild(bar);
      }
      verdict.classList.remove('hidden');
    }

    // Empty-state content (rebuilt once; the Generate button calls the handler).
    (function buildEmpty() {
      empty.innerHTML = '';
      const t = div('algebra-empty-title'); t.textContent = 'No system yet';
      const p = div('algebra-empty-hint');
      p.textContent = 'Generate the (●)/(★)/gauge system from the current bounded solve, then add assumptions — each becomes a new labeled column.';
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'small algebra-empty-btn'; btn.textContent = 'Generate / re-seed';
      btn.addEventListener('click', () => { if (handlers.onSeed) handlers.onSeed(); });
      empty.appendChild(t); empty.appendChild(p); empty.appendChild(btn);
    })();

    track.style.transform = 'scale(1)';
    return { render, rerender, fit, fitWidth, scrollToColumn, getSelection, clearSelection, setZoom, setAllCollapsed, setVerdict, setMinimap };
  }

  window.QD = window.QD || {};
  QD.AlgebraCanvas = { create };
})();
