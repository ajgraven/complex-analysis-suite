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
