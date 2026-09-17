// **How a value was checked, in the reader's voice** — M8 step 2.2.
//
// `Golden.method` is required by the schema because a value with no method is an assertion, and
// until this step nothing rendered it: the old shell folded it away and the rebuilt shell dropped it,
// so ninety-five strings written for whoever was building the corpus went five milestones without a
// reader. They read like it — trap ids, fixture flags, references to research documents nobody has,
// and one capitalised word per sentence.
//
// This is the tripwire under the pass that rewrote them. The five rules are the plan's; the rest are
// step 2.1's denylist, which applies to this field for the same reason it applies to every other
// sentence — a reader can now open it.
import { describe, expect, it } from "vitest";
import katex from "katex";

import { loadFamilies } from "../src/families/index.js";
import { splitMath } from "../src/shell/math.js";

const FAMILIES = [...loadFamilies().families.values()];
const METHODS = FAMILIES.flatMap((f) =>
  f.golden.map((g, i) => ({ where: `${f.id}#${i}`, text: g.method })),
);

/** The plan's five, then step 2.1's list. Each is a habit, named by what it is. */
const BANNED: readonly { readonly what: string; readonly re: RegExp }[] = [
  { what: "a trap id", re: /traps\./ },
  { what: "a reference to a research document", re: /\bresearch\b/i },
  { what: "the phrase 'fixture that'", re: /fixture that/i },
  { what: "the word 'catches'", re: /\bcatches\b/i },
  { what: "the word 'rung'", re: /\brung/i },
  { what: "the word 'golden'", re: /\bgolden/i },
  { what: "the word 'ledger'", re: /\bledger/i },
  { what: "the phrase 'the solve'", re: /\bthe solve\b/ },
  { what: "a lemma number", re: /\bL[1-8]\b/ },
  { what: "a plan or pass citation", re: /\bPLAN\b|\bPass \d/ },
  { what: "a file of the implementation", re: /\.json\b|\.ts\b/ },
];

const CAPS = /\b[A-Z]{3,}\b/g;
const CAPS_ALLOWED = new Set(["ML", "GL", "PNG", "URL", "CET", "DE"]);
const ROMAN = /^[IVXLCDM]{1,7}$/;

/**
 * Does KaTeX accept this formula? The one reader of `throwOnError`, so the sweep below and the test
 * that checks the instrument cannot come apart — a mutant turning the flag off must fail both.
 */
function parses(tex: string): boolean {
  try {
    katex.renderToString(tex, { throwOnError: true, displayMode: false });
    return true;
  } catch {
    return false;
  }
}

function offences(text: string): string[] {
  const out: string[] = [];
  for (const { what, re } of BANNED) if (re.test(text)) out.push(what);
  for (const m of text.match(CAPS) ?? []) {
    if (!CAPS_ALLOWED.has(m) && !ROMAN.test(m)) out.push(`the shouted word '${m}'`);
  }
  return out;
}

describe("every method a reader can open", () => {
  it("is there at all — one per fixture, across the whole gallery", () => {
    expect(FAMILIES).toHaveLength(28);
    expect(METHODS.length).toBeGreaterThan(90);
    for (const { where, text } of METHODS) expect(text.length, where).toBeGreaterThan(20);
  });

  it("is written for a reader", () => {
    const bad = METHODS.flatMap(({ where, text }) => {
      const why = offences(text);
      return why.length === 0 ? [] : [`${where} — ${why.join(", ")} — ${text.slice(0, 110)}`];
    });
    expect(bad).toEqual([]);
  });

  it("would say so if one were not, on each rule", () => {
    // Without this the sweep above is satisfied by a broken `offences`.
    expect(offences("guarded by traps.half-range-requires-even")).toContain("a trap id");
    expect(offences("independently verified in research")).toContain("a reference to a research document");
    expect(offences("the fixture that separates the two")).toContain("the phrase 'fixture that'");
    expect(offences("the one that catches a cached pole set")).toContain("the word 'catches'");
    expect(offences("summed over the rung-2 radical split")).toContain("the word 'rung'");
    expect(offences("agrees with the golden value")).toContain("the word 'golden'");
    expect(offences("PLAN §3.2 defers it")).toContain("a plan or pass citation");
    expect(offences("listed in refusals.json")).toContain("a file of the implementation");
    expect(offences("the enclosed root MOVES")).toContain("the shouted word 'MOVES'");
    // And what it must not catch: the two abbreviations this field legitimately uses.
    expect(offences("an ML bound, and a DE quadrature")).toEqual([]);
  });

  it("would reject a formula that does not parse, which is what the sweep below rests on", () => {
    // `throwOnError` is the whole instrument: with it off, KaTeX renders a broken formula in its
    // error colour and returns a string, and the sweep passes on every malformed one.
    expect(parses("\\frac{1}{")).toBe(false);
    expect(parses("\\notacommand x")).toBe(false);
    expect(parses("\\frac{\\pi}{\\sqrt2}")).toBe(true);
  });

  it("puts every formula inside `$…$`, and every one of them parses", () => {
    const bad: string[] = [];
    for (const { where, text } of METHODS) {
      // An odd number of delimiters swallows the rest of the sentence — `splitMath`'s own hazard.
      if ((text.match(/\$/g) ?? []).length % 2 !== 0) {
        bad.push(`${where}: an unbalanced $`);
        continue;
      }
      splitMath(text).forEach((part, i) => {
        if (i % 2 !== 0 && !parses(part)) bad.push(`${where}: ${part}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it("does typeset something, so the rule above is not passing on prose with no formulas in it", () => {
    const withMath = METHODS.filter(({ text }) => text.includes("$"));
    expect(withMath.length, "no method carries a formula at all").toBeGreaterThan(60);
  });
});
