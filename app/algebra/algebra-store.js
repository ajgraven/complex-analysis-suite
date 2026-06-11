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
//   model    -- 'conjugate' | 'reim'
//   realVars -- base (primal) variables asserted REAL (z̄ⱼ≡zⱼ, …); substituted into
//               every seeded equation and every later constraint/conjugate companion.
//   w0Fixed  -- the fixed Riemann-map center φ(0)=w₀ ({re:[n,d], im:[n,d]} BigInt
//               strings) when the seed system was generated with {w0}; substituted
//               into any later constraint that rebuilds φ with the w₀ symbol.
//
// Ops: seedFromSystem (●/★/gauge from generateClassicalBounded → the ORIGINAL system
// at column 0; + conjugate companions), addConstraint (the four univalence forms).
// AUDIT-TRAIL reductions — each appends a new labeled column, leaving column 0 intact:
// substituteValue / substituteValues (fix one / several variables' values in one column,
// exact ℚ(i), each value ALSO fixes the variable's conjugate, auto-propagating by default),
// reducePropagate (linear-substitution fixpoint via Sym.linearReduce), assumeReal
// (identify v̄≡v), fixW0 (φ(0)=w₀ → value), eliminate / eliminateWithGauge (Sylvester
// resultant), groebner / groebnerAsync, triangularize (Wu pseudo-elimination → a chain
// column). Analysis (default to the CURRENT system = the last column via
// currentColumnIds): dimension / dimensionAsync, solve / solveAsync; classify (existence/
// uniqueness — # REAL solutions = # quadrature domains, via currentReimSystem + the
// Hermite trace form, known parameters pinned) and solveReal (explicit real solutions);
// columnStats / columns (per-lane eqn/var counts for the UI headers). seedFromSystem takes
// opts.bakeAssumptions (the compact path that bakes realVars at column 0 for the autosolve).
// Plus duplicate, deleteNode (cascade), moveNode (reorder within a column), undo/redo
// (snapshot stack), nodeStats, variables/baseVariables, exportDAG.
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

  function create() {
    let seq = 0;
    const nodes = new Map();      // id -> node
    let edges = [];               // { from, to }
    let order = new Map();        // id -> display order WITHIN its column (small = top)
    const undoStack = [];         // snapshots (most recent last)
    const redoStack = [];
    let model = 'conjugate';
    let realVars = [];            // base (primal) variables ASSERTED REAL (z̄ⱼ ≡ zⱼ, …)
    let w0Fixed = null;           // φ(0) fixed: { re:[n,d], im:[n,d] } (BigInt strings) or null

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
      if (!realVars.length) return null;
      const QC = getQC(); if (!QC || !QC.conjVarName) return null;
      const map = {};
      for (const rv of realVars) { const c = QC.conjVarName(rv); if (c !== rv) map[c] = rv; }
      if (!Object.keys(map).length) return null;
      return (n) => (Object.prototype.hasOwnProperty.call(map, n) ? map[n] : n);
    }
    function _applyReality(poly) { const r = _realityRename(); return r ? poly.relabel(r) : poly; }

    // --- fixed φ(0): substitute the seed system's w₀ value into later polys -----
    // When the seed system was generated with a FIXED Riemann-map center (system
    // .w0Fixed from generateClassicalBounded(…, {w0}) — the UI defaults it to the
    // centroid of the poles), the seeded equations already lack w₀/w̄₀. But the
    // univalence CONSTRAINTS rebuild φ from scratch with the w₀ symbol (e.g. the
    // star form's φ − w₀), so the same exact value must be substituted into every
    // constraint poly for the workspace to stay on one normalization.
    function _applyW0(poly) {
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
      return { nodes: new Map([...nodes].map(([k, v]) => [k, v])), edges: edges.slice(), order: new Map(order), model, seq, realVars: realVars.slice(), w0Fixed };
    }
    function restore(s) {
      nodes.clear(); for (const [k, v] of s.nodes) nodes.set(k, v);
      edges = s.edges.slice(); order = new Map(s.order || []); model = s.model; seq = s.seq; realVars = (s.realVars || []).slice(); w0Fixed = s.w0Fixed || null;
    }
    function checkpoint() { undoStack.push(snapshot()); redoStack.length = 0; }
    function undo() { if (!undoStack.length) return false; redoStack.push(snapshot()); restore(undoStack.pop()); return true; }
    function redo() { if (!redoStack.length) return false; undoStack.push(snapshot()); restore(redoStack.pop()); return true; }

    function addNode(n) {
      nodes.set(n.id, n);
      if (!order.has(n.id)) {                 // append to the bottom of its column by default
        let mx = -1;
        for (const m of nodes.values()) if (m.id !== n.id && m.column === n.column) mx = Math.max(mx, ordOf(m.id));
        order.set(n.id, mx + 1);
      }
      return n;
    }
    function list() { return [...nodes.values()]; }
    function get(id) { return nodes.get(id); }
    // Clear the graph itself (nodes/edges/order/ids) but KEEP the seeded normalization
    // (model/realVars/w0Fixed) and the undo history. seedFromSystem uses this after a
    // checkpoint so re-seeding is undoable. The public reset() is the full wipe.
    function clearGraph() { nodes.clear(); edges = []; order = new Map(); seq = 0; }
    // FULL reset — also drops the undo/redo history and the normalization state. For
    // tearing the store down (tests / a fresh start), NOT for re-seeding.
    function reset() { clearGraph(); model = 'conjugate'; realVars = []; w0Fixed = null; undoStack.length = 0; redoStack.length = 0; }

    // --- display order within a column ---------------------------------------
    // Cards are laid out top-to-bottom by `order` (then id, for stability).
    // Fractional orders are used transiently (a conjugate companion is inserted
    // at primal+0.5) and then integerized by normalizeColumn so up/down swaps stay
    // simple. orderOf falls back to +∞ so an un-ordered node sinks to the bottom.
    function ordOf(id) { return order.has(id) ? order.get(id) : Number.POSITIVE_INFINITY; }
    function colNodes(c) { return list().filter((n) => n.column === c); }
    function orderedColumn(c) {
      return colNodes(c).sort((a, b) => (ordOf(a.id) - ordOf(b.id)) || a.id.localeCompare(b.id));
    }
    function normalizeColumn(c) { orderedColumn(c).forEach((n, i) => order.set(n.id, i)); }

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
      const conj = _applyReality(_applyW0(QC.conjMPoly(node.poly)));   // reality folds barred→primal post-conjugation; fixed w₀ stays substituted
      if (node.poly.sub(conj).isZero() || node.poly.add(conj).isZero()) return null;   // self-conjugate (incl. under reality)
      for (const m of nodes.values()) if (m.poly.equals(conj)) return null;            // already present
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
      realVars = (bake && opts.realVars !== undefined) ? (opts.realVars || []).map(_primalName) : [];
      w0Fixed = system.w0Fixed || null;   // remember the fixed φ(0) for later constraints
      const primals = [];
      for (const block of ['locator', 'star', 'gauge']) {
        for (const item of system.blocks[block]) {
          const poly = _applyReality(_applyW0(item.eq));
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
        const poly = _applyReality(_applyW0(d.poly));
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
    function maxColumn() { let mx = 0; for (const n of nodes.values()) mx = Math.max(mx, n.column || 0); return mx; }
    function lastColumnNodes() { return orderedColumn(maxColumn()); }
    // The equality-node ids of the current system (the last column) — the default
    // input to dimension/solve/groebner so those operate on the reduced system, not
    // a mix of every column. Falls back to ALL equality nodes if there is one column.
    function currentColumnIds() { return lastColumnNodes().filter((n) => n.rel === '=').map((n) => n.id); }
    // Per-column size: equation-node count + the number of distinct variables across the
    // column (the union of each node's vars). Drives the column-header stats + Δ display.
    function columnStats(c) {
      const ns = colNodes(c);
      const vars = new Set();
      let eqCount = 0;
      for (const n of ns) { if (n.rel === '=') eqCount++; for (const v of n.poly.vars()) vars.add(v); }
      return { eqCount, varCount: vars.size, nodeCount: ns.length };
    }
    // Ordered list of the columns present, each with its stats — for the UI lane headers.
    function columns() {
      const cs = new Set(); for (const n of nodes.values()) cs.add(n.column || 0);
      return [...cs].sort((a, b) => a - b).map((c) => Object.assign({ index: c }, columnStats(c)));
    }

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
        if (seen.some((p) => p.equals(spec.poly))) continue;     // dedup nodes that collapsed together
        seen.push(spec.poly);
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
      if (!lastColumnNodes().some((n) => { const vs = n.poly.vars(); return subVars.some((v) => vs.has(v)); })) {
        return { ok: false, reason: 'none of ' + pairs.map((p) => p.varName).join(', ') + ' are in the current system', created: [] };
      }
      const label = 'set ' + recs.map((r) => r.name + ' = ' + _valShort(r.value.approx)).join(', ');
      const res = _appendReduction((n) => ({
        poly: subVars.some((v) => n.poly.vars().has(v)) ? n.poly.subst(sub) : n.poly,
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
      const prov = { op: 'linear-reduce', inputs: eqs.map((n) => n.id), eliminated: elimNames.slice() };
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
      if (res.ok) realVars = [...new Set([...realVars, ...prim])];
      return res;
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
      if (res.ok) w0Fixed = record;
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
        column: Math.max(a.column, b.column) + 1, meta: {},
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
      const s = new Set(); for (const p of polys) for (const v of p.vars()) s.add(v); return [...s].sort();
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
    function _reimTransform(polys) {
      const S = getSym();
      const realSet = new Set(realVars);
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
      const polys = _applyParamValues(inputs.map((n) => n.poly), opts.paramValues);
      return _reimTransform(polys);
    }

    // Existence / uniqueness verdict for the current system, computed on the REAL (reim)
    // system: inconsistency (1 ∈ I ⇒ no QD), zero/positive dimension, the number of REAL
    // solutions (= actual QDs, via the Hermite trace form) and the number of distinct
    // complex solutions / the multiplicity. opts.paramValues pins the known data. Returns
    // { ok, inconsistent, zeroDim, realCount, complexCount, multiplicity, numVars, reason }.
    function classify(ids, opts) {
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
    function exportDAG() {
      return {
        model,
        w0Fixed,
        nodes: list().map((n) => ({
          id: n.id, kind: n.kind, label: n.label, rel: n.rel, column: n.column,
          provenance: n.provenance, terms: n.poly.termList(),
        })),
        edges: edges.slice(),
      };
    }

    // ---- Mathematica export (one column → a copy-paste list of equations) ----
    // Variable names are sanitized for Wolfram-Language symbols: `_` is Blank in
    // Mathematica, so A1_1 → A1$1 ($ is a legal symbol character). Coefficients are
    // exact ℚ(i) rationals; the imaginary unit is `I`.
    function _mmaName(name) { return name.replace(/_/g, '$'); }
    function _mmaRat(p) { return p[1] === '1' ? p[0] : p[0] + '/' + p[1]; }
    // a + b·I as a Mathematica expression, eliding zero / unit parts.
    function _mmaCoeff(re, im) {
      const reZero = re[0] === '0', imZero = im[0] === '0';
      if (imZero) return _mmaRat(re);
      const imNeg = im[0][0] === '-';
      const imAbsRat = _mmaRat([imNeg ? im[0].slice(1) : im[0], im[1]]);
      const imBody = imAbsRat === '1' ? 'I' : imAbsRat + '*I';
      if (reZero) return (imNeg ? '-' : '') + imBody;
      return '(' + _mmaRat(re) + (imNeg ? ' - ' : ' + ') + imBody + ')';
    }
    // One polynomial → a Mathematica InputForm string (sum of coeff·monomial terms).
    function _polyToMathematica(poly) {
      const terms = poly.termList();
      if (!terms.length) return '0';
      const parts = terms.map((t) => {
        const c = _mmaCoeff(t.coeff.re, t.coeff.im);
        const mono = Object.keys(t.mono).sort().map((nm) => {
          const e = t.mono[nm], b = _mmaName(nm); return e === 1 ? b : b + '^' + e;
        }).join('*');
        if (!mono) return c;
        if (c === '1') return mono;
        if (c === '-1') return '-' + mono;
        return c + '*' + mono;
      });
      return parts.join(' + ').replace(/\+ -/g, '- ');
    }
    // A whole column → `{ lhs1 == 0, lhs2 > 0, … }` (the equality/inequality list ready
    // to paste into Mathematica / Solve / GroebnerBasis). Returns '' for an empty column.
    function mathematicaColumn(c) {
      const ns = orderedColumn(c);
      if (!ns.length) return '';
      const lines = ns.map((n) => {
        const rel = n.rel === '>' ? ' > 0' : n.rel === '≠' ? ' != 0' : ' == 0';
        return _polyToMathematica(n.poly) + rel;
      });
      return '{' + lines.join(',\n ') + '}';
    }
    // A single node → one Mathematica equation (`lhs == 0` / `> 0` / `!= 0`), or '' if absent.
    function mathematicaNode(id) {
      const n = get(id); if (!n) return '';
      const rel = n.rel === '>' ? ' > 0' : n.rel === '≠' ? ' != 0' : ' == 0';
      return _polyToMathematica(n.poly) + rel;
    }
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

    // Distinct variable names across all nodes (sorted) — for the UI variable pickers.
    function variables() {
      const s = new Set(); for (const n of nodes.values()) for (const v of n.poly.vars()) s.add(v); return [...s].sort();
    }
    // Distinct PRIMAL (non-barred) base variables — the candidates for "assume real".
    function baseVariables() {
      const s = new Set(); for (const v of variables()) s.add(_primalName(v)); return [...s].sort();
    }

    return {
      seedFromSystem, addConstraint, eliminate, eliminateWithGauge, groebner, groebnerAsync,
      dimension, dimensionAsync, solve, solveAsync, duplicate, deleteNode,
      substituteValue, substituteValues, reducePropagate, assumeReal, fixW0, triangularize: triangularizeNodes,
      currentReimSystem, classify, solveReal, currentColumnIds, maxColumn, columnStats, columns,
      sharedVars, previewCost, exportDAG, mathematicaColumn, mathematicaNode, mathematicaAll, nodeStats, variables, baseVariables,
      moveNode, orderOf: ordOf, orderedColumn,
      undo, redo, reset,
      list, get,
      get edges() { return edges; },
      get model() { return model; },
      set model(m) { model = m; },
      get realVars() { return realVars.slice(); },
      get w0Fixed() { return w0Fixed; },
      get size() { return nodes.size; },
    };
  }

  const AlgebraStore = { create };

  const QD = (typeof window !== 'undefined' && window.QD)
    ? window.QD
    : (typeof module !== 'undefined' && module.exports ? module.exports : (global.QD || (global.QD = {})));
  QD.AlgebraStore = AlgebraStore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
