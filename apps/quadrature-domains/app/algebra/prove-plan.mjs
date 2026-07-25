// =============================================================================
// prove-plan.mjs — the pure, DOM-free ENGINE for the existence/uniqueness proof
// pipeline (the "fuller orchestrator": docs/algebra-review/ORCHESTRATOR_REDESIGN.md +
// docs/algebra-review/RATIONAL_MOMENT_C2.md). All phases A–E and the Phase-C routes are shipped.
//
// The engine owns SEQUENCING + the structured ProofResult; algebra-ui.mjs is reduced to a thin
// DOM binding (progress, verdict card, action buttons). Everything the engine needs arrives via
// ctx/deps — it never touches `window`, `activeEnv`, the store closures, or a worker directly.
// It contains SEVERAL prove routes; ✦ Prove dispatches on the raw data via the ROUTING DETECTORS
// (pointFunctionalMoments / multiNodeRationalData / multiNodeTriangleData, all pure + exported):
//   • the general (●)/(★) CERTIFY pipeline (CERTIFY_STAGES / runCertifyPlan) + the pooled ProofTree
//     escalation (runProofTree, pool-then-quotient) — the exact ℚ(i) per-solution certificate
//     (nodeInsideDisk → verifySolutionExact → Schur–Cohn fold → boundary-simple), gauge quotient,
//     reconcile oracle, and numeric cross-check, as pure functions over an injected `deps` bag;
//   • C1 — MOMENT / Aharonov–Shapiro route for single-node data (polynomial φ=Σwₖzᵏ): MOMENT_STAGES,
//     runMomentPlan, momentCertifyLeaf, assembleMomentVerdict, momentBoundarySimple;
//   • C2 — RATIONAL-φ route for 2-node data (φ=w₀+R(z+dz²)/(1−cz²)): RATIONAL_STAGES, runRationalPlan;
//   • C3 — EQUILATERAL-TRIANGLE route for 3-node data (φ=Rz/(1−cz³)): TRIANGLE_STAGES, runTrianglePlan.
// Honest labeling is uniform: `rigor='exact'`/`bound='='` ONLY when the count is certified AND every
// genuine root is exact-verified (PF-1) AND univalence is certified exactly (a RELIABLE Schur–Cohn +,
// for the boundary, an exact double-point count); otherwise `estimate`/`≈`. See CERTIFY_STAGES for the
// introspectable strategy plan and rigorProvenance for the ✓/✗ audit trail behind the badge.
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

// X1 — the barred-pole SUBSTITUTION built from the RUR coordinate maps instead of a rationalized point: for
// each pole j, z̄_j → conj(z_j(t)) = coords['z_j__re'](t) − i·coords['z_j__im'](t), Ā_{j,k} likewise. This is
// the SAME barred sub `poleSubst` builds, but as POLYNOMIALS in the RUR primitive t, so the fold / boundary
// tests can be run AT the true algebraic root. `rur` = what Sym.rurFromJSON returns ({ minPoly, coords,
// tName }). Returns null if any needed coordinate map is absent (a map parameter was eliminated) so the
// caller falls back to the rationalized path — never a wrong φ′.
export function barredSubstFromRUR(rur, hData, deps) {
  const S = deps && deps.QD && deps.QD.Sym;
  if (!S || !rur || !rur.coords) return null;
  const coords = rur.coords, iC = S.mpolyConst(S.gaussInt(0, 1));
  const conjOf = (reName, imName) => {
    const re = coords[reName]; if (!re) return null;                // eliminated / not a solved unknown
    const im = coords[imName];
    return im ? re.sub(iC.mul(im)) : re;                            // im absent ⇒ real (assumed-real slice) ⇒ conj = re
  };
  const poles = (hData && hData.poles) || [];
  const sub = {};
  for (let j = 0; j < poles.length; j++) {
    const zc = conjOf('z' + (j + 1) + '__re', 'z' + (j + 1) + '__im');
    if (!zc) return null;
    sub['zb' + (j + 1)] = zc;
    const order = (poles[j].principal || []).length;
    for (let k = 1; k <= order; k++) {
      const ac = conjOf('A' + (j + 1) + '_' + k + '__re', 'A' + (j + 1) + '_' + k + '__im');
      if (!ac) return null;
      sub['Ab' + (j + 1) + '_' + k] = ac;
    }
  }
  return sub;
}

// X1 — the CERTIFIED boundary test for a whole certified-solve result (ALL real solutions at once). Rebuild
// the RUR from r.rur, build the barred sub from its coordinate maps, and run the augmented parametric count:
// count === 0 ⇒ φ(∂𝔻) is simple at EVERY real algebraic root. The divided-difference system's diagonal is the
// on-circle cusp locus (N(ζ,ζ)=φ′(ζ)), so count===0 excludes cusps AND self-intersections — sound WITHOUT a
// separate φ′≠0 gate. Returns { ok, certified, count }: `certified` only on a clean count===0; ok:false /
// count>0 ⇒ the caller keeps the rationalized/numeric boundary test (honest ≈). BATCH result — the interior
// fold is still per-solution (schurCohnInterval), so a `=` still needs the fold-at-root certificate too.
export function boundaryCertifiedAtRoot(r, hData, deps) {
  const S = deps && deps.QD && deps.QD.Sym, QC = deps && deps.QC;
  if (!S || !QC || typeof QC.boundaryDoublePointCountParametric !== 'function' || typeof S.rurFromJSON !== 'function')
    return { ok: false, certified: false };
  const rur = S.rurFromJSON(r && r.rur);
  if (!rur) return { ok: false, certified: false };
  const sub = barredSubstFromRUR(rur, hData, deps);
  if (!sub) return { ok: false, certified: false };
  let bc;
  try { bc = QC.boundaryDoublePointCountParametric(hData, sub, rur.minPoly, rur.tName); }
  catch (e) { return { ok: false, certified: false, reason: (e && e.message) || String(e) }; }
  if (!bc || !bc.ok) return { ok: false, certified: false, reason: bc && bc.reason, count: bc && bc.count };
  return { ok: true, certified: bc.count === 0, count: bc.count };
}

// X1 — the CERTIFIED interior-fold test (φ′≠0 in 𝔻) at the true algebraic root, for ONE real solution whose
// isolating box in the RUR primitive is `box` = { lo, hi } (Rational). Substitute the RUR coordinate maps for
// the barred pole vars in φ′'s numerator (φ′ becomes a polynomial in ζ and t), take its ζ-coefficients as
// polynomials in t, enclose them at the box, and run the interval Schur–Cohn. Returns { ok, certified, inside }:
// certified only on a clean interval certificate; inside === 0 ⇒ φ′≠0 in 𝔻 at the true root. Not certified /
// ok:false ⇒ the caller keeps the rationalized fold test (honest ≈). Unlike the boundary certificate this is
// PER-SOLUTION (each real root has its own box), mirroring the exact schurCohnFold it upgrades.
export function foldCertifiedAtRoot(rur, box, hData, deps) {
  const S = deps && deps.QD && deps.QD.Sym, QC = deps && deps.QC;
  if (!S || !QC || typeof QC.phiPrimeNumerator !== 'function' || typeof S.schurCohnAtBox !== 'function' || !rur || !box || !box.lo || !box.hi)
    return { ok: false, certified: false };
  const sub = barredSubstFromRUR(rur, hData, deps);
  if (!sub) return { ok: false, certified: false };
  let coeffs;
  try {
    const phiP = QC.phiPrimeNumerator(hData).subst(sub);         // φ′ numerator in (ζ = 'Z', t)
    coeffs = phiP.coeffsIn('Z');                                 // its ζ-coefficients, each a polynomial in t
  } catch (e) { return { ok: false, certified: false, reason: (e && e.message) || String(e) }; }
  let r;
  try { r = S.schurCohnAtBox(coeffs, rur.tName, box.lo, box.hi); }
  catch (e) { return { ok: false, certified: false, reason: (e && e.message) || String(e) }; }
  if (!r || !r.certified) return { ok: false, certified: false, reason: r && r.reason };
  return { ok: true, certified: true, inside: r.inside };
}

// Numeric cross-check (was crossCheckPhis): each reconstructed φ must satisfy the freshly
// regenerated original system (residual ≈ 0 — reduction integrity) AND, WHEN a numeric solve is
// available, match the numeric solver's map (oracle) up to the rotation gauge. oracle = { numPhi,
// w0Sel }. For a FROM-DATA proof (Phase D) there is no numeric φ — `oracleAvailable` is then false and
// the caller must not penalize the absent oracle: the residual check alone still certifies the
// reduce/solve/reconstruct chain is sound. Returns { checked, maxResidual, oracleMatch, oracleAvailable }.
export function crossCheckPhis(phis, hData, deps, oracle) {
  const QE = deps && deps.QE, QD = deps && deps.QD;
  if (!phis || !phis.length || !QE || typeof QE.residualAtSolution !== 'function') return { checked: false, maxResidual: 0, oracleMatch: false, oracleAvailable: false };
  const w0Sel = oracle ? oracle.w0Sel : undefined;
  let system; try { system = QE.generateClassicalBounded(hData, { maxPoleOrder: deps.caps.maxPoleOrder, w0: w0Sel }); } catch (e) { return { checked: false, maxResidual: 0, oracleMatch: false, oracleAvailable: false }; }
  let maxResidual = 0;
  for (const phi of phis) { try { const r = QE.residualAtSolution(system, phi, hData); if (r && r.max > maxResidual) maxResidual = r.max; } catch (e) { /* skip */ } }
  const numPhi = oracle ? oracle.numPhi : null;
  const oracleAvailable = !!numPhi;
  const oracleMatch = !!(numPhi && QD && typeof QD.sameDomain === 'function' && phis.some((p) => { try { return QD.sameDomain(p, numPhi); } catch (e) { return false; } }));
  return { checked: true, maxResidual, oracleMatch, oracleAvailable };
}

// The per-system UNIVALENCE FILTER: reconstruct each real candidate's φ, apply the exact
// admissibility gate, the exact/numeric fold test, and the exact/numeric boundary test, and
// collect the GENUINE φ's (schlicht on 𝔻). This is the reusable "analyze one system → its
// genuine-QD pool" unit — Phase B calls it per branch leaf and pools the results. Returns
// { genuinePhis, rows, folded, selfInt, unrec, poleOut, allExactFilter, allExactVerified }.
export function certifyLeaf(real, hData, deps, atRoot) {
  const QD = deps && deps.QD, QE = deps && deps.QE;
  let folded = 0, selfInt = 0, unrec = 0, poleOut = 0, allExactFilter = true, allExactVerified = true, intervalCertified = false;
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
    // X1: for an IRRATIONAL solution, try the CERTIFIED fold at the true algebraic root — the interval
    // Schur–Cohn over φ′ enclosed at this root's isolating t-box. It upgrades the rationalized test only when
    // it certifies; gated to irrational solutions so an all-rational prove pays nothing.
    let foldAtRoot = null;
    const boxJSON = atRoot && atRoot.boxes ? atRoot.boxes[idx] : null;   // this solution's isolating t-box (aligned with `real`)
    if (!exactPoint && atRoot && atRoot.rur && boxJSON && QD && QD.Sym && typeof QD.Sym.ratBoxFromJSON === 'function') {
      try { const box = QD.Sym.ratBoxFromJSON(boxJSON); const fc = foldCertifiedAtRoot(atRoot.rur, box, hData, deps); if (fc && fc.certified) foldAtRoot = fc; } catch (e) { /* fall back */ }
    }
    // Local fold test: certified-at-root interval Schur–Cohn (irrational) → EXACT Schur–Cohn at the rational
    // sub → numeric fallback. A clean interval certificate is non-degenerate with no on-circle cusp (cusps 0).
    let fold = false, exact = false, cusps = 0;
    if (foldAtRoot) { fold = foldAtRoot.inside > 0; exact = true; }
    else {
      const scf = schurCohnFold(sol, hData, deps, exactSub);
      if (scf && (!scf.degenerate || scf.resolved)) { fold = scf.inside > 0; cusps = scf.onCircle || 0; exact = true; }
      else { try { const crit = (typeof QD.findCriticalPoints === 'function') ? QD.findCriticalPoints(phi, {}) : null; fold = !!(crit && crit.points && crit.points.some((p) => p.inDomain)); } catch (e) { /* treat as no fold */ } }
    }
    if (!exact) allExactFilter = false;   // numeric fold fallback ⇒ not fully certified (D-2)
    const tag = exact ? 'Schur–Cohn' : 'numeric';
    // Boundary test: certified-at-root BATCH count===0 (irrational; excludes on-circle cusps AND
    // self-intersections) → EXACT circle double-point count at the rational sub → numeric.
    let simple = true, simpleExact = false, boundaryAtRoot = false;
    if (foldAtRoot && !fold && atRoot.boundaryCertified()) { simple = true; simpleExact = true; boundaryAtRoot = true; }
    else if (exact && !fold) { const bs = boundarySimpleExact(sol, hData, deps, cusps, exactSub); if (bs) { simple = bs.simple; simpleExact = true; } }
    if (!simpleExact) { try { simple = QD.isBoundaryUnivalent(phi, 360); } catch (e) { simple = true; } }
    if (exact && !fold && !simpleExact) allExactFilter = false;   // numeric boundary fallback ⇒ not fully certified (D-2)
    const bTag = boundaryAtRoot ? 'interval-count' : (simpleExact ? 'real-count' : 'numeric');
    if (fold) { folded++; rows.push('#' + (idx + 1) + ': φ′ = 0 inside 𝔻 (fold, ' + tag + ') — not univalent'); }
    else if (!simple) { selfInt++; rows.push('#' + (idx + 1) + ': boundary φ(∂𝔻) self-intersects (' + bTag + ') — not univalent'); }
    else {
      genuinePhis.push(phi);
      // Verified at the TRUE root iff rational-exact, OR both the fold and the boundary were certified at the
      // algebraic root (interval Schur–Cohn ∧ augmented boundary count). Otherwise an irrational solution ran
      // at the rationalized ≈ point and the verdict must stay an estimate.
      const atRootCertified = !!(foldAtRoot && boundaryAtRoot);
      if (!exactPoint && !atRootCertified) allExactVerified = false;
      if (!exactPoint && atRootCertified) intervalCertified = true;
      const cuspNote = (cusps > 0) ? ' — boundary cusp ×' + cusps : '';
      const ptNote = exactPoint ? ' [exact ℚ(i) root]' : (atRootCertified ? ' [true algebraic root — interval Schur–Cohn + boundary count]' : ' [rationalized ≈]');
      rows.push('#' + (idx + 1) + ': univalent ✓ — genuine quadrature domain' + cuspNote +
        (exact && simpleExact ? ' (Schur–Cohn + real-count certified' + ptNote + ')' : (exact ? ' (φ′≠0 in 𝔻 certified' + ptNote + ')' : '')));
    }
  });
  return { genuinePhis, rows, folded, selfInt, unrec, poleOut, allExactFilter, allExactVerified, intervalCertified };
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
  const { folded, selfInt, unrec, poleOut, allExactFilter, allExactVerified, intervalCertified } = leaf;
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
  // NUMERIC CROSS-CHECK: reduction integrity (residual ≈ 0) + independent-solver agreement WHEN a
  // numeric solve is available. A FROM-DATA proof (Phase D) has no oracle — the residual alone certifies
  // the reduce/solve/reconstruct chain is sound, so an absent oracle must NOT fail the cross-check.
  const cc = crossCheckPhis(distinct, hData, deps, oracle);
  const ccPass = cc.maxResidual < 1e-4 && (cc.oracleMatch || !cc.oracleAvailable);
  let bad = !D || !!rec.partial;
  if (cc.checked) {
    if (ccPass) verdict += ' · cross-check ✓ (residual ' + cc.maxResidual.toExponential(1) + (cc.oracleAvailable ? '; matches the numeric solver' : '; reduction integrity — no numeric solve to corroborate') + ')';
    else { bad = true; const why = cc.maxResidual >= 1e-4 ? ('residual ' + cc.maxResidual.toExponential(1) + ' ≫ 0 — the reduction chain may be unsound') : 'no match to the numeric solver'; verdict += ' · ⚠ cross-check: ' + why; }
  }
  if (partialNote) verdict += partialNote;
  if (r.certified && D > 0 && !undercount && !rec.disagree && !rec.partial) verdict += ' · real-solution count + locations certified (RUR + exact Sturm)';
  const ccOk = !cc.checked || ccPass;
  const certRigor = (undercount || rec.partial) ? 'partial'
    : (r.certified && allExactFilter && allExactVerified && !rec.disagree && ccOk) ? 'exact' : 'estimate';
  if (D >= 1 && r.certified && allExactFilter && !undercount && !rec.disagree && ccOk && !allExactVerified)
    verdict += ' · ⚠ univalence certified at RATIONALIZED coordinates — a genuine solution is not exactly rational, so the fold / boundary test ran at an approximation of the true root (the real-solution COUNT is still certified)';
  else if (D >= 1 && certRigor === 'exact')
    verdict += intervalCertified
      ? ' · certified at the true algebraic root (interval Schur–Cohn fold + augmented boundary count over ℚ(i)) — the X1 refinement, so an irrational-algebraic quadrature domain earns ='
      : ' · exact ℚ(i) root — univalence certified at the true algebraic root';
  if (D >= 1) verdict += ' · class: classical bounded quadrature domains, up to the rotation gauge'
    + (deps.w0Fixed ? ' (among domains whose interior contains the fixed w₀)' : '');
  verdict += sliceCaveat(cl);
  const prov = rigorProvenance({ certified: !!r.certified, allExactFilter, allExactVerified, disagree: rec.disagree, ccOk, ccAvailable: cc.oracleAvailable, ccChecked: cc.checked, undercount, partial: rec.partial });
  return { verdict, rigor: certRigor, bad, count: D, cc, rec, rigorProvenance: prov };
}

// The human-readable AUDIT TRAIL behind a rigor badge (Phase E): why the verdict earned '='/'≥'/'≈'/… —
// each binding condition marked ✓ (met) / ✗ (not met). flags = { certified, allExactFilter,
// allExactVerified, disagree, ccOk, ccAvailable, ccChecked, undercount, partial, truncated }. Pure;
// rendered as a "why this rigor" list in the verdict card and included in the exported proof object.
export function rigorProvenance(f) {
  f = f || {};
  const mark = (ok, txt) => (ok ? '✓ ' : '✗ ') + txt;
  const items = [
    mark(f.certified, 'certified real count (RUR + exact Sturm)'),
    mark(f.allExactFilter, 'exact ℚ(i) univalence filters (no numeric fold / boundary fallback)'),
    mark(f.allExactVerified, 'every genuine solution exact-verified over ℚ(i) (fold / boundary at the true root)'),
  ];
  if (f.ccChecked) items.push(mark(f.ccOk, 'numeric cross-check' + (f.ccAvailable ? ' — matches the numeric solver' : ' — residual integrity (no numeric solve)')));
  if (f.truncated) items.push('✗ every branch of the case tree closed (a case hit the depth / branch cap, or had no factorable cause)');
  if (f.undercount || f.partial) items.push('✗ complete — the numeric solver may have undercounted (clustered / non-radical)');
  return items;
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
  // X1: keep each real solution PAIRED with its isolating t-box (r.tBoxes is aligned with r.solutions) so the
  // per-solution certified fold can enclose φ′ at the right root once the complex solutions are filtered out.
  const _realPairs = (r.solutions || []).map((s, i) => ({ s, box: (r.tBoxes || [])[i] })).filter((p) => Object.keys(p.s).every((k) => Math.abs(p.s[k].im) < 1e-4));
  const real = _realPairs.map((p) => p.s);
  if (!real.length) {
    const v = ((cl.realCount != null && cl.realCount > 0)
      ? '⚠ PARTIAL: ' + cl.realCount + ' certified real solution' + (cl.realCount === 1 ? '' : 's') + ', but the numeric solver separated none (clustered / non-radical) — use the CAS bridge for coordinates.'
      : 'No real quadrature domain' + (cl.complexCount != null ? ' (of ' + cl.complexCount + ' distinct complex)' : '') + '.') + ctx.sliceCaveat(cl);
    return { kind: 'no-real', verdict: v, rigor: (cl.realCount != null && cl.realCount > 0) ? 'partial' : 'exact', bad: true, cl, real };
  }
  stage('filter');
  // X1: the certified-at-root context — the reconstructed RUR + a LAZY batch boundary certificate (a memoized
  // thunk, so it runs only if an irrational genuine solution actually reaches for it; all-rational proves and
  // the numeric-solve fallback pay nothing). certifyLeaf uses it to upgrade the fold / boundary tests from a
  // rationalized point to the true algebraic root.
  let atRoot = null;
  if (r.certified && r.rur) {
    const S = deps && deps.QD && deps.QD.Sym;
    const rur = S && typeof S.rurFromJSON === 'function' ? S.rurFromJSON(r.rur) : null;
    if (rur) {
      let bcMemo;
      atRoot = { rur, boxes: _realPairs.map((p) => p.box), boundaryCertified: () => { if (bcMemo === undefined) bcMemo = !!(boundaryCertifiedAtRoot(r, hData, deps).certified); return bcMemo; } };
    }
  }
  const leaf = certifyLeaf(real, hData, deps, atRoot);
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
    cl: a.cl, real: a.real, certified: !!a.r.certified, distinctPhis: distinct, rows: a.leaf.rows, count: asm.count, cc: asm.cc, rigorProvenance: asm.rigorProvenance,
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
  const ccOk = !cc.checked || (cc.maxResidual < 1e-4 && (cc.oracleMatch || !cc.oracleAvailable));
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
  if (cc.checked) verdict += ccOk ? ' · cross-check ✓ (residual ' + cc.maxResidual.toExponential(1) + (cc.oracleAvailable ? '; matches the numeric solver' : '; reduction integrity — no numeric solve to corroborate') + ')'
    : ' · ⚠ cross-check: ' + (cc.maxResidual >= 1e-4 ? 'residual ' + cc.maxResidual.toExponential(1) + ' ≫ 0' : 'no match to the numeric solver');
  if (truncated) verdict += ' · ⚠ not all branches closed (a case hit the depth / branch cap, or a positive-dimensional case had no factorable cause) — the count is a LOWER BOUND';
  else if (exactAggregate && branchCount > 1) verdict += ' · aggregated over all ' + branchCount + ' branches (pool-then-quotient) — a domain reachable via two cases is counted once';
  if (D >= 1) verdict += ' · class: classical bounded quadrature domains, up to the rotation gauge' + (deps.w0Fixed ? ' (among domains whose interior contains the fixed w₀)' : '');
  if (cl) verdict += sliceCaveat(cl);
  const rigor = truncated ? 'bound' : (exactAggregate ? 'exact' : 'estimate');
  const bad = D === 0 || truncated || !ccOk;
  const prov = rigorProvenance({ certified: allCertified, allExactFilter: allExact, allExactVerified: allExact, ccOk, ccAvailable: cc.oracleAvailable, ccChecked: cc.checked, truncated });
  return { verdict, rigor, bad, count: D, bound: exactAggregate ? '=' : '≥', cc, rigorProvenance: prov };
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
    distinctPhis: distinct, rows, leaves, truncated, cl: rootCl, cc: asm.cc, rigorProvenance: asm.rigorProvenance,
  };
}

// =============================================================================
// MOMENT ROUTE (Phase C1) — for INTERIOR POINT-FUNCTIONAL data (a single quadrature point, order n:
// ∫_Ω f dA = Σ M_p f^(p)(a)). The Aharonov–Shapiro moment system (QE.pointFunctionalSystem) is in REAL
// variables (w₁ real gauge; w_k = u_k + i v_k), generically ZERO-DIMENSIONAL and tractable — unlike the
// exterior (●)/(★) conjugate model (z̄ independent → positive-dimensional + Gröbner blow-up for the very
// multi-QD cases we care about). Its certified real solutions are ALL the candidate maps φ(z)=Σ w_k zᵏ (a
// POLYNOMIAL — always analytic on 𝔻, so no pole-in-𝔻 admissibility gate); the univalence filter is a
// Sym.schurCohn count on φ′; and the rotation gauge is simply w₁>0 (the ±w₁ pairs collapse). For ORDER ≤ 2
// this is fully rigorous: A&S prove φ′≠0 in 𝔻 ⇔ globally univalent ⇔ a genuine QD (order 1 is the disk;
// order 2 the cardioid = the resolvent cubic's double root). Order ≥ 3 gets the same LOCAL schurCohn test,
// honestly labelled (global univalence is proven only through order 2). This captures OFF-SLICE
// (non-real-symmetric, complex-moment) domains that the real slice misses — the Phase-C gap.
// ============================================================================================
// ROUTING DETECTORS — pure classifiers of the raw quadrature data (h-data) that decide which prove ROUTE
// applies. Extracted here (from the algebra-ui closure) so they are unit-testable. ✦ Prove tries them in
// order: point-functional (single node) → 2-node rational → equilateral-3-node → else the (●)/(★) tree.
// Each returns the route's input object or null (⇒ not this route). The corresponding builder in
// qd-equations.mjs re-checks its own preconditions and throws on bad data, so these are the OUTER gate.
// ============================================================================================

// Detect INTERIOR POINT-FUNCTIONAL data (C1): a single quadrature node whose leading residue M₀ = C₁ is real
// & positive (the area). Moments M_p = C_{p+1} (principal-part coefficients), order = #principal terms.
// Returns { moments, order, node } or null.
export function pointFunctionalMoments(hData) {
  const poles = (hData && hData.poles) || [];
  if (poles.length !== 1) return null;
  const pp = poles[0].principal || [];
  if (!pp.length) return null;
  const M0 = pp[0] || { re: 0, im: 0 };
  if (Math.abs(M0.im || 0) > 1e-9 || !(M0.re > 1e-12)) return null;       // M₀ = area must be real + positive
  const moments = { M0: M0.re };
  for (let p = 1; p < pp.length; p++) moments['M' + p] = { re: pp[p].re || 0, im: pp[p].im || 0 };
  return { moments, order: pp.length, node: poles[0].a || { re: 0, im: 0 } };
}

// Detect MULTI-NODE data for the rational-φ route (C2): exactly 2 simple (order-1) poles, both on the real
// axis with real residues (the degree-2 REAL increment — covers two-point-symmetric + general real 2-node).
// Returns { nodes:[{re,im}×2], weights:[{re,im}×2] } or null.
export function multiNodeRationalData(hData) {
  const poles = (hData && hData.poles) || [];
  if (poles.length !== 2) return null;
  const nodes = [], weights = [];
  for (const p of poles) {
    const pp = p.principal || [];
    if (pp.length !== 1) return null;                                     // order-1 nodes only (degree-2 rational)
    const a = p.a || { re: 0, im: 0 }, b = pp[0] || { re: 0, im: 0 };
    if (Math.abs(a.im || 0) > 1e-9 || Math.abs(b.im || 0) > 1e-9) return null;   // real nodes + weights only
    nodes.push({ re: a.re || 0, im: 0 }); weights.push({ re: b.re || 0, im: 0 });
  }
  if (Math.abs(nodes[0].re - nodes[1].re) < 1e-9) return null;            // distinct nodes
  return { nodes, weights };
}

// Detect EQUILATERAL-TRIANGLE data for the degree-3 route (C3): exactly 3 simple (order-1) poles, real
// weights, equal magnitudes, centroid at the origin (triangleMomentSystem re-checks the symmetry exactly).
// Returns { nodes:[{re,im}×3], weights:[{re,im}×3] } or null.
export function multiNodeTriangleData(hData) {
  const poles = (hData && hData.poles) || [];
  if (poles.length !== 3) return null;
  const nodes = [], weights = [];
  for (const p of poles) {
    const pp = p.principal || [];
    if (pp.length !== 1) return null;                                     // order-1 nodes only (degree-3)
    const a = p.a || { re: 0, im: 0 }, b = pp[0] || { re: 0, im: 0 };
    if (Math.abs(b.im || 0) > 1e-9) return null;                          // real weights only
    nodes.push({ re: a.re || 0, im: a.im || 0 }); weights.push({ re: b.re || 0, im: 0 });
  }
  const mag2 = nodes.map((z) => z.re * z.re + z.im * z.im), A2 = mag2[0], sc = Math.max(1, A2);
  if (mag2.some((m) => Math.abs(m - A2) > 1e-6 * sc)) return null;                          // equal magnitudes
  const cx = (nodes[0].re + nodes[1].re + nodes[2].re) / 3, cy = (nodes[0].im + nodes[1].im + nodes[2].im) / 3;
  if (Math.hypot(cx, cy) > 1e-6 * Math.max(1, Math.sqrt(A2))) return null;                  // centroid at origin
  const b0 = weights[0].re;
  if (weights.some((w) => Math.abs(w.re - b0) > 1e-6 * Math.max(1, Math.abs(b0)))) return null;   // equal weights
  return { nodes, weights };
}

export const MOMENT_STAGES = [
  { id: 'regime', title: 'Regime', why: 'Classify the point-functional moment system: inconsistent ⇒ no QD; positive-dimensional (degenerate moments) ⇒ underdetermined; zero-dimensional ⇒ a finite count.' },
  { id: 'solve-real', title: 'Solve (real)', why: 'Certified real solutions (RUR + exact Sturm) of the moment system — every candidate polynomial map φ(z)=Σ w_k zᵏ, including off-slice (non-real-symmetric) ones.' },
  { id: 'filter', title: 'Univalence filter', why: 'Per candidate: exact Schur–Cohn on φ′ (a polynomial) — φ′≠0 in 𝔻 ⇔ univalent (globally, for order ≤ 2, by Aharonov–Shapiro). Cusps (φ′=0 on ∂𝔻) are allowed.' },
  { id: 'gauge', title: 'Gauge quotient', why: 'The rotation gauge is w₁ = φ′(0) > 0 — the ±w₁ pairs are the same domain; keep w₁>0.' },
  { id: 'assemble', title: 'Verdict', why: 'Count the distinct genuine domains + assemble the rigor-badged verdict.' },
];

// Extract w = [null, w1, {re,im}_2, …, {re,im}_n] (numeric) from a moment reim solution. The moment
// vars are REAL (w1, u_k, v_k), so each is stored as <name>__re only.
export function reconstructMomentW(sol, order) {
  const g = (nm) => { const c = sol[nm + '__re']; return c ? c.re : 0; };
  const w = [null, g('w1')];
  for (let k = 2; k <= order; k++) w.push({ re: g('u' + k), im: g('v' + k) });
  return w;
}

// EXACT Schur–Cohn local-univalence test for a moment candidate: build φ′(Z) = Σ_{k=1}^n k·w_k Z^{k-1}
// with exact ℚ(i) coefficients (rationalize the w_k, or use the exact-verified ones) and count its roots
// inside 𝔻. Returns { inside, onCircle } (inside>0 ⇒ φ′ vanishes in 𝔻 = a fold; onCircle = # boundary
// zeros = cusps, allowed) or null if unavailable. w may be numeric (ratApprox'd) or already exact-ℚ(i)
// (wExact from momentExactVerify → the certificate is at the true root).
export function momentUnivalence(w, order, deps) {
  const Sym = deps && deps.QD && deps.QD.Sym, QE = deps && deps.QE;
  if (!Sym || !QE || typeof QE.ratApprox !== 'function' || typeof Sym.schurCohn !== 'function' || typeof Sym.uniCoeffs !== 'function') return null;
  const gc = (re, im) => { const a = QE.ratApprox(re || 0), b = QE.ratApprox(im || 0); return Sym.mpolyConst(Sym.gauss(Sym.rat(a[0], a[1]), Sym.rat(b[0], b[1]))); };
  const Z = Sym.mpolyVar('Z');
  let phiP = gc(0, 0);
  for (let k = 1; k <= order; k++) {
    const wk = (k === 1) ? { re: (w[1] && w[1].re != null) ? w[1].re : w[1], im: 0 } : (w[k] || { re: 0, im: 0 });
    let term = gc(k * (wk.re || 0), k * (wk.im || 0));
    for (let j = 0; j < k - 1; j++) term = term.mul(Z);
    phiP = phiP.add(term);
  }
  // reliable ⟺ the exact Schur–Cohn resolved (not a degenerate stratum, or resolved past it); an UNRELIABLE
  // result (dim over the Hermite cap / parity failure — sym-core's honest fallback) must NOT feed a `=` badge.
  try { const sc = Sym.schurCohn(Sym.uniCoeffs(phiP, 'Z')); return { inside: sc.inside, onCircle: sc.onCircle || 0, reliable: (!sc.degenerate || !!sc.resolved) }; } catch (e) { return null; }
}

// EXACT boundary-injectivity test for a moment candidate (Phase C1-ext, GLOBAL univalence). Is φ(∂𝔻) a
// SIMPLE closed curve (cusps allowed)? Build the divided-difference N(Z₁,Z₂) = Σ_k w_k Σ_{j=0}^{k-1}
// Z₁ʲ Z₂^{k-1-j}, substitute ζ→x+iy (real x,y), append the circle quadrics x²+y²−1, and count the REAL
// double points on the torus via Sym.realSolutionCount — the SAME formulation-agnostic core as
// QC.boundaryDoublePointCount. Each boundary cusp (φ′=0 on ∂𝔻) contributes one diagonal solution, so
// SIMPLE ⟺ count === cusps. Returns { simple } or null (positive-dim / over the Hermite cap / unavailable
// ⇒ caller falls back to local-only). PRECONDITION: φ′≠0 strictly INSIDE 𝔻 (the caller's local gate). For
// order ≤ 2 this always confirms A&S; for order ≥ 3 it is what makes global univalence rigorous.
export function momentBoundarySimple(w, order, cusps, deps) {
  const Sym = deps && deps.QD && deps.QD.Sym, QE = deps && deps.QE;
  if (!Sym || !QE || typeof Sym.realSolutionCount !== 'function' || typeof QE.ratApprox !== 'function') return null;
  const gc = (re, im) => { const a = QE.ratApprox(re || 0), b = QE.ratApprox(im || 0); return Sym.mpolyConst(Sym.gauss(Sym.rat(a[0], a[1]), Sym.rat(b[0], b[1]))); };
  const iC = Sym.mpolyConst(Sym.gauss(Sym.rat(0, 1), Sym.rat(1, 1)));
  const Z1 = Sym.mpolyVar('Z1'), Z2 = Sym.mpolyVar('Z2');
  let N = gc(0, 0);
  for (let k = 1; k <= order; k++) {
    const wk = (k === 1) ? { re: (w[1] && w[1].re != null) ? w[1].re : w[1], im: 0 } : (w[k] || { re: 0, im: 0 });
    let inner = gc(0, 0);
    for (let j = 0; j <= k - 1; j++) { let t = gc(1, 0); for (let aa = 0; aa < j; aa++) t = t.mul(Z1); for (let bb = 0; bb < k - 1 - j; bb++) t = t.mul(Z2); inner = inner.add(t); }
    N = N.add(gc(wk.re || 0, wk.im || 0).mul(inner));
  }
  return boundarySimpleFromN(N, cusps, deps);
}

// Shared core of the exact boundary double-point count (used by BOTH the polynomial moment route and the
// rational C2 route — the condition is formulation-agnostic once the divided difference N is built). Given
// N(Z₁,Z₂) — an MPoly in vars 'Z1','Z2' over ℚ(i) with N(z₁,z₂)=0 ⟺ φ(z₁)=φ(z₂) for z₁≠z₂ — substitute
// ζ→x+iy, append the two unit-circle quadrics, and count the REAL solutions on the torus via
// Sym.realSolutionCount. SIMPLE ⟺ count === cusps (each boundary cusp = one diagonal solution). Returns
// { simple } or null (positive-dim / over the Hermite cap / unavailable ⇒ caller falls back to local-only).
export function boundarySimpleFromN(N, cusps, deps) {
  const Sym = deps && deps.QD && deps.QD.Sym;
  if (!Sym || !N || typeof Sym.realSolutionCount !== 'function' || typeof Sym.mpolyVar !== 'function') return null;
  const iC = Sym.mpolyConst(Sym.gauss(Sym.rat(0, 1), Sym.rat(1, 1)));
  const cx = (x, y) => Sym.mpolyVar(x).add(iC.mul(Sym.mpolyVar(y)));
  let Nr; try { Nr = N.subst({ Z1: cx('x1', 'y1'), Z2: cx('x2', 'y2') }); } catch (e) { return null; }
  const circ = (x, y) => Sym.mpolyVar(x).pow(2).add(Sym.mpolyVar(y).pow(2)).sub(Sym.mpolyInt(1));
  const sys = [Nr.realPart(), Nr.imagPart(), circ('x1', 'y1'), circ('x2', 'y2')].filter((p) => !p.isZero());
  let r; try { r = Sym.realSolutionCount(sys, null, ['x1', 'y1', 'x2', 'y2'], {}); } catch (e) { return null; }
  if (!r || !r.ok) return null;
  return { simple: r.realCount === (cusps || 0) };
}

// C2-2 — LOCAL univalence for the degree-2 rational QD map φ(z) = w0 + R(z + d·z²)/(1 − c·z²), c = t².
// Univalence is a property of the SHAPE only (w0, R = translation/rotation/positive-scale preserve
// injectivity), so it depends on (t, d) alone. φ′ = R(1 + 2dz + cz²)/(1 − cz²)², so φ′≠0 in 𝔻 ⟺ the
// numerator 1 + 2dz + cz² has no root in 𝔻 (Schur–Cohn), AND the poles ±1/√c lie outside 𝔻̄ (c = t² < 1).
// Returns { inside, onCircle, poleOk } (inside>0 ⇒ fold; onCircle = boundary cusps; poleOk=false ⇒ the map
// is not analytic in 𝔻 — reject) or null if unavailable. (t, d) numeric ⇒ rationalized; c is kept = t²
// exactly from the rationalized t so the test runs at a consistent point.
export function rationalUnivalence(t, d, deps) {
  const Sym = deps && deps.QD && deps.QD.Sym, QE = deps && deps.QE;
  if (!Sym || !QE || typeof QE.ratApprox !== 'function' || typeof Sym.schurCohn !== 'function' || typeof Sym.uniCoeffs !== 'function') return null;
  const gc = (x) => { const a = QE.ratApprox(x || 0); return Sym.mpolyConst(Sym.gauss(Sym.rat(a[0], a[1]), Sym.rat(0, 1))); };
  const tR = QE.ratApprox(t || 0);
  const cC = Sym.mpolyConst(Sym.gauss(Sym.rat(tR[0] * tR[0], tR[1] * tR[1]), Sym.rat(0, 1)));   // c = t² exact
  const Z = Sym.mpolyVar('Z');
  const num = gc(1).add(gc(2 * (d || 0)).mul(Z)).add(cC.mul(Z).mul(Z));            // 1 + 2dz + cz²
  let sc; try { sc = Sym.schurCohn(Sym.uniCoeffs(num, 'Z')); } catch (e) { return null; }
  const cNum = tR[0] * tR[0], cDen = tR[1] * tR[1];
  return { inside: sc.inside, onCircle: sc.onCircle || 0, poleOk: cNum < cDen, reliable: (!sc.degenerate || !!sc.resolved) };   // c = t² < 1
}

// C2-2 — GLOBAL univalence for the rational map: is φ(∂𝔻) simple? The divided difference collapses to
// N(Z₁,Z₂) = 1 + c·Z₁Z₂ + d(Z₁+Z₂) (c = t²), since φ(z₁)−φ(z₂) = (z₁−z₂)·N/[(1−cz₁²)(1−cz₂²)]. Count its
// real double points on the torus (boundarySimpleFromN): SIMPLE ⟺ count === cusps. Returns { simple } or null.
export function rationalBoundarySimple(t, d, cusps, deps) {
  const Sym = deps && deps.QD && deps.QD.Sym, QE = deps && deps.QE;
  if (!Sym || !QE || typeof QE.ratApprox !== 'function' || typeof Sym.mpolyVar !== 'function') return null;
  const gc = (x) => { const a = QE.ratApprox(x || 0); return Sym.mpolyConst(Sym.gauss(Sym.rat(a[0], a[1]), Sym.rat(0, 1))); };
  const tR = QE.ratApprox(t || 0);
  const cC = Sym.mpolyConst(Sym.gauss(Sym.rat(tR[0] * tR[0], tR[1] * tR[1]), Sym.rat(0, 1)));   // c = t² exact
  const Z1 = Sym.mpolyVar('Z1'), Z2 = Sym.mpolyVar('Z2');
  const N = gc(1).add(cC.mul(Z1).mul(Z2)).add(gc(d || 0).mul(Z1.add(Z2)));         // 1 + c Z₁Z₂ + d(Z₁+Z₂)
  return boundarySimpleFromN(N, cusps, deps);
}

// C3-2 — LOCAL univalence for the equilateral-triangle map φ(z) = R·z/(1 − c·z³). Depends on the SHAPE c only
// (R = positive scale, preserves injectivity). φ′ = R(1 + 2c·z³)/(1 − c·z³)², so φ′≠0 in 𝔻 ⟺ the numerator
// 1 + 2c·z³ has no root in 𝔻 (Schur–Cohn — folds when |c|>½), AND the poles ±c^{−1/3}·{1,ω,ω²} lie outside
// 𝔻̄ (|c|<1). Returns { inside, onCircle, poleOk } or null. c numeric ⇒ rationalized.
export function triangleUnivalence(c, deps) {
  const Sym = deps && deps.QD && deps.QD.Sym, QE = deps && deps.QE;
  if (!Sym || !QE || typeof QE.ratApprox !== 'function' || typeof Sym.schurCohn !== 'function' || typeof Sym.uniCoeffs !== 'function') return null;
  const gc = (x) => { const a = QE.ratApprox(x || 0); return Sym.mpolyConst(Sym.gauss(Sym.rat(a[0], a[1]), Sym.rat(0, 1))); };
  const Z = Sym.mpolyVar('Z');
  const num = gc(1).add(gc(2 * (c || 0)).mul(Z).mul(Z).mul(Z));                     // 1 + 2c·z³
  let sc; try { sc = Sym.schurCohn(Sym.uniCoeffs(num, 'Z')); } catch (e) { return null; }
  return { inside: sc.inside, onCircle: sc.onCircle || 0, poleOk: Math.abs(c || 0) < 1, reliable: (!sc.degenerate || !!sc.resolved) };   // poles outside 𝔻̄ ⟺ |c|<1
}

// C3-2 — GLOBAL univalence for the triangle map: is φ(∂𝔻) simple? The divided difference collapses to
// N(Z₁,Z₂) = 1 + c·Z₁Z₂(Z₁+Z₂) (since φ(z₁)−φ(z₂) = R(z₁−z₂)·N/[(1−cz₁³)(1−cz₂³)]). Count its real double
// points on the torus (boundarySimpleFromN): SIMPLE ⟺ count === cusps. Returns { simple } or null.
export function triangleBoundarySimple(c, cusps, deps) {
  const Sym = deps && deps.QD && deps.QD.Sym, QE = deps && deps.QE;
  if (!Sym || !QE || typeof QE.ratApprox !== 'function' || typeof Sym.mpolyVar !== 'function') return null;
  const gc = (x) => { const a = QE.ratApprox(x || 0); return Sym.mpolyConst(Sym.gauss(Sym.rat(a[0], a[1]), Sym.rat(0, 1))); };
  const Z1 = Sym.mpolyVar('Z1'), Z2 = Sym.mpolyVar('Z2');
  const N = gc(1).add(gc(c || 0).mul(Z1).mul(Z2).mul(Z1.add(Z2)));                  // 1 + c·Z₁Z₂(Z₁+Z₂)
  return boundarySimpleFromN(N, cusps, deps);
}

// PF-1 for the moment route: snap each real coordinate to a nearby simple rational and check it solves
// EVERY moment equation EXACTLY over ℚ(i). If so the candidate IS that exact rational point, so the
// Schur–Cohn test runs at the TRUE root (rigorous). momentPolys are the seeded moment MPolys (real vars).
// Returns { exact:true, w:[null,{re,im}…] } (exact w, im=0 on the reim reals) or { exact:false }.
export function momentExactVerify(sol, momentPolys, order, deps) {
  const Sym = deps && deps.QD && deps.QD.Sym, QE = deps && deps.QE;
  if (!Sym || !QE || !momentPolys || typeof QE.ratApprox !== 'function') return { exact: false };
  const snap = (x) => { const a = QE.ratApprox(x || 0); return Sym.rat(a[0], a[1]); };
  const g = (nm) => { const c = sol[nm + '__re']; return c ? c.re : 0; };
  const names = ['w1']; for (let k = 2; k <= order; k++) names.push('u' + k, 'v' + k);
  const sub = {};
  for (const nm of names) { const r = snap(g(nm)); sub[nm] = Sym.mpolyConst(Sym.gauss(r, Sym.rat(0, 1))); }
  try { for (const p of momentPolys) { if (!p.subst(sub).isZero()) return { exact: false }; } } catch (e) { return { exact: false }; }
  return { exact: true };   // VERIFIED — the numeric w (re-rationalized in momentUnivalence) is the true root
}

// Per-system univalence filter for the moment route: reconstruct each real candidate's w, exact-verify,
// run the Schur–Cohn φ′ test, and keep the GENUINE ones (univalent AND the rotation-gauge canonical w₁>0).
// Returns { genuine:[{w,order,exactPoint,cusps}], rows, folded, gaugeDropped, nonUniv, allExact, allVerified }.
export function momentCertifyLeaf(real, order, deps, momentPolys) {
  let folded = 0, selfInt = 0, gaugeDropped = 0, allExact = true, allVerified = true, allBoundaryExact = true;
  const rows = [], genuine = [];
  real.forEach((sol, idx) => {
    const w = reconstructMomentW(sol, order);
    const ver = momentExactVerify(sol, momentPolys, order, deps);
    const u = momentUnivalence(w, order, deps);
    if (!u || !u.reliable) allExact = false;                                 // unreliable Schur–Cohn ⇒ not a `=`
    const w1 = (w[1] && w[1].re != null) ? w[1].re : w[1];
    const fold = u ? u.inside > 0 : false;
    const cusps = u ? u.onCircle : 0;
    const ptNote = ver.exact ? ' [exact ℚ(i) root]' : ' [rationalized ≈]';
    if (fold) { folded++; rows.push('#' + (idx + 1) + ': φ′ = 0 inside 𝔻 (fold, Schur–Cohn) — not univalent'); return; }
    if (!(w1 > 0)) { gaugeDropped++; rows.push('#' + (idx + 1) + ': w₁ = ' + (Math.round(w1 * 1e4) / 1e4) + ' ≤ 0 — rotation-gauge copy (w₁>0 representative kept)'); return; }
    // GLOBAL univalence (C1-ext): φ(∂𝔻) simple via the exact boundary double-point count (SIMPLE ⟺ count
    // === cusps). Trust it ONLY when the LOCAL Schur–Cohn was reliable (else `cusps` is unreliable and the
    // count===cusps test could be wrong). Required for order ≥ 3; order ≤ 2 it confirms A&S; else local-only.
    let boundarySimple = true, boundaryExact = false;
    if (u && u.reliable) { const bs = momentBoundarySimple(w, order, cusps, deps); if (bs) { boundarySimple = bs.simple; boundaryExact = true; } }
    if (!boundaryExact) allBoundaryExact = false;
    if (!boundarySimple) { selfInt++; rows.push('#' + (idx + 1) + ': boundary φ(∂𝔻) self-intersects (real double-point count) — not globally univalent'); return; }
    if (!ver.exact) allVerified = false;                                     // only GENUINE (kept) candidates gate allVerified
    genuine.push({ w, order, exactPoint: !!ver.exact, cusps, boundaryExact });
    const cuspNote = cusps > 0 ? ' — boundary cusp ×' + cusps : '';
    rows.push('#' + (idx + 1) + ': univalent ✓ — genuine quadrature domain' + cuspNote + (u ? ' (Schur–Cohn' + (boundaryExact ? ' + boundary-simple' : '') + ptNote + ')' : ''));
  });
  return { genuine, rows, folded, selfInt, gaugeDropped, nonUniv: folded + selfInt, allExact, allVerified, allBoundaryExact };
}

// Assemble the moment-route verdict. ORDER ≤ 2 is fully rigorous (A&S: φ′≠0 in 𝔻 ⇔ genuine QD, unique);
// order ≥ 3 certifies LOCAL univalence only (global proven only through order 2), so it reads 'estimate'
// with an honest note. deps.caps.momentOrder carries n. Returns { verdict, rigor, bad, count, rigorProvenance }.
export function assembleMomentVerdict(a) {
  const { genuine, real, leaf, order, deps, sliceCaveat, cl } = a;
  const D = genuine.length, plur = real.length === 1 ? '' : 's';
  const allExactFilter = leaf.allExact, allVerified = leaf.allVerified;
  // GLOBAL univalence is certified when the exact boundary double-point count ran for every genuine
  // candidate (φ(∂𝔻) simple ⟺ count === cusps — rigorous for ANY order); for order ≤ 2 the A&S theorem
  // also gives global from the local φ′≠0 test, a fallback when the boundary count is unavailable.
  const globalCertified = leaf.allBoundaryExact || order <= 2;
  const rej = [leaf.folded ? leaf.folded + ' fold' : '', leaf.selfInt ? leaf.selfInt + ' self-intersecting' : '', leaf.gaugeDropped ? leaf.gaugeDropped + ' gauge copy' : ''].filter(Boolean).join(', ');
  const tail = rej ? ' (' + rej + ' rejected)' : '';
  const form = ' · point-functional / Aharonov–Shapiro formulation, order ' + order;
  let verdict;
  // WORDING honesty: only claim "genuine QD ✓" when GLOBAL univalence is certified (a locally-univalent map
  // need not be globally injective); otherwise present the count as locally-univalent CANDIDATES.
  if (D === 0) verdict = 'No genuine quadrature domain: ' + real.length + ' real moment solution' + plur + ', none univalent' + tail + '.' + form;
  else if (globalCertified) verdict = (D === 1 ? 'Unique quadrature domain ✓ — 1 genuine QD' : D + ' distinct quadrature domains') + ' of ' + real.length + ' real moment solution' + plur + tail + '.' + form;
  else verdict = D + ' locally-univalent candidate' + (D === 1 ? '' : 's') + ' of ' + real.length + ' real moment solution' + plur + tail + '.' + form;
  if (D >= 1) {
    const atRoot = allVerified ? ' at the exact ℚ(i) root' : ' at rationalized coordinates';
    verdict += leaf.allBoundaryExact
      ? ' · φ′≠0 in 𝔻 + φ(∂𝔻) simple certified (Schur–Cohn + exact boundary double-point count) ⇒ globally univalent' + (order <= 2 ? ' (Aharonov–Shapiro)' : '') + atRoot
      : (order <= 2 ? ' · φ′≠0 in 𝔻 certified (Schur–Cohn) ⇒ globally univalent (Aharonov–Shapiro, order ≤ 2)' + atRoot
                    : ' · ⚠ LOCAL univalence certified (Schur–Cohn φ′≠0 in 𝔻); the exact boundary-simple count was unavailable — GLOBAL univalence not certified for order ≥ 3');
    verdict += ' · class: classical bounded quadrature domains for the point functional, up to the rotation gauge (w₁>0)';
  }
  if (cl) verdict += sliceCaveat(cl);
  // D === 0 (no genuine QD): "no quadrature domain exists" is certified `=` ONLY when the univalence
  // filter that emptied the set was itself reliable. momentCertifyLeaf clears allExact when any
  // candidate's Schur–Cohn was UNRESOLVED (it still folds on the raw, unreliable inertia count), so a
  // genuine QD can be mis-rejected there — read 'estimate' in that case. The rational and triangle
  // routes already gate the empty case this way (assembleRationalVerdict / assembleTriangleVerdict);
  // the moment route was the lone exception, stamping a green `=` on a possibly-wrong "no QD".
  const rigor = D === 0 ? (allExactFilter ? 'exact' : 'estimate')
    : (globalCertified && allExactFilter && allVerified) ? 'exact' : 'estimate';
  const prov = rigorProvenance({ certified: true, allExactFilter, allExactVerified: allVerified, ccChecked: false, undercount: false, partial: false, truncated: false });
  if (D >= 1) prov.push(leaf.allBoundaryExact
    ? '✓ global univalence: φ(∂𝔻) simple, exact boundary double-point count (SIMPLE ⟺ count === cusps)'
    : (order <= 2 ? '✓ global univalence via Aharonov–Shapiro (order ≤ 2: φ′≠0 in 𝔻 ⇔ univalent)'
                  : '✗ global univalence (only LOCAL φ′≠0 certified; the boundary-simple count was unavailable — order ≥ 3 not certified)'));
  return { verdict, rigor, bound: rigor === 'exact' ? '=' : '≈', bad: D === 0, count: D, rigorProvenance: prov };
}

// The moment-route plan (Phase C1): classify the point-functional moment system, certified-solve it, filter
// univalence (Schur–Cohn on φ′), gauge-quotient (w₁>0), and assemble. ctx = { classify, solveCertified,
// momentPolys, order, deps, sliceCaveat, onStage, signal }. Returns a ProofResult (kind 'moment' on success).
export async function runMomentPlan(ctx) {
  const stage = (id) => { if (ctx.onStage) ctx.onStage(id); };
  const order = ctx.order;
  stage('regime');
  const cl = await ctx.classify();
  if (cl && cl.aborted) return { kind: 'aborted', cl };
  if (!cl || !cl.ok) return { kind: 'error', reason: (cl && cl.reason) || 'classify failed', cl: cl || null };
  if (cl.inconsistent) return { kind: 'inconsistent', verdict: 'No quadrature domain: the moment system is inconsistent (1 ∈ I).' + ctx.sliceCaveat(cl), rigor: 'exact', bad: true, cl };
  if (!cl.zeroDim) return { kind: 'positive-dim', verdict: 'Underdetermined: the moment system is positive-dimensional (degenerate moment data — ' + ctx.posDimDesc(cl) + ').' + ctx.sliceCaveat(cl), rigor: 'unknown', bad: true, cl };
  stage('solve-real');
  const r = await ctx.solveCertified();
  if (r && r.aborted) return { kind: 'aborted', cl };
  if (!r || !r.ok) return { kind: 'error', reason: (r && r.reason) || 'solve failed', cl };
  const real = (r.solutions || []).filter((s) => Object.keys(s).every((k) => Math.abs(s[k].im) < 1e-4));
  if (!real.length) return { kind: 'no-real', verdict: 'No quadrature domain: the moment system has no real solution' + (cl.complexCount != null ? ' (of ' + cl.complexCount + ' distinct complex)' : '') + '.' + ctx.sliceCaveat(cl), rigor: 'exact', bad: true, cl, real };
  stage('filter');
  const leaf = momentCertifyLeaf(real, order, ctx.deps, ctx.momentPolys);
  stage('gauge'); stage('assemble');
  const asm = assembleMomentVerdict({ genuine: leaf.genuine, real, leaf, order, deps: ctx.deps, sliceCaveat: ctx.sliceCaveat, cl });
  return { kind: 'moment', verdict: asm.verdict, rigor: asm.rigor, bound: asm.bound, bad: asm.bad, count: asm.count, cl, real, certified: true, rows: leaf.rows, rigorProvenance: asm.rigorProvenance, genuine: leaf.genuine, order };
}

// ============================================================================================
// C2-3 — the RATIONAL-φ multi-node route: gauge quotient + verdict assembly (mirrors the moment route).
// ============================================================================================
export const RATIONAL_STAGES = [
  { id: 'regime', title: 'Regime', why: 'Classify the rational-φ shape system in (t=√c, d): inconsistent ⇒ no QD; positive-dimensional ⇒ underdetermined; zero-dimensional ⇒ a finite count.' },
  { id: 'solve-real', title: 'Solve (real)', why: 'Certified real solutions (RUR + exact Sturm) of the shape system — every candidate degree-2 rational map φ(z)=w₀+R(z+dz²)/(1−cz²).' },
  { id: 'filter', title: 'Univalence filter', why: 'Per candidate: poles outside 𝔻̄ (c<1), exact Schur–Cohn on the φ′ numerator (φ′≠0 in 𝔻), and the exact boundary double-point count (φ(∂𝔻) simple) ⇒ globally univalent.' },
  { id: 'gauge', title: 'Gauge quotient', why: 'The rotation gauge is R = φ′(0) > 0 (t = √c > 0); the ±t/±R copies are the same domain — keep t>0, and dedupe by the shape (c, d).' },
  { id: 'assemble', title: 'Verdict', why: 'Count the distinct genuine domains + assemble the rigor-badged verdict.' },
];

// Reconstruct the degree-2 rational map from a solved shape (t, d) + the node data: c = t², and the gauge
// unknowns R = φ′(0), w0 = φ(0) recovered from the (analytically-eliminated) node equations
//   R = (a₁ − a₂)(1 − t⁴)/(2t),  w0 = (a₁ + a₂)/2 − R·d·t²/(1 − t⁴).
// Returns { t, d, c, R, w0 } (numeric).
export function reconstructRationalMap(sol, nodeData) {
  const g = (nm) => { const c = sol[nm + '__re']; return c ? c.re : 0; };
  const reOf = (z) => (z && z.re != null) ? z.re : z;
  const t = g('t'), d = g('d');
  let a1 = reOf(nodeData.nodes[0]), a2 = reOf(nodeData.nodes[1]);
  if (a1 < a2) { const tmp = a1; a1 = a2; a2 = tmp; }                     // canonical: a₁ = larger Re (the +t node ⇒ R>0), matching the builder's node sort
  const c = t * t, om = 1 - c * c;                                        // c = t², om = 1 − t⁴
  const R = (Math.abs(t) > 1e-12 && Math.abs(om) > 1e-12) ? (a1 - a2) * om / (2 * t) : NaN;
  const w0 = (Math.abs(om) > 1e-12) ? (a1 + a2) / 2 - R * d * c / om : NaN;   // d·t² = d·c
  return { t, d, c, R, w0 };
}

// PF-1 for the rational route: rationalize (t, d) and check they solve EVERY shape equation exactly over ℚ.
export function rationalExactVerify(sol, sysPolys, deps) {
  const Sym = deps && deps.QD && deps.QD.Sym, QE = deps && deps.QE;
  if (!Sym || !QE || !sysPolys || typeof QE.ratApprox !== 'function') return { exact: false };
  const snap = (x) => { const a = QE.ratApprox(x || 0); return Sym.mpolyConst(Sym.gauss(Sym.rat(a[0], a[1]), Sym.rat(0, 1))); };
  const g = (nm) => { const c = sol[nm + '__re']; return c ? c.re : 0; };
  const sub = { t: snap(g('t')), d: snap(g('d')) };
  try { for (const p of sysPolys) { if (!p.subst(sub).isZero()) return { exact: false }; } } catch (e) { return { exact: false }; }
  return { exact: true };
}

// Per-system univalence filter for the rational route: reconstruct each real (t,d) candidate's map,
// gauge-quotient (t>0 canonical; dedupe by the shape (c,d)), and keep the GENUINE ones (poles outside 𝔻̄,
// φ′≠0 in 𝔻, φ(∂𝔻) simple). Returns { genuine, rows, folded, selfInt, poleRej, gaugeDropped, allExact,
// allVerified, allBoundaryExact }.
export function rationalCertifyLeaf(real, nodeData, sysPolys, deps) {
  let folded = 0, selfInt = 0, poleRej = 0, gaugeDropped = 0, allExact = true, allVerified = true, allBoundaryExact = true;
  const rows = [], genuine = [], seen = [], rnd = (x) => Math.round(x * 1e4) / 1e4;
  real.forEach((sol, idx) => {
    const m = reconstructRationalMap(sol, nodeData);
    // Node order is canonicalized (a₁ = larger Re, in both the builder and reconstructRationalMap), so the
    // genuine (pole-outside, t<1) candidate has R>0 by construction; t≤0 is the rotation-gauge copy, and a
    // pole-inside (t>1 ⇒ R<0) candidate is caught below by the poleOk check with its own informative reason.
    if (!(m.t > 0)) { gaugeDropped++; rows.push('#' + (idx + 1) + ': t = ' + rnd(m.t) + ' ≤ 0 — rotation-gauge copy (t>0 / R>0 representative kept)'); return; }
    const ver = rationalExactVerify(sol, sysPolys, deps);
    const u = rationalUnivalence(m.t, m.d, deps);
    if (!u || !u.reliable) allExact = false;                                 // unreliable Schur–Cohn ⇒ not a `=`
    if (u && !u.poleOk) { poleRej++; rows.push('#' + (idx + 1) + ': pole inside 𝔻̄ (c = t² ≥ 1) — not an analytic QD map'); return; }
    const fold = u ? u.inside > 0 : false;
    const cusps = u ? u.onCircle : 0;
    if (fold) { folded++; rows.push('#' + (idx + 1) + ': φ′ = 0 inside 𝔻 (fold, Schur–Cohn) — not univalent'); return; }
    let boundarySimple = true, boundaryExact = false;
    if (u && u.reliable) { const bs = rationalBoundarySimple(m.t, m.d, cusps, deps); if (bs) { boundarySimple = bs.simple; boundaryExact = true; } }
    if (!boundaryExact) allBoundaryExact = false;
    if (!boundarySimple) { selfInt++; rows.push('#' + (idx + 1) + ': boundary φ(∂𝔻) self-intersects (real double-point count) — not globally univalent'); return; }
    if (seen.some((s) => Math.abs(s.c - m.c) < 1e-7 && Math.abs(s.d - m.d) < 1e-7)) { gaugeDropped++; return; }   // same shape (c,d)
    seen.push({ c: m.c, d: m.d });
    if (!ver.exact) allVerified = false;                                     // only GENUINE (kept) candidates gate allVerified
    const ptNote = ver.exact ? ' [exact ℚ(i) root]' : ' [rationalized ≈]';
    const cuspNote = cusps > 0 ? ' — boundary cusp ×' + cusps : '';
    genuine.push({ ...m, cusps, exactPoint: !!ver.exact, boundaryExact });
    rows.push('#' + (idx + 1) + ': univalent ✓ — genuine quadrature domain' + cuspNote + ' (Schur–Cohn' + (boundaryExact ? ' + boundary-simple' : '') + ptNote + ')');
  });
  return { genuine, rows, folded, selfInt, poleRej, gaugeDropped, nonUniv: folded + selfInt + poleRej, allExact, allVerified, allBoundaryExact };
}

// Assemble the rational-route verdict. Unlike the moment route there is NO A&S order≤2 fallback — GLOBAL
// univalence is `=` ONLY when the exact boundary double-point count ran (allBoundaryExact); otherwise LOCAL
// only. Returns { verdict, rigor, bad, count, rigorProvenance }.
export function assembleRationalVerdict(a) {
  const { genuine, real, leaf, deps, sliceCaveat, cl } = a;
  const D = genuine.length, plur = real.length === 1 ? '' : 's';
  const allExactFilter = leaf.allExact, allVerified = leaf.allVerified;
  const rej = [leaf.folded ? leaf.folded + ' fold' : '', leaf.selfInt ? leaf.selfInt + ' self-intersecting' : '', leaf.poleRej ? leaf.poleRej + ' pole-in-𝔻̄' : '', leaf.gaugeDropped ? leaf.gaugeDropped + ' gauge copy' : ''].filter(Boolean).join(', ');
  const tail = rej ? ' (' + rej + ' rejected)' : '';
  const form = ' · rational-φ (degree-2 multi-node, Gustafsson) formulation';
  let verdict;
  // WORDING honesty: "genuine QD ✓" only when GLOBAL univalence is certified (allBoundaryExact); a merely
  // locally-univalent map need not be a simple domain, so present it as a candidate.
  if (D === 0) verdict = 'No genuine quadrature domain: ' + real.length + ' real shape solution' + plur + ', none univalent' + tail + '.' + form;
  else if (leaf.allBoundaryExact) verdict = (D === 1 ? 'Unique quadrature domain ✓ — 1 genuine QD' : D + ' distinct quadrature domains') + ' of ' + real.length + ' real shape solution' + plur + tail + '.' + form;
  else verdict = D + ' locally-univalent candidate' + (D === 1 ? '' : 's') + ' of ' + real.length + ' real shape solution' + plur + tail + '.' + form;
  if (D >= 1) {
    const atRoot = allVerified ? ' at the exact ℚ(i) root' : ' at rationalized coordinates';
    verdict += leaf.allBoundaryExact
      ? ' · φ′≠0 in 𝔻 + φ(∂𝔻) simple certified (Schur–Cohn + exact boundary double-point count) ⇒ globally univalent' + atRoot
      : ' · ⚠ LOCAL univalence certified (Schur–Cohn φ′≠0 in 𝔻); the exact boundary-simple count was unavailable — GLOBAL univalence not certified';
    verdict += ' · class: classical bounded quadrature domains for the multi-node data, up to the rotation gauge (R>0)';
  }
  if (cl) verdict += sliceCaveat(cl);
  const rigor = D === 0 ? (allExactFilter ? 'exact' : 'estimate')
    : (leaf.allBoundaryExact && allExactFilter && allVerified) ? 'exact' : 'estimate';
  const prov = rigorProvenance({ certified: true, allExactFilter, allExactVerified: allVerified, ccChecked: false, undercount: false, partial: false, truncated: false });
  if (D >= 1) prov.push(leaf.allBoundaryExact
    ? '✓ global univalence: φ(∂𝔻) simple, exact boundary double-point count (SIMPLE ⟺ count === cusps)'
    : '✗ global univalence (only LOCAL φ′≠0 certified; the boundary-simple count was unavailable)');
  return { verdict, rigor, bound: rigor === 'exact' ? '=' : '≈', bad: D === 0, count: D, rigorProvenance: prov };
}

// The rational-route plan (Phase C2): classify the rational-φ shape system, certified-solve it in (t, d),
// filter univalence, gauge-quotient, and assemble. ctx = { classify, solveCertified, sysPolys, nodeData,
// deps, sliceCaveat, posDimDesc, onStage, signal }. Returns a ProofResult (kind 'rational' on success).
export async function runRationalPlan(ctx) {
  const stage = (id) => { if (ctx.onStage) ctx.onStage(id); };
  stage('regime');
  const cl = await ctx.classify();
  if (cl && cl.aborted) return { kind: 'aborted', cl };
  if (!cl || !cl.ok) return { kind: 'error', reason: (cl && cl.reason) || 'classify failed', cl: cl || null };
  if (cl.inconsistent) return { kind: 'inconsistent', verdict: 'No quadrature domain: the rational-φ shape system is inconsistent (1 ∈ I).' + ctx.sliceCaveat(cl), rigor: 'exact', bad: true, cl };
  if (!cl.zeroDim) return { kind: 'positive-dim', verdict: 'Underdetermined: the rational-φ shape system is positive-dimensional (' + ctx.posDimDesc(cl) + ').' + ctx.sliceCaveat(cl), rigor: 'unknown', bad: true, cl };
  stage('solve-real');
  const r = await ctx.solveCertified();
  if (r && r.aborted) return { kind: 'aborted', cl };
  if (!r || !r.ok) return { kind: 'error', reason: (r && r.reason) || 'solve failed', cl };
  const real = (r.solutions || []).filter((s) => Object.keys(s).every((k) => Math.abs(s[k].im) < 1e-4));
  if (!real.length) return { kind: 'no-real', verdict: 'No quadrature domain: the rational-φ shape system has no real solution' + (cl.complexCount != null ? ' (of ' + cl.complexCount + ' distinct complex)' : '') + '.' + ctx.sliceCaveat(cl), rigor: 'exact', bad: true, cl, real };
  stage('filter');
  const leaf = rationalCertifyLeaf(real, ctx.nodeData, ctx.sysPolys, ctx.deps);
  stage('gauge'); stage('assemble');
  const asm = assembleRationalVerdict({ genuine: leaf.genuine, real, leaf, deps: ctx.deps, sliceCaveat: ctx.sliceCaveat, cl });
  return { kind: 'rational', verdict: asm.verdict, rigor: asm.rigor, bound: asm.bound, bad: asm.bad, count: asm.count, cl, real, certified: true, rows: leaf.rows, rigorProvenance: asm.rigorProvenance, genuine: leaf.genuine, nodeData: ctx.nodeData };
}

// ============================================================================================
// C3-3 — the EQUILATERAL-TRIANGLE (degree-3) route: gauge quotient + verdict assembly.
// ============================================================================================
export const TRIANGLE_STAGES = [
  { id: 'regime', title: 'Regime', why: 'Classify the equilateral-triangle shape system in (R, s=c^{1/3}): inconsistent ⇒ no QD; positive-dimensional ⇒ underdetermined; zero-dimensional ⇒ a finite count.' },
  { id: 'solve-real', title: 'Solve (real)', why: 'Certified real solutions (RUR + exact Sturm) of the shape system — every candidate map φ(z)=R·z/(1−c·z³).' },
  { id: 'filter', title: 'Univalence filter', why: 'Per candidate: poles outside 𝔻̄ (|c|<1), exact Schur–Cohn on the φ′ numerator 1+2cz³ (φ′≠0 in 𝔻), and the exact boundary double-point count (φ(∂𝔻) simple) ⇒ globally univalent.' },
  { id: 'gauge', title: 'Gauge quotient', why: 'The rotation gauge is R = φ′(0) > 0 (s = c^{1/3} > 0); the ±R/±s copies are the same domain — keep R>0, s>0, dedupe by c.' },
  { id: 'assemble', title: 'Verdict', why: 'Count the distinct genuine domains + assemble the rigor-badged verdict.' },
];

// Reconstruct the triangle map from a solved shape (P=R², s): R = √P, c = s³. φ(z) = R·z/(1 − c·z³), centred 0.
export function reconstructTriangleMap(sol) {
  const g = (nm) => { const c = sol[nm + '__re']; return c ? c.re : 0; };
  const P = g('P'), s = g('s');
  return { R: P >= 0 ? Math.sqrt(P) : NaN, s, c: s * s * s, P };
}

// PF-1 for the triangle route: rationalize (P, s) and check they solve every shape equation exactly over ℚ.
export function triangleExactVerify(sol, sysPolys, deps) {
  const Sym = deps && deps.QD && deps.QD.Sym, QE = deps && deps.QE;
  if (!Sym || !QE || !sysPolys || typeof QE.ratApprox !== 'function') return { exact: false };
  const snap = (x) => { const a = QE.ratApprox(x || 0); return Sym.mpolyConst(Sym.gauss(Sym.rat(a[0], a[1]), Sym.rat(0, 1))); };
  const g = (nm) => { const c = sol[nm + '__re']; return c ? c.re : 0; };
  const sub = { P: snap(g('P')), s: snap(g('s')) };
  try { for (const p of sysPolys) { if (!p.subst(sub).isZero()) return { exact: false }; } } catch (e) { return { exact: false }; }
  return { exact: true };
}

// Per-system univalence filter for the triangle route: reconstruct each real (R,s) candidate, gauge-quotient
// (R>0, s>0 canonical; dedupe by c), keep the genuine (poles outside 𝔻̄, φ′≠0 in 𝔻, φ(∂𝔻) simple).
export function triangleCertifyLeaf(real, nodeData, sysPolys, deps) {
  let folded = 0, selfInt = 0, poleRej = 0, gaugeDropped = 0, allExact = true, allVerified = true, allBoundaryExact = true;
  const rows = [], genuine = [], seen = [], rnd = (x) => Math.round(x * 1e4) / 1e4;
  real.forEach((sol, idx) => {
    const m = reconstructTriangleMap(sol);
    if (!(m.R > 0) || !(m.s > 0)) { gaugeDropped++; rows.push('#' + (idx + 1) + ': R = ' + rnd(m.R) + ', s = ' + rnd(m.s) + ' — rotation/sign-gauge copy (R>0, s>0 representative kept)'); return; }
    const ver = triangleExactVerify(sol, sysPolys, deps);
    const u = triangleUnivalence(m.c, deps);
    if (!u || !u.reliable) allExact = false;                                 // unreliable Schur–Cohn ⇒ not a `=`
    if (u && !u.poleOk) { poleRej++; rows.push('#' + (idx + 1) + ': pole inside 𝔻̄ (c = s³ ≥ 1) — not an analytic QD map'); return; }
    const fold = u ? u.inside > 0 : false;
    const cusps = u ? u.onCircle : 0;
    if (fold) { folded++; rows.push('#' + (idx + 1) + ': φ′ = 0 inside 𝔻 (fold, Schur–Cohn) — not univalent'); return; }
    let boundarySimple = true, boundaryExact = false;
    if (u && u.reliable) { const bs = triangleBoundarySimple(m.c, cusps, deps); if (bs) { boundarySimple = bs.simple; boundaryExact = true; } }
    if (!boundaryExact) allBoundaryExact = false;
    if (!boundarySimple) { selfInt++; rows.push('#' + (idx + 1) + ': boundary φ(∂𝔻) self-intersects (real double-point count) — not globally univalent'); return; }
    if (seen.some((cv) => Math.abs(cv - m.c) < 1e-7)) { gaugeDropped++; return; }        // same shape c
    seen.push(m.c);
    if (!ver.exact) allVerified = false;                                     // only GENUINE (kept) candidates gate allVerified
    const ptNote = ver.exact ? ' [exact ℚ(i) root]' : ' [rationalized ≈]';
    const cuspNote = cusps > 0 ? ' — boundary cusp ×' + cusps : '';
    genuine.push({ ...m, cusps, exactPoint: !!ver.exact, boundaryExact });
    rows.push('#' + (idx + 1) + ': univalent ✓ — genuine quadrature domain' + cuspNote + ' (Schur–Cohn' + (boundaryExact ? ' + boundary-simple' : '') + ptNote + ')');
  });
  return { genuine, rows, folded, selfInt, poleRej, gaugeDropped, nonUniv: folded + selfInt + poleRej, allExact, allVerified, allBoundaryExact };
}

// Assemble the triangle-route verdict. `=` ONLY when the exact boundary count certifies GLOBAL univalence
// (allBoundaryExact) at the exact ℚ(i) root; else LOCAL-only `estimate`. Returns { verdict, rigor, bad, count,
// rigorProvenance }.
export function assembleTriangleVerdict(a) {
  const { genuine, real, leaf, sliceCaveat, cl } = a;
  const D = genuine.length, plur = real.length === 1 ? '' : 's';
  const allExactFilter = leaf.allExact, allVerified = leaf.allVerified;
  const rej = [leaf.folded ? leaf.folded + ' fold' : '', leaf.selfInt ? leaf.selfInt + ' self-intersecting' : '', leaf.poleRej ? leaf.poleRej + ' pole-in-𝔻̄' : '', leaf.gaugeDropped ? leaf.gaugeDropped + ' gauge copy' : ''].filter(Boolean).join(', ');
  const tail = rej ? ' (' + rej + ' rejected)' : '';
  const form = ' · rational-φ (equilateral triangle, degree-3, Gustafsson) formulation';
  let verdict;
  // WORDING honesty: "genuine QD ✓" only when GLOBAL univalence is certified (allBoundaryExact); else present
  // the locally-univalent maps as candidates.
  if (D === 0) verdict = 'No genuine quadrature domain: ' + real.length + ' real shape solution' + plur + ', none univalent' + tail + '.' + form;
  else if (leaf.allBoundaryExact) verdict = (D === 1 ? 'Unique quadrature domain ✓ — 1 genuine QD' : D + ' distinct quadrature domains') + ' of ' + real.length + ' real shape solution' + plur + tail + '.' + form;
  else verdict = D + ' locally-univalent candidate' + (D === 1 ? '' : 's') + ' of ' + real.length + ' real shape solution' + plur + tail + '.' + form;
  if (D >= 1) {
    const atRoot = allVerified ? ' at the exact ℚ(i) root' : ' at rationalized coordinates';
    verdict += leaf.allBoundaryExact
      ? ' · φ′≠0 in 𝔻 + φ(∂𝔻) simple certified (Schur–Cohn + exact boundary double-point count) ⇒ globally univalent' + atRoot
      : ' · ⚠ LOCAL univalence certified (Schur–Cohn φ′≠0 in 𝔻); the exact boundary-simple count was unavailable — GLOBAL univalence not certified';
    verdict += ' · class: classical bounded quadrature domains for the equilateral 3-node data, up to the rotation gauge (R>0)';
  }
  if (cl) verdict += sliceCaveat(cl);
  const rigor = D === 0 ? (allExactFilter ? 'exact' : 'estimate')
    : (leaf.allBoundaryExact && allExactFilter && allVerified) ? 'exact' : 'estimate';
  const prov = rigorProvenance({ certified: true, allExactFilter, allExactVerified: allVerified, ccChecked: false, undercount: false, partial: false, truncated: false });
  if (D >= 1) prov.push(leaf.allBoundaryExact
    ? '✓ global univalence: φ(∂𝔻) simple, exact boundary double-point count (SIMPLE ⟺ count === cusps)'
    : '✗ global univalence (only LOCAL φ′≠0 certified; the boundary-simple count was unavailable)');
  return { verdict, rigor, bound: rigor === 'exact' ? '=' : '≈', bad: D === 0, count: D, rigorProvenance: prov };
}

// The triangle-route plan (Phase C3): classify → certified real solve in (R, s) → filter univalence → gauge
// quotient → assemble. ctx = { classify, solveCertified, sysPolys, nodeData, deps, sliceCaveat, posDimDesc,
// onStage, signal }. Returns a ProofResult (kind 'triangle' on success).
export async function runTrianglePlan(ctx) {
  const stage = (id) => { if (ctx.onStage) ctx.onStage(id); };
  stage('regime');
  const cl = await ctx.classify();
  if (cl && cl.aborted) return { kind: 'aborted', cl };
  if (!cl || !cl.ok) return { kind: 'error', reason: (cl && cl.reason) || 'classify failed', cl: cl || null };
  if (cl.inconsistent) return { kind: 'inconsistent', verdict: 'No quadrature domain: the triangle shape system is inconsistent (1 ∈ I).' + ctx.sliceCaveat(cl), rigor: 'exact', bad: true, cl };
  if (!cl.zeroDim) return { kind: 'positive-dim', verdict: 'Underdetermined: the triangle shape system is positive-dimensional (' + ctx.posDimDesc(cl) + ').' + ctx.sliceCaveat(cl), rigor: 'unknown', bad: true, cl };
  stage('solve-real');
  const r = await ctx.solveCertified();
  if (r && r.aborted) return { kind: 'aborted', cl };
  if (!r || !r.ok) return { kind: 'error', reason: (r && r.reason) || 'solve failed', cl };
  const real = (r.solutions || []).filter((s) => Object.keys(s).every((k) => Math.abs(s[k].im) < 1e-4));
  if (!real.length) return { kind: 'no-real', verdict: 'No quadrature domain: the triangle shape system has no real solution' + (cl.complexCount != null ? ' (of ' + cl.complexCount + ' distinct complex)' : '') + '.' + ctx.sliceCaveat(cl), rigor: 'exact', bad: true, cl, real };
  stage('filter');
  const leaf = triangleCertifyLeaf(real, ctx.nodeData, ctx.sysPolys, ctx.deps);
  stage('gauge'); stage('assemble');
  const asm = assembleTriangleVerdict({ genuine: leaf.genuine, real, leaf, sliceCaveat: ctx.sliceCaveat, cl });
  return { kind: 'triangle', verdict: asm.verdict, rigor: asm.rigor, bound: asm.bound, bad: asm.bad, count: asm.count, cl, real, certified: true, rows: leaf.rows, rigorProvenance: asm.rigorProvenance, genuine: leaf.genuine, nodeData: ctx.nodeData };
}
