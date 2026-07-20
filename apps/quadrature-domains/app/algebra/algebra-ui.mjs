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
// SIDEBAR is a NODE-EDITOR model (mountSidebar): a pinned header (✦ Prove as the single
// button.primary + a caption stating how it differs from ★ Auto-reduce, Generate, status, error),
// the φ/h reference, and collapsible <details> workflow sections — Assume / Pin values / Edit
// system / Reduce / Analyze / Shape from moments / Univalence constraints / Export. Their open
// state PERSISTS (wireSectionPersistence → localStorage): only "Assume" opened by default and
// nothing was remembered, so every reload re-shut two thirds of the working loop.
// A CONTEXTUAL INSPECTOR (renderInspector) shows the selection: 1 node → its equation + the
// nodeActions list; 2 nodes → the eliminate panel. It no longer HIDES the sections — they recede
// (`is-behind-inspector`) so inspecting an equation is not modal.
//   • nodeActions(id, box) is the single-node action list AS DATA, consumed by both the inspector
//     and the canvas right-click menu (openNodeMenu). Built inline once, it could not be offered
//     on the canvas without a second copy of the availability logic — and a duplicated list drifts.
//   • renderPolyCapped applies the canvas's DISPLAY_CAP in the sidebar too: without it, selecting a
//     post-Gröbner node typeset thousands of terms in display mode on the main thread.
// View/history live in the surface's toolbar ROW (buildToolbar: zoom/fit/fit-width/expand/collapse/
// minimap/node-search/undo/redo); the REDUCTION BREADCRUMB + trackbar live in the canvas's bottom
// rail (canvas.rail), not floating over the graph. Export covers DAG-JSON, LaTeX, and MATHEMATICA
// (a column, all columns, or one node). provText/columnLabel/edgeLabel render provenance.op from
// the PROV_UI registry (below) — the UI companion to the store's PROV_STORE; add a node type as one
// record in each (both coverage-tested). ⚠ columnLabel resolves a FORK before the `c === 0` case:
// forkTrack writes copies at column 0, so otherwise a branch five reductions deep claims to be the
// original system.
//
// WORKSPACE GUARANTEES (the review passes; see docs/algebra-review/WORKSPACE_REVIEW.md):
//   • Work survives — debounced autosave of store.exportDAG() to localStorage, a restore offer on
//     mount (which SUPPRESSES auto-seeding, since seeding would clear the thing being offered), and
//     a beforeunload warning only when the autosave could not take it.
//   • Mistakes are reversible — Ctrl/Cmd+Z / Shift+Z / Ctrl+Y, with undoDepth()/redoDepth() driving
//     the toolbar's disabled state and labels. The model always existed; only the surface was absent.
//   • Failures are legible — error toasts last 8s, are click-dismissible and carry a live-region
//     role (750ms was unreadable, and ~50 sites pass no duration).
//   • The proof narrates itself — stageReporter feeds ctx.onStage from the plan tables, whose ~20
//     {title, why} strings previously reached the user only inside a downloaded qd-proof.json.
//   • setStatus('') means "no transient message", not "nothing to say": it falls back to a standing
//     readout (baselineStatus), because ~23 sites clear it on completion.
//   • ✦ Prove CONFIRMS before re-seeding over a non-trivial derivation (confirmReplace).
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
import { domainPlotData, momentPlotData, rationalPlotData, trianglePlotData } from './domain-mini-plot.mjs';   // #3 + C1-ext-B + C2-4 + C3-4: reconstructed-domain thumbnail geometry
import * as PROVE from './prove-plan.mjs';   // the pure existence/uniqueness proof engine (fuller-orchestrator Phase A)
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
      // A fork's copied nodes are written at column 0 (forkTrack), so WITHOUT this the lane would
      // fall through to columnLabel's `c === 0` case and read "Original system" — asserting a
      // provenance it does not have, beside the parent's assumptions it actually inherited.
      column: (p, ctx) => '↳ forked from ' + ((ctx && ctx.trackLabelOf) ? ctx.trackLabelOf(p.fromTrack) : (p.fromTrack || '?')) + ' · column ' + (p.fromColumn != null ? p.fromColumn : '?'),
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
    saturate: {
      text:   (p) => 'saturate ⟨I⟩ : ' + (p.factor || '(1−z̄z)') + '^∞ — dropped the |z_j|=1 boundary stratum, of ' + (p.inputs || []).join(', '),
      column: (p) => '↳ saturate · ' + (p.factor || '(1−z̄z)'),
      edge:   () => 'saturate',
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
    // A variety split (minimalPrimes / regular chains), one level up from a factor split. Without a
    // record here the lane would fall back to a bare "↳ column N" and the graph would not say that
    // this column is ONE BRANCH of a union — the same thing the verdict ledger is careful to state.
    component: {
      text: (p) => p.carried
        ? 'carried through a component decomposition'
        : 'component ' + ((p.caseIndex || 0) + 1) + ' of ' + (p.caseCount || '?') + ' (V(I)=⋃V(componentᵢ))'
          + (p.complete === false ? ' — capped: the components may not cover V(I)' : ''),
      column: (p, { ns }) => {
        const cn = (ns || []).find((n) => n.provenance && n.provenance.op === 'component' && !n.provenance.carried);
        const cp = (cn && cn.provenance) || p;
        return '↳ component ' + ((cp.caseIndex || 0) + 1) + '/' + (cp.caseCount || '?')
          + (cp.method === 'regularChains' ? ' (regular chain)' : '')
          + (cp.complete === false ? ' ⚠ capped' : '');
      },
      edge: () => 'component',
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

  // ---- suggestion-list collapse (sidebar real estate) ----------------------
  // The auto-detected suggestion list is UNBOUNDED (one row per detected symmetry / abbreviation,
  // each a wrapped sentence + button), so past a couple of rows it collapses to a counted
  // <summary>. Measured motivation: a single order-1 pole already yields 7 rows ≈ 229px, and the
  // list used to live inside the `position: sticky` .algebra-head — which pinned 525px of a 720px
  // viewport and left ~195px for every workflow section below. See renderSuggestions.
  const AUTO_OPEN_MAX = 2;
  // "3 symmetries · 2 abbreviations suggested" — the collapsed <summary> label. Pure + unit-tested
  // (exposed as QD_UI.suggestSummaryLabel); vocabulary matches the Detect-symmetry / Auto-abbreviate
  // buttons. Either count may be 0, but not both (the caller hides the box when nothing is detected).
  function suggestSummaryLabel(nRel, nSub) {
    const parts = [];
    if (nRel) parts.push(nRel + ' symmetr' + (nRel === 1 ? 'y' : 'ies'));
    if (nSub) parts.push(nSub + ' abbreviation' + (nSub === 1 ? '' : 's'));
    return parts.join(' · ') + ' suggested';
  }
  // Should the list render expanded? `userPref` is the remembered explicit toggle (null = never
  // touched ⇒ auto: expand only a short list). An explicit choice WINS over the threshold in both
  // directions — re-rendering (every dismissal does) must not snap the list shut on a user who
  // opened it, nor re-open one they closed.
  function suggestAutoOpen(total, userPref) {
    return (userPref == null) ? (total <= AUTO_OPEN_MAX) : !!userPref;
  }

  // Does a stored result still describe the system in front of you? (P6b)
  //
  //   'current' — same branch, same frontier: it still describes what you are looking at.
  //   'stale'   — same branch, frontier moved: it described an EARLIER column of this derivation.
  //   'branch'  — another track entirely: it describes a DIFFERENT system, not an earlier one.
  //
  // The stale/branch distinction is not cosmetic. "The derivation has changed since" is true of
  // the first and false of the second — a cross-branch result has no history on the branch you
  // are viewing — and a result redisplayed beside a system it never saw, still wearing its
  // original '=' pill, is a false attribution (CLAUDE.md honest labeling). Pure and module-scope
  // so the decision that governs that labeling is unit-testable without a live DOM.
  function resultStateOf(entryTrack, entrySig, curTrack, curSig) {
    if (entryTrack !== curTrack) return 'branch';
    return entrySig === curSig ? 'current' : 'stale';
  }

  // Single-key accelerators → the button that already owns the action. This table is the
  // single source for BOTH the keydown handler and the `?` cheatsheet (algebraShortcutItems),
  // so a binding cannot exist undocumented and the cheatsheet cannot advertise a dead key.
  // Dispatching through the BUTTON is the point: every gate the click path carries (setBusy
  // disables it mid-worker; some stay disabled until a solve exists) lives on the button, so
  // a keystroke can never reach a state a click would refuse, and the gates stay in one place.
  // `reseeds` marks the ones that would DISCARD the derivation, which the handler confirms.
  // Module scope (not inside installAlgebra) so a unit test can read it without a live DOM.
  const KEY_ACTIONS = {
    s: { sel: '#alg-seed',        name: 'Seed from the current solve', reseeds: true },
    g: { sel: '#alg-groebner',    name: 'Gröbner basis of the current column' },
    p: { sel: '#alg-prove',       name: 'Prove existence & uniqueness' },
    e: { sel: '#alg-export-json', name: 'Download the derivation (JSON)' },
    l: { sel: '#alg-focus',       name: 'Focus on the selected equation’s lineage' },
  };
  // The `?` cheatsheet's Algebra section. ui-strings has advertised "Press ? for shortcuts"
  // all along, and `?` did open an overlay — listing three generic lines (?, Esc, and a
  // Param-slice binding) on every tab, none of them an Algebra binding. The workspace has ~14.
  // The action rows are generated from KEY_ACTIONS so the list and the handler cannot drift.
  function algebraShortcutItems() {
    const items = [];
    Object.keys(KEY_ACTIONS).forEach((k) => {
      items.push({ key: k, desc: KEY_ACTIONS[k].name, group: 'Algebra — actions' });
    });
    items.push({ key: 'f', desc: 'Fork a branch from the selected column', group: 'Algebra — actions' });
    items.push({ key: 'm', desc: 'Open the selected card’s action menu (also Shift+F10)', group: 'Algebra — actions' });
    [['←  →', 'Move between columns'],
     ['↑  ↓', 'Move within a column'],
     ['Home  End', 'Jump to the first / last column'],
     ['/', 'Search the equations'],
     ['Esc', 'Clear the selection (or close a menu)']]
      .forEach(([key, desc]) => items.push({ key, desc, group: 'Algebra — navigate' }));
    [['Ctrl+Z', 'Undo'],
     ['Ctrl+Shift+Z', 'Redo (also Ctrl+Y)'],
     ['Delete', 'Delete the selected node and its descendants']]
      .forEach(([key, desc]) => items.push({ key, desc, group: 'Algebra — edit' }));
    return items;
  }

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
    let lastHData = null;          // the latest quadrature DATA the solver was asked about — present even
                                   // when the numeric solve FAILED; the from-data proof source (Phase D / PF-2)
    let lastCap = 6;
    const elimSel = new Set();     // raw variable names chosen to eliminate (Gröbner)
    const realSel = new Set();     // primal variable names asserted real
    let _elimPicker = null, _realPicker = null;   // picker handles (for label refresh)
    let _seededHData = null;       // the hData the store was last seeded from (A4: detect a stale seed)
    let _zoom = 1;                 // canvas zoom level (View ± controls)
    let _minimapOn = false;        // DAG minimap toggle (B2)
    let _focusOn = false;          // focus mode toggle (P6a): isolate the selection's derivation
    let _drawerOpen = true;        // results drawer (P6b): index above the docked verdict

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
    // Applying a reduction appends a column at the far right of an already-wide track and nothing
    // scrolled there — the primary action of the workspace produced output the user could not see,
    // with a toast reading "→ column 7" standing in for it. Follow the work: when the derivation
    // grows (or the branch changes), bring the new current column into view. The movement IS the
    // feedback. Tracked here rather than in the canvas because only the caller knows what changed.
    let _lastMaxCol = -1, _lastTrack = null;
    function rerender() {
      if (canvas) canvas.render(store, latexOf);
      renderInspector(canvas ? canvas.getSelection() : []); buildBreadcrumb(); buildTrackBar();
      renderSuggestions(); renderHypotheses(); refreshUndoButtons(); scheduleAutosave(); refreshStatusBar();
      // Every stored result's state is relative to the CURRENT branch and frontier, and this is
      // the function that changes both. Without redrawing here, a reduction would leave results
      // still labelled "current" for a system that no longer exists.
      renderDrawer();
      const mx = store.size ? store.maxColumn() : -1, tr = store.activeTrack;
      if (canvas && canvas.scrollToColumn && mx >= 0 && (mx !== _lastMaxCol || tr !== _lastTrack)) {
        canvas.scrollToColumn(mx);
      }
      _lastMaxCol = mx; _lastTrack = tr;
    }
    // Keep the standing readout current after a mutation, but never stomp a transient message
    // (progress / a verdict) that an in-flight operation is showing.
    function refreshStatusBar() {
      const el = $('#alg-status'); if (!el) return;
      if (_busy) return;                                   // an operation is reporting progress
      if (el.dataset.transient === '1') return;            // a verdict / result line is standing
      el.textContent = baselineStatus();
    }

    // ---- undo/redo affordance ------------------------------------------------
    // The model was always sound (snapshot stack, 26 checkpoint sites); only the surface was
    // missing. Keep the two toolbar glyphs honest about whether they can do anything, and name
    // how many steps are available — a button that silently no-ops reads as broken.
    function refreshUndoButtons() {
      const ud = store.undoDepth ? store.undoDepth() : 0, rd = store.redoDepth ? store.redoDepth() : 0;
      const u = document.getElementById('alg-undo'), r = document.getElementById('alg-redo');
      const step = (n) => n + ' step' + (n === 1 ? '' : 's') + ' available';
      if (u) { u.disabled = !ud; u.setAttribute('aria-label', 'Undo'); u.title = ud ? ('Undo (Ctrl+Z) — ' + step(ud)) : 'Nothing to undo'; }
      if (r) { r.disabled = !rd; r.setAttribute('aria-label', 'Redo'); r.title = rd ? ('Redo (Ctrl+Shift+Z) — ' + step(rd)) : 'Nothing to redo'; }
    }

    // ---- session persistence (autosave / restore) ----------------------------
    // The store is purely in-memory, so a reload, a crash, or a stray Ctrl+W destroyed an entire
    // derivation with no warning and no recovery — and QD is a PWA, where a service-worker update
    // is itself a routine reload path. exportDAG()/importDAG() already round-trip a faithful
    // session, so autosave is just a debounce around them. localStorage rather than IndexedDB
    // because it is synchronous: the beforeunload flush below is then reliable.
    const AUTOSAVE_KEY = 'qd-algebra-autosave-v1';
    const AUTOSAVE_MAX = 2000000;      // ~2MB; past this we stop rather than thrash the quota
    const AUTOSAVE_DEBOUNCE = 800;
    let _saveTimer = null, _saveBlocked = false;
    function _writeAutosave() {
      _saveTimer = null;
      try {
        if (!store.size) { localStorage.removeItem(AUTOSAVE_KEY); _saveBlocked = false; return; }
        const payload = JSON.stringify({ at: Date.now(), nodes: store.size, columns: store.maxColumn() + 1, dag: store.exportDAG() });
        if (payload.length > AUTOSAVE_MAX) {
          // Say so ONCE: silently not saving is exactly the failure this feature exists to prevent.
          if (!_saveBlocked) { _saveBlocked = true; toast('This derivation is too large to autosave — use Download DAG (JSON) to keep it.', { kind: 'error' }); }
          return;
        }
        localStorage.setItem(AUTOSAVE_KEY, payload);
        _saveBlocked = false;
      } catch (e) {
        // Private mode / quota / disabled storage. Never break the workspace over a save, but do
        // remember it failed so the beforeunload guard below still warns.
        _saveBlocked = true;
      }
    }
    function scheduleAutosave() {
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(_writeAutosave, AUTOSAVE_DEBOUNCE);
    }
    function _readAutosave() {
      try {
        const raw = localStorage.getItem(AUTOSAVE_KEY); if (!raw) return null;
        const p = JSON.parse(raw);
        return (p && p.dag) ? p : null;
      } catch (e) { return null; }
    }
    function _agoStr(ms) {
      const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
      if (s < 90) return s + 's ago';
      const m = Math.round(s / 60); if (m < 90) return m + ' min ago';
      return Math.round(m / 60) + 'h ago';
    }
    // Offer the previous session back. Inserted at runtime (not in the panel template) so it sits
    // above the workflow without competing for room when there is nothing to restore. Returns true
    // when an offer was shown — the caller then skips auto-seeding, because seeding would discard
    // the very thing being offered.
    // ---- confirm before replacing a derivation --------------------------------
    // The C1/C2/C3 prove routes re-seed, and seeding calls clearGraph(): a click on ✦ Prove could
    // discard an hour of hand reduction with no warning, and the route is chosen from the h-data
    // AFTER the click, so the user cannot anticipate which press is destructive. It is checkpointed
    // and now autosaved, but "recoverable" is not the same as "asked". Only prompts when there is
    // real work to lose — a freshly seeded column 0 is regenerated, not destroyed.
    function confirmReplace(what, onYes) {
      if (!store.size || store.maxColumn() === 0) { onYes(); return; }
      const panel = $('#controls-algebra'); if (!panel) { onYes(); return; }
      const old = $('#alg-confirm'); if (old) old.remove();
      const strip = document.createElement('div');
      strip.id = 'alg-confirm'; strip.className = 'algebra-restore';
      const msg = document.createElement('span'); msg.className = 'algebra-restore-msg';
      const cols = store.maxColumn() + 1;
      msg.textContent = what + ' replaces your current derivation (' + cols + ' column' + (cols === 1 ? '' : 's')
        + ') with a freshly seeded system. Ctrl+Z restores it.';
      const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'small'; yes.textContent = 'Replace and continue';
      const no = document.createElement('button'); no.type = 'button'; no.className = 'small'; no.textContent = 'Keep my derivation';
      yes.addEventListener('click', () => { strip.remove(); onYes(); });
      no.addEventListener('click', () => { strip.remove(); setStatus(''); });
      strip.appendChild(msg); strip.appendChild(yes); strip.appendChild(no);
      // Anchor on the inspector, which now occupies the slot the φ/h reference block used to —
      // directly under the header. Falling through to appendChild would drop the strip at the
      // BOTTOM of a long sidebar, where "confirm in the sidebar" sends you looking for nothing.
      const anchor = panel.querySelector('#alg-inspector');
      if (anchor) panel.insertBefore(strip, anchor); else panel.appendChild(strip);
      strip.scrollIntoView({ block: 'nearest' });
      toast(what + ' would replace your derivation — confirm in the sidebar.', { kind: 'error' });
    }
    function offerRestore() {
      const saved = _readAutosave(); if (!saved || store.size) return false;
      const panel = $('#controls-algebra'); if (!panel) return false;
      const strip = document.createElement('div');
      strip.id = 'alg-restore'; strip.className = 'algebra-restore';
      const msg = document.createElement('span'); msg.className = 'algebra-restore-msg';
      msg.textContent = 'Unsaved derivation from your last session — '
        + saved.columns + ' column' + (saved.columns === 1 ? '' : 's') + ', '
        + saved.nodes + ' equation' + (saved.nodes === 1 ? '' : 's') + ', ' + _agoStr(saved.at) + '.';
      const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'small'; yes.textContent = 'Restore';
      yes.title = 'Rebuild the workspace from your last session';
      const no = document.createElement('button'); no.type = 'button'; no.className = 'small'; no.textContent = 'Discard';
      no.title = 'Start fresh — this deletes the saved session';
      yes.addEventListener('click', () => {
        let r; try { r = store.importDAG(saved.dag); } catch (e) { r = { ok: false, reason: (e && e.message) || String(e) }; }
        if (!r || r.ok === false) { showError('Restore: ' + ((r && r.reason) || 'the saved session could not be read')); return; }
        strip.remove(); rerender(); refreshPickers();
        toast('Restored ' + saved.columns + ' column' + (saved.columns === 1 ? '' : 's') + ' from your last session.');
      });
      no.addEventListener('click', () => {
        try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) { /* nothing to clear */ }
        strip.remove();
        if (!store.size && activeEnv) seedFromCurrent(); else rerender();
      });
      strip.appendChild(msg); strip.appendChild(yes); strip.appendChild(no);
      // Anchor on the inspector, which now occupies the slot the φ/h reference block used to —
      // directly under the header. Falling through to appendChild would drop the strip at the
      // BOTTOM of a long sidebar, where "confirm in the sidebar" sends you looking for nothing.
      const anchor = panel.querySelector('#alg-inspector');
      if (anchor) panel.insertBefore(strip, anchor); else panel.appendChild(strip);
      return true;
    }
    // Flush a pending save, and warn only when the work is genuinely unrecoverable — i.e. the
    // autosave could not take it. If it saved, the reload is recoverable and a prompt is noise.
    window.addEventListener('beforeunload', (ev) => {
      if (_saveTimer) { clearTimeout(_saveTimer); _writeAutosave(); }
      if (store.size && _saveBlocked) { ev.preventDefault(); ev.returnValue = ''; }
    });

    // ---- auto-detected variable-symmetry suggestions ("popup the moment an equation forces a
    // variable real/imaginary, or identifies two variables"). store.detectVariableRelations scans
    // the current equations for two-variable linear relations: v − v̄ = 0 (⇒ v real, e.g. the
    // gauge A₁,₁ − Ā₁,₁ = 0), v + v̄ = 0 (⇒ v imaginary), or x ∓ y = 0 between distinct primal vars
    // (⇒ identify x = ±y). Each is surfaced as a one-click apply in the #alg-suggest banner,
    // skipping any the user dismissed this session. Re-run from rerender() so it tracks reductions.
    const _dismissedRel = new Set();
    let _suggestOpen = null;   // explicit user expand/collapse of the list; null ⇒ follow AUTO_OPEN_MAX
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
      // <details> shell: a counted summary, open by default only for a short list. `_suggestOpen`
      // remembers an explicit user toggle (null = follow AUTO_OPEN_MAX) so re-renders — including
      // the one each dismissal triggers — don't snap the list shut under the user.
      const sum = document.createElement('summary'); sum.className = 'algebra-suggest-summary';
      sum.textContent = suggestSummaryLabel(hits.length, subHits.length);
      sum.title = 'Show / hide the detected assumptions, definitions and actions';
      // Read the flip on CLICK (box.open is still the OLD value here), not on `toggle` — `toggle`
      // also fires for our own programmatic `box.open` below, which would defeat the auto mode.
      sum.addEventListener('click', () => { _suggestOpen = !box.open; });
      box.appendChild(sum);
      box.open = suggestAutoOpen(hits.length + subHits.length, _suggestOpen);
      const body = document.createElement('div'); body.className = 'algebra-suggest-body';
      box.appendChild(body);
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
        body.appendChild(row);
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
        body.appendChild(row);
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
    // Close whichever picker is open. Routed through one helper so every close path keeps the
    // button's aria-expanded honest — three call sites used to hide the menu directly, leaving
    // the button telling assistive tech it was still open.
    function _closeOpenMenu() {
      if (!_openMenu) return;
      _openMenu.classList.add('hidden');
      const b = _openMenu._pickerBtn;
      if (b) b.setAttribute('aria-expanded', 'false');
      _openMenu = null;
    }
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
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-haspopup', 'true');
      menu._pickerBtn = btn;
      const setOpen = (on) => { menu.classList.toggle('hidden', !on); btn.setAttribute('aria-expanded', on ? 'true' : 'false'); };
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const willOpen = menu.classList.contains('hidden');
        if (_openMenu && _openMenu !== menu) _closeOpenMenu();
        if (willOpen) {
          render(); setOpen(true); _openMenu = menu;
          // Land on the first variable rather than making the user Tab past the button
          // into a list that only just appeared.
          const first = menu.querySelector('input[type="checkbox"]');
          if (first) { try { first.focus(); } catch (e) {} }
        } else { setOpen(false); _openMenu = null; }
      });
      menu.addEventListener('click', (ev) => ev.stopPropagation());
      // Esc closes the checklist and hands focus back to the button that opened it — without
      // this the only way out was a click elsewhere, which for a keyboard user is no way out.
      menu.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape') return;
        setOpen(false);
        if (_openMenu === menu) _openMenu = null;
        try { btn.focus(); } catch (e) {}
        ev.preventDefault(); ev.stopPropagation();
      });
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

    // Seed the Aharonov–Shapiro MOMENT system (roadmap #5): enumerate order-2 quadrature
    // domains from their harmonic moments. QE.pointFunctionalSystem builds the (symbolic-
    // moment) A&S system as a FLAT real system; store.seedFromPolys seeds it (all vars held
    // real). Unlike seedFromCurrent this needs NO geometric solve — it is a self-contained
    // system; pin the moments (Set values on M0/m1/n1) to determine a specific QD, then solve.
    function seedMomentSystem() {
      if (!QE || typeof QE.pointFunctionalSystem !== 'function' || typeof store.seedFromPolys !== 'function') {
        setStatus('Moment-system generator unavailable.'); return false;
      }
      try {
        clearError();
        const sys = QE.pointFunctionalSystem(null, { order: 2 });
        const r = store.seedFromPolys({ polys: sys.polys, vars: sys.vars, model: 'reim', formulation: 'moment', labelPrefix: 'A–S moment eqn' });
        if (!r || r.ok === false) { setStatus('Seed moments: ' + ((r && r.reason) || 'failed')); return false; }
        _seededHData = null;                          // NOT seeded from the geometric hData
        realSel.clear(); elimSel.clear(); refreshPickers();
        if (canvas) canvas.clearSelection();
        setStatusHTML(
          '<table class="algebra-seed-table"><tbody>' +
          '<tr><th>System</th><td><b>Aharonov–Shapiro moments</b> · order 2</td></tr>' +
          '<tr><th>Equations</th><td><b>' + store.size + '</b> real</td></tr>' +
          '<tr><th>Moments</th><td>M₀, M₁ symbolic (m₁, n₁ = Re/Im M₁)</td></tr>' +
          '</tbody></table>' +
          '<div class="hint">Underdetermined until the moments are pinned — “Set values” on M0, m1, n1 to determine a QD, then Solve / Dimension.</div>');
        rerender();
        return true;
      } catch (e) {
        setStatus('Moment system: ' + ((e && e.message) || e));
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
    // ---- φ / h reference card (canvas, bottom-left) --------------------------
    // Finding 4.2: this was an always-visible, non-collapsible block at the TOP of the sidebar,
    // outranking every workflow section below it and costing ~230px of a panel that has to hold
    // four sections plus an inspector. It describes the map, so it belongs beside the equations,
    // not above the controls.
    //
    // Defaults OPEN, and the user's toggle sticks for the session.
    //
    // The first draft auto-collapsed once a graph existed, to pre-empt the card covering column 0.
    // Measured in-browser that never happened: at 22 nodes with a 17-equation column, scrolled and
    // unscrolled, it covers ZERO cards — the card only intersects column 0's x-band, and column 0
    // is the short ORIGINAL system (5 equations here); every reduction lands in a column to its
    // right. A tall column 0 (a moment seed, a wide decomposition) can still reach it, which is
    // what the toggle is for. Auto-collapsing the common case to pre-empt the rare one would hide
    // the thing this change exists to surface.
    let _refUserPref = null;        // null = default; true/false = explicit user choice
    function refShouldOpen() { return (_refUserPref == null) ? true : !!_refUserPref; }
    function setRefCollapsed(on) {
      const card = $('#alg-refcard'); if (!card) return;
      card.classList.toggle('is-collapsed', !!on);
      const t = card.querySelector('.algebra-refcard-toggle');
      if (t) { t.textContent = on ? '▸' : '▾'; t.title = on ? 'Show the φ / h reference' : 'Collapse the φ / h reference'; }
    }
    function mountReferenceCard() {
      const host = canvas && canvas.corner; if (!host) return;
      host.innerHTML = '';
      const card = document.createElement('div');
      card.id = 'alg-refcard'; card.className = 'algebra-refcard';
      const head = document.createElement('div'); head.className = 'algebra-refcard-head';
      const toggle = document.createElement('button');
      toggle.type = 'button'; toggle.className = 'algebra-refcard-toggle'; toggle.textContent = '▾';
      toggle.addEventListener('click', () => {
        const nowCollapsed = !card.classList.contains('is-collapsed');
        _refUserPref = !nowCollapsed;          // remember the CHOICE, not the auto default
        setRefCollapsed(nowCollapsed);
      });
      const title = document.createElement('span');
      title.className = 'algebra-line-label'; title.textContent = 'φ / h reference';
      const vals = document.createElement('label'); vals.className = 'algebra-ref-opt';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'alg-ref-values';
      vals.appendChild(cb); vals.appendChild(document.createTextNode(' values'));
      head.appendChild(toggle); head.appendChild(title); head.appendChild(vals);
      const body = document.createElement('div');
      body.id = 'alg-ref'; body.className = 'algebra-ref';     // buildReference() writes here
      card.appendChild(head); card.appendChild(body);
      host.appendChild(card);
      cb.addEventListener('change', buildReference);
      setRefCollapsed(!refShouldOpen());
      buildReference();
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
    // Where am I? #alg-status is the sidebar's only state surface, and `setStatus('')` appears at ~23
    // sites — essentially every completion path — so after the first successful operation it went
    // blank and stayed blank, leaving the canvas as the sole answer. Clearing now means "no transient
    // message", not "nothing to say": it falls back to a standing description of the derivation.
    function baselineStatus() {
      if (!store.size) return activeEnv ? 'Ready — click Generate / re-seed to build the original system.'
                                        : 'No classical bounded QD solved yet — solve one on the QD tab, or seed the A–S moment system.';
      const c = store.maxColumn(), at = store.activeTrack;
      const eqs = store.list().filter((n) => (n.track || 't0') === at && n.column === c).length;
      const a = (store.realVars || []).length + (store.imagVars || []).length + (store.w0Fixed ? 1 : 0);
      const multi = store.tracks && store.tracks().length > 1;
      return 'column ' + c + ' of ' + c + ' · ' + eqs + ' equation' + (eqs === 1 ? '' : 's')
        + (multi ? ' · branch ' + trackLabelOf(at) : '')
        + ' · ' + (a ? a + ' assumption' + (a === 1 ? '' : 's') : 'no assumptions');
    }
    // A truthy message is TRANSIENT (progress, a verdict) and sticks until something replaces it;
    // clearing drops back to the standing readout rather than to nothing.
    function setStatus(t) {
      const el = $('#alg-status'); if (!el) return;
      if (t) { el.textContent = t; el.dataset.transient = '1'; }
      else { el.textContent = baselineStatus(); el.dataset.transient = '0'; }
    }
    function setStatusHTML(html) { const el = $('#alg-status'); if (el) el.innerHTML = html; }
    // Which workflow sections are open. Only "Assume" opened by default and nothing persisted, so
    // every reload re-shut Reduce and Analyze — two thirds of the actual working loop — while the
    // one left open was the section that most deserved collapsing. Remembered per section id.
    const SECTIONS_KEY = 'qd-algebra-sections-v1';
    function readOpenSections() {
      try { const v = JSON.parse(localStorage.getItem(SECTIONS_KEY) || 'null'); return (v && typeof v === 'object') ? v : null; }
      catch (e) { return null; }
    }
    function wireSectionPersistence(panel) {
      const saved = readOpenSections();
      panel.querySelectorAll('details.algebra-section').forEach((d) => {
        const sum = d.querySelector('summary');
        const key = sum ? sum.textContent.trim() : null;
        if (!key) return;
        d.dataset.section = key;
        if (saved && Object.prototype.hasOwnProperty.call(saved, key)) d.open = !!saved[key];
        d.addEventListener('toggle', () => {
          const cur = readOpenSections() || {};
          cur[key] = d.open;
          try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(cur)); } catch (e) { /* private mode */ }
        });
      });
    }
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
        '    <button id="alg-prove" class="small primary heavy-op" type="button" title="One click: seed → certified existence/uniqueness verdict, with a =/≤/≈ rigor badge.">✦ Prove existence / uniqueness</button>' +
        '    <button id="alg-autosolve" class="small heavy-op" type="button" title="Semi-autonomous: auto-assume reality (if h is symmetric), propagate linear consequences, then determine existence/uniqueness and the explicit real solutions — each step a new labeled column">★ Auto-reduce &amp; solve</button>' +
        '    <button id="alg-seed" class="small" type="button" title="Generate the original (●)/(★)/gauge system from the current bounded solve at column 0 (replaces the graph; assumptions are then added as columns)">Generate / re-seed</button>' +
        '    <button id="alg-seed-moment" class="small" type="button" title="Seed the Aharonov–Shapiro moment system: order-2 quadrature domains from their harmonic moments M₀, M₁ (symbolic — needs no solve; pin the moments via “Set values” to determine a specific QD)">Seed A–S moments</button>' +
        '    <button id="alg-cancel" class="small hidden" type="button" title="Cancel the running computation">Cancel</button>' +
        '  </div>' +
        // A seeding option, so it lives with the seed buttons (it used to hang off the φ/h
        // reference block, which described the map rather than generating it).
        '  <div class="row algebra-seed-opt">' +
        '    <label class="algebra-ref-opt" data-str-title="tooltips.algFixW0"><input type="checkbox" id="alg-w0-fix" checked> fix φ(0)=w₀</label>' +
        '  </div>' +
        // The pipeline description used to live in a 543-character `title`: invisible on touch,
        // unreachable by keyboard, gone on pointer-move. It is the substance of the tool, so it is
        // caption text now. See finding 4.3 — nothing over ~120 chars belongs in a tooltip.
        '  <div class="hint algebra-cta-caption">✦ <strong>Prove</strong> runs the full certified pipeline: regime → certified real solve (RUR + exact Sturm) → exact |zⱼ|&lt;1 gate → Schur–Cohn fold + boundary-simple filter → gauge quotient → numeric cross-check. ★ <strong>Auto-reduce</strong> stops after the algebraic count — no univalence filter, no gauge merge.</div>' +
        '  <div id="alg-status" class="hint" style="margin:4px 0;"></div>' +
        '  <div id="alg-error" class="algebra-error hidden">' +
        '    <span id="alg-error-msg" class="algebra-error-msg"></span>' +
        '    <button id="alg-error-close" class="algebra-error-close" type="button" title="Dismiss">×</button>' +
        '  </div>' +
        // Active-hypotheses strip (C1): the assumptions conditioning the CURRENT branch's
        // system — reality / imaginary / fixed φ(0) / pinned values (populated by renderHypotheses).
        // Stays INSIDE the pinned header: it is small (one line) and deliberately always-visible.
        '  <div id="alg-hypotheses" class="algebra-hypotheses hidden"></div>' +
        '</div>' +
        // Auto-detected suggestions: an equation forcing a variable real (v − v̄ = 0) or imaginary,
        // identifying two variables, or a structural abbreviation — each a one-click apply
        // (populated by renderSuggestions).
        // Deliberately OUTSIDE .algebra-head. The list is unbounded, and inside a `position: sticky`
        // header its height is subtracted from the sidebar viewport PERMANENTLY — scrolling cannot
        // reveal what sits under it. Out here it scrolls away like any other content.
        '<details id="alg-suggest" class="algebra-suggest hidden"></details>' +
        // The φ/h reference used to sit HERE — an always-visible, non-collapsible 230px block
        // outranking the entire workflow (finding 4.2). It is now a collapsible card on the canvas
        // (mountReferenceCard), beside the equations it describes. Its "fix φ(0)=w₀" checkbox did
        // NOT go with it: that is a generation choice (it changes which system column 0 *is*), not
        // a display option, and it was only filed under "reference" by accretion. It now sits with
        // the seed buttons that act on it, in the primary row above.
        // ---- CONTEXTUAL NODE INSPECTOR (shown only when ≥1 node is selected) ----
        '<div id="alg-inspector" class="algebra-inspector hidden"></div>' +
        // ---- WORKFLOW SECTIONS (collapsible; hidden while the inspector is up) ----
        '<div id="alg-sections">' +
        // 1. Assume — reality / symmetry only. This section used to hold NINETEEN controls across four
        // unrelated tools; "Define substitution" and "Add equation" in particular are system EDITS,
        // not assumptions, and were filed here purely by accretion. Split into three honest headings.
        '  <details class="algebra-section" open>' +
        '    <summary>Assume</summary>' +
        '    <div class="algebra-section-body">' +
        '      <div class="algebra-line"><span class="algebra-line-label">Assume real</span><span id="alg-real-pick" class="algebra-picker"></span>' +
        '        <button id="alg-real-apply" class="small" type="button" data-str-title="tooltips.assumeReal">Assume real</button>' +
        '        <button id="alg-real-auto" class="small" type="button" title="Detect real-axis symmetry of h and, if the data is fully real, assume every base variable real in one step (the biggest tractability lever)">Assume all real</button>' +
        '        <button id="alg-real-detect" class="small" type="button" title="Scan the current equations for variable symmetries — a variable forced real (v − v̄ = 0, e.g. the gauge) or imaginary (v + v̄ = 0), or two variables identified (x ∓ y = 0) — and surface one-click suggestions">Detect symmetry</button></div>' +
        '    </div>' +
        '  </details>' +
        // 2. Pin values — fixing a variable to an exact ℚ(i) value is a different act from assuming
        //    a symmetry, and has its own multi-row editor.
        '  <details class="algebra-section">' +
        '    <summary>Pin values</summary>' +
        '    <div class="algebra-section-body">' +
        '      <div class="algebra-line-label">Set values <span class="hint" style="font-weight:400;">(each value also fixes its conjugate)</span></div>' +
        '      <div id="alg-val-rows"></div>' +
        '      <div class="row" style="gap:4px; align-items:center; margin-top:2px;">' +
        '        <button id="alg-val-add" class="small" type="button" title="Add another variable to fix in the same column">＋ add variable</button>' +
        '        <label style="font-size:11px;" title="After substituting, run a linear-propagation pass (eliminate forced variables) as a further column."><input type="checkbox" id="alg-val-prop" checked> propagate</label>' +
        '        <button id="alg-val-apply" class="small" type="button" title="Substitute the exact values (continued-fraction ℚ(i)) for these variables — and their conjugates — in one new column">Set values</button></div>' +
        '    </div>' +
        '  </details>' +
        // 3. Edit system — introducing a symbol or imposing a custom condition CHANGES the system;
        //    neither is an assumption about a variable.
        '  <details class="algebra-section">' +
        '    <summary>Edit system</summary>' +
        '    <div class="algebra-section-body">' +
        '      <div class="algebra-line-label">Define substitution <span class="hint" style="font-weight:400;">(abbreviate a sub-expression as a new symbol)</span></div>' +
        '      <div class="algebra-define-row">' +
        '        <input id="alg-def-name" class="alg-def-name" type="text" placeholder="t" autocomplete="off" spellcheck="false" title="A fresh name for the new symbol" />' +
        '        <span class="alg-def-eq">:=</span>' +
        '        <input id="alg-def-expr" class="alg-def-expr" type="text" placeholder="e.g.  w1^2,  z1+zb1,  z1*zb1" autocomplete="off" spellcheck="false" title="An expression in the current variables.  + − * / ^ ( ),  i = imaginary unit,  exact rationals" />' +
        '        <button id="alg-def-apply" class="small" type="button" title="Introduce the new symbol and substitute it into the current system (a new labeled column)">Define symbol</button></div>' +
        '      <div id="alg-def-preview" class="alg-def-preview hint"></div>' +
        '      <div class="row" style="margin-top:4px;"><button id="alg-abbrev" class="small" type="button" title="Repeatedly apply the highest-value detected substitution (repeated expressions / structural regularities) until none remain — abbreviate the whole system in one step">Abbreviate repeatedly</button></div>' +
        '      <div class="algebra-line-label" style="margin-top:8px;">Add equation <span class="hint" style="font-weight:400;">(impose a custom condition)</span></div>' +
        '      <div class="algebra-define-row">' +
        '        <input id="alg-eq-expr" class="alg-def-expr" type="text" placeholder="e.g.  A1_1 - 1,  z1*zb1 - 1" autocomplete="off" spellcheck="false" title="A polynomial in the current variables.  + − * / ^ ( ),  i = imaginary unit,  exact rationals" />' +
        '        <select id="alg-eq-rel" class="alg-eq-rel" title="Relation: = 0 (equality), ≠ 0 (non-vanishing), or > 0 (Hermitian inequality)"><option value="=">= 0</option><option value="≠">≠ 0</option><option value="&gt;">&gt; 0</option></select>' +
        '        <button id="alg-eq-apply" class="small" type="button" title="Add this equation/inequality as a new node in the current system">Add equation</button></div>' +
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
        '        <button id="alg-saturate" class="small" type="button" title="Saturate the current system by the Möbius denominators ∏(1−z̄_j z_j) — removes the |z_j|=1 boundary stratum the cleared (●)/(★) denominators carry, so the existence count becomes the EXACT number of algebraic quadrature-domain solutions (e.g. the unit disk 4 → 2). Safe: a genuine QD has |z_j|<1, so nothing genuine is dropped.">Saturate (admissibility)</button>' +
        '        <button id="alg-propagate-all" class="small" type="button" title="Carry EVERY univalence constraint into the current system in one step, with all assumptions (reality, imaginary, fixed φ(0), pinned values) applied to each">Propagate constraints → current</button></div>' +
        // Column-level factoring. The per-node "Attempt to factor" requires selecting each card in
        // turn to discover whether it splits; this scans the whole current system at once, which is
        // the shape "simplify and reduce these equations" actually asks for.
        '      <div class="row" style="gap:4px; flex-wrap:wrap; margin-top:4px;">' +
        '        <button id="alg-factor-scan" class="small" type="button" title="Factor every equation in the current system and report which ones split — each becomes a one-click case column V(p)=⋃ₖV(fₖ). Equations past the in-browser factorizer caps are reported as UNDETERMINED, never as irreducible.">Factor / simplify column</button>' +
        '        <button id="alg-decompose" class="small heavy-op" type="button" title="Minimal primes: split the variety into its irreducible components, V(I)=⋃ₖV(componentₖ). The standard way out of a positive-dimensional (underdetermined) verdict — enter one component and analyze it alone; the branches\' existence counts add up. Runs in a worker.">Decompose into components</button>' +
        '        <button id="alg-regular-chains" class="small heavy-op" type="button" title="Regular chains (saturated triangular decomposition): like Triangular decomp. above, but SATURATED by its initials — the degenerate cases where an initial vanishes are resolved rather than left as an unstated caveat, so back-substitution is sound on every branch. Runs in a worker.">Regular chains (saturated)</button></div>' +
        '      <div id="alg-factor-out" class="algebra-factor-out"></div>' +
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
        '      <button id="alg-resolvent" class="small heavy-op" type="button" title="Resolvent / discriminant: the univariate eliminant χ_v(x)=det(x·I − M_v) of the current system in the chosen variable. squareFreePart = distinct v-values; a repeated root (discriminant 0) ⇒ coincident solutions / a degeneracy (e.g. a cusp). NB a repeat can also be fibre multiplicity if v does not separate the solutions.">Resolvent / discriminant</button></div>' +
        '    <div class="row" style="flex-wrap:wrap; gap:4px; margin-top:4px;">' +
        '      <label class="small">Bifurcation over <select id="alg-bifurc-var" title="The real parameter to vary. Reports how the number of real solutions (= quadrature domains) changes as this variable ranges over ℝ: the critical values where the count jumps, and the count on each interval. Needs a 1-parameter family — a system that becomes zero-dimensional once this variable is fixed."></select></label>' +
        '      <button id="alg-bifurc" class="small heavy-op" type="button" title="1-parameter bifurcation: the EXACT critical parameter values (eliminant border polynomial + Sturm isolation) and the CERTIFIED real-solution count (Hermite trace form) on each interval between them.">Bifurcation (real count)</button></div></div>' +
        '  </details>' +
        // 4b. Shape from moments (a NEW input modality — reconstruct a QD from its moments, not the columns)
        '  <details class="algebra-section">' +
        '    <summary>Shape from moments</summary>' +
        '    <div class="algebra-section-body">' +
        '      <div class="hint" style="margin-bottom:4px;">Reconstruct a discrete measure Σ aⱼ·δ(zⱼ) — a quadrature domain’s data — from its complex moments mₖ = Σ aⱼ·zⱼᵏ, by exact Prony–Hankel. The <strong>order</strong> (= #nodes = the QD-order) is the EXACT Hankel rank drop; the Prony polynomial Π(z−zⱼ) is exact; nodes/weights are numeric (well-conditioned, from the exact polynomial).</div>' +
        '      <div class="algebra-define-row">' +
        '        <input id="alg-moments" class="alg-def-expr" type="text" placeholder="m0, m1, m2, …   e.g.  3, 6, 14, 36, 98, 276   or  2, 0, -2, 0" autocomplete="off" spellcheck="false" title="Comma-separated complex moments m_0, m_1, …. Each: a (real), a+bi, a-bi, bi, i, -i; rationals 3/2 and decimals allowed." />' +
        '        <button id="alg-moments-go" class="small heavy-op" type="button" title="Exact Prony–Hankel reconstruction: the QD-order (Hankel rank drop), the exact Prony polynomial, and the numeric nodes/weights + a reconstruction residual.">Reconstruct</button></div>' +
        '      <div id="alg-moments-out" class="alg-def-preview hint"></div>' +
        '    </div>' +
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
        '        <button id="alg-copy-mma" class="small" type="button" title="Copy the chosen column as a Wolfram-Language list of equations ({lhs == 0, …}) ready to paste into Mathematica">Copy column</button>' +
        '        <button id="alg-copy-mma-all" class="small" type="button" title="Copy every column as labeled Wolfram-Language lists (col0 = {…}; col1 = {…}; …)">Copy all</button></div>' +
        '      <div class="algebra-line" style="margin-top:4px;"><span class="algebra-line-label">CAS / RCTD</span>' +
        '        <select id="alg-cas-dialect" title="Maple RCTD = parametric REAL triangular decomposition (RealComprehensiveTriangularize) — the fully-parametric uniqueness route; Singular / Sage = equality-ideal Gröbner cross-checks of the variety.">' +
        '          <option value="maple">Maple RCTD</option><option value="singular">Singular</option><option value="sage">Sage</option></select>' +
        '        <input id="alg-cas-params" class="small" type="text" placeholder="params e.g. a1,C1_1" title="Comma-separated variable names to treat as PARAMETERS — declared last for Maple RealComprehensiveTriangularize. Blank ⇒ non-parametric RealTriangularize." style="width:8.5em;" />' +
        '        <button id="alg-copy-cas" class="small" type="button" title="Copy the chosen column (above) as CAS input for the selected dialect (runs in your own Maple / Singular / Sage — nothing executes in-browser)">Copy for CAS</button>' +
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
      // (#alg-ref-values now lives on the canvas reference card and is wired by mountReferenceCard,
      // which owns the element — wiring it from here would depend on a mount order that no longer holds.)
      $('#alg-seed').addEventListener('click', seedFromCurrent);
      { const mb = $('#alg-seed-moment'); if (mb) mb.addEventListener('click', seedMomentSystem); }
      const w0FixCb = $('#alg-w0-fix');
      if (w0FixCb) w0FixCb.addEventListener('change', () => { if (store.size) seedFromCurrent(); });
      $('#alg-groebner').addEventListener('click', () => doGroebner(null));
      $('#alg-autosolve').addEventListener('click', doAutoSolve);
      $('#alg-factor-scan').addEventListener('click', doFactorScan);
      $('#alg-decompose').addEventListener('click', () => doDecompose('components'));
      $('#alg-regular-chains').addEventListener('click', () => doDecompose('chains'));
      $('#alg-triangular').addEventListener('click', doTriangular);
      $('#alg-saturate').addEventListener('click', doSaturate);
      $('#alg-propagate-all').addEventListener('click', doPropagateAll);
      $('#alg-classify').addEventListener('click', doClassify);
      $('#alg-dimension').addEventListener('click', doDimension);
      $('#alg-solve').addEventListener('click', doSolve);
      $('#alg-univalence').addEventListener('click', doCertifyUnivalence);
      $('#alg-prove').addEventListener('click', doProveExistenceUniqueness);
      $('#alg-resolvent').addEventListener('click', doResolvent);
      $('#alg-resolvent-var').addEventListener('mousedown', refreshResolventVars);
      { const bb = $('#alg-bifurc'); if (bb) bb.addEventListener('click', doBifurcation); }
      { const bv = $('#alg-bifurc-var'); if (bv) bv.addEventListener('mousedown', refreshBifurcVars); }
      { const mg = $('#alg-moments-go'); if (mg) mg.addEventListener('click', doShapeFromMoments); }
      { const mi = $('#alg-moments'); if (mi) mi.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') doShapeFromMoments(); }); }
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
      wireSectionPersistence(panel);   // restore + remember which workflow sections are open
      // close any open picker menu when clicking elsewhere
      document.addEventListener('click', () => { _closeOpenMenu(); });

      if (QD.Strings && QD.Strings.apply) QD.Strings.apply(panel);
      // (the reference itself is built by mountReferenceCard, after the canvas exists)
      setStatus(activeEnv ? '' : (STR.noSolve || 'No classical bounded QD solved yet.'));
    }

    // Populate the Mathematica-export column <select> with one option per column
    // (labeled by its transition), preserving the prior choice; defaults to the current.
    function refreshMmaColumns() {
      const sel = $('#alg-mma-col'); if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = '';
      const mx = store.maxColumn();
      // On a FORKED branch, column 0 is a copy of the parent's fork column — not the original
      // system — so it must not be offered under that name (same rule as the lane + breadcrumb).
      const at = store.activeTrack;
      const rootForked = isForkedColumn(store.list().filter((n) => (n.track || 't0') === at && n.column === 0));
      for (let c = 0; c <= mx; c++) {
        const o = document.createElement('option'); o.value = String(c);
        o.textContent = 'col ' + c + (c === 0 ? (rootForked ? ' · forked' : ' · original') : '') + (c === mx ? ' · current' : '');
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
      // F5: Maple RCTD is a REAL decomposition; a conjugate-model (complex-coefficient) column's "real count"
      // is NOT the quadrature-domain count — warn the user (the copied script also carries a header warning).
      if (dialect === 'maple' && typeof store.casColumnComplex === 'function' && store.casColumnComplex(c)) {
        toast('⚠ Column ' + c + ' has complex ℚ(i) coefficients (conjugate model). Maple RCTD is a REAL decomposition — its "real solutions" are NOT the quadrature-domain count. Reim-split (assume the base variables real) first for the QD count. The copied script includes this warning.', { kind: 'error' });
      }
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
      // Verdict summary: per cell, the real-solution count AND the parameter REGION it holds in
      // (the constraints) — the legible parametric picture "n real solutions where [g ⋈ 0]".
      const counted = res.cells.filter((c) => c.realCount != null);
      const total = counted.reduce((s, c) => s + c.realCount, 0);
      const text2 = 'Imported ' + res.cellCount + ' RCTD parameter cell' + (res.cellCount === 1 ? '' : 's')
        + ' (column ' + res.column + '), ' + res.created.length + ' node(s).'
        + (counted.length ? '  Real solutions per cell: ' + counted.map((c) => 'cell ' + c.index + ' → ' + c.realCount).join(', ') + '.' : '');
      // KaTeX rows: the count + the parameter constraints defining the cell (rendered from the
      // parsed term lists, so no dependence on the imported node ordering).
      const RSym = QD && QD.Sym;
      const relTex = (r) => (r === '>' ? '> 0' : (r === '≠' ? '\\ne 0' : '= 0'));
      const cellLatex = (parsed.cells || []).map((cell, ci) => {
        const idx = (cell && cell.index != null) ? cell.index : ci + 1;
        const rc = (cell && cell.realCount != null) ? cell.realCount : null;
        const head = '\\text{cell ' + idx + ': }' + (rc != null ? rc + '\\text{ real solution' + (rc === 1 ? '' : 's') + '}' : '\\text{(count not reported)}');
        let cons = [];
        try { cons = (cell.constraints || []).map((c) => reimSafeLatex(RSym.polyFromTermList(c.terms || []).toLatex(latexOf)) + ' ' + relTex(c.rel)); } catch (e) { cons = []; }
        return head + (cons.length ? '\\ \\text{where}\\ ' + cons.join(',\\ ') : '\\ \\text{(all parameters)}');
      });
      setStatus(text2);
      // These counts are REPORTED BY the user's own Maple run, parsed here — nothing in this app
      // certified them, so the card must not wear a rigor we did not earn. 'unknown' (?) is the
      // honest level; the title names the provenance so the pill reads as "external", not "dubious".
      if (canvas) showResult({ title: 'RCTD import (external CAS)', text: 'RCTD: ' + res.cellCount + ' parameter cell' + (res.cellCount === 1 ? '' : 's') + (counted.length ? ' · ' + total + ' real solution(s) total' : '') + ' — as reported by Maple; not verified in-app.', solutionsLatex: cellLatex, rigor: 'unknown' });
      toast(text2);
    }

    // Attempt to factor an equation: show its factors; picking one pursues that case
    // (V(fᵢ)=0) as a new "case" column. The other factors remain — undo and pick another.
    // Factor every equality in the current system and report the three-way split. The per-node
    // action answers "does THIS one factor?" only after you select it; this answers "which of my
    // equations can be simplified?" in one click, which is the question actually being asked.
    // Equations past a factorizer cap are listed as UNDETERMINED — never folded in with the
    // irreducible ones, since that is precisely the conflation this pass exists to remove.
    function doFactorScan() {
      if (busyGuard()) return;
      if (!ensureSeed()) return;
      const out = $('#alg-factor-out'); if (!out) return;
      out.innerHTML = '';
      const ns = store.list().filter((n) => n.rel === '=' && n.column === store.maxColumn());
      if (!ns.length) { out.textContent = 'No equations in the current system.'; return; }
      const split = [], irred = [], undet = [];
      ns.forEach((n) => {
        const fi = _factorInfo(n.id);
        (fi.status === 'reducible' ? split : fi.status === 'irreducible' ? irred : undet).push({ n, fi });
      });
      const head = document.createElement('div'); head.className = 'hint';
      head.textContent = ns.length + ' equation' + (ns.length === 1 ? '' : 's') + ' scanned — '
        + split.length + ' factor, ' + irred.length + ' proved irreducible, ' + undet.length + ' undetermined.';
      out.appendChild(head);
      split.forEach(({ n, fi }) => {
        const row = document.createElement('div'); row.className = 'algebra-factor-row';
        const lab = document.createElement('span'); lab.className = 'algebra-factor-eq';
        lab.textContent = (n.label || 'equation') + ' → ' + fi.count + ' factors';
        const go = document.createElement('button'); go.type = 'button'; go.className = 'small'; go.textContent = 'Split…';
        go.title = 'Show the factors and pick a case to pursue (V(p)=⋃ₖV(fₖ))';
        go.addEventListener('click', () => { out.querySelectorAll('.algebra-factor-chooser').forEach((c) => c.remove()); doFactor(n.id, out); });
        row.appendChild(lab); row.appendChild(go); out.appendChild(row);
      });
      if (undet.length) {
        const u = document.createElement('div'); u.className = 'hint';
        const strong = document.createElement('strong'); strong.textContent = 'Undetermined: ';
        u.appendChild(strong);
        u.appendChild(document.createTextNode(undet.map((x) => (x.n.label || '?')).join(', ')
          + ' — a factorizer cap stopped the search (' + (undet[0].fi.caps.map((c) => c.detail)[0] || 'see the per-equation note')
          + '). Not a proof of irreducibility; an external CAS has no such cap.'));
        out.appendChild(u);
      }
      toast(split.length ? (split.length + ' equation' + (split.length === 1 ? '' : 's') + ' can be split.') : 'No equation in the current system factors.');
    }
    // Decompose the current system into irreducible components (minimalPrimes) or saturated regular
    // chains, and offer to ENTER one. This is the escape hatch from the positive-dimensional dead
    // end: V(I) = ⋃ₖ V(componentₖ), so a component can be analyzed alone and the counts add.
    // Worker-backed and cancellable — factorizing Buchberger is not a main-thread computation.
    function doDecompose(mode) {
      if (busyGuard()) return;
      if (!ensureSeed()) return;
      const out = $('#alg-factor-out'); if (out) out.innerHTML = '';
      const chains = mode === 'chains';
      const label = chains ? 'Regular chains' : 'Decomposing into components';
      setBusy(true, label + '…');
      _abort = new AbortController();
      const call = chains ? store.regularChainsAsync(null, {}, { signal: _abort.signal })
                          : store.decomposeComponentsAsync(null, {}, { signal: _abort.signal });
      call.then((r) => {
        _abort = null; setBusy(false); setStatus('');
        if (r && r.aborted) { toast('Cancelled'); return; }
        if (!r || !r.ok) { showError((chains ? 'Regular chains: ' : 'Decompose: ') + withGuidance((r && r.reason) || 'unavailable')); return; }
        const items = chains ? (r.chains || []).map((c) => ({ polys: c.chain, whole: c.whole, meta: c }))
                             : (r.primes || []).map((G) => ({ polys: G, whole: !G.length, meta: null }));
        renderDecomposition(items, r, chains);
      }, (e) => { _abort = null; setBusy(false); setStatus(''); showError((chains ? 'Regular chains: ' : 'Decompose: ') + ((e && e.message) || String(e))); });
    }
    function renderDecomposition(items, r, chains) {
      const out = $('#alg-factor-out'); if (!out) return;
      out.innerHTML = '';
      const head = document.createElement('div'); head.className = 'hint';
      head.textContent = (chains ? 'Regular chains: ' : 'Irreducible components: ') + items.length
        + ' — V(I) = ' + (items.length === 1 ? 'V(component 1)' : '⋃ₖ V(componentₖ)') + '.';
      out.appendChild(head);
      if (r.note) { const nt = document.createElement('div'); nt.className = 'hint'; nt.textContent = r.note; out.appendChild(nt); }
      // The honesty line. complete:false ⇒ a cost cap fired, so these components may not COVER V(I)
      // — a strictly weaker statement than a factor split's, and one the user cannot infer.
      if (r.complete === false) {
        const w = document.createElement('div'); w.className = 'algebra-restore';
        w.textContent = '⚠ A cost cap stopped the decomposition, so these components may not cover the whole variety. '
          + 'Counts over them add to a LOWER BOUND on the original system, not the total.';
        out.appendChild(w);
      }
      if (!items.length) { const e = document.createElement('div'); e.className = 'hint'; e.textContent = 'The variety is empty (the system is inconsistent) — there is nothing to enter.'; out.appendChild(e); return; }
      items.forEach((it, k) => {
        const row = document.createElement('div'); row.className = 'algebra-factor-row';
        const lab = document.createElement('span'); lab.className = 'algebra-factor-eq';
        lab.textContent = 'component ' + (k + 1) + '/' + items.length + ' — ' + (it.whole ? 'the whole space' : it.polys.length + ' generator' + (it.polys.length === 1 ? '' : 's'))
          + (chains && it.meta && it.meta.freeVars && it.meta.freeVars.length ? ' · free: ' + it.meta.freeVars.map(latexPlain).join(', ') : '');
        row.appendChild(lab);
        if (!it.whole) {
          const go = document.createElement('button'); go.type = 'button'; go.className = 'small'; go.textContent = 'Enter';
          go.title = 'Replace the current system with this component in a new column. The other components still have to be analyzed for a complete count (undo to pick another).';
          go.addEventListener('click', () => {
            if (busyGuard()) return;
            const res = store.applyComponent(it.polys, k, items.length, { complete: r.complete !== false, method: chains ? 'regularChains' : 'minimalPrimes' });
            if (!res || !res.ok) { showError('Enter component: ' + ((res && res.reason) || 'failed')); return; }
            if (canvas) canvas.clearSelection();
            rerender(); refreshPickers();
            toast('Entered component ' + (k + 1) + ' of ' + items.length + ' (column ' + res.column + '); undo to pick another.');
            doCertifyUnivalence();
          });
          row.appendChild(go);
        }
        out.appendChild(row);
      });
      toast(items.length + (chains ? ' regular chain' : ' component') + (items.length === 1 ? '' : 's') + ' found.');
    }
    function doFactor(id, box) {
      if (busyGuard()) return;
      const fr = store.factorOf(id);
      if (!fr.ok) {
        // Three genuinely different answers, which a bare "no factorization" used to conflate.
        // 'irreducible' is a RESULT — the method ran to completion and settled it. 'undetermined'
        // is a statement about our search, not about the polynomial, so it must never read as a
        // proof; it names the cap and offers the escape hatch that does have the headroom.
        const prev = box.querySelector('.algebra-factor-chooser'); if (prev) prev.remove();
        const note = document.createElement('div'); note.className = 'algebra-factor-chooser hint';
        const lead = document.createElement('strong');
        if (fr.status === 'irreducible') {
          lead.textContent = 'Irreducible over ℚ(i) ✓';
          note.appendChild(lead);
          note.appendChild(document.createTextNode(' — this equation has no nontrivial factorization, '
            + 'so there is no case split to make here.'));
        } else {
          const caps = (fr.caps || []).map((c) => c.detail).join('; ');
          lead.textContent = 'Not factored';
          note.appendChild(lead);
          note.appendChild(document.createTextNode(' — ' + (caps || fr.reason || 'the search was cut short')
            + '. This is a limit of the in-browser factorizer, not a proof that the equation is irreducible.'));
          const cas = document.createElement('button'); cas.type = 'button'; cas.className = 'small';
          cas.textContent = 'Copy for an external CAS';
          cas.title = 'Copy this column as CAS input — Singular / Sage / Maple carry no such cap and can factor it';
          cas.addEventListener('click', () => copyCAS());
          note.appendChild(document.createElement('br')); note.appendChild(cas);
        }
        box.appendChild(note);
        toast(fr.status === 'irreducible' ? 'Irreducible over ℚ(i) — nothing to split.' : 'Not factored — see the note (a cap, not a proof).',
          fr.status === 'irreducible' ? {} : { kind: 'error' });
        return;
      }
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
        // The roots are closed-form radicals — exact BY CONSTRUCTION (degree ≤4 or reducible), with the
        // numeric residual check guarding the implementation. If that guard did not pass we cannot stand
        // behind the closed form, so it degrades to 'partial' — never to '=' on an unverified solve.
        if (canvas) showResult({ title: 'Solve for a variable', text: summary, solutionsLatex: latexes, rigor: verOk ? 'exact' : 'partial' });
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
    // Caches the full factor OUTCOME — { status, count, reason, caps } — not a boolean, because the
    // three states have to be told apart at every call site: 'reducible' offers a split, 'irreducible'
    // is a result worth stating, and 'undetermined' means a cap stopped the search and we may claim
    // nothing. Cached per id+size: factoring is capped but real work, and the positive-dim verdict
    // scans every node in the current column.
    const FACTOR_NONE = { status: 'undetermined', count: 0, reason: 'node not found', caps: [] };
    const _factorCache = new Map();
    function _factorInfo(id) {
      const n = store.get(id); if (!n) return FACTOR_NONE;
      const key = id + ':' + (n.poly && n.poly.size ? n.poly.size() : 0);
      if (_factorCache.has(key)) return _factorCache.get(key);
      let info = FACTOR_NONE;
      try {
        const fr = store.factorOf && store.factorOf(id);
        info = {
          status: (fr && fr.status) || 'undetermined',
          count: (fr && fr.ok && fr.factors) ? fr.factors.length : 0,
          reason: (fr && fr.reason) || '',
          caps: (fr && fr.caps) || [],
        };
      } catch (e) { info = { status: 'undetermined', count: 0, reason: (e && e.message) || String(e), caps: [] }; }
      _factorCache.set(key, info);
      if (_factorCache.size > 256) _factorCache.delete(_factorCache.keys().next().value);
      return info;
    }
    function _factorCount(id) { return _factorInfo(id).count; }
    function _factorable(id) { return _factorInfo(id).status === 'reducible'; }
    // Typeset a polynomial, or elide it with a useful summary when it is too large to render.
    // DISPLAY_CAP comes from the canvas so the two surfaces cannot drift apart on the threshold.
    function polyCap() { const AC = QD.AlgebraCanvas; return (AC && AC.DISPLAY_CAP) || 120; }
    function renderPolyCapped(el, poly, tex, display) {
      const RL = QD.RiemannLatex;
      const size = (poly && poly.size) ? poly.size() : 0;
      if (size > polyCap()) {
        let deg = 0, vars = [];
        try { vars = [...poly.vars()]; for (const v of vars) deg = Math.max(deg, poly.degreeIn(v)); } catch (e) { /* best effort */ }
        el.textContent = size + ' terms · degree ' + deg
          + (vars.length ? ' · ' + vars.slice(0, 6).map(latexPlain).join(', ') + (vars.length > 6 ? ', …' : '') : '')
          + ' — too large to typeset; use Copy LaTeX / Export.';
        el.classList.add('hint');
        return false;
      }
      el.classList.remove('hint');
      if (RL && RL.render) RL.render(el, tex, !!display); else el.textContent = tex;
      return true;
    }
    // The single-node action list, as DATA. It was built inline inside renderInspector, so the
    // canvas could not offer the same actions without a second copy of the availability logic —
    // and a duplicated list is a list that drifts. The body below is the ORIGINAL code verbatim;
    // only `acts` and `mkBtn` are redefined, so nothing could be altered in transit. Returns
    // [{ label, title, run }]; `box` is what the panel-rendering actions draw into.
    function nodeActions(id, box) {
      const n = store.get(id); if (!n) return [];
      const out = [];
      const mkBtn = (label, title, run) => ({ label, title, run });
      const acts = { appendChild: (d) => out.push(d) };
        acts.appendChild(mkBtn('Duplicate', 'Copy this equation into a new node', () => { if (busyGuard()) return; if (store.duplicate(id)) { rerender(); toast('Duplicated ' + n.label); } }));
        acts.appendChild(mkBtn('Copy LaTeX', 'Copy this equation as LaTeX', () => copyNodeLatex(id)));
        acts.appendChild(mkBtn('Copy Mathematica', 'Copy this equation as Wolfram-Language (lhs == 0)', () => { const code = store.mathematicaNode(id); if (code) writeClipboard(code, n.label + ' (Mathematica)'); }));
        // D5: show how this derived equation was obtained from its input(s) — for substitutions
        // / reality assumptions the transformation is replayed one variable at a time (genuine
        // intermediate polynomials); engine reductions get an input → method → output summary.
        if (n.provenance && (n.provenance.inputs || []).length) {
          acts.appendChild(mkBtn('Show steps', 'Show how this equation was derived from its input(s); substitutions and reality assumptions are replayed one variable at a time', () => doShowSteps(id, box)));
        }
        acts.appendChild(mkBtn('Delete', 'Delete this node and its descendants', () => { if (busyGuard()) return; const removed = store.deleteNode(id); if (canvas) canvas.clearSelection(); rerender(); toast('Deleted ' + ((removed && removed.length) || 1) + ' node(s)'); }));
        // Generate the conjugate equation p̄ = 0 (folding in variables already assumed real).
        // Useful for derived equations that did not get a seed-time companion. Equalities/≠ only.
        if (n.rel !== '>') {
          acts.appendChild(mkBtn('Generate conjugate', 'Add the conjugate equation p̄ = 0 as a paired companion, folding in any variables already assumed real (v̄ ≡ v)', () => {
            if (busyGuard()) return;
            const r = store.generateConjugate(id);
            if (!r.ok) { toast(r.reason || 'could not generate the conjugate', { kind: 'error' }); return; }
            rerender(); toast('Added conjugate: ' + r.node.label);
          }));
        }
        // Propagate a constraint forward into the current system, folding in every assumption
        // (reality / imaginary / fixed φ(0) / pinned values) applied across the columns.
        if (n.column < store.maxColumn()) {
          acts.appendChild(mkBtn('Propagate to current system', 'Carry this equation into the last column with all assumptions (reality, imaginary, fixed φ(0), pinned values) applied to it', () => {
            if (busyGuard()) return;
            const r = store.propagateNode(id);
            if (!r.ok) { toast(r.reason || 'could not propagate', { kind: 'error' }); return; }
            if (canvas) canvas.clearSelection();
            rerender(); refreshPickers();
            toast('Propagated to column ' + r.column + (r.applied && r.applied.length ? ' (applied ' + r.applied.join(', ') + ')' : ''));
          }));
        }
        // Attempt to factor: split p = f·g into candidate systems V(p)=⋃V(fᵢ), pursued one case at
        // a time. ALWAYS offered on an equality — the old D3 filter hid it whenever factorOf().ok
        // was false, which made "irreducible", "past a factorizer cap" and "this feature does not
        // exist" render identically (nothing at all). doFactor now reports which of the three it is.
        if (n.rel === '=') {
          const fi = _factorInfo(id);
          const inCurrent = n.column === store.maxColumn();
          const label = fi.status === 'reducible' ? ('Attempt to factor (' + fi.count + ' factors)') : 'Attempt to factor';
          if (inCurrent) {
            acts.appendChild(mkBtn(label, 'Factor this equation; pick a factor fᵢ to pursue V(fᵢ)=0 as a new "case" column (V(p)=⋃ᵢV(fᵢ))', () => doFactor(id, box)));
          } else if (fi.status === 'reducible') {
            // applyFactor only acts on the CURRENT column, so a factorable equation left behind in
            // an earlier column used to offer nothing at all — with no hint that carrying it forward
            // would restore the option. Chain the two steps the user would have had to guess.
            acts.appendChild(mkBtn('Propagate + factor (' + fi.count + ' factors)',
              'This equation factors, but only the current system can be split. Carry it into the last column (with every assumption applied) and factor it there.',
              () => {
                if (busyGuard()) return;
                const r = store.propagateNode(id);
                if (!r.ok) { showError('Propagate: ' + (r.reason || 'could not propagate')); return; }
                rerender(); refreshPickers();
                const moved = (r.node && r.node.id) || null;
                toast('Propagated to column ' + r.column + ' — factoring it there.');
                if (moved) { const nb = $('#alg-inspector'); if (nb) doFactor(moved, nb); }
              }));
          } else {
            // Not in the current column and not factorable: still say WHY rather than showing nothing.
            acts.appendChild(mkBtn(label, 'Report whether this equation factors (it is not in the current system, so it cannot be split here)', () => doFactor(id, box)));
          }
        }
        // Solve this equation for one variable in radicals (closed form), keeping the
        // others symbolic — degree ≤4 or reducible (e.g. x⁶+b x⁴+c x²+d as a cubic in x²).
        // Read-only display (roots are radicals, not polynomials); any equality, any column.
        // D3: shown only when the equation actually has a variable to solve for.
        if (n.rel === '=' && n.poly.vars().size >= 1) {
          acts.appendChild(mkBtn('Solve for a variable', 'Solve this equation for one chosen variable in radicals (closed form), keeping the remaining variables symbolic; degree ≤4 or reducible (quasi-polynomial / factorable). Result is displayed + numerically verified, not added to the graph.', () => doSolveRadical(id, box)));
        }
        // Fork a new parallel branch starting from THIS node's column (A2) — explore a
        // different line of assumptions from here while leaving the current branch intact.
        acts.appendChild(mkBtn('Fork from here', 'Start a new parallel branch from this column: copies the column into a fresh track you can reduce independently, leaving the current branch untouched.', () => { if (canvas) canvas.clearSelection(); doFork(n.column); }));
      return out;
    }
    // Right-click a card for its actions, built from the SAME nodeActions list the inspector
    // renders. Ten actions previously lived only in a sidebar panel that can sit ~900px from the
    // card you clicked; on the canvas a card offered four (collapse / up / down / copy).
    let _ctxMenu = null;
    let _ctxReturn = null;             // element focused before the menu opened
    function closeNodeMenu() {
      if (!_ctxMenu) return;
      _ctxMenu.remove(); _ctxMenu = null;
      // Dismissing a menu must put focus back where it was, or it lands on <body> and the
      // next Tab restarts from the top of the document — which, on this page, is the tab bar.
      const back = _ctxReturn; _ctxReturn = null;
      if (back && typeof back.focus === 'function' && back.isConnected !== false) {
        try { back.focus(); } catch (e) {}
      }
    }
    function openNodeMenu(id, x, y) {
      closeNodeMenu();
      const box = $('#alg-inspector');
      const acts = nodeActions(id, box);
      if (!acts.length) return;
      const n = store.get(id);
      const menu = document.createElement('div'); menu.className = 'algebra-ctx-menu';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', ((n && n.label) || 'equation') + ' actions');
      const head = document.createElement('div'); head.className = 'algebra-ctx-head';
      head.textContent = (n && n.label) || 'equation';
      menu.appendChild(head);
      acts.forEach((a) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'algebra-ctx-item';
        b.setAttribute('role', 'menuitem');
        if (a.label === 'Delete') b.classList.add('danger');
        b.textContent = a.label; if (a.title) b.title = a.title;
        b.addEventListener('click', () => {
          closeNodeMenu();
          // Panel-rendering actions (factor chooser / steps / radical solve) draw into the
          // inspector, so make sure it is showing this node before running one.
          if (canvas && canvas.getSelection().indexOf(id) < 0) { canvas.clearSelection(); }
          try { a.run(); } catch (e) { showError((a.label || 'Action') + ': ' + ((e && e.message) || String(e))); }
        });
        menu.appendChild(b);
      });
      // Keyboard menu semantics. These keys are handled HERE and stopped: the document-level
      // handler binds the same arrows to canvas navigation, so without this an open menu
      // would scroll the graph out from under itself.
      menu.addEventListener('keydown', (ev) => {
        const items = Array.from(menu.querySelectorAll('.algebra-ctx-item'));
        if (!items.length) return;
        const at = items.indexOf(document.activeElement);
        const go = (i) => { items[(i + items.length) % items.length].focus(); ev.preventDefault(); ev.stopPropagation(); };
        if (ev.key === 'ArrowDown')      go(at + 1);
        else if (ev.key === 'ArrowUp')   go(at - 1);
        else if (ev.key === 'Home')      go(0);
        else if (ev.key === 'End')       go(items.length - 1);
        else if (ev.key === 'Escape' || ev.key === 'Tab') { closeNodeMenu(); ev.preventDefault(); ev.stopPropagation(); }
      });
      document.body.appendChild(menu);
      // Keep it on screen when opened near an edge.
      const r = menu.getBoundingClientRect();
      menu.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 6)) + 'px';
      menu.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 6)) + 'px';
      _ctxMenu = menu;
      _ctxReturn = (document.activeElement && document.activeElement !== document.body)
        ? document.activeElement : null;
      const first = menu.querySelector('.algebra-ctx-item');
      if (first) { try { first.focus(); } catch (e) {} }
      setTimeout(() => {
        const off = (ev) => { if (_ctxMenu && !_ctxMenu.contains(ev.target)) { closeNodeMenu(); document.removeEventListener('pointerdown', off, true); } };
        document.addEventListener('pointerdown', off, true);
      }, 0);
    }
    function renderInspector(sel) {
      const box = $('#alg-inspector'), sections = $('#alg-sections');
      if (!box) return;
      sel = (sel || []).filter((id) => store.get(id));
      if (!sel.length) {
        box.classList.add('hidden'); box.innerHTML = '';
        if (sections) { sections.classList.remove('hidden'); sections.classList.remove('is-behind-inspector'); }
        return;
      }
      box.classList.remove('hidden');
      // Selecting a node used to HIDE the whole workflow — Assume / Reduce / Analyze / Export all
      // vanished and the only way back was a button labelled "Done". Collapse them instead: they
      // stay listed and one click away, so inspecting an equation is no longer modal.
      if (sections) { sections.classList.remove('hidden'); sections.classList.add('is-behind-inspector'); }
      box.innerHTML = '';
      const head = document.createElement('div'); head.className = 'algebra-inspector-head';
      const title = document.createElement('span'); title.className = 'algebra-line-label';
      // Name WHICH equation, not just "Selected equation" — the panel is ~900px from the card that
      // was clicked, so the label is the only thing tying the two together.
      const n0 = sel.length === 1 ? store.get(sel[0]) : null;
      title.textContent = sel.length === 1 ? ((n0 && n0.label) ? n0.label : 'Selected equation') : ('Eliminate a variable · ' + sel.length + ' selected');
      title.title = sel.length === 1 ? 'The equation selected on the graph' : '';
      const done = document.createElement('button'); done.type = 'button'; done.className = 'small'; done.textContent = '← Back';
      done.title = 'Clear the selection and return to the workflow';
      done.addEventListener('click', () => { if (canvas) canvas.clearSelection(); });
      head.appendChild(title); head.appendChild(done); box.appendChild(head);
      const mkBtn = (txt, tip, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'small'; b.textContent = txt; if (tip) b.title = tip; b.addEventListener('click', fn); return b; };

      if (sel.length === 1) {
        const n = store.get(sel[0]);
        const lab = document.createElement('div'); lab.className = 'hint'; lab.textContent = n.label; box.appendChild(lab);
        const eq = document.createElement('div'); eq.className = 'algebra-inspector-eq';
        // The canvas elides past DISPLAY_CAP terms; the sidebar did NOT, so selecting a
        // post-Gröbner node with a few thousand terms typeset all of it, in DISPLAY mode, into a
        // narrow panel, on the main thread. Share the canvas's cap rather than inventing a second
        // one, and make the placeholder informative — a bare term count says nothing about the
        // equation, so give degree, term count and the surviving variables.
        renderPolyCapped(eq, n.poly, n.poly.toLatex(latexOf) + relSuffix(n.rel), true);
        box.appendChild(eq);
        const prov = provText(n.provenance);
        if (prov) { const p = document.createElement('div'); p.className = 'hint'; p.textContent = 'Origin: ' + prov; box.appendChild(p); }
        const acts = document.createElement('div'); acts.className = 'row'; acts.style.gap = '4px'; acts.style.marginTop = '4px';
        nodeActions(sel[0], box).forEach((a) => {
          const b = mkBtn(a.label, a.title, a.run);
          // Delete removes the node AND its descendants; it sat mid-row in identical styling while
          // button.danger shipped unused. Mark it and push it away from the constructive actions.
          if (a.label === 'Delete') { b.classList.add('danger'); b.style.marginLeft = 'auto'; }
          acts.appendChild(b);
        });
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
      const created = r.created || (r.node ? [r.node] : []);
      const exact = (r.method || (r.node && r.node.provenance && r.node.provenance.method)) === 'ideal';
      toast('Eliminated ' + latexPlain(v) + ' → ' + created.length + ' exact ' + (created.length === 1 ? 'relation' : 'relations')
        + (exact ? ' (elimination ideal — no extraneous factors)' : ' (Sylvester resultant fallback — may carry extraneous factors)'));
    }
    // Busy-state manager for the off-main-thread (worker) ops — disables the heavy
    // controls AND the graph-mutating controls (undo/redo, reductions, palette) so a
    // mutation can't land mid-op and orphan an in-flight derivation (A5), reveals
    // Cancel, and routes progress to the status line.
    let _abort = null;
    let _busy = false;
    function setBusy(on, label) {
      _busy = !!on;
      ['alg-prove', 'alg-groebner', 'alg-groebner-sel', 'alg-solve', 'alg-dimension', 'alg-triangular', 'alg-saturate', 'alg-classify', 'alg-univalence', 'alg-resolvent', 'alg-bifurc', 'alg-moments-go', 'alg-autosolve',
        'alg-gauge-elim', 'alg-eliminate', 'alg-seed', 'alg-undo', 'alg-redo', 'alg-real-apply', 'alg-real-auto', 'alg-real-detect', 'alg-propagate-all', 'alg-val-apply', 'alg-def-apply', 'alg-abbrev', 'alg-eq-apply',
        'alg-factor-scan', 'alg-decompose', 'alg-regular-chains']
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
    function _isCapFailure(reason) { return /export|cap|exceed|too large|step|basis|degree|terms/i.test(reason || ''); }
    function withGuidance(reason) {
      return _isCapFailure(reason)
        ? (reason + '  Try: assume variables real (simplifies the system), eliminate fewer variables, or use the CAS export.')
        : reason;
    }
    // G-misc-2: a cap/too-large failure names the CAS export in PROSE — also make it a one-click ACTION.
    // Renders the failure in the verdict card with a "Copy Maple RCTD export" button, so the failure state is
    // actionable (the documented external-CAS route), not just advisory. Returns true when it handled a cap
    // failure (there is a system to export); else false ⇒ the caller falls back to showError.
    function capFailVerdict(prefix, reason) {
      if (!_isCapFailure(reason) || !canvas || !store.size) return false;
      const c = store.maxColumn();
      const text = prefix + ': ' + withGuidance(reason);
      showResult({ text, rigor: 'unknown', actions: [{
        label: 'Copy Maple RCTD export',
        title: 'Copy the current system as a Maple RealComprehensiveTriangularize script — run the certified parametric decomposition in your own Maple, then import the result (Import RCTD).',
        onClick: () => {
          let code = ''; try { code = store.casColumn(c, 'maple', {}); } catch (e) { code = ''; }
          if (!code) { toast('Nothing to export from column ' + c + '.', { kind: 'error' }); return; }
          writeClipboard(code, 'Maple RCTD (column ' + c + ')');
          if (typeof store.casColumnComplex === 'function' && store.casColumnComplex(c)) toast('⚠ complex-coefficient system — reim-split (assume the base variables real) first for a real count.', { kind: 'error' });
        },
      }] });
      setStatus(text); toast(prefix + ' — over a cap; use the CAS export (button on the verdict card).', { kind: 'error' });
      return true;
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
        if (!r.ok) { const rn = r.reason || 'failed'; if (!capFailVerdict('Gröbner basis', rn)) showError('Gröbner basis: ' + withGuidance(rn)); setStatus(''); return; }
        if (canvas) canvas.clearSelection();
        rerender(); setStatus('');
        toast('Gröbner basis: ' + r.created.length + ' generator(s)' +
          (elim.length ? ' eliminating ' + elim.map(latexPlain).join(', ') : ' (' + order + ')') +
          (r.skipped.length ? '; skipped ' + r.skipped.length + ' non-equality' : ''));
      });
    }

    // Saturate the current system by the Möbius denominators ∏(1−z̄z) → a labeled 'saturate' column that
    // drops the {|z_j|=1} boundary stratum the cleared (●)/(★) denominators carry, so the existence count is
    // the EXACT number of algebraic quadrature-domain solutions (finding B-1; e.g. the unit disk 4 → 2).
    function doSaturate() {
      if (_abort) return;
      if (!ensureSeed()) return;
      clearError();
      const sel = canvas ? canvas.getSelection() : [];
      let r; try { r = store.saturateMobius(sel.length ? sel : null); } catch (e) { r = { ok: false, reason: (e && e.message) || String(e) }; }
      if (!r.ok) { showError('Saturate (admissibility): ' + withGuidance(r.reason || 'nothing to saturate')); return; }
      if (canvas) canvas.clearSelection();
      rerender(); refreshPickers();
      toast('Saturated by ∏(1−z̄z): the |z_j| = 1 boundary stratum removed (' + r.created.length + ' generator' + (r.created.length === 1 ? '' : 's') + ') — the existence count is now the exact algebraic QD-solution count.');
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
        (r.freeVars.length ? '; free variable(s) ' + r.freeVars.map(latexPlain).join(', ') + ' ⇒ a positive-dimensional family' : ' ⇒ zero-dimensional (finitely many solutions)') +
        (r.hasRegularityConditions ? ' · ⚠ ' + r.initialCount + ' non-constant initial(s) — a Wu chain is NOT saturated by its pivots, so where an initial vanishes it may add spurious branches or miss components (a full regular-chain decomposition would case-split on the initials)' : ''));
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
    // Honest one-line size of a positive-dimensional verdict: the true Krull DIMENSION (the number
    // of free parameters, read off the leading-term staircase — roadmap #8) when the result carries
    // it, alongside the ambient real-variable count. Degrades to the variable count alone otherwise.
    function posDimDesc(r) {
      const nv = (r && r.numVars != null ? r.numVars : '?') + ' real variables';
      return (r && r.krullDim != null && r.krullDim >= 1) ? ('dimension ' + r.krullDim + ', ' + nv) : nv;
    }
    // The persistent "assumptions ledger" for the verdict card — every active specialization that
    // narrows the verdict, one short label each (slices, φ(0) gauge fix, factor case). Shown as a
    // banner so no slice/branch count on the card reads as the certified general count. [] ⇒ general.
    function specializationLedger(r) {
      const out = sliceLabels(r).map((s) => s.charAt(0).toUpperCase() + s.slice(1));
      if (store.w0Fixed) out.push('φ(0) = w₀ fixed (center/translation gauge — restricts to domains whose interior contains w₀; a domain not containing w₀ is not counted)');
      if (r && r.partialBranch) out.push((r.branchOp === 'component' ? 'Component ' : 'Factor case ') + ((r.caseIndex || 0) + 1) + ' of ' + r.caseCount
        + (r.branchIncomplete ? ' (branches add to a LOWER BOUND — the decomposition hit a cap)' : ' (branches add up)'));
      // D-4: a user-added univalence constraint (convex / star / spiral / injectivity) restricts the count to
      // the domains meeting it — record it in the ledger so a restricted count never reads as the full one.
      try {
        const at = store.activeTrack;
        const forms = [...new Set((store.list ? store.list() : [])
          .filter((n) => n && (n.track || 't0') === at && n.provenance && n.provenance.op === 'constraint')
          .map((n) => (n.provenance && n.provenance.form) || (n.meta && n.meta.form)).filter(Boolean))];
        if (forms.length) out.push('Univalence constraint' + (forms.length > 1 ? 's' : '') + ' active (' + forms.join(', ') + ') — restricts to domains meeting ' + (forms.length > 1 ? 'them' : 'it') + '; a domain that does not is not counted');
      } catch (e) { /* ignore */ }
      return out;
    }

    // Rigor level (finding G-2 badge) for a classify/count RESULT: the reim real-solution count is a
    // rigorous UPPER BOUND on #QD (⇒ 'bound'); an inconsistent system certifies "no QD" ('exact'); a
    // positive-dimensional system or an over-cap real count is undetermined ('unknown').
    function classifyRigor(r) {
      if (!r || !r.ok) return 'unknown';
      if (r.inconsistent) return 'exact';
      if (!r.zeroDim || r.realCount == null) return 'unknown';
      return 'bound';
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
          else if (!cl.zeroDim) verdict = 'A positive-dimensional family of solutions (' + posDimDesc(cl) + ') — add a constraint or fix a value to pin it.';
          // HONEST LABELING (finding C-1/B-1): the reim real-solution count is the count of ALGEBRAIC
          // solutions of the cleared system — an UPPER BOUND on the number of quadrature domains (it can
          // include non-univalent maps, gauge copies, and the {|z_j|=1} boundary stratum the cleared
          // denominators carry). It is NOT the QD count; only "Certify univalence" (which filters non-QDs
          // + quotients the gauge) yields that. Count 0 IS sound (0 algebraic ⇒ 0 QD).
          else if (cl.realCount == null) verdict = cl.multiplicity + ' solution(s) with multiplicity.';
          else if (cl.realCount === 0) verdict = 'No real quadrature domain' + (cl.complexCount != null ? ' (of ' + cl.complexCount + ' distinct complex)' : '') + '.';
          else verdict = cl.realCount + ' real algebraic solution' + (cl.realCount === 1 ? '' : 's')
            + (cl.complexCount != null ? ' (of ' + cl.complexCount + ' distinct complex)' : '')
            + ' — an upper bound on the number of quadrature domains; run Certify univalence for the genuine-QD count.';
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
          if (canvas) showResult({ text: verdict, solutionsText, assumptions: specializationLedger(cl), rigor: classifyRigor(cl) });
          toast(verdict, cl.inconsistent || cl.realCount === 0 ? { kind: 'error' } : {});
        } catch (e) { _abort = null; setBusy(false); showError('Auto-reduce & solve: ' + ((e && e.message) || String(e))); }
      })();
    }

    // Centroid of the poles a_j — the default φ(0) for a FROM-DATA seed (no numeric w₀ available).
    function poleCentroid(hData) {
      const poles = (hData && hData.poles) || []; if (!poles.length) return { re: 0, im: 0 };
      let re = 0, im = 0; for (const p of poles) { re += (p.a && p.a.re) || 0; im += (p.a && p.a.im) || 0; }
      return { re: re / poles.length, im: im / poles.length };
    }
    // Seed the (●)/(★)/gauge system directly from raw classical-bounded quadrature DATA — the from-data
    // proof path (Phase D / PF-2), used when there is no numeric solve (activeEnv is null). Mirrors
    // seedFromCurrent but takes hData explicitly; φ(0) is fixed to the pole centroid when the w₀ box is on.
    function seedFromDataDirect(hData) {
      try {
        const w0cb = $('#alg-w0-fix'), fixW0 = !w0cb || w0cb.checked;
        const sys = QE.generateClassicalBounded(hData, { maxPoleOrder: lastCap, w0: fixW0 ? poleCentroid(hData) : undefined });
        store.seedFromSystem(sys);
        _seededHData = hData;
        realSel.clear(); elimSel.clear(); refreshPickers();
        if (canvas) canvas.clearSelection();
        rerender();
        return true;
      } catch (e) { showError('Seed from data: ' + ((e && e.message) || e)); return false; }
    }
    // Routing detectors — pointFunctionalMoments / multiNodeRationalData / multiNodeTriangleData — are pure
    // and live in prove-plan.mjs (PROVE.*), unit-tested there; ✦ Prove calls them in doProveExistenceUniqueness.
    // Prove existence/uniqueness via the MOMENT formulation (Phase C1). Re-seeds the workspace with the
    // Aharonov–Shapiro moment system (so the shown derivation IS the proof), then runs PROVE.runMomentPlan
    // (certified real solve → Schur–Cohn φ′ univalence → w₁>0 gauge → rigor verdict). Point-functional only.
    function doProveMoment(pf, hData) {
      let sys; try { sys = QE.pointFunctionalSystem(pf.moments, { order: pf.order }); } catch (e) { showError('Moment system: ' + ((e && e.message) || e)); return; }
      clearError();
      try { store.seedFromPolys({ polys: sys.polys, vars: sys.vars }); } catch (e) { showError('Moment system: could not seed — ' + ((e && e.message) || e)); return; }
      _seededHData = hData; realSel.clear(); elimSel.clear(); refreshPickers(); if (canvas) canvas.clearSelection(); rerender();
      const ctrl = _newAbort(); _abort = ctrl;
      setBusy(true, 'Proving via the moment (point-functional / Aharonov–Shapiro) formulation…');
      const momentCtx = {
        order: pf.order, momentPolys: sys.polys, deps: proveDeps(),
        sliceCaveat, posDimDesc, signal: ctrl && ctrl.signal,
        onStage: stageReporter(PROVE.MOMENT_STAGES),
        classify: () => store.classifyAsync(null, {}, { signal: ctrl && ctrl.signal, onProgress: (info) => setStatus('Moment regime… ' + info.basis + ' generators, ' + info.pairs + ' pairs left') }),
        solveCertified: () => store.solveRealCertifiedAsync(null, {}, { signal: ctrl && ctrl.signal, onProgress: (info) => setStatus('Solving the moment system… ' + info.basis + ' gen, ' + info.pairs + ' pairs') }),
      };
      PROVE.runMomentPlan(momentCtx).then((pr) => {
        _abort = null; setBusy(false); setStatus('');
        if (pr.kind === 'aborted') { toast('Cancelled'); return; }
        if (pr.kind === 'error') { const rn = pr.reason || 'failed'; if (!capFailVerdict('Existence / uniqueness', rn)) showError('Existence / uniqueness: ' + withGuidance(rn)); return; }
        if (pr.kind === 'positive-dim') { renderPositiveDimVerdict(pr); return; }   // degenerate moment data
        if (pr.kind === 'moment') pr.node = pf.node;   // C1-ext-B: the constant term a = φ(0) for the plot
        renderProofVerdict(pr);   // moment / inconsistent / no-real
      }).catch((e) => { _abort = null; setBusy(false); setStatus(''); showError('Existence / uniqueness: ' + ((e && e.message) || e)); });
    }
    // Prove existence/uniqueness via the RATIONAL-φ (multi-node) formulation (Phase C2). Re-seeds the workspace
    // with the degree-2 rational shape system (so the shown derivation IS the proof), then runs
    // PROVE.runRationalPlan (certified real solve in (t,d) → poles-outside-𝔻̄ + Schur–Cohn + boundary-simple
    // univalence → gauge quotient → rigor verdict). Two-real-node data only in this increment.
    function doProveRational(rd, hData) {
      let sys; try { sys = QE.rationalMomentSystem(rd, { degree: 2 }); } catch (e) { showError('Rational system: ' + ((e && e.message) || e)); return; }
      clearError();
      try { store.seedFromPolys({ polys: sys.polys, vars: sys.vars }); } catch (e) { showError('Rational system: could not seed — ' + ((e && e.message) || e)); return; }
      _seededHData = hData; realSel.clear(); elimSel.clear(); refreshPickers(); if (canvas) canvas.clearSelection(); rerender();
      const ctrl = _newAbort(); _abort = ctrl;
      setBusy(true, 'Proving via the rational-φ (multi-node) formulation…');
      const ratCtx = {
        sysPolys: sys.polys, nodeData: rd, deps: proveDeps(),
        sliceCaveat, posDimDesc, signal: ctrl && ctrl.signal,
        onStage: stageReporter(PROVE.RATIONAL_STAGES),
        classify: () => store.classifyAsync(null, {}, { signal: ctrl && ctrl.signal, onProgress: (info) => setStatus('Rational regime… ' + info.basis + ' generators, ' + info.pairs + ' pairs left') }),
        solveCertified: () => store.solveRealCertifiedAsync(null, {}, { signal: ctrl && ctrl.signal, onProgress: (info) => setStatus('Solving the shape system… ' + info.basis + ' gen, ' + info.pairs + ' pairs') }),
      };
      PROVE.runRationalPlan(ratCtx).then((pr) => {
        _abort = null; setBusy(false); setStatus('');
        if (pr.kind === 'aborted') { toast('Cancelled'); return; }
        if (pr.kind === 'error') { const rn = pr.reason || 'failed'; if (!capFailVerdict('Existence / uniqueness', rn)) showError('Existence / uniqueness: ' + withGuidance(rn)); return; }
        if (pr.kind === 'positive-dim') { renderPositiveDimVerdict(pr); return; }
        renderProofVerdict(pr);   // rational / inconsistent / no-real
      }).catch((e) => { _abort = null; setBusy(false); setStatus(''); showError('Existence / uniqueness: ' + ((e && e.message) || e)); });
    }
    // Prove existence/uniqueness via the RATIONAL-φ EQUILATERAL-TRIANGLE (degree-3) formulation (Phase C3).
    // Re-seeds the workspace with the 3-fold-symmetric shape system, then runs PROVE.runTrianglePlan (certified
    // real solve in (P=R², s) → poles-outside-𝔻̄ + Schur–Cohn + boundary-simple univalence → gauge quotient →
    // rigor verdict). Equilateral 3-real-magnitude-node data only in this increment.
    function doProveTriangle(td, hData) {
      let sys; try { sys = QE.triangleMomentSystem(td); } catch (e) { showError('Triangle system: ' + ((e && e.message) || e)); return; }
      clearError();
      try { store.seedFromPolys({ polys: sys.polys, vars: sys.vars }); } catch (e) { showError('Triangle system: could not seed — ' + ((e && e.message) || e)); return; }
      _seededHData = hData; realSel.clear(); elimSel.clear(); refreshPickers(); if (canvas) canvas.clearSelection(); rerender();
      const ctrl = _newAbort(); _abort = ctrl;
      setBusy(true, 'Proving via the rational-φ (equilateral triangle, degree-3) formulation…');
      const triCtx = {
        sysPolys: sys.polys, nodeData: td, deps: proveDeps(),
        sliceCaveat, posDimDesc, signal: ctrl && ctrl.signal,
        onStage: stageReporter(PROVE.TRIANGLE_STAGES),
        classify: () => store.classifyAsync(null, {}, { signal: ctrl && ctrl.signal, onProgress: (info) => setStatus('Triangle regime… ' + info.basis + ' generators, ' + info.pairs + ' pairs left') }),
        solveCertified: () => store.solveRealCertifiedAsync(null, {}, { signal: ctrl && ctrl.signal, onProgress: (info) => setStatus('Solving the shape system… ' + info.basis + ' gen, ' + info.pairs + ' pairs') }),
      };
      PROVE.runTrianglePlan(triCtx).then((pr) => {
        _abort = null; setBusy(false); setStatus('');
        if (pr.kind === 'aborted') { toast('Cancelled'); return; }
        if (pr.kind === 'error') { const rn = pr.reason || 'failed'; if (!capFailVerdict('Existence / uniqueness', rn)) showError('Existence / uniqueness: ' + withGuidance(rn)); return; }
        if (pr.kind === 'positive-dim') { renderPositiveDimVerdict(pr); return; }
        renderProofVerdict(pr);   // triangle / inconsistent / no-real
      }).catch((e) => { _abort = null; setBusy(false); setStatus(''); showError('Existence / uniqueness: ' + ((e && e.message) || e)); });
    }
    // THE one-click orchestrator (finding G-1 + Phase B): from the seeded system to the AUTHORITATIVE
    // genuine-QD verdict, with no manual op-chaining. Runs the cheap reductions (auto-reality if h is
    // real-axis symmetric, then linear propagation to a fixpoint, then Möbius saturation — each a labeled
    // column) and then the FULL pipeline (PROVE.runCertifyPlan: regime → certified real solve → EXACT
    // |z_j|<1 gate → Schur–Cohn fold + boundary-simple filter → gauge quotient → cross-check → rigor
    // verdict). If the reduced system is still POSITIVE-DIMENSIONAL, it ESCALATES to the branch tree
    // (PROVE.runProofTree): auto-walk the factor / forced-pin cases, POOL the genuine φ's across the whole
    // tree, and gauge-quotient ONCE (pool-then-quotient) — turning today's manual pin/split dead-end into
    // an aggregated verdict (an honest LOWER BOUND when a case can't be auto-closed). Escalation is
    // exclusive to this ✦ button; the standalone Certify keeps the manual pin/split card.
    function doProveExistenceUniqueness() {
      if (_abort) return;
      // From-data (PF-2): prove from the current solve when one exists, else DIRECTLY from the raw
      // classical-bounded quadrature data (lastHData) with NO numeric solve — gated on the classical-
      // bounded MODE (state.mode ≠ lqd-*/pqd-*/unbounded). Answers "does a QD exist?" even when the
      // numeric solver failed to find one.
      const fromData = !activeEnv;
      const hData = activeEnv ? activeEnv.hData : (state.mode === 'bounded' ? lastHData : null);
      if (!hData) { toast(activeEnv ? (STR.noSolve || 'No classical bounded QD solved yet.') : 'No classical bounded quadrature data — load a bounded (classical) h (or solve one) first.', { kind: 'error' }); return; }
      if (typeof QD.isBoundaryUnivalent !== 'function') { showError('Univalence: the numeric univalence machinery (solver.js) is not loaded.'); return; }
      // MOMENT ROUTE (Phase C1): point-functional data (a single quadrature node with real M₀) proves via the
      // Aharonov–Shapiro MOMENT formulation — REAL, zero-dimensional, tractable — and it captures OFF-SLICE
      // (non-real-symmetric) domains that the (●)/(★) reality slice misses (and that the conjugate model is
      // positive-dimensional / intractable for). Exclusive to point-functional data.
      const pf = (typeof QE.pointFunctionalSystem === 'function') ? PROVE.pointFunctionalMoments(hData) : null;
      if (pf) { confirmReplace('✦ Prove (moment route)', () => doProveMoment(pf, hData)); return; }
      // MULTI-NODE (rational-φ) route (Phase C2): 2 real quadrature nodes ⇒ the degree-2 rational map — REAL,
      // zero-dimensional in the shape (t=√c, d), certified + univalence-filtered (exclusive to 2-real-node data).
      const rd = (typeof QE.rationalMomentSystem === 'function') ? PROVE.multiNodeRationalData(hData) : null;
      if (rd) { confirmReplace('✦ Prove (rational-φ route)', () => doProveRational(rd, hData)); return; }
      // EQUILATERAL-TRIANGLE (degree-3) route (Phase C3): 3 equal-magnitude real-weight nodes, centroid 0.
      const td = (typeof QE.triangleMomentSystem === 'function') ? PROVE.multiNodeTriangleData(hData) : null;
      if (td) { confirmReplace('✦ Prove (equilateral-triangle route)', () => doProveTriangle(td, hData)); return; }
      if (fromData) { if (_seededHData !== hData && !seedFromDataDirect(hData)) return; } else if (!ensureSeed()) return;
      clearError();
      // Cheap reductions first (best-effort — the pipeline still runs on the current system on any error).
      try {
        const sym = QE.realAxisSymmetry(hData);
        if (sym && sym.allReal && !store.realVars.length) { const r = store.assumeReal(store.baseVariables()); if (r && r.ok) rerender(); }
        for (let i = 0; i < 4; i++) { const pr = store.reducePropagate(); if (!pr || !pr.ok) break; rerender(); if (pr.inconsistent) break; }
        // A-1 / S5-depth: saturate away the {|z_j|=1} + cross Möbius denominator strata (a genuine QD has
        // |z_j|<1, so nothing genuine is dropped). Best-effort — a no-op once the map vars are pinned.
        try { const sr = store.saturateMobius(); if (sr && sr.ok) rerender(); } catch (e) { /* best-effort */ }
        refreshPickers();
      } catch (e) { /* the prelude is best-effort; the pipeline still runs */ }
      const ctrl = _newAbort(); _abort = ctrl;
      setBusy(true, fromData ? 'Proving from data (no numeric solve needed)…' : 'Proving existence / uniqueness…');
      const w0cb = $('#alg-w0-fix'), fixW0 = !w0cb || w0cb.checked;
      const planCtx = fromData ? buildPlanCtx(ctrl, { hData, numPhi: null, w0Sel: fixW0 ? poleCentroid(hData) : undefined }) : buildPlanCtx(ctrl);
      PROVE.runCertifyPlan(planCtx).then((pr) => {
        if (pr.kind === 'positive-dim') {
          // ESCALATE (Phase B): the prelude left it underdetermined with a factorable cause — auto-walk
          // the factor / forced-pin cases and aggregate (pool-then-quotient), not a manual dead-end. The
          // fork mutates + reverts the store per case, so the derivation DAG is unchanged by the walk.
          setStatus('Underdetermined — auto-walking the factor / pin cases…');
          return PROVE.runProofTree(Object.assign({}, planCtx, { fork: buildProveFork(planCtx.params) })).then((tr) => {
            _abort = null; setBusy(false); setStatus('');
            if (tr.kind === 'aborted') { toast('Cancelled'); return; }
            // If the walk CLOSED at least one branch (analyzed a determined sub-case), render the
            // aggregate (pool-then-quotient) verdict. If it made NO progress — every case was an
            // un-enterable general split, so the system is still just underdetermined — fall back to
            // the manual pin/split card (as the standalone Certify shows) rather than a bare "no QD
            // (lower bound)", so the user isn't left without a next action.
            const closedAny = (tr.leaves || []).some((l) => l && (l.kind === 'zero-dim' || l.kind === 'inconsistent' || l.kind === 'no-real'));
            if (tr.count >= 1 || closedAny) renderProofVerdict(tr);
            else renderPositiveDimVerdict(pr);
          });
        }
        _abort = null; setBusy(false); setStatus('');
        if (pr.kind === 'aborted') { toast('Cancelled'); return; }
        if (pr.kind === 'error') { const rn = pr.reason || 'failed'; if (!capFailVerdict('Existence / uniqueness', rn)) showError('Existence / uniqueness: ' + withGuidance(rn)); return; }
        renderProofVerdict(pr);   // inconsistent / no-real / zero-dim
      }).catch((e) => { _abort = null; setBusy(false); setStatus(''); showError('Existence / uniqueness: ' + ((e && e.message) || e)); });
    }
    // The known quadrature-data values (a_j, C_{j,s} and their conjugates) keyed by the
    // conjugate-model variable names — to PIN the parameters for the existence verdict
    // (they are given data, not unknowns).
    function hDataParamValues(hDataArg) {
      const hData = hDataArg || (activeEnv && activeEnv.hData) || (state.mode === 'bounded' ? lastHData : null); if (!hData) return null;
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
        if (!r.ok) { const rn = r.reason || 'unavailable'; if (!capFailVerdict('Existence / uniqueness', rn)) showError('Existence / uniqueness: ' + withGuidance(rn)); return; }
        let verdict;
        if (r.inconsistent) verdict = 'No quadrature domain: the system is inconsistent (1 ∈ I).';
        else if (!r.zeroDim) verdict = 'Infinitely many: a positive-dimensional family (' + posDimDesc(r) + ').';
        else if (r.realCount == null) verdict = 'Zero-dimensional: ' + r.multiplicity + ' complex solution(s) with multiplicity (real count unavailable: ' + (r.reason || '') + ').';
        else {
          const cx = r.complexCount, mult = r.multiplicity;
          const tail = (cx != null ? ' (of ' + cx + ' distinct complex' + (mult != null && mult > cx ? '; ' + mult + ' with multiplicity' : '') + ')' : '');
          if (r.realCount === 0) verdict = 'No real quadrature domain' + tail + '.';
          // HONEST LABELING (C-1): 1 real ALGEBRAIC solution is an upper bound on #QD, not "the unique QD"
          // — it may be non-univalent, a gauge copy, or on the {|z_j|=1} boundary stratum. Only Certify
          // univalence yields the genuine count. (The count>1 branch was already honest; align the ==1 one.)
          else if (r.realCount === 1) verdict = 'A unique real algebraic solution' + tail + ' — an upper bound on the quadrature-domain count; run Certify univalence for the genuine-QD count (gauge copies merged, non-univalent ones filtered).';
          else verdict = r.realCount + ' real algebraic solutions' + tail + ' — run Certify univalence for the genuine-QD count (gauge copies merged, non-univalent ones filtered).';
        }
        // A factor "case" column counts ONE branch of V(p)=⋃V(fᵢ) — the branches add up.
        if (r.partialBranch) {
          const what = r.branchOp === 'component' ? 'a component decomposition' : 'a factor split';
          verdict += '  [case ' + ((r.caseIndex || 0) + 1) + ' of ' + r.caseCount + ' of ' + what
            + ' — this counts THIS branch only; the branches add up to the original.'
            // A decomposition that hit a cost cap may not even COVER V(I), so its branches can sum
            // to less than the whole. That is a strictly weaker claim than a factor split's and has
            // to be said, or a partial cover reads as an exhaustive one.
            + (r.branchIncomplete ? ' ⚠ the decomposition hit a cost cap, so the components may not cover the whole variety — the branch counts then add to a LOWER BOUND, not the total.' : '')
            + ']';
        }
        // A reality/imaginary assumption slices the system — the count is a lower bound (honest labeling).
        verdict += sliceCaveat(r);
        setStatus(verdict);
        if (canvas) showResult({ text: verdict, assumptions: specializationLedger(r), rigor: classifyRigor(r) });
        if (!sel) cacheActiveVerdict(r);   // A6: stamp the active branch's chip (whole last column analyzed)
        toast(verdict, r.inconsistent || r.realCount === 0 ? { kind: 'error' } : {});
      });
    }

    // The per-solution reconstruction + exact univalence filters (phiFromAlgebraSolution,
    // poleSubst, schurCohnFold, nodeInsideDisk, boundarySimpleExact, crossCheckPhis) now live
    // in the pure engine prove-plan.mjs (PROVE.*), so they can be node-tested and, later (Phase B),
    // driven over a branch tree. algebra-ui only builds the deps/oracle + the async op bindings.

    // Build the injected `deps` bag the pure engine reads: the QE/QC/QD data-source namespaces,
    // the store's knownValues snapshot (a var's pinned/eliminated value for φ rebuild), the φ(0)
    // gauge record, and the generation cap.
    function proveDeps() {
      return { QE, QC, QD, known: (store.knownValues && store.knownValues()) || {}, w0Fixed: store.w0Fixed, caps: { maxPoleOrder: lastCap } };
    }
    // Build the pure-engine ctx (deps + oracle + the worker-backed classify/solve bindings) for the
    // current seeded system, bound to the abort controller. Shared by doCertifyUnivalence and the
    // ✦ Prove orchestrator (which ESCALATES to the branch tree on a positive-dimensional result). The
    // pinned quadrature data `params` is stashed on the ctx so the tree's fork re-runs spuriousFactors
    // with the same pinning.
    // ---- strategy transcript ------------------------------------------------
    // Every plan table (CERTIFY / MOMENT / RATIONAL / TRIANGLE) carries a { id, title, why } per
    // stage and the engine faithfully emits onStage(id) as it enters each — roughly twenty written
    // explanations that, until now, NO ctx supplied a handler for, so they reached the user only
    // inside a downloaded qd-proof.json. During a 30-second prove the entire feedback was one line
    // describing a sub-step of stage 1. Zero engine work: just listen.
    function stageReporter(stages) {
      const table = stages || [];
      return (id) => {
        const i = table.findIndex((s) => s.id === id);
        const s = i >= 0 ? table[i] : { title: id, why: '' };
        setStatus('Stage ' + (i >= 0 ? (i + 1) + '/' + table.length : '?') + ' — ' + s.title
          + (s.why ? ' · ' + s.why : ''));
      };
    }
    function buildPlanCtx(ctrl, opts) {
      opts = opts || {};
      const hData = opts.hData || (activeEnv && activeEnv.hData);
      const params = hDataParamValues(hData);
      const w0cb = $('#alg-w0-fix'), fixW0 = !w0cb || w0cb.checked;
      // From-data (Phase D): opts overrides the oracle — numPhi=null (no numeric solve) so the engine's
      // cross-check certifies on the residual alone; w0Sel is the caller's choice (else the solve's w₀).
      const numPhi = ('numPhi' in opts) ? opts.numPhi : ((activeEnv && activeEnv.primary && activeEnv.primary.phi) || null);
      const w0Sel = ('w0Sel' in opts) ? opts.w0Sel : (fixW0 ? (activeEnv && (activeEnv.w0Used || (activeEnv.primary && activeEnv.primary.phi && activeEnv.primary.phi.w0))) : undefined);
      const _solveOpts = { signal: ctrl && ctrl.signal, onProgress: (info) => setStatus('Solving the real system… ' + info.basis + ' generators, ' + info.pairs + ' pairs left') };
      return {
        hData, deps: proveDeps(), params,
        oracle: { numPhi, fixW0, w0Sel },
        signal: ctrl && ctrl.signal, sliceCaveat, posDimDesc,
        onStage: stageReporter(opts.stages || PROVE.CERTIFY_STAGES),
        // REGIME: the heavy reim Gröbner + Hermite real-count in the WORKER (cancellable).
        classify: () => store.classifyAsync(null, { paramValues: params }, {
          signal: ctrl && ctrl.signal,
          onProgress: (info) => setStatus('Certifying univalence… ' + info.basis + ' generators, ' + info.pairs + ' pairs left'),
        }),
        // CERTIFIED-FIRST real solve (#2a): RUR + exact Sturm boxes count EVERY real solution (no
        // clustered-root merging) so the count can be certified; fall back to the numeric eigenvalue solve.
        solveCertified: () => store.solveRealCertifiedAsync(null, { paramValues: params }, _solveOpts),
        solveNumeric: () => store.solveRealAsync(null, { paramValues: params }, _solveOpts),
      };
    }
    // The store-mutation FORK the branch walk drives (Phase B): detect the enterable factor / pin cases
    // of a positive-dimensional system, enter one (checkpointed), and revert. spuriousFactors returns a
    // reim-poly index (not a store node id), so only the variable-PIN factors are directly enterable
    // (substituteValues); a general split (needs applyFactor + a node id) is returned NON-enterable, so
    // the walk honestly flags it as an unexplored case (a LOWER BOUND). leave() undoes down to the
    // recorded maxColumn fence — substituteValues+propagate can add several columns, and
    // _appendReduction self-checkpoints, so a single undo() would not fully revert.
    function buildProveFork(params) {
      const forkStack = [];
      return {
        detectSplits: () => {
          let hits = []; try { hits = store.spuriousFactors(null, { paramValues: params }) || []; } catch (e) { hits = []; }
          for (const h of hits) {
            const cases = (h.factors || []).map((f) => (f.kind === 'variable' && f.pinVar)
              ? { enterable: true, pinVar: f.pinVar, pinValue: f.pinValue || { re: 0, im: 0 } }
              : { enterable: false });
            if (cases.length) return cases;   // one factorable equation's factors partition V(p)=⋃V(fᵢ)
          }
          return [];
        },
        enter: (c) => {
          if (!c.enterable) return false;    // a general split — not auto-enterable ⇒ the walk marks it truncated
          const preMax = store.maxColumn();
          let r; try { r = store.substituteValues([{ varName: c.pinVar, value: c.pinValue }], { propagate: true }); } catch (e) { r = { ok: false }; }
          if (!r || r.ok === false) return false;
          forkStack.push(preMax); return true;
        },
        leave: () => {
          const preMax = forkStack.pop();
          if (preMax == null) return;
          let guard = 0;
          while (store.maxColumn() > preMax && guard++ < 100) { if (!store.undo()) break; }
        },
      };
    }

    // UNIFIED EXISTENCE/UNIQUENESS VERDICT — the authoritative genuine-QD verdict, now a THIN
    // binding over the pure engine PROVE.runCertifyPlan: regime (classify: inconsistent ⇒ no QD;
    // positive-dimensional ⇒ underdetermined, "fix the gauge"; zero-dim ⇒ count) → certified-first
    // real solve → EXACT |z_j|<1 admissibility gate → Schur–Cohn fold + boundary-simple filter →
    // GAUGE QUOTIENT (disk rotations = the same domain, so "N real solutions" → "K genuine QDs") →
    // numeric cross-check → rigor-badged verdict. The DOM/render (progress, verdict card, one-click
    // actions) stays here; the proof logic + the honest verdict string live in the engine.
    function doCertifyUnivalence() {
      if (_abort) return;
      if (!activeEnv) { toast(STR.noSolve || 'No classical bounded QD solved yet.', { kind: 'error' }); return; }
      if (typeof QD.isBoundaryUnivalent !== 'function') { showError('Univalence: the numeric univalence machinery (solver.js) is not loaded.'); return; }
      if (!ensureSeed()) return;
      clearError();
      const ctrl = _newAbort(); _abort = ctrl;
      setBusy(true, 'Certifying univalence (genuine QDs)…');
      PROVE.runCertifyPlan(buildPlanCtx(ctrl)).then((pr) => {
        _abort = null; setBusy(false); setStatus('');
        if (pr.kind === 'aborted') { toast('Cancelled'); return; }
        if (pr.kind === 'error') { const rn = pr.reason || 'failed'; if (!capFailVerdict('Existence / uniqueness', rn)) showError('Existence / uniqueness: ' + withGuidance(rn)); return; }
        if (pr.kind === 'positive-dim') { renderPositiveDimVerdict(pr); return; }
        renderProofVerdict(pr);   // inconsistent / no-real / zero-dim
      }).catch((e) => { _abort = null; setBusy(false); setStatus(''); showError('Existence / uniqueness: ' + ((e && e.message) || e)); });
    }
    // Render a POSITIVE-DIMENSIONAL (underdetermined) verdict: detect FACTORABLE causes (a locator/
    // gauge equation that splits the variety) and offer one-click pin/split actions (#2) that re-run
    // the certificate on the isolated component. The DATA (that it's positive-dim) comes from the
    // engine; the store-driven action buttons are built here.
    function renderPositiveDimVerdict(pr) {
      const cl = pr.cl, text = pr.verdict;
      const actions = []; const seen = {};
      let hits = []; try { hits = store.spuriousFactors(null, { paramValues: hDataParamValues() }) || []; } catch (e) { hits = []; }
      hits.forEach((h) => h.factors.forEach((f) => {
        if (f.kind === 'variable' && f.pinVar) {
          const v = latexPlain(f.pinVar), val = f.pinValue || { re: 0, im: 0 };
          const vs = val.re + (val.im ? (val.im > 0 ? '+' : '') + val.im + 'i' : '');
          const key = 'pin:' + f.pinVar; if (seen[key]) return; seen[key] = 1;
          actions.push({ label: 'Pin ' + v + ' = ' + vs, title: 'An equation factors through ' + v + ' — pin it to isolate the component (substitute + propagate).',
            onClick: () => { const r = store.substituteValues([{ varName: f.pinVar, value: val }], { propagate: true }); if (r && r.ok !== false) { rerender(); refreshPickers(); doCertifyUnivalence(); } } });
        }
        // NOTE: a 'general' reim-side factor deliberately produces NO split action here. It used to,
        // via `h.nodeId` — a field spuriousFactors never returns — so applyFactor(undefined, …) failed
        // 'node not found' and the ok-guard swallowed it: the button did nothing, ever. It could not be
        // repaired by supplying an id, either: these factors are of the REAL (reim) polynomials, where
        // one complex node becomes up to two real ones, and Re(p) = f·g does NOT imply p factors — so
        // f.factorIndex indexes a different factor list than applyFactor's. The valid case-split is
        // offered below, computed from the nodes' OWN factorizations.
      }));
      // Genuine case-splits: a CURRENT-COLUMN equation whose own (complex) polynomial factors, so
      // V(p) = ⋃ₖ V(fₖ) and applyFactor can pursue a case. This is the actionable escape from a
      // positive-dimensional dead end, and it is independent of the reim analysis above.
      try {
        store.list().filter((n) => n.rel === '=' && n.column === store.maxColumn()).forEach((n) => {
          if (seen['split:' + n.id]) return;
          const cnt = _factorCount(n.id);          // cached; 0 ⇒ irreducible / past a factorizer cap
          if (cnt < 2) return;
          seen['split:' + n.id] = 1;
          actions.push({ label: 'Split ' + (n.label || 'equation') + ' → case 1 of ' + cnt,
            title: 'This equation factors: V(p) = ⋃ₖ V(fₖ). Pursue case 1 in a new column — the other cases still have to be pursued for a complete count (undo to pick another, or fork).',
            onClick: () => {
              if (busyGuard()) return;
              const r = store.applyFactor(n.id, 0);
              if (!r || !r.ok) { showError('Split into cases: ' + ((r && r.reason) || 'failed')); return; }
              rerender(); refreshPickers();
              toast('Split → case 1 of ' + r.factorCount + ' (column ' + r.column + '); undo to pursue another case.');
              doCertifyUnivalence();
            } });
        });
      } catch (e) { /* the split offer is best-effort — never break the verdict card */ }
      // The canonical way out of a positive-dimensional system: decompose the variety and analyze one
      // component at a time. Offered unconditionally here — this is the state it exists for, and the
      // card's other actions depend on spuriousFactors finding something, which it often does not.
      actions.push({ label: 'Decompose into components',
        title: 'Split V(I) into irreducible components (minimal primes) and enter one. Each is analyzed alone and the existence counts add up — the standard route out of an underdetermined system.',
        onClick: () => { const sec = $('#alg-sections'); if (sec) { const d = sec.querySelector('details.algebra-section:nth-of-type(2)'); if (d) d.open = true; } doDecompose('components'); } });
      if (canvas) showResult({ text, actions: actions.slice(0, 6), assumptions: specializationLedger(cl), rigor: 'unknown' });
      setStatus(text); toast('Positive-dimensional — fix the gauge / pin a forced variable.', { kind: 'error' });
    }
    // Render a terminal verdict card (inconsistent / no-real / zero-dim, or an aggregated 'tree' result
    // from the Phase-B branch walk). For a zero-dim OR tree result with genuine QDs it adds the one-click
    // derivation actions: the exact boundary curve Q(w,w̄)=0 (+ Schwarz S(w)) and "View in the QD plot"
    // for the first genuine QD, and always the reproducible derivation-DAG export.
    function renderProofVerdict(pr) {
      const cl = pr.cl, verdict = pr.verdict;
      const distinct = pr.distinctPhis || [];
      const D = pr.count || 0;
      const rows = pr.rows || [];
      setStatus(verdict);
      const vActions = [];
      const isReconstructKind = pr.kind === 'moment' || pr.kind === 'rational' || pr.kind === 'triangle';
      if (pr.kind === 'zero-dim' || pr.kind === 'tree' || isReconstructKind) {
        // #1 (roadmap ALGEBRA_EXTENSIONS): a one-click EXACT boundary curve for a genuine QD. (The moment /
        // rational / triangle routes' genuine maps are POLYNOMIAL / RATIONAL φ, not the (z_j,A) ansatz — the
        // boundary-curve / QD-plot actions below are (z_j,A)-specific, so they are skipped for those kinds;
        // each draws its reconstructed-φ thumbnail below instead.)
        if (!isReconstructKind && D >= 1 && QE && typeof QE.boundaryCurveFromPhi === 'function') {
          vActions.push({
            label: 'Show exact boundary curve',
            title: 'Eliminate the disk parameter to get the exact algebraic boundary curve Q(w,w̄)=0 and, when single-valued, the Schwarz function S(w) of the reconstructed quadrature domain (exact over ℚ(i) for the rationalized solution).',
            onClick: () => {
              let bc; try { bc = QE.boundaryCurveFromPhi(distinct[0]); }
              catch (e) { toast('Boundary curve: ' + ((e && e.message) || e), { kind: 'error' }); return; }
              const latex = [bc.latexQ]; if (bc.latexS) latex.push(bc.latexS);
              let plot = null; try { plot = (QD && typeof QD.evalPhi === 'function') ? domainPlotData(distinct[0], QD.evalPhi) : null; } catch (e) { plot = null; }
              const note = ' · exact boundary curve Q(w,w̄)=0 (over ℚ(i), rationalized solution; order ' + bc.order +
                (bc.schwarz ? ', Schwarz function S(w) single-valued' : '; Schwarz function algebraic of degree ' + bc.degWb) + ')';
              // `bound` carries the DIRECTION of a rigor:'bound' result — a truncated tree walk proves a
              // LOWER bound (≥) and rendering the default '≤' would state the opposite of the proof.
              if (canvas) showResult({ text: verdict + note, solutionsLatex: latex, plot, solutionsText: rows.join('\n'), assumptions: specializationLedger(cl), actions: vActions, rigor: pr.rigor, bound: pr.bound });
            },
          });
        }
        // #3b (roadmap): hand the reconstructed genuine QD to the geometric QD tab (algebra→geometry).
        if (!isReconstructKind && D >= 1 && ctx && typeof ctx.showQDSolution === 'function' && activeEnv && activeEnv.hData && distinct[0]) {
          vActions.push({
            label: 'View in the QD plot',
            title: 'Render the reconstructed quadrature domain in the geometric QD tab (boundary, cusps, critical set) and switch to it.',
            onClick: () => { if (!ctx.showQDSolution(distinct[0], activeEnv.hData)) toast('Could not open in the QD plot', { kind: 'error' }); },
          });
        }
        // S5-depth: one-click export of the full derivation DAG — a reproducible, re-importable proof object.
        if (typeof store.exportDAG === 'function') {
          vActions.push({
            label: 'Export proof (JSON)',
            title: 'Download the full PROOF: the existence/uniqueness verdict + the rigor badge with its audit trail (why =/≥/≈), the per-solution rows and assumption ledger, the strategy stages, AND the whole derivation DAG (every column, assumption, provenance op). Reproducible + re-importable (Load workspace).',
            onClick: () => {
              try {
                const proof = {
                  kind: pr.kind, verdict: pr.verdict, rigor: pr.rigor, bound: pr.bound || null, count: (pr.count != null ? pr.count : null),
                  rigorProvenance: pr.rigorProvenance || [], perSolution: rows, assumptions: specializationLedger(cl),
                  stages: ((pr.kind === 'moment' ? PROVE.MOMENT_STAGES : pr.kind === 'rational' ? PROVE.RATIONAL_STAGES : pr.kind === 'triangle' ? PROVE.TRIANGLE_STAGES : PROVE.CERTIFY_STAGES) || []).map((s) => ({ id: s.id, title: s.title, why: s.why })),
                };
                const out = { format: 'qd-proof', version: 1, proof, derivation: store.exportDAG() };
                const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'qd-proof.json'; document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
                toast('Proof exported (qd-proof.json) — verdict + rigor audit trail + derivation DAG.');
              } catch (e) { toast('Export failed: ' + ((e && e.message) || e), { kind: 'error' }); }
            },
          });
        }
      }
      const vSet = { text: verdict, assumptions: specializationLedger(cl), rigor: pr.rigor };
      if (pr.rigorProvenance && pr.rigorProvenance.length) vSet.rigorProvenance = pr.rigorProvenance;   // Phase E: "why this rigor"
      if (rows.length) vSet.solutionsText = rows.join('\n');
      // C1-ext-B: the moment route's genuine map is the POLYNOMIAL φ = a + Σ w_k zᵏ, so plot its boundary
      // φ(∂𝔻) + the quadrature node a straight from the coefficients (cheap — no elimination). Shows the
      // FIRST genuine QD when several exist (the count is already in the verdict).
      if (pr.kind === 'moment' && pr.genuine && pr.genuine.length && pr.genuine[0] && pr.genuine[0].w) {
        const g0 = pr.genuine[0];
        let mp = null; try { mp = momentPlotData(g0.w, g0.order || pr.order, pr.node); } catch (e) { mp = null; }
        if (mp) {
          vSet.plot = mp;
          vSet.plotCaption = 'reconstructed domain φ(∂𝔻) = a + Σ wₖzᵏ · node a = φ(0)' + (D > 1 ? ' · showing 1 of ' + D : '');
        }
      }
      // C2-4: the rational route's genuine map is φ = w0 + R(z + dz²)/(1 − cz²) — sample its boundary φ(∂𝔻)
      // from the reconstructed shape + mark the two quadrature nodes (the given data). Cheap; no elimination.
      if (pr.kind === 'rational' && pr.genuine && pr.genuine.length && pr.genuine[0]) {
        const nds = (pr.nodeData && pr.nodeData.nodes) || [];
        let rp = null; try { rp = rationalPlotData(pr.genuine[0], nds); } catch (e) { rp = null; }
        if (rp) {
          vSet.plot = rp;
          vSet.plotCaption = 'reconstructed domain φ(∂𝔻) = w₀ + R(z+dz²)/(1−cz²) · quadrature nodes' + (D > 1 ? ' · showing 1 of ' + D : '');
        }
      }
      // C3-4: the triangle route's genuine map is φ = R·z/(1 − c·z³) — sample its boundary + mark the 3 nodes.
      if (pr.kind === 'triangle' && pr.genuine && pr.genuine.length && pr.genuine[0]) {
        const nds = (pr.nodeData && pr.nodeData.nodes) || [];
        let tp = null; try { tp = trianglePlotData(pr.genuine[0], nds); } catch (e) { tp = null; }
        if (tp) {
          vSet.plot = tp;
          vSet.plotCaption = 'reconstructed domain φ(∂𝔻) = R·z/(1−cz³) · quadrature nodes' + (D > 1 ? ' · showing 1 of ' + D : '');
        }
      }
      if (vActions.length) vSet.actions = vActions;
      if (canvas) showResult(vSet);
      toast(verdict, pr.bad ? { kind: 'error' } : {});
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
        // EXACT: χ, its square-free part and the discriminant are computed symbolically over ℚ(i);
        // `degenerate` (disc = 0) is itself an exact conclusion, not a failure to certify.
        if (canvas) showResult({ text, solutionsLatex: mathLatex, rigor: 'exact' });
        toast(text, r.degenerate ? { kind: 'error' } : {});
      }, 20);
    }

    // Repopulate the bifurcation parameter picker from the current column's reim variables.
    function refreshBifurcVars() {
      const sel = $('#alg-bifurc-var'); if (!sel) return;
      let vars = []; try { vars = store.reimVariables(null, { paramValues: hDataParamValues() }) || []; } catch (e) { /* none */ }
      const prev = sel.value;
      sel.innerHTML = vars.map((v) => '<option value="' + v + '">' + friendlyReim(v) + '</option>').join('');
      if (vars.indexOf(prev) !== -1) sel.value = prev;
    }
    // 1-parameter BIFURCATION over a chosen real variable: how the number of real solutions (=
    // quadrature domains) changes as that parameter ranges over ℝ (store.parametricBifurcation →
    // Sym.parametricRealCount1D: eliminant border polynomial + Sturm critical values + a Hermite
    // count per interval). Off the main thread (heavy Gröbner / elimination), cancellable. Counts
    // are EXACT (=); critical values are isolating boxes (≤, shown ≈ when not an exact rational).
    function doBifurcation() {
      if (_abort) return;
      if (!ensureSeed()) return;
      clearError();
      refreshBifurcVars();
      const sel = $('#alg-bifurc-var'); const v = sel && sel.value;
      if (!v) { showError('Bifurcation: no real variable available — reduce to a finite (reality-assumed) system first.'); return; }
      const ctrl = _newAbort(); _abort = ctrl;
      setBusy(true, 'Computing the bifurcation…');
      store.parametricBifurcationAsync(null, v, { paramValues: hDataParamValues() }, { signal: ctrl && ctrl.signal }).then((r) => {
        _abort = null; setBusy(false); setStatus('');
        if (r.aborted) { toast('Cancelled'); return; }
        if (!r.ok) { showError('Bifurcation: ' + withGuidance(r.reason || 'unavailable')); return; }
        const fv = friendlyReim(v);
        const fmt = (x) => (x == null ? '' : Math.round(x * 1e6) / 1e6);
        const parts = r.cells.map((c) => {
          const lo = c.lo == null ? '−∞' : fmt(c.lo), hi = c.hi == null ? '+∞' : fmt(c.hi);
          return (c.ok ? c.realCount : '?') + ' on (' + lo + ', ' + hi + ')';
        });
        const critStr = r.criticalValues.length
          ? r.criticalValues.map((c) => (c.exact ? '' : '≈') + fmt(c.approx)).join(', ')
          : '(none — the count is constant)';
        let text = 'Bifurcation in ' + fv + ': real-solution count = ' + parts.join('; ') + '. Critical ' + fv + ' = ' + critStr + '.';
        if (r.crosschecked === false) text += ' ⚠ the eliminant did not fully cross-check (a separating form was not confirmed) — the critical set may be incomplete, though each interval’s count is still exact at its sample.';
        setStatus(text);
        // Each interval's count is exact at its sample, but an un-cross-checked eliminant may have
        // MISSED a critical value (so a cell could straddle a bifurcation), and a cell with ok:false
        // has no count at all — both are 'partial' (may be incomplete), never a bare '='.
        const bifPartial = (r.crosschecked === false) || r.cells.some((c) => !c.ok);
        if (canvas) showResult({ text, rigor: bifPartial ? 'partial' : 'exact' });
        toast('Bifurcation computed (' + r.cells.length + ' interval' + (r.cells.length === 1 ? '' : 's') + ').');
      }, (e) => { _abort = null; setBusy(false); setStatus(''); showError('Bifurcation: ' + ((e && e.message) || String(e))); });
    }

    // ---- Shape from moments (roadmap #18): reconstruct a QD's data from its complex moments ----
    // A real number "a", exact rational "n/d", or decimal.
    function _parseMomentNum(s) {
      s = s.trim();
      if (s === '' || s === '+') return 1;
      if (s === '-') return -1;
      if (s.indexOf('/') >= 0) { const p = s.split('/'); const n = Number(p[0]), d = Number(p[1]); if (!isFinite(n) || !isFinite(d) || d === 0) throw new Error('bad rational "' + s + '"'); return n / d; }
      const v = Number(s);
      if (!isFinite(v)) throw new Error('bad number "' + s + '"');
      return v;
    }
    // One complex moment token: a, a+bi, a-bi, bi, i, -i (a,b real / rational / decimal).
    function _parseMomentToken(t) {
      t = t.replace(/\s+/g, '');
      if (t === '') throw new Error('empty moment');
      if (t.indexOf('i') < 0) return { re: _parseMomentNum(t), im: 0 };
      if (t[t.length - 1] !== 'i') throw new Error('malformed complex "' + t + '" (i must be last)');
      const noI = t.slice(0, -1); // drop the trailing 'i'
      let splitAt = -1;
      for (let k = noI.length - 1; k > 0; k--) { if (noI[k] === '+' || noI[k] === '-') { splitAt = k; break; } }
      const reStr = splitAt < 0 ? '0' : noI.slice(0, splitAt);
      const imStr = splitAt < 0 ? noI : noI.slice(splitAt);
      return { re: reStr === '' ? 0 : _parseMomentNum(reStr), im: _parseMomentNum(imStr === '' ? '1' : imStr) };
    }
    function _fmtComplex(c) {
      const re = Math.abs(c.re) < 1e-10 ? 0 : Math.round(c.re * 1e6) / 1e6;
      const im = Math.round(c.im * 1e6) / 1e6;
      if (Math.abs(im) < 1e-8) return String(re);
      return re + (im < 0 ? ' − ' : ' + ') + Math.abs(im) + 'i';
    }
    // LaTeX of the (ascending {re,im}) Prony polynomial P(z) = Σ c_k z^k = 0.
    function _pronyLatex(coeffs) {
      let out = '';
      for (let k = coeffs.length - 1; k >= 0; k--) {
        const c = coeffs[k];
        const re = Math.round(c.re * 1e6) / 1e6, im = Math.round(c.im * 1e6) / 1e6;
        if (Math.abs(re) < 1e-9 && Math.abs(im) < 1e-9) continue;
        const zp = k === 0 ? '' : (k === 1 ? 'z' : 'z^{' + k + '}');
        let sign, mag;
        if (Math.abs(im) < 1e-8) {
          sign = re < 0 ? '-' : '+';
          const a = Math.abs(re);
          mag = (Math.abs(a - 1) < 1e-8 && zp) ? '' : String(a);
        } else {
          sign = '+';
          mag = '(' + re + (im < 0 ? '-' : '+') + Math.abs(im) + 'i)';
        }
        const term = (mag + zp) || '0';
        out += out === '' ? (sign === '-' ? '-' + term : term) : ' ' + sign + ' ' + term;
      }
      return (out || '0') + ' = 0';
    }
    function _renderShapeResult(out, r) {
      if (!out) return;
      out.innerHTML = '';
      const add = (html) => { const d = document.createElement('div'); d.innerHTML = html; out.appendChild(d); };
      add('<strong>Order ' + r.order + '</strong>' + (r.saturated ? ' <span class="hint">(≥ — the Hankel is saturated; supply more moments to confirm)</span>' : '') + ' <span class="hint">— #nodes = the exact QD-order (Hankel rank)</span>');
      const wrap = document.createElement('div'); wrap.style.margin = '3px 0';
      wrap.innerHTML = '<span class="hint">Prony polynomial (exact):</span> ';
      const pd = document.createElement('span'); const tex = _pronyLatex(r.coeffs);
      if (typeof katex !== 'undefined') { try { katex.render(tex, pd, { throwOnError: false }); } catch (e) { pd.textContent = tex; } } else pd.textContent = tex;
      wrap.appendChild(pd); out.appendChild(wrap);
      add('<span class="hint">Nodes zⱼ (≈):</span> ' + r.nodes.map(_fmtComplex).join(', &nbsp;'));
      add('<span class="hint">Weights aⱼ (≈):</span> ' + r.weights.map(_fmtComplex).join(', &nbsp;'));
      add('<span class="hint">reconstruction residual maxₖ |mₖ − Σⱼ aⱼzⱼᵏ| = ' + (r.maxResidual != null ? r.maxResidual.toExponential(2) : '—') + '</span>');
    }
    function doShapeFromMoments() {
      if (_abort) return;
      clearError();
      const inp = $('#alg-moments'), out = $('#alg-moments-out');
      const raw = inp && inp.value ? inp.value.trim() : '';
      if (!raw) { if (out) out.innerHTML = ''; return; }
      let moments;
      try { moments = raw.split(',').map((s) => s.trim()).filter((s) => s.length).map(_parseMomentToken); }
      catch (e) { showError('Shape from moments: ' + ((e && e.message) || 'parse error')); return; }
      if (moments.length < 2) { showError('Shape from moments: give at least 2 moments (m₀, m₁, …).'); return; }
      const ctrl = _newAbort(); _abort = ctrl;
      setBusy(true, 'Reconstructing from moments…');
      store.shapeFromMomentsAsync(moments, {}, { signal: ctrl && ctrl.signal }).then((r) => {
        _abort = null; setBusy(false); setStatus('');
        if (r.aborted) { toast('Cancelled'); return; }
        if (!r.ok) { showError('Shape from moments: ' + withGuidance(r.reason || 'unavailable')); return; }
        _renderShapeResult(out, r);
        toast('Reconstructed: order ' + r.order + (r.saturated ? ' (≥ — supply more moments)' : '') + '.');
      }, (e) => { _abort = null; setBusy(false); setStatus(''); showError('Shape from moments: ' + ((e && e.message) || String(e))); });
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
        else toast('Positive-dimensional: infinitely many solutions (' + posDimDesc(r) + ') — assume more variables real or add constraints.');
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
        if (!r.ok) { const rn = r.reason || 'unavailable'; if (!capFailVerdict('Numeric solve', rn)) showError('Numeric solve: ' + withGuidance(rn)); return; }
        // The eigenvalue fallback can return a PARTIAL set on clustered/near-multiple roots.
        const partial = r.complete === false ? ' — PARTIAL: clustered roots, some solutions may be missing' : '';
        // C4: report how many complex solutions the active assumptions filtered out.
        const pruned = r.prunedByAssumptions ? ' (' + r.prunedByAssumptions + ' dropped by active assumptions)' : '';
        const text = 'Solved: ' + r.solutions.length + ' solution(s)' + pruned + ' (dimension ' + r.dimension + ')' + partial + '.';
        // G-misc-1: surface the coordinates in the VERDICT CARD (not only the browser console) — badged 'estimate'
        // (numeric solve), or 'partial' when the eigenvalue fallback under-separated a cluster.
        const fmt = (x) => (Math.round(x * 1e6) / 1e6);
        const rows = (r.solutions || []).slice(0, 8).map((s, i) =>
          '#' + (i + 1) + '  ' + Object.keys(s).sort().map((k) =>
            latexPlain(k) + '=' + fmt(s[k].re) + (Math.abs(s[k].im) < 1e-6 ? '' : (s[k].im >= 0 ? '+' : '−') + fmt(Math.abs(s[k].im)) + 'i')).join('  ')).join('\n')
          + (r.solutions.length > 8 ? '\n… ' + (r.solutions.length - 8) + ' more (full set in the console)' : '');
        if (canvas) showResult({ title: 'Numeric solve', text, solutionsText: rows, rigor: (r.complete === false) ? 'partial' : 'estimate' });
        toast(text, partial ? { kind: 'error' } : {});
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
    // A column whose nodes carry fork provenance is a forked branch's COPY — not the original
    // system — even though forkTrack writes it at column 0. Every surface that special-cases
    // column 0 has to ask this first, or it claims a provenance the column does not have.
    function isForkedColumn(ns) { return (ns || []).some((n) => n.provenance && n.provenance.op === 'fork'); }
    function columnLabel(c, ns) {
      const ctx = { latexPlain, substList, ratioStrRec, valStr, trackLabelOf, ns, c };
      // A branch forked five reductions deep would otherwise fall into the `c === 0` case below and
      // read "Original system", beside the parent assumptions it actually inherited. Resolve a fork
      // from provenance FIRST; only a column 0 with no fork is genuinely the original system.
      const fk = (ns || []).find((n) => n.provenance && n.provenance.op === 'fork');
      if (fk) return PROV_UI.fork.column(fk.provenance, ctx);
      if (c === 0) return 'Original system' + (store.formulation === 'schwarz' ? ' (Schwarz formulation)' : '') +
        (store.w0Fixed ? ' · φ(0) fixed' : '');
      const rep = (ns || []).find((n) => n.provenance && n.provenance.op !== 'conjugate' && n.provenance.op !== 'propagate') || (ns || [])[0];
      const p = (rep && rep.provenance) || {};
      const d = PROV_UI[p.op];                                     // op → its .column label (registry)
      return (d && d.column) ? d.column(p, ctx) : ('↳ column ' + c);
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
        onContextMenu: (id, x, y) => openNodeMenu(id, x, y),
      });
      buildToolbar(surface);
      // Into the canvas's bottom RAIL, not floating over the surface: as free-floating overlays
      // these sat at z-index 11, above the verdict card, so they painted over the result on any
      // surface narrower than ~1000px.
      const rail = (canvas && canvas.rail) || surface;
      trackbar = document.createElement('div'); trackbar.className = 'algebra-trackbar hidden';
      rail.appendChild(trackbar);
      breadcrumb = document.createElement('div'); breadcrumb.className = 'algebra-breadcrumb';
      rail.appendChild(breadcrumb);
      // Keyboard a11y (active only while the Algebra tab is visible, and not while typing in
      // a field): Esc clears the selection; Delete/Backspace deletes a single selected node.
      document.addEventListener('keydown', (ev) => {
        if (!surface || surface.classList.contains('hidden')) return;
        const ae = document.activeElement;
        if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;
        // An open card menu owns the keyboard. Its own handler stops the keys it uses, but
        // the single-key accelerators below would otherwise still fire *through* it — so
        // pressing `p` to skim the menu would launch a proof.
        if (_ctxMenu) return;
        const sel = canvas ? canvas.getSelection() : [];
        const mod = ev.ctrlKey || ev.metaKey;
        // Undo/redo were reachable ONLY as two unlabeled glyphs in a floating toolbar, so a user
        // who pressed Ctrl+Z (and saw nothing happen) would reasonably conclude the workspace has
        // no undo at all — while Delete, which removes a node AND its descendants, was bound.
        // Both accelerator spellings: Ctrl/Cmd+Shift+Z and Ctrl+Y.
        if (mod && (ev.key === 'z' || ev.key === 'Z') && !ev.shiftKey) {
          if (busyGuard()) return;
          if (store.undo()) { if (canvas) canvas.clearSelection(); rerender(); refreshPickers(); toast('Undo'); }
          else toast('Nothing to undo', { kind: 'error' });
          ev.preventDefault(); return;
        }
        if (mod && ((ev.key === 'z' || ev.key === 'Z') && ev.shiftKey || ev.key === 'y' || ev.key === 'Y')) {
          if (busyGuard()) return;
          if (store.redo()) { if (canvas) canvas.clearSelection(); rerender(); refreshPickers(); toast('Redo'); }
          else toast('Nothing to redo', { kind: 'error' });
          ev.preventDefault(); return;
        }
        // Arrow keys walk the DAG. Cards are tabIndex=0, so Tab takes ~5 stops per card — about 400
        // presses to cross ten columns. ←/→ move between lanes, ↑/↓ within one, Home/End to the ends.
        if (!mod && canvas && canvas.moveSelection) {
          const nav = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
          if (nav) { if (canvas.moveSelection(nav[0], nav[1])) ev.preventDefault(); return; }
          if (ev.key === 'Home' || ev.key === 'End') {
            if (canvas.moveSelection(0, 0, ev.key === 'Home' ? 'home' : 'end')) ev.preventDefault();
            return;
          }
        }
        // `/` focuses the node search (the conventional binding; it is not a typing target here
        // because the guard above already returned for INPUT/SELECT/TEXTAREA).
        if (!mod && ev.key === '/') { const s = document.getElementById('alg-search'); if (s) { s.focus(); s.select(); ev.preventDefault(); return; } }
        // Single-key accelerators for the primary actions. Each dispatches through its BUTTON
        // rather than calling the handler: the button carries every gate the click path has
        // (setBusy disables it mid-worker; some stay disabled until a solve exists), so a
        // keystroke can never reach a state a click would refuse — and the gates stay in one
        // place. A disabled button swallows .click() silently, hence the say-why toast.
        if (!mod && !ev.altKey) {
          const act = KEY_ACTIONS[ev.key];
          if (act) {
            const b = $(act.sel);
            if (!b) return;
            if (b.disabled) { toast(act.name + ' is not available right now', { kind: 'error' }); ev.preventDefault(); return; }
            // Seeding discards the derivation. Clicking a labelled button is an aimed act;
            // brushing a key is not, so the keystroke asks first where the click does not.
            if (act.reseeds) confirmReplace(act.name, () => b.click());
            else b.click();
            ev.preventDefault(); return;
          }
          // Fork branches from the selected node's column, else from the newest column —
          // the same two choices the "Fork from here" action and the trackbar button offer.
          if (ev.key === 'f') {
            if (busyGuard()) { ev.preventDefault(); return; }
            const n = sel.length === 1 ? store.get(sel[0]) : null;
            const col = n ? n.column : store.maxColumn();
            if (canvas) canvas.clearSelection();
            doFork(col); ev.preventDefault(); return;
          }
          // The card actions were pointer-only: right-click opened them and nothing else did,
          // so a keyboard user could select a card (arrows) and then reach none of its ten
          // actions. Shift+F10 / the Menu key are the platform conventions; `m` is the local one.
          if (sel.length === 1 && (ev.key === 'm' || ev.key === 'ContextMenu' || (ev.shiftKey && ev.key === 'F10'))) {
            const el = surface.querySelector('.algebra-node[data-id="' + String(sel[0]).replace(/"/g, '\\"') + '"]');
            const r = el ? el.getBoundingClientRect() : null;
            openNodeMenu(sel[0], r ? r.left + 12 : 80, r ? r.top + 24 : 80);
            ev.preventDefault(); return;
          }
        }
        if (ev.key === 'Escape') { if (sel.length && canvas) { canvas.clearSelection(); ev.preventDefault(); } }
        else if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel.length === 1) {
          if (busyGuard()) return;
          const removed = store.deleteNode(sel[0]); if (canvas) canvas.clearSelection(); rerender();
          // Deleting cascades to descendants, so the toast has to say the recovery path exists.
          toast('Deleted ' + ((removed && removed.length) || 1) + ' node(s) — Ctrl+Z to undo'); ev.preventDefault();
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
        const ns = store.list().filter((n) => (n.track || 't0') === at && n.column === c.index);
        const info = columnInfo(c.index, ns);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'algebra-bc-chip' + (c.index === mx ? ' is-current' : '');
        // 'original' only for a genuine column 0 — a forked branch's column 0 falls through to its
        // own label ("forked from …"), matching the lane header instead of contradicting it.
        chip.textContent = info.step + ((c.index === 0 && !isForkedColumn(ns)) ? ' original' : ' ' + (info.label || '').replace(/^↳\s*/, ''));
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
      // Ancestry is REAL data (parentId / forkColumn) that was being spent entirely on a hover
      // tooltip, so five branches — two of them forked off branch 3 — rendered as five peers. For a
      // tool whose model is a ProofTree of case splits, the tree was the one thing not drawn.
      // Order parents before their children and mark the depth, so the rail reads as a hierarchy.
      const all = store.tracks();
      const byParent = new Map();
      all.forEach((t) => { const k = t.parentId || ''; if (!byParent.has(k)) byParent.set(k, []); byParent.get(k).push(t); });
      const ordered = [];
      (function walk(parentKey, depth) {
        (byParent.get(parentKey) || []).forEach((t) => { ordered.push({ t, depth }); walk(t.id, depth + 1); });
      })('', 0);
      // Any track whose parent is missing (a deleted ancestor) would be dropped by the walk — keep
      // it rather than silently hiding a branch that still holds work.
      all.forEach((t) => { if (!ordered.some((o) => o.t.id === t.id)) ordered.push({ t, depth: 0 }); });
      ordered.forEach(({ t, depth }) => {
        const chip = document.createElement('span');
        chip.className = 'algebra-track-chip' + (t.id === active ? ' is-current' : '') + (depth ? ' is-child' : '');
        if (depth) {
          chip.style.setProperty('--alg-depth', String(depth));
          const arrow = document.createElement('span');
          arrow.className = 'algebra-track-from';
          arrow.textContent = '↳';
          arrow.title = 'forked from ' + (trackLabelOf(t.parentId) || t.parentId) + ' · column ' + (t.forkColumn != null ? t.forkColumn : '?');
          chip.appendChild(arrow);
        }
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
    // ---- results drawer (P6b) ------------------------------------------------
    // Every analysis wrote into ONE docked verdict slot. Eleven call sites — solve, classify,
    // dimension, prove, bifurcation, resolvent, univalence, RCTD import, shape-from-moments —
    // competed for a single lastVerdictData, so running Dimension after Classify DESTROYED
    // Classify's answer with no way back, on results that cost tens of seconds each.
    //
    // They now go through showResult, which keeps each one keyed by the system it was computed
    // about: (track, branchSig). That key is the whole point. A result computed three reductions
    // ago, redisplayed beside today's column still wearing its original '=' pill, is a false
    // attribution — the worst class of bug this project has (CLAUDE.md honest labeling). The key
    // is what lets the drawer tell "still true of what you are looking at" from "was true of
    // something else", and demote the second on sight.
    const RESULTS_CAP = 40;
    const _results = [];            // newest first: { id, track, sig, data }
    let _resultSeq = 0;
    let _resultsDropped = 0;        // surfaced in the drawer — a silent cap reads as "that's all"
    // Results are SESSION-scoped and deliberately not autosaved: restoring a verdict across a
    // reload would restore a claim about a system state that may no longer exist, which is the
    // same false attribution with a longer fuse.
    function showResult(data) {
      if (!canvas) return;
      if (data && data.text) {
        const track = store.activeTrack;
        _results.unshift({ id: ++_resultSeq, track, sig: _branchSig(track), data });
        while (_results.length > RESULTS_CAP) { _results.pop(); _resultsDropped++; }
        renderDrawer();
      }
      canvas.setVerdict(data);
    }
    // Bind the pure decision (resultStateOf, module scope) to the live store.
    function resultState(r) {
      const cur = store.activeTrack;
      return resultStateOf(r.track, r.sig, cur, _branchSig(cur));
    }
    function reshowResult(r) {
      const st = resultState(r);
      if (st === 'current') { canvas.setVerdict(r.data); return; }
      canvas.setVerdict(Object.assign({}, r.data, {
        stale: true,
        // 'the derivation has changed since' is the right sentence for a same-branch result and
        // the WRONG one for a cross-branch result — it implies a history this branch never had.
        staleNote: st === 'branch'
          ? '⚠ Computed on ' + trackLabelOf(r.track) + ', and you are viewing ' + trackLabelOf(store.activeTrack)
            + '. It describes that branch’s system — not this one. Switch branches to see it in context.'
          : undefined,
      }));
    }
    function renderDrawer() {
      const host = canvas && canvas.drawer; if (!host) return;
      host.innerHTML = '';
      if (!_results.length) { host.classList.add('hidden'); return; }
      host.classList.remove('hidden');
      const head = document.createElement('div'); head.className = 'algebra-drawer-head';
      const toggle = document.createElement('button');
      toggle.type = 'button'; toggle.className = 'algebra-drawer-toggle';
      toggle.textContent = _drawerOpen ? '▾' : '▸';
      toggle.title = _drawerOpen ? 'Collapse the results list' : 'Show the results list';
      toggle.addEventListener('click', () => { _drawerOpen = !_drawerOpen; renderDrawer(); });
      const lbl = document.createElement('span'); lbl.className = 'algebra-line-label';
      lbl.textContent = 'Results (' + _results.length + ')';
      head.appendChild(toggle); head.appendChild(lbl);
      host.appendChild(head);
      if (!_drawerOpen) return;
      const list = document.createElement('div'); list.className = 'algebra-drawer-list';
      _results.forEach((r) => {
        const st = resultState(r);
        const row = document.createElement('button');
        row.type = 'button'; row.className = 'algebra-drawer-row is-' + st;
        const rm = (QD.AlgebraCanvas && QD.AlgebraCanvas.rigorMeta)
          ? QD.AlgebraCanvas.rigorMeta(r.data.rigor, r.data.bound) : null;
        if (rm) {
          const pill = document.createElement('span'); pill.className = 'algebra-drawer-pill';
          pill.textContent = rm.symbol; pill.style.background = rm.color;
          // The pill states the rigor of the ORIGINAL computation. On anything but a current
          // result that claim no longer applies to the visible system, so the row says so in
          // its own right rather than letting a green '=' speak for a system it never saw.
          pill.title = 'Rigor when computed: ' + rm.label;
          row.appendChild(pill);
        }
        const t = document.createElement('span'); t.className = 'algebra-drawer-title';
        t.textContent = r.data.title || 'Existence / uniqueness';
        row.appendChild(t);
        if (st !== 'current') {
          const tag = document.createElement('span'); tag.className = 'algebra-drawer-tag';
          tag.textContent = st === 'branch' ? trackLabelOf(r.track) : 'earlier';
          tag.title = st === 'branch'
            ? 'Computed on ' + trackLabelOf(r.track) + ' — a different system from the one shown'
            : 'Computed before the current reduction — no longer describes the visible column';
          row.appendChild(tag);
        }
        row.addEventListener('click', () => reshowResult(r));
        list.appendChild(row);
      });
      host.appendChild(list);
      if (_resultsDropped) {
        const note = document.createElement('div'); note.className = 'algebra-drawer-note';
        note.textContent = _resultsDropped + ' older result' + (_resultsDropped === 1 ? '' : 's')
          + ' dropped (keeps the most recent ' + RESULTS_CAP + ')';
        host.appendChild(note);
      }
    }
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
      if (r.partialBranch) notes.push('case ' + ((r.caseIndex || 0) + 1) + '/' + r.caseCount
        + ' of ' + (r.branchOp === 'component' ? 'a component decomposition' : 'a factor split')
        + (r.branchIncomplete ? ' (capped — components may not cover V(I))' : ''));
      const sl = sliceLabels(r);
      if (sl.length) notes.push('on the ' + sl.join(' + ') + ' only — a LOWER BOUND; off-slice QDs not counted');
      const tail = notes.length ? ' [' + notes.join('; ') + ']' : '';
      const star = sl.length ? '*' : '';
      if (r.inconsistent) return { badge: '∅' + star, state: 'none', title: 'no QD — system inconsistent (1 ∈ I)' + tail };
      if (!r.zeroDim) return { badge: '∞' + star, state: 'open', title: 'positive-dimensional family (' + posDimDesc(r) + ')' + tail };
      if (r.realCount == null) return { badge: 'fin' + star, state: 'unknown', title: r.multiplicity + ' complex solution(s); real count over the cap' + tail };
      if (r.realCount === 0) return { badge: '0 QD' + star, state: 'none', title: 'no real quadrature domain' + tail };
      // HONEST LABELING (C-1): the chip shows the ALGEBRAIC real-solution count — an upper bound on #QD,
      // NOT a certified QD count — so no green 'unique' from an unfiltered count; Certify univalence
      // (which filters non-univalent maps + quotients the gauge) produces the genuine-QD verdict.
      if (r.realCount === 1) return { badge: '1 alg' + star, state: 'multi', title: '1 real algebraic solution — an upper bound on #QD; run Certify univalence for the genuine-QD count' + tail };
      return { badge: r.realCount + ' alg' + star, state: 'multi', title: r.realCount + ' real algebraic solutions — an upper bound on #QD; run Certify univalence for the genuine-QD count' + tail };
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
      // fitWidth now reports whether it ACTUALLY fit. It used to return only the clamped zoom, so
      // past ~7 columns the button wrote "40%" (ZMIN) while the track was still cut off — the label
      // asserted a fit that had not happened. Say "condensed" when that is what made it fit, and
      // say so plainly when even that was not enough.
      bar.appendChild(btn('Fit ↔', 'Zoom so every column lane fits the width (switches to a condensed overview when needed)', () => {
        if (!canvas || !canvas.fitWidth) return;
        const r = canvas.fitWidth();
        _zoom = (r && typeof r === 'object') ? r.zoom : r;
        const pct = Math.round(_zoom * 100) + '%';
        zlabel.textContent = (r && r.condensed) ? (pct + ' ·⊟') : pct;
        zlabel.title = (r && !r.fits) ? 'Still wider than the viewport even condensed — scroll or zoom out further'
          : (r && r.condensed) ? 'Condensed overview: cards collapsed, lane headers kept at full size' : '';
      }));
      bar.appendChild(btn('Expand', 'Expand every card to the full typeset form', () => { if (canvas) canvas.setAllCollapsed(false); }));
      bar.appendChild(btn('Collapse', 'Collapse every card to a one-line preview', () => { if (canvas) canvas.setAllCollapsed(true); }));
      const mapBtn = btn('▣ map', 'Toggle the DAG minimap (a bird\'s-eye of all lanes with a draggable viewport)', () => {
        if (!canvas) return; _minimapOn = canvas.setMinimap(!_minimapOn); mapBtn.classList.toggle('active', _minimapOn);
      });
      bar.appendChild(mapBtn);
      // Focus mode. computeLineage has always known a node's derivation (itself ∪ ancestors ∪
      // descendants) and only used it to tint borders — on a 22-card graph "where did this come
      // from" was still a manual trace. Carries an id so the P5 accelerator table can click it.
      const focusBtn = btn('◎ focus', 'Show only the selected equation\'s derivation — its ancestors and descendants — and fade the rest (needs a selection)', () => {
        if (!canvas) return;
        const on = canvas.setFocus(!_focusOn);
        _focusOn = on; focusBtn.classList.toggle('active', on);
        if (on && !canvas.getSelection().length) toast('Focus is on — select an equation to isolate its derivation');
      });
      focusBtn.id = 'alg-focus';
      bar.appendChild(focusBtn);
      // The glyph is the whole accessible name otherwise ("↶, button"), and neither control said
      // it had a keyboard equivalent. refreshUndoButtons() keeps the enabled state + the label of
      // what would be reverted current — see rerender().
      // Search over the DAG. "Which nodes still contain z̄₁?" / "where did A₁,₁ get eliminated?"
      // previously had no answer short of expanding every card and reading. Matches label, variable
      // and provenance op; non-matches dim. `/` focuses it (see the key handler).
      const searchWrap = document.createElement('div'); searchWrap.className = 'algebra-search';
      const searchIn = document.createElement('input');
      searchIn.type = 'search'; searchIn.id = 'alg-search'; searchIn.placeholder = 'Search nodes…';
      searchIn.title = 'Filter by equation label, variable name, or the step that produced it ( / to focus, Esc to clear )';
      const searchCount = document.createElement('span'); searchCount.className = 'algebra-search-count';
      const runSearch = () => {
        if (!canvas || !canvas.setQuery) return;
        const r = canvas.setQuery(searchIn.value);
        searchCount.textContent = r.query ? (r.hits + ' match' + (r.hits === 1 ? '' : 'es')) : '';
      };
      searchIn.addEventListener('input', runSearch);
      searchIn.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') { searchIn.value = ''; runSearch(); searchIn.blur(); ev.stopPropagation(); }
      });
      searchWrap.appendChild(searchIn); searchWrap.appendChild(searchCount);
      bar.appendChild(searchWrap);
      bar.appendChild(btn('↶', 'Undo (Ctrl+Z)', () => { if (store.undo()) { if (canvas) canvas.clearSelection(); rerender(); refreshPickers(); } }, 'alg-undo'));
      bar.appendChild(btn('↷', 'Redo (Ctrl+Shift+Z)', () => { if (store.redo()) { if (canvas) canvas.clearSelection(); rerender(); refreshPickers(); } }, 'alg-redo'));
      zlabel.textContent = Math.round(_zoom * 100) + '%';
      host.appendChild(bar);
    }
    function showSurface(on) { if (surface) surface.classList.toggle('hidden', !on); }

    // ---- the `?` cheatsheet --------------------------------------------------
    // The list itself is module-scope (algebraShortcutItems, above installAlgebra); this
    // just hands it to the registry once the tab exists.
    (function registerShortcutHelp() {
      const QoL = QD.QoL;
      if (QoL && QoL.registerShortcuts) QoL.registerShortcuts('algebra', algebraShortcutItems());
    })();

    // ---- tab lifecycle -------------------------------------------------------
    document.addEventListener('tab-changed', (e) => {
      const active = e.detail && e.detail.tab === 'algebra';
      if (!active) { showSurface(false); return; }
      if (!mounted) {
        mountSidebar(); mountSurface(); mountReferenceCard(); mounted = true;
        // A saved session outranks auto-seeding: seeding would clear the graph and discard the
        // very derivation being offered back, so ask first.
        if (offerRestore()) { showSurface(true); return; }
      }
      showSurface(true);
      if (!store.size && activeEnv) seedFromCurrent();
      else rerender();
    });

    // Open programmatically (the sidebar launcher calls this). Unlike clicking the tab —
    // where focus belongs on the tab you clicked — this is an explicit "take me to the
    // workspace" from somewhere else on the page, so it moves focus into the panel.
    function openWorkspace() {
      const btn = document.querySelector('.tab-btn[data-tab="algebra"]');
      if (btn) btn.click();
      if (mounted) seedFromCurrent();
      const panel = $('#controls-algebra');
      if (panel && typeof panel.focus === 'function') { try { panel.focus(); } catch (e) {} }
    }
    ctx.openAlgebra = openWorkspace;

    // Track the current solve; gate on classical bounded QD.
    if (QD.PrimarySolution && QD.PrimarySolution.subscribe) {
      QD.PrimarySolution.subscribe((env) => {
        const phi = env && env.success && env.primary && env.primary.phi;
        activeEnv = isClassicalBounded(phi, env && env.hData) ? env : null;
        // Track the raw quadrature data even when the numeric solve FAILED — the from-data prover (Phase D)
        // works from this when there is no activeEnv, gated on the classical-BOUNDED mode (state.mode).
        if (env && env.hData && env.hData.poles && env.hData.poles.length) lastHData = env.hData;
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
  QD_UI.resultStateOf = resultStateOf;               // does a stored result still describe this system? (pure)
  QD_UI.ALGEBRA_KEY_ACTIONS = KEY_ACTIONS;           // single-key accelerator table (pure data)
  QD_UI.algebraShortcutItems = algebraShortcutItems; // …and the `?` cheatsheet it generates (pure)
  QD_UI.suggestSummaryLabel = suggestSummaryLabel;   // collapsed suggestion-list <summary> label (pure)
  QD_UI.suggestAutoOpen = suggestAutoOpen;           // …and its expand/collapse decision (pure)
  QD_UI.SUGGEST_AUTO_OPEN_MAX = AUTO_OPEN_MAX;
})();
