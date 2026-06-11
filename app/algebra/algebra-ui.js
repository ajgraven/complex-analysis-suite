// =============================================================================
// algebra-ui.js -- the Algebra tab: an interactive equation-derivation workspace
// (QD_UI.installAlgebra). Hosts a QD.AlgebraStore rendered by QD.AlgebraCanvas in
// a full-area #algebra-graph surface over #plot-area, with sidebar controls in
// #controls-algebra: seed the ORIGINAL (●)/(★)/gauge system from the current
// classical-bounded solve (φ(0) fixed at generation time by default) at column 0,
// then apply AUDIT-TRAIL reductions that each append a new labeled column — Assume
// real (identify v̄≡v), Specify value (fix a variable to an exact ℚ(i) value, auto-
// propagating the linear cascade), pairwise resultant elimination (select 2 nodes +
// a shared variable, with a cost preview), batch gauge elimination, and Gröbner basis.
// Plus a univalence-constraint palette, dimension / numeric solve over the CURRENT
// system (the last column, off the main thread with a Cancel button), a persistent
// dismissible error panel, undo/redo, and DAG/LaTeX export. Column headers (rendered
// by algebra-canvas via colHeaderOf) name each assumption so the history is legible.
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
    const elimSel = new Set();     // raw variable names chosen to eliminate (Gröbner)
    const realSel = new Set();     // primal variable names asserted real
    let _elimPicker = null, _realPicker = null;   // picker handles (for label refresh)
    let _seededHData = null;       // the hData the store was last seeded from (A4: detect a stale seed)

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

    // ---- persistent, dismissible error panel --------------------------------
    function showError(msg) {
      const e = $('#alg-error'), m = $('#alg-error-msg');
      if (e && m) { m.textContent = msg; e.classList.remove('hidden'); }
      else toast(msg, { kind: 'error' });
    }
    function clearError() { const e = $('#alg-error'); if (e) e.classList.add('hidden'); }

    // ---- variable picker (dropdown checklist) -------------------------------
    // A discoverable replacement for free-text variable entry: a button that opens
    // a checklist of the available variables, toggling membership in `selected`.
    // getOptions() returns the raw names (rebuilt each open); `selected` is a Set
    // that the picker mutates; onChange fires after each toggle.
    let _openMenu = null;
    function buildPicker(host, opts) {
      if (!host) return;
      host.innerHTML = '';
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'small algebra-picker-btn';
      const menu = document.createElement('div');
      menu.className = 'algebra-picker-menu hidden';
      host.appendChild(btn); host.appendChild(menu);
      const label = () => {
        const n = opts.selected.size;
        btn.textContent = (opts.label || 'pick') + (n ? ' (' + n + ') ▾' : ' ▾');
      };
      function render() {
        menu.innerHTML = '';
        const names = opts.getOptions() || [];
        if (!names.length) { const d = document.createElement('div'); d.className = 'hint'; d.textContent = 'no variables yet'; menu.appendChild(d); return; }
        names.forEach((raw) => {
          const row = document.createElement('label'); row.className = 'algebra-picker-row';
          const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = raw; cb.checked = opts.selected.has(raw);
          cb.addEventListener('change', () => { if (cb.checked) opts.selected.add(raw); else opts.selected.delete(raw); label(); if (opts.onChange) opts.onChange(); });
          const span = document.createElement('span'); span.textContent = (opts.friendly ? opts.friendly(raw) : raw);
          row.appendChild(cb); row.appendChild(span); menu.appendChild(row);
        });
      }
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const willOpen = menu.classList.contains('hidden');
        if (_openMenu && _openMenu !== menu) _openMenu.classList.add('hidden');
        if (willOpen) { render(); menu.classList.remove('hidden'); _openMenu = menu; }
        else { menu.classList.add('hidden'); _openMenu = null; }
      });
      menu.addEventListener('click', (ev) => ev.stopPropagation());
      label();
      return { refresh: label };
    }
    function friendlyVar(raw) { return latexPlain(raw) + ' · ' + raw; }

    // ---- seeding -------------------------------------------------------------
    // Seed the ORIGINAL system at column 0. Assumptions are NOT baked here — they are
    // applied as append-column reductions (Assume real / Specify value) so the graph
    // keeps a visible history. φ(0) fixation IS a generation choice (it changes which
    // system is generated): with #alg-w0-fix ticked the solve's selected center
    // (centroid of the poles by default) is baked into the seed, so column 0 is the
    // system "as generated" and its header notes φ(0) is fixed; untick for symbolic w₀.
    function seedFromCurrent() {
      if (!activeEnv) { setStatus(STR.noSolve || 'No classical bounded QD solved yet.'); return false; }
      try {
        clearError();
        const w0cb = $('#alg-w0-fix');
        const fixW0 = !w0cb || w0cb.checked;
        const w0Sel = fixW0 ? (activeEnv.w0Used || (activeEnv.primary && activeEnv.primary.phi && activeEnv.primary.phi.w0)) : undefined;
        const sys = QE.generateClassicalBounded(activeEnv.hData, { maxPoleOrder: lastCap, w0: w0Sel });
        store.seedFromSystem(sys);
        _seededHData = activeEnv.hData;                 // remember what we seeded from (A4)
        // A fresh seed invalidates prior picker selections (A8) — clear and refresh.
        realSel.clear(); elimSel.clear(); refreshPickers();
        setStatus((STR.seeded || 'Seeded') + ' ' + store.size + ' equations (incl. conjugates; ' + sys.n + ' pole' + (sys.n === 1 ? '' : 's') + ', order ' + sys.d + ')' +
          (w0Sel ? '; φ(0) fixed to ' + (QD.Complex ? QD.Complex.toString(w0Sel, 4) : '') : '; w₀ symbolic') +
          '. Add assumptions (Assume real / Specify value) — each becomes a new column.');
        rerender();
        return true;
      } catch (e) {
        setStatus((STR.unavailablePrefix || 'Generation unavailable: ') + ((e && e.message) || e));
        return false;
      }
    }

    // ---- φ / h reference panel ----------------------------------------------
    // The symbolic forms of the map φ and the quadrature data h for the current solve,
    // plus a legend of what each workspace variable represents. Independent of the
    // store reductions — it documents the ORIGINAL variables' meanings.
    const _refMeaning = [
      [/^w_0/, 'φ(0) — Riemann-map center'],
      [/^z_/, 'pre-image of the pole in 𝔻'],
      [/^A_/, 'Riemann-map (Faber) coefficient'],
      [/^C_/, 'principal-part coefficient of h'],
      [/^a_/, 'quadrature node (pole of h)'],
      [/^c$/, 'logarithmic capacity'],
      [/^F_/, 'polynomial-part coefficient'],
    ];
    function refMeaning(name) { for (const [re, m] of _refMeaning) if (re.test(name)) return m; return ''; }
    // h(w) = Σ_j Σ_{s≥1} C_{j,s}/(w − a_j)^s — symbolic names, or values substituted.
    function buildHForm(hData, numeric) {
      const RL = QD.RiemannLatex;
      const terms = [];
      (hData.poles || []).forEach((pole, j) => {
        const aSym = numeric ? RL.katexCmpxParen(pole.a) : 'a_{' + (j + 1) + '}';
        (pole.principal || []).forEach((C, s) => {
          const power = s + 1;
          const num = numeric ? RL.katexCmpxParen(C) : 'C_{' + (j + 1) + ',' + power + '}';
          const den = power === 1 ? '(w - ' + aSym + ')' : '(w - ' + aSym + ')^{' + power + '}';
          terms.push('\\dfrac{' + num + '}{' + den + '}');
        });
      });
      return 'h(w) \\;=\\; ' + (terms.length ? terms.join(' + ') : '0');
    }
    function buildReference() {
      const box = $('#alg-ref'); if (!box) return;
      box.innerHTML = '';
      const phi = activeEnv && activeEnv.primary && activeEnv.primary.phi;
      const hData = activeEnv && activeEnv.hData;
      if (!phi || !hData) { box.innerHTML = '<div class="hint">Solve a classical bounded QD to see φ and h.</div>'; return; }
      const RL = QD.RiemannLatex;
      const showVals = $('#alg-ref-values') && $('#alg-ref-values').checked;
      const built = RL.build(phi);
      const mathRow = (title, latex) => {
        const k = document.createElement('div'); k.className = 'key'; k.style.marginTop = '4px'; k.textContent = title;
        const m = document.createElement('div'); m.className = 'algebra-ref-math';
        RL.render(m, latex, true);
        box.appendChild(k); box.appendChild(m);
      };
      mathRow('Map  φ : 𝔻 → Ω', showVals ? built.numeric : built.symbolic);
      mathRow('Quadrature data  h', buildHForm(hData, showVals));
      // legend: φ params (w₀, z_j, A_{j,k}) + h params (a_j, C_{j,s})
      const hParams = [];
      (hData.poles || []).forEach((pole, j) => {
        hParams.push({ name: 'a_{' + (j + 1) + '}', value: pole.a });
        (pole.principal || []).forEach((C, s) => hParams.push({ name: 'C_{' + (j + 1) + ',' + (s + 1) + '}', value: C }));
      });
      const k = document.createElement('div'); k.className = 'key'; k.style.marginTop = '4px'; k.textContent = 'Variables';
      box.appendChild(k);
      const tbl = document.createElement('table'); tbl.className = 'algebra-ref-legend';
      built.params.concat(hParams).forEach((p) => {
        const tr = document.createElement('tr');
        const tdN = document.createElement('td'); RL.render(tdN, p.name, false);
        const tdM = document.createElement('td'); tdM.className = 'hint'; tdM.textContent = refMeaning(p.name);
        const tr2 = document.createElement('td');
        if (showVals && p.value) RL.render(tr2, RL.katexCmpx(p.value), false);
        tr.appendChild(tdN); tr.appendChild(tdM); tr.appendChild(tr2); tbl.appendChild(tr);
      });
      box.appendChild(tbl);
    }

    // Refresh picker button labels + the specify-value variable list (after a seed or
    // a reduction changes the variable set / clears selections).
    function refreshPickers() {
      if (_elimPicker && _elimPicker.refresh) _elimPicker.refresh();
      if (_realPicker && _realPicker.refresh) _realPicker.refresh();
      refreshValueVars();
    }
    function refreshValueVars() {
      const sel = $('#alg-val-var'); if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = '';
      store.variables().forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = latexPlain(v) + ' · ' + v; sel.appendChild(o); });
      if (prev) sel.value = prev;
    }

    // Assume the picked base variables real → a new labeled column (store.assumeReal).
    function doAssumeReal() {
      if (!store.size && !seedFromCurrent()) return;
      const vars = [...realSel];
      if (!vars.length) { toast('Pick one or more variables to assume real.', { kind: 'error' }); return; }
      const r = store.assumeReal(vars);
      if (!r.ok) { showError('Assume real: ' + (r.reason || 'failed')); return; }
      rerender(); refreshPickers();
      toast('Assumed ' + vars.map(latexPlain).join(', ') + ' real → column ' + r.column + ' (' + r.created.length + ' equation' + (r.created.length === 1 ? '' : 's') + ')');
    }

    // Auto reality: detect real-axis symmetry of h and, when the data is fully real,
    // assume every base variable real in one click (collapses the conjugate model — the
    // 478→118-generator lever). Conjugate-pole-pair symmetry is detected but not auto-
    // applied (per-variable reality isn't valid there — pair the variables by hand).
    function doAutoReality() {
      if (!activeEnv) { toast(STR.noSolve || 'No classical bounded QD solved yet.', { kind: 'error' }); return; }
      const sym = QE.realAxisSymmetry(activeEnv.hData);
      if (!sym.allReal) {
        toast(sym.conjugationClosed
          ? 'h is real-axis symmetric via conjugate pole pairs — per-variable reality is not valid; pair the conjugate variables by hand.'
          : 'No real-axis symmetry detected in h — reality cannot be assumed automatically.', { kind: 'error' });
        return;
      }
      if (!store.size && !seedFromCurrent()) return;
      const vars = store.baseVariables();
      const r = store.assumeReal(vars);
      if (!r.ok) { showError('Auto reality: ' + (r.reason || 'failed')); return; }
      rerender(); refreshPickers();
      toast('Real-axis-symmetric h → assumed ' + vars.length + ' base variable(s) real → column ' + r.column + ' (' + r.created.length + ' equation' + (r.created.length === 1 ? '' : 's') + ')');
    }

    // Fix the chosen variable to an exact value → a new labeled column, then (if the
    // propagate box is ticked) cascade the consequence as a further column.
    function doSubstituteValue() {
      if (!store.size && !seedFromCurrent()) return;
      const v = $('#alg-val-var') && $('#alg-val-var').value;
      if (!v) { toast('No variable selected.', { kind: 'error' }); return; }
      const re = parseFloat($('#alg-val-re') && $('#alg-val-re').value) || 0;
      const im = parseFloat($('#alg-val-im') && $('#alg-val-im').value) || 0;
      const propagate = !$('#alg-val-prop') || $('#alg-val-prop').checked;
      const r = store.substituteValue(v, { re, im }, { propagate });
      if (!r.ok) { showError('Set value: ' + (r.reason || 'failed')); return; }
      rerender(); refreshPickers();
      let msg = 'Set ' + latexPlain(v) + ' = ' + (im ? re + (im < 0 ? '−' : '+') + Math.abs(im) + 'i' : re) + ' → column ' + r.column;
      if (r.propagated) msg += '; propagated (eliminated ' + r.propagated.eliminated.map(latexPlain).join(', ') + (r.propagated.inconsistent ? '; system inconsistent — no solution' : '') + ')';
      toast(msg);
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
        // φ / h reference: the symbolic forms + a legend of what each variable means.
        '<div class="row" style="margin-top:4px; gap:6px; align-items:center;">' +
        '  <button id="alg-ref-toggle" class="small" type="button" title="Show the symbolic forms of φ and h and what each variable represents">φ / h reference ▸</button>' +
        '  <label style="font-size:11px;"><input type="checkbox" id="alg-ref-values"> show values</label></div>' +
        '<div id="alg-ref" class="card-sub hidden algebra-ref"></div>' +
        '<div class="row"><button id="alg-seed" class="small" type="button" ' +
        'title="Generate the original (●)/(★)/gauge system from the current bounded solve at column 0 (replaces the graph; assumptions are then added as columns)">Generate / re-seed</button>' +
        '<button id="alg-undo" class="small" type="button" style="margin-left:6px;" title="Undo">Undo</button>' +
        '<button id="alg-redo" class="small" type="button" style="margin-left:4px;" title="Redo">Redo</button>' +
        '<button id="alg-fit" class="small" type="button" style="margin-left:4px;" title="Reset pan / zoom">Fit</button></div>' +
        '<div id="alg-status" class="hint" style="margin:4px 0;"></div>' +
        // Persistent, dismissible error panel (stays until × is clicked).
        '<div id="alg-error" class="algebra-error hidden">' +
        '  <span id="alg-error-msg" class="algebra-error-msg"></span>' +
        '  <button id="alg-error-close" class="algebra-error-close" type="button" title="Dismiss">×</button>' +
        '</div>' +
        // Fixed φ(0): bake the solve's selected Riemann-map center (centroid of the
        // poles by default) into the seeded equations — w₀/w̄₀ stop being variables.
        '<div class="row" style="margin-top:4px; gap:4px; align-items:center;">' +
        '  <label style="font-size:11px;" data-str-title="tooltips.algFixW0">' +
        '    <input type="checkbox" id="alg-w0-fix" checked> fix φ(0) = w₀ (selected center; centroid by default)</label></div>' +
        // Assume-real picker: assert chosen variables are real → a NEW labeled column.
        '<div class="row" style="margin-top:4px; gap:4px; align-items:center;">' +
        '  <span style="font-size:11px;">Assume real:</span><span id="alg-real-pick" class="algebra-picker"></span>' +
        '  <button id="alg-real-apply" class="small" type="button" data-str-title="tooltips.assumeReal">Apply (new column)</button>' +
        '  <button id="alg-real-auto" class="small" type="button" title="Detect real-axis symmetry of h and, if the data is fully real, assume every base variable real in one step (the biggest tractability lever)">Auto</button></div>' +
        // Specify-value: fix a variable to an exact value → a NEW labeled column, then
        // auto-propagate (linear cascade) so the value eliminates dependent variables.
        '<div class="row" style="margin-top:4px; gap:4px; align-items:center; flex-wrap:wrap;">' +
        '  <span style="font-size:11px;">Set value:</span>' +
        '  <select id="alg-val-var" style="max-width:120px;"></select>' +
        '  <input id="alg-val-re" type="number" step="any" placeholder="Re" style="width:60px;" title="Real part">' +
        '  <input id="alg-val-im" type="number" step="any" placeholder="Im" style="width:60px;" title="Imaginary part">' +
        '  <label style="font-size:11px;" title="After substituting, run a linear-propagation pass (eliminate forced variables) as a further column."><input type="checkbox" id="alg-val-prop" checked> propagate</label>' +
        '  <button id="alg-val-apply" class="small" type="button" title="Substitute the exact value (continued-fraction ℚ(i)) for this variable → a new column">Apply</button></div>' +
        '<div class="row" style="margin-top:4px;"><button id="alg-gauge-elim" class="small" type="button" ' +
        'data-str-title="tooltips.gaugeElim">Eliminate with gauge (all)</button></div>' +
        '<div class="row" style="margin-top:4px; flex-wrap:wrap; gap:4px; align-items:center;">' +
        '  <button id="alg-groebner" class="small" type="button" data-str-title="tooltips.groebner">Gröbner basis (all eqns)</button>' +
        '  <label style="font-size:11px;" title="Monomial order. lex = elimination order; grevlex = fastest general.">order ' +
        '    <select id="alg-gb-order"><option value="grevlex">grevlex</option><option value="grlex">grlex</option><option value="lex">lex</option></select></label>' +
        '  <span style="font-size:11px;">eliminate:</span><span id="alg-elim-pick" class="algebra-picker"></span></div>' +
        '<div class="row" style="margin-top:6px; gap:4px;">' +
        '  <button id="alg-autosolve" class="small" type="button" style="font-weight:600;" title="Semi-autonomous: auto-assume reality (if h is symmetric), propagate linear consequences, then determine existence/uniqueness and the explicit real solutions — each step a new labeled column">★ Auto-reduce &amp; solve</button></div>' +
        '<div class="row" style="margin-top:4px; gap:4px; flex-wrap:wrap;">' +
        '  <button id="alg-triangular" class="small" type="button" title="Triangular decomposition (Wu pseudo-elimination) of the current system — an alternative to Gröbner that exhibits the solution structure (free variables, no-solution)">Triangular decomp.</button>' +
        '  <button id="alg-classify" class="small" type="button" title="Existence / uniqueness: count the REAL solutions (= actual quadrature domains) of the current system via the Hermite trace form, plus distinct-complex / inconsistent / positive-dimensional verdicts">Existence / uniqueness</button>' +
        '  <button id="alg-dimension" class="small" type="button" data-str-title="tooltips.dimension">Dimension / count</button>' +
        '  <button id="alg-solve" class="small" type="button" data-str-title="tooltips.solveNumeric">Solve (numeric)</button>' +
        '  <button id="alg-cancel" class="small hidden" type="button" title="Cancel the running computation">Cancel</button></div>' +
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
          if (!store.size && !seedFromCurrent()) return;   // bail if seeding failed (e.g. order over cap) — don't add to an unseeded graph
          try { const made = store.addConstraint(b.form, activeEnv.hData); rerender(); toast('Added ' + made.length + ' node(s): ' + b.label); }
          catch (e) { toast((e && e.message) || String(e), { kind: 'error' }); }
        });
        pal.appendChild(btn);
      });

      const helpBtn = $('#alg-help-toggle');
      if (helpBtn) helpBtn.addEventListener('click', () => { const h = $('#alg-help'); if (h) h.classList.toggle('hidden'); });
      const refBtn = $('#alg-ref-toggle');
      if (refBtn) refBtn.addEventListener('click', () => {
        const r = $('#alg-ref'); if (!r) return;
        const open = r.classList.toggle('hidden') === false;
        refBtn.textContent = 'φ / h reference ' + (open ? '▾' : '▸');
        if (open) buildReference();
      });
      const refVals = $('#alg-ref-values');
      if (refVals) refVals.addEventListener('change', () => { const r = $('#alg-ref'); if (r && !r.classList.contains('hidden')) buildReference(); });
      $('#alg-seed').addEventListener('click', seedFromCurrent);
      const w0FixCb = $('#alg-w0-fix');
      if (w0FixCb) w0FixCb.addEventListener('change', () => { if (store.size) seedFromCurrent(); });
      $('#alg-undo').addEventListener('click', () => { if (store.undo()) rerender(); });
      $('#alg-redo').addEventListener('click', () => { if (store.redo()) rerender(); });
      $('#alg-fit').addEventListener('click', () => { if (canvas) canvas.fit(); });
      $('#alg-eliminate').addEventListener('click', doEliminate);
      $('#alg-groebner').addEventListener('click', () => doGroebner(null));
      $('#alg-groebner-sel').addEventListener('click', () => doGroebner(canvas ? canvas.getSelection() : []));
      $('#alg-autosolve').addEventListener('click', doAutoSolve);
      $('#alg-triangular').addEventListener('click', doTriangular);
      $('#alg-classify').addEventListener('click', doClassify);
      $('#alg-dimension').addEventListener('click', doDimension);
      $('#alg-solve').addEventListener('click', doSolve);
      $('#alg-cancel').addEventListener('click', cancelOp);
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
      $('#alg-error-close').addEventListener('click', clearError);
      $('#alg-real-apply').addEventListener('click', doAssumeReal);
      $('#alg-real-auto').addEventListener('click', doAutoReality);
      $('#alg-val-apply').addEventListener('click', doSubstituteValue);

      // variable pickers (eliminate = all current vars; assume-real = primal base vars)
      _elimPicker = buildPicker($('#alg-elim-pick'), { label: 'pick', friendly: friendlyVar, selected: elimSel, getOptions: () => store.variables() });
      _realPicker = buildPicker($('#alg-real-pick'), { label: 'pick', friendly: (raw) => latexPlain(raw) + ' · ' + raw, selected: realSel, getOptions: () => store.baseVariables() });
      refreshValueVars();
      // close any open picker menu when clicking elsewhere
      document.addEventListener('click', () => { if (_openMenu) { _openMenu.classList.add('hidden'); _openMenu = null; } });

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
    // Busy-state manager for the off-main-thread (worker) ops — disables the heavy
    // controls AND the graph-mutating controls (undo/redo, reductions, palette) so a
    // mutation can't land mid-op and orphan an in-flight derivation (A5), reveals
    // Cancel, and routes progress to the status line.
    let _abort = null;
    function setBusy(on, label) {
      ['alg-groebner', 'alg-groebner-sel', 'alg-solve', 'alg-dimension', 'alg-triangular', 'alg-classify', 'alg-autosolve',
        'alg-gauge-elim', 'alg-eliminate', 'alg-seed', 'alg-undo', 'alg-redo', 'alg-real-apply', 'alg-real-auto', 'alg-val-apply']
        .forEach((id) => { const b = $('#' + id); if (b) b.disabled = on; });
      const pal = $('#alg-palette'); if (pal) pal.querySelectorAll('button').forEach((b) => { b.disabled = on; });
      const cancel = $('#alg-cancel'); if (cancel) cancel.classList.toggle('hidden', !on);
      if (on && label) setStatus(label);
    }
    function cancelOp() { if (_abort) { try { _abort.abort(); } catch (e) { /* ignore */ } } if (QD.SymWorker) QD.SymWorker.cancel(); }
    function _newAbort() { return (typeof AbortController !== 'undefined') ? new AbortController() : null; }

    // Append a CAS-route hint to cap/too-large failures (the recurring case).
    function withGuidance(reason) {
      return /export|cap|exceed|too large|step|basis|degree|terms/i.test(reason || '')
        ? (reason + '  Try: assume variables real (simplifies the system), eliminate fewer variables, or use the CAS export.')
        : reason;
    }

    // Gröbner basis of a node selection (null/empty ⇒ every equality node), run
    // off the main thread via QD.SymWorker (falls back to sync if unavailable).
    // Reads the order selector and the elimination-variable picker.
    function doGroebner(sel) {
      if (_abort) return;                       // an op is already running
      if (!store.size) { if (!seedFromCurrent()) return; }
      clearError();
      const ids = (sel && sel.length) ? sel.slice()
        : store.currentColumnIds();      // default: the CURRENT system (last column), not every column
      const orderEl = $('#alg-gb-order');
      const order = (orderEl && orderEl.value) || 'grevlex';
      const elim = [...elimSel];
      const opts = elim.length ? { eliminate: elim } : { order };
      const ctrl = _newAbort(); _abort = ctrl;
      setBusy(true, 'Computing Gröbner basis…');
      store.groebnerAsync(ids, opts, {
        signal: ctrl && ctrl.signal,
        onProgress: (info) => setStatus('Gröbner… ' + info.basis + ' generators, ' + info.pairs + ' pairs left'),
      }).then((r) => {
        _abort = null; setBusy(false);
        if (r.aborted) { setStatus('Cancelled.'); toast('Cancelled'); return; }
        if (!r.ok) { showError('Gröbner basis: ' + withGuidance(r.reason || 'failed')); setStatus(''); return; }
        if (canvas) canvas.clearSelection();
        rerender(); setStatus('');
        toast('Gröbner basis: ' + r.created.length + ' generator(s)' +
          (elim.length ? ' eliminating ' + elim.map(latexPlain).join(', ') : ' (' + order + ')') +
          (r.skipped.length ? '; skipped ' + r.skipped.length + ' non-equality' : ''));
      });
    }

    // Triangular decomposition of the current system → a triangular chain column.
    function doTriangular() {
      if (_abort) return;
      if (!store.size && !seedFromCurrent()) return;
      clearError();
      const sel = canvas ? canvas.getSelection() : [];
      const r = store.triangularize(sel.length ? sel : null);
      if (!r.ok) { showError('Triangular decomposition: ' + withGuidance(r.reason || 'failed')); return; }
      if (canvas) canvas.clearSelection();
      rerender();
      if (r.contradiction) { toast('Triangular decomposition: system is INCONSISTENT — no solution.'); return; }
      toast('Triangular decomposition: ' + r.created.length + ' element(s)' +
        (r.freeVars.length ? '; free variable(s) ' + r.freeVars.map(latexPlain).join(', ') + ' ⇒ a positive-dimensional family' : ' ⇒ zero-dimensional (finitely many solutions)'));
    }

    // Existence / uniqueness verdict over the REAL (reim) system: how many real
    // solutions (= quadrature domains) the current system has, with inconsistent /
    // positive-dimensional / non-radical distinctions surfaced.
    // Semi-autonomous "Auto-reduce & solve": chain the reductions (auto-reality →
    // linear propagation), each appended as a labeled column, then determine existence/
    // uniqueness and the explicit real solutions. The reduction history stays visible.
    function doAutoSolve() {
      if (_abort) return;
      if (!activeEnv) { toast(STR.noSolve || 'No classical bounded QD solved yet.', { kind: 'error' }); return; }
      if (!store.size && !seedFromCurrent()) return;
      clearError();
      setBusy(true, 'Auto-reduce & solve…');
      const tick = () => new Promise((res) => setTimeout(res, 30));
      (async () => {
        try {
          // 1. auto reality (if h is real-axis symmetric and not already collapsed)
          const sym = QE.realAxisSymmetry(activeEnv.hData);
          if (sym.allReal && !store.realVars.length) {
            const r = store.assumeReal(store.baseVariables());
            if (r.ok) { rerender(); setStatus('Auto: assumed reality → column ' + r.column); await tick(); }
          }
          // 2. linear-propagation passes (to a fixpoint)
          for (let i = 0; i < 4; i++) {
            const pr = store.reducePropagate();
            if (!pr.ok) break;
            rerender(); setStatus('Auto: linear propagation → column ' + pr.column + (pr.inconsistent ? ' (inconsistent)' : '')); await tick();
            if (pr.inconsistent) break;
          }
          // 3. existence / uniqueness verdict (parameters pinned)
          const params = hDataParamValues();
          const cl = store.classify(null, { paramValues: params });
          if (!cl.ok) { setBusy(false); showError('Auto-reduce & solve: ' + withGuidance(cl.reason || 'failed')); return; }
          let verdict;
          if (cl.inconsistent) verdict = 'No quadrature domain: the reduced system is inconsistent.';
          else if (!cl.zeroDim) verdict = 'A positive-dimensional family of solutions (' + cl.numVars + ' real variables) — add a constraint or fix a value to pin it.';
          else verdict = (cl.realCount == null ? cl.multiplicity + ' solution(s) with multiplicity'
            : (cl.realCount === 0 ? 'No real quadrature domain'
              : cl.realCount === 1 ? 'Unique quadrature domain (1 real solution)'
                : cl.realCount + ' real quadrature domains')
            + (cl.complexCount != null ? ' of ' + cl.complexCount + ' distinct complex' : '')) + '.';
          // 4. explicit real solutions when zero-dimensional
          let coords = '';
          if (cl.zeroDim && !cl.inconsistent) {
            const sr = store.solveReal(null, { paramValues: params });
            if (sr.ok && sr.solutions && sr.solutions.length) {
              const reals = sr.solutions.filter((s) => Object.keys(s).every((k) => Math.abs(s[k].im) < 1e-6));
              coords = ' Explicit: ' + reals.length + ' real solution(s) — see console.';
              try { console.table(sr.solutions.map((s) => { const row = {}; Object.keys(s).forEach((k) => { row[k] = s[k].re.toFixed(6) + (s[k].im >= 0 ? '+' : '−') + Math.abs(s[k].im).toFixed(6) + 'i'; }); return row; })); } catch (e) { /* ignore */ }
            }
          }
          setBusy(false); refreshPickers();
          setStatus(verdict + coords);
          toast(verdict, cl.inconsistent || cl.realCount === 0 ? { kind: 'error' } : {});
        } catch (e) { setBusy(false); showError('Auto-reduce & solve: ' + ((e && e.message) || String(e))); }
      })();
    }

    // The known quadrature-data values (a_j, C_{j,s} and their conjugates) keyed by the
    // conjugate-model variable names — to PIN the parameters for the existence verdict
    // (they are given data, not unknowns).
    function hDataParamValues() {
      const hData = activeEnv && activeEnv.hData; if (!hData) return null;
      const m = {};
      (hData.poles || []).forEach((pole, i) => {
        const j = i + 1, a = pole.a || { re: 0, im: 0 };
        m['a' + j] = { re: a.re || 0, im: a.im || 0 };
        m['ab' + j] = { re: a.re || 0, im: -(a.im || 0) };
        (pole.principal || []).forEach((C, s) => {
          m['C' + j + '_' + (s + 1)] = { re: C.re || 0, im: C.im || 0 };
          m['Cb' + j + '_' + (s + 1)] = { re: C.re || 0, im: -(C.im || 0) };
        });
      });
      return m;
    }
    function doClassify() {
      if (_abort) return;
      if (!store.size && !seedFromCurrent()) return;
      clearError();
      setBusy(true, 'Counting real solutions (existence / uniqueness)…');
      // sync, but yield once so the busy state paints
      setTimeout(() => {
        const sel = canvas && canvas.getSelection().length ? canvas.getSelection() : null;
        let r; try { r = store.classify(sel, { paramValues: hDataParamValues() }); }
        catch (e) { r = { ok: false, reason: (e && e.message) || String(e) }; }
        setBusy(false); setStatus('');
        if (!r.ok) { showError('Existence / uniqueness: ' + withGuidance(r.reason || 'unavailable')); return; }
        let verdict;
        if (r.inconsistent) verdict = 'No quadrature domain: the system is inconsistent (1 ∈ I).';
        else if (!r.zeroDim) verdict = 'Infinitely many: a positive-dimensional family (' + r.numVars + ' real variables).';
        else if (r.realCount == null) verdict = 'Zero-dimensional: ' + r.multiplicity + ' complex solution(s) with multiplicity (real count unavailable: ' + (r.reason || '') + ').';
        else {
          const cx = r.complexCount, mult = r.multiplicity;
          const tail = (cx != null ? ' (of ' + cx + ' distinct complex' + (mult != null && mult > cx ? '; ' + mult + ' with multiplicity' : '') + ')' : '');
          if (r.realCount === 0) verdict = 'No real quadrature domain' + tail + '.';
          else if (r.realCount === 1) verdict = 'Unique quadrature domain — exactly 1 real solution' + tail + '.';
          else verdict = r.realCount + ' real quadrature domains' + tail + '.';
        }
        setStatus(verdict);
        toast(verdict, r.inconsistent || r.realCount === 0 ? { kind: 'error' } : {});
      }, 20);
    }

    // Report the dimension / solution count of the current equality system, off the
    // main thread (falls back to sync) so a heavy grevlex basis can't freeze the UI.
    function doDimension() {
      if (_abort) return;
      if (!store.size) { if (!seedFromCurrent()) return; }
      clearError();
      const ctrl = _newAbort(); _abort = ctrl;
      setBusy(true, 'Computing dimension…');
      store.dimensionAsync(null, {}, {
        signal: ctrl && ctrl.signal,
        onProgress: (info) => setStatus('Dimension… ' + info.basis + ' generators, ' + info.pairs + ' pairs left'),
      }).then((r) => {
        _abort = null; setBusy(false); setStatus('');
        if (r.aborted) { toast('Cancelled'); return; }
        if (!r.ok) { showError('Dimension: ' + withGuidance(r.reason || 'unavailable')); return; }
        if (r.zeroDim) toast('Zero-dimensional: ' + r.dimension + ' solution(s) (with multiplicity), ' + r.numVars + ' variables.');
        else toast('Positive-dimensional: infinitely many solutions (' + r.numVars + ' variables) — assume more variables real or add constraints.');
      });
    }
    // Solve the current equality system numerically (shape-lemma path), off the main
    // thread via QD.SymWorker (falls back to sync if unavailable).
    function doSolve() {
      if (_abort) return;
      if (!store.size) { if (!seedFromCurrent()) return; }
      clearError();
      const ctrl = _newAbort(); _abort = ctrl;
      setBusy(true, 'Solving (Gröbner → FGLM → roots)…');
      store.solveAsync(null, {}, {
        signal: ctrl && ctrl.signal,
        onProgress: (info) => setStatus('Solving… ' + info.basis + ' generators, ' + info.pairs + ' pairs left'),
      }).then((r) => {
        _abort = null; setBusy(false); setStatus('');
        if (r.aborted) { toast('Cancelled'); return; }
        if (!r.ok) { showError('Numeric solve: ' + withGuidance(r.reason || 'unavailable')); return; }
        toast('Solved: ' + r.solutions.length + ' solution(s) (dimension ' + r.dimension + '). See console for coordinates.');
        try {
          console.table(r.solutions.map((s) => {
            const row = {}; Object.keys(s).forEach((k) => { row[k] = s[k].re.toFixed(6) + (s[k].im >= 0 ? '+' : '−') + Math.abs(s[k].im).toFixed(6) + 'i'; });
            return row;
          }));
        } catch (e) { /* console.table unavailable — ignore */ }
      });
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
    // Compact display of a stored {re:[n,d], im:[n,d], approx} value record.
    function valStr(rec) {
      const a = rec && rec.approx; if (!a) return '?';
      const f = (x) => String(Math.round(x * 1e6) / 1e6);
      if (!a.im) return f(a.re);
      if (!a.re) return f(a.im) + 'i';
      return f(a.re) + (a.im < 0 ? ' − ' : ' + ') + f(Math.abs(a.im)) + 'i';
    }
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
        case 'substitute': return 'set ' + latexPlain(prov.variable) + ' = ' + valStr(prov.value);
        case 'linear-reduce': return 'linear propagation (eliminated ' + (prov.eliminated || []).map(latexPlain).join(', ') + ')';
        case 'assume-real': return 'assumed ' + (prov.vars || []).map(latexPlain).join(', ') + ' real';
        case 'fix-w0': return 'fixed φ(0) = ' + valStr(prov.value);
        case 'triangular': return prov.contradiction ? 'triangular decomposition (inconsistent)' : 'triangular decomposition (Wu) of ' + (prov.inputs || []).join(', ');
        default: return prov.op || '';
      }
    }
    // The per-column header label (audit trail): column 0 is the original system; each
    // later column is the assumption/reduction that produced it (uniform provenance).
    function columnHeader(c, ns) {
      if (!ns || !ns.length) return '';
      if (c === 0) return 'Original system' + (store.w0Fixed ? ' · φ(0) fixed' : '');
      const rep = ns.find((n) => n.provenance && n.provenance.op !== 'conjugate') || ns[0];
      const p = rep.provenance || {};
      switch (p.op) {
        case 'substitute': return 'set ' + latexPlain(p.variable) + ' = ' + valStr(p.value);
        case 'linear-reduce': return 'propagate · eliminate ' + (p.eliminated || []).map(latexPlain).join(', ');
        case 'assume-real': return 'assume real · ' + (p.vars || []).map(latexPlain).join(', ');
        case 'fix-w0': return 'fix φ(0) = ' + valStr(p.value);
        case 'resultant': return 'eliminate ' + latexPlain(p.variable);
        case 'groebner': return 'Gröbner · ' + (p.eliminate && p.eliminate.length ? 'elim ' + p.eliminate.map(latexPlain).join(',') : (p.order || 'grevlex'));
        case 'triangular': return p.contradiction ? 'triangular · inconsistent' : 'triangular decomposition';
        default: return 'column ' + c;
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
        colHeaderOf: columnHeader,
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
        // A4: a NEW solve makes any graph seeded from the OLD one stale — clear the
        // stale picker selections and prompt a re-seed instead of letting a later op
        // splice new-hData constraints onto an old-hData graph.
        const staleSeed = store.size && _seededHData && activeEnv && _seededHData !== activeEnv.hData;
        if (staleSeed) { realSel.clear(); elimSel.clear(); }
        if (mounted) {
          if (!activeEnv) setStatus(STR.noSolve || 'No classical bounded QD solved yet.');
          else if (staleSeed) { refreshPickers(); setStatus('Solve changed — click Generate / re-seed to refresh the workspace for the new domain.'); }
          else setStatus((STR.ready || 'Ready — click Generate / re-seed.'));
          const ref = $('#alg-ref'); if (ref && !ref.classList.contains('hidden')) buildReference();
        }
      });
    }

    return { openWorkspace };
  }

  window.QD_UI = window.QD_UI || {};
  window.QD_UI.installAlgebra = installAlgebra;
})();
