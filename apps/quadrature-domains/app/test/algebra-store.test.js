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
loadInCtx('sym-radical.js');      // QD.SymRadical — store.solveForVariable
loadInCtx('faber-analysis.js');   // Durand–Kerner finder for store.solve
loadInCtx('algebra/sym-worker.js');  // QD.SymWorker (main-thread fallback in Node)
loadInCtx('qd-equations.js');
loadInCtx('qd-constraints.js');
loadInCtx('algebra/cas-export.js');  // QD.CASExport — the store's Mathematica/CAS export delegates here
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

  // ---- QD-algebra-store-B-01 / B-03: conjugate dedup + companion count are TRACK-scoped ----
  // After a forkTrack, column indices are per-branch depths, so identical polys sit at the same index
  // in different tracks. generateConjugate's "already present" dedup and nodeStats' companion scan must
  // look only within the node's OWN track (as the seed-time maybeAddConjugate does). Otherwise a
  // conjugate poly living in ANOTHER branch wrongly blocks a companion branch B still needs (B-01), or
  // is mis-counted as B's companion, under-reporting realEquations (B-03).
  {
    const QC = QD.QDConstraints;
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system, { withConjugates: false });      // primals only — NO companions anywhere
    const loc0 = st.list().find((n) => n.meta && n.meta.block === 'locator');
    // Fork before any companion exists → branch B has the same primals, still no companions.
    const fork = st.forkTrack();
    ok('B-01 setup: forkTrack ok', fork.ok, fork.ok ? '' : fork.reason);
    const B = fork.track;
    const loc_b = st.list().find((n) => (n.track || 't0') === B && n.meta && n.meta.block === 'locator');
    ok('B-01 setup: branch B has its own locator copy', !!loc_b && loc_b.id !== loc0.id);
    // Add the locator companion ONLY on the parent track t0, leaving B without it.
    st.setActiveTrack('t0');
    const gc0 = st.generateConjugate(loc0.id);
    ok('B-01 setup: t0 gains its locator companion', gc0.ok, gc0.ok ? '' : gc0.reason);
    const locConjPoly = QC.conjMPoly(loc0.poly);
    ok('B-01 setup: an equal conj poly now sits in t0 col 0 (would trip the old cross-track guard)',
       st.list().some((n) => (n.track || 't0') === 't0' && n.column === 0 && n.poly.equals(locConjPoly)));

    // (B-03) nodeStats on B's locator must count TWO real equations — B has no own-branch companion,
    //         even though t0 holds an equal conjugate poly at the same column index.
    st.setActiveTrack(B);
    const sB = st.nodeStats(loc_b.id);
    ok('B-03: nodeStats(B.locator).hasCompanion === false (companion is in t0, not B)',
       sB.hasCompanion === false);
    ok('B-03: nodeStats(B.locator).realEquations === 2 (stands for both real conditions)',
       sB.realEquations === 2);

    // (B-01) generateConjugate on B's locator must SUCCEED — the equal conj poly in t0 must not block it.
    const gcB = st.generateConjugate(loc_b.id);
    ok('B-01: generateConjugate(B.locator) succeeds despite an equal conj poly in track t0',
       gcB.ok, gcB.ok ? '' : gcB.reason);
    ok('B-01: the added companion is stamped on branch B', gcB.ok && (gcB.node.track || 't0') === B);

    // Same-track dedup still works: a second call is now correctly refused, and nodeStats sees the pair.
    const gcB2 = st.generateConjugate(loc_b.id);
    ok('B-01: second generateConjugate(B.locator) refused (own-branch companion now present)', !gcB2.ok);
    const sB2 = st.nodeStats(loc_b.id);
    ok('B-03: with B companion present, nodeStats.realEquations === 1',
       sB2.realEquations === 1 && sB2.hasCompanion === true);
  }

  // ---- QD-algebra-store-A-06 / B-02: spuriousFactors emits HONEST pin suggestions ----
  // A degree-1 univariate factor of a REIM equation is a single-real-coordinate condition. Pinning the
  // BASE complex variable at the root is faithful ONLY when the root is real (A-06: the ℚ(i) split of a
  // real-irreducible v__re²+c gives non-real roots ∓i, whose imaginary part the old code silently
  // dropped → a spurious v=0 pin) AND the base variable's OTHER real coordinate is not an independent
  // unknown on the slice (B-02: otherwise a full-complex pin forces it to 0, over-constraining and
  // dropping QDs). Both bad cases must demote to a 'general' case-split; the genuinely-correct case
  // (real/imaginary base variable) must still surface a 'variable' pin.
  {
    const S = QD.Sym, mv = (n) => S.mpolyVar(n), mi = (k) => S.mpolyInt(k);
    const kinds = (hits) => hits.flatMap((h) => h.factors.map((f) => f.kind));
    const pins = (hits) => hits.flatMap((h) => h.factors.filter((f) => f.kind === 'variable'));

    // (A-06) z1 real, z1² + 1: reim poly z1__re² + 1 splits over ℚ(i) into (z1__re ∓ i) — non-real roots.
    // Add the equation first, THEN assumeReal so z1 is genuinely on the real slice (z1 → z1__re, no z1__im).
    const stA = QD.AlgebraStore.create();
    stA.addEquation(mv('z1').mul(mv('z1')).add(mi(1)), '=', { withConjugate: false });
    stA.assumeReal(['z1']);
    const hitsA = stA.spuriousFactors(null, {}) || [];
    ok('A-06: real-irreducible v__re²+1 (non-real ℚ(i) roots) is NOT a spurious real pin',
       hitsA.length > 0 && kinds(hitsA).every((k) => k === 'general') && pins(hitsA).length === 0,
       'kinds=' + JSON.stringify(kinds(hitsA)));

    // (B-02) z1 COMPLEX, z1²: imag part 2·z1__re·z1__im factors into single-coordinate z1__re, z1__im —
    // but z1__im (resp. z1__re) is an independent unknown, so a full-complex pin over-constrains → general.
    const stB = QD.AlgebraStore.create();
    stB.addEquation(mv('z1').mul(mv('z1')), '=', { withConjugate: false });
    const hitsB = stB.spuriousFactors(null, {}) || [];
    const pinsB = pins(hitsB);
    ok('B-02: single-coordinate factors of a COMPLEX variable are not over-constraining full pins',
       hitsB.length > 0 && !pinsB.some((f) => f.pinVar === 'z1'),
       'z1 pins=' + JSON.stringify(pinsB.map((f) => f.pinValue)));

    // (positive) z1 REAL, z1² − z1 = z1__re·(z1__re − 1): real roots 0,1; z1__im absent → correct pins kept.
    const stC = QD.AlgebraStore.create();
    stC.addEquation(mv('z1').mul(mv('z1')).sub(mv('z1')), '=', { withConjugate: false });
    stC.assumeReal(['z1']);
    const hitsC = stC.spuriousFactors(null, {}) || [];
    const pinsC = pins(hitsC);
    ok('A-06/B-02 positive: a REAL base variable still yields correct real pins (feature preserved)',
       pinsC.length >= 1 && pinsC.every((f) => f.pinVar === 'z1' && Math.abs(f.pinValue.im) < 1e-12),
       'pins=' + JSON.stringify(pinsC.map((f) => f.pinValue)));
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

  // ---- C4: hard-filter the solver output by the active branch's assumptions ----
  {
    const S = QD.Sym; const mv = (n) => S.mpolyVar(n), mi = (k) => S.mpolyInt(k);
    const mkSys = (locEq) => ({
      model: 'conjugate', formulation: 'classical', w0Fixed: null,
      blocks: { locator: [{ eq: locEq, label: 'loc' }], star: [{ eq: mv('A1_1').sub(mv('z1')), label: 'star' }], gauge: [] },
    });
    // (a) z₁·z̄₁ + 1 = 0  ⟹ (under z₁ REAL, z̄₁→z₁)  z₁²+1 = 0  ⟹ z₁ = ±i: BOTH violate "z₁ real".
    const sa = QD.AlgebraStore.create();
    sa.seedFromSystem(mkSys(mv('z1').mul(mv('zb1')).add(mi(1))), { withConjugates: false });
    ok('C4 setup: assumeReal(z1) appended a column', sa.assumeReal(['z1']).ok);
    const solR = sa.solve(sa.currentColumnIds());
    ok('C4: assuming z₁ REAL hard-drops the ±i solutions',
       solR.ok && solR.solutions.length === 0 && solR.prunedByAssumptions === 2 && (solR.allSolutions || []).length === 2,
       JSON.stringify({ n: solR.solutions && solR.solutions.length, pruned: solR.prunedByAssumptions, reason: solR.reason }));
    // opt-out returns the full (unpruned) set
    const solAll = sa.solve(sa.currentColumnIds(), { pruneByAssumptions: false });
    ok('C4: pruneByAssumptions:false keeps all solutions', solAll.ok && solAll.solutions.length === 2 && !solAll.prunedByAssumptions);
    // (b) z₁·z̄₁ − 1 = 0  ⟹ (under z₁ IMAGINARY, z̄₁→−z₁)  −z₁²−1 = 0  ⟹ z₁ = ±i: consistent ⇒ KEPT.
    const sb = QD.AlgebraStore.create();
    sb.seedFromSystem(mkSys(mv('z1').mul(mv('zb1')).sub(mi(1))), { withConjugates: false });
    ok('C4 setup: assumeImaginary(z1) appended a column', sb.assumeImaginary(['z1']).ok);
    const solI = sb.solve(sb.currentColumnIds());
    ok('C4: assuming z₁ IMAGINARY keeps the ±i solutions (re≈0, none dropped)',
       solI.ok && solI.solutions.length === 2 && !solI.prunedByAssumptions,
       JSON.stringify({ n: solI.solutions && solI.solutions.length, pruned: solI.prunedByAssumptions, reason: solI.reason }));
  }

  // ---- D5: progressive "show steps" derivation of a node ----
  {
    // a seeded node has no inputs ⇒ a single "original" step
    const st0 = QD.AlgebraStore.create(); st0.seedFromSystem(system);
    const seed = st0.list()[0];
    const ds0 = st0.derivationSteps(seed.id);
    ok('derivationSteps: a seeded node → one (input-less) step', ds0.ok && ds0.steps.length === 1 && ds0.progressive === false);

    // substitution: replayed one variable at a time; the final step reproduces the node poly
    const stS = QD.AlgebraStore.create(); stS.seedFromSystem(system);
    const rs = stS.substituteValues([{ varName: 'A1_1', value: { re: 0.5, im: 0 } }], { propagate: false });
    ok('derivationSteps setup: substituteValues created a column', rs.ok && rs.created.length > 0);
    // pick a created node that actually involves A1_1 (so a substitution happened)
    const subNode = rs.created.find((n) => n.provenance && n.provenance.op === 'substitute') || rs.created[0];
    const dsS = stS.derivationSteps(subNode.id);
    ok('derivationSteps: substitution is progressive (start + one step per variable) and the last step equals the node',
       dsS.ok && dsS.progressive === true && dsS.steps.length >= 2 && dsS.steps[dsS.steps.length - 1].poly.equals(subNode.poly));

    // assume-real: progressive, final reproduces the node poly
    const stR = QD.AlgebraStore.create(); stR.seedFromSystem(system);
    const rr = stR.assumeReal(['z1']);
    const realNode = rr.created.find((n) => n.provenance && n.provenance.op === 'assume-real') || rr.created[0];
    const dsR = stR.derivationSteps(realNode.id);
    ok('derivationSteps: assume-real is progressive and the last step equals the node',
       dsR.ok && dsR.progressive === true && dsR.steps[dsR.steps.length - 1].poly.equals(realNode.poly));

    // engine reduction (resultant eliminate): a non-progressive input(s) → method → output summary
    const stE = QD.AlgebraStore.create(); stE.seedFromSystem(system);
    const ns = stE.list(); const shared = stE.sharedVars(ns[0].id, ns[1].id);
    const el = stE.eliminate(ns[0].id, ns[1].id, shared[0]);
    const dsE = stE.derivationSteps(el.node.id);
    ok('derivationSteps: an eliminate node → input(s) + method summary, last step is the node poly',
       dsE.ok && dsE.progressive === false && dsE.steps.length >= 2 && dsE.steps[dsE.steps.length - 1].poly.equals(el.node.poly));

    // ULTRA-REVIEW #5: pinning a variable AND its conjugate to INDEPENDENT values in ONE call —
    // the replay (simultaneous accumulation) must still reproduce the node poly exactly. (A naive
    // sequential replay would diverge because substituteValues applies one simultaneous subst.)
    const stC = QD.AlgebraStore.create(); stC.seedFromSystem(system);
    const rc = stC.substituteValues([{ varName: 'z1', value: { re: 1, im: 1 } }, { varName: 'zb1', value: { re: 5, im: 5 } }], { propagate: false });
    if (rc.ok && rc.created.length) {
      const cn = rc.created.find((n) => n.provenance && n.provenance.op === 'substitute') || rc.created[0];
      const dc = stC.derivationSteps(cn.id);
      ok('derivationSteps: conjugate-conflict substitution still replays to EXACTLY the node poly',
         dc.ok && dc.steps.length >= 2 && dc.steps[dc.steps.length - 1].poly.equals(cn.poly));
    } else {
      ok('derivationSteps: conjugate-conflict substitution (z1 & zb1 both pinned) applied', rc.ok);
    }
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
    // (C) knownValues recovers the pinned constants so φ can be reconstructed after the
    // variables leave the system.
    const kv = st.knownValues();
    ok('knownValues: recovers the pinned constants (' + v1 + '=1+2i, ' + v2 + '=0)',
       kv[v1] && Math.abs(kv[v1].re - 1) < 1e-12 && Math.abs(kv[v1].im - 2) < 1e-12 &&
       kv[v2] && Math.abs(kv[v2].re) < 1e-12 && Math.abs(kv[v2].im) < 1e-12);

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
    // classifyAsync / solveRealAsync — worker-offloaded twins. In Node the SymWorker falls
    // back to the main thread, so they must match the synchronous classify / solveReal.
    const cla = await st.classifyAsync(null, {});
    ok('classifyAsync: matches sync classify (main-thread fallback)',
       cla.ok === cl.ok && cla.zeroDim === cl.zeroDim && cla.realCount === cl.realCount && cla.complexCount === cl.complexCount);
    const sra = await st.solveRealAsync(null, {});
    ok('solveRealAsync: matches sync solveReal ok-status (main-thread fallback)',
       typeof sra.ok === 'boolean' && sra.ok === sr.ok);
  }

  // ---- assume-imaginary must drop the real part in the verdict system ----
  // Regression: _reimTransform consulted realVars but not imagVars, so after assumeImaginary
  // (v̄→−v, leaving primal v) the surviving v got the full x+iy split, reintroducing a spurious
  // v__re degree of freedom (Re v should be ≡ 0) and inflating the existence/uniqueness count.
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(QE.generateClassicalBounded(hData));
    const plain = st.currentReimSystem().vars;
    const target = st.baseVariables().find((v) => plain.includes(v + '__re') && plain.includes(v + '__im'));
    ok('assumeImaginary regression: found a genuinely-complex base variable to test', !!target);
    if (target) {
      const r = st.assumeImaginary([target]);
      ok('assumeImaginary: appends a column', r.ok);
      const reimI = st.currentReimSystem();
      ok('assumeImaginary: keeps ' + target + '__im (an imaginary variable’s one real DOF)',
         reimI.vars.includes(target + '__im'));
      ok('assumeImaginary: DROPS ' + target + '__re (Re ≡ 0 — no spurious real DOF)',
         !reimI.vars.includes(target + '__re'));
    }
  }

  // ---- honest labeling: a reality/imaginary verdict is a SPECIALIZATION (a slice), not general ----
  // assumeReal (z̄≡z) / assumeImaginary (z̄≡−z) restrict the system to a SLICE and can drop quadrature
  // domains lying off it, so the existence/uniqueness count is only a LOWER BOUND on the general one.
  // The store must thread the active slice vars onto the classify result (r.realVars / r.imagVars) —
  // that is the DATA the UI keys its "on the real/imaginary slice … lower bound" caveat + the verdict-
  // card ledger + the '*' chip marker off of. (Mirrors the partialBranch factor-case tag below.)
  {
    // General (no assumption): the verdict must NOT be tagged as a slice, so nothing labels it a lower
    // bound — a false caveat would be as dishonest as a missing one.
    const gen = QD.AlgebraStore.create();
    gen.seedFromSystem(QE.generateClassicalBounded(hData));
    const cg = gen.classify();
    ok('honest-labeling: an unspecialized verdict carries empty realVars/imagVars (no false slice tag)',
       Array.isArray(cg.realVars) && cg.realVars.length === 0 && Array.isArray(cg.imagVars) && cg.imagVars.length === 0);

    // Real slice: assumeReal must tag the verdict with the assumed real vars (sync + async paths).
    const sr = QD.AlgebraStore.create();
    sr.seedFromSystem(QE.generateClassicalBounded(hData));
    ok('honest-labeling: assumeReal setup appended a column', sr.assumeReal(sr.baseVariables()).ok);
    const cr = sr.classify();
    // Defensive (x || []): without the store fix these fields are undefined — this degrades to a
    // clean FAIL (the count would silently read as general) rather than a crash.
    ok('honest-labeling: after assumeReal the verdict is tagged real-slice (z₁ ∈ realVars, no imagVars)',
       (cr.realVars || []).includes('z1') && (cr.imagVars || ['x']).length === 0);
    const cra = await sr.classifyAsync(null, {});
    ok('honest-labeling: classifyAsync carries the same real-slice tag (the UI verdict path)',
       (cra.realVars || []).includes('z1') && (cra.imagVars || ['x']).length === 0);

    // Imaginary slice: assumeImaginary must tag the verdict with the assumed imaginary vars, not real.
    const si = QD.AlgebraStore.create();
    si.seedFromSystem(QE.generateClassicalBounded(hData));
    const plainV = si.currentReimSystem().vars;
    const tgt = si.baseVariables().find((v) => plainV.includes(v + '__re') && plainV.includes(v + '__im'));
    if (tgt) {
      ok('honest-labeling: assumeImaginary setup appended a column', si.assumeImaginary([tgt]).ok);
      const ci = si.classify();
      ok('honest-labeling: after assumeImaginary the verdict is tagged imaginary-slice (' + tgt + ' ∈ imagVars, no realVars)',
         (ci.imagVars || []).includes(tgt) && (ci.realVars || ['x']).length === 0);
    }
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

  // ---- external-CAS export (Maple RCTD / Singular) via the shared QD.CASExport ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(QE.generateClassicalBounded(hData));
    // Maple RegularChains, treating the data params a₁/C₁,₁ as PARAMETERS (declared last).
    const maple = st.casColumn(0, 'maple', { params: ['a1', 'ab1', 'C1_1', 'Cb1_1'] });
    ok('cas: Maple export emits a RegularChains script with an RCTD call',
       /with\(RegularChains\)/.test(maple) && /PolynomialRing\(\[/.test(maple) &&
       /RealComprehensiveTriangularize\(sys, \d+, R\)/.test(maple));
    ok('cas: Maple declares the parameters LAST in the ring (unknowns precede a1/C1_1)',
       (() => { const m = /PolynomialRing\(\[([^\]]*)\]/.exec(maple); if (!m) return false; const vars = m[1].split(',').map((s) => s.trim());
         const iz = vars.indexOf('z1'), ia = vars.indexOf('a1'); return iz >= 0 && ia >= 0 && iz < ia; })());
    ok('cas: Maple equalities use "= 0" (RegularChains form), not "== 0"',
       / = 0/.test(maple) && !/== 0/.test(maple));
    // Singular: equality ideal over ℚ(i) with the minpoly.
    const sing = st.casColumn(0, 'singular', {});
    ok('cas: Singular export sets the ℚ(i) ground field and an ideal',
       /minpoly = i\^2\+1/.test(sing) && /ideal Id =/.test(sing) && /std\(Id\)/.test(sing));
    ok('cas: an empty / missing column yields the empty string', st.casColumn(99, 'maple') === '');
    // G11: msolve `.ms` export of the seeded column + variable order + import round-trip
    const ms = st.msolveColumn(0);
    ok('msolve: column 0 exports a .ms system (vars line, characteristic 0, polynomials)',
       /^.+\n0\n/.test(ms) && ms.length > 8);
    const order = st.msolveVarOrder(0);
    ok('msolve: variable order lists the column unknowns (e.g. A1_1)', order.length > 0 && order.indexOf('A1_1') !== -1);
    // i-path: a system with a genuine Gaussian-imaginary coefficient ⇒ i variable + i^2+1
    {
      const S = QD.Sym, mv = (n) => S.mpolyVar(n), mi = (k) => S.mpolyInt(k);
      const Ii = S.mpolyConst(S.gaussInt(0, 1));
      const stC = QD.AlgebraStore.create();
      stC.seedFromSystem({ model: 'conjugate', formulation: 'classical', w0Fixed: null,
        blocks: { locator: [{ eq: Ii.mul(mv('z1')).add(mi(1)), label: 'loc' }], star: [], gauge: [] } }, { withConjugates: false });
      const msC = stC.msolveColumn(0), orderC = stC.msolveVarOrder(0);
      ok('msolve: a Gaussian-imaginary coefficient ⇒ i appended to the var order + i^2+1 in the file',
         orderC[orderC.length - 1] === 'i' && /i\^2\+1/.test(msC));
    }
    const imp = st.importMsolve('[0, [[1, 2]]]', { vars: ['t'] });
    ok('msolve: importMsolve parses an msolve real-solution output', imp.ok && imp.count === 1 && imp.solutions[0].t.approx === 1.5);
    ok('msolve: an empty / missing column yields the empty string', st.msolveColumn(99) === '');
  }

  // ---- RCTD import (the return trip): parseRCTD JSON → importRCTD column ----
  {
    const S = QD.Sym, CAS = QD.CASExport;
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);
    const baseCols = st.maxColumn();
    // A hand-authored 2-cell parametric decomposition fixture (resolvent shape).
    const sv = S.mpolyVar('s'), M0 = S.mpolyVar('M0');
    const chain1 = sv.pow(3).sub(M0.mul(sv.pow(2))).add(S.mpolyInt(2));   // s³ − M0·s² + 2
    const parsed = CAS.parseRCTD(JSON.stringify({
      format: 'qd-rctd', version: 1, params: ['M0'],
      cells: [
        { index: 1, realCount: 1, constraints: [{ terms: M0.termList(), rel: '>' }], chain: [{ terms: chain1.termList() }] },
        { index: 2, realCount: 2, constraints: [{ terms: M0.sub(S.mpolyInt(3)).termList(), rel: '=' }], chain: [{ terms: sv.sub(S.mpolyInt(1)).termList() }] },
      ],
    }));
    const res = st.importRCTD(parsed);
    ok('rctd: importRCTD appends ONE new column for the decomposition',
       res.ok && res.column === baseCols + 1 && res.cellCount === 2);
    const col = st.list().filter((n) => n.column === res.column);
    ok('rctd: every imported node carries op:"rctd" provenance + a cell index',
       col.length === res.created.length && col.length > 0 && col.every((n) => n.provenance.op === 'rctd' && n.provenance.cell != null));
    const c1chain = col.find((n) => n.provenance.cell === 1 && n.meta.role === 'chain');
    ok('rctd: a cell-1 chain node rebuilds the original chain polynomial exactly', c1chain && c1chain.poly.equals(chain1));
    const c1con = col.find((n) => n.provenance.cell === 1 && n.meta.role === 'constraint');
    ok('rctd: the cell-1 parameter constraint M0>0 imports as a ">" node', c1con && c1con.rel === '>');
    ok('rctd: nodes record their cell real-solution count in meta + provenance',
       col.every((n) => n.meta.realCount === 1 || n.meta.realCount === 2) &&
       (c1chain && c1chain.provenance.realCount === 1));
    ok('rctd: the result summarizes per-cell real counts',
       res.cells.length === 2 && res.cells[0].realCount === 1 && res.cells[1].realCount === 2);
    // The whole import is ONE undo step.
    st.undo();
    ok('rctd: the whole import is a single undo step', st.maxColumn() === baseCols);
    // A bare cells array is also accepted; an empty decomposition is reported, not thrown.
    const res2 = st.importRCTD(parsed.cells);
    ok('rctd: importRCTD also accepts a bare cells array', res2.ok && res2.cellCount === 2);
    const res3 = st.importRCTD({ cells: [] });
    ok('rctd: an empty decomposition → ok:false (nothing imported)', !res3.ok);
  }

  // ---- auto-infer variable symmetries (detectVariableRelations: real / imaginary / identify) ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);                                   // disk, with conjugate companions
    const hits = st.detectVariableRelations();
    const a11 = hits.find((h) => h.varName === 'A1_1');
    ok('detect-sym: the gauge A₁,₁ − Ā₁,₁ = 0 flags A₁,₁ as forced real',
       !!a11 && a11.kind === 'real');
    const gauge = st.list().find((n) => n.meta.block === 'gauge');
    ok('detect-sym: the flagged equation is the gauge node', a11 && a11.nodeId === gauge.id);
    const locator = st.list().find((n) => n.meta.block === 'locator' && n.provenance.op === 'generate');
    ok('detect-sym: the (non v−v̄) locator equation is NOT flagged',
       !hits.some((h) => h.nodeId === locator.id));
    const ar = st.assumeReal(['A1_1']);
    ok('detect-sym: after assumeReal(A₁,₁), it is no longer detected',
       ar.ok && !st.detectVariableRelations().some((h) => h.varName === 'A1_1'));

    // IMAGINARY detection: a hand-crafted system whose equation is z₁ + z̄₁ = 0 ⇒ z₁ imaginary.
    const S = QD.Sym, z1 = S.mpolyVar('z1'), zb1 = S.mpolyVar('zb1');
    const sysImag = { model: 'conjugate', w0Fixed: null, blocks: { locator: [{ eq: z1.add(zb1), label: 'test z₁+z̄₁' }], star: [], gauge: [] } };
    const sti = QD.AlgebraStore.create(); sti.seedFromSystem(sysImag);
    const ih = sti.detectVariableRelations().find((h) => h.kind === 'imaginary');
    ok('detect-sym: z₁ + z̄₁ = 0 is flagged as IMAGINARY (z₁)', !!ih && ih.varName === 'z1');
    // IDENTIFY detection: a hand-crafted system z₁ − z₂ = 0 ⇒ identify z₁ = z₂.
    const z2 = S.mpolyVar('z2');
    const sysId = { model: 'conjugate', w0Fixed: null, blocks: { locator: [{ eq: z1.sub(z2), label: 'test z₁−z₂' }], star: [], gauge: [] } };
    const stid = QD.AlgebraStore.create(); stid.seedFromSystem(sysId);
    const idh = stid.detectVariableRelations().find((h) => h.kind === 'identify');
    ok('detect-sym: z₁ − z₂ = 0 is flagged as IDENTIFY (keep z1, drop z2, sign +1)',
       !!idh && idh.keep === 'z1' && idh.drop === 'z2' && idh.sign === 1);
    // LINEAR (non-unit ratio between distinct primal vars) — FLAGGED, not identifiable as ±.
    const sysLin = { model: 'conjugate', w0Fixed: null, blocks: { locator: [{ eq: S.mpolyInt(2).mul(z1).sub(S.mpolyInt(3).mul(z2)), label: '2z₁−3z₂' }], star: [], gauge: [] } };
    const stl = QD.AlgebraStore.create(); stl.seedFromSystem(sysLin);
    const lh = stl.detectVariableRelations();
    ok('detect-sym: 2z₁ − 3z₂ = 0 is flagged as LINEAR (non-unit), NOT identify',
       lh.some((h) => h.kind === 'linear' && h.vars.indexOf('z1') !== -1 && h.vars.indexOf('z2') !== -1) &&
       !lh.some((h) => h.kind === 'identify'));
    // CONJUGATE-POLE-PAIR (z₂ = z̄₁: a primal var equals another index's conjugate) — FLAGGED.
    const sysCp = { model: 'conjugate', w0Fixed: null, blocks: { locator: [{ eq: z2.sub(zb1), label: 'z₂−z̄₁' }], star: [], gauge: [] } };
    const stc = QD.AlgebraStore.create(); stc.seedFromSystem(sysCp);
    const ch = stc.detectVariableRelations().find((h) => h.kind === 'conjugate-pair');
    ok('detect-sym: z₂ − z̄₁ = 0 is flagged as CONJUGATE-POLE-PAIR (z₂ ↔ conj z₁)',
       !!ch && ((ch.var === 'z2' && ch.other === 'z1') || (ch.var === 'z1' && ch.other === 'z2')));
  }

  // ---- assumeImaginary (v̄ ≡ −v substitution fold) ----
  {
    const S = QD.Sym, z1 = S.mpolyVar('z1'), zb1 = S.mpolyVar('zb1');
    // System with an equation carrying z̄₁ so the fold is observable: z₁·z̄₁ − 1 = 0.
    const sys = { model: 'conjugate', w0Fixed: null, blocks: { locator: [{ eq: z1.mul(zb1).sub(S.mpolyInt(1)), label: '|z₁|²−1' }], star: [], gauge: [] } };
    const st = QD.AlgebraStore.create(); st.seedFromSystem(sys);
    const r = st.assumeImaginary(['z1']);
    ok('assume-imag: appends a new column with op:assume-imaginary',
       r.ok && r.column === 1 && r.created.every((n) => n.provenance.op === 'assume-imaginary'));
    // z₁·z̄₁ with z̄₁→−z₁ becomes −z₁², so the equation is −z₁² − 1 = 0 (no z̄₁ left).
    const node = st.list().find((n) => n.column === 1 && n.rel === '=');
    const expect = z1.mul(z1).neg().sub(S.mpolyInt(1));
    ok('assume-imag: z̄₁ folded to −z₁ (|z₁|²−1 ⇒ −z₁²−1, no z̄₁)',
       node && !node.poly.vars().has('zb1') && node.poly.equals(expect));
    ok('assume-imag: the assumption is recorded (re-detect no longer flags z₁ imaginary)',
       !st.detectVariableRelations().some((h) => h.kind === 'imaginary' && h.varName === 'z1'));
  }

  // ---- identifyVariables (substitute drop = ±keep, conjugates too) ----
  {
    const S = QD.Sym, z1 = S.mpolyVar('z1'), z2 = S.mpolyVar('z2'), zb2 = S.mpolyVar('zb2');
    const sys = { model: 'conjugate', w0Fixed: null, blocks: { locator: [{ eq: z2.add(zb2).sub(S.mpolyInt(1)), label: 'z₂+z̄₂−1' }], star: [], gauge: [] } };
    const st = QD.AlgebraStore.create(); st.seedFromSystem(sys);
    const r = st.identifyVariables('z1', 'z2', 1);              // z₂ → z₁ (and z̄₂ → z̄₁)
    ok('identify: appends a column substituting z₂→z₁ and z̄₂→z̄₁',
       r.ok && r.column === 1 && r.created.every((n) => n.provenance.op === 'identify'));
    const node = st.list().find((n) => n.column === 1 && n.rel === '=');
    const zb1 = S.mpolyVar('zb1');
    ok('identify: z₂,z̄₂ replaced by z₁,z̄₁ (z₁+z̄₁−1, no z₂/z̄₂)',
       node && !node.poly.vars().has('z2') && !node.poly.vars().has('zb2') &&
       node.poly.equals(z1.add(zb1).sub(S.mpolyInt(1))));
  }

  // ---- propagateNode: carry a column-0 node into the current system with assumptions applied ----
  {
    const S = QD.Sym, z1 = S.mpolyVar('z1'), zb1 = S.mpolyVar('zb1');
    // (a) REALITY propagation: a column-0 equation with z̄₁; assumeReal(z₁) makes column 1.
    const sys = { model: 'conjugate', w0Fixed: null, blocks: { locator: [{ eq: z1.mul(zb1).sub(S.mpolyInt(1)), label: '|z₁|²−1' }], star: [], gauge: [] } };
    const st = QD.AlgebraStore.create(); st.seedFromSystem(sys, { withConjugates: false });
    const col0 = st.list().find((n) => n.column === 0);
    st.assumeReal(['z1']);                                       // column 1: z̄₁ → z₁ ⇒ z₁² − 1
    const r = st.propagateNode(col0.id);
    ok('propagate: a column-0 node lands in the current (last) column',
       r.ok && r.column === st.maxColumn() && r.node.provenance.op === 'propagate' && r.node.provenance.from === 0);
    ok('propagate: reality was applied (z̄₁ folded to z₁ ⇒ z₁²−1, no z̄₁)',
       !r.node.poly.vars().has('zb1') && r.node.poly.equals(z1.mul(z1).sub(S.mpolyInt(1))) && r.applied.indexOf('reality') !== -1);
    ok('propagate: a node already in the current column is rejected',
       !st.propagateNode(r.node.id).ok);

    // (b) PINNED-VALUE propagation: a column-0 equation A₁,₁ + z₁; substitute z₁ = 2 makes column 1.
    const A11 = S.mpolyVar('A1_1');
    const sys2 = { model: 'conjugate', w0Fixed: null, blocks: { locator: [{ eq: A11.add(z1), label: 'A₁,₁+z₁' }], star: [], gauge: [] } };
    const st2 = QD.AlgebraStore.create(); st2.seedFromSystem(sys2, { withConjugates: false });
    const c0 = st2.list().find((n) => n.column === 0);
    st2.substituteValues([{ varName: 'z1', value: { re: 2, im: 0 } }], { propagate: false });
    const r2 = st2.propagateNode(c0.id);
    ok('propagate: a pinned constant (z₁=2) is substituted into the propagated constraint (A₁,₁+2)',
       r2.ok && !r2.node.poly.vars().has('z1') && r2.node.poly.equals(A11.add(S.mpolyInt(2))) && r2.applied.indexOf('pinned values') !== -1);
    const before = st2.size;
    st2.undo();
    ok('propagate: the propagation is a single undo step', st2.size === before - 1);
  }

  // ---- propagateAllConstraints: batch every constraint into the current system ----
  {
    // no reduction column yet ⇒ nothing to propagate THROUGH
    const st0 = QD.AlgebraStore.create(); st0.seedFromSystem(system); st0.addConstraint('localUniv', hData);
    ok('propagate-all: no reduction column ⇒ ok:false', !st0.propagateAllConstraints().ok);
    // realistic order: REDUCE first (a reduction re-emits the current column), THEN add a
    // constraint — it lands at column 0, STRANDED behind the reduction, so it must be propagated.
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);
    st.assumeReal(st.baseVariables());                           // column 1 (the current system; no constraints)
    const made = st.addConstraint('localUniv', hData);           // constraint node(s) at column 0 (stranded)
    ok('propagate-all: addConstraint seeded ≥1 constraint at column 0', made.length >= 1 &&
       st.list().some((n) => n.kind === 'constraint' && n.column === 0));
    const before = st.size, last = st.maxColumn();
    const r = st.propagateAllConstraints();
    ok('propagate-all: lands the stranded constraint(s) in the current column with op:propagate',
       r.ok && r.column === last && r.count >= 1 &&
       st.list().filter((n) => n.column === last && n.provenance.op === 'propagate').length === r.count);
    st.undo();
    ok('propagate-all: the whole batch is one undo step', st.size === before);
  }

  // ---- identifyVariables with a general (non-unit) Gaussian ratio ----
  {
    const S = QD.Sym, z1 = S.mpolyVar('z1'), z2 = S.mpolyVar('z2'), zb2 = S.mpolyVar('zb2'), zb1 = S.mpolyVar('zb1');
    // System carrying z₂ (and z̄₂) in a SEPARATE equation so the substitution is observable.
    const sys = { model: 'conjugate', w0Fixed: null, blocks: { locator: [{ eq: z2.add(zb2).sub(S.mpolyInt(1)), label: 'z₂+z̄₂−1' }], star: [], gauge: [] } };
    const st = QD.AlgebraStore.create(); st.seedFromSystem(sys, { withConjugates: false });
    const ratio = { re: ['2', '3'], im: ['0', '1'] };            // z₂ = (2/3)·z₁
    const r = st.identifyVariables('z1', 'z2', ratio);
    const node = st.list().find((n) => n.column === 1 && n.rel === '=');
    const twoThird = S.mpolyConst(S.gauss(S.rat(2n, 3n), S.rat(0n, 1n)));
    ok('identify-ratio: z₂→(2/3)z₁ and z̄₂→(2/3)z̄₁ (no z₂/z̄₂ left)',
       r.ok && node && !node.poly.vars().has('z2') && !node.poly.vars().has('zb2') &&
       node.poly.equals(z1.mul(twoThird).add(zb1.mul(twoThird)).sub(S.mpolyInt(1))));
    // back-compat: the ±1 sign contract still works
    const st2 = QD.AlgebraStore.create(); st2.seedFromSystem({ model: 'conjugate', w0Fixed: null, blocks: { locator: [{ eq: z2.add(zb2) }], star: [], gauge: [] } }, { withConjugates: false });
    ok('identify-ratio: the ±1 sign contract is preserved (identifyVariables(.,.,1))',
       st2.identifyVariables('z1', 'z2', 1).ok);
    // the detector supplies a ratio whose apply reproduces the substitution
    const st3 = QD.AlgebraStore.create();
    st3.seedFromSystem({ model: 'conjugate', w0Fixed: null, blocks: { locator: [{ eq: S.mpolyInt(2).mul(z1).sub(S.mpolyInt(3).mul(z2)), label: '2z₁−3z₂' }, { eq: z2.sub(S.mpolyInt(5)) }], star: [], gauge: [] } }, { withConjugates: false });
    const lh = st3.detectVariableRelations().find((h) => h.kind === 'linear');
    const ra = st3.identifyVariables(lh.vars[0], lh.vars[1], lh.ratio);   // drop z2 = (2/3) z1
    ok('identify-ratio: detector ratio applied drops z₂ (z₂=5 ⇒ (2/3)z₁−5)', ra.ok &&
       !st3.list().some((n) => n.column === ra.column && n.poly.vars().has('z2')));
  }

  // ---- applyConjugatePair: var = ratio·conj(other) ----
  {
    const S = QD.Sym, z2 = S.mpolyVar('z2'), zb2 = S.mpolyVar('zb2'), z1 = S.mpolyVar('z1'), zb1 = S.mpolyVar('zb1');
    const sys = { model: 'conjugate', w0Fixed: null, blocks: { locator: [{ eq: z2.add(zb2).sub(S.mpolyInt(1)), label: 'z₂+z̄₂−1' }], star: [], gauge: [] } };
    const st = QD.AlgebraStore.create(); st.seedFromSystem(sys, { withConjugates: false });
    const r = st.applyConjugatePair('z2', 'z1', 1);              // z₂ = z̄₁ ⇒ z₂→z̄₁, z̄₂→z₁
    const node = st.list().find((n) => n.column === 1 && n.rel === '=');
    ok('conj-pair apply: z₂→z̄₁ and z̄₂→z₁ (z̄₁+z₁−1, no z₂/z̄₂)',
       r.ok && node && !node.poly.vars().has('z2') && !node.poly.vars().has('zb2') &&
       node.poly.equals(zb1.add(z1).sub(S.mpolyInt(1))));
    // detector ratio for a conjugate-pair relation reproduces the pairing
    const st2 = QD.AlgebraStore.create();
    st2.seedFromSystem({ model: 'conjugate', w0Fixed: null, blocks: { locator: [{ eq: z2.sub(zb1), label: 'z₂−z̄₁' }, { eq: z2.add(zb2) }], star: [], gauge: [] } }, { withConjugates: false });
    const ch = st2.detectVariableRelations().find((h) => h.kind === 'conjugate-pair');
    const ra = st2.applyConjugatePair(ch.var, ch.other, ch.ratio);
    ok('conj-pair apply: detector ratio drops z₂ via the conjugate pairing', ra.ok &&
       !st2.list().some((n) => n.column === ra.column && n.poly.vars().has('z2')));
  }

  // ---- per-equation Generate conjugate (generateConjugate) ----
  {
    const QC = QD.QDConstraints;
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system, { withConjugates: false });        // no seed-time companions
    const locator = st.list().find((n) => n.meta.block === 'locator');
    const before = st.size;
    const r = st.generateConjugate(locator.id);
    ok('gen-conj: a non-self-conjugate equation gets its conjugate companion',
       r.ok && st.size === before + 1 && r.node.provenance.op === 'conjugate' && r.node.column === locator.column);
    ok('gen-conj: the companion equals conjMPoly(p) (no reality assumed yet)',
       r.node.poly.equals(QC.conjMPoly(locator.poly)));
    const gauge = st.list().find((n) => n.meta.block === 'gauge');
    const rg = st.generateConjugate(gauge.id);
    ok('gen-conj: the self-conjugate gauge reports ok:false (no independent conjugate)',
       !rg.ok && /self-conjugate/.test(rg.reason || ''));
    st.undo();
    ok('gen-conj: the add is a single undo step', st.size === before);
    // After assuming z₁ real, the generated conjugate folds z̄₁ → z₁ (no bar appears).
    const st2 = QD.AlgebraStore.create();
    st2.seedFromSystem(system, { withConjugates: false });
    st2.assumeReal(['z1']);
    const loc2 = st2.list().find((n) => n.column === st2.maxColumn() && n.poly.vars().has('z1'));
    const r2 = st2.generateConjugate(loc2.id);
    ok('gen-conj: with z₁ real, the conjugate folds in reality (no z̄₁ in the companion)',
       r2.ok && !r2.node.poly.vars().has('zb1'));
  }

  // ---- Schwarz-function formulation seeds cleanly (system.formulation threaded) ----
  {
    const S = QD.Sym;
    const swSys = QE.generateSchwarzBounded(hData);
    ok('schwarz-seed: generator tags the system formulation:schwarz', swSys.formulation === 'schwarz');
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(swSys);
    ok('schwarz-seed: store.formulation reflects the seeded system', st.formulation === 'schwarz');
    ok('schwarz-seed: same node count as the classical seed (●+★_S+gauge incl. conjugates)',
       st.size === swSys.counts.realEquations);
    ok('schwarz-seed: conjugate companions still added (locator + star)',
       st.list().filter((n) => n.provenance.op === 'conjugate').length === 2);
    ok('schwarz-seed: exportDAG carries the formulation', st.exportDAG().formulation === 'schwarz');
    // a reduction column then undo preserves/restores the formulation tag
    st.assumeReal(st.baseVariables());
    ok('schwarz-seed: formulation survives a reduction', st.formulation === 'schwarz');
    st.undo();
    ok('schwarz-seed: formulation survives undo', st.formulation === 'schwarz');
    // a hand-crafted schwarz system (the test idiom) also tags through
    const z2 = S.mpolyVar('z2'), zb2 = S.mpolyVar('zb2');
    const st2 = QD.AlgebraStore.create();
    st2.seedFromSystem({ model: 'conjugate', formulation: 'schwarz', w0Fixed: null,
      blocks: { locator: [{ eq: z2.add(zb2), label: 'test' }], star: [], gauge: [] } }, { withConjugates: false });
    ok('schwarz-seed: hand-crafted formulation:schwarz is honored', st2.formulation === 'schwarz');
    // and the default (no formulation field) stays classical
    const st3 = QD.AlgebraStore.create();
    st3.seedFromSystem({ model: 'conjugate', w0Fixed: null,
      blocks: { locator: [{ eq: z2.add(zb2) }], star: [], gauge: [] } }, { withConjugates: false });
    ok('schwarz-seed: omitted formulation defaults to classical', st3.formulation === 'classical');
  }

  // ---- solveForVariable: closed-form (radical) solve of a single node --------
  {
    const S = QD.Sym, SR = QD.SymRadical;
    const x = S.mpolyVar('z1'), a = S.mpolyVar('A1_1'), b = S.mpolyVar('a1');
    // seed a hand-crafted quadratic in z1: A1_1·z1² + a1·z1 + 1 = 0
    const st = QD.AlgebraStore.create();
    st.seedFromSystem({ model: 'conjugate', w0Fixed: null,
      blocks: { locator: [{ eq: a.mul(x.pow(2)).add(b.mul(x)).add(S.mpolyInt(1)), label: 'quad' }], star: [], gauge: [] } },
      { withConjugates: false });
    const node = st.list().find((n) => n.poly.vars().has('z1'));
    const r = st.solveForVariable(node.id, 'z1');
    ok('solveForVariable: solves the quadratic (2 roots, verified)',
       r.ok && r.count === 2 && r.verify.checked > 0 && r.verify.maxResidual < 1e-6,
       r.ok ? ('maxRel=' + r.verify.maxResidual.toExponential(2)) : r.reason);
    ok('solveForVariable: roots render to LaTeX via radicalToLatex',
       r.ok && /\\sqrt/.test(SR.radicalToLatex(r.roots[0], null, S)));
    // a variable not present ⇒ ok:false
    const r2 = st.solveForVariable(node.id, 'zb9');
    ok('solveForVariable: absent variable ⇒ ok:false', !r2.ok);
    // a non-equality (inequality) node ⇒ ok:false
    const st2 = QD.AlgebraStore.create();
    st2.seedFromSystem({ model: 'conjugate', w0Fixed: null,
      blocks: { locator: [{ eq: a.mul(x.pow(2)).add(b.mul(x)).add(S.mpolyInt(1)) }], star: [], gauge: [] } },
      { withConjugates: false });
    const nn = st2.list()[0];
    if (nn) { nn.rel = '>'; const r3 = st2.solveForVariable(nn.id, 'z1');
      ok('solveForVariable: inequality node ⇒ ok:false', !r3.ok); }
  }

  // ---- branching: parallel derivation tracks (A1) ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);
    ok('tracks: fresh seed has one track t0 active', st.tracks().length === 1 && st.activeTrack === 't0');

    const fk = st.forkTrack();                              // fork from t0 column 0
    ok('tracks: forkTrack creates a new active branch', fk.ok && fk.track !== 't0' && st.activeTrack === fk.track && st.tracks().length === 2);
    ok('tracks: the fork starts at column 0 (copied system)', st.maxColumn() === 0 && st.columns().length === 1);
    const forkNodes = st.list().filter((n) => n.track === fk.track);
    const srcCol0 = st.list().filter((n) => n.track === 't0' && n.column === 0);
    ok('tracks: fork copied the source column (matching node count > 0)', forkNodes.length === srcCol0.length && forkNodes.length > 0);
    ok('tracks: fork copies are fresh op:fork nodes linked to their source',
       forkNodes.every((n) => n.provenance.op === 'fork') &&
       forkNodes.every((n) => srcCol0.some((s) => s.id === n.provenance.inputs[0])) &&
       forkNodes.every((n) => !srcCol0.some((s) => s.id === n.id)));

    st.assumeReal(st.baseVariables());                      // a reduction on the ACTIVE (fork) track
    ok('tracks: a reduction appends to the active (fork) branch', st.maxColumn() === 1);
    ok('tracks: setActiveTrack switches branch; the main track is untouched',
       st.setActiveTrack('t0') && st.activeTrack === 't0' && st.maxColumn() === 0);

    const ex = st.exportDAG();
    ok('tracks: exportDAG carries tracks + activeTrack + per-node track',
       Array.isArray(ex.tracks) && ex.tracks.length === 2 && typeof ex.activeTrack === 'string' && ex.nodes.every((n) => typeof n.track === 'string'));

    // undo removes a freshly-forked branch and restores the active track
    const st2t = QD.AlgebraStore.create(); st2t.seedFromSystem(system);
    st2t.forkTrack();
    ok('tracks: pre-undo there are two tracks', st2t.tracks().length === 2);
    st2t.undo();
    ok('tracks: undo removes the forked branch + restores active t0',
       st2t.tracks().length === 1 && st2t.activeTrack === 't0' && !st2t.list().some((n) => n.track && n.track !== 't0'));

    // deleteTrack: removes a non-main branch, refuses the main one
    const st3 = QD.AlgebraStore.create(); st3.seedFromSystem(system);
    const f3 = st3.forkTrack();
    const del = st3.deleteTrack(f3.track);
    ok('tracks: deleteTrack removes a non-main branch + falls back to t0',
       del.ok && st3.tracks().length === 1 && st3.activeTrack === 't0' && !st3.list().some((n) => n.track === f3.track));
    ok('tracks: deleteTrack refuses the main track t0', !st3.deleteTrack('t0').ok);

    // cross-branch elimination is refused
    const st4 = QD.AlgebraStore.create(); st4.seedFromSystem(system);
    const a0 = st4.currentColumnIds()[0];
    const f4 = st4.forkTrack();
    const b1 = st4.list().find((n) => n.track === f4.track && n.rel === '=').id;
    const er = st4.eliminate(a0, b1, st4.variables()[0]);
    ok('tracks: eliminate refuses a cross-branch node pair', !er.ok && /one branch/.test(er.reason || ''));

    // regression: a store that never forks behaves exactly as before (single track t0)
    const st5 = QD.AlgebraStore.create(); st5.seedFromSystem(system);
    st5.assumeReal(st5.baseVariables());
    ok('tracks: no-fork store stays single-track with the usual columns', st5.tracks().length === 1 && st5.activeTrack === 't0' && st5.maxColumn() >= 1);
  }

  // ---- per-track assumptions (C3): reality / imaginary / fixed-φ(0) scoped per branch ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(system);
    st.assumeReal(['z1']);                                  // main branch: z1 real
    ok('C3: the main branch records its reality assumption', st.realVars.includes('z1'));
    const fk = st.forkTrack();                              // fork inherits z1-real at fork time
    ok('C3: a fork inherits the parent assumptions at fork time', st.realVars.includes('z1'));
    st.assumeReal(['a1']);                                  // fork-only: also a1 real
    ok('C3: an assumption on the fork is recorded on the fork', st.realVars.includes('z1') && st.realVars.includes('a1'));
    st.setActiveTrack('t0');
    ok('C3: the main branch did NOT gain the fork-only assumption', st.realVars.includes('z1') && !st.realVars.includes('a1'));
    st.setActiveTrack(fk.track);
    ok('C3: switching back to the fork restores its own assumptions', st.realVars.includes('a1'));

    // w0Fixed is per-track too
    const stw = QD.AlgebraStore.create(); stw.seedFromSystem(system);
    stw.forkTrack();
    const rw = stw.fixW0({ re: 0, im: 0 });
    const forkHasW0 = rw.ok && !!stw.w0Fixed;
    stw.setActiveTrack('t0');
    ok('C3: fixW0 on a fork sets w0Fixed on the fork but NOT on main', forkHasW0 && stw.w0Fixed === null);

    // the headline: each branch's reim system uses ITS OWN reality (resolved from the node ids),
    // regardless of which branch is active — so an off-screen branch classifies correctly (A6).
    const stc = QD.AlgebraStore.create(); stc.seedFromSystem(system);
    const fc = stc.forkTrack();
    stc.assumeReal(['z1']);                                 // fork-only: z1 real
    const mainIds = stc.orderedColumn(stc.maxColumn('t0'), 't0').map((n) => n.id);
    const forkIds = stc.orderedColumn(stc.maxColumn(fc.track), fc.track).map((n) => n.id);
    const mainReim = stc.reimVariables(mainIds);            // active is the fork, but ids resolve to main
    const forkReim = stc.reimVariables(forkIds);
    ok('C3: reim resolves each branch\'s own reality (z1 imag part present on main, absent on the z1-real fork)',
       mainReim.includes('z1__im') && !forkReim.includes('z1__im'));

    // knownValues is branch-scoped: a value pinned on a fork does not leak to main
    const stk = QD.AlgebraStore.create(); stk.seedFromSystem(system);
    const fkk = stk.forkTrack();
    stk.substituteValue('A1_1', { re: 1, im: 0 }, { propagate: false });   // pin on the fork
    const forkKnown = stk.knownValues();
    const mainKnown = stk.knownValues('t0');
    ok('C3: knownValues is branch-scoped (pinned on the fork, absent on main)',
       forkKnown.A1_1 && !mainKnown.A1_1 && fkk.ok);
  }

  // ---- session save/load: exportDAG → importDAG round-trip (E1) ----
  {
    const a = QD.AlgebraStore.create();
    a.seedFromSystem(system);
    a.assumeReal(['z1']);                  // a reduction column + an assumption on t0
    const fk = a.forkTrack();              // a 2nd branch (inherits z1-real), now active
    a.assumeImaginary(['a1']);             // a fork-only assumption
    const dump = a.exportDAG();

    const b = QD.AlgebraStore.create();
    const r = b.importDAG(dump);
    ok('E1: importDAG ok with the right node/track counts', r.ok && r.nodes === a.list().length && r.tracks === a.tracks().length);
    ok('E1: round-trip preserves the active branch + its assumptions (z1 real, a1 imaginary on the fork)',
       b.activeTrack === a.activeTrack && b.realVars.includes('z1') && b.imagVars.includes('a1') &&
       JSON.stringify(b.realVars) === JSON.stringify(a.realVars) && JSON.stringify(b.imagVars) === JSON.stringify(a.imagVars));
    ok('E1: re-export is byte-identical to the import (idempotent)', JSON.stringify(b.exportDAG()) === JSON.stringify(dump));
    // a node polynomial round-trips EXACTLY (same MPoly, column, track, rel)
    const an = a.list()[0], bn = b.get(an.id);
    ok('E1: a node polynomial round-trips exactly', !!bn && bn.poly.equals(an.poly) && bn.column === an.column && (bn.track || 't0') === (an.track || 't0') && bn.rel === an.rel);
    ok('E1: edges round-trip', b.edges.length === a.edges.length);
    // main branch keeps ITS assumptions (z1 real, but NOT a1 imaginary — that was fork-only)
    b.setActiveTrack('t0');
    ok('E1: the main branch round-trips its own assumptions (z1 real, a1 not imaginary)', b.realVars.includes('z1') && !b.imagVars.includes('a1'));
    // importDAG is undoable (restores the empty store)
    b.undo();
    ok('E1: importDAG is undoable (back to empty)', b.size === 0);
    // garbage input is rejected, not thrown
    ok('E1: importDAG rejects non-DAG input', !QD.AlgebraStore.create().importDAG({ foo: 1 }).ok);
  }

  // ---- reproducible SymPy derivation script (E4) ----
  {
    const a = QD.AlgebraStore.create();
    a.seedFromSystem(system);
    a.assumeReal(['z1']);                  // a substitution-family step → recomputed via .subs
    const py = a.sympyDerivation();
    ok('E4: sympy script has the imports + a symbols() declaration', /from sympy import symbols, Rational, I, expand, groebner/.test(py) && /= symbols\(/.test(py));
    ok('E4: sympy script defines col0 (the original system)', /col0 = \[/.test(py));
    ok('E4: a reality step is RECOMPUTED via .subs from the previous column',
       /SUBS1 = \{[^}]*zb1: z1/.test(py) && /col1 = \[q for q in \(expand\(p\.subs\(SUBS1\)\) for p in col0\)/.test(py));
    ok('E4: coefficients are exact (no bare float division outside Rational(...))', !/\d\/\d/.test(py.replace(/Rational\([^)]*\)/g, '')));
    // a Gröbner column is given as literals (engine reduction — not a one-liner subs)
    const g = QD.AlgebraStore.create(); g.seedFromSystem(system); g.assumeReal(g.baseVariables());
    const gr = g.groebner(g.currentColumnIds(), { order: 'grevlex' });
    if (gr && gr.ok) {
      const py2 = g.sympyDerivation();
      ok('E4: a Gröbner step is emitted as exact literals (not a subs)', /-- Groebner/.test(py2) && /engine reduction; the exact stored result/.test(py2));
    } else { ok('E4: (Gröbner step skipped — reduction unavailable)', true); }
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
    // classify on a factor "case" column flags partialBranch (counts are for ONE branch)
    const cl = st.classify();
    ok('factor: classify on a case column reports partialBranch with the case count',
       cl.partialBranch === true && cl.caseCount === ap.factorCount && cl.caseIndex === 0);

    // undo after applyFactor restores the pre-factor column, then the OTHER case can be pursued
    st.undo();
    ok('factor: undo removes the case column', st.maxColumn() === beforeCols);
    if (fr.factors.length >= 2) {
      const ap2 = st.applyFactor(target.id, 1);
      ok('factor: after undo, a different case can be applied', ap2.ok && ap2.column === beforeCols + 1 &&
         st.list().some((n) => n.column === ap2.column && n.provenance.op === 'factor' && n.provenance.caseIndex === 1));
    }
  }
};
