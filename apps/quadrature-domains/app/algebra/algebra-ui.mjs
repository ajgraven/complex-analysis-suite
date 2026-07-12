// =============================================================================
// algebra-ui.js -- the Algebra tab: an interactive equation-derivation workspace
// (QD_UI.installAlgebra). Hosts a QD.AlgebraStore rendered by QD.AlgebraCanvas in
// a full-area #algebra-graph surface over #plot-area, with sidebar controls in
// #controls-algebra: seed the ORIGINAL (●)/(★)/gauge system from the current
// classical-bounded solve (φ(0) fixed at generation time by default) at column 0,
// then apply AUDIT-TRAIL reductions that each append a new labeled column — Assume
// real (identify v̄≡v), Specify value (fix a variable to an exact ℚ(i) value, auto-
// propagating the linear cascade), pairwise resultant elimination (select 2 nodes +
// a shared variable, with a cost preview), batch gauge elimination, Gröbner basis, and
// triangular decomposition. Plus a univalence-constraint palette, a φ/h reference panel,
// dimension / numeric solve and an existence/uniqueness verdict (# real solutions =
// # quadrature domains) + a one-click ★ Auto-reduce & solve, all over the CURRENT system
// (the last column, off the main thread with a Cancel button), a persistent dismissible
// error panel, undo/redo, zoom + expand/collapse-all, and DAG/LaTeX export. The reductions
// render as STRUCTURED COLUMN LANES (algebra-canvas): each lane's sticky header — built
// here by `columnInfo` and passed as the canvas `colInfo` handler — names the
// transformation relating it to the previous column, with eqn/var counts + a Δ.
//
// SIDEBAR is a NODE-EDITOR model (mountSidebar): a pinned header (★ Auto-reduce & solve +
// Generate + status table + error), the φ/h reference shown by default, collapsible
// <details> workflow sections (Assumptions / Reduce / Analyze / Univalence constraints /
// Export), and a CONTEXTUAL INSPECTOR (renderInspector) that replaces the sections when a
// node is selected: 1 node → its equation + Duplicate/Copy/Delete + Attempt-to-factor
// (doFactor → store.applyFactor, a V(p)=⋃V(fᵢ) case split); 2 nodes → the eliminate panel.
// View/history live in a FLOATING TOOLBAR over the graph (buildToolbar: zoom/fit/fit-width/
// expand/collapse/undo/redo); a REDUCTION BREADCRUMB (buildBreadcrumb) jumps to any lane via
// canvas.scrollToColumn. Export covers DAG-JSON, LaTeX, and MATHEMATICA (a column, all
// columns, or one node). provText/columnLabel/edgeLabel render provenance.op from the PROV_UI
// registry (below) — the UI companion to the store's PROV_STORE; add a node type as one record
// in each (both coverage-tested).
//
// CAS-UX (Stoutemyer): preview-before-commit (cost), navigable derivation tree +
// backtracking (DAG + undo), equation selection, accumulate alternatives (branch/
// duplicate/factor), derivational view (the graph is the work). Gated on classical
// bounded QD (hidden otherwise). All algebra is in QD.Sym/QDEquations/QDConstraints.
// =============================================================================

// ESM (Phase 2 port) — twin of algebra/algebra-ui.js (classic stays frozen). UI orchestrator/consumer.
import { state } from '../ui-state.mjs';
import { QD_UI } from '../ui-registry.mjs';
import _QD from '../solver.mjs';
import { plainVar } from '../qd-varscheme.mjs';   // conjugate-model var scheme (plain-text labels)
import { domainPlotData } from './domain-mini-plot.mjs';   // #3: reconstructed-domain thumbnail geometry
const QD = _QD;

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

  // Provenance-op registry (UI side) — companion to the store's PROV_STORE. ONE table keyed by
  // provenance.op collapses the three UI label switches (provText/columnLabel/edgeLabel), so a
  // new node type is ONE record here (+ one in PROV_STORE), not three UI edits. Each field is a
  // function of (prov, ctx) where ctx = { latexPlain, substList, ratioStrRec, valStr, ns, c } —
  // the UI helpers injected so the table is PURE + unit-testable (exposed as QD_UI.PROV_UI).
  // Fields (all optional): text(p,ctx) → node provenance text (absent ⇒ p.op); column(p,ctx) →
  // per-column transition label, ctx.ns = the column's nodes / ctx.c = its index (absent ⇒
  // '↳ column ' + c); edge(p,ctx) → terse edge label (absent ⇒ p.op || null). Expressions are
  // copied VERBATIM from the old switches; a coverage test asserts the contract is complete.
  const PROV_UI = {
    generate:  { text: (p) => 'generated (' + (p.block || '?') + ' block)' },
    fork: {
      text: (p) => 'forked from ' + (p.fromTrack || '?') + ' · column ' + (p.fromColumn != null ? p.fromColumn : '?'),
      edge: () => 'fork',
    },
    conjugate: {
      text: (p) => 'conjugate companion of ' + (p.inputs || []).join(', '),
      edge: () => 'conj',
    },
    constraint: { text: (p) => 'univalence constraint (' + (p.form || '?') + ')' },
    duplicate: {
      text: (p) => 'copy of ' + (p.inputs || []).join(', '),
      edge: () => 'copy',
    },
    resultant: {
      text:   (p, { latexPlain }) => 'eliminated ' + latexPlain(p.variable) + ' from ' + (p.inputs || []).join(', '),
      column: (p, { latexPlain }) => '↳ eliminate ' + latexPlain(p.variable),
      edge:   (p, { latexPlain }) => 'elim ' + latexPlain(p.variable),
    },
    groebner: {
      text:   (p, { latexPlain }) => 'Gröbner basis (' + (p.eliminate && p.eliminate.length
        ? 'elim ' + p.eliminate.map(latexPlain).join(', ') : (p.order || 'grevlex'))
        + ') of ' + (p.inputs || []).join(', '),
      column: (p, { latexPlain }) => '↳ Gröbner · ' + (p.eliminate && p.eliminate.length ? 'elim ' + p.eliminate.map(latexPlain).join(',') : (p.order || 'grevlex')),
      edge:   (p, { latexPlain }) => p.eliminate && p.eliminate.length ? 'Gröbner · elim ' + p.eliminate.map(latexPlain).join(',') : 'Gröbner',
    },
    substitute: {
      text:   (p, { substList }) => 'set ' + substList(p),
      column: (p, { substList }) => '↳ set ' + substList(p),
      edge:   (p, { latexPlain }) => 'set ' + (((p.variables || []).map((r) => latexPlain(r.name))).join(', ') || (p.variable ? latexPlain(p.variable) : 'value')),
    },
    'linear-reduce': {
      text:   (p, { latexPlain }) => 'linear propagation (eliminated ' + (p.eliminated || []).map(latexPlain).join(', ') + ')',
      column: (p, { latexPlain }) => '↳ propagate · eliminate ' + (p.eliminated || []).map(latexPlain).join(', '),
      edge:   () => 'propagate',
    },
    'assume-real': {
      text:   (p, { latexPlain }) => 'assumed ' + (p.vars || []).map(latexPlain).join(', ') + ' real',
      column: (p, { latexPlain }) => '↳ assume real · ' + (p.vars || []).map(latexPlain).join(', '),
      edge:   () => 'assume real',
    },
    'assume-imaginary': {
      text:   (p, { latexPlain }) => 'assumed ' + (p.vars || []).map(latexPlain).join(', ') + ' imaginary',
      column: (p, { latexPlain }) => '↳ assume imaginary · ' + (p.vars || []).map(latexPlain).join(', '),
      edge:   () => 'assume imag',
    },
    identify: {
      text:   (p, { latexPlain, ratioStrRec }) => 'identified ' + latexPlain(p.drop) + ' = ' + ratioStrRec(p.ratio, p.sign) + latexPlain(p.keep),
      column: (p, { latexPlain, ratioStrRec }) => '↳ identify ' + latexPlain(p.drop) + ' = ' + ratioStrRec(p.ratio, p.sign) + latexPlain(p.keep),
      edge:   (p, { latexPlain }) => 'identify ' + latexPlain(p.drop),
    },
    'identify-conj': {
      text:   (p, { latexPlain, ratioStrRec }) => 'identified ' + latexPlain(p.var) + ' = ' + ratioStrRec(p.ratio) + 'conj(' + latexPlain(p.other) + ')',
      column: (p, { latexPlain, ratioStrRec }) => '↳ identify ' + latexPlain(p.var) + ' = ' + ratioStrRec(p.ratio) + 'conj(' + latexPlain(p.other) + ')',
      edge:   (p, { latexPlain }) => 'identify ' + latexPlain(p.var),
    },
    'fix-w0': {
      text:   (p, { valStr }) => 'fixed φ(0) = ' + valStr(p.value),
      column: (p, { valStr }) => '↳ fix φ(0) = ' + valStr(p.value),
      edge:   () => 'fix φ(0)',
    },
    'define-subst': {
      text:   (p, { latexPlain }) => (p.definition ? 'defining equation for ' : 'define ') + latexPlain(p.newVar)
        + (p.dropVars && p.dropVars.length ? ' · eliminate ' + p.dropVars.map(latexPlain).join(', ') : '')
        + (p.carried ? ' (carried through)' : ''),
      column: (p, { latexPlain }) => '↳ define ' + latexPlain(p.newVar)
        + (p.dropVars && p.dropVars.length ? ' · elim ' + p.dropVars.map(latexPlain).join(',') : ''),
      edge:   (p, { latexPlain }) => p.carried ? 'carry' : 'define ' + latexPlain(p.newVar),
    },
    'add-equation': {
      text:   () => 'custom equation (added by hand)',
      column: () => '↳ custom equation',
      edge:   () => 'custom eqn',
    },
    triangular: {
      text:   (p) => p.contradiction ? 'triangular decomposition (inconsistent)' : 'triangular decomposition (Wu) of ' + (p.inputs || []).join(', '),
      column: (p) => p.contradiction ? '↳ triangular · inconsistent' : '↳ triangular decomposition',
      edge:   () => 'triangular',
    },
    factor: {
      text:   (p) => p.carried ? 'carried through a factor split' : 'factor: case ' + ((p.caseIndex || 0) + 1) + ' of ' + (p.caseCount || '?') + ' (V(p)=⋃V(fᵢ))',
      column: (p, { ns }) => {
        const cn = (ns || []).find((n) => n.provenance && n.provenance.op === 'factor' && !n.provenance.carried);
        const cp = (cn && cn.provenance) || p;
        return '↳ factor · case ' + ((cp.caseIndex || 0) + 1) + '/' + (cp.caseCount || '?');
      },
      edge:   (p) => p.carried ? 'carry' : 'factor case',
    },
    rctd: {
      text:   (p) => 'RCTD cell ' + (p.cell != null ? p.cell : '?') + ' · ' + (p.role || 'chain') + (p.realCount != null ? ' (' + p.realCount + ' real soln' + (p.realCount === 1 ? '' : 's') + ')' : ''),
      column: (p, { ns }) => {
        const cells = new Set((ns || []).map((n) => n.provenance && n.provenance.cell).filter((v) => v != null));
        return '↳ RCTD · ' + cells.size + ' parameter cell' + (cells.size === 1 ? '' : 's');
      },
      edge:   () => 'RCTD',
    },
    propagate: {
      text: (p) => 'propagated from column ' + (p.from != null ? p.from : '?') + (p.applied && p.applied.length ? ' (applied ' + p.applied.join(', ') + ')' : ''),
      edge: () => 'propagate',
    },
  };

  function installAlgebra(ctx) {
    const $ = ctx.$;
    const QE = QD && QD.QDEquations;
    const QC = QD && QD.QDConstraints;
    if (!QE || !QC || !QD.AlgebraStore || !QD.AlgebraCanvas) return {};

    const STR = (QD.Strings && QD.Strings.algebra) || {};
    const store = QD.AlgebraStore.create();
    let canvas = null;
    let surface = null;            // the #algebra-graph element
    let breadcrumb = null;         // the reduction-chain chip rail over the graph
    let trackbar = null;           // the parallel-branch (track) switcher rail over the graph
    const _trackVerdict = new Map(); // A6: tid -> { sig, badge, state, title } existence/uniqueness chip cache
    let mounted = false;
    let activeEnv = null;          // latest classical-bounded solve envelope
    let lastCap = 6;
    const elimSel = new Set();     // raw variable names chosen to eliminate (Gröbner)
    const realSel = new Set();     // primal variable names asserted real
    let _elimPicker = null, _realPicker = null;   // picker handles (for label refresh)
    let _seededHData = null;       // the hData the store was last seeded from (A4: detect a stale seed)
    let _zoom = 1;                 // canvas zoom level (View ± controls)
    let _minimapOn = false;        // DAG minimap toggle (B2)

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

    // Classical BOUNDED QD gate — the shared predicate (QD.QDEquations.isClassicalBounded;
    // QE is non-null past the install guard above).
    const isClassicalBounded = QE.isClassicalBounded;
    function toast(msg, opts) { if (QD.QoL && QD.QoL.toast) QD.QoL.toast(msg, opts || {}); }
    function rerender() { if (canvas) canvas.render(store, latexOf); renderInspector(canvas ? canvas.getSelection() : []); buildBreadcrumb(); buildTrackBar(); renderSuggestions(); renderHypotheses(); }

    // ---- auto-detected variable-symmetry suggestions ("popup the moment an equation forces a
    // variable real/imaginary, or identifies two variables"). store.detectVariableRelations scans
    // the current equations for two-variable linear relations: v − v̄ = 0 (⇒ v real, e.g. the
    // gauge A₁,₁ − Ā₁,₁ = 0), v + v̄ = 0 (⇒ v imaginary), or x ∓ y = 0 between distinct primal vars
    // (⇒ identify x = ±y). Each is surfaced as a one-click apply in the #alg-suggest banner,
    // skipping any the user dismissed this session. Re-run from rerender() so it tracks reductions.
    const _dismissedRel = new Set();
    function _relKey(h) {
      if (h.kind === 'identify') return 'id:' + h.keep + '=' + h.drop;
      if (h.kind === 'linear') return 'lin:' + h.vars.slice().sort().join(',');
      if (h.kind === 'conjugate-pair') return 'cp:' + [h.var, h.other].sort().join(',');
      return h.kind + ':' + h.varName;
    }
    function _detectRels() { try { return store.detectVariableRelations ? (store.detectVariableRelations() || []) : []; } catch (e) { return []; } }
    function _detectSubsts() { try { return store.detectSubstitutions ? (store.detectSubstitutions() || []) : []; } catch (e) { return []; } }
    function _substKey(h) { return 'subst:' + h.kind + ':' + (h.exprTerms ? JSON.stringify(h.exprTerms) : h.newVar); }
    // Compact prefix for a substitution ratio Gaussian c: '' for 1, '−' for −1, else '(c)·'.
    function fmtRatio(g) {
      try {
        const re = g.re.toNumber(), im = g.im.toNumber();
        if (im === 0 && re === 1) return '';
        if (im === 0 && re === -1) return '−';
        return '(' + exactValueStr(re, im) + ')·';
      } catch (e) { return '(c)·'; }
    }
    // Ratio prefix from a serialized {re:[n,d],im:[n,d]} provenance record (falls back to a ±1
    // `sign` for pre-ratio snapshots). '' for 1, '−' for −1, else '(c)·'.
    function ratioStrRec(rec, sign) {
      if (!rec) return (sign != null && sign < 0) ? '−' : '';
      const f = (p) => (p ? Number(p[0]) / Number(p[1]) : 0);
      const re = f(rec.re), im = f(rec.im);
      if (im === 0 && re === 1) return '';
      if (im === 0 && re === -1) return '−';
      return '(' + exactValueStr(re, im) + ')·';
    }
    function renderSuggestions() {
      const box = $('#alg-suggest'); if (!box) return;
      const hits = _detectRels().filter((h) => !_dismissedRel.has(_relKey(h)));
      const subHits = _detectSubsts().filter((h) => !_dismissedRel.has(_substKey(h)));
      if (!hits.length && !subHits.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
      box.innerHTML = '';
      hits.forEach((h) => {
        const row = document.createElement('div'); row.className = 'algebra-suggest-row';
        const msg = document.createElement('span'); msg.className = 'algebra-suggest-msg';
        let btnText, btnTip, apply;
        if (h.kind === 'real') {
          msg.textContent = '“' + h.label + '” implies ' + latexPlain(h.varName) + ' is real.';
          btnText = 'Assume ' + latexPlain(h.varName) + ' real';
          btnTip = 'Identify ' + latexPlain(h.varName) + ' with its conjugate (v̄ ≡ v) in a new column';
          apply = () => store.assumeReal([h.varName]);
        } else if (h.kind === 'imaginary') {
          msg.textContent = '“' + h.label + '” implies ' + latexPlain(h.varName) + ' is imaginary.';
          btnText = 'Assume ' + latexPlain(h.varName) + ' imaginary';
          btnTip = 'Substitute v̄ ≡ −v (Re ' + latexPlain(h.varName) + ' = 0) in a new column';
          apply = () => store.assumeImaginary([h.varName]);
        } else if (h.kind === 'identify') {
          const rhs = (h.sign < 0 ? '−' : '') + latexPlain(h.keep);
          msg.textContent = '“' + h.label + '” identifies ' + latexPlain(h.drop) + ' = ' + rhs + '.';
          btnText = 'Identify ' + latexPlain(h.drop) + ' = ' + rhs;
          btnTip = 'Substitute ' + latexPlain(h.drop) + ' = ' + rhs + ' (and its conjugate) in a new column';
          apply = () => store.identifyVariables(h.keep, h.drop, h.sign);
        } else if (h.kind === 'linear') {                         // general ratio drop = c·keep
          const rhs = fmtRatio(h.ratio) + latexPlain(h.vars[0]);
          msg.textContent = '“' + h.label + '” is a linear relation: ' + latexPlain(h.vars[1]) + ' = ' + rhs + '.';
          btnText = 'Identify ' + latexPlain(h.vars[1]) + ' = ' + rhs;
          btnTip = 'Substitute ' + latexPlain(h.vars[1]) + ' = ' + rhs + ' (and its conjugate) in a new column';
          apply = () => store.identifyVariables(h.vars[0], h.vars[1], h.ratio);
        } else {                                                  // conjugate-pair: var = c·conj(other)
          const rhs = fmtRatio(h.ratio) + 'conj(' + latexPlain(h.other) + ')';
          msg.textContent = '“' + h.label + '” links ' + latexPlain(h.var) + ' to the conjugate of ' + latexPlain(h.other) + ' (conjugate-pole-pair symmetry).';
          btnText = 'Identify ' + latexPlain(h.var) + ' = ' + rhs;
          btnTip = 'Substitute ' + latexPlain(h.var) + ' = ' + rhs + ' in a new column (pairs the conjugate poles)';
          apply = () => store.applyConjugatePair(h.var, h.other, h.ratio);
        }
        row.appendChild(msg);
        if (apply) {                                              // applicable kinds (real / imaginary / identify) get a button
          const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'small';
          btn.textContent = btnText; btn.title = btnTip;
          btn.addEventListener('click', () => {
            if (busyGuard()) return;
            const r = apply();
            if (!r || !r.ok) { showError('Apply symmetry: ' + ((r && r.reason) || 'failed')); return; }
            rerender(); refreshPickers();
            toast(btnText + ' → column ' + r.column);
          });
          row.appendChild(btn);
        }
        const x = document.createElement('button'); x.type = 'button'; x.className = 'algebra-error-close';
        x.textContent = '×'; x.title = 'Dismiss this suggestion for the session';
        x.addEventListener('click', () => { _dismissedRel.add(_relKey(h)); renderSuggestions(); });
        row.appendChild(x);
        box.appendChild(row);
      });
      // structural-regularity substitution suggestions (modulus / power / gcd / conjugate-sum)
      subHits.forEach((h) => {
        const row = document.createElement('div'); row.className = 'algebra-suggest-row';
        const msg = document.createElement('span'); msg.className = 'algebra-suggest-msg';
        msg.textContent = h.label + '.';
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'small';
        const btnText = 'Define ' + latexPlain(h.newVar);
        btn.textContent = btnText; btn.title = 'Introduce ' + latexPlain(h.newVar) + ' as this abbreviation in a new step';
        btn.addEventListener('click', () => {
          if (busyGuard()) return;
          let r; try { r = store.defineSubstitution(h.newVar, h.expr, { regime: h.regime }); } catch (e) { r = { ok: false, reason: (e && e.message) || String(e) }; }
          if (!r || !r.ok) { showError('Define substitution: ' + ((r && r.reason) || 'failed')); return; }
          rerender(); refreshPickers();
          toast(btnText + ' → column ' + r.column);
        });
        row.appendChild(msg); row.appendChild(btn);
        const x = document.createElement('button'); x.type = 'button'; x.className = 'algebra-error-close';
        x.textContent = '×'; x.title = 'Dismiss this suggestion for the session';
        x.addEventListener('click', () => { _dismissedRel.add(_substKey(h)); renderSuggestions(); });
        row.appendChild(x);
        box.appendChild(row);
      });
      box.classList.remove('hidden');
    }
    // Manual "Detect symmetry": clear the session dismissals so every detected relation
    // re-surfaces, then re-render the suggestions (and report when none are found).
    function doDetectSymmetry() {
      _dismissedRel.clear();
      renderSuggestions();
      const hits = _detectRels();
      if (!hits.length) toast('No variable symmetry is forced by the current equations.');
      else toast(hits.length + ' variable symmetr' + (hits.length === 1 ? 'y' : 'ies') + ' detected — see the suggestion' + (hits.length === 1 ? '' : 's') + ' above.');
    }

    // ---- active-hypotheses context strip (C1) -------------------------------
    // A compact, always-visible readout of the assumptions conditioning the CURRENT branch's
    // system: variables assumed real / imaginary, the fixed φ(0), and any pinned constant
    // values (substitute / linear-reduce). Per-branch since C3, so it names the active branch
    // when more than one exists. Re-run from rerender() so it tracks every reduction.
    function _fmtComplex(v) {
      if (!v) return '?';
      const f = (x) => String(Math.round(x * 1e6) / 1e6);
      if (!v.im) return f(v.re);
      if (!v.re) return f(v.im) + 'i';
      return f(v.re) + (v.im < 0 ? ' − ' : ' + ') + f(Math.abs(v.im)) + 'i';
    }
    function renderHypotheses() {
      const box = $('#alg-hypotheses'); if (!box) return;
      if (!store.size) { box.classList.add('hidden'); box.innerHTML = ''; return; }
      const real = store.realVars || [], imag = store.imagVars || [];
      const known = (store.knownValues && store.knownValues()) || {};
      const pinned = Object.keys(known).filter((k) => k !== 'w0');
      const chips = [];
      if (real.length) chips.push({ cls: 'h-real', text: 'real: ' + real.map(latexPlain).join(', ') });
      if (imag.length) chips.push({ cls: 'h-imag', text: 'imaginary: ' + imag.map(latexPlain).join(', ') });
      if (store.w0Fixed) chips.push({ cls: 'h-w0', text: 'φ(0) = ' + _fmtComplex(known.w0) });
      if (pinned.length) chips.push({ cls: 'h-pin', text: 'pinned: ' + pinned.map((k) => latexPlain(k) + ' = ' + _fmtComplex(known[k])).join(', ') });
      box.innerHTML = '';
      const lbl = document.createElement('span'); lbl.className = 'algebra-hyp-label';
      const multi = (store.tracks && store.tracks().length > 1);
      lbl.textContent = multi ? ('Hypotheses · ' + trackLabelOf(store.activeTrack)) : 'Active hypotheses';
      box.appendChild(lbl);
      if (!chips.length) {
        const none = document.createElement('span'); none.className = 'algebra-hyp-none';
        none.textContent = 'none yet — column 0 is the original system';
        box.appendChild(none);
      } else {
        chips.forEach((c) => { const s = document.createElement('span'); s.className = 'algebra-hyp-chip ' + c.cls; s.textContent = c.text; box.appendChild(s); });
      }
      box.classList.remove('hidden');
    }

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
        // Formulation follows the equations-card selector (classical/forward by default,
        // or the Schwarz-function σ-principal-parts alternate) — the same DOM radio so
        // the workspace seeds whichever system the user chose on the card.
        const useSchwarz = !!($('#qdeq-form-schwarz') && $('#qdeq-form-schwarz').checked) &&
          typeof QE.generateSchwarzBounded === 'function';
        const gen = useSchwarz ? QE.generateSchwarzBounded : QE.generateClassicalBounded;
        const sys = gen(activeEnv.hData, { maxPoleOrder: lastCap, w0: w0Sel });
        store.seedFromSystem(sys);
        _seededHData = activeEnv.hData;                 // remember what we seeded from (A4)
        // A fresh seed invalidates prior picker selections AND any node selection whose
        // IDs no longer exist (A8) — clear them so a stale inspector can't act on dead
        // nodes. (canvas.render also filters dead IDs; this fires onSelect([]) explicitly.)
        realSel.clear(); elimSel.clear(); refreshPickers();
        if (canvas) canvas.clearSelection();
        const w0txt = w0Sel ? 'fixed to ' + (QD.Complex ? QD.Complex.toString(w0Sel, 4) : '0') : 'symbolic w₀';
        setStatusHTML(
          '<table class="algebra-seed-table"><tbody>' +
          '<tr><th>Equations</th><td><b>' + store.size + '</b> <span class="hint">(incl. conjugates)</span></td></tr>' +
          '<tr><th>Poles</th><td>' + sys.n + ' · order ' + sys.d + '</td></tr>' +
          '<tr><th>Formulation</th><td>' + (useSchwarz ? 'Schwarz function (★_S)' : 'classical (forward)') + '</td></tr>' +
          '<tr><th>φ(0)</th><td>' + w0txt + '</td></tr>' +
          '</tbody></table>' +
          '<div class="hint">Each assumption below adds a new column.</div>');
        buildReference();
        rerender();
        return true;
      } catch (e) {
        setStatus((STR.unavailablePrefix || 'Generation unavailable: ') + ((e && e.message) || e));
        return false;
      }
    }

    // (A4) Gate every mutating/analysis op so it never runs against a missing or STALE
    // seed. An empty store seeds from the current solve. A store seeded from a DIFFERENT
    // hData than the active solve is stale — proceeding would either splice new-domain
    // constraints onto the old graph (the palette ops) or analyze the old domain while
    // the UI shows the new one. Rather than silently wiping the user's reduction chain,
    // we refuse and prompt an explicit re-seed (the #alg-seed button → seedFromCurrent,
    // which is itself undoable). Returns true when the store is ready to operate on.
    function ensureSeed() {
      if (!store.size) return seedFromCurrent();
      if (activeEnv && _seededHData && _seededHData !== activeEnv.hData) {
        setStatus('Solve changed — click Generate / re-seed to refresh the workspace for the new domain.');
        return false;
      }
      return true;
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
    // Populate the φ / h reference panel: the symbolic forms of φ (RiemannLatex.build) and
    // h (buildHForm), plus a legend mapping every variable to its meaning + (optionally) its
    // value. Rebuilt on open, on the show-values toggle, and when the active solve changes.
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
      refreshMmaColumns();
    }
    // ---- "Set values" table: fix several variables at once in ONE column ----
    // The picker lists BASE variables only (not their conjugates) — a value fully
    // specifies the conjugate (z₁=1+i ⟹ z̄₁=1−i), and the store fills it automatically.
    function valBaseVars() { try { return store.baseVariables(); } catch (e) { return []; } }
    // Exact ℚ(i) string for the inline preview (same continued-fraction rationalizer the
    // store uses), so the user sees 0.2 → 1/5 before applying.
    function fmtRat(x) {
      try { const r = QE.ratApprox(x || 0); return String(r[1]) === '1' ? String(r[0]) : String(r[0]) + '/' + String(r[1]); }
      catch (e) { return String(x || 0); }
    }
    function exactValueStr(re, im) {
      re = re || 0; im = im || 0;
      if (!im) return fmtRat(re);
      const iAbs = fmtRat(Math.abs(im)) + 'i';
      if (!re) return (im < 0 ? '−' : '') + iAbs;
      return fmtRat(re) + (im < 0 ? ' − ' : ' + ') + iAbs;
    }
    function updateRowPreview(row) {
      const prev = row.querySelector('.alg-val-preview'); if (!prev) return;
      const re = parseFloat(row.querySelector('.alg-val-re').value) || 0;
      const im = parseFloat(row.querySelector('.alg-val-im').value) || 0;
      prev.textContent = (re || im) ? '= ' + exactValueStr(re, im) : '';
    }
    // Build one (variable, Re, Im) row with a live exact-value preview + a remove button.
    function addValueRow(preVar) {
      const host = $('#alg-val-rows'); if (!host) return null;
      const row = document.createElement('div'); row.className = 'algebra-value-row';
      const sel = document.createElement('select'); sel.className = 'alg-val-var';
      valBaseVars().forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = latexPlain(v) + ' · ' + v; sel.appendChild(o); });
      if (preVar) sel.value = preVar;
      const re = document.createElement('input'); re.type = 'number'; re.step = 'any'; re.placeholder = 'Re'; re.className = 'alg-val-re'; re.title = 'Real part';
      const im = document.createElement('input'); im.type = 'number'; im.step = 'any'; im.placeholder = 'Im'; im.className = 'alg-val-im'; im.title = 'Imaginary part';
      const prev = document.createElement('span'); prev.className = 'alg-val-preview hint';
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'small algebra-value-rm'; rm.textContent = '×'; rm.title = 'Remove this variable';
      rm.addEventListener('click', () => { row.remove(); if (!host.querySelector('.algebra-value-row')) addValueRow(); });
      re.addEventListener('input', () => updateRowPreview(row));
      im.addEventListener('input', () => updateRowPreview(row));
      row.appendChild(sel); row.appendChild(re); row.appendChild(im); row.appendChild(prev); row.appendChild(rm);
      host.appendChild(row);
      return row;
    }
    // Read the table into a [{ varName, value:{re,im} }] list (rows with a chosen var).
    function valuePairs() {
      const host = $('#alg-val-rows'); if (!host) return [];
      return [...host.querySelectorAll('.algebra-value-row')].map((row) => {
        const v = row.querySelector('.alg-val-var');
        if (!v || !v.value) return null;
        return { varName: v.value, value: { re: parseFloat(row.querySelector('.alg-val-re').value) || 0, im: parseFloat(row.querySelector('.alg-val-im').value) || 0 } };
      }).filter(Boolean);
    }
    // Rebuild every row's variable <select> from the current base variables (after a seed
    // or reduction changes the variable set), preserving each row's prior selection, and
    // ensure at least one row exists.
    function refreshValueVars() {
      const host = $('#alg-val-rows'); if (!host) return;
      const opts = valBaseVars();
      const rows = [...host.querySelectorAll('.algebra-value-row')];
      if (!rows.length) { addValueRow(); return; }
      rows.forEach((row) => {
        const sel = row.querySelector('.alg-val-var'); const prev = sel.value;
        sel.innerHTML = '';
        opts.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = latexPlain(v) + ' · ' + v; sel.appendChild(o); });
        if (prev && opts.indexOf(prev) !== -1) sel.value = prev;
      });
    }

    // Assume the picked base variables real → a new labeled column (store.assumeReal).
    function doAssumeReal() {
      if (!ensureSeed()) return;
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
      if (!ensureSeed()) return;
      const vars = store.baseVariables();
      const r = store.assumeReal(vars);
      if (!r.ok) { showError('Auto reality: ' + (r.reason || 'failed')); return; }
      rerender(); refreshPickers();
      toast('Real-axis-symmetric h → assumed ' + vars.length + ' base variable(s) real → column ' + r.column + ' (' + r.created.length + ' equation' + (r.created.length === 1 ? '' : 's') + ')');
    }

    // Fix the chosen variables to exact values in ONE new labeled column (each value also
    // fixes its conjugate), then (if the propagate box is ticked) cascade the consequence
    // as a further column.
    function doSubstituteValue() {
      if (!ensureSeed()) return;
      const pairs = valuePairs();
      if (!pairs.length) { toast('Pick at least one variable and give it a value.', { kind: 'error' }); return; }
      const propagate = !$('#alg-val-prop') || $('#alg-val-prop').checked;
      const r = store.substituteValues(pairs, { propagate });
      if (!r.ok) { showError('Set value: ' + (r.reason || 'failed')); return; }
      rerender(); refreshPickers();
      let msg = 'Set ' + pairs.map((p) => latexPlain(p.varName) + ' = ' + exactValueStr(p.value.re, p.value.im)).join(', ') + ' → column ' + r.column;
      if (r.propagated) msg += '; propagated (eliminated ' + r.propagated.eliminated.map(latexPlain).join(', ') + (r.propagated.inconsistent ? '; system inconsistent — no solution' : '') + ')';
      toast(msg);
    }

    // Live preview for the "Define substitution" control: parse the typed expression against the
    // current variables and render it (KaTeX); surface a parse error and disable Apply when invalid.
    function previewSubst() {
      const box = $('#alg-def-preview'), btn = $('#alg-def-apply');
      if (!box) return;
      const exprStr = (($('#alg-def-expr') || {}).value || '').trim();
      const nm = (($('#alg-def-name') || {}).value || '').trim();
      if (!exprStr) { box.textContent = ''; box.classList.remove('alg-def-error'); if (btn) btn.disabled = false; return; }
      const S = (typeof QD !== 'undefined' && QD.Sym), P = (typeof QD !== 'undefined' && QD.ExprParser);
      if (!S || !P) { box.textContent = ''; return; }
      let g;
      try { g = P.parse(exprStr, store.variables(), S); }
      catch (e) { box.textContent = '⚠ ' + ((e && e.message) || 'parse error'); box.classList.add('alg-def-error'); if (btn) btn.disabled = true; return; }
      box.classList.remove('alg-def-error'); if (btn) btn.disabled = false;
      const tex = (nm ? latexPlain(nm) + ' := ' : '') + g.toLatex(latexOf);
      box.innerHTML = '';
      if (typeof katex !== 'undefined') { try { katex.render(tex, box, { throwOnError: false }); return; } catch (e) { /* fall through */ } }
      box.textContent = (nm ? nm + ' := ' : '') + exprStr;
    }
    // Introduce a user-defined symbol t := g and substitute it into the current system (a new column).
    function doDefineSubst() {
      if (!ensureSeed()) return;
      const nm = (($('#alg-def-name') || {}).value || '').trim();
      const exprStr = (($('#alg-def-expr') || {}).value || '').trim();
      if (!nm) { toast('Give the new symbol a name.', { kind: 'error' }); return; }
      if (!exprStr) { toast('Enter an expression to abbreviate.', { kind: 'error' }); return; }
      const S = QD.Sym, P = QD.ExprParser;
      let g;
      try { g = P.parse(exprStr, store.variables(), S); }
      catch (e) { showError('Define substitution: ' + ((e && e.message) || 'parse error')); return; }
      if (busyGuard()) return;
      let r; try { r = store.defineSubstitution(nm, g); } catch (e) { r = { ok: false, reason: (e && e.message) || String(e) }; }
      if (!r || !r.ok) { showError('Define substitution: ' + ((r && r.reason) || 'failed')); return; }
      if ($('#alg-def-name')) $('#alg-def-name').value = '';
      if ($('#alg-def-expr')) $('#alg-def-expr').value = '';
      previewSubst();
      rerender(); refreshPickers();
      toast('Defined ' + latexPlain(nm) + ' := ' + exprStr + ' (' + r.regime + ') → column ' + r.column);
    }

    // B2 — iterated auto-CSE: apply every detected substitution to a fixpoint in one click.
    function doAutoAbbreviate() {
      if (busyGuard()) return;
      if (!ensureSeed()) return;
      const r = store.autoAbbreviate();
      if (!r || !r.count) { toast('No repeated-expression abbreviations found in the current system.'); return; }
      rerender(); refreshPickers();
      const last = r.applied[r.applied.length - 1];
      toast('Auto-abbreviated: ' + r.applied.map((a) => latexPlain(a.newVar)).join(', ') + ' → column ' + last.column);
    }

    // B3 — live preview for the "Add equation" control: parse the typed polynomial + render `g rel 0`.
    function previewEquation() {
      const box = $('#alg-eq-preview'), btn = $('#alg-eq-apply');
      if (!box) return;
      const exprStr = (($('#alg-eq-expr') || {}).value || '').trim();
      const rel = (($('#alg-eq-rel') || {}).value) || '=';
      if (!exprStr) { box.textContent = ''; box.classList.remove('alg-def-error'); if (btn) btn.disabled = false; return; }
      const S = (typeof QD !== 'undefined' && QD.Sym), P = (typeof QD !== 'undefined' && QD.ExprParser);
      if (!S || !P) { box.textContent = ''; return; }
      let g;
      try { g = P.parse(exprStr, store.variables(), S); }
      catch (e) { box.textContent = '⚠ ' + ((e && e.message) || 'parse error'); box.classList.add('alg-def-error'); if (btn) btn.disabled = true; return; }
      box.classList.remove('alg-def-error'); if (btn) btn.disabled = false;
      const relTex = rel === '=' ? '= 0' : (rel === '>' ? '> 0' : '\\ne 0');
      box.innerHTML = '';
      if (typeof katex !== 'undefined') { try { katex.render(g.toLatex(latexOf) + ' ' + relTex, box, { throwOnError: false }); return; } catch (e) { /* fall through */ } }
      box.textContent = exprStr + ' ' + (rel === '>' ? '> 0' : rel === '≠' ? '≠ 0' : '= 0');
    }
    // B3 — add a free-form typed equation/inequality to the current system.
    function doAddEquation() {
      if (!ensureSeed()) return;
      const exprStr = (($('#alg-eq-expr') || {}).value || '').trim();
      const rel = (($('#alg-eq-rel') || {}).value) || '=';
      if (!exprStr) { toast('Enter a polynomial for the equation.', { kind: 'error' }); return; }
      const S = QD.Sym, P = QD.ExprParser;
      let g;
      try { g = P.parse(exprStr, store.variables(), S); }
      catch (e) { showError('Add equation: ' + ((e && e.message) || 'parse error')); return; }
      if (busyGuard()) return;
      const withConjugate = !$('#alg-eq-conj') || $('#alg-eq-conj').checked;
      let r; try { r = store.addEquation(g, rel, { withConjugate }); } catch (e) { r = { ok: false, reason: (e && e.message) || String(e) }; }
      if (!r || !r.ok) { showError('Add equation: ' + ((r && r.reason) || 'failed')); return; }
      if ($('#alg-eq-expr')) $('#alg-eq-expr').value = '';
      previewEquation();
      rerender(); refreshPickers();
      toast('Added equation → column ' + r.column);
    }

    // ---- sidebar -------------------------------------------------------------
    function setStatus(t) { const el = $('#alg-status'); if (el) el.textContent = t; }
    function setStatusHTML(html) { const el = $('#alg-status'); if (el) el.innerHTML = html; }
    function mountSidebar() {
      const panel = $('#controls-algebra');
      if (!panel) return;
      panel.innerHTML =
        // ---- PINNED HEADER: intro + help, the primary CTA, status + error ----
        '<div class="algebra-head">' +
        '  <div class="row" style="align-items:flex-start; gap:6px;">' +
        '    <div class="hint" data-str-html="hints.algebraCard" style="flex:1;"></div>' +
        '    <button id="alg-help-toggle" class="small algebra-help-q" type="button" title="Show / hide help">?</button>' +
        '  </div>' +
        '  <div id="alg-help" class="hint card-sub hidden" data-str-html="algebra.help" style="margin:4px 0;"></div>' +
        '  <div id="alg-steps" class="algebra-steps">' +
        '    <span>① Seed</span><span>② Assume / Set</span><span>③ Reduce</span><span>④ Analyze</span>' +
        '    <button id="alg-steps-x" class="algebra-steps-x" type="button" title="Hide this hint">×</button>' +
        '  </div>' +
        '  <div class="row algebra-primary">' +
        '    <button id="alg-autosolve" class="small heavy-op" type="button" title="Semi-autonomous: auto-assume reality (if h is symmetric), propagate linear consequences, then determine existence/uniqueness and the explicit real solutions — each step a new labeled column">★ Auto-reduce &amp; solve</button>' +
        '    <button id="alg-seed" class="small" type="button" title="Generate the original (●)/(★)/gauge system from the current bounded solve at column 0 (replaces the graph; assumptions are then added as columns)">Generate / re-seed</button>' +
        '    <button id="alg-cancel" class="small hidden" type="button" title="Cancel the running computation">Cancel</button>' +
        '  </div>' +
        '  <div id="alg-status" class="hint" style="margin:4px 0;"></div>' +
        '  <div id="alg-error" class="algebra-error hidden">' +
        '    <span id="alg-error-msg" class="algebra-error-msg"></span>' +
        '    <button id="alg-error-close" class="algebra-error-close" type="button" title="Dismiss">×</button>' +
        '  </div>' +
        // Auto-detected reality suggestions: when an equation forces a variable real
        // (v − v̄ = 0), a one-click "Assume … real" appears here (populated by renderSuggestions).
        '  <div id="alg-suggest" class="algebra-suggest hidden"></div>' +
        // Active-hypotheses strip (C1): the assumptions conditioning the CURRENT branch's
        // system — reality / imaginary / fixed φ(0) / pinned values (populated by renderHypotheses).
        '  <div id="alg-hypotheses" class="algebra-hypotheses hidden"></div>' +
        '</div>' +
        // ---- φ / h REFERENCE (always visible at the top: the symbolic forms + legend) ----
        '<div class="algebra-ref-block">' +
        '  <div class="row algebra-ref-controls">' +
        '    <span class="algebra-line-label">φ / h reference</span>' +
        '    <label class="algebra-ref-opt" data-str-title="tooltips.algFixW0"><input type="checkbox" id="alg-w0-fix" checked> fix φ(0)=w₀</label>' +
        '    <label class="algebra-ref-opt"><input type="checkbox" id="alg-ref-values"> show values</label>' +
        '  </div>' +
        '  <div id="alg-ref" class="algebra-ref"></div>' +
        '</div>' +
        // ---- CONTEXTUAL NODE INSPECTOR (shown only when ≥1 node is selected) ----
        '<div id="alg-inspector" class="algebra-inspector hidden"></div>' +
        // ---- WORKFLOW SECTIONS (collapsible; hidden while the inspector is up) ----
        '<div id="alg-sections">' +
        // 1. Assumptions (open by default — the most common first step)
        '  <details class="algebra-section" open>' +
        '    <summary>Assumptions</summary>' +
        '    <div class="algebra-section-body">' +
        '      <div class="algebra-line"><span class="algebra-line-label">Assume real</span><span id="alg-real-pick" class="algebra-picker"></span>' +
        '        <button id="alg-real-apply" class="small" type="button" data-str-title="tooltips.assumeReal">Apply</button>' +
        '        <button id="alg-real-auto" class="small" type="button" title="Detect real-axis symmetry of h and, if the data is fully real, assume every base variable real in one step (the biggest tractability lever)">Auto</button>' +
        '        <button id="alg-real-detect" class="small" type="button" title="Scan the current equations for variable symmetries — a variable forced real (v − v̄ = 0, e.g. the gauge) or imaginary (v + v̄ = 0), or two variables identified (x ∓ y = 0) — and surface one-click suggestions">Detect symmetry</button></div>' +
        '      <div class="algebra-line-label" style="margin-top:8px;">Set values <span class="hint" style="font-weight:400;">(each value also fixes its conjugate)</span></div>' +
        '      <div id="alg-val-rows"></div>' +
        '      <div class="row" style="gap:4px; align-items:center; margin-top:2px;">' +
        '        <button id="alg-val-add" class="small" type="button" title="Add another variable to fix in the same column">＋ add variable</button>' +
        '        <label style="font-size:11px;" title="After substituting, run a linear-propagation pass (eliminate forced variables) as a further column."><input type="checkbox" id="alg-val-prop" checked> propagate</label>' +
        '        <button id="alg-val-apply" class="small" type="button" title="Substitute the exact values (continued-fraction ℚ(i)) for these variables — and their conjugates — in one new column">Apply</button></div>' +
        '      <div class="algebra-line-label" style="margin-top:8px;">Define substitution <span class="hint" style="font-weight:400;">(abbreviate a sub-expression as a new symbol)</span></div>' +
        '      <div class="algebra-define-row">' +
        '        <input id="alg-def-name" class="alg-def-name" type="text" placeholder="t" autocomplete="off" spellcheck="false" title="A fresh name for the new symbol" />' +
        '        <span class="alg-def-eq">:=</span>' +
        '        <input id="alg-def-expr" class="alg-def-expr" type="text" placeholder="e.g.  w1^2,  z1+zb1,  z1*zb1" autocomplete="off" spellcheck="false" title="An expression in the current variables.  + − * / ^ ( ),  i = imaginary unit,  exact rationals" />' +
        '        <button id="alg-def-apply" class="small" type="button" title="Introduce the new symbol and substitute it into the current system (a new labeled column)">Apply</button></div>' +
        '      <div id="alg-def-preview" class="alg-def-preview hint"></div>' +
        '      <div class="row" style="margin-top:4px;"><button id="alg-abbrev" class="small" type="button" title="Repeatedly apply the highest-value detected substitution (repeated expressions / structural regularities) until none remain — abbreviate the whole system in one step">Auto-abbreviate</button></div>' +
        '      <div class="algebra-line-label" style="margin-top:8px;">Add equation <span class="hint" style="font-weight:400;">(impose a custom condition)</span></div>' +
        '      <div class="algebra-define-row">' +
        '        <input id="alg-eq-expr" class="alg-def-expr" type="text" placeholder="e.g.  A1_1 - 1,  z1*zb1 - 1" autocomplete="off" spellcheck="false" title="A polynomial in the current variables.  + − * / ^ ( ),  i = imaginary unit,  exact rationals" />' +
        '        <select id="alg-eq-rel" class="alg-eq-rel" title="Relation: = 0 (equality), ≠ 0 (non-vanishing), or > 0 (Hermitian inequality)"><option value="=">= 0</option><option value="≠">≠ 0</option><option value="&gt;">&gt; 0</option></select>' +
        '        <button id="alg-eq-apply" class="small" type="button" title="Add this equation/inequality as a new node in the current system">Apply</button></div>' +
        '      <div id="alg-eq-preview" class="alg-def-preview hint"></div>' +
        '      <label style="font-size:11px;" title="In the conjugate model, also add the conjugate equation p̄ = 0 (keeps the system conjugation-closed for reim / existence analysis)."><input type="checkbox" id="alg-eq-conj" checked> add conjugate</label>' +
        '    </div>' +
        '  </details>' +
        // 3. Reduce (alternative eliminators; order/eliminate behind Advanced)
        '  <details class="algebra-section">' +
        '    <summary>Reduce</summary>' +
        '    <div class="algebra-section-body">' +
        '      <div class="row" style="gap:4px; flex-wrap:wrap;">' +
        '        <button id="alg-gauge-elim" class="small" type="button" data-str-title="tooltips.gaugeElim">Eliminate with gauge (all)</button>' +
        '        <button id="alg-groebner" class="small heavy-op" type="button" data-str-title="tooltips.groebner">Gröbner basis (all eqns)</button>' +
        '        <button id="alg-triangular" class="small" type="button" title="Triangular decomposition (Wu pseudo-elimination) of the current system — an alternative to Gröbner that exhibits the solution structure (free variables, no-solution)">Triangular decomp.</button>' +
        '        <button id="alg-propagate-all" class="small" type="button" title="Carry EVERY univalence constraint into the current system in one step, with all assumptions (reality, imaginary, fixed φ(0), pinned values) applied to each">Propagate constraints → current</button></div>' +
        '      <details class="algebra-advanced"><summary>Advanced</summary>' +
        '        <div class="algebra-line"><span class="algebra-line-label" title="Monomial order. lex = elimination order; grevlex = fastest general.">order</span>' +
        '          <select id="alg-gb-order"><option value="grevlex">grevlex</option><option value="grlex">grlex</option><option value="lex">lex</option></select></div>' +
        '        <div class="algebra-line"><span class="algebra-line-label">eliminate</span><span id="alg-elim-pick" class="algebra-picker"></span></div>' +
        '      </details>' +
        '    </div>' +
        '  </details>' +
        // 4. Analyze
        '  <details class="algebra-section">' +
        '    <summary>Analyze</summary>' +
        '    <div class="algebra-section-body"><div class="row" style="flex-wrap:wrap; gap:4px;">' +
        '      <button id="alg-classify" class="small heavy-op" type="button" title="Existence / uniqueness: count the REAL solutions (= actual quadrature domains) of the current system via the Hermite trace form, plus distinct-complex / inconsistent / positive-dimensional verdicts">Existence / uniqueness</button>' +
        '      <button id="alg-dimension" class="small" type="button" data-str-title="tooltips.dimension">Dimension / count</button>' +
        '      <button id="alg-solve" class="small" type="button" data-str-title="tooltips.solveNumeric">Solve (numeric)</button>' +
        '      <button id="alg-univalence" class="small heavy-op" type="button" title="Certify univalence: solve for the real solutions, reconstruct each candidate Riemann map φ, and test whether it is univalent (schlicht) on 𝔻 — reports how many real solutions are GENUINE quadrature domains (the rest are algebraic solutions whose φ folds or self-intersects)">Certify univalence</button></div>' +
        '    <div class="row" style="flex-wrap:wrap; gap:4px; margin-top:4px;">' +
        '      <label class="small">Resolvent in <select id="alg-resolvent-var" title="The real variable to eliminate to. The resolvent χ_v is the characteristic polynomial of multiplication-by-v on the quotient ring; its roots are v’s values across the solutions."></select></label>' +
        '      <button id="alg-resolvent" class="small heavy-op" type="button" title="Resolvent / discriminant: the univariate eliminant χ_v(x)=det(x·I − M_v) of the current system in the chosen variable. squareFreePart = distinct v-values; a repeated root (discriminant 0) ⇒ coincident solutions / a degeneracy (e.g. a cusp). NB a repeat can also be fibre multiplicity if v does not separate the solutions.">Resolvent / discriminant</button></div></div>' +
        '  </details>' +
        // 5. Univalence constraints (2-column grid palette)
        '  <details class="algebra-section">' +
        '    <summary>Univalence constraints</summary>' +
        '    <div class="algebra-section-body">' +
        '      <div class="hint" id="alg-palette-note" style="margin-bottom:4px;">Append a boundary-univalence condition as new node(s) — hover each for its meaning.</div>' +
        '      <div id="alg-palette" class="algebra-palette"></div>' +
        '    </div>' +
        '  </details>' +
        // 6. Export
        '  <details class="algebra-section">' +
        '    <summary>Export</summary>' +
        '    <div class="algebra-section-body">' +
        '      <div class="row" style="gap:4px; flex-wrap:wrap;">' +
        '        <button id="alg-export-json" class="small" type="button" title="Download the whole session as exact ℚ(i) term lists + edges + tracks + assumptions (round-trips via Load)">Download DAG (JSON)</button>' +
        '        <button id="alg-import-json" class="small" type="button" title="Load a previously downloaded DAG JSON — rebuilds the whole workspace (nodes, branches, assumptions). Replaces the current graph (undoable).">Load DAG (JSON)</button>' +
        '        <input id="alg-import-file" type="file" accept="application/json,.json" style="display:none;" />' +
        '        <button id="alg-copy-latex" class="small" type="button" title="Copy all equations as a gathered LaTeX block">Copy LaTeX</button>' +
        '        <button id="alg-copy-derivation" class="small" type="button" title="Copy the active branch as a literate LaTeX derivation — one align block per column, each annotated with the transition that produced it + the active hypotheses">Copy derivation (LaTeX)</button>' +
        '        <button id="alg-copy-sympy" class="small" type="button" title="Copy the active branch as a runnable SymPy script — substitution steps are recomputed by SymPy from the previous column; engine reductions (Gröbner / resultant) are given as exact ℚ(i) literals">Copy SymPy script</button></div>' +
        '      <div class="algebra-line" style="margin-top:4px;"><span class="algebra-line-label">Mathematica</span>' +
        '        <select id="alg-mma-col" title="Which column of equations to export"></select>' +
        '        <button id="alg-copy-mma" class="small" type="button" title="Copy the chosen column as a Wolfram-Language list of equations ({lhs == 0, …}) ready to paste into Mathematica">Copy</button>' +
        '        <button id="alg-copy-mma-all" class="small" type="button" title="Copy every column as labeled Wolfram-Language lists (col0 = {…}; col1 = {…}; …)">Copy all</button></div>' +
        '      <div class="algebra-line" style="margin-top:4px;"><span class="algebra-line-label">CAS / RCTD</span>' +
        '        <select id="alg-cas-dialect" title="Maple RCTD = parametric REAL triangular decomposition (RealComprehensiveTriangularize) — the fully-parametric uniqueness route; Singular / Sage = equality-ideal Gröbner cross-checks of the variety.">' +
        '          <option value="maple">Maple RCTD</option><option value="singular">Singular</option><option value="sage">Sage</option></select>' +
        '        <input id="alg-cas-params" class="small" type="text" placeholder="params e.g. a1,C1_1" title="Comma-separated variable names to treat as PARAMETERS — declared last for Maple RealComprehensiveTriangularize. Blank ⇒ non-parametric RealTriangularize." style="width:8.5em;" />' +
        '        <button id="alg-copy-cas" class="small" type="button" title="Copy the chosen column (above) as CAS input for the selected dialect (runs in your own Maple / Singular / Sage — nothing executes in-browser)">Copy</button>' +
        '        <button id="alg-copy-msolve" class="small" type="button" title="Copy the chosen column as msolve .ms input (over ℚ; complex coefficients become a variable i with i²+1). Run offline: msolve -f sys.ms -o out. Nothing executes in-browser.">Copy msolve (.ms)</button></div>' +
        '      <div class="algebra-line" style="margin-top:6px; align-items:flex-start;"><span class="algebra-line-label">Import RCTD</span>' +
        '        <div style="flex:1; min-width:0;">' +
        '          <textarea id="alg-rctd-json" class="small" rows="3" placeholder=\'paste the qd-rctd JSON from your Maple run (see the post-script)\' title="Paste the parametric RealComprehensiveTriangularize result, serialized to the qd-rctd term-list JSON by the documented Maple post-script. Imports as a new RCTD column (one node per cell constraint / chain poly)." style="width:100%; box-sizing:border-box; font-family:monospace; resize:vertical;"></textarea>' +
        '          <div class="row" style="gap:4px; margin-top:2px;"><button id="alg-import-rctd" class="small heavy-op" type="button" title="Parse the qd-rctd JSON and append a new column of the decomposition cells">Import cells</button></div>' +
        '        </div></div>' +
        '    </div>' +
        '  </details>' +
        '</div>';

      // constraint palette buttons (2-col grid)
      const pal = $('#alg-palette');
      CONSTRAINT_BUTTONS.forEach((b) => {
        const btn = document.createElement('button');
        btn.className = 'small'; btn.type = 'button'; btn.textContent = b.label; btn.dataset.form = b.form;
        if (b.tip) btn.title = b.tip;
        btn.addEventListener('click', () => {
          if (!activeEnv) { toast(STR.noSolve || 'No classical bounded QD solved yet.', { kind: 'error' }); return; }
          if (!ensureSeed()) return;   // bail if seeding failed (e.g. order over cap) — don't add to an unseeded graph
          try { const made = store.addConstraint(b.form, activeEnv.hData); rerender(); toast('Added ' + made.length + ' node(s): ' + b.label); }
          catch (e) { toast((e && e.message) || String(e), { kind: 'error' }); }
        });
        pal.appendChild(btn);
      });

      const helpBtn = $('#alg-help-toggle');
      if (helpBtn) helpBtn.addEventListener('click', () => { const h = $('#alg-help'); if (h) h.classList.toggle('hidden'); });
      const refVals = $('#alg-ref-values');
      if (refVals) refVals.addEventListener('change', buildReference);
      $('#alg-seed').addEventListener('click', seedFromCurrent);
      const w0FixCb = $('#alg-w0-fix');
      if (w0FixCb) w0FixCb.addEventListener('change', () => { if (store.size) seedFromCurrent(); });
      $('#alg-groebner').addEventListener('click', () => doGroebner(null));
      $('#alg-autosolve').addEventListener('click', doAutoSolve);
      $('#alg-triangular').addEventListener('click', doTriangular);
      $('#alg-propagate-all').addEventListener('click', doPropagateAll);
      $('#alg-classify').addEventListener('click', doClassify);
      $('#alg-dimension').addEventListener('click', doDimension);
      $('#alg-solve').addEventListener('click', doSolve);
      $('#alg-univalence').addEventListener('click', doCertifyUnivalence);
      $('#alg-resolvent').addEventListener('click', doResolvent);
      $('#alg-resolvent-var').addEventListener('mousedown', refreshResolventVars);
      $('#alg-cancel').addEventListener('click', cancelOp);
      $('#alg-gauge-elim').addEventListener('click', () => {
        if (!ensureSeed()) return;
        const r = store.eliminateWithGauge();
        if (!r.ok) { toast(r.reason || 'nothing to eliminate with the gauge', { kind: 'error' }); return; }
        rerender();
        toast('Gauge elimination: created ' + r.created.length + ' equation(s)' +
          (r.skipped.length ? ', skipped ' + r.skipped.length : ''));
      });
      $('#alg-export-json').addEventListener('click', exportJson);
      $('#alg-import-json').addEventListener('click', () => { const f = $('#alg-import-file'); if (f) f.click(); });
      $('#alg-import-file').addEventListener('change', importJson);
      $('#alg-copy-latex').addEventListener('click', copyLatex);
      $('#alg-copy-derivation').addEventListener('click', copyLatexDerivation);
      $('#alg-copy-sympy').addEventListener('click', () => {
        if (!store.size) { toast('Nothing to export — seed or load a system first.', { kind: 'error' }); return; }
        const code = store.sympyDerivation();
        if (!code) { toast('SymPy export unavailable', { kind: 'error' }); return; }
        writeClipboard(code, 'SymPy script');
      });
      $('#alg-copy-mma').addEventListener('click', copyMathematica);
      $('#alg-copy-mma-all').addEventListener('click', copyMathematicaAll);
      $('#alg-copy-cas').addEventListener('click', copyCAS);
      $('#alg-copy-msolve').addEventListener('click', copyMsolve);
      $('#alg-import-rctd').addEventListener('click', doImportRCTD);
      $('#alg-error-close').addEventListener('click', clearError);
      // dismissible numbered-steps onboarding hint (remembered for the session)
      const steps = $('#alg-steps');
      if (steps) {
        if (sessionStorage.getItem('algStepsHidden') === '1') steps.classList.add('hidden');
        $('#alg-steps-x').addEventListener('click', () => { steps.classList.add('hidden'); try { sessionStorage.setItem('algStepsHidden', '1'); } catch (e) { /* ignore */ } });
      }
      $('#alg-real-apply').addEventListener('click', doAssumeReal);
      $('#alg-real-auto').addEventListener('click', doAutoReality);
      $('#alg-real-detect').addEventListener('click', doDetectSymmetry);
      $('#alg-val-apply').addEventListener('click', doSubstituteValue);
      $('#alg-val-add').addEventListener('click', () => addValueRow());
      $('#alg-def-apply').addEventListener('click', doDefineSubst);
      $('#alg-def-expr').addEventListener('input', previewSubst);
      $('#alg-def-name').addEventListener('input', previewSubst);
      $('#alg-abbrev').addEventListener('click', doAutoAbbreviate);
      $('#alg-eq-apply').addEventListener('click', doAddEquation);
      $('#alg-eq-expr').addEventListener('input', previewEquation);
      $('#alg-eq-rel').addEventListener('change', previewEquation);

      // variable pickers (eliminate = all current vars; assume-real = primal base vars)
      _elimPicker = buildPicker($('#alg-elim-pick'), { label: 'pick', friendly: friendlyVar, selected: elimSel, getOptions: () => store.variables() });
      _realPicker = buildPicker($('#alg-real-pick'), { label: 'pick', friendly: (raw) => latexPlain(raw) + ' · ' + raw, selected: realSel, getOptions: () => store.baseVariables() });
      refreshValueVars();   // seeds the first value-table row
      refreshMmaColumns();  // populate the Mathematica-export column picker
      // close any open picker menu when clicking elsewhere
      document.addEventListener('click', () => { if (_openMenu) { _openMenu.classList.add('hidden'); _openMenu = null; } });

      if (QD.Strings && QD.Strings.apply) QD.Strings.apply(panel);
      buildReference();     // the φ/h reference is visible by default
      setStatus(activeEnv ? '' : (STR.noSolve || 'No classical bounded QD solved yet.'));
    }

    // Populate the Mathematica-export column <select> with one option per column
    // (labeled by its transition), preserving the prior choice; defaults to the current.
    function refreshMmaColumns() {
      const sel = $('#alg-mma-col'); if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = '';
      const mx = store.maxColumn();
      for (let c = 0; c <= mx; c++) {
        const o = document.createElement('option'); o.value = String(c);
        o.textContent = 'col ' + c + (c === 0 ? ' · original' : '') + (c === mx ? ' · current' : '');
        sel.appendChild(o);
      }
      sel.value = (prev !== '' && Number(prev) <= mx) ? prev : String(mx);
    }
    // Copy the chosen column as a Wolfram-Language list of equations.
    function copyMathematica() {
      if (!store.size) { toast('Nothing to export — seed a system first.', { kind: 'error' }); return; }
      const sel = $('#alg-mma-col');
      const c = sel ? Number(sel.value) : store.maxColumn();
      const code = store.mathematicaColumn(c);
      if (!code) { toast('Column ' + c + ' has no equations.', { kind: 'error' }); return; }
      writeClipboard(code, 'Mathematica (column ' + c + ')');
    }
    // Copy every column as labeled Wolfram-Language lists.
    function copyMathematicaAll() {
      if (!store.size) { toast('Nothing to export — seed a system first.', { kind: 'error' }); return; }
      const code = store.mathematicaAll();
      if (!code) { toast('No equations to export.', { kind: 'error' }); return; }
      writeClipboard(code, 'Mathematica (all ' + (store.maxColumn() + 1) + ' columns)');
    }
    // Copy the chosen column as external-CAS input (Maple RCTD / Singular / Sage). The comma-
    // separated params field designates the RCTD parameters (declared last). Nothing executes
    // in-browser — the user runs the script in their own CAS (see the project's RCTD note).
    function copyCAS() {
      if (!store.size) { toast('Nothing to export — seed a system first.', { kind: 'error' }); return; }
      const c = Number(($('#alg-mma-col') || {}).value || store.maxColumn());
      const dialect = ($('#alg-cas-dialect') || {}).value || 'maple';
      const raw = (($('#alg-cas-params') || {}).value || '').trim();
      const params = raw ? raw.split(/[,\s]+/).filter(Boolean) : [];
      const code = store.casColumn(c, dialect, { params });
      if (!code) { toast('Column ' + c + ' has no equations.', { kind: 'error' }); return; }
      const label = dialect === 'maple' ? 'Maple RCTD' : dialect.charAt(0).toUpperCase() + dialect.slice(1);
      writeClipboard(code, label + ' (column ' + c + ')');
    }
    // G11: copy the chosen column as msolve `.ms` input (over ℚ; complex coefficients map to a
    // variable i with i²+1). The user runs msolve offline; nothing executes in-browser.
    function copyMsolve() {
      if (!store.size) { toast('Nothing to export — seed a system first.', { kind: 'error' }); return; }
      const c = Number(($('#alg-mma-col') || {}).value || store.maxColumn());
      const raw = (($('#alg-cas-params') || {}).value || '').trim();
      const params = raw ? raw.split(/[,\s]+/).filter(Boolean) : [];
      const code = store.msolveColumn(c, { params });
      if (!code) { toast('Column ' + c + ' has no equality system to export.', { kind: 'error' }); return; }
      writeClipboard(code, 'msolve .ms (column ' + c + ')');
    }
    // Import a parametric RCTD result (the return trip for the Maple RealComprehensiveTriangularize
    // export). Parse the pasted qd-rctd JSON with QD.CASExport.parseRCTD, land the cells as a new
    // RCTD column via store.importRCTD, and summarize the per-cell real-solution counts in the
    // verdict card. Nothing executed Maple in-browser — this just reads its serialized output back.
    function doImportRCTD() {
      if (busyGuard()) return;
      const ta = $('#alg-rctd-json');
      const text = (ta && ta.value || '').trim();
      if (!text) { toast('Paste the qd-rctd JSON from your Maple run first.', { kind: 'error' }); return; }
      const CAS = QD.CASExport;
      if (!CAS || !CAS.parseRCTD) { showError('CAS import unavailable (QD.CASExport.parseRCTD missing).'); return; }
      const parsed = CAS.parseRCTD(text);
      if (!parsed.ok) { showError('RCTD import: ' + (parsed.reason || 'could not parse the JSON')); return; }
      const res = store.importRCTD(parsed);
      if (!res.ok) { showError('RCTD import: ' + (res.reason || 'failed')); return; }
      if (canvas) canvas.clearSelection();
      rerender(); refreshPickers();
      // Verdict summary: the per-cell real-solution counts (the parametric uniqueness picture).
      const counted = res.cells.filter((c) => c.realCount != null);
      const total = counted.reduce((s, c) => s + c.realCount, 0);
      const text2 = 'Imported ' + res.cellCount + ' RCTD parameter cell' + (res.cellCount === 1 ? '' : 's')
        + ' (column ' + res.column + '), ' + res.created.length + ' node(s).'
        + (counted.length ? '  Real solutions per cell: ' + counted.map((c) => 'cell ' + c.index + ' → ' + c.realCount).join(', ') + '.' : '');
      const rows = res.cells.map((c) => 'cell ' + c.index + ': ' + (c.realCount != null ? c.realCount + ' real solution' + (c.realCount === 1 ? '' : 's') : 'real count not reported'));
      setStatus(text2);
      if (canvas) canvas.setVerdict({ text: 'RCTD: ' + res.cellCount + ' parameter cell' + (res.cellCount === 1 ? '' : 's') + (counted.length ? ' · ' + total + ' real solution(s) total' : ''), solutionsText: rows.join('\n') });
      toast(text2);
    }

    // Attempt to factor an equation: show its factors; picking one pursues that case
    // (V(fᵢ)=0) as a new "case" column. The other factors remain — undo and pick another.
    function doFactor(id, box) {
      if (busyGuard()) return;
      const fr = store.factorOf(id);
      if (!fr.ok) { toast('No nontrivial factorization: ' + (fr.reason || 'irreducible by our methods (monomial / separable / univariate)'), { kind: 'error' }); return; }
      let chooser = box.querySelector('.algebra-factor-chooser');
      if (chooser) chooser.remove();
      chooser = document.createElement('div'); chooser.className = 'algebra-factor-chooser';
      const lab = document.createElement('div'); lab.className = 'hint';
      lab.textContent = 'V(p) = ' + fr.factors.map((_, i) => 'V(f' + (i + 1) + ')').join(' ∪ ') + ' — pick a case to pursue:';
      chooser.appendChild(lab);
      const RL = QD.RiemannLatex;
      fr.factors.forEach((f, i) => {
        const row = document.createElement('div'); row.className = 'algebra-factor-row';
        const eq = document.createElement('span'); eq.className = 'algebra-factor-eq';
        const tex = 'f_{' + (i + 1) + '} = ' + f.toLatex(latexOf);
        if (RL && RL.render) RL.render(eq, tex, false); else eq.textContent = tex;
        const use = document.createElement('button'); use.type = 'button'; use.className = 'small'; use.textContent = 'case f' + (i + 1) + '=0';
        use.title = 'Replace this equation with f' + (i + 1) + ' = 0 in a new column';
        use.addEventListener('click', () => {
          if (busyGuard()) return;
          const r = store.applyFactor(id, i);
          if (!r.ok) { showError('Factor: ' + (r.reason || 'failed')); return; }
          if (canvas) canvas.clearSelection();
          rerender(); refreshPickers();
          toast('Factored → case ' + (i + 1) + ' of ' + r.factorCount + ' (column ' + r.column + '); undo to pursue another case.');
        });
        row.appendChild(eq); row.appendChild(use); chooser.appendChild(row);
      });
      box.appendChild(chooser);
    }

    // D5: render the step-by-step derivation of a node in the inspector (toggle). Each step
    // shows the rule applied and the resulting equation (KaTeX). For substitution / reality
    // reductions the steps are genuine intermediates replayed one variable at a time; for
    // engine reductions they summarize input(s) → method → output.
    function doShowSteps(id, box) {
      const RL = QD.RiemannLatex;
      let panel = box.querySelector('.algebra-steps-panel');
      if (panel) { panel.remove(); return; }                 // toggle off
      const r = store.derivationSteps(id);
      panel = document.createElement('div'); panel.className = 'algebra-steps-panel';
      if (!r.ok) { const e = document.createElement('div'); e.className = 'warn'; e.textContent = 'No steps: ' + (r.reason || 'unavailable'); panel.appendChild(e); box.appendChild(panel); return; }
      const head = document.createElement('div'); head.className = 'hint';
      head.textContent = r.progressive ? 'Derivation (' + r.op + ') — replayed step by step:' : 'Derivation (' + r.op + ') — input(s) → method → output:';
      panel.appendChild(head);
      const ol = document.createElement('ol'); ol.className = 'algebra-steps-list';
      r.steps.forEach((st) => {
        const li = document.createElement('li');
        const rule = document.createElement('div'); rule.className = 'algebra-step-rule'; rule.textContent = st.rule;
        const eq = document.createElement('div'); eq.className = 'algebra-step-eq';
        const tex = st.poly.toLatex(latexOf);
        if (RL && RL.render) RL.render(eq, tex, true); else eq.textContent = tex;
        li.appendChild(rule); li.appendChild(eq); ol.appendChild(li);
      });
      panel.appendChild(ol); box.appendChild(panel);
    }

    // Solve a single equation for one variable IN RADICALS (closed form). Shows a
    // variable picker; the result (closed-form roots) renders as KaTeX in the
    // inspector + the verdict card, with a numeric "verified ✓ (N samples)" line.
    // Read-only (radicals are not polynomials, so nothing is added to the DAG).
    function doSolveRadical(id, box) {
      const n = store.get(id); if (!n) return;
      const SR = QD.SymRadical, S = QD.Sym, RL = QD.RiemannLatex;
      let panel = box.querySelector('.algebra-solve-panel');
      if (panel) panel.remove();
      panel = document.createElement('div'); panel.className = 'algebra-solve-panel';
      const row = document.createElement('div'); row.className = 'algebra-line';
      const lab = document.createElement('span'); lab.className = 'algebra-line-label'; lab.textContent = 'Solve for';
      const sel = document.createElement('select');
      [...n.poly.vars()].forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = latexPlain(v); sel.appendChild(o); });
      const go = document.createElement('button'); go.type = 'button'; go.className = 'small'; go.textContent = 'Solve (radicals)';
      row.appendChild(lab); row.appendChild(sel); row.appendChild(go); panel.appendChild(row);
      const out = document.createElement('div'); out.className = 'algebra-solve-out'; panel.appendChild(out);
      box.appendChild(panel);
      const run = () => {
        out.innerHTML = '';
        if (!SR || typeof SR.solveByRadicals !== 'function') { const e = document.createElement('div'); e.className = 'warn'; e.textContent = 'Radical solver unavailable (QD.SymRadical not loaded).'; out.appendChild(e); return; }
        const r = store.solveForVariable(id, sel.value);
        if (!r.ok) { const e = document.createElement('div'); e.className = 'warn'; e.textContent = 'Cannot solve: ' + withGuidance(r.reason || 'unavailable'); out.appendChild(e); setStatus(''); return; }
        const verOk = r.verify && r.verify.checked > 0 && r.verify.maxResidual < 1e-6;
        const head = document.createElement('div'); head.className = 'hint';
        head.appendChild(document.createTextNode(r.count + ' root' + (r.count === 1 ? '' : 's') + ' · ' + r.method + ' · '));
        const vspan = document.createElement('span'); vspan.className = verOk ? 'ok' : 'warn';
        vspan.textContent = verOk
          ? 'verified ✓ (' + r.verify.checked + ' samples, residual ≤ ' + r.verify.maxResidual.toExponential(1) + ')'
          : '⚠ not numerically verified';
        head.appendChild(vspan);
        out.appendChild(head);
        const latexes = [];
        r.roots.forEach((root) => {
          const tex = latexPlain(sel.value) + ' = ' + SR.radicalToLatex(root, latexOf, S);
          latexes.push(tex);
          const d = document.createElement('div'); d.className = 'algebra-solve-root';
          if (RL && RL.render) RL.render(d, tex, true); else d.textContent = tex;
          out.appendChild(d);
        });
        if (r.count) {
          const cp = document.createElement('button'); cp.type = 'button'; cp.className = 'small'; cp.textContent = 'Copy LaTeX';
          cp.addEventListener('click', () => writeClipboard(latexes.join(' \\\\\n'), 'roots of ' + n.label + ' (LaTeX)'));
          out.appendChild(cp);
        }
        const summary = 'Solved ' + latexPlain(sel.value) + ': ' + r.count + ' root' + (r.count === 1 ? '' : 's') + ' — ' + r.method + (verOk ? ' (verified ✓)' : '');
        setStatus(summary);
        // Verdict card: TYPESET roots (solutionsLatex) — not raw LaTeX. Copy-LaTeX lives below.
        if (canvas) canvas.setVerdict({ title: 'Solve for a variable', text: summary, solutionsLatex: latexes });
        toast(summary, verOk ? {} : { kind: 'error' });
      };
      go.addEventListener('click', run);
      sel.addEventListener('change', run);
      run();   // solve immediately for the default (first) variable
    }

    // ---- contextual node inspector (driven by canvas selection) -------------
    // 0 selected → hide the inspector, show the workflow sections; 1 selected → that
    // node's equation + provenance + per-node actions (Duplicate / Copy / Delete);
    // 2 selected → the eliminate-a-variable (Sylvester resultant) panel.
    // D3 — does this equality node actually factor? (guarded; the inspector hides the
    // "Attempt to factor" action on irreducible equations). Cached per id+poly so repeated
    // renders of the same selection don't refactor.
    const _factorCache = new Map();
    function _factorable(id) {
      const n = store.get(id); if (!n) return false;
      const key = id + ':' + (n.poly && n.poly.size ? n.poly.size() : 0);
      if (_factorCache.has(key)) return _factorCache.get(key);
      let ok = false;
      try { ok = !!(store.factorOf && store.factorOf(id).ok); } catch (e) { ok = false; }
      _factorCache.set(key, ok);
      if (_factorCache.size > 256) _factorCache.delete(_factorCache.keys().next().value);
      return ok;
    }
    function renderInspector(sel) {
      const box = $('#alg-inspector'), sections = $('#alg-sections');
      if (!box) return;
      sel = (sel || []).filter((id) => store.get(id));
      if (!sel.length) {
        box.classList.add('hidden'); box.innerHTML = '';
        if (sections) sections.classList.remove('hidden');
        return;
      }
      box.classList.remove('hidden');
      if (sections) sections.classList.add('hidden');
      box.innerHTML = '';
      const head = document.createElement('div'); head.className = 'algebra-inspector-head';
      const title = document.createElement('span'); title.className = 'algebra-line-label';
      title.textContent = sel.length === 1 ? 'Selected equation' : 'Eliminate a variable';
      const done = document.createElement('button'); done.type = 'button'; done.className = 'small'; done.textContent = 'Done';
      done.title = 'Clear selection'; done.addEventListener('click', () => { if (canvas) canvas.clearSelection(); });
      head.appendChild(title); head.appendChild(done); box.appendChild(head);
      const mkBtn = (txt, tip, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'small'; b.textContent = txt; if (tip) b.title = tip; b.addEventListener('click', fn); return b; };

      if (sel.length === 1) {
        const n = store.get(sel[0]);
        const lab = document.createElement('div'); lab.className = 'hint'; lab.textContent = n.label; box.appendChild(lab);
        const eq = document.createElement('div'); eq.className = 'algebra-inspector-eq';
        const RL = QD.RiemannLatex; const tex = n.poly.toLatex(latexOf) + relSuffix(n.rel);
        if (RL && RL.render) RL.render(eq, tex, true); else eq.textContent = tex;
        box.appendChild(eq);
        const prov = provText(n.provenance);
        if (prov) { const p = document.createElement('div'); p.className = 'hint'; p.textContent = 'Origin: ' + prov; box.appendChild(p); }
        const acts = document.createElement('div'); acts.className = 'row'; acts.style.gap = '4px'; acts.style.marginTop = '4px';
        acts.appendChild(mkBtn('Duplicate', 'Copy this equation into a new node', () => { if (busyGuard()) return; if (store.duplicate(sel[0])) { rerender(); toast('Duplicated ' + n.label); } }));
        acts.appendChild(mkBtn('Copy LaTeX', 'Copy this equation as LaTeX', () => copyNodeLatex(sel[0])));
        acts.appendChild(mkBtn('Copy Mathematica', 'Copy this equation as Wolfram-Language (lhs == 0)', () => { const code = store.mathematicaNode(sel[0]); if (code) writeClipboard(code, n.label + ' (Mathematica)'); }));
        // D5: show how this derived equation was obtained from its input(s) — for substitutions
        // / reality assumptions the transformation is replayed one variable at a time (genuine
        // intermediate polynomials); engine reductions get an input → method → output summary.
        if (n.provenance && (n.provenance.inputs || []).length) {
          acts.appendChild(mkBtn('Show steps', 'Show how this equation was derived from its input(s); substitutions and reality assumptions are replayed one variable at a time', () => doShowSteps(sel[0], box)));
        }
        acts.appendChild(mkBtn('Delete', 'Delete this node and its descendants', () => { if (busyGuard()) return; const removed = store.deleteNode(sel[0]); if (canvas) canvas.clearSelection(); rerender(); toast('Deleted ' + ((removed && removed.length) || 1) + ' node(s)'); }));
        // Generate the conjugate equation p̄ = 0 (folding in variables already assumed real).
        // Useful for derived equations that did not get a seed-time companion. Equalities/≠ only.
        if (n.rel !== '>') {
          acts.appendChild(mkBtn('Generate conjugate', 'Add the conjugate equation p̄ = 0 as a paired companion, folding in any variables already assumed real (v̄ ≡ v)', () => {
            if (busyGuard()) return;
            const r = store.generateConjugate(sel[0]);
            if (!r.ok) { toast(r.reason || 'could not generate the conjugate', { kind: 'error' }); return; }
            rerender(); toast('Added conjugate: ' + r.node.label);
          }));
        }
        // Propagate a constraint forward into the current system, folding in every assumption
        // (reality / imaginary / fixed φ(0) / pinned values) applied across the columns.
        if (n.column < store.maxColumn()) {
          acts.appendChild(mkBtn('Propagate to current system', 'Carry this equation into the last column with all assumptions (reality, imaginary, fixed φ(0), pinned values) applied to it', () => {
            if (busyGuard()) return;
            const r = store.propagateNode(sel[0]);
            if (!r.ok) { toast(r.reason || 'could not propagate', { kind: 'error' }); return; }
            if (canvas) canvas.clearSelection();
            rerender(); refreshPickers();
            toast('Propagated to column ' + r.column + (r.applied && r.applied.length ? ' (applied ' + r.applied.join(', ') + ')' : ''));
          }));
        }
        // Attempt to factor (equalities in the current system only): split p=f·g into
        // candidate systems V(p)=⋃V(fᵢ), pursued one case (factor) at a time. D3: shown only
        // when the equation ACTUALLY factors (store.factorOf(id).ok) — not on irreducible ones.
        if (n.rel === '=' && n.column === store.maxColumn() && _factorable(sel[0])) {
          acts.appendChild(mkBtn('Attempt to factor', 'Factor this equation; pick a factor fᵢ to pursue V(fᵢ)=0 as a new "case" column (V(p)=⋃ᵢV(fᵢ))', () => doFactor(sel[0], box)));
        }
        // Solve this equation for one variable in radicals (closed form), keeping the
        // others symbolic — degree ≤4 or reducible (e.g. x⁶+b x⁴+c x²+d as a cubic in x²).
        // Read-only display (roots are radicals, not polynomials); any equality, any column.
        // D3: shown only when the equation actually has a variable to solve for.
        if (n.rel === '=' && n.poly.vars().size >= 1) {
          acts.appendChild(mkBtn('Solve for a variable', 'Solve this equation for one chosen variable in radicals (closed form), keeping the remaining variables symbolic; degree ≤4 or reducible (quasi-polynomial / factorable). Result is displayed + numerically verified, not added to the graph.', () => doSolveRadical(sel[0], box)));
        }
        // Fork a new parallel branch starting from THIS node's column (A2) — explore a
        // different line of assumptions from here while leaving the current branch intact.
        acts.appendChild(mkBtn('Fork from here', 'Start a new parallel branch from this column: copies the column into a fresh track you can reduce independently, leaving the current branch untouched.', () => { if (canvas) canvas.clearSelection(); doFork(n.column); }));
        box.appendChild(acts);
        return;
      }

      // two nodes: the resultant elimination panel
      const a = store.get(sel[0]), b = store.get(sel[1]);
      const selLine = document.createElement('div'); selLine.className = 'hint'; selLine.textContent = a.label + '   ×   ' + b.label; box.appendChild(selLine);
      const line = document.createElement('div'); line.className = 'algebra-line';
      const varLabel = document.createElement('span'); varLabel.className = 'algebra-line-label'; varLabel.textContent = 'Variable';
      const select = document.createElement('select'); select.id = 'alg-var';
      const vars = store.sharedVars(sel[0], sel[1]);
      vars.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = latexPlain(v); select.appendChild(o); });
      const elimBtn = mkBtn('Eliminate', 'Take the Sylvester resultant of the two selected nodes in the chosen variable', doEliminate); elimBtn.id = 'alg-eliminate'; elimBtn.disabled = vars.length === 0;
      const gbBtn = mkBtn('Gröbner', 'Gröbner basis of the two selected nodes (uses every shared variable, not just one)', () => doGroebner(canvas ? canvas.getSelection() : [])); gbBtn.id = 'alg-groebner-sel';
      line.appendChild(varLabel); line.appendChild(select); line.appendChild(elimBtn); line.appendChild(gbBtn);
      box.appendChild(line);
      const cost = document.createElement('div'); cost.className = 'hint'; cost.id = 'alg-cost'; cost.title = 'Sylvester matrix size and term counts — the elimination cost'; box.appendChild(cost);
      select.onchange = updateCost;
      updateCost();
    }
    // Update the 2-node inspector's cost line with the Sylvester-matrix size + term/degree
    // counts for eliminating the chosen shared variable (store.previewCost). Cleared unless
    // exactly two nodes are selected and a variable is chosen.
    function updateCost() {
      const sel = canvas ? canvas.getSelection() : [];
      const v = $('#alg-var') && $('#alg-var').value;
      const costEl = $('#alg-cost');
      if (!costEl) return;
      if (sel.length !== 2 || !v) { costEl.textContent = ''; return; }
      const c = store.previewCost(sel[0], sel[1], v);
      costEl.textContent = 'Sylvester ' + c.matrix + '×' + c.matrix + ' (deg ' + c.degA + ', ' + c.degB + '; ' + c.termsA + '+' + c.termsB + ' terms)';
    }
    // Eliminate the chosen shared variable from the two selected nodes by their exact
    // Sylvester resultant (store.eliminate) → a derived node in the current column.
    function doEliminate() {
      if (busyGuard()) return;
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
      ['alg-groebner', 'alg-groebner-sel', 'alg-solve', 'alg-dimension', 'alg-triangular', 'alg-classify', 'alg-univalence', 'alg-resolvent', 'alg-autosolve',
        'alg-gauge-elim', 'alg-eliminate', 'alg-seed', 'alg-undo', 'alg-redo', 'alg-real-apply', 'alg-real-auto', 'alg-real-detect', 'alg-propagate-all', 'alg-val-apply', 'alg-def-apply', 'alg-abbrev', 'alg-eq-apply']
        .forEach((id) => { const b = $('#' + id); if (b) b.disabled = on; });
      const pal = $('#alg-palette'); if (pal) pal.querySelectorAll('button').forEach((b) => { b.disabled = on; });
      const cancel = $('#alg-cancel'); if (cancel) cancel.classList.toggle('hidden', !on);
      if (on && label) setStatus(label);
    }
    function cancelOp() { if (_abort) { try { _abort.abort(); } catch (e) { /* ignore */ } } if (QD.SymWorker) QD.SymWorker.cancel(); }
    function _newAbort() { return (typeof AbortController !== 'undefined') ? new AbortController() : null; }
    // Guard a graph-mutating action so it can't land while a worker op is in flight. The
    // inspector's action buttons (Duplicate / Delete / Attempt-to-factor / factor cases)
    // are rebuilt on every selection, so they can't be reached by setBusy's id list (A5) —
    // they call this instead. Returns true (and warns) when an op is running.
    function busyGuard() {
      if (_abort) { toast('Busy — wait for the current computation to finish (or Cancel).', { kind: 'error' }); return true; }
      return false;
    }

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
      if (!ensureSeed()) return;
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
      if (!ensureSeed()) return;
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
    // Carry every univalence constraint into the current system, assumptions applied (batch).
    function doPropagateAll() {
      if (busyGuard()) return;
      if (!store.size) { toast('Nothing to propagate — seed a system first.', { kind: 'error' }); return; }
      const r = store.propagateAllConstraints();
      if (!r.ok) { toast(r.reason || 'nothing to propagate', { kind: 'error' }); return; }
      if (canvas) canvas.clearSelection();
      rerender(); refreshPickers();
      toast('Propagated ' + r.count + ' constraint' + (r.count === 1 ? '' : 's') + ' → column ' + r.column);
    }

    // --- Honest labeling of SPECIALIZED verdicts (CLAUDE.md guardrail) -------------------------
    // assumeReal (z̄≡z) and assumeImaginary (z̄≡−z) restrict the system to a SLICE and can silently
    // drop quadrature domains lying off it; the ★ Auto-reduce path auto-applies assumeReal, so its
    // count is a slice count too. A classify result carries the analyzed branch's slice vars
    // (r.realVars / r.imagVars, threaded by the store). Build the human labels of the active slices.
    function sliceLabels(r) {
      const out = [];
      if (r && r.realVars && r.realVars.length) out.push('real slice (z̄≡z: ' + r.realVars.map(latexPlain).join(', ') + ')');
      if (r && r.imagVars && r.imagVars.length) out.push('imaginary slice (z̄≡−z: ' + r.imagVars.map(latexPlain).join(', ') + ')');
      return out;
    }
    // The inline caveat appended to a verdict string when it was computed on a slice — so a count
    // never reads as the general quadrature-domain count. Mirrors the factor-branch annotation. '' ⇒
    // no slice (the general system). Covers both the count ("lower bound") and existence ("rules out
    // only on-slice") readings, since an inconsistent/empty slice verdict does NOT rule out the rest.
    function sliceCaveat(r) {
      const s = sliceLabels(r);
      if (!s.length) return '';
      return '  [on the ' + s.join(' + ') + ' only — a specialization that can omit off-slice quadrature'
        + ' domains: a count here is a LOWER BOUND on the general one, and an empty/inconsistent verdict'
        + ' rules out only on-slice solutions.]';
    }
    // The persistent "assumptions ledger" for the verdict card — every active specialization that
    // narrows the verdict, one short label each (slices, φ(0) gauge fix, factor case). Shown as a
    // banner so no slice/branch count on the card reads as the certified general count. [] ⇒ general.
    function specializationLedger(r) {
      const out = sliceLabels(r).map((s) => s.charAt(0).toUpperCase() + s.slice(1));
      if (store.w0Fixed) out.push('φ(0) fixed (rotation gauge)');
      if (r && r.partialBranch) out.push('Factor case ' + ((r.caseIndex || 0) + 1) + ' of ' + r.caseCount + ' (branches add up)');
      return out;
    }

    // Semi-autonomous "Auto-reduce & solve": chain the reductions (auto-reality →
    // linear propagation), each appended as a labeled column, then determine existence/
    // uniqueness and the explicit real solutions. The reduction history stays visible.
    function doAutoSolve() {
      if (_abort) return;
      if (!activeEnv) { toast(STR.noSolve || 'No classical bounded QD solved yet.', { kind: 'error' }); return; }
      if (!ensureSeed()) return;
      clearError();
      const ctrl = _newAbort(); _abort = ctrl;
      const runOpts = { signal: ctrl && ctrl.signal, onProgress: (info) => setStatus('Auto: ' + info.basis + ' generators, ' + info.pairs + ' pairs left') };
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
          // 3. existence / uniqueness verdict (parameters pinned) — off the main thread
          const params = hDataParamValues();
          const cl = await store.classifyAsync(null, { paramValues: params }, runOpts);
          if (cl.aborted) { _abort = null; setBusy(false); setStatus('Cancelled.'); toast('Cancelled'); return; }
          if (!cl.ok) { _abort = null; setBusy(false); showError('Auto-reduce & solve: ' + withGuidance(cl.reason || 'failed')); return; }
          let verdict;
          if (cl.inconsistent) verdict = 'No quadrature domain: the reduced system is inconsistent.';
          else if (!cl.zeroDim) verdict = 'A positive-dimensional family of solutions (' + cl.numVars + ' real variables) — add a constraint or fix a value to pin it.';
          else verdict = (cl.realCount == null ? cl.multiplicity + ' solution(s) with multiplicity'
            : (cl.realCount === 0 ? 'No real quadrature domain'
              : cl.realCount === 1 ? 'Unique quadrature domain (1 real solution)'
                : cl.realCount + ' real quadrature domains')
            + (cl.complexCount != null ? ' of ' + cl.complexCount + ' distinct complex' : '')) + '.';
          // ★ Auto-reduce auto-applies assumeReal ⇒ this count is on the real slice (a lower bound).
          verdict += sliceCaveat(cl);
          // 4. explicit real solutions when zero-dimensional — off the main thread
          let coords = '', solutionsText = '';
          if (cl.zeroDim && !cl.inconsistent) {
            const sr = await store.solveRealAsync(null, { paramValues: params }, runOpts);
            if (sr.aborted) { _abort = null; setBusy(false); setStatus('Cancelled.'); toast('Cancelled'); return; }
            if (sr.ok && sr.solutions && sr.solutions.length) {
              const reals = sr.solutions.filter((s) => Object.keys(s).every((k) => Math.abs(s[k].im) < 1e-6));
              coords = ' Explicit: ' + reals.length + ' real solution(s) — see the verdict card / console.';
              // a compact text table for the verdict card (real solutions; vars sorted)
              const fmt = (x) => (Math.round(x * 1e6) / 1e6);
              solutionsText = (reals.length ? reals : sr.solutions).slice(0, 6).map((s, i) =>
                '#' + (i + 1) + '  ' + Object.keys(s).sort().map((k) => latexPlain(k) + '=' + fmt(s[k].re) + (Math.abs(s[k].im) < 1e-6 ? '' : (s[k].im >= 0 ? '+' : '−') + fmt(Math.abs(s[k].im)) + 'i')).join('  ')).join('\n');
              try { console.table(sr.solutions.map((s) => { const row = {}; Object.keys(s).forEach((k) => { row[k] = s[k].re.toFixed(6) + (s[k].im >= 0 ? '+' : '−') + Math.abs(s[k].im).toFixed(6) + 'i'; }); return row; })); } catch (e) { /* ignore */ }
            }
          }
          _abort = null; setBusy(false); refreshPickers();
          setStatus(verdict + coords);
          if (canvas) canvas.setVerdict({ text: verdict, solutionsText, assumptions: specializationLedger(cl) });
          toast(verdict, cl.inconsistent || cl.realCount === 0 ? { kind: 'error' } : {});
        } catch (e) { _abort = null; setBusy(false); showError('Auto-reduce & solve: ' + ((e && e.message) || String(e))); }
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
    // Existence / uniqueness verdict for the current system (store.classify over the reim
    // system, known parameters pinned): renders "No QD (inconsistent)" / "Unique QD" /
    // "N real QDs (of M complex)" / "positive-dimensional family" to the status line + the
    // canvas verdict card. Runs behind a setTimeout so the busy state paints first.
    function doClassify() {
      if (_abort) return;
      if (!ensureSeed()) return;
      clearError();
      const sel = canvas && canvas.getSelection().length ? canvas.getSelection() : null;
      const ctrl = _newAbort(); _abort = ctrl;
      setBusy(true, 'Counting real solutions (existence / uniqueness)…');
      store.classifyAsync(sel, { paramValues: hDataParamValues() }, {
        signal: ctrl && ctrl.signal,
        onProgress: (info) => setStatus('Existence / uniqueness… ' + info.basis + ' generators, ' + info.pairs + ' pairs left'),
      }).then((r) => {
        _abort = null; setBusy(false); setStatus('');
        if (r.aborted) { toast('Cancelled'); return; }
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
          else verdict = r.realCount + ' real algebraic solutions' + tail + ' — run Certify univalence for the genuine-QD count (gauge copies merged, non-univalent ones filtered).';
        }
        // A factor "case" column counts ONE branch of V(p)=⋃V(fᵢ) — the branches add up.
        if (r.partialBranch) verdict += '  [case ' + ((r.caseIndex || 0) + 1) + ' of ' + r.caseCount + ' of a factor split — this counts THIS branch only; the branches add up to the original.]';
        // A reality/imaginary assumption slices the system — the count is a lower bound (honest labeling).
        verdict += sliceCaveat(r);
        setStatus(verdict);
        if (canvas) canvas.setVerdict({ text: verdict, assumptions: specializationLedger(r) });
        if (!sel) cacheActiveVerdict(r);   // A6: stamp the active branch's chip (whole last column analyzed)
        toast(verdict, r.inconsistent || r.realCount === 0 ? { kind: 'error' } : {});
      });
    }

    // Reconstruct a numeric Riemann map φ from one real solution of the reim system. The
    // reim variables are named <primal>__re / <primal>__im (z1, A1_1, w0, …); an assumed-
    // real variable has no __im (⇒ 0), and a fixed φ(0) comes from store.w0Fixed. The pole
    // structure (count + order) is read from hData. Returns a boundedQD φ object that
    // QD.evalPhi / isBoundaryUnivalent / findCriticalPoints understand, or null if any map
    // parameter was eliminated from the current system (φ can't be rebuilt — report it).
    function phiFromAlgebraSolution(sol, hData) {
      // (C) a map variable PINNED/eliminated by an earlier reduction (e.g. z₁=0) is no longer a
      // solved unknown — fall back to its recorded value (store.knownValues) so φ still rebuilds.
      const known = (store.knownValues && store.knownValues()) || {};
      const num = (name) => {
        const re = sol[name + '__re'];
        if (re) { const im = sol[name + '__im']; return { re: re.re, im: im ? im.re : 0 }; }
        if (known[name]) return { re: known[name].re || 0, im: known[name].im || 0 };
        return undefined;
      };
      let w0 = num('w0');
      if (!w0 && store.w0Fixed) {                 // φ(0) fixed ⇒ not a solved variable; read its value
        const wf = store.w0Fixed, rat = (p) => (p ? Number(p[0]) / Number(p[1]) : 0);
        w0 = wf.approx ? { re: wf.approx.re || 0, im: wf.approx.im || 0 } : { re: rat(wf.re), im: rat(wf.im) };
      }
      if (!w0) return null;
      const poles = (hData && hData.poles) || [];
      const branches = [];
      for (let j = 0; j < poles.length; j++) {
        const z = num('z' + (j + 1)); if (!z) return null;
        const A = [], order = (poles[j].principal || []).length;
        for (let k = 1; k <= order; k++) { const a = num('A' + (j + 1) + '_' + k); if (!a) return null; A.push(a); }
        branches.push({ z, A });
      }
      return { unbounded: false, family: 'boundedQD', w0, branches };
    }
    // EXACT (Schur–Cohn) local-fold test for one candidate solution. Build num(φ′) as a
    // univariate polynomial in ζ with exact ℚ(i) coefficients — rationalize the candidate's
    // numeric coordinates (QE.ratApprox) and substitute the barred pole vars z̄_j = conj(z_j),
    // Ā_{j,k} = conj(A_{j,k}) into QC.phiPrimeNumerator — then count its roots inside 𝔻 by the
    // Hermitian Schur–Cohn inertia (Sym.schurCohn): exact integer/rational linear algebra, NO
    // numeric root-finding. Returns { inside, onCircle, degenerate, resolved }: inside>0 ⇒ φ′
    // has a zero in 𝔻 (a fold); onCircle = # DISTINCT zeros of φ′ ON ∂𝔻 (each a CUSP); inside===0
    // & onCircle===0 ⇒ φ′≠0 on the closed disk. `resolved` is true when the (post-Commit-A) exact
    // count is trustworthy — including the self-inversive/cusp cases — so the caller may use inside
    // & onCircle even when `degenerate` (which now means onCircle>0, a boundary zero). Only an
    // over-cap result (degenerate:true & !resolved) is ambiguous ⇒ numeric fallback. null ⇒ φ′ /
    // the map vars are unavailable (e.g. eliminated) ⇒ caller uses the numeric test.
    function schurCohnFold(sol, hData) {
      const Sym = QD && QD.Sym;
      if (!Sym || !QC || typeof Sym.schurCohn !== 'function' || typeof Sym.uniCoeffs !== 'function' ||
          typeof QC.phiPrimeNumerator !== 'function') return null;
      const sub = poleSubst(sol, hData);
      if (!sub) return null;
      let numP; try { numP = QC.phiPrimeNumerator(hData); } catch (e) { return null; }
      try {
        const sc = Sym.schurCohn(Sym.uniCoeffs(numP.subst(sub), 'Z'));          // univariate in ζ (= 'Z')
        return { inside: sc.inside, onCircle: sc.onCircle || 0, degenerate: sc.degenerate, resolved: !!sc.resolved };
      } catch (e) { return null; }
    }
    // Shared exact-ℚ(i) substitution map for the BARRED pole vars from a candidate's numeric
    // solution: { z̄_j → conj(rat(z_j)), Ā_{j,k} → conj(rat(A_{j,k})) } (continued-fraction
    // rationalization via QE.ratApprox). Used by both the local Schur–Cohn fold test and the
    // exact boundary-injectivity test. null if Sym/QE are unavailable or a map var is missing
    // (e.g. the map variables were eliminated from the system).
    function poleSubst(sol, hData) {
      const Sym = QD && QD.Sym;
      if (!Sym || !QE || typeof QE.ratApprox !== 'function') return null;
      // (C) fall back to a variable's PINNED/eliminated value (store.knownValues) when it is no
      // longer a solved unknown — so the exact Schur–Cohn / boundary tests work after a reduction
      // (e.g. z₁=0) removed a map variable.
      const known = (store.knownValues && store.knownValues()) || {};
      const num = (name) => {
        const re = sol[name + '__re'];
        if (re) { const im = sol[name + '__im']; return { re: re.re, im: im ? im.re : 0 }; }
        if (known[name]) return { re: known[name].re || 0, im: known[name].im || 0 };
        return undefined;
      };
      const ratG = (v) => { const a = QE.ratApprox(v.re || 0), b = QE.ratApprox(v.im || 0); return Sym.gauss(Sym.rat(a[0], a[1]), Sym.rat(b[0], b[1])); };
      const poles = (hData && hData.poles) || [];
      const sub = {};
      for (let j = 0; j < poles.length; j++) {
        const z = num('z' + (j + 1)); if (!z) return null;
        sub['zb' + (j + 1)] = Sym.mpolyConst(ratG(z).conj());                   // z̄_j = conj(z_j)
        const order = (poles[j].principal || []).length;
        for (let k = 1; k <= order; k++) {
          const a = num('A' + (j + 1) + '_' + k); if (!a) return null;
          sub['Ab' + (j + 1) + '_' + k] = Sym.mpolyConst(ratG(a).conj());       // Ā_{j,k} = conj(A_{j,k})
        }
      }
      return sub;
    }
    // EXACT boundary-injectivity test for one candidate: is φ(∂𝔻) a SIMPLE closed curve (a Jordan
    // boundary, possibly WITH cusps)? QC.boundaryDoublePointCount returns the count of real circle
    // solutions of the divided difference = 2·(genuine self-crossings) + (#diagonal cusp points),
    // because on the diagonal ζ₁=ζ₂ the divided difference equals φ′·(Möbius≠0), so each on-circle
    // zero of φ′ (a CUSP) contributes one diagonal solution. Subtracting `cusps` (the schurCohn
    // on-circle count) isolates the genuine self-intersections ⇒ simple ⟺ count === cusps. Returns
    // { simple } when it certifies, null otherwise (no Sym / positive-dim / over the Hermite cap) ⇒
    // numeric fallback. PRECONDITION: φ′≠0 strictly INSIDE 𝔻 (the caller's no-fold gate); on-circle
    // zeros (cusps) are allowed and subtracted here.
    function boundarySimpleExact(sol, hData, cusps) {
      if (!QC || typeof QC.boundaryDoublePointCount !== 'function') return null;
      const sub = poleSubst(sol, hData);
      if (!sub) return null;
      let r; try { r = QC.boundaryDoublePointCount(hData, sub); } catch (e) { return null; }
      if (!r || !r.ok) return null;
      return { simple: r.count === (cusps || 0) };
    }
    // Certified univalence filter (the genuine-QD count): solve the current system for its
    // REAL solutions, reconstruct each candidate φ, and test univalence — a real algebraic
    // solution is a GENUINE quadrature domain only if its φ is schlicht on 𝔻. The LOCAL test
    // (φ′≠0 strictly inside 𝔻) uses the EXACT Schur–Cohn inertia of num(φ′) over ℚ(i)
    // (schurCohnFold — no numeric root-finding); on a degenerate (singular/self-inversive)
    // matrix — which also covers an on-circle φ′ zero = a cusp, allowed — it falls back to the
    // numeric QD.findCriticalPoints so a fold is never mis-certified. The BOUNDARY test (φ(∂𝔻)
    // simple, no self-intersection) is also EXACT when the local test certified φ′≠0 on 𝔻̄
    // (boundarySimpleExact → QC.boundaryDoublePointCount: count real circle double points via the
    // Hermite trace form; 0 ⇔ simple) and falls back to the numeric QD.isBoundaryUnivalent on a
    // cusp/positive-dim/over-cap case. NB the algebraic # real solutions and the # genuine QDs
    // are DIFFERENT questions (the classic balayage-vs-algebra distinction); this reconciles them.
    //
    // UNIFIED EXISTENCE/UNIQUENESS VERDICT: this is the authoritative verdict, composing the
    // regime (classify: inconsistent ⇒ no QD; positive-dimensional ⇒ underdetermined, "fix the
    // gauge"; zero-dimensional ⇒ count) with the univalence filter AND a GAUGE QUOTIENT — real
    // algebraic solutions related by a disk rotation (QD.sameDomain) are the SAME domain, so the
    // raw solution count (e.g. the ±φ′(0) pair) is collapsed to the geometric quadrature-domain
    // count. This is what turns "N real solutions" into "K distinct genuine quadrature domains".
    function doCertifyUnivalence() {
      if (_abort) return;
      if (!activeEnv) { toast(STR.noSolve || 'No classical bounded QD solved yet.', { kind: 'error' }); return; }
      if (typeof QD.isBoundaryUnivalent !== 'function') { showError('Univalence: the numeric univalence machinery (solver.js) is not loaded.'); return; }
      if (!ensureSeed()) return;
      clearError();
      const ctrl = _newAbort(); _abort = ctrl;
      setBusy(true, 'Certifying univalence (genuine QDs)…');
      const params = hDataParamValues();
      const finalVerdict = (text, bad, ledger) => { _abort = null; setBusy(false); setStatus(text); if (canvas) canvas.setVerdict({ text: text, assumptions: ledger || [] }); toast(text, bad ? { kind: 'error' } : {}); };
      // 1) REGIME (dimension + consistency): the heavy reim Gröbner + Hermite real-count run in the
      // WORKER (classifyAsync) so the UI stays responsive and the op is cancellable; the per-solution
      // univalence certificate (below) is cheap and stays on the main thread.
      store.classifyAsync(null, { paramValues: params }, {
        signal: ctrl && ctrl.signal,
        onProgress: (info) => setStatus('Certifying univalence… ' + info.basis + ' generators, ' + info.pairs + ' pairs left'),
      }).then((cl) => {
        if (cl.aborted) { _abort = null; setBusy(false); setStatus(''); toast('Cancelled'); return; }
        if (!cl.ok) { _abort = null; setBusy(false); setStatus(''); showError('Existence / uniqueness: ' + withGuidance(cl.reason || 'classify failed')); return; }
        if (cl.inconsistent) { finalVerdict('No quadrature domain: the system is inconsistent (1 ∈ I).' + sliceCaveat(cl), true, specializationLedger(cl)); return; }
        if (!cl.zeroDim) {
          // Positive-dimensional ⇒ underdetermined. Detect FACTORABLE causes (a locator/gauge
          // equation that splits the variety) and offer one-click pin/split actions (#2).
          _abort = null; setBusy(false); setStatus('');
          const text = 'Underdetermined: a positive-dimensional family (' + cl.numVars + ' real variables). Fix the rotation gauge (φ′(0) real-positive) or pin a forced variable — see the suggestions below, or use “Set values”.' + sliceCaveat(cl);
          const actions = []; const seen = {};
          let hits = []; try { hits = store.spuriousFactors(null, { paramValues: hDataParamValues() }) || []; } catch (e) { hits = []; }
          hits.forEach((h) => h.factors.forEach((f) => {
            if (f.kind === 'variable' && f.pinVar) {
              const v = latexPlain(f.pinVar), val = f.pinValue || { re: 0, im: 0 };
              const vs = val.re + (val.im ? (val.im > 0 ? '+' : '') + val.im + 'i' : '');
              const key = 'pin:' + f.pinVar; if (seen[key]) return; seen[key] = 1;
              actions.push({ label: 'Pin ' + v + ' = ' + vs, title: 'An equation factors through ' + v + ' — pin it to isolate the component (substitute + propagate).',
                onClick: () => { const r = store.substituteValues([{ varName: f.pinVar, value: val }], { propagate: true }); if (r && r.ok !== false) { rerender(); refreshPickers(); doCertifyUnivalence(); } } });
            } else {
              const key = 'split:' + h.nodeId; if (seen[key]) return; seen[key] = 1;
              actions.push({ label: 'Split ' + (h.label || 'equation') + ' into cases', title: 'This equation factors — split V(p)=⋃V(fᵢ) into candidate case columns (Attempt to factor).',
                onClick: () => { const r = store.applyFactor(h.nodeId, f.factorIndex); if (r && r.ok) { rerender(); refreshPickers(); doCertifyUnivalence(); } } });
            }
          }));
          if (canvas) canvas.setVerdict({ text, actions: actions.slice(0, 6), assumptions: specializationLedger(cl) });
          setStatus(text); toast('Positive-dimensional — fix the gauge / pin a forced variable.', { kind: 'error' });
          return;
        }
        // 2) ZERO-DIMENSIONAL: solve for the real solutions (= the algebraic quadrature domains),
        // again in the WORKER (solveRealAsync). The per-solution univalence work below stays on the
        // main thread (it operates on concrete substituted candidates — cheap).
        store.solveRealAsync(null, { paramValues: params }, {
          signal: ctrl && ctrl.signal,
          onProgress: (info) => setStatus('Solving the real system… ' + info.basis + ' generators, ' + info.pairs + ' pairs left'),
        }).then((r) => {
        _abort = null; setBusy(false); setStatus('');
        if (r.aborted) { toast('Cancelled'); return; }
        if (!r.ok) { showError('Univalence: ' + withGuidance(r.reason || 'solve failed')); return; }
        const real = (r.solutions || []).filter((s) => Object.keys(s).every((k) => Math.abs(s[k].im) < 1e-4));
        if (!real.length) {
          // The explicit solver returned no real solutions. If the CERTIFIED Hermite count
          // (cl.realCount, an INDEPENDENT method) says there ARE some, the numeric solve
          // missed them all (a clustered/non-radical cluster it couldn't separate) — that is
          // a PARTIAL result, NOT a "no real QD" verdict. Only claim no QD when both agree.
          const v = ((cl.realCount != null && cl.realCount > 0)
            ? '⚠ PARTIAL: ' + cl.realCount + ' certified real solution' + (cl.realCount === 1 ? '' : 's') + ', but the numeric solver separated none (clustered / non-radical) — use the CAS bridge for coordinates.'
            : 'No real quadrature domain' + (cl.complexCount != null ? ' (of ' + cl.complexCount + ' distinct complex)' : '') + '.') + sliceCaveat(cl);
          setStatus(v); if (canvas) canvas.setVerdict({ text: v, assumptions: specializationLedger(cl) }); toast(v, { kind: 'error' }); return;
        }
        const hData = activeEnv.hData;
        let folded = 0, selfInt = 0, unrec = 0; const rows = []; const genuinePhis = [];
        real.forEach((sol, idx) => {
          const phi = phiFromAlgebraSolution(sol, hData);
          if (!phi) { unrec++; rows.push('#' + (idx + 1) + ': φ not reconstructable (map variables eliminated — run on the seeded system)'); return; }
          // Local fold test: EXACT Schur–Cohn on num(φ′) when non-degenerate; honest numeric
          // fallback (findCriticalPoints) on a singular/self-inversive matrix or when unavailable.
          let fold = false, exact = false, cusps = 0;
          const scf = schurCohnFold(sol, hData);
          // Exact-usable when the (post-A) count is trustworthy: non-degenerate, the clean
          // self-inversive case, OR a resolved cusp (degenerate but resolved). inside>0 ⇒ fold;
          // onCircle = the boundary cusp count (an ALLOWED degeneracy — see the boundary test).
          if (scf && (!scf.degenerate || scf.resolved)) { fold = scf.inside > 0; cusps = scf.onCircle || 0; exact = true; }
          else { try { const crit = (typeof QD.findCriticalPoints === 'function') ? QD.findCriticalPoints(phi, {}) : null; fold = !!(crit && crit.points && crit.points.some((p) => p.inDomain)); } catch (e) { /* treat as no fold */ } }
          const tag = exact ? 'Schur–Cohn' : 'numeric';
          // Boundary test: EXACT real circle double-point count when φ′≠0 strictly INSIDE 𝔻
          // (exact && !fold); the diagonal cusp solutions are subtracted (simple ⟺ count===cusps),
          // so a cusped boundary (the cardioid) still certifies SIMPLE. Else numeric fallback.
          let simple = true, simpleExact = false;
          if (exact && !fold) { const bs = boundarySimpleExact(sol, hData, cusps); if (bs) { simple = bs.simple; simpleExact = true; } }
          if (!simpleExact) { try { simple = QD.isBoundaryUnivalent(phi, 360); } catch (e) { simple = true; } }
          const bTag = simpleExact ? 'real-count' : 'numeric';
          if (fold) { folded++; rows.push('#' + (idx + 1) + ': φ′ = 0 inside 𝔻 (fold, ' + tag + ') — not univalent'); }
          else if (!simple) { selfInt++; rows.push('#' + (idx + 1) + ': boundary φ(∂𝔻) self-intersects (' + bTag + ') — not univalent'); }
          else {
            genuinePhis.push(phi);
            const cuspNote = (cusps > 0) ? ' — boundary cusp ×' + cusps : '';
            rows.push('#' + (idx + 1) + ': univalent ✓ — genuine quadrature domain' + cuspNote +
              (exact && simpleExact ? ' (Schur–Cohn + real-count certified)' : (exact ? ' (φ′≠0 in 𝔻 certified)' : '')));
          }
        });
        // 3) GAUGE QUOTIENT: genuine solutions related by a disk rotation are the SAME domain.
        const distinct = [];
        genuinePhis.forEach((phi) => { if (!distinct.some((d) => typeof QD.sameDomain === 'function' && QD.sameDomain(d, phi))) distinct.push(phi); });
        const D = distinct.length, gaugeMerged = genuinePhis.length - D;
        // 4) UNIFIED VERDICT.
        const bits = [];
        if (gaugeMerged > 0) bits.push(gaugeMerged + ' gauge/rotation ' + (gaugeMerged === 1 ? 'copy' : 'copies') + ' merged');
        const rej = [folded ? folded + ' fold' : '', selfInt ? selfInt + ' self-intersecting' : '', unrec ? unrec + ' unreconstructable' : ''].filter(Boolean).join(', ');
        if (rej) bits.push(rej + ' rejected');
        const tail = bits.length ? ' (' + bits.join('; ') + ')' : '';
        // REAL-COUNT SELF-CHECKING ORACLE. Reconcile the explicit numeric solver (real,
        // from solveRealAsync — whose eigenvalue fallback silently DROPS a coincident-
        // projection cluster it can't separate) against the CERTIFIED Hermite distinct-real
        // count (cl.realCount, from classifyAsync — an independent trace-form method). Prefer
        // the certified count as the authoritative denominator, and flag PARTIAL when the
        // explicit solver UNDERCOUNTED so a MISSED quadrature domain never reads as a clean
        // verdict. (complete:false alone is NOT enough — it also fires on any non-radical
        // ideal whose every distinct solution WAS found, which is not a miss.)
        const Sym = QD && QD.Sym;
        const rec = (Sym && typeof Sym.reconcileRealCount === 'function')
          ? Sym.reconcileRealCount(cl.realCount, real, r.complete)
          : { nReal: real.length, foundDistinct: real.length, certReal: (cl.realCount != null ? cl.realCount : null), partial: false, disagree: false, reason: '' };
        const nReal = rec.nReal, plur = nReal === 1 ? '' : 's';
        const undercount = rec.reason === 'undercount';
        let verdict;
        if (D === 0) verdict = (undercount
          ? 'No genuine quadrature domain among the ' + rec.foundDistinct + ' separable of ' + nReal + ' real solution' + plur + ' (none univalent)'
          : 'No genuine quadrature domain: ' + nReal + ' real algebraic solution' + plur + ', none univalent') + tail + '.';
        else if (D === 1) verdict = (undercount
          ? 'At least 1 genuine quadrature domain — 1 of ' + rec.foundDistinct + ' separable of ' + nReal + ' real solution' + plur
          : 'Unique quadrature domain ✓ — 1 genuine QD of ' + nReal + ' real solution' + plur) + tail + '.';
        else verdict = (undercount
          ? 'At least ' + D + ' distinct quadrature domains of ' + nReal + ' real solution' + plur
          : D + ' distinct quadrature domains of ' + nReal + ' real solution' + plur) + tail + '.';
        // PARTIAL / disagreement note — the clustered-eigen undercount the raw solver hides.
        let partialNote = '';
        if (undercount) partialNote = ' · ⚠ PARTIAL: the numeric solver separated only ' + rec.foundDistinct + ' of ' + rec.certReal + ' certified real solution' + (rec.certReal === 1 ? '' : 's') + ' (clustered / non-radical) — the genuine-QD count is a LOWER BOUND';
        else if (rec.disagree) partialNote = ' · ⚠ cross-check: the numeric solver returned ' + rec.foundDistinct + ' distinct real solutions vs the certified ' + rec.certReal + ' — treat the count as approximate';
        else if (rec.partial) partialNote = ' · ⚠ PARTIAL: clustered / near-multiple roots — some real solutions may be missing';
        // 5) NUMERIC CROSS-CHECK (#4): the reconstructed QDs must satisfy the ORIGINAL generated
        // system (reduction integrity) and agree with the independent numeric solver (oracle).
        const cc = crossCheckPhis(distinct, hData);
        let bad = !D || !!rec.partial;
        if (cc.checked) {
          if (cc.maxResidual < 1e-4 && cc.oracleMatch) verdict += ' · cross-check ✓ (residual ' + cc.maxResidual.toExponential(1) + '; matches the numeric solver)';
          else { bad = true; const why = cc.maxResidual >= 1e-4 ? ('residual ' + cc.maxResidual.toExponential(1) + ' ≫ 0 — the reduction chain may be unsound') : 'no match to the numeric solver'; verdict += ' · ⚠ cross-check: ' + why; }
        }
        if (partialNote) verdict += partialNote;
        // Honest labeling: even a certified count is only the count ON the active slice (if any).
        verdict += sliceCaveat(cl);
        setStatus(verdict);
        // #1 (roadmap ALGEBRA_EXTENSIONS): a one-click EXACT boundary curve for a genuine QD.
        // QE.boundaryCurveFromPhi eliminates the disk parameter to give Q(w,w̄)=0 + the Schwarz
        // function S(w) — exact over ℚ(i) for the rationalized solution (the honest "=" boundary
        // polynomial the geometry tab only shows numerically).
        const vActions = [];
        if (D >= 1 && QE && typeof QE.boundaryCurveFromPhi === 'function') {
          vActions.push({
            label: 'Show exact boundary curve',
            title: 'Eliminate the disk parameter to get the exact algebraic boundary curve Q(w,w̄)=0 and, when single-valued, the Schwarz function S(w) of the reconstructed quadrature domain (exact over ℚ(i) for the rationalized solution).',
            onClick: () => {
              let bc; try { bc = QE.boundaryCurveFromPhi(distinct[0]); }
              catch (e) { toast('Boundary curve: ' + ((e && e.message) || e), { kind: 'error' }); return; }
              const latex = [bc.latexQ]; if (bc.latexS) latex.push(bc.latexS);
              // #3: a thumbnail of the reconstructed domain φ(∂𝔻) alongside the exact curve.
              let plot = null; try { plot = (QD && typeof QD.evalPhi === 'function') ? domainPlotData(distinct[0], QD.evalPhi) : null; } catch (e) { plot = null; }
              const note = ' · exact boundary curve Q(w,w̄)=0 (over ℚ(i), rationalized solution; order ' + bc.order +
                (bc.schwarz ? ', Schwarz function S(w) single-valued' : '; Schwarz function algebraic of degree ' + bc.degWb) + ')';
              if (canvas) canvas.setVerdict({ text: verdict + note, solutionsLatex: latex, plot, solutionsText: rows.join('\n'), assumptions: specializationLedger(cl), actions: vActions });
            },
          });
        }
        if (canvas) canvas.setVerdict({ text: verdict, solutionsText: rows.join('\n'), assumptions: specializationLedger(cl), actions: vActions });
        toast(verdict, bad ? { kind: 'error' } : {});
        });   // solveRealAsync.then
      });     // classifyAsync.then
    }
    // Numeric cross-check of reconstructed quadrature-domain maps against two independent
    // oracles (#4): (1) reduction integrity — each φ must satisfy the FRESHLY-regenerated
    // original conjugate-model system (QE.residualAtSolution ≈ 0; a large residual ⇒ the
    // reduce/solve/reconstruct chain is unsound); (2) independent-solver agreement — some φ
    // matches the numeric inverse solver's map (activeEnv.primary.phi) up to the rotation gauge
    // (QD.sameDomain). Cheap (polynomial evaluation, no Gröbner), read-only. Returns
    // { checked, maxResidual, oracleMatch }; checked=false when nothing is reconstructable.
    function crossCheckPhis(phis, hData) {
      if (!phis || !phis.length || !QE || typeof QE.residualAtSolution !== 'function') return { checked: false, maxResidual: 0, oracleMatch: false };
      const w0cb = $('#alg-w0-fix'), fixW0 = !w0cb || w0cb.checked;
      const w0Sel = fixW0 ? (activeEnv && (activeEnv.w0Used || (activeEnv.primary && activeEnv.primary.phi && activeEnv.primary.phi.w0))) : undefined;
      let system; try { system = QE.generateClassicalBounded(hData, { maxPoleOrder: lastCap, w0: w0Sel }); } catch (e) { return { checked: false, maxResidual: 0, oracleMatch: false }; }
      let maxResidual = 0;
      for (const phi of phis) { try { const r = QE.residualAtSolution(system, phi, hData); if (r && r.max > maxResidual) maxResidual = r.max; } catch (e) { /* skip */ } }
      const numPhi = activeEnv && activeEnv.primary && activeEnv.primary.phi;
      const oracleMatch = !!(numPhi && typeof QD.sameDomain === 'function' && phis.some((p) => { try { return QD.sameDomain(p, numPhi); } catch (e) { return false; } }));
      return { checked: true, maxResidual, oracleMatch };
    }

    // Friendly label for a reim variable name (A1_1__re → "A1,1 (Re)").
    function friendlyReim(name) {
      const m = /^(.*)__(re|im)$/.exec(name);
      return m ? latexPlain(m[1]) + (m[2] === 're' ? ' (Re)' : ' (Im)') : latexPlain(name);
    }
    // Make a reim-system LaTeX string KaTeX-safe: the reim variable names (A1_1__re / z1__im) have a
    // DOUBLE underscore that KaTeX rejects (double subscript). Render each as a braced clean symbol
    // with a Re/Im superscript, so a trailing power (…^{k} from toLatex) applies to the whole token.
    function reimSafeLatex(tex) {
      if (!tex) return tex;
      return String(tex).replace(/([A-Za-z][A-Za-z0-9]*(?:_\d+)*)__(re|im)/g,
        (m, base, ri) => '{' + latexOf(base) + '^{\\mathrm{' + ri + '}}}');
    }
    // Repopulate the resolvent variable picker from the current column's reim variables.
    function refreshResolventVars() {
      const sel = $('#alg-resolvent-var'); if (!sel) return;
      let vars = []; try { vars = store.reimVariables(null, { paramValues: hDataParamValues() }) || []; } catch (e) { /* none */ }
      const prev = sel.value;
      sel.innerHTML = vars.map((v) => '<option value="' + v + '">' + friendlyReim(v) + '</option>').join('');
      if (vars.indexOf(prev) !== -1) sel.value = prev;
    }
    // The univariate RESOLVENT χ_v of the current system in a chosen real variable: det(x·I−M_v),
    // the char poly of multiplication-by-v on the quotient ring (store.resolventOf → Sym.resolvent).
    // Roots = v's values across the solutions; a repeated root (discriminant 0) ⇒ coincident
    // solutions / a degeneracy (e.g. a cusp). Surfaces the degree / distinct-vs-multiplicity count
    // + the degeneracy verdict; the polynomial (LaTeX) goes to the verdict card detail.
    function doResolvent() {
      if (_abort) return;
      if (!ensureSeed()) return;
      clearError();
      refreshResolventVars();
      const sel = $('#alg-resolvent-var'); const v = sel && sel.value;
      if (!v) { showError('Resolvent: no real variable available — reduce to a finite (reality-assumed) system first.'); return; }
      const ctrl = _newAbort(); _abort = ctrl;   // coherent busy state (guards re-entry / inspector mutations)
      setBusy(true, 'Computing the resolvent…');
      setTimeout(() => {
        let r; try { r = store.resolventOf(null, v, { paramValues: hDataParamValues() }); }
        catch (e) { r = { ok: false, reason: (e && e.message) || String(e) }; }
        _abort = null; setBusy(false); setStatus('');
        if (!r.ok) { showError('Resolvent: ' + withGuidance(r.reason || 'unavailable')); return; }
        const fv = friendlyReim(r.variable);
        const distWord = r.distinct === 1 ? 'value' : 'values';
        const degLine = 'degree ' + r.degree + ' — ' + r.distinct + ' distinct ' + distWord + (r.multiplicity > r.distinct ? ' (' + r.multiplicity + ' with multiplicity)' : '');
        const degenLine = r.degenerate
          ? 'discriminant = 0 ⇒ DEGENERATE (coincident solutions / cusp)'
          : 'discriminant ≠ 0 ⇒ simple roots (no degeneracy in ' + fv + ')';
        const text = 'Resolvent χ in ' + fv + ': ' + degLine + '. ' + degenLine + '.';
        // The resolvent / square-free / discriminant are LaTeX — render them as KaTeX (solutionsLatex),
        // not as plain solutionsText (the canvas shows solutionsText as <pre> textContent → raw LaTeX leak).
        const mathLatex = ['\\chi = ' + reimSafeLatex(r.latex), '\\text{square-free} = ' + reimSafeLatex(r.squareFreeLatex)];
        if (r.discLatex) mathLatex.push('\\operatorname{disc} = ' + reimSafeLatex(r.discLatex));
        setStatus(text);
        if (canvas) canvas.setVerdict({ text, solutionsLatex: mathLatex });
        toast(text, r.degenerate ? { kind: 'error' } : {});
      }, 20);
    }

    // Report the dimension / solution count of the current equality system, off the
    // main thread (falls back to sync) so a heavy grevlex basis can't freeze the UI.
    function doDimension() {
      if (_abort) return;
      if (!ensureSeed()) return;
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
      if (!ensureSeed()) return;
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
        // The eigenvalue fallback can return a PARTIAL set on clustered/near-multiple roots.
        const partial = r.complete === false ? ' — PARTIAL: clustered roots, some solutions may be missing' : '';
        // C4: report how many complex solutions the active assumptions filtered out.
        const pruned = r.prunedByAssumptions ? ' (' + r.prunedByAssumptions + ' dropped by active assumptions)' : '';
        toast('Solved: ' + r.solutions.length + ' solution(s)' + pruned + ' (dimension ' + r.dimension + ')' + partial + '. See console for coordinates.',
          partial ? { kind: 'error' } : {});
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
      const p = plainVar(name);                        // A/C/z/a/w0 conjugate-model families (shared scheme)
      if (p != null) return p;
      // non-scheme: the constraint ζ (Z / Zb / Z1 / …) + a first-underscore → comma for the rest
      return name.replace(/^Zb/, 'ζ̄').replace(/^Z/, 'ζ').replace('_', ',');
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
    // E1 — load a downloaded DAG JSON and rebuild the whole workspace (store.importDAG).
    // Replaces the current graph (undoable). Resets stale picker/selection state, like a re-seed.
    function importJson(ev) {
      if (busyGuard()) { ev.target.value = ''; return; }
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';                      // allow re-loading the same file later
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let data; try { data = JSON.parse(reader.result); } catch (e) { showError('Load DAG: not valid JSON — ' + ((e && e.message) || '')); return; }
        const r = store.importDAG(data);
        if (!r || !r.ok) { showError('Load DAG: ' + withGuidance((r && r.reason) || 'import failed')); return; }
        if (canvas) canvas.clearSelection();
        clearError(); rerender(); refreshPickers();
        toast('Loaded ' + r.nodes + ' node(s) across ' + r.tracks + ' branch' + (r.tracks === 1 ? '' : 'es'));
      };
      reader.onerror = () => showError('Load DAG: could not read the file');
      reader.readAsText(file);
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
    // E3 — literate LaTeX derivation: the ACTIVE branch as a sequence of `align` blocks, one
    // per column, each preceded by a comment naming the transition that produced it (the same
    // provenance the column header / edge labels show), with the active hypotheses as a preamble.
    // A reproducible, paper-ready transcript of the reduction. Copied to the clipboard.
    function alignRel(rel) { return rel === '>' ? '&> 0' : rel === '≠' ? '&\\neq 0' : '&= 0'; }
    function latexDerivation() {
      const at = store.activeTrack;
      const real = store.realVars || [], imag = store.imagVars || [];
      const known = (store.knownValues && store.knownValues()) || {};
      const pinned = Object.keys(known).filter((k) => k !== 'w0');
      const head = ['% QD Algebra derivation — branch "' + trackLabelOf(at) + '"' +
        (store.formulation === 'schwarz' ? ' (Schwarz formulation)' : '')];
      const hyp = [];
      if (real.length) hyp.push('real ' + real.map(latexPlain).join(', '));
      if (imag.length) hyp.push('imaginary ' + imag.map(latexPlain).join(', '));
      if (store.w0Fixed) hyp.push('\\varphi(0)=' + _fmtComplex(known.w0));
      if (pinned.length) hyp.push('pinned ' + pinned.map((k) => latexPlain(k) + '=' + _fmtComplex(known[k])).join(', '));
      if (hyp.length) head.push('% Active hypotheses: ' + hyp.join('; '));
      const out = [head.join('\n')];
      store.columns().forEach((c) => {
        const ns = store.list().filter((n) => (n.track || 't0') === at && n.column === c.index);
        if (!ns.length) return;
        const label = columnLabel(c.index, ns).replace(/^↳\s*/, '');
        const eqs = ns.sort((p, q) => store.orderOf(p.id) - store.orderOf(q.id))
          .map((n) => '  ' + n.poly.toLatex(latexOf) + ' ' + alignRel(n.rel) + ' \\\\');
        out.push('% Step ' + (c.index + 1) + ' — ' + label + '  (' + c.eqCount + ' eqn, ' + c.varCount + ' var)\n' +
          '\\begin{align}\n' + eqs.join('\n') + '\n\\end{align}');
      });
      return out.join('\n\n');
    }
    function copyLatexDerivation() {
      if (!store.size) { toast('Nothing to export — seed or load a system first.', { kind: 'error' }); return; }
      writeClipboard(latexDerivation(), 'LaTeX derivation');
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
    // A substitute provenance lists one or more (name = value) assignments. New records
    // carry a `variables` array ([{name, value, conjugate}]); older snapshots carried a
    // single `variable`/`value` pair — render either.
    function substList(prov) {
      const vs = prov.variables || (prov.variable ? [{ name: prov.variable, value: prov.value }] : []);
      return vs.map((v) => latexPlain(v.name) + ' = ' + valStr(v.value)).join(', ');
    }
    function provText(prov) {
      if (!prov) return '';
      const d = PROV_UI[prov.op];                                  // op → its .text (registry, near installAlgebra)
      return (d && d.text) ? d.text(prov, { latexPlain, substList, ratioStrRec, valStr }) : (prov.op || '');
    }
    // The per-column LABEL (the relationship to the previous column): column 0 is the
    // original system; each later column is phrased as the transformation that derived it.
    function columnLabel(c, ns) {
      if (c === 0) return 'Original system' + (store.formulation === 'schwarz' ? ' (Schwarz formulation)' : '') +
        (store.w0Fixed ? ' · φ(0) fixed' : '');
      const rep = (ns || []).find((n) => n.provenance && n.provenance.op !== 'conjugate' && n.provenance.op !== 'propagate') || (ns || [])[0];
      const p = (rep && rep.provenance) || {};
      const d = PROV_UI[p.op];                                     // op → its .column label (registry)
      return (d && d.column) ? d.column(p, { latexPlain, substList, ratioStrRec, valStr, ns, c }) : ('↳ column ' + c);
    }
    // Structured column-header data for the canvas lane headers: step badge, the
    // transition label (relationship to the previous column), a stats line with the Δ in
    // variable count vs the previous column, and whether this is the CURRENT system.
    function columnInfo(c, ns) {
      const st = store.columnStats(c);
      let stats = st.eqCount + ' eqn' + (st.eqCount === 1 ? '' : 's') + ' · ' + st.varCount + ' var' + (st.varCount === 1 ? '' : 's');
      if (c > 0) {
        const prev = store.columnStats(c - 1);
        const d = st.varCount - prev.varCount;
        if (d !== 0) stats += '  (' + (d > 0 ? '+' : '−') + Math.abs(d) + ' var' + (Math.abs(d) === 1 ? '' : 's') + ')';
      }
      return { step: String(c + 1), label: columnLabel(c, ns), stats, isCurrent: c === store.maxColumn() };
    }
    // B3 — a terse operation label for a derivation edge (drawn on the arrow + as its hover
    // title by the canvas). Describes the transformation that produced the TARGET node;
    // reuses the provenance the column header / node title already render, compacted.
    function edgeLabel(edge) {
      const to = store.get(edge.to); if (!to) return null;
      const p = to.provenance; if (!p) return null;
      const d = PROV_UI[p.op];                                     // op → its .edge label (registry)
      return (d && d.edge) ? d.edge(p, { latexPlain }) : (p.op || null);
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
        onSelect: renderInspector,
        onCopy: copyNodeLatex,
        onMove: (id, dir) => { if (store.moveNode(id, dir)) rerender(); },
        titleOf: nodeTitle,
        colInfo: columnInfo,
        edgeLabelOf: edgeLabel,
        onSeed: seedFromCurrent,
      });
      buildToolbar(surface);
      breadcrumb = document.createElement('div'); breadcrumb.className = 'algebra-breadcrumb';
      surface.appendChild(breadcrumb);
      trackbar = document.createElement('div'); trackbar.className = 'algebra-trackbar hidden';
      surface.appendChild(trackbar);
      // Keyboard a11y (active only while the Algebra tab is visible, and not while typing in
      // a field): Esc clears the selection; Delete/Backspace deletes a single selected node.
      document.addEventListener('keydown', (ev) => {
        if (!surface || surface.classList.contains('hidden')) return;
        const ae = document.activeElement;
        if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;
        const sel = canvas ? canvas.getSelection() : [];
        if (ev.key === 'Escape') { if (sel.length && canvas) { canvas.clearSelection(); ev.preventDefault(); } }
        else if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel.length === 1) {
          if (busyGuard()) return;
          const removed = store.deleteNode(sel[0]); if (canvas) canvas.clearSelection(); rerender();
          toast('Deleted ' + ((removed && removed.length) || 1) + ' node(s)'); ev.preventDefault();
        }
      });
    }
    // The reduction breadcrumb: a clickable chip per column (① original → ↳ assume real → …)
    // floating over the top of the graph. Clicking a chip scrolls that lane into view and
    // pulses it. Rebuilt on every rerender (columns change). The last chip = current system.
    function buildBreadcrumb() {
      if (!breadcrumb) return;
      breadcrumb.innerHTML = '';
      if (!store.size) { breadcrumb.classList.add('hidden'); return; }
      breadcrumb.classList.remove('hidden');
      const cols = store.columns();
      const mx = store.maxColumn();
      const at = store.activeTrack;
      cols.forEach((c, i) => {
        if (i > 0) { const arr = document.createElement('span'); arr.className = 'algebra-bc-sep'; arr.textContent = '→'; breadcrumb.appendChild(arr); }
        const info = columnInfo(c.index, store.list().filter((n) => (n.track || 't0') === at && n.column === c.index));
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'algebra-bc-chip' + (c.index === mx ? ' is-current' : '');
        chip.textContent = info.step + (c.index === 0 ? ' original' : ' ' + (info.label || '').replace(/^↳\s*/, ''));
        chip.title = info.label + '  ·  ' + info.stats;
        chip.addEventListener('click', () => { if (canvas && canvas.scrollToColumn) canvas.scrollToColumn(c.index); });
        breadcrumb.appendChild(chip);
      });
    }
    // ---- parallel derivation branches (tracks, A2) --------------------------
    // The track switcher rail (top-left over the graph): one chip per branch in
    // store.tracks(). The ACTIVE branch is highlighted; the canvas renders only that
    // branch's lanes, so clicking another chip (a view change — not undoable on its own)
    // swaps which derivation is on screen. A non-main branch carries an × to delete it
    // (store refuses 't0' and any branch with children). The trailing "＋ Fork" button
    // forks the active branch at its current/last column into a fresh parallel track.
    // Rebuilt on every rerender; shown whenever a system exists.
    function trackLabelOf(id) { const t = store.tracks().find((x) => x.id === id); return t ? t.label : id; }
    function buildTrackBar() {
      if (!trackbar) return;
      trackbar.innerHTML = '';
      if (!store.size) { trackbar.classList.add('hidden'); return; }
      trackbar.classList.remove('hidden');
      const active = store.activeTrack;
      const lbl = document.createElement('span'); lbl.className = 'algebra-track-lbl'; lbl.textContent = 'branches';
      trackbar.appendChild(lbl);
      store.tracks().forEach((t) => {
        const chip = document.createElement('span');
        chip.className = 'algebra-track-chip' + (t.id === active ? ' is-current' : '');
        const name = document.createElement('button');
        name.type = 'button'; name.className = 'algebra-track-name'; name.textContent = t.label;
        name.title = t.parentId
          ? ('forked from ' + (trackLabelOf(t.parentId) || t.parentId) + ' at column ' + (t.forkColumn != null ? t.forkColumn : '?') + (t.id === active ? ' · current branch' : ' · click to view'))
          : 'the original derivation' + (t.id === active ? ' · current branch' : ' · click to view');
        if (t.id !== active) name.addEventListener('click', () => switchTrack(t.id));
        chip.appendChild(name);
        // A6: existence/uniqueness verdict badge — shown only while the cached result still
        // matches the branch's current last column (the signature), so it greys out when stale.
        const cached = _trackVerdict.get(t.id);
        if (cached && cached.badge && cached.sig === _branchSig(t.id)) {
          const vb = document.createElement('span');
          vb.className = 'algebra-track-verdict v-' + (cached.state || 'unknown');
          vb.textContent = cached.badge; vb.title = cached.title || '';
          chip.appendChild(vb);
        }
        if (t.id !== 't0') {
          const x = document.createElement('button');
          x.type = 'button'; x.className = 'algebra-track-x'; x.textContent = '×';
          x.title = 'Delete this branch (and its derivation)';
          x.addEventListener('click', (ev) => { ev.stopPropagation(); deleteBranch(t.id); });
          chip.appendChild(x);
        }
        trackbar.appendChild(chip);
      });
      const fork = document.createElement('button');
      fork.type = 'button'; fork.className = 'algebra-track-fork'; fork.textContent = '＋ Fork';
      fork.title = 'Fork the current system into a new parallel branch — explore a different line of assumptions without disturbing this one';
      fork.addEventListener('click', () => doFork(store.maxColumn()));
      trackbar.appendChild(fork);
      if (store.tracks().length > 1) {
        const vbtn = document.createElement('button');
        vbtn.type = 'button'; vbtn.className = 'algebra-track-verdicts'; vbtn.textContent = '⟳ verdicts';
        vbtn.title = 'Classify every branch (existence / uniqueness via the certified real-solution count) and show each verdict on its chip';
        vbtn.addEventListener('click', classifyAllBranches);
        trackbar.appendChild(vbtn);
      }
    }
    // A6: per-branch verdict chips. Helpers + the "classify all branches" action.
    function _lastColIds(tid) { return store.orderedColumn(store.maxColumn(tid), tid).map((n) => n.id); }
    // Cheap content signature of a branch's CURRENT last column — changes whenever the system
    // changes (a new reduction, fork, undo), so a cached verdict is shown only while still valid.
    function _branchSig(tid) { return store.maxColumn(tid) + '|' + _lastColIds(tid).join(','); }
    // Map a classify result → a compact chip badge { badge, state, title }.
    function _verdictBadge(r) {
      if (!r || r.aborted) return null;
      if (!r.ok) return { badge: '?', state: 'unknown', title: r.reason || 'classify unavailable' };
      // Specialization suffix: a factor CASE and/or a reality/imaginary SLICE (both resolved for THIS
      // branch by the store) narrow the count. Fold both into the tooltip and mark the badge with '*'
      // so a slice/branch count on a chip never reads as the general QD count (honest labeling).
      const notes = [];
      if (r.partialBranch) notes.push('case ' + ((r.caseIndex || 0) + 1) + '/' + r.caseCount + ' of a factor split');
      const sl = sliceLabels(r);
      if (sl.length) notes.push('on the ' + sl.join(' + ') + ' only — a LOWER BOUND; off-slice QDs not counted');
      const tail = notes.length ? ' [' + notes.join('; ') + ']' : '';
      const star = sl.length ? '*' : '';
      if (r.inconsistent) return { badge: '∅' + star, state: 'none', title: 'no QD — system inconsistent (1 ∈ I)' + tail };
      if (!r.zeroDim) return { badge: '∞' + star, state: 'open', title: 'positive-dimensional family (' + r.numVars + ' real variables)' + tail };
      if (r.realCount == null) return { badge: 'fin' + star, state: 'unknown', title: r.multiplicity + ' complex solution(s); real count over the cap' + tail };
      if (r.realCount === 0) return { badge: '0 QD' + star, state: 'none', title: 'no real quadrature domain' + tail };
      if (r.realCount === 1) return { badge: '✓ 1 QD' + star, state: 'unique', title: 'unique real quadrature domain' + tail };
      return { badge: r.realCount + ' QD' + star, state: 'multi', title: r.realCount + ' real algebraic solutions' + tail };
    }
    // Cache the active branch's verdict from a single-branch classify (doClassify) so its chip
    // updates too — only when the whole last column was analyzed (no node sub-selection).
    function cacheActiveVerdict(r) {
      const b = _verdictBadge(r); if (!b) return;
      _trackVerdict.set(store.activeTrack, Object.assign({ sig: _branchSig(store.activeTrack) }, b));
      buildTrackBar();
    }
    // Classify EVERY branch (sequential — one worker job at a time) and stamp each chip's
    // verdict. Cancellable + busy-locked like the other worker ops; progressive chip updates.
    async function classifyAllBranches() {
      if (busyGuard()) return;
      if (!store.size) return;
      const params = hDataParamValues();
      const tlist = store.tracks();
      const ctrl = _newAbort(); _abort = ctrl;
      setBusy(true, 'Classifying ' + tlist.length + ' branch' + (tlist.length === 1 ? '' : 'es') + '…');
      let done = 0;
      try {
        for (const t of tlist) {
          if (ctrl && ctrl.signal && ctrl.signal.aborted) break;
          const ids = _lastColIds(t.id), sig = _branchSig(t.id);
          let r;
          try {
            r = await store.classifyAsync(ids, { paramValues: params }, {
              signal: ctrl && ctrl.signal,
              onProgress: (info) => setStatus(t.label + '… ' + info.basis + ' generators, ' + info.pairs + ' pairs left'),
            });
          } catch (e) { r = { ok: false, reason: (e && e.message) || String(e) }; }
          if (r && r.aborted) break;
          _trackVerdict.set(t.id, Object.assign({ sig }, _verdictBadge(r) || { badge: '?', state: 'unknown', title: 'unavailable' }));
          done++; buildTrackBar();
        }
      } finally { _abort = null; setBusy(false); setStatus(''); }
      toast(done ? ('Updated ' + done + ' branch verdict' + (done === 1 ? '' : 's')) : 'Cancelled');
    }
    // Switch the on-screen branch (a view change — clears the selection, which may point
    // at off-branch nodes, then rerenders the now-active branch's lanes).
    function switchTrack(id) {
      if (busyGuard()) return;
      if (!store.setActiveTrack(id)) return;
      if (canvas) canvas.clearSelection();
      rerender(); refreshPickers();
      toast('Viewing ' + trackLabelOf(id));
    }
    // Fork the active branch at `fromColumn` into a new parallel track (deep-copies the
    // column as the new branch's column 0, makes it active). Undoable. Clears the
    // selection so the inspector doesn't dangle on a now-off-screen node.
    function doFork(fromColumn) {
      if (busyGuard()) return;
      const r = store.forkTrack({ fromTrack: store.activeTrack, fromColumn: fromColumn, label: 'branch ' + store.tracks().length });
      if (!r || !r.ok) { toast((r && r.reason) || 'could not fork', { kind: 'error' }); return; }
      if (canvas) canvas.clearSelection();
      rerender(); refreshPickers();
      toast('Forked ' + trackLabelOf(r.track) + ' from column ' + fromColumn);
    }
    // Delete a non-main branch (store refuses 't0' / branches with children, surfaced as a toast).
    function deleteBranch(id) {
      if (busyGuard()) return;
      const r = store.deleteTrack(id);
      if (!r || !r.ok) { toast((r && r.reason) || 'could not delete this branch', { kind: 'error' }); return; }
      if (canvas) canvas.clearSelection();
      rerender(); refreshPickers();
      toast('Deleted branch');
    }
    // Floating view/history toolbar over the graph (node-editor pattern): zoom, fit,
    // expand/collapse-all, undo/redo. Appended AFTER canvas.create (which clears the
    // container once), so it persists across re-renders. Undo/Redo keep the alg-undo/
    // alg-redo ids so the busy-lock (setBusy) still disables them during a worker op.
    function buildToolbar(host) {
      const bar = document.createElement('div'); bar.className = 'algebra-toolbar';
      const zlabel = document.createElement('span'); zlabel.className = 'algebra-toolbar-zoom';
      const setZ = (z) => { if (canvas) { _zoom = canvas.setZoom(z); zlabel.textContent = Math.round(_zoom * 100) + '%'; } };
      const btn = (glyph, title, fn, id) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'small algebra-tb-btn'; b.textContent = glyph; b.title = title;
        if (id) b.id = id; b.addEventListener('click', fn); return b;
      };
      bar.appendChild(btn('−', 'Zoom out (fit more columns)', () => setZ(_zoom / 1.15)));
      bar.appendChild(zlabel);
      bar.appendChild(btn('+', 'Zoom in', () => setZ(_zoom * 1.15)));
      bar.appendChild(btn('Fit', 'Reset zoom & scroll to the start', () => { if (canvas) { canvas.fit(); _zoom = 1; zlabel.textContent = '100%'; } }));
      bar.appendChild(btn('Fit ↔', 'Zoom so every column lane fits the width', () => { if (canvas && canvas.fitWidth) { _zoom = canvas.fitWidth(); zlabel.textContent = Math.round(_zoom * 100) + '%'; } }));
      bar.appendChild(btn('Expand', 'Expand every card to the full typeset form', () => { if (canvas) canvas.setAllCollapsed(false); }));
      bar.appendChild(btn('Collapse', 'Collapse every card to a one-line preview', () => { if (canvas) canvas.setAllCollapsed(true); }));
      const mapBtn = btn('▣ map', 'Toggle the DAG minimap (a bird\'s-eye of all lanes with a draggable viewport)', () => {
        if (!canvas) return; _minimapOn = canvas.setMinimap(!_minimapOn); mapBtn.classList.toggle('active', _minimapOn);
      });
      bar.appendChild(mapBtn);
      bar.appendChild(btn('↶', 'Undo', () => { if (store.undo()) rerender(); }, 'alg-undo'));
      bar.appendChild(btn('↷', 'Redo', () => { if (store.redo()) rerender(); }, 'alg-redo'));
      zlabel.textContent = Math.round(_zoom * 100) + '%';
      host.appendChild(bar);
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
          buildReference();   // the φ/h reference is always visible — keep it in sync
          refreshMmaColumns();
        }
      });
    }

    return { openWorkspace };
  }

  QD_UI.installAlgebra = installAlgebra;
  QD_UI.PROV_UI = PROV_UI;   // the UI-side provenance-op registry (testable + companion to the store's PROV_OPS)
})();
