// ESM (Phase 2 port). Registers onto the QD namespace.
import _QD from '../solvers/solver.mjs';
import { conjVar } from './qd-varscheme.mjs';   // the shared conjugate-model var scheme (A/C/z/a/w0)
// =============================================================================
// qd-constraints.js -- Univalence / geometric constraint generators for the
// classical BOUNDED QD symbolic system (QD.QDConstraints).
//
// Companion to qd-equations.js. Where that module emits the (●)/(★)/(gauge)
// EQUALITIES tying h-coefficients to map-coefficients, this module emits the
// univalence CONSTRAINTS the user can add to the algebraic system, in the same
// conjugate-variable model over ℚ(i):
//
//   (c) live inequalities  — convex  Re(1 + ζ φ″/φ′) > 0,
//                            star    Re(ζ φ′/(φ−w₀)) > 0,
//                            spiral  ∃λ: Re(e^{iλ} ζ φ′/(φ−w₀)) > 0   on |ζ|=1
//   (b) geometric borders  — discriminant_ζ of the on-circle polynomial of (c):
//                            the locus where convexity / star-likeness is lost
//   (a) local univalence   — φ′ ≠ 0 in 𝔻: the φ′ numerator + a Rabinowitsch
//                            saturation witness (1 − ω·numφ′). [Schur–Cohn
//                            inequality reduction is deferred to the CAS export.]
//   (d) global injectivity — the divided difference (φ(ζ₁)−φ(ζ₂))/(ζ₁−ζ₂): its
//                            vanishing on |ζ₁|=|ζ₂|=1, ζ₁≠ζ₂ is a boundary self-
//                            intersection (the TRUE-univalence condition).
//
// φ, φ′, φ″ at a generic boundary point ζ ('Z') are obtained by reusing
// QD.QDEquations.phiSeriesAt expanded at Z (so the (1−z̄_j ζ) Möbius denominators
// stay factored). Re(·) of a complex ratio N/D is formed as the Hermitian
// numerator N·D̄ + N̄·D (= 2|D|²·Re, same sign), using the conjugate-variable bar
// (conjugate the ℚ(i) coefficients AND swap each variable with its partner). The
// circle |ζ|=1 is carried as a companion relation ζ·ζ̄ − 1 = 0.
//
// Pure module: no DOM. Loads after qd-equations.js. Correctness is checked by the
// numeric oracle (qd-constraints.test.js): evaluate at the solver's numeric φ + a
// boundary point and compare against the float criteria in univalence.js.
// =============================================================================

(function (global) {
  'use strict';

  function getSym() {
    return (typeof window !== 'undefined' && window.QD && window.QD.Sym)
      || (typeof global !== 'undefined' && global.QD && global.QD.Sym)
      || (typeof QD !== 'undefined' && QD.Sym);
  }
  function getQE() {
    return (typeof window !== 'undefined' && window.QD && window.QD.QDEquations)
      || (typeof global !== 'undefined' && global.QD && global.QD.QDEquations)
      || (typeof QD !== 'undefined' && QD.QDEquations);
  }

  // Generic boundary-point + auxiliary variable names (kept distinct from the
  // pole-indexed names z1, A1_1, … used by qd-equations).
  const Z = 'Z', ZB = 'Zb';            // a boundary point ζ and its conjugate
  const Z1 = 'Z1', ZB1 = 'Zb1';        // two boundary points (global injectivity)
  const Z2 = 'Z2', ZB2 = 'Zb2';
  const COSL = 'cosL', SINL = 'sinL';  // spiral angle λ (existential): cos λ, sin λ
  const WSAT = 'Wsat';                 // Rabinowitsch saturation witness variable

  // Conjugate-partner of a variable name (the reality-slice bar). Self-inverse.
  function conjVarName(name) {
    if (name === Z) return ZB; if (name === ZB) return Z;             // constraint-specific
    if (name === Z1) return ZB1; if (name === ZB1) return Z1;         // boundary points ζ
    if (name === Z2) return ZB2; if (name === ZB2) return Z2;
    return conjVar(name);   // w0/wb0 + A/C/z/a bar-toggle (shared scheme); cosL/sinL/Wsat/unknown → unchanged
  }
  // Complex conjugate of an MPoly in the conjugate-variable model: bar the
  // coefficients (i→−i) AND swap every variable with its partner.
  function conjMPoly(p) { return p.conjCoeffs().relabel(conjVarName); }
  // Complex conjugate of an FRatFn (num + each factored-denominator factor).
  function conjFR(S, fr) {
    return new S.FRatFn(conjMPoly(fr.num), fr.den.map((f) => ({ p: conjMPoly(f.p), e: f.e })));
  }

  // φ(ζ), φ′(ζ), φ″(ζ) as FRatFn in {Z, z̄_j, Ā_{j,k}, w₀} (the bounded ansatz only
  // involves the barred coefficients). Reuses QD.QDEquations.phiSeriesAt at Z.
  function phiData(hData) {
    const S = getSym(); const QE = getQE();
    if (!S || !QE) throw new Error('QD.QDConstraints: QD.Sym / QD.QDEquations not loaded');
    const poles = (hData && hData.poles) || [];
    const ser = QE.phiSeriesAt(S, poles, Z, 2);            // [φ, φ′, φ″/2!]
    return { phi0: ser[0], phiP: ser[1], phiPP: ser[2].mul(S.FRatFn.fromInt(2)) };
  }
  // The φ′ numerator (an MPoly in Z + pole vars): φ′ ≠ 0 in 𝔻 ⇔ this ≠ 0 in 𝔻
  // (the Möbius denominators are nonzero on the closed disk).
  function phiPrimeNumerator(hData) { return phiData(hData).phiP.clearDenominators(); }

  // 2·Re(N/D)·|D|² = N·D̄ + N̄·D, the Hermitian (real on the reality slice)
  // numerator of Re(q) for q = N/D. Its SIGN equals sign(Re q) since |D|² > 0, so
  // "Re(q) > 0" ⇔ "this > 0". D = product of q's factored-denominator factors.
  function hermitianReNum(S, q) {
    let D = S.MPoly.fromInt(1);
    for (const f of q.den) D = D.mul(f.p.pow(f.e));
    const N = q.num;
    return N.mul(conjMPoly(D)).add(conjMPoly(N).mul(D));
  }

  // Fold an MPoly in (Z, Zb, …) onto the circle ζ̄ = 1/ζ: replace each monomial's
  // (Z^a Zb^b) by ζ^{a−b}, then multiply by ζ^{−min} so all exponents are ≥ 0.
  // The result is a polynomial in Z whose zeros on |ζ|=1 are the zeros of the
  // original on the circle (multiplying by the unit ζ^{−min} preserves the zero
  // set — so this is for the EQUALITY/border use, not the inequality).
  function foldCircle(S, poly) {
    let dmin = Infinity;
    for (const t of poly.terms.values()) {
      const net = (t.mono.get(Z) || 0) - (t.mono.get(ZB) || 0);
      if (net < dmin) dmin = net;
    }
    if (!isFinite(dmin)) return S.MPoly.zero();
    const out = new S.MPoly();
    for (const t of poly.terms.values()) {
      const a = t.mono.get(Z) || 0, b = t.mono.get(ZB) || 0;
      const mono = new Map(t.mono); mono.delete(Z); mono.delete(ZB);
      const e = a - b - dmin; if (e > 0) mono.set(Z, e);
      out._addTerm(mono, t.coeff);
    }
    return out;
  }

  function circleRel(S, zName, zbName) {
    return S.mpolyVar(zName).mul(S.mpolyVar(zbName)).sub(S.mpolyInt(1));
  }

  // ---- The generic geometric q for each class (FRatFn in Z + pole vars) -------
  function qConvex(S, d) {                 // 1 + ζ φ″/φ′
    const Zf = S.FRatFn.fromPoly(S.mpolyVar(Z));
    return S.FRatFn.fromInt(1).add(Zf.mul(d.phiPP).div(d.phiP));
  }
  function qStar(S, d) {                    // ζ φ′/(φ − w₀)
    const Zf = S.FRatFn.fromPoly(S.mpolyVar(Z));
    const w0 = S.FRatFn.fromPoly(S.mpolyVar('w0'));
    return Zf.mul(d.phiP).div(d.phi0.sub(w0));
  }
  function qSpiral(S, d) {                  // (cos λ + i sin λ) · ζ φ′/(φ − w₀)
    const unit = S.FRatFn.fromPoly(
      S.mpolyVar(COSL).add(S.mpolyConst(S.gaussInt(0, 1)).mul(S.mpolyVar(SINL))));
    return unit.mul(qStar(S, d));
  }

  // ---- Public node builders ---------------------------------------------------
  // Each returns one or more "constraint node descriptors":
  //   { label, poly: MPoly, rel: '='|'>'|'≠', meta: { form, role, onCircle?, params? } }

  function convexIneq(hData) {
    const S = getSym(); const d = phiData(hData);
    const P = hermitianReNum(S, qConvex(S, d));
    return [
      { label: 'convex: Re(1+ζφ″/φ′) > 0', poly: P, rel: '>',
        meta: { form: 'convex', role: 'inequality', onCircle: true } },
      { label: 'circle: ζζ̄ = 1', poly: circleRel(S, Z, ZB), rel: '=',
        meta: { form: 'convex', role: 'circle' } },
    ];
  }
  function starIneq(hData) {
    const S = getSym(); const d = phiData(hData);
    const P = hermitianReNum(S, qStar(S, d));
    return [
      { label: 'star-like: Re(ζφ′/(φ−w₀)) > 0', poly: P, rel: '>',
        meta: { form: 'star', role: 'inequality', onCircle: true } },
      { label: 'circle: ζζ̄ = 1', poly: circleRel(S, Z, ZB), rel: '=',
        meta: { form: 'star', role: 'circle' } },
    ];
  }
  function spiralIneq(hData) {
    const S = getSym(); const d = phiData(hData);
    const P = hermitianReNum(S, qSpiral(S, d));
    const lam = S.mpolyVar(COSL).pow(2).add(S.mpolyVar(SINL).pow(2)).sub(S.mpolyInt(1));
    return [
      { label: 'spiral-like: Re(e^{iλ}ζφ′/(φ−w₀)) > 0', poly: P, rel: '>',
        meta: { form: 'spiral', role: 'inequality', onCircle: true, params: [COSL, SINL] } },
      { label: 'spiral: cos²λ + sin²λ = 1', poly: lam, rel: '=',
        meta: { form: 'spiral', role: 'param' } },
      { label: 'circle: ζζ̄ = 1', poly: circleRel(S, Z, ZB), rel: '=',
        meta: { form: 'spiral', role: 'circle' } },
    ];
  }
  // Geometric border (b): discriminant in ζ of the on-circle polynomial of (c). Uses the
  // REDUCED discriminant (S.reducedDiscriminant), not the raw Res(p,∂p): the on-circle
  // polynomial's leading coefficient in ζ is parameter-dependent (a poly in the barred
  // pole vars), so the raw resultant Res = ±lc_ζ(pCircle)·disc would drag in the spurious
  // degree-drop branch lc_ζ(pCircle)=0 (where pCircle loses ζ-degree, NOT a genuine loss of
  // convexity/star-likeness). reducedDiscriminant divides that lc factor out, leaving only
  // the true double-root border.
  function geometricBorder(hData, which) {
    const S = getSym(); const d = phiData(hData);
    const P = hermitianReNum(S, which === 'star' ? qStar(S, d) : qConvex(S, d));
    const pCircle = foldCircle(S, P);
    const border = S.reducedDiscriminant(pCircle, Z);
    return [{ label: (which === 'star' ? 'star' : 'convex') + ' border: disc_ζ = 0',
      poly: border, rel: '=', meta: { form: which + 'Border', role: 'border' } }];
  }
  // Local univalence (a): φ′ numerator (≠0 in 𝔻) + Rabinowitsch saturation witness.
  function localUnivalence(hData) {
    const S = getSym();
    const numP = phiPrimeNumerator(hData);
    const witness = S.mpolyInt(1).sub(S.mpolyVar(WSAT).mul(numP));   // 1 − ω·numφ′
    return [
      { label: "φ′ numerator (≠ 0 in 𝔻)", poly: numP, rel: '≠',
        meta: { form: 'localUniv', role: 'nonvanishing' } },
      { label: 'saturation witness: 1 − ω·numφ′ = 0', poly: witness, rel: '=',
        meta: { form: 'localUniv', role: 'witness', params: [WSAT] } },
    ];
  }
  // The divided-difference numerator (φ(ζ₁)−φ(ζ₂))/(ζ₁−ζ₂) as an MPoly in {Z1, Z2,
  // z̄_j, Ā_{j,k}} — the w₀ constants cancel in φ(ζ₁)−φ(ζ₂), so only the barred pole vars
  // appear. Zero ⇔ φ(ζ₁)=φ(ζ₂) with the diagonal ζ₁=ζ₂ divided out (where it equals
  // φ′·(Möbius denominator ≠ 0 on 𝔻̄), so a diagonal zero ⇔ a boundary cusp φ′=0). Shared by
  // injectivity (the symbolic constraint generator) and boundaryDoublePointCount (the exact
  // per-solution boundary-injectivity test).
  function phiDividedDifference(hData) {
    const S = getSym(); const QE = getQE();
    const poles = (hData && hData.poles) || [];
    const phi1 = QE.phiSeriesAt(S, poles, Z1, 0)[0];     // FRatFn φ(ζ₁)
    const phi2 = QE.phiSeriesAt(S, poles, Z2, 0)[0];     // FRatFn φ(ζ₂)
    const numD = phi1.sub(phi2).clearDenominators();     // vanishes at ζ₁=ζ₂
    return S.mpolyExactDiv(numD, S.mpolyVar(Z1).sub(S.mpolyVar(Z2)));   // divided difference (diagonal removed)
  }
  // Global injectivity (d): the divided difference numerator + its conjugate, with
  // the two circle relations. φ(ζ₁)=φ(ζ₂) with ζ₁≠ζ₂ on the circle ⇔ a self-cross.
  function injectivity(hData) {
    const S = getSym();
    const numPhi = phiDividedDifference(hData);
    return [
      { label: 'injectivity: (φ(ζ₁)−φ(ζ₂))/(ζ₁−ζ₂) = 0', poly: numPhi, rel: '=',
        meta: { form: 'injectivity', role: 'divided-difference' } },
      { label: 'injectivity (conjugate): bar of the above = 0', poly: conjMPoly(numPhi), rel: '=',
        meta: { form: 'injectivity', role: 'divided-difference-conj' } },
      { label: 'circle: ζ₁ζ̄₁ = 1', poly: circleRel(S, Z1, ZB1), rel: '=',
        meta: { form: 'injectivity', role: 'circle' } },
      { label: 'circle: ζ₂ζ̄₂ = 1', poly: circleRel(S, Z2, ZB2), rel: '=',
        meta: { form: 'injectivity', role: 'circle' } },
    ];
  }

  // EXACT boundary-injectivity count for one candidate solution. Substitute the candidate's
  // exact ℚ(i) barred pole values (poleSubst: { z̄_j → const, Ā_{j,k} → const } — the SAME map
  // the Schur–Cohn local test builds) into the divided-difference numerator, then count the
  // REAL double points on the circle: substitute ζ_k → x_k + i·y_k (real x_k,y_k), split into
  // real/imaginary parts, append the two circle quadrics x_k²+y_k²−1, and run the Hermite
  // trace form (Sym.realSolutionCount). Returns { ok, count, reason }: count = #DISTINCT real
  // ordered off-diagonal solutions on |ζ₁|=|ζ₂|=1 (each unordered crossing appears twice);
  // count === 0 ⇔ the boundary curve φ(∂𝔻) is SIMPLE.
  //
  // PRECONDITION (the caller's gate): φ′ ≠ 0 on the CLOSED disk — i.e. the local Schur–Cohn
  // returned non-degenerate with no in-disk fold. Then numPhi(ζ,ζ)=φ′(ζ)·(≠0) has NO zero on
  // the circle, so there are no diagonal solutions and `count` is exactly the genuine boundary
  // self-intersections. ok:false (positive-dimensional / over the Hermite cap / no Sym) ⇒ the
  // caller falls back to the numeric QD.isBoundaryUnivalent — never mis-certifies.
  function boundaryDoublePointCount(hData, poleSubst, opts) {
    const S = getSym();
    if (!S || typeof S.realSolutionCount !== 'function') return { ok: false, count: null, reason: 'QD.Sym.realSolutionCount unavailable' };
    let N;
    try { N = phiDividedDifference(hData).subst(poleSubst || {}); }
    catch (e) { return { ok: false, count: null, reason: (e && e.message) || String(e) }; }
    const iC = S.mpolyConst(S.gaussInt(0, 1));
    const cx = (x, y) => S.mpolyVar(x).add(iC.mul(S.mpolyVar(y)));      // x + i·y
    const Nreim = N.subst({ [Z1]: cx('x1', 'y1'), [Z2]: cx('x2', 'y2') });
    const circ = (x, y) => S.mpolyVar(x).pow(2).add(S.mpolyVar(y).pow(2)).sub(S.mpolyInt(1));
    const system = [Nreim.realPart(), Nreim.imagPart(), circ('x1', 'y1'), circ('x2', 'y2')].filter((p) => !p.isZero());
    let r;
    try { r = S.realSolutionCount(system, null, ['x1', 'y1', 'x2', 'y2'], opts || {}); }
    catch (e) { return { ok: false, count: null, reason: (e && e.message) || String(e) }; }
    if (!r.ok) return { ok: false, count: null, reason: r.reason };
    return { ok: true, count: r.realCount, complexCount: r.complexCount };
  }

  // X1 — CERTIFIED boundary injectivity at an IRRATIONAL algebraic root (docs/algebra-review/X1_BOUNDARY.md).
  // Same divided-difference / circle-double-point system as boundaryDoublePointCount, but the barred pole
  // vars are substituted with the RUR coordinate MAPS g_v(t) (so they become polynomials in the RUR
  // primitive t, not rationalized constants), and minPoly(t)=0 is adjoined with t a solve variable. The
  // real roots of minPoly are EXACTLY the real QD solutions, so realSolutionCount returns the TOTAL boundary
  // double points over ALL of them; by the Hermite signature = #distinct-real-points theorem that total is
  // ≥ 0, hence count === 0 ⇒ EVERY real solution's boundary is simple — including the true root the proof is
  // about. Conservative (a real sibling self-intersection refuses the whole batch) but NEVER mis-certifies;
  // positive-dimensional / over the Hermite cap ⇒ ok:false ⇒ numeric fallback. PRECONDITION, as for the exact
  // test: φ′≠0 on 𝔻̄ (co-certified by the interval fold), so no diagonal solutions contaminate the count.
  // poleSubstInT: { z̄_j → MPoly(t), Ā_{j,k} → MPoly(t) }; minPolyInT: the RUR minimal polynomial in `tName`.
  function boundaryDoublePointCountParametric(hData, poleSubstInT, minPolyInT, tName, opts) {
    const S = getSym();
    if (!S || typeof S.realSolutionCount !== 'function') return { ok: false, count: null, reason: 'QD.Sym.realSolutionCount unavailable' };
    if (!minPolyInT || typeof minPolyInT.isZero !== 'function' || minPolyInT.isZero() || !tName)
      return { ok: false, count: null, reason: 'parametric boundary count needs a nonzero minPoly(t) and its variable name' };
    let N;
    try { N = phiDividedDifference(hData).subst(poleSubstInT || {}); }
    catch (e) { return { ok: false, count: null, reason: (e && e.message) || String(e) }; }
    const iC = S.mpolyConst(S.gaussInt(0, 1));
    const cx = (x, y) => S.mpolyVar(x).add(iC.mul(S.mpolyVar(y)));        // ζ_k = x_k + i·y_k
    const Nreim = N.subst({ [Z1]: cx('x1', 'y1'), [Z2]: cx('x2', 'y2') });
    const circ = (x, y) => S.mpolyVar(x).pow(2).add(S.mpolyVar(y).pow(2)).sub(S.mpolyInt(1));
    // …+ minPoly(t): pins t to the real QD solutions; t joins the solve variables (so the count sums over them).
    const system = [Nreim.realPart(), Nreim.imagPart(), circ('x1', 'y1'), circ('x2', 'y2'), minPolyInT].filter((p) => !p.isZero());
    let r;
    try { r = S.realSolutionCount(system, null, ['x1', 'y1', 'x2', 'y2', tName], opts || {}); }
    catch (e) { return { ok: false, count: null, reason: (e && e.message) || String(e) }; }
    if (!r.ok) return { ok: false, count: null, reason: r.reason };
    return { ok: true, count: r.realCount, complexCount: r.complexCount };
  }

  // Dispatcher: form → node descriptors.
  const FORMS = {
    convex: convexIneq, star: starIneq, spiral: spiralIneq,
    convexBorder: (h) => geometricBorder(h, 'convex'),
    starBorder: (h) => geometricBorder(h, 'star'),
    localUniv: localUnivalence, injectivity: injectivity,
  };
  function generateConstraint(hData, form) {
    const fn = FORMS[form];
    if (!fn) throw new Error('QDConstraints: unknown form ' + form);
    return fn(hData);
  }

  // ---- Numeric oracle helper --------------------------------------------------
  // Extend QD.QDEquations.buildVarMap with boundary points (reality slice ζ̄=conj ζ)
  // and the spiral angle, so constraint polynomials can be evaluated at the solver's
  // numeric φ. opts: { Z, Z1, Z2 } each {re,im}; { lambda } in radians.
  function boundaryVarMap(phi, hData, opts) {
    const QE = getQE();
    const m = QE.buildVarMap(phi, hData);
    const conj = (c) => ({ re: c.re, im: -c.im });
    opts = opts || {};
    if (opts.Z) { m[Z] = opts.Z; m[ZB] = conj(opts.Z); }
    if (opts.Z1) { m[Z1] = opts.Z1; m[ZB1] = conj(opts.Z1); }
    if (opts.Z2) { m[Z2] = opts.Z2; m[ZB2] = conj(opts.Z2); }
    if (opts.lambda != null) { m[COSL] = { re: Math.cos(opts.lambda), im: 0 }; m[SINL] = { re: Math.sin(opts.lambda), im: 0 }; }
    if (opts.Wsat) m[WSAT] = opts.Wsat;
    return m;
  }

  const QDConstraints = {
    generateConstraint, FORMS: Object.keys(FORMS),
    convexIneq, starIneq, spiralIneq, geometricBorder, localUnivalence, injectivity,
    phiDividedDifference, boundaryDoublePointCount, boundaryDoublePointCountParametric,
    phiData, phiPrimeNumerator, hermitianReNum, foldCircle, conjMPoly, conjVarName, conjFR,
    boundaryVarMap,
    VARS: { Z, ZB, Z1, ZB1, Z2, ZB2, COSL, SINL, WSAT },
  };

  const QD = _QD;
  QD.QDConstraints = QDConstraints;
})(typeof globalThis !== 'undefined' ? globalThis : this);
