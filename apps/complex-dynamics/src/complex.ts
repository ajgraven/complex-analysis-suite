/**
 * Parsing and formatting of complex numbers in the `a + b*i` textual form used
 * throughout the UI and CindyScript presets.
 *
 * A complex number is represented as a `[re, im]` tuple, matching the array
 * convention used elsewhere (centres, `z0`, ...).
 *
 * This replaces the original regex-splitting `re`/`im` helpers, which leaked
 * implicit globals and mis-handled several term orderings.
 */

export type Complex = [re: number, im: number];

/**
 * Split a flat sum like `-.7-.4*i` into its signed terms (`["-.7", "-.4*i"]`),
 * without breaking the exponent sign of scientific notation (`1e-3`).
 */
function splitSignedTerms(s: string): string[] {
  return s.match(/[+-]?(?:[^+-]|(?<=[eE])[+-])+/g) ?? [];
}

/**
 * Parse a complex-number literal such as `.1091+i*.502`, `-.4547-i*.7733`,
 * `1+0*i`, `.5`, or `-i` into a `[re, im]` tuple. Both `b*i` and `i*b`
 * orderings are accepted, as are bare reals and bare imaginaries.
 */
export function parseComplex(input: string): Complex {
  const s = input.replace(/\s+/g, "");
  if (s === "") return [0, 0];

  let re = 0;
  let im = 0;
  for (const term of splitSignedTerms(s)) {
    if (term.includes("i")) {
      const coeff = term.replace(/i/g, "").replace(/\*/g, "");
      if (coeff === "" || coeff === "+") im += 1;
      else if (coeff === "-") im += -1;
      else im += Number.parseFloat(coeff);
    } else {
      re += Number.parseFloat(term);
    }
  }
  return [re, im];
}

/**
 * Format a `[re, im]` tuple as `a+i*b` / `a-i*b` (the form CindyScript and the
 * `c` input expect). Mirrors the original `complex()` helper's output.
 */
export function formatComplex([re, im]: Complex): string {
  return im >= 0 ? `${re}+i*${im}` : `${re}-i*${-im}`;
}

/** Round each component to 6 significant figures for display. */
export function truncateComplex([re, im]: Complex): Complex {
  return [Number.parseFloat(re.toPrecision(6)), Number.parseFloat(im.toPrecision(6))];
}

/**
 * A complex number as a reader sees it: `-0.122561 + 0.744862i`.
 *
 * ONE function, because there were four. The dynamical caption printed 4 significant figures with a
 * spaced `+ bi`; the hover readout printed 6 with the same shape; the overlay's white-point label
 * and the inspector's title both printed 6 in the PARSEABLE `a+i*b` form. So the same parameter
 * appeared on screen, at the same moment, written three different ways — and the one that looked
 * most like a value to copy was the one nobody was meant to copy. The parseable form stays where it
 * belongs: {@link formatComplex}, used by the input fields, the share link and the CSV export.
 * (WP10/U3, review 2026-09-16.)
 */
export function formatComplexDisplay([re, im]: Complex, digits = 6): string {
  const f = (x: number): string => Number.parseFloat(x.toPrecision(digits)).toString();
  const r = f(re);
  if (im === 0) return r;
  const mag = Math.abs(im);
  const imStr = f(mag) === "1" ? "i" : `${f(mag)}i`;
  if (re === 0) return `${im < 0 ? "-" : ""}${imStr}`;
  return `${r} ${im < 0 ? "-" : "+"} ${imStr}`;
}

/** Argument of z in degrees, normalised to [0, 360) — e.g. the multiplier's rotation angle. */
export function argDegrees([re, im]: Complex): number {
  return ((Math.atan2(im, re) * 180) / Math.PI + 360) % 360;
}
