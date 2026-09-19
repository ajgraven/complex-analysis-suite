// What every ledger sentence says, pinned — including the twenty the gallery never reaches.
//
// M8 step 0.3 turned each claim into a template id plus typed arguments. `test/ledgerDump.test.ts`
// proves the change a no-op over all 28 records × every fixture — and MEASURING that coverage is the
// finding this file exists for: **the corpus reaches 20 of the 40 templates.** The other twenty are
// the failure paths and the sandbox — a contour that does not close, a cut crossed without a side, a
// piece no lemma disposes of, a sandbox with no target — which is precisely where a wording change
// would go unnoticed, because no record produces one.
//
// So the two tests below split the work. `EXPECTED` pins, byte for byte, every template the corpus
// does not reach; the corpus pins the rest; and the union is asserted to be ALL of them, so a
// template added later cannot arrive unpinned — it is either reached by a record or listed here.
//
// Every string in `EXPECTED` was verified against the PRE-RESTRUCTURE `ledger.ts` (commit 2cad10c):
// each template's static fragments were required to appear verbatim in that file, which they do, the
// five seams where the old code concatenated two literals checked by hand.
import katex from "katex";
import { describe, expect, it } from "vitest";

import {
  CLAIM_IDS,
  claimOf,
  certificateClaim,
  certificateClaimAt,
  exactArg,
  pieceArg,
  renderArg,
  renderClaim,
  claimTemplate,
  type ClaimId,
} from "../src/engine/claims.js";
import { FAMILIES } from "../src/families/index.js";
import { everySentence } from "./helpers/claimsDoc.js";
import { solveFamily } from "../src/families/runFamily.js";

/** E3's imported piece, `−e^{−1/4}·√π`, typeset. */
const IMPORTED_LATEX = "-e^{-\\frac{1}{4}} \\cdot \\sqrt{\\pi}";

const piece = pieceArg({ id: "arc", name: "the large arc" });
const cut = { kind: "cut", name: "Γ" } as const;

/** Template → (the args it is given, the sentence it must render). */
const EXPECTED: Partial<
  Record<ClaimId, readonly [Parameters<typeof claimOf>[1], string]>
> = {
  "legality.avoid-singularities": [
    {},
    "the contour must avoid every singularity of the integrand",
  ],
  "legality.not-closed": [{}, "the contour is not closed"],
  "legality.kernel-band": [
    {},
    "$\\pi\\cot\\pi z$ has a pole at every integer, and the contour reaches too many of them to enumerate",
  ],
  "legality.cuts-inadmissible": [
    { detail: { kind: "text", text: "the exponents sum to 1/2" } },
    "the branch cuts do not make the integrand single-valued: the exponents sum to 1/2",
  ],
  "legality.monodromy-undecided": [
    {},
    "a winding number about a branch point could not be decided, so neither could the monodromy",
  ],
  "legality.monodromy-off-sheet": [
    { turns: { kind: "exact", text: "n(γ, b) = 1" } },
    "the integrand is not single-valued along the contour (n(γ, b) = 1)",
  ],
  "legality.cuts-clear": [{}, "no piece crosses a branch cut"],
  "legality.cut-grazed": [
    { piece, cut },
    "the large arc touches the cut $\\Gamma$ tangentially, so it has no side",
  ],
  "legality.cut-crossed": [
    { piece, how: { kind: "text", text: "crosses" }, cut },
    "the large arc crosses the cut $\\Gamma$ with no side assigned",
  ],
  "legality.cut-invariance-one": [
    {},
    "$\\oint_\\gamma f(z)\\,dz$ does not depend on where the cut runs, while the cut avoids $\\gamma$",
  ],
  "legality.cut-invariance-many": [
    {},
    "$\\oint_\\gamma f(z)\\,dz$ does not depend on where the cuts run, while they avoid $\\gamma$",
  ],
  "catch.winding-undecided": [
    {},
    "$\\operatorname{Ind}_\\gamma(a)$ could not be decided — a pole lies too close to $\\gamma$",
  ],
  "catch.residues-inexact": [
    {},
    "some residues are numerical, so the total is an estimate",
  ],
  "kill.l4-inapplicable": [
    { piece },
    "the large arc: the indentation lemma does not apply",
  ],
  "kill.l5-unreadable": [
    { piece },
    "the large arc: $f$ was not recognised in the form $\\left(\\sum_k N_k e^{i a_k z}\\right)/D$",
  ],
  "kill.l5-no-limit": [{ piece }, "the large arc: $z f(z)$ has no limit on the arc"],
  "kill.computed": [
    { piece, length: { kind: "number", value: 3.14159, digits: 3 } },
    "the large arc: evaluated numerically (length 3.14)",
  ],
  "kill.sweep-unreadable": [
    { piece },
    "the large arc: no bound is available — the arc's angle is not a rational multiple of $\\pi$ with denominator at most 12",
  ],
  "kill.no-lemma": [{ piece }, "the large arc: no bound is available for this integrand"],
  "cover.none": [{}, "no target is designated; the closed-contour integral is reported"],
};

/** Every template the gallery actually produces, and the rows it produced them on. */
function corpus(): {
  readonly reached: ReadonlySet<ClaimId>;
  readonly mismatches: readonly string[];
} {
  const reached = new Set<ClaimId>();
  const mismatches: string[] = [];
  for (const family of FAMILIES) {
    for (const golden of family.golden) {
      const r = solveFamily(family, golden);
      if (!r.ok) continue;
      for (const row of r.run.ledger.rows) {
        reached.add(row.claimData.template);
        // THE DERIVED-FIELD INVARIANT. `claim` is a string and `claimData` is its source; they are
        // only trustworthy as a pair because `rowFrom` is the single constructor of a row. This is
        // that sentence, checked rather than asserted in a comment.
        if (row.claim !== renderClaim(row.claimData)) {
          mismatches.push(`${family.id}: ${row.claim} ≠ ${renderClaim(row.claimData)}`);
        }
        // **Every argument the row supplies must be NAMED by its template.** Scanning the rendered
        // text for a leftover `{name}` no longer works: step 0.5b put LaTeX in the templates, and
        // `\operatorname{Ind}`, `\mathbb{Z}` and `e^{iaₖz}` are braces that are mathematics. What the
        // scan was really guarding is the rename slip — a placeholder renamed without its argument —
        // and that shows up here exactly, as an argument the template never mentions.
        const named = new Set(
          [
            ...claimTemplate(row.claimData.template).matchAll(
              /\{([A-Za-z][A-Za-z0-9]*)\}/g,
            ),
          ].map((m) => m[1]),
        );
        for (const key of Object.keys(row.claimData.args)) {
          if (!named.has(key)) {
            mismatches.push(
              `${family.id}: '${key}' is supplied but ${row.claimData.template} never names it`,
            );
          }
        }
      }
    }
  }
  return { reached, mismatches };
}

describe("the ledger's claims", () => {
  it("renders every template the gallery never reaches, byte for byte", () => {
    for (const [id, entry] of Object.entries(EXPECTED)) {
      const [args, text] = entry as readonly [Parameters<typeof claimOf>[1], string];
      expect(renderClaim(claimOf(id as ClaimId, args)), id).toBe(text);
    }
  });

  it("pins EVERY template: reached by a record, or listed above", () => {
    const { reached, mismatches } = corpus();
    expect(mismatches).toEqual([]);
    const pinned = new Set<ClaimId>([
      ...reached,
      ...(Object.keys(EXPECTED) as ClaimId[]),
    ]);
    expect(CLAIM_IDS.filter((id) => !pinned.has(id))).toEqual([]);
    // The measurement itself, kept: half of the ledger's sentences are unreachable from the gallery.
    // If a record ever reaches one of the twenty this number drops, and the entry above becomes
    // redundant rather than wrong — so the assertion is a floor on the corpus, not on the table.
    expect(reached.size).toBeGreaterThanOrEqual(20);
  });

  it("formats each kind of argument the way its call sites need", () => {
    // `count` carries the noun so no template spells a plural — the ledger's two are `piece(s)` and
    // `declared collision(s)`, and its third use carries no noun at all.
    expect(renderArg({ kind: "count", n: 1, noun: "piece" })).toBe("1 piece");
    expect(renderArg({ kind: "count", n: 3, noun: "piece" })).toBe("3 pieces");
    expect(renderArg({ kind: "count", n: 2, noun: "declared collision" })).toBe(
      "2 declared collisions",
    );
    expect(
      renderArg({ kind: "count", n: 2, noun: "singularity", plural: "singularities" }),
    ).toBe("2 singularities");
    expect(renderArg({ kind: "count", n: 7 })).toBe("7");
    // `number` is `toPrecision`, which is what the two measured claims have always used — a
    // clearance and an arc length, both to three significant figures, NOT to three decimals.
    expect(renderArg({ kind: "number", value: 0.04999999, digits: 3 })).toBe("0.0500");
    expect(renderArg({ kind: "number", value: 1234.5, digits: 3 })).toBe("1.23e+3");
    expect(renderArg({ kind: "number", value: 2 })).toBe("2");
    expect(renderArg({ kind: "piece", id: "arc", name: "the large arc" })).toBe(
      "the large arc",
    );
    expect(renderArg({ kind: "exact", text: "π/2" })).toBe("π/2");
    expect(renderArg({ kind: "cut", name: "Γ" })).toBe("Γ");
    expect(renderArg({ kind: "text", text: "crosses" })).toBe("crosses");
  });

  it("never ships an unbalanced `$`", () => {
    // `splitMath` re-joins an odd trailing delimiter as TEXT rather than swallowing the rest of the
    // line — the safe direction — so the defect shows as a stray dollar sign on screen and nothing
    // else. Found in a browser at two per record; this is the check that keeps it found.
    //
    // It reads `everySentence`, the SAME walk the review document reads. When it had its own walk it
    // reached the ledger's rows only, and three sentences that open a `$` and never close it went
    // past it — all three on derivation certificates, which the document could see and this could
    // not. A check with a narrower reach than the thing it checks reports a clean corpus it has not
    // read.
    const unbalanced = everySentence()
      .filter((s) => ((s.text.match(/\$/g) ?? []).length & 1) === 1)
      .map((s) => `${s.familyId} (${s.kind}): ${s.text}`);
    expect([...new Set(unbalanced)]).toEqual([]);
  });

  it("renders every `$…$` body as LaTeX, under KaTeX's own strict mode", () => {
    // **The balance check cannot see this class, and it is the larger one.** A sentence can carry a
    // perfectly balanced `$…$` whose BODY is engine notation — `$I = e^(−1/4)·√π$` — which KaTeX
    // renders as upright letters and a raw `√`, and which no count of delimiters can distinguish
    // from real LaTeX. Six shipped that way, all of them the derivation's headline `$I = …$` line
    // falling back to `text` for want of a `latex` sibling.
    //
    // The instrument is KaTeX itself, at `strict: "error"`. The app renders at `throwOnError: false`
    // and the default `strict: "warn"`, deliberately: a reader must never meet a blank panel because
    // one sentence was malformed. That is a rule about the RENDERER's behaviour on bad input, and
    // this is a rule about the corpus never containing any — the app is lenient so that the failure
    // is visible rather than fatal, and this is what makes it not happen.
    const bad = new Map<string, string>();
    for (const s of everySentence()) {
      const parts = s.text.split("$");
      if (parts.length % 2 === 0) continue; // unbalanced — the check above owns that
      for (let i = 1; i < parts.length; i += 2) {
        try {
          katex.renderToString(parts[i], { throwOnError: true, strict: "error" });
        } catch (e) {
          bad.set(parts[i], `${s.familyId} (${s.kind}): ${(e as Error).message}`);
        }
      }
    }
    expect([...bad.values()]).toEqual([]);
  });

  it("carries a LaTeX sibling on an exact argument that IS an expression", () => {
    // M8 step 0.4b. `exactArg` prints the LaTeX from the same text, so the ledger's rows can be
    // typeset without a second copy of any formula — and it withholds one where the text is not an
    // expression, which is the honest answer for a composed phrase.
    expect(exactArg("sqrt(pi)*exp(-1/4)")).toEqual({
      kind: "exact",
      text: "sqrt(pi)*exp(-1/4)",
      // `\\frac{-1}{4}` rather than `-\\frac{1}{4}`: `-1/4` parses as `(-1)/4`, and lifting a
      // leading minus out of a fraction is a `toLatex` refinement recorded for the presentation
      // pass rather than made here (M8 step 0.4b).
      latex: "\\sqrt{\\pi} \\cdot e^{\\frac{-1}{4}}",
    });
    expect(exactArg("n(γ, b) = 1, n(γ, b') = −1")).toEqual({
      kind: "exact",
      text: "n(γ, b) = 1, n(γ, b') = −1",
    });
    // And on a real row: the imported piece's value is typeset wherever a record imports one.
    const imported = FAMILIES.find((f) => f.id === "gaussian-shift-zero-residue");
    const run = solveFamily(
      imported ?? ({} as never),
      imported?.golden[0] ?? ({} as never),
    );
    expect(run.ok).toBe(true);
    const row = run.ok
      ? run.run.ledger.rows.find((r) => r.claimData.template === "kill.imported")
      : undefined;
    const value = row?.claimData.args.value;
    expect(value?.kind).toBe("exact");
    // Pinned, not merely present: `latex: ""` is defined too, and an empty typeset value on the one
    // row whose whole content is "this number came from outside" is worse than none.
    expect(value?.kind === "exact" ? value.latex : undefined).toBe(IMPORTED_LATEX);
  });

  it("leaves mathematics that looks like a placeholder alone", () => {
    // Braces that are MATHEMATICS, not placeholders — and after step 0.5b put LaTeX in the
    // templates there are many more of them: `\operatorname{Ind}`, `\mathbb{Z}`, `\sqrt{2}`. A
    // renderer that substituted every brace would delete the operator from the sentence. Only a
    // name the claim actually supplies is replaced, which is why these survive.
    expect(renderClaim(claimOf("kill.l5-unreadable", { piece }))).toContain(
      "$f$ was not recognised in the form $\\left(\\sum_k N_k e^{i a_k z}\\right)/D$",
    );
    expect(renderClaim(claimOf("catch.winding-undecided"))).toContain("\\operatorname{Ind}");
  });

  it("leaves a placeholder STANDING when its argument is missing, rather than deleting it", () => {
    // The sweep's one survivor, and the reason it is worth a test: nothing in the corpus or the
    // table above renders a claim with a missing argument, so the fallback is unobservable today —
    // and step 0.5 rewrites every template, where renaming a placeholder without renaming its
    // argument is exactly the slip that would otherwise delete a piece's name from a sentence in
    // silence. Standing text is a defect a reader can SEE; an empty gap is not.
    expect(renderClaim({ template: "kill.target", args: {} })).toBe("{piece}: the target");
  });

  it("carries a certificate's own sentence through unchanged", () => {
    const text = "the semicircle → 0 as R → ∞, since |∫| ≤ 3.14/R";
    expect(renderClaim(certificateClaim(text))).toBe(text);
  });

  it("lifts the parameter out of the `at $… = value$` group, and out of no other numeral", () => {
    // M8 step 3.2's locator, which nothing tested directly. It is deliberately narrow in two ways
    // at once — the value must sit in an `at $… = ‹value›$` group with no `$` between the opener
    // and it, AND the left-hand side of that `=` must be the parameter's own symbol — and either
    // way it must fall back to the sentence the producer wrote rather than plant a scrub on a
    // numeral that is not the parameter. In every case the rendered sentence is the ORIGINAL,
    // character for character: the split is invisible to a reader by construction.
    const R = { name: "R", value: 4 } as const;

    // The positive control, without which the three refusals below are satisfied by a function
    // that never splits anything.
    const splits = "the semicircle → 0 as R → ∞, since |∫| ≤ 4.93e-2 at $R = 4$";
    const claim = certificateClaimAt(splits, R);
    expect(renderClaim(claim), "the split changed what a reader sees").toBe(splits);
    expect(claim.args.param?.kind).toBe("param");
    // Pinned as a PAIR: the head has to end on the unmatched `$` the card reopens by hand, and the
    // tail on its partner — `claimText` slices on exactly that, so a cut one character off would
    // print a stray delimiter and nothing here would have noticed.
    expect([
      renderArg(claim.args.head ?? { kind: "text", text: "" }),
      renderArg(claim.args.tail ?? { kind: "text", text: "" }),
    ]).toEqual(["the semicircle → 0 as R → ∞, since |∫| ≤ 4.93e-2 at $R = ", "$"]);

    /** Did the sentence keep its number, or hand it over as a scrubbable parameter? */
    const kindAt = (text: string): string =>
      `${renderClaim(certificateClaimAt(text, R)) === text ? "same text" : "REWRITTEN"}, param ${certificateClaimAt(text, R).args.param?.kind}`;
    expect(kindAt(splits), "the control").toBe("same text, param param");

    // **A `$` between the opener and the `= 4$`**, which is what stops the search running out of
    // the group it opened: the `4` here belongs to a degree gap two formulas later, and a scrub
    // planted on it would write the contour's radius when a reader dragged a number that is not it.
    expect(kindAt("at $R$ fixed, the degree gap $d = 4$"), "the search left its own group").toBe(
      "same text, param text",
    );
    // **A different quantity that happens to equal the parameter** — `gaussianSide`'s own sentence,
    // where the abscissa equals `R` on every E3 fixture. Measured before the symbol half was added:
    // 18 rows took a scrub planted on the numeral in *Re z*, and only the RIGHT side of the
    // rectangle did, because the left one prints `= -4$`.
    expect(kindAt("at $\\operatorname{Re} z = 4$"), "a numeral that is not the parameter").toBe(
      "same text, param text",
    );

    // MEASURED, and the reason this test pins the OUTCOME of both halves rather than one each:
    // today the `$` half is SUBSUMED by the symbol half. `trim` removes whitespace only and no
    // `paramSymbol` output contains a `$`, so any left-hand side carrying one already fails the
    // symbol comparison — brute-forced over 111,110 sentences built from an atom grammar aimed at
    // exactly this case (`at $`, `$`, `R`, `= 4$`, …), with zero disagreements. The `$` clause is
    // kept because it is about the SHAPE of the group rather than its contents, and it predates
    // the symbol clause; but a mutation deleting it is equivalent, and saying so here is cheaper
    // than the next reader re-deriving it.
    expect(
      certificateClaimAt("at $R$ fixed, the degree gap $d = 4$", R).args.param,
    ).toEqual({ kind: "text", text: "" });
  });
});
