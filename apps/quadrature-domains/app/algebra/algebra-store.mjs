// ESM (Phase 2 port) — twin of algebra/algebra-store.js (classic stays frozen). Registers onto the QD namespace.
import _QD from '../solver.mjs';
// =============================================================================
// algebra-store.js -- Equation-DAG data model for the Algebra workspace
// (QD.AlgebraStore). Pure, DOM-free, and unit-testable: it holds the nodes
// (equations / constraints / derived eliminants) and edges of the derivation
// graph, and the operations that grow it. The canvas/UI (algebra-canvas.js,
// algebra-ui.js) render and drive a store instance; all the algebra lives in
// QD.Sym / QD.QDEquations / QD.QDConstraints.
//
//   node = { id, kind:'generated'|'constraint'|'derived', poly:MPoly, rel:'='|'>'|'≠',
//            label, model, provenance:{op, inputs[], variable?, form?, block?},
//            column, meta }
//   edge = { from, to }
//
// Seeded normalization state (part of the snapshot, so undo/redo restore it):
//   model    -- 'conjugate' | 'reim' (store-wide)
//   PER-TRACK assumptions (C3 — `trackAssume`, one record per branch; a fork inherits its
//   parent's at fork time, then diverges):
//     realVars -- base (primal) variables asserted REAL (z̄ⱼ≡zⱼ, …); substituted into
//                 every seeded equation and every later constraint/conjugate companion.
//     imagVars -- base (primal) variables asserted IMAGINARY (z̄ⱼ≡−zⱼ, …).
//     w0Fixed  -- the fixed Riemann-map center φ(0)=w₀ ({re:[n,d], im:[n,d]} BigInt
//                 strings) when the seed system was generated with {w0}; substituted
//                 into any later constraint that rebuilds φ with the w₀ symbol.
//
// Ops: seedFromSystem (●/★/gauge from generateClassicalBounded → the ORIGINAL system
// at column 0; + conjugate companions), addConstraint (the four univalence forms).
// AUDIT-TRAIL reductions — each appends a new labeled column, leaving column 0 intact:
// substituteValue / substituteValues (fix one / several variables' values in one column,
// exact ℚ(i), each value ALSO fixes the variable's conjugate, auto-propagating by default),
// reducePropagate (linear-substitution fixpoint via Sym.linearReduce), assumeReal
// (identify v̄≡v), fixW0 (φ(0)=w₀ → value), eliminate / eliminateWithGauge (Sylvester
// resultant), groebner / groebnerAsync, triangularize (Wu pseudo-elimination → a chain
// column), and applyFactor (factor an equation p = f·g and pursue ONE factor as a
// "case fₖ = 0" column — a disjunctive branch of V(p)=⋃V(fᵢ); factorOf is the pure
// query). Analysis (default to the CURRENT system = the last column via
// currentColumnIds): dimension / dimensionAsync, solve / solveAsync; classify (existence/
// uniqueness — # REAL solutions = # quadrature domains, via currentReimSystem + the
// Hermite trace form, known parameters pinned) and solveReal (explicit real solutions);
// columnStats / columns (per-lane eqn/var counts for the UI headers). seedFromSystem takes
// opts.bakeAssumptions (the compact path that bakes realVars at column 0 for the autosolve).
// Plus duplicate, deleteNode (cascade), moveNode (reorder within a column), undo/redo
// (snapshot stack), nodeStats, variables/baseVariables, exportDAG, and a copy-paste
// Mathematica export (mathematicaColumn / mathematicaNode / mathematicaAll).
//
// Provenance-op contract: every node writes provenance.op ∈ { generate, fork, conjugate,
// resultant, groebner, constraint, duplicate, substitute, linear-reduce, assume-real,
// assume-imaginary, identify, identify-conj, fix-w0, define-subst, add-equation, triangular,
// factor, rctd, propagate }. ADDING A NEW OP means adding ONE record to the PROV_STORE registry
// (below: its short/method/subs labels) AND one to algebra-ui's PROV_UI (text/column/edge); a
// coverage test on each fails loudly if an op is missing. (Historically this fanned out across
// six hand-synced switch statements — that fan-out is what the two registries replaced.)
// =============================================================================

(function (global) {
  'use strict';

  function getSym() {
    return (typeof window !== 'undefined' && window.QD && window.QD.Sym)
      || (typeof global !== 'undefined' && global.QD && global.QD.Sym) || (typeof QD !== 'undefined' && QD.Sym);
  }
  function getQC() {
    return (typeof window !== 'undefined' && window.QD && window.QD.QDConstraints)
      || (typeof global !== 'undefined' && global.QD && global.QD.QDConstraints) || (typeof QD !== 'undefined' && QD.QDConstraints);
  }
  function getQE() {
    return (typeof window !== 'undefined' && window.QD && window.QD.QDEquations)
      || (typeof global !== 'undefined' && global.QD && global.QD.QDEquations) || (typeof QD !== 'undefined' && QD.QDEquations);
  }
  function getSR() {
    return (typeof window !== 'undefined' && window.QD && window.QD.SymRadical)
      || (typeof global !== 'undefined' && global.QD && global.QD.SymRadical) || (typeof QD !== 'undefined' && QD.SymRadical);
  }

  // ===========================================================================
  // Provenance-op registry (STORE side). ONE table keyed by provenance.op collapses the three
  // op-keyed store sites so adding a node type means adding ONE record here instead of editing
  // _shortProv + the derivationSteps method-map + _subsForRepro separately. Fields (all optional):
  //   short(p)      → terse ASCII transition label. Absent ⇒ the consumer falls back to p.op.
  //   method(p, n)  → engine-reduction step line for derivationSteps. Absent ⇒ the op name; the
  //                   substitution-FAMILY ops (substitute/fix-w0/assume-*) omit it on purpose —
  //                   derivationSteps replays those progressively, not via the method line.
  //   subs(p, ctx)  → a SymPy .subs map reproducing a substitution-family step (ctx = { cj, CAS,
  //                   conjRec }); returns null on an incomplete record. Absent ⇒ the consumer
  //                   returns null. (The UI keeps its own provText/columnLabel/edgeLabel — a
  //                   companion PROV_UI is the planned follow-on.) A coverage test asserts every
  //                   op in the provenance contract has a record here.
  const PROV_STORE = {
    generate:        { short: () => 'original system' },
    fork:            {},
    conjugate:       { method: () => 'conjugate companion (p̄ = 0)' },
    constraint:      {},
    duplicate:       { method: () => 'duplicate' },
    resultant: {
      short:  (p) => 'eliminate ' + p.variable,
      method: (p) => (p.method === 'resultant')
        ? 'eliminate ' + (p.variable || '?') + ' via the Sylvester resultant Res_' + (p.variable || '?') + '(P, Q) — may carry extraneous factors (elimination-ideal fallback)'
        : 'eliminate ' + (p.variable || '?') + ' via the elimination ideal ⟨P, Q⟩ ∩ k[rest] (exact — no extraneous factors)',
    },
    groebner: {
      short:  (p) => 'Groebner (' + (p.order || 'grevlex') + ')',
      method: (p) => 'Gröbner basis (' + (p.order || 'grevlex') + ((p.eliminate && p.eliminate.length) ? ', eliminating ' + p.eliminate.join(', ') : '') + ')',
    },
    triangular: {
      short:  () => 'triangular decomposition',
      method: (p, n) => 'triangular (Wu) decomposition' + ((n && n.meta && n.meta.mainVar) ? ', main variable ' + n.meta.mainVar : ''),
    },
    saturate: {
      short:  () => 'saturate (admissibility)',
      method: (p) => 'saturate ⟨I⟩ : ' + (p.factor || '(1−z̄z)') + '^∞ — remove the |z_j|=1 boundary stratum the cleared Möbius denominators carry',
    },
    'linear-reduce': {
      short:  () => 'linear propagation',
      method: (p) => 'linear propagation' + ((p.eliminated && p.eliminated.length) ? ' (eliminate ' + p.eliminated.join(', ') + ')' : ''),
    },
    propagate: {
      short:  () => 'propagate constraint',
      method: () => 'propagate the constraint into the current system',
    },
    factor:          { short: () => 'factor case', method: () => 'factor case' },
    rctd:            { short: () => 'RCTD cell', method: () => 'imported RCTD cell' },
    resolvent:       { method: () => 'resolvent (characteristic polynomial of multiplication-by-v)' },
    'add-equation':  { short: () => 'custom equation' },
    'define-subst': {
      short:  (p) => 'define ' + p.newVar + (p.dropVars && p.dropVars.length ? ' (elim ' + p.dropVars.join(', ') + ')' : ''),
      method: (p) => 'define ' + (p.newVar || 't') + ' := g (' + (p.regime || '') + ')' + (p.dropVars && p.dropVars.length ? ', eliminate ' + p.dropVars.join(', ') : ''),
    },
    identify: {
      short:  (p) => 'identify ' + p.drop + ' = ' + p.keep,
      method: (p) => 'identify ' + (p.drop || '') + ' = ' + (p.keep || ''),
      subs:   (p, { cj, CAS, conjRec }) => {
        if (!p.ratio || !p.ratio.re || !p.drop || !p.keep) return null;
        const map = {}; map[p.drop] = '(' + CAS.sympyValue(p.ratio) + ')*' + p.keep;
        const cd = cj(p.drop), ck = cj(p.keep);
        if (cd !== p.drop) map[cd] = '(' + CAS.sympyValue(conjRec(p.ratio)) + ')*' + ck;
        return map;
      },
    },
    'identify-conj': {
      short:  (p) => 'identify ' + p.var + ' = conj(' + p.other + ')',
      method: (p) => 'identify ' + (p.var || '') + ' via conj(' + (p.other || '') + ')',
      subs:   (p, { cj, CAS, conjRec }) => {
        if (!p.ratio || !p.ratio.re || !p.var || !p.other) return null;
        const map = {}; map[p.var] = '(' + CAS.sympyValue(p.ratio) + ')*' + cj(p.other);
        const cv = cj(p.var);
        if (cv !== p.var) map[cv] = '(' + CAS.sympyValue(conjRec(p.ratio)) + ')*' + p.other;
        return map;
      },
    },
    substitute: {
      short: (p) => 'set ' + (p.variables || []).map((r) => r.name).join(', '),
      subs:  (p, { cj, CAS, conjRec }) => {
        const map = {};
        for (const rec of (p.variables || [])) {
          if (!rec || !rec.name || !rec.value || !rec.value.re) return null;
          map[rec.name] = CAS.sympyValue(rec.value);
          const c = rec.conjugate || (cj(rec.name) !== rec.name ? cj(rec.name) : null);
          if (c) map[c] = CAS.sympyValue(conjRec(rec.value));
        }
        return map;
      },
    },
    'fix-w0': {
      short: () => 'fix phi(0)',
      subs:  (p, { CAS, conjRec }) => {
        if (!p.value || !p.value.re) return null;
        return { w0: CAS.sympyValue(p.value), wb0: CAS.sympyValue(conjRec(p.value)) };
      },
    },
    'assume-real': {
      short: (p) => 'assume real: ' + (p.vars || []).join(', '),
      subs:  (p, { cj }) => { const map = {}; for (const v of (p.vars || [])) { const c = cj(v); if (c !== v) map[c] = v; } return map; },
    },
    'assume-imaginary': {
      short: (p) => 'assume imaginary: ' + (p.vars || []).join(', '),
      subs:  (p, { cj }) => { const map = {}; for (const v of (p.vars || [])) { const c = cj(v); if (c !== v) map[c] = '-' + v; } return map; },
    },
  };

  // The structured-clone-safe numeric caps forwarded to the SymWorker payload (_capOpts).
  // A9: keep _CAP_KEYS in sync with the numeric opts the sym-core ops actually read
  // (buchberger maxBasis/maxSteps/maxDegree/maxTerms; solveZeroDim/classify maxEigenDim/
  // maxHermiteDim/maxRounds; plus the reduced/keepEliminated flags). NON-serializable opts
  // (rootFinder, onProgress, order1, paramValues) are intentionally dropped — they can't be
  // postMessage'd, so the worker uses its own defaults. A cap the ops honor but MISSING here
  // would be silently dropped for the worker while the sync fallback still honored it (an
  // uncaught divergence), so algebra-store.test.js asserts coverage against that op-cap list.
  // F1: complete the whitelist — RUR/solveRealCertified read maxDim/maxTries (sym-core ~1877/1881), and
  // parametricRealCount1D/discriminantVariety read maxTries/maxCalls/maxSegments/formTries/maxDepth (~4232/
  // 4344/4799/4800). Omitting them meant the WORKER path silently ran with the defaults while a sync fallback
  // honoured the caps — a latent worker≠main divergence. (Harmless extra keys just forward nothing if unset.)
  const _CAP_KEYS = ['maxBasis', 'maxSteps', 'maxDegree', 'maxTerms', 'maxEigenDim', 'maxHermiteDim', 'maxRounds', 'reduced', 'keepEliminated',
    'maxDim', 'maxTries', 'maxCalls', 'maxSegments', 'maxDepth', 'formTries'];
  function _capOpts(opts) {
    const out = {};
    for (const k of _CAP_KEYS) if (opts && opts[k] != null) out[k] = opts[k];
    return out;
  }

  function create() {
    let seq = 0;
    const nodes = new Map();      // id -> node
    let edges = [];               // { from, to }
    let order = new Map();        // id -> display order WITHIN its column (small = top)
    const undoStack = [];         // snapshots (most recent last)
    const redoStack = [];
    let model = 'conjugate';
    let formulation = 'classical';   // 'classical' (forward) | 'schwarz' (σ-principal-parts)
    // --- BRANCHING (tracks): the derivation is no longer a single linear chain --------
    // Each node carries a `track` id; the column index is the depth WITHIN its track.
    // One track is ACTIVE; every reduction/analysis reads + appends to the active track,
    // so the existing ops work unchanged once the column queries below are made
    // track-relative. `forkTrack` copies a column into a new parallel track.
    let trackSeq = 0;
    let activeTrackId = 't0';
    let tracks = [{ id: 't0', label: 'main', parentId: null, forkColumn: null }];
    function mkTrackId() { return 't' + (++trackSeq); }
    function hasTrack(id) { return tracks.some((t) => t.id === id); }

    // --- PER-TRACK ASSUMPTIONS (C3) ---------------------------------------------------
    // Reality (z̄ⱼ≡zⱼ), imaginary (z̄ⱼ≡−zⱼ) and the fixed Riemann-map center φ(0)=w₀ are
    // scoped PER BRANCH, so an assumption made AFTER a fork is isolated to that branch.
    // A fork INHERITS the parent's assumptions at fork time (shared ancestry, divergent
    // thereafter). The _apply* folds + the assume* ops read/write the ACTIVE track's record;
    // classify / the reim transform use the ANALYZED track's (resolved from the node ids).
    //   realVars  -- base (primal) variables ASSERTED REAL
    //   imagVars  -- base (primal) variables ASSERTED IMAGINARY
    //   w0Fixed   -- φ(0) fixed: { re:[n,d], im:[n,d], approx? } (BigInt strings) or null
    const trackAssume = new Map();   // trackId -> { realVars:[], imagVars:[], w0Fixed:null }
    function assumeOf(track) {
      track = track || activeTrackId;
      let a = trackAssume.get(track);
      if (!a) { a = { realVars: [], imagVars: [], w0Fixed: null }; trackAssume.set(track, a); }
      return a;
    }
    function serializeAssume() {
      return [...trackAssume].map(([k, a]) => [k, { realVars: a.realVars.slice(), imagVars: a.imagVars.slice(), w0Fixed: a.w0Fixed }]);
    }
    // Track of a node id (for resolving WHICH branch's assumptions an analysis uses).
    function trackOf(id) { const n = nodes.get(id); return (n && n.track) || 't0'; }

    function nid() { return 'n' + (++seq); }

    // --- reality assumptions: assert chosen variables are real -----------------
    // In the conjugate model v and v̄ are independent; asserting v real identifies
    // them (v̄ → v), which simplifies the system (and is the biggest lever for making
    // a Gröbner basis tractable — it halves the offending variables). A name is
    // normalized to its PRIMAL (non-barred) form; the rename then maps the barred
    // partner onto it. conjMPoly reintroduces barred names, so the rename is applied
    // AFTER conjugation too (see maybeAddConjugate), which lets companions collapse.
    const _BARRED_RE = /^(zb\d+|Ab\d+_\d+|Cb\d+_\d+|ab\d+|wb0|Zb\d*)$/;
    // --- user-defined substitution symbols: conjugate-partner OVERLAY ----------------
    // A define-substitution (defineSubstitution) can introduce a fresh symbol t := g. When
    // g is NOT self-conjugate, t has a genuine conjugate t̄ (a second fresh symbol) that must
    // thread through the conjugate-model machinery (conjugation, reality split, reim). The base
    // QC.conjVarName table can't know these symbols, so the store keeps an OVERLAY: `substConj`
    // maps each registered name to its partner (both directions); `substBarred` is the set of
    // the "barred" members so _primalName resolves t̄ → t. For a self-conjugate g (real t)
    // nothing is registered — the default (conjVarName(t)=t, i.e. t is its own conjugate) is right.
    let substConj = new Map();     // name -> conjugate-partner name (both directions)
    let substBarred = new Set();   // the barred member of each registered substitution pair
    function _conjName(name) {
      if (substConj.has(name)) return substConj.get(name);
      const QC = getQC();
      return (QC && QC.conjVarName) ? QC.conjVarName(name) : name;
    }
    // Complex conjugate of an MPoly, overlay-aware (so a poly containing a defined symbol t
    // conjugates to one in t̄). Identical to QC.conjMPoly when no substitution symbol is present.
    function _conjMPoly(poly) { return poly.conjCoeffs().relabel(_conjName); }
    function _primalName(name) {
      if (substBarred.has(name)) return substConj.get(name);
      const QC = getQC();
      return (QC && QC.conjVarName && _BARRED_RE.test(name)) ? QC.conjVarName(name) : name;
    }
    function _realityRename() {
      const realVars = assumeOf().realVars;
      if (!realVars.length) return null;
      const QC = getQC(); if (!QC || !QC.conjVarName) return null;
      const map = {};
      for (const rv of realVars) { const c = _conjName(rv); if (c !== rv) map[c] = rv; }
      if (!Object.keys(map).length) return null;
      return (n) => (Object.prototype.hasOwnProperty.call(map, n) ? map[n] : n);
    }
    function _applyReality(poly) { const r = _realityRename(); return r ? poly.relabel(r) : poly; }

    // --- imaginary assumptions: assert chosen variables are purely imaginary --------
    // v imaginary ⟺ Re(v)=0 ⟺ v = −v̄ ⟺ v̄ = −v. Unlike reality (a pure RENAME v̄→v),
    // this is a SUBSTITUTION v̄ → −v, so it can't share _realityRename's relabel path.
    // imagVars and realVars are disjoint (a nonzero variable can't be both); reality is
    // folded first (relabel), then imaginary (subst) on the still-barred names.
    function _applyImaginary(poly) {
      const imagVars = assumeOf().imagVars;
      if (!imagVars.length) return poly;
      const QC = getQC(), S = getSym(); if (!QC || !QC.conjVarName) return poly;
      const sub = {};
      for (const iv of imagVars) { const c = _conjName(iv); if (c !== iv) sub[c] = S.mpolyVar(iv).neg(); }
      return Object.keys(sub).length ? poly.subst(sub) : poly;
    }
    // The cumulative pointwise assumption fold applied to a freshly built polynomial
    // (seeded equation, univalence constraint, or generated conjugate): fixed φ(0), then
    // reality (v̄≡v), then imaginary (v̄≡−v). With no assumptions set this is the identity,
    // so existing flows are unchanged.
    function _applyAssumed(poly) { return _applyImaginary(_applyReality(_applyW0(poly))); }

    // --- fixed φ(0): substitute the seed system's w₀ value into later polys -----
    // When the seed system was generated with a FIXED Riemann-map center (system
    // .w0Fixed from generateClassicalBounded(…, {w0}) — the UI defaults it to the
    // centroid of the poles), the seeded equations already lack w₀/w̄₀. But the
    // univalence CONSTRAINTS rebuild φ from scratch with the w₀ symbol (e.g. the
    // star form's φ − w₀), so the same exact value must be substituted into every
    // constraint poly for the workspace to stay on one normalization.
    function _applyW0(poly) {
      const w0Fixed = assumeOf().w0Fixed;
      if (!w0Fixed) return poly;
      const vs = poly.vars();
      if (!vs.has('w0') && !vs.has('wb0')) return poly;
      const S = getSym();
      const g = S.gauss(S.rat(BigInt(w0Fixed.re[0]), BigInt(w0Fixed.re[1])),
                        S.rat(BigInt(w0Fixed.im[0]), BigInt(w0Fixed.im[1])));
      return poly.subst({ w0: S.mpolyConst(g), wb0: S.mpolyConst(g.conj()) });
    }

    // --- snapshot-based undo (sizes are small; snapshots beat inverse-op bookkeeping) ---
    // The display `order` map is part of the snapshot so reordering is undoable and
    // so undo/redo of structural ops restores the exact card layout too. Node
    // objects are never mutated in place (only added), so a shallow node-map copy
    // is a safe snapshot; `order` is copied because moveNode mutates it.
    function snapshot() {
      return { nodes: new Map([...nodes].map(([k, v]) => [k, v])), edges: edges.slice(), order: new Map(order), model, formulation, seq,
        trackAssume: serializeAssume(), substConj: [...substConj], substBarred: [...substBarred],
        tracks: tracks.map((t) => ({ id: t.id, label: t.label, parentId: t.parentId, forkColumn: t.forkColumn })), activeTrackId, trackSeq };
    }
    function restore(s) {
      nodes.clear(); for (const [k, v] of s.nodes) nodes.set(k, v);
      edges = s.edges.slice(); order = new Map(s.order || []); model = s.model; formulation = s.formulation || 'classical'; seq = s.seq;
      substConj = new Map(s.substConj || []); substBarred = new Set(s.substBarred || []);
      tracks = (s.tracks && s.tracks.length) ? s.tracks.map((t) => ({ id: t.id, label: t.label, parentId: t.parentId, forkColumn: t.forkColumn })) : [{ id: 't0', label: 'main', parentId: null, forkColumn: null }];
      trackSeq = s.trackSeq || 0;
      activeTrackId = (s.activeTrackId && hasTrack(s.activeTrackId)) ? s.activeTrackId : tracks[0].id;
      trackAssume.clear();
      if (s.trackAssume) { for (const [k, a] of s.trackAssume) trackAssume.set(k, { realVars: (a.realVars || []).slice(), imagVars: (a.imagVars || []).slice(), w0Fixed: a.w0Fixed || null }); }
      else { trackAssume.set('t0', { realVars: (s.realVars || []).slice(), imagVars: (s.imagVars || []).slice(), w0Fixed: s.w0Fixed || null }); }   // legacy snapshot
    }
    // Cap the undo history so a long derivation can't grow the snapshot stack without
    // bound (each snapshot holds a copy of the whole node map). 200 steps is far beyond
    // any interactive session; the oldest snapshot is dropped when exceeded.
    function checkpoint() { undoStack.push(snapshot()); if (undoStack.length > 200) undoStack.shift(); redoStack.length = 0; }
    // Memoized variable set per POLYNOMIAL (MPolys are immutable, so the Set is stable).
    // A WeakMap keeps it off the object and GC-friendly; removes repeated full-term walks
    // of the same polynomial across variables()/baseVariables()/columnStats/_varsOf/etc.
    const _varsMemo = new WeakMap();
    function polyVars(p) { let v = _varsMemo.get(p); if (!v) { v = p.vars(); _varsMemo.set(p, v); } return v; }
    function nodeVars(n) { return polyVars(n.poly); }
    function undo() { if (!undoStack.length) return false; redoStack.push(snapshot()); restore(undoStack.pop()); return true; }
    function redo() { if (!redoStack.length) return false; undoStack.push(snapshot()); restore(redoStack.pop()); return true; }
    // Stack depths, so the UI can disable the undo/redo controls when there is nothing to do
    // rather than offering a button that silently no-ops. Read-only view of the history.
    function undoDepth() { return undoStack.length; }
    function redoDepth() { return redoStack.length; }

    function addNode(n) {
      if (n.track === undefined) n.track = activeTrackId;   // stamp the active branch
      nodes.set(n.id, n);
      if (!order.has(n.id)) {                 // append to the bottom of its (track, column) by default
        let mx = -1;
        for (const m of nodes.values()) if (m.id !== n.id && m.column === n.column && m.track === n.track) mx = Math.max(mx, ordOf(m.id));
        order.set(n.id, mx + 1);
      }
      return n;
    }
    function list() { return [...nodes.values()]; }
    function get(id) { return nodes.get(id); }
    // Clear the graph itself (nodes/edges/order/ids) but KEEP the seeded normalization
    // (model/realVars/w0Fixed) and the undo history. seedFromSystem uses this after a
    // checkpoint so re-seeding is undoable. The public reset() is the full wipe.
    // Also collapses to a single active track — a fresh seed is one main branch.
    function clearGraph() {
      nodes.clear(); edges = []; order = new Map(); seq = 0;
      substConj = new Map(); substBarred = new Set();   // a fresh seed has no user-defined substitution symbols
      tracks = [{ id: 't0', label: 'main', parentId: null, forkColumn: null }]; activeTrackId = 't0'; trackSeq = 0;
      const t0a = assumeOf('t0'); trackAssume.clear(); trackAssume.set('t0', t0a);   // collapse to one branch; keep t0's normalization (seedFromSystem resets it next)
    }
    // FULL reset — also drops the undo/redo history and the normalization state. For
    // tearing the store down (tests / a fresh start), NOT for re-seeding.
    function reset() { clearGraph(); model = 'conjugate'; formulation = 'classical'; trackAssume.clear(); trackAssume.set('t0', { realVars: [], imagVars: [], w0Fixed: null }); undoStack.length = 0; redoStack.length = 0; }

    // --- display order within a column ---------------------------------------
    // Cards are laid out top-to-bottom by `order` (then id, for stability).
    // Fractional orders are used transiently (a conjugate companion is inserted
    // at primal+0.5) and then integerized by normalizeColumn so up/down swaps stay
    // simple. orderOf falls back to +∞ so an un-ordered node sinks to the bottom.
    function ordOf(id) { return order.has(id) ? order.get(id) : Number.POSITIVE_INFINITY; }
    // Column queries are TRACK-RELATIVE: they default to the active track, so every
    // existing op (which calls them with no track arg) operates within the active branch.
    function colNodes(c, track) { track = track || activeTrackId; return list().filter((n) => n.column === c && (n.track || 't0') === track); }
    function orderedColumn(c, track) {
      return colNodes(c, track).sort((a, b) => (ordOf(a.id) - ordOf(b.id)) || a.id.localeCompare(b.id));
    }
    function normalizeColumn(c, track) { orderedColumn(c, track).forEach((n, i) => order.set(n.id, i)); }

    // Move a node one slot up (-1) or down (+1) within its column. Undoable.
    // Returns true if it moved (false at a column boundary or for a bad id).
    function moveNode(id, dir) {
      const n = get(id); if (!n) return false;
      const arr = orderedColumn(n.column);
      const i = arr.findIndex((x) => x.id === id);
      const j = i + (dir < 0 ? -1 : 1);
      if (i < 0 || j < 0 || j >= arr.length) return false;
      checkpoint();
      const oi = ordOf(arr[i].id), oj = ordOf(arr[j].id);
      order.set(arr[i].id, oj); order.set(arr[j].id, oi);
      return true;
    }

    // In the conjugate-variable model an equation E and its conjugate Ē are
    // INDEPENDENT polynomials, and on the reality slice E=0 ⇔ {Re E=0, Im E=0} ⇔
    // {E=0, Ē=0}. So a non-self-conjugate equality must be paired with its
    // conjugate for the system to be complete (this is what makes the conjugate-
    // model node count equal the real-equation count 2n+2d+1, and what makes
    // elimination sound over the REAL variety). Self-conjugate equations (Ē=±E,
    // e.g. the gauge) and the Hermitian inequalities encode a single real
    // condition, so they get no companion. Returns the companion node, or null.
    function maybeAddConjugate(node) {
      if (node.rel === '>') return null;                    // Hermitian inequality: one real condition
      const QC = getQC(); if (!QC || !QC.conjMPoly) return null;
      const conj = _applyAssumed(_conjMPoly(node.poly));   // overlay-aware conj (swaps any defined t↔t̄); reality/imaginary fold barred names post-conjugation; fixed w₀ stays substituted
      if (node.poly.sub(conj).isZero() || node.poly.add(conj).isZero()) return null;   // self-conjugate (incl. under reality)
      // Suppress only if the companion is already in THIS node's column — a poly equal to
      // conj sitting in an earlier column must not block the companion this column needs.
      for (const m of nodes.values()) if (m.column === node.column && (m.track || 't0') === (node.track || 't0') && m.poly.equals(conj)) return null;
      const comp = addNode({
        id: nid(), kind: node.kind, poly: conj, rel: node.rel,
        label: node.label + ' (conj)', model: node.model,
        provenance: { op: 'conjugate', inputs: [node.id] }, column: node.column, meta: node.meta,
      });
      order.set(comp.id, ordOf(node.id) + 0.5);   // pair the conjugate right under its primal
      return comp;
    }

    // Seed the graph from a generated (●)/(★)/(gauge) system. Clears first. In the
    // conjugate model, each non-self-conjugate equation also gets its conjugate
    // companion (opts.withConjugates, default true) so the system is complete.
    //
    // AUDIT-TRAIL MODEL (default): seeding builds the ORIGINAL system at column 0 only;
    // assumptions (assume-real, fix-φ(0), specify-value, linear propagation) are then
    // applied as APPEND-COLUMN reductions (assumeReal/fixW0/substituteValue/
    // reducePropagate), each a visible labeled step, so column 0 stays pristine and the
    // last column is the system under the stated assumptions. opts.realVars is therefore
    // IGNORED at seed time unless opts.bakeAssumptions is set — the compact mode used by
    // the autonomous solver, which bakes opts.realVars into column 0 (the old behavior).
    function seedFromSystem(system, opts) {
      opts = opts || {};
      const withConj = opts.withConjugates !== false;
      const bake = !!opts.bakeAssumptions;
      // checkpoint FIRST (capturing the OLD graph + realVars + w0Fixed) so re-seeding
      // is undoable; only THEN clear the graph and apply the new normalization. (The
      // realVars assignment must follow the checkpoint, or undo would restore the old
      // graph paired with the new reality assumptions.)
      checkpoint();
      clearGraph();
      model = system.model || 'conjugate';
      formulation = system.formulation || 'classical';   // 'classical' | 'schwarz'
      const a0 = assumeOf('t0');           // fresh seed = one main branch; set its assumptions
      a0.realVars = (bake && opts.realVars !== undefined) ? (opts.realVars || []).map(_primalName) : [];
      a0.imagVars = [];
      a0.w0Fixed = system.w0Fixed || null;   // remember the fixed φ(0) for later constraints
      const primals = [];
      for (const block of ['locator', 'star', 'gauge']) {
        for (const item of system.blocks[block]) {
          const poly = _applyAssumed(item.eq);
          if (poly.isZero()) continue;                       // reality made it trivial
          primals.push(addNode({
            id: nid(), kind: 'generated', poly, rel: '=',
            label: item.label, model,
            provenance: { op: 'generate', inputs: [], block }, column: 0, meta: { block },
          }));
        }
      }
      if (withConj && model === 'conjugate') for (const p of primals) maybeAddConjugate(p);
      normalizeColumn(0);          // integerize the primal+0.5 conjugate insertions
      return list();
    }

    // Seed the graph from a FLAT polynomial system that is ALREADY real (not the
    // conjugate-model (●)/(★)/(gauge) blocks) — e.g. the Aharonov–Shapiro moment system
    // from QE.pointFunctionalSystem, whose equations are the Re/Im parts of the moment
    // identities in real variables (w1, u_k, v_k, M0, m_p, n_p). Each poly becomes one
    // generated node at column 0; NO conjugate companions are added. Crucially the seed
    // marks every variable REAL (spec.realVars ?? spec.vars) so the reim transform
    // (currentReimSystem → _reimTransform) holds them real (v→v__re) instead of splitting
    // each into v__re + i·v__im — which would double the unknowns and corrupt classify/solve.
    // spec = { polys:[MPoly], vars:[string], realVars?, model?, formulation?, labels?, labelPrefix? }.
    function seedFromPolys(spec) {
      spec = spec || {};
      const polys = (spec.polys || []).filter((p) => p && typeof p.isZero === 'function' && !p.isZero());
      if (!polys.length) return { ok: false, reason: 'no equations to seed', created: [] };
      checkpoint();
      clearGraph();
      model = spec.model || 'reim';                       // not 'conjugate' ⇒ no conjugate companions
      formulation = spec.formulation || 'flat';
      const a0 = assumeOf('t0');
      // Hold EVERY variable of the (already-real) system real. Default to all vars appearing in the
      // polys — the moment system's coefficient unknowns AND its moment params are all real components.
      let realVars = spec.realVars;
      if (!realVars) { const s = new Set(); for (const p of polys) for (const v of p.vars()) s.add(v); realVars = [...s]; }
      a0.realVars = realVars.map(_primalName);
      a0.imagVars = [];
      a0.w0Fixed = null;
      const prefix = spec.labelPrefix || 'eqn';
      polys.forEach((p, i) => {
        addNode({
          id: nid(), kind: 'generated', poly: p, rel: '=',
          label: (spec.labels && spec.labels[i]) || (prefix + ' ' + (i + 1)), model,
          provenance: { op: 'generate', inputs: [] }, column: 0, meta: {},
        });
      });
      normalizeColumn(0);
      return { ok: true, created: list() };
    }

    // Add the node(s) for one univalence-constraint form (column 0), plus the
    // conjugate companion of any non-self-conjugate equality (dedup-aware, so a
    // form that already ships its own conjugate — e.g. injectivity — isn't doubled).
    function addConstraint(form, hData, opts) {
      const QC = getQC();
      if (!QC) throw new Error('AlgebraStore: QD.QDConstraints not loaded');
      opts = opts || {};
      const withConj = opts.withConjugates !== false;
      const descs = QC.generateConstraint(hData, form);
      checkpoint();
      const made = [];
      for (const d of descs) {
        const poly = _applyAssumed(d.poly);
        if (poly.isZero()) continue;
        made.push(addNode({
          id: nid(), kind: 'constraint', poly, rel: d.rel,
          label: d.label, model,
          provenance: { op: 'constraint', inputs: [], form }, column: 0, meta: d.meta || { form },
        }));
      }
      if (withConj && model === 'conjugate') for (const m of made.slice()) maybeAddConjugate(m);
      normalizeColumn(0);          // keep each constraint adjacent to its conjugate companion
      return made;
    }

    // === Audit-trail reductions: each appends a NEW labeled column ============
    // The current "system" is the highest-numbered column. A reduction reads that
    // column's nodes, transforms each polynomial, and emits the (nonzero, de-
    // duplicated) results as a new column — so every assumption is a visible,
    // labeled, undoable step and column 0 stays the original system. The canvas
    // derives a column header from the column's nodes' provenance.
    function maxColumn(track) { track = track || activeTrackId; let mx = 0; for (const n of nodes.values()) if ((n.track || 't0') === track) mx = Math.max(mx, n.column || 0); return mx; }
    function lastColumnNodes(track) { track = track || activeTrackId; return orderedColumn(maxColumn(track), track); }
    // The equality-node ids of the current system (the last column) — the default
    // input to dimension/solve/groebner so those operate on the reduced system, not
    // a mix of every column. Falls back to ALL equality nodes if there is one column.
    function currentColumnIds() { return lastColumnNodes().filter((n) => n.rel === '=').map((n) => n.id); }
    // Per-column size: equation-node count + the number of distinct variables across the
    // column (the union of each node's vars). Drives the column-header stats + Δ display.
    function columnStats(c, track) {
      const ns = colNodes(c, track);
      const vars = new Set();
      let eqCount = 0;
      for (const n of ns) { if (n.rel === '=') eqCount++; for (const v of nodeVars(n)) vars.add(v); }
      return { eqCount, varCount: vars.size, nodeCount: ns.length };
    }
    // Ordered list of the columns present in a track (default active), each with stats — for the UI lane headers.
    function columns(track) {
      track = track || activeTrackId;
      const cs = new Set(); for (const n of nodes.values()) if ((n.track || 't0') === track) cs.add(n.column || 0);
      return [...cs].sort((a, b) => a - b).map((c) => Object.assign({ index: c }, columnStats(c, track)));
    }

    // === Branching (tracks) ===================================================
    // Fork a column of a source track into a NEW parallel track: deep-copy the
    // column's nodes (fresh ids) as the new track's column 0, link each copy to its
    // source (op:'fork'), and make the new track active so subsequent reductions
    // append to it — leaving the source track untouched. fromColumn defaults to the
    // source track's last column. One undo step. Returns { ok, track, created, column }.
    function forkTrack(opts) {
      opts = opts || {};
      const fromTrack = opts.fromTrack || activeTrackId;
      if (!hasTrack(fromTrack)) return { ok: false, reason: 'unknown source track' };
      const fromCol = (opts.fromColumn != null) ? opts.fromColumn : maxColumn(fromTrack);
      const src = orderedColumn(fromCol, fromTrack);
      if (!src.length) return { ok: false, reason: 'nothing to fork from' };
      checkpoint();
      const tid = mkTrackId();
      tracks.push({ id: tid, label: opts.label || ('branch ' + tid), parentId: fromTrack, forkColumn: fromCol });
      // C3: the fork INHERITS the parent branch's assumptions at fork time (shared ancestry),
      // and diverges thereafter (assume-real/imaginary/fix-φ(0) on the fork touch only its record).
      const pa = assumeOf(fromTrack);
      trackAssume.set(tid, { realVars: pa.realVars.slice(), imagVars: pa.imagVars.slice(), w0Fixed: pa.w0Fixed });
      const created = [];
      src.forEach((s, i) => {
        const copy = addNode({
          id: nid(), kind: s.kind, poly: s.poly, rel: s.rel, label: s.label, model: s.model,
          provenance: { op: 'fork', inputs: [s.id], fromTrack, fromColumn: fromCol },
          column: 0, meta: s.meta, track: tid,
        });
        order.set(copy.id, i);
        edges.push({ from: s.id, to: copy.id });
        created.push(copy);
      });
      activeTrackId = tid;
      return { ok: true, track: tid, created, column: 0 };
    }
    // Switch the active track (a view/working-context change — NOT undoable on its own;
    // structural ops that follow checkpoint with the active track recorded).
    function setActiveTrack(id) { if (!hasTrack(id)) return false; activeTrackId = id; return true; }
    // Delete a non-main track (and its nodes/edges). Refuses 't0' and any track that
    // still has child branches forked from it (to avoid orphans). Undoable.
    function deleteTrack(id) {
      if (id === 't0' || !hasTrack(id)) return { ok: false, reason: 'cannot delete this track' };
      if (tracks.some((t) => t.parentId === id)) return { ok: false, reason: 'track has child branches; delete those first' };
      checkpoint();
      for (const n of [...nodes.values()]) if ((n.track || 't0') === id) { nodes.delete(n.id); order.delete(n.id); }
      edges = edges.filter((e) => nodes.has(e.from) && nodes.has(e.to));
      const t = tracks.find((x) => x.id === id);
      tracks = tracks.filter((x) => x.id !== id);
      trackAssume.delete(id);                       // C3: drop the deleted branch's assumptions
      if (activeTrackId === id) activeTrackId = (t && hasTrack(t.parentId)) ? t.parentId : 't0';
      return { ok: true };
    }
    function tracksList() { return tracks.map((t) => ({ id: t.id, label: t.label, parentId: t.parentId, forkColumn: t.forkColumn })); }

    // Apply a per-node transform to every node of the current last column, emitting
    // the results as a new column (single undo step). make(node) → { poly, rel?,
    // provenance, label, meta? } or a falsy value / zero poly to drop the node.
    // Returns { ok, created[], column, reason? }; nothing is mutated on failure.
    function _appendReduction(make) {
      const src = lastColumnNodes();
      if (!src.length) return { ok: false, reason: 'no system to reduce (seed first)', created: [] };
      const built = [], seen = [];
      for (const n of src) {
        let spec;
        try { spec = make(n); } catch (e) { return { ok: false, reason: (e && e.message) || String(e), created: [] }; }
        if (!spec || !spec.poly || spec.poly.isZero()) continue;
        const rel = spec.rel || n.rel;
        // Dedup on (poly, rel) — two nodes collapse only if BOTH the polynomial and the
        // relation match; an equality f=0 and an inequality f>0 sharing a poly are distinct.
        if (seen.some((s) => s.rel === rel && s.poly.equals(spec.poly))) continue;
        seen.push({ poly: spec.poly, rel });
        built.push({ src: n, spec });
      }
      if (!built.length) return { ok: false, reason: 'reduction produced an empty system', created: [] };
      checkpoint();
      const col = maxColumn() + 1;
      const created = [];
      for (const { src: s, spec } of built) {
        const node = addNode({
          id: nid(), kind: 'derived', poly: spec.poly, rel: spec.rel || s.rel,
          label: spec.label, model, provenance: spec.provenance, column: col, meta: spec.meta || s.meta,
        });
        edges.push({ from: s.id, to: node.id });
        created.push(node);
      }
      normalizeColumn(col);
      return { ok: true, created, column: col };
    }

    // Exact ℚ(i) value + a JSON-safe record from a {re,im} float pair (reuses the one
    // rationalizer in QDEquations — continued fractions, the same path φ(0) uses).
    function _ratGauss(value) {
      const S = getSym(), QE = getQE();
      if (!QE || !QE.ratApprox) throw new Error('AlgebraStore: QD.QDEquations.ratApprox unavailable');
      const re = (value && value.re) || 0, im = (value && value.im) || 0;
      const [rn, rd] = QE.ratApprox(re), [inn, idd] = QE.ratApprox(im);
      return {
        g: S.gauss(S.rat(rn, rd), S.rat(inn, idd)),
        record: { re: [rn.toString(), rd.toString()], im: [inn.toString(), idd.toString()], approx: { re, im } },
      };
    }
    // Compact value string for a node/column label (from the original float approx).
    function _valShort(approx) {
      const f = (x) => String(Math.round(x * 1e6) / 1e6);
      const re = (approx && approx.re) || 0, im = (approx && approx.im) || 0;
      if (!im) return f(re);
      if (!re) return f(im) + 'i';
      return f(re) + (im < 0 ? ' − ' : ' + ') + f(Math.abs(im)) + 'i';
    }

    // Specify several variables' values in ONE column: substitute the exact ℚ(i)
    // rationalization of each `value` ({re,im} floats) for its `varName` in the current
    // system → a single new column (one undo step, one provenance). `pairs` is
    // [{ varName, value }, …]. A value fully determines the variable's CONJUGATE
    // (z₁=1+i ⟹ z̄₁=1−i), so each substitution ALSO substitutes the conjugate variable
    // with the conjugate value (the same logic fixW0 uses for w₀/w̄₀) — `poly.subst`
    // silently skips a conjugate that is absent (e.g. already collapsed by assume-real).
    // By default (opts.propagate !== false) chains a linear-propagation pass
    // (reducePropagate) so the fixed values cascade — e.g. φ(0)=0 ⇒ w₀=0 can then force
    // z₁ — visible as its own column. Returns the append result (+ .propagated).
    function substituteValues(pairs, opts) {
      opts = opts || {};
      const S = getSym(), QC = getQC();
      pairs = (pairs || []).filter((p) => p && p.varName);
      if (!pairs.length) return { ok: false, reason: 'no variables to set', created: [] };
      const sub = {}, recs = [];
      try {
        for (const p of pairs) {
          const { g, record } = _ratGauss(p.value);
          sub[p.varName] = S.mpolyConst(g);
          let conjugate = null;
          if (QC && QC.conjVarName) {
            const c = _conjName(p.varName);   // overlay-aware: pins a defined symbol's conjugate t̄ too
            if (c && c !== p.varName) { sub[c] = S.mpolyConst(g.conj()); conjugate = c; }
          }
          recs.push({ name: p.varName, value: record, conjugate });
        }
      } catch (e) { return { ok: false, reason: (e && e.message) || String(e), created: [] }; }
      const subVars = Object.keys(sub);
      if (!lastColumnNodes().some((n) => { const vs = nodeVars(n); return subVars.some((v) => vs.has(v)); })) {
        return { ok: false, reason: 'none of ' + pairs.map((p) => p.varName).join(', ') + ' are in the current system', created: [] };
      }
      const label = 'set ' + recs.map((r) => r.name + ' = ' + _valShort(r.value.approx)).join(', ');
      const res = _appendReduction((n) => ({
        poly: subVars.some((v) => nodeVars(n).has(v)) ? n.poly.subst(sub) : n.poly,
        provenance: { op: 'substitute', inputs: [n.id], variables: recs }, label,
      }));
      if (res.ok && opts.propagate !== false) {
        const pr = reducePropagate();
        if (pr.ok) res.propagated = pr; else res.propagateReason = pr.reason;
      }
      return res;
    }

    // Single-variable convenience wrapper (back-compat): substitute one variable's value
    // (and its conjugate) in a new column. Delegates to substituteValues.
    function substituteValue(varName, value, opts) {
      return substituteValues([{ varName, value }], opts);
    }

    // Linear-propagation pass: run Sym.linearReduce on the current system's equalities
    // (eliminate every degree-1, constant-leading-coeff variable to a fixpoint) → a new
    // column. Inequalities are carried forward with the eliminated assignments applied.
    // An inconsistent system collapses to a single 1 = 0 marker (meta.inconsistent).
    // Returns { ok, created[], column, eliminated[], inconsistent } or { ok:false, reason }.
    function reducePropagate() {
      const S = getSym();
      const src = lastColumnNodes();
      if (!src.length) return { ok: false, reason: 'no system to reduce (seed first)', created: [] };
      const eqs = src.filter((n) => n.rel === '='), others = src.filter((n) => n.rel !== '=');
      if (!eqs.length) return { ok: false, reason: 'no equality nodes to propagate', created: [] };
      let lr;
      try { lr = S.linearReduce(eqs.map((n) => n.poly)); }
      catch (e) { return { ok: false, reason: (e && e.message) || String(e), created: [] }; }
      if (!lr.eliminated.length) return { ok: false, reason: 'no linear variable to propagate', created: [] };
      const subMap = {}; for (const el of lr.eliminated) subMap[el.name] = el.expr;
      const elimNames = lr.eliminated.map((e) => e.name);
      // Persist CONSTANT eliminations (var → a number) so φ can be reconstructed after the
      // variable leaves the system (C). A non-constant expr (var = a combo of others) isn't
      // recorded — it would need the solution to evaluate.
      const elimValues = [];
      for (const e of lr.eliminated) {
        try { if (e.expr && e.expr.vars && e.expr.vars().size === 0) { const c = e.expr.evalComplex({}); elimValues.push({ name: e.name, value: { re: c.re, im: c.im } }); } } catch (_) { /* skip */ }
      }
      const prov = { op: 'linear-reduce', inputs: eqs.map((n) => n.id), eliminated: elimNames.slice(), values: elimValues };
      const label = 'propagate: eliminate ' + elimNames.join(', ');
      checkpoint();
      const col = maxColumn() + 1;
      const created = [], seen = [];
      const emit = (poly, rel, meta) => {
        if (!poly || poly.isZero()) return;
        if (seen.some((p) => p.equals(poly))) return;
        seen.push(poly);
        const node = addNode({ id: nid(), kind: 'derived', poly, rel, label, model, provenance: prov, column: col, meta: meta || {} });
        for (const s of eqs) edges.push({ from: s.id, to: node.id });
        created.push(node);
      };
      if (lr.inconsistent) {
        emit(S.mpolyConst(S.gauss(S.rat(1n, 1n), S.rat(0n, 1n))), '=', { inconsistent: true });
      } else {
        for (const g of lr.reduced) emit(g, '=', {});
        for (const o of others) emit(o.poly.subst(subMap), o.rel, o.meta);
      }
      if (!created.length) { undoStack.pop(); return { ok: false, reason: 'reduction produced an empty system', created: [] }; }
      normalizeColumn(col);
      return { ok: true, created, column: col, eliminated: elimNames, inconsistent: !!lr.inconsistent };
    }

    // Assume the given (base) variables are REAL: identify v̄ ≡ v in the current system
    // → a new column. Records the assumption in realVars so later conjugate companions
    // / constraints / nodeStats fold it in too. Returns the append result.
    function assumeReal(vars, opts) {
      const QC = getQC();
      if (!QC || !QC.conjVarName) return { ok: false, reason: 'QD.QDConstraints not loaded', created: [] };
      const prim = [...new Set((vars || []).map(_primalName))];
      if (!prim.length) return { ok: false, reason: 'no variables selected', created: [] };
      const map = {};
      for (const rv of prim) { const c = _conjName(rv); if (c !== rv) map[c] = rv; }   // overlay-aware (defined symbols too)
      if (!Object.keys(map).length) return { ok: false, reason: 'selected variable(s) have no conjugate partner', created: [] };
      const rename = (n) => (Object.prototype.hasOwnProperty.call(map, n) ? map[n] : n);
      const label = 'assume real: ' + prim.join(', ');
      const res = _appendReduction((n) => ({
        poly: n.poly.relabel(rename),
        provenance: { op: 'assume-real', inputs: [n.id], vars: prim.slice() }, label,
      }));
      if (res.ok) { const a = assumeOf(); a.realVars = [...new Set([...a.realVars, ...prim])]; }
      return res;
    }

    // Assume the given (base) variables are PURELY IMAGINARY: v̄ ≡ −v in the current system
    // → a new column. Unlike assumeReal (a rename v̄→v), this SUBSTITUTES v̄ → −v, and records
    // the assumption in imagVars so later conjugate companions / constraints / propagation fold
    // it in too. Returns the append result.
    function assumeImaginary(vars, opts) {
      const QC = getQC(), S = getSym();
      if (!QC || !QC.conjVarName) return { ok: false, reason: 'QD.QDConstraints not loaded', created: [] };
      const prim = [...new Set((vars || []).map(_primalName))];
      if (!prim.length) return { ok: false, reason: 'no variables selected', created: [] };
      const sub = {};
      for (const iv of prim) { const c = _conjName(iv); if (c !== iv) sub[c] = S.mpolyVar(iv).neg(); }   // overlay-aware (defined symbols too)
      if (!Object.keys(sub).length) return { ok: false, reason: 'selected variable(s) have no conjugate partner', created: [] };
      const label = 'assume imaginary: ' + prim.join(', ');
      const res = _appendReduction((n) => ({
        poly: n.poly.subst(sub),
        provenance: { op: 'assume-imaginary', inputs: [n.id], vars: prim.slice() }, label,
      }));
      if (res.ok) { const a = assumeOf(); a.imagVars = [...new Set([...a.imagVars, ...prim])]; }
      return res;
    }

    // --- Gaussian ↔ serializable record (for substitution ratios in provenance) ---
    function _gaussRecord(g) {
      return { re: [g.re.n.toString(), g.re.d.toString()], im: [g.im.n.toString(), g.im.d.toString()] };
    }
    function _gaussFromRecord(rec) {
      const S = getSym();
      return S.gauss(S.rat(BigInt(rec.re[0]), BigInt(rec.re[1])), S.rat(BigInt(rec.im[0]), BigInt(rec.im[1])));
    }
    // Coerce a ratio argument to a Gaussian. Accepts a NUMBER ±1 (a sign — the shipped
    // identifyVariables contract), a serializable record { re:[n,d], im:[n,d] }, or a Gaussian.
    function _toGauss(ratio) {
      const S = getSym();
      if (ratio == null) return S.gaussInt(1);
      if (typeof ratio === 'number') return S.gaussInt(ratio < 0 ? -1 : 1);
      if (Array.isArray(ratio.re)) return _gaussFromRecord(ratio);
      return ratio;                                              // assume a Gaussian
    }
    // --- PLAIN-text (no-LaTeX) rendering of an MPoly, for node/column labels (which the canvas
    // shows as textContent). KaTeX rendering happens on the node's polynomial body, not the label.
    function _ratPlain(r) { return r.d === 1n ? r.n.toString() : (r.n.toString() + '/' + r.d.toString()); }
    function _gaussPlain(c) {
      const reZ = c.re.n === 0n, imZ = c.im.n === 0n;
      if (reZ && imZ) return '0';
      if (imZ) return _ratPlain(c.re);
      const neg = c.im.n < 0n;
      const imMag = _ratPlain({ n: neg ? -c.im.n : c.im.n, d: c.im.d });
      const imStr = (imMag === '1' ? '' : imMag) + 'i';
      if (reZ) return (neg ? '-' : '') + imStr;
      return _ratPlain(c.re) + (neg ? ' - ' : ' + ') + imStr;
    }
    const _SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
    function _plainPoly(g) {
      const terms = [...g.terms.values()];
      if (!terms.length) return '0';
      const sup = (e) => (e === 1 ? '' : String(e).replace(/[-0-9]/g, (d) => _SUP[d] || ('^' + d)));
      const parts = terms.map((t) => {
        const monoStr = [...t.mono.entries()].map(([v, e]) => v + sup(e)).join('·');
        const cStr = _gaussPlain(t.coeff);
        if (!monoStr) return cStr;
        if (cStr === '1') return monoStr;
        if (cStr === '-1') return '-' + monoStr;
        const complex = t.coeff.re.n !== 0n && t.coeff.im.n !== 0n;
        return (complex ? '(' + cStr + ')' : cStr) + '·' + monoStr;
      });
      return parts.join(' + ').replace(/\+ -/g, '- ');
    }
    // Compact label fragment for a ratio c: '' for 1, '−' for −1, else '(c)·'.
    function _ratioLabel(g) {
      const re = g.re.toNumber(), im = g.im.toNumber();
      if (im === 0 && re === 1) return '';
      if (im === 0 && re === -1) return '−';
      return '(' + _valShort({ re, im }) + ')·';
    }

    // Identify two DISTINCT base variables in the current system: substitute drop → ratio·keep —
    // and the conjugate drop̄ → c̄onj(ratio)·keep̄ — → a new column. `ratio` is a Gaussian / record /
    // a ±1 number (the shipped sign contract; +1 ⇒ drop=keep, −1 ⇒ drop=−keep). The apply for a
    // detected IDENTIFY (unit ratio) or LINEAR (general ratio drop = c·keep) symmetry. Returns the
    // append result.
    function identifyVariables(keep, drop, ratio) {
      const QC = getQC(), S = getSym();
      keep = _primalName(keep); drop = _primalName(drop);
      if (!keep || !drop || keep === drop) return { ok: false, reason: 'need two distinct variables to identify', created: [] };
      const g = _toGauss(ratio), rec = _gaussRecord(g);
      const sub = {}; sub[drop] = S.mpolyVar(keep).mul(S.mpolyConst(g));
      if (QC && QC.conjVarName) {                                // a value identifies the conjugates too
        const dc = _conjName(drop), kc = _conjName(keep);   // overlay-aware (defined symbols too)
        if (dc !== drop && kc) sub[dc] = S.mpolyVar(kc).mul(S.mpolyConst(g.conj()));
      }
      const label = 'identify ' + drop + ' = ' + _ratioLabel(g) + keep;
      return _appendReduction((n) => ({
        poly: n.poly.subst(sub),
        provenance: { op: 'identify', inputs: [n.id], keep, drop, ratio: rec }, label,
      }));
    }

    // Apply a CONJUGATE-POLE-PAIR symmetry varName = ratio·conj(other) (e.g. z₂ = ±z̄₁): substitute
    // varName → ratio·conjVarName(other) and conj(varName) → c̄onj(ratio)·other → a new column. The
    // apply for a detected kind:'conjugate-pair'. `ratio` is a Gaussian / record / ±1 number.
    function applyConjugatePair(varName, otherName, ratio) {
      const QC = getQC(), S = getSym();
      if (!QC || !QC.conjVarName) return { ok: false, reason: 'QD.QDConstraints not loaded', created: [] };
      const v = _primalName(varName), other = _primalName(otherName);
      if (!v || !other || v === other) return { ok: false, reason: 'need two distinct variables', created: [] };
      const vc = _conjName(v), oc = _conjName(other);   // overlay-aware (defined symbols too)
      if (vc === v || oc === other) return { ok: false, reason: 'variables have no conjugate partner', created: [] };
      const g = _toGauss(ratio), rec = _gaussRecord(g);
      const sub = {};
      sub[v] = S.mpolyVar(oc).mul(S.mpolyConst(g));               // v = ratio·conj(other)
      sub[vc] = S.mpolyVar(other).mul(S.mpolyConst(g.conj()));    // v̄ = conj(ratio)·other
      const label = 'identify ' + v + ' = ' + _ratioLabel(g) + 'conj(' + other + ')';
      return _appendReduction((n) => ({
        poly: n.poly.subst(sub),
        provenance: { op: 'identify-conj', inputs: [n.id], var: v, other, ratio: rec }, label,
      }));
    }

    // ============================================================================
    // CUSTOM USER-DEFINED VARIABLE SUBSTITUTIONS — introduce a fresh symbol t := g(vars)
    // and substitute it into the current system (an append-column reduction). Three regimes,
    // auto-dispatched by the SHAPE of g (defineSubstitution picks; opts.regime overrides):
    //   • LINEAR    — g is degree-1 in some variable v with a constant leading coeff: solve
    //                 v = (t − r)/c and substitute (exact, pure rewrite, 1:1 with the system).
    //                 The conjugate v̄ is paired (v̄ = (t̄ − r̄)/c̄) when v has a DISTINCT
    //                 conjugate that does NOT appear in g (non-circular); a self-conjugate
    //                 pivot with self-conjugate g substitutes v alone (t is then real).
    //   • MONOMIAL  — g = c·μ is a single monomial (e.g. s := w₁², t := z₁z̄₁ = |z₁|²): a
    //                 SYNTACTIC exponent rewrite (a node is rewritable iff every term's
    //                 exponents over μ's variables are the same non-negative multiple of μ's).
    //                 Non-rewritable nodes are CARRIED through; the defining equation t − μ = 0
    //                 is emitted only when μ's variables survive, so the variety is unchanged.
    //   • GENERAL   — anything else (ideal-theoretic). Adjoin t − g (+ the conjugate t̄ − ḡ
    //                 when g isn't self-conjugate) to the system. opts.dropVars=[] (default)
    //                 just ADDS the definition (variety unchanged); a non-empty dropVars
    //                 ELIMINATES those variables via a block Gröbner basis (heavy → also
    //                 available off-thread as defineSubstitutionAsync).
    // When g is NOT self-conjugate the new symbol's conjugate t̄ is REGISTERED (substConj /
    // substBarred overlay) so reality / conjugation / reim treat the pair correctly. The
    // mutually-circular conjugate-sum case (the chosen variable's own conjugate appears in g,
    // e.g. u := z₁+z̄₁) can't be eliminated by substitution and is routed to the GENERAL
    // (add-definition) regime — Andrew's call.
    // ============================================================================

    // The constant (empty-monomial) Gaussian coefficient of a variable-free MPoly.
    function _constGaussOf(poly) {
      const S = getSym();
      for (const t of poly.terms.values()) if (t.mono.size === 0) return t.coeff;
      return S.gaussInt(0);
    }
    // g^k for a Gaussian g (k ≥ 0).
    function _powGauss(g, k) { const S = getSym(); let r = S.gaussInt(1); for (let i = 0; i < k; i++) r = r.mul(g); return r; }
    // A fresh short symbol name for an auto-suggested substitution (avoid the QD letters + i/e).
    const _SUBST_RESERVED = new Set(['c', 'w', 'z', 'a', 'A', 'C', 'F', 'i', 'I', 'e']);
    function _nameTaken() { const s = new Set(variables()); for (const k of substConj.keys()) s.add(k); return s; }
    function _freshSubstName(preferred) {
      const taken = _nameTaken();
      const free = (nm) => nm && !taken.has(nm) && !_SUBST_RESERVED.has(nm);
      if (free(preferred)) return preferred;
      for (const ch of 'stuvpqrhkmn') if (free(ch)) return ch;
      for (let i = 1; i < 100000; i++) { const nm = 's' + i; if (free(nm)) return nm; }
      return 's' + variables().length;   // unreachable in practice
    }
    // A fresh "barred" name for the conjugate of a primal substitution symbol.
    function _barName(primal) {
      const taken = _nameTaken();
      let b = primal + 'b'; if (b !== primal && !taken.has(b)) return b;
      b = primal + '_bar'; let i = 0; while (taken.has(b)) b = primal + '_bar' + (++i);
      return b;
    }
    // Is g self-conjugate (g = ḡ, i.e. g is REAL on the reality slice)? Then t := g is real.
    function _isSelfConj(g) { return g.equals(_conjMPoly(g)); }
    // The variable g is degree-1 in with a constant (variable-free) nonzero leading coeff, or null.
    function _linearElimVar(g) {
      for (const v of g.vars()) {
        if (g.degreeIn(v) !== 1) continue;
        const cs = g.coeffsIn(v);                 // [c0, c1]; c1 = ∂g/∂v
        if (cs.length === 2 && cs[1].vars().size === 0 && !cs[1].isZero()) return v;
      }
      return null;
    }
    // Pick the substitution regime from the shape of g (opts.regime overrides).
    function _substRegime(g, opts) {
      if (opts && opts.regime) return opts.regime;
      if (g.terms.size === 1) return 'monomial';
      const v = _linearElimVar(g);
      if (v != null) {
        const vc = _conjName(v);
        if (vc !== v) return g.vars().has(vc) ? 'general' : 'linear';   // distinct conj: circular ⇒ ideal
        return _isSelfConj(g) ? 'linear' : 'general';                   // self-conj pivot: linear only if g real
      }
      return 'general';
    }

    // Validate the (newVar, exprPoly) request shared by every regime. Returns { ok } / { ok:false, reason }.
    function _validateDefine(newVar, g) {
      if (!getSym()) return { ok: false, reason: 'QD.Sym unavailable' };
      if (!g || typeof g.vars !== 'function') return { ok: false, reason: 'no expression to define' };
      if (g.isZero()) return { ok: false, reason: 'the expression is identically zero' };
      if (!newVar) return { ok: false, reason: 'a name for the new variable is required' };
      if (/[^A-Za-z0-9_]/.test(newVar)) return { ok: false, reason: 'the new variable name must be alphanumeric / underscore only' };
      const existing = new Set(variables());
      if (existing.has(newVar) || substConj.has(newVar)) return { ok: false, reason: '"' + newVar + '" is already a variable in the system' };
      const gVars = [...g.vars()];
      const missing = gVars.filter((v) => !existing.has(v));
      if (missing.length) return { ok: false, reason: 'unknown variable(s) in the expression: ' + missing.join(', ') };
      const last = new Set(); for (const n of lastColumnNodes()) for (const v of nodeVars(n)) last.add(v);
      if (!gVars.some((v) => last.has(v))) return { ok: false, reason: 'none of the expression variables are in the current system' };
      return { ok: true };
    }

    // INTRODUCE t := g and substitute it in. Auto-dispatches the regime. Returns the append
    // result { ok, created, column, regime, newVar } or { ok:false, reason }.
    function defineSubstitution(newVar, exprPoly, opts) {
      opts = opts || {};
      newVar = String(newVar || '').trim();
      const v = _validateDefine(newVar, exprPoly);
      if (!v.ok) return Object.assign(v, { created: [] });
      const regime = _substRegime(exprPoly, opts);
      if (regime === 'linear') return _defineLinear(newVar, exprPoly, opts);
      if (regime === 'monomial') return _defineMonomial(newVar, exprPoly, opts);
      return _defineGeneral(newVar, exprPoly, opts);
    }

    // Shared committer for the substitution-MAP regimes (linear): dry-build the rewritten
    // column (dedup on (poly,rel)), then ONE checkpoint, register the conjugate pair, add the
    // nodes. checkpoint precedes registration so undo unregisters. `reg` = { real, bar, newVar }.
    function _commitSubstMap(sub, prov, label, reg) {
      const src = lastColumnNodes();
      if (!src.length) return { ok: false, reason: 'no system to reduce (seed first)', created: [] };
      const subVars = Object.keys(sub);
      const built = [], seen = [];
      for (const n of src) {
        const poly = subVars.some((vv) => nodeVars(n).has(vv)) ? n.poly.subst(sub) : n.poly;
        if (poly.isZero()) continue;
        if (seen.some((s) => s.rel === n.rel && s.poly.equals(poly))) continue;
        seen.push({ poly, rel: n.rel }); built.push({ src: n, poly });
      }
      if (!built.length) return { ok: false, reason: 'the substitution emptied the system', created: [] };
      checkpoint();
      if (reg && !reg.real && reg.bar) { substConj.set(reg.newVar, reg.bar); substConj.set(reg.bar, reg.newVar); substBarred.add(reg.bar); }
      const col = maxColumn() + 1, created = [];
      for (const b of built) {
        const node = addNode({ id: nid(), kind: 'derived', poly: b.poly, rel: b.src.rel, label, model,
          provenance: Object.assign({ inputs: [b.src.id] }, prov), column: col, meta: b.src.meta });
        edges.push({ from: b.src.id, to: node.id }); created.push(node);
      }
      normalizeColumn(col);
      return { ok: true, created, column: col, regime: prov.regime, newVar: prov.newVar };
    }

    // LINEAR regime: t := g with g degree-1 in v (constant coeff c). v = (t − r)/c.
    function _defineLinear(newVar, g, opts) {
      const S = getSym();
      const v = _linearElimVar(g);
      if (v == null) return { ok: false, reason: 'the expression is not linear in any variable', created: [] };
      const vc = _conjName(v);
      const cG = _constGaussOf(g.coeffsIn(v)[1]);                 // leading (constant) coeff of v in g
      const r = g.sub(S.mpolyVar(v).mul(S.mpolyConst(cG)));       // r = g − c·v (free of v)
      const t = S.mpolyVar(newVar);
      const cInv = S.mpolyConst(S.gaussInt(1).div(cG));
      const sub = {}; sub[v] = t.sub(r).mul(cInv);               // v = (t − r)/c
      let real = true, bar = null;
      if (vc !== v) {                                            // distinct conjugate, non-circular (regime-guaranteed) ⇒ g is NOT self-conj
        real = false; bar = _barName(newVar);
        const tBar = S.mpolyVar(bar);
        const cBarInv = S.mpolyConst(S.gaussInt(1).div(cG.conj()));
        sub[vc] = tBar.sub(_conjMPoly(r)).mul(cBarInv);          // v̄ = (t̄ − r̄)/c̄
      }                                                          // else: self-conjugate pivot with self-conjugate g ⇒ t is real, substitute v alone
      const label = 'define ' + newVar + ' := ' + _plainPoly(g);
      const prov = { op: 'define-subst', newVar, exprTerms: g.termList(), regime: 'linear', eliminated: v, real };
      return _commitSubstMap(sub, prov, label, { real, bar, newVar });
    }

    // Rewrite a polynomial as a polynomial in `varName` standing for the monomial μ (exponent
    // map `e`, coeff c): returns the rewritten MPoly, or null if some term is not a clean
    // non-negative multiple of μ over μ's variables (⇒ the node is not rewritable).
    function _rewriteByMonomial(poly, e, cG, varName) {
      const S = getSym();
      const V = [...e.keys()];
      let out = S.mpolyInt(0);
      for (const term of poly.terms.values()) {
        let k = null;
        for (const vn of V) {
          const need = e.get(vn), have = term.mono.get(vn) || 0;
          if (have % need !== 0) return null;
          const ki = have / need;
          if (k === null) k = ki; else if (ki !== k) return null;
        }
        if (k === null) k = 0;
        let coeff = term.coeff;
        if (k > 0) coeff = coeff.div(_powGauss(cG, k));          // μ = c·(monomial) ⇒ (monomial)^k = (t/c)^k
        let tm = S.mpolyConst(coeff);
        for (const [vn, ex] of term.mono) { if (e.has(vn)) continue; tm = tm.mul(S.mpolyVar(vn).pow(ex)); }
        if (k > 0) tm = tm.mul(S.mpolyVar(varName).pow(k));
        out = out.add(tm);
      }
      return out;
    }
    function _rewriteNodeMonomial(poly, rewriters) {
      let cur = poly;
      for (const rw of rewriters) { cur = _rewriteByMonomial(cur, rw.mono, rw.coeff, rw.varName); if (cur === null) return null; }
      return cur;
    }

    // MONOMIAL regime: t := c·μ (single monomial). Syntactic exponent rewrite.
    function _defineMonomial(newVar, g, opts) {
      opts = opts || {};
      const S = getSym();
      let e = null, cG = null;
      for (const t of g.terms.values()) { e = t.mono; cG = t.coeff; }
      if (!e || e.size === 0) return { ok: false, reason: 'the expression is a constant (no monomial to abbreviate)', created: [] };
      const real = _isSelfConj(g);
      const bar = real ? null : _barName(newVar);
      const rewriters = [{ mono: e, coeff: cG, varName: newVar }];
      if (!real) {                                               // also rewrite conj(μ) → t̄ (keeps conjugation-closure)
        const eb = new Map(); for (const [vn, ex] of e) eb.set(_conjName(vn), ex);
        rewriters.push({ mono: eb, coeff: cG.conj(), varName: bar });
      }
      const src = lastColumnNodes();
      if (!src.length) return { ok: false, reason: 'no system to reduce (seed first)', created: [] };
      const built = [], seen = []; let anyRewritten = false;
      for (const n of src) {
        let poly = _rewriteNodeMonomial(n.poly, rewriters), carried = false;
        if (poly === null) { poly = n.poly; carried = true; } else if (!poly.equals(n.poly)) anyRewritten = true;
        if (poly.isZero()) continue;
        if (seen.some((s) => s.rel === n.rel && s.poly.equals(poly))) continue;
        seen.push({ poly, rel: n.rel }); built.push({ src: n, poly, carried });
      }
      if (!anyRewritten && !opts.force) return { ok: false, reason: 'the expression "' + _plainPoly(g) + '" does not appear as a clean power anywhere in the current system', created: [] };
      // Do μ's variables still appear after the rewrite? If so, pin the new symbol with its
      // defining equation t − μ = 0 (so the system + definition is the SAME variety). If they
      // vanished entirely (the headline s := w₁² case), the abbreviation is complete — no def node.
      const muVars = new Set(); for (const rw of rewriters) for (const vn of rw.mono.keys()) muVars.add(vn);
      const needDef = built.some((b) => [...muVars].some((vn) => b.poly.vars().has(vn)));
      checkpoint();
      if (!real) { substConj.set(newVar, bar); substConj.set(bar, newVar); substBarred.add(bar); }
      const col = maxColumn() + 1, created = [];
      const label = 'define ' + newVar + ' := ' + _plainPoly(g);
      const prov = { op: 'define-subst', newVar, exprTerms: g.termList(), regime: 'monomial', real };
      for (const b of built) {
        const node = addNode({ id: nid(), kind: 'derived', poly: b.poly, rel: b.src.rel, label, model,
          provenance: Object.assign({ inputs: [b.src.id], carried: b.carried }, prov), column: col, meta: b.src.meta });
        edges.push({ from: b.src.id, to: node.id }); created.push(node);
      }
      if (needDef) {
        const defP = S.mpolyVar(newVar).sub(g);
        created.push(addNode({ id: nid(), kind: 'derived', poly: defP, rel: '=', label: 'definition ' + newVar + ' = ' + _plainPoly(g), model,
          provenance: Object.assign({ inputs: [], definition: true }, prov), column: col }));
        if (!real) {
          const gb = _conjMPoly(g), defB = S.mpolyVar(bar).sub(gb);
          created.push(addNode({ id: nid(), kind: 'derived', poly: defB, rel: '=', label: 'definition ' + bar + ' = ' + _plainPoly(gb), model,
            provenance: Object.assign({ inputs: [], definition: true }, prov), column: col }));
        }
      }
      normalizeColumn(col);
      return { ok: true, created, column: col, regime: 'monomial', newVar, rewritten: anyRewritten };
    }

    // GENERAL (ideal-theoretic) regime: adjoin t − g (+ conjugate). opts.dropVars=[] ⇒ ADD the
    // definition(s) only (variety unchanged); a non-empty dropVars ⇒ block-Gröbner ELIMINATE them.
    function _defineGeneralDefs(newVar, g) {
      const S = getSym();
      const real = _isSelfConj(g);
      const bar = real ? null : _barName(newVar);
      const defs = [{ poly: S.mpolyVar(newVar).sub(g), label: 'definition ' + newVar + ' = ' + _plainPoly(g) }];
      if (!real) { const gb = _conjMPoly(g); defs.push({ poly: S.mpolyVar(bar).sub(gb), label: 'definition ' + bar + ' = ' + _plainPoly(gb) }); }
      return { real, bar, defs };
    }
    function _defineGeneral(newVar, g, opts) {
      opts = opts || {};
      const S = getSym();
      const dropVars = (opts.dropVars || []).slice();
      const { real, bar, defs } = _defineGeneralDefs(newVar, g);
      const src = lastColumnNodes();
      if (!src.length) return { ok: false, reason: 'no system to reduce (seed first)', created: [] };

      if (!dropVars.length) {
        // ADD the definition(s) to the CURRENT column — no elimination, variety unchanged.
        const col = maxColumn();
        const present = (poly) => [...nodes.values()].some((m) => m.column === col && (m.track || 't0') === activeTrackId && m.poly.equals(poly));
        const toAdd = defs.filter((d) => !present(d.poly));
        if (!toAdd.length) return { ok: false, reason: 'this definition is already present in the current system', created: [] };
        checkpoint();
        if (!real) { substConj.set(newVar, bar); substConj.set(bar, newVar); substBarred.add(bar); }
        const created = [], prov = { op: 'define-subst', newVar, exprTerms: g.termList(), regime: 'general', dropVars: [], real };
        for (const d of toAdd) {
          created.push(addNode({ id: nid(), kind: 'derived', poly: d.poly, rel: '=', label: d.label, model,
            provenance: Object.assign({ inputs: [], definition: true }, prov), column: col }));
        }
        normalizeColumn(col);
        return { ok: true, created, column: col, regime: 'general', newVar };
      }

      // ELIMINATE dropVars from ⟨current equalities, defs⟩ via a block Gröbner basis.
      const eqs = src.filter((n) => n.rel === '=');
      const polys = eqs.map((n) => n.poly).concat(defs.map((d) => d.poly));
      const keep = (() => { const s = new Set(); for (const p of polys) for (const vn of p.vars()) if (!dropVars.includes(vn)) s.add(vn); return [...s].sort(); })();
      let basis;
      try { basis = S.buchberger(polys, S.eliminationOrder(dropVars, keep), opts); }
      catch (e) { return { ok: false, reason: (e && e.message) || String(e), created: [] }; }
      return _defineGeneralFinish(newVar, g, { real, bar, dropVars, inputIds: eqs.map((n) => n.id), col: maxColumn() + 1 }, basis);
    }
    // Emit the dropVars-free generators of a general-elimination Gröbner basis (shared sync/async tail).
    function _defineGeneralFinish(newVar, g, plan, basis) {
      const gens = (basis || []).filter((b) => { const vs = b.vars(); return !plan.dropVars.some((v) => vs.has(v)); }).filter((b) => !b.isZero());
      if (!gens.length) return { ok: false, reason: 'eliminating ' + plan.dropVars.join(', ') + ' left no generator (the elimination ideal is trivial)', created: [] };
      checkpoint();
      if (!plan.real) { substConj.set(newVar, plan.bar); substConj.set(plan.bar, newVar); substBarred.add(plan.bar); }
      const created = [], col = plan.col;
      const label = 'define ' + newVar + ' := ' + _plainPoly(g) + ' · eliminate ' + plan.dropVars.join(', ');
      const prov = { op: 'define-subst', newVar, exprTerms: g.termList(), regime: 'general', dropVars: plan.dropVars.slice(), real: plan.real };
      gens.forEach((poly, i) => {
        const node = addNode({ id: nid(), kind: 'derived', poly, rel: '=', label: label + ' (' + (i + 1) + '/' + gens.length + ')', model,
          provenance: Object.assign({ inputs: plan.inputIds.slice() }, prov), column: col });
        for (const src of plan.inputIds) edges.push({ from: src, to: node.id });
        created.push(node);
      });
      normalizeColumn(col);
      return { ok: true, created, column: col, regime: 'general', newVar };
    }
    // Off-main-thread general elimination via QD.SymWorker (the heavy dropVars Gröbner). Only the
    // dropVars-elimination path is offloaded; the cheap regimes resolve to the sync result.
    function defineSubstitutionAsync(newVar, exprPoly, opts, runOpts) {
      opts = opts || {};
      newVar = String(newVar || '').trim();
      const v = _validateDefine(newVar, exprPoly);
      if (!v.ok) return Promise.resolve(Object.assign(v, { created: [] }));
      const regime = _substRegime(exprPoly, opts);
      const dropVars = (opts.dropVars || []).slice();
      if (regime !== 'general' || !dropVars.length) return Promise.resolve(defineSubstitution(newVar, exprPoly, opts));
      const SW = symWorker();
      if (!SW) return Promise.resolve(defineSubstitution(newVar, exprPoly, opts));
      const S = getSym();
      const { real, bar, defs } = _defineGeneralDefs(newVar, exprPoly);
      const eqs = lastColumnNodes().filter((n) => n.rel === '=');
      const polys = eqs.map((n) => n.poly).concat(defs.map((d) => d.poly));
      const keep = (() => { const s = new Set(); for (const p of polys) for (const vn of p.vars()) if (!dropVars.includes(vn)) s.add(vn); return [...s].sort(); })();
      const payload = { polys: polys.map((p) => p.termList()), orderSpec: { kind: 'block', blocks: [dropVars.slice(), keep] }, opts: _capOpts(opts) };
      const plan = { real, bar, dropVars, inputIds: eqs.map((n) => n.id), col: maxColumn() + 1 };
      return SW.run('groebner', payload, runOpts || {}).then(
        (res) => _defineGeneralFinish(newVar, exprPoly, plan, (res.generators || []).map((tl) => S.polyFromTermList(tl))),
        (err) => (err && err.aborted) ? { ok: false, aborted: true, reason: 'cancelled', created: [] }
          : { ok: false, reason: (err && err.message) || String(err), created: [] });
    }

    function _gcdInt(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
    // Auto-SUGGEST custom substitutions from structural regularities in the current system (pure
    // query, no mutation). Ranked hits — each Apply calls defineSubstitution(newVar, expr, {regime}):
    //   • MODULUS  z·z̄ = |z|² recurring within terms (highest — QD-meaningful, real).
    //   • POWER    a variable appearing only with exponents sharing gcd g>1 ⇒ s := v^g (the s=w₁²
    //              cardioid-resolvent reduction).
    //   • GCD      a nontrivial factor shared by every equation (Sym.gcdList) — abbreviate it.
    //   • CONJ-SUM v + v̄ (a real coordinate, 2·Re v) when both appear linearly (routed to the
    //              ideal/add-definition regime — the mutually-circular conjugate-sum case).
    // Returns [{ kind, newVar, expr (MPoly), exprTerms, label, score, regime, real }], top-N by score.
    function detectSubstitutions(ids) {
      const S = getSym();
      if (!S) return [];
      const src = (ids && ids.length ? ids.map(get).filter(Boolean) : lastColumnNodes()).filter((n) => n.rel === '=');
      if (!src.length) return [];
      const polys = src.map((n) => n.poly);
      const out = [], taken = _nameTaken();
      const pick = (pref) => { let nm = _freshSubstName(pref); let i = 1; while (taken.has(nm)) { nm = _freshSubstName((pref || 's') + i); i++; } taken.add(nm); return nm; };
      const mkHit = (kind, expr, regime, real, score, pref, label) => {
        if (!expr || expr.isZero() || expr.vars().size === 0) return;
        out.push({ kind, newVar: pick(pref), expr, exprTerms: expr.termList(), regime, real: !!real, score, label });
      };
      const conj = (v) => _conjName(v);
      const allVars = new Set(); for (const p of polys) for (const v of p.vars()) allVars.add(v);

      // (1) modulus z·z̄ recurring within a single term
      const pairCount = new Map();
      for (const p of polys) for (const t of p.terms.values()) for (const v of t.mono.keys()) {
        // count once per term per pair: only from the PRIMAL side (else z·z̄ counts twice)
        if (v !== _primalName(v)) continue;
        const c = conj(v); if (c !== v && t.mono.has(c)) pairCount.set(v, (pairCount.get(v) || 0) + 1);
      }
      for (const [prim, cnt] of pairCount) {
        const c = conj(prim); if (c === prim) continue;
        mkHit('modulus', S.mpolyVar(prim).mul(S.mpolyVar(c)), 'monomial', true, 100 + cnt, 't',
          'abbreviate |' + prim + '|² = ' + prim + '·' + c + ' (recurs ' + cnt + '×)');
      }
      // (2) even / common-power v^g
      for (const v of allVars) {
        let g = 0, appears = false;
        for (const p of polys) for (const t of p.terms.values()) { const e = t.mono.get(v) || 0; if (e > 0) { appears = true; g = _gcdInt(g, e); } }
        if (appears && g >= 2) {
          const expr = S.mpolyVar(v).pow(g);
          mkHit('power', expr, 'monomial', _isSelfConj(expr), 60 + g, 's', v + ' appears only as ' + v + '^' + g + ' — set s := ' + v + '^' + g);
        }
      }
      // (3) gcd common factor across all equations
      try {
        if (polys.length >= 2) {
          const gg = S.gcdList(polys);
          if (gg && gg.vars && gg.vars().size > 0 && !gg.isZero()) mkHit('gcd', gg, _substRegime(gg, {}), _isSelfConj(gg), 45, 't', 'every equation shares the factor ' + _plainPoly(gg));
        }
      } catch (e) { /* gcd is best-effort */ }
      // (4) conjugate-sum real coordinate v + v̄ (both present, linear)
      for (const v of allVars) {
        const c = conj(v); if (c === v || v > c || !allVars.has(c)) continue;
        const lin = (x) => polys.some((p) => [...p.terms.values()].some((t) => (t.mono.get(x) || 0) === 1));
        if (!lin(v) || !lin(c)) continue;
        mkHit('conj-sum', S.mpolyVar(v).add(S.mpolyVar(c)), 'general', true, 20, 'u', v + ' + ' + c + ' = 2·Re ' + _primalName(v) + ' as a real coordinate');
      }
      out.sort((a, b) => b.score - a.score);
      return out.slice(0, 8);
    }

    // B2 — iterated automatic CSE: repeatedly apply the highest-ranked detected substitution
    // (detectSubstitutions → defineSubstitution) to a FIXPOINT, abbreviating every repeated
    // expression / structural regularity into a fresh symbol. Each application is its own
    // append-column (its own undo step). Dedup by the hit's expression so a persistent suggestion
    // (e.g. a shared gcd factor that survives) can't loop forever; capped at opts.maxIters
    // (default 12). Every detector regime is SYNCHRONOUS (modulus/power = monomial, gcd = its own
    // regime, conj-sum = general add-definition), so no worker is needed. Returns
    // { ok, applied:[{ newVar, kind, column }], count }.
    function autoAbbreviate(opts) {
      opts = opts || {};
      const maxIters = opts.maxIters || 12;
      const applied = [], seen = new Set();
      for (let i = 0; i < maxIters; i++) {
        const hits = detectSubstitutions();
        if (!hits.length) break;
        const hit = hits.find((h) => !seen.has(h.kind + ':' + JSON.stringify(h.exprTerms)));
        if (!hit) break;
        seen.add(hit.kind + ':' + JSON.stringify(hit.exprTerms));
        const r = defineSubstitution(hit.newVar, hit.expr, { regime: hit.regime });
        if (!r || !r.ok) break;
        applied.push({ newVar: hit.newVar, kind: hit.kind, column: r.column });
      }
      return { ok: applied.length > 0, applied, count: applied.length };
    }

    // B3 — add a FREE-FORM user equation/inequality to the current system. Adds the typed polynomial
    // as a node IN THE CURRENT COLUMN (in place, like generateConjugate — it augments the current
    // system rather than deriving a new column). For a non-self-conjugate equality in the conjugate
    // model the conjugate companion is added too (maybeAddConjugate) so reim/classify stay
    // conjugation-closed; opt out with opts.withConjugate === false. rel ∈ {'=','>','≠'}. Returns
    // { ok, node, column } or { ok:false, reason }.
    function addEquation(poly, rel, opts) {
      opts = opts || {};
      if (!poly || typeof poly.vars !== 'function') return { ok: false, reason: 'no polynomial to add' };
      if (poly.isZero()) return { ok: false, reason: 'the equation is 0 = 0 (trivial)' };
      rel = rel || '=';
      const col = maxColumn();
      for (const m of nodes.values()) if (m.column === col && (m.track || 't0') === activeTrackId && m.rel === rel && m.poly.equals(poly))
        return { ok: false, reason: 'an identical equation is already in the current system' };
      const relSuffix = rel === '=' ? ' = 0' : (rel === '>' ? ' > 0' : ' ≠ 0');
      checkpoint();
      const node = addNode({ id: nid(), kind: 'constraint', poly, rel,
        label: opts.label || ('custom: ' + _plainPoly(poly) + relSuffix), model,
        provenance: { op: 'add-equation', inputs: [], custom: true }, column: col, meta: {} });
      if (rel === '=' && model === 'conjugate' && opts.withConjugate !== false) maybeAddConjugate(node);
      normalizeColumn(col);
      return { ok: true, node, column: col };
    }

    // Detect VARIABLE SYMMETRIES forced by the equations themselves (pure query, no mutation).
    // Scans the current column (or the column of `ids`) for equality nodes that are, up to a
    // nonzero Gaussian scalar, a two-variable linear relation α·a + β·b = 0 with a,b each a lone
    // variable to exponent 1 (exact, no floats). Classified:
    //   • a,b a conjugate pair (b = conjVarName(a)): α+β=0 ⇒ a − ā = 0 ⇒ a REAL;
    //                                                 α−β=0 ⇒ a + ā = 0 ⇒ a IMAGINARY.
    //   • a,b two DISTINCT variables of the same barred-ness, unit ratio: a = ±b ⇒ an IDENTIFY
    //     relation (one-click, applied via identifyVariables).
    //   • a,b two distinct primal variables, NON-unit ratio (a = c·b): a LINEAR relation — FLAGGED
    //     only (eliminate via the linear-propagation reducer; not auto-applied).
    //   • a,b opposite barred-ness of DIFFERENT index (e.g. z₂ = ±z̄₁): a CONJUGATE-POLE-PAIR
    //     symmetry — FLAGGED only. Per-variable reality is NOT valid here (it's a pairing); the
    //     user pairs the conjugate variables by hand. Returns [{ nodeId, kind:'real'|'imaginary'|
    //     'identify'|'linear'|'conjugate-pair', label, varName? / keep?,drop?,sign? / vars? /
    //     var?,other?,sign? }]. Skips variables already folded (realVars / imagVars). De-duped.
    //     Restricting to these certain forms means we never claim a symmetry that isn't forced.
    function detectVariableRelations(ids) {
      const QC = getQC(), S = getSym();
      if (!QC || !QC.conjVarName) return [];
      const negOne = S.gaussInt(-1);
      const _a = assumeOf();
      const real = new Set(_a.realVars), imag = new Set(_a.imagVars);
      const src = (ids && ids.length) ? ids.map(get).filter(Boolean) : lastColumnNodes();
      const out = [], seen = new Set();
      for (const n of src) {
        if (n.rel !== '=' || n.poly.terms.size !== 2) continue;
        const byName = {}; let ok = true;
        for (const { mono, coeff } of n.poly.terms.values()) {
          if (mono.size !== 1) { ok = false; break; }
          const name = mono.keys().next().value;
          if (mono.get(name) !== 1) { ok = false; break; }
          byName[name] = coeff;
        }
        if (!ok) continue;
        const names = Object.keys(byName);
        if (names.length !== 2) continue;                       // (a self-term v·v would have size 1)
        const [a, b] = names, ca = byName[a], cb = byName[b];
        const sum0 = ca.add(cb).isZero(), diff0 = ca.sub(cb).isZero();
        const aB = _BARRED_RE.test(a), bB = _BARRED_RE.test(b);
        const pa = _primalName(a), pb = _primalName(b);
        if (QC.conjVarName(a) === b) {                          // same-index conjugate pair: reality / imaginary
          const v = pa;
          if (sum0) { if (real.has(v) || seen.has('r:' + v)) continue; seen.add('r:' + v); out.push({ nodeId: n.id, kind: 'real', varName: v, label: n.label }); }
          else if (diff0) { if (imag.has(v) || seen.has('i:' + v)) continue; seen.add('i:' + v); out.push({ nodeId: n.id, kind: 'imaginary', varName: v, label: n.label }); }
          // a non-unit conjugate-pair relation (αa+βā=0, |α|≠|β|) forces nothing certain from a
          // single equation (it needs its own conjugate) — skip.
        } else if (pa === pb) {
          continue;                                             // same primal, not a conj pair ⇒ a===b (already excluded)
        } else if (aB === bB) {                                 // two DISTINCT variables of the same barred-ness
          const keep = (pa < pb) ? pa : pb, drop = (pa < pb) ? pb : pa;
          if (sum0 || diff0) {                                  // unit relation a = ±b ⇒ one-click IDENTIFY (applicable)
            const sign = sum0 ? 1 : -1;
            const key = 'id:' + keep + '=' + drop; if (seen.has(key)) continue; seen.add(key);
            out.push({ nodeId: n.id, kind: 'identify', keep, drop, sign, label: n.label });
          } else {                                              // general non-unit linear relation drop = ratio·keep
            const key = 'lin:' + keep + ',' + drop; if (seen.has(key)) continue; seen.add(key);
            // drop = −(c_keep / c_drop)·keep (conjugated when the relation is in barred names)
            const cKeep = (pa === keep) ? ca : cb, cDrop = (pa === drop) ? ca : cb;
            let ratio = negOne.mul(cKeep).div(cDrop); if (aB) ratio = ratio.conj();
            out.push({ nodeId: n.id, kind: 'linear', vars: [keep, drop], ratio, label: n.label });
          }
        } else {                                                // opposite barred-ness, DIFFERENT index ⇒ conjugate-pole-pair
          const v = aB ? pb : pa, other = aB ? pa : pb;         // v = ratio·conj(other) (e.g. z₂ = ±z̄₁)
          const lo = (v < other) ? v : other, hi = (v < other) ? other : v;
          const key = 'cp:' + lo + ',' + hi; if (seen.has(key)) continue; seen.add(key);
          // v = −(c_w / c_u)·conj(other), where u is the unbarred name (coeff c_u) and w the barred (c_w)
          const cU = aB ? cb : ca, cW = aB ? ca : cb;
          const ratio = negOne.mul(cW).div(cU);
          out.push({ nodeId: n.id, kind: 'conjugate-pair', var: v, other, ratio, sign: sum0 ? 1 : (diff0 ? -1 : 0), label: n.label });
        }
      }
      return out;
    }

    // Fix φ(0) = w₀ to `value` ({re,im} floats): substitute the exact ℚ(i) value for
    // w₀/w̄₀ in the current system → a new column. Records w0Fixed (so later constraints
    // that rebuild φ with the w₀ symbol use the same center). No-op (ok:false) if the
    // current system already lacks w₀/w̄₀. Returns the append result.
    function fixW0(value) {
      const S = getSym();
      if (!lastColumnNodes().some((n) => { const v = n.poly.vars(); return v.has('w0') || v.has('wb0'); })) {
        return { ok: false, reason: 'φ(0)=w₀ is already absent from the current system', created: [] };
      }
      let g, record;
      try { ({ g, record } = _ratGauss(value)); } catch (e) { return { ok: false, reason: (e && e.message) || String(e), created: [] }; }
      const sub = { w0: S.mpolyConst(g), wb0: S.mpolyConst(g.conj()) };
      const label = 'fix φ(0) = ' + _valShort(record.approx);
      const res = _appendReduction((n) => {
        const v = n.poly.vars();
        return { poly: (v.has('w0') || v.has('wb0')) ? n.poly.subst(sub) : n.poly,
          provenance: { op: 'fix-w0', inputs: [n.id], value: record }, label };
      });
      if (res.ok) assumeOf().w0Fixed = record;
      return res;
    }

    // Variables eliminable from a pair: those appearing in BOTH nodes' polynomials.
    function sharedVars(idA, idB) {
      const a = get(idA), b = get(idB);
      if (!a || !b) return [];
      const va = a.poly.vars(), vb = b.poly.vars();
      const out = [];
      for (const v of va) if (vb.has(v)) out.push(v);
      return out.sort();
    }
    // Cost preview before committing an elimination (Sylvester dimension + sizes).
    function previewCost(idA, idB, varName) {
      const a = get(idA), b = get(idB);
      const degA = a.poly.degreeIn(varName), degB = b.poly.degreeIn(varName);
      return { degA, degB, matrix: Math.max(0, degA) + Math.max(0, degB), termsA: a.poly.size(), termsB: b.poly.size() };
    }

    // Core elimination (no checkpoint; mutates only on success). Returns
    // { ok:true, node } or { ok:false, reason }.
    // ── Q2 eliminate: cheap PLAN (validate the pair + compute the kept variables) + FINISH (create the
    // elimination nodes), so the sync path (_eliminate — checkpoint-free, reused by eliminateWithGauge's
    // single-undo batch) and the worker-offloaded eliminateAsync share IDENTICAL validation + node-building.
    function _eliminatePlan(idA, idB, varName) {
      const a = get(idA), b = get(idB);
      if (!a || !b) return { ok: false, reason: 'node not found' };
      if ((a.track || 't0') !== (b.track || 't0')) return { ok: false, reason: 'select nodes from one branch' };
      if (!a.poly.vars().has(varName) || !b.poly.vars().has(varName)) {
        return { ok: false, reason: 'variable ' + varName + ' is not shared by both equations' };
      }
      const keep = new Set();
      for (const v of a.poly.vars()) keep.add(v);
      for (const v of b.poly.vars()) keep.add(v);
      keep.delete(varName);
      return { ok: true, a, b, idA, idB, varName, keep: [...keep].sort() };
    }
    function _eliminateFinish(plan, gens, method) {
      const { a, b, idA, idB, varName } = plan;
      const col = Math.max(a.column, b.column) + 1;
      const created = [];
      gens.forEach((poly, i) => {
        const node = addNode({
          id: nid(), kind: 'derived', poly, rel: '=',
          label: 'elim ' + varName + (gens.length > 1 ? ' ' + (i + 1) + '/' + gens.length : '') + (method === 'ideal' ? ' (ideal)' : ' (resultant)'), model,
          provenance: { op: 'resultant', inputs: [idA, idB], variable: varName, method: method },
          column: col, track: a.track || 't0', meta: {},
        });
        edges.push({ from: idA, to: node.id }, { from: idB, to: node.id });
        created.push(node);
      });
      return { ok: true, node: created[0], created: created, method: method };
    }
    function _eliminate(idA, idB, varName) {
      const S = getSym();
      const plan = _eliminatePlan(idA, idB, varName);
      if (!plan.ok) return plan;
      // B-2: prefer the EXACT elimination ideal ⟨A, B⟩ ∩ k[rest] (Gröbner) — the raw Sylvester resultant
      // can carry extraneous leading-coefficient factors (Res_x(yx+1, yx²−x)=2y, but ⟨A,B⟩∩k[y]=⟨1⟩, so
      // y=0 is spurious). Fall back to the resultant (`method:'resultant'`) only if the ideal path throws.
      let gens = null, method = 'ideal';
      try {
        if (typeof S.eliminationIdeal === 'function') gens = (S.eliminationIdeal([plan.a.poly, plan.b.poly], [varName], plan.keep) || []).filter((p) => !p.isZero());
      } catch (e) { gens = null; }
      if (gens === null) {                              // fallback: the Sylvester resultant (may carry extraneous factors)
        let res;
        try { res = S.resultant(plan.a.poly, plan.b.poly, varName); }
        catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
        if (res.isZero()) return { ok: false, reason: 'resultant ≡ 0 (the equations share a component); pick a different pair or variable' };
        gens = [res]; method = 'resultant';
      }
      if (!gens.length) return { ok: false, reason: 'the elimination ideal in the remaining variables is trivial (no relation free of ' + varName + ')' };
      return _eliminateFinish(plan, gens, method);
    }
    // Off-main-thread pairwise elimination (Q2) — falls back to sync when no worker. Byte-identical: SAME
    // plan + finish, only the elimination-ideal / resultant compute runs in the worker. Checkpoints on
    // SUCCESS only (a failed/empty elimination leaves no redundant undo step), matching eliminate().
    function eliminateAsync(idA, idB, varName, runOpts) {
      const S = getSym();
      const plan = _eliminatePlan(idA, idB, varName);
      if (!plan.ok) return Promise.resolve(plan);
      const SW = symWorker();
      if (!SW) return Promise.resolve(eliminate(idA, idB, varName));
      const payload = { polys: [plan.a.poly.termList(), plan.b.poly.termList()], elimVars: [varName], keepVars: plan.keep, opts: {} };
      return SW.run('eliminate', payload, runOpts || {}).then(
        (r) => {
          if (!r.ok) return { ok: false, reason: r.reason };
          if (r.resultantZero) return { ok: false, reason: 'resultant ≡ 0 (the equations share a component); pick a different pair or variable' };
          const gens = (r.generators || []).map((tl) => S.polyFromTermList(tl));
          if (!gens.length) return { ok: false, reason: 'the elimination ideal in the remaining variables is trivial (no relation free of ' + varName + ')' };
          checkpoint();
          return _eliminateFinish(plan, gens, r.method || 'ideal');
        },
        (err) => (err && err.aborted) ? { ok: false, aborted: true, reason: 'cancelled' }
          : { ok: false, reason: (err && err.message) || String(err) });
    }
    // Eliminate `varName` from nodes A,B via the Sylvester resultant → derived node.
    function eliminate(idA, idB, varName) {
      checkpoint();
      const r = _eliminate(idA, idB, varName);
      if (!r.ok) undoStack.pop();            // nothing mutated → drop the redundant snapshot
      return r;
    }

    // Batch: eliminate using the GAUGE equation against each other equality node
    // (one shared variable each), in a single undo step. Because the gauge is
    // linear in the A_{j,1} (Σ Im A_{j,1}=0), this effectively APPLIES the gauge
    // normalization to every equation. Skips the gauge itself, inequalities, and
    // (by default) previously-derived nodes; nodes with no shared variable or a
    // ≡0 resultant are reported in `skipped`. Returns { ok, created[], skipped[] }.
    function eliminateWithGauge(opts) {
      opts = opts || {};
      // Operate on the CURRENT system (the last column), so gauge elimination applies
      // to the reduced system rather than mixing in earlier columns.
      const cur = lastColumnNodes();
      const gauge = cur.find((n) => n.meta && n.meta.block === 'gauge');
      if (!gauge) return { ok: false, reason: 'no gauge equation in the current system', created: [], skipped: [] };
      checkpoint();
      const created = [], skipped = [];
      // Every other equality in the current column is a target (the column IS the
      // current system; there is no stale-derived mixing to guard against anymore).
      const targets = cur.filter((n) => n.id !== gauge.id && n.rel === '=');
      for (const n of targets) {
        const shared = sharedVars(gauge.id, n.id);
        if (!shared.length) { skipped.push({ id: n.id, reason: 'no shared variable with the gauge' }); continue; }
        const r = _eliminate(gauge.id, n.id, shared[0]);
        if (r.ok) created.push(r.node); else skipped.push({ id: n.id, reason: r.reason });
      }
      if (!created.length) undoStack.pop();   // nothing created → drop the snapshot
      return { ok: created.length > 0, created, skipped };
    }

    // Gröbner basis of the selected EQUALITY nodes (the multivariate generalization
    // of pairwise resultant elimination). Computes a reduced Gröbner basis of the
    // ideal they generate under a monomial order, and adds ONE derived node per
    // basis generator in a new column (single undo step), with edges from every
    // input. Options:
    //   opts.order      'grevlex' (default) | 'grlex' | 'lex'
    //   opts.eliminate  [varNames] to eliminate — forces a lex order with those
    //                   variables ranked highest (so the basis exposes the
    //                   elimination ideal in the remaining variables). Generators
    //                   that still contain an eliminated variable are dropped unless
    //                   opts.keepEliminated is set.
    //   opts.maxBasis / maxSteps / maxDegree / maxTerms — Buchberger cost caps.
    // Inequality/≠ nodes are skipped (they are semi-algebraic — the CAS/RCTD path).
    // Returns { ok, created[], reason?, skipped[] }. A blow-up past the caps comes
    // back as { ok:false, reason } (the algorithm threw "use CAS export").
    // Plan a Gröbner run from a selection: validate, pick the monomial order, and
    // emit both the live order object (for the sync/main-thread path) and a
    // serializable order SPEC (for the Web-Worker path). Returns { ok:false, reason,
    // skipped } or { ok:true, eqNodes, inputIds, polys, order, orderSpec, kind, elim }.
    function _groebnerPlan(ids, opts) {
      const S = getSym();
      opts = opts || {};
      const sel = (ids || []).map((id) => get(id)).filter(Boolean);
      const eqNodes = sel.filter((n) => n.rel === '=');
      const skipped = sel.filter((n) => n.rel !== '=').map((n) => ({ id: n.id, reason: 'not an equality (' + n.rel + ')' }));
      if (eqNodes.length < 2) {
        return { ok: false, reason: 'select at least two equality nodes for a Gröbner basis', skipped };
      }
      // An explicit eliminate list ⇒ a block ELIMINATION order (elim vars in the top
      // block) — far cheaper than pure lex while exposing the same elimination ideal.
      // opts.order overrides (e.g. force 'lex'); else grevlex when nothing is eliminated.
      const elim = (opts.eliminate || []).slice();
      const kind = opts.order || (elim.length ? 'elim' : 'grevlex');
      const restOf = () => { const r = new Set(); for (const n of eqNodes) for (const v of n.poly.vars()) if (!elim.includes(v)) r.add(v); return [...r].sort(); };
      let order, orderSpec;
      if (kind === 'elim') {
        const rest = restOf();
        order = S.eliminationOrder(elim, rest);
        orderSpec = { kind: 'block', blocks: [elim.slice(), rest] };
      } else {
        let varOrder = opts.varOrder || (elim.length ? [...elim, ...restOf()] : null);
        order = S.monomialOrder(kind, varOrder);
        orderSpec = { kind, varOrder };
      }
      return { ok: true, eqNodes, inputIds: eqNodes.map((n) => n.id), polys: eqNodes.map((n) => n.poly), order, orderSpec, kind, elim, skipped };
    }
    // Insert a computed Gröbner basis (generator MPolys) as derived nodes — the
    // shared tail of the sync and async paths. Single undo step.
    function _groebnerFinish(plan, basis, opts) {
      opts = opts || {};
      const { elim, kind, inputIds, eqNodes, skipped } = plan;
      let gens = basis;
      if (elim.length && !opts.keepEliminated) gens = gens.filter((g) => { const vs = g.vars(); return !elim.some((v) => vs.has(v)); });
      gens = gens.filter((g) => !g.isZero());
      if (!gens.length) {
        return { ok: false, created: [], skipped, reason: elim.length
          ? 'the elimination ideal in the remaining variables is trivial (no generator free of ' + elim.join(', ') + ')'
          : 'empty Gröbner basis' };
      }
      checkpoint();
      const col = Math.max.apply(null, eqNodes.map((n) => n.column)) + 1;
      const tag = elim.length ? 'elim ' + elim.join(',') : kind;
      const created = [];
      gens.forEach((poly, i) => {
        const node = addNode({
          id: nid(), kind: 'derived', poly, rel: '=',
          label: 'Gröbner ' + (i + 1) + '/' + gens.length + ' (' + tag + ')', model,
          provenance: { op: 'groebner', inputs: inputIds.slice(), order: kind, eliminate: elim.slice() },
          column: col, meta: { order: kind, eliminate: elim.slice() },
        });
        for (const src of inputIds) edges.push({ from: src, to: node.id });
        created.push(node);
      });
      return { ok: true, created, skipped };
    }
    // Synchronous Gröbner (main thread). See groebnerAsync for the offloaded path.
    function groebner(ids, opts) {
      const S = getSym();
      const plan = _groebnerPlan(ids, opts);
      if (!plan.ok) return { ok: false, reason: plan.reason, created: [], skipped: plan.skipped || [] };
      let basis;
      try { basis = S.buchberger(plan.polys, plan.order, opts || {}); }
      catch (e) { return { ok: false, reason: (e && e.message) || String(e), created: [], skipped: plan.skipped }; }
      return _groebnerFinish(plan, basis, opts || {});
    }
    // Off-main-thread Gröbner via QD.SymWorker (Promise). runOpts: { onProgress, signal }.
    // Falls back to the synchronous path when the worker is unavailable.
    function groebnerAsync(ids, opts, runOpts) {
      const S = getSym();
      opts = opts || {};
      const plan = _groebnerPlan(ids, opts);
      if (!plan.ok) return Promise.resolve({ ok: false, reason: plan.reason, created: [], skipped: plan.skipped || [] });
      const SW = symWorker();
      if (!SW) { return Promise.resolve(groebner(ids, opts)); }
      const payload = { polys: plan.polys.map((p) => p.termList()), orderSpec: plan.orderSpec, opts: _capOpts(opts) };
      return SW.run('groebner', payload, runOpts || {}).then(
        (res) => _groebnerFinish(plan, (res.generators || []).map((tl) => S.polyFromTermList(tl)), opts),
        (err) => (err && err.aborted) ? { ok: false, aborted: true, reason: 'cancelled', created: [], skipped: plan.skipped }
          : { ok: false, reason: (err && err.message) || String(err), created: [], skipped: plan.skipped });
    }

    // Saturate the current column by the Möbius denominators ∏_j (1 − z_j·z̄_j), removing the {|z_j|=1}
    // boundary stratum the cleared (●)/(★) denominators carry (finding B-1). On the reim slice z̄_j = z_j, so
    // 1 − z_j z̄_j = 1 − |z_j|², and V(cleared) = V(QD) ∪ {|z_j|=1}; saturating drops that component, so the
    // Hermite count of the appended column is the EXACT algebraic count (unit disk h=1/w: realCount 4 → 2, the
    // two dropped being z_j = ±1, poles on |z|=1). SAFE — a genuine bounded QD has |z_j| < 1 ⇒ 1 − z_j z̄_j ≠ 0,
    // so the saturated locus is disjoint from the QD set (UNLIKE saturating by z_j, which would delete the
    // z_j=0 disk — see spuriousFactors' note). Appends ONE labeled 'saturate' column (append-only DAG; column 0
    // stays pristine). Pure/DOM-free; sync (these systems are small). Returns { ok, created, poles } / reason.
    // What a basis replacement discards: every node of the current column that is not among the
    // generators' inputs. Two distinct causes, kept distinct because they read very differently to
    // a user — an inequality was never eligible, whereas an unselected equality was dropped by the
    // scope THEY chose. Richer than groebner's { id, reason } shape — these carry label, rel and
    // cause — so the UI can name what went and say why. groebner's own reporting is unchanged and
    // still count-only; wiring droppedNote to it would need its entries to carry a label first.
    function _droppedByBasisReplacement(column, keptIds) {
      return column.filter((n) => !keptIds.has(n.id)).map((n) => ({
        id: n.id, label: n.label, rel: n.rel,
        cause: n.rel === '=' ? 'out-of-scope' : 'inequality',
        reason: n.rel === '=' ? 'an equality outside the selection' : 'not an equality (' + n.rel + ')',
      }));
    }
    // ── Q2 saturate: split into a cheap PLAN (build the Möbius product f + the dropped-node accounting)
    // and a FINISH (checkpoint + create the saturated nodes) so the sync path and the worker-offloaded
    // saturateAsync share IDENTICAL setup + node-building — only the heavy S.saturate call differs. ──
    function _saturatePlan(ids) {
      const S = getSym();
      const pool = ((ids && ids.length) ? ids.map(get) : lastColumnNodes()).filter(Boolean);
      const inputs = pool.filter((n) => n.rel === '=');
      // The loss is measured against the WHOLE CURRENT COLUMN, not `pool`: a canvas selection would
      // otherwise under-report the dropped UNSELECTED equalities (usually the larger part).
      const column = lastColumnNodes().filter(Boolean);
      const skipped = _droppedByBasisReplacement(column, new Set(inputs.map((n) => n.id)));
      if (!inputs.length) return { ok: false, reason: 'no equality nodes to saturate', skipped };
      const polys = inputs.map((n) => n.poly), inputIds = inputs.map((n) => n.id);
      const vars = new Set();
      for (const p of polys) for (const v of p.vars()) vars.add(v);
      // ∏ over ALL ordered pole pairs (a, b): (1 − z̄_a·z_b) — the FULL cleared Möbius denominators (self
      // a=b drops {|z_j|=1}; cross a≠b drops {z̄_a z_b=1}), all disjoint from the genuine |z_j|<1 set, so no
      // genuine QD is removed. Only poles whose BOTH z_j and z̄_j (zb_j) survive contribute.
      const one = S.mpolyConst(S.gaussInt(1));
      const poleIdx = [];
      for (const v of [...vars].sort()) { const m = /^z(\d+)$/.exec(v); if (m && vars.has('zb' + m[1])) poleIdx.push(m[1]); }
      let f = null; const poles = poleIdx.slice();
      for (const a of poleIdx) for (const b of poleIdx) { const fac = one.sub(S.mpolyVar('zb' + a).mul(S.mpolyVar('z' + b))); f = f ? f.mul(fac) : fac; }
      if (!f) return { ok: false, reason: 'no Möbius denominator (z_j, z̄_j) present to saturate — the map variables may be pinned/eliminated', skipped };
      return { ok: true, inputs, inputIds, polys, f, poles, skipped };
    }
    function _saturateFinish(plan, gens) {
      gens = (gens || []).filter((g) => !g.isZero());
      if (!gens.length) return { ok: false, reason: 'saturation removed every generator (the system lies entirely on |z_j|=1)', created: [], skipped: plan.skipped };
      checkpoint();
      const col = Math.max.apply(null, plan.inputs.map((n) => n.column)) + 1;
      const created = [], inputIds = plan.inputIds, poles = plan.poles, skipped = plan.skipped;
      gens.forEach((poly, i) => {
        const node = addNode({
          id: nid(), kind: 'derived', poly, rel: '=',
          label: 'saturate ' + (i + 1) + '/' + gens.length + ' (∏(1−z̄z))', model,
          provenance: { op: 'saturate', inputs: inputIds.slice(), factor: '(1−z̄z)', poles: poles.slice(),
            droppedNonEq: skipped.filter((k) => k.cause === 'inequality').length,
            droppedOutOfScope: skipped.filter((k) => k.cause === 'out-of-scope').length },
          column: col, meta: {},
        });
        for (const src of inputIds) edges.push({ from: src, to: node.id });
        created.push(node);
      });
      return { ok: true, created, poles: poles.slice(), skipped };
    }
    function saturateMobius(ids, opts) {
      const S = getSym();
      const plan = _saturatePlan(ids);
      if (!plan.ok) return { ok: false, reason: plan.reason, created: [], skipped: plan.skipped || [] };
      let gens;
      try { gens = S.saturate(plan.polys, plan.f, '_wsat', opts || {}); }
      catch (e) { return { ok: false, reason: (e && e.message) || String(e), created: [], skipped: plan.skipped }; }
      return _saturateFinish(plan, gens);
    }
    // Off-main-thread saturate via QD.SymWorker (Q2) — falls back to the sync path when the worker is
    // unavailable. Byte-identical to saturateMobius: SAME plan + finish, only S.saturate runs in the worker.
    function saturateAsync(ids, opts, runOpts) {
      const S = getSym();
      const plan = _saturatePlan(ids);
      if (!plan.ok) return Promise.resolve({ ok: false, reason: plan.reason, created: [], skipped: plan.skipped || [] });
      const SW = symWorker();
      if (!SW) return Promise.resolve(saturateMobius(ids, opts));
      const payload = { polys: plan.polys.map((p) => p.termList()), satPoly: plan.f.termList(), satVar: '_wsat', opts: _capOpts(opts || {}) };
      return SW.run('saturate', payload, runOpts || {}).then(
        (res) => _saturateFinish(plan, (res.generators || []).map((tl) => S.polyFromTermList(tl))),
        (err) => (err && err.aborted) ? { ok: false, aborted: true, reason: 'cancelled', created: [], skipped: plan.skipped }
          : { ok: false, reason: (err && err.message) || String(err), created: [], skipped: plan.skipped });
    }

    // QD.SymWorker handle (off-main-thread runner), or null if unavailable.
    function symWorker() {
      const Q = (typeof window !== 'undefined' && window.QD) || (typeof global !== 'undefined' && global.QD) || (typeof QD !== 'undefined' && QD);
      return (Q && Q.SymWorker) || null;
    }
    // (structured-clone-safe cap forwarding lives in module-level _capOpts / _CAP_KEYS,
    // just above create() beside the PROV_STORE registry — hoisted there so the unit
    // test can reach them via QD.AlgebraStore.capOpts / .CAP_KEYS.)

    // The numeric root finder for solve() — the app's Durand–Kerner (faber-analysis).
    function defaultRootFinder() {
      const Q = (typeof window !== 'undefined' && window.QD) || (typeof global !== 'undefined' && global.QD) || (typeof QD !== 'undefined' && QD);
      const FA = Q && Q.FaberAnalysis;
      return (FA && FA.polynomialRoots) ? ((coeffsAsc) => FA.polynomialRoots(coeffsAsc)) : null;
    }
    // Equality polys for an op. An explicit id list is honored; otherwise the default
    // is the CURRENT SYSTEM (the last column's equalities), not every column — so
    // dimension/solve analyze the reduced system, not a mix of original + reductions.
    function _eqPolys(ids) {
      const sel = (ids && ids.length ? ids.map((id) => get(id)) : lastColumnNodes()).filter(Boolean);
      return sel.filter((n) => n.rel === '=').map((n) => n.poly);
    }
    function _varsOf(polys) {
      const s = new Set(); for (const p of polys) for (const v of polyVars(p)) s.add(v); return [...s].sort();
    }

    // Geometry of the selected (or all) equality nodes: whether the variety is
    // finite (zero-dimensional) and, if so, the solution count with multiplicity
    // (= the quotient-ring dimension). Computes a grevlex Gröbner basis under the
    // hood. Returns { ok, zeroDim, dimension, numVars, vars } or { ok:false, reason }.
    function dimension(ids, opts) {
      const S = getSym();
      const polys = _eqPolys(ids);
      if (polys.length < 1) return { ok: false, reason: 'no equality nodes to analyze' };
      const vars = _varsOf(polys);
      const ord = S.monomialOrder('grevlex', vars);
      try {
        const G = S.buchberger(polys, ord, opts || {});
        const zeroDim = S.isZeroDimensional(G, ord, vars);
        const dim = zeroDim ? S.quotientDimension(G, ord, vars) : Infinity;
        const krullDim = zeroDim ? 0 : S.krullDimension(G, ord, vars);
        return { ok: true, zeroDim, dimension: dim, krullDim, numVars: vars.length, vars };
      } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    }
    // Off-main-thread dimension via QD.SymWorker (Promise). Falls back to sync.
    function dimensionAsync(ids, opts, runOpts) {
      const polys = _eqPolys(ids);
      if (polys.length < 1) return Promise.resolve({ ok: false, reason: 'no equality nodes to analyze' });
      const SW = symWorker();
      if (!SW) return Promise.resolve(dimension(ids, opts));
      const vars = _varsOf(polys);
      const payload = { polys: polys.map((p) => p.termList()), vars, opts: _capOpts(opts || {}) };
      return SW.run('dimension', payload, runOpts || {}).then(
        (res) => ({ ok: true, zeroDim: res.zeroDim, dimension: res.zeroDim ? res.dimension : Infinity, krullDim: res.krullDim, numVars: res.numVars, vars }),
        (err) => (err && err.aborted) ? { ok: false, aborted: true, reason: 'cancelled' }
          : { ok: false, reason: (err && err.message) || String(err) });
    }

    // Substitute a { varName: {re,im} } value map into a poly list, rationalizing each
    // value exactly (continued fractions). Used to PIN the known quadrature-data
    // parameters (a_j, C_{j,s}) before an existence/uniqueness verdict — they are GIVEN,
    // not unknowns, so the verdict should count only the genuine unknowns (z_j, A, w₀).
    function _applyParamValues(polys, paramValues) {
      if (!paramValues) return polys;
      const S = getSym();
      const sub = {};
      for (const name of Object.keys(paramValues)) {
        try { sub[name] = S.mpolyConst(_ratGauss(paramValues[name]).g); } catch (e) { /* skip a bad value */ }
      }
      if (!Object.keys(sub).length) return polys;
      return polys.map((p) => p.subst(sub)).filter((p) => !p.isZero());
    }

    // Core reim transform on a given poly list (see currentReimSystem). realVars are
    // held real (v = x, no y); imagVars are held purely imaginary (v = i·y, Re v ≡ 0, no x)
    // so an "assume imaginary" verdict does not carry a spurious real degree of freedom.
    function _reimTransform(polys, realVars, imagVars) {
      const S = getSym();
      const realSet = new Set(realVars || assumeOf().realVars);
      const imagSet = new Set(imagVars || assumeOf().imagVars);
      const I = S.mpolyConst(S.gaussInt(0, 1));
      const allVars = new Set();
      for (const p of polys) for (const v of p.vars()) allVars.add(v);
      const sub = {};
      for (const v of allVars) {
        const prim = _primalName(v);
        const xn = prim + '__re', yn = prim + '__im';
        if (realSet.has(prim)) { sub[v] = S.mpolyVar(xn); }                 // assumed real ⇒ x only
        else if (imagSet.has(prim)) { const iy = I.mul(S.mpolyVar(yn)); sub[v] = (prim !== v) ? iy.neg() : iy; }  // assumed imaginary ⇒ ±i·y (Re ≡ 0)
        else { const x = S.mpolyVar(xn), y = S.mpolyVar(yn); sub[v] = (prim !== v) ? x.sub(I.mul(y)) : x.add(I.mul(y)); }
      }
      const out = [];
      for (const p of polys) {
        const e = p.subst(sub);
        const re = e.realPart(), im = e.imagPart();
        if (!re.isZero()) out.push(re);
        if (!im.isZero()) out.push(im);
      }
      const rv = new Set(); for (const p of out) for (const v of p.vars()) rv.add(v);
      return { polys: out, vars: [...rv].sort() };
    }

    // The REAL (reim) system of the current column. opts.paramValues ({ varName:{re,im} })
    // pins the known quadrature-data parameters (a_j, C_{j,s}) to their values FIRST, so
    // only the genuine unknowns (z_j, A_{j,k}, w₀) remain. The real solutions of the
    // result are the actual quadrature domains. Returns { polys, vars }.
    function currentReimSystem(ids, opts) {
      opts = opts || {};
      const inputs = ((ids && ids.length) ? ids.map(get) : lastColumnNodes()).filter(Boolean).filter((n) => n.rel === '=');
      // Use the ANALYZED branch's reality assumptions (resolved from the ids), not the active
      // branch's — so classifying an off-screen branch (A6) reads its own assumptions (C3).
      const track = (ids && ids.length) ? trackOf(ids[0]) : activeTrackId;
      const polys = _applyParamValues(inputs.map((n) => n.poly), opts.paramValues);
      return _reimTransform(polys, assumeOf(track).realVars, assumeOf(track).imagVars);
    }

    // Existence / uniqueness verdict for the current system, computed on the REAL (reim)
    // system: inconsistency (1 ∈ I ⇒ no QD), zero/positive dimension, the number of REAL
    // solutions (= actual QDs, via the Hermite trace form) and the number of distinct
    // complex solutions / the multiplicity. opts.paramValues pins the known data. Returns
    // { ok, inconsistent, zeroDim, realCount, complexCount, multiplicity, numVars, reason }.
    // If the analyzed column is one CASE of a factor split (applyFactor), its counts are
    // for that branch only — V(original) = ⋃ₖ V(caseₖ), so branch counts ADD. Detect it so
    // the verdict can say so. Returns { partialBranch, caseIndex, caseCount } or {}.
    // 'component' (a minimalPrimes / regular-chain split, V(I)=⋃ₖV(componentₖ)) carries exactly the
    // same caveat as 'factor' (V(p)=⋃ₖV(fₖ)) — one branch of a union — so it must report partial the
    // same way, or a component's count would read as the whole system's. `branchIncomplete` is the
    // extra hazard a factor split does not have: when the decomposition itself hit a cost cap, the
    // components may not even cover V(I), so the branches can add to LESS than the total.
    function _factorBranchInfo(ids) {
      const ns = (ids && ids.length) ? ids.map(get).filter(Boolean) : lastColumnNodes();
      const f = ns.find((n) => n.provenance && (n.provenance.op === 'factor' || n.provenance.op === 'component') && !n.provenance.carried);
      if (!f) return {};
      const out = { partialBranch: true, caseIndex: f.provenance.caseIndex, caseCount: f.provenance.caseCount, branchOp: f.provenance.op };
      if (f.provenance.op === 'component' && f.provenance.complete === false) out.branchIncomplete = true;
      return out;
    }
    // The SPECIALIZATION under which a column is analyzed: assumeReal (z̄≡z) and assumeImaginary
    // (z̄≡−z) restrict the system to a SLICE — they can drop quadrature domains lying OFF that
    // slice, so the resulting existence/uniqueness count is only a LOWER BOUND on the general one
    // (and an empty/inconsistent verdict rules out only on-slice solutions). Resolve the vars from
    // the analyzed ids — that branch's assumptions, matching currentReimSystem's trackOf(ids[0]) —
    // so an off-screen branch (A6) reports its OWN slice, not the active branch's. Merged onto the
    // classify result (like _factorBranchInfo) so every verdict site can label the specialization.
    // Returns { realVars, imagVars } (both [] ⇒ the general, unspecialized system).
    function _assumptionInfo(ids) {
      const track = (ids && ids.length) ? trackOf(ids[0]) : activeTrackId;
      const a = assumeOf(track);
      return { realVars: a.realVars.slice(), imagVars: a.imagVars.slice() };
    }
    function classify(ids, opts) {
      return Object.assign(_classifyImpl(ids, opts), _factorBranchInfo(ids), _assumptionInfo(ids));
    }
    function _classifyImpl(ids, opts) {
      const S = getSym();
      const reim = currentReimSystem(ids, opts);
      if (!reim.polys.length) return { ok: false, reason: 'no equality nodes to analyze' };
      try {
        const co = _capOpts(opts);   // F2: thread the same caps the worker runJob('classify') honours, so the sync fallback == the worker path
        const ord = S.monomialOrder('grevlex', reim.vars);
        const G = S.buchberger(reim.polys, ord, co);
        if (G.length === 1 && G[0].vars().size === 0 && !G[0].isZero()) {
          return { ok: true, inconsistent: true, zeroDim: true, realCount: 0, complexCount: 0, multiplicity: 0, numVars: reim.vars.length };
        }
        const zeroDim = S.isZeroDimensional(G, ord, reim.vars);
        if (!zeroDim) return { ok: true, inconsistent: false, zeroDim: false, realCount: null, complexCount: null, multiplicity: null, numVars: reim.vars.length, krullDim: S.krullDimension(G, ord, reim.vars) };
        const multiplicity = S.quotientDimension(G, ord, reim.vars);
        const rc = S.realSolutionCount({ G, order: ord }, null, reim.vars, co);
        if (!rc.ok) return { ok: true, inconsistent: false, zeroDim: true, realCount: null, complexCount: null, multiplicity, reason: rc.reason, numVars: reim.vars.length };
        return { ok: true, inconsistent: false, zeroDim: true, realCount: rc.realCount, complexCount: rc.complexCount, multiplicity, numVars: reim.vars.length };
      } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    }
    // Off-main-thread classify via QD.SymWorker (Promise). runOpts: { onProgress, signal }.
    // The reim transform + paramValue pinning is cheap and stays on the main thread; the
    // heavy reim Gröbner + Hermite real-count run in the worker (runJob 'classify'). Falls
    // back to the synchronous classify() when the worker is unavailable. The factor-branch
    // annotation (cheap, main-thread) is folded onto the result either way.
    function classifyAsync(ids, opts, runOpts) {
      opts = opts || {};
      const branch = _factorBranchInfo(ids);
      const assume = _assumptionInfo(ids);
      const reim = currentReimSystem(ids, opts);
      if (!reim.polys.length) return Promise.resolve(Object.assign({ ok: false, reason: 'no equality nodes to analyze' }, branch, assume));
      const SW = symWorker();
      if (!SW) return Promise.resolve(classify(ids, opts));
      const payload = { polys: reim.polys.map((p) => p.termList()), vars: reim.vars, opts: _capOpts(opts) };
      return SW.run('classify', payload, runOpts || {}).then(
        (res) => Object.assign(res, branch, assume),
        (err) => Object.assign((err && err.aborted) ? { ok: false, aborted: true, reason: 'cancelled' }
          : { ok: false, reason: (err && err.message) || String(err) }, branch, assume));
    }

    // Numeric values of variables an earlier reduction PINNED or ELIMINATED to a CONSTANT
    // (substituteValue, a constant linear-propagation step, or fix-w0), keyed varName → {re,im}.
    // After a reduction removes a map variable from the system it is no longer a solved unknown,
    // but its value is recorded in the provenance — so φ can still be reconstructed (C). Walks
    // every node (a constant pin is permanent; the variable can't reappear).
    function knownValues(track) {
      track = track || activeTrackId;
      const out = {};
      for (const n of nodes.values()) {
        if ((n.track || 't0') !== track) continue;   // C3: only THIS branch's pinned constants
        const pv = n.provenance; if (!pv) continue;
        if (pv.op === 'substitute' && Array.isArray(pv.variables)) {
          for (const rec of pv.variables) {
            const ap = rec && rec.value && rec.value.approx;
            if (rec && rec.name && ap) out[rec.name] = { re: ap.re || 0, im: ap.im || 0 };
          }
        } else if (pv.op === 'linear-reduce' && Array.isArray(pv.values)) {
          for (const rec of pv.values) if (rec && rec.name && rec.value) out[rec.name] = { re: rec.value.re || 0, im: rec.value.im || 0 };
        }
      }
      const w0Fixed = assumeOf(track).w0Fixed;
      if (w0Fixed) { const rat = (p) => (p ? Number(p[0]) / Number(p[1]) : 0); out.w0 = w0Fixed.approx ? { re: w0Fixed.approx.re || 0, im: w0Fixed.approx.im || 0 } : { re: rat(w0Fixed.re), im: rat(w0Fixed.im) }; }
      return out;
    }

    // The univariate RESOLVENT χ_v of the current column in a chosen REAL variable v — the
    // characteristic polynomial of multiplication-by-v on the quotient ring (Sym.resolvent over
    // the reim system). Its roots are v's values across the solutions; a REPEATED root
    // (degenerate) ⇔ coincident solutions / a degeneracy (e.g. a cusp). `varName` may be a reim
    // name (A1_1__re) or a base name (A1_1 → its real part A1_1__re). opts.paramValues pins the
    // known data (like classify). Returns { ok, variable, latex, squareFreeLatex, degree,
    // distinct, multiplicity, degenerate, discLatex, reason }.
    // ── Q2 resolvent: cheap PLAN (reim system + resolve the variable) + FINISH (the LaTeX + scalar readout),
    // shared by the sync path and the worker-offloaded resolventAsync. ──
    function _resolventPlan(ids, varName, opts) {
      const reim = currentReimSystem(ids, opts);
      if (!reim.polys.length) return { ok: false, reason: 'no equality nodes to analyze' };
      let v = varName;
      if (reim.vars.indexOf(v) === -1) {                       // resolve a base name → its real part
        if (reim.vars.indexOf(v + '__re') !== -1) v = v + '__re';
        else return { ok: false, reason: 'variable "' + varName + '" is not a real variable of the current system' };
      }
      return { ok: true, reim, v };
    }
    function _resolventFinish(v, r) {
      if (!r.ok) return { ok: false, reason: r.reason };
      return {
        ok: true, variable: v,
        latex: r.poly.toLatex(), squareFreeLatex: r.squareFree.toLatex(),
        degree: r.degree, distinct: r.distinctDegree, multiplicity: r.dimension,
        degenerate: r.degenerate, discLatex: r.discriminant ? r.discriminant.toLatex() : null,
      };
    }
    function resolventOf(ids, varName, opts) {
      const S = getSym();
      const plan = _resolventPlan(ids, varName, opts);
      if (!plan.ok) return { ok: false, reason: plan.reason };
      let r; try { r = S.resolvent(plan.reim.polys, plan.v, plan.reim.vars, {}); }
      catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
      return _resolventFinish(plan.v, r);
    }
    // Off-main-thread resolvent (Q2). This op's Cancel used to be cosmetic — a setTimeout still ran
    // S.resolvent synchronously on the main thread and ignored the abort signal. Now it runs in the worker;
    // SAME plan + finish, byte-identical (the worker returns poly / square-free / disc as term-lists, and the
    // main thread renders their LaTeX — cheap).
    function resolventAsync(ids, varName, opts, runOpts) {
      const S = getSym();
      const plan = _resolventPlan(ids, varName, opts);
      if (!plan.ok) return Promise.resolve({ ok: false, reason: plan.reason });
      const SW = symWorker();
      if (!SW) return Promise.resolve(resolventOf(ids, varName, opts));
      const payload = { polys: plan.reim.polys.map((p) => p.termList()), resVar: plan.v, vars: plan.reim.vars, opts: {} };
      return SW.run('resolvent', payload, runOpts || {}).then(
        (rr) => {
          if (!rr.ok) return { ok: false, reason: rr.reason };
          const r = { ok: true, poly: S.polyFromTermList(rr.poly), squareFree: S.polyFromTermList(rr.squareFree),
            discriminant: rr.discriminant ? S.polyFromTermList(rr.discriminant) : null,
            degree: rr.degree, distinctDegree: rr.distinctDegree, dimension: rr.dimension, degenerate: rr.degenerate };
          return _resolventFinish(plan.v, r);
        },
        (err) => (err && err.aborted) ? { ok: false, aborted: true, reason: 'cancelled' }
          : { ok: false, reason: (err && err.message) || String(err) });
    }
    // The real (reim) variable names of the current column — for the resolvent variable picker.
    function reimVariables(ids, opts) { return currentReimSystem(ids, opts || {}).vars; }

    // Solve a SINGLE equation node for one variable IN RADICALS (closed form), with
    // the remaining variables kept as symbolic coefficients (QD.SymRadical). Degree
    // ≤4 closed forms + the x^g quasi-polynomial reduction + factorization; honest
    // Abel–Ruffini refusal otherwise. Roots are RADICAL expressions (not MPolys), so
    // this is a display-only query (no graph mutation) — the UI renders them. The
    // numeric oracle (verifyRoots) substitutes random sample values for the remaining
    // variables and checks the equation residual ≈0. Returns { ok, variable, roots
    // (Radical AST nodes), count, method, verify:{checked,samples,maxResidual}, reason }.
    function solveForVariable(id, varName, opts) {
      opts = opts || {};
      const SR = getSR();
      if (!SR || typeof SR.solveByRadicals !== 'function') return { ok: false, reason: 'QD.SymRadical not loaded' };
      const node = nodes.get(id);
      if (!node) return { ok: false, reason: 'node not found' };
      if (node.rel && node.rel !== '=') return { ok: false, reason: 'only equalities (p = 0) can be solved for a variable' };
      if (!node.poly.vars().has(varName)) return { ok: false, reason: varName + ' does not appear in this equation' };
      let r; try { r = SR.solveByRadicals(node.poly, varName); }
      catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
      if (!r.ok) return { ok: false, reason: r.reason };
      let verify = { checked: 0, samples: 0, maxResidual: Infinity };
      try { verify = SR.verifyRoots(node.poly, varName, r.roots, { samples: opts.samples || 6 }); }
      catch (e) { /* leave the default — UI flags an unverified result */ }
      return { ok: true, variable: varName, roots: r.roots, count: r.roots.length, method: r.method, verify: verify };
    }

    // Explicit REAL solutions (the actual quadrature domains): solve the pinned reim
    // system numerically (opts.paramValues pins the known data). Each solution is keyed
    // by the real variable names (v__re / v__im); the REAL ones (tiny imaginary part) are
    // the QDs. Returns Sym.solveZeroDim's result over the reim system, or { ok:false }.
    function solveReal(ids, opts) {
      opts = opts || {};
      const S = getSym();
      const reim = currentReimSystem(ids, opts);
      if (!reim.polys.length) return { ok: false, reason: 'no equality nodes to solve' };
      const rootFinder = opts.rootFinder || defaultRootFinder();
      try { return S.solveZeroDim(reim.polys, Object.assign({}, opts, { vars: reim.vars, rootFinder })); }
      catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    }
    // Off-main-thread explicit REAL solve via QD.SymWorker (Promise). Like solveReal but the
    // reim Gröbner→FGLM→roots run in the worker (runJob 'solveZeroDim'; it bundles
    // faber-analysis, so its own Durand–Kerner is used — no rootFinder crosses postMessage).
    // runOpts: { onProgress, signal }. Falls back to the synchronous solveReal().
    function solveRealAsync(ids, opts, runOpts) {
      opts = opts || {};
      const reim = currentReimSystem(ids, opts);
      if (!reim.polys.length) return Promise.resolve({ ok: false, reason: 'no equality nodes to solve' });
      const SW = symWorker();
      if (!SW) return Promise.resolve(solveReal(ids, opts));
      const payload = { polys: reim.polys.map((p) => p.termList()), vars: reim.vars, opts: _capOpts(opts) };
      return SW.run('solveZeroDim', payload, runOpts || {}).then(
        (res) => res,
        (err) => (err && err.aborted) ? { ok: false, aborted: true, reason: 'cancelled' }
          : { ok: false, reason: (err && err.message) || String(err) });
    }
    // CERTIFIED explicit real solve (RUR + exact Sturm isolating boxes): counts ALL real solutions
    // by construction (no clustered / coincident-projection undercount), so a downstream verdict can
    // certify the count. Serialized JSON-safe (certifiedRealToJSON) — solutions carry numeric box
    // midpoints { re, im } (a drop-in for the numeric solver) + endpoints + `exact`. Sync twin below.
    function solveRealCertifiedSync(ids, opts) {
      opts = opts || {};
      const S = getSym();
      const reim = currentReimSystem(ids, opts);
      if (!reim.polys.length) return { ok: false, reason: 'no equality nodes to solve' };
      try { return S.certifiedRealToJSON(S.solveRealCertified(reim.polys, Object.assign({}, opts, { vars: reim.vars }))); }
      catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    }
    function solveRealCertifiedAsync(ids, opts, runOpts) {
      opts = opts || {};
      const reim = currentReimSystem(ids, opts);
      if (!reim.polys.length) return Promise.resolve({ ok: false, reason: 'no equality nodes to solve' });
      const SW = symWorker();
      if (!SW) return Promise.resolve(solveRealCertifiedSync(ids, opts));
      const payload = { polys: reim.polys.map((p) => p.termList()), vars: reim.vars, opts: _capOpts(opts) };
      return SW.run('solveRealCertified', payload, runOpts || {}).then(
        (res) => res,
        (err) => (err && err.aborted) ? { ok: false, aborted: true, reason: 'cancelled' }
          : { ok: false, reason: (err && err.message) || String(err) });
    }
    // 1-parameter BIFURCATION of the current (reim) system over a chosen real variable: how the
    // #real solutions changes as `paramVar` ranges over ℝ (QD.Sym.parametricRealCount1D — exact:
    // eliminant border polynomial + Sturm critical values + Hermite count per cell). Returns
    // { ok, paramVar, degree, criticalValues, cells, crosschecked } (unbounded cell ends as null).
    function _bifMapInf(res) {
      if (!res || !res.ok || !Array.isArray(res.cells)) return res;
      return Object.assign({}, res, { cells: res.cells.map((c) => Object.assign({}, c, { lo: Number.isFinite(c.lo) ? c.lo : null, hi: Number.isFinite(c.hi) ? c.hi : null })) });
    }
    function parametricBifurcation(ids, paramVar, opts) {
      opts = opts || {};
      const S = getSym();
      const reim = currentReimSystem(ids, opts);
      if (!reim.polys.length) return { ok: false, reason: 'no equality nodes to analyze' };
      if (reim.vars.indexOf(paramVar) < 0) return { ok: false, reason: 'parameter "' + paramVar + '" is not a variable of the current system' };
      try { return _bifMapInf(S.parametricRealCount1D(reim.polys, paramVar, Object.assign({}, opts, { vars: reim.vars }))); }
      catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    }
    function parametricBifurcationAsync(ids, paramVar, opts, runOpts) {
      opts = opts || {};
      const reim = currentReimSystem(ids, opts);
      if (!reim.polys.length) return Promise.resolve({ ok: false, reason: 'no equality nodes to analyze' });
      if (reim.vars.indexOf(paramVar) < 0) return Promise.resolve({ ok: false, reason: 'parameter "' + paramVar + '" is not a variable of the current system' });
      const SW = symWorker();
      if (!SW) return Promise.resolve(parametricBifurcation(ids, paramVar, opts));
      const payload = { polys: reim.polys.map((p) => p.termList()), vars: reim.vars, paramVar, opts: _capOpts(opts) };
      return SW.run('parametricRealCount1D', payload, runOpts || {}).then(
        (res) => _bifMapInf(res),
        (err) => (err && err.aborted) ? { ok: false, aborted: true, reason: 'cancelled' }
          : { ok: false, reason: (err && err.message) || String(err) });
    }
    // SHAPE-FROM-MOMENTS (roadmap #18): a NEW input modality — reconstruct a discrete measure Σ a_j δ_{z_j}
    // (for a QD, its quadrature data) from a raw complex moment sequence m_k = Σ_j a_j z_j^k, independent of
    // the current column system. Returns { ok, order (= exact QD-order, the Hankel rank drop), saturated,
    // coeffs (ascending {re,im} of the exact Prony polynomial), nodes, weights, maxResidual } — the order +
    // Prony polynomial are exact, the nodes/weights numeric (QD.Sym.shapeFromMomentsJSON).
    function shapeFromMoments(moments, opts) {
      const S = getSym();
      try { return S.shapeFromMomentsJSON(moments || [], opts || {}); }
      catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    }
    function shapeFromMomentsAsync(moments, opts, runOpts) {
      const SW = symWorker();
      if (!SW) return Promise.resolve(shapeFromMoments(moments, opts));
      return SW.run('shapeFromMoments', { moments: moments || [], opts: opts || {} }, runOpts || {}).then(
        (res) => res,
        (err) => (err && err.aborted) ? { ok: false, aborted: true, reason: 'cancelled' }
          : { ok: false, reason: (err && err.message) || String(err) });
    }

    // C4 — HARD-FILTER the solver output by the ACTIVE branch's assumptions. A complex
    // solution of the conjugate-model system that violates an active assumption — a variable
    // asserted REAL coming out with a nonzero imaginary part, an IMAGINARY one with a nonzero
    // real part, or a value disagreeing with a pinned/φ(0) constant — is not an actual QD on
    // this branch, so it is DROPPED (Andrew's call: hard-filter, not annotate). The dropped
    // count is reported as `prunedByAssumptions` and the originals kept as `allSolutions` so
    // nothing is silently lost. Opt out with opts.pruneByAssumptions === false. (solveReal
    // already enforces reality structurally via the reim transform, so this is the lever for
    // the conjugate-model `solve`.)
    function _pruneSolutionsByAssumptions(result, opts, track) {
      if (!result || !result.ok || !Array.isArray(result.solutions)) return result;
      if (opts && opts.pruneByAssumptions === false) return result;
      // Prune by the ANALYZED branch's assumptions (resolved from the solved ids' track by
      // the caller), NOT the active branch's — matching classify/currentReimSystem (A6). An
      // undefined `track` falls back to the active track inside assumeOf/knownValues.
      const a = assumeOf(track);
      const reals = new Set(a.realVars || []), imags = new Set(a.imagVars || []);
      const kv = knownValues(track);
      const tol = (opts && opts.assumeTol != null) ? opts.assumeTol : 1e-6;
      if (!reals.size && !imags.size && !Object.keys(kv).length) return result;
      const consistent = (sol) => {
        for (const v of Object.keys(sol)) {
          const val = sol[v]; if (!val) continue;
          const prim = _primalName(v);
          if ((reals.has(prim) || reals.has(v)) && Math.abs(val.im || 0) > tol) return false;
          if ((imags.has(prim) || imags.has(v)) && Math.abs(val.re || 0) > tol) return false;
          const k = kv[v] || kv[prim];
          if (k && (Math.abs((val.re || 0) - (k.re || 0)) > tol || Math.abs((val.im || 0) - (k.im || 0)) > tol)) return false;
        }
        return true;
      };
      const kept = result.solutions.filter(consistent);
      const pruned = result.solutions.length - kept.length;
      if (!pruned) return Object.assign({}, result, { prunedByAssumptions: 0 });
      return Object.assign({}, result, { solutions: kept, allSolutions: result.solutions, prunedByAssumptions: pruned });
    }

    // Numeric solutions of the selected (or all) equality nodes via the shape-lemma
    // solver (grevlex GB → FGLM to lex → univariate Durand–Kerner + back-substitution).
    // Returns Sym.solveZeroDim's result: { ok, solutions:[{var:{re,im}}], dimension, … }
    // (filtered by the active assumptions — see _pruneSolutionsByAssumptions, C4) or
    // { ok:false, reason } (not zero-dim / not in shape position / no convergence → CAS bridge).
    function solve(ids, opts) {
      const S = getSym();
      opts = opts || {};
      const polys = _eqPolys(ids);
      if (polys.length < 1) return { ok: false, reason: 'no equality nodes to solve' };
      const vars = opts.vars || _varsOf(polys);
      const rootFinder = opts.rootFinder || defaultRootFinder();
      const track = (ids && ids.length) ? trackOf(ids[0]) : activeTrackId;
      try { return _pruneSolutionsByAssumptions(S.solveZeroDim(polys, Object.assign({}, opts, { vars, rootFinder })), opts, track); }
      catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    }
    // Off-main-thread numeric solve via QD.SymWorker (Promise). runOpts: { onProgress,
    // signal }. The worker bundles faber-analysis so its own default Durand–Kerner is
    // used. Falls back to the synchronous solve() when the worker is unavailable.
    function solveAsync(ids, opts, runOpts) {
      opts = opts || {};
      const polys = _eqPolys(ids);
      if (polys.length < 1) return Promise.resolve({ ok: false, reason: 'no equality nodes to solve' });
      const SW = symWorker();
      if (!SW) return Promise.resolve(solve(ids, opts));
      const vars = opts.vars || _varsOf(polys);
      const track = (ids && ids.length) ? trackOf(ids[0]) : activeTrackId;
      const payload = { polys: polys.map((p) => p.termList()), vars, solveVar: opts.solveVar, opts: _capOpts(opts) };
      return SW.run('solveZeroDim', payload, runOpts || {}).then(
        (res) => _pruneSolutionsByAssumptions(res, opts, track),
        (err) => (err && err.aborted) ? { ok: false, aborted: true, reason: 'cancelled' }
          : { ok: false, reason: (err && err.message) || String(err) });
    }

    // ---- decomposition into components (#12 minimal primes / #13 regular chains) ----
    // The escape hatch from a POSITIVE-DIMENSIONAL verdict: V(I) = ⋃ₖ V(componentₖ), so each
    // component can be analyzed on its own and the existence counts ADD — the same case-split
    // semantics applyFactor already has, one level up (a variety split rather than a factor split).
    // These are QUERIES: they compute and return, and never touch the graph. Entering a component is
    // the separate, undoable applyComponent below, so the user sees the decomposition before
    // committing to a branch of it. Both run in the worker — factorizing Buchberger is heavy enough
    // that a main-thread call would freeze the tab.
    // Returns { ok, complete, count, primes:[[termList]] } / { ok, complete, count, chains:[…] }.
    // ⚠ complete:false ⇒ a cost cap fired and the component list may be INCOMPLETE. The union of
    // what came back is then a SUBSET of V(I), so counts over it are a lower bound, not the total.
    function _decomposeInputs(ids) {
      const inputs = ((ids && ids.length) ? ids.map(get) : lastColumnNodes()).filter(Boolean).filter((n) => n.rel === '=');
      return { inputs, polys: inputs.map((n) => n.poly) };
    }
    function decomposeComponentsAsync(ids, opts, runOpts) {
      opts = opts || {};
      const { polys } = _decomposeInputs(ids);
      if (!polys.length) return Promise.resolve({ ok: false, reason: 'no equality nodes to decompose' });
      const SW = symWorker();
      const vars = _varsOf(polys);
      if (!SW) {
        const S = getSym();
        try {
          const res = S.minimalPrimes(polys, Object.assign({}, opts, { vars }));
          return Promise.resolve(res.ok
            ? { ok: true, complete: !!res.complete, count: res.count, note: res.note || '', primes: res.primes.map((G) => G.map((g) => g.termList())) }
            : { ok: false, reason: res.reason });
        } catch (e) { return Promise.resolve({ ok: false, reason: (e && e.message) || String(e) }); }
      }
      return SW.run('minimalPrimes', { polys: polys.map((p) => p.termList()), vars, opts: _capOpts(opts) }, runOpts || {}).then(
        (res) => res,
        (err) => (err && err.aborted) ? { ok: false, aborted: true, reason: 'cancelled' }
          : { ok: false, reason: (err && err.message) || String(err) });
    }
    function regularChainsAsync(ids, opts, runOpts) {
      opts = opts || {};
      const { polys } = _decomposeInputs(ids);
      if (!polys.length) return Promise.resolve({ ok: false, reason: 'no equality nodes to decompose' });
      const SW = symWorker();
      const vars = _varsOf(polys);
      if (!SW) {
        const S = getSym();
        try {
          const res = S.triangularDecomposition(polys, Object.assign({}, opts, { vars }));
          return Promise.resolve(res.ok
            ? { ok: true, complete: !!res.complete, count: res.count,
                chains: res.chains.map((c) => ({ chain: (c.chain || []).map((p) => p.termList()), mainVars: c.mainVars || [], freeVars: c.freeVars || [], initials: (c.initials || []).map((p) => p.termList()), whole: !!c.whole })) }
            : { ok: false, reason: res.reason });
        } catch (e) { return Promise.resolve({ ok: false, reason: (e && e.message) || String(e) }); }
      }
      return SW.run('triangularDecomposition', { polys: polys.map((p) => p.termList()), vars, opts: _capOpts(opts) }, runOpts || {}).then(
        (res) => res,
        (err) => (err && err.aborted) ? { ok: false, aborted: true, reason: 'cancelled' }
          : { ok: false, reason: (err && err.message) || String(err) });
    }
    // ENTER one component as a new column: its generators REPLACE the current equalities, and the
    // non-equality nodes (inequality constraints — side conditions, not part of the ideal) are
    // carried forward. Provenance op 'component' with caseIndex/caseCount, which _factorBranchInfo
    // recognizes, so the verdict says the count is for THIS branch only. Undoable. `info.complete`
    // is recorded on every node so a decomposition that hit a cap can never be read as exhaustive.
    function applyComponent(termLists, k, count, info) {
      const S = getSym();
      const cur = lastColumnNodes();
      const inputs = cur.filter((n) => n.rel === '=');
      if (!inputs.length) return { ok: false, reason: 'no current system to replace', created: [] };
      let polys;
      try { polys = (termLists || []).map((tl) => S.polyFromTermList(tl)).filter((p) => p && !p.isZero()); }
      catch (e) { return { ok: false, reason: 'could not rebuild the component: ' + ((e && e.message) || String(e)), created: [] }; }
      if (!polys.length) return { ok: false, reason: 'that component is the whole space (no equations) — nothing to enter', created: [] };
      const inputIds = inputs.map((n) => n.id);
      checkpoint();
      const col = maxColumn() + 1;
      const created = [];
      const prov = () => ({ op: 'component', inputs: inputIds.slice(), caseIndex: k, caseCount: count,
        complete: !!(info && info.complete), method: (info && info.method) || 'minimalPrimes' });
      polys.forEach((p, i) => {
        const node = addNode({ id: nid(), kind: 'derived', poly: p, rel: '=',
          label: 'component ' + (k + 1) + '/' + count + ' · g' + (i + 1), model,
          provenance: prov(), column: col, meta: {} });
        for (const id of inputIds) edges.push({ from: id, to: node.id });
        created.push(node);
      });
      // Side conditions are not part of the ideal being decomposed, so they survive the split.
      cur.filter((n) => n.rel !== '=').forEach((n) => {
        const node = addNode({ id: nid(), kind: n.kind, poly: n.poly, rel: n.rel, label: n.label, model: n.model,
          provenance: Object.assign(prov(), { carried: true, inputs: [n.id] }), column: col, meta: n.meta });
        edges.push({ from: n.id, to: node.id });
        created.push(node);
      });
      normalizeColumn(col);
      return { ok: true, created, column: col, caseIndex: k, caseCount: count, complete: !!(info && info.complete) };
    }

    // Triangular decomposition (Wu pseudo-elimination) of the current system (or a
    // selection) → a triangular chain appended as a new column. An ALTERNATIVE to the
    // Gröbner eliminate path that exhibits solution structure: a contradiction ⇒ a 1=0
    // marker (no solution); free variables ⇒ a positive-dimensional family (reported).
    // Returns { ok, created[], column, contradiction, mainVars, freeVars } or { ok:false, reason }.
    // ── Q2 triangularize: cheap PLAN (inputs + dropped-node accounting) + FINISH (checkpoint + emit the
    // chain), shared by the sync path and the worker-offloaded triangularizeAsync. ──
    function _triangularizePlan(ids) {
      const pool = ((ids && ids.length) ? ids.map(get) : lastColumnNodes()).filter(Boolean);
      const inputs = pool.filter((n) => n.rel === '=');
      // See saturateMobius — measured against the whole current column, not the selection.
      const skipped = _droppedByBasisReplacement(lastColumnNodes().filter(Boolean), new Set(inputs.map((n) => n.id)));
      if (inputs.length < 1) return { ok: false, reason: 'no equality nodes to triangularize', skipped };
      const polys = inputs.map((n) => n.poly);
      return { ok: true, inputs, inputIds: inputs.map((n) => n.id), polys, vars: _varsOf(polys), skipped };
    }
    function _triangularizeFinish(plan, res) {
      const S = getSym();
      if (!res.ok) return { ok: false, reason: res.reason, created: [], skipped: plan.skipped };
      const inputIds = plan.inputIds, skipped = plan.skipped;
      checkpoint();
      const col = maxColumn() + 1;
      const created = [];
      const emit = (poly, label, meta) => {
        const node = addNode({ id: nid(), kind: 'derived', poly, rel: '=', label, model,
          provenance: { op: 'triangular', inputs: inputIds.slice(), contradiction: !!res.contradiction, freeVars: (res.freeVars || []).slice(),
            droppedNonEq: skipped.filter((k) => k.cause === 'inequality').length,
            droppedOutOfScope: skipped.filter((k) => k.cause === 'out-of-scope').length }, column: col, meta: meta || {} });
        for (const id of inputIds) edges.push({ from: id, to: node.id });
        created.push(node);
      };
      if (res.contradiction) {
        emit(S.mpolyConst(S.gauss(S.rat(1n, 1n), S.rat(0n, 1n))), 'triangular: inconsistent (no solution)', { inconsistent: true });
      } else {
        res.chain.forEach((g, i) => emit(g, 'triangular ' + (i + 1) + '/' + res.chain.length + ' (main ' + res.mainVars[i] + ')', { mainVar: res.mainVars[i] }));
      }
      normalizeColumn(col);
      // B-3: surface the regular-chain INITIALS (the pivots' leading coefficients). A Wu chain is triangular
      // but NOT saturated by them, so a non-constant initial vanishing may add spurious branches or miss
      // components — the caller shows this caveat. initialCount = the number of non-constant initials.
      const nonTrivialInit = (res.initials || []).filter((p) => p && p.vars && p.vars().size > 0 && !p.isZero());
      return { ok: true, created, column: col, contradiction: !!res.contradiction, mainVars: res.mainVars || [], freeVars: res.freeVars || [], initialCount: nonTrivialInit.length, hasRegularityConditions: nonTrivialInit.length > 0, skipped };
    }
    function triangularizeNodes(ids, opts) {
      const S = getSym();
      const plan = _triangularizePlan(ids);
      if (!plan.ok) return { ok: false, reason: plan.reason, created: [], skipped: plan.skipped || [] };
      return _triangularizeFinish(plan, S.triangularize(plan.polys, plan.vars, opts || {}));
    }
    // Off-main-thread Wu triangularization (Q2) — falls back to sync when no worker. Byte-identical: SAME
    // plan + finish, only S.triangularize runs in the worker (its chain/initials return as term-lists).
    function triangularizeAsync(ids, opts, runOpts) {
      const S = getSym();
      const plan = _triangularizePlan(ids);
      if (!plan.ok) return Promise.resolve({ ok: false, reason: plan.reason, created: [], skipped: plan.skipped || [] });
      const SW = symWorker();
      if (!SW) return Promise.resolve(triangularizeNodes(ids, opts));
      const payload = { polys: plan.polys.map((p) => p.termList()), vars: plan.vars, opts: _capOpts(opts || {}) };
      return SW.run('triangularize', payload, runOpts || {}).then(
        (r) => {
          if (!r.ok) return { ok: false, reason: r.reason, created: [], skipped: plan.skipped };
          const res = { ok: true, contradiction: !!r.contradiction, mainVars: r.mainVars || [], freeVars: r.freeVars || [],
            chain: (r.chain || []).map((tl) => S.polyFromTermList(tl)), initials: (r.initials || []).map((tl) => S.polyFromTermList(tl)) };
          return _triangularizeFinish(plan, res);
        },
        (err) => (err && err.aborted) ? { ok: false, aborted: true, reason: 'cancelled', created: [], skipped: plan.skipped }
          : { ok: false, reason: (err && err.message) || String(err), created: [], skipped: plan.skipped });
    }

    // Duplicate a node to start an alternative derivation line (accumulate alternatives).
    function duplicate(id) {
      const a = get(id); if (!a) return null;
      checkpoint();
      return addNode({
        id: nid(), kind: a.kind, poly: a.poly, rel: a.rel,
        label: a.label + ' (copy)', model: a.model,
        provenance: { op: 'duplicate', inputs: [id] }, column: a.column, meta: a.meta,
      });
    }

    // Add the conjugate equation p̄ = 0 of a node as a paired companion in the SAME column —
    // the user-invoked, undoable form of the seed-time maybeAddConjugate. The conjugate FOLDS IN
    // the current reality (and fixed-φ(0)) assumptions: conj = _applyReality(_applyW0(conjMPoly(p))),
    // so a variable already assumed real has its v̄ collapsed to v (no bar appears). Skips when the
    // node is self-conjugate (p̄ = ±p ⇒ no independent equation, e.g. the gauge) or when an equal
    // companion already sits in the column. Returns { ok, node } or { ok:false, reason }. Useful for
    // DERIVED equations (after elimination / Gröbner / substitution) that did not get a seed-time
    // companion. provenance.op:'conjugate' (rendered by the UI's provText); same-column placement
    // means columnLabel is not involved.
    function generateConjugate(id, opts) {
      opts = opts || {};
      const node = get(id);
      if (!node) return { ok: false, reason: 'node not found' };
      if (node.rel === '>') return { ok: false, reason: 'a Hermitian inequality is one real condition — it has no independent conjugate' };
      const QC = getQC();
      if (!QC || !QC.conjMPoly) return { ok: false, reason: 'QD.QDConstraints not loaded' };
      const conj = (opts.incorporateReality === false)
        ? _applyW0(_conjMPoly(node.poly))
        : _applyAssumed(_conjMPoly(node.poly));
      if (node.poly.sub(conj).isZero() || node.poly.add(conj).isZero())
        return { ok: false, reason: 'this equation is self-conjugate — its conjugate is the same equation' };
      // Scope the "already present" dedup to THIS node's own track (as the seed-time twin
      // maybeAddConjugate does, l.301). Column indices are per-track depths, so after a forkTrack
      // an equal poly at the SAME index in ANOTHER branch would otherwise wrongly block the
      // companion this branch needs — leaving its system conjugation-incomplete. (Review QD-algebra-store-B-01)
      for (const m of nodes.values())
        if (m.column === node.column && (m.track || 't0') === (node.track || 't0') && m.poly.equals(conj))
          return { ok: false, reason: 'the conjugate equation is already present in this column' };
      checkpoint();
      const comp = addNode({
        id: nid(), kind: node.kind, poly: conj, rel: node.rel,
        label: node.label + ' (conj)', model: node.model,
        provenance: { op: 'conjugate', inputs: [node.id] }, column: node.column, meta: node.meta,
      });
      order.set(comp.id, ordOf(node.id) + 0.5);   // pair the conjugate right under its primal
      normalizeColumn(node.column);
      return { ok: true, node: comp };
    }

    // Propagate a node (typically a univalence CONSTRAINT added at column 0) forward into the
    // CURRENT system (the last column), with all the workspace's pointwise ASSUMPTIONS applied to
    // it: reality (v̄≡v), imaginary (v̄≡−v), fixed φ(0), and every variable an earlier reduction
    // PINNED to a constant (substitute / linear-reduce / fix-w0 — recovered via knownValues, plus
    // each one's conjugate). This is the cumulative composition of the assumption columns — it does
    // NOT replay the system-level ELIMINATIONS (Gröbner / resultant / triangular), which aren't
    // pointwise maps; the constraint simply rides forward folded by the assumptions, ready to be
    // combined with the reduced system. Emits ONE node in the last column (provenance op:'propagate',
    // linked to the source) — undoable. Returns { ok, node, column, applied[] } or { ok:false }.
    // The cumulative pointwise-assumption fold of a node's polynomial (reality / imaginary /
    // fixed φ(0) via _applyAssumed, then every variable an earlier reduction pinned to a CONSTANT
    // via knownValues + each conjugate). Shared by propagateNode + propagateAllConstraints.
    // Returns { poly, applied } (applied = the human-readable list of assumption kinds folded in).
    function _propagatePoly(node) {
      const S = getSym(), QC = getQC();
      let poly = _applyAssumed(node.poly);            // reality + imaginary + fixed φ(0)
      const kv = knownValues();                        // pinned constants (substitute / linear-reduce / w0)
      const sub = {};
      for (const name in kv) {
        if (!Object.prototype.hasOwnProperty.call(kv, name)) continue;
        let g; try { ({ g } = _ratGauss(kv[name])); } catch (e) { continue; }
        sub[name] = S.mpolyConst(g);
        if (QC && QC.conjVarName) { const c = _conjName(name); if (c !== name) sub[c] = S.mpolyConst(g.conj()); }   // overlay-aware (defined symbols too)
      }
      if (Object.keys(sub).length) poly = poly.subst(sub);
      const applied = [];
      const _a = assumeOf();
      if (_a.realVars.length) applied.push('reality');
      if (_a.imagVars.length) applied.push('imaginary');
      if (_a.w0Fixed) applied.push('φ(0)');
      if (Object.keys(kv).filter((k) => k !== 'w0').length) applied.push('pinned values');
      return { poly, applied };
    }
    function propagateNode(id) {
      const node = get(id);
      if (!node) return { ok: false, reason: 'node not found' };
      const last = maxColumn();
      if (node.column === last) return { ok: false, reason: 'this equation is already in the current system (the last column)' };
      const { poly, applied } = _propagatePoly(node);
      if (poly.isZero()) return { ok: false, reason: 'the constraint reduces to 0 under the current assumptions (already satisfied)' };
      checkpoint();
      const napp = addNode({
        id: nid(), kind: node.kind, poly, rel: node.rel,
        label: node.label + ' (propagated)', model,
        provenance: { op: 'propagate', inputs: [node.id], from: node.column, applied: applied.slice() },
        column: last, meta: node.meta,
      });
      edges.push({ from: node.id, to: napp.id });
      normalizeColumn(last);
      return { ok: true, node: napp, column: last, applied };
    }

    // Batch form of propagateNode: carry EVERY univalence-constraint node (kind:'constraint',
    // including conjugate companions) into the current system in ONE undoable step, each folded by
    // _propagatePoly. Skips constraints already in the last column, drops zero results, and de-dups
    // on (poly, rel) against the existing last column AND within the batch. Returns { ok, created,
    // column, count } or { ok:false, reason }.
    function propagateAllConstraints() {
      const last = maxColumn();
      if (last === 0) return { ok: false, reason: 'no reduction columns to propagate through (constraints are already in the current system)', created: [] };
      const constraints = list().filter((n) => n.kind === 'constraint' && n.column < last);
      if (!constraints.length) return { ok: false, reason: 'no constraints to propagate (add a univalence constraint first)', created: [] };
      const lastNodes = colNodes(last);
      const built = [], seen = [];
      for (const c of constraints) {
        let res; try { res = _propagatePoly(c); } catch (e) { continue; }
        const poly = res.poly; if (!poly || poly.isZero()) continue;
        if (lastNodes.some((m) => m.rel === c.rel && m.poly.equals(poly))) continue;   // already present
        if (seen.some((s) => s.rel === c.rel && s.poly.equals(poly))) continue;        // dup within the batch
        seen.push({ poly, rel: c.rel });
        built.push({ src: c, poly, applied: res.applied });
      }
      if (!built.length) return { ok: false, reason: 'every constraint is already present in the current system (or folds to 0)', created: [] };
      checkpoint();
      const created = [];
      for (const { src, poly, applied } of built) {
        const node = addNode({
          id: nid(), kind: src.kind, poly, rel: src.rel, label: src.label + ' (propagated)', model,
          provenance: { op: 'propagate', inputs: [src.id], from: src.column, applied: applied.slice() },
          column: last, meta: src.meta,
        });
        edges.push({ from: src.id, to: node.id });
        created.push(node);
      }
      normalizeColumn(last);
      return { ok: true, created, column: last, count: created.length };
    }

    // Delete a node and all of its descendants (derived from it), with their edges.
    function deleteNode(id) {
      if (!nodes.has(id)) return [];
      checkpoint();
      const doomed = new Set([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const e of edges) {
          if (doomed.has(e.from) && !doomed.has(e.to)) { doomed.add(e.to); grew = true; }
        }
      }
      for (const d of doomed) nodes.delete(d);
      edges = edges.filter((e) => !doomed.has(e.from) && !doomed.has(e.to));
      return [...doomed];
    }

    // Per-node descriptive stats for the card hovertext / Inspect. Reports the
    // variable count, the (real) equation count this node contributes, each
    // variable with its polynomial order, plus total degree, term count, the
    // conjugacy status and a human-readable provenance string.
    //
    // Real-equation accounting (conjugate model): a complex equality E=0 is
    // equivalent on the reality slice to TWO real equations {Re E=0, Im E=0}
    // UNLESS E is self-conjugate (Ē=±E, e.g. the gauge or a Hermitian form), which
    // is ONE. The store splits a non-self-conjugate equality into two nodes (E and
    // its conjugate companion), so when that companion is present each node carries
    // ONE real equation; if the companion was opted out (withConjugates:false) the
    // single node still stands for the full TWO. Inequalities/≠ contribute one
    // real condition each.
    function nodeStats(id) {
      const n = get(id); if (!n) return null;
      const QC = getQC();
      const vars = [...n.poly.vars()].sort();
      const varOrders = vars.map((name) => ({ name, order: n.poly.degreeIn(name) }));
      let selfConj = false, hasCompanion = false;
      if (QC && QC.conjMPoly) {
        // Compute the conjugate the SAME way maybeAddConjugate does — fold fixed φ(0)
        // and reality back in — so self-conjugacy / companion detection matches the
        // nodes actually seeded. Without this, under reality assumptions the bare
        // conjugate reintroduces barred names that match nothing, mis-reporting the
        // real-equation count in the hovertext.
        const conj = _applyReality(_applyW0(_conjMPoly(n.poly)));
        selfConj = n.poly.sub(conj).isZero() || n.poly.add(conj).isZero();
        // The companion is seeded in THIS node's own track and column (maybeAddConjugate /
        // generateConjugate use column: node.column, same track), so scope the scan there.
        // Without the track+column filter, an equal conjugate poly in another branch (or an
        // earlier reduction column) is mis-counted as this node's companion, under-reporting
        // realEquations (1 instead of 2) in the card hovertext / Inspect. (Review QD-algebra-store-B-03)
        if (!selfConj) for (const m of nodes.values())
          if (m.id !== n.id && (m.track || 't0') === (n.track || 't0') && m.column === n.column && m.poly.equals(conj)) { hasCompanion = true; break; }
      }
      let realEquations;
      if (n.rel === '=') realEquations = selfConj ? 1 : (hasCompanion ? 1 : 2);
      else realEquations = 1;                          // '>' inequality or '≠' condition
      return {
        id, kind: n.kind, rel: n.rel, label: n.label,
        numVars: vars.length, varOrders,
        totalDegree: n.poly.totalDegree(), terms: n.poly.size(),
        realEquations, selfConj, hasCompanion,
        provenance: n.provenance, meta: n.meta,
      };
    }

    // CAS-agnostic export: model + every node as a term list (exact ℚ(i) coeffs) + edges.
    // `version` + per-node `order`/`meta` make it a faithful SESSION snapshot that importDAG
    // (E1) can round-trip — not only a CAS feed.
    function exportDAG() {
      return {
        version: 1,
        model,
        formulation,
        w0Fixed: assumeOf().w0Fixed,              // active branch's (back-compat)
        assumptions: serializeAssume(),           // C3: per-track reality / imaginary / fixed-φ(0)
        substConj: [...substConj], substBarred: [...substBarred],   // user-defined substitution conjugate pairs
        tracks: tracksList(),
        activeTrack: activeTrackId,
        nodes: list().map((n) => ({
          id: n.id, kind: n.kind, label: n.label, rel: n.rel, column: n.column, track: n.track || 't0',
          order: ordOf(n.id), meta: n.meta, provenance: n.provenance, terms: n.poly.termList(),
        })),
        edges: edges.slice(),
      };
    }
    // E1 — rebuild the whole workspace from an exportDAG() snapshot (the inverse of exportDAG).
    // Undoable (checkpoint + clearGraph, like seedFromSystem). Reconstructs each node's MPoly
    // from its term list, restores per-node column/track/order/provenance, the tracks + active
    // track, and the per-track assumptions; bumps the id counter past the imported ids so further
    // work can't collide. Returns { ok, nodes, tracks } or { ok:false, reason }.
    function importDAG(data) {
      if (!data || !Array.isArray(data.nodes)) return { ok: false, reason: 'not a valid DAG export (no nodes array)' };
      const S = getSym(); if (!S || !S.polyFromTermList) return { ok: false, reason: 'QD.Sym unavailable' };
      let built;
      try {
        built = data.nodes.map((nd) => ({ nd, poly: S.polyFromTermList(nd.terms || []) }));
      } catch (e) { return { ok: false, reason: 'could not parse node polynomials: ' + ((e && e.message) || String(e)) }; }
      checkpoint();
      clearGraph();
      model = data.model || 'conjugate';
      formulation = data.formulation || 'classical';
      substConj = new Map(data.substConj || []); substBarred = new Set(data.substBarred || []);   // restore the substitution conjugate overlay
      // tracks (+ track-id counter past the highest 't<n>')
      tracks = (data.tracks && data.tracks.length)
        ? data.tracks.map((t) => ({ id: t.id, label: t.label, parentId: t.parentId, forkColumn: t.forkColumn }))
        : [{ id: 't0', label: 'main', parentId: null, forkColumn: null }];
      trackSeq = 0; for (const t of tracks) { const m = /^t(\d+)$/.exec(t.id); if (m) trackSeq = Math.max(trackSeq, +m[1]); }
      activeTrackId = (data.activeTrack && hasTrack(data.activeTrack)) ? data.activeTrack : tracks[0].id;
      // per-track assumptions (C3); fall back to a single t0 record from the legacy top-level w0Fixed
      trackAssume.clear();
      if (data.assumptions) { for (const [k, a] of data.assumptions) trackAssume.set(k, { realVars: (a.realVars || []).slice(), imagVars: (a.imagVars || []).slice(), w0Fixed: a.w0Fixed || null }); }
      else { trackAssume.set('t0', { realVars: [], imagVars: [], w0Fixed: data.w0Fixed || null }); }
      // nodes (+ id counter past the highest 'n<n>')
      let maxSeq = 0;
      for (const { nd, poly } of built) {
        // Fail-closed on untrusted import: re-home a node whose track isn't among the
        // reconstructed tracks to 't0' (an orphan-track node is a "ghost" — counted by
        // size()/variables()/exportDAG but invisible to every track-scoped view, so it never
        // renders yet re-exports), and coerce a non-numeric column to 0.
        const nodeTrack  = hasTrack(nd.track) ? nd.track : 't0';
        const nodeColumn = (typeof nd.column === 'number' && Number.isFinite(nd.column)) ? nd.column : 0;
        nodes.set(nd.id, {
          id: nd.id, kind: nd.kind || 'derived', poly, rel: nd.rel || '=', label: nd.label || nd.id,
          model, provenance: nd.provenance, column: nodeColumn, track: nodeTrack, meta: nd.meta,
        });
        if (nd.order != null) order.set(nd.id, nd.order);
        const m = /^n(\d+)$/.exec(nd.id); if (m) maxSeq = Math.max(maxSeq, +m[1]);
      }
      seq = maxSeq;
      edges = (data.edges || []).filter((e) => nodes.has(e.from) && nodes.has(e.to)).map((e) => ({ from: e.from, to: e.to }));
      return { ok: true, nodes: nodes.size, tracks: tracks.length };
    }

    // ---- Mathematica export (one column → a copy-paste list of equations) ----
    // Variable names are sanitized for Wolfram-Language symbols: `_` is Blank in
    // Mathematica, so A1_1 → A1$1 ($ is a legal symbol character). Coefficients are
    // exact ℚ(i) rationals; the imaginary unit is `I`.
    // The shared CAS formatter (QD.CASExport; loaded before this file per the manifest).
    function _getCAS() {
      const Q = (typeof window !== 'undefined' && window.QD) || (typeof global !== 'undefined' && global.QD) || (typeof QD !== 'undefined' && QD);
      return (Q && Q.CASExport) || null;
    }
    // A column's nodes → the serialization-safe { terms, rel, label } items CASExport consumes.
    function _columnItems(c) {
      return orderedColumn(c).map((n) => ({ terms: n.poly.termList(), rel: n.rel, label: n.label }));
    }
    // External-CAS export of a column → a runnable script for `dialect` ('maple'|'singular'|
    // 'sage'|'mathematica'). opts.params = variable names to treat as PARAMETERS (Maple RCTD).
    // Returns '' for an empty column or when QD.CASExport is unavailable.
    function casColumn(c, dialect, opts) {
      const CAS = _getCAS(); if (!CAS) return '';
      const items = _columnItems(c);
      if (!items.length) return '';
      const script = CAS.systemToCAS(items, dialect || 'maple', opts || {});
      // F5: Maple RealComprehensive/RealTriangularize decompose over ℝ. A conjugate-model column carries
      // COMPLEX ℚ(i) coefficients (independent z_j, z̄_j), so its "real solutions" are a DIFFERENT quantity than
      // the in-browser reim verdict (a complex triangularization, not the QD real count). Prepend a warning so a
      // pasted script can't be silently misread; the honest route is to reim-split (assume the base variables
      // real ⇒ real coefficients) BEFORE exporting for a real count. (Singular/Sage/Mathematica are complex
      // Gröbner cross-checks, so the warning is Maple-only.)
      if ((dialect || 'maple') === 'maple' && _columnHasComplexCoeffs(items)) {
        return '# WARNING: this system has COMPLEX (Q(i)) coefficients (the conjugate model). RealComprehensive-\n'
          + '# Triangularize decomposes over the REALS, so its "real solutions" are NOT the quadrature-domain\n'
          + '# count the app reports (that count is over the reim / assume-real system). Reim-split (assume the\n'
          + '# base variables real) BEFORE exporting for a real count, or read this as a complex triangularization.\n'
          + script;
      }
      return script;
    }
    // F5: does a column carry complex ℚ(i) coefficients (⇒ a conjugate-model system whose Maple RCTD "real
    // count" differs from the reim QD count)? Exposed so the UI can warn before a real-decomposition export.
    function _columnHasComplexCoeffs(items) {
      return (items || []).some((it) => (it.terms || []).some((t) => t.coeff && t.coeff.im && t.coeff.im[0] !== '0'));
    }
    function casColumnComplex(c) {
      const items = _columnItems(c == null ? maxColumn() : c);
      return _columnHasComplexCoeffs(items);
    }
    // External-CAS export of a single node → one (in)equation in `dialect`.
    function casNode(id, dialect) {
      const CAS = _getCAS(); const n = get(id); if (!CAS || !n) return '';
      return CAS.equationToCAS({ terms: n.poly.termList(), rel: n.rel }, dialect || 'maple');
    }
    // G11: a column's equality system → msolve `.ms` input text (over ℚ, with i a variable +
    // i²+1 when the coefficients are complex). Defaults to the current column. '' if empty / no CAS.
    function msolveColumn(c, opts) {
      const CAS = _getCAS(); if (!CAS) return '';
      const col = (c == null) ? maxColumn() : c;
      const items = _columnItems(col);
      if (!items.length) return '';
      return CAS.systemToMsolve(items, opts || {});
    }
    // The variable order msolve will report solutions in (matches systemToMsolve): the column's
    // unknowns then parameters, plus a trailing `i` when the system carries complex coefficients.
    function msolveVarOrder(c, opts) {
      const col = (c == null) ? maxColumn() : c;
      const items = _columnItems(col);
      const ps = new Set((opts && opts.params) || []);
      const set = new Set();
      for (const it of items) for (const t of it.terms) for (const v of Object.keys(t.mono || {})) set.add(v);
      const all = [...set].sort();
      const order = all.filter((v) => !ps.has(v)).concat(all.filter((v) => ps.has(v)));
      const needI = items.some((it) => it.terms.some((t) => t.coeff.im[0] !== '0'));
      if (needI) order.push('i');
      return order;
    }
    // G11: parse msolve's real-solution output back into solutions keyed by the column's variable
    // order. Display-only (numeric boxes, not polynomials) — returns CASExport.parseMsolveSolutions.
    function importMsolve(text, opts) {
      const CAS = _getCAS(); if (!CAS) return { ok: false, reason: 'QD.CASExport unavailable' };
      opts = opts || {};
      const vars = opts.vars || msolveVarOrder(opts.column, opts);
      return CAS.parseMsolveSolutions(text, { vars });
    }
    // D5 — progressive "show steps" for how a derived node was obtained from its input(s).
    // For the substitution-family reductions (substitute / assume-real / assume-imaginary /
    // fix-w0) the transformation is REPLAYED one variable at a time on the source equation, so
    // each step carries the running polynomial (a genuine intermediate, recomputed exactly via
    // QD.Sym) — the final step provably equals this node's polynomial. For engine reductions
    // (resultant / Gröbner / triangular / …) a full internal trace is intractable, so the steps
    // are an honest input(s) → method → output summary. Returns { ok, op, progressive, steps:[{
    // rule, poly }] }; the UI renders each `poly` as KaTeX. Seeded (input-less) nodes give a
    // single "original equation" step.
    function derivationSteps(id) {
      const S = getSym(), QC = getQC();
      const n = get(id);
      if (!n) return { ok: false, reason: 'no such node' };
      const prov = n.provenance || {};
      const op = prov.op || 'generate';
      const inputs = (prov.inputs || []).map(get).filter(Boolean);
      const steps = [];
      const push = (rule, poly) => steps.push({ rule, poly });
      if (!inputs.length) { push(n.label || 'original equation (seeded)', n.poly); return { ok: true, op, progressive: false, steps }; }
      const base = inputs[0];
      const replayHead = () => push('start — column ' + base.column + ' equation', base.poly);

      if (op === 'substitute' && Array.isArray(prov.variables)) {
        // substituteValues applies all pairs as ONE simultaneous subst (last-write-wins per key);
        // replay by accumulating the SAME map and re-substituting the ORIGINAL each step (not
        // sequentially on the running poly) so the final step equals the node EXACTLY even when a
        // variable and its conjugate are pinned independently in one call.
        replayHead(); const acc = {};
        for (const rec of prov.variables) {
          const g = _gaussFromRecord(rec.value); acc[rec.name] = S.mpolyConst(g);
          if (rec.conjugate) acc[rec.conjugate] = S.mpolyConst(g.conj());
          push('substitute ' + rec.name + ' = ' + _valShort(rec.value.approx) + (rec.conjugate ? ' (and ' + rec.conjugate + ')' : ''), base.poly.subst(acc));
        }
        return { ok: true, op, progressive: true, steps };
      }
      if (op === 'fix-w0' && prov.value) {
        replayHead(); const g = _gaussFromRecord(prov.value); const sub = { w0: S.mpolyConst(g) };
        if (QC && QC.conjVarName) { const c = QC.conjVarName('w0'); if (c !== 'w0') sub[c] = S.mpolyConst(g.conj()); }
        push('fix φ(0) = w0 = ' + _valShort(prov.value.approx), base.poly.subst(sub));
        return { ok: true, op, progressive: true, steps };
      }
      if ((op === 'assume-real' || op === 'assume-imaginary') && Array.isArray(prov.vars) && QC && QC.conjVarName) {
        replayHead(); let cur = base.poly;
        for (const v of prov.vars) {
          // Overlay-aware, matching the reduction site (assumeReal/assumeImaginary use _conjName): a DEFINED
          // symbol t's conjugate is tb (registered in substConj), invisible to the raw QC.conjVarName. Using
          // the raw table here made the replay fold NOTHING for a defined symbol, silently breaking this
          // function's "the final step provably equals this node's polynomial" contract. (Same class as #135.)
          const c = _conjName(v); if (c === v) continue;
          if (op === 'assume-real') { cur = cur.relabel((nm) => (nm === c ? v : nm)); push('assume ' + v + ' real (' + c + ' ≡ ' + v + ')', cur); }
          else { const sub = {}; sub[c] = S.mpolyVar(v).neg(); cur = cur.subst(sub); push('assume ' + v + ' imaginary (' + c + ' ≡ −' + v + ')', cur); }
        }
        return { ok: true, op, progressive: true, steps };
      }
      // engine reductions: input(s) → method → output summary (no fine-grained internal trace).
      // The per-op method line now lives in the PROV_STORE registry (defined near create()).
      const dm = PROV_STORE[op];
      const method = (dm && dm.method) ? dm.method(prov, n) : op;
      inputs.forEach((inp, k) => push('input ' + (k + 1) + (inputs.length > 1 ? '/' + inputs.length : '') + ' — column ' + inp.column, inp.poly));
      push(method + ' →', n.poly);
      return { ok: true, op, progressive: false, steps };
    }
    // ---- E4: reproducible SymPy derivation script for the ACTIVE branch ----
    // Conjugate of a value record { re:[n,d], im:[n,d] } (negate the imaginary part).
    function _conjRec(rec) {
      const im0 = rec.im[0];
      const negd = (im0 === '0') ? rec.im : [(im0[0] === '-' ? im0.slice(1) : '-' + im0), rec.im[1]];
      return { re: rec.re, im: negd };
    }
    // A SymPy substitution dict { sympyVar: sympyExpr } that REPRODUCES a substitution-family
    // reduction from the previous column (null for engine reductions that don't map to a subs).
    function _subsForRepro(prov) {
      const QC = getQC(), CAS = _getCAS(); if (!prov || !QC || !QC.conjVarName || !CAS) return null;
      const d = PROV_STORE[prov.op]; if (!d || !d.subs) return null;   // op → its .subs builder (registry)
      // Overlay-aware conjugate (see derivationSteps): a defined symbol's partner lives in substConj,
      // invisible to the raw QC.conjVarName — using it emitted an EMPTY SymPy subs dict for a
      // defined-symbol assume-real, so the "reproducible" transcript silently did not reproduce the step.
      const map = d.subs(prov, { cj: (v) => _conjName(v), CAS, conjRec: _conjRec });
      return (map && Object.keys(map).length) ? map : null;
    }
    // A terse, ASCII transition label for a column's representative provenance (store-side; the
    // UI's provText isn't available here).
    function _shortProv(p) {
      if (!p) return 'reduction';
      const d = PROV_STORE[p.op];                                   // op → its .short label (registry)
      return (d && d.short) ? d.short(p) : (p.op || 'reduction');
    }
    // Build a runnable SymPy script that reproduces the ACTIVE branch's derivation: declare the
    // symbols, define col0 as the original system (exact ℚ(i) literals), then for each later
    // column either RECOMPUTE it from the previous column (substitution-family steps, via .subs)
    // or give the exact stored result (engine reductions — Gröbner/resultant/… don't map to a
    // one-liner). Returns '' if QD.CASExport is unavailable or there is nothing to export.
    function sympyDerivation() {
      const CAS = _getCAS(); if (!CAS || !CAS.polyToSympy) return '';
      const at = activeTrackId;
      const cols = columns();                              // active-track columns, ascending
      if (!cols.length) return '';
      const symset = new Set();
      for (const n of nodes.values()) if ((n.track || 't0') === at) for (const v of nodeVars(n)) symset.add(v);
      const syms = [...symset].sort();
      if (!syms.length) return '';
      const asc = (s) => String(s).replace(/●/g, '(o)').replace(/★/g, '(*)').replace(/[^\x20-\x7E]/g, '').trim();
      const lbl = asc((tracks.find((t) => t.id === at) || {}).label || at);
      const litList = (cidx, name) => name + ' = [\n' +
        orderedColumn(cidx, at).map((n) => '    ' + CAS.polyToSympy(n.poly.termList()) + ',  # ' + asc(n.label)).join('\n') + '\n]';
      const L = [];
      L.push('# QD Algebra derivation -- branch "' + lbl + '"' + (formulation === 'schwarz' ? ' (Schwarz formulation)' : '') + ' -- reproducible SymPy transcript');
      L.push('# Substitution steps (assume real/imaginary, set values, fix phi(0), identify) are RECOMPUTED');
      L.push('# by SymPy from the previous column; engine reductions (Groebner / resultant / triangular /');
      L.push('# factor) are given as the exact stored result. colK = the system after step K+1.');
      L.push('from sympy import symbols, Rational, I, expand, groebner');
      L.push(syms.join(', ') + (syms.length === 1 ? ',' : '') + ' = symbols(\'' + syms.join(' ') + '\')');
      L.push(''); L.push('# Step 1 -- original system'); L.push(litList(cols[0].index, 'col0'));
      for (let i = 1; i < cols.length; i++) {
        const c = cols[i].index, prev = cols[i - 1].index;
        const ns = orderedColumn(c, at);
        const prov = (ns.find((n) => n.provenance && n.provenance.op !== 'conjugate') || ns[0] || {}).provenance;
        const subs = _subsForRepro(prov);
        L.push(''); L.push('# Step ' + (c + 1) + ' -- ' + asc(_shortProv(prov)));
        if (subs) {
          L.push('SUBS' + c + ' = {' + Object.keys(subs).map((k) => k + ': ' + subs[k]).join(', ') + '}');
          L.push('col' + c + ' = [q for q in (expand(p.subs(SUBS' + c + ')) for p in col' + prev + ') if q != 0]');
        } else {
          if (prov && prov.op) L.push('# (' + asc(prov.op) + ' -- engine reduction; the exact stored result)');
          L.push(litList(c, 'col' + c));
        }
      }
      return L.join('\n') + '\n';
    }
    // ---- RCTD import (the return trip for the Maple RealComprehensiveTriangularize export) ----
    // Land an external parametric-RCTD decomposition back into the workspace as a new column of
    // `op:'rctd'` nodes. `input` is either the parsed object from QD.CASExport.parseRCTD (with a
    // .cells array) or a bare cells array of the same shape: [{ index, realCount,
    // constraints:[{terms,rel}], chain:[{terms}] }]. Each cell contributes its parameter
    // CONSTRAINTS (rel-tagged: the region where the cell applies) and its regular-CHAIN
    // polynomials (equalities), every node tagged meta.cell (the cell index), meta.realCount (the
    // real-solution count Maple reported for that cell), and meta.role ('constraint'|'chain').
    // Polynomials are built from the term lists via QD.Sym.polyFromTermList; the whole import is
    // ONE undoable step. Lands at a new column (or column 0 if the graph is empty). Returns
    // { ok, created[], column, cellCount, cells:[{index, realCount}] } or { ok:false, reason }.
    function importRCTD(input, opts) {
      opts = opts || {};
      const S = getSym();
      const cells = Array.isArray(input) ? input : (input && input.cells);
      if (!Array.isArray(cells) || !cells.length) return { ok: false, reason: 'no RCTD cells to import', created: [] };
      // Build (and so validate) every polynomial BEFORE mutating — a malformed term list aborts
      // the whole import cleanly with nothing changed.
      const buf = [];
      try {
        cells.forEach((cell, ci) => {
          const index = (cell && cell.index != null) ? cell.index : ci + 1;
          const realCount = (cell && cell.realCount != null) ? cell.realCount : null;
          (cell.constraints || []).forEach((c, k) => {
            buf.push({ poly: S.polyFromTermList(c.terms || []), rel: (c.rel === '>' || c.rel === '≠') ? c.rel : '=',
              role: 'constraint', index, realCount,
              label: 'cell ' + index + ': constraint ' + (k + 1) + (c.rel && c.rel !== '=' ? ' (' + c.rel + ')' : '') });
          });
          (cell.chain || []).forEach((c, k) => {
            buf.push({ poly: S.polyFromTermList(c.terms || []), rel: '=', role: 'chain', index, realCount,
              label: 'cell ' + index + ': chain ' + (k + 1) });
          });
        });
      } catch (e) { return { ok: false, reason: (e && e.message) || String(e), created: [] }; }
      const live = buf.filter((b) => b.poly && !b.poly.isZero());
      if (!live.length) return { ok: false, reason: 'the RCTD cells contained no nonzero polynomials', created: [] };
      checkpoint();
      const col = (nodes.size === 0) ? 0 : maxColumn() + 1;
      const created = [];
      for (const b of live) {
        const node = addNode({
          id: nid(), kind: 'derived', poly: b.poly, rel: b.rel, label: b.label, model,
          provenance: { op: 'rctd', inputs: [], cell: b.index, role: b.role, realCount: b.realCount },
          column: col, meta: { cell: b.index, realCount: b.realCount, role: b.role },
        });
        created.push(node);
      }
      normalizeColumn(col);
      const summary = cells.map((cell, ci) => ({
        index: (cell && cell.index != null) ? cell.index : ci + 1,
        realCount: (cell && cell.realCount != null) ? cell.realCount : null,
      }));
      return { ok: true, created, column: col, cellCount: cells.length, cells: summary };
    }
    // A whole column → `{ lhs1 == 0, lhs2 > 0, … }` (Mathematica list ready for Solve /
    // GroebnerBasis). Thin caller over the shared formatter. '' for an empty column.
    function mathematicaColumn(c) { return casColumn(c, 'mathematica'); }
    // A single node → one Mathematica equation (`lhs == 0` / `> 0` / `!= 0`), or '' if absent.
    function mathematicaNode(id) { return casNode(id, 'mathematica'); }
    // Every column → a single paste-able block, each column commented with its column index
    // and a list assigned to a column-indexed symbol (col0, col1, …) for use in Mathematica.
    function mathematicaAll() {
      const blocks = [];
      for (let c = 0; c <= maxColumn(); c++) {
        const code = mathematicaColumn(c);
        if (code) blocks.push('(* column ' + c + (c === 0 ? ' — original' : '') + ' *)\ncol' + c + ' = ' + code + ';');
      }
      return blocks.join('\n\n');
    }

    // ---- factoring: split an equation by its factors (V(p)=⋃V(fᵢ)) ----
    // Pure query: attempt to factor a node's polynomial into the radical case factors.
    // Equalities only (f·g=0 ⟺ f=0 or g=0; an inequality f·g>0 does NOT split that way).
    // Returns Sym.factor's { ok, status, caps, factors:[MPoly], reason } — status ∈ reducible /
    // irreducible / undetermined, so a caller can tell a proof from a cap. The two refusals below
    // are 'undetermined' by construction: neither is a claim about the polynomial.
    function factorOf(id) {
      const S = getSym(), QE = getQE();
      const n = get(id);
      if (!n) return { ok: false, status: 'undetermined', caps: [{ code: 'no-node', detail: 'node not found' }], reason: 'node not found', factors: [] };
      if (n.rel !== '=') return { ok: false, status: 'undetermined', caps: [{ code: 'not-equality', detail: 'only an equality splits as V(p)=⋃V(fᵢ)' }], reason: 'only equality equations can be factored', factors: [] };
      return S.factor(n.poly, { ratApprox: QE && QE.ratApprox });
    }
    // Pursue ONE factor as a new candidate system: replace the factored equation with
    // factor k ("case fₖ = 0") in a new column; the rest of the current system is carried
    // forward unchanged. The other factors stay available (undo, then pick another). The
    // node must be an equality in the current system (last column). Returns the append
    // result (+ .factorCount, .factors). NB: V(original) = ⋃ₖ V(case k), so the existence
    // counts of the branches ADD (minus overlaps) to the original system's.
    function applyFactor(id, k) {
      const n = get(id);
      if (!n) return { ok: false, reason: 'node not found', created: [] };
      if (n.column !== maxColumn()) return { ok: false, reason: 'factor an equation in the current system (the last column)', created: [] };
      const fr = factorOf(id);
      if (!fr.ok) return { ok: false, reason: fr.reason || 'no nontrivial factorization', created: [] };
      const chosen = fr.factors[k];
      if (!chosen) return { ok: false, reason: 'no such factor index', created: [] };
      const cnt = fr.factors.length;
      const label = 'factor: case ' + (k + 1) + ' of ' + cnt;
      const res = _appendReduction((m) => ({
        poly: m.id === id ? chosen : m.poly,
        provenance: m.id === id
          ? { op: 'factor', inputs: [id], caseIndex: k, caseCount: cnt }
          : { op: 'factor', inputs: [m.id], carried: true }, label,
      }));
      if (res.ok) { res.factorCount = cnt; res.factors = fr.factors; }
      return res;
    }
    // Off-main-thread factor of a single node's polynomial (Q2) — the SAME S.factor the sync factorOf runs
    // (factor() ignores opts), so byte-identical; only WHERE it runs changes. Returns factorOf's shape.
    function factorNodeAsync(id, runOpts) {
      const S = getSym();
      const n = get(id);
      if (!n) return Promise.resolve({ ok: false, status: 'undetermined', caps: [{ code: 'no-node', detail: 'node not found' }], reason: 'node not found', factors: [] });
      if (n.rel !== '=') return Promise.resolve({ ok: false, status: 'undetermined', caps: [{ code: 'not-equality', detail: 'only an equality splits as V(p)=⋃V(fᵢ)' }], reason: 'only equality equations can be factored', factors: [] });
      const SW = symWorker();
      if (!SW) return Promise.resolve(factorOf(id));
      return SW.run('factor', { poly: n.poly.termList() }, runOpts || {}).then(
        (fr) => ({ ok: fr.ok, status: fr.status, caps: fr.caps, reason: fr.reason, factors: (fr.factors || []).map((tl) => S.polyFromTermList(tl)) }),
        (err) => (err && err.aborted) ? { ok: false, aborted: true, status: 'undetermined', caps: [], reason: 'cancelled', factors: [] }
          : { ok: false, status: 'undetermined', caps: [], reason: (err && err.message) || String(err), factors: [] });
    }
    // Off-main-thread applyFactor (Q2) — offloads S.factor, then picks factor k and appends the case column
    // on the main thread (cheap, via _appendReduction which checkpoints). Byte-identical to applyFactor.
    function applyFactorAsync(id, k, runOpts) {
      const n = get(id);
      if (!n) return Promise.resolve({ ok: false, reason: 'node not found', created: [] });
      if (n.column !== maxColumn()) return Promise.resolve({ ok: false, reason: 'factor an equation in the current system (the last column)', created: [] });
      return factorNodeAsync(id, runOpts).then((fr) => {
        if (!fr.ok) return { ok: false, aborted: !!fr.aborted, reason: fr.reason || 'no nontrivial factorization', created: [] };
        const chosen = fr.factors[k];
        if (!chosen) return { ok: false, reason: 'no such factor index', created: [] };
        const cnt = fr.factors.length;
        const label = 'factor: case ' + (k + 1) + ' of ' + cnt;
        const res = _appendReduction((m) => ({
          poly: m.id === id ? chosen : m.poly,
          provenance: m.id === id ? { op: 'factor', inputs: [id], caseIndex: k, caseCount: cnt } : { op: 'factor', inputs: [m.id], carried: true }, label,
        }));
        if (res.ok) { res.factorCount = cnt; res.factors = fr.factors; }
        return res;
      });
    }

    // Spurious-component detection: factor the current column's REAL (reim) equations — the
    // common cause of a positive-dimensional seeded system is a locator/gauge equation that
    // FACTORS (e.g. the locator factors through the pole pre-image z₁: eq = z₁·(…), splitting
    // the variety into {z₁=0} (the QD) ∪ {cofactor=0} (spurious)). opts.paramValues pins the
    // known data (so factoring sees concrete ℚ coefficients, like classify). For each split,
    // classify each factor: a degree-1 univariate factor c·v+d ⇒ a 'variable' suggestion to
    // PIN the BASE variable (the reim var X__re/X__im mapped back to X) at the root; anything
    // else ⇒ a 'general' factor (case-split via the node-level "Attempt to factor"). Returns
    // [{ index, label, factorCount, factors:[{ factorIndex, kind, text, reimVar?, pinVar?,
    // pinValue? }] }]. Pure/DOM-free. (saturate is deliberately NOT suggested — saturating by
    // z₁ would delete the z₁=0 QD component.)
    function spuriousFactors(ids, opts) {
      const S = getSym(), QE = getQE();
      const reim = currentReimSystem(ids, opts || {});
      const out = [];
      reim.polys.forEach((poly, i) => {
        let fr; try { fr = S.factor(poly, { ratApprox: QE && QE.ratApprox }); } catch (e) { return; }
        if (!fr.ok || !fr.factors || fr.factors.length < 2) return;
        const factors = fr.factors.map((f, k) => {
          const vs = [...f.vars()];
          if (vs.length === 1 && f.degreeIn(vs[0]) === 1) {        // c·v + d ⇒ candidate pin v = −d/c
            try {
              const cs = S.uniCoeffs(f, vs[0]);                    // [c0, c1] as Gaussians
              const root = cs[0].mul(S.gaussInt(-1)).div(cs[1]);
              const reimVar = vs[0], m = /^(.*)__(re|im)$/.exec(reimVar), base = m ? m[1] : reimVar;
              // A-06: the reim coordinate ranges over ℝ, so a factor with a NON-real root — e.g. the
              // ℚ(i) split of a real-irreducible v__re²+c into (v__re ∓ i) — has NO real solution and is
              // not a real pin (the old code dropped root.im, emitting a spurious v = 0 pin).
              // B-02: pinning the BASE complex variable forces BOTH of its real coordinates. That is
              // faithful to a single-coordinate factor ONLY when the OTHER coordinate is not an
              // independent unknown on this slice (i.e. base is real/imaginary here, so its other reim
              // coordinate is absent from the system). Otherwise a full-complex pin silently forces that
              // coordinate to 0 and can DROP quadrature domains — so demote to a general case-split
              // instead of surfacing an over-constraining pin. (Review QD-algebra-store-A-06 / B-02)
              const otherReim = m ? (base + '__' + (m[2] === 're' ? 'im' : 're')) : null;
              const overConstrains = otherReim ? reim.vars.indexOf(otherReim) !== -1 : false;
              if (root.im.isZero() && !overConstrains) {
                const rr = root.re.toNumber();                     // the reim var is real-valued on the slice
                const pinValue = (m && m[2] === 'im') ? { re: 0, im: rr } : { re: rr, im: 0 };
                return { factorIndex: k, kind: 'variable', text: f.toLatex(), reimVar, pinVar: base, pinValue };
              }
            } catch (e) { /* fall through to general */ }
          }
          return { factorIndex: k, kind: 'general', text: f.toLatex() };
        });
        out.push({ index: i, label: 'real eqn ' + (i + 1), factorCount: fr.factors.length, factors });
      });
      return out;
    }

    // Distinct variable names across all nodes (sorted) — for the UI variable pickers.
    function variables() {
      const s = new Set(); for (const n of nodes.values()) for (const v of nodeVars(n)) s.add(v); return [...s].sort();
    }
    // Distinct PRIMAL (non-barred) base variables — the candidates for "assume real".
    function baseVariables() {
      const s = new Set(); for (const v of variables()) s.add(_primalName(v)); return [...s].sort();
    }

    return {
      seedFromSystem, seedFromPolys, addConstraint, eliminate, eliminateAsync, eliminateWithGauge, groebner, groebnerAsync,
      dimension, dimensionAsync, solve, solveAsync, duplicate, deleteNode,
      substituteValue, substituteValues, reducePropagate, assumeReal, assumeImaginary, identifyVariables, applyConjugatePair, detectVariableRelations, generateConjugate, propagateNode, propagateAllConstraints, fixW0, defineSubstitution, defineSubstitutionAsync, detectSubstitutions, autoAbbreviate, addEquation, factorOf, applyFactor, factorNodeAsync, applyFactorAsync, spuriousFactors, triangularize: triangularizeNodes, triangularizeAsync, saturateMobius, saturateAsync,
      decomposeComponentsAsync, regularChainsAsync, applyComponent,
      currentReimSystem, classify, classifyAsync, resolventOf, resolventAsync, solveForVariable, reimVariables, solveReal, solveRealAsync, solveRealCertifiedSync, solveRealCertifiedAsync, parametricBifurcation, parametricBifurcationAsync, shapeFromMoments, shapeFromMomentsAsync, knownValues, currentColumnIds, maxColumn, columnStats, columns,
      sharedVars, previewCost, exportDAG, importDAG, mathematicaColumn, mathematicaNode, mathematicaAll, casColumn, casColumnComplex, casNode, msolveColumn, msolveVarOrder, importMsolve, derivationSteps, sympyDerivation, importRCTD, nodeStats, variables, baseVariables,
      // Overlay-aware conjugate lookup. Consults substConj (the "Define substitution" pairs QC's
      // raw table cannot know) before falling back to QC.conjVarName. Exposed so the elimination
      // lens finds a defined symbol's partner instead of computing conjOf: null for it.
      conjNameOf: _conjName,
      moveNode, orderOf: ordOf, orderedColumn,
      forkTrack, setActiveTrack, deleteTrack, tracks: tracksList,
      undo, redo, undoDepth, redoDepth, reset,
      list, get,
      get edges() { return edges; },
      get activeTrack() { return activeTrackId; },
      get model() { return model; },
      set model(m) { model = m; },
      get formulation() { return formulation; },
      get realVars() { return assumeOf().realVars.slice(); },
      get imagVars() { return assumeOf().imagVars.slice(); },
      get w0Fixed() { return assumeOf().w0Fixed; },
      get size() { return nodes.size; },
    };
  }

  // PROV_OPS: the store-side provenance-op registry; CAP_KEYS/capOpts: the worker cap
  // whitelist + filter (all exposed static — testable + shared, no create() instance needed).
  const AlgebraStore = { create, PROV_OPS: PROV_STORE, CAP_KEYS: _CAP_KEYS, capOpts: _capOpts };

  const QD = _QD;
  QD.AlgebraStore = AlgebraStore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
