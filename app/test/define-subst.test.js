'use strict';
// =============================================================================
// define-subst tests — custom user-defined variable substitutions in the Algebra
// store (defineSubstitution / detectSubstitutions). Covers the three regimes
// (linear / monomial / general-ideal), the t/t̄ conjugate-pair registration
// overlay, the auto-suggestion detectors, undo, and DAG round-trip. The exact
// correctness anchor is the algebraic ROUND-TRIP: substituting the new symbol
// back to its definition recovers the original polynomial (MPoly.equals).
// =============================================================================
require('./bootstrap');
loadInCtx('sym-core.js');
loadInCtx('faber-analysis.js');
loadInCtx('algebra/sym-worker.js');
loadInCtx('qd-equations.js');
loadInCtx('qd-constraints.js');
loadInCtx('algebra/cas-export.js');
loadInCtx('algebra/expr-parser.js');
loadInCtx('algebra/algebra-store.js');

module.exports = async function run() {
  section('define-subst — custom user-defined variable substitutions');
  const S = QD.Sym, P = QD.ExprParser;
  ok('store exposes defineSubstitution / detectSubstitutions',
     typeof QD.AlgebraStore.create().defineSubstitution === 'function' &&
     typeof QD.AlgebraStore.create().detectSubstitutions === 'function');

  const mkSys = (eqs) => ({ model: 'conjugate', blocks: { locator: eqs.map((eq, i) => ({ eq, label: 'e' + i })), star: [], gauge: [] } });
  const parse = (s, vars) => P.parse(s, vars, S);

  // ---- MONOMIAL regime: s := w1^2 (the cardioid-resolvent reduction) ----
  {
    const st = QD.AlgebraStore.create();
    const orig = parse('w1^2 + A1_1', ['w1', 'A1_1']);
    st.seedFromSystem(mkSys([orig]), { withConjugates: false });
    const r = st.defineSubstitution('s', parse('w1^2', ['w1', 'A1_1']));
    ok('monomial: regime detected', r.ok && r.regime === 'monomial', r.reason || ('regime=' + r.regime));
    const node = (r.created || []).find((n) => n.rel === '=');
    ok('monomial: w1 eliminated, s introduced', node && node.poly.equals(parse('s + A1_1', ['s', 'A1_1'])));
    ok('monomial: round-trip subst({s: w1^2}) recovers the original',
       node && node.poly.subst({ s: parse('w1^2', ['w1']) }).equals(orig));
    ok('monomial: w1 fully gone ⇒ no defining node emitted', (r.created || []).length === 1);
  }

  // ---- MONOMIAL non-rewritable node ⇒ carried + a defining node ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(mkSys([parse('w1^2 + 1', ['w1']), parse('w1^3 + w1', ['w1'])]), { withConjugates: false });
    const r = st.defineSubstitution('s', parse('w1^2', ['w1']));
    ok('monomial carry: ok with a mix of rewritable + non-rewritable', r.ok, r.reason);
    const hasDef = (r.created || []).some((n) => n.provenance && n.provenance.definition);
    ok('monomial carry: odd-power node carried ⇒ defining node s − w1^2 emitted', hasDef);
    const carried = (r.created || []).some((n) => n.provenance && n.provenance.carried);
    ok('monomial carry: the w1^3+w1 node is carried unchanged', carried);
  }

  // ---- MONOMIAL modulus: t := z1*z̄1 = |z1|² (self-conjugate ⇒ real) ----
  {
    const st = QD.AlgebraStore.create();
    const orig = parse('z1*zb1 + A1_1', ['z1', 'zb1', 'A1_1']);
    st.seedFromSystem(mkSys([orig]), { withConjugates: false });
    const r = st.defineSubstitution('t', parse('z1*zb1', ['z1', 'zb1']));
    ok('modulus: regime monomial, t real (no conjugate registered)', r.ok && r.regime === 'monomial');
    const node = (r.created || []).find((n) => n.rel === '=');
    ok('modulus: z1·z̄1 → t round-trips', node && node.poly.subst({ t: parse('z1*zb1', ['z1', 'zb1']) }).equals(orig));
  }

  // ---- LINEAR regime (non-circular, complex g ⇒ t/t̄ registered) ----
  {
    const st = QD.AlgebraStore.create();
    const orig = parse('A1_1 + Ab1_1 + z1*zb1', ['A1_1', 'Ab1_1', 'z1', 'zb1']);
    st.seedFromSystem(mkSys([orig]), { withConjugates: false });
    const r = st.defineSubstitution('t', parse('A1_1 + z1*zb1', ['A1_1', 'z1', 'zb1']));
    ok('linear: regime detected', r.ok && r.regime === 'linear', r.reason || ('regime=' + r.regime));
    const node = (r.created || [])[0];
    const vs = node ? node.poly.vars() : new Set();
    ok('linear: A1_1 and Ā1_1 eliminated, t and t̄ introduced',
       node && !vs.has('A1_1') && !vs.has('Ab1_1') && vs.has('t') && vs.has('tb'));
    const dag = st.exportDAG();
    ok('linear: conjugate pair t↔t̄ registered (in the DAG export)',
       (dag.substConj || []).some(([k, v]) => k === 't' && v === 'tb'));
  }

  // ---- CONJUGATE-SUM u := z1 + z̄1 routes to GENERAL (add-definition), u real ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(mkSys([parse('z1*zb1 - 1', ['z1', 'zb1'])]), { withConjugates: false });
    const before = st.size;
    const r = st.defineSubstitution('u', parse('z1 + zb1', ['z1', 'zb1']));
    ok('conjugate-sum: routed to the general (ideal) regime', r.ok && r.regime === 'general', r.reason || ('regime=' + r.regime));
    const def = (r.created || []).find((n) => n.poly.equals(parse('u - z1 - zb1', ['u', 'z1', 'zb1'])));
    ok('conjugate-sum: adds the defining equation u − z1 − z̄1 = 0', !!def);
    ok('conjugate-sum: u is real ⇒ no conjugate symbol registered', !st.exportDAG().substConj.length);
    ok('conjugate-sum: definition lands in the current column (no orphan)', st.size === before + 1);
  }

  // ---- GENERAL elimination (opts.dropVars) via a block Gröbner basis ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(mkSys([parse('x*y - 1', ['x', 'y']), parse('x + y - 3', ['x', 'y'])]), { withConjugates: false });
    const r = st.defineSubstitution('t', parse('x*y', ['x', 'y']), { regime: 'general', dropVars: ['x'] });
    ok('general-elim: ok', r.ok, r.reason);
    ok('general-elim: every generator is free of the eliminated x',
       (r.created || []).every((n) => !n.poly.vars().has('x')));
    ok('general-elim: t = x·y collapses to t − 1 (since x·y = 1)',
       (r.created || []).some((n) => n.poly.equals(parse('t - 1', ['t']))));
  }

  // ---- validation / guards ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(mkSys([parse('z1 + A1_1', ['z1', 'A1_1'])]), { withConjugates: false });
    ok('guard: collision with an existing variable rejected',
       !st.defineSubstitution('z1', parse('A1_1', ['A1_1'])).ok);
    ok('guard: empty name rejected', !st.defineSubstitution('', parse('z1', ['z1'])).ok);
    ok('guard: an expression variable absent from the system is rejected',
       !st.defineSubstitution('t', S.mpolyVar('qZZ')).ok);
  }

  // ---- auto-suggestion detectors ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(mkSys([parse('z1*zb1 - 1', ['z1', 'zb1']), parse('w1^2 + w1^2*z1*zb1', ['w1', 'z1', 'zb1'])]), { withConjugates: false });
    const hits = st.detectSubstitutions();
    const mod = hits.find((h) => h.kind === 'modulus');
    ok('detect: modulus |z1|² = z1·z̄1 suggested', !!mod && mod.expr.equals(parse('z1*zb1', ['z1', 'zb1'])));
    ok('detect: a modulus hit carries an applicable regime + real flag', !!mod && mod.regime === 'monomial' && mod.real === true);
    const pow = hits.find((h) => h.kind === 'power' && h.expr.equals(parse('w1^2', ['w1'])));
    ok('detect: even-power w1^2 suggested', !!pow);
    // applying a detected hit works end-to-end
    const r = st.defineSubstitution(mod.newVar, mod.expr, { regime: mod.regime });
    ok('detect: applying the modulus suggestion succeeds', r.ok, r.reason);
  }

  // ---- undo restores the conjugate overlay ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(mkSys([parse('A1_1 + Ab1_1 + z1*zb1', ['A1_1', 'Ab1_1', 'z1', 'zb1'])]), { withConjugates: false });
    const before = st.size;
    st.defineSubstitution('t', parse('A1_1 + z1*zb1', ['A1_1', 'z1', 'zb1']));
    ok('undo: define registered the t/t̄ pair', st.exportDAG().substConj.length > 0);
    st.undo();
    ok('undo: size restored', st.size === before);
    ok('undo: conjugate overlay cleared', st.exportDAG().substConj.length === 0);
  }

  // ---- DAG round-trip preserves the conjugate overlay ----
  {
    const st = QD.AlgebraStore.create();
    st.seedFromSystem(mkSys([parse('A1_1 + Ab1_1 + z1*zb1', ['A1_1', 'Ab1_1', 'z1', 'zb1'])]), { withConjugates: false });
    st.defineSubstitution('t', parse('A1_1 + z1*zb1', ['A1_1', 'z1', 'zb1']));
    const dag = st.exportDAG();
    const st2 = QD.AlgebraStore.create();
    const imp = st2.importDAG(dag);
    ok('DAG round-trip: import ok', imp.ok);
    ok('DAG round-trip: t/t̄ overlay restored ⇒ t collides on re-define',
       !st2.defineSubstitution('t', parse('z1', ['z1'])).ok && st2.variables().indexOf('t') !== -1);
  }
};
