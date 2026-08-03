// ESM (Phase 2 port) — twin of poly-helpers.js (classic stays frozen). Registers onto the QD namespace.
import _QD from '../solvers/solver.mjs';
// =============================================================================
// poly-helpers.js -- Shared dense-polynomial arithmetic (QD.Poly).
//
// Polynomials are ascending-power arrays of Complex {re,im}: index i is the
// coefficient of w^i (or z^i). Consolidates the two inline copies that used
// to live in parse-h.js and schwarz/schwarz-inverse.js (code-review CR3).
//
// IMPORTANT — trimming convention: add/mul/scale/neg/pow do NOT trim trailing
// near-zero coefficients (matching schwarz-inverse's historical semantics,
// where the polynomial degree feeds the σ⁻¹ root count and must be preserved).
// Callers that want minimal-degree results (parse-h) compose QD.Poly.trim(...)
// themselves, exactly as before. This keeps both consumers bit-identical.
//
// Self-contained: inlines complex arithmetic so it has no load-order dep on
// complex.js. Only needs the QD namespace object to attach to (created by
// solver.js), so load this after solver.js and before parse-h.js.
// =============================================================================

(function (global) {
  'use strict';

  function zero() { return [{ re: 0, im: 0 }]; }
  function one()  { return [{ re: 1, im: 0 }]; }
  function variable() { return [{ re: 0, im: 0 }, { re: 1, im: 0 }]; }  // w (or z)

  // Drop trailing (highest-degree) coefficients that are ~0, keeping at least
  // the constant term.
  function trim(p) {
    const out = p.slice();
    while (out.length > 1 && Math.hypot(out[out.length - 1].re, out[out.length - 1].im) < 1e-14) {
      out.pop();
    }
    return out;
  }

  function add(a, b) {
    const n = Math.max(a.length, b.length);
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const ai = i < a.length ? a[i] : { re: 0, im: 0 };
      const bi = i < b.length ? b[i] : { re: 0, im: 0 };
      out[i] = { re: ai.re + bi.re, im: ai.im + bi.im };
    }
    return out;
  }

  function neg(a) {
    return a.map(c => ({ re: -c.re, im: -c.im }));
  }

  function mul(a, b) {
    if (a.length === 0 || b.length === 0) return zero();
    const out = new Array(a.length + b.length - 1);
    for (let i = 0; i < out.length; i++) out[i] = { re: 0, im: 0 };
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b.length; j++) {
        out[i + j].re += a[i].re * b[j].re - a[i].im * b[j].im;
        out[i + j].im += a[i].re * b[j].im + a[i].im * b[j].re;
      }
    }
    return out;
  }

  // Scale every coefficient by a complex scalar s.
  function scale(a, s) {
    return a.map(c => ({
      re: c.re * s.re - c.im * s.im,
      im: c.re * s.im + c.im * s.re,
    }));
  }

  // a^n (n a non-negative integer) via repeated multiplication.
  function pow(a, n) {
    let out = one();
    for (let i = 0; i < n; i++) out = mul(out, a);
    return out;
  }

  // (z − z0)^m as ascending-power Complex[], via exponentiation by squaring.
  function linearPower(z0, m) {
    let acc = [{ re: -z0.re, im: -z0.im }, { re: 1, im: 0 }];  // (z − z0)^1
    let result = one();
    let bit = 1;
    while (bit <= m) {
      if (m & bit) result = mul(result, acc);
      bit <<= 1;
      if (bit <= m) acc = mul(acc, acc);
    }
    return result;
  }

  const Poly = { zero, one, variable, trim, add, neg, mul, scale, pow, linearPower };

  // ---------------------------------------------------------------------------
  // Display formatting — Unicode sub/superscripts for integer indices/exponents.
  //
  // Consolidated from ~9 byte-identical-but-stylistically-drifted inline copies
  // (ui.js, ui-domain-plot.js ×3, ui-faber.js, faber-analysis.js,
  // param-slice-common.js, schwarz-analysis.js). It lives in poly-helpers.js
  // because this module loads FIRST in every execution context — the page, both
  // Worker bundles, and the test bootstrap (it's in WORKER_BUNDLE_FILES) — so
  // QD.Format is always resolvable wherever a consumer renders a label.
  //
  // Non-digit characters (signs, separators) pass through unchanged, matching the
  // old `map[+d] || d` behaviour. Display-only; never used in solver math.
  const SUBSCRIPT_DIGITS   = '₀₁₂₃₄₅₆₇₈₉';
  const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  function subscript(n)   { return String(n).replace(/\d/g, d => SUBSCRIPT_DIGITS[+d]); }
  function superscript(n) { return String(n).replace(/\d/g, d => SUPERSCRIPT_DIGITS[+d]); }
  const Format = { subscript, superscript };

  // Namespace plumbing mirrors the other solver modules: browser stashes on
  // window.QD; node-test's vm exposes the QD namespace as module.exports (set
  // by solver.js); worker bundle uses global.QD. Attach without clobbering.
  const QD = _QD;
  QD.Poly = Poly;
  QD.Format = Format;
})(typeof globalThis !== 'undefined' ? globalThis : this);
