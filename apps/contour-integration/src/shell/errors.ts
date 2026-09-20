// **Every machine message this app can show a reader, as a sentence** — M8 step 2.4.
//
// Three sources of them, and they fail in three different registers:
//
//   1. `@cas/expr`'s parse errors, which name TOKENS (`Expected ')'`, `Unexpected token 'eof'`);
//   2. the `#vs=` codec's refusals, which name WIRE FIELDS and ids (`the drawn contour's closure flag
//      in this link is neither absent nor 1`, `this link names the gallery record 'mellin-keyhole'`);
//   3. the actions' own failures — a clipboard that refused, a figure that could not be drawn.
//
// **The codec's refusals are collapsed on purpose, and that is the step's one real decision.** There
// are forty-odd of them and all but a handful say the same thing to a reader — *part of this link is
// not what it should be* — differing only in which field of the wire format was wrong, which is a
// fact about this program and not about anything the reader can act on. What IS actionable is kept
// distinct: an example this build does not have, a fixture past the end, a contour or a backdrop
// this version does not know, a link from another app in the suite, a link cut short in the copying,
// a declaration standing on a branch point the state no longer carries. Seven sentences over
// forty-odd reasons, and `test/errors.test.ts` reads every one of those reasons out of
// `viewState.ts`'s own source so that a refusal added later cannot quietly fall through.
//
// The codec's own `reason` is unchanged — the tests that pin the wire format still read it, and a
// developer debugging a link still has it. What changed is that nothing shows it to a reader.

/** One rule: a fragment of the machine message, and what to say instead. */
interface Rule {
  readonly match: RegExp;
  readonly say: (m: RegExpMatchArray) => string;
}

function apply(rules: readonly Rule[], message: string, fallback: string): string {
  for (const rule of rules) {
    const m = rule.match.exec(message);
    if (m !== null) return rule.say(m);
  }
  return fallback;
}

// ── 1. the parser ───────────────────────────────────────────────────────────────────────────────

/**
 * **The plan asks for these to be "mapped from `@cas/expr`'s error kinds", and there are none.**
 * Measured: `ExprError` carries a free-text `message` and a `pos`, and every throw site writes its
 * own prose (`Expected ')'`, `Unknown function 'zz'`, `Unexpected token ''`). So the mapping is from
 * the MESSAGE, which is another package's wording and could be reworded without this file noticing.
 *
 * That is made falsifiable rather than accepted: `test/parseError.test.ts` feeds real broken
 * expressions through the real `compile`, and requires every one to reach a mapped sentence with the
 * fallback UNUSED. A reworded upstream message turns that test red, which is the difference between
 * a brittle mapping and a brittle mapping nobody will notice has broken.
 *
 * The sentences are the reader's, not the parser's: `Expected ')'` names a token, where `there is an
 * unbalanced parenthesis` names what to do about it.
 */
const PARSE: readonly Rule[] = [
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
  for (const rule of PARSE) {
    const m = rule.match.exec(message);
    if (m !== null) return rule.say(m);
  }
  return null;
}

/** The sentence, or the parser's own words where there is no rule — what the card shows. */
export function parseErrorText(message: string): string {
  return parseErrorSentence(message) ?? message;
}

// ── 2. the codec ────────────────────────────────────────────────────────────────────────────────

/** What a link that cannot be opened says. The seven that are actionable, then the one that is not. */
const LINK: readonly Rule[] = [
  { match: /belongs to another app/, say: () => "This link belongs to another app in the suite, not to Contour Integration." },
  { match: /may be truncated/, say: () => "This link is incomplete — it may have been cut short when it was copied." },
  { match: /names the gallery record/, say: () => "This link names a worked example this version does not have." },
  { match: /gallery mode but names no record/, say: () => "This link opens the gallery without naming an example." },
  { match: /names fixture/, say: () => "This link names a fixture that worked example does not have." },
  { match: /contour template|parameter template/, say: () => "This link names a contour this version does not have." },
  { match: /names the stage mode/, say: () => "This link names a backdrop this version does not have." },
  { match: /names the comparison/, say: () => "This link names a comparison this version does not have." },
  { match: /declared factor sits on branch point/, say: () => "This link declares a branch factor at a point it does not carry." },
  { match: /opens practice on/, say: () => "This link opens practice on a task this version does not have." },
  { match: /opens practice at stage/, say: () => "This link opens practice at a stage that does not exist." },
];

/** The reader's sentence for a link the app will not open. */
export function linkRefusal(reason: string): string {
  return apply(LINK, reason, "This link is damaged: part of it could not be read.");
}

/**
 * What a state that cannot be PUT in a link says.
 *
 * A different register from the one above, because the subject is different: the reader is looking
 * at something that cannot be shared, not at something that cannot be opened, and the repair — open
 * an example, commit the path — is theirs to make.
 */
const SHARE: readonly Rule[] = [
  { match: /no record open/, say: () => "No worked example is open, so there is nothing to link to." },
  // **Before the drawn-contour rule, and the order is the finding.** This reason contains the word
  // *vertices*, so a rule keyed on that answered it with "a hand-drawn contour cannot be carried
  // until it is committed" — a repair for a case this is not. A contour that came from neither a
  // template nor the pen is a record's curve parked in the sandbox, and there is nothing to commit.
  {
    match: /came from neither a template nor the pen/,
    say: () => "This contour came from neither a template nor the pen, so a link has nothing to rebuild it from.",
  },
  {
    match: /does not rebuild the contour on screen/,
    say: () => "This contour no longer matches the template it was built from, so a link would open a different one.",
  },
  { match: /drawn contour|vertices|bows piece/, say: () => "A hand-drawn contour cannot be carried in a link until it is committed." },
  { match: /contour template/, say: () => "This contour is not one a link can carry." },
  { match: /declared factor sits on branch point/, say: () => "The declared branch factor stands on a point this state no longer carries." },
];

export function shareRefusal(reason: string): string {
  return apply(SHARE, reason, "This state cannot be put in a link.");
}

// ── 3. the actions ──────────────────────────────────────────────────────────────────────────────

/**
 * What the app says when something it tried did not work.
 *
 * Written out rather than composed, because there are six of them and each names its own repair.
 * They live here so that the one place a reader is told something failed is the one place the
 * wording is decided — `app.ts` used to carry them inline, beside the code that failed.
 */
export const FAILED = {
  copyLink: "The link could not be copied. Select it in the address bar instead.",
  copyFigure: "The figure could not be copied. Use Save figure instead.",
  drawFigure: "The figure could not be drawn.",
  noLink: "There is no link for this state.",
} as const;

/** What the app says when something it tried DID work. Here for the same reason. */
export const DONE = {
  copyLink: "Link copied.",
  copyFigure: "Figure copied.",
  saveFigure: "Figure saved.",
} as const;

// ── 4. the empty states ─────────────────────────────────────────────────────────────────────────

/**
 * What the Integrand card says when there is nothing to draw.
 *
 * **An empty box is not an error**, and until this step it was told it was one: `compile` refuses an
 * empty string with `Empty expression`, which the parse rules turn into *there is no expression to
 * read* — true, and addressed to someone who has just cleared the box on purpose. The invitation is
 * what a reader wants there, and the parser's sentence is what they want after typing `1/(z-`.
 */
export function integrandEmpty(expression: string, reason: string | null): string {
  if (expression.trim() === "") return "Type an integrand to begin.";
  return reason === null ? "This expression cannot be read." : parseErrorText(reason);
}

/**
 * The same thing as a CLAUSE, for the two places that embed it — M8 step 2.6.
 *
 * **The Phase 2 gate found both**, and they are the shape of defect a table test structurally
 * cannot see: `test/errors.test.ts` drives the mapping, and these two readers never called it.
 * The Derivation card printed `Empty expression` and the accumulator's strip printed *Nothing is
 * plotted — Empty expression.* — `@cas/expr`'s own words, in an app whose one module for this
 * exists so that they never reach a reader, three cards away from the invitation the Integrand
 * card was showing at the same moment.
 *
 * A clause rather than a second sentence, because the strip's line is *"Nothing is plotted — ⟨x⟩."*
 * and a full stop inside it reads as a typo; the parse rules already return this shape, which is
 * why the sentence form is the one that has to do work.
 */
export function integrandEmptyClause(expression: string, reason: string | null): string {
  if (expression.trim() === "") return "there is nothing in the integrand box";
  return reason === null ? "this expression cannot be read" : parseErrorText(reason);
}
