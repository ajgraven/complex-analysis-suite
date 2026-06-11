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

  // ---- reality assumptions (AUDIT-TRAIL model: assumeReal appends a new column;
  //      column 0 stays the original system) ----
  {
    const QC = QD.QDConstraints;
    const full = QD.AlgebraStore.create(); full.seedFromSystem(system);
    const real = QD.AlgebraStore.create(); real.seedFromSystem(system);
    const rr = real.assumeReal(['z1', 'a1', 'w0', 'A1_1']);
    const lastVars = () => { const s = new Set(); real.list().filter((n) => n.column === real.maxColumn()).forEach((n) => { for (const v of n.poly.vars()) s.add(v); }); return s; };
    const lv = lastVars();
    ok('reality: assumeReal appended a new column', rr.ok && rr.column === 1 && rr.created.length > 0);
    ok('reality: the current system (last column) drops the conjugates',
       full.variables().includes('zb1') && !lv.has('zb1') && !lv.has('ab1') && !lv.has('wb0') && !lv.has('Ab1_1'));
    ok('reality: column 0 (original) still carries the barred variables',
       real.list().filter((n) => n.column === 0).some((n) => n.poly.vars().has('zb1')));
    ok('reality: the reduced system has fewer variables than the original',
       lv.size < full.variables().length);
    ok('reality: realVars getter reflects the (primalized) assumptions',
       real.realVars.slice().sort().join(',') === ['A1_1', 'a1', 'w0', 'z1'].join(','));
    ok('reality: a barred pick is normalized to its primal',
       (() => { const s = QD.AlgebraStore.create(); s.seedFromSystem(system); s.assumeReal(['zb1']); return s.realVars.includes('z1') && !s.realVars.includes('zb1'); })());
    ok('reality: baseVariables lists primal forms only (no barred names)',
       full.baseVariables().length > 0 && !full.baseVariables().includes('zb1'));
    // bakeAssumptions: the compact path (autonomous solver) still bakes at seed time
    const baked = QD.AlgebraStore.create();
    baked.seedFromSystem(system, { realVars: ['z1', 'a1', 'w0', 'A1_1'], bakeAssumptions: true });
    ok('reality (bake): bakeAssumptions seeds the reduced system at column 0',
       baked.maxColumn() === 0 && !baked.variables().includes('zb1') && baked.realVars.length === 4);
    // self-check: every node of the reduced system still vanishes at the numeric solution
    const sol = QD.solveInverseQD(hData, {});
    if (sol && sol.success) {
      const vm = QE.buildVarMap(sol.primary.phi, hData);
      ok('reality: every reduced node still vanishes at the numeric solution',
         real.list().filter((n) => n.rel === '=' && n.column === real.maxColumn()).every((n) => { const v = n.poly.evalComplex(vm); return Math.hypot(v.re, v.im) < 1e-6; }));
    }
  }

  // ---- fixed φ(0): seed from a w₀-fixed system (the UI default = the centroid
  //      of the poles, here 0 for the single disk pole); later constraints that
  //      rebuild φ with the w₀ SYMBOL (e.g. the star form's φ − w₀) get the same
  //      exact substitution, keeping the whole workspace on one normalization. ----
  {
    const sysFixed = QE.generateClassicalBounded(hData, { w0: { re: 0, im: 0 } });
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(sysFixed);
    ok('w0Fixed: seeded workspace has no w0/wb0 variables',
       st.variables().indexOf('w0') === -1 && st.variables().indexOf('wb0') === -1);
    ok('w0Fixed: store records the fixed value', !!st.w0Fixed && st.w0Fixed.re[0] === '0' && st.w0Fixed.re[1] === '1');
    ok('w0Fixed: same node count as the symbolic seeding (5 for the disk)', st.list().length === 5);
    const made = st.addConstraint('star', hData);
    ok('w0Fixed: star constraint (φ−w₀ form) gets the substitution — no w0/wb0 anywhere',
       made.length > 0 && st.list().every((n) => !n.poly.vars().has('w0') && !n.poly.vars().has('wb0')));
    ok('w0Fixed: undo keeps the fixed value', st.undo() && !!st.w0Fixed);
    ok('w0Fixed: exportDAG carries w0Fixed', !!st.exportDAG().w0Fixed);
    const st2 = QD.AlgebraStore.create();
    st2.seedFromSystem(QE.generateClassicalBounded(hData));
    ok('w0Fixed: a symbolic seed leaves w0Fixed null and keeps w0 as a variable',
       st2.w0Fixed === null && st2.variables().indexOf('w0') !== -1);
  }

  // ---- re-seeding is UNDOABLE (code-review fix): seeding checkpoints the prior
  //      graph instead of wiping the undo history, so toggling fix-φ(0) / assume-real
  //      (both of which re-seed) doesn't silently and irreversibly discard a
  //      derivation. ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);                       // seed #1
    const ns = st.list();
    st.eliminate(ns[0].id, ns[1].id, st.sharedVars(ns[0].id, ns[1].id)[0]);   // a derived node
    const derivedSize = st.size;
    ok('re-seed undo: a derivation exists before re-seeding', derivedSize > 5);
    st.seedFromSystem(system, { realVars: ['z1', 'a1', 'w0', 'A1_1'], bakeAssumptions: true });   // seed #2 (different normalization, baked)
    ok('re-seed undo: re-seed replaced the graph and the reality assumptions',
       st.realVars.length === 4 && st.size !== derivedSize);
    ok('re-seed undo: undo restores the prior derivation AND its (empty) reality state',
       st.undo() && st.size === derivedSize && st.realVars.length === 0);
    ok('re-seed undo: redo re-applies the re-seed', st.redo() && st.realVars.length === 4);
  }

  // ---- nodeStats real-equation accounting respects reality assumptions (review
  //      fix): under reality the conjugacy check must fold reality in, or it
  //      mis-counts. With z1,a1,w0,A1_1 real, the disk locator/star become
  //      self-conjugate-under-reality (1 real equation each), not 2. ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system, { realVars: ['z1', 'a1', 'w0', 'A1_1'], bakeAssumptions: true });
    const eqNodes = st.list().filter((n) => n.rel === '=');
    ok('nodeStats(reality): every equality node reports 1 real equation (self-conjugate under reality)',
       eqNodes.length > 0 && eqNodes.every((n) => st.nodeStats(n.id).realEquations === 1));
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

  // ---- AUDIT-TRAIL reductions: specify-value (+ auto-propagation), currentColumnIds,
  //      and the φ(0)=0 ⇒ z₁ elimination the user described ----
  {
    // Symbolic seed so w₀ is a live variable (the original system).
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(QE.generateClassicalBounded(hData));
    ok('audit: symbolic seed keeps w0 as a variable at column 0', st.variables().includes('w0'));
    const col0Ids = st.currentColumnIds();
    ok('audit: currentColumnIds returns the column-0 equality nodes when there is one column',
       col0Ids.length > 0 && col0Ids.every((id) => st.get(id).column === 0));

    // Set w₀=0 (single variable): substitute → a new column; auto-propagate cascades.
    const r = st.substituteValue('w0', { re: 0, im: 0 }, { propagate: true });
    ok('audit: substituteValue appended a new column dropping w0', r.ok && r.column === 1);
    const c1 = st.list().filter((n) => n.column === 1);
    ok('audit: the substitution column no longer mentions w0 (the substituted variable)',
       c1.length > 0 && c1.every((n) => !n.poly.vars().has('w0')));
    ok('audit: column 0 (original) still has w0 — history preserved',
       st.list().some((n) => n.column === 0 && n.poly.vars().has('w0')));
    ok('audit: auto-propagation ran as a further column (or reported nothing to propagate)',
       (r.propagated && r.propagated.column === 2) || typeof r.propagateReason === 'string');
    ok('audit: currentColumnIds now points at the last (reduced) column',
       st.currentColumnIds().every((id) => st.get(id).column === st.maxColumn()));
    // undo removes the whole substitute(+propagate) in the expected number of steps
    const before = st.maxColumn();
    st.undo();
    ok('audit: undo peels back the reduction', st.maxColumn() < before);
  }

  // ---- AUDIT-TRAIL: substituteValues (several variables in ONE column) + conjugate fill ----
  {
    const QC = QD.QDConstraints;
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(QE.generateClassicalBounded(hData));
    const present = new Set(st.variables());
    // base variables present in the system whose conjugate partner is ALSO present
    const bases = st.baseVariables().filter((v) => {
      const c = QC.conjVarName(v); return present.has(v) && c !== v && present.has(c);
    });
    ok('subvals: found ≥2 base variables with conjugate partners to test', bases.length >= 2);
    const [v1, v2] = bases, c1 = QC.conjVarName(v1), c2 = QC.conjVarName(v2);
    const r = st.substituteValues(
      [{ varName: v1, value: { re: 1, im: 2 } }, { varName: v2, value: { re: 0, im: 0 } }],
      { propagate: false });
    ok('subvals: substituteValues appends exactly ONE new column for several vars', r.ok && r.column === 1);
    const col1 = st.list().filter((n) => n.column === 1);
    ok('subvals: the column drops BOTH chosen variables',
       col1.length > 0 && col1.every((n) => !n.poly.vars().has(v1) && !n.poly.vars().has(v2)));
    ok('subvals: the column ALSO drops both conjugates (a value fully specifies its conjugate)',
       col1.every((n) => !n.poly.vars().has(c1) && !n.poly.vars().has(c2)));
    const rep = col1.find((n) => n.provenance && n.provenance.op === 'substitute');
    ok('subvals: provenance records a variables[] array of length 2',
       rep && rep.provenance.variables && rep.provenance.variables.length === 2);
    ok('subvals: provenance records each conjugate partner name',
       rep && rep.provenance.variables.every((v) => v.conjugate === QC.conjVarName(v.name)));

    // The single-variable wrapper now ALSO fills the conjugate.
    const st2 = QD.AlgebraStore.create();
    st2.seedFromSystem(QE.generateClassicalBounded(hData));
    const r2 = st2.substituteValue(v1, { re: 1, im: 2 }, { propagate: false });
    const s2c1 = st2.list().filter((n) => n.column === 1);
    ok('subvals: single substituteValue drops the variable AND its conjugate',
       r2.ok && s2c1.every((n) => !n.poly.vars().has(v1) && !n.poly.vars().has(c1)));

    // A substitution naming no in-system variable is reported, not thrown.
    const r3 = st2.substituteValues([{ varName: 'nope_xyz', value: { re: 0, im: 0 } }], { propagate: false });
    ok('subvals: a substitution naming no in-system variable returns ok:false',
       !r3.ok && /current system/.test(r3.reason || ''));
  }

  // ---- AUDIT-TRAIL: reducePropagate directly, and an inconsistent fix is reported ----
  {
    // A tiny hand-built store-like check via the public ops on a seeded system:
    // setting a value that contradicts the gauge should surface inconsistency through
    // the propagation pass (1 = 0 marker) rather than throwing.
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);              // symbolic disk system
    const rp = st.reducePropagate();
    ok('audit: reducePropagate returns a well-formed result (ok boolean, no throw)',
       typeof rp.ok === 'boolean' && (rp.ok ? Array.isArray(rp.created) : typeof rp.reason === 'string'));
  }

  // ---- AUDIT-TRAIL: fixW0 op on a symbolic seed appends a column and records w0Fixed ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(QE.generateClassicalBounded(hData));   // symbolic (w₀ live)
    const r = st.fixW0({ re: 0, im: 0 });
    ok('audit: fixW0 appends a column and removes w0/wb0',
       r.ok && r.column === 1 && st.list().filter((n) => n.column === 1).every((n) => !n.poly.vars().has('w0') && !n.poly.vars().has('wb0')));
    ok('audit: fixW0 records the exact value in w0Fixed', !!st.w0Fixed && st.w0Fixed.re[0] === '0');
    const r2 = st.fixW0({ re: 0, im: 0 });
    ok('audit: fixW0 is a no-op (ok:false) once φ(0) is already absent', r2.ok === false);
  }

  // ---- triangular decomposition op (alternative eliminator → a new column) ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(QE.generateClassicalBounded(hData));   // symbolic disk
    st.assumeReal(st.baseVariables());                       // collapse the conjugate model first
    const tr = st.triangularize();
    ok('triangularize: store op returns a well-formed result', typeof tr.ok === 'boolean');
    if (tr.ok && !tr.contradiction) {
      ok('triangularize: appends a triangular-chain column with provenance + edges',
         tr.column === st.maxColumn() && tr.created.length > 0 &&
         tr.created.every((n) => n.provenance.op === 'triangular') &&
         st.edges.some((e) => e.to === tr.created[0].id));
      const sol = QD.solveInverseQD(hData, {});
      if (sol && sol.success) {
        const vm = QE.buildVarMap(sol.primary.phi, hData);
        ok('triangularize: every chain polynomial vanishes at the numeric solution',
           tr.created.every((n) => { const v = n.poly.evalComplex(vm); return Math.hypot(v.re, v.im) < 1e-6; }));
      }
    }
  }

  // ---- existence / uniqueness verdict (reim transform + Hermite real count) ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(QE.generateClassicalBounded(hData));
    st.assumeReal(st.baseVariables());                       // collapse to the real system
    const reim = st.currentReimSystem();
    ok('currentReimSystem: a nonempty real-variable system (names carry __re/__im)',
       reim.polys.length > 0 && reim.vars.length > 0 && reim.vars.every((v) => /__re$|__im$/.test(v)));
    ok('currentReimSystem: every coefficient is real (the imaginary part split off)',
       reim.polys.every((p) => p.imagPart().isZero()));
    const cl = st.classify();
    ok('classify: returns a well-formed verdict (ok, zeroDim boolean)',
       cl.ok === true && typeof cl.zeroDim === 'boolean' &&
       (cl.inconsistent || !cl.zeroDim || typeof cl.multiplicity === 'number'));
    // a deliberately inconsistent system (fix w₀ to a wrong value on the symbolic seed
    // then over-constrain) should be detectable as inconsistent OR zero-real-count.
    if (cl.ok && cl.zeroDim && cl.realCount != null) {
      ok('classify: a real disk QD has at least one real solution (exists)', cl.realCount >= 1);
    }
    // solveReal returns a well-formed result over the (pinned) reim system
    const sr = st.solveReal(null, {});
    ok('solveReal: returns a well-formed result over the reim system', typeof sr.ok === 'boolean');
  }

  // ---- per-column stats (UI lane headers) ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);                       // symbolic disk → column 0
    const c0 = st.columnStats(0);
    ok('columnStats: column 0 reports the seeded equation + variable counts',
       c0.eqCount === st.list().filter((n) => n.column === 0 && n.rel === '=').length && c0.varCount > 0);
    st.assumeReal(st.baseVariables());               // → column 1, fewer variables
    const c1 = st.columnStats(1);
    ok('columnStats: the reduced column has strictly fewer variables', c1.varCount < c0.varCount);
    const cols = st.columns();
    ok('columns: lists the columns in order with stats', cols.length === 2 && cols[0].index === 0 && cols[1].index === 1 && typeof cols[1].varCount === 'number');
  }

  // ---- Mathematica export of a column ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);                       // symbolic disk → column 0
    const code = st.mathematicaColumn(0);
    const eqs = st.list().filter((n) => n.column === 0);
    ok('mathematica: wraps the column equations in a Wolfram-Language list',
       code.startsWith('{') && code.endsWith('}') && (code.match(/== 0|> 0|!= 0/g) || []).length === eqs.length);
    ok('mathematica: sanitizes subscript underscores to $ (Blank is reserved)',
       !/[A-Za-z]\d*_\d/.test(code) && /\$/.test(code));
    ok('mathematica: uses I for the imaginary unit and ^ for powers (no LaTeX braces)',
       !/\\|\^\{/.test(code));
    // round-trip sanity: the column's variable names appear (sanitized) in the code
    const present = new Set(st.variables());
    if (present.has('z1')) ok('mathematica: a present variable appears in the code', /\bz1\b/.test(code));
    ok('mathematica: an empty / missing column yields the empty string', st.mathematicaColumn(99) === '');

    // single-node + all-columns variants
    const id0 = st.list().find((n) => n.column === 0).id;
    const one = st.mathematicaNode(id0);
    ok('mathematica: mathematicaNode is a single equation (one relation, no list braces)',
       /== 0|> 0|!= 0/.test(one) && one.indexOf('{') === -1);
    ok('mathematica: mathematicaNode of a missing id is the empty string', st.mathematicaNode('nope') === '');
    st.assumeReal(st.baseVariables());                 // add a column so "all" spans ≥2
    const all = st.mathematicaAll();
    ok('mathematica: mathematicaAll labels each column (col0 = {…}; col1 = {…})',
       /col0\s*=\s*\{/.test(all) && /col1\s*=\s*\{/.test(all) && /\(\* column 0/.test(all));
  }

  // ---- factoring: factorOf (query) + applyFactor (case-split column) ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(QE.generateClassicalBounded(hData));
    // Setting A₁,₁=0 makes the star equation C₁,₁·(1 − z₁z̄₁)² — factorable into
    // C₁,₁ and the Möbius factor (z₁z̄₁ − 1).
    const sub = st.substituteValue('A1_1', { re: 0, im: 0 }, { propagate: false });
    const target = st.list().find((n) => n.column === sub.column && st.factorOf(n.id).ok);
    ok('factor: at least one equation factors after A₁,₁=0', !!target);
    const fr = st.factorOf(target.id);
    ok('factor: factorOf returns ≥2 factors, each dividing the original equation', fr.ok && fr.factors.length >= 2 &&
       fr.factors.every((f) => { try { QD.Sym.mpolyExactDiv(target.poly, f); return true; } catch (e) { return false; } }));
    const beforeCols = st.maxColumn();
    const ap = st.applyFactor(target.id, 0);
    ok('factor: applyFactor appends a new "case" column', ap.ok && ap.column === beforeCols + 1 && ap.factorCount === fr.factors.length);
    const newCol = st.list().filter((n) => n.column === ap.column);
    ok('factor: the case column carries the same node count as the current system',
       newCol.length === st.list().filter((n) => n.column === beforeCols).length);
    ok('factor: exactly one node in the case column is the chosen factor (provenance op:factor, caseIndex 0)',
       newCol.some((n) => n.provenance && n.provenance.op === 'factor' && n.provenance.caseIndex === 0 && n.poly.equals(fr.factors[0])));
    // applying a factor to an irreducible equation in the CURRENT column fails cleanly
    const irr = newCol.find((n) => n.rel === '=' && !st.factorOf(n.id).ok);
    ok('factor: applyFactor on an irreducible current-column equation returns ok:false',
       irr ? (() => { const r = st.applyFactor(irr.id, 0); return !r.ok && /no nontrivial|factoriz/.test(r.reason || ''); })() : true);
  }
};
