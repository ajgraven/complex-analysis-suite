'use strict';
// =============================================================================
// qd-constraints tests — univalence / geometric constraint generators
// (QD.QDConstraints). Correctness is checked by a NUMERIC oracle: evaluate the
// generated polynomials at a constructed numeric φ + boundary point and compare
// against the closed-form criteria (φ′=1+2z for φ=z+z²; the disk is convex & star;
// the known φ=z+z² boundary self-crossing). No hand-derived expected polynomials.
// =============================================================================
require('./bootstrap');
loadInCtx('sym-core.js');
loadInCtx('qd-equations.js');
loadInCtx('qd-constraints.js');

module.exports = async function run() {
  section('qd-constraints — univalence/geometric constraints');
  const QC = QD.QDConstraints;
  ok('QD.QDConstraints exposed', !!QC && typeof QC.generateConstraint === 'function');

  // Constructed φ's (no solver needed; z̄_1 = 0 ⇒ the ansatz reduces to a polynomial).
  const phiDisk = { unbounded: false, w0: { re: 0, im: 0 }, branches: [{ z: { re: 0, im: 0 }, A: [{ re: 1.4, im: 0 }] }] };
  const hDisk = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1.96, im: 0 }] }] };           // φ(z)=1.4 z
  const phiQuad = { unbounded: false, w0: { re: 0, im: 0 }, branches: [{ z: { re: 0, im: 0 }, A: [{ re: 1, im: 0 }, { re: 1, im: 0 }] }] };
  const hQuad = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 0, im: 0 }, { re: 0, im: 0 }] }] }; // φ(z)=z+z²

  // ---- phiData: φ′, φ″ at a generic ζ match the closed form for φ=z+z² ----
  {
    const d = QC.phiData(hQuad);
    const m = QC.boundaryVarMap(phiQuad, hQuad, { Z: { re: 0.3, im: 0 } });
    const fp = d.phiP.evalComplex(m), fpp = d.phiPP.evalComplex(m);
    ok('phiData: φ′(0.3)=1+2·0.3 for φ=z+z²', approxEq(fp.re, 1.6, 1e-9) && Math.abs(fp.im) < 1e-9, 'fp=' + fp.re);
    ok('phiData: φ″=2 for φ=z+z²', approxEq(fpp.re, 2, 1e-9) && Math.abs(fpp.im) < 1e-9, 'fpp=' + fpp.re);
  }

  // ---- (c) convex/star inequalities: Hermitian (real on slice) + correct sign ----
  {
    const conv = QC.convexIneq(hDisk)[0].poly, star = QC.starIneq(hDisk)[0].poly;
    let allPos = true, allReal = true;
    for (let k = 0; k < 8; k++) {
      const m = QC.boundaryVarMap(phiDisk, hDisk, { Z: eit(k * Math.PI / 4) });
      const pv = conv.evalComplex(m), sv = star.evalComplex(m);
      if (pv.re <= 0 || sv.re <= 0) allPos = false;
      if (Math.abs(pv.im) > 1e-9 || Math.abs(sv.im) > 1e-9) allReal = false;
    }
    ok('disk: convex & star inequality polys > 0 on the circle', allPos);
    ok('disk: inequality polys are real on the reality slice (Hermitian)', allReal);

    // Cross-check the symbolic Hermitian poly against the INDEPENDENTLY-evaluated
    // Re(1 + ζ φ″/φ′) (computed from φ′, φ″ numerics + complex division) at many θ:
    // the cleared poly P = N·D̄ + N̄·D must be real and share Re(q)'s sign (P = 2|D|²·Re q).
    const d = QC.phiData(hQuad); const convQ = QC.convexIneq(hQuad)[0].poly;
    let signOK = true, realOK = true, checked = 0;
    for (let k = 0; k < 12; k++) {
      const Zc = eit(k * Math.PI / 6);
      const m = QC.boundaryVarMap(phiQuad, hQuad, { Z: Zc });
      const fp = d.phiP.evalComplex(m), fpp = d.phiPP.evalComplex(m);
      const qre = 1 + cdiv(cmul(Zc, fpp), fp).re;            // Re(1 + ζ φ″/φ′)
      const P = convQ.evalComplex(m);
      if (Math.abs(P.im) > 1e-7) realOK = false;
      if (Math.abs(qre) > 1e-6) { checked++; if (Math.sign(P.re) !== Math.sign(qre)) signOK = false; }
    }
    ok('φ=z+z²: convex poly real on the reality slice', realOK);
    ok('φ=z+z²: sign(convex poly) matches sign(Re(1+ζφ″/φ′)) over the circle',
       signOK && checked >= 8, 'checked=' + checked);
  }

  // ---- (c) spiral: λ=0 reduces to star (disk → >0); side relation holds ----
  {
    const nodes = QC.spiralIneq(hDisk);
    const P = nodes[0].poly, lam = nodes.find((n) => n.meta.role === 'param').poly;
    const m = QC.boundaryVarMap(phiDisk, hDisk, { Z: eit(0.7), lambda: 0 });
    ok('disk spiral(λ=0) > 0', P.evalComplex(m).re > 0);
    ok('spiral side relation cos²λ+sin²λ−1 = 0', Math.abs(lam.evalComplex(m).re) < 1e-12);
  }

  // ---- (a) local univalence: φ′ numerator ≠ 0 in 𝔻; saturation witness vanishes --
  {
    const nodes = QC.localUnivalence(hDisk);
    const numP = nodes.find((n) => n.meta.role === 'nonvanishing').poly;
    const wit = nodes.find((n) => n.meta.role === 'witness').poly;
    const mIn = QC.boundaryVarMap(phiDisk, hDisk, { Z: { re: 0.3, im: 0 } });
    const v = numP.evalComplex(mIn);
    ok('φ′ numerator ≠ 0 inside 𝔻 for the disk', Math.hypot(v.re, v.im) > 1e-9);
    const mW = QC.boundaryVarMap(phiDisk, hDisk, { Z: { re: 0.3, im: 0 }, Wsat: cdiv({ re: 1, im: 0 }, v) });
    ok('saturation witness 1−ω·numφ′ = 0 at ω = 1/numφ′',
       Math.hypot(wit.evalComplex(mW).re, wit.evalComplex(mW).im) < 1e-9);
  }

  // ---- (d) global injectivity: divided difference vanishes at a real self-crossing --
  {
    const nodes = QC.injectivity(hQuad);
    const numPhi = nodes[0].poly;
    // φ=z+z² self-intersects where ζ₁+ζ₂=−1 → ζ=e^{i2π/3}, e^{i4π/3}
    const cross = QC.boundaryVarMap(phiQuad, hQuad, { Z1: eit(4 * Math.PI / 3), Z2: eit(2 * Math.PI / 3) });
    const vc = numPhi.evalComplex(cross);
    ok('injectivity numerator ≈ 0 at the known φ=z+z² self-crossing', Math.hypot(vc.re, vc.im) < 1e-9,
       '|v|=' + Math.hypot(vc.re, vc.im).toExponential(2));
    const gen = QC.boundaryVarMap(phiQuad, hQuad, { Z1: eit(0.3), Z2: eit(1.1) });
    ok('injectivity numerator ≠ 0 at a generic distinct pair',
       Math.hypot(numPhi.evalComplex(gen).re, numPhi.evalComplex(gen).im) > 1e-9);
    ok('injectivity emits divided-difference + conjugate + two circle relations',
       nodes.length === 4 && nodes[2].meta.role === 'circle' && nodes[3].meta.role === 'circle');
  }

  // ---- (d-exact) boundaryDoublePointCount: EXACT real circle double-point count ----
  // Substitute exact ℚ(i) barred pole values into the shared divided difference, reim-split
  // over the two circle points, and count REAL double points via the Hermite trace form.
  {
    const S = QD.Sym;
    const c = (re, im) => S.mpolyConst(S.gauss(S.rat(re, 1), S.rat(im || 0, 1)));
    // φ=z+z² (zb1=0, A1_1=A1_2=1): the divided difference is exactly 1 + ζ₁ + ζ₂.
    const ddQuad = QC.phiDividedDifference(hQuad).subst({ zb1: c(0), Ab1_1: c(1), Ab1_2: c(1) });
    ok('phiDividedDifference(φ=z+z²) = 1 + ζ₁ + ζ₂',
       ddQuad.equals(S.mpolyInt(1).add(S.mpolyVar('Z1')).add(S.mpolyVar('Z2'))));
    // disk φ=z (zb1=0, A1_1=1): boundary simple ⇒ 0 double points (system reduces to 1∈I).
    const rDisk = QC.boundaryDoublePointCount(hDisk, { zb1: c(0), Ab1_1: c(1) });
    ok('boundaryDoublePointCount: disk φ=z → 0 (boundary simple)', rDisk.ok && rDisk.count === 0);
    // φ=z+z² self-crosses on |ζ|=1 at ζ=e^{±i2π/3} (both map to −1) ⇒ 2 ordered double points
    // (the unordered crossing {ζ₁,ζ₂} counted both ways); x₁=x₂=−½, y₁=−y₂=±√3/2 (irrational
    // roots counted EXACTLY by signature, no root-finding).
    const rQuad = QC.boundaryDoublePointCount(hQuad, { zb1: c(0), Ab1_1: c(1), Ab1_2: c(1) });
    ok('boundaryDoublePointCount: φ=z+z² → 2 ordered boundary double points (self-crosses)',
       rQuad.ok && rQuad.count === 2, 'count=' + (rQuad && rQuad.count));
    // honest fallback: a tiny Hermite-dim cap ⇒ {ok:false} (no throw) so the UI uses numeric.
    const rCap = QC.boundaryDoublePointCount(hQuad, { zb1: c(0), Ab1_1: c(1), Ab1_2: c(1) }, { maxHermiteDim: 1 });
    ok('boundaryDoublePointCount: over the Hermite cap → {ok:false} (numeric fallback)', rCap.ok === false);
  }

  // ---- (b) geometric border: computes a node (or hits the cap) without crashing ----
  {
    let okBorder = false;
    try {
      const nb = QC.geometricBorder(hQuad, 'convex');
      okBorder = Array.isArray(nb) && nb[0] && typeof nb[0].poly.size === 'function';
    } catch (e) { okBorder = /cap/i.test(String(e && e.message)); }
    ok('convex border (discriminant) computes (or hits the cap cleanly)', okBorder);
  }

  // ---- (b) border uses the REDUCED discriminant — no spurious lc=0 branch ----
  // The on-circle polynomial's leading coefficient in ζ is PARAMETER-DEPENDENT (a poly in
  // the pole vars), so the raw resultant Res=±lc_ζ·disc would carry the spurious degree-drop
  // branch lc_ζ=0 (where pCircle loses ζ-degree, NOT a genuine loss of star-likeness).
  // geometricBorder must divide that single lc factor out. The disk/star border keeps
  // deg_ζ=4 (under the resultant cap; the richer quad borders exceed it), and its lc_ζ is a
  // genuine non-constant — exactly the case the bug bit and lc=1 would have hidden.
  {
    const S = QD.Sym;
    // Rebuild the on-circle polynomial exactly as geometricBorder does internally
    // (phiData → qStar → hermitianReNum → foldCircle), to compare the returned border
    // against the RAW vs REDUCED discriminant of the SAME pCircle.
    const d = QC.phiData(hDisk);
    const Zf = S.FRatFn.fromPoly(S.mpolyVar('Z'));
    const w0 = S.FRatFn.fromPoly(S.mpolyVar('w0'));
    const qStar = Zf.mul(d.phiP).div(d.phi0.sub(w0));               // ζ φ′/(φ−w₀)
    const pCircle = QC.foldCircle(S, QC.hermitianReNum(S, qStar));
    const degZ = pCircle.degreeIn('Z');
    const lc = pCircle.coeffsIn('Z')[degZ];                         // leading coeff of pCircle in ζ
    const border = QC.geometricBorder(hDisk, 'star')[0].poly;
    const raw = S.discriminant(pCircle, 'Z');                       // ±lc·disc (carries the lc factor)
    const reduced = S.reducedDiscriminant(pCircle, 'Z');           // disc (lc factor stripped)
    ok('border(disk/star): on-circle lc_ζ is parameter-dependent (the spurious-branch setup)',
       degZ >= 2 && lc.totalDegree() >= 1, 'deg_ζ=' + degZ + ', lc totalDeg=' + lc.totalDegree());
    ok('border(disk/star): geometricBorder returns the REDUCED discriminant (lc=0 branch stripped)',
       border.equals(reduced));
    ok('border(disk/star): reduced border ≠ raw Res(pCircle,∂) — the fix changed the polynomial',
       !border.equals(raw));
    ok('border(disk/star): lc_ζ·border = raw Res exactly (a single extraneous lc factor removed)',
       lc.mul(border).equals(raw));
  }

  // ---- dispatcher ----
  ok('generateConstraint dispatches all forms',
     QC.FORMS.length === 7 &&
     QC.generateConstraint(hDisk, 'convex').length === 2 &&
     QC.generateConstraint(hQuad, 'injectivity').length === 4);
};

function cmul(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
function cdiv(a, b) { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; }
function eit(t) { return { re: Math.cos(t), im: Math.sin(t) }; }
