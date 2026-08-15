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
}

export function formatFaberPoly(Fn: readonly Cx[], opts: FormatFaberOptions = {}): string {
  const v = opts.varSym || "ζ";
  const digits = opts.digits != null ? opts.digits : 4;
  const tol = opts.tol != null ? opts.tol : 1e-9;
  if (!Fn || !Fn.length) return "0";

  const sup = (k: number): string => superscript(k);

  let out = "";
  let any = false;
  for (let k = Fn.length - 1; k >= 0; k--) {
    const co = Fn[k] || { re: 0, im: 0 };
    if (Math.hypot(co.re, co.im) < tol) continue;
    const powStr = k === 0 ? "" : k === 1 ? v : v + sup(k);
    const realOnly = Math.abs(co.im) < tol;
    let sign: string;
    let body: string;
    if (realOnly) {
      let r = co.re;
      const rr = Math.round(r);
      if (Math.abs(r - rr) < tol) r = rr;
      sign = r < 0 ? "−" : "+";
      const aval = Math.abs(r);
      if (powStr && Math.abs(aval - 1) < tol) {
        body = powStr; // ±1·ζ^k → ζ^k
      } else {
        body = Number(aval.toPrecision(digits)).toString() + powStr;
      }
    } else {
      sign = "+";
      body = "(" + C.format(co, { digits, tol }) + ")" + powStr;
    }
    if (!any) {
      out = (sign === "−" ? "−" : "") + body;
      any = true;
    } else {
      out += " " + sign + " " + body;
    }
  }
  return any ? out : "0";
}
