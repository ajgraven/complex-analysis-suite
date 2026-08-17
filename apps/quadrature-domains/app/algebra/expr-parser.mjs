// ESM (Phase 2 port). Registers onto the QD namespace.
import _QD from '../solvers/solver.mjs';
// =============================================================================
// expr-parser.js -- QD.ExprParser: a tiny, no-eval recursive-descent parser that
// turns a USER-TYPED algebraic expression string into an exact ℚ(i) MPoly
// (QD.Sym). It is the input counterpart to cas-export.js (which only OUTPUTS):
// nothing else in the app parses a string back into a polynomial. Drives the
// Algebra workspace's "Define substitution" feature — the user types g(vars)
// (e.g. "w1^2", "z1 + zb1", "z1*zb1", "2*A1_1*A1_2 - 1") and we substitute a
// fresh symbol t := g into the current system.
//
// Grammar (precedence low→high):
//   expr   := term (('+'|'-') term)*
//   term   := factor (('*'|'/') factor)*        // '/' only by a nonzero constant
//   factor := base ('^' int)*                   // exponent: non-negative integer
//   base   := number | 'i' | varname | '(' expr ')' | ('-'|'+') base
//
// - Numbers are parsed EXACTLY (typed "0.2" → 1/5, not a float continued-fraction
//   approximation) — the exact-ℚ(i) ethos of the whole symbolic track. Integers
//   and decimals both become exact Rationals; other rationals via constant '/'.
// - Identifiers are matched as maximal runs [A-Za-z_][A-Za-z0-9_]* and validated
//   against the supplied known-variable set (so "zb1" is one variable, never
//   z·b1 — maximal-run matching gives longest-match for free). 'i' is the
//   imaginary unit unless a variable literally named 'i' is in scope.
// - NO eval, NO Function(): the only operations performed are MPoly add/sub/mul/
//   pow/neg/scale and exact Gaussian arithmetic. Untrusted input is safe.
//
// Pure module: no DOM. Depends only on the QD.Sym instance passed to parse().
// Loads after sym-core.js and before algebra-store.js.
// =============================================================================

(function (global) {
  'use strict';

  function isDigit(c) { return c >= '0' && c <= '9'; }
  function isIdStart(c) { return /[A-Za-z_]/.test(c); }
  function isIdChar(c) { return /[A-Za-z0-9_]/.test(c); }

  // Exact decimal/integer digit-string → an MPoly constant over ℚ(i).
  function numToMPoly(S, numStr) {
    const dot = numStr.indexOf('.');
    let n, d;
    if (dot < 0) { n = BigInt(numStr); d = 1n; }
    else {
      const ip = numStr.slice(0, dot) || '0';
      const fp = numStr.slice(dot + 1) || '';     // may be '' for a trailing dot ("5." → 5/1)
      n = BigInt(ip + fp);            // concatenate the digits, scale by 10^len(fp)
      d = 10n ** BigInt(fp.length);
    }
    return S.mpolyConst(S.gauss(S.rat(n, d)));
  }

  // The constant (empty-monomial) Gaussian coefficient of a variable-free MPoly.
  function constGauss(S, poly) {
    for (const term of poly.terms.values()) if (term.mono.size === 0) return term.coeff;
    return S.gaussInt(0);
  }

  // parse(str, knownVars, S) -> MPoly. Throws Error (with a position where it can)
  // on any malformed input; the caller surfaces .message to the user.
  function parse(str, knownVars, S) {
    if (!S || typeof S.mpolyVar !== 'function') throw new Error('ExprParser.parse: a QD.Sym instance is required');
    const src = String(str == null ? '' : str);
    const varSet = new Set(knownVars || []);

    // ---- tokenize ----
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^' || c === '(' || c === ')') {
        toks.push({ t: c, pos: i }); i++; continue;
      }
      if (isDigit(c) || c === '.') {
        let j = i, sawDigit = false, sawDot = false;
        while (j < src.length) {
          const d = src[j];
          if (isDigit(d)) { sawDigit = true; j++; }
          else if (d === '.' && !sawDot) { sawDot = true; j++; }
          else break;
        }
        if (!sawDigit) throw new Error("malformed number at position " + i);
        toks.push({ t: 'num', v: src.slice(i, j), pos: i }); i = j; continue;
      }
      if (isIdStart(c)) {
        let j = i + 1;
        while (j < src.length && isIdChar(src[j])) j++;
        toks.push({ t: 'id', v: src.slice(i, j), pos: i }); i = j; continue;
      }
      throw new Error("unexpected character '" + c + "' at position " + i);
    }
    if (!toks.length) throw new Error('empty expression');

    // ---- parse ----
    let p = 0;
    const peek = () => toks[p];
    const at = (tk) => (tk ? ' at position ' + tk.pos : ' at end of input');

    function parseExpr() {
      let left = parseTerm();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        const op = toks[p++].t;
        const right = parseTerm();
        left = (op === '+') ? left.add(right) : left.sub(right);
      }
      return left;
    }
    function parseTerm() {
      let left = parseFactor();
      while (peek() && (peek().t === '*' || peek().t === '/')) {
        const op = toks[p++].t;
        const right = parseFactor();
        if (op === '*') { left = left.mul(right); continue; }
        if (right.vars().size !== 0) throw new Error('division is only allowed by a nonzero constant');
        const g = constGauss(S, right);
        if (g.isZero()) throw new Error('division by zero');
        left = left.scale(S.gaussInt(1).div(g));
      }
      return left;
    }
    function parseFactor() {
      // A leading unary sign applies to the WHOLE power, not just the base, so −z1^2 = −(z1^2)
      // (the universal math convention) rather than (−z1)^2. Handled here, ABOVE the `^` loop.
      if (peek() && (peek().t === '-' || peek().t === '+')) {
        const op = toks[p++].t;
        const f = parseFactor();
        return op === '-' ? f.neg() : f;
      }
      let base = parseBase();
      while (peek() && peek().t === '^') {
        p++;
        const tk = peek();
        if (!tk || tk.t !== 'num' || tk.v.indexOf('.') >= 0) {
          throw new Error("'^' exponent must be a non-negative integer" + at(tk));
        }
        p++;
        const e = Number(tk.v);
        if (!Number.isInteger(e) || e < 0) throw new Error("'^' exponent must be a non-negative integer" + at(tk));
        base = base.pow(e);
      }
      return base;
    }
    function parseBase() {
      const tk = peek();
      if (!tk) throw new Error('unexpected end of expression');
      if (tk.t === '(') {
        p++;
        const e = parseExpr();
        if (!peek() || peek().t !== ')') throw new Error("unmatched '(' (expected ')')" + at(peek()));
        p++;
        return e;
      }
      if (tk.t === 'num') { p++; return numToMPoly(S, tk.v); }
      if (tk.t === 'id') {
        p++;
        if (tk.v === 'i' && !varSet.has('i')) return S.mpolyConst(S.gaussInt(0, 1));
        if (!varSet.has(tk.v)) {
          throw new Error("unknown variable '" + tk.v + "'" + (varSet.size ? ' (known: ' + [...varSet].join(', ') + ')' : ''));
        }
        return S.mpolyVar(tk.v);
      }
      throw new Error("unexpected token '" + (tk.v || tk.t) + "'" + at(tk));
    }

    const result = parseExpr();
    if (p < toks.length) {
      const tk = toks[p];
      throw new Error("unexpected '" + (tk.v || tk.t) + "'" + at(tk));
    }
    return result;
  }

  const QD = _QD;
  QD.ExprParser = { parse };
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
