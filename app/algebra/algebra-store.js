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
// Ops: seedFromSystem (●/★/gauge from generateClassicalBounded), addConstraint
// (the four univalence forms), eliminate (Sylvester resultant of two nodes over a
// shared variable → a new derived node one column deeper), duplicate/branch,
// deleteNode (cascade to descendants), undo/redo (snapshot stack), exportDAG.
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
    function reset() { nodes.clear(); edges = []; order = new Map(); seq = 0; undoStack.length = 0; redoStack.length = 0; }

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
    // opts.realVars asserts those (base) variables real (z̄ⱼ≡zⱼ, …) — substituted in
    // throughout, which simplifies the system; the choice persists for later
    // addConstraint calls until the next seed changes it.
    function seedFromSystem(system, opts) {
      opts = opts || {};
      const withConj = opts.withConjugates !== false;
      if (opts.realVars !== undefined) realVars = (opts.realVars || []).map(_primalName);
      checkpoint();
      reset();
      model = system.model || 'conjugate';
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
      const gauge = list().find((n) => n.meta && n.meta.block === 'gauge');
      if (!gauge) return { ok: false, reason: 'no gauge equation in the system', created: [], skipped: [] };
      checkpoint();
      const created = [], skipped = [];
      const targets = list().filter((n) => n.id !== gauge.id && n.rel === '='
        && (opts.includeDerived ? true : n.kind !== 'derived'));
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
    function _capOpts(opts) {
      const out = {};
      for (const k of ['maxBasis', 'maxSteps', 'maxDegree', 'maxTerms', 'reduced', 'keepEliminated']) {
        if (opts && opts[k] != null) out[k] = opts[k];
      }
      return out;
    }

    // The numeric root finder for solve() — the app's Durand–Kerner (faber-analysis).
    function defaultRootFinder() {
      const Q = (typeof window !== 'undefined' && window.QD) || (typeof global !== 'undefined' && global.QD) || (typeof QD !== 'undefined' && QD);
      const FA = Q && Q.FaberAnalysis;
      return (FA && FA.polynomialRoots) ? ((coeffsAsc) => FA.polynomialRoots(coeffsAsc)) : null;
    }
    function _eqPolys(ids) {
      const sel = (ids && ids.length ? ids.map((id) => get(id)) : list()).filter(Boolean);
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
        const conj = QC.conjMPoly(n.poly);
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
      sharedVars, previewCost, exportDAG, nodeStats, variables, baseVariables,
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
