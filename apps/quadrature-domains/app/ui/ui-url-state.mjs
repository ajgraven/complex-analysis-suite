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

// ESM (Phase 2 port). QD_UI factory module.
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
    // The QD tab ids a share link may switch to (index.html tab-bar); 'qd' is the default and needs
    // no switch. Whitelisted because applyUrlState interpolates the id into a querySelector — an
    // untrusted value would otherwise throw a SyntaxError and abort init.
    const SWITCHABLE_TABS = new Set(['schwarz', 'param-slice', 'algebra']);
    // Figure-key validation for a restored (untrusted) link. Positive-number and
    // enum keys can't be told from a null default by type alone, so they're
    // listed; everything else with a string value is validated as a #hex colour.
    const FIG_NUM_KEYS = new Set(['boundaryWidth', 'nodeSize', 'labelSize']);
    const FIG_ENUMS = { nodeShape: ['circle', 'square', 'diamond'] };
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

          // Figure & export settings — serialize only the DIFF from the defaults
          // (ui.figureDefaults, exposed by ui-figure-export) so a default-look
          // link stays short. Absent (a trimmed harness) → skip.
          const fig = state.figure, figDefaults = ui.figureDefaults;
          if (fig && figDefaults) {
            const d = {};
            for (const k of Object.keys(figDefaults)) {
              const v = fig[k];
              if (v !== undefined && v !== null && v !== figDefaults[k]) d[k] = v;
            }
            if (Object.keys(d).length) s.fig = d;
          }
          // Plot viewport (pan/zoom) — serialized only when framed off the default
          // {0,0,100}, so a plain link carries no view. Rounded to keep it short.
          const plot = ui.plot;
          if (plot && plot.view) {
            const v = plot.view;
            if (!(v.cx === 0 && v.cy === 0 && v.scale === 100)) {
              const r6 = (x) => Math.round(x * 1e6) / 1e6;
              s.view = { cx: r6(v.cx), cy: r6(v.cy), scale: r6(v.scale) };
            }
          }

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
      // 4. Active tab (deferred a tick so the QD solve kicks off first). Only whitelisted ids reach
      //    the querySelector below (SWITCHABLE_TABS) — a crafted value can't inject a bad selector.
      const tab = s.tab;
      if (tab && SWITCHABLE_TABS.has(String(tab))) {
        const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
        if (btn) setTimeout(() => btn.click(), 0);
      }

      // 5. Figure & export settings — overlay the serialized diff onto the current
      //    (default) state.figure with per-key validation (a crafted link is
      //    untrusted: booleans coerced, colours must match #rgb/#rrggbb, width a
      //    positive number, unknown keys dropped), then re-sync the card controls.
      if (s.fig && typeof s.fig === 'object' && state.figure && ui.figureDefaults) {
        const fig = state.figure, defs = ui.figureDefaults;
        for (const k of Object.keys(s.fig)) {
          if (!(k in defs)) continue;
          const dv = defs[k], val = s.fig[k];
          if (typeof dv === 'boolean') fig[k] = !!val;
          else if (FIG_NUM_KEYS.has(k)) { const w = +val; if (isFinite(w) && w > 0) fig[k] = w; }
          else if (FIG_ENUMS[k]) { if (FIG_ENUMS[k].indexOf(val) >= 0) fig[k] = val; }
          else if (typeof val === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(val)) fig[k] = val;
        }
        if (typeof ui.figureReflect === 'function') ui.figureReflect();
      }
      // 6. Plot viewport — restore pan/zoom, validated + clamped exactly like the
      //    live wheel-zoom ([1e-3, 1e7]). A solve does not re-fit (state.autoFit is
      //    false by default), so the restored frame survives the restore solve.
      if (s.view && typeof s.view === 'object' && ui.plot) {
        const cx = +s.view.cx, cy = +s.view.cy, scale = +s.view.scale;
        if (isFinite(cx) && isFinite(cy) && isFinite(scale) && scale > 0) {
          ui.plot.view = { cx, cy, scale: Math.max(1e-3, Math.min(1e7, scale)) };
          if (typeof ui.plot.render === 'function') ui.plot.render();
        }
      }
      return true;
    }

    return { writeUrlState, applyUrlState };
  };
})(typeof window !== 'undefined' ? window : globalThis);
