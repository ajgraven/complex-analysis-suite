// Typeset mathematics as builder descriptions, rendered once per distinct formula.
//
// M8 step 1.1, plan §4.0. The old shell calls `mathFragment` and builds a `DocumentFragment` every
// time a card is drawn, which means KaTeX parses `\oint_\gamma f(z)\,dz` again on every frame of a
// contour drag. Here a formula is a keyed description whose `html` is looked up in a cache, so a
// drag that leaves the formula unchanged costs one map read and, through `patch`'s `html` compare,
// not even a DOM write.
//
// **The delimiter convention and the plain-text sibling are step 0.5's, and are reused rather than
// restated.** `splitMath` is DOM-free and already the single reader of the `$…$` rule — a second
// copy here would be a second place for the rule to drift, and the rule is what decides whether a
// stray dollar swallows the rest of a sentence.
import katex from "katex";

import { h, type Desc } from "./dom.js";

/** LaTeX source → KaTeX's HTML. Unbounded on purpose: the corpus of formulas is finite and small. */
const RENDERED = new Map<string, string>();

function render(latex: string, display: boolean): string {
  const key = display ? `D${latex}` : `I${latex}`;
  const hit = RENDERED.get(key);
  if (hit !== undefined) return hit;
  // `throwOnError: false` is step 0.5b's decision and stays: a malformed formula renders in KaTeX's
  // error colour with its source visible — a defect a reader can SEE — where throwing would take
  // down whichever card was being built, usually the ledger, whose job is to say what is established.
  const html = katex.renderToString(latex, { throwOnError: false, displayMode: display });
  RENDERED.set(key, html);
  return html;
}

/**
 * One formula, typeset.
 *
 * **Every node carries an `aria-label` of the plain-text form.** KaTeX emits MathML alongside its
 * HTML, but screen-reader support for it is uneven and the HTML half is a pile of positioned spans
 * that reads as nonsense; the app already has the text sibling from step 0.4, so the accessible name
 * is the sentence a reader would say. `role="math"` names what it is without claiming an image.
 */
export function math(latex: string, opts: { readonly display?: boolean; readonly key?: string; readonly label?: string } = {}): Desc {
  const display = opts.display ?? false;
  return h("span", {
    ...(opts.key === undefined ? {} : { key: opts.key }),
    class: display ? "math math-display" : "math",
    role: "math",
    "aria-label": opts.label ?? latex,
    html: render(latex, display),
  });
}

/**
 * A sentence with `$…$` in it: text outside, typeset inside.
 *
 * Returns the children rather than a wrapper, so a caller can put a sentence straight into a `<p>`
 * without an extra span in the way. Each formula is keyed by its position, which is stable for a
 * sentence whose shape does not change and correct when it does.
 */
export function mathText(sentence: string, keyPrefix = "m"): readonly Desc[] {
  const parts = splitMath(sentence);
  const out: Desc[] = [];
  parts.forEach((part, i) => {
    if (i % 2 === 0) {
      if (part !== "") out.push({ tag: "#text", key: `${keyPrefix}t${i}`, props: { nodeValue: part }, children: [] });
      return;
    }
    out.push(math(part, { key: `${keyPrefix}m${i}`, label: part }));
  });
  return out;
}

/** The sentence with its delimiters removed — for an `aria-label`, a `title`, a canvas caption. */
// ── the `$…$` convention itself, folded in at M8 step 1.12 ──────────────────────────────────────
//
// These were `src/shell/math.ts` — step 0.5b's renderer, written before the new shell existed and
// imported from here ever since. The cutover renames `shell2/` to `shell/`, and two modules called
// `math.ts` cannot both be it; folding is better than a second name, because the split and the
// typesetting are one convention and the only reason they were apart is that they were written four
// steps apart. `mathFragment`, the third export, went with the old shell: it built a
// `DocumentFragment` for an imperative `el()` tree and had no other reader.

/**
 * Split a sentence into alternating text and mathematics.
 *
 * Even indices are text, odd indices are `$…$` bodies — so an unmatched trailing dollar leaves its
 * tail as TEXT rather than as a formula, which is the safe direction: a sentence renders plainly
 * instead of a stray delimiter swallowing the rest of the line.
 */
export function splitMath(text: string): readonly string[] {
  const parts = text.split("$");
  if (parts.length % 2 === 0) {
    // An odd number of delimiters. Re-join the last two so nothing is read as an opening dollar.
    const tail = parts.pop() ?? "";
    parts[parts.length - 1] = `${parts[parts.length - 1]}$${tail}`;
  }
  return parts;
}

/**
 * The same sentence as PLAIN text, with the delimiters removed.
 *
 * For the places a fragment cannot go: an `aria-label`, a `<title>`, a PNG's text chunk, the
 * accumulator's canvas caption. KaTeX's own output is unreadable there, and the LaTeX source is
 * worse than the sentence — so this is the one place the app keeps a sentence's mathematics as its
 * source rather than typeset, and it is always a fallback rather than a display choice.
 */
export function mathPlain(text: string): string {
  return splitMath(text).join("");
}


/** How many distinct formulas have been typeset. For the test that proves the cache is a cache. */
export function renderedCount(): number {
  return RENDERED.size;
}
