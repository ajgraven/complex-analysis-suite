// Rendering exact values as a reader would write them.
//
// `Res = −i/2` is the point of computing in ℚ(i); `Res ≈ −0.5i` throws it away at the last step.
// The formatter is small, but it is the difference between an exact result the reader can check and
// a decimal they have to take on trust.
import { Frac, Gauss } from "@cas/exact";

const MINUS = "−"; // a real minus sign, not a hyphen — these appear next to digits

/** A rational as `p`, `p/q`, or `−p/q`. */
export function formatFrac(f: Frac): string {
  const sign = f.n < 0n ? MINUS : "";
  const n = f.n < 0n ? -f.n : f.n;
  return f.d === 1n ? `${sign}${n}` : `${sign}${n}/${f.d}`;
}

/** The coefficient part of an imaginary term: `i`, `2i`, `i/2`, `2i/3`. */
function imaginaryTerm(f: Frac): string {
  const n = f.n < 0n ? -f.n : f.n;
  const head = n === 1n ? "i" : `${n}i`;
  return f.d === 1n ? head : `${head}/${f.d}`;
}

/**
 * A Gaussian rational, written the way it would be written by hand.
 *
 * `0`, `3`, `−i/2`, `1 + 4i/3`, `1/2 − i`. The cases exist because the general form
 * `(p/q) + (r/s)i` is unreadable for exactly the values that come up most.
 */
export function formatGauss(g: Gauss): string {
  const reZero = g.re.isZero();
  const imZero = g.im.isZero();
  if (reZero && imZero) return "0";
  if (imZero) return formatFrac(g.re);
  if (reZero) return `${g.im.n < 0n ? MINUS : ""}${imaginaryTerm(g.im)}`;
  return `${formatFrac(g.re)} ${g.im.n < 0n ? MINUS : "+"} ${imaginaryTerm(g.im)}`;
}

/**
 * `2πi · g`, simplified — the form a residue sum is actually reported in.
 *
 * `2πi·(a + bi) = −2πb + 2πa·i`, so the real and imaginary parts swap roles. The cases exist because
 * the mechanical form is unreadable for exactly the values that come up: the answer to gallery A5 is
 * `π`, not `1π + 0πi`.
 */
export function formatTwoPiI(g: Gauss): string {
  if (g.isZero()) return "0";
  const two = Frac.of(2n);
  const piPart = g.im.neg().mul(two); // coefficient of π
  const piIPart = g.re.mul(two); // coefficient of πi

  /** `π`, `3π`, `π/2`, `3π/2` — a unit numerator is dropped, as it would be by hand. */
  const term = (f: Frac, suffix: string): string => {
    const n = f.n < 0n ? -f.n : f.n;
    const head = n === 1n ? suffix : `${n}${suffix}`;
    return f.d === 1n ? head : `${head}/${f.d}`;
  };

  const parts: { negative: boolean; text: string }[] = [];
  if (!piPart.isZero()) parts.push({ negative: piPart.n < 0n, text: term(piPart, "π") });
  if (!piIPart.isZero()) parts.push({ negative: piIPart.n < 0n, text: term(piIPart, "πi") });

  return parts
    .map((p, k) =>
      k === 0
        ? `${p.negative ? MINUS : ""}${p.text}`
        : ` ${p.negative ? MINUS : "+"} ${p.text}`,
    )
    .join("");
}
