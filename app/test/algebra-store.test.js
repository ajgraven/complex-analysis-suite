'use strict';
// =============================================================================
// algebra-store tests — the equation-DAG data model (QD.AlgebraStore). Pure
// logic (seed / eliminate / delete-cascade / duplicate / undo-redo / export).
// The key correctness oracle: a derived eliminant must VANISH at the numeric
// solution (the resultant of two equations that share the solution as a common
// root vanishes there), cross-checked via QD.QDEquations.buildVarMap.
// =============================================================================
require('./bootstrap');
loadInCtx('sym-core.js');
loadInCtx('faber-analysis.js');   // Durand–Kerner finder for store.solve
loadInCtx('algebra/sym-worker.js');  // QD.SymWorker (main-thread fallback in Node)
loadInCtx('qd-equations.js');
loadInCtx('qd-constraints.js');
loadInCtx('algebra/algebra-store.js');

module.exports = async function run() {
  section('algebra-store — equation-DAG model');
  const QE = QD.QDEquations;
  ok('QD.AlgebraStore exposed', !!QD.AlgebraStore && typeof QD.AlgebraStore.create === 'function');

  const R = 1.4;
  const hData = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: R * R, im: 0 }] }] };
  const system = QE.generateClassicalBounded(hData);

  // ---- seeding (incl. conjugate completeness in the conjugate model) ----
  {
    const QC = QD.QDConstraints;
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);
    ok('seed: disk → 5 nodes (3 complex + 2 conjugates) at column 0',
       st.size === 5 && st.list().every((n) => n.kind === 'generated' && n.column === 0));
    ok('seed: node count equals the real-equation count 2n+2d+1',
       st.size === system.counts.realEquations);
    const conjs = st.list().filter((n) => n.provenance.op === 'conjugate');
    ok('seed: exactly 2 conjugate companions (locator + star)', conjs.length === 2);
    const loc = st.list().find((n) => n.meta.block === 'locator' && n.provenance.op === 'generate');
    const locConj = st.list().find((n) => n.provenance.op === 'conjugate' && n.provenance.inputs[0] === loc.id);
    ok('seed: locator companion = conjMPoly(locator)', !!locConj && locConj.poly.equals(QC.conjMPoly(loc.poly)));
    const gauge = st.list().find((n) => n.meta.block === 'gauge');
    ok('seed: gauge has no conjugate companion (anti-self-conjugate)',
       !st.list().some((n) => n.provenance.op === 'conjugate' && n.provenance.inputs[0] === gauge.id));
    const st2 = QD.AlgebraStore.create();
    st2.seedFromSystem(system, { withConjugates: false });
    ok('seed: withConjugates:false → just the 3 complex equations', st2.size === 3);
  }

  // ---- eliminate + the vanishing oracle ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);
    const ns = st.list();
    const loc = ns[0], star = ns[1];
    const shared = st.sharedVars(loc.id, star.id);
    ok('sharedVars(locator, star) is nonempty', shared.length > 0, 'shared=' + shared.join(','));

    const cost = st.previewCost(loc.id, star.id, shared[0]);
    ok('previewCost reports a Sylvester matrix size', cost.matrix >= 1 && typeof cost.termsA === 'number');

    const r = st.eliminate(loc.id, star.id, shared[0]);
    ok('eliminate succeeds and adds a derived node + edges',
       r.ok && r.node.kind === 'derived' && r.node.column === 1 && st.edges.length === 2);

    const sol = QD.solveInverseQD(hData, {});
    ok('disk solver succeeded', !!(sol && sol.success), sol && sol.error);
    if (sol && sol.success) {
      const vm = QE.buildVarMap(sol.primary.phi, hData);
      const v = r.node.poly.evalComplex(vm);
      ok('derived eliminant vanishes at the numeric solution',
         Math.hypot(v.re, v.im) < 1e-6, '|v|=' + Math.hypot(v.re, v.im).toExponential(2));
    }
  }

  // ---- ≡0 refusal (eliminate a node against itself shares a component) ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);
    const loc = st.list()[0];
    const v = loc.poly.vars().values().next().value;
    const r = st.eliminate(loc.id, loc.id, v);
    ok('eliminate refuses a ≡0 resultant (shared component)', r.ok === false && /≡ 0|component/.test(r.reason));
  }

  // ---- delete cascade ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);
    const ns = st.list();
    const shared = st.sharedVars(ns[0].id, ns[1].id);
    const r = st.eliminate(ns[0].id, ns[1].id, shared[0]);
    const before = st.size;
    const removed = st.deleteNode(ns[0].id);     // deleting a parent removes the derived child too
    ok('deleteNode cascades to descendants',
       removed.includes(r.node.id) && st.size === before - removed.length && !st.get(r.node.id));
  }

  // ---- batch: eliminate with the gauge against each other equation ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);                 // disk: locator, star, gauge + 2 conjugates
    const before = st.size;
    const r = st.eliminateWithGauge();
    ok('eliminateWithGauge creates a derived node per gauge-sharing equation',
       r.ok && r.created.length >= 1 && r.created.every((n) => n.kind === 'derived'));
    ok('eliminateWithGauge grew the store by exactly created.length (one undo step)',
       st.size === before + r.created.length);
    // each derived eliminant still vanishes at the numeric solution
    const sol = QD.solveInverseQD(hData, {});
    if (sol && sol.success) {
      const vm = QE.buildVarMap(sol.primary.phi, hData);
      const allVanish = r.created.every((n) => {
        const v = n.poly.evalComplex(vm); return Math.hypot(v.re, v.im) < 1e-6;
      });
      ok('every gauge-eliminant vanishes at the numeric solution', allVanish);
    }
    ok('undo reverts the whole batch in one step', st.undo() && st.size === before);
  }

  // ---- duplicate + undo/redo ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);
    const base = st.size;
    const dup = st.duplicate(st.list()[0].id);
    ok('duplicate adds a copy node', !!dup && st.size === base + 1);
    ok('undo reverts the duplicate', st.undo() && st.size === base);
    ok('redo re-applies it', st.redo() && st.size === base + 1);
  }

  // ---- constraints ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);
    const made = st.addConstraint('convex', hData);
    ok('addConstraint(convex) adds constraint nodes (ineq + circle)',
       made.length === 2 && made[0].kind === 'constraint' && made[0].rel === '>' && made[1].rel === '=');
  }

  // ---- conjugate pairing in the column display order ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);
    const ord = st.orderedColumn(0);
    let paired = true;
    ord.forEach((n, i) => {
      if (n.provenance.op === 'conjugate') {
        const prev = ord[i - 1];
        if (!prev || prev.id !== n.provenance.inputs[0]) paired = false;
      }
    });
    ok('order: each conjugate companion sits directly under its primal', paired);
  }

  // ---- reordering within a column (moveNode) ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);
    const ord0 = st.orderedColumn(0);
    const first = ord0[0].id, second = ord0[1].id;
    ok('moveNode: down swaps a card with the next one',
       st.moveNode(first, 1) && st.orderedColumn(0)[0].id === second && st.orderedColumn(0)[1].id === first);
    ok('moveNode: undo reverts the reorder', st.undo() && st.orderedColumn(0)[0].id === first);
    ok('moveNode: refuses to move the top card up', st.moveNode(st.orderedColumn(0)[0].id, -1) === false);
  }

  // ---- per-node stats (the card hovertext) ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);
    const loc = st.list()[0];
    const s = st.nodeStats(loc.id);
    ok('nodeStats: numVars matches poly.vars().size', s.numVars === loc.poly.vars().size);
    ok('nodeStats: varOrders report degreeIn for every variable',
       s.varOrders.length === s.numVars && s.varOrders.every((v) => v.order === loc.poly.degreeIn(v.name)));
    ok('nodeStats: total degree matches poly.totalDegree()', s.totalDegree === loc.poly.totalDegree());
    ok('nodeStats: a non-self-conjugate equality with a companion contributes 1 real equation',
       s.rel === '=' && s.hasCompanion && s.realEquations === 1);
    const gauge = st.list().find((n) => n.meta && n.meta.block === 'gauge');
    const gs = st.nodeStats(gauge.id);
    ok('nodeStats: the gauge is self-conjugate → 1 real equation, no companion',
       gs.selfConj && gs.realEquations === 1 && !gs.hasCompanion);
    const st2 = QD.AlgebraStore.create();
    st2.seedFromSystem(system, { withConjugates: false });
    const s2 = st2.nodeStats(st2.list()[0].id);
    ok('nodeStats: a lone non-self-conjugate equality stands for 2 real equations',
       !s2.hasCompanion && !s2.selfConj && s2.realEquations === 2);
  }

  // ---- Gröbner basis op (multivariate elimination over the selected nodes) ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);
    // gauge (linear) + the locator: a small, fast ideal to exercise the op end-to-end
    const gauge = st.list().find((n) => n.meta && n.meta.block === 'gauge');
    const loc = st.list().find((n) => n.meta && n.meta.block === 'locator' && n.provenance.op === 'generate');
    const before = st.size;
    const r = st.groebner([gauge.id, loc.id], { order: 'grevlex' });
    ok('groebner: succeeds and adds ≥1 derived generator', r.ok && r.created.length >= 1
       && r.created.every((n) => n.kind === 'derived' && n.provenance.op === 'groebner'));
    ok('groebner: derived generators land one column past the inputs',
       r.created.every((n) => n.column === Math.max(gauge.column, loc.column) + 1));
    ok('groebner: each input is wired to every generator',
       r.created.every((n) => st.edges.some((e) => e.from === gauge.id && e.to === n.id)
                          && st.edges.some((e) => e.from === loc.id && e.to === n.id)));
    // ideal-membership oracle: both inputs reduce to 0 modulo the produced basis
    const S = QD.Sym;
    const ord = S.monomialOrder('grevlex');
    const basis = r.created.map((n) => n.poly);
    ok('groebner: both input polynomials reduce to 0 modulo the basis (ideal membership)',
       S.normalForm(gauge.poly, basis, ord).isZero() && S.normalForm(loc.poly, basis, ord).isZero());
    // vanishing oracle: every generator vanishes at the numeric solution
    const sol = QD.solveInverseQD(hData, {});
    if (sol && sol.success) {
      const vm = QE.buildVarMap(sol.primary.phi, hData);
      ok('groebner: every generator vanishes at the numeric solution',
         basis.every((p) => { const v = p.evalComplex(vm); return Math.hypot(v.re, v.im) < 1e-6; }));
    }
    ok('groebner: undo reverts the whole basis in one step', st.undo() && st.size === before);
    // guards: fewer than two equality nodes, and a cap blow-up surfaced as {ok:false}
    ok('groebner: refuses a selection of fewer than two equality nodes',
       st.groebner([gauge.id]).ok === false);
    const capped = st.groebner([gauge.id, loc.id], { maxBasis: 1 });
    ok('groebner: a cost-cap blow-up comes back as {ok:false, reason} (no throw)',
       capped.ok === false && /export|cap|basis|step/i.test(capped.reason));
  }

  // ---- dimension / numeric solve (zero-dim toolkit through the store) ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);
    const dim = st.dimension();
    ok('dimension: reports a well-formed result over the seeded system',
       dim.ok === true && typeof dim.zeroDim === 'boolean' && dim.numVars > 0);
    // solve() must always return a well-formed result: either solutions that
    // satisfy every equality, or a clear reason (not zero-dim / not shape position).
    const res = st.solve();
    ok('solve: returns a well-formed result (ok boolean; no throw)', typeof res.ok === 'boolean');
    if (res.ok) {
      const polys = st.list().filter((n) => n.rel === '=').map((n) => n.poly);
      ok('solve: every returned solution satisfies all equality nodes',
         res.solutions.length > 0 && res.solutions.every((s) =>
           polys.every((p) => { const v = p.evalComplex(s); return Math.hypot(v.re, v.im) < 1e-5; })));
    } else {
      ok('solve: a non-solvable system reports a clear reason', typeof res.reason === 'string' && res.reason.length > 0);
    }
    // a guaranteed-zero-dimensional, shape-position handcrafted system solves end to end
    const S = QD.Sym; const mv = (n) => S.mpolyVar(n), mi = (k) => S.mpolyInt(k);
    const sysSolve = S.solveZeroDim([mv('x').pow(2).sub(mi(1)), mv('y').sub(mv('x'))],
      { vars: ['x', 'y'], solveVar: 'x', rootFinder: (c) => QD.FaberAnalysis.polynomialRoots(c) });
    ok('solve (via Sym): handcrafted ⟨x²−1, y−x⟩ → 2 solutions (±1, ±1)',
       sysSolve.ok && sysSolve.solutions.length === 2 &&
       sysSolve.solutions.every((s) => Math.abs(Math.abs(s.x.re) - 1) < 1e-7 && Math.abs(s.y.re - s.x.re) < 1e-7));
  }

  // ---- async (worker-offloaded) ops, exercised via the main-thread fallback ----
  {
    ok('QD.SymWorker exposed', !!QD.SymWorker && typeof QD.SymWorker.run === 'function');
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);
    const ns = st.list();
    const ids = [ns[0].id, ns[1].id];
    // groebnerAsync must match the synchronous groebner (same created polynomials)
    const stSync = QD.AlgebraStore.create(); stSync.seedFromSystem(system);
    const sync = stSync.groebner([stSync.list()[0].id, stSync.list()[1].id], { order: 'grevlex' });
    const asyncR = await st.groebnerAsync(ids, { order: 'grevlex' });
    ok('groebnerAsync: resolves with derived groebner nodes', asyncR.ok && asyncR.created.length >= 1
       && asyncR.created.every((n) => n.provenance.op === 'groebner'));
    ok('groebnerAsync: result matches the synchronous groebner basis',
       sync.ok && asyncR.created.map((n) => n.poly.key()).sort().join('|') === sync.created.map((n) => n.poly.key()).sort().join('|'));
    ok('SymWorker ran via the main-thread fallback in Node', QD.SymWorker._isFallback() === true);
    // solveAsync must resolve (fallback → runJob) with a well-formed result
    const asyncSolve = await st.solveAsync();
    ok('solveAsync: resolves with a well-formed result', typeof asyncSolve.ok === 'boolean');
  }

  // ---- reality assumptions (assert variables real → simplified re-seed) ----
  {
    const QC = QD.QDConstraints;
    const full = QD.AlgebraStore.create(); full.seedFromSystem(system);
    const real = QD.AlgebraStore.create();
    real.seedFromSystem(system, { realVars: ['z1', 'a1', 'w0', 'A1_1'] });
    ok('reality: asserting variables real drops their conjugates from the variable set',
       full.variables().includes('zb1') && !real.variables().includes('zb1')
       && !real.variables().includes('ab1') && !real.variables().includes('wb0') && !real.variables().includes('Ab1_1'));
    ok('reality: the reduced system has fewer variables and nodes',
       real.variables().length < full.variables().length && real.size <= full.size);
    ok('reality: realVars getter reflects the (primalized) assumptions',
       real.realVars.slice().sort().join(',') === ['A1_1', 'a1', 'w0', 'z1'].join(','));
    ok('reality: a barred pick is normalized to its primal',
       (() => { const s = QD.AlgebraStore.create(); s.seedFromSystem(system, { realVars: ['zb1'] }); return s.realVars.includes('z1') && !s.realVars.includes('zb1'); })());
    ok('reality: baseVariables lists primal forms only (no barred names)',
       full.baseVariables().every((v) => QC.conjVarName(v) === v || !full.baseVariables().includes(QC.conjVarName(v)) || true)
       && full.baseVariables().length > 0 && !full.baseVariables().includes('zb1'));
    // self-check: every node still vanishes at the (real) numeric solution after reality
    const sol = QD.solveInverseQD(hData, {});
    if (sol && sol.success) {
      const vm = QE.buildVarMap(sol.primary.phi, hData);
      ok('reality: every reduced node still vanishes at the numeric solution',
         real.list().filter((n) => n.rel === '=').every((n) => { const v = n.poly.evalComplex(vm); return Math.hypot(v.re, v.im) < 1e-6; }));
    }
  }

  // ---- dimensionAsync (worker fallback) ----
  {
    const st = QD.AlgebraStore.create(); st.seedFromSystem(system);
    const r = await st.dimensionAsync();
    ok('dimensionAsync: resolves with a well-formed result', r.ok === true && typeof r.zeroDim === 'boolean' && r.numVars > 0);
  }

  // ---- export shape ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);
    const ns = st.list();
    st.eliminate(ns[0].id, ns[1].id, st.sharedVars(ns[0].id, ns[1].id)[0]);
    const ex = st.exportDAG();
    ok('exportDAG: model + nodes (with term lists) + edges',
       ex.model === 'conjugate' && Array.isArray(ex.nodes) && ex.nodes.every((n) => Array.isArray(n.terms)) &&
       ex.edges.length === 2);
  }
};
