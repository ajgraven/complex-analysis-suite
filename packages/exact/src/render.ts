// String rendering for exact values — shared coefficient formatting so every consumer's polynomial output
// (the correspondence curve C(w, z̄), a Gleason polynomial G_n(c), a dynatomic Φ_n) reads consistently.
import type { Frac, Gauss } from "./gaussian.js";
import type { QiPoly } from "./qiPoly.js";

/**
 * Render a Gaussian rational as a bare magnitude string (no leading sign) plus its sign — the atom every
 * polynomial renderer assembles terms from. `isUnit` marks ±1 (real), so a coefficient of 1 in front of a
 * variable can be dropped.
 */
export function renderGaussMag(g: Gauss): { sign: 1 | -1; mag: string; isUnit: boolean } {
  const fracStr = (f: Frac): string => (f.d === 1n ? `${f.n < 0n ? -f.n : f.n}` : `${f.n < 0n ? -f.n : f.n}/${f.d}`);
  if (g.im.isZero()) {
    const sign = g.re.n < 0n ? -1 : 1;
    return { sign, mag: fracStr(g.re), isUnit: g.re.n === 1n || g.re.n === -1n ? g.re.d === 1n : false };
  }
  if (g.re.isZero()) {
    const sign = g.im.n < 0n ? -1 : 1;
    const m = fracStr(g.im);
    return { sign, mag: m === "1" ? "i" : `${m}i`, isUnit: false };
  }
  // Genuinely complex a+bi: emit as a parenthesized group with a leading '+'.
  const reS = g.re.d === 1n ? `${g.re.n}` : `${g.re.n}/${g.re.d}`;
  const imMag = g.im.n < 0n ? -g.im.n : g.im.n;
  const imS = `${g.im.n < 0n ? "-" : "+"} ${g.im.d === 1n ? `${imMag}` : `${imMag}/${g.im.d}`}i`;
  return { sign: 1, mag: `(${reS} ${imS})`, isUnit: false };
}

/**
 * Render a single-variable polynomial Σ gₖ·varᵏ as ASCII (e.g. a cusp locus in z̄ → "z̄^4 + 8 z̄", or a
 * Gleason polynomial in c → "c^3 + 2 c^2 + c + 1"). Shares the coefficient formatting above.
 */
export function renderQiPolyText(p: QiPoly, varSym: string): string {
  const terms: { g: Gauss; k: number }[] = [];
  for (let k = 0; k < p.coeffs.length; k++) {
    const g = p.coeff(k);
    if (!g.isZero()) terms.push({ g, k });
  }
  terms.sort((s, t) => t.k - s.k);
  if (terms.length === 0) return "0";
  let out = "";
  for (let idx = 0; idx < terms.length; idx++) {
    const { g, k } = terms[idx];
    const { sign, mag, isUnit } = renderGaussMag(g);
    const vs = k === 0 ? "" : k === 1 ? varSym : `${varSym}^${k}`;
    const showMag = !(isUnit && vs.length > 0);
    const body = !showMag ? vs : vs.length === 0 ? mag : `${mag} ${vs}`;
    if (idx === 0) out += sign < 0 ? `- ${body}` : body;
    else out += sign < 0 ? ` - ${body}` : ` + ${body}`;
  }
  return out;
}
