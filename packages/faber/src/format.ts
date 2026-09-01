// Human-readable expression for a Faber polynomial (descending powers), e.g. F₂ → "ζ² − 2". Exponents
// render as Unicode superscripts via @cas/core's `superscript`. Ported from the QD app's
// faber-analysis.mjs (formatFaberPoly).
import { Complex, superscript } from "@cas/core";
import type { Cx } from "@cas/core";

const C = Complex;

export interface FormatFaberOptions {
  /** Variable symbol, default "ζ". */
  varSym?: string;
  /** Significant figures, default 4. */
  digits?: number;
  /** Snap-to-zero / snap-to-integer tolerance, default 1e-9. */
  tol?: number;
  /**
   * How to render a power's exponent `k` (k ≥ 2). Defaults to Unicode superscripts (`ζ²`); a consumer
   * that typesets the result with real `<sup>` markup can pass e.g. `(k) => \`^{${k}}\``.
   */
  sup?: (k: number) => string;
  /**
   * Cap the number of (highest-degree) terms shown; when the polynomial has more non-zero terms than
   * this, the rest are elided with a trailing `+ …`. Default: unlimited. Keeps a high-degree image (e.g.
   * F₄₀, 40 terms) from overflowing a caption — the value is unchanged, only its printed form abbreviates.
   */
  maxTerms?: number;
}

export function formatFaberPoly(Fn: readonly Cx[], opts: FormatFaberOptions = {}): string {
  const v = opts.varSym || "ζ";
  const digits = opts.digits != null ? opts.digits : 4;
  const tol = opts.tol != null ? opts.tol : 1e-9;
  if (!Fn || !Fn.length) return "0";

  const sup = opts.sup ?? ((k: number): string => superscript(k));

  // Collect the non-zero terms (descending powers) first, so a `maxTerms` cut can tell whether anything
  // was actually elided (and only then append the `+ …`).
  const terms: { sign: string; body: string }[] = [];
  for (let k = Fn.length - 1; k >= 0; k--) {
    const co = Fn[k] || { re: 0, im: 0 };
    if (Math.hypot(co.re, co.im) < tol) continue;
    const powStr = k === 0 ? "" : k === 1 ? v : v + sup(k);
    const realOnly = Math.abs(co.im) < tol;
    if (realOnly) {
      let r = co.re;
      const rr = Math.round(r);
      if (Math.abs(r - rr) < tol) r = rr;
      const sign = r < 0 ? "−" : "+";
      const aval = Math.abs(r);
      const body = powStr && Math.abs(aval - 1) < tol ? powStr : Number(aval.toPrecision(digits)).toString() + powStr;
      terms.push({ sign, body });
    } else {
      terms.push({ sign: "+", body: "(" + C.format(co, { digits, tol }) + ")" + powStr });
    }
  }
  if (!terms.length) return "0";

  const max = opts.maxTerms;
  const truncated = max != null && max > 0 && terms.length > max;
  const shown = truncated ? terms.slice(0, max) : terms;
  let out = shown[0].sign === "−" ? "−" + shown[0].body : shown[0].body;
  for (let i = 1; i < shown.length; i++) out += " " + shown[i].sign + " " + shown[i].body;
  return truncated ? out + " + …" : out;
}
