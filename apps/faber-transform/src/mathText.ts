// mathText.ts — a tiny inline-math renderer. It turns a lightweight markup string into real DOM with
// <sub>/<sup> elements, so notation (the operator Φᵩ, powers zⁿ, the weighted Faber Qₙ,ₘ, a Σ bound)
// is typeset properly rather than approximated with same-size baseline glyphs. Used for the header,
// panel titles, the readout, and the corner-profile caption; the canvas-drawn legends stay on the
// Unicode sub/superscript helpers (a 2-D context can't hold HTML).
//
// Markup: `_{…}` → subscript, `^{…}` → superscript. A lone `_`/`^` NOT immediately followed by `{`
// is passed through literally, so dynamic text (an expr parser's error message) renders verbatim.
// Content is only ever set through text nodes — never innerHTML — so there is no markup-injection surface.

/** The exterior Faber transform operator Φ_φ, as reusable markup (Φ + subscript φ). */
export const PHI = "Φ_{φ}";

/** A run of text at one script level. `script: ""` is the baseline; `"sub"`/`"sup"` are scripted. */
export interface MathToken {
  readonly text: string;
  readonly script: "" | "sub" | "sup";
}

/**
 * Tokenize inline-math markup into baseline / sub / sup runs (see the module header for the grammar).
 * Pure (no DOM), so it is unit-testable in the node test environment; `mathFrag` renders the tokens.
 */
export function parseMath(markup: string): MathToken[] {
  const tokens: MathToken[] = [];
  let literal = "";
  const flush = (): void => {
    if (literal) {
      tokens.push({ text: literal, script: "" });
      literal = "";
    }
  };
  for (let i = 0; i < markup.length; ) {
    const ch = markup[i];
    if ((ch === "_" || ch === "^") && markup[i + 1] === "{") {
      const close = markup.indexOf("}", i + 2);
      if (close !== -1) {
        flush();
        tokens.push({ text: markup.slice(i + 2, close), script: ch === "_" ? "sub" : "sup" });
        i = close + 1;
        continue;
      }
    }
    literal += ch;
    i++;
  }
  flush();
  return tokens;
}

/** Build a DocumentFragment from inline-math markup. */
export function mathFrag(markup: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const tok of parseMath(markup)) {
    if (tok.script === "") {
      frag.appendChild(document.createTextNode(tok.text));
    } else {
      const e = document.createElement(tok.script);
      e.textContent = tok.text;
      frag.appendChild(e);
    }
  }
  return frag;
}

/** Replace `el`'s contents with the rendered markup. */
export function setMath(el: HTMLElement, markup: string): void {
  el.replaceChildren(mathFrag(markup));
}

/** Create an element of `tag` whose contents are the rendered markup, plus optional attributes. */
export function mathElt<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  markup: string,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.appendChild(mathFrag(markup));
  return e;
}
