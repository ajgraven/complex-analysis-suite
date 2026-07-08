// =============================================================================
// ui-url-state.js -- URL/hash state serialization (B1) for the Inverse tab.
//
// Extracted from ui.js by the Phase-3 UI modularization (item E). Pulled out as
// a factory on the shared QD_UI namespace so it receives its ui.js closures
// (state, MODES, PRESETS, $, and the four apply-helpers) via dependency
// injection rather than relying on shared script-scope variables (which don't
// cross <script> tags). See ui-domain-plot.js for the original template.
//
// ui.js installs it via:
//   const { writeUrlState, applyUrlState } = QD_UI.installUrlState(uiCtx);
//
// The two returned functions are then used exactly as before: writeUrlState is
// called after each solve / tab switch (rAF-coalesced), applyUrlState restores
// a shared/bookmarked config on load. Bodies are identical to what previously
// lived in ui.js — only the dependency source changed (module scope → `ui`).
// =============================================================================

// ESM (Phase 2 port) — twin of ui-url-state.js (classic stays frozen). QD_UI factory module.
import { QD_UI } from './ui-registry.mjs';
import { encodeViewState, decodeViewState } from '@cas/interchange';

(function (global) {
  'use strict';

  QD_UI.installUrlState = function installUrlState(ui) {
    // Stable deps destructured to their original ui.js names, so the bodies
    // below are verbatim. All exist on `ui` by the time this factory runs
    // (installed near the end of ui.js, after every dependency is defined).
    const state             = ui.state;
    const MODES             = ui.MODES;
    const PRESETS           = ui.PRESETS;
    const $                 = ui.$;
    const applyModeVisuals  = ui.applyModeVisuals;
    const setC              = ui.setC;
    const setQ              = ui.setQ;
    const parseAndApplyHText = ui.parseAndApplyHText;

    // -----------------------------------------------------------------------
    // URL/hash state (B1) — shareable, bookmarkable, reload-restorable config.
    //
    // We serialize the user-meaningful inputs (mode, the h(w) text, the
    // normalization gauges w₀/c/α/q, aggressiveness, and the active tab) into a
    // versioned view-state envelope (@cas/interchange, app-namespaced "qd"), carried
    // in location.hash as "#vs=...". The h-text round-trips both poles AND the polynomial part
    // (refreshHText → formatH), so it alone captures the full quadrature data;
    // parseAndApplyHText rebuilds the structured grid from it on restore. We use
    // history.replaceState (not assignment to location.hash) so writing the URL
    // never pushes a back-button entry or re-navigates.
    // -----------------------------------------------------------------------
    function _activeTabId() {
      const el = document.querySelector('.tab-btn.active');
      return (el && el.dataset.tab) || 'qd';
    }

    let _writeUrlScheduled = false;
    function writeUrlState() {
      // Coalesce bursts (a slider drag fires many solves) into one history write
      // per frame.
      if (_writeUrlScheduled) return;
      _writeUrlScheduled = true;
      const raf = (typeof requestAnimationFrame === 'function')
        ? requestAnimationFrame
        : (fn) => setTimeout(() => fn(), 16);
      raf(() => {
        _writeUrlScheduled = false;
        try {
          // Collect the user-meaningful inputs into a plain state object, then encode via
          // @cas/interchange's shared versioned view-state codec (app-namespaced "qd").
          const s = { mode: state.mode };
          const hText = ($('#h-text') && $('#h-text').value || '').trim();
          if (hText) s.h = hText;
          if (state.w0Mode) s.w0m = state.w0Mode;
          if (state.w0Manual) s.w0 = state.w0Manual;
          if (state.c != null) s.c = state.c;
          if (state.alpha != null && state.alpha !== 1) s.a = state.alpha;
          if (state.q && state.q !== '0') s.q = state.q;
          if (state.aggressiveness) s.agg = state.aggressiveness;
          const tab = _activeTabId();
          if (tab && tab !== 'qd') s.tab = tab;
          const hash = encodeViewState('qd', s);   // "#vs=..."
          // Avoid redundant history churn when nothing changed.
          if (hash !== location.hash) {
            history.replaceState(null, '', location.pathname + location.search + hash);
          }
        } catch (e) { /* never let URL bookkeeping break the app */ }
      });
    }

    // Restore state from location.hash on load. Returns true if a hash was applied
    // (so the caller can skip the default-config solve). Sets mode + gauges FIRST,
    // then the h-text, then parses it (which schedules the solve), then the tab.
    function applyUrlState() {
      const env = decodeViewState(location.hash || '');
      if (!env || env.app !== 'qd') return false;
      const s = env.state;

      // 1. Mode (drives card visibility + which gauges matter). applyModeVisuals
      //    forces α back to 1 for non-PQD modes, so it must run BEFORE we set α.
      const mode = s.mode;
      if (mode && MODES[mode]) {
        state.mode = mode;
        applyModeVisuals();   // also syncs the compact domain-type control
      }
      // 2. Gauges. Values are coerced/validated defensively — a hand-crafted link is untrusted.
      if (s.a != null) {
        const a = +s.a;
        if (a > 0 && a !== 1) { state.alpha = a; const inp = $('#alpha-input'); if (inp) inp.value = String(a); }
      }
      if (s.c != null) { const c = +s.c; if (c > 0) setC(c); }
      if (s.w0m != null) {
        const m = String(s.w0m);
        if (m === 'auto' || m === 'manual') {
          state.w0Mode = m;
          const r = document.querySelector(`input[name="w0mode"][value="${m}"]`);
          if (r) r.checked = true;
          const wManual = $('#w0-manual');
          if (wManual) wManual.disabled = (m !== 'manual');
        }
      }
      if (s.w0 != null) {
        state.w0Manual = String(s.w0);
        const wManual = $('#w0-manual');
        if (wManual) wManual.value = state.w0Manual;
      }
      if (s.q != null) setQ(String(s.q));
      if (s.agg != null && PRESETS[String(s.agg)]) {
        state.aggressiveness = String(s.agg);
        const aggSel = $('#aggressiveness');
        if (aggSel) aggSel.value = state.aggressiveness;
      }
      // 3. h(w): set the text and parse it (rebuilds the pole grid + poly + solves).
      if (s.h != null) {
        const inp = $('#h-text');
        if (inp) { inp.value = String(s.h); parseAndApplyHText(); }
      }
      // 4. Active tab (deferred a tick so the QD solve kicks off first).
      const tab = s.tab;
      if (tab && tab !== 'qd') {
        const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
        if (btn) setTimeout(() => btn.click(), 0);
      }
      return true;
    }

    return { writeUrlState, applyUrlState };
  };
})(typeof window !== 'undefined' ? window : globalThis);
