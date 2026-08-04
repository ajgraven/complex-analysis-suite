// =============================================================================
// ui-copy-buttons.mjs -- QD_UI.installCopyLink() + QD_UI.installHTextCopy()
// factories (refactor Phase 4 · D2 lift). The two inverse-tab QoL copy buttons
// (HANDOFF #33), lifted VERBATIM from ui.mjs's `mountCopyLink` / `mountHTextCopyButton`
// IIFEs. Both use only runtime globals (window.QD / QD.QoL / document), so they take
// no uiCtx. (ui.mjs's `$(sel)` is exactly `document.querySelector(sel)` — inlined here.)
// =============================================================================
import { QD_UI } from './ui-registry.mjs';

// Copy-link affordance: surface the (already-maintained) URL-hash state as a
// one-click shareable link. Reuses QD.QoL.copyButton (clipboard + toast); the
// hash already encodes mode / h(w) / gauges / active tab via ui-url-state.js.
function installCopyLink() {
  const host = document.querySelector('#copy-link-host');
  if (!host || !(window.QD && QD.QoL && QD.QoL.copyButton)) return;
  const btn = QD.QoL.copyButton(() => location.href,
    { title: 'Copy a shareable link to this configuration' });
  btn.classList.remove('copy-btn');
  btn.classList.add('small');
  btn.textContent = '🔗 Copy link';
  host.appendChild(btn);
}

// QoL: copy button on the h(w) text input (HANDOFF #33).
function installHTextCopy() {
  if (!window.QD || !QD.QoL || !QD.QoL.copyButton) return;
  const parseBtn = document.getElementById('h-parse');
  if (!parseBtn) return;
  const copy = QD.QoL.copyButton(() => {
    const inp = document.getElementById('h-text');
    return inp ? inp.value : '';
  }, { title: 'Copy h(w) text' });
  copy.style.marginLeft = '6px';
  parseBtn.parentNode.insertBefore(copy, parseBtn.nextSibling);
}

QD_UI.installCopyLink = installCopyLink;
QD_UI.installHTextCopy = installHTextCopy;
