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
// Provenance-op contract: every reduction writes provenance.op ∈ { generate, conjugate,
// resultant, groebner, constraint, duplicate, substitute, linear-reduce, assume-real,
// fix-w0, triangular, factor }. The UI's provText + columnLabel (algebra-ui.js) switch on
// exactly these strings — ADD A NEW OP IN BOTH PLACES or it renders as a bare "column N".
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
    function _primalName(name) { const QC = getQC(); return (QC && QC.conjVarName && _BARRED_RE.test(name)) ? QC.conjVarName(name) : name; }
    function _realityRename() {
      const realVars = assumeOf().realVars;
      if (!realVars.length) return null;
      const QC = getQC(); if (!QC || !QC.conjVarName) return null;
      const map = {};
      for (const rv of realVars) { const c = QC.conjVarName(rv); if (c !== rv) map[c] = rv; }
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
      for (const iv of imagVars) { const c = QC.conjVarName(iv); if (c !== iv) sub[c] = S.mpolyVar(iv).neg(); }
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
        trackAssume: serializeAssume(),
        tracks: tracks.map((t) => ({ id: t.id, label: t.label, parentId: t.parentId, forkColumn: t.forkColumn })), activeTrackId, trackSeq };
    }
    function restore(s) {
      nodes.clear(); for (const [k, v] of s.nodes) nodes.set(k, v);
      edges = s.edges.slice(); order = new Map(s.order || []); model = s.model; formulation = s.formulation || 'classical'; seq = s.seq;
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
      const conj = _applyAssumed(QC.conjMPoly(node.poly));   // reality/imaginary fold barred names post-conjugation; fixed w₀ stays substituted
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
            const c = QC.conjVarName(p.varName);
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
      for (const rv of prim) { const c = QC.conjVarName(rv); if (c !== rv) map[c] = rv; }
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
      for (const iv of prim) { const c = QC.conjVarName(iv); if (c !== iv) sub[c] = S.mpolyVar(iv).neg(); }
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
        const dc = QC.conjVarName(drop), kc = QC.conjVarName(keep);
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
      const vc = QC.conjVarName(v), oc = QC.conjVarName(other);
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
    function _eliminate(idA, idB, varName) {
      const S = getSym();
      const a = get(idA), b = get(idB);
      if (!a || !b) return { ok: false, reason: 'node not found' };
      if ((a.track || 't0') !== (b.track || 't0')) return { ok: false, reason: 'select nodes from one branch' };
      if (!a.poly.vars().has(varName) || !b.poly.vars().has(varName)) {
        return { ok: false, reason: 'variable ' + varName + ' is not shared by both equations' };
      }
      let res;
      try { res = S.resultant(a.poly, b.poly, varName); }
      catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
      if (res.isZero()) return { ok: false, reason: 'resultant ≡ 0 (the equations share a component); pick a different pair or variable' };
      const node = addNode({
        id: nid(), kind: 'derived', poly: res, rel: '=',
        label: 'elim ' + varName + ' (' + a.id + ',' + b.id + ')', model,
        provenance: { op: 'resultant', inputs: [idA, idB], variable: varName },
        column: Math.max(a.column, b.column) + 1, track: a.track || 't0', meta: {},
      });
      edges.push({ from: idA, to: node.id }, { from: idB, to: node.id });
      return { ok: true, node };
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

    // QD.SymWorker handle (off-main-thread runner), or null if unavailable.
    function symWorker() {
      const Q = (typeof window !== 'undefined' && window.QD) || (typeof global !== 'undefined' && global.QD) || (typeof QD !== 'undefined' && QD);
      return (Q && Q.SymWorker) || null;
    }
    // Keep only the structured-clone-safe numeric caps for the worker payload
    // (drop functions like rootFinder/onProgress, which can't be postMessage'd).
    // The structured-clone-safe numeric caps forwarded to the worker. A9: keep this in
    // sync with the numeric opts the sym-core ops accept (NON-serializable opts like
    // rootFinder/onProgress/order1/paramValues are intentionally dropped — they can't be
    // postMessage'd; the worker uses its own defaults). The unit test asserts coverage.
    const _CAP_KEYS = ['maxBasis', 'maxSteps', 'maxDegree', 'maxTerms', 'maxEigenDim', 'maxHermiteDim', 'maxRounds', 'reduced', 'keepEliminated'];
    function _capOpts(opts) {
      const out = {};
      for (const k of _CAP_KEYS) if (opts && opts[k] != null) out[k] = opts[k];
      return out;
    }

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
        return { ok: true, zeroDim, dimension: dim, numVars: vars.length, vars };
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
        (res) => ({ ok: true, zeroDim: res.zeroDim, dimension: res.zeroDim ? res.dimension : Infinity, numVars: res.numVars, vars }),
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

    // Core reim transform on a given poly list (see currentReimSystem).
    function _reimTransform(polys, realVars) {
      const S = getSym();
      const realSet = new Set(realVars || assumeOf().realVars);
      const I = S.mpolyConst(S.gaussInt(0, 1));
      const allVars = new Set();
      for (const p of polys) for (const v of p.vars()) allVars.add(v);
      const sub = {};
      for (const v of allVars) {
        const prim = _primalName(v);
        const xn = prim + '__re', yn = prim + '__im';
        if (realSet.has(prim)) { sub[v] = S.mpolyVar(xn); }       // assumed real ⇒ x only
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
      return _reimTransform(polys, assumeOf(track).realVars);
    }

    // Existence / uniqueness verdict for the current system, computed on the REAL (reim)
    // system: inconsistency (1 ∈ I ⇒ no QD), zero/positive dimension, the number of REAL
    // solutions (= actual QDs, via the Hermite trace form) and the number of distinct
    // complex solutions / the multiplicity. opts.paramValues pins the known data. Returns
    // { ok, inconsistent, zeroDim, realCount, complexCount, multiplicity, numVars, reason }.
    // If the analyzed column is one CASE of a factor split (applyFactor), its counts are
    // for that branch only — V(original) = ⋃ₖ V(caseₖ), so branch counts ADD. Detect it so
    // the verdict can say so. Returns { partialBranch, caseIndex, caseCount } or {}.
    function _factorBranchInfo(ids) {
      const ns = (ids && ids.length) ? ids.map(get).filter(Boolean) : lastColumnNodes();
      const f = ns.find((n) => n.provenance && n.provenance.op === 'factor' && !n.provenance.carried);
      return f ? { partialBranch: true, caseIndex: f.provenance.caseIndex, caseCount: f.provenance.caseCount } : {};
    }
    function classify(ids, opts) {
      return Object.assign(_classifyImpl(ids, opts), _factorBranchInfo(ids));
    }
    function _classifyImpl(ids, opts) {
      const S = getSym();
      const reim = currentReimSystem(ids, opts);
      if (!reim.polys.length) return { ok: false, reason: 'no equality nodes to analyze' };
      try {
        const ord = S.monomialOrder('grevlex', reim.vars);
        const G = S.buchberger(reim.polys, ord);
        if (G.length === 1 && G[0].vars().size === 0 && !G[0].isZero()) {
          return { ok: true, inconsistent: true, zeroDim: true, realCount: 0, complexCount: 0, multiplicity: 0, numVars: reim.vars.length };
        }
        const zeroDim = S.isZeroDimensional(G, ord, reim.vars);
        if (!zeroDim) return { ok: true, inconsistent: false, zeroDim: false, realCount: null, complexCount: null, multiplicity: null, numVars: reim.vars.length };
        const multiplicity = S.quotientDimension(G, ord, reim.vars);
        const rc = S.realSolutionCount({ G, order: ord }, null, reim.vars);
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
      const reim = currentReimSystem(ids, opts);
      if (!reim.polys.length) return Promise.resolve(Object.assign({ ok: false, reason: 'no equality nodes to analyze' }, branch));
      const SW = symWorker();
      if (!SW) return Promise.resolve(classify(ids, opts));
      const payload = { polys: reim.polys.map((p) => p.termList()), vars: reim.vars, opts: _capOpts(opts) };
      return SW.run('classify', payload, runOpts || {}).then(
        (res) => Object.assign(res, branch),
        (err) => Object.assign((err && err.aborted) ? { ok: false, aborted: true, reason: 'cancelled' }
          : { ok: false, reason: (err && err.message) || String(err) }, branch));
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
    function resolventOf(ids, varName, opts) {
      const S = getSym();
      const reim = currentReimSystem(ids, opts);
      if (!reim.polys.length) return { ok: false, reason: 'no equality nodes to analyze' };
      let v = varName;
      if (reim.vars.indexOf(v) === -1) {                       // resolve a base name → its real part
        if (reim.vars.indexOf(v + '__re') !== -1) v = v + '__re';
        else return { ok: false, reason: 'variable "' + varName + '" is not a real variable of the current system' };
      }
      let r; try { r = S.resolvent(reim.polys, v, reim.vars, {}); }
      catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
      if (!r.ok) return { ok: false, reason: r.reason };
      return {
        ok: true, variable: v,
        latex: r.poly.toLatex(), squareFreeLatex: r.squareFree.toLatex(),
        degree: r.degree, distinct: r.distinctDegree, multiplicity: r.dimension,
        degenerate: r.degenerate, discLatex: r.discriminant ? r.discriminant.toLatex() : null,
      };
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

    // Numeric solutions of the selected (or all) equality nodes via the shape-lemma
    // solver (grevlex GB → FGLM to lex → univariate Durand–Kerner + back-substitution).
    // Returns Sym.solveZeroDim's result: { ok, solutions:[{var:{re,im}}], dimension, … }
    // or { ok:false, reason } (not zero-dim / not in shape position / no convergence →
    // route to the CAS bridge).
    function solve(ids, opts) {
      const S = getSym();
      opts = opts || {};
      const polys = _eqPolys(ids);
      if (polys.length < 1) return { ok: false, reason: 'no equality nodes to solve' };
      const vars = opts.vars || _varsOf(polys);
      const rootFinder = opts.rootFinder || defaultRootFinder();
      try { return S.solveZeroDim(polys, Object.assign({}, opts, { vars, rootFinder })); }
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
      const payload = { polys: polys.map((p) => p.termList()), vars, solveVar: opts.solveVar, opts: _capOpts(opts) };
      return SW.run('solveZeroDim', payload, runOpts || {}).then(
        (res) => res,
        (err) => (err && err.aborted) ? { ok: false, aborted: true, reason: 'cancelled' }
          : { ok: false, reason: (err && err.message) || String(err) });
    }

    // Triangular decomposition (Wu pseudo-elimination) of the current system (or a
    // selection) → a triangular chain appended as a new column. An ALTERNATIVE to the
    // Gröbner eliminate path that exhibits solution structure: a contradiction ⇒ a 1=0
    // marker (no solution); free variables ⇒ a positive-dimensional family (reported).
    // Returns { ok, created[], column, contradiction, mainVars, freeVars } or { ok:false, reason }.
    function triangularizeNodes(ids, opts) {
      const S = getSym();
      const inputs = ((ids && ids.length) ? ids.map(get) : lastColumnNodes()).filter(Boolean).filter((n) => n.rel === '=');
      if (inputs.length < 1) return { ok: false, reason: 'no equality nodes to triangularize', created: [] };
      const polys = inputs.map((n) => n.poly);
      const vars = _varsOf(polys);
      const res = S.triangularize(polys, vars, opts || {});
      if (!res.ok) return { ok: false, reason: res.reason, created: [] };
      const inputIds = inputs.map((n) => n.id);
      checkpoint();
      const col = maxColumn() + 1;
      const created = [];
      const emit = (poly, label, meta) => {
        const node = addNode({ id: nid(), kind: 'derived', poly, rel: '=', label, model,
          provenance: { op: 'triangular', inputs: inputIds.slice(), contradiction: !!res.contradiction, freeVars: (res.freeVars || []).slice() }, column: col, meta: meta || {} });
        for (const id of inputIds) edges.push({ from: id, to: node.id });
        created.push(node);
      };
      if (res.contradiction) {
        emit(S.mpolyConst(S.gauss(S.rat(1n, 1n), S.rat(0n, 1n))), 'triangular: inconsistent (no solution)', { inconsistent: true });
      } else {
        res.chain.forEach((g, i) => emit(g, 'triangular ' + (i + 1) + '/' + res.chain.length + ' (main ' + res.mainVars[i] + ')', { mainVar: res.mainVars[i] }));
      }
      normalizeColumn(col);
      return { ok: true, created, column: col, contradiction: !!res.contradiction, mainVars: res.mainVars || [], freeVars: res.freeVars || [] };
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
        ? _applyW0(QC.conjMPoly(node.poly))
        : _applyAssumed(QC.conjMPoly(node.poly));
      if (node.poly.sub(conj).isZero() || node.poly.add(conj).isZero())
        return { ok: false, reason: 'this equation is self-conjugate — its conjugate is the same equation' };
      for (const m of nodes.values()) if (m.column === node.column && m.poly.equals(conj))
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
        if (QC && QC.conjVarName) { const c = QC.conjVarName(name); if (c !== name) sub[c] = S.mpolyConst(g.conj()); }
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
        const conj = _applyReality(_applyW0(QC.conjMPoly(n.poly)));
        selfConj = n.poly.sub(conj).isZero() || n.poly.add(conj).isZero();
        if (!selfConj) for (const m of nodes.values()) if (m.id !== n.id && m.poly.equals(conj)) { hasCompanion = true; break; }
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
        nodes.set(nd.id, {
          id: nd.id, kind: nd.kind || 'derived', poly, rel: nd.rel || '=', label: nd.label || nd.id,
          model, provenance: nd.provenance, column: nd.column || 0, track: nd.track || 't0', meta: nd.meta,
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
      return CAS.systemToCAS(items, dialect || 'maple', opts || {});
    }
    // External-CAS export of a single node → one (in)equation in `dialect`.
    function casNode(id, dialect) {
      const CAS = _getCAS(); const n = get(id); if (!CAS || !n) return '';
      return CAS.equationToCAS({ terms: n.poly.termList(), rel: n.rel }, dialect || 'maple');
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
      const cj = (v) => QC.conjVarName(v);
      const map = {};
      switch (prov.op) {
        case 'assume-real':
          for (const v of (prov.vars || [])) { const c = cj(v); if (c !== v) map[c] = v; }
          break;
        case 'assume-imaginary':
          for (const v of (prov.vars || [])) { const c = cj(v); if (c !== v) map[c] = '-' + v; }
          break;
        case 'substitute':
          for (const rec of (prov.variables || [])) {
            if (!rec || !rec.name || !rec.value || !rec.value.re) return null;
            map[rec.name] = CAS.sympyValue(rec.value);
            const c = rec.conjugate || (cj(rec.name) !== rec.name ? cj(rec.name) : null);
            if (c) map[c] = CAS.sympyValue(_conjRec(rec.value));
          }
          break;
        case 'fix-w0':
          if (!prov.value || !prov.value.re) return null;
          map.w0 = CAS.sympyValue(prov.value); map.wb0 = CAS.sympyValue(_conjRec(prov.value));
          break;
        case 'identify': {
          if (!prov.ratio || !prov.ratio.re || !prov.drop || !prov.keep) return null;
          map[prov.drop] = '(' + CAS.sympyValue(prov.ratio) + ')*' + prov.keep;
          const cd = cj(prov.drop), ck = cj(prov.keep);
          if (cd !== prov.drop) map[cd] = '(' + CAS.sympyValue(_conjRec(prov.ratio)) + ')*' + ck;
          break;
        }
        case 'identify-conj': {
          if (!prov.ratio || !prov.ratio.re || !prov.var || !prov.other) return null;
          map[prov.var] = '(' + CAS.sympyValue(prov.ratio) + ')*' + cj(prov.other);
          const cv = cj(prov.var);
          if (cv !== prov.var) map[cv] = '(' + CAS.sympyValue(_conjRec(prov.ratio)) + ')*' + prov.other;
          break;
        }
        default: return null;
      }
      return Object.keys(map).length ? map : null;
    }
    // A terse, ASCII transition label for a column's representative provenance (store-side; the
    // UI's provText isn't available here).
    function _shortProv(p) {
      if (!p) return 'reduction';
      switch (p.op) {
        case 'generate': return 'original system';
        case 'assume-real': return 'assume real: ' + (p.vars || []).join(', ');
        case 'assume-imaginary': return 'assume imaginary: ' + (p.vars || []).join(', ');
        case 'substitute': return 'set ' + (p.variables || []).map((r) => r.name).join(', ');
        case 'fix-w0': return 'fix phi(0)';
        case 'identify': return 'identify ' + p.drop + ' = ' + p.keep;
        case 'identify-conj': return 'identify ' + p.var + ' = conj(' + p.other + ')';
        case 'linear-reduce': return 'linear propagation';
        case 'resultant': return 'eliminate ' + p.variable;
        case 'groebner': return 'Groebner (' + (p.order || 'grevlex') + ')';
        case 'triangular': return 'triangular decomposition';
        case 'factor': return 'factor case';
        case 'rctd': return 'RCTD cell';
        case 'propagate': return 'propagate constraint';
        default: return p.op || 'reduction';
      }
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
    // Returns { ok, factors:[MPoly], reason }.
    function factorOf(id) {
      const S = getSym(), QE = getQE();
      const n = get(id);
      if (!n) return { ok: false, reason: 'node not found', factors: [] };
      if (n.rel !== '=') return { ok: false, reason: 'only equality equations can be factored', factors: [] };
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
          if (vs.length === 1 && f.degreeIn(vs[0]) === 1) {        // c·v + d ⇒ pin v = −d/c
            try {
              const cs = S.uniCoeffs(f, vs[0]);                    // [c0, c1] as Gaussians
              const root = cs[0].mul(S.gaussInt(-1)).div(cs[1]);
              const reimVar = vs[0], m = /^(.*)__(re|im)$/.exec(reimVar), base = m ? m[1] : reimVar;
              const rr = root.re.toNumber();                       // the reim var is real-valued on the slice
              const pinValue = (m && m[2] === 'im') ? { re: 0, im: rr } : { re: rr, im: 0 };
              return { factorIndex: k, kind: 'variable', text: f.toLatex(), reimVar, pinVar: base, pinValue };
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
      seedFromSystem, addConstraint, eliminate, eliminateWithGauge, groebner, groebnerAsync,
      dimension, dimensionAsync, solve, solveAsync, duplicate, deleteNode,
      substituteValue, substituteValues, reducePropagate, assumeReal, assumeImaginary, identifyVariables, applyConjugatePair, detectVariableRelations, generateConjugate, propagateNode, propagateAllConstraints, fixW0, factorOf, applyFactor, spuriousFactors, triangularize: triangularizeNodes,
      currentReimSystem, classify, classifyAsync, resolventOf, solveForVariable, reimVariables, solveReal, solveRealAsync, knownValues, currentColumnIds, maxColumn, columnStats, columns,
      sharedVars, previewCost, exportDAG, importDAG, mathematicaColumn, mathematicaNode, mathematicaAll, casColumn, casNode, sympyDerivation, importRCTD, nodeStats, variables, baseVariables,
      moveNode, orderOf: ordOf, orderedColumn,
      forkTrack, setActiveTrack, deleteTrack, tracks: tracksList,
      undo, redo, reset,
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

  const AlgebraStore = { create };

  const QD = (typeof window !== 'undefined' && window.QD)
    ? window.QD
    : (typeof module !== 'undefined' && module.exports ? module.exports : (global.QD || (global.QD = {})));
  QD.AlgebraStore = AlgebraStore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
