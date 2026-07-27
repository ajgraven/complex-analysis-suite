'use strict';
// =============================================================================
// h-text-roundtrip.test.js -- regression guard for qd-polyh-01.
//
// The "does this mode carry a polynomial part of h?" predicate had drifted: the
// parser (parse-h.mjs) allowed it in three modes while the UI (ui-h-text +
// every mode descriptor's cards.poly in ui-modes) offered it in FIVE — the two
// PQD-unbounded modes were missing from the parser. Consequence: five shipped
// PQD-unbounded presets threw on re-parse, and opening any of their share links
// silently dropped the whole quadrature datum (parseAndApplyHText returned on the
// throw before scheduling a solve).
//
// This file locks the two lists together:
//   (1) QD.modeAllowsPoly (the parser's single source of truth) must equal every
//       mode descriptor's cards.poly — so the parser and the editor cannot disagree.
//   (2) every shipped preset must round-trip formatH -> parseH under its own mode
//       without throwing, and a poly-bearing preset must keep its polynomial part.
// =============================================================================

module.exports = async function run() {
  const ok = global.ok;
  const QD = global.QD;
  const math = global.mathjs;

  if (!math || !math.parse) {
    // mathjs is a hard dep of parseH; if it is absent the whole check is moot.
    ok('h-text-roundtrip: mathjs available', false, 'mathjs required for parseH');
    return;
  }

  const hasPredicate = typeof QD.modeAllowsPoly === 'function';
  ok('h-text-roundtrip: QD.modeAllowsPoly is exposed by parse-h', hasPredicate);

  // Pull the mode descriptors from the app's own factory. installModes only reads
  // ui.state lazily (for modeDescriptor()), so a bare stub is enough to build MODES.
  const { MODES } = global.ctx.QD_UI.installModes({ state: {} });
  const modes = Object.keys(MODES);

  // (1) Source-of-truth invariant: parser predicate === descriptor cards.poly.
  if (hasPredicate) {
    for (const mode of modes) {
      const cardsPoly = !!(MODES[mode].cards && MODES[mode].cards.poly);
      ok('modeAllowsPoly("' + mode + '") === cards.poly (' + cardsPoly + ')',
         QD.modeAllowsPoly(mode) === cardsPoly);
    }
  }

  // (2) Every shipped preset round-trips formatH -> parseH under its own mode.
  const toC = (s) => QD.Complex.parse(s) || { re: 0, im: 0 };
  const nonzero = (c) => c && Math.hypot(c.re, c.im) > 1e-14;
  let checked = 0, polyPresets = 0;

  for (const mode of modes) {
    const list = (MODES[mode].presets && MODES[mode].presets()) || [];
    for (const p of list) {
      const poles = (p.poles || []).map((po) => ({
        a: toC(po.a),
        order: po.order,
        residues: (po.residues || []).slice(0, po.order).map(toC),
      }));
      const polyCoeffs = (p.polyCoeffs || []).map(toC);
      const hasPoly = polyCoeffs.some(nonzero);

      const hStr = QD.formatH({ poles, polyCoeffs });
      let err = null, res = null;
      try { res = QD.parseH(hStr, math, { mode }); }
      catch (e) { err = (e && e.message) ? e.message : String(e); }

      ok('preset "' + p.id + '" (' + mode + ') round-trips formatH->parseH', err === null, err || '');

      if (hasPoly) {
        polyPresets++;
        // The polynomial part is exactly what used to be dropped — assert it survived.
        const keptPoly = res && res.polyCoeffs && res.polyCoeffs.some(nonzero);
        ok('preset "' + p.id + '" (' + mode + ') keeps its polynomial part', !!keptPoly, err || '');
      }
      checked++;
    }
  }

  ok('h-text-roundtrip: exercised shipped presets', checked > 0, 'checked ' + checked);
  ok('h-text-roundtrip: covered poly-bearing presets', polyPresets >= 5,
     'poly presets: ' + polyPresets);
};
