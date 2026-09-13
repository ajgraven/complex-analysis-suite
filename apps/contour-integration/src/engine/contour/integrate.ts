// ∫γ f dz, per piece and in total, with the evidence for it.
//
// The shape to notice: **refusal comes first and returns no value at all.** A contour that passes
// through (or within rounding distance of) a singularity does not have an integral, and the nearest
// existing tool's answer to that situation — a confident `6.71197 + 0.46361i`, wrong to six figures,
// with no caveat — is the single clearest thing this app can do better (research 01 §1).
import {
  assembleVerdict,
  bound,
  estimate,
  exact,
  refuse,
  unknown,
  type Certificate,
  type Verdict,
} from "@cas/rigor";
import {
  arcLength,
  derivAt,
  isClosed,
  isFullCircle,
  pointAt,
  type Cx,
  type Resolved,
} from "../../kernel/geom.js";
import {
  compensatedSum,
  gaussPanels,
  nodeCount,
  panelPlan,
  periodicTrapezoid,
} from "../../kernel/quadrature.js";
import { clearance, windingNumber, RELATIVE_CLEARANCE_FLOOR } from "../../kernel/winding.js";
import type { CutSide } from "./model.js";

export interface Singularity {
  readonly at: Cx;
  /** Only used for reporting; the integrator needs the location, not the order. */
  readonly order?: number;
}

export interface PieceIntegral {
  readonly pieceId: string;
  readonly value: Cx;
  readonly nodes: number;
  /** |I_fine − I_coarse|: a convergence estimate, not an error bound. Labelled `≈` for that reason. */
  readonly errorEstimate: number;
  /** True when the evaluation budget bound the resolution, so the spacing rule was not met. */
  readonly capped: boolean;
  readonly rule: "periodic-trapezoid" | "gauss-legendre";
  readonly certificate: Certificate;
}

export interface ContourIntegral {
  /** Absent when the integral was refused. */
  readonly value?: Cx;
  readonly pieces: readonly PieceIntegral[];
  readonly verdict: Verdict;
  readonly refusal?: string;
  /** Why no quadrature was attempted, when none was. NOT a refusal — see {@link QuadratureBudget.skip}. */
  readonly quadratureSkipped?: string;
  /** n(γ, aₖ) per singularity, exactly decided — present whether or not the integral was computed. */
  readonly windings: readonly { readonly at: Cx; readonly n: number; readonly decided: boolean }[];
  readonly closed: boolean;
}

const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];

/** The integrand pulled back to the parameter: `f(z(t))·z′(t)`, whose integral over [0,1] is ∫ f dz. */
function pullback(f: (z: Cx) => Cx, g: Resolved): (t: number) => Cx {
  return (t) => cmul(f(pointAt(g, t)), derivAt(g, t));
}

/**
 * A ceiling on the work one piece may cost.
 *
 * Exists for the DRAG. Dragging a contour re-integrates it on every pointer move, and the node-spacing
 * rule asks for up to 65,536 nodes when a pole is close — which is right for an answer and far too slow
 * for a gesture. A drag passes a small budget and takes the `capped` flag that comes back; the release
 * runs unbudgeted and the two are reconciled. Nothing is hidden: `capped` already flows into the
 * certificate's provenance as a ✗ step, and the piece list already renders "resolution capped".
 *
 * The number is total function evaluations INCLUDING the refinement pass that produces the error
 * estimate, which costs twice the coarse pass — hence the division by three in both rules below.
 */
export interface QuadratureBudget {
  readonly maxEvaluations?: number;
  /**
   * Do not attempt the quadrature at all, for this stated reason.
   *
   * Exists for a MULTIVALUED integrand. Sampling `z^α` needs a determination at every node, and a
   * compiled evaluator silently uses the principal one — so for a keyhole, whose declared branch is
   * `arg z ∈ (0, 2π)`, the two lips return the same value, cancel, and the "second opinion" is a
   * confident answer to a different question. Worse than no cross-check.
   *
   * Distinct from {@link ContourIntegral.refusal}: nothing is wrong with the contour, so LEGALITY is
   * untouched. The winding numbers are still decided — they come from the geometry, not from `f`.
   */
  readonly skip?: string;
}

/**
 * The integrand along a path — and, where the path lies ON a branch cut, which limit it carries.
 *
 * `side` is `Piece.side`, threaded per piece rather than baked into one closure because it IS per
 * piece: a keyhole's two lips are the same points of the plane and different boundary values, which
 * is the whole reason research 06 §3.3 makes it a data field rather than a geometric offset. An
 * evaluator that ignores the second argument is a perfectly good `PathFn` — every single-valued
 * integrand in tiers A–C is one, and none of them changed.
 */
export type PathFn = (z: Cx, side?: CutSide) => Cx;

/** Integrate one piece, with the rule chosen by the geometry (see kernel/quadrature.ts). */
export function integratePiece(
  f: (z: Cx) => Cx,
  g: Resolved,
  pieceId: string,
  singularities: readonly Singularity[],
  budget?: QuadratureBudget,
): PieceIntegral {
  const nearest =
    singularities.length === 0 ? Infinity : Math.min(...singularities.map((s) => clearance([g], s.at)));
  const h = pullback(f, g);
  const len = arcLength(g);
  const loop = isFullCircle(g);

  // The rule follows from the geometry, not from a setting: a closed loop makes the pullback
  // periodic, which is the one situation where the trapezoidal rule is the *better* rule rather than
  // the cruder one.
  let coarse: Cx;
  let fine: Cx;
  let nodes: number;
  let capped: boolean;
  if (loop) {
    // `capped` by comparison with the UNBUDGETED ideal rather than by re-deriving the spacing rule:
    // one formula, in `nodeCount`, and no second copy of it here to drift.
    const ideal = nodeCount(len, nearest);
    const allowed =
      budget?.maxEvaluations === undefined
        ? ideal
        : Math.max(16, Math.floor(budget.maxEvaluations / 3));
    const n = Math.min(ideal, allowed);
    coarse = periodicTrapezoid(h, n);
    fine = periodicTrapezoid(h, 2 * n);
    nodes = 2 * n;
    capped = n < ideal;
  } else {
    const plan = panelPlan(
      len,
      nearest,
      budget?.maxEvaluations === undefined
        ? undefined
        : { maxEvaluations: Math.max(16, Math.floor(budget.maxEvaluations / 3)) },
    );
    coarse = gaussPanels(h, plan.panels, plan.nodesPerPanel);
    fine = gaussPanels(h, 2 * plan.panels, plan.nodesPerPanel);
    nodes = 2 * plan.panels * plan.nodesPerPanel;
    capped = plan.capped;
  }
  const rule = loop ? "periodic-trapezoid" : "gauss-legendre";
  const errorEstimate = Math.hypot(fine[0] - coarse[0], fine[1] - coarse[1]);

  const certificate = estimate(
    `∫ over ${pieceId} ≈ ${fine[0].toPrecision(10)} ${fine[1] < 0 ? "−" : "+"} ${Math.abs(fine[1]).toPrecision(10)}i`,
    `${rule}, ${nodes} nodes`,
    {
      provenance: [
        {
          ok: true,
          text: `nearest singularity at distance ${nearest === Infinity ? "∞" : nearest.toPrecision(4)}`,
        },
        {
          ok: errorEstimate < 1e-10 * Math.max(1, Math.hypot(fine[0], fine[1])),
          text: `successive refinement differs by ${errorEstimate.toExponential(2)}`,
        },
        ...(capped
          ? [
              {
                ok: false,
                text: "the evaluation budget bound the resolution, so the node-spacing rule was not met",
              },
            ]
          : []),
      ],
    },
  );

  return { pieceId, value: fine, nodes, errorEstimate, rule, capped, certificate };
}

/**
 * Integrate `f` over the whole contour.
 *
 * Order of operations is the point. Clearance is checked **before** any quadrature runs, so a
 * singular configuration never produces a number that then has to be suppressed — there is nothing
 * to suppress, because nothing was computed.
 */
export function integrateContour(
  f: PathFn,
  pieces: readonly Resolved[],
  singularities: readonly Singularity[] = [],
  budget?: QuadratureBudget,
  /** Each piece's declared `side`, parallel to `pieces`. Omitted for a single-valued integrand. */
  sides?: readonly (CutSide | undefined)[],
): ContourIntegral {
  const closed = isClosed(pieces);
  const windings = singularities.map((s) => {
    const w = windingNumber(pieces, s.at);
    return { at: s.at, n: w.n, decided: w.decided };
  });

  if (pieces.length === 0) {
    const c = refuse("∫ over an empty contour", "there is no contour");
    return { pieces: [], verdict: assembleVerdict([c]), refusal: c.method, windings, closed };
  }

  // The windings are decided above, from the geometry alone, so they survive a skipped quadrature —
  // which is the whole reason this is a skip rather than a refusal.
  if (budget?.skip !== undefined) {
    const why = unknown("the quadrature", budget.skip);
    return {
      pieces: pieces.map((_g, k) => ({
        pieceId: String(k),
        value: [0, 0] as Cx,
        nodes: 0,
        errorEstimate: Number.POSITIVE_INFINITY,
        capped: false,
        rule: "gauss-legendre" as const,
        certificate: why,
      })),
      verdict: assembleVerdict([why]),
      quadratureSkipped: budget.skip,
      windings,
      closed,
    };
  }

  // --- refusal, first ------------------------------------------------------------------------
  for (const s of singularities) {
    const cl = clearance(pieces, s.at);
    const scaleHint = Math.max(1, ...pieces.map(arcLength));
    if (!(cl > RELATIVE_CLEARANCE_FLOOR * scaleHint)) {
      const c = refuse(
        `∫ over this contour`,
        `a singularity at ${s.at[0].toPrecision(6)} ${s.at[1] < 0 ? "−" : "+"} ${Math.abs(s.at[1]).toPrecision(6)}i lies on the contour (clearance ${cl.toExponential(2)}), so the integral does not exist`,
        {
          provenance: [
            { ok: false, text: "the contour must avoid every singularity of the integrand" },
            { ok: true, text: "suggested repair: indent the contour around the singularity, or move it" },
          ],
        },
      );
      return { pieces: [], verdict: assembleVerdict([c]), refusal: c.method, windings, closed };
    }
  }

  // --- quadrature ----------------------------------------------------------------------------
  // Each piece is integrated through its OWN evaluator, with the side it declares bound here — so a
  // quadrature rule never has to know that branch cuts exist.
  const results = pieces.map((g, k) =>
    integratePiece((z) => f(z, sides?.[k]), g, `piece ${k + 1}`, singularities, budget),
  );
  const total = compensatedSum(results.map((r) => r.value));

  const certificates: Certificate[] = results.map((r) => r.certificate);

  // The winding numbers are exact even though the integral is not: an integer decided by signs.
  for (const w of windings) {
    certificates.push(
      w.decided
        ? exact(
            `n(γ, ${w.at[0].toPrecision(4)} ${w.at[1] < 0 ? "−" : "+"} ${Math.abs(w.at[1]).toPrecision(4)}i) = ${w.n}`,
            "exact-sign crossing count over a certified polygonisation",
          )
        : refuse(
            `n(γ, ·) at ${w.at[0].toPrecision(4)} ${w.at[1] < 0 ? "−" : "+"} ${Math.abs(w.at[1]).toPrecision(4)}i`,
            "the point is not clear of the contour",
          ),
    );
  }

  const worstError = Math.max(0, ...results.map((r) => r.errorEstimate));
  certificates.push(
    bound(
      "≤",
      `the quadrature rules disagree by at most ${worstError.toExponential(2)} between N and 2N`,
      "successive-refinement comparison",
      {
        restriction: "a convergence estimate, not a proved error bound",
      },
    ),
  );

  return {
    value: total,
    pieces: results,
    verdict: assembleVerdict(certificates),
    windings,
    closed,
  };
}
