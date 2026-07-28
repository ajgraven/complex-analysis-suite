// =============================================================================
// ui-h-text.js -- Custom h(w) text input ⇄ structured-grid mirror.
//
// Extracted from ui.js by the Phase-3 UI modularization (item E). Exposes a
// QD_UI.installHText(uiCtx) factory; ui.js captures:
//   ({ modeAllowsPoly, refreshHText, setHTextMsg, parseAndApplyHText } =
//        QD_UI.installHText(uiCtx));
//
// The #h-text input is a two-way-coupled mirror of the structured pole grid and
// polynomial-part coefficient list. refreshHText() rebuilds the text from state;
// parseAndApplyHText() goes the other direction via QD.parseH.
//
// Dependencies on ui.js / sibling modules are read as `ui.*` AT CALL TIME:
// renderPolesList / renderPolyCoefList (ui-pole-grid.js — these two modules call
// each other), and syncPolyDegreeInput / markAsCustom / scheduleSolve / the
// magSliderMax cache (all ui.js). `QD` is the solver namespace and `math` is the
// math.js CDN global (parser-only).
// =============================================================================

// ESM (Phase 2 port) — twin of ui-h-text.js (classic stays frozen). QD_UI factory module.
import { QD_UI } from './ui-registry.mjs';
import _QD from './solver.mjs';
const QD = _QD;

(function (global) {
  'use strict';

  // Caps mirror the structured grid: pole order ∈ [1,6] (ui.js order input) and
  // polynomial degree ∈ [-1,6] (ui.js #poly-degree). The text path must enforce
  // the same limits so a pasted/typed `1/(w-2)^50` or huge polynomial can't slip
  // a high order past the grid into the solver (Taylor truncation + an O((2m)²)
  // dense Newton step per pole).
  const POLE_ORDER_MAX = 6;
  const POLY_DEGREE_MAX = 6;

  QD_UI.installHText = function installHText(ui) {
    const state = ui.state;

    // Polynomial part of h is meaningful exactly in the UNBOUNDED family panels.
    //
    // Delegated to the engine (QD.modeAllowsPoly, parse-h.mjs) rather than kept as a
    // local copy. The two copies had drifted: this one correctly listed all five
    // unbounded modes, while parse-h listed only three and therefore THREW on the
    // pqd-unbounded presets this function had happily written into #h-text. One list
    // now decides both what the UI shows and what the parser accepts.
    const modeAllowsPoly = (mode) => QD.modeAllowsPoly(mode);

    function refreshHText() {
      const inp = document.getElementById('h-text');
      if (!inp) return;
      try {
        const poles = state.poles.map(po => {
          const a = QD.Complex.parse(po.a) || { re: 0, im: 0 };
          const residues = po.residues.slice(0, po.order).map(r =>
            QD.Complex.parse(r) || { re: 0, im: 0 });
          return { a, order: po.order, residues };
        });
        let polyCoeffs = [];
        if (modeAllowsPoly(state.mode) && state.polyDegree >= 0) {
          polyCoeffs = state.polyCoeffs.slice(0, state.polyDegree + 1).map(s =>
            QD.Complex.parse(s) || { re: 0, im: 0 });
        }
        inp.value = QD.formatH({ poles, polyCoeffs });
        setHTextMsg('');
      } catch (e) {
        // Defensive: never let formatter errors break the panel.
      }
    }

    function setHTextMsg(msg, kind) {
      const el = document.getElementById('h-text-msg');
      if (!el) return;
      el.textContent = msg || '';
      el.style.color = (kind === 'warn') ? 'var(--c-warn)' : 'var(--c-err)';
      // Tie the failure to the field for assistive tech: aria-invalid + the .invalid
      // outline on #h-text while a genuine error is shown (a 'warn' stays valid). The
      // #h-text-msg div is role="alert", so its text is announced. (qd-htextmsg-live-01)
      const input = document.getElementById('h-text');
      if (input) {
        const isError = !!msg && kind !== 'warn';
        input.setAttribute('aria-invalid', String(isError));
        input.classList.toggle('invalid', isError);
      }
    }

    // Reject an over-long expression before parsing — a valid h(w) is a short low-order rational
    // function; a multi-KB string (e.g. from a crafted share link, or a w*w*...*w degree bomb) is
    // only a main-thread DoS vector.
    const MAX_H_TEXT_LEN = 2000;
    function parseAndApplyHText() {
      const inp = document.getElementById('h-text');
      if (!inp) return;
      const expr = inp.value.trim();
      if (!expr) { setHTextMsg('Enter an expression in w.'); return; }
      if (expr.length > MAX_H_TEXT_LEN) { setHTextMsg('Expression too long (max ' + MAX_H_TEXT_LEN + ' chars).'); return; }
      // mathjs is loaded lazily (off the initial critical path). If it isn't ready yet — e.g. a
      // zero-click share-link `h` restore that fires before the idle prefetch lands, or a very
      // early click — fetch it, then re-run this once. parseAndApplyHText ends in scheduleSolve,
      // so the retry produces the same result as if math had been present.
      if (typeof math === 'undefined' || !math || !math.parse) {
        setHTextMsg('Loading math engine…');
        if (typeof window !== 'undefined' && window.ensureMath) {
          window.ensureMath().then(() => parseAndApplyHText())
            .catch(() => setHTextMsg('Could not load the math engine.'));
        } else {
          setHTextMsg('math.js not loaded');
        }
        return;
      }
      let parsed;
      try {
        parsed = QD.parseH(expr, math, { mode: state.mode });
      } catch (e) {
        setHTextMsg(e.message || String(e));
        return;
      }

      let clamped = false;   // true if any order / degree exceeded the grid cap

      // Convert parsed.poles (Complex-typed) back to the state's string form.
      if (parsed.poles.length === 0) {
        // Need at least one row in the grid so the user can extend it.
        state.poles = [{ a: '0', order: 1, residues: ['0'] }];
      } else {
        state.poles = parsed.poles.map(p => {
          let order = p.order;
          let residues = p.residues;
          if (order > POLE_ORDER_MAX) {
            clamped = true;
            order = POLE_ORDER_MAX;
            residues = residues.slice(0, POLE_ORDER_MAX);
          }
          return {
            a: QD.Complex.format(p.a),
            order,
            residues: residues.map(c => QD.Complex.format(c)),
          };
        });
      }

      if (modeAllowsPoly(state.mode)) {
        if (parsed.polyCoeffs.length > 0) {
          let coeffs = parsed.polyCoeffs;
          if (coeffs.length - 1 > POLY_DEGREE_MAX) {
            clamped = true;
            coeffs = coeffs.slice(0, POLY_DEGREE_MAX + 1);
          }
          state.polyCoeffs = coeffs.map(c => QD.Complex.format(c));
          state.polyDegree = coeffs.length - 1;
        } else {
          state.polyDegree = -1;
          state.polyCoeffs = [];
        }
        ui.syncPolyDegreeInput();
      }

      for (const k of Object.keys(ui.magSliderMax)) delete ui.magSliderMax[k];
      ui.renderPolesList();
      ui.renderPolyCoefList();
      ui.markAsCustom();
      if (clamped) {
        setHTextMsg('Truncated to the supported limit: pole order ≤ ' + POLE_ORDER_MAX +
          ', polynomial degree ≤ ' + POLY_DEGREE_MAX + '.', 'warn');
      } else if (parsed.warnings && parsed.warnings.length) {
        setHTextMsg('Parsed with warning: ' + parsed.warnings[0], 'warn');
      } else {
        setHTextMsg('');
      }
      ui.scheduleSolve();
    }

    return { modeAllowsPoly, refreshHText, setHTextMsg, parseAndApplyHText };
  };
})(typeof window !== 'undefined' ? window : globalThis);
