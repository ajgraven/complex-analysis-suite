// =============================================================================
// qd-equations.js -- Symbolic generator for the classical BOUNDED QD inverse
// system (QD.QDEquations). Produces the explicit algebraic equations relating
// the quadrature-function coefficients {a_j, C_{j,s}, w₀} to the Riemann-map
// coefficients {z_j, A_{j,k}}, mirroring the Newton residual blocks the numeric
// solver assembles (solver-qd.js, Theorem 3.2.2):
//
//   (●_j)     φ(z_j) − a_j = 0                              (locator)
//   (★_{j,k}) A_{j,k} − Σ_{s≥k}(s/k)·C_{j,s}·[t^s]ψ̃_j^k = 0  (principal-part match)
//   (gauge)   Σ_j (A_{j,1} − Ā_{j,1}) = 0                   (= Σ_j Im A_{j,1} = 0)
//
// with φ(z) = w₀ + Σ_j Σ_{k=1}^{m_j} Ā_{j,k}·z^k/(1 − z̄_j z)^k and ψ̃_j the
// compositional inverse of phiTilde_j(t) = φ(z_j+t) − φ(z_j) (the local series).
//
// CONJUGATE-VARIABLE MODEL: z_j, z̄_j, A_{j,k}, Ā_{j,k}, a_j, ā_j, C_{j,s}, C̄_{j,s},
// w₀, w̄₀ are independent indeterminates over ℚ(i) (the reality slice z̄=conj z is
// applied only at evaluation). The real/imaginary split is a later increment.
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

    const unknowns = [];
    for (let i = 0; i < n; i++) {
      const j = i + 1;
      unknowns.push(V.z(j), V.zb(j));
      for (let k = 1; k <= orders[i]; k++) unknowns.push(V.A(j, k), V.Ab(j, k));
    }
    const params = [V.w0, V.wb0];
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
    const params = [VR.wx0, VR.wy0];
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
  function latexOfConjugate(name) {
    if (name === 'w0') return 'w_0';
    if (name === 'wb0') return '\\bar{w}_0';
    let m;
    if ((m = /^A(b?)(\d+)_(\d+)$/.exec(name))) return (m[1] ? '\\bar{A}' : 'A') + '_{' + m[2] + ',' + m[3] + '}';
    if ((m = /^C(b?)(\d+)_(\d+)$/.exec(name))) return (m[1] ? '\\bar{C}' : 'C') + '_{' + m[2] + ',' + m[3] + '}';
    if ((m = /^z(b?)(\d+)$/.exec(name))) return (m[1] ? '\\bar{z}' : 'z') + '_{' + m[2] + '}';
    if ((m = /^a(b?)(\d+)$/.exec(name))) return (m[1] ? '\\bar{a}' : 'a') + '_{' + m[2] + '}';
    return name;
  }
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
      vars: system.vars,
      counts: system.counts,
      equations,
    };
  }

  const QDEquations = {
    generateClassicalBounded, reimSplit,
    residualAtSolution, residualReimAtSolution,
    buildVarMap, buildRealVarMap,
    systemToLatex, systemToExport, latexOf: latexOfFor,
    phiSeriesAt,                       // φ(p+t) series; reused by QD.QDConstraints
    VARS: V, VARS_REAL: VR,
  };

  const QD = (typeof window !== 'undefined' && window.QD)
    ? window.QD
    : (typeof module !== 'undefined' && module.exports ? module.exports : (global.QD || (global.QD = {})));
  QD.QDEquations = QDEquations;
})(typeof globalThis !== 'undefined' ? globalThis : this);
