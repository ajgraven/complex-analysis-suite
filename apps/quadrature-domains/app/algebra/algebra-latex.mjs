// algebra-latex.mjs -- pure math→LaTeX formatters carved out of installAlgebra (algebra-ui.mjs)
// — refactor D, installAlgebra carve-out 7.
//
// `_pronyLatex` renders the Prony polynomial P(z) = Σ cₖ zᵏ = 0 (from ascending {re,im} coefficients) as a
// LaTeX string for the "Shape from moments" result card: descending powers, coefficients rounded to 1e-6,
// near-zero terms dropped, a unit coefficient on a z-power elided (`z` not `1z`), and real vs complex terms
// formatted differently (a complex coefficient is parenthesised, `(a±bi)zᵏ`). PURE — reads only the coeffs
// argument + Math/String, no DOM / state / store. Carved VERBATIM; behavior-preserving, pinned by
// vitest/algebra-prony-latex.test.ts. (This module is the intended home for the other pure LaTeX builders
// the installAlgebra census flagged — buildHForm / latexOf / reimSafeLatex — as they are carved out.)
//
// `buildHForm` (carve-out 9) renders the quadrature data h(w) as LaTeX. It reads QD.RiemannLatex — which
// registers on the QD singleton as an import side-effect (no direct export) — so we import riemann-latex.mjs
// here to guarantee it's present, the same pattern algebra-format.mjs uses for QD.QDEquations.
import _QD from '../solver.mjs';
import '../riemann-latex.mjs';   // side-effect: registers QD.RiemannLatex (incl. katexCmpxParen) on the singleton

// LaTeX of the (ascending {re,im}) Prony polynomial P(z) = Σ c_k z^k = 0.
export function _pronyLatex(coeffs) {
  let out = '';
  for (let k = coeffs.length - 1; k >= 0; k--) {
    const c = coeffs[k];
    const re = Math.round(c.re * 1e6) / 1e6, im = Math.round(c.im * 1e6) / 1e6;
    if (Math.abs(re) < 1e-9 && Math.abs(im) < 1e-9) continue;
    const zp = k === 0 ? '' : (k === 1 ? 'z' : 'z^{' + k + '}');
    let sign, mag;
    if (Math.abs(im) < 1e-8) {
      sign = re < 0 ? '-' : '+';
      const a = Math.abs(re);
      mag = (Math.abs(a - 1) < 1e-8 && zp) ? '' : String(a);
    } else {
      sign = '+';
      mag = '(' + re + (im < 0 ? '-' : '+') + Math.abs(im) + 'i)';
    }
    const term = (mag + zp) || '0';
    out += out === '' ? (sign === '-' ? '-' + term : term) : ' ' + sign + ' ' + term;
  }
  return (out || '0') + ' = 0';
}

// LaTeX for the quadrature data h(w) = Σⱼ Σ_{s≥1} C_{j,s}/(w − aⱼ)^s — symbolic names (a_{j}, C_{j,s}), or
// the pole positions / principal-part coefficients substituted as values (numeric=true, via katexCmpxParen).
// (carve-out 9; carved verbatim from installAlgebra, with QD → the imported _QD singleton.)
export function buildHForm(hData, numeric) {
  const RL = _QD.RiemannLatex;
  const terms = [];
  (hData.poles || []).forEach((pole, j) => {
    const aSym = numeric ? RL.katexCmpxParen(pole.a) : 'a_{' + (j + 1) + '}';
    (pole.principal || []).forEach((C, s) => {
      const power = s + 1;
      const num = numeric ? RL.katexCmpxParen(C) : 'C_{' + (j + 1) + ',' + power + '}';
      const den = power === 1 ? '(w - ' + aSym + ')' : '(w - ' + aSym + ')^{' + power + '}';
      terms.push('\\dfrac{' + num + '}{' + den + '}');
    });
  });
  return 'h(w) \\;=\\; ' + (terms.length ? terms.join(' + ') : '0');
}
