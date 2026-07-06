// =============================================================================
// cas-export.js -- Format an exact ℚ(i) algebraic system as input for an external
// computer-algebra system (QD.CASExport). The Algebra workspace can solve / count
// pointwise in-engine, but the FULLY PARAMETRIC real-uniqueness statement (e.g.
// Aharonov–Shapiro "exactly one univalent root for ALL M₀>0, M₁∈ℂ") needs REAL
// COMPREHENSIVE TRIANGULAR DECOMPOSITION — parametric real quantifier elimination,
// which Ameur–Helmer–Tellander ran in Maple's RegularChains. That does NOT run in the
// browser; this module is the BRIDGE: it emits copy-paste-ready CAS input. The user
// runs it in their own Maple / Singular / Sage, then pastes the result back: `parseRCTD`
// (below) reads the cells back in (via the term-list JSON this module defines), and
// AlgebraStore.importRCTD lands them as an `op:'rctd'` column.
//
// Dialects:
//   'maple'       — RegularChains: a PolynomialRing + the system as p=0 / p>0 / p<>0,
//                   with PARAMETERS declared LAST and a ready RealComprehensiveTriangularize
//                   (or RealTriangularize when there are no parameters) call. THE PRIMARY
//                   target — the only one of these that does parametric real triangularization.
//   'singular'    — ring (0,i),(vars),dp + minpoly i^2+1; the equality ideal + std() (a
//                   Gröbner cross-check of the complex variety; inequalities are commented).
//   'sage'        — NumberField(x²+1) + PolynomialRing + the equality ideal's groebner_basis()
//                   (likewise a variety cross-check).
//   'mathematica' — the canonical printer the AlgebraStore Mathematica export delegates to
//                   (so there is ONE polynomial printer, no drift).
//
// Input is the serialization-safe term-list form (MPoly.termList()): each equation is
// { terms, rel } with rel ∈ {'=','>','≠'} and terms = [{ coeff:{re:[n,d],im:[n,d]}, mono:{var:exp} }].
// Pure module: no DOM, no QD.Sym dependency (operates on the already-serialized term lists).
// Loads before algebra-store.js (which delegates its Mathematica export here).
// =============================================================================

// ESM (Phase 2 port) — twin of algebra/cas-export.js (classic stays frozen). Registers QD.CASExport.
import _QD from '../solver.mjs';

(function () {
  'use strict';

  // Per-dialect lexical choices: the imaginary unit symbol, a variable-name sanitizer,
  // the power and product operators, and the relation suffix. Everything else (rational
  // coefficients, term assembly) is dialect-independent.
  const DIALECTS = {
    // Wolfram-Language: `_` is Blank, so A1_1 → A1$1; imaginary unit I; rel == / > / !=.
    mathematica: { I: 'I', name: (n) => n.replace(/_/g, '$'), pow: '^', mul: '*', rel: (r) => (r === '>' ? ' > 0' : r === '≠' ? ' != 0' : ' == 0') },
    // Maple RegularChains: `_` legal; imaginary unit I; equalities p = 0, strict p > 0, p <> 0.
    maple: { I: 'I', name: (n) => n, pow: '^', mul: '*', rel: (r) => (r === '>' ? ' > 0' : r === '≠' ? ' <> 0' : ' = 0') },
    // Sage over a NumberField with generator I; bare polynomials feed an ideal (equalities).
    sage: { I: 'I', name: (n) => n, pow: '^', mul: '*', rel: (r) => '' },
    // Singular over (0,i) with minpoly i^2+1; bare polynomials feed an ideal (equalities).
    singular: { I: 'i', name: (n) => n, pow: '^', mul: '*', rel: (r) => '' },
    // msolve `.ms` input is over ℚ — so the imaginary unit becomes a VARIABLE `i` (the caller
    // appends its minimal polynomial i^2+1); bare polynomials, no rel suffix.
    msolve: { I: 'i', name: (n) => n, pow: '^', mul: '*', rel: (r) => '' },
  };

  // [numerator, denominator] BigInt-string pair → 'n' or 'n/d'.
  function _rat(p) { return p[1] === '1' ? p[0] : p[0] + '/' + p[1]; }

  // a + b·(imaginary unit) as a CAS expression, eliding zero / unit parts. Mirrors the
  // AlgebraStore _mmaCoeff logic, parameterized by the dialect's imaginary symbol + product op.
  function _coeff(re, im, D) {
    const reZero = re[0] === '0', imZero = im[0] === '0';
    if (imZero) return _rat(re);
    const imNeg = im[0][0] === '-';
    const imAbs = _rat([imNeg ? im[0].slice(1) : im[0], im[1]]);
    const imBody = imAbs === '1' ? D.I : imAbs + D.mul + D.I;
    if (reZero) return (imNeg ? '-' : '') + imBody;
    return '(' + _rat(re) + (imNeg ? ' - ' : ' + ') + imBody + ')';
  }

  // One polynomial (term list) → a CAS InputForm string (sum of coeff·monomial terms).
  function polyToCAS(terms, dialect) {
    const D = DIALECTS[dialect]; if (!D) throw new Error('CASExport: unknown dialect ' + dialect);
    terms = terms || [];
    if (!terms.length) return '0';
    const parts = terms.map((t) => {
      const c = _coeff(t.coeff.re, t.coeff.im, D);
      const mono = Object.keys(t.mono).sort().map((nm) => {
        const e = t.mono[nm], b = D.name(nm); return e === 1 ? b : b + D.pow + e;
      }).join(D.mul);
      if (!mono) return c;
      if (c === '1') return mono;
      if (c === '-1') return '-' + mono;
      return c + D.mul + mono;
    });
    return parts.join(' + ').replace(/\+ -/g, '- ');
  }

  // One equation { terms, rel } → 'lhs <relsuffix>' (e.g. 'p = 0', 'p > 0', or bare 'p'
  // for the ideal dialects where rel suffixes are empty).
  function equationToCAS(eq, dialect) {
    return polyToCAS(eq.terms, dialect) + DIALECTS[dialect].rel(eq.rel || '=');
  }

  // ---- SymPy (Python) formatting — needs EXACT Rational(n, d) coefficients (n/d would be
  // Python float division) + `**` powers + the imaginary unit I. Used by the reproducible
  // derivation-script export (E4). polyToCAS's `_rat` is unsafe here, hence a dedicated path.
  function _ratPy(p) { return p[1] === '1' ? p[0] : 'Rational(' + p[0] + ', ' + p[1] + ')'; }
  function _coeffPy(re, im) {
    const reZero = re[0] === '0', imZero = im[0] === '0';
    if (imZero) return _ratPy(re);
    const imNeg = im[0][0] === '-';
    const imAbs = _ratPy([imNeg ? im[0].slice(1) : im[0], im[1]]);
    const imBody = imAbs === '1' ? 'I' : imAbs + '*I';
    if (reZero) return (imNeg ? '-' : '') + imBody;
    return '(' + _ratPy(re) + (imNeg ? ' - ' : ' + ') + imBody + ')';
  }
  // One polynomial (term list) → a SymPy expression string.
  function polyToSympy(terms) {
    terms = terms || [];
    if (!terms.length) return '0';
    const parts = terms.map((t) => {
      const c = _coeffPy(t.coeff.re, t.coeff.im);
      const mono = Object.keys(t.mono).sort().map((nm) => { const e = t.mono[nm]; return e === 1 ? nm : nm + '**' + e; }).join('*');
      if (!mono) return c;
      if (c === '1') return mono;
      if (c === '-1') return '-' + mono;
      return c + '*' + mono;
    });
    return parts.join(' + ').replace(/\+ -/g, '- ');
  }
  // A scalar value record { re:[n,d], im:[n,d] } → a SymPy scalar expression (e.g. a pinned
  // value or a substitution ratio). Same coefficient grammar as a polynomial's constant term.
  function sympyValue(rec) { return (rec && rec.re && rec.im) ? _coeffPy(rec.re, rec.im) : '0'; }

  // Variable inventory of a system: the sorted union of every monomial variable, split into
  // unknowns and the caller-designated parameters (only those actually present are kept).
  function _varSplit(items, params) {
    const set = new Set();
    for (const it of items) for (const t of (it.terms || [])) for (const v of Object.keys(t.mono || {})) set.add(v);
    const all = [...set].sort();
    const ps = new Set(params || []);
    const parameters = all.filter((v) => ps.has(v));
    const unknowns = all.filter((v) => !ps.has(v));
    return { all, unknowns, parameters };
  }

  // Format a whole system as a runnable CAS script. `items` = [{ terms, rel, label? }];
  // opts.params = variable names to treat as PARAMETERS (Maple RCTD); opts.title = a header
  // comment. The variable order is unknowns first, then parameters last (the RCTD convention).
  function systemToCAS(items, dialect, opts) {
    items = items || []; opts = opts || {};
    if (!DIALECTS[dialect]) throw new Error('CASExport: unknown dialect ' + dialect);
    const { unknowns, parameters } = _varSplit(items, opts.params);
    const orderedVars = unknowns.concat(parameters).map(DIALECTS[dialect].name);
    const eqs = items.filter((it) => (it.rel || '=') === '=');
    const ineqs = items.filter((it) => (it.rel || '=') !== '=');
    const title = opts.title ? String(opts.title) : 'QD algebraic system';

    if (dialect === 'maple') {
      const sysList = items.map((it) => '  ' + equationToCAS(it, 'maple') + (it.label ? '   # ' + _ascii(it.label) : '')).join(',\n');
      const np = parameters.length;
      const call = np > 0
        ? 'dec := RealComprehensiveTriangularize(sys, ' + np + ', R):\n# ' + np + ' parameter(s) [' + parameters.join(', ') + '] declared last; each cell = [regular_system, parameter_constraints].'
        : 'dec := RealTriangularize(sys, R):';
      return '# ' + title + ' — Maple RegularChains (parametric real triangular decomposition)\n'
        + 'with(RegularChains):\n'
        + 'R := PolynomialRing([' + orderedVars.join(', ') + ']):   # unknowns first, parameters last\n'
        + 'sys := [\n' + sysList + '\n]:\n'
        + call + '\n';
    }
    if (dialect === 'singular') {
      const ideal = eqs.map((it) => '  ' + polyToCAS(it.terms, 'singular')).join(',\n');
      const ineqLines = ineqs.map((it) => '// inequality (not in the ideal): ' + equationToCASInfo(it)).join('\n');
      return '// ' + title + ' — Singular (equality ideal over ℚ(i); Gröbner cross-check of the variety)\n'
        + 'ring r = (0,i),(' + orderedVars.join(', ') + '),dp;\n'
        + 'minpoly = i^2+1;\n'
        + 'ideal Id =\n' + (ideal || '  0') + ';\n'
        + 'option(redSB);\n'
        + 'std(Id);\n'
        + (ineqLines ? ineqLines + '\n' : '');
    }
    if (dialect === 'sage') {
      const eqList = eqs.map((it) => '  ' + polyToCAS(it.terms, 'sage')).join(',\n');
      const ineqLines = ineqs.map((it) => '# inequality (not in the ideal): ' + equationToCASInfo(it)).join('\n');
      return '# ' + title + ' — Sage (equality ideal over ℚ(I); Gröbner cross-check of the variety)\n'
        + 'x = polygen(QQ)\n'
        + 'K.<I> = NumberField(x^2 + 1)\n'
        + 'R.<' + orderedVars.join(', ') + '> = PolynomialRing(K, order=\'degrevlex\')\n'
        + 'J = R.ideal([\n' + (eqList || '  R(0)') + '\n])\n'
        + 'print(J.groebner_basis())\n'
        + (ineqLines ? ineqLines + '\n' : '');
    }
    // mathematica: a Wolfram-Language list of (in)equalities, ready for Solve / GroebnerBasis.
    return '{' + items.map((it) => equationToCAS(it, 'mathematica')).join(',\n ') + '}';
  }

  // Inequality info string (the lhs + a readable relation) for the equality-only dialects'
  // comments, so the dropped constraints are still visible to the user.
  function equationToCASInfo(it) {
    const rel = it.rel === '>' ? ' > 0' : it.rel === '≠' ? ' <> 0' : ' = 0';
    return polyToCAS(it.terms, 'maple') + rel + (it.label ? '   (' + _ascii(it.label) + ')' : '');
  }

  // Strip a label to ASCII for a CAS comment (● / ★ and subscripts aren't safe everywhere).
  function _ascii(s) { return String(s).replace(/●/g, 'locator').replace(/★/g, 'star').replace(/[^\x20-\x7E]/g, '').trim(); }

  // ===========================================================================
  // IMPORT — read an external RCTD result back into the workspace.
  //
  // The PARAMETRIC decomposition (Maple RealComprehensiveTriangularize) returns a list of
  // CELLS: each a region of parameter space (given by parameter CONSTRAINTS) together with a
  // regular CHAIN (a triangular equality system valid there) and the number of REAL solutions
  // there. Rather than parse Maple's pretty-printed native output (brittle, version-specific),
  // the user serializes the decomposition with the documented Maple post-script (see
  // AHARONOV_SHAPIRO.md → "Maple post-script") into the term-list JSON THIS MODULE DEFINES, and
  // pastes it back. `parseRCTD` validates + normalizes that JSON into the cell structure the
  // AlgebraStore.importRCTD consumes. Pure (no QD.Sym): it returns the term lists verbatim; the
  // store builds the MPolys from them via QD.Sym.polyFromTermList.
  //
  // JSON shape (qd-rctd v1):
  //   { "format":"qd-rctd", "version":1, "params":["M0","m1","n1"],
  //     "cells":[ { "index":1, "realCount":1,
  //                 "constraints":[ { "terms":[…], "rel":">" }, … ],
  //                 "chain":[ { "terms":[…] }, … ] }, … ] }
  // where each `terms` is exactly an MPoly.termList(): [{ coeff:{re:[n,d],im:[n,d]}, mono:{var:exp} }].
  // `format`/`version`/`params` are optional; `cells` is required and non-empty.

  // Validate one term list (the serialization-safe shape), throwing a located error if malformed.
  function _checkTerms(terms, where) {
    if (!Array.isArray(terms)) throw new Error(where + ': "terms" must be an array');
    for (const t of terms) {
      if (!t || typeof t !== 'object') throw new Error(where + ': each term must be an object');
      const c = t.coeff;
      if (!c || !Array.isArray(c.re) || c.re.length !== 2 || !Array.isArray(c.im) || c.im.length !== 2)
        throw new Error(where + ': each term needs coeff.re=[num,den] and coeff.im=[num,den]');
      if (t.mono != null && typeof t.mono !== 'object') throw new Error(where + ': "mono" must be an object');
    }
    return terms;
  }
  // Normalize a relation symbol to the workspace's {'=','>','≠'}, accepting the CAS spellings
  // a serializer might emit ('<>'/'!=' for ≠; '>='/'≥'/'>' for the strict cell-defining side).
  function _normRel(rel) {
    if (rel === '<>' || rel === '!=' || rel === '≠') return '≠';
    if (rel === '>' || rel === '>=' || rel === '≥') return '>';
    return '=';
  }
  // Parse + validate an RCTD JSON string (or an already-parsed object) → normalized cells.
  // Returns { ok:true, format, version, params, cells } or { ok:false, reason } (never throws).
  function parseRCTD(jsonText) {
    let obj;
    try { obj = (typeof jsonText === 'string') ? JSON.parse(jsonText) : jsonText; }
    catch (e) { return { ok: false, reason: 'invalid JSON: ' + ((e && e.message) || String(e)) }; }
    if (!obj || typeof obj !== 'object') return { ok: false, reason: 'expected a JSON object with a "cells" array' };
    if (obj.format && obj.format !== 'qd-rctd') return { ok: false, reason: 'unrecognized format "' + obj.format + '" (expected "qd-rctd")' };
    const rawCells = obj.cells;
    if (!Array.isArray(rawCells) || !rawCells.length) return { ok: false, reason: 'no "cells" array, or it is empty (nothing to import)' };
    const cells = [];
    try {
      rawCells.forEach((cell, ci) => {
        if (!cell || typeof cell !== 'object') throw new Error('cell ' + (ci + 1) + ': must be an object');
        const index = (cell.index != null) ? cell.index : ci + 1;
        const realCount = (cell.realCount != null && isFinite(cell.realCount)) ? Number(cell.realCount) : null;
        const constraints = (cell.constraints || []).map((c, k) => {
          if (!c || typeof c !== 'object') throw new Error('cell ' + index + ' constraint ' + (k + 1) + ': must be an object');
          return { terms: _checkTerms(c.terms || [], 'cell ' + index + ' constraint ' + (k + 1)), rel: _normRel(c.rel) };
        });
        const chain = (cell.chain || []).map((c, k) => {
          if (!c || typeof c !== 'object') throw new Error('cell ' + index + ' chain ' + (k + 1) + ': must be an object');
          return { terms: _checkTerms(c.terms || [], 'cell ' + index + ' chain ' + (k + 1)), rel: '=' };
        });
        cells.push({ index, realCount, constraints, chain });
      });
    } catch (e) { return { ok: false, reason: (e && e.message) || String(e) }; }
    return { ok: true, format: 'qd-rctd', version: obj.version || 1, params: Array.isArray(obj.params) ? obj.params.slice() : [], cells };
  }

  // ===========================================================================
  // G11 — msolve `.ms` BRIDGE (export the system; parse the real-solution output back).
  //
  // msolve (https://msolve.lip6.fr) is a fast external solver for polynomial systems over ℚ.
  // It does NOT run in the browser; this is the bridge (like the RCTD export): emit a `.ms`
  // input file the user runs offline (`msolve -f sys.ms -o out`), then paste the output back
  // for `parseMsolveSolutions`. Because msolve is over ℚ (not ℚ(i)), an ℚ(i) system is mapped
  // to ℚ by treating the imaginary unit as a VARIABLE `i` and appending its minimal polynomial
  // i²+1 — so the exported variety is the same. `.ms` format: line 1 = comma-separated
  // variables; line 2 = field characteristic (0 for ℚ); then the equality polynomials,
  // comma-separated. (Inequalities are dropped — msolve solves varieties.)
  // ---------------------------------------------------------------------------
  function systemToMsolve(items, opts) {
    items = items || []; opts = opts || {};
    const { unknowns, parameters } = _varSplit(items, opts.params);
    const eqs = items.filter((it) => (it.rel || '=') === '=');
    const needI = items.some((it) => (it.terms || []).some((t) => t.coeff && t.coeff.im && t.coeff.im[0] !== '0'));
    const vars = unknowns.concat(parameters);
    const polyLines = eqs.map((it) => polyToCAS(it.terms, 'msolve'));
    if (needI) { vars.push('i'); polyLines.unshift('i^2+1'); }   // ℚ(i) → ℚ + i a variable, i²+1=0
    if (!vars.length || !polyLines.length) return '';
    return vars.join(', ') + '\n0\n' + polyLines.join(',\n') + '\n';
  }

  // Tolerant recursive-descent parser for msolve's bracketed integer-nested-list output
  // (ignoring any non-bracket prefix/suffix and the trailing ':'). Returns nested JS arrays of
  // integers, or null if no bracketed structure is present.
  function _parseNestedInts(text) {
    const s = String(text); let i = 0;
    while (i < s.length && s[i] !== '[') i++;
    if (i >= s.length) return null;
    const skip = () => { while (i < s.length && (/\s/.test(s[i]) || s[i] === ',')) i++; };
    function parseVal() {
      skip();
      if (s[i] === '[') {
        i++; const arr = []; skip();
        while (i < s.length && s[i] !== ']') { arr.push(parseVal()); skip(); }
        if (s[i] === ']') i++;
        return arr;
      }
      let j = i; if (s[j] === '-' || s[j] === '+') j++;
      while (j < s.length && s[j] >= '0' && s[j] <= '9') j++;
      if (j === i) { i++; return NaN; }   // unknown char (e.g. '/', '.', a letter) — ADVANCE so the
                                          // enclosing array loop can't spin forever (tolerant contract)
      const tok = s.slice(i, j); i = j;
      return parseInt(tok, 10);
    }
    return parseVal();
  }
  // Parse msolve's real-root output → { ok, dim, count, solutions:[{ var:{lo,hi,approx} }] }.
  // msolve emits [dim, [ solution, … ]] where a solution is a list of per-variable rational
  // intervals (one interval for the univariate case), each interval [[lo_n,lo_d],[hi_n,hi_d]]
  // (an endpoint may also be a bare integer). opts.vars supplies the variable order (defaults to
  // x1,x2,…). The exported `i` variable, if present, should be passed last in opts.vars.
  function parseMsolveSolutions(text, opts) {
    opts = opts || {};
    const tree = _parseNestedInts(text);
    if (!Array.isArray(tree)) return { ok: false, reason: 'no bracketed msolve output found' };
    const isInt = (x) => typeof x === 'number' && !isNaN(x);
    const isRatEnd = (x) => isInt(x) || (Array.isArray(x) && x.length === 2 && isInt(x[0]) && isInt(x[1]));
    const isInterval = (x) => Array.isArray(x) && x.length === 2 && isRatEnd(x[0]) && isRatEnd(x[1]);
    const isSolution = (x) => isInterval(x) || (Array.isArray(x) && x.length > 0 && x.every(isInterval));
    const val = (e) => (isInt(e) ? e : (e[1] === 0 ? NaN : e[0] / e[1]));
    const dim = (tree.length && isInt(tree[0])) ? tree[0] : null;
    // primary: msolve's documented [dim, solList] — solList is the last array element
    let sols = null;
    const last = tree.length ? tree[tree.length - 1] : null;
    if (Array.isArray(last) && last.length && last.every(isSolution)) sols = last;
    if (!sols) {                                   // fallback: search for the solution list
      const visit = (node) => {
        if (!Array.isArray(node)) return;
        if (!sols && node.length > 0 && !isInterval(node) && node.every(isSolution)) sols = node;
        for (const c of node) if (!sols) visit(c);
      };
      visit(tree);
    }
    if (!sols) return { ok: false, reason: 'could not locate the solution list in the msolve output', dim };
    const vars = opts.vars || null;
    const nv = vars ? vars.length : null;
    // Interpret each solution into its per-variable interval list. When the variable COUNT is
    // known (the store always passes opts.vars), use it — this disambiguates the case where a
    // 2-variable solution with bare-integer boxes (e.g. [[1,2],[3,4]]) would otherwise look like
    // a single univariate interval. Without a hint, fall back to the shape heuristic.
    const toIntervals = (s) => (nv === 1 ? [s] : (nv != null ? s : (isInterval(s) ? [s] : s)));
    const solutions = sols.map((s) => {
      const intervals = toIntervals(s);
      const rec = {};
      intervals.forEach((iv, k) => {
        const lo = val(iv[0]), hi = val(iv[1]);
        rec[(vars && vars[k]) ? vars[k] : ('x' + (k + 1))] = { lo, hi, approx: (lo + hi) / 2 };
      });
      return rec;
    });
    return { ok: true, dim, count: solutions.length, solutions };
  }

  const ns = { polyToCAS, equationToCAS, systemToCAS, polyToSympy, sympyValue, parseRCTD, systemToMsolve, parseMsolveSolutions, dialects: ['maple', 'singular', 'sage', 'mathematica', 'msolve'] };
  _QD.CASExport = ns;

})();
