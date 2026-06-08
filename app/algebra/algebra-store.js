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

    function nid() { return 'n' + (++seq); }

    // --- snapshot-based undo (sizes are small; snapshots beat inverse-op bookkeeping) ---
    // The display `order` map is part of the snapshot so reordering is undoable and
    // so undo/redo of structural ops restores the exact card layout too. Node
    // objects are never mutated in place (only added), so a shallow node-map copy
    // is a safe snapshot; `order` is copied because moveNode mutates it.
    function snapshot() {
      return { nodes: new Map([...nodes].map(([k, v]) => [k, v])), edges: edges.slice(), order: new Map(order), model, seq };
    }
    function restore(s) {
      nodes.clear(); for (const [k, v] of s.nodes) nodes.set(k, v);
      edges = s.edges.slice(); order = new Map(s.order || []); model = s.model; seq = s.seq;
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
      const conj = QC.conjMPoly(node.poly);
      if (node.poly.sub(conj).isZero() || node.poly.add(conj).isZero()) return null;   // self-conjugate
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
    function seedFromSystem(system, opts) {
      opts = opts || {};
      const withConj = opts.withConjugates !== false;
      checkpoint();
      reset();
      model = system.model || 'conjugate';
      const primals = [];
      for (const block of ['locator', 'star', 'gauge']) {
        for (const item of system.blocks[block]) {
          primals.push(addNode({
            id: nid(), kind: 'generated', poly: item.eq, rel: '=',
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
        made.push(addNode({
          id: nid(), kind: 'constraint', poly: d.poly, rel: d.rel,
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
    function groebner(ids, opts) {
      const S = getSym();
      opts = opts || {};
      const sel = (ids || []).map((id) => get(id)).filter(Boolean);
      const eqNodes = sel.filter((n) => n.rel === '=');
      const skipped = sel.filter((n) => n.rel !== '=').map((n) => ({ id: n.id, reason: 'not an equality (' + n.rel + ')' }));
      if (eqNodes.length < 2) {
        return { ok: false, reason: 'select at least two equality nodes for a Gröbner basis', created: [], skipped };
      }
      // monomial order: an explicit eliminate list ⇒ lex with those vars highest.
      const elim = (opts.eliminate || []).slice();
      let kind = opts.order || (elim.length ? 'lex' : 'grevlex');
      let varOrder = opts.varOrder || null;
      if (!varOrder && elim.length) {
        const rest = new Set();
        for (const n of eqNodes) for (const v of n.poly.vars()) if (!elim.includes(v)) rest.add(v);
        varOrder = [...elim, ...[...rest].sort()];
      }
      const order = S.monomialOrder(kind, varOrder);
      let basis;
      try {
        basis = S.buchberger(eqNodes.map((n) => n.poly), order, opts);
      } catch (e) { return { ok: false, reason: (e && e.message) || String(e), created: [], skipped }; }
      let gens = basis;
      if (elim.length && !opts.keepEliminated) {
        gens = basis.filter((g) => { const vs = g.vars(); return !elim.some((v) => vs.has(v)); });
      }
      gens = gens.filter((g) => !g.isZero());
      if (!gens.length) {
        return { ok: false, reason: elim.length
          ? 'the elimination ideal in the remaining variables is trivial (no generator free of ' + elim.join(', ') + ')'
          : 'empty Gröbner basis', created: [], skipped };
      }
      checkpoint();
      const inputIds = eqNodes.map((n) => n.id);
      const col = Math.max.apply(null, eqNodes.map((n) => n.column)) + 1;
      const created = [];
      const tag = elim.length ? 'elim ' + elim.join(',') : kind;
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
        nodes: list().map((n) => ({
          id: n.id, kind: n.kind, label: n.label, rel: n.rel, column: n.column,
          provenance: n.provenance, terms: n.poly.termList(),
        })),
        edges: edges.slice(),
      };
    }

    return {
      seedFromSystem, addConstraint, eliminate, eliminateWithGauge, groebner, duplicate, deleteNode,
      sharedVars, previewCost, exportDAG, nodeStats,
      moveNode, orderOf: ordOf, orderedColumn,
      undo, redo, reset,
      list, get,
      get edges() { return edges; },
      get model() { return model; },
      set model(m) { model = m; },
      get size() { return nodes.size; },
    };
  }

  const AlgebraStore = { create };

  const QD = (typeof window !== 'undefined' && window.QD)
    ? window.QD
    : (typeof module !== 'undefined' && module.exports ? module.exports : (global.QD || (global.QD = {})));
  QD.AlgebraStore = AlgebraStore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
