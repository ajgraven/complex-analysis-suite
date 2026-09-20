// The Family record — DESIGN.md §5's v2 schema, in executable form.
//
// A Family is DATA, and the 28 gallery entries are a SPECIFICATION rather than a pile of examples:
// a record that cannot be expressed here is a finding about the schema, and a record that loads but
// fails an invariant is a finding about the record (GALLERY.md §5).
//
// **The aspiration is that every field is executable or renderable. Measured, 31,694 characters of
// record text are read by nothing yet**, and saying otherwise (this note used to claim the only
// prose was `traps[].message` and the `note` fields) invites a reader to take the rest on faith.
// Three groups, and they are different kinds of gap:
//
//   * **AWAITING THE PREDICATE INTERPRETER** — `hypotheses[].check`, `traps[].detect` and
//     `vanishingLemmas[].discharge` are validated for NAMESPACE well-formedness and no further;
//     `index.ts`'s guard already says so honestly for those three, and the counts are 133, 136 and
//     45. The engine computes the same questions its own way — the Result card's "what was checked"
//     table is the computed LEDGER, not the record's `hypotheses`.
//   * **STATED FOR THE READER, DECIDED BY THE ENGINE** — `branch.admissibility` (7 records; the
//     engine runs `checkAdmissibility`), `branch.effectiveCut` (2), `auxiliary.principalValue` (2),
//     `halfPlaneLadder` (3), `residueSelection.set` (19). These are worth keeping BECAUSE the engine
//     decides them: a record and an engine that disagree is a finding, and `records.test.ts` now
//     cross-checks `residueSelection.rule` against the poles the engine actually weights.
//   * **NO READER AND NO PRODUCER** — `family.rigor` (required on all 28), `restrictions` (declared
//     by none), `VanishingLemma.rigorOf*`, `targets[].substitution.inverse` and
//     `contour.residueAtInfinity`. Each of these carries its own note saying so.
//
// `parameters[].domain` and `parameters[].constraints` were in that last group until the
// 2026-09-20 review; `instantiate.ts` reads both now (`constraints.ts`).
//
// GEOMETRY IS THE RUNTIME TYPE, NOT A STRING. The gallery's JSONC writes `"x": "-R"`; this schema
// reuses `engine/contour/model.ts`'s affine `Scalar`, so the same value that a record declares is
// the value `resolve()` consumes — no parser, no glue, no second representation to drift. That
// subset covered every template in the gallery until F1, whose wedge needs `R·cos(2π/n)` — a
// product of two parameters — and so widened `Scalar`'s coefficient to name one; `Scalar`'s own
// note has the finding, and the reason the form stays affine in every LIVE parameter.
import type { Level } from "@cas/rigor";
import type { Geom, LemmaId, PieceRole } from "../engine/contour/model.js";

export type { LemmaId } from "../engine/contour/model.js";

/**
 * A parameter binding taken from a golden fixture.
 *
 * Here rather than in `system.ts` because both the rational coefficient walk and the widened one
 * need it, and `system.ts` needs the widened walk — which made the two modules import each other.
 * It is schema vocabulary anyway: a binding is what a `Golden`'s `params` is.
 */
export type Bindings = Readonly<Record<string, string | number | boolean>>;

/**
 * How a branch point acts, and with which argument convention.
 *
 * **`argRange` BELONGS TO THE FACTOR, NOT THE CUT** ([M4-plan](../../../../docs/contour-integration/M4-plan.md)
 * §1.3, GAP G4). D7 is the record that forces it: `z^μ(1−z)^ν` has two branch points with different
 * exponents *and two different conventions* — `[0,2π)` for `z^μ` and `(−π,π]` for `(b−z)^ν` — so a
 * single range on the cut cannot say what the record says. Every residue is evaluated in ITS OWN
 * factor's range, which is D1's `residue-with-the-wrong-argument` trap made structural: "the check
 * is arithmetic, not a convention".
 */
export interface BranchFactor {
  /** Where the branch point sits, as an expression — `0`, `1`, `-1`, `exp(i*pi/n)`. */
  readonly at: string;
  readonly order:
    | { readonly kind: "power"; readonly alpha: string }
    | { readonly kind: "log"; readonly power: number };
  /** The determination this factor is evaluated in. Displayed always, never implicit. */
  readonly argRange: readonly [string, string];
  /**
   * Which difference the record actually wrote: `(z − b)` (default) or `(b − z)`.
   *
   * D7's integrand is `x^μ(b − x)^ν`, and the two are NOT the same power even though `b − z` and
   * `−(z − b)` are the same number: the argument read in the window is the argument of whichever one
   * was written. Its own trap is exactly that — at `z = c > b` approached from above,
   * `arg(b − z) = −π` and not `+π`, and using `+π` rotates the residue by `e^{iπ/2}` while leaving
   * the final answer real and entirely plausible.
   */
  readonly orientation?: "z-minus-b" | "b-minus-z";
}

/**
 * The phase a factor picks up crossing the cut — and **whether it multiplies or adds**.
 *
 * A tagged union, because the two are genuinely different operations and `string` could not tell
 * them apart (M4-plan §1.3). D1/D2/D3/D7's `z^α` is MULTIPLICATIVE: `f ↦ f·e^{2πiα}`. D4/D5's
 * `log z` is ADDITIVE: `log z ↦ log z + 2πi`, and D4 carries an explicit `log-phase-is-additive`
 * trap for exactly this confusion. Writing an additive phase where a multiplicative one is expected
 * produces a plausible finite wrong answer, which is the failure mode worth a type.
 */
export type CrossingPhase =
  | { readonly kind: "multiplicative"; readonly factor: string }
  | { readonly kind: "additive"; readonly increment: string };

export interface BranchSpec {
  readonly function: string;
  /**
   * The rational cofactor, in `z`: the integrand is `(the branch function)·R(z)`.
   *
   * Declared rather than derived. The engine needs the split — the branch point carries no residue
   * while `R`'s poles carry all of them — and recovering it by dividing `z^α` out of the auxiliary
   * integrand symbolically would be fragile in exactly the cases that matter. The record already
   * names `R` among its target's `symbols`, but that is the subject of the HYPOTHESES (a structural
   * predicate about a function) and carries no expression; this is the expression.
   */
  readonly rationalPart: string;
  /** The branch points, each with its own exponent and its own argument convention. */
  readonly factors: readonly BranchFactor[];
  /**
   * The constant in front of `∏ⱼ (z − bⱼ)^{αⱼ}`, when the branch is pinned by one. Default `1`.
   *
   * Not decoration. D6's `W(z) := −i·exp(½(Log(z−1) + Log(z+1)))` is `−i` times the product, and the
   * `−i` is exactly what makes `W(x + i0) = +√(1−x²)` on the upper lip rather than `+i√(1−x²)`. Drop
   * it and every residue is off by a factor of `i`, the answer comes out imaginary, and the only
   * thing that looks wrong is a number that should have been real.
   */
  readonly constant?: string;
  readonly cuts: readonly { readonly from: string; readonly to: string }[];
  readonly crossingPhase: CrossingPhase;
  /**
   * research 06 §2.1 — every component of Γ not touching ∞ has `Σα ∈ ℤ`, and no `log` is bounded.
   *
   * A SEAT for the record's own statement of the rule, checked by `kernel/branch/admissibility.ts`.
   */
  readonly admissibility: string;
  /**
   * What the discontinuity set of the COMPOSITE actually is, when it is not the union of the
   * sub-expressions' cuts.
   *
   * Research 06 §2.2's lesson, learned from Maple's `BranchCuts`: rendering the union is dishonest,
   * because cuts can cancel — `log z + log(1/z)` is continuous across ℝ₋ even though each term is
   * not. A record with nothing to say here omits it; a record that needs it can no longer only
   * gesture at it in prose.
   */
  readonly effectiveCut?: string;
}

/**
 * The contour shapes a record may name — EIGHT, and all eight are used by the corpus.
 *
 * (The count lived as a dangling comment at the top of this file reading "six templates plus
 * `square`", which listed seven and named eight; measured 2026-09-20 and moved here, where the
 * list it counts is.) Everything else is parameterisation: `wedge` takes `n` rather than an angle,
 * so "the angle must be exactly `2π/n`" is unrepresentable rather than checked.
 */
export type TemplateId =
  | "circle"
  | "semicircle"
  | "indentedSemicircle"
  | "keyhole"
  | "dogbone"
  | "rectangle"
  | "wedge"
  | "square";

/**
 * A structural input the hypotheses run on, as distinct from a `parameter` (a number with a domain
 * and a UI knob). A5's note is the clearest statement of the distinction: `P` and `Q` are symbols;
 * `a` and `b` in A1 are parameters.
 */
export type SymbolSpec =
  | { readonly kind: "polynomial"; readonly var: string }
  /** A rational function of `var` — tier B names its `R(x)` this way, as distinct from a polynomial. */
  | { readonly kind: "rationalFn"; readonly var: string }
  /** An entire function of `var` — A4's `g`, whose Taylor coefficients the contour reads off. */
  | { readonly kind: "entireFn"; readonly var: string }
  | { readonly kind: "realParam" }
  | { readonly kind: "complexParam" }
  | { readonly kind: "integerParam" };

/**
 * How this piece relates to one unknown.
 *
 * DESIGN.md §4 Pass 5's table gives each role an `aᵢ ∈ ℝᵐ`; this is one entry of that row, named by
 * target so that a family with `m > 1` (the log keyhole has three unknowns) can say which. The
 * coefficient is a CONSTANT EXPRESSION over the family's parameters — `"1"`, `"-exp(2*pi*i*s)"`,
 * `"2*pi*i"` — never a function of `z`.
 */
export interface Coefficient {
  readonly targetId: string;
  readonly coefficient: string;
}

/**
 * A piece of a family's contour.
 *
 * ── SCHEMA FINDING (1 of 3 found transcribing A5–A7) ──────────────────────────────────────────
 * DESIGN.md §5 declares `pieces: FamilyPiece[]` and never defines `FamilyPiece`. §2.2's runtime
 * `Piece` is close but carries no coefficient information, and Pass 5 cannot build `M` without it:
 * the role alone says a piece is a `target`, not WHICH unknown it is the target of, nor with what
 * real-linear functional. This is that definition. `coefficients` is required for `reproduces` (a
 * bonus row is meaningless without one) and defaulted for `target` only when the family has exactly
 * one unknown, where it is unambiguous.
 */
export interface FamilyPiece {
  readonly id: string;
  readonly name: string;
  readonly geom: Geom;
  readonly role: PieceRole;
  /** Required when `role === "vanish"` — invariant 1 checks it against `vanishingLemmas`. */
  readonly lemma?: LemmaId;
  /** Pass 5's `aᵢ`. Omit on a `target` piece of a one-unknown family to mean "coefficient 1". */
  readonly coefficients?: readonly Coefficient[];
  /** Pass 5's `bᵢ` — the bonus constant a `reproduces` piece carries alongside its multiple. */
  readonly bonus?: string;
  /** Pins which limit is meant where the piece runs along a branch cut — never an ε-offset. */
  readonly side?: "above" | "below";
  /**
   * A `free` piece whose value is **exactly known and not derived by this contour** (ADR-0042).
   *
   * E3's top side is `√π e^{−b²/4}` — the Gaussian, which comes from polar coordinates — and F2's
   * return ray is `e^{iπ/(2n)}Γ(1+1/n)`, which comes from the real substitution `u = tⁿ`. Under the
   * v1 schema the only role left for such a piece was `free`, which Pass 3 prices by quadrature at
   * `≈`: **a perfectly exact argument capped at `≈` by its most certain step**, the inverse of the
   * failure `@cas/rigor` exists to prevent. The opposite error is worse — a bare `=` launders the
   * import as a derivation — so the claim and its provenance travel together, which is what every
   * other certificate in this app already does.
   *
   * `method` is REQUIRED and carries the provenance; the derivation renders it as a step beginning
   * "imported, not derived here". `rigor` is what the record claims and may not exceed what the
   * import can justify, which `kernel/imported.ts`'s closed set decides rather than a free string.
   *
   * **Only on a `free` piece.** A `vanish` and a `residue` piece have their own evidence (a certified
   * bound; exact arithmetic) and may not claim both; and one on the `target` piece would leave the
   * solve with nothing to do — importing the answer — which the loader refuses.
   */
  readonly knownValue?: {
    readonly expr: string;
    readonly method: string;
    readonly rigor: Level;
  };
  readonly colour: 0 | 1 | 2 | 3 | 4 | 5;
}

/** One of the family's unknowns. Usually one; the log family has three; tier G's is a sum. */
export interface FamilyTarget {
  readonly id: string;
  /**
   * What the record CLAIMS about this unknown, which invariant 4 then checks against `M`.
   *
   * A one-unknown family says nothing and is `primary` by default. D4 is the first record that has
   * to distinguish: its `log²` keyhole determines `∫R log x` (**primary**, the integral it was built
   * for) and `∫R dx` (**bonus**, free from the same contour) while the `log²` terms **cancel**, so
   * `∫R log²x` has an identically zero column and is invisible. All three facts are claims about the
   * contour, and invariant 4 checks them in both directions — a `primary` or `bonus` target that the
   * contour does not pin is a broken record, and so is a `cancels` target that it does.
   *
   * **`input` is the fourth, and D5 is why.** Its `log³` keyhole gives two real equations in three
   * unknowns: it determines `∫R log x` outright and `∫R log²x` only MODULO `∫R dx`, which must come
   * from elsewhere — the record's `prerequisites`. An `input` target is therefore required NOT to be
   * determined by this contour alone, on the same principle as the other three: a record that
   * borrows a value its own contour supplies is documenting a dependency that is not there.
   */
  readonly role?: "primary" | "bonus" | "cancels" | "input";
  readonly kind: "integral" | "sum";
  readonly variable: "x" | "theta" | "n";
  readonly lower: string;
  readonly upper: string;
  readonly summand?: string;
  readonly integrand?: string;
  /** A DISTINCT result type, not a flag on a value (DESIGN §2.3). */
  readonly convergence: "absolute" | "conditional" | "principalValue";
  readonly symbols: Readonly<Record<string, SymbolSpec>>;
  /** How this real quantity becomes a contour piece — `z = e^{iθ}` and its Jacobian. */
  readonly substitution?: {
    readonly map: string;
    readonly inverse: string;
    readonly jacobian: string;
  };
}

export interface Hypothesis {
  readonly id: string;
  readonly statement: string;
  readonly check: string;
  /** `escalate`: the hypothesis fails but a named alternative argument applies (G1). */
  readonly onFail: "refuse" | "warn" | "escalate";
  readonly escalateTo?: string;
}

export interface VanishingLemma {
  readonly piece: string;
  readonly lemma: LemmaId;
  readonly sideCondition: string;
  readonly discharge: string;
  /**
   * What each of the three statements would be labelled — the finite-`p` bound `|∫| ≤ B(p)`, the
   * limit statement Pass 5 substitutes, and the fallback when only a number is available.
   *
   * **All three are read by nothing** (measured 2026-09-20, `grep` over `src/`; the middle one used
   * to say "this is what the verdict consumes", which named a reader that does not exist). The
   * levels a reader sees come from the CERTIFICATES the bound modules mint, which is the right
   * source — they are computed from the arithmetic that was actually done, where these are the
   * record's expectation of it. They are the obvious cross-check and nothing cross-checks them yet.
   */
  readonly rigorOfBound: Level;
  readonly rigorOfLimit: Level;
  readonly rigorIfNumericOnly: Level;
}

export interface Golden {
  /**
   * ── SCHEMA FINDING (2 of 3) ───────────────────────────────────────────────────────────────
   * DESIGN.md §5 types this `Record<string, string | number>`, but A5/A6/A7 each carry a fixture
   * keyed by a BOOLEAN that is not a parameter at all — `halfRange` and `closeDown` select an
   * alternative derivation of the same family (the even-integrand half-range corollary; closing
   * through the lower half-plane). They are variant flags sharing a field with parameter bindings.
   * Widened to `boolean` rather than invented a second field, because the flag genuinely does
   * select a fixture; but a family with a parameter named `closeDown` would collide, and that is
   * worth a separate `variant` field if a later tier needs one.
   */
  readonly params: Readonly<Record<string, string | number | boolean>>;
  /**
   * What this fixture IS, when its `params` carry a variant flag rather than a binding.
   *
   * Required on a variant (invariant 5) and absent otherwise. The picker printed `halfRange = true`
   * and `companion = re` — the implementation's name for the alternative derivation, where a reader
   * is choosing between *the half-range corollary* and *the cosine companion*. Real parameter
   * bindings are still printed from `params`, so this never becomes a second copy of a number.
   */
  readonly label?: string;
  readonly value: string;
  readonly numeric: number | readonly [number, number];
  readonly verifiedTo: number;
  /** How it was verified — two independent methods are required for the primary fixture. */
  readonly method: string;
  /**
   * This fixture documents a **REFUSAL**, not a value — and `value`/`numeric` record what the answer
   * would be, which is precisely why it is dangerous.
   *
   * *Added for D3*, the record that forces the distinction. At integer `a` its integrand has no
   * branch point at all: the keyhole's two edges are the same integral traversed both ways,
   * `1 + Σcⱼ = 0` exactly, and the contour carries no information about the target — while the closed
   * form `(π/n)/sin(πa/n)` stays perfectly finite and *correct by continuity*. The record's own words:
   * "The value survives; the derivation does not. […] A correct value obtained from a collapsed
   * derivation is not a proof; print the wedge's derivation or print nothing."
   *
   * So a fixture carrying this is REQUIRED to be rank-deficient, and one not carrying it is required
   * to have full rank. Both directions, because "the derivation collapses here" and "the engine
   * cannot do this yet" must not look the same in the corpus.
   */
  readonly refuses?: string;
}

/**
 * A textbook a record's argument can be read in.
 *
 * A closed enum, so a citation cannot name a book the gallery has not settled on. Eight, because
 * that is what the content review drew on; adding a ninth is a deliberate act.
 */
export type CitationBook =
  | "Ahlfors"
  | "Conway"
  | "Stein–Shakarchi"
  | "Brown–Churchill"
  | "Marsden–Hoffman"
  | "Needham"
  | "Freitag–Busam"
  | "Remmert";

/**
 * Where this argument can be read in a standard text.
 *
 * **Chapter-level, and never an exercise number.** The content review marked the references it could
 * not confirm to the exercise; carrying one anyway would be a claim the gallery cannot support, and
 * a reader who looks it up and finds nothing trusts the rest less. So the exercise clause is always
 * dropped, and a reference whose section was itself unconfirmed is widened to its chapter — while
 * one the review DID confirm keeps its section, because citing `Ch. 4 §5` where `Ch. 4 §5.3` was
 * checked discards something true.
 */
export interface Citation {
  /** What this reference covers, when naming it helps — `Jordan's lemma`. May be empty. */
  readonly text: string;
  readonly book: CitationBook;
  /** `Ch. 4 §5.3`, `§85`, `Ch. V §2`. Never empty. */
  readonly where: string;
}

/**
 * The eight groups the gallery is organised into.
 *
 * These REPLACE the research-document section numbers (`"1"`, `"5.1"`, …) the records carried, which
 * named a back-reference no reader has. The groups are the reader's, so they are sentences.
 */
export const TAXONOMY_SECTIONS = [
  "Trigonometric integrals over [0, 2π]",
  "Rational functions on ℝ",
  "Fourier-type integrals and Jordan's lemma",
  "Principal values and indented contours",
  "Multivalued integrands: keyholes",
  "Multivalued integrands: dogbones and the residue at infinity",
  "Rectangles and sectors",
  "Series by the residue theorem",
] as const;

export type TaxonomySection = (typeof TAXONOMY_SECTIONS)[number];

/**
 * What the record says about itself, on screen, in the same three parts every time.
 *
 * The identity itself is not here: it is `targets` and `closedForm`, and a copy would be a second
 * source of truth for the one thing the engine computes. What a reader cannot derive from those is
 * **which contour** and **what the example is FOR**, so those are the two sentences, and the
 * citations say where to read the argument in full.
 */
export interface FamilyDescription {
  /** The contour and substitution — `the unit circle, $z=e^{i\theta}$, $d\theta = dz/(iz)$`. */
  readonly contour: string;
  /** Why this entry exists: the thing it teaches that its neighbours do not. One or two sentences. */
  readonly point: string;
  /** At least one. */
  readonly citations: readonly Citation[];
}

export interface Family {
  readonly id: string;
  /**
   * The human title: what the integral IS and which contour does it.
   *
   * `∫₀^{2π} dθ/(a + b cos θ) by the unit circle` — a name, not a lesson. The essay titles these
   * replaced (`— the reciprocal-root pair`, `— where ML is not merely loose but useless`) told a
   * reader the punchline before the example, and read as house voice rather than as a gallery.
   */
  readonly title: string;
  /** The same title typeset, for the card. Text outside `$…$`, LaTeX inside, as everywhere else. */
  readonly titleLatex: string;
  /** Which of the eight groups this belongs to. */
  readonly taxonomySection: TaxonomySection;
  readonly tier: "A" | "B" | "C" | "D" | "E" | "F" | "G";

  /** The four-line standard: the identity (from `targets`), the contour, the point, the references. */
  readonly description: FamilyDescription;

  /**
   * Rank in the gallery's front row, 1–8, on the eight classics — absent on the other twenty.
   *
   * One per group, so the front row is a tour of the taxonomy rather than a favourites list.
   */
  readonly frontRow?: number;

  readonly targets: readonly FamilyTarget[];

  /** Present when the contour integrand differs from the target's — i.e. complexification. */
  readonly auxiliary?: {
    readonly integrand: string;
    /** The real-linear functional recovering the target: `"Re"` | `"Im"` | an expression. */
    readonly relation: "Re" | "Im" | string;
    /**
     * Whether the AUXILIARY needs a principal value — which is usually where a p.v. actually lives.
     *
     * *Added for C3, the record that needs it, and it closes that record's gap G6.* C3 is posed as a
     * principal value and the qualifier is "correct but inherited": `∫cos x/(x(x²+b²))` diverges at
     * the origin, so the auxiliary genuinely needs one, while the target `sin x/(x(x²+b²))` is
     * removable at 0 and `O(x⁻³)` at infinity and so converges ABSOLUTELY — its p.v. is simply its
     * value. C1 is the same shape: `∫cos x/x` diverges while `∫sin x/x` converges.
     *
     * With the target's own three-state `convergence` and this flag, both facts are sayable at once,
     * which is what C3's `pv-claimed-of-the-target` trap asks for: "p.v. = …" without "and the
     * integral converges, so this is also its value" understates the result, and "∫ = …" without
     * recording that the derivation ran through a p.v. hides a hypothesis.
     */
    readonly principalValue?: boolean;
    readonly note: string;
  };

  /**
   * Values this family may assume as known, each with its own provenance and rigor.
   *
   * **Declared, then RESOLVED.** `from` naming `family:<id>` is executable: the engine runs that
   * record at the same bindings and reads the named target out of it. `rigor` is what the record
   * EXPECTS, and the borrowed verdict meets with it rather than overriding it, so a record can never
   * claim more rigor than its input actually had. D5's whole lesson is that this must be visible:
   * assuming `T0 = 0` instead of borrowing `π/2` returns `−13π³/24` in place of `π³/8`, and nothing
   * about the arithmetic complains.
   *
   * `value` is the FLAGSHIP's value, for a reader — not the engine's check. The borrowed number is
   * verified twice over without it: the source record carries its own goldens and the corpus runs
   * them, and this record's own golden fails if the wrong target was borrowed.
   */
  readonly prerequisites?: readonly {
    readonly targetId: string;
    /** `family:<id>` to resolve by running that record; anything else is prose for the reader. */
    readonly from: string;
    /** The unknown to read out of the SOURCE, when it is not named the same there. */
    readonly sourceTargetId?: string;
    readonly value: string;
    readonly rigor: Level;
    /** Where else the value could come from, when the named family is not the only route. */
    readonly alternative?: string;
  }[];

  /** Exact constants imported rather than derived — E3's and F2's `√π` — so they escape `≈`. */
  readonly constants?: readonly {
    readonly name: string;
    readonly value: string;
    readonly source: string;
    readonly rigor: Level;
  }[];

  readonly parameters: readonly {
    readonly name: string;
    readonly domain: "real" | "complex" | "integer";
    readonly constraints: readonly string[];
  }[];

  /**
   * Scope the whole family's claim is restricted to.
   *
   * **Declared by no record and read by nothing** (measured 2026-09-20; this note used to say it
   * "travels into the verdict", which named a reader that does not exist — `derivation.ts`'s
   * `verdict.restrictions` is `@cas/rigor`'s field of the same name and is filled from elsewhere).
   * Kept because a record whose claim really is conditional needs somewhere to say so, and the
   * schema is the specification; the day one declares one, this is where the reader goes.
   */
  readonly restrictions?: readonly string[];

  readonly hypotheses: readonly Hypothesis[];

  /** Kernel-pole / f-pole coincidence: G1's merged pole is rigorous, not an edge case. */
  readonly collisions?: readonly {
    readonly at: string;
    readonly mergedOrder: number;
    readonly residue: string;
    readonly note: string;
  }[];

  readonly branch?: BranchSpec;

  /**
   * The quasi-periodic STRIP this family's contour lives in — tier E's seat.
   *
   * Present means `f = e^{az}·N(e^z)/D(e^z)` and its poles form vertical LATTICES rather than a
   * finite set (`kernel/expLattice.ts`), so the record has to say which band of them its argument is
   * about: `e^z = ρ` has solutions every `2πi`, and no engine can pick among infinitely many without
   * being told. The height is in UNITS OF π, matching how `BranchSpec.argRange` states its window —
   * `"2"` for E1's `0 < Im z < 2π`, `"1"` for E2's `0 < Im z < π`.
   *
   * It is a DECLARATION and it is checked: `stripTheorem.ts` asks the lattice points just outside
   * the band for their winding numbers, so a contour that encloses one refuses rather than summing a
   * set the record did not declare. E1's `wrong-strip-height` trap, at run time.
   */
  readonly strip?: { readonly heightOverPi: string };

  readonly contour: {
    readonly template: TemplateId;
    readonly limitParams: readonly {
      readonly name: string;
      readonly to: "inf" | "0+";
      /**
       * That the limit is taken through contours whose HALF-WIDTH is a half-integer — tier G's `Γ_N`.
       *
       * **READ SINCE M8 STEP 3.2**, in `instantiate.ts` and twice: `:64` caps the range at
       * `MAX_SERIES_N`, because what binds above the lattice is COST, and `:133` emits
       * `Param.admits: "integers"` so the sweep's ladder and the scrub's arrow land on it. (This
       * note said the field was unread until the 2026-09-20 review found it contradicting a comment
       * in the same directory.)
       *
       * **The stronger check is still the geometry's**, and it is what makes the constraint
       * ENFORCED rather than merely offered: `kernel/bounds/squareSide.ts` refuses any half-width
       * that is not `N + ½` — at an integer the kernel's sup is infinite, and in between it is
       * finite for one contour but not uniform as the width approaches an integer — and it catches
       * a contour the reader has DRAGGED, which no declaration can. What this field changes is that
       * the controls stop producing values that bound has to refuse.
       */
      readonly through?: "halfIntegers";
      /**
       * Where this limit STARTS, when the global display default will not do.
       *
       * `instantiate.ts`'s default radius is 4, which is a display choice and knows nothing about a
       * record's poles. D2's sit at `−2` and `−4`, so the default puts one exactly ON the outer
       * circle and the winding about it is undecided — the record opens refusing. The value is still
       * only a starting point: the residue-theorem answer is independent of it once every selected
       * pole is enclosed, which the corpus asserts by running each record at two widely separated
       * radii and requiring the exact value to be IDENTICAL.
       */
      readonly start?: number;
    }[];
    readonly pieces: readonly FamilyPiece[];
    /**
     * Geometry parameters COMPUTED from the family's parameters.
     *
     * *Added for B1, which is the record that needs it.* Its arc must lie in the half-plane where
     * `a·Im z ≥ 0`, i.e. `theta1 = π·sgn(a)` — and §2.2's `Scalar` is the affine subset, in which
     * `π·sgn(a)` is not expressible at all. Introducing `sgnA` as a derived value makes it affine
     * again (`{param: "sgnA", mul: π}`) without widening `Scalar` for one family.
     *
     * The record's own notes call this gap G5 and settle for a prose caveat on `orientation`; this
     * is the field that makes the geometry honest instead. Each `expr` is an `@cas/expr` expression
     * over the family's parameters, evaluated at instantiation.
     */
    readonly derived?: readonly { readonly name: string; readonly expr: string }[];
    /** B1 needs `sgn(a)`, so this is not always a literal. */
    readonly orientation: "ccw" | "cw" | { readonly expr: string };
    /** Per-pole, not a prose blurb: the winding number the family asserts for each. */
    readonly windings: readonly { readonly pole: string; readonly n: string }[];
    /** Pass 2 sums FINITE poles only, so the residue at infinity needs its own seat. */
    readonly residueAtInfinity?: {
      readonly used: boolean;
      readonly value?: string;
      readonly certifiedZeroBy?: string;
    };
  };

  /** Keyed by (piece, lemma): a piece may have several, and any one may discharge it. */
  readonly vanishingLemmas: readonly VanishingLemma[];

  readonly residueSelection: {
    readonly rule: "all" | "inside" | "upperHalfPlane" | "lowerHalfPlane" | "notOn";
    readonly set?: string;
    /**
     * Tier G: the unknown is a TERM of the residue sum rather than a piece of the contour.
     *
     * **NOT "moved to the unknown side of `M t = r`"**, which is what this field's first draft said
     * and what [M5-plan](../../../../docs/contour-integration/M5-plan.md) §M5.6 still states as one
     * equation. `solveResidueTerm.ts` has the finding in full: that move needs a coefficient adding
     * a DIMENSIONLESS number to one carrying π, and neither the exponential basis nor ℚ(i)(π) holds
     * both. It is never needed — a record declaring this has no `target` piece, which is what SG-1
     * IS — so the solve is a third route and the mixed case is refused by name.
     *
     * `terms` names the integers whose residues constitute the target, from a closed vocabulary; a
     * predicate outside it is refused with the vocabulary quoted rather than parsed.
     *
     * `weight` is the halving bookkeeping (`1` two-sided, `2` one-sided of an even summand) — and it
     * is DERIVED from the target's own declared range and then checked against what the record says,
     * because research 03 §8 names that halving as the tier's commonest error and a field merely
     * read would record the habit rather than catch it.
     */
    readonly targetTerms?: readonly {
      readonly targetId: string;
      readonly terms: string;
      readonly weight: 1 | 2;
    }[];
  };

  /** Which rung of PLAN.md §3.3's ladder this family's half-plane sum reaches. */
  readonly halfPlaneLadder?:
    | "homogeneousSplit"
    | "radicalsDeg4"
    | "cyclotomic"
    | "enclosure"
    | "rootSum";

  /**
   * What the record claims, in two forms.
   *
   * `expr` is the DERIVATION — `2*pi*i*Sum(Res(P(z)/Q(z), z_k), im(z_k) > 0)` — a statement of the
   * method in the gallery's own notation, not an expression any evaluator can read. `simplified` is
   * the answer in closed form, and it is what a reader wants to see.
   *
   * **`simplified` is not always valid across the family**, which is why the condition exists. Five
   * records' forms are sign-restricted or fixture-specific (`2*pi/sqrt(a^2 - b^2)` holds for `a > 0`
   * only; `pi/6` is A3 at `n = 2`), and the record card printed each of them beside the engine's
   * number for a fixture that contradicted it. `simplifiedWhen` is an `@cas/expr` boolean in the
   * family's parameters; absent means unrestricted. `families/describe.ts` decides it, and a
   * condition it cannot decide withholds the form rather than showing it unguarded.
   */
  readonly closedForm: {
    readonly expr: string;
    readonly simplified?: string;
    readonly simplifiedWhen?: string;
  };
  readonly rigor: { readonly policy: "min"; readonly inputs: readonly string[] };
  readonly traps: readonly {
    readonly id: string;
    readonly detect: string;
    readonly message: string;
  }[];

  readonly golden: readonly Golden[];
}
