// How a number reads on screen.
//
// Extracted on the second-consumer rule (ADR-0007) at M8 step 1.4: `fmt` and `fmtCx` were locals of
// `src/shell/app.ts`, and the new shell's cards are the second reader. The bodies are the old
// shell's, character for character, so the extraction is a move rather than a decision — and the old
// shell now imports them, which is what stops the two shells drifting about what `-0` prints as
// while both are alive.
import type { Cx } from "./geom.js";

/**
 * A real number, at the precision a reader can use.
 *
 * `-0` prints as `0`: it is the same number, and a minus sign in front of a zero reads as a sign the
 * argument established. Outside `[1e-4, 1e6)` it goes exponential, because a readout that grows to
 * fourteen digits is what makes a panel jump as its numbers change; inside, it is rounded to eight
 * decimals so float64's own noise does not appear as content.
 */
export function fmt(x: number): string {
  if (Object.is(x, -0)) return "0";
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-4 || a >= 1e6)) return x.toExponential(4);
  return String(Math.round(x * 1e8) / 1e8);
}

/** A complex number as `a + bi`, with the sign carried by the operator rather than by the digits. */
export function fmtCx([re, im]: Cx): string {
  return `${fmt(re)} ${im < 0 ? "−" : "+"} ${fmt(Math.abs(im))}i`;
}
