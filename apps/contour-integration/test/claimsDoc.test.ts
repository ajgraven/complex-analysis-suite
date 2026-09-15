// The review document stays in step with the sentences it reviews.
//
// M8 step 0.5a. `docs/contour-integration/M8/claims.md` is GENERATED — regenerate it deliberately,
// never to make a test pass:
//
//     M8_WRITE_CLAIMS=1 pnpm exec vitest run test/claimsDoc.test.ts
//
// Unguarded, this test only CHECKS: every sentence the app can compose has to appear in the
// committed document. It does not rewrite the file, because the owner's approval is recorded by
// editing `test/helpers/claimsProposals.ts` and regenerating, and a test that rewrote the document
// on every run would be a test that could quietly drop a decision.
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { CLAIM_IDS, claimTemplate } from "../src/engine/claims.js";
import { claimsDocument, flagsFor } from "./helpers/claimsDoc.js";
import { PROPOSED, REPAIRS } from "./helpers/claimsProposals.js";

const DOC = fileURLToPath(new URL("../../../docs/contour-integration/M8/claims.md", import.meta.url));

describe("the M8 claims review document", () => {
  it("covers every ledger template, so a new sentence cannot arrive unreviewed", () => {
    const text = claimsDocument();
    if (process.env.M8_WRITE_CLAIMS === "1") {
      writeFileSync(DOC, text);
      return;
    }
    const committed = readFileSync(DOC, "utf8");
    const missing = CLAIM_IDS.filter((id) => id !== "certificate").filter(
      (id) => !committed.includes(`\`${id}\``),
    );
    expect(missing).toEqual([]);
  });

  it("flags the four wording rules, and nothing else", () => {
    // The flags are the document's only automated judgement, so they are pinned directly: a rule
    // that stopped firing would leave a page of sentences looking approved.
    expect(flagsFor("the contour is closed")).toEqual([]);
    expect(flagsFor("a stated hypothesis FAILS")).toEqual(["caps: FAILS"]);
    expect(flagsFor("research 06 §2.1, decided over Q")).toEqual(["citation"]);
    expect(flagsFor("L4 needs a simple pole")).toEqual(["lemma number"]);
    expect(flagsFor("a multiple the solve reads off the family")).toEqual([
      "jargon: the solve, the family",
    ]);
    expect(flagsFor("the bound is O(R) and ∮ → 0")).toEqual(["maths undelimited"]);
    expect(flagsFor("the bound is $O(R)$ and $∮ → 0$")).toEqual([]);
    // Half-typeset is not typeset: the characters OUTSIDE the delimiters are what is checked.
    expect(flagsFor("the bound is $O(R)$ and ∮ → 0")).toEqual(["maths undelimited"]);
    // `ML` is a name, not emphasis.
    expect(flagsFor("an ML bound")).toEqual([]);
  });

  it("proposes nothing that still breaks a rule", () => {
    // The drafts are mine; the rules are the plan's. A proposed sentence that still shouts, cites a
    // research note, names a lemma by number or leaves its mathematics undelimited would be the
    // review asking the owner to approve the thing it exists to remove.
    const bad = [
      ...Object.entries(PROPOSED),
      ...REPAIRS.filter((r) => r.proposed !== null).map(
        (r) => [r.today, r.proposed] as [string, string],
      ),
    ]
      .map(([key, text]) => ({ key, flags: flagsFor(text) }))
      .filter((x) => x.flags.length > 0)
      .map((x) => `${x.key}: ${x.flags.join("; ")}`);
    expect(bad).toEqual([]);
  });

  it("quotes the ledger's repairs verbatim, so the static list cannot drift", () => {
    // No gallery record fails, so no repair is ever composed and the list cannot be collected by
    // running the corpus. What keeps it honest is that each quoted string must still be IN the
    // source it claims to quote.
    const ledger = readFileSync(
      fileURLToPath(new URL("../src/engine/ledger.ts", import.meta.url)),
      "utf8",
    );
    const missing = REPAIRS.filter((r) => !ledger.includes(r.today)).map((r) => r.today);
    expect(missing).toEqual([]);
  });

  it("reads the templates from the live code, not from a copy", () => {
    // The document is only worth reviewing if `today` is what the app says today.
    const text = claimsDocument();
    for (const id of CLAIM_IDS) {
      if (id === "certificate") continue;
      const template = claimTemplate(id).replace(/\|/g, "\\|");
      expect(text, id).toContain(template);
    }
  });
});
