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
import { describe, expect, it } from "vitest";

import {
  CLAIM_IDS,
  claimOf,
  certificateClaim,
  exactArg,
  pieceArg,
  renderArg,
  renderClaim,
  type ClaimId,
} from "../src/engine/claims.js";
import { FAMILIES } from "../src/families/index.js";
import { solveFamily } from "../src/families/runFamily.js";

/** E3's imported piece, `−e^{−1/4}·√π`, typeset. */
const IMPORTED_LATEX = "-e^{-\\frac{1}{4}} \\cdot \\sqrt{\\pi}";

const piece = pieceArg({ id: "arc", name: "the large arc" });
const cut = { kind: "cut", name: "Γ" } as const;

/** Template → (the args it is given, the sentence it must render). */
const EXPECTED: Partial<Record<ClaimId, readonly [Parameters<typeof claimOf>[1], string]>> = {
  "legality.avoid-singularities": [{}, "the contour must avoid every singularity of the integrand"],
  "legality.not-closed": [{}, "the contour does not close"],
  "legality.kernel-band": [
    {},
    "the kernel has a pole at every integer, and this contour reaches too many of them to check",
  ],
  "legality.cuts-inadmissible": [
    { detail: { kind: "text", text: "the exponents sum to 1/2" } },
    "the cut system is not admissible: the exponents sum to 1/2",
  ],
  "legality.monodromy-undecided": [
    {},
    "the winding about a branch point is undecided, so the monodromy along the contour is too",
  ],
  "legality.monodromy-off-sheet": [
    { turns: { kind: "exact", text: "n(γ, b) = 1" } },
    "the contour winds about a branch point and does not close on one sheet (n(γ, b) = 1)",
  ],
  "legality.cuts-clear": [
    {},
    "no piece of the contour meets a branch cut, except where it ends on one",
  ],
  "legality.cut-grazed": [
    { piece, cut },
    "the large arc grazes the cut 'Γ', so it has no side to declare",
  ],
  "legality.cut-crossed": [
    { piece, how: { kind: "text", text: "crosses" }, cut },
    "the large arc crosses the cut 'Γ' without declaring which side it runs on",
  ],
  "legality.cut-invariance-one": [
    {},
    "∮ is unchanged by moving this cut, while they stay clear of the contour",
  ],
  "legality.cut-invariance-many": [
    {},
    "∮ is unchanged by moving these cuts, while they stay clear of the contour",
  ],
  "catch.winding-undecided": [{}, "a winding number could not be decided"],
  "catch.residues-inexact": [
    {},
    "not every residue is known exactly, so the total is an estimate",
  ],
  "kill.l4-inapplicable": [{ piece }, "the large arc is an indentation, but L4 does not apply here"],
  "kill.l5-unreadable": [
    { piece },
    "the large arc is declared L5, but f could not be read as (Σ Nₖ e^{iaₖz})/D",
  ],
  "kill.l5-no-limit": [{ piece }, "the large arc is declared L5, but z·f(z) has no limit along it"],
  "kill.computed": [
    { piece, length: { kind: "number", value: 3.14159, digits: 3 } },
    "the large arc is computed directly (3.14 long)",
  ],
  "kill.sweep-unreadable": [
    { piece },
    "the large arc must vanish, but its sweep is not an exact multiple of π and no bound can be stated",
  ],
  "kill.no-lemma": [
    { piece },
    "the large arc must vanish, but no lemma here applies to this integrand",
  ],
  "cover.none": [
    {},
    "no piece is marked as the target, so the ledger reports the closed-contour value itself",
  ],
};

/** Every template the gallery actually produces, and the rows it produced them on. */
function corpus(): { readonly reached: ReadonlySet<ClaimId>; readonly mismatches: readonly string[] } {
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
        // A placeholder with no argument is left standing by the renderer, deliberately, so that it
        // shows up as text rather than as a thrown error inside a fatal boundary. Nothing may ship
        // one.
        if (/\{[A-Za-z][A-Za-z0-9]*\}/.test(row.claim.replace("e^{iaₖz}", ""))) {
          mismatches.push(`${family.id}: an unfilled placeholder in — ${row.claim}`);
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
    const pinned = new Set<ClaimId>([...reached, ...(Object.keys(EXPECTED) as ClaimId[])]);
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
    expect(renderArg({ kind: "count", n: 2, noun: "singularity", plural: "singularities" })).toBe(
      "2 singularities",
    );
    expect(renderArg({ kind: "count", n: 7 })).toBe("7");
    // `number` is `toPrecision`, which is what the two measured claims have always used — a
    // clearance and an arc length, both to three significant figures, NOT to three decimals.
    expect(renderArg({ kind: "number", value: 0.04999999, digits: 3 })).toBe("0.0500");
    expect(renderArg({ kind: "number", value: 1234.5, digits: 3 })).toBe("1.23e+3");
    expect(renderArg({ kind: "number", value: 2 })).toBe("2");
    expect(renderArg({ kind: "piece", id: "arc", name: "the large arc" })).toBe("the large arc");
    expect(renderArg({ kind: "exact", text: "π/2" })).toBe("π/2");
    expect(renderArg({ kind: "cut", name: "Γ" })).toBe("Γ");
    expect(renderArg({ kind: "text", text: "crosses" })).toBe("crosses");
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
    const run = solveFamily(imported ?? ({} as never), imported?.golden[0] ?? ({} as never));
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
    // `e^{iaₖz}` is in a template, and `ₖ` is not an ASCII alphanumeric — which is the whole reason
    // the pattern is narrow. A renderer that treated every brace as a placeholder would delete the
    // exponent from the one claim that names the decomposition L5 needs.
    expect(renderClaim(claimOf("kill.l5-unreadable", { piece }))).toContain("e^{iaₖz}");
  });

  it("leaves a placeholder STANDING when its argument is missing, rather than deleting it", () => {
    // The sweep's one survivor, and the reason it is worth a test: nothing in the corpus or the
    // table above renders a claim with a missing argument, so the fallback is unobservable today —
    // and step 0.5 rewrites every template, where renaming a placeholder without renaming its
    // argument is exactly the slip that would otherwise delete a piece's name from a sentence in
    // silence. Standing text is a defect a reader can SEE; an empty gap is not.
    expect(renderClaim({ template: "kill.target", args: {} })).toBe(
      "{piece} is the target — it is what the argument solves for",
    );
  });

  it("carries a certificate's own sentence through unchanged", () => {
    const text = "the semicircle → 0 as R → ∞, since |∫| ≤ 3.14/R";
    expect(renderClaim(certificateClaim(text))).toBe(text);
  });
});
