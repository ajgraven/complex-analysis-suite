// The Family record — DESIGN.md §5's v2 schema, in executable form.
//
// A Family is DATA. Every field is either executable or renderable; nothing is prose-for-humans-only
// except `traps[].message` and the `note` fields. That constraint is what makes the 28 gallery
// entries a specification rather than a pile of examples: a record that cannot be expressed here is
// a finding about the schema, and a record that loads but fails an invariant is a finding about the
// record (GALLERY.md §5).
//
// GEOMETRY IS THE RUNTIME TYPE, NOT A STRING. The gallery's JSONC writes `"x": "-R"`; this schema
// reuses `engine/contour/model.ts`'s affine `Scalar`, so the same value that a record declares is
// the value `resolve()` consumes — no parser, no glue, no second representation to drift. model.ts
// already records that the affine subset covers every template in the gallery.
import type { Level } from "@cas/rigor";
import type { Geom, LemmaId, PieceRole } from "../engine/contour/model.js";

export type { LemmaId } from "../engine/contour/model.js";

/** GALLERY.md §1: six templates plus `square` for tier G. Everything else is parameterisation. */
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
  readonly colour: 0 | 1 | 2 | 3 | 4 | 5;
}

/** One of the family's unknowns. Usually one; the log family has three; tier G's is a sum. */
export interface FamilyTarget {
  readonly id: string;
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
  /** The finite-`p` bound `|∫| ≤ B(p)` — a bound, so typically `≤`. */
  readonly rigorOfBound: Level;
  /** The limit statement pass 5 actually substitutes. This is what the verdict consumes. */
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
  readonly value: string;
  readonly numeric: number | readonly [number, number];
  readonly verifiedTo: number;
  /** How it was verified — two independent methods are required for the primary fixture. */
  readonly method: string;
}

export interface Family {
  readonly id: string;
  readonly title: string;
  /** Back-reference into research/03. */
  readonly taxonomySection: string;
  readonly tier: "A" | "B" | "C" | "D" | "E" | "F" | "G";

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

  /** Values this family may assume as known, each with its own provenance and rigor. */
  readonly prerequisites?: readonly {
    readonly targetId: string;
    readonly from: string;
    readonly value: string;
    readonly rigor: Level;
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

  /** Scope the whole family's claim is restricted to; travels into the verdict. */
  readonly restrictions?: readonly string[];

  readonly hypotheses: readonly Hypothesis[];

  /** Kernel-pole / f-pole coincidence: G1's merged pole is rigorous, not an edge case. */
  readonly collisions?: readonly {
    readonly at: string;
    readonly mergedOrder: number;
    readonly residue: string;
    readonly note: string;
  }[];

  readonly branch?: {
    readonly function: string;
    readonly branchPoints: readonly {
      readonly at: string;
      readonly order:
        | { readonly kind: "power"; readonly alpha: string }
        | { readonly kind: "log"; readonly power: 1 | 2 };
    }[];
    readonly cuts: readonly {
      readonly from: string;
      readonly to: string;
      readonly argRange: readonly [string, string];
    }[];
    readonly crossingPhase: string;
    /** research 06 §2.1 — every non-∞-touching component has `Σα ∈ ℤ`. */
    readonly admissibilityCheck: string;
  };

  readonly contour: {
    readonly template: TemplateId;
    readonly limitParams: readonly {
      readonly name: string;
      readonly to: "inf" | "0+";
      readonly through?: "halfIntegers";
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
    /** Tier G: the unknown is a TERM of the residue sum, moved to the unknown side of `M t = r`. */
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

  readonly closedForm: { readonly expr: string; readonly simplified?: string };
  readonly rigor: { readonly policy: "min"; readonly inputs: readonly string[] };
  readonly traps: readonly {
    readonly id: string;
    readonly detect: string;
    readonly message: string;
  }[];

  readonly golden: readonly Golden[];
}
