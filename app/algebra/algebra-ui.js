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

  const CONSTRAINT_BUTTONS = [
    { form: 'convex', label: 'Convex' },
    { form: 'star', label: 'Star-like' },
    { form: 'spiral', label: 'Spiral-like' },
    { form: 'localUniv', label: 'φ′≠0 (local)' },
    { form: 'injectivity', label: 'Injectivity (global)' },
    { form: 'convexBorder', label: 'Convex border' },
    { form: 'starBorder', label: 'Star border' },
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
        '<div class="hint" data-str-html="hints.algebraCard"></div>' +
        '<div class="row"><button id="alg-seed" class="small" type="button">Generate / re-seed</button>' +
        '<button id="alg-undo" class="small" type="button" style="margin-left:6px;">Undo</button>' +
        '<button id="alg-redo" class="small" type="button" style="margin-left:4px;">Redo</button>' +
        '<button id="alg-fit" class="small" type="button" style="margin-left:4px;">Fit</button></div>' +
        '<div id="alg-status" class="hint" style="margin:4px 0;"></div>' +
        '<div class="row" style="margin-top:4px;"><button id="alg-gauge-elim" class="small" type="button" ' +
        'data-str-title="tooltips.gaugeElim">Eliminate with gauge (all)</button></div>' +
        '<div class="key" style="margin-top:6px;">Add univalence constraint</div>' +
        '<div id="alg-palette" class="row" style="flex-wrap:wrap; gap:4px;"></div>' +
        '<div id="alg-elim" class="card-sub hidden" style="margin-top:8px;">' +
        '  <div class="key">Eliminate a variable</div>' +
        '  <div id="alg-elim-sel" class="hint"></div>' +
        '  <div class="row" style="margin-top:4px;"><label>Variable ' +
        '    <select id="alg-var"></select></label>' +
        '    <button id="alg-eliminate" class="small" type="button" style="margin-left:6px;">Eliminate</button></div>' +
        '  <div id="alg-cost" class="hint" style="margin-top:2px;"></div>' +
        '</div>' +
        '<div class="key" style="margin-top:8px;">Export</div>' +
        '<div class="row" style="gap:4px;"><button id="alg-export-json" class="small" type="button">Download DAG (JSON)</button>' +
        '<button id="alg-copy-latex" class="small" type="button">Copy LaTeX</button></div>';

      // constraint palette buttons
      const pal = $('#alg-palette');
      CONSTRAINT_BUTTONS.forEach((b) => {
        const btn = document.createElement('button');
        btn.className = 'small'; btn.type = 'button'; btn.textContent = b.label; btn.dataset.form = b.form;
        btn.addEventListener('click', () => {
          if (!activeEnv) { toast(STR.noSolve || 'No classical bounded QD solved yet.', { kind: 'error' }); return; }
          if (!store.size) seedFromCurrent();
          try { const made = store.addConstraint(b.form, activeEnv.hData); rerender(); toast('Added ' + made.length + ' node(s): ' + b.label); }
          catch (e) { toast((e && e.message) || String(e), { kind: 'error' }); }
        });
        pal.appendChild(btn);
      });

      $('#alg-seed').addEventListener('click', seedFromCurrent);
      $('#alg-undo').addEventListener('click', () => { if (store.undo()) rerender(); });
      $('#alg-redo').addEventListener('click', () => { if (store.redo()) rerender(); });
      $('#alg-fit').addEventListener('click', () => { if (canvas) canvas.fit(); });
      $('#alg-eliminate').addEventListener('click', doEliminate);
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
    function copyLatex() {
      const lines = store.list().map((n) => {
        const suffix = n.rel === '>' ? ' > 0' : n.rel === '≠' ? ' \\neq 0' : ' = 0';
        return '\\text{[' + n.id + ']}\\quad ' + n.poly.toLatex(latexOf) + suffix;
      });
      const tex = '\\begin{gathered}\n' + lines.join(' \\\\[4pt]\n') + '\n\\end{gathered}';
      const done = (okp) => toast(okp ? 'LaTeX copied' : 'Copy failed', okp ? {} : { kind: 'error' });
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(tex).then(() => done(true), () => done(false));
      else done(false);
    }

    // ---- surface (graph) over #plot-area ------------------------------------
    function mountSurface() {
      const area = $('#plot-area'); if (!area) return;
      surface = document.createElement('div');
      surface.id = 'algebra-graph';
      surface.className = 'hidden';
      area.appendChild(surface);
      canvas = QD.AlgebraCanvas.create(surface, { onSelect: updateElimPanel });
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
