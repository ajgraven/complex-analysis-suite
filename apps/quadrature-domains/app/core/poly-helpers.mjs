// ESM (Phase 2 port) — twin of poly-helpers.js (classic stays frozen). Registers onto the QD namespace.
import _QD from '../solvers/solver.mjs';
import { makePoly, objAlgebra, subscript, superscript } from '@cas/core';
// =============================================================================
// poly-helpers.js -- Shared dense-polynomial arithmetic (QD.Poly) + label formatting (QD.Format).
//
// Polynomials are ascending-power arrays of Complex {re,im}: index i is the coefficient of w^i
// (or z^i). Both QD.Poly and QD.Format now DELEGATE to @cas/core (makePoly / subscript /
// superscript) — the shared extraction of this module's arithmetic (ADR-0007 second-consumer rule;
// see the follow-on ADR). objAlgebra is @cas/core's {re,im} instance, and Complex.mul / add there
// use the SAME formulas this file used to inline, so QD.Poly stays byte-identical (the classic .js
// twin, still vm-loaded in the legacy suite, is a live parity check of exactly that).
//
// TRIMMING CONVENTION (unchanged): add/mul/scale/neg/pow do NOT trim trailing near-zero
// coefficients (the σ⁻¹ root count is the degree). Callers that want a minimal-degree result
// compose QD.Poly.trim themselves, exactly as before. @cas/core/poly preserves this.
//
// Only needs the QD namespace object to attach to (created by solver.js), so load this after
// solver.js and before parse-h.js. (@cas/core resolves as a workspace ESM import, like the other
// ported .mjs modules — faber-analysis, direct-common — already do.)
// =============================================================================

(function () {
  'use strict';

  // QD.Poly's exact historical surface, backed by the shared @cas/core kernel (objAlgebra = {re,im}).
  const P = makePoly(objAlgebra);
  const Poly = {
    zero: P.zero,
    one: P.one,
    variable: P.variable,
    trim: P.trim,
    add: P.add,
    neg: P.neg,
    mul: P.mul,
    scale: P.scale,
    pow: P.pow,
    linearPower: P.linearPower,
  };

  // Display formatting — Unicode sub/superscripts for integer indices/exponents; now the shared
  // @cas/core/format helpers. Consolidated (long ago) from ~9 drifted inline copies; QD.Format is
  // resolvable in every execution context (page, both Worker bundles, the test bootstrap) because
  // this module loads first everywhere.
  const Format = { subscript, superscript };

  // Namespace plumbing mirrors the other solver modules: attach onto the solver.mjs QD namespace
  // (browser window.QD / node-test module.exports / worker global.QD) without clobbering.
  const QD = _QD;
  QD.Poly = Poly;
  QD.Format = Format;
})();
