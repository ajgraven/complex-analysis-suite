// Text with mathematics in it — the `$…$` convention, rendered.
//
// M8 step 0.5b. Every sentence the engine composes is prose with formulas inside it, and until now
// the formulas were Unicode characters in a sans-serif line: `∮ is unchanged by moving this cut`,
// `deg Q − deg P = 4 ≥ 2`. The wording pass puts each formula between dollars — `$\oint_\gamma f\,dz$
// does not depend on where the cut runs` — and this is what turns that into a typeset span.
//
// **The convention needs its renderer in the same step, which the plan did not anticipate.** It has
// the delimiters arriving in 0.5 and KaTeX in Phase 1; applied in that order, the app would ship a
// page of literal dollar signs to `master`, and writing the sentences in Unicode first and rewriting
// them in Phase 1 would be the same work twice. So the renderer is here, at its smallest: split on
// the delimiters, typeset the odd spans, leave everything else as text.
//
// It is deliberately NOT a Markdown renderer and not a general typesetter. A sentence with no
// dollars in it comes back unchanged, which is what lets the remaining bound and provenance strings
// keep their Unicode until they are rewritten one file at a time.
import katex from "katex";

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
 * The sentence as DOM: text nodes, with each `$…$` typeset by KaTeX.
 *
 * `throwOnError: false` is deliberate. A malformed formula renders in KaTeX's error colour with the
 * source visible, which is a defect a reader can SEE and report; throwing would take down whichever
 * panel was being built, and the panel is usually the ledger — the one surface whose job is to say
 * what is and is not established.
 */
export function mathFragment(text: string): DocumentFragment {
  const out = document.createDocumentFragment();
  splitMath(text).forEach((part, k) => {
    if (k % 2 === 0) {
      if (part !== "") out.append(document.createTextNode(part));
      return;
    }
    const span = document.createElement("span");
    span.className = "math";
    span.innerHTML = katex.renderToString(part, { throwOnError: false, displayMode: false });
    out.append(span);
  });
  return out;
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
