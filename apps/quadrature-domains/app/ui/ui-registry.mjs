// =============================================================================
// ui-registry.mjs -- The QD_UI namespace (UI-side counterpart to the QD solver
// namespace). The extracted UI factory modules attach their `installX` factories
// here; ui.js imports it and calls them. A single shared object imported across
// the UI graph — the ESM replacement for the classic bare `window.QD_UI` global.
//
// Also mirrored onto window.QD_UI in the browser so the value is identical whether
// a module reaches it via this import or via `window.QD_UI` (belt-and-suspenders
// during the transition; harmless once every reader imports it).
// =============================================================================
const QD_UI = (typeof window !== 'undefined')
  ? (window.QD_UI = window.QD_UI || {})
  : {};

export { QD_UI };
export default QD_UI;
