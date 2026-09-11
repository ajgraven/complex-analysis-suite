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
import { assembleVerdict, exact, refuse, unknown, type Certificate, type Verdict } from "@cas/rigor";
import { Frac } from "@cas/exact";
import type { Node } from "@cas/expr";
import type { Cx, Resolved } from "../kernel/geom.js";
import { arcLength, isClosed } from "../kernel/geom.js";
import { clearance } from "../kernel/winding.js";
import { toExactRational } from "../kernel/exactRational.js";
import { asExponentialTimesRational } from "../kernel/exponentialFactor.js";
import { jordanArcBound, mlArcBound, type ArcBound } from "../kernel/bounds/mlRational.js";
import type { Piece } from "./contour/model.js";
import type { ContourIntegral } from "./contour/integrate.js";
import type { PoleReport } from "../kernel/poles.js";
import type { ResidueTheoremResult } from "./residueTheorem.js";

export type ConstraintId = "LEGALITY" | "CATCH" | "KILL" | "COVER";

export interface LedgerRow {
  readonly constraint: ConstraintId;
  readonly pieceId?: string;
  readonly status: "satisfied" | "failed" | "unknown";
  /** One line, renderable — what this row asserts. */
  readonly claim: string;
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
}

/** How the arcs of a contour are disposed of. `piMultiple` is the arc's angular extent over π. */
function arcExtent(g: Resolved): Frac | null {
  if (g.kind !== "arc") return null;
  // Recognise the rational multiples of π the templates actually produce, by comparing against
  // exact fractions rather than trusting a float ratio.
  const sweep = Math.abs(g.theta1 - g.theta0) / Math.PI;
  for (const [n, d] of [
    [2n, 1n],
    [1n, 1n],
    [1n, 2n],
    [1n, 3n],
    [2n, 3n],
    [1n, 4n],
    [3n, 2n],
    [4n, 1n],
  ] as const) {
    if (Math.abs(sweep - Number(n) / Number(d)) < 1e-12) return Frac.of(n, d);
  }
  return null;
}

/** The radius of an arc as an exact rational, when it is one. */
function arcRadius(g: Resolved): Frac | null {
  if (g.kind !== "arc") return null;
  const r = g.radius;
  if (!Number.isFinite(r) || r <= 0) return null;
  // The radius comes from a slider, so it is a double; the simplest rational that round-trips is the
  // honest reading of it, and the bound is then exact *for that radius*.
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
  if (exponential) {
    // Which half the arc lies in decides everything; read it off the arc's own midpoint.
    const mid = (g.theta0 + g.theta1) / 2;
    const half = Math.sin(mid) >= 0 ? "upper" : "lower";
    return jordanArcBound(exponential.num, exponential.den, exponential.a, half, R);
  }

  const rational = toExactRational(ast);
  if (!rational.ok) return null;
  return mlArcBound(rational.value.num, rational.value.den, R, extent);
}

const rowFrom = (
  constraint: ConstraintId,
  status: LedgerRow["status"],
  claim: string,
  evidence: Certificate,
  pieceId?: string,
  repair?: string,
): LedgerRow => ({ constraint, status, claim, evidence, pieceId, repair });

export interface LedgerInput {
  readonly ast: Node;
  readonly pieces: readonly Resolved[];
  readonly spec: readonly Piece[];
  readonly poles: PoleReport;
  readonly integral: ContourIntegral;
  readonly theorem: ResidueTheoremResult;
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
  const rows: LedgerRow[] = [];
  const certificates: Certificate[] = [];

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
        "the contour must avoid every singularity of the integrand",
        refuse("LEGALITY", integral.refusal),
        undefined,
        "indent the contour around the singularity, or move it",
      ),
    );
    return {
      rows,
      closes: false,
      verdict: assembleVerdict(certificates),
      failedAt: "LEGALITY",
      hasTarget: spec.some((p) => p.role === "target"),
    };
  }

  const closed = isClosed(pieces);
  push(
    rowFrom(
      "LEGALITY",
      closed ? "satisfied" : "failed",
      closed ? "the contour is closed and its orientation is declared" : "the contour does not close",
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
        `every singularity is clear of the contour (nearest at ${minClearance.toPrecision(3)})`,
        exact("clearance", "distance from each pole to each piece"),
      ),
    );
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
          ? "1 singularity is enclosed, with an exactly decided winding number"
          : `${enclosed.length} singularities are enclosed, each with an exactly decided winding number`
        : "a winding number could not be decided",
      undecided.length === 0
        ? exact(
            `n(γ, ·) for ${integral.windings.length} pole${integral.windings.length === 1 ? "" : "s"}`,
            "exact-sign crossing count over a certified polygonisation",
          )
        : refuse("CATCH", "a pole lies too close to the contour to say which side it is on"),
      undefined,
      undecided.length === 0 ? undefined : "move the contour clear of the pole",
    ),
  );

  const residuesExact = poles.exactlyComplete;
  push(
    rowFrom(
      "CATCH",
      residuesExact ? "satisfied" : "unknown",
      residuesExact
        ? "every enclosed residue is known exactly"
        : "not every residue is known exactly, so the total is an estimate",
      residuesExact
        ? exact("the residues", "exact arithmetic over ℚ(i) or one quadratic extension of it")
        : unknown("the residues", "some poles are not expressible in ℚ(i)(√d); the numeric value stands"),
    ),
  );

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
          `${piece.name} is the target — it is what the argument solves for`,
          exact("the target piece", "declared by its role"),
          piece.id,
        ),
      );
      continue;
    }

    if (piece.role !== "vanish") {
      push(
        rowFrom(
          "KILL",
          "satisfied",
          `${piece.name} is computed directly (${arcLength(geom).toPrecision(3)} long)`,
          integral.pieces[k]?.certificate ??
            unknown(piece.name, "no quadrature result for this piece"),
          piece.id,
        ),
      );
      continue;
    }

    const disposal = disposeArc(ast, geom);
    if (!disposal) {
      killFailed = true;
      push(
        rowFrom(
          "KILL",
          "unknown",
          `${piece.name} must vanish, but no lemma here applies to this integrand`,
          unknown(
            `the arc ${piece.name}`,
            "the certified bounds cover a rational integrand, or one times e^{iaz}; this is neither",
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
        disposal.certificate.claim,
        disposal.certificate,
        piece.id,
        ok
          ? undefined
          : disposal.asymptotics === "diverges"
            ? "close the contour through the other half-plane"
            : "this lemma is too weak here — a sharper one may still apply",
      ),
    );
  }

  // ---- COVER --------------------------------------------------------------------------------
  const hasTarget = spec.some((p) => p.role === "target");
  push(
    rowFrom(
      "COVER",
      hasTarget ? "satisfied" : "unknown",
      hasTarget
        ? "the target appears as a labelled piece of the closed contour"
        : "no piece is marked as the target, so the ledger reports the closed-contour value itself",
      hasTarget
        ? exact("the target is covered", "declared by the piece list")
        : unknown("the target", "sandbox mode: there is no real integral being solved for"),
    ),
  );

  // ---- SOLVE + VERDICT ----------------------------------------------------------------------
  const closes =
    !killFailed && rows.every((r) => r.status !== "failed") && theorem.exactValue !== undefined;

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
    failedAt: rows.find((r) => r.status === "failed")?.constraint ?? (killFailed ? "KILL" : null),
    hasTarget,
  };
}

/** Exported for the UI's headline sentence — the thing a number alone cannot say. */
export function ledgerHeadline(result: LedgerResult): string {
  if (result.closes) {
    // In sandbox mode there is no real integral being solved for, so "the argument closes" would
    // claim more than happened: what was established is the closed-contour value itself.
    return result.hasTarget
      ? "This argument closes."
      : "The closed-contour value is established exactly.";
  }
  if (result.failedAt === null) return "This argument is incomplete.";
  return `This argument does not close: ${result.failedAt} fails.`;
}

