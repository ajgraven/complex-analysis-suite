// The parse-error sentences, against the REAL parser — M8 step 1.4.
//
// The plan asks for the sentences to be "mapped from `@cas/expr`'s error kinds"; measured, there are
// none — `ExprError` carries a free-text message. So this suite is what makes the mapping honest: it
// drives the real `compile`, and requires every failure to reach a mapped sentence with the fallback
// UNUSED. A reworded upstream message turns it red instead of silently degrading the card to the
// parser's own prose.
import { describe, expect, it } from "vitest";

import { compile } from "../src/shell/state.js";
import { parseErrorSentence } from "../src/shell/cards/parseError.js";

/** Broken expressions of the shapes a reader actually types, one per throw site we claim to cover. */
const BROKEN: readonly { readonly src: string; readonly expect: RegExp }[] = [
  { src: "1/(1+z", expect: /unbalanced parenthesis/ },
  { src: "zz(3)", expect: /no function called “zz”/ },
  { src: "1/z +", expect: /ends before it is finished/ },
  { src: "", expect: /no expression to read/ },
  { src: "1 § 2", expect: /is not something an expression can contain/ },
  { src: "*/z", expect: /cannot appear there/ },
  { src: "if(z)", expect: /if takes 3 arguments/ },
  { src: "sin(z, 1)", expect: /sin takes 1 argument/ },
];

describe("a parse failure, as a sentence", () => {
  it("maps every shape a reader types, with the fallback UNUSED", () => {
    for (const { src, expect: want } of BROKEN) {
      const compiled = compile(src);
      expect(compiled.ok, `“${src}” parsed, so there is no error to map`).toBe(false);
      if (compiled.ok) continue;
      const sentence = parseErrorSentence(compiled.error);
      // Null is the fallback path. Reaching it means the card would print the parser's own prose,
      // which is the thing this file exists to prevent.
      expect(sentence, `“${src}” → “${compiled.error}” reached no rule`).not.toBeNull();
      expect(sentence ?? "").toMatch(want);
    }
  });

  it("says nothing about a message it does not know", () => {
    // The rules are prefix-anchored on purpose: a message this file has never seen must fall through
    // rather than be captured by whichever regex happens to match part of it.
    expect(parseErrorSentence("the reactor is on fire")).toBeNull();
  });

  it("names the token where naming it helps, and its ABSENCE where it does not", () => {
    // `Unexpected token 'eof'` IS the end-of-input token — measured, not assumed: the parser writes
    // `tok.value || tok.type` and eof has no value. Printing “eof” cannot appear there shows a reader
    // an internal token name and tells them nothing.
    expect(parseErrorSentence("Unexpected token 'eof'")).toBe("the expression ends before it is finished");
    expect(parseErrorSentence("Unexpected token '*'")).toBe("“*” cannot appear there");
  });
});
