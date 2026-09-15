// A parse failure, as a sentence — M8 step 1.4.
//
// **The plan asks for these to be "mapped from `@cas/expr`'s error kinds", and there are none.**
// Measured: `ExprError` carries a free-text `message` and a `pos`, and every throw site writes its
// own prose (`Expected ')'`, `Unknown function 'zz'`, `Unexpected token ''`). So the mapping is from
// the MESSAGE, which is another package's wording and could be reworded without this file noticing.
//
// That is made falsifiable rather than accepted: `test/parseError.test.ts` feeds real broken
// expressions through the real `compile`, and requires every one to reach a mapped sentence with the
// fallback UNUSED. A reworded upstream message turns that test red, which is the difference between
// a brittle mapping and a brittle mapping nobody will notice has broken.
//
// The sentences are the reader's, not the parser's: `Expected ')'` names a token, where `there is an
// unbalanced parenthesis` names what to do about it.

/** One rule: a fragment of `@cas/expr`'s message, and what to say instead. */
const RULES: readonly { readonly match: RegExp; readonly say: (m: RegExpMatchArray) => string }[] = [
  { match: /^Expected '\)'/, say: () => "there is an unbalanced parenthesis" },
  { match: /^Expected '\('/, say: () => "a function name is missing its arguments" },
  { match: /^Unknown function '(.+)'/, say: (m) => `there is no function called “${m[1]}”` },
  { match: /^Unexpected character '(.+)'/, say: (m) => `“${m[1]}” is not something an expression can contain` },
  // **The end-of-input token prints as `eof`, not as an empty string** — the parser writes
  // `tok.value || tok.type`, and eof has no value. The first draft guessed `''` and the suite caught
  // it on its first run, which is the whole argument for testing this against the real parser: the
  // card would have told a reader that `“eof” cannot appear there`.
  { match: /^Unexpected token 'eof'$/, say: () => "the expression ends before it is finished" },
  { match: /^Unexpected token '(.+)'/, say: (m) => `“${m[1]}” cannot appear there` },
  { match: /^Empty expression/, say: () => "there is no expression to read" },
  { match: /^Expected ';' or end of input/, say: () => "the expression ends before it is finished" },
  { match: /^Expression nested too deeply/, say: () => "the expression is nested too deeply to read" },
  { match: /^(\w+)\(\.\.\.\) takes (\d+) argument/, say: (m) => `${m[1]} takes ${m[2]} argument${m[2] === "1" ? "" : "s"}` },
  { match: /^Expected /, say: () => "the expression is incomplete" },
];

/**
 * The reader's sentence for a compile error, or `null` when nothing matched.
 *
 * **Null rather than the raw message**, so the caller decides what an unmapped error looks like and
 * the test above can ask whether one was reached at all. A function that quietly returned the
 * parser's own prose would make "every error is mapped" unobservable.
 */
export function parseErrorSentence(message: string): string | null {
  for (const rule of RULES) {
    const m = rule.match.exec(message);
    if (m !== null) return rule.say(m);
  }
  return null;
}

/** The sentence, or the parser's own words where there is no rule — what the card shows. */
export function parseErrorText(message: string): string {
  return parseErrorSentence(message) ?? message;
}
