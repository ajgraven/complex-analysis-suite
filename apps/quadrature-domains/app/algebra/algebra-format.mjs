// algebra-format.mjs -- the exact ℚ(i) value formatter, carved out of installAlgebra (algebra-ui.mjs)
// — refactor D, installAlgebra carve-out 3.
//
// `exactValueStr(re, im)` renders a complex value as an exact rational string (0.2 → "1/5",
// −0.5i → "−1/2i", 0.5+0.25i → "1/2 + 1/4i") for the "Set values" inline preview + toast. `fmtRat` is its
// per-component helper: it runs the float through the store's own continued-fraction rationalizer
// (QD.QDEquations.ratApprox) so the preview matches what the store will actually substitute. Both are PURE
// (no DOM / state / store mutation) — only fmtRat reads the shared QDEquations namespace, which is a data
// source, not mutable UI state; a try/catch keeps a bad/unavailable rationalizer from throwing into the UI.
//
// The QDEquations namespace registers itself on the QD singleton as an import side-effect (it has no direct
// `ratApprox` export), so we import it here to guarantee ratApprox is present when fmtRat runs — the same
// namespace installAlgebra reached via `QE = QD.QDEquations`. Carved VERBATIM (behavior-preserving; pinned by
// vitest/algebra-exact-format.test.ts).
import _QD from '../solver.mjs';
import '../qd-equations.mjs';   // side-effect: registers QD.QDEquations (incl. ratApprox) on the singleton

// Exact ℚ(i) string for one real component (same continued-fraction rationalizer the store uses),
// so the user sees 0.2 → 1/5 before applying. Falls back to the plain float if ratApprox is unavailable.
export function fmtRat(x) {
  try { const r = _QD.QDEquations.ratApprox(x || 0); return String(r[1]) === '1' ? String(r[0]) : String(r[0]) + '/' + String(r[1]); }
  catch (e) { return String(x || 0); }
}

// Exact ℚ(i) string for a full complex value: re-only, im-only, or re ± im·i (with the minus sign U+2212).
export function exactValueStr(re, im) {
  re = re || 0; im = im || 0;
  if (!im) return fmtRat(re);
  const iAbs = fmtRat(Math.abs(im)) + 'i';
  if (!re) return (im < 0 ? '−' : '') + iAbs;
  return fmtRat(re) + (im < 0 ? ' − ' : ' + ') + iAbs;
}
