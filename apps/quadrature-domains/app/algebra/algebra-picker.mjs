// algebra-picker.mjs -- the variable-picker widget (dropdown checklist) + its single-open-menu
// coordinator. Carved out of installAlgebra (algebra-ui.mjs) in refactor Phase 3 · D1d (seam 3) as a
// ctx-FREE factory. BEHAVIOR-PRESERVING: buildPicker's body and the _openMenu / _closeOpenMenu
// coordinator are the code that used to sit inline in the installAlgebra closure, verbatim. Pinned by
// vitest/algebra-picker.test.ts (runtime behaviour) + algebra-shortcuts-table.test.ts (coordinator source).
//
// A discoverable replacement for free-text variable entry: a button that opens a checklist of the
// available variables, toggling membership in `opts.selected`. One manager coordinates its pickers so
// only one menu is open at a time; the caller wires closeOpen() to a document click for outside-close.
//
// createPickerManager() → { build, closeOpen } — no ctx (DOM globals + the caller's opts only):
//   build(host, opts)  build a picker into `host`; opts = { label, selected:Set, getOptions:()=>string[],
//                       friendly?:(raw)=>string, onChange?:()=>void }. Returns { refresh } (relabels the button).
//   closeOpen()        close whichever menu is open (the outside-click / global close path).
export function createPickerManager() {
  let _openMenu = null;
  // Close whichever picker is open. Routed through one helper so every close path keeps the
  // button's aria-expanded honest — three call sites used to hide the menu directly, leaving
  // the button telling assistive tech it was still open.
  function _closeOpenMenu() {
    if (!_openMenu) return;
    _openMenu.classList.add('hidden');
    const b = _openMenu._pickerBtn;
    if (b) b.setAttribute('aria-expanded', 'false');
    _openMenu = null;
  }
  function buildPicker(host, opts) {
    if (!host) return;
    host.innerHTML = '';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'small algebra-picker-btn';
    const menu = document.createElement('div');
    menu.className = 'algebra-picker-menu hidden';
    host.appendChild(btn); host.appendChild(menu);
    const label = () => {
      const n = opts.selected.size;
      btn.textContent = (opts.label || 'pick') + (n ? ' (' + n + ') ▾' : ' ▾');
    };
    function render() {
      menu.innerHTML = '';
      const names = opts.getOptions() || [];
      if (!names.length) { const d = document.createElement('div'); d.className = 'hint'; d.textContent = 'no variables yet'; menu.appendChild(d); return; }
      names.forEach((raw) => {
        const row = document.createElement('label'); row.className = 'algebra-picker-row';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = raw; cb.checked = opts.selected.has(raw);
        cb.addEventListener('change', () => { if (cb.checked) opts.selected.add(raw); else opts.selected.delete(raw); label(); if (opts.onChange) opts.onChange(); });
        const span = document.createElement('span'); span.textContent = (opts.friendly ? opts.friendly(raw) : raw);
        row.appendChild(cb); row.appendChild(span); menu.appendChild(row);
      });
    }
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-haspopup', 'true');
    menu._pickerBtn = btn;
    const setOpen = (on) => { menu.classList.toggle('hidden', !on); btn.setAttribute('aria-expanded', on ? 'true' : 'false'); };
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const willOpen = menu.classList.contains('hidden');
      if (_openMenu && _openMenu !== menu) _closeOpenMenu();
      if (willOpen) {
        render(); setOpen(true); _openMenu = menu;
        // Land on the first variable rather than making the user Tab past the button
        // into a list that only just appeared.
        const first = menu.querySelector('input[type="checkbox"]');
        if (first) { try { first.focus(); } catch (e) { /* focus best-effort */ } }
      } else { setOpen(false); _openMenu = null; }
    });
    menu.addEventListener('click', (ev) => ev.stopPropagation());
    // Esc closes the checklist and hands focus back to the button that opened it — without
    // this the only way out was a click elsewhere, which for a keyboard user is no way out.
    menu.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      setOpen(false);
      if (_openMenu === menu) _openMenu = null;
      try { btn.focus(); } catch (e) { /* focus best-effort */ }
      ev.preventDefault(); ev.stopPropagation();
    });
    label();
    return { refresh: label };
  }

  return { build: buildPicker, closeOpen: _closeOpenMenu };
}
