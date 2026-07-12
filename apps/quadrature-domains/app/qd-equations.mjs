// ESM (Phase 2 port) — twin of qd-equations.js (classic stays frozen). Registers onto the QD namespace.
import _QD from './solver.mjs';
import { conjVar, latexVar } from './qd-varscheme.mjs';   // the canonical conjugate-model var scheme
// =============================================================================
// qd-equations.js -- Symbolic generator for the classical BOUNDED QD inverse
// system (QD.QDEquations). Produces the explicit algebraic equations relating
// the quadrature-function coefficients {a_j, C_{j,s}, w₀} to the Riemann-map
// coefficients {z_j, A_{j,k}}, mirroring the Newton residual blocks the numeric
// solver assembles (solver-qd.js, Theorem 3.2.2):
//
//   (●_j)       φ(z_j) − a_j = 0                              (locator)
//   (★_{j,s})   C_{j,s} − Σ_{k=s}^{m_j}(k/s)·A_{j,k}·[t^k] φ̃_j^s = 0   (principal-part match)
//   (gauge)     Σ_j (A_{j,1} − Ā_{j,1}) = 0                   (= 2i·Σ_j Im A_{j,1} = 0)
//
// with φ(z) = w₀ + Σ_j Σ_{k=1}^{m_j} Ā_{j,k}·z^k/(1 − z̄_j z)^k and φ̃_j(t) =
// φ(z_j+t) − φ(z_j) (the local expansion). Note (★) is generated in the FORWARD
// form (C from A, using only seriesPow of φ̃ — no compositional inverse), the dual
// of the solver's inverse-Faber direction; it has the same variety but keeps the
// (1 − z̄·z) denominators bounded. See the inline comment at the (★) block.
//
// CONJUGATE-VARIABLE MODEL: z_j, z̄_j, A_{j,k}, Ā_{j,k}, a_j, ā_j, C_{j,s}, C̄_{j,s},
// w₀, w̄₀ are independent indeterminates over ℚ(i) (the reality slice z̄=conj z is
// applied only at evaluation). reimSplit produces the real/imaginary split.
// generateClassicalBounded(hData, {w0}) can FIX φ(0)=w₀ (exact-rational substitution,
// dropping w₀/w̄₀ from the inventory) — see system.w0Fixed.
//
// Built on QD.Sym (exact arithmetic). Pure module: no DOM; loads in node-test
// after sym-core.js. The numeric residual oracle (residualAtSolution) evaluates
// every generated equation at the solver's numeric φ — it must be ≈0.
// =============================================================================

(function (global) {
  'use strict';

  function getSym() {
    return (typeof window !== 'undefined' && window.QD && window.QD.Sym)
      || (typeof global !== 'undefined' && global.QD && global.QD.Sym)
      || (typeof QD !== 'undefined' && QD.Sym);
  }

  // Variable-name conventions (1-based pole/order indices), shared by the
  // generator, the residual oracle, and (later) the LaTeX/export layers.
  const V = {
    z: (j) => 'z' + j,
    zb: (j) => 'zb' + j,
    A: (j, k) => 'A' + j + '_' + k,
    Ab: (j, k) => 'Ab' + j + '_' + k,
    a: (j) => 'a' + j,
    ab: (j) => 'ab' + j,
    C: (j, s) => 'C' + j + '_' + s,
    Cb: (j, s) => 'Cb' + j + '_' + s,
    w0: 'w0',
    wb0: 'wb0',
  };

  // Real/imaginary-split variable names (the second representation). Each complex
  // indeterminate becomes two REAL ones via z_j = x_j + i·y_j, A_{j,k} = p_{j,k} +
  // i·q_{j,k}, a_j = ax_j + i·ay_j, C_{j,s} = Cx_{j,s} + i·Cy_{j,s}, w₀ = wx0 + i·wy0
  // (conjugates use the minus sign). reimSplit substitutes these and separates each
  // equation into real-coefficient real and imaginary parts.
  const VR = {
    zx: (j) => 'x' + j,
    zy: (j) => 'y' + j,
    Ax: (j, k) => 'p' + j + '_' + k,
    Ay: (j, k) => 'q' + j + '_' + k,
    ax: (j) => 'ax' + j,
    ay: (j) => 'ay' + j,
    Cx: (j, s) => 'Cx' + j + '_' + s,
    Cy: (j, s) => 'Cy' + j + '_' + s,
    wx0: 'wx0',
    wy0: 'wy0',
  };

  // Best exact-rational representation of a float: the simplest p/q (continued
  // fractions, q ≤ 10⁶) within 1e-12·max(1,|x|) — so user-style decimals come back
  // exact (0.25 → 1/4, 1/3-as-float → 1/3) — else the 15-significant-digit decimal
  // p/10^k (exactly the value the user sees printed). Returns [pBigInt, qBigInt].
  function _ratApprox(x) {
    if (!isFinite(x)) throw new Error('QDEquations: non-finite φ(0) component');
    if (x === 0) return [0n, 1n];
    const tol = 1e-12 * Math.max(1, Math.abs(x));
    const sign = x < 0 ? -1n : 1n;
    let a = Math.abs(x);
    // continued-fraction convergents p/q with q capped
    let p0 = 0, q0 = 1, p1 = 1, q1 = 0, v = a;
    for (let i = 0; i < 40; i++) {
      const ai = Math.floor(v);
      const p2 = ai * p1 + p0, q2 = ai * q1 + q0;
      if (q2 > 1e6) break;
      p0 = p1; q0 = q1; p1 = p2; q1 = q2;
      if (Math.abs(p1 / q1 - a) <= tol) return [sign * BigInt(p1), BigInt(q1)];
      const frac = v - ai;
      if (frac < 1e-15) break;
      v = 1 / frac;
    }
    // fallback: the 15-significant-digit decimal, exactly
    const s = Math.abs(x).toPrecision(15);
    const m = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/i.exec(s);
    if (!m) throw new Error('QDEquations: cannot rationalize ' + x);
    const digits = m[1] + (m[2] || '');
    const exp = (m[3] ? parseInt(m[3], 10) : 0) - (m[2] ? m[2].length : 0);
    let n = BigInt(digits), d = 1n;
    if (exp >= 0) n *= 10n ** BigInt(exp); else d = 10n ** BigInt(-exp);
    return [sign * n, d];
  }

  // Exact integer binomial coefficient C(n, i) as a BigInt.
  function binomBig(n, i) {
    if (i < 0 || i > n) return 0n;
    let num = 1n, den = 1n;
    for (let k = 0; k < i; k++) { num *= BigInt(n - k); den *= BigInt(k + 1); }
    return num / den;
  }

  // Build φ(p + t) as a truncated power series in t (length L+1), coefficients
  // FRatFn (FACTORED denominators) in the conjugate-model indeterminates, where the
  // expansion point is the variable named `zPointName` (a pole var V.z(j) for the
  // (●)/(★) generator, or a generic 'Z' for the constraint module's φ,φ′,φ″). Index
  // 0 is φ(p). Each branch's Möbius denominator (1 − z̄(p+t))^{k'} is reciprocated via
  // the binomial series  1/(D0 − z̄t)^{k'} = Σ_i C(k'+i−1, i)·z̄^i·t^i / D0^{k'+i},
  // where D0 = (1 − z̄_{j'}·p). So D0 is tracked as a denominator POWER and never
  // expanded — this is what keeps higher orders tractable (no super-exponential
  // term growth).
  function phiSeriesAt(S, poles, zPointName, L) {
    const { FRatFn, mpolyVar, mpolyInt, mpolyConst, gauss, rat } = S;
    const fVar = (name) => FRatFn.fromPoly(mpolyVar(name));
    const fInt = (k) => FRatFn.fromInt(k);
    const constBig = (b) => mpolyConst(gauss(rat(b, 1)));      // BigInt → constant MPoly
    const zj = mpolyVar(zPointName);                           // MPoly expansion point
    let phi = S.seriesConst(fVar(V.w0), L);                    // start with w₀
    for (let jp = 0; jp < poles.length; jp++) {
      const mjp = poles[jp].principal.length;
      const zb = mpolyVar(V.zb(jp + 1));                       // z̄_{j'}
      const D0 = mpolyInt(1).sub(zb.mul(zj));                  // 1 − z̄_{j'}·z_j  (factor)
      const numBase = [FRatFn.fromPoly(zj), fInt(1)];          // z_j + t
      while (numBase.length <= L) numBase.push(fInt(0));
      for (let kp = 1; kp <= mjp; kp++) {
        const num = S.seriesPow(numBase, kp, L);               // (z_j+t)^{k'}
        const recip = S.seriesZero(L, FRatFn);                 // 1/(D0 − z̄t)^{k'}
        for (let i = 0; i <= L; i++) {
          const cMono = constBig(binomBig(kp + i - 1, i)).mul(zb.pow(i));   // C·z̄^i
          recip[i] = FRatFn.fromFactor(cMono, D0, kp + i);     // … / D0^{k'+i}
        }
        let branch = S.seriesMul(num, recip, L);               // (z_j+t)^{k'}/(D0−z̄t)^{k'}
        branch = S.seriesScaleByCoeff(branch, fVar(V.Ab(jp + 1, kp)));      // · Ā_{j',k'}
        phi = S.seriesAdd(phi, branch, L);
      }
    }
    return phi;
  }

  // ---- Conjugate-model conjugation (for the Schwarz formulation) --------------
  // The reality-slice "bar": swap each indeterminate with its conjugate partner.
  // qd-constraints.js has equivalents (conjVarName/conjMPoly/conjFR) but loads
  // AFTER this file, so we keep self-contained local copies covering exactly the
  // bounded-model names {z_j, A_{j,k}, a_j, C_{j,s}, w₀}. (Future dedup: a shared
  // conj util in sym-core — deliberately not pulled in here.)
  // Conjugate-partner of a variable name (reality-slice bar) via the shared conjugate-model
  // scheme; non-scheme names (incl. reim vars) pass through unchanged. (V.w0/V.wb0 === 'w0'/'wb0',
  // which conjVar handles.)
  function conjVarName(name) { return conjVar(name); }
  // Complex conjugate of an MPoly in the conjugate model: bar the coefficients
  // (i→−i) AND swap every variable with its partner.
  function conjMPoly(p) { return p.conjCoeffs().relabel(conjVarName); }
  // Complex conjugate of an FRatFn (numerator + each factored-denominator factor).
  function conjFR(S, fr) {
    return new S.FRatFn(conjMPoly(fr.num), fr.den.map((f) => ({ p: conjMPoly(f.p), e: f.e })));
  }

  // Generate the full classical-bounded system from hData's STRUCTURE (pole
  // count n and orders m_j). h-coefficients stay symbolic. Returns the equations
  // as cleared MPolys, grouped by block, plus the variable inventory + counts.
  function generateClassicalBounded(hData, opts) {
    opts = opts || {};
    const S = getSym();
    if (!S) throw new Error('QD.QDEquations: QD.Sym not loaded');
    const { FRatFn, mpolyVar } = S;
    const poles = (hData && hData.poles) || [];
    const n = poles.length;
    const orders = poles.map((p) => (p.principal ? p.principal.length : 1));
    const d = orders.reduce((a, b) => a + b, 0);

    // Complexity guard. With the factored-denominator engine (FRatFn) the (1 − z̄·z)
    // Möbius factors are tracked as powers rather than expanded, so generation is
    // polynomial (not exponential) in the pole order — orders ≤6 generate in well
    // under a second. The fully-symbolic equations still grow intrinsically with
    // order (≈7k terms at order 6; ~46s/186k terms at order 8), so the default cap
    // keeps interactive generation snappy. Raise it via opts.maxPoleOrder for
    // export/Gröbner use at higher orders (accepting the larger size + time).
    const maxOrder = orders.reduce((a, b) => Math.max(a, b), 0);
    const cap = opts.maxPoleOrder != null ? opts.maxPoleOrder : 6;
    if (maxOrder > cap) {
      throw new Error('QDEquations: max pole order ' + maxOrder + ' exceeds the symbolic-generation ' +
        'cap (' + cap + '). Pass opts.maxPoleOrder to raise it (equation size grows with order).');
    }

    const rfVar = (name) => FRatFn.fromPoly(mpolyVar(name));
    const blocks = { locator: [], star: [], gauge: [] };

    for (let i = 0; i < n; i++) {
      const j = i + 1;
      const mj = orders[i];
      const phiS = phiSeriesAt(S, poles, V.z(j), mj);     // φ(z_j+t), orders 0..m_j

      // (●_j): φ(z_j) − a_j = 0  → clear denominator → MPoly
      const locator = phiS[0].sub(rfVar(V.a(j)));
      blocks.locator.push({ label: '(●)_' + j, eq: locator.clearDenominators() });

      // phiTilde_j = [0, φ'(z_j), …]  (drop the constant; the local expansion).
      const phiTilde = [FRatFn.fromInt(0)];
      for (let o = 1; o <= mj; o++) phiTilde.push(phiS[o]);

      // (★) FORWARD form: C_{j,s} = Σ_{k=s}^{m_j} (k/s)·A_{j,k}·[t^k] phiTilde_j^s.
      // This is the dual of the solver's inverse-Faber (A from C); it is
      // mathematically equivalent (same variety) but uses only seriesPow of the
      // local expansion — NO compositional inverse — so the denominators stay
      // bounded powers of the (1 − z̄·z) factors instead of blowing up super-
      // exponentially. It also expresses the quadrature coefficients C directly
      // in terms of the Riemann-map coefficients A, matching the feature's framing.
      const phiPow = [];                         // phiPow[s] = phiTilde^s
      phiPow[1] = phiTilde;
      for (let s = 2; s <= mj; s++) phiPow[s] = S.seriesMul(phiPow[s - 1], phiTilde, mj);
      for (let s = 1; s <= mj; s++) {
        let rhs = FRatFn.fromInt(0);
        for (let k = s; k <= mj; k++) {
          const coeff = FRatFn.fromPoly(S.mpolyConst(S.gauss(S.rat(k, s))));  // (k/s) ∈ ℚ
          rhs = rhs.add(coeff.mul(rfVar(V.A(j, k))).mul(phiPow[s][k]));
        }
        const star = rfVar(V.C(j, s)).sub(rhs);
        blocks.star.push({ label: '(★)_{' + j + ',' + s + '}', eq: star.clearDenominators() });
      }
    }

    // (gauge): Σ_j (A_{j,1} − Ā_{j,1}) = 0   (= 2i·Σ_j Im A_{j,1})
    let gauge = S.mpolyInt(0);
    for (let i = 0; i < n; i++) {
      const j = i + 1;
      gauge = gauge.add(mpolyVar(V.A(j, 1))).sub(mpolyVar(V.Ab(j, 1)));
    }
    blocks.gauge.push({ label: '(gauge)', eq: gauge });

    // FIX φ(0): opts.w0 = {re, im} selects the Riemann-map center w₀ = φ(0) (the
    // normalization choice; the solve UI defaults it to the CENTROID OF THE POLES).
    // The exact ℚ(i) rationalization is substituted for the w₀/w̄₀ symbols in every
    // equation, so the system is regenerated FOR that normalization: w₀ stops being
    // a symbolic parameter (2 fewer variables downstream — Gröbner/Algebra win) and
    // the equations display with the concrete center baked in. Only the locator
    // block actually contains w₀ (the (★) rows use the local expansion, which drops
    // the constant; the gauge never had it), but the substitution is applied
    // uniformly. system.w0Fixed records the exact value (JSON-safe BigInt strings).
    let w0Fixed = null;
    if (opts.w0) {
      const [rn, rd] = _ratApprox(opts.w0.re || 0);
      const [im_n, im_d] = _ratApprox(opts.w0.im || 0);
      const g = S.gauss(S.rat(rn, rd), S.rat(im_n, im_d));
      const sub = {};
      sub[V.w0] = S.mpolyConst(g);
      sub[V.wb0] = S.mpolyConst(g.conj());
      for (const name of ['locator', 'star', 'gauge']) {
        blocks[name] = blocks[name].map((item) => ({ label: item.label, eq: item.eq.subst(sub) }));
      }
      w0Fixed = {
        re: [rn.toString(), rd.toString()], im: [im_n.toString(), im_d.toString()],
        approx: { re: opts.w0.re || 0, im: opts.w0.im || 0 },
      };
    }

    const unknowns = [];
    for (let i = 0; i < n; i++) {
      const j = i + 1;
      unknowns.push(V.z(j), V.zb(j));
      for (let k = 1; k <= orders[i]; k++) unknowns.push(V.A(j, k), V.Ab(j, k));
    }
    const params = w0Fixed ? [] : [V.w0, V.wb0];
    for (let i = 0; i < n; i++) {
      const j = i + 1;
      params.push(V.a(j), V.ab(j));
      for (let s = 1; s <= orders[i]; s++) params.push(V.C(j, s), V.Cb(j, s));
    }

    const equationCount = blocks.locator.length + blocks.star.length + blocks.gauge.length;
    return {
      model: 'conjugate',
      n, orders, d,
      blocks,
      w0Fixed,
      vars: { unknowns, params },
      counts: {
        poles: n, totalOrder: d,
        equations: equationCount,             // n locator + d star + 1 gauge
        complexUnknowns: n + d,               // z_j, A_{j,k}
        realUnknowns: 2 * (n + d),
        realEquations: 2 * n + 2 * d + 1,
      },
    };
  }

  // Generate the bounded-QD inverse system in the SCHWARZ-FUNCTION formulation —
  // an algebraically-distinct ALTERNATIVE to generateClassicalBounded over the SAME
  // {z_j, A_{j,k}} variables, expressing the SAME solution variety. The locator (●)
  // and gauge blocks are reused verbatim; only the FORWARD principal-part block (★)
  // is replaced by the SCHWARZ block (★_S). Where (★) computes C from A by the local
  // power series of φ (no compositional inverse), (★_S) matches the prescribed C_{j,s}
  // to the principal parts of the Schwarz function σ(w) at the quadrature node
  // a_j = φ(z_j) — the inverse direction your own direct-problem map already uses.
  // By the direct identity (THEORY_MAP §3.4; thesis §3.2; the verified numeric port
  // direct/direct-common.js boundedQD/forwardLocalPrincipal):
  //
  //   (★_S)_{j,k}:  C_{j,k} − Σ_{l=k}^{m_j} conj(c_{j,l})·c_{j,1}^{l}·[ζ^{l−k}] u_j(ζ)^{−l} = 0,
  //
  // where c_{j,l} = [t^l] φ(z_j+t) (the local Taylor coefficients of φ at the pole
  // pre-image z_j), ψ̃_j is the compositional inverse of φ̃_j = [0, c_{j,1}, …]
  // (Sym.seriesReversion — runs over FRatFn with bounded denominators, no blow-up),
  // and ψ̃_j(ζ) = ψ̃_j[1]·ζ·u_j(ζ) with u_j(0)=1. Same variety, different polynomials:
  // the numeric residual at the solver's φ is ≈0 for both (residualAtSolution, the
  // oracle), but the (★_S) polynomials are NOT termwise-equal to (★). The cleared
  // equations carry (1−z̄z)/φ′(z_j) denominator factors that are nonzero on the QD
  // regime (|z_j|<1, φ′≠0 in 𝔻) — the same "clear the Möbius/critical denominator"
  // philosophy as the forward (★). Returns the generateClassicalBounded contract plus
  // formulation:'schwarz'. Scope mirrors generateClassicalBounded (bounded simply-
  // connected classical QD); same maxPoleOrder cap (inherited via the base call).
  function generateSchwarzBounded(hData, opts) {
    opts = opts || {};
    const S = getSym();
    if (!S) throw new Error('QD.QDEquations: QD.Sym not loaded');
    const { FRatFn } = S;
    // Reuse (●)+(gauge)+w0Fixed+vars+counts+caps; we replace only blocks.star.
    const base = generateClassicalBounded(hData, opts);
    const poles = (hData && hData.poles) || [];
    const orders = base.orders;
    const rfVar = (name) => FRatFn.fromPoly(S.mpolyVar(name));

    const star = [];
    for (let i = 0; i < poles.length; i++) {
      const j = i + 1;
      const mj = orders[i];
      const phiS = phiSeriesAt(S, poles, V.z(j), mj);       // [φ(z_j), c_1, …, c_{m_j}]

      // φ̃_j = [0, c_1, …, c_{m_j}]; revert; factor ψ̃ = ψ̃[1]·ζ·u(ζ), u(0)=1.
      const phiTilde = [FRatFn.fromInt(0)];
      for (let o = 1; o <= mj; o++) phiTilde.push(phiS[o]);
      const psi = S.seriesReversion(phiTilde, mj);          // ψ̃, indices 0..m_j, psi[0]=0

      // u(ζ): u[0]=1 (exact, not psi[1]/psi[1] — avoids a spurious self-cancel in the
      // cleared numerator); u[i]=ψ̃[i+1]/ψ̃[1] for i=1..m_j−1.
      const uLen = Math.max(mj - 1, 0);
      const u = [FRatFn.fromInt(1)];
      for (let ii = 1; ii <= uLen; ii++) u.push(psi[ii + 1].div(psi[1]));

      // u^{−l} for l=1..m_j, each to order ζ^{m_j−1}; c_1^l prefactors.
      const uInv = S.seriesRecip(u, uLen);
      const uPowNeg = [null, uInv];
      for (let l = 2; l <= mj; l++) uPowNeg[l] = S.seriesMul(uPowNeg[l - 1], uInv, uLen);
      const c1Pow = [FRatFn.fromInt(1)];
      for (let l = 1; l <= mj; l++) c1Pow.push(c1Pow[l - 1].mul(phiS[1]));

      // C_{j,k} = Σ_{l≥k} A_{j,l}·c_1^l·[ζ^{l−k}] u^{−l}.
      // Derivation: the Schwarz function pulls back through the uniformization as
      // S(φ(z)) = φ*(1/z) = Σ_l A_{j,l}/(z−z_j)^l — the z↦1/z̄ disk reflection turns the
      // parametric map's Blaschke factors into simple poles at z_j with the MAP coefficients
      // A_{j,l} as numerators. Re-expanding that principal part in w−a_j via the local
      // reversion (u, c_1) gives the sum below. NOTE the numerator is the map coefficient
      // A_{j,l} (= rfVar(V.A(j,l))), NOT conj(c_l): the latter drops the Blaschke–Jacobian
      // factor and is correct only when z_j = 0 (e.g. C_{1,1} must be |φ′(z_1)|²·(1−|z_1|²)²,
      // not |φ′(z_1)|²).
      for (let k = 1; k <= mj; k++) {
        let acc = FRatFn.fromInt(0);
        for (let l = k; l <= mj; l++) {
          const idx = l - k;
          if (idx >= uPowNeg[l].length) continue;
          acc = acc.add(rfVar(V.A(j, l)).mul(c1Pow[l]).mul(uPowNeg[l][idx]));
        }
        const eq = rfVar(V.C(j, k)).sub(acc);
        star.push({ label: '(★_S)_{' + j + ',' + k + '}', eq: eq.clearDenominators() });
      }
    }
    base.blocks.star = star;
    // (★_S) carries no w₀ (the local expansion drops the constant term), so the
    // base's φ(0) fix already covers the system — no extra substitution needed.
    base.formulation = 'schwarz';
    return base;
  }

  // ---- Real/imaginary split ----------------------------------------------------
  // Convert a conjugate-model system (from generateClassicalBounded) into the
  // SECOND representation: substitute every complex indeterminate by its real/imag
  // parts (z_j = x_j + i·y_j, z̄_j = x_j − i·y_j, A_{j,k} = p_{j,k} + i·q_{j,k}, …),
  // then split each resulting Gaussian-coefficient equation into two REAL-coefficient
  // equations (its real and imaginary parts). Because every variable is now real,
  // an equation E = Re(E) + i·Im(E), so {Re(E)=0, Im(E)=0} is equivalent to E=0.
  //
  // Identically-zero split parts are dropped (they carry no constraint). Notably the
  // gauge equation Σ(A_{j,1} − Ā_{j,1}) = Σ 2i·q_{j,1} is purely imaginary, so its
  // real part vanishes and only the imaginary part (the actual gauge condition)
  // survives — giving exactly 2n + 2d + 1 real equations, matching the count the
  // conjugate model advertises.
  function reimSplit(system) {
    const S = getSym();
    if (!S) throw new Error('QD.QDEquations: QD.Sym not loaded');
    const { mpolyVar, mpolyConst, gaussInt } = S;
    const n = system.n, orders = system.orders, d = system.d;
    const I = mpolyConst(gaussInt(0, 1));                       // i, as an MPoly
    const cx = (xName, yName) => mpolyVar(xName).add(I.mul(mpolyVar(yName)));     // x + i·y
    const cxC = (xName, yName) => mpolyVar(xName).sub(I.mul(mpolyVar(yName)));    // x − i·y

    const sub = {};
    sub[V.w0] = cx(VR.wx0, VR.wy0);
    sub[V.wb0] = cxC(VR.wx0, VR.wy0);
    for (let i = 0; i < n; i++) {
      const j = i + 1;
      sub[V.z(j)] = cx(VR.zx(j), VR.zy(j));
      sub[V.zb(j)] = cxC(VR.zx(j), VR.zy(j));
      sub[V.a(j)] = cx(VR.ax(j), VR.ay(j));
      sub[V.ab(j)] = cxC(VR.ax(j), VR.ay(j));
      for (let k = 1; k <= orders[i]; k++) {
        sub[V.A(j, k)] = cx(VR.Ax(j, k), VR.Ay(j, k));
        sub[V.Ab(j, k)] = cxC(VR.Ax(j, k), VR.Ay(j, k));
        sub[V.C(j, k)] = cx(VR.Cx(j, k), VR.Cy(j, k));
        sub[V.Cb(j, k)] = cxC(VR.Cx(j, k), VR.Cy(j, k));
      }
    }

    const splitBlock = (arr) => {
      const out = [];
      for (const { label, eq } of arr) {
        const e = eq.subst(sub);
        const re = e.realPart(), im = e.imagPart();
        if (!re.isZero()) out.push({ label: label + ' [Re]', eq: re, part: 're', source: label });
        if (!im.isZero()) out.push({ label: label + ' [Im]', eq: im, part: 'im', source: label });
      }
      return out;
    };
    const blocks = {
      locator: splitBlock(system.blocks.locator),
      star: splitBlock(system.blocks.star),
      gauge: splitBlock(system.blocks.gauge),
    };

    const unknowns = [];
    for (let i = 0; i < n; i++) {
      const j = i + 1;
      unknowns.push(VR.zx(j), VR.zy(j));
      for (let k = 1; k <= orders[i]; k++) unknowns.push(VR.Ax(j, k), VR.Ay(j, k));
    }
    // w₀ fixed upstream ⇒ the split equations contain no wx0/wy0 either.
    const params = system.w0Fixed ? [] : [VR.wx0, VR.wy0];
    for (let i = 0; i < n; i++) {
      const j = i + 1;
      params.push(VR.ax(j), VR.ay(j));
      for (let s = 1; s <= orders[i]; s++) params.push(VR.Cx(j, s), VR.Cy(j, s));
    }
    const realEquations = blocks.locator.length + blocks.star.length + blocks.gauge.length;
    return {
      model: 'reim',
      n, orders, d,
      blocks,
      w0Fixed: system.w0Fixed || null,
      vars: { unknowns, params },
      counts: {
        poles: n, totalOrder: d,
        equations: realEquations,
        realUnknowns: 2 * (n + d),
        realEquations,
      },
    };
  }

  // ---- Numeric residual oracle -------------------------------------------------
  // Build the variable→Complex map from the solver's numeric φ + the numeric
  // hData, then evaluate every generated equation. All should be ≈0.
  function buildVarMap(phi, hData) {
    const conj = (c) => ({ re: c.re, im: -c.im });
    const m = {};
    m[V.w0] = { re: phi.w0.re, im: phi.w0.im };
    m[V.wb0] = conj(phi.w0);
    for (let i = 0; i < hData.poles.length; i++) {
      const j = i + 1;
      const a = hData.poles[i].a;
      m[V.a(j)] = { re: a.re, im: a.im };
      m[V.ab(j)] = conj(a);
      const z = phi.branches[i].z;
      m[V.z(j)] = { re: z.re, im: z.im };
      m[V.zb(j)] = conj(z);
      const principal = hData.poles[i].principal;
      const A = phi.branches[i].A;
      for (let s = 0; s < principal.length; s++) {
        const C = principal[s];
        m[V.C(j, s + 1)] = { re: C.re, im: C.im };
        m[V.Cb(j, s + 1)] = conj(C);
        const Ak = A[s];
        m[V.A(j, s + 1)] = { re: Ak.re, im: Ak.im };
        m[V.Ab(j, s + 1)] = conj(Ak);
      }
    }
    return m;
  }
  // Real-variable map for the re/im-split system: every real indeterminate (x_j,
  // y_j, p_{j,k}, q_{j,k}, ax_j, ay_j, Cx_{j,s}, Cy_{j,s}, wx0, wy0) gets its numeric
  // value from the solution (imaginary slot 0, since these are real variables). The
  // reality slice is built in here, so the split equations are evaluated on the same
  // point as the conjugate ones.
  function buildRealVarMap(phi, hData) {
    const m = {};
    m[VR.wx0] = { re: phi.w0.re, im: 0 };
    m[VR.wy0] = { re: phi.w0.im, im: 0 };
    for (let i = 0; i < hData.poles.length; i++) {
      const j = i + 1;
      const a = hData.poles[i].a;
      m[VR.ax(j)] = { re: a.re, im: 0 };
      m[VR.ay(j)] = { re: a.im, im: 0 };
      const z = phi.branches[i].z;
      m[VR.zx(j)] = { re: z.re, im: 0 };
      m[VR.zy(j)] = { re: z.im, im: 0 };
      const principal = hData.poles[i].principal;
      const A = phi.branches[i].A;
      for (let s = 0; s < principal.length; s++) {
        const C = principal[s];
        m[VR.Cx(j, s + 1)] = { re: C.re, im: 0 };
        m[VR.Cy(j, s + 1)] = { re: C.im, im: 0 };
        const Ak = A[s];
        m[VR.Ax(j, s + 1)] = { re: Ak.re, im: 0 };
        m[VR.Ay(j, s + 1)] = { re: Ak.im, im: 0 };
      }
    }
    return m;
  }

  // Shared residual loop: max |eq| (and per-block) over a system evaluated at vm.
  function residualWith(system, vm) {
    let max = 0;
    const perBlock = {};
    for (const name of ['locator', 'star', 'gauge']) {
      let bmax = 0;
      for (const { eq } of system.blocks[name]) {
        const v = eq.evalComplex(vm);
        const mag = Math.hypot(v.re, v.im);
        if (mag > bmax) bmax = mag;
      }
      perBlock[name] = bmax;
      if (bmax > max) max = bmax;
    }
    return { max, perBlock };
  }

  // Returns { max, perBlock } — the max |eq| over all conjugate-model equations at
  // the numeric solution.
  function residualAtSolution(system, phi, hData) {
    return residualWith(system, buildVarMap(phi, hData));
  }
  // Same oracle for a re/im-split system (real variables).
  function residualReimAtSolution(reimSystem, phi, hData) {
    return residualWith(reimSystem, buildRealVarMap(phi, hData));
  }

  // ---- LaTeX rendering ---------------------------------------------------------
  // Variable → LaTeX maps for each model. The generated names (V / VR) follow a
  // regular scheme, so a few anchored regexes cover every variable that appears.
  // Conjugate-model variable → LaTeX (bar → \bar{·}), via the shared scheme. The reim model's
  // names are irregular (below) and keep their own map.
  function latexOfConjugate(name) { return latexVar(name); }
  function latexOfReim(name) {
    if (name === 'wx0') return 'w_0^{\\mathrm{re}}';
    if (name === 'wy0') return 'w_0^{\\mathrm{im}}';
    let m;
    if ((m = /^p(\d+)_(\d+)$/.exec(name))) return 'p_{' + m[1] + ',' + m[2] + '}';
    if ((m = /^q(\d+)_(\d+)$/.exec(name))) return 'q_{' + m[1] + ',' + m[2] + '}';
    if ((m = /^Cx(\d+)_(\d+)$/.exec(name))) return 'C_{' + m[1] + ',' + m[2] + '}^{\\mathrm{re}}';
    if ((m = /^Cy(\d+)_(\d+)$/.exec(name))) return 'C_{' + m[1] + ',' + m[2] + '}^{\\mathrm{im}}';
    if ((m = /^ax(\d+)$/.exec(name))) return 'a_{' + m[1] + '}^{\\mathrm{re}}';
    if ((m = /^ay(\d+)$/.exec(name))) return 'a_{' + m[1] + '}^{\\mathrm{im}}';
    if ((m = /^x(\d+)$/.exec(name))) return 'x_{' + m[1] + '}';
    if ((m = /^y(\d+)$/.exec(name))) return 'y_{' + m[1] + '}';
    return name;
  }
  function latexOfFor(model) { return model === 'reim' ? latexOfReim : latexOfConjugate; }

  // Render a generated system (conjugate or reim) to LaTeX, grouped by block. Each
  // entry is { label, latex: "<polynomial> = 0", terms: <count> }; a caller can use
  // the term count to elide very large polynomials and offer export instead.
  function systemToLatex(system) {
    const latexOf = latexOfFor(system.model);
    const blk = (arr) => arr.map(({ label, eq }) => ({
      label, latex: eq.toLatex(latexOf) + ' = 0', terms: eq.size(),
    }));
    return {
      model: system.model,
      blocks: {
        locator: blk(system.blocks.locator),
        star: blk(system.blocks.star),
        gauge: blk(system.blocks.gauge),
      },
    };
  }

  // CAS-agnostic export object: model, variable inventory, counts, and every
  // equation as a flat term list (exact Gaussian-rational coeffs). This is what the
  // future Gröbner/CTD reducer consumes.
  function systemToExport(system) {
    const equations = [];
    for (const block of ['locator', 'star', 'gauge']) {
      for (const item of system.blocks[block]) {
        const e = { block, label: item.label, terms: item.eq.termList() };
        if (item.part) e.part = item.part;          // re/im tag (reim model only)
        equations.push(e);
      }
    }
    return {
      model: system.model,
      n: system.n, orders: system.orders, d: system.d,
      w0Fixed: system.w0Fixed || null,
      vars: system.vars,
      counts: system.counts,
      equations,
    };
  }

  // Real-axis reflection symmetry of the quadrature data h (w ↦ w̄). When it holds,
  // there is a conjugation-symmetric solution (φ(z̄)=conj φ(z)), so the conjugate
  // model collapses under a reality assumption — the biggest practical lever for
  // making the Gröbner/triangular reduction tractable. Returns:
  //   allReal          — every pole a_j AND every principal coeff C_{j,s} is real ⇒ a
  //                      fully real solution exists ⇒ EVERY base variable may be taken
  //                      real (the per-variable reality the workspace's assumeReal needs).
  //   conjugationClosed — the pole multiset is closed under a_j ↦ conj(a_j) with
  //                      CONJUGATE principal parts (h is real-axis symmetric, possibly
  //                      via conjugate POLE PAIRS). allReal ⇒ conjugationClosed.
  function realAxisSymmetry(hData, tol) {
    tol = tol || 1e-9;
    const poles = (hData && hData.poles) || [];
    if (!poles.length) return { allReal: false, conjugationClosed: false };
    const isReal = (z) => Math.abs((z && z.im) || 0) <= tol;
    const allReal = poles.every((p) => isReal(p.a) && (p.principal || []).every(isReal));
    const used = new Array(poles.length).fill(false);
    let closed = true;
    const conjEq = (u, v) => Math.abs((v.re || 0) - (u.re || 0)) <= tol && Math.abs((v.im || 0) + (u.im || 0)) <= tol;
    for (let i = 0; i < poles.length && closed; i++) {
      if (used[i]) continue;
      if (isReal(poles[i].a)) { used[i] = true; continue; }          // a real pole is self-conjugate
      let found = -1;
      for (let j = 0; j < poles.length; j++) {
        if (used[j] || j === i || !conjEq(poles[i].a, poles[j].a)) continue;
        const pi = poles[i].principal || [], pj = poles[j].principal || [];
        if (pi.length === pj.length && pi.every((c, s) => conjEq(c, pj[s] || {}))) { found = j; break; }
      }
      if (found === -1) closed = false; else { used[i] = true; used[found] = true; }
    }
    return { allReal, conjugationClosed: closed };
  }

  // ---- Interior point-functional QD system (the Aharonov–Shapiro formulation) ----
  // Companion to generateClassicalBounded's EXTERIOR (●)/(★)/gauge form. For a bounded
  // simply-connected QD whose quadrature functional is a single point functional at 0 of
  // ORDER n,
  //      ∫_Ω f dA = Σ_{p=0}^{n-1} M_p f^{(p)}(0)   (M₀ = area > 0; M_p ∈ ℂ),
  // the normalized Riemann map is a degree-n polynomial φ(z) = Σ_{k=1}^{n} w_k z^k
  // (φ(0)=0, rotation gauge w₁ = φ′(0) > 0 real). Order n ↔ degree n: testing f = w^p and
  // using ∫_Ω f dA = ∫_𝔻 f(φ)|φ′|² dA with ∫_𝔻 z^a z̄^b dA = δ_{ab}/(a+1) (area measure
  // normalized so π→1) gives the moment identities
  //      p! · M_p = Σ_{a=p}^{n-1} c_a^{(p)} · w̄_{a+1},     c_a^{(p)} = [z^a]( φ(z)^p φ′(z) ),
  // for p = 0,…,n-1 (and ∫_Ω w^p dA ≡ 0 for p ≥ n automatically, since φ^p φ′ has lowest
  // z-degree p). p=0 reduces to the polynomial-image AREA formula  M₀ = Σ_k k|w_k|²; the
  // p=0 imaginary part vanishes identically (M₀ real). Each complex moment equation splits
  // into Re + i·Im, giving 2n−1 real equations in the 2n−1 real unknowns (w₁ real; w_k =
  // u_k + i v_k for k≥2). ORDER 2 is exactly Aharonov–Shapiro:  M₀ = w₁²+2|w₂|², M₁ = w₁²w̄₂,
  // eliminating to the resolvent cubic s³ − M₀s² + 2|M₁|² (s = w₁²); univalence there is
  // degree-2-special (φ′ ≠ 0 in 𝔻 ⇔ w₁ ≥ 2|w₂|, the Sym.schurCohn count) and A&S prove the
  // QD unique — the cardioid φ = √3/6·(2z+z²) being the cusp (the cubic's double root). For
  // n ≥ 3 the system is delivered for per-instance solving (realSolutionCount / solveZeroDim
  // + the schurCohn univalence filter); the FULL parametric uniqueness count is the RCTD/CAS
  // frontier (see AHARONOV_SHAPIRO.md), not claimed here.
  //
  // Variables: ['w1','u2','v2',…,'un','vn'] (length 2n−1). Returns { polys, vars, params }.
  // `opts.order` (default 2) sets n; with `data` and no explicit order, n is inferred from
  // the consecutive M0,M1,… keys present. With `data` the moments are substituted as EXACT
  // ℚ(i) constants (continued-fraction rational of each float, via ratApprox): data.M0 is a
  // real number (or {re,…}; its imaginary part is ignored — the area is real), data.M_p (p≥1)
  // is {re,im}. With `data` omitted the moments are symbolic params M0, m_p, n_p (Re/Im of
  // M_p) — params ['M0','m1','n1',…] — for the resolvent/discriminant elimination. Coefficient
  // field stays ℚ(i)/ℚ throughout.
  function pointFunctionalSystem(data, opts) {
    const S = getSym();
    if (!S) throw new Error('QD.QDEquations: QD.Sym not loaded');
    const { mpolyVar: mv, mpolyConst: mc, mpolyInt: mi, gauss, rat } = S;

    // Map degree = functional order n. Explicit opts.order wins; else infer from the
    // consecutive M0,M1,… present in data; else default 2 (the A&S / no-arg case).
    let n = opts && opts.order;
    if (!n) {
      if (data) { n = 0; while (data['M' + n] != null) n++; }
      n = n || 2;
    }
    if (!(n >= 1)) throw new Error('pointFunctionalSystem: order must be ≥ 1');

    const I = mc(gauss(rat(0), rat(1)));            // the imaginary unit i as an MPoly const
    const ZERO = mi(0);
    const gconst = (re, im) => {                    // exact ℚ(i) constant from floats
      const [rn, rd] = _ratApprox(re || 0);
      const [inum, iden] = _ratApprox(im || 0);
      return mc(gauss(rat(rn, rd), rat(inum, iden)));
    };

    // Complex coefficients w_k and their conjugates w̄_k (k = 1..n). w₁ is the real gauge
    // variable 'w1' (no imaginary part); w_k = u_k + i v_k for k ≥ 2.
    const W = [null], Wb = [null], vars = [];
    for (let k = 1; k <= n; k++) {
      if (k === 1) { const u = mv('w1'); vars.push('w1'); W.push(u); Wb.push(u); }
      else {
        const uk = mv('u' + k), vk = mv('v' + k);
        vars.push('u' + k, 'v' + k);
        W.push(uk.add(I.mul(vk)));
        Wb.push(uk.sub(I.mul(vk)));
      }
    }

    // Moments M_p as complex MPolys (substituted constants, or symbolic m_p + i·n_p).
    const params = [];
    const Mval = [];
    for (let p = 0; p < n; p++) {
      if (data) {
        const Mp = data['M' + p];
        const re = (typeof Mp === 'number') ? Mp : (Mp && Mp.re) || 0;
        const im = (p === 0 || typeof Mp === 'number') ? 0 : ((Mp && Mp.im) || 0);  // M₀ is real (the area)
        Mval.push(gconst(re, im));
      } else if (p === 0) {
        Mval.push(mv('M0')); params.push('M0');
      } else {
        Mval.push(mv('m' + p).add(I.mul(mv('n' + p)))); params.push('m' + p, 'n' + p);
      }
    }

    // φ and φ′ as z-power-indexed arrays of MPoly coefficients (in the w_k vars).
    const phi = new Array(n + 1).fill(ZERO);        // φ[k] = w_k (φ[0] = 0)
    for (let k = 1; k <= n; k++) phi[k] = W[k];
    const dphi = new Array(n).fill(ZERO);           // φ′[b] = (b+1) w_{b+1}
    for (let b = 0; b < n; b++) dphi[b] = W[b + 1].mul(mi(b + 1));

    // Polynomial (in z) multiply of two coefficient arrays.
    const pmul = (A, B) => {
      const out = new Array(A.length + B.length - 1).fill(ZERO);
      for (let i = 0; i < A.length; i++) {
        if (A[i].isZero()) continue;
        for (let j = 0; j < B.length; j++) {
          if (B[j].isZero()) continue;
          out[i + j] = out[i + j].add(A[i].mul(B[j]));
        }
      }
      return out;
    };
    const fact = (k) => { let f = 1; for (let j = 2; j <= k; j++) f *= j; return f; };

    // Moment equation for each p:  p!·M_p − Σ_{a=p}^{n-1} [z^a](φ^p φ′) · w̄_{a+1} = 0,
    // split into real + imaginary parts (the only i's live in coefficients, so realPart /
    // imagPart extract Re/Im with every variable treated as real). For order 2 this is
    // bit-identical to the hand-derived A&S system.
    const polys = [];
    let phip = [mi(1)];                             // φ^0 = 1
    for (let p = 0; p < n; p++) {
      const Ap = pmul(phip, dphi);                  // [z^a]( φ^p φ′ )
      let rhs = ZERO;
      for (let a = p; a < n; a++) {
        if (a < Ap.length && !Ap[a].isZero()) rhs = rhs.add(Ap[a].mul(Wb[a + 1]));
      }
      const eqn = Mval[p].mul(mi(fact(p))).sub(rhs);
      const re = eqn.realPart(), im = eqn.imagPart();
      if (!re.isZero()) polys.push(re);
      if (!im.isZero()) polys.push(im);
      if (p < n - 1) phip = pmul(phip, phi);        // advance φ^p → φ^{p+1}
    }
    return { polys, vars, params };
  }

  // Classical BOUNDED QD gate (the bounded analog of the Faber UQD gate): bounded,
  // no weighted-family markers, and a φ with one branch per pole (so the bounded
  // {z_j, A_{j,k}} representation is present). PQD/LQD carry alpha/lqdBeta/z0/gamma/q
  // and are excluded — their inverse system isn't this plain ansatz. The single source
  // of truth for both the equation-card gate (ui-qd-equations.js) and the Algebra-tab
  // gate (algebra-ui.js), which used to carry byte-identical private copies.
  function isClassicalBounded(phi, hData) {
    return !!(phi && !phi.unbounded
      && (!phi.family || phi.family === 'boundedQD')
      && phi.alpha == null && phi.lqdBeta == null
      && phi.z0 == null && phi.gamma == null && phi.q == null
      && hData && hData.poles && hData.poles.length
      && Array.isArray(phi.branches) && phi.branches.length === hData.poles.length);
  }

  const QDEquations = {
    generateClassicalBounded, generateSchwarzBounded, pointFunctionalSystem, reimSplit, realAxisSymmetry,
    isClassicalBounded,
    residualAtSolution, residualReimAtSolution,
    buildVarMap, buildRealVarMap,
    systemToLatex, systemToExport, latexOf: latexOfFor,
    phiSeriesAt,                       // φ(p+t) series; reused by QD.QDConstraints
    ratApprox: _ratApprox,             // exact-rational of a float; reused by AlgebraStore (specify-value / fix-φ(0))
    VARS: V, VARS_REAL: VR,
  };

  const QD = _QD;
  QD.QDEquations = QDEquations;
})(typeof globalThis !== 'undefined' ? globalThis : this);
