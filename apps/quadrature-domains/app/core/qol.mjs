// =============================================================================
// qol.js -- Shared quality-of-life primitives (HANDOFF #33).
//
// Three small DOM helpers, exposed on QD.QoL, used everywhere across the UI:
//
//   attachHelp(headerEl, htmlOrFn, opts)
//     Adds a "?" button to a card's <h2>. Click toggles a popover with the
//     text (string or () => string). At most one popover open across the
//     page. Click-outside + Esc closes.
//
//   attachHoverTooltip(canvasEl, formatter, opts)
//     Registers a throttled (rAF-coalesced) mousemove handler on canvasEl.
//     formatter(cssX, cssY) returns null (hide) or an HTML string.
//     A single page-level tooltip div is reused across canvases. Hides on
//     mouseleave / mouseout. Position auto-flips to stay in viewport.
//
//   copyButton(getText, opts)
//     Returns a small button element. Click → navigator.clipboard.writeText
//     + brief toast confirmation. Falls back gracefully if clipboard API
//     unavailable (selects and shows fallback hint).
//
// Plus:
//   registerShortcuts(scope, items)
//     Declares a tab's key bindings for the cheatsheet. `scope` is a tab id
//     (matching .tab-btn[data-tab]) or 'global'. Items are { key, desc, group? }.
//   openShortcutsOverlay(items) / closeShortcutsOverlay()
//     Page-level shortcut cheatsheet, anchored to the page (not a card). With no
//     argument it composes 'global' + the ACTIVE tab's registration, so each tab
//     documents its own bindings; an explicit list still overrides.
//   wireGlobalKeyboardShortcuts()
//     Esc → close all popovers/tooltips; '?' → toggle shortcuts overlay.
//
// No external dependencies. Safe to load before / after other QD modules.
// =============================================================================

// ESM (Phase 2 port) — twin of qol.js (classic stays frozen). QD.QoL DOM helpers.
import _QD from '../solvers/solver.mjs';

(function () {
  'use strict';

  const QD = _QD;
  const QoL = QD.QoL = {};

  // ---------------------------------------------------------------------------
  // Singletons
  // ---------------------------------------------------------------------------
  let _activePopover = null;          // currently-open help popover element
  let _tooltipEl     = null;          // shared hover-tooltip div
  let _shortcutsEl   = null;          // shortcuts overlay element
  let _shortcutsReturn = null;        // element focused before the overlay opened

  function _ensureTooltipEl() {
    if (_tooltipEl) return _tooltipEl;
    const d = document.createElement('div');
    d.className = 'hover-tooltip';
    d.style.display = 'none';
    d.setAttribute('role', 'tooltip');
    document.body.appendChild(d);
    _tooltipEl = d;
    return d;
  }

  // ---------------------------------------------------------------------------
  // attachHelp
  // ---------------------------------------------------------------------------
  function attachHelp(headerEl, htmlOrFn, opts) {
    if (!headerEl) return null;
    // Avoid double-attaching.
    if (headerEl.querySelector('.help-btn')) return headerEl.querySelector('.help-btn');
    opts = opts || {};
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'help-btn';
    btn.textContent = '?';
    btn.title = 'Show help for this section';
    btn.setAttribute('aria-label', 'Help');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _toggleHelpPopover(btn, htmlOrFn, opts);
    });
    headerEl.appendChild(btn);
    return btn;
  }

  function _toggleHelpPopover(anchorEl, htmlOrFn, opts) {
    if (_activePopover && _activePopover._anchor === anchorEl) {
      _closeActivePopover();
      return;
    }
    _closeActivePopover();
    const pop = document.createElement('div');
    pop.className = 'help-popover';
    pop.setAttribute('role', 'dialog');
    let html = '';
    try {
      html = (typeof htmlOrFn === 'function') ? htmlOrFn() : String(htmlOrFn || '');
    } catch (e) { html = '<em>(help text error)</em>'; }
    pop.innerHTML = html;
    pop._anchor = anchorEl;
    document.body.appendChild(pop);
    _positionPopoverNear(pop, anchorEl);
    _activePopover = pop;
    // Click outside closes.
    setTimeout(() => {
      document.addEventListener('click', _maybeCloseOnOutsideClick, true);
    }, 0);
  }

  function _maybeCloseOnOutsideClick(e) {
    if (!_activePopover) return;
    if (_activePopover.contains(e.target)) return;
    if (_activePopover._anchor === e.target) return;
    _closeActivePopover();
  }

  function _closeActivePopover() {
    if (!_activePopover) return;
    _activePopover.remove();
    _activePopover = null;
    document.removeEventListener('click', _maybeCloseOnOutsideClick, true);
  }

  function _positionPopoverNear(pop, anchorEl) {
    const ar = anchorEl.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    // Default: just below the button, left edge aligned with button.
    let left = ar.left;
    let top  = ar.bottom + 6;
    // Flip horizontally if overflow.
    if (left + pr.width > vw - 8) left = Math.max(8, vw - pr.width - 8);
    // Flip vertically if overflow.
    if (top + pr.height > vh - 8) top = Math.max(8, ar.top - pr.height - 6);
    pop.style.left = (left + window.scrollX) + 'px';
    pop.style.top  = (top  + window.scrollY) + 'px';
  }

  // ---------------------------------------------------------------------------
  // attachHoverTooltip
  // ---------------------------------------------------------------------------
  function attachHoverTooltip(canvasEl, formatter, opts) {
    if (!canvasEl || typeof formatter !== 'function') return;
    opts = opts || {};
    let pendingFrame = 0;
    let lastEvt = null;

    function onMove(e) {
      lastEvt = e;
      if (pendingFrame) return;
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0;
        if (!lastEvt) return;
        const rect = canvasEl.getBoundingClientRect();
        const x = lastEvt.clientX - rect.left;
        const y = lastEvt.clientY - rect.top;
        let result;
        try { result = formatter(x, y, canvasEl); }
        catch (err) { result = null; }
        if (!result) { _hideTooltip(); return; }
        const tip = _ensureTooltipEl();
        tip.innerHTML = (typeof result === 'string') ? result : (result.html || '');
        tip.style.display = 'block';
        _positionTooltipNear(tip, lastEvt.clientX, lastEvt.clientY);
      });
    }

    function onLeave() {
      _hideTooltip();
    }

    canvasEl.addEventListener('mousemove', onMove);
    canvasEl.addEventListener('mouseleave', onLeave);
    canvasEl.addEventListener('mouseout', onLeave);
    // Return a detach handle for completeness.
    return function detach() {
      canvasEl.removeEventListener('mousemove', onMove);
      canvasEl.removeEventListener('mouseleave', onLeave);
      canvasEl.removeEventListener('mouseout', onLeave);
    };
  }

  function _hideTooltip() {
    if (_tooltipEl) _tooltipEl.style.display = 'none';
  }

  function _positionTooltipNear(tip, cx, cy) {
    const r = tip.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = cx + 14;
    let top  = cy + 14;
    if (left + r.width  > vw - 8) left = Math.max(8, cx - 14 - r.width);
    if (top  + r.height > vh - 8) top  = Math.max(8, cy - 14 - r.height);
    tip.style.left = (left + window.scrollX) + 'px';
    tip.style.top  = (top  + window.scrollY) + 'px';
  }

  // ---------------------------------------------------------------------------
  // copyButton
  // ---------------------------------------------------------------------------
  function copyButton(getText, opts) {
    opts = opts || {};
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.title = opts.title || 'Copy to clipboard';
    btn.setAttribute('aria-label', btn.title);
    btn.textContent = opts.label || '⧉';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      let text;
      try { text = (typeof getText === 'function') ? getText() : String(getText || ''); }
      catch (err) { text = ''; }
      if (!text) { _showToast('Nothing to copy', btn); return; }
      let ok = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          ok = true;
        }
      } catch (err) { /* fall through to fallback */ }
      if (!ok) {
        // Fallback for non-secure contexts: use a temporary textarea.
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          ok = document.execCommand && document.execCommand('copy');
          document.body.removeChild(ta);
        } catch (err) { ok = false; }
      }
      _showToast(ok ? 'Copied' : 'Copy failed', btn);
    });
    return btn;
  }

  // Transient toast. The second arg is either an anchor Element (positions the
  // toast just below it — used by the copy buttons) OR an options object
  // { anchor?, kind?: 'error', duration?: ms }. With no anchor the toast floats
  // at the bottom-center of the viewport (used by QoL.toast for global notices).
  function _showToast(msg, opts) {
    opts = opts || {};
    const isEl = opts.nodeType === 1;          // back-compat: bare element = anchor
    const anchor = isEl ? opts : opts.anchor;
    const kind = isEl ? null : opts.kind;
    // 750ms is right for a "copied ✓" confirmation and far too short for a failure: the Algebra
    // tab alone raises ~50 error toasts, none passing a duration, several of them multi-sentence
    // warnings (e.g. that an exported script will produce a WRONG quadrature-domain count). Give
    // errors long enough to read, and a click to dismiss so a long one is never in the way.
    const ERROR_MS = 8000;
    // An optional { label, onClick } action (e.g. Undo). A text-only toast could not host a button, so a
    // destructive act's recovery affordance was invisible exactly when the user needed it — right after a
    // delete, looking at the toast rather than the canvas toolbar. An action toast also stays longer, so
    // it can be reached for. (Ignored for the anchored copy-button form.)
    const action = (!isEl && opts.action && typeof opts.action.onClick === 'function' && opts.action.label) ? opts.action : null;
    const ACTION_MS = 6000;
    const duration = (isEl ? 0 : opts.duration) || (kind === 'error' ? ERROR_MS : action ? ACTION_MS : 750);
    const t = document.createElement('div');
    t.className = 'copy-toast' + (kind === 'error' ? ' toast-error' : '') + (action ? ' toast-action' : '');
    // Announced to assistive tech: assertive for a failure, polite for a confirmation. Without
    // this a screen-reader user gets no signal at all that an operation failed.
    t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    let gone = false;
    const dismiss = () => {
      if (gone) return; gone = true;
      t.classList.add('fade');
      setTimeout(() => t.remove(), 350);
    };
    if (action) {
      const span = document.createElement('span'); span.textContent = msg; t.appendChild(span);
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'copy-toast-action'; btn.textContent = action.label;
      btn.addEventListener('click', (e) => { e.stopPropagation(); try { action.onClick(); } finally { dismiss(); } });
      t.appendChild(btn);
    } else {
      t.textContent = msg;
    }
    if (kind === 'error') {
      t.title = 'Click to dismiss';
      t.style.cursor = 'pointer';
      t.addEventListener('click', dismiss);
    }
    document.body.appendChild(t);
    if (anchor && typeof anchor.getBoundingClientRect === 'function') {
      const r = anchor.getBoundingClientRect();
      t.style.left = (r.left + window.scrollX) + 'px';
      t.style.top  = (r.bottom + 6 + window.scrollY) + 'px';
    } else {
      t.classList.add('toast-floating');
    }
    setTimeout(dismiss, duration);
  }

  // Global last-resort error surface. Uncaught main-thread exceptions and
  // unhandled promise rejections otherwise vanish silently into the console;
  // this shows a brief toast so the user notices something went wrong (full
  // detail still goes to the console). De-duped so an error storm can't spam the
  // screen. The solve pipeline catches its own errors (ui-solve.js); this is the
  // safety net for everything else (rendering, other tabs, async callbacks).
  function _installGlobalErrorHandlers(win) {
    // Guard addEventListener too: a minimal stub global (e.g. the qol.js load
    // test's vm context) may set `window` without it — don't throw on load.
    if (!win || typeof win.addEventListener !== 'function' || win.__qdErrHandlers) return;
    win.__qdErrHandlers = true;
    let lastKey = '', lastAt = 0;
    function surface(label, detail) {
      const key = label + '|' + detail, now = Date.now();
      if (key === lastKey && now - lastAt < 4000) return;   // de-dupe a storm
      lastKey = key; lastAt = now;
      try { console.error('[qd] ' + label + (detail ? ': ' + detail : '')); } catch (e) {}
      try { _showToast('⚠ ' + label + ' — see console for details', { kind: 'error', duration: 6000 }); } catch (e) {}
    }
    win.addEventListener('error', (ev) => {
      // Ignore resource-load failures (img/script 404s carry no .error/.message
      // and are usually non-fatal); surface only real script exceptions.
      const msg = ev && (ev.message || (ev.error && ev.error.message));
      if (msg) surface('Unexpected error', msg);
    });
    win.addEventListener('unhandledrejection', (ev) => {
      const r = ev && ev.reason;
      const msg = r && (r.message || (typeof r === 'string' ? r : ''));
      surface('Unhandled error', msg || 'a background task failed');
    });
  }

  // ---------------------------------------------------------------------------
  // Shortcut registry + overlay
  // ---------------------------------------------------------------------------
  // openShortcutsOverlay has always accepted a custom list, but no caller ever passed
  // one — so `?` showed the same three generic lines on every tab while the tabs quietly
  // grew bindings of their own (the Algebra workspace alone has a dozen). A tab registers
  // its list once via registerShortcuts(tabId, items); the overlay then composes
  // 'global' + whichever tab is active *at the moment the key is pressed*, so the
  // cheatsheet always describes the surface actually in front of you.
  //
  // Item shape: { key, desc, group? }. `group` is an optional heading; ungrouped items
  // render first, under no heading.
  const _shortcutScopes = Object.create(null);
  function registerShortcuts(scope, items) {
    _shortcutScopes[scope || 'global'] = (items || []).slice();
  }
  function _activeTabId() {
    try {
      const b = document.querySelector('.tab-btn.active');
      return (b && b.dataset && b.dataset.tab) || 'qd';   // QD is the default tab
    } catch (e) { return 'qd'; }
  }
  function _composeShortcuts() {
    const global = _shortcutScopes.global || _defaultShortcuts();
    const tab = _shortcutScopes[_activeTabId()] || [];
    return global.concat(tab);
  }
  // Rows are built as DOM nodes with textContent rather than interpolated into an HTML
  // string: descriptions carry math ("zoom < 0.8", "V(I) = ⋃ₖ") and a bare `<` in an
  // innerHTML template silently eats the rest of the row.
  function openShortcutsOverlay(items) {
    closeShortcutsOverlay();
    const list = items || _composeShortcuts();
    const wrap = document.createElement('div');
    wrap.className = 'shortcuts-overlay';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'Keyboard shortcuts');
    wrap.tabIndex = -1;

    const pop = document.createElement('div'); pop.className = 'help-popover';
    const head = document.createElement('div'); head.className = 'shortcuts-head';
    const h3 = document.createElement('h3'); h3.textContent = 'Keyboard shortcuts';
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'shortcuts-close'; x.textContent = '×';
    x.title = 'Close (Esc)'; x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', closeShortcutsOverlay);
    head.appendChild(h3); head.appendChild(x); pop.appendChild(head);

    // Preserve registration order for both the groups and the rows inside them.
    const groups = []; const seen = Object.create(null);
    list.forEach((it) => {
      const g = (it && it.group) || '';
      if (!(g in seen)) { seen[g] = { name: g, rows: [] }; groups.push(seen[g]); }
      seen[g].rows.push(it);
    });
    groups.forEach((g) => {
      if (g.name) {
        const cap = document.createElement('div');
        cap.className = 'shortcuts-group'; cap.textContent = g.name;
        pop.appendChild(cap);
      }
      const table = document.createElement('table'); table.className = 'shortcuts-table';
      const tbody = document.createElement('tbody');
      g.rows.forEach((it) => {
        const tr = document.createElement('tr');
        const kd = document.createElement('td'); const kbd = document.createElement('kbd');
        kbd.textContent = String((it && it.key) || ''); kd.appendChild(kbd);
        const dd = document.createElement('td'); dd.textContent = String((it && it.desc) || '');
        tr.appendChild(kd); tr.appendChild(dd); tbody.appendChild(tr);
      });
      table.appendChild(tbody); pop.appendChild(table);
    });

    const hint = document.createElement('div');
    hint.className = 'hint'; hint.style.marginTop = '6px';
    hint.textContent = 'Press Esc or ? to dismiss.';
    pop.appendChild(hint);
    wrap.appendChild(pop);
    document.body.appendChild(wrap);
    _shortcutsEl = wrap;

    // Return focus where it was: `?` is often pressed mid-task from a focused card, and
    // dropping focus to <body> on dismiss would restart tabbing from the top of the page.
    _shortcutsReturn = (document.activeElement && document.activeElement !== document.body)
      ? document.activeElement : null;
    try { wrap.focus(); } catch (e) {}
    // Trap Tab inside the dialog — it is modal, so tabbing out to the page behind it
    // would leave focus somewhere the user cannot see.
    wrap.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Tab') return;
      const f = wrap.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!f.length) { ev.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && (document.activeElement === first || document.activeElement === wrap)) {
        last.focus(); ev.preventDefault();
      } else if (!ev.shiftKey && document.activeElement === last) {
        first.focus(); ev.preventDefault();
      }
    });
  }
  function closeShortcutsOverlay() {
    if (!_shortcutsEl) return;
    _shortcutsEl.remove(); _shortcutsEl = null;
    const back = _shortcutsReturn; _shortcutsReturn = null;
    if (back && typeof back.focus === 'function' && back.isConnected !== false) {
      try { back.focus(); } catch (e) {}
    }
  }
  // Genuinely global keys only. A Param-slice binding used to sit here, so every tab claimed
  // it — that one now registers under its own scope (param-slice-ui).
  function _defaultShortcuts() {
    return [
      { key: '?',   desc: 'Show / hide this shortcut list' },
      { key: 'Esc', desc: 'Close help popovers and tooltips' },
    ];
  }

  function wireGlobalKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        let handled = false;
        if (_activePopover) { _closeActivePopover(); handled = true; }
        if (_shortcutsEl)   { closeShortcutsOverlay(); handled = true; }
        if (_tooltipEl && _tooltipEl.style.display !== 'none') {
          _hideTooltip(); handled = true;
        }
        if (handled) e.preventDefault();
        return;
      }
      if (e.key === '?' && !_isTypingTarget(e.target)) {
        if (_shortcutsEl) closeShortcutsOverlay();
        else              openShortcutsOverlay();
        e.preventDefault();
      }
    });
  }

  function _isTypingTarget(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  // ---------------------------------------------------------------------------
  // Exports
  // ---------------------------------------------------------------------------
  // Shared HTML escaper — consolidated from previously-duplicated copies
  // in ui.js and param-slice-ui.js (HANDOFF #35). Escapes the full
  // attribute-safe set so it's correct in both text-content and
  // attribute-value positions.
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  QoL.attachHelp                = attachHelp;
  QoL.escapeHTML                = escapeHTML;
  // Reflect a segmented control's selection to assistive tech: the visual cue is a CSS
  // .active class only, so pair every toggle with aria-pressed so screen-reader users can
  // tell which weight / domain / view / mode is current (qd-seg-aria-01). Use on any
  // role="group" segmented button set.
  QoL.setSegActive = (btn, on) => {
    btn.classList.toggle('active', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  };
  QoL.attachHoverTooltip        = attachHoverTooltip;
  QoL.copyButton                = copyButton;
  QoL.toast                     = function (msg, opts) { _showToast(msg, opts); };
  QoL.registerShortcuts         = registerShortcuts;
  QoL.openShortcutsOverlay      = openShortcutsOverlay;
  QoL.closeShortcutsOverlay     = closeShortcutsOverlay;
  QoL.wireGlobalKeyboardShortcuts = wireGlobalKeyboardShortcuts;

  // Auto-wire on DOM ready unless the loader explicitly opts out.
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wireGlobalKeyboardShortcuts);
    } else {
      wireGlobalKeyboardShortcuts();
    }
    if (typeof window !== 'undefined') _installGlobalErrorHandlers(window);
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = QoL;
})();
