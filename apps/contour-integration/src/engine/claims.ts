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
  | { readonly kind: "piece"; readonly id: string; readonly name: string; readonly role?: PieceRole }
  /** A number of things, with the noun it counts, so a template need not spell the plural. */
  | { readonly kind: "count"; readonly n: number; readonly noun?: string; readonly plural?: string }
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
  "legality.avoid-singularities": "the contour must avoid every singularity of the integrand",
  "legality.closed": "the contour is closed and its orientation is declared",
  "legality.not-closed": "the contour does not close",
  "legality.clearance": "every singularity is clear of the contour (nearest at {nearest})",
  "legality.entire":
    "the integrand is entire, so there is no singularity for the contour to be clear of",
  "legality.kernel-band":
    "the kernel has a pole at every integer, and this contour reaches too many of them to check",
  "legality.cuts-admissible": "the cut system is admissible — {detail}",
  "legality.cuts-inadmissible": "the cut system is not admissible: {detail}",
  "legality.monodromy-undecided":
    "the winding about a branch point is undecided, so the monodromy along the contour is too",
  "legality.monodromy-off-sheet":
    "the contour winds about a branch point and does not close on one sheet ({turns})",
  "legality.monodromy-on-sheet":
    "the contour winds about a branch point and still closes on one sheet (Σ n(γ,bⱼ)·αⱼ = {sum} ∈ ℤ)",
  "legality.cuts-clear": "no piece of the contour meets a branch cut, except where it ends on one",
  "legality.cuts-sided":
    "every piece that meets a branch cut declares the side it runs on ({declared})",
  "legality.cut-grazed": "{piece} grazes the cut '{cut}', so it has no side to declare",
  "legality.cut-crossed": "{piece} {how} the cut '{cut}' without declaring which side it runs on",
  "legality.cut-invariance-one":
    "∮ is unchanged by moving this cut, while they stay clear of the contour",
  "legality.cut-invariance-many":
    "∮ is unchanged by moving these cuts, while they stay clear of the contour",

  // ---- CATCH -------------------------------------------------------------------------------
  "catch.enclosed-one": "1 singularity is enclosed, with an exactly decided winding number",
  "catch.enclosed-many": "{n} singularities are enclosed, each with an exactly decided winding number",
  "catch.winding-undecided": "a winding number could not be decided",
  "catch.residues-exact": "every enclosed residue is known exactly",
  "catch.residues-exact-kernel":
    "every enclosed residue is known exactly — the kernel's at each integer, the cofactor's as an exact quotient",
  "catch.residues-exact-merged":
    "every enclosed residue is known exactly — the kernel's at each integer, and the MERGED one from the Laurent route",
  "catch.sum-exact": "Σ Res is known exactly, though no individual residue is expressible",
  "catch.residues-inexact": "not every residue is known exactly, so the total is an estimate",
  "catch.escalation":
    "a stated hypothesis FAILS and a stronger argument applies: {to}, over {collisions}",

  // ---- KILL --------------------------------------------------------------------------------
  "kill.target": "{piece} is the target — it is what the argument solves for",
  "kill.l4-inapplicable": "{piece} is an indentation, but L4 does not apply here",
  "kill.l5-unreadable": "{piece} is declared L5, but f could not be read as (Σ Nₖ e^{iaₖz})/D",
  "kill.l5-no-limit": "{piece} is declared L5, but z·f(z) has no limit along it",
  "kill.reproduces": "{piece} reproduces the target, as a multiple the solve reads off the family",
  "kill.imported": "{piece} is {value} — imported, not derived here",
  "kill.computed": "{piece} is computed directly ({length} long)",
  "kill.sweep-unreadable":
    "{piece} must vanish, but its sweep is not an exact multiple of π and no bound can be stated",
  "kill.no-lemma": "{piece} must vanish, but no lemma here applies to this integrand",

  // ---- COVER -------------------------------------------------------------------------------
  "cover.on-contour": "the target appears as a labelled piece of the closed contour",
  "cover.in-sum":
    "{id} is a TERM of the residue sum — the kernel's poles at the integers — not a piece of the contour",
  "cover.in-sum-weighted":
    "{id} is a TERM of the residue sum — the kernel's poles at the integers — not a piece of the contour, at weight {weight}",
  "cover.none":
    "no piece is marked as the target, so the ledger reports the closed-contour value itself",

  // ---- the boundary ------------------------------------------------------------------------
  /** A certificate's own sentence, shown as the row's claim. See this module's header. */
  certificate: "{text}",
} as const satisfies Readonly<Record<string, string>>;

export type ClaimId = keyof typeof TEMPLATE;

/** Build a claim. The args are checked against the template by {@link renderClaim}'s output. */
export function claimOf(template: ClaimId, args: Readonly<Record<string, ClaimArg>> = {}): Claim {
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
export function pieceArg(piece: { readonly id: string; readonly name: string; readonly role?: PieceRole }): ClaimArg {
  return { kind: "piece", id: piece.id, name: piece.name, ...(piece.role === undefined ? {} : { role: piece.role }) };
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
      return arg.digits === undefined ? String(arg.value) : arg.value.toPrecision(arg.digits);
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
