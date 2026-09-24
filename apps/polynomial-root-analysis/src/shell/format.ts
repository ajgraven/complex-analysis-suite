// Numbers as a reader sees them. A decimal of a computed coordinate is always an ESTIMATE of it,
// whatever the certificate says about the disc around it.
import type { Frac, Gauss } from "@cas/exact";
import type { Cx } from "../engine/polynomial.js";

function num(x: number, digits: number): string {
  if (x === 0) return "0";
  const a = Math.abs(x);
  const s =
    a >= 1e-4 && a < 1e6
      ? Number(x.toPrecision(digits)).toString()
      : x.toExponential(digits - 1).replace(/\.?0+e/, "e");
  return s.replace("-", "−");
}

export function formatCx([x, y]: Cx, digits = 6): string {
  if (y === 0) return num(x, digits);
  if (x === 0) return `${num(y, digits)}i`;
  const im = num(Math.abs(y), digits);
  return `${num(x, digits)} ${y < 0 ? "−" : "+"} ${im}i`;
}

function frac(f: Frac): string {
  const n = f.n < 0n ? `−${-f.n}` : `${f.n}`;
  return f.d === 1n ? n : `${n}/${f.d}`;
}

export function formatGauss(g: Gauss): string {
  if (g.im.isZero()) return frac(g.re);
  const imMag = g.im.n < 0n ? g.im.neg() : g.im;
  const imS = `${frac(imMag) === "1" ? "" : frac(imMag)}i`;
  if (g.re.isZero()) return g.im.n < 0n ? `−${imS}` : imS;
  return `${frac(g.re)} ${g.im.n < 0n ? "−" : "+"} ${imS}`;
}
