// How an APPROXIMATE number reads — M8 step 1.5.
//
// `kernel/decimal.ts`'s `fmt` prints a number at eight decimals, which is right for an exact value
// and wrong for a quadrature: it shows the reader eight digits of a number whose own error estimate
// says four of them are noise, and it prints a component that is entirely noise as though it were
// content. The review's example is `1.7641e-18 + 6.28318531i`, where the real part is not a small
// number — it is the quadrature's rounding, and `∮ dz/z` is `2πi` exactly.
//
// **The error estimate decides the digits AND decides what is shown at all.** That is the honest
// version of both: a component below the estimate is not a value the app has, and printing it says
// the argument established something it did not.

/** The minus sign used between the parts and in front of a lone one — U+2212, as `fmtCx` uses. */
const MINUS = "−";

/** How many decimals an absolute error estimate licenses. Clamped, so a `0` or an `Infinity` is safe. */
function decimalsFor(err: number): number {
  if (!Number.isFinite(err) || err <= 0) return 8;
  return Math.min(12, Math.max(0, Math.floor(-Math.log10(err))));
}

/**
 * A real number at a fixed number of decimals, for a tabular readout.
 *
 * Trailing zeros are KEPT: a column of `0.5000` over `0.4999` is readable, and a column of `0.5`
 * over `0.4999` jumps as its digits change, which is the thing tabular figures exist to prevent.
 */
export function fmtNum(x: number, digits = 4): string {
  // **No `-0` guard, measured**: `(-0).toFixed(2)` is already `"0.00"` and `(-0).toExponential(3)`
  // is `"0.000e+0"`, so one here is unfalsifiable. `kernel/decimal.ts`'s `fmt` needs one because it
  // rounds through `String(Math.round(…))`, which does not.
  const v = x;
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  // Outside this band a fixed-point rendering is either all zeros or fourteen digits wide.
  if (a !== 0 && (a < 10 ** -digits || a >= 1e6)) return v.toExponential(Math.max(1, digits - 1));
  return v.toFixed(digits);
}

/**
 * A complex number at the precision its own error estimate supports.
 *
 * **A component whose magnitude is at or below the estimate is DROPPED**, because the estimate says
 * the app cannot tell it from zero — `1.7641e-18 + 6.28318531i` becomes `6.2832i`, which is what
 * the quadrature actually established. Both below it prints `0`, which is also a claim the estimate
 * supports and is the one number a reader can act on.
 */
export function fmtApprox(value: readonly [number, number], err: number): string {
  // **A `NaN` IS NOT A SMALL NUMBER.** `NaN > floor` is false, so the drop rule below silently
  // discards it — and a pair of them printed as `0`, an exact-looking zero for a walk that has no
  // value at all. Reached in practice: `removable-one-minus-cos` samples a midpoint exactly on the
  // removable singularity of `(1 − cos z)/z²`, so every later partial sum is `NaN`. Found by the
  // accumulator strip's first reader, which is what a second consumer is for.
  if (Number.isNaN(value[0]) || Number.isNaN(value[1])) return "not a number";
  const digits = decimalsFor(err);
  const floor = Number.isFinite(err) && err > 0 ? err : 0;
  const [re, im] = value;
  const showRe = Math.abs(re) > floor;
  const showIm = Math.abs(im) > floor;
  if (!showRe && !showIm) return "0";
  if (!showIm) return fmtNum(re, digits);
  const imag = `${fmtNum(Math.abs(im), digits)}i`;
  if (!showRe) return im < 0 ? `${MINUS}${imag}` : imag;
  return `${fmtNum(re, digits)} ${im < 0 ? MINUS : "+"} ${imag}`;
}
