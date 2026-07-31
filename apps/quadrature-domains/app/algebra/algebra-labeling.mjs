// algebra-labeling.mjs -- pure honest-labeling verdict prose, carved out of installAlgebra
// (algebra-ui.mjs) — refactor D, installAlgebra carve-out 1.
//
// `classifyVerdict` is the decision tree that turns a store.classify RESULT into the plain-language
// existence/uniqueness verdict shown on the algebra card (doClassify). It is the project's honest-labeling
// guardrail in prose form: a zero-dimensional real-solution count is only ever an UPPER BOUND on #QD (it can
// include non-univalent maps, gauge copies, and the {|z_j|=1} boundary stratum), so the wording must never
// read as a certified count — only "Certify univalence" yields that. `posDimDesc` (the pure size-of-a-
// positive-dimensional-family leaf, previously module-scoped in algebra-ui as a T1 helper) moves here with
// it: it is classifyVerdict's only dependency and belongs with the labeling prose. Both are PURE — they read
// only fields of the plain result object and touch no DOM / state / store / QD. Extracted VERBATIM;
// behavior-preserving, pinned by vitest/algebra-classify-verdict.test.ts.
//
// NOTE: this carve deliberately does NOT unify the three drifted verdict builders in algebra-ui.mjs
// (doClassify @ ~3521, doAutoSolve @ ~3275, _verdictBadge @ ~4693). They share the decision STRUCTURE but
// have materially different wording, so merging them would change output — a separate, characterization-first
// step, not this behavior-preserving extraction.

// Honest one-line size of a positive-dimensional verdict: the true Krull DIMENSION when carried,
// alongside the ambient real-variable count; degrades to the variable count alone otherwise.
export function posDimDesc(r) {
  const nv = (r && r.numVars != null ? r.numVars : '?') + ' real variables';
  return (r && r.krullDim != null && r.krullDim >= 1) ? ('dimension ' + r.krullDim + ', ' + nv) : nv;
}

// The existence / uniqueness verdict prose for a (successful) store.classify result `r`. The caller
// guards `r.ok` before calling, then appends the shared slice/scope/branch caveats — this builds only the
// base line. Honest labeling: a real-solution count is an UPPER BOUND on #QD, never a certified count.
export function classifyVerdict(r) {
  let verdict;
  if (r.inconsistent) verdict = 'No quadrature domain: the system is inconsistent (1 ∈ I).';
  else if (!r.zeroDim) verdict = 'Infinitely many: a positive-dimensional family (' + posDimDesc(r) + ').';
  else if (r.realCount == null) verdict = 'Zero-dimensional: ' + r.multiplicity + ' complex solution(s) with multiplicity (real count unavailable: ' + (r.reason || '') + ').';
  else {
    const cx = r.complexCount, mult = r.multiplicity;
    const tail = (cx != null ? ' (of ' + cx + ' distinct complex' + (mult != null && mult > cx ? '; ' + mult + ' with multiplicity' : '') + ')' : '');
    if (r.realCount === 0) verdict = 'No real quadrature domain' + tail + '.';
    // HONEST LABELING (C-1): 1 real ALGEBRAIC solution is an upper bound on #QD, not "the unique QD"
    // — it may be non-univalent, a gauge copy, or on the {|z_j|=1} boundary stratum. Only Certify
    // univalence yields the genuine count. (The count>1 branch was already honest; align the ==1 one.)
    else if (r.realCount === 1) verdict = 'A unique real algebraic solution' + tail + ' — an upper bound on the quadrature-domain count; run Certify univalence for the genuine-QD count (gauge copies merged, non-univalent ones filtered).';
    else verdict = r.realCount + ' real algebraic solutions' + tail + ' — run Certify univalence for the genuine-QD count (gauge copies merged, non-univalent ones filtered).';
  }
  return verdict;
}

// Cap-failure guidance (carve-out 6; carved verbatim from installAlgebra). Honest labeling of the FAILURE
// side: when an op fails because the system is too large / hit a resource cap, say so AND point at the
// documented CAS-export escape hatch, rather than leaving a bare "exceeded …" message. `_isCapFailure` is
// the recognizer (also used by the DOM-coupled capFailVerdict, which stays in algebra-ui and imports it).

// Predicate: does a failure `reason` read like a cap / too-large / resource-limit failure?
export function _isCapFailure(reason) { return /export|cap|exceed|too large|step|basis|degree|terms/i.test(reason || ''); }

// Append a CAS-route hint to a cap/too-large failure; every other failure passes through unchanged.
export function withGuidance(reason) {
  return _isCapFailure(reason)
    ? (reason + '  Try: assume variables real (simplifies the system), eliminate fewer variables, or use the CAS export.')
    : reason;
}
