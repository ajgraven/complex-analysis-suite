/**
 * The inspector's report, built once and rendered twice.
 *
 * Every row carries a `@cas/rigor` {@link Verdict} rather than a hand-typed glyph, which is the
 * honest-labelling guardrail made a compiler rule: a `Verdict` can only come from
 * `assembleVerdict`, and the certificates it meets over can only come from `exact`/`estimate`/
 * `unknown`, so a bare `=` beside a number produced by a tolerance-driven search is not something
 * this file *can* write. (WP6/U9, review 2026-09-16.)
 *
 * It is also where the duplication went. `main.ts`'s `showInspect` (the DOM panel) and
 * `dataExport.ts`'s `inspectToText` (the clipboard copy) each built this list separately, and they
 * had drifted: the panel labelled the distance estimate `≈` and the copied text printed the same
 * number bare. Both now read these rows, so a row cannot be honest in one and not the other.
 *
 * Pure — no DOM — so the node gate runs it.
 */

import {
  assembleVerdict,
  estimate,
  exact,
  unknown,
  type Certificate,
  type Verdict,
} from "@cas/rigor";
import { argDegrees } from "../complex";
import { fatouComponentType, type InspectResult } from "../render/inspect";
import { matingVerdict } from "../render/mating";
import type { OrbitFate } from "../render/overlay";
import type { FractType } from "../render/glPlot";

/** One line of the report: what it is, the value, and how well the value is known. */
export interface InspectorRow {
  readonly key: string;
  readonly value: string;
  readonly verdict: Verdict;
}

/**
 * `display` rounds for the panel; `full` keeps every digit for the clipboard/CSV path, which
 * exists precisely so a reader can take the numbers away unrounded.
 */
export type RowPrecision = "display" | "full";

const FATE_TEXT: Record<OrbitFate, string> = {
  escaped: "escapes to ∞",
  converged: "settles to a fixed point",
  periodic: "settles into a cycle",
  undetermined: "no escape or cycle within the iteration limit",
};

// ── The certificates. Each one names the method, because the method is what fixes the level. ──

/** The escape predicate and the cycle search are both numerical, and neither is a proof. */
const FATE_CERT: Certificate = estimate(
  "the orbit's fate",
  "the user's escape predicate, then cycle detection to a numerical tolerance",
);
/** Nothing was established — distinct from an estimate, and the vocabulary has a symbol for it. */
const FATE_UNDETERMINED_CERT: Certificate = unknown(
  "the orbit's fate",
  "the iteration cap was reached with neither escape nor a cycle",
);
/** A counted quantity: the first index at which the predicate held. That index IS the index. */
const ESCAPE_TIME_CERT: Certificate = exact(
  "the first iteration at which the escape predicate held",
  "counted during the iteration",
);
const PERIOD_CERT: Certificate = estimate(
  "the attracting cycle's period",
  "cycle detection to a numerical tolerance after a settling run",
);
const MULTIPLIER_CERT: Certificate = estimate(
  "λ = ∏ f′(z_k) around the cycle",
  "the product along the numerically located cycle",
);
const FATOU_CERT: Certificate = estimate(
  "which Fatou component the cycle bounds",
  "named from |λ| with a 1e-3 neutral band",
);
const ROTATION_CERT: Certificate = estimate(
  "the rotation number θ and its Brjuno class",
  "continued-fraction expansion of θ = arg λ / 2π, truncated",
);
const INTERNAL_ANGLE_CERT: Certificate = estimate(
  "the combinatorial rotation number p/q",
  "the cycle's orbit ordering, from the numerically located cycle",
);
/** Tan Lei's criterion is exact integer arithmetic — on a p/q that is itself an estimate. The meet
 *  is what makes the row `≈`, and it is computed rather than judged. */
const LIMB_CERT: Certificate = exact(
  "the conjugate limb of p/q, and mateability ⟺ p₁/q₁ + p₂/q₂ ≠ 1 (Tan Lei)",
  "exact integer arithmetic on p and q",
);
/** Koebe ¼ puts the truth in [d/4, 4d]; measured on cases with an exact answer, 0.46×–1.99×. */
const DISTANCE_CERT: Certificate = estimate(
  "the distance from the point to the set",
  "the Koebe exterior estimate d ≈ |z|·ln|z| / |z′|, sharp only to within a factor of a few",
);

function row(key: string, value: string, certs: readonly Certificate[]): InspectorRow {
  return { key, value, verdict: assembleVerdict(certs) };
}

const num = (x: number, digits: number, p: RowPrecision): string =>
  p === "full" ? String(x) : x.toFixed(digits);

/**
 * The report for one inspected point. `plane` only adds the parameter-plane limb row — the limb is
 * a statement about the main cardioid, so it means nothing on the dynamical plane.
 */
export function buildInspectorRows(
  info: InspectResult,
  plane: FractType,
  precision: RowPrecision = "display",
): InspectorRow[] {
  const rows: InspectorRow[] = [
    row("Fate", FATE_TEXT[info.fate], [
      info.fate === "undetermined" ? FATE_UNDETERMINED_CERT : FATE_CERT,
    ]),
  ];
  if (info.fate === "escaped") {
    rows.push(row("Escape time", `${info.escapeIter} iterations`, [ESCAPE_TIME_CERT]));
  }
  if (info.period > 0) rows.push(row("Period", String(info.period), [PERIOD_CERT]));
  if (info.multiplier && info.multiplierMag !== null) {
    const deg = argDegrees(info.multiplier);
    // Classify with a tolerance so neutral / parabolic cycles (|λ| = 1) are not rounded into
    // "attracting"/"repelling" — matches the Julia panel's neutral band (juliaProperties.ts).
    const kind =
      Math.abs(info.multiplierMag - 1) < 1e-3
        ? "indifferent (neutral)"
        : info.multiplierMag < 1
          ? "attracting"
          : "repelling";
    const mag = num(info.multiplierMag, 4, precision);
    rows.push(
      row("Multiplier λ", `${mag} ∠ ${num(deg, 0, precision)}° (${kind})`, [MULTIPLIER_CERT]),
    );
  }
  // Name the Fatou component from λ, and for an indifferent irrational rotation add the
  // rotation number + Brjuno verdict (Siegel disc vs near-Cremer) with an estimated radius.
  const fatou = fatouComponentType(info.multiplier, info.multiplierMag);
  if (fatou) {
    const FATOU_LABEL: Record<string, string> = {
      superattracting: "superattracting (centre)",
      attracting: "attracting basin",
      repelling: "repelling (Julia set)",
      parabolic: "parabolic",
      siegel: "Siegel disc",
      cremer: "Cremer point",
      neutral: "neutral",
    };
    rows.push(row("Fatou component", FATOU_LABEL[fatou.type], [FATOU_CERT]));
    if (
      fatou.theta !== null &&
      fatou.rotation &&
      (fatou.type === "siegel" || fatou.type === "cremer")
    ) {
      const r = fatou.rotation;
      const theta = num(fatou.theta, 6, precision);
      rows.push(
        row(
          "Rotation number",
          fatou.type === "cremer"
            ? `θ ${theta} (near-Cremer — disc radius 0)`
            : `θ ${theta} (${r.kind}; disc radius ${precision === "full" ? String(r.conformalRadius) : r.conformalRadius.toExponential(1)})`,
          [ROTATION_CERT],
        ),
      );
    }
  }
  if (info.rotation) {
    rows.push(
      row("Internal angle", `${info.rotation.p}/${info.rotation.q}`, [INTERNAL_ANGLE_CERT]),
    );
    // On the parameter plane the rotation number p/q names the main-cardioid limb; show its
    // complex-conjugate limb and whether it self-mates (every bulb but the 1/2 limb does).
    if (plane === "param") {
      const limb = matingVerdict(
        info.rotation.p,
        info.rotation.q,
        info.rotation.p,
        info.rotation.q,
      );
      if (limb.conjugateOfA) {
        rows.push(
          row(
            "Limb",
            `conjugate ${limb.conjugateOfA[0]}/${limb.conjugateOfA[1]} · self-mateable: ${limb.mateable ? "yes" : "no"}`,
            [LIMB_CERT, INTERNAL_ANGLE_CERT],
          ),
        );
      }
    }
  }
  if (info.distance !== null) {
    rows.push(
      row(
        "Distance to set",
        precision === "full" ? String(info.distance) : info.distance.toExponential(2),
        [DISTANCE_CERT],
      ),
    );
  }
  return rows;
}
