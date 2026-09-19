// The names the argument's parts go by ON SCREEN — and the one place they are decided.
//
// The Closing Ledger's four constraints are `LEGALITY / CATCH / KILL / COVER` in the code, and they
// stay that way: they key the contrast ladder's rows (`CONSTRAINT/role#n`), the drill's mask, the
// permalink and every test that reads a row. What they must never be is a **label**. A mathematician
// meeting `KILL` in a column beside a claim reads house jargon, and the four words are not even
// descriptive of what they check — M8 step 0.2.
//
// So: ids are data, labels are display, and neither is derived from the other by spelling. The two
// id spaces the app already had — a `ConstraintId` for a ledger row and a `StageId` for a derivation
// heading — are declared HERE rather than in `ledger.ts` and `derivation.ts`, because both of those
// modules need the labels and a type-only import back would be a cycle (`.dependency-cruiser.cjs`'s
// `no-circular` runs over type-only edges too). Each re-exports its own id type, so no consumer
// changed.
import type { PieceRole } from "./contour/model.js";

/** One of the Closing Ledger's four constraints. A DATA KEY: see {@link constraintLabel}. */
export type ConstraintId = "LEGALITY" | "CATCH" | "KILL" | "COVER";

/** One step of the generated derivation. A DATA KEY: see {@link stageTitle}. */
export type StageId =
  "setup" | "legality" | "catch" | "kill" | "cover" | "solve" | "verdict";

/**
 * What each constraint is called on screen.
 *
 * Textbook names for what the group actually checks: that the theorem's hypotheses hold, that the
 * residues and winding numbers are known, that every piece which is not the target is disposed of,
 * and that the target is on the contour at all.
 */
const GROUP: Readonly<Record<ConstraintId, string>> = {
  LEGALITY: "Hypotheses",
  CATCH: "Residues",
  KILL: "Boundary terms",
  COVER: "Target",
};

export function constraintLabel(id: ConstraintId): string {
  return GROUP[id];
}

/**
 * The derivation's headings.
 *
 * The four middle stages read their titles OUT OF {@link GROUP} rather than repeating them, so a
 * ledger row and the derivation heading above the same claim cannot come to disagree.
 */
const STAGE_TITLE: Readonly<Record<StageId, string>> = {
  setup: "The problem",
  legality: GROUP.LEGALITY,
  catch: GROUP.CATCH,
  kill: GROUP.KILL,
  cover: GROUP.COVER,
  solve: "Solution",
  verdict: "Conclusion",
};

export function stageTitle(id: StageId): string {
  return STAGE_TITLE[id];
}

/**
 * What a piece's role is called on screen, as a noun phrase.
 *
 * One map for two contexts — the tag on a piece in the contour list, and the bucket naming a row of
 * the contrast grid (`Boundary terms · vanishing piece 2`) — so the same piece cannot be a `vanish`
 * in one panel and a "vanishing piece" in the other. `"argument"` is not a `PieceRole`: it is the
 * bucket the contrast grid files a row under when the row names no piece at all.
 */
const ROLE: Readonly<Record<PieceRole | "argument", string>> = {
  target: "target",
  vanish: "vanishing piece",
  reproduces: "multiple of the target",
  // `circleTemplate`'s whole closed loop, and only that: the ledger does not bound it or read a
  // multiple off it, it INTEGRATES it — "is computed directly", in the row's own words.
  residue: "computed directly",
  free: "free piece",
  argument: "argument",
};

export function roleLabel(role: PieceRole | "argument"): string {
  return ROLE[role] ?? role;
}

/**
 * Why the argument does not close, naming the group that failed.
 *
 * The clause is the group's, not the row's: the failing row is printed directly beneath and says
 * which piece and why. Each clause is true of everything that group can refuse —
 *
 *  - `LEGALITY` refuses a singularity on the contour, an unclosed contour, an inadmissible cut
 *    system, non-integral monodromy, and a piece crossing a cut with no side declared;
 *  - `CATCH` has exactly one failure, an undecided winding number, so its clause can be exact;
 *  - `KILL` refuses a piece no lemma disposes of;
 *  - `COVER` is `satisfied` or `unknown` and **never** `failed` (`ledger.ts`: the sandbox has no
 *    target, which is not a failure), so its clause is unreachable today. It is written out because
 *    the type is total and a `?? ""` would hide the day that changes.
 */
const FAILS: Readonly<Record<ConstraintId, string>> = {
  LEGALITY: "the residue theorem does not apply",
  CATCH: "a residue is not determined",
  KILL: "a boundary term does not vanish",
  COVER: "the target is not on the contour",
};

export function headlineFails(id: ConstraintId): string {
  return `The argument is incomplete: ${FAILS[id]}.`;
}

/**
 * The three headlines that name no constraint.
 *
 * Named here rather than written inline in `ledgerHeadline` so the M8 review document can read what
 * the app says instead of carrying a copy. The copy was the defect: step 0.5b applied all three
 * proposals and the document went on printing the pre-0.5b sentences as *today*, so a reader was
 * told that finished work was outstanding — and a review document that misreports the code is worse
 * than none, because it is believed.
 */
/**
 * The cards the two rails hold, by id.
 *
 * M8 step 1.1. Here for the reason the constraint labels and the derivation titles are here: this
 * file is the one place the reader's words are decided, so a heading and the rows beneath it cannot
 * drift (step 0.2's decision). The scaffold builds these as empty cards and Phase 1 fills them in
 * one at a time; a card whose title lived in its own module would be a title nothing could survey.
 */
export type CardId =
  | "target"
  | "integrand"
  | "parameters"
  | "contour"
  | "cuts"
  | "singularities"
  | "result"
  | "derivation"
  | "share"
  /**
   * The drill's task card — M8 step 1.7.
   *
   * Not in {@link RIGHT_CARDS}: it is the right rail's TOP SLOT and appears only while a rung is
   * open, where every other card is always present. A card that renders `null` inside a `map` would
   * make the list's contract "a card, or nothing" for one member's sake.
   */
  | "drill";

const CARD_TITLES: Readonly<Record<CardId, string>> = {
  target: "Target",
  integrand: "Integrand",
  parameters: "Parameters",
  contour: "Contour",
  cuts: "Branch cuts",
  singularities: "Singularities",
  result: "Result",
  derivation: "Derivation",
  share: "Share",
  drill: "Drill",
};

/** The cards of the LEFT rail — what is being integrated — in the order they are read. */
export const LEFT_CARDS: readonly CardId[] = [
  "target",
  "integrand",
  "parameters",
  "contour",
  "cuts",
  "singularities",
];

/** The cards of the RIGHT rail — what the argument proves. */
export const RIGHT_CARDS: readonly CardId[] = ["result", "derivation", "share"];

export function cardTitle(id: CardId): string {
  return CARD_TITLES[id];
}

export const HEADLINES = {
  /** A record: the argument determines the integral it set out to determine. */
  closes: "The argument is complete.",
  /** The sandbox: there is no target, so what was established is the closed-contour value itself. */
  sandbox: "$\\oint_\\gamma f(z)\\,dz$ is established exactly.",
  /** It does not close, and no single constraint is the one that stopped it. */
  incomplete: "The argument is incomplete.",
} as const;

/**
 * One of the contour templates the sandbox offers — M8 step 2.1.
 *
 * Declared here for {@link ConstraintId}'s reason: `shell/templates.ts` re-exports it, so no
 * consumer changed, and the label and the id cannot drift apart across a module boundary.
 */
export type TemplateId =
  | "circle"
  | "semicircle"
  | "semicircleDown"
  | "indented"
  | "rectangle"
  | "keyhole"
  | "dogbone"
  | "strip"
  | "wedge"
  | "square";

/**
 * What each template is called on screen.
 *
 * **This map and {@link disposalLabel}'s are the app's two PICKER vocabularies, and the one place
 * the wording pass's "every formula inside `$…$`" cannot apply.** Both are rendered as the text of
 * an `<option>`, and an `<option>` renders no markup at all — a `$2\pi$` in one would be seen, and
 * read out, as four characters and a backslash. So their symbols are Unicode. Every other sentence
 * in the app is typeset.
 *
 * `wedge` names the angle it actually builds rather than a general `2π/n`: the picker's entry is a
 * shape you get, not a family you parameterise, and `wedgeTemplate(3, …)` gives the third.
 */
const TEMPLATE_LABEL: Readonly<Record<TemplateId, string>> = {
  circle: "circle",
  semicircle: "upper semicircle",
  semicircleDown: "lower semicircle",
  indented: "indented semicircle",
  rectangle: "rectangle",
  strip: "rectangle of height 2π",
  wedge: "sector of angle 2π/3",
  square: "square Γ_N",
  keyhole: "keyhole",
  dogbone: "dogbone",
};

export function templateLabel(id: TemplateId): string {
  return TEMPLATE_LABEL[id];
}

/**
 * What the drill offers as the job a piece of the contour does — M8 step 2.1.
 *
 * Declared here rather than in `shell/drill.ts` for the reason above; that module re-exports it.
 * The five are a noun phrase each, because the reader picks one from a menu to complete the sentence
 * *this piece is …*, and a verb there (`vanishes in the limit`, `cannot be disposed of`) made two of
 * them read as a claim the reader was asserting rather than a role they were naming.
 */
export type Disposal = "target" | "vanishes" | "limit" | "reproduces" | "fails";

const DISPOSAL: Readonly<Record<Disposal, string>> = {
  target: "the target",
  vanishes: "→ 0",
  limit: "a known limit",
  reproduces: "a constant multiple of the target",
  fails: "no estimate",
};

export function disposalLabel(id: Disposal): string {
  return DISPOSAL[id];
}

/**
 * The small tags the rails hang on a value, a parameter, a pole or a winding number — step 2.1.
 *
 * They were nine strings in four card modules, each written where it was rendered, and two of them
 * said the same thing in different words (`undecided` on a winding in the Singularities card, and
 * again in the Derivation card's pole table). One map, so a tag means one thing.
 *
 * `numerical` replaces `located numerically`: the column it sits in is the pole's position, so the
 * word *located* was carried by the column and the tag only had to say how.
 */
export type TagId =
  | "derived"
  | "not-sampled"
  | "quadrature-capped"
  | "winding-undecided"
  | "numerical"
  | "possibly-removable"
  | "order-uncertain";

const TAG: Readonly<Record<TagId, string>> = {
  derived: "derived",
  "not-sampled": "not sampled",
  "quadrature-capped": "quadrature capped",
  "winding-undecided": "$\\operatorname{Ind}_\\gamma$ undecided",
  numerical: "numerical",
  "possibly-removable": "possibly removable",
  "order-uncertain": "order uncertain",
};

export function tagLabel(id: TagId): string {
  return TAG[id];
}

/**
 * The tag on a parameter the argument takes to a limit — `$\to\infty$`, `$\to 0^+$`.
 *
 * **The plan's own replacement for this tag is wrong twice, and both are measurements.** It names
 * them `$R\to\infty$` and `$\rho\to0^+$`, which are right for the record the reviewer had open:
 * over the corpus the parameters carrying a limit are named `R`, `R_lim`, `N`, `eps`, `eta` and
 * `rho`, so a literal `R` mislabels three of the six and a literal `\rho` two. And naming the
 * parameter at all is redundant here, because the tag sits in the same row as the readout that has
 * just named it: `R = 4` followed by `R → ∞` says `R` twice in four centimetres. What the tag adds
 * is the limit, so the limit is all it carries.
 *
 * `to` is the schema's own word for where the parameter goes: `"inf"`, `"0+"`, or a number as text.
 */
export function limitTag(to: string): string {
  return `$${limitArrow(to)}$`;
}

/**
 * The same arrow WITHOUT its delimiters — M8 step 3.1b.
 *
 * Its second consumer is the stepper's limit step, whose title is one formula (*Let $R \\to
 * \\infty$*) rather than a word beside a tag. Composing that from `limitTag` meant `Let $R$ $\\to
 * \\infty$` — two math spans where a reader sees one statement — and slicing the delimiters back
 * off at the call site would put the convention in two places.
 */
export function limitArrow(to: string): string {
  return `\\to ${to === "inf" ? "\\infty" : to === "0+" ? "0^+" : to}`;
}

/**
 * A contour parameter's NAME as mathematics — M8 step 3.1c.
 *
 * **A parameter's id is an identifier and its symbol is a letter, and putting the id in `$…$` prints
 * neither.** Found on the stage: the limit step's callout read `eps \to 0^+`, which KaTeX sets as
 * the product *e·p·s*, and its heading read `Let eps→0+` — beside a piece the record itself calls
 * *the ε→0 circle*, and beside a bound that calls the same parameter `\varepsilon`. `R_lim` is the
 * same defect in the other direction: `R_lim` subscripts the `l` alone and leaves `im` upright.
 *
 * Measured over the corpus, which is what makes this a short map rather than a guess. The
 * parameters carrying a limit are `R`, `R_lim`, `N`, `eps`, `eta` and `rho` — the same six
 * {@link limitTag}'s note records — of which FOUR need an entry; the twenty names in all add
 * `alpha`, `mu`, `xi` (entries too, because step 3.2 typesets a parameter that is not a limit),
 * `saddle`, `sgnA`, `wedgeAngle`, `wedgeX`, `wedgeY` and eight single ASCII letters, which the
 * rule below covers without naming them.
 *
 * **`R_lim` is `R`, and that is not a shortening.** Tier B renames its radius `R_lim` so a record's
 * limit parameter cannot collide with a template's `R` — an internal disambiguation — and B1's own
 * KILL line already states its bound *at $R = 4$, and $\to 0$ as $R \to \infty$*. Printing
 * `R_{\mathrm{lim}}` on the step beside it would introduce a second name for one quantity at the
 * one place the two are read together.
 *
 * Anything else with more than one character is set UPRIGHT rather than as a product of italics,
 * which is the general form of the same defect: `wedgeAngle` is a name, not nine factors.
 */
const PARAM_SYMBOL: Readonly<Record<string, string>> = {
  R_lim: "R",
  eps: "\\varepsilon",
  eta: "\\eta",
  rho: "\\rho",
  alpha: "\\alpha",
  mu: "\\mu",
  xi: "\\xi",
};

export function paramSymbol(name: string): string {
  const known = PARAM_SYMBOL[name];
  if (known !== undefined) return known;
  return name.length === 1 ? name : `\\mathrm{${name}}`;
}
