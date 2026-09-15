// The proposed wording, as a table rather than as a column in a markdown file.
//
// M8 step 0.5a. `claimsDoc.ts` renders `docs/contour-integration/M8/claims.md` from this, and step
// 0.5b reads it to make the change — so regenerating the document cannot lose an edit, and an edit
// cannot be made in the document without reaching the code.
//
// Keys are either a `ClaimId`, one of the synthetic keys `headline.*` / `stage.*`, or a sentence
// with its numerals masked by `claimsDoc.ts`'s `mask` (so `at R = 50` and `at R = 8` are one entry).
// A missing key means "no replacement proposed" and renders as **—**: either the sentence is fine,
// or it needs a decision, and the document's computed flags say which.
//
// The drafts come from `docs/contour-integration/M8/review-inputs/content-review.md` §2, which wrote
// most of them. Mathematics is inside `$…$` — the delimiter convention step 0.5b introduces, where
// text renders as text and what is between the dollars renders through KaTeX.

/** Proposed replacement, keyed by `ClaimId` or by a masked sentence. */
export const PROPOSED: Readonly<Record<string, string>> = {
  // ---- LEGALITY ----------------------------------------------------------------------------
  "legality.closed": "the contour is closed (orientation as drawn)",
  "legality.not-closed": "the contour is not closed",
  "legality.clearance": "no singularity lies on the contour (nearest distance {nearest})",
  "legality.entire": "the integrand is entire; there are no singularities",
  "legality.kernel-band":
    "$\\pi\\cot\\pi z$ has a pole at every integer, and the contour reaches too many of them to enumerate",
  "legality.cuts-admissible": "the branch cuts make the integrand single-valued off them — {detail}",
  "legality.cuts-inadmissible":
    "the branch cuts do not make the integrand single-valued: {detail}",
  "legality.monodromy-undecided":
    "a winding number about a branch point could not be decided, so neither could the monodromy",
  "legality.monodromy-off-sheet":
    "the integrand is not single-valued along the contour ({turns})",
  "legality.monodromy-on-sheet":
    "the integrand is single-valued along the contour: $\\sum_j \\operatorname{Ind}_\\gamma(b_j)\\,\\alpha_j = {sum} \\in \\mathbb{Z}$",
  "legality.cuts-clear": "no piece crosses a branch cut",
  "legality.cuts-sided": "each piece meeting a cut is assigned a side ({declared})",
  "legality.cut-grazed": "{piece} touches the cut $\\Gamma$ tangentially, so it has no side",
  "legality.cut-crossed": "{piece} crosses the cut $\\Gamma$ with no side assigned",
  "legality.cut-invariance-one":
    "$\\oint_\\gamma f(z)\\,dz$ does not depend on where the cut runs, while the cut avoids $\\gamma$",
  "legality.cut-invariance-many":
    "$\\oint_\\gamma f(z)\\,dz$ does not depend on where the cuts run, while they avoid $\\gamma$",

  // ---- CATCH -------------------------------------------------------------------------------
  "catch.enclosed-one": "$\\operatorname{Ind}_\\gamma(a) \\neq 0$ at 1 singularity, decided exactly",
  "catch.enclosed-many":
    "$\\operatorname{Ind}_\\gamma(a) \\neq 0$ at {n} singularities, each decided exactly",
  "catch.winding-undecided":
    "$\\operatorname{Ind}_\\gamma(a)$ could not be decided — a pole lies too close to $\\gamma$",
  "catch.residues-exact": "every enclosed residue is exact",
  "catch.residues-exact-kernel":
    "every enclosed residue is exact — the kernel's at each integer, and $K(z_j)\\operatorname{Res}(f, z_j)$ at each pole of $f$",
  "catch.residues-exact-merged":
    "every enclosed residue is exact, including the merged pole, whose residue comes from the Laurent expansion of the product",
  "catch.sum-exact":
    "the residue sum is exact — the individual residues lie outside $\\mathbb{Q}(i)(\\sqrt{d})$, the sum does not",
  "catch.residues-inexact": "some residues are numerical, so the total is an estimate",
  "catch.escalation":
    "$f$ has a pole where the kernel has one; the two combine into a single pole, whose residue comes from the Laurent expansion of the product ({collisions})",

  // ---- KILL --------------------------------------------------------------------------------
  "kill.target": "{piece}: the target",
  "kill.l4-inapplicable": "{piece}: the indentation lemma does not apply",
  "kill.l5-unreadable":
    "{piece}: $f$ was not recognised in the form $\\left(\\sum_k N_k e^{i a_k z}\\right)/D$",
  "kill.l5-no-limit": "{piece}: $z f(z)$ has no limit on the arc",
  "kill.reproduces": "{piece}: a constant multiple of the target",
  "kill.imported": "{piece} $= ${value}$ — a known integral, not derived here",
  "kill.computed": "{piece}: evaluated numerically (length {length})",
  "kill.sweep-unreadable":
    "{piece}: no bound is available — the arc's angle is not a rational multiple of $\\pi$ with denominator at most 12",
  "kill.no-lemma": "{piece}: no bound is available for this integrand",

  // ---- COVER -------------------------------------------------------------------------------
  "cover.on-contour": "the target is a piece of the contour",
  "cover.in-sum": "the target is the sum of the residues at the integers, not a piece of the contour",
  "cover.in-sum-weighted":
    "the target is the sum of the residues at the integers, not a piece of the contour (weight {weight})",
  "cover.none": "no target is designated; the closed-contour integral is reported",

  // ---- headlines ---------------------------------------------------------------------------
  "headline.closes": "The argument is complete.",
  "headline.sandbox": "$\\oint_\\gamma f(z)\\,dz$ is established exactly.",
  "headline.incomplete": "The argument is incomplete.",
  "headline.fails.LEGALITY": "The argument is incomplete: the residue theorem does not apply.",
  "headline.fails.CATCH": "The argument is incomplete: a residue is not determined.",
  "headline.fails.KILL": "The argument is incomplete: a boundary term does not vanish.",
  "headline.fails.COVER": "The argument is incomplete: the target is not on the contour.",

  // ---- derivation stages -------------------------------------------------------------------
  "stage.setup.why":
    "The integral to be evaluated, the integrand on the contour, and how the two are related.",
  "stage.legality.why":
    "The contour is closed and meets no singularity; with a branch cut, the integrand is single-valued along it.",
  "stage.catch.why":
    "The singularities, their winding numbers $\\operatorname{Ind}_\\gamma(a)$, and their residues.",
  "stage.kill.why":
    "Each piece other than the target: a bound at finite $R$ (or $\\varepsilon$), and its limit.",
  "stage.cover.why": "The target integral as a piece of the contour.",
  "stage.solve.why": "The residue theorem, solved for the target.",
  "stage.verdict.why":
    "The rigor of the conclusion is the weakest of its steps: $=$ exact, $\\le$ rigorous bound, $\\approx$ numerical.",

  // ---- the four internal citations -----------------------------------------------------------
  // Keyed by the sentence with its numerals masked. A reader has no "research 06"; these are the
  // strings the review (X4) says must go, and an empty proposal means DELETE the sentence.
  "declared by its role; the coefficient enters Pass ‹n›'s M rather than the right-hand side":
    "the piece is a constant multiple of the target; its coefficient enters the linear system",
  "exact winding numbers against exact exponents, summed over ℚ — the admissibility arithmetic of research ‹n› §‹n›(b), read along the contour":
    "$\\sum_j \\operatorname{Ind}_\\gamma(b_j)\\,\\alpha_j$, over exact winding numbers and exact exponents",
  "research ‹n› §‹n›, decided over ℚ: every genuine branch point is on the forest, every bounded component sums to an integer, and no log is bounded":
    "each bounded cut joins branch points whose exponents sum to an integer; every logarithmic branch point is joined to $\\infty$",
  "research ‹n› §‹n› states this bound without the π from π cot(πz), and it is then not an upper bound at all — ‹n› against a measured ‹n› at N = ‹n› (finding D‹n›)":
    "",
};

/**
 * The ledger's repair lines, shown beneath a failing row.
 *
 * Static rather than collected, because no gallery record fails and so none is ever composed — and
 * checked against `engine/ledger.ts` by `test/claimsDoc.test.ts`, so the list cannot drift from the
 * strings it claims to quote.
 */
export const REPAIRS: readonly { readonly today: string; readonly proposed: string | null }[] = [
  {
    today: "indent the contour around the singularity, or move it",
    proposed: "Indent around the singularity, or move the contour.",
  },
  { today: "join the last piece back to the first", proposed: null },
  {
    today: "shrink the contour, or reduce the limit parameter",
    proposed: "Reduce $N$.",
  },
  {
    today:
      "indent the contour around the branch point (a keyhole), or take in the whole bounded component so the exponents sum to an integer (a dogbone)",
    proposed: "Exclude the branch point (a keyhole), or enclose the whole cut (a dogbone).",
  },
  {
    today: "move the cut clear of the contour, or move the contour",
    proposed: "Move the cut clear of the contour, or move the contour.",
  },
  {
    today: "tag this segment `above` or `below`, or move the cut",
    proposed: "Assign the piece to the upper or lower side of the cut, or move the cut.",
  },
  { today: "move the contour clear of the pole", proposed: null },
  {
    today:
      "L4 needs a simple pole at the centre of the arc; at order ≥ 2 no limit exists and no principal value does either",
    proposed:
      "The indentation lemma requires a simple pole; at order $\\ge 2$ the limit does not exist, and neither does the principal value.",
  },
  {
    today:
      "L5 needs z·f(z) → L uniformly; without it the arc's contribution is not a number the argument can use",
    proposed: "The large-arc lemma requires $z f(z) \\to L$ uniformly on the arc.",
  },
  { today: "the numeric value still stands, but the limit is not established", proposed: null },
  { today: "close the contour through the other half-plane", proposed: null },
  {
    today: "this lemma is too weak here — a sharper one may still apply",
    proposed: "The ML-estimate does not vanish; Jordan's lemma or an indentation may still apply.",
  },
];
