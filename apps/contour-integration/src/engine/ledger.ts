// The Closing Ledger — the app's thesis, in executable form.
//
// Everything else computes a number. This computes whether the *argument* is finished, which is the
// thing a reader actually needs and the thing no existing tool offers (research 01 §8).
//
// Two independent lines of research converged on its structure (PLAN.md §2). Taxonomy: every family
// in the corpus is one closed-contour identity times one lemma that kills an auxiliary piece, and
// every piece has exactly one of four roles. Pedagogy: there is no published decision tree for
// choosing a contour, and the way to teach the choice is as constraint satisfaction —
// **COVER / KILL / CATCH / LEGALITY**. Those are the same object, and this is it.
//
// The order of the passes is load-bearing. LEGALITY runs first and returns with **no value at all**
// when it fails, so a singular configuration never produces a number that then has to be suppressed.
import {
  assembleVerdict,
  exact,
  mayReportValue,
  refuse,
  unknown,
  type Certificate,
  type Verdict,
} from "@cas/rigor";
import { Frac, SqrtExt } from "@cas/exact";
import { HEADLINES, headlineFails, type ConstraintId } from "./vocabulary.js";
import {
  certificateClaim,
  claimOf,
  pieceArg,
  renderClaim,
  type Claim,
  type ClaimArg,
} from "./claims.js";
import type { Node } from "@cas/expr";
import type { Cx, Resolved } from "../kernel/geom.js";
import { arcLength, endPoint, isClosed, startPoint } from "../kernel/geom.js";
import { clearance, windingNumber } from "../kernel/winding.js";
import { checkAdmissibility } from "../kernel/branch/admissibility.js";
import { classifyAgainstCut, needsSide } from "../kernel/branch/crossing.js";
import {
  allCrossingMonodromy,
  crossingMonodromy,
  cutGeometryInvariance,
} from "../kernel/branch/monodromy.js";
import { NO_BRANCH, cutPolyline, type BranchChoice } from "../kernel/branch/model.js";
import { formatFrac } from "../kernel/formatExact.js";
import { LATEX } from "../kernel/notation.js";
import { toExactRational } from "../kernel/exactRational.js";
import {
  asExponentialOfPolynomial,
  asExponentialOfPower,
  asExponentialTimesRational,
} from "../kernel/exponentialFactor.js";
import {
  jordanArcBound,
  mlArcBound,
  type ArcBound,
} from "../kernel/bounds/mlRational.js";
import { wedgeArcBound } from "../kernel/bounds/wedgeArc.js";
import { squareSideBound } from "../kernel/bounds/squareSide.js";
import type { SummationKernel } from "../kernel/summationKernel.js";
import { stripSideBound } from "../kernel/bounds/stripSide.js";
import { gaussianSideBound } from "../kernel/bounds/gaussianSide.js";
import { asExponentialLattice } from "../kernel/expLattice.js";
import { branchArcBound, dogboneArcBound } from "../kernel/bounds/branchArc.js";
import { logArcBound } from "../kernel/bounds/logArc.js";
import type { LogFactor } from "../kernel/logResidue.js";
import type { MultiPowerFactor, PowerFactor } from "../kernel/branchResidue.js";
import type { Piece } from "./contour/model.js";
import type { ContourIntegral } from "./contour/integrate.js";
import type { PoleReport } from "../kernel/poles.js";
import { smallArcLimit } from "../kernel/bounds/smallArc.js";
import { largeArcLimit } from "../kernel/bounds/largeArcLimit.js";
import type { ExpSum } from "../kernel/expSum.js";
import type { ResidueTheoremResult } from "./residueTheorem.js";

// Declared in `vocabulary.ts` (M8 step 0.2) so the ids and their labels sit together, and
// re-exported here because this is where every consumer has always imported it from.
export type { ConstraintId };

export interface LedgerRow {
  readonly constraint: ConstraintId;
  readonly pieceId?: string;
  readonly status: "satisfied" | "failed" | "unknown";
  /**
   * One line, renderable — what this row asserts.
   *
   * DERIVED from {@link LedgerRow.claimData} by `rowFrom`, which is the only constructor of a row,
   * so the two cannot drift. Read this to display the sentence; read `claimData` to typeset its
   * parts (M8 step 0.4) or to reword it (step 0.5, which edits `claims.ts` and nothing else).
   */
  readonly claim: string;
  /** The same assertion as data: a template id and its typed arguments. */
  readonly claimData: Claim;
  readonly evidence: Certificate;
  /** What to do about it, when it failed. */
  readonly repair?: string;
}

export interface LedgerResult {
  readonly rows: readonly LedgerRow[];
  /** The headline: does this argument finish? */
  readonly closes: boolean;
  /** Present only when it closes: the value the argument establishes. */
  readonly value?: { readonly text: string; readonly numeric: Cx };
  readonly verdict: Verdict;
  /** Named for the UI: the first constraint that failed, or null. */
  readonly failedAt: ConstraintId | null;
  /** False in sandbox mode, where no piece is the target and there is no real integral to solve for. */
  readonly hasTarget: boolean;
  /**
   * The exact limits of the pieces that do NOT vanish, in units of π.
   *
   * Two lemmas land here. **L4** is an indentation and contributes `iα·Res`; **L5** is a large arc
   * along which `z·f → L ≠ 0` and contributes `iα·L`. Both are `vanish`-role pieces that carry a
   * known limit rather than zero — DESIGN §4 Pass 5's `bᵢ = 0, or a known limit` — and both have to
   * leave the ledger for Pass 5 to use. A piece discharged by L1/L2/L3 contributes nothing and gets
   * no entry.
   *
   * C1 and C2 are the same π seen twice: C1's indentation pays `−iπ·Res` and C2's arc pays `iπ·L`,
   * because subtracting a principal part to make the origin removable MOVES that contribution onto
   * the arc rather than deleting it.
   */
  readonly pieceLimits: readonly {
    readonly pieceId: string;
    readonly contribution: ExpSum;
  }[];
}

/**
 * How large a denominator an angle may have before it is not a nameable multiple of π.
 *
 * It was a WHITELIST of thirteen fractions until F1, with a good reason attached — a bound computed
 * for the wrong extent is worse than no bound, and `simplestRational` of a dragged float is a
 * sixteen-digit fraction that is honest and useless. The reason survives; the list did not. F1's
 * wedge sweeps `2π/n` for the record's own `n`, so at `n = 5` and `n = 7` the arc of `1/(1 + z⁵)`
 * could not be MEASURED and KILL reported that no lemma applied *to the integrand* — which was false,
 * and false in the worst direction: the same integrand shape is discharged at `n = 4`.
 *
 * A CAP is the same guarantee as a list and covers what a list cannot enumerate. Two distinct
 * rationals with denominators at most `Q` differ by at least `1/Q²`, which at `Q = 12` is `7e-3`, so
 * the `1e-12` window below admits at most one candidate and the reading is a decision rather than a
 * fit. Every fraction the old list held has denominator ≤ 12, so nothing it measured is lost.
 */
const MAX_PI_DENOMINATOR = 12n;

/** The widest sweep an arc may have and still be read: two full turns, as the old list's `4π` was. */
const MAX_PI_MULTIPLE = 4;

/**
 * One angle as an exact rational multiple of π, or null.
 *
 * Zero answers `0` rather than null: a wedge STARTS on the positive real axis, and "the arc begins
 * at 0" has to be expressible for `wedgeArcBound` to be able to refuse an arc that does not.
 */
function asPiMultiple(radians: number): Frac | null {
  if (!Number.isFinite(radians)) return null;
  const t = radians / Math.PI;
  if (Math.abs(t) < 1e-12) return Frac.ZERO;
  if (Math.abs(t) > MAX_PI_MULTIPLE) return null;
  for (let d = 1n; d <= MAX_PI_DENOMINATOR; d++) {
    const n = BigInt(Math.round(t * Number(d)));
    if (n === 0n) continue;
    if (Math.abs(t - Number(n) / Number(d)) < 1e-12) return Frac.of(n, d);
  }
  return null;
}

/** How the arcs of a contour are disposed of. `piMultiple` is the arc's angular extent over π. */
function arcExtent(g: Resolved): Frac | null {
  if (g.kind !== "arc") return null;
  const extent = asPiMultiple(Math.abs(g.theta1 - g.theta0));
  // A degenerate arc gets no extent, as before: `asPiMultiple` answers `0` for the START angle's
  // sake, and an ML bound of `0·π·R·max|f|` would be a vacuous `≤` rather than a useful one.
  return extent === null || extent.isZero() ? null : extent;
}

/** The radius of an arc as an exact rational, when it is one. */
function arcRadius(g: Resolved): Frac | null {
  if (g.kind !== "arc") return null;
  // **THE BOUND IS ABOUT `|z| = R`, SO THE ARC MUST BE CENTRED AT THE ORIGIN.** Every certified arc
  // bound in `kernel/bounds/` reasons from `Σ|aₖ|R^k` over `|dₙ|Rⁿ − Σ|dₖ|R^k` — the reverse
  // triangle inequality on the circle of radius `R` ABOUT 0 — and applying it to an arc centred
  // elsewhere would compute a `≤` from the wrong geometry. Until M4.6b every `vanish` arc in the app
  // happened to be centred at 0, so the hypothesis was true by accident; the dogbone's end caps sit
  // at its branch points and are the first that are not. Returning null here reports honestly that
  // no bound of this shape applies, instead of certifying one that does not.
  if (g.center[0] !== 0 || g.center[1] !== 0) return null;
  const r = g.radius;
  if (!Number.isFinite(r) || r <= 0) return null;
  // The radius comes from a slider, so it is a double; the simplest rational that round-trips is the
  // honest reading of it, and the bound is then exact *for that radius*.
  return asExactRadius(r);
}

/**
 * A positive length as the simplest rational that round-trips it at 1e-6.
 *
 * The value comes from a slider, so it is a double; reading it this way makes the bound exact *for
 * that length*, which is the honest claim. Shared by the arc's radius and the square's half-width —
 * the second consumer is what moved it out of `arcRadius` (ADR-0007 at the function scale).
 */
/** `|a − b|`, absolutely and relative to the larger of the two. Both zero is a perfect match. */
function relativeGap(
  a: Cx,
  b: readonly [number, number],
): { absolute: number; relative: number } {
  const absolute = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const scale = Math.max(Math.hypot(a[0], a[1]), Math.hypot(b[0], b[1]));
  return {
    absolute,
    relative: scale === 0 ? (absolute === 0 ? 0 : Infinity) : absolute / scale,
  };
}

/**
 * A SIGNED coordinate as an exact rational — {@link asExactRadius} without the positivity.
 *
 * A radius is positive by definition and zero means the arc is a point; a coordinate is neither, and
 * E3's left vertical sits at `Re z = −R`. Kept separate rather than relaxing the radius reader,
 * because "r ≤ 0 is not a radius" is a real guard that three arc disposers rely on.
 */
function asExactCoordinate(x: number): Frac | null {
  if (!Number.isFinite(x)) return null;
  const rounded = Math.round(x * 1e6) / 1e6;
  return Frac.of(BigInt(Math.round(rounded * 1e6)), 1000000n);
}

function asExactRadius(r: number): Frac | null {
  if (!Number.isFinite(r) || r <= 0) return null;
  const rounded = Math.round(r * 1e6) / 1e6;
  return Frac.of(BigInt(Math.round(rounded * 1e6)), 1000000n);
}

/**
 * Dispose of one `vanish` piece: pick the lemma the integrand's *shape* calls for, and report what
 * the bound does in the limit.
 *
 * Jordan when there is an `e^{iaz}` factor, plain ML otherwise. That is not a preference — a
 * rational integrand has no frequency and Jordan has nothing to say about it, while for `g·e^{iaz}`
 * the plain ML bound is off by the whole factor `|a|R` and fails on integrands that converge.
 */
function disposeArc(ast: Node, g: Resolved): ArcBound | null {
  if (g.kind !== "arc") return null; // only a circular arc has a certified bound of this shape
  const R = arcRadius(g);
  const extent = arcExtent(g);
  if (!R || !extent) return null;

  const exponential = asExponentialTimesRational(ast);
  if (exponential && !exponential.a.isZero()) {
    // Which half the arc lies in decides everything; read it off the arc's own midpoint.
    const mid = (g.theta0 + g.theta1) / 2;
    const half = Math.sin(mid) >= 0 ? "upper" : "lower";
    return jordanArcBound(exponential.num, exponential.den, exponential.a, half, R);
  }

  // A ZERO FREQUENCY MUST SWITCH LEMMAS, not report an infinite bound. Jordan's constant is π/|a|,
  // which at a = 0 is ∞ and says nothing — correctly, since Jordan has no content without
  // exponential decay. But `e^{i·0·z} = 1` leaves a perfectly ordinary rational integrand, and the
  // plain ML bound discharges it whenever the degree gap allows. Gallery B1's `a = 0` fixture is
  // this case, and its trap is explicit that an engine treating π/0 as a failure "will paper over
  // exactly the case it was built to catch".
  if (exponential) return mlArcBound(exponential.num, exponential.den, R, extent);

  // **L6 — the wedge lemma (M5.2).** Nothing above reaches `e^{±zⁿ}` for `n ≥ 2`: Jordan's reader
  // wants a LINEAR exponent and declines, and the exact rational reader declines a `call`, so until
  // now such an arc fell through to `null` and KILL reported "no lemma here applies to this
  // integrand" for the one integrand L6 exists for. The face — Gaussian or oscillatory — is read
  // off `w` inside the bound, and with it the arc's admissible range; see `wedgeArc.ts` for why
  // those are one question and not two (finding D-1).
  const wedge = asExponentialOfPower(ast);
  if (wedge) {
    const from = asPiMultiple(g.theta0);
    const to = asPiMultiple(g.theta1);
    if (from === null || to === null) return null;
    return wedgeArcBound(wedge, R, { from, to });
  }

  const rational = toExactRational(ast);
  if (!rational.ok) return null;
  return mlArcBound(rational.value.num, rational.value.den, R, extent);
}

/**
 * The summation square's side, when the integrand carries a kernel — tier G's disposer.
 *
 * Reads the half-width off the SIDE itself and checks the square is a square: an axis-parallel
 * segment whose constant coordinate has the same magnitude as half its length, centred at the
 * origin. The check is not bureaucracy — `sup|cot πz| = coth(π(N+½))` is a statement about that
 * geometry, and a side of some other rectangle gets the right formula on the wrong figure.
 */
function disposeSquareSide(kernel: SummationKernel, g: Resolved): ArcBound | null {
  if (g.kind !== "segment") return null;
  const [x0, y0] = g.from;
  const [x1, y1] = g.to;
  const vertical = Math.abs(x1 - x0) < 1e-12;
  const horizontal = Math.abs(y1 - y0) < 1e-12;
  // EQUIVALENT UNDER MUTATION, and kept: `centred` below already rejects both cases this catches,
  // since a diagonal fails the horizontal branch's `y0 = y1` and a degenerate point fails the
  // vertical branch's `y0 = −y1`. It stays because reading a diagonal's "offset" off one coordinate
  // is the class of error M4.6c found in every arc bound at once, and a guard at the top says so.
  if (vertical === horizontal) return null; // diagonal, or a degenerate point
  const offset = vertical ? Math.abs(x0) : Math.abs(y0);
  const span = vertical ? Math.abs(y1 - y0) : Math.abs(x1 - x0);
  const centred = vertical
    ? Math.abs(y0 + y1) < 1e-9 && Math.abs(x0 - x1) < 1e-12
    : Math.abs(x0 + x1) < 1e-9 && Math.abs(y0 - y1) < 1e-12;
  if (!centred || Math.abs(span - 2 * offset) > 1e-9) return null;
  const halfWidth = asExactRadius(offset);
  if (halfWidth === null) return null;
  return squareSideBound(kernel.kind, kernel.num, kernel.den, halfWidth);
}

/**
 * L1 on a VERTICAL SIDE of a strip — the app's first vanishing piece that is not an arc.
 *
 * `disposeArc` declines anything whose geometry is not an arc, so until M5.3c a rectangle's vertical
 * side reached no lemma at all and KILL reported "no lemma here applies" for the two pieces tier E's
 * whole argument needs killed. The dispatch is by GEOMETRY — the piece either lies on a vertical
 * line off the imaginary axis or it does not — and by SHAPE: the integrand has to read as
 * `e^{az}·N(e^z)/D(e^z)`, which is what makes `|w| = e^{±R}` mean anything.
 *
 * A HORIZONTAL side gets nothing, and that is not an omission. In a strip argument the horizontal
 * side opposite the target does not vanish, it REPRODUCES, and offering it a bound would invite
 * E1's first trap: it is a translate of the bottom, so its ML bound is proportional to the length
 * `2R` and DIVERGES.
 */
function disposeStripSide(ast: Node, g: Resolved): ArcBound | null {
  if (g.kind !== "segment") return null;
  const [x0, y0] = g.from;
  const [x1, y1] = g.to;
  if (Math.abs(x0 - x1) > 1e-9) return null; // not vertical
  if (Math.abs(x0) < 1e-9) return null; // on the imaginary axis: there is no R → ∞ in it
  const form = asExponentialLattice(ast);
  if (form === null) return null;
  return stripSideBound(form, {
    side: x0 > 0 ? "right" : "left",
    R: Math.abs(x0),
    length: Math.abs(y1 - y0),
    imagRange: [Math.min(y0, y1), Math.max(y0, y1)],
  });
}

/**
 * L1 on a vertical side for a GAUSSIAN — E3's two verticals, which no other disposer sees.
 *
 * The dispatch is by geometry (a vertical segment) and by shape (`λ·e^{Q(z)}` with `Q` quadratic).
 * `disposeStripSide` declines it because `e^{−z²}` is not `N(e^z)/D(e^z)`, and `disposeArc` because
 * it is not an arc — so without this the record's KILL pass reports "no lemma here applies" for the
 * only two pieces its argument needs killed.
 *
 * Unlike the strip's, this side may sit ANYWHERE, the imaginary axis included: `e^{−z²}` decays in
 * `Re z` with no `R → ∞` hidden in a lattice, so `Re z = 0` is a perfectly ordinary place for a
 * segment to be and the bound there is simply large.
 */
function disposeGaussianSide(ast: Node, g: Resolved): ArcBound | null {
  if (g.kind !== "segment") return null;
  const [x0, y0] = g.from;
  const [x1, y1] = g.to;
  if (Math.abs(x0 - x1) > 1e-9) return null; // not vertical
  const form = asExponentialOfPolynomial(ast);
  if (form === null || form.q.degree() !== 2) return null;
  const c = asExactCoordinate(x0);
  const a = asExactCoordinate(y0);
  const b = asExactCoordinate(y1);
  if (c === null || a === null || b === null) return null;
  return gaussianSideBound(form.q, form.lambda, { c, y0: a, y1: b });
}

/**
 * The same ML bound as `disposeArc`, for `z^α·R(z)`.
 *
 * WHICH LIMIT is not inferable from the geometry: an outer circle and an inner circle differ only in
 * radius, and D1's two are 1e9 apart at one fixture and adjacent at another. So it is read off the
 * DECLARED lemma — `L2` is the large arc, `L1` the small one — which is the same reason `L4` and `L5`
 * are declared rather than guessed.
 */
function disposeBranchArc(
  power: { readonly factor: PowerFactor; readonly rational: Node },
  g: Resolved,
  lemma: Piece["lemma"],
): ArcBound | null {
  if (g.kind !== "arc") return null;
  const R = arcRadius(g);
  const extent = arcExtent(g);
  if (!R || !extent) return null;
  const limit = lemma === "L1" ? "0+" : lemma === "L2" ? "inf" : null;
  if (limit === null) return null;
  const rational = toExactRational(power.rational);
  if (!rational.ok) return null;
  return branchArcBound(power.factor.alpha, rational.value.num, rational.value.den, R, {
    limit,
    piMultiple: extent,
  });
}

/**
 * The same ML bound as `disposeBranchArc`, for `R(z)·log^m z`.
 *
 * The log changes no exponent — it is weaker than every power — so the two circles of D4's keyhole
 * are killed by the decay of `R` alone, which is what its `decay-beats-log-squared` and
 * `regular-at-origin` hypotheses say. `logArc.ts` carries the one place it does matter.
 */
function disposeLogArc(
  log: { readonly factor: LogFactor; readonly rational: Node },
  g: Resolved,
  lemma: Piece["lemma"],
): ArcBound | null {
  if (g.kind !== "arc") return null;
  const R = arcRadius(g);
  const extent = arcExtent(g);
  if (!R || !extent) return null;
  const limit = lemma === "L1" ? "0+" : lemma === "L2" ? "inf" : null;
  if (limit === null) return null;
  const rational = toExactRational(log.rational);
  if (!rational.ok) return null;
  return logArcBound(log.factor.power, rational.value.num, rational.value.den, R, {
    limit,
    piMultiple: extent,
    argRange: log.factor.argRange,
  });
}

/**
 * The ML bound for `c·∏(z−bⱼ)^{αⱼ}·R(z)` on an end cap that sits ON one of its own branch points.
 *
 * The dispatch is by GEOMETRY and not by declaration, for once: the cap's centre either is a branch
 * point of the factor or it is not, and that is a fact about the picture rather than a choice. A cap
 * centred anywhere else gets no bound of this shape — every other bound in `kernel/bounds/` reasons
 * about `|z| = R` from the ORIGIN, and applying one to an arc centred elsewhere computes a `≤` from
 * the wrong geometry.
 */
function disposeDogboneArc(
  multi: { readonly factor: MultiPowerFactor; readonly rational: Node },
  g: Resolved,
  lemma: Piece["lemma"],
): ArcBound | null {
  if (g.kind !== "arc" || lemma !== "L1") return null;
  const radius = g.radius;
  if (!Number.isFinite(radius) || radius <= 0) return null;
  const extent = arcExtent(g);
  if (!extent) return null;
  const eta = Frac.of(
    BigInt(Math.round((Math.round(radius * 1e6) / 1e6) * 1e6)),
    1000000n,
  );

  const here = multi.factor.points.findIndex((b) => {
    const [x, y] = b.at.toTuple();
    return Math.hypot(x - g.center[0], y - g.center[1]) < 1e-9;
  });
  if (here < 0) return null;
  const centre = multi.factor.points[here].at.asGauss();
  if (centre === null) return null; // the shift is exact over ℚ(i); a centre in ℚ(i)(√d) is not it

  const rational = toExactRational(multi.rational);
  if (!rational.ok) return null;

  const others: { distanceSquared: Frac; alpha: Frac; label: string }[] = [];
  for (let j = 0; j < multi.factor.points.length; j++) {
    if (j === here) continue;
    const gap = multi.factor.points[here].at.sub(multi.factor.points[j].at);
    const squared = gap.mul(SqrtExt.of(gap.a.conj(), gap.b.conj(), gap.d)).asGauss();
    if (squared === null || !squared.im.isZero()) return null;
    others.push({
      distanceSquared: squared.re,
      alpha: multi.factor.points[j].alpha,
      label: multi.factor.points[j].label,
    });
  }

  const c = multi.factor.constant
    .mul(
      SqrtExt.of(
        multi.factor.constant.a.conj(),
        multi.factor.constant.b.conj(),
        multi.factor.constant.d,
      ),
    )
    .asGauss();
  if (c === null || !c.im.isZero()) return null;

  return dogboneArcBound({
    alpha: multi.factor.points[here].alpha,
    others,
    constantModulusSquared: c.re,
    num: rational.value.num.shift(centre),
    den: rational.value.den.shift(centre),
    eta,
    piMultiple: extent,
  });
}

/**
 * The only constructor of a ledger row — which is what makes `claim` a derived field rather than a
 * second source of truth for what the row says.
 *
 * Exported so that a test building a synthetic row goes through it too: a row assembled as a literal
 * would carry a `claim` string and a `claimData` that need not agree, and the pair is only
 * trustworthy because nothing can write them separately.
 */
export const rowFrom = (
  constraint: ConstraintId,
  status: LedgerRow["status"],
  claimData: Claim,
  evidence: Certificate,
  pieceId?: string,
  repair?: string,
): LedgerRow => ({
  constraint,
  status,
  claim: renderClaim(claimData),
  claimData,
  evidence,
  pieceId,
  repair,
});

export interface LedgerInput {
  readonly ast: Node;
  readonly pieces: readonly Resolved[];
  readonly spec: readonly Piece[];
  readonly poles: PoleReport;
  readonly integral: ContourIntegral;
  readonly theorem: ResidueTheoremResult;
  /** The cut system. Omitted for a rational integrand, which is {@link NO_BRANCH}. */
  readonly branch?: BranchChoice;
  /** The branch factor `z^α` and its rational cofactor — see `analyse.ts`. */
  readonly power?: { readonly factor: PowerFactor; readonly rational: Node };
  /** The branch factor `log^m z` and its rational cofactor — the other half of the same seat. */
  readonly log?: { readonly factor: LogFactor; readonly rational: Node };
  /** The multi-point branch factor `c·∏(z−bⱼ)^{αⱼ}` and its cofactor — the dogbone's seat. */
  readonly multi?: { readonly factor: MultiPowerFactor; readonly rational: Node };
  /**
   * The summation kernel `π cot(πz)` / `π csc(πz)` and its cofactor — tier G's seat.
   *
   * Reaches only the KILL pass, and only for a side of a centred square: nothing else in the file
   * can bound a transcendental times a rational, so before this such a side fell through to "no
   * lemma here applies to this integrand" — true, and the wrong thing to be true.
   */
  readonly summation?: {
    readonly kernel: SummationKernel;
    /**
     * False when the contour reaches too far for the kernel's poles to be listed at all.
     *
     * Every integer is a pole, so this is a work limit — and the point of carrying it is that
     * "no poles were listed" and "there are no poles" must not look the same to LEGALITY.
     */
    readonly windowed: boolean;
    /**
     * The unknown the RECORD puts inside the residue sum — tier G's `residueSelection.targetTerms`.
     *
     * Absent in the sandbox, where a `cot` integrand on a square establishes a closed-contour value
     * and nothing else. Present, it is what lets COVER distinguish the two: a target that is a TERM
     * of the sum is covered by the argument just as surely as one that is a piece of the contour,
     * and reporting "no piece is marked as the target" about a record that declares one would read
     * as a gap where there is none.
     */
    readonly target?: { readonly id: string; readonly weight: 1 | 2 };
    /**
     * SG-6: a hypothesis that FAILS while a stronger argument applies — the record's `escalate`.
     *
     * Carried so CATCH can say so. Without a row the outcome would be invisible: the hypothesis
     * "f has no pole at an integer" is false for G1, the answer is exactly right, and a ledger
     * silent about both would leave a reader to reconcile them.
     */
    readonly escalation?: { readonly to: string; readonly collisions: number };
  };
  /**
   * A `free` piece whose value is exactly known and NOT derived by this contour — ADR-0042.
   *
   * **What it fixes is a row, not a number.** Without it a `free` piece takes the quadrature's
   * certificate, so E3's argument — entire integrand, both verticals certified dead, `∮ = 0`
   * exactly — came out `≈`, capped by its most certain step. The opposite failure is the reason the
   * row is not simply `exact`: it carries the record's own `method` after "imported, not derived
   * here", so the reader sees which part of the argument came from outside it.
   *
   * A plain structure rather than the `families/` type, because packages here import DOWNWARD only:
   * `runFamily` resolves the expression (once — see `resolveImports`) and hands over what the row
   * needs. `numeric` is here so the cross-check can happen where the piece's own quadrature is.
   */
  readonly imported?: readonly {
    readonly pieceId: string;
    /** How the value reads — `e^(−289/400)·√π`. */
    readonly text: string;
    /** The same value typeset. Carried from the formatter: `text` is the app's own notation and
     *  does not parse as an expression, so a re-print here would have nothing to read. */
    readonly latex: string;
    readonly numeric: readonly [number, number];
    /** The record's provenance sentence. */
    readonly method: string;
    /** The closed set's own sentence about the atom it rests on. */
    readonly source: string;
  }[];
}

/**
 * Evaluate the four constraints and say whether the argument closes.
 *
 * A failing row names the constraint and suggests a repair. The point of that is the pedagogy
 * research's strongest single finding about interactivity: a wrong contour should fail *visibly and
 * diagnostically*, because static text can only assert that the lower half-plane is the wrong way to
 * close `∫cos x/(1+x²)` — an app can show the bound diverging.
 */
export function evaluateLedger(input: LedgerInput): LedgerResult {
  const { ast, pieces, spec, poles, integral, theorem } = input;
  const branch = input.branch ?? NO_BRANCH;
  const rows: LedgerRow[] = [];
  const certificates: Certificate[] = [];
  const pieceLimits: { pieceId: string; contribution: ExpSum }[] = [];

  const push = (row: LedgerRow): void => {
    rows.push(row);
    certificates.push(row.evidence);
  };

  // ---- LEGALITY -----------------------------------------------------------------------------
  if (integral.refusal !== undefined) {
    push(
      rowFrom(
        "LEGALITY",
        "failed",
        claimOf("legality.avoid-singularities"),
        refuse("LEGALITY", integral.refusal),
        undefined,
        "Indent around the singularity, or move the contour.",
      ),
    );
    return {
      rows,
      closes: false,
      verdict: assembleVerdict(certificates),
      failedAt: "LEGALITY",
      hasTarget: spec.some((p) => p.role === "target"),
      pieceLimits,
    };
  }

  const closed = isClosed(pieces);
  push(
    rowFrom(
      "LEGALITY",
      closed ? "satisfied" : "failed",
      claimOf(closed ? "legality.closed" : "legality.not-closed"),
      closed
        ? exact("the contour closes", "endpoint-to-endpoint check over the piece list")
        : refuse("LEGALITY", "the residue theorem applies to closed contours"),
      undefined,
      closed ? undefined : "join the last piece back to the first",
    ),
  );
  if (!closed) {
    return {
      rows,
      closes: false,
      verdict: assembleVerdict(certificates),
      failedAt: "LEGALITY",
      hasTarget: spec.some((p) => p.role === "target"),
      pieceLimits,
    };
  }

  const minClearance = Math.min(
    ...poles.poles.map((p) => clearance(pieces, p.at)),
    Number.POSITIVE_INFINITY,
  );
  if (Number.isFinite(minClearance)) {
    push(
      rowFrom(
        "LEGALITY",
        "satisfied",
        claimOf("legality.clearance", {
          nearest: { kind: "number", value: minClearance, digits: 3 },
        }),
        exact("clearance", "distance from each pole to each piece"),
      ),
    );
  } else if (poles.entire) {
    // **AN EMPTY SINGULAR SET IS INFORMATION, AND SO IS ITS CLEARANCE.** With nothing to measure,
    // the row above is omitted and LEGALITY said NOTHING about singularities — for the one record
    // whose whole content is that the set is empty (E3, and F2 after it). "There are none" and
    // "none were looked for" then looked the same on the ledger, which is precisely the distinction
    // `PoleReport.entire` was made a DECISION for in M5.3a. A refusal to decide still prints
    // nothing, which is right: it is not a claim.
    push(
      rowFrom(
        "LEGALITY",
        "satisfied",
        claimOf("legality.entire"),
        exact("the singular set is empty", "decided — not the absence of a pole search"),
      ),
    );
  }

  // **A WINDOW THAT COULD NOT BE OPENED IS NOT AN EMPTY ONE.** The summation kernel has a pole at
  // every integer, listed over a band read off the contour; past a work limit that band is refused
  // rather than truncated, because a truncated list would leave LEGALITY calling a contour clear of
  // singularities it runs straight through. The row exists so the refusal is visible instead.
  if (input.summation !== undefined && !input.summation.windowed) {
    push(
      rowFrom(
        "LEGALITY",
        "unknown",
        claimOf("legality.kernel-band"),
        unknown(
          "clearance from the kernel's poles",
          "the band is read off the contour's own extent and is refused past a work limit — listing a prefix of an infinite pole set would report a contour as clear of poles it passes through",
        ),
        undefined,
        "Reduce $N$.",
      ),
    );
  }

  // ---- LEGALITY, steps 2 and 3: the cut system ----------------------------------------------
  //
  // Validity BEFORE crossings, which inverts DESIGN §4 Pass 1's numbering for a reason: a malformed
  // or inadmissible cut system has no polyline to test a piece against, so asking "does this piece
  // cross that cut" of it would be answering a question about an object that does not exist. The two
  // rows are omitted entirely for a rational integrand — a permanently green "no cuts to check" row
  // teaches nothing and hides the rows that do.
  if (branch.points.length > 0 || branch.cuts.length > 0) {
    const admissible = checkAdmissibility(branch);
    push(
      rowFrom(
        "LEGALITY",
        admissible.ok ? "satisfied" : "failed",
        claimOf(
          admissible.ok ? "legality.cuts-admissible" : "legality.cuts-inadmissible",
          {
            detail: { kind: "text", text: admissible.detail },
          },
        ),
        admissible.certificate,
        undefined,
        admissible.repair,
      ),
    );
    if (!admissible.ok) {
      return {
        rows,
        closes: false,
        verdict: assembleVerdict(certificates),
        failedAt: "LEGALITY",
        hasTarget: spec.some((p) => p.role === "target"),
        pieceLimits,
      };
    }

    // One scale for both the ray clipping and the "too close to say" floor, taken from the picture
    // the user is actually looking at: the contour's own extent, plus every branch point, so a cut
    // running out past the contour is still clipped beyond everything the test cares about.
    const extent = Math.max(
      1,
      ...pieces
        .flatMap((g) => [startPoint(g), endPoint(g)])
        .map((q) => Math.hypot(q[0], q[1])),
      ...branch.points.map((b) => Math.hypot(b.at[0], b.at[1])),
    );

    // FIRST, the topological question one piece of geometry cannot answer: is the contour a loop in
    // ℂ∖Γ at all? It is exactly when the integrand comes back to the value it started with, and what
    // decides that is the TOTAL monodromy — `exp(2πi Σⱼ n(γ,bⱼ)·αⱼ)` — not any one winding number.
    //
    // **THIS IS WHY THE DOGBONE IS LEGAL AND A NAKED CIRCLE IS NOT.** A dogbone winds `−1` about each
    // end of `√(1−z²)`'s cut, so testing the branch points one at a time refuses it — and the refusal
    // is wrong, because `Σ n·α = (−1)(−½) + (−1)(−½) = 1 ∈ ℤ` and `f` returns to itself. That is the
    // same arithmetic as admissibility (research 06 §2.1(b)) read along a contour instead of along a
    // component of the cut forest, and the same reason it is a DECISION: `αⱼ` are exact `Frac`s, so
    // `Σ n·α` has denominator 1 or it does not, and there is no "nearly an integer".
    //
    // A `log` point is the one case no cancellation reaches: its monodromy adds `2πi` rather than
    // multiplying by a root of unity, so any non-zero winding about one is a refusal on its own.
    const turns: string[] = [];
    let monodromy = Frac.ZERO;
    const logTurns: string[] = [];
    const undecidedTurns: string[] = [];
    for (const point of branch.points) {
      const genuine = point.order.kind === "log" || point.order.alpha.d !== 1n;
      if (!genuine) continue;
      const w = windingNumber(pieces, point.at);
      if (!w.decided) {
        undecidedTurns.push(`${point.label} (${w.reason})`);
        continue;
      }
      if (w.n === 0) continue;
      turns.push(`$\\operatorname{Ind}_\\gamma(${point.label.replace("z = ", "")}) = ${formatFrac(Frac.of(BigInt(w.n)), LATEX)}$`);
      if (point.order.kind === "log") logTurns.push(point.label);
      else monodromy = monodromy.add(point.order.alpha.mul(Frac.of(BigInt(w.n))));
    }

    const monodromyFailure =
      undecidedTurns.length > 0
        ? `the winding number about a branch point could not be decided (${undecidedTurns.join("; ")}), so the monodromy along $\\gamma$ is not decided either`
        : logTurns.length > 0
          ? `the contour winds about the logarithmic branch point ${logTurns.join(", ")}: one turn adds $2\\pi i$ to $\\log(z - b)$, and no winding but zero brings it back`
          : turns.length > 0 && monodromy.d !== 1n
            ? `the contour's total monodromy is $e^{2\\pi i \\cdot ${formatFrac(monodromy, LATEX)}} \\ne 1$: ${turns.join(", ")}, and $\\sum_j \\operatorname{Ind}_\\gamma(b_j)\\,\\alpha_j = ${formatFrac(monodromy, LATEX)}$ is not an integer, so the integrand does not return to the value it started with and no single sheet carries the answer`
            : null;

    if (monodromyFailure !== null) {
      push(
        rowFrom(
          "LEGALITY",
          "failed",
          undecidedTurns.length > 0
            ? claimOf("legality.monodromy-undecided")
            : claimOf("legality.monodromy-off-sheet", {
                turns: { kind: "exact", text: turns.join(", ") },
              }),
          refuse("LEGALITY", monodromyFailure, {
            provenance: [
              {
                ok: false,
                text: "each winding number is decided exactly, by the same sign predicates the poles use",
              },
              {
                ok: true,
                text: "the test is on the sum $\\sum_j \\operatorname{Ind}_\\gamma(b_j)\\alpha_j$, not on any single winding: a contour may encircle two branch points and still close on one sheet, which is what a dogbone does",
              },
            ],
          }),
          undefined,
          "Exclude the branch point (a keyhole), or enclose the whole cut (a dogbone).",
        ),
      );
      return {
        rows,
        closes: false,
        verdict: assembleVerdict(certificates),
        failedAt: "LEGALITY",
        hasTarget: spec.some((p) => p.role === "target"),
        pieceLimits,
      };
    }

    // The positive row, emitted only when there is something to say: a contour that encircles nothing
    // has no monodromy question to answer, and a row asserting that would be noise.
    if (turns.length > 0) {
      push(
        rowFrom(
          "LEGALITY",
          "satisfied",
          claimOf("legality.monodromy-on-sheet", {
            sum: {
              kind: "exact",
              text: formatFrac(monodromy),
              latex: formatFrac(monodromy, LATEX),
            },
          }),
          exact(
            `the monodromy along $\\gamma$ is $e^{2\\pi i \\cdot ${formatFrac(monodromy, LATEX)}} = 1$`,
            "$\\sum_j \\operatorname{Ind}_\\gamma(b_j)\\,\\alpha_j$, over exact winding numbers and exact exponents",
            {
              provenance: [
                {
                  ok: true,
                  text: `${turns.join(", ")} — non-zero, and the sum is what has to be an integer`,
                },
                {
                  ok: true,
                  text: "this is the dogbone's licence: it winds about both ends of a bounded cut, and the two turns cancel in the exponent",
                },
              ],
            },
          ),
        ),
      );
    }

    // Each offending piece is kept BOTH ways: as the claim the row states (so the piece and the cut
    // are arguments a renderer can typeset apart from the prose) and as the flat sentence the
    // refusal certificate joins with every other one. The two are composed here, once, from the
    // same three parts.
    const offending: { readonly text: string; readonly claim: Claim }[] = [];
    const undecidable: { readonly text: string; readonly claim: Claim }[] = [];
    /** What each offending crossing would COST — research 06 §3.2's other half. */
    const costs: string[] = [];
    let declared = 0;
    for (const cut of branch.cuts) {
      const poly = cutPolyline(branch, cut, 4 * extent);
      if (poly === null) continue; // admissibility already proved every endpoint exists
      for (let k = 0; k < pieces.length; k++) {
        const c = classifyAgainstCut(cut.id, pieces[k], poly, extent);
        // `clear` and `endpoint` are both fine: a piece ENDING on the cut is the contour arriving at
        // it, which is where one piece of a keyhole hands over to the next.
        if (c.kind === "clear" || c.kind === "endpoint") continue;
        const piece = spec[k];
        const label = piece?.name ?? `piece ${k + 1}`;
        const named: ClaimArg = {
          kind: "piece",
          id: piece?.id ?? `#${k + 1}`,
          name: label,
        };
        const onCut: ClaimArg = { kind: "cut", name: cut.id };
        if (c.kind === "touches") {
          undecidable.push({
            text: `${label} grazes the cut '${cut.id}'`,
            claim: claimOf("legality.cut-grazed", { piece: named, cut: onCut }),
          });
        } else if (piece?.side === undefined) {
          const how = c.kind === "along" ? "runs along" : "crosses";
          offending.push({
            text: `${label} ${how} the cut '${cut.id}'`,
            claim: claimOf("legality.cut-crossed", {
              piece: named,
              how: { kind: "text", text: how },
              cut: onCut,
            }),
          });
          // **AND WHAT IT WOULD COST.** Research 06 §3.2: the app must "either refuse the crossing
          // or change sheet and say so, WITH THE MULTIPLICATIVE FACTOR SHOWN … silently continuing
          // is the misconception generator". It has refused since M4.1 and said nothing about the
          // factor, which teaches a reader that a cut is a wall rather than a bookkeeping choice
          // with a price. Named once per offending cut, not per piece.
          const cost = crossingMonodromy(branch, cut.id);
          if (cost !== null && !costs.includes(cost.detail)) costs.push(cost.detail);
        } else if (needsSide(c.kind)) {
          declared += 1;
        }
      }
    }

    const cutOk = offending.length === 0 && undecidable.length === 0;
    push(
      rowFrom(
        "LEGALITY",
        cutOk ? "satisfied" : "failed",
        cutOk
          ? declared === 0
            ? claimOf("legality.cuts-clear")
            : claimOf("legality.cuts-sided", {
                declared: { kind: "count", n: declared, noun: "piece" },
              })
          : undecidable.length > 0
            ? undecidable[0].claim
            : offending[0].claim,
        cutOk
          ? exact(
              "each piece is on a definite side of each cut",
              "exact-sign segment predicates, and the circle–line quadratic for arcs",
              {
                // Every cut's factor, whether or not the contour is near one: this is the number
                // that WOULD apply, and knowing it in advance is what lets a reader see the
                // crossing coming instead of meeting a refusal.
                //
                // Each one's own provenance comes with it, flattened, because that is where §3.4's
                // two forms live — `e^{2πi(α−1)}` as the integrand's exponent gives it and
                // `e^{2πiα}` reduced — and a reader who only ever meets the reduced form carries it
                // over to an `x^s` integrand where the `−1` is not there to cancel. Printing the
                // one-line summary and dropping the rest would drop exactly the half that teaches.
                provenance: allCrossingMonodromy(branch).flatMap((m) => [
                  { ok: true, text: m.detail },
                  ...(m.certificate.provenance ?? []),
                ]),
              },
            )
          : refuse(
              "LEGALITY",
              undecidable.length > 0
                ? `${undecidable.map((u) => u.text).join("; ")} — a grazing contact has no side, so no tag would pin anything`
                : `${offending.map((o) => o.text).join("; ")}`,
              {
                provenance: costs.map((text) => ({ ok: false, text })),
              },
            ),
        undefined,
        cutOk
          ? undefined
          : undecidable.length > 0
            ? "Move the cut clear of the contour, or move the contour."
            : "Assign the piece to the upper or lower side of the cut, or move the cut.",
      ),
    );
    // **NORTH-STAR #3's FIRST HALF, AS ITS OWN ROW.** With at least one cut and none of it touching
    // the contour, `∮` does not depend on where the cuts run — so dragging one moves the picture's
    // seam and not the answer. Its own line rather than a note on the row above, because it is a
    // different claim about a different object: that one is about the pieces, this is about the
    // VALUE, and it is the claim that makes the jump on crossing meaningful (a value that drifted
    // under a drag would make a jump one more wobble). Emitted only when it is the operative fact —
    // there are cuts, and the contour is clear of them — so it is not a permanent row of noise.
    if (cutOk && declared === 0 && branch.cuts.length > 0) {
      push(
        rowFrom(
          "LEGALITY",
          "satisfied",
          claimOf(
            branch.cuts.length === 1
              ? "legality.cut-invariance-one"
              : "legality.cut-invariance-many",
          ),
          cutGeometryInvariance(branch.cuts.length),
        ),
      );
    }

    if (!cutOk) {
      return {
        rows,
        closes: false,
        verdict: assembleVerdict(certificates),
        failedAt: "LEGALITY",
        hasTarget: spec.some((p) => p.role === "target"),
        pieceLimits,
      };
    }
  }

  // ---- CATCH --------------------------------------------------------------------------------
  const enclosed = integral.windings.filter((w) => w.decided && w.n !== 0);
  const undecided = integral.windings.filter((w) => !w.decided);
  push(
    rowFrom(
      "CATCH",
      undecided.length === 0 ? "satisfied" : "failed",
      undecided.length === 0
        ? enclosed.length === 1
          ? claimOf("catch.enclosed-one")
          : claimOf("catch.enclosed-many", { n: { kind: "count", n: enclosed.length } })
        : claimOf("catch.winding-undecided"),
      undecided.length === 0
        ? exact(
            `n(γ, ·) for ${integral.windings.length} pole${integral.windings.length === 1 ? "" : "s"}`,
            "exact-sign crossing count over a certified polygonisation",
          )
        : refuse(
            "CATCH",
            "a pole lies too close to the contour to say which side it is on",
          ),
      undefined,
      undecided.length === 0 ? undefined : "move the contour clear of the pole",
    ),
  );

  // **THE QUESTION IS ABOUT THE SUM, NOT ABOUT THE POLE LIST**, and asking the second one made this
  // row FALSE on every record the cyclotomic route serves. D3 at `(a,n) = (2.3, 5)` has printed the
  // exact closed form `(π/5)/sin(23π/50)` beside "not every residue is known exactly, so the total
  // is an estimate" since M4.2e — which is the one thing that route exists to deny: `ℚ(ζ₁₀)` has
  // degree 4 over ℚ so no individual residue is expressible, and the SUM needs none. F1 at `n = 5`
  // and `n = 7` would have been the third such record. `Σ Res` is established exactly exactly when
  // the theorem returned a value, so read that.
  //
  // **AND WHICH exact CLAIM IT IS DEPENDS ON THE ROUTE.** The sentence below about the sum being
  // known while no individual residue is expressible belongs to the CYCLOTOMIC route and is false
  // for tier G, where every residue is expressible — the kernel's at each integer over ℚ(i), the
  // cofactor's as an exact quotient of basis elements. A row that says "no individual residue is
  // expressible" about a record whose residues are all written down is the same kind of false row
  // this arc keeps finding; `findPoles` reporting nothing for a `cot` integrand is why it would.
  const residuesExact = poles.exactlyComplete;
  const sumExact = theorem.exactValue !== undefined;
  const summed = input.summation !== undefined && sumExact;
  push(
    rowFrom(
      "CATCH",
      residuesExact || sumExact ? "satisfied" : "unknown",
      claimOf(
        residuesExact
          ? "catch.residues-exact"
          : summed
            ? input.summation?.escalation === undefined
              ? "catch.residues-exact-kernel"
              : "catch.residues-exact-merged"
            : sumExact
              ? "catch.sum-exact"
              : "catch.residues-inexact",
      ),
      residuesExact
        ? exact(
            "the residues",
            "exact arithmetic over $\\mathbb{Q}(i)$ or one quadratic extension of it",
          )
        : summed
          ? exact(
              "the residues",
              input.summation?.escalation === undefined
                ? "$\\operatorname{Res}(\\pi\\cot(\\pi z)f, n) = f(n)$ and $\\operatorname{Res}(\\pi\\csc(\\pi z)f, n) = (-1)^n f(n)$; at a pole $z_j$ of $f$, $\\operatorname{Res} = K(z_j)\\operatorname{Res}(f, z_j)$"
                : "$\\operatorname{Res}(Kf, n) = f(n)$ at every integer the kernel alone has a pole at; where $f$ has one too the orders add, and the merged residue is the $z^{-1}$ coefficient of the product's Laurent series",
            )
          : sumExact
            ? exact(
                "the residue SUM",
                "the residue sum over the $n$-th roots is computed as a geometric sum, without naming a root",
                {
                  provenance: [
                    {
                      ok: true,
                      text: "a fifth or seventh root of $-1$ generates a field of degree 4 or 6 over $\\mathbb{Q}$, which is why no individual residue is written down",
                    },
                  ],
                },
              )
            : unknown(
                "the residues",
                // **THE REASON WAS UNCONDITIONAL AND THEREFORE SOMETIMES INVENTED.** For `1/cosh z` no
                // pole was found at all — the readers cannot see the function — and telling a reader
                // that "some poles are not expressible in ℚ(i)(√d)" names a difficulty the engine never
                // reached. Which of the two it is is exactly what `rational` records.
                poles.rational
                  ? "some poles lie outside $\\mathbb{Q}(i)(\\sqrt{d})$; their residues are numerical"
                  : "$f$ was not recognised as rational, so its poles were not located — which is not the same as there being none",
              ),
    ),
  );

  // SG-6's row. Reported under CATCH because the escalated hypothesis is about whether the residue
  // theorem catches every singularity: the answer is that it does, by merging the colliding pair
  // rather than by the hypothesis holding.
  const escalation = input.summation?.escalation;
  if (escalation !== undefined) {
    push(
      rowFrom(
        "CATCH",
        "satisfied",
        claimOf("catch.escalation", {
          collisions: {
            kind: "count",
            n: escalation.collisions,
            noun: "declared collision",
          },
        }),
        exact(
          "the escalation",
          "the hypothesis that $f$ has no pole at an integer is sufficient for the clean form of the theorem and not necessary for the contour argument — the product is meromorphic there, the orders add, and the merged residue is computed exactly",
          {
            provenance: [
              {
                ok: true,
                text: "the merged order and residue are declared and checked against the ones computed here",
              },
            ],
          },
        ),
      ),
    );
  }

  // ---- KILL ---------------------------------------------------------------------------------
  let killFailed = false;
  for (let k = 0; k < pieces.length; k++) {
    const piece = spec[k];
    const geom = pieces[k];
    if (!piece) continue;

    if (piece.role === "target") {
      push(
        rowFrom(
          "KILL",
          "satisfied",
          claimOf("kill.target", { piece: pieceArg(piece) }),
          exact("the target piece", "declared by its role"),
          piece.id,
        ),
      );
      continue;
    }

    // L4 FIRST, because no shape test would find it: an indentation and a closing arc can share a
    // centre (they do in C1), and dispatching on radius would be guessing. The lemma is declared.
    if (piece.role === "vanish" && piece.lemma === "L4") {
      const small = smallArcLimit(
        geom,
        poles.exactPoles ?? [],
        poles.exponentialFrequency,
      );
      if (small.ok) {
        pieceLimits.push({ pieceId: piece.id, contribution: small.limit.contribution });
        push(
          rowFrom(
            "KILL",
            "satisfied",
            certificateClaim(small.limit.certificate.claim),
            small.limit.certificate,
            piece.id,
          ),
        );
      } else {
        killFailed = true;
        push(
          rowFrom(
            "KILL",
            "failed",
            claimOf("kill.l4-inapplicable", { piece: pieceArg(piece) }),
            small.certificate,
            piece.id,
            "The indentation lemma requires a simple pole; at order $\\ge 2$ the limit does not exist, and neither does the principal value.",
          ),
        );
      }
      continue;
    }

    // L5: the large arc that does not vanish. Like L4 it is declared, not inferred — the degree test
    // that would pick L2 is exactly the one that fails here, so guessing would pick the wrong lemma
    // and silently return 0 for the target (C2's `l2-instead-of-l5` trap).
    if (piece.role === "vanish" && piece.lemma === "L5") {
      const form = poles.exponentialSum;
      if (form === undefined) {
        killFailed = true;
        push(
          rowFrom(
            "KILL",
            "unknown",
            claimOf("kill.l5-unreadable", { piece: pieceArg(piece) }),
            unknown(
              piece.name,
              "L5 needs z·f(z)'s limit, which needs that decomposition",
            ),
            piece.id,
          ),
        );
        continue;
      }
      const mid = geom.kind === "arc" ? (geom.theta0 + geom.theta1) / 2 : 0;
      const half = Math.sin(mid) >= 0 ? "upper" : "lower";
      const large = largeArcLimit(form, geom, half);
      if (large.ok) {
        if (!large.limit.contribution.isZero()) {
          pieceLimits.push({ pieceId: piece.id, contribution: large.limit.contribution });
        }
        push(
          rowFrom(
            "KILL",
            "satisfied",
            certificateClaim(large.limit.certificate.claim),
            large.limit.certificate,
            piece.id,
          ),
        );
      } else {
        killFailed = true;
        push(
          rowFrom(
            "KILL",
            "failed",
            claimOf("kill.l5-no-limit", { piece: pieceArg(piece) }),
            large.certificate,
            piece.id,
            "The large-arc lemma requires $z f(z) \\to L$ uniformly on the arc.",
          ),
        );
      }
      continue;
    }

    // A `reproduces` piece is not computed and does not vanish: it comes back as a MULTIPLE of the
    // unknown, and that multiple is the whole mechanism of a keyhole. Its own row says so, rather
    // than reporting a quadrature of a piece whose value the argument never uses.
    if (piece.role === "reproduces") {
      // The multiple itself is FAMILY data — the runtime piece has a role and no coefficient row —
      // so the row names the mechanism and Pass 5 reports the factor. Same split as `solveTarget`'s.
      push(
        rowFrom(
          "KILL",
          "satisfied",
          claimOf("kill.reproduces", { piece: pieceArg(piece) }),
          exact(
            "the piece reproduces the unknown",
            "the piece is a constant multiple of the target; its coefficient enters the linear system",
          ),
          piece.id,
        ),
      );
      continue;
    }

    if (piece.role !== "vanish") {
      // AN IMPORTED PIECE IS NOT A QUADRATURE. ADR-0042: its value is exactly known and comes from
      // outside this argument, so the row carries `=` with the provenance attached — and the
      // quadrature becomes what it should always have been here, an independent CHECK rather than
      // the source. The gap is a limit against a finite limit parameter, so it is reported and only
      // a visible discrepancy is marked ✗: it is evidence about the contour's tail as much as about
      // the value, and what it rules out is a record having written the wrong expression.
      const imported = input.imported?.find((x) => x.pieceId === piece.id);
      if (imported !== undefined) {
        const measured = integral.pieces[k]?.value;
        const check =
          measured === null || measured === undefined
            ? null
            : relativeGap(measured, imported.numeric);
        push(
          rowFrom(
            "KILL",
            "satisfied",
            claimOf("kill.imported", {
              piece: pieceArg(piece),
              value: { kind: "exact", text: imported.text, latex: imported.latex },
            }),
            exact(
              `${piece.name} $= ${imported.latex}$`,
              `imported, not derived here — ${imported.method}`,
              {
                provenance: [
                  { ok: true, text: imported.source },
                  ...(check === null
                    ? []
                    : [
                        {
                          // **RELATIVE, AND DELIBERATELY COARSE.** At a finite limit parameter the gap
                          // is the piece's own TAIL as much as any error in the value, and the record
                          // does not state how big that tail is — so no tight verdict is available
                          // here. What the check CAN separate is a converging tail from a different
                          // number: E3's is 1.5e-8 of the value at R = 4 and 1.6e-13 at R = 8, while
                          // the same record with one factor dropped is off by half the value.
                          ok: check.relative < 0.01,
                          text:
                            `an independent check: the quadrature of this piece is ${check.absolute.toExponential(2)} away ` +
                            `(${(check.relative * 100).toPrecision(2)}% of it) — at a finite limit parameter that gap is the piece's own tail`,
                        },
                      ]),
                ],
              },
            ),
            piece.id,
          ),
        );
        continue;
      }
      push(
        rowFrom(
          "KILL",
          "satisfied",
          claimOf("kill.computed", {
            piece: pieceArg(piece),
            length: { kind: "number", value: arcLength(geom), digits: 3 },
          }),
          integral.pieces[k]?.certificate ??
            unknown(piece.name, "no quadrature result for this piece"),
          piece.id,
        ),
      );
      continue;
    }

    const disposal =
      input.multi !== undefined
        ? disposeDogboneArc(input.multi, geom, piece.lemma)
        : input.log !== undefined
          ? disposeLogArc(input.log, geom, piece.lemma)
          : input.power === undefined
            ? (disposeArc(ast, geom) ??
              (input.summation === undefined
                ? null
                : disposeSquareSide(input.summation.kernel, geom)) ??
              disposeStripSide(ast, geom) ??
              disposeGaussianSide(ast, geom))
            : disposeBranchArc(input.power, geom, piece.lemma);
    if (!disposal) {
      killFailed = true;
      // **WHICH OF THE TWO FAILED, THE INTEGRAND OR THE GEOMETRY?** Until M5.4b this row said "no
      // lemma here applies to this integrand" whatever the cause, and for `1/(1 + z⁵)` on a `2π/5`
      // arc that was false — the plain ML bound applies perfectly and the degree gap is 5 ≥ 2; what
      // could not be done was READING the arc's sweep as an exact multiple of π. Blaming the
      // integrand for that sends a reader to look at the one thing that was fine, and hides the
      // one that was not.
      const unreadable =
        geom.kind === "arc" && arcExtent(geom) === null && arcRadius(geom) !== null;
      push(
        rowFrom(
          "KILL",
          "unknown",
          claimOf(unreadable ? "kill.sweep-unreadable" : "kill.no-lemma", {
            piece: pieceArg(piece),
          }),
          unknown(
            `the arc ${piece.name}`,
            geom.kind === "arc" && (geom.center[0] !== 0 || geom.center[1] !== 0)
              ? "every certified arc bound here reasons on |z| = R about the ORIGIN, and this arc is centred elsewhere — a dogbone's end caps need the bound taken about their own branch point instead"
              : unreadable
                ? `an ML bound is the sweep times the radius times max|f|, so the sweep enters the number: it is read as an exact p/q·π with q ≤ ${MAX_PI_DENOMINATOR}, and this arc's is not one — a degenerate sweep included, whose bound would be a vacuous ≤ 0`
                : input.power === undefined && input.log === undefined
                  ? "the certified bounds cover a rational integrand, one times e^{iaz}, λ·e^{w zⁿ} on a wedge measured from the positive real axis, or e^{az}·N(e^z)/D(e^z) on a vertical side of a strip; this is none of them"
                  : "a branch factor's arc bound needs the lemma declared as L1 (ε → 0) or L2 (R → ∞), and a rational cofactor",
          ),
          piece.id,
          "the numeric value still stands, but the limit is not established",
        ),
      );
      continue;
    }

    const ok = disposal.asymptotics === "vanishes";
    if (!ok) killFailed = true;
    push(
      rowFrom(
        "KILL",
        ok ? "satisfied" : "failed",
        certificateClaim(disposal.certificate.claim),
        disposal.certificate,
        piece.id,
        ok
          ? undefined
          : disposal.asymptotics === "diverges"
            ? "close the contour through the other half-plane"
            : "The ML-estimate does not vanish; Jordan's lemma or an indentation may still apply.",
      ),
    );
  }

  // ---- COVER --------------------------------------------------------------------------------
  // THREE STATES, NOT TWO. A tier-G contour has no `target` piece — every side vanishes — and the
  // unknown is a TERM of the residue sum instead (`families/solveResidueTerm.ts`). Reading only the
  // piece list would report the same "no target" as the sandbox for a record that declares one
  // perfectly well, and the headline would then say the closed-contour value was established where
  // what the argument establishes is a series.
  const onContour = spec.some((p) => p.role === "target");
  const inSum = input.summation?.target;
  const hasTarget = onContour || inSum !== undefined;
  push(
    rowFrom(
      "COVER",
      hasTarget ? "satisfied" : "unknown",
      onContour
        ? claimOf("cover.on-contour")
        : inSum !== undefined
          ? // The weight is supplied only where the template names it. Passing it either way was
            // harmless while nothing looked, and is the shape of the slip `claims.test.ts` now
            // refuses: an argument the sentence does not mention is one a reader never sees.
            inSum.weight === 1
            ? claimOf("cover.in-sum")
            : claimOf("cover.in-sum-weighted", {
                weight: { kind: "count", n: inSum.weight },
              })
          : claimOf("cover.none"),
      onContour
        ? exact("the target is covered", "declared by the piece list")
        : inSum !== undefined
          ? exact(
              "the target is covered",
              "every side of the contour vanishes, so $\\oint_\\gamma f\\,dz \\to 0$ and the identity is read backwards as a statement about the sum",
            )
          : unknown(
              "the target",
              "no target is designated, so there is no real integral being solved for",
            ),
    ),
  );

  // ---- SOLVE + VERDICT ----------------------------------------------------------------------
  const closes =
    !killFailed &&
    rows.every((r) => r.status !== "failed") &&
    theorem.exactValue !== undefined;

  const value = theorem.exactValue
    ? { text: theorem.exactValue.text, numeric: theorem.exactValue.value }
    : integral.value
      ? { text: `${integral.value[0].toPrecision(10)}`, numeric: integral.value }
      : undefined;

  certificates.push(...theorem.verdict.certificates);

  return {
    rows,
    closes,
    value: closes ? value : undefined,
    verdict: assembleVerdict(certificates),
    failedAt:
      rows.find((r) => r.status === "failed")?.constraint ?? (killFailed ? "KILL" : null),
    hasTarget,
    pieceLimits,
  };
}

/** Exported for the UI's headline sentence — the thing a number alone cannot say. */
/**
 * The LEGALITY row that refuses, if there is one. **Nothing may report a value while this exists.**
 *
 * The ledger already withholds its own `value`, but that was only half the rule: the result card
 * reached its `∮` through `residueTheorem` instead, so a LEGALITY failure the QUADRATURE knew nothing
 * about — a contour that does not close, or one crossing a branch cut without declaring its side —
 * printed a number anyway. Every LEGALITY failure used to be one the integral had already refused, so
 * the two agreed by accident; M4's cut rows are the first that do not. This is the gate, in one
 * place, so agreement is structural rather than a coincidence that held for a while.
 */
export function legalityRefusal(result: LedgerResult): LedgerRow | undefined {
  // The ROW, not `failedAt`. Today the two agree — every failed LEGALITY row returns immediately, so
  // it is always the first — but reading `failedAt` would make the gate depend on that, and the
  // dependence points the wrong way: a LEGALITY row that one day fails softly must still withhold the
  // value, and a gate keyed on `failedAt` would quietly stop doing so.
  return result.rows.find((r) => r.constraint === "LEGALITY" && r.status === "failed");
}

/**
 * Why `∮` may not be printed at all, or `null` when it may.
 *
 * **THREE INDEPENDENT REASONS, and the whole point is that they are asked in ONE place.** The
 * quadrature may have refused; the integral's verdict may not license reporting a value; and
 * LEGALITY may have failed, which the quadrature can be perfectly happy about. The result card has
 * asked all three since M4.1 — and the moment a SECOND surface wanted the same answer (M6.3's
 * exported figure, whose caption must not claim a value the card withholds) the question had to stop
 * being asked inline. A caption that re-derived it would be one edit away from printing a number on
 * a shareable image that the app itself refuses to show.
 *
 * The repair comes back with it, because a refusal a reader cannot act on is half a message.
 */
export function integralRefusal(
  integral: { readonly refusal?: string; readonly verdict: Verdict },
  ledger: LedgerResult | null,
): { readonly claim: string; readonly repair?: string } | null {
  const illegal = ledger === null ? undefined : legalityRefusal(ledger);
  if (
    integral.refusal === undefined &&
    mayReportValue(integral.verdict) &&
    illegal === undefined
  ) {
    return null;
  }
  const repair =
    illegal?.repair ??
    integral.verdict.certificates
      .flatMap((c) => c.provenance)
      .find((q) => q.text.startsWith("suggested repair"))?.text;
  return {
    claim: illegal?.claim ?? integral.refusal ?? "the result was refused",
    ...(repair === undefined ? {} : { repair }),
  };
}

export function ledgerHeadline(result: LedgerResult): string {
  if (result.closes) {
    // In sandbox mode there is no real integral being solved for, so "the argument closes" would
    // claim more than happened: what was established is the closed-contour value itself.
    return result.hasTarget ? HEADLINES.closes : HEADLINES.sandbox;
  }
  if (result.failedAt === null) return HEADLINES.incomplete;
  return headlineFails(result.failedAt);
}
