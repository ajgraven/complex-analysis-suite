// =============================================================================
// algebra-ui.js -- the Algebra tab: an interactive equation-derivation workspace
// (QD_UI.installAlgebra). Hosts a QD.AlgebraStore rendered by QD.AlgebraCanvas in
// a full-area #algebra-graph surface over #plot-area, with sidebar controls in
// #controls-algebra: seed from the current classical-bounded solve, a univalence-
// constraint palette, pairwise resultant elimination (select 2 nodes + a shared
// variable → derived node, with a cost preview), undo/redo, and DAG/LaTeX export.
//
// CAS-UX (Stoutemyer): preview-before-commit (cost), navigable derivation tree +
// backtracking (DAG + undo), equation selection, accumulate alternatives (branch/
// duplicate), derivational view (the graph is the work). Gated on classical
// bounded QD (hidden otherwise). All algebra is in QD.Sym/QDEquations/QDConstraints.
// =============================================================================

(function () {
  'use strict';

  // Each palette button carries a concise tooltip (the detailed math lives in the
  // collapsible "?" help and the per-card hovertext, per CAS-UX: terse surface,
  // depth on demand).
  const CONSTRAINT_BUTTONS = [
    { form: 'convex', label: 'Convex', tip: 'Re(1 + ζφ″/φ′) > 0 on |ζ|=1 — Ω is convex.' },
    { form: 'star', label: 'Star-like', tip: 'Re(ζφ′/(φ−w₀)) > 0 — Ω is star-like about w₀.' },
    { form: 'spiral', label: 'Spiral-like', tip: 'Re(e^{iλ}ζφ′/(φ−w₀)) > 0 for some λ (existential-λ).' },
    { form: 'localUniv', label: 'φ′≠0 (local)', tip: 'Local univalence: φ′ has no zero in 𝔻 (Rabinowitsch witness).' },
    { form: 'injectivity', label: 'Injectivity (global)', tip: 'Global: (φ(ζ₁)−φ(ζ₂))/(ζ₁−ζ₂) ≠ 0 on the boundary.' },
    { form: 'convexBorder', label: 'Convex border', tip: 'Discriminant locus where convexity is lost (export-only for order ≥ 2).' },
    { form: 'starBorder', label: 'Star border', tip: 'Discriminant locus where star-likeness is lost (export-only for order ≥ 2).' },
  ];

  function installAlgebra(ctx) {
    const QD = window.QD;
    const $ = ctx.$;
    const QE = QD && QD.QDEquations;
    const QC = QD && QD.QDConstraints;
    if (!QE || !QC || !QD.AlgebraStore || !QD.AlgebraCanvas) return {};

    const STR = (QD.Strings && QD.Strings.algebra) || {};
    const store = QD.AlgebraStore.create();
    let canvas = null;
    let surface = null;            // the #algebra-graph element
    let mounted = false;
    let activeEnv = null;          // latest classical-bounded solve envelope
    let lastCap = 6;

    // LaTeX for the conjugate-model vars + the constraint boundary/aux vars.
    const baseLatex = QE.latexOf('conjugate');
    function latexOf(name) {
      switch (name) {
        case 'Z': return '\\zeta'; case 'Zb': return '\\bar{\\zeta}';
        case 'Z1': return '\\zeta_1'; case 'Zb1': return '\\bar{\\zeta}_1';
        case 'Z2': return '\\zeta_2'; case 'Zb2': return '\\bar{\\zeta}_2';
        case 'cosL': return '\\cos\\lambda'; case 'sinL': return '\\sin\\lambda';
        case 'Wsat': return '\\omega';
        default: return baseLatex(name);
      }
    }

    function isClassicalBounded(phi, hData) {
      return !!(phi && !phi.unbounded
        && (!phi.family || phi.family === 'boundedQD')
        && phi.alpha == null && phi.lqdBeta == null
        && phi.z0 == null && phi.gamma == null && phi.q == null
        && hData && hData.poles && hData.poles.length
        && Array.isArray(phi.branches) && phi.branches.length === hData.poles.length);
    }
    function toast(msg, opts) { if (QD.QoL && QD.QoL.toast) QD.QoL.toast(msg, opts || {}); }
    function rerender() { if (canvas) canvas.render(store, latexOf); updateElimPanel(canvas ? canvas.getSelection() : []); }

    // ---- seeding -------------------------------------------------------------
    function seedFromCurrent() {
      if (!activeEnv) { setStatus(STR.noSolve || 'No classical bounded QD solved yet.'); return false; }
      try {
        const sys = QE.generateClassicalBounded(activeEnv.hData, { maxPoleOrder: lastCap });
        store.seedFromSystem(sys);
        setStatus((STR.seeded || 'Seeded') + ' ' + store.size + ' equations (incl. conjugates; ' + sys.n + ' pole' + (sys.n === 1 ? '' : 's') + ', order ' + sys.d + ').');
        rerender();
        return true;
      } catch (e) {
        setStatus((STR.unavailablePrefix || 'Generation unavailable: ') + ((e && e.message) || e));
        return false;
      }
    }

    // ---- sidebar -------------------------------------------------------------
    function setStatus(t) { const el = $('#alg-status'); if (el) el.textContent = t; }
    function mountSidebar() {
      const panel = $('#controls-algebra');
      if (!panel) return;
      panel.innerHTML =
        // Terse one-liner + a "?" that toggles the full help (depth on demand).
        '<div class="row" style="align-items:flex-start; gap:6px;">' +
        '  <div class="hint" data-str-html="hints.algebraCard" style="flex:1;"></div>' +
        '  <button id="alg-help-toggle" class="small algebra-help-q" type="button" title="Show / hide help">?</button>' +
        '</div>' +
        '<div id="alg-help" class="hint card-sub hidden" data-str-html="algebra.help" style="margin:4px 0;"></div>' +
        '<div class="row"><button id="alg-seed" class="small" type="button" ' +
        'title="Generate the (●)/(★)/gauge system from the current bounded solve (replaces the graph)">Generate / re-seed</button>' +
        '<button id="alg-undo" class="small" type="button" style="margin-left:6px;" title="Undo">Undo</button>' +
        '<button id="alg-redo" class="small" type="button" style="margin-left:4px;" title="Redo">Redo</button>' +
        '<button id="alg-fit" class="small" type="button" style="margin-left:4px;" title="Reset pan / zoom">Fit</button></div>' +
        '<div id="alg-status" class="hint" style="margin:4px 0;"></div>' +
        '<div class="row" style="margin-top:4px;"><button id="alg-gauge-elim" class="small" type="button" ' +
        'data-str-title="tooltips.gaugeElim">Eliminate with gauge (all)</button></div>' +
        '<div class="row" style="margin-top:4px; flex-wrap:wrap; gap:4px; align-items:center;">' +
        '  <button id="alg-groebner" class="small" type="button" data-str-title="tooltips.groebner">Gröbner basis (all eqns)</button>' +
        '  <label style="font-size:11px;" title="Monomial order. lex = elimination order; grevlex = fastest general.">order ' +
        '    <select id="alg-gb-order"><option value="grevlex">grevlex</option><option value="grlex">grlex</option><option value="lex">lex</option></select></label>' +
        '  <input id="alg-gb-elim" class="small" type="text" placeholder="eliminate vars, e.g. z1,zb1" style="width:150px;" ' +
        '    title="Comma-separated RAW variable names to eliminate (forces a lex order; leave blank for a plain reduced basis)."></div>' +
        '<div class="key" style="margin-top:6px;" title="Append a boundary-univalence condition as new node(s) — hover each button for its meaning">Add univalence constraint</div>' +
        '<div id="alg-palette" class="row" style="flex-wrap:wrap; gap:4px;"></div>' +
        '<div id="alg-elim" class="card-sub hidden" style="margin-top:8px;">' +
        '  <div class="key" title="Take the Sylvester resultant of the two selected nodes in the chosen variable">Eliminate a variable</div>' +
        '  <div id="alg-elim-sel" class="hint"></div>' +
        '  <div class="row" style="margin-top:4px;"><label>Variable ' +
        '    <select id="alg-var"></select></label>' +
        '    <button id="alg-eliminate" class="small" type="button" style="margin-left:6px;">Eliminate</button>' +
        '    <button id="alg-groebner-sel" class="small" type="button" style="margin-left:4px;" ' +
        '      title="Gröbner basis of the two selected nodes (uses every shared variable, not just one)">Gröbner</button></div>' +
        '  <div id="alg-cost" class="hint" style="margin-top:2px;" title="Sylvester matrix size and term counts — the elimination cost"></div>' +
        '</div>' +
        '<div class="key" style="margin-top:8px;" title="Export the whole system for an external CAS (Gröbner / RCTD) or a paper">Export</div>' +
        '<div class="row" style="gap:4px;"><button id="alg-export-json" class="small" type="button" ' +
        'title="Download every node as an exact ℚ(i) term list + edges (CAS-ready JSON)">Download DAG (JSON)</button>' +
        '<button id="alg-copy-latex" class="small" type="button" title="Copy all equations as a gathered LaTeX block">Copy LaTeX</button></div>';

      // constraint palette buttons
      const pal = $('#alg-palette');
      CONSTRAINT_BUTTONS.forEach((b) => {
        const btn = document.createElement('button');
        btn.className = 'small'; btn.type = 'button'; btn.textContent = b.label; btn.dataset.form = b.form;
        if (b.tip) btn.title = b.tip;
        btn.addEventListener('click', () => {
          if (!activeEnv) { toast(STR.noSolve || 'No classical bounded QD solved yet.', { kind: 'error' }); return; }
          if (!store.size) seedFromCurrent();
          try { const made = store.addConstraint(b.form, activeEnv.hData); rerender(); toast('Added ' + made.length + ' node(s): ' + b.label); }
          catch (e) { toast((e && e.message) || String(e), { kind: 'error' }); }
        });
        pal.appendChild(btn);
      });

      const helpBtn = $('#alg-help-toggle');
      if (helpBtn) helpBtn.addEventListener('click', () => { const h = $('#alg-help'); if (h) h.classList.toggle('hidden'); });
      $('#alg-seed').addEventListener('click', seedFromCurrent);
      $('#alg-undo').addEventListener('click', () => { if (store.undo()) rerender(); });
      $('#alg-redo').addEventListener('click', () => { if (store.redo()) rerender(); });
      $('#alg-fit').addEventListener('click', () => { if (canvas) canvas.fit(); });
      $('#alg-eliminate').addEventListener('click', doEliminate);
      $('#alg-groebner').addEventListener('click', () => doGroebner(null));
      $('#alg-groebner-sel').addEventListener('click', () => doGroebner(canvas ? canvas.getSelection() : []));
      $('#alg-gauge-elim').addEventListener('click', () => {
        if (!store.size) { if (!seedFromCurrent()) return; }
        const r = store.eliminateWithGauge();
        if (!r.ok) { toast(r.reason || 'nothing to eliminate with the gauge', { kind: 'error' }); return; }
        rerender();
        toast('Gauge elimination: created ' + r.created.length + ' equation(s)' +
          (r.skipped.length ? ', skipped ' + r.skipped.length : ''));
      });
      $('#alg-export-json').addEventListener('click', exportJson);
      $('#alg-copy-latex').addEventListener('click', copyLatex);

      if (QD.Strings && QD.Strings.apply) QD.Strings.apply(panel);
      setStatus(activeEnv ? '' : (STR.noSolve || 'No classical bounded QD solved yet.'));
    }

    // ---- elimination panel (driven by canvas selection) ---------------------
    function updateElimPanel(sel) {
      const box = $('#alg-elim'); if (!box) return;
      if (!sel || sel.length !== 2) { box.classList.add('hidden'); return; }
      const a = store.get(sel[0]), b = store.get(sel[1]);
      if (!a || !b) { box.classList.add('hidden'); return; }
      box.classList.remove('hidden');
      $('#alg-elim-sel').textContent = a.label + '   ×   ' + b.label;
      const vars = store.sharedVars(sel[0], sel[1]);
      const select = $('#alg-var'); select.innerHTML = '';
      vars.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = latexPlain(v); select.appendChild(o); });
      $('#alg-eliminate').disabled = vars.length === 0;
      updateCost();
      select.onchange = updateCost;
    }
    function updateCost() {
      const sel = canvas ? canvas.getSelection() : [];
      const v = $('#alg-var') && $('#alg-var').value;
      const costEl = $('#alg-cost');
      if (sel.length !== 2 || !v) { costEl.textContent = ''; return; }
      const c = store.previewCost(sel[0], sel[1], v);
      costEl.textContent = 'Sylvester ' + c.matrix + '×' + c.matrix + ' (deg ' + c.degA + ', ' + c.degB + '; ' + c.termsA + '+' + c.termsB + ' terms)';
    }
    function doEliminate() {
      const sel = canvas ? canvas.getSelection() : [];
      const v = $('#alg-var') && $('#alg-var').value;
      if (sel.length !== 2 || !v) return;
      const r = store.eliminate(sel[0], sel[1], v);
      if (!r.ok) { toast(r.reason || 'elimination failed', { kind: 'error' }); return; }
      canvas.clearSelection();
      rerender();
      toast('Eliminated ' + latexPlain(v) + ' → ' + r.node.poly.size() + '-term equation');
    }
    // Gröbner basis of a node selection (null/empty ⇒ every equality node). Reads
    // the order selector and the comma-separated "eliminate" list from the sidebar.
    function doGroebner(sel) {
      if (!store.size) { if (!seedFromCurrent()) return; }
      let ids = (sel && sel.length) ? sel.slice()
        : store.list().filter((n) => n.rel === '=').map((n) => n.id);
      const orderEl = $('#alg-gb-order'), elimEl = $('#alg-gb-elim');
      const order = (orderEl && orderEl.value) || 'grevlex';
      const elim = (elimEl && elimEl.value || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      const opts = elim.length ? { eliminate: elim } : { order };
      const r = store.groebner(ids, opts);
      if (!r.ok) { toast(r.reason || 'Gröbner basis failed', { kind: 'error' }); return; }
      if (canvas) canvas.clearSelection();
      rerender();
      toast('Gröbner basis: ' + r.created.length + ' generator(s)' +
        (elim.length ? ' eliminating ' + elim.join(', ') : ' (' + order + ')') +
        (r.skipped.length ? '; skipped ' + r.skipped.length + ' non-equality' : ''));
    }

    // crude plain-text rendering of a variable name for <option>/toasts
    function latexPlain(name) {
      return name.replace(/^Ab/, 'Ā').replace(/^A/, 'A').replace(/^Cb/, 'C̄').replace(/^zb/, 'z̄')
        .replace(/^ab/, 'ā').replace(/^wb0/, 'w̄₀').replace(/^Zb/, 'ζ̄').replace(/^Z/, 'ζ')
        .replace('_', ',');
    }

    // ---- export --------------------------------------------------------------
    function exportJson() {
      const data = store.exportDAG();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'qd-algebra-dag.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast('Exported ' + data.nodes.length + ' nodes (JSON)');
    }
    function relSuffix(rel) { return rel === '>' ? ' > 0' : rel === '≠' ? ' \\neq 0' : ' = 0'; }
    function writeClipboard(tex, label) {
      const done = (okp) => toast(okp ? (label || 'LaTeX') + ' copied' : 'Copy failed', okp ? {} : { kind: 'error' });
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(tex).then(() => done(true), () => done(false));
      else done(false);
    }
    // Copy ALL nodes as a gathered LaTeX environment (sidebar "Copy LaTeX").
    function copyLatex() {
      const lines = store.list().map((n) => '\\text{[' + n.id + ']}\\quad ' + n.poly.toLatex(latexOf) + relSuffix(n.rel));
      writeClipboard('\\begin{gathered}\n' + lines.join(' \\\\[4pt]\n') + '\n\\end{gathered}', 'LaTeX');
    }
    // Copy ONE node's equation as LaTeX (the per-card copy button).
    function copyNodeLatex(id) {
      const n = store.get(id); if (!n) return;
      writeClipboard(n.poly.toLatex(latexOf) + relSuffix(n.rel), n.label + ' LaTeX');
    }

    // ---- per-card hovertext (driven by store.nodeStats) ---------------------
    function provText(prov) {
      if (!prov) return '';
      switch (prov.op) {
        case 'generate': return 'generated (' + (prov.block || '?') + ' block)';
        case 'conjugate': return 'conjugate companion of ' + (prov.inputs || []).join(', ');
        case 'resultant': return 'eliminated ' + latexPlain(prov.variable) + ' from ' + (prov.inputs || []).join(', ');
        case 'groebner': return 'Gröbner basis (' + (prov.eliminate && prov.eliminate.length
          ? 'elim ' + prov.eliminate.map(latexPlain).join(', ') : (prov.order || 'grevlex'))
          + ') of ' + (prov.inputs || []).join(', ');
        case 'constraint': return 'univalence constraint (' + (prov.form || '?') + ')';
        case 'duplicate': return 'copy of ' + (prov.inputs || []).join(', ');
        default: return prov.op || '';
      }
    }
    function nodeTitle(id) {
      const s = store.nodeStats(id); if (!s) return '';
      const conj = s.selfConj ? ' (self-conjugate)' : s.hasCompanion ? ' (½ of a conjugate pair)' : '';
      const lines = [
        s.label,
        'Variables: ' + s.numVars,
        'Real equations contributed: ' + s.realEquations + conj,
        'Total degree: ' + s.totalDegree + '   ·   terms: ' + s.terms,
      ];
      if (s.varOrders.length) {
        lines.push('Order in each variable:');
        s.varOrders.forEach((v) => lines.push('   ' + latexPlain(v.name) + ' : ' + v.order));
      }
      const prov = provText(s.provenance);
      if (prov) lines.push('Origin: ' + prov);
      return lines.join('\n');
    }

    // ---- surface (graph) over #plot-area ------------------------------------
    function mountSurface() {
      const area = $('#plot-area'); if (!area) return;
      surface = document.createElement('div');
      surface.id = 'algebra-graph';
      surface.className = 'hidden';
      area.appendChild(surface);
      canvas = QD.AlgebraCanvas.create(surface, {
        onSelect: updateElimPanel,
        onCopy: copyNodeLatex,
        onMove: (id, dir) => { if (store.moveNode(id, dir)) rerender(); },
        titleOf: nodeTitle,
      });
    }
    function showSurface(on) { if (surface) surface.classList.toggle('hidden', !on); }

    // ---- tab lifecycle -------------------------------------------------------
    document.addEventListener('tab-changed', (e) => {
      const active = e.detail && e.detail.tab === 'algebra';
      if (!active) { showSurface(false); return; }
      if (!mounted) { mountSidebar(); mountSurface(); mounted = true; }
      showSurface(true);
      if (!store.size && activeEnv) seedFromCurrent();
      else rerender();
    });

    // Open programmatically (the sidebar launcher calls this).
    function openWorkspace() {
      const btn = document.querySelector('.tab-btn[data-tab="algebra"]');
      if (btn) btn.click();
      if (mounted) seedFromCurrent();
    }
    ctx.openAlgebra = openWorkspace;

    // Track the current solve; gate on classical bounded QD.
    if (QD.PrimarySolution && QD.PrimarySolution.subscribe) {
      QD.PrimarySolution.subscribe((env) => {
        const phi = env && env.success && env.primary && env.primary.phi;
        activeEnv = isClassicalBounded(phi, env && env.hData) ? env : null;
        if (mounted) {
          if (!activeEnv) setStatus(STR.noSolve || 'No classical bounded QD solved yet.');
          else setStatus((STR.ready || 'Ready — click Generate / re-seed.'));
        }
      });
    }

    return { openWorkspace };
  }

  window.QD_UI = window.QD_UI || {};
  window.QD_UI.installAlgebra = installAlgebra;
})();
