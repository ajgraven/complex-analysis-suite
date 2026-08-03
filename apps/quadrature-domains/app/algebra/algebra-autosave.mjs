// algebra-autosave.mjs -- the session-autosave core: a debounced localStorage mirror of the algebra
// derivation, so a reload / crash / stray Ctrl+W (QD is a PWA — a service-worker update is itself a
// routine reload) does not destroy an in-memory derivation with no warning and no recovery. Carved out
// of installAlgebra (algebra-ui.mjs) in refactor Phase 3 · D1d (seam 4) as a ctx-injected factory.
// BEHAVIOR-PRESERVING: the write / schedule / read bodies are the code that used to sit inline in the
// installAlgebra closure, verbatim. Pinned by vitest/algebra-autosave.test.ts, plus the results-drawer
// net's "results are session-scoped, not autosaved" cross-check, which follows `function _writeAutosave`
// to this module.
//
// exportDAG()/importDAG() already round-trip a faithful session, so autosave is just a debounce around
// them. localStorage rather than IndexedDB because it is synchronous — the beforeunload flush is then
// reliable. The restore-offer UI (offerRestore) stays in installAlgebra and calls read() / clear().
//
// createAutosaver({ store, toast }) → { schedule, read, clear, flush, isBlocked }:
//   schedule()   debounce a write — call after every mutation.
//   read()       the parsed saved session ({ at, nodes, columns, dag }) or null.
//   clear()      drop the saved session (the restore-offer's Discard).
//   flush()      commit any pending write NOW (the beforeunload path).
//   isBlocked()  true if the last save could not be taken (quota / too-large / disabled storage). The
//                beforeunload guard warns only then — otherwise the reload is recoverable and a prompt is noise.
export function createAutosaver(ctx) {
  const store = ctx.store;
  const toast = ctx.toast;

  const AUTOSAVE_KEY = 'qd-algebra-autosave-v1';
  const AUTOSAVE_MAX = 2000000;      // ~2MB; past this we stop rather than thrash the quota
  const AUTOSAVE_DEBOUNCE = 800;
  let _saveTimer = null, _saveBlocked = false;
  function _writeAutosave() {
    _saveTimer = null;
    try {
      if (!store.size) { localStorage.removeItem(AUTOSAVE_KEY); _saveBlocked = false; return; }
      const payload = JSON.stringify({ at: Date.now(), nodes: store.size, columns: store.maxColumn() + 1, dag: store.exportDAG() });
      if (payload.length > AUTOSAVE_MAX) {
        // Say so ONCE: silently not saving is exactly the failure this feature exists to prevent.
        if (!_saveBlocked) { _saveBlocked = true; toast('This derivation is too large to autosave — use Download DAG (JSON) to keep it.', { kind: 'error' }); }
        return;
      }
      localStorage.setItem(AUTOSAVE_KEY, payload);
      _saveBlocked = false;
    } catch (e) {
      // Private mode / quota / disabled storage. Never break the workspace over a save, but do
      // remember it failed so the beforeunload guard below still warns.
      _saveBlocked = true;
    }
  }
  function schedule() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_writeAutosave, AUTOSAVE_DEBOUNCE);
  }
  function read() {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY); if (!raw) return null;
      const p = JSON.parse(raw);
      return (p && p.dag) ? p : null;
    } catch (e) { return null; }
  }
  // The restore-offer's Discard: drop the saved session. removeItem only (matches the inline call it
  // replaced) — _saveBlocked is left as-is.
  function clear() {
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) { /* nothing to clear */ }
  }
  // Commit a pending save immediately (beforeunload). Only writes if a debounced save is armed.
  function flush() {
    if (_saveTimer) { clearTimeout(_saveTimer); _writeAutosave(); }
  }
  function isBlocked() { return _saveBlocked; }

  return { schedule, read, clear, flush, isBlocked };
}
