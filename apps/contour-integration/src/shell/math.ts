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

/**
 * LaTeX source → KaTeX's HTML, **bounded**.
 *
 * The comment here said *"unbounded on purpose: the corpus of formulas is finite and small"*, and
 * the corpus is — 1,270 distinct formulas over the app's 43 states. What is not finite is the
 * SANDBOX: the integrand box previews what the parser read on every keystroke, so typing
 * `1/(1+z^4)/(z^2+2)` mints eighteen entries no second render will ever ask for, and a session
 * spent typing grows the map without bound. Least-recently-used, because the corpus formulas are
 * the ones asked for again and a draft is asked for once: the bound is well above the largest
 * single state's demand, so the steady-state hit rate is unchanged and only the drafts are evicted.
 */
const CACHE_LIMIT = 4096;
const RENDERED = new Map<string, string>();

function render(latex: string, display: boolean): string {
  const key = display ? `D${latex}` : `I${latex}`;
  const hit = RENDERED.get(key);
  if (hit !== undefined) {
    // A `Map` iterates in insertion order, so re-inserting is what makes the oldest key the one the
    // eviction below reaches — the whole LRU, in two lines and no second structure.
    RENDERED.delete(key);
    RENDERED.set(key, hit);
    return hit;
  }
  // `throwOnError: false` is step 0.5b's decision and stays: a malformed formula renders in KaTeX's
  // error colour with its source visible — a defect a reader can SEE — where throwing would take
  // down whichever card was being built, usually the ledger, whose job is to say what is established.
  // **KaTeX's `<annotation encoding="application/x-tex">` is stripped** — M8 step 3.6. It holds the
  // LaTeX source inside the MathML half, which KaTeX leaves exposed on purpose (the HTML half is
  // `aria-hidden`), and Chrome's name computation flattens it into whatever is above it. So a
  // heading reading *Partial sum Σ f(zₖ)Δzₖ* announced itself as `PARTIAL SUM \sum_k f(z_k)\,
  // \Delta z_k`. Nothing reads it back — `mathPlain`/`mathSpoken` work from the SOURCE string, not
  // from the DOM — and the MathML it sits in stays valid without it.
  const html = katex
    .renderToString(latex, { throwOnError: false, displayMode: display })
    .replace(/<annotation[^>]*>[\s\S]*?<\/annotation>/g, "");
  RENDERED.set(key, html);
  if (RENDERED.size > CACHE_LIMIT) {
    const oldest = RENDERED.keys().next();
    if (!oldest.done) RENDERED.delete(oldest.value);
  }
  return html;
}

/**
 * One formula, typeset.
 *
 * **A node carries an `aria-label` only where the caller HAS the plain-text form** — M8 step 3.6,
 * and the comment here used to claim it always did. KaTeX emits MathML alongside its HTML, screen
 * reader support for it is uneven, and the HTML half is a pile of positioned spans that reads as
 * nonsense — so where the app has the text sibling from step 0.4 (`Value.text` beside
 * `Value.latex`), that sentence is the name. Where it does not, the fallback was the LATEX, which
 * is the one thing worse than uneven MathML: `\oint_\gamma f(z)\,dz = 2\pi i \sum_k …`
 * announced character by character. No name at all leaves the MathML to do its job.
 *
 * `role="math"` names what it is without claiming an image.
 */
export function math(latex: string, opts: { readonly display?: boolean; readonly key?: string; readonly label?: string } = {}): Desc {
  const display = opts.display ?? false;
  return h("span", {
    ...(opts.key === undefined ? {} : { key: opts.key }),
    class: display ? "math math-display" : "math",
    role: "math",
    ...(opts.label === undefined ? {} : { "aria-label": opts.label }),
    // **The source, where a test can read it and a screen reader cannot** — M8 step 3.6. Until this
    // step the `aria-label` was doing both jobs, which is why the LaTeX was being announced: a
    // dozen tests needed to know WHICH formula a node holds, and the accessible name was the only
    // place that said so. A `data-` attribute is not in the accessibility tree at all.
    "data-tex": latex,
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
    // **No label.** A `$…$` fragment of a sentence has no text twin — that is what distinguishes
    // it from a `Value`, which carries `text` beside `latex` — so passing one meant passing the
    // LaTeX, and 65 of the 66 formulas on the app's landing page announced their source.
    out.push(math(part, { key: `${keyPrefix}m${i}` }));
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

/**
 * The macros a SPOKEN name may meet, and their words — M8 step 3.6.
 *
 * **Measured rather than guessed.** Walking all 28 records at every fixture, the titles the stepper
 * turns into `aria-label`s carry exactly nine macros: `\to`, `\infty`, `\rho`, `\varepsilon`,
 * `\arg`, `\pi`, `\log`, `\eta` and `\operatorname`. The rest of this map is the parameter symbols
 * `vocabulary.ts` can mint (`\alpha`, `\mu`, `\xi`, `\gamma`, `\theta`) — reachable through a piece
 * name or a limit step, and cheaper to carry than to be surprised by.
 *
 * It is deliberately NOT a LaTeX-to-speech renderer. The formulas this app composes run to
 * integrals, fractions and certified bounds, and there is no honest short map for those; what there
 * is a short map for is the NAMES — a piece, a parameter, a step — which is the only mathematics
 * that ever has to be spoken rather than typeset.
 */
const SPOKEN: Readonly<Record<string, string>> = {
  "\\to": "to",
  "\\infty": "infinity",
  "\\pi": "pi",
  "\\rho": "rho",
  "\\varepsilon": "epsilon",
  "\\eta": "eta",
  "\\gamma": "gamma",
  "\\alpha": "alpha",
  "\\mu": "mu",
  "\\xi": "xi",
  "\\theta": "theta",
  "\\arg": "arg",
  "\\log": "log",
  // **`\oint`, measured on the map's second consumer** — the 2026-09-20 review. `figureCaption` is
  // now a caller, and the one headline in the app written in the `$…$` convention is the sandbox's,
  // `$\oint_\gamma f(z)\,dz$ is established exactly.` The glyph rather than a word because a plate
  // draws it happily — `figureCaption`'s own value line already writes `∮ f dz ≈ …` in Unicode —
  // and because *the contour integral of* would be a reading of the whole formula rather than of
  // one symbol, which is the line this map does not cross.
  "\\oint": "∮",
};

/**
 * A NAME as it should be read aloud — M8 step 3.6.
 *
 * **`mathPlain` was not enough and its own comment said it was.** It strips the `$` and nothing
 * else, so the stepper announced *step 5 of 8 — Boundary terms · the R \to \infty semicircle* — the
 * backslashes read out — for the two steps of every record that have a limit. Step 3.1b noticed the
 * dollars, fixed those, and recorded the whole defect as closed; measuring the accessible name in a
 * browser at the Phase 3 gate is what showed the rest of it still there. **The instrument is the
 * accessibility tree, not the DOM** — M6.4's lesson, twice — and this is the third time in this app
 * that a name looked right in the source and was wrong in the tree.
 *
 * An unmapped macro is left as it is rather than dropped, so it shows up as a backslash in
 * `test/spoken.test.ts`'s corpus sweep instead of vanishing into a name that reads almost right.
 */
export function mathSpoken(text: string): string {
  return mathPlain(text)
    // **A spacing macro is a space.** `\,` `\;` `\:` `\!` are not `\word`s, so the map below cannot
    // see them; the sandbox headline's `f(z)\,dz` came out with its backslash still in it.
    .replace(/\\[,;:!]/g, " ")
    // An operator name is its own word: `\operatorname{Im} z` is *Im z*.
    .replace(/\\(?:operatorname|mathrm|mathbf|mathbb|text)\s*\{([^{}]*)\}/g, "$1")
    // A bare superscript sign is a direction of approach, and only where nothing follows it —
    // `2\pi^-` is a limit from below, where `z^{-1}` is an exponent and must be left alone.
    .replace(/\^\{?\+\}?(?![\w])/g, " from above")
    .replace(/\^\{?-\}?(?![\w])/g, " from below")
    .replace(/\\[a-zA-Z]+/g, (m) => SPOKEN[m] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** How many distinct formulas have been typeset. For the test that proves the cache is a cache. */
export function renderedCount(): number {
  return RENDERED.size;
}

/** The cache's ceiling, so the test that proves it is bounded reads the same number the code does. */
export const renderCacheLimit = CACHE_LIMIT;

/**
 * Whether a formula is still resident — for the test that proves the eviction is LRU.
 *
 * `renderedCount` cannot answer it: at the ceiling a hit and a miss both leave the size unchanged,
 * one because nothing was added and the other because something was added and something evicted. A
 * predicate is the only observable that tells the two apart, and it reads the map without touching
 * the order.
 */
export function renderCacheHolds(latex: string, display = false): boolean {
  return RENDERED.has(display ? `D${latex}` : `I${latex}`);
}
