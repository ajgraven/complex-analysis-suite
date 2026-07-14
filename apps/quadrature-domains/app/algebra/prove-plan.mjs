// =============================================================================
// prove-plan.mjs — the pure, DOM-free ENGINE for the existence/uniqueness proof
// pipeline (the "fuller orchestrator", Phase A: docs/algebra-review/ORCHESTRATOR_REDESIGN.md).
//
// This is the authoritative genuine-QD verdict path, EXTRACTED verbatim from the
// closures that used to live inside algebra-ui.mjs's doCertifyUnivalence — so it can be
// unit-tested in node and, later (Phase B), driven over a BRANCH TREE. There is NO new
// math here: the exact ℚ(i) per-solution certificate (nodeInsideDisk admissibility →
// verifySolutionExact → Schur–Cohn fold → boundary-simple), the gauge quotient, the
// reconcile oracle, and the numeric cross-check are the same sound pieces, only
// re-expressed as pure functions over an injected `deps` bag + injected async ops.
//
// The engine owns SEQUENCING + the structured ProofResult; algebra-ui.mjs is reduced to a
// thin DOM binding (progress, verdict card, action buttons). Everything the engine needs
// arrives via ctx/deps — it never touches `window`, `activeEnv`, the store closures, or a
// worker directly. See CERTIFY_STAGES for the (introspectable) strategy plan.
//
// deps = { QE, QC, QD, known, w0Fixed, caps:{maxPoleOrder} }
//   QE/QC/QD  the QDEquations / QDConstraints / solver namespaces (data sources, pure use)
//   known     store.knownValues() snapshot — a var's pinned/eliminated value for φ rebuild
//   w0Fixed   store.w0Fixed record (φ(0) pinned) — truthy ⇒ the center/translation gauge
//   caps      { maxPoleOrder } — the generation cap (lastCap)
// oracle = { numPhi, fixW0, w0Sel }  the numeric-solve corroboration (cross-check only)
// =============================================================================

// The strategy plan as DATA — an ordered, introspectable list of stages (each `run` is
// executed by runCertifyPlan, which emits onStage(id) as it enters each). Phase B branches
// within 'filter'/'gauge'; Phase E renders this as a legible transcript.
export const CERTIFY_STAGES = [
  { id: 'regime', title: 'Regime', why: 'Dimension + consistency: inconsistent ⇒ no QD; positive-dimensional ⇒ underdetermined (fix the gauge / pin); zero-dimensional ⇒ a finite count.' },
  { id: 'solve-real', title: 'Solve (real)', why: 'Certified real solutions (RUR + exact Sturm boxes), falling back to the numeric eigenvalue solve when the certified path cannot apply.' },
  { id: 'filter', title: 'Univalence filter', why: 'Per candidate: exact |z_j|<1 admissibility, then the exact fold (φ′≠0 in 𝔻) + boundary-simple tests — a real algebraic solution is a genuine QD only if φ is schlicht on 𝔻.' },
  { id: 'gauge', title: 'Gauge quotient', why: 'Genuine solutions related by a disk rotation are the SAME domain — collapse the raw count to the geometric one.' },
  { id: 'assemble', title: 'Verdict', why: 'Reconcile the certified vs found real count, run the numeric cross-check, and assemble the rigor-badged verdict.' },
];

// Shared numeric reader for a reim solution: <name>__re / <name>__im (an assumed-real var
// has no __im ⇒ 0), falling back to a variable's PINNED/eliminated value (deps.known) when
// it is no longer a solved unknown (e.g. a reduction set z₁=0). Verbatim from algebra-ui.
function makeNum(sol, known) {
  return (name) => {
    const re = sol[name + '__re'];
    if (re) { const im = sol[name + '__im']; return { re: re.re, im: im ? im.re : 0 }; }
    if (known[name]) return { re: known[name].re || 0, im: known[name].im || 0 };
    return undefined;
  };
}

// Reconstruct a numeric bounded-QD map φ from one real reim solution (was
// phiFromAlgebraSolution). null if a map parameter was eliminated (φ can't be rebuilt).
export function reconstructPhi(sol, hData, deps) {
  const num = makeNum(sol, (deps && deps.known) || {});
  let w0 = num('w0');
  if (!w0 && deps && deps.w0Fixed) {                 // φ(0) fixed ⇒ not a solved variable; read its value
    const wf = deps.w0Fixed, rat = (p) => (p ? Number(p[0]) / Number(p[1]) : 0);
    w0 = wf.approx ? { re: wf.approx.re || 0, im: wf.approx.im || 0 } : { re: rat(wf.re), im: rat(wf.im) };
  }
  if (!w0) return null;
  const poles = (hData && hData.poles) || [];
  const branches = [];
  for (let j = 0; j < poles.length; j++) {
    const z = num('z' + (j + 1)); if (!z) return null;
    const A = [], order = (poles[j].principal || []).length;
    for (let k = 1; k <= order; k++) { const a = num('A' + (j + 1) + '_' + k); if (!a) return null; A.push(a); }
    branches.push({ z, A });
  }
  return { unbounded: false, family: 'boundedQD', w0, branches };
}

// Exact-ℚ(i) substitution map for the BARRED pole vars from a candidate's numeric solution
// (was poleSubst): { z̄_j → conj(rat(z_j)), Ā_{j,k} → conj(rat(A_{j,k})) } via QE.ratApprox.
export function poleSubst(sol, hData, deps) {
  const QE = deps && deps.QE, Sym = deps && deps.QD && deps.QD.Sym;
  if (!Sym || !QE || typeof QE.ratApprox !== 'function') return null;
  const num = makeNum(sol, (deps && deps.known) || {});
  const ratG = (v) => { const a = QE.ratApprox(v.re || 0), b = QE.ratApprox(v.im || 0); return Sym.gauss(Sym.rat(a[0], a[1]), Sym.rat(b[0], b[1])); };
  const poles = (hData && hData.poles) || [];
  const sub = {};
  for (let j = 0; j < poles.length; j++) {
    const z = num('z' + (j + 1)); if (!z) return null;
    sub['zb' + (j + 1)] = Sym.mpolyConst(ratG(z).conj());                   // z̄_j = conj(z_j)
    const order = (poles[j].principal || []).length;
    for (let k = 1; k <= order; k++) {
      const a = num('A' + (j + 1) + '_' + k); if (!a) return null;
      sub['Ab' + (j + 1) + '_' + k] = Sym.mpolyConst(ratG(a).conj());       // Ā_{j,k} = conj(A_{j,k})
    }
  }
  return sub;
}

// Exact node-location admissibility gate (was nodeInsideDisk): does every node preimage
// z_j lie STRICTLY inside 𝔻? A z_j on/outside 𝔻 ⇒ φ has a pole at 1/conj(z_j) in 𝔻̄ — not
// a bounded QD. Returns { insideAll, offenders:[{j,onCircle}] } or null (⇒ no gate).
export function nodeInsideDisk(sol, hData, deps) {
  const QE = deps && deps.QE;
  if (!QE || typeof QE.nodeInsideDisk !== 'function') return null;
  const num = makeNum(sol, (deps && deps.known) || {});
  const poles = (hData && hData.poles) || [];
  const offenders = [];
  for (let j = 0; j < poles.length; j++) {
    const z = num('z' + (j + 1)); if (!z) return null;
    let t; try { t = QE.nodeInsideDisk(z.re, z.im); } catch (e) { return null; }
    if (!t.inside) offenders.push({ j: j + 1, onCircle: !!t.onCircle });
  }
  return { insideAll: offenders.length === 0, offenders };
}

// EXACT (Schur–Cohn) local-fold test for one candidate (was schurCohnFold): count the roots
// of num(φ′) inside 𝔻 by Hermitian inertia over ℚ(i). Returns { inside, onCircle, degenerate,
// resolved } or null (⇒ numeric fallback). subOverride = the PF-1 exact-verified barred sub.
export function schurCohnFold(sol, hData, deps, subOverride) {
  const QC = deps && deps.QC, Sym = deps && deps.QD && deps.QD.Sym;
  if (!Sym || !QC || typeof Sym.schurCohn !== 'function' || typeof Sym.uniCoeffs !== 'function' ||
      typeof QC.phiPrimeNumerator !== 'function') return null;
  const sub = subOverride || poleSubst(sol, hData, deps);
  if (!sub) return null;
  let numP; try { numP = QC.phiPrimeNumerator(hData); } catch (e) { return null; }
  try {
    const sc = Sym.schurCohn(Sym.uniCoeffs(numP.subst(sub), 'Z'));          // univariate in ζ (= 'Z')
    return { inside: sc.inside, onCircle: sc.onCircle || 0, degenerate: sc.degenerate, resolved: !!sc.resolved };
  } catch (e) { return null; }
}

// EXACT boundary-injectivity test for one candidate (was boundarySimpleExact): φ(∂𝔻) simple
// ⟺ the real circle double-point count === cusps. Returns { simple } or null (⇒ numeric).
export function boundarySimpleExact(sol, hData, deps, cusps, subOverride) {
  const QC = deps && deps.QC;
  if (!QC || typeof QC.boundaryDoublePointCount !== 'function') return null;
  const sub = subOverride || poleSubst(sol, hData, deps);
  if (!sub) return null;
  let r; try { r = QC.boundaryDoublePointCount(hData, sub); } catch (e) { return null; }
  if (!r || !r.ok) return null;
  return { simple: r.count === (cusps || 0) };
}

// Numeric cross-check (was crossCheckPhis): each reconstructed φ must satisfy the freshly
// regenerated original system (residual ≈ 0) AND match the numeric solver's map (oracle) up
// to the rotation gauge. oracle = { numPhi, w0Sel }. Returns { checked, maxResidual, oracleMatch }.
export function crossCheckPhis(phis, hData, deps, oracle) {
  const QE = deps && deps.QE, QD = deps && deps.QD;
  if (!phis || !phis.length || !QE || typeof QE.residualAtSolution !== 'function') return { checked: false, maxResidual: 0, oracleMatch: false };
  const w0Sel = oracle ? oracle.w0Sel : undefined;
  let system; try { system = QE.generateClassicalBounded(hData, { maxPoleOrder: deps.caps.maxPoleOrder, w0: w0Sel }); } catch (e) { return { checked: false, maxResidual: 0, oracleMatch: false }; }
  let maxResidual = 0;
  for (const phi of phis) { try { const r = QE.residualAtSolution(system, phi, hData); if (r && r.max > maxResidual) maxResidual = r.max; } catch (e) { /* skip */ } }
  const numPhi = oracle ? oracle.numPhi : null;
  const oracleMatch = !!(numPhi && QD && typeof QD.sameDomain === 'function' && phis.some((p) => { try { return QD.sameDomain(p, numPhi); } catch (e) { return false; } }));
  return { checked: true, maxResidual, oracleMatch };
}

// The per-system UNIVALENCE FILTER: reconstruct each real candidate's φ, apply the exact
// admissibility gate, the exact/numeric fold test, and the exact/numeric boundary test, and
// collect the GENUINE φ's (schlicht on 𝔻). This is the reusable "analyze one system → its
// genuine-QD pool" unit — Phase B calls it per branch leaf and pools the results. Returns
// { genuinePhis, rows, folded, selfInt, unrec, poleOut, allExactFilter, allExactVerified }.
export function certifyLeaf(real, hData, deps) {
  const QD = deps && deps.QD, QE = deps && deps.QE;
  let folded = 0, selfInt = 0, unrec = 0, poleOut = 0, allExactFilter = true, allExactVerified = true;
  const rows = []; const genuinePhis = [];
  real.forEach((sol, idx) => {
    const phi = reconstructPhi(sol, hData, deps);
    if (!phi) { unrec++; rows.push('#' + (idx + 1) + ': φ not reconstructable (map variables eliminated — run on the seeded system)'); return; }
    // ADMISSIBILITY GATE (exact): a node preimage on/outside 𝔻 ⇒ φ has a pole in 𝔻̄ — reject
    // HERE (the cleared system's dropped (1 − z̄_j z) factors make the fold/boundary tests blind).
    const nd = nodeInsideDisk(sol, hData, deps);
    if (nd && !nd.insideAll) {
      poleOut++;
      const off = nd.offenders.map((o) => 'z' + o.j + (o.onCircle ? ' on ∂𝔻' : ' outside 𝔻')).join(', ');
      rows.push('#' + (idx + 1) + ': node preimage ' + off + ' (|z_j| ≥ 1) — φ has a pole in 𝔻, not a bounded quadrature domain');
      return;
    }
    // PF-1 / E1: EXACT ℚ(i) verification — snap to a nearby rational and check it solves every
    // generated equation exactly; if so run the fold/boundary tests at that EXACT-verified sub.
    let exactSub = null, exactPoint = false;
    try { const ver = QE && typeof QE.verifySolutionExact === 'function' ? QE.verifySolutionExact(phi, hData, { maxPoleOrder: deps.caps.maxPoleOrder }) : null; if (ver && ver.exact && ver.barSub) { exactSub = ver.barSub; exactPoint = true; } } catch (e) { /* fall back to ratApprox */ }
    // Local fold test: EXACT Schur–Cohn when non-degenerate/resolved; numeric fallback else.
    let fold = false, exact = false, cusps = 0;
    const scf = schurCohnFold(sol, hData, deps, exactSub);
    if (scf && (!scf.degenerate || scf.resolved)) { fold = scf.inside > 0; cusps = scf.onCircle || 0; exact = true; }
    else { try { const crit = (typeof QD.findCriticalPoints === 'function') ? QD.findCriticalPoints(phi, {}) : null; fold = !!(crit && crit.points && crit.points.some((p) => p.inDomain)); } catch (e) { /* treat as no fold */ } }
    if (!exact) allExactFilter = false;   // numeric fold fallback ⇒ not fully certified (D-2)
    const tag = exact ? 'Schur–Cohn' : 'numeric';
    // Boundary test: EXACT circle double-point count when φ′≠0 strictly inside 𝔻; else numeric.
    let simple = true, simpleExact = false;
    if (exact && !fold) { const bs = boundarySimpleExact(sol, hData, deps, cusps, exactSub); if (bs) { simple = bs.simple; simpleExact = true; } }
    if (!simpleExact) { try { simple = QD.isBoundaryUnivalent(phi, 360); } catch (e) { simple = true; } }
    if (exact && !fold && !simpleExact) allExactFilter = false;   // numeric boundary fallback ⇒ not fully certified (D-2)
    const bTag = simpleExact ? 'real-count' : 'numeric';
    if (fold) { folded++; rows.push('#' + (idx + 1) + ': φ′ = 0 inside 𝔻 (fold, ' + tag + ') — not univalent'); }
    else if (!simple) { selfInt++; rows.push('#' + (idx + 1) + ': boundary φ(∂𝔻) self-intersects (' + bTag + ') — not univalent'); }
    else {
      genuinePhis.push(phi);
      if (!exactPoint) allExactVerified = false;   // PF-1: an irrational genuine solution ⇒ univalence at the ratApprox point
      const cuspNote = (cusps > 0) ? ' — boundary cusp ×' + cusps : '';
      const ptNote = exactPoint ? ' [exact ℚ(i) root]' : ' [rationalized ≈]';
      rows.push('#' + (idx + 1) + ': univalent ✓ — genuine quadrature domain' + cuspNote +
        (exact && simpleExact ? ' (Schur–Cohn + real-count certified' + ptNote + ')' : (exact ? ' (φ′≠0 in 𝔻 certified' + ptNote + ')' : '')));
    }
  });
  return { genuinePhis, rows, folded, selfInt, unrec, poleOut, allExactFilter, allExactVerified };
}

// GAUGE QUOTIENT: genuine solutions related by a disk rotation (QD.sameDomain) are the SAME
// quadrature domain — collapse the pool. Phase B pools genuinePhis ACROSS the branch tree and
// calls this ONCE on the pool, so a domain reachable via two factor cases is counted once.
// Returns { distinct, gaugeMerged }.
export function gaugeQuotient(genuinePhis, deps) {
  const QD = deps && deps.QD;
  const distinct = [];
  genuinePhis.forEach((phi) => { if (!distinct.some((d) => QD && typeof QD.sameDomain === 'function' && QD.sameDomain(d, phi))) distinct.push(phi); });
  return { distinct, gaugeMerged: genuinePhis.length - distinct.length };
}

// The reconcile self-checking oracle (Sym.reconcileRealCount) with the same fallback the UI used.
function reconcile(cl, real, complete, deps) {
  const Sym = deps && deps.QD && deps.QD.Sym;
  return (Sym && typeof Sym.reconcileRealCount === 'function')
    ? Sym.reconcileRealCount(cl.realCount, real, complete)
    : { nReal: real.length, foundDistinct: real.length, certReal: (cl.realCount != null ? cl.realCount : null), partial: false, disagree: false, reason: '' };
}

// Assemble the UNIFIED existence/uniqueness verdict STRING + rigor badge from the pooled,
// gauge-quotiented result. Verbatim (byte-identical) transcription of doCertifyUnivalence's
// verdict block — the single riskiest piece, hence the characterization tests. Returns
// { verdict, rigor, bad, count, cc, rec }. `sliceCaveat` is injected (uses the UI's latexPlain).
export function assembleVerdict(a) {
  const { distinct, gaugeMerged, leaf, cl, real, r, deps, hData, sliceCaveat, oracle } = a;
  const { folded, selfInt, unrec, poleOut, allExactFilter, allExactVerified } = leaf;
  const D = distinct.length;
  const bits = [];
  if (gaugeMerged > 0) bits.push(gaugeMerged + ' gauge/rotation ' + (gaugeMerged === 1 ? 'copy' : 'copies') + ' merged');
  const rej = [folded ? folded + ' fold' : '', selfInt ? selfInt + ' self-intersecting' : '', poleOut ? poleOut + ' pole-in-𝔻' : '', unrec ? unrec + ' unreconstructable' : ''].filter(Boolean).join(', ');
  if (rej) bits.push(rej + ' rejected');
  const tail = bits.length ? ' (' + bits.join('; ') + ')' : '';
  const rec = reconcile(cl, real, r.complete, deps);
  const nReal = rec.nReal, plur = nReal === 1 ? '' : 's';
  const undercount = rec.reason === 'undercount';
  let verdict;
  if (D === 0) verdict = (undercount
    ? 'No genuine quadrature domain among the ' + rec.foundDistinct + ' separable of ' + nReal + ' real solution' + plur + ' (none univalent)'
    : 'No genuine quadrature domain: ' + nReal + ' real algebraic solution' + plur + ', none univalent') + tail + '.';
  else if (D === 1) verdict = (undercount
    ? 'At least 1 genuine quadrature domain — 1 of ' + rec.foundDistinct + ' separable of ' + nReal + ' real solution' + plur
    : 'Unique quadrature domain ✓ — 1 genuine QD of ' + nReal + ' real solution' + plur) + tail + '.';
  else verdict = (undercount
    ? 'At least ' + D + ' distinct quadrature domains of ' + nReal + ' real solution' + plur
    : D + ' distinct quadrature domains of ' + nReal + ' real solution' + plur) + tail + '.';
  let partialNote = '';
  if (undercount) partialNote = ' · ⚠ PARTIAL: the numeric solver separated only ' + rec.foundDistinct + ' of ' + rec.certReal + ' certified real solution' + (rec.certReal === 1 ? '' : 's') + ' (clustered / non-radical) — the genuine-QD count is a LOWER BOUND';
  else if (rec.disagree) partialNote = ' · ⚠ cross-check: the numeric solver returned ' + rec.foundDistinct + ' distinct real solutions vs the certified ' + rec.certReal + ' — treat the count as approximate';
  else if (rec.partial) partialNote = ' · ⚠ PARTIAL: clustered / near-multiple roots — some real solutions may be missing';
  // NUMERIC CROSS-CHECK: reduction integrity (residual ≈ 0) + independent-solver agreement.
  const cc = crossCheckPhis(distinct, hData, deps, oracle);
  let bad = !D || !!rec.partial;
  if (cc.checked) {
    if (cc.maxResidual < 1e-4 && cc.oracleMatch) verdict += ' · cross-check ✓ (residual ' + cc.maxResidual.toExponential(1) + '; matches the numeric solver)';
    else { bad = true; const why = cc.maxResidual >= 1e-4 ? ('residual ' + cc.maxResidual.toExponential(1) + ' ≫ 0 — the reduction chain may be unsound') : 'no match to the numeric solver'; verdict += ' · ⚠ cross-check: ' + why; }
  }
  if (partialNote) verdict += partialNote;
  if (r.certified && D > 0 && !undercount && !rec.disagree && !rec.partial) verdict += ' · real-solution count + locations certified (RUR + exact Sturm)';
  const ccOk = !cc.checked || (cc.maxResidual < 1e-4 && cc.oracleMatch);
  const certRigor = (undercount || rec.partial) ? 'partial'
    : (r.certified && allExactFilter && allExactVerified && !rec.disagree && ccOk) ? 'exact' : 'estimate';
  if (D >= 1 && r.certified && allExactFilter && !undercount && !rec.disagree && ccOk && !allExactVerified)
    verdict += ' · ⚠ univalence certified at RATIONALIZED coordinates — a genuine solution is not exactly rational, so the fold / boundary test ran at an approximation of the true root (the real-solution COUNT is still certified)';
  else if (D >= 1 && certRigor === 'exact')
    verdict += ' · exact ℚ(i) root — univalence certified at the true algebraic root';
  if (D >= 1) verdict += ' · class: classical bounded quadrature domains, up to the rotation gauge'
    + (deps.w0Fixed ? ' (among domains whose interior contains the fixed w₀)' : '');
  verdict += sliceCaveat(cl);
  return { verdict, rigor: certRigor, bad, count: D, cc, rec };
}

// The top-level single-system plan: run the stages in order (regime → solve → filter → gauge
// → assemble), short-circuiting on a terminal regime. Returns a structured ProofResult that
// the UI renders. Async ops (classify/solveCertified/solveNumeric) are injected already bound
// with params/signal/onProgress; `deps`, `oracle`, `sliceCaveat`, `posDimDesc` come from ctx.
//
// ProofResult.kind ∈ 'aborted' | 'error' | 'inconsistent' | 'positive-dim' | 'no-real' | 'zero-dim'.
// Analyze ONE system (a single leaf of the proof tree): regime → certified-first real solve →
// univalence filter. Returns a leaf descriptor. For a terminal regime (aborted/error/inconsistent/
// positive-dim/no-real) the descriptor already carries a rendered verdict/rigor; a determined
// zero-dimensional leaf returns { kind:'zero-dim', cl, real, r, leaf } with leaf.genuinePhis — its
// GAUGE QUOTIENT is deferred to the caller so runProofTree can pool the raw genuine φ's across the
// whole branch tree and quotient ONCE (pool-then-quotient; §3.2). The injected classify/solve ops
// are current-column-relative, so this follows whatever branch the store's current column is on.
export async function analyzeLeaf(ctx) {
  const { deps, hData } = ctx;
  const stage = (id) => { if (ctx.onStage) ctx.onStage(id); };
  stage('regime');
  const cl = await ctx.classify();
  if (cl && cl.aborted) return { kind: 'aborted', cl };
  if (!cl || !cl.ok) return { kind: 'error', reason: (cl && cl.reason) || 'classify failed', cl: cl || null };
  if (cl.inconsistent) return { kind: 'inconsistent', verdict: 'No quadrature domain: the system is inconsistent (1 ∈ I).' + ctx.sliceCaveat(cl), rigor: 'exact', bad: true, cl };
  if (!cl.zeroDim) return {
    kind: 'positive-dim',
    verdict: 'Underdetermined: a positive-dimensional family (' + ctx.posDimDesc(cl) + '). Fix the rotation gauge (φ′(0) real-positive) or pin a forced variable — see the suggestions below, or use “Set values”.' + ctx.sliceCaveat(cl),
    rigor: 'unknown', bad: true, cl,
  };
  stage('solve-real');
  let r = await ctx.solveCertified();
  if (r && r.aborted) return { kind: 'aborted', cl };
  if (r && r.ok) r = Object.assign(r, { complete: true, certified: true });
  else r = await ctx.solveNumeric();
  if (r && r.aborted) return { kind: 'aborted', cl };
  if (!r || !r.ok) return { kind: 'error', reason: (r && r.reason) || 'solve failed', cl };
  const real = (r.solutions || []).filter((s) => Object.keys(s).every((k) => Math.abs(s[k].im) < 1e-4));
  if (!real.length) {
    const v = ((cl.realCount != null && cl.realCount > 0)
      ? '⚠ PARTIAL: ' + cl.realCount + ' certified real solution' + (cl.realCount === 1 ? '' : 's') + ', but the numeric solver separated none (clustered / non-radical) — use the CAS bridge for coordinates.'
      : 'No real quadrature domain' + (cl.complexCount != null ? ' (of ' + cl.complexCount + ' distinct complex)' : '') + '.') + ctx.sliceCaveat(cl);
    return { kind: 'no-real', verdict: v, rigor: (cl.realCount != null && cl.realCount > 0) ? 'partial' : 'exact', bad: true, cl, real };
  }
  stage('filter');
  const leaf = certifyLeaf(real, hData, deps);
  return { kind: 'zero-dim', cl, real, r, leaf };
}

// The top-level SINGLE-SYSTEM plan (Phase A): analyze one system, gauge-quotient its genuine pool,
// and assemble the verdict. Byte-identical to the pre-tree behavior; runProofTree is the branch-aware
// superset. ProofResult.kind ∈ 'aborted' | 'error' | 'inconsistent' | 'positive-dim' | 'no-real' | 'zero-dim'.
export async function runCertifyPlan(ctx) {
  const a = await analyzeLeaf(ctx);
  if (a.kind !== 'zero-dim') return a;   // terminal regimes carry their own verdict/rigor
  if (ctx.onStage) ctx.onStage('gauge');
  const { distinct, gaugeMerged } = gaugeQuotient(a.leaf.genuinePhis, ctx.deps);
  if (ctx.onStage) ctx.onStage('assemble');
  const asm = assembleVerdict({ distinct, gaugeMerged, leaf: a.leaf, cl: a.cl, real: a.real, r: a.r, deps: ctx.deps, hData: ctx.hData, sliceCaveat: ctx.sliceCaveat, oracle: ctx.oracle });
  return {
    kind: 'zero-dim', verdict: asm.verdict, rigor: asm.rigor, bad: asm.bad,
    cl: a.cl, real: a.real, certified: !!a.r.certified, distinctPhis: distinct, rows: a.leaf.rows, count: asm.count, cc: asm.cc,
  };
}

// Assemble the AGGREGATE verdict for a proof tree from the pooled, once-gauge-quotiented genuine set.
// Honest bound: '=' only when every branch closed (not truncated), every filter was exact, every
// solve certified, and the cross-check (on the whole distinct pool) is clean; else '≥' (a LOWER
// BOUND), naming the gap. Rejection/merge counts are summed across the tree's determined leaves.
export function assembleTreeVerdict(a) {
  const { distinct, leaves, truncated, deps, hData, sliceCaveat, oracle, cl } = a;
  const D = distinct.length;
  const zero = leaves.filter((l) => l.kind === 'zero-dim');
  const branchCount = zero.length;
  const allExact = zero.every((l) => l.leaf.allExactFilter && l.leaf.allExactVerified);
  const allCertified = zero.every((l) => l.r && l.r.certified);
  let folded = 0, selfInt = 0, poleOut = 0, unrec = 0, rawGenuine = 0;
  zero.forEach((l) => { folded += l.leaf.folded; selfInt += l.leaf.selfInt; poleOut += l.leaf.poleOut; unrec += l.leaf.unrec; rawGenuine += l.leaf.genuinePhis.length; });
  const cc = crossCheckPhis(distinct, hData, deps, oracle);
  const ccOk = !cc.checked || (cc.maxResidual < 1e-4 && cc.oracleMatch);
  const exactAggregate = !truncated && allExact && allCertified && ccOk;
  const across = branchCount > 1 ? ' across ' + branchCount + ' branches' : '';
  let head;
  if (D === 0) head = 'No genuine quadrature domain' + across;
  else if (D === 1) head = (exactAggregate ? 'Unique quadrature domain ✓' : 'At least 1 genuine quadrature domain') + across;
  else head = (exactAggregate ? '' : 'At least ') + D + ' distinct quadrature domains' + across;
  const bits = [];
  const gm = rawGenuine - D;   // merges across the WHOLE pool (within + between branches)
  if (gm > 0) bits.push(gm + ' gauge/rotation ' + (gm === 1 ? 'copy' : 'copies') + ' merged');
  const rej = [folded ? folded + ' fold' : '', selfInt ? selfInt + ' self-intersecting' : '', poleOut ? poleOut + ' pole-in-𝔻' : '', unrec ? unrec + ' unreconstructable' : ''].filter(Boolean).join(', ');
  if (rej) bits.push(rej + ' rejected');
  let verdict = head + (bits.length ? ' (' + bits.join('; ') + ')' : '') + '.';
  if (cc.checked) verdict += ccOk ? ' · cross-check ✓ (residual ' + cc.maxResidual.toExponential(1) + '; matches the numeric solver)'
    : ' · ⚠ cross-check: ' + (cc.maxResidual >= 1e-4 ? 'residual ' + cc.maxResidual.toExponential(1) + ' ≫ 0' : 'no match to the numeric solver');
  if (truncated) verdict += ' · ⚠ not all branches closed (a case hit the depth / branch cap, or a positive-dimensional case had no factorable cause) — the count is a LOWER BOUND';
  else if (exactAggregate && branchCount > 1) verdict += ' · aggregated over all ' + branchCount + ' branches (pool-then-quotient) — a domain reachable via two cases is counted once';
  if (D >= 1) verdict += ' · class: classical bounded quadrature domains, up to the rotation gauge' + (deps.w0Fixed ? ' (among domains whose interior contains the fixed w₀)' : '');
  if (cl) verdict += sliceCaveat(cl);
  const rigor = truncated ? 'bound' : (exactAggregate ? 'exact' : 'estimate');
  const bad = D === 0 || truncated || !ccOk;
  return { verdict, rigor, bad, count: D, bound: exactAggregate ? '=' : '≥', cc };
}

// The BRANCH-AWARE plan (Phase B): walk the proof tree, auto-forking a positive-dimensional system
// into its factor cases / forced pins (via the injected ctx.fork), pool the genuine φ's across the
// WHOLE tree, gauge-quotient the pool ONCE, and assemble an aggregate verdict. Bounded by maxDepth /
// maxBranches (honest LOWER BOUND when a cap truncates). A zero-dimensional root needs no forking
// and yields the same result as runCertifyPlan. ctx.fork = { detectSplits(), enter(case), leave() }:
// detectSplits returns the sibling cases partitioning V(p)=⋃V(fᵢ) (or the forced-pin candidates);
// enter mutates the store to that case (checkpoint + applyFactor / substituteValues) and returns a
// truthy handle; leave reverts (undo). Without ctx.fork, a positive-dim root just truncates.
export async function runProofTree(ctx, opts) {
  opts = opts || {};
  const maxDepth = opts.maxDepth != null ? opts.maxDepth : 3;
  const maxBranches = opts.maxBranches != null ? opts.maxBranches : 8;
  const pool = [], leaves = [], rows = [];
  let truncated = false, aborted = false, rootCl = null;
  async function walk(depth) {
    if (aborted) return;
    const a = await analyzeLeaf(ctx);
    leaves.push(a);
    if (a.cl && !rootCl) rootCl = a.cl;
    if (a.kind === 'aborted') { aborted = true; return; }
    if (a.kind === 'error') { truncated = true; return; }
    if (a.kind === 'inconsistent' || a.kind === 'no-real') return;   // a determined-empty branch adds nothing to the union
    if (a.kind === 'zero-dim') { pool.push(...a.leaf.genuinePhis); if (a.leaf.rows) rows.push(...a.leaf.rows); return; }
    // positive-dimensional ⇒ try to fork into determined sub-cases.
    if (depth >= maxDepth) { truncated = true; return; }
    let splits = [];
    try { splits = (ctx.fork && ctx.fork.detectSplits()) || []; } catch (e) { splits = []; }
    if (!splits.length) { truncated = true; return; }   // underdetermined with no factorable cause — can't auto-close
    if (splits.length > maxBranches) { splits = splits.slice(0, maxBranches); truncated = true; }
    for (const c of splits) {
      if (aborted) break;
      let entered = false;
      try { entered = !!(ctx.fork && ctx.fork.enter(c)); } catch (e) { entered = false; }
      if (!entered) { truncated = true; continue; }
      try { await walk(depth + 1); } finally { try { ctx.fork.leave(); } catch (e) { /* best-effort revert */ } }
    }
  }
  await walk(0);
  if (aborted) return { kind: 'aborted' };
  const { distinct } = gaugeQuotient(pool, ctx.deps);
  const asm = assembleTreeVerdict({ distinct, leaves, truncated, deps: ctx.deps, hData: ctx.hData, sliceCaveat: ctx.sliceCaveat, oracle: ctx.oracle, cl: rootCl });
  return {
    kind: 'tree', verdict: asm.verdict, rigor: asm.rigor, bad: asm.bad, count: asm.count, bound: asm.bound,
    distinctPhis: distinct, rows, leaves, truncated, cl: rootCl, cc: asm.cc,
  };
}
