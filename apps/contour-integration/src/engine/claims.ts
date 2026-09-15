// What a ledger row SAYS, as data rather than as a sentence.
//
// Every row of the Closing Ledger carried a string built at its call site — `${piece.name} is the
// target — it is what the argument solves for` — which made three things impossible at once. The
// wording could not be changed in one place (M8 step 0.5 rewrites it); a LaTeX sibling could not be
// put beside the parts that are mathematics rather than prose (step 0.4); and nothing could tell a
// piece NAME inside a sentence from the prose around it, so a renderer had no way to typeset one and
// not the other.
//
// So a claim is a **template id plus typed arguments**, and {@link renderClaim} is the one place it
// becomes text. Step 0.3 changes no wording at all: every template below reproduces its call site's
// string byte for byte, proven over all 28 records × every fixture by `test/ledgerDump.test.ts`.
// Step 0.5 then edits these templates, and that same test says exactly which sentences moved.
//
// **THE BOUNDARY: bounds and kernel certificates stay strings.** A claim minted in
// `src/kernel/bounds/*` or `src/kernel/branch/*` — `the semicircle → 0 as R → ∞, since |∫| ≤ …` —
// bakes its numbers into its own sentence, next to the arithmetic that produced them, and it is the
// CERTIFICATE's claim rather than the row's. Restructuring those buys little: the new shell renders
// such a string with `$…$` delimiters (step 0.5 introduces the convention), and the numbers in them
// are already formatted by the module that knows their provenance. A row that displays one of those
// carries it through {@link certificateClaim} — a single `text` argument, which is what "this
// sentence is not ours to template" looks like in the type.
import type { PieceRole } from "./contour/model.js";
import { latexOf } from "../kernel/exprLatex.js";

/**
 * One substitutable part of a claim.
 *
 * The kinds exist to be told apart by a RENDERER, not by this module: `piece` is a name to be shown
 * as a name, `exact` is mathematics that step 0.4 gives a LaTeX sibling, `text` is prose composed
 * elsewhere and passed through. Two kinds of the plan's list are deliberately absent — `cx`, because
 * no ledger row renders a complex number (values reach the reader through the result card and the
 * derivation's solve stage, neither of which is a row).
 */
export type ClaimArg =
  | {
      readonly kind: "piece";
      readonly id: string;
      readonly name: string;
      readonly role?: PieceRole;
    }
  /** A number of things, with the noun it counts, so a template need not spell the plural. */
  | {
      readonly kind: "count";
      readonly n: number;
      readonly noun?: string;
      readonly plural?: string;
    }
  /** A measured quantity. `digits` is `toPrecision`'s, absent meaning the plain decimal. */
  | { readonly kind: "number"; readonly value: number; readonly digits?: number }
  /** Mathematics, already written the way the engine writes it. Step 0.4 adds `latex`. */
  | { readonly kind: "exact"; readonly text: string; readonly latex?: string }
  | { readonly kind: "cut"; readonly name: string }
  /** Prose composed elsewhere — a certificate's own claim, a lemma's detail. Not ours to template. */
  | { readonly kind: "text"; readonly text: string };

/** What a ledger row asserts: one template, and the parts that vary. */
export interface Claim {
  readonly template: ClaimId;
  readonly args: Readonly<Record<string, ClaimArg>>;
}

/**
 * Every sentence the ledger can assert.
 *
 * One id per WORDING, not per row: the cut row has four templates because it says four different
 * things, and `catch.enclosed-one` is separate from `catch.enclosed-many` because "with an exactly
 * decided winding number" and "each with an exactly decided winding number" are two sentences and a
 * plural rule would not produce the second from the first.
 */
const TEMPLATE = {
  // ---- LEGALITY ----------------------------------------------------------------------------
  "legality.avoid-singularities":
    "the contour must avoid every singularity of the integrand",
  "legality.closed": "the contour is closed (orientation as drawn)",
  "legality.not-closed": "the contour is not closed",
  "legality.clearance": "no singularity lies on the contour (nearest distance {nearest})",
  "legality.entire": "the integrand is entire; there are no singularities",
  "legality.kernel-band":
    "$\\pi\\cot\\pi z$ has a pole at every integer, and the contour reaches too many of them to enumerate",
  "legality.cuts-admissible":
    "the branch cuts make the integrand single-valued off them — {detail}",
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
  "legality.cut-grazed":
    "{piece} touches the cut $\\Gamma$ tangentially, so it has no side",
  "legality.cut-crossed": "{piece} crosses the cut $\\Gamma$ with no side assigned",
  "legality.cut-invariance-one":
    "$\\oint_\\gamma f(z)\\,dz$ does not depend on where the cut runs, while the cut avoids $\\gamma$",
  "legality.cut-invariance-many":
    "$\\oint_\\gamma f(z)\\,dz$ does not depend on where the cuts run, while they avoid $\\gamma$",

  // ---- CATCH -------------------------------------------------------------------------------
  "catch.enclosed-one":
    "$\\operatorname{Ind}_\\gamma(a) \\neq 0$ at 1 singularity, decided exactly",
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
  "kill.imported": "{piece} = {value} — a known integral, not derived here",
  "kill.computed": "{piece}: evaluated numerically (length {length})",
  "kill.sweep-unreadable":
    "{piece}: no bound is available — the arc's angle is not a rational multiple of $\\pi$ with denominator at most 12",
  "kill.no-lemma": "{piece}: no bound is available for this integrand",

  // ---- COVER -------------------------------------------------------------------------------
  "cover.on-contour": "the target is a piece of the contour",
  "cover.in-sum":
    "{id} is the sum of the residues at the integers, not a piece of the contour",
  "cover.in-sum-weighted":
    "{id} is the sum of the residues at the integers, not a piece of the contour (weight {weight})",
  "cover.none": "no target is designated; the closed-contour integral is reported",

  // ---- the boundary ------------------------------------------------------------------------
  /** A certificate's own sentence, shown as the row's claim. See this module's header. */
  certificate: "{text}",
} as const satisfies Readonly<Record<string, string>>;

export type ClaimId = keyof typeof TEMPLATE;

/** Build a claim. The args are checked against the template by {@link renderClaim}'s output. */
export function claimOf(
  template: ClaimId,
  args: Readonly<Record<string, ClaimArg>> = {},
): Claim {
  return { template, args };
}

/** A sentence composed outside this module, carried through unchanged. */
export function certificateClaim(text: string): Claim {
  return claimOf("certificate", { text: { kind: "text", text } });
}

/**
 * An expression the reader sees as mathematics, with its LaTeX sibling PRINTED rather than written.
 *
 * `latex` is absent when the text is not an expression — a composed phrase such as the monodromy
 * row's `n(γ, b) = 1, n(γ, b') = −1`, which is a sentence about several windings rather than one
 * value. Absent is the honest answer there; step 0.5 gives such a phrase its `$…$` delimiters.
 */
export function exactArg(text: string): ClaimArg {
  const latex = latexOf(text);
  return { kind: "exact", text, ...(latex === null ? {} : { latex }) };
}

/** A piece of the contour, by the name the reader sees on it. */
export function pieceArg(piece: {
  readonly id: string;
  readonly name: string;
  readonly role?: PieceRole;
}): ClaimArg {
  return {
    kind: "piece",
    id: piece.id,
    name: piece.name,
    ...(piece.role === undefined ? {} : { role: piece.role }),
  };
}

/** One argument, as text. */
export function renderArg(arg: ClaimArg): string {
  switch (arg.kind) {
    case "piece":
      return arg.name;
    case "count":
      if (arg.noun === undefined) return String(arg.n);
      return `${arg.n} ${arg.n === 1 ? arg.noun : (arg.plural ?? `${arg.noun}s`)}`;
    case "number":
      return arg.digits === undefined
        ? String(arg.value)
        : arg.value.toPrecision(arg.digits);
    case "exact":
      return arg.text;
    case "cut":
      return arg.name;
    case "text":
      return arg.text;
  }
}

// A placeholder is an ASCII identifier in braces, and nothing else is touched. The templates
// themselves contain braces that are MATHEMATICS — `(Σ Nₖ e^{iaₖz})/D` — so the pattern is
// deliberately narrow: `{iaₖz}` does not match, because `ₖ` is not an ASCII alphanumeric. An
// argument the template never names is silently unused, and a placeholder with no argument is left
// standing, which the corpus dump sees immediately as a claim that changed.
const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

/** The claim as one line of text — the only place a claim becomes a sentence. */
export function renderClaim(claim: Claim): string {
  return TEMPLATE[claim.template].replace(PLACEHOLDER, (whole, name: string) => {
    const arg = claim.args[name];
    return arg === undefined ? whole : renderArg(arg);
  });
}

/** The template a claim uses, as text — for a test that needs the wording without a ledger. */
export function claimTemplate(id: ClaimId): string {
  return TEMPLATE[id];
}

/** Every template id, for tests that must not miss one. */
export const CLAIM_IDS = Object.keys(TEMPLATE) as readonly ClaimId[];
