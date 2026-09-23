// Published bounds on where the roots can lie, drawn over the picture.
//
// **A bound is a theorem, so it is checked rather than trusted.** The suite sweeps every proper
// polynomial of each alphabet to a degree the node gate can afford and requires every root the engine
// found to lie inside the region drawn — an inclusion, the same form PR-2's gate took — and requires the
// region to be NON-VACUOUS: some root must come close to every curve, or the overlay would pass by being
// drawn far away from anything. The two measured margins are quoted beside each bound.
//
// Only two alphabets carry one, which is what the plan asks for and what the literature supplies:
//
//   · {0, 1} — Odlyzko & Poonen (1993): with constant term 1 (which is this app's properness), every
//     root lies in the annulus `1/Φ < |z| < Φ`, Φ the golden ratio, and in the half-plane `Re z < 3/2`.
//   · {−1, 0, 1} — Cauchy's bound, `|z| < 1 + max|a_k/a_d| = 2`, and its image under reversal,
//     `|z| > 1/2`. Elementary, and sharp in the limit: `z^d − z^{d−1} − … − 1` has a root tending to 2.
//
// Littlewood has the same Cauchy annulus, but the picture the article draws of it is already framed by
// that annulus, so the overlay would say nothing the frame does not.
import type { Alphabet } from "../engine/alphabet.js";

/** The golden ratio. */
export const PHI = (1 + Math.sqrt(5)) / 2;

/** One curve of a bound: a circle about the origin, or a vertical line. */
export type BoundCurve =
  | { readonly kind: "circle"; readonly radius: number; readonly label: string }
  | { readonly kind: "vertical"; readonly re: number; readonly label: string };

/** A cited region every root of the alphabet's proper polynomials lies in. */
export interface RootBound {
  readonly curves: readonly BoundCurve[];
  /** Is `z` inside the region the curves bound? Strict, as every statement here is. */
  readonly contains: (re: number, im: number) => boolean;
  readonly statement: string;
  readonly source: string;
  /**
   * What this app MEASURED about the bound against its own roots — kept apart from `statement`, which
   * is the theorem, so a sentence about this picture can never be read as part of the citation.
   */
  readonly measured: string;
}

/** The bound an alphabet carries, or null when none is drawn for it. */
export function boundFor(alphabet: Alphabet): RootBound | null {
  // Keyed by VALUE, so a custom `1, 0` carries the bound its preset does. The sort is a recorded
  // equivalent mutant: `compileAlphabet` already orders `values` (by re, then im), and for these two
  // alphabets that order and the string sort agree — kept so the key does not rest on that invariant.
  const key = alphabet.values
    .map((v) => `${v.re},${v.im}`)
    .sort()
    .join("|");
  if (key === "0,0|1,0") {
    return {
      curves: [
        { kind: "circle", radius: 1 / PHI, label: "|z| = 1/Φ" },
        { kind: "circle", radius: PHI, label: "|z| = Φ" },
        { kind: "vertical", re: 1.5, label: "Re z = 3/2" },
      ],
      contains: (re, im) => {
        const r = Math.hypot(re, im);
        return r > 1 / PHI && r < PHI && re < 1.5;
      },
      statement:
        "Every root of a polynomial with coefficients in {0, 1} and constant term 1 lies in the annulus 1/Φ < |z| < Φ and in the half-plane Re z < 3/2.",
      source: "Odlyzko & Poonen, Zeros of polynomials with 0,1 coefficients (1993).",
      // Measured over every proper Newman polynomial to degree 20: the outermost root reaches |z| =
      // 1.6179 against Φ = 1.61803, so the outer circle is SHARP; the rightmost root plateaus at
      // Re z ≈ 1.137 from degree 14 on (1.1323, 1.1358, 1.1367, 1.1354), so the half-plane is true and
      // loose — which is what the paper means by trapping the set "between two subtler curves". And the
      // outer circle is met by a VANISHING share: 64 / 1,044 / 4,183 roots beyond |z| = 1.5 at degrees
      // 12 / 16 / 18 (0.25%, 0.20%, 0.18%), 378 beyond 1.6 at 18 — so on screen the circle looks loose
      // and the legend has to say that it is not.
      measured:
        "≈ Measured here to degree 20: the outermost root reaches |z| ≈ 1.6179, against Φ ≈ 1.6180, so the outer circle is essentially met — but by very few roots: at degree 18 only 378 of 2,368,512 lie beyond |z| = 1.6, too sparse for the density to show, which is why the circle looks far from the cloud. The rightmost settles near Re z ≈ 1.137, well inside the half-plane, which is true but not sharp.",
    };
  }
  if (key === "-1,0|0,0|1,0") {
    return {
      curves: [
        { kind: "circle", radius: 0.5, label: "|z| = 1/2" },
        { kind: "circle", radius: 2, label: "|z| = 2" },
      ],
      contains: (re, im) => {
        const r = Math.hypot(re, im);
        return r > 0.5 && r < 2;
      },
      statement:
        "Every root of a polynomial with coefficients in {−1, 0, 1} and non-zero constant and leading terms lies in the annulus 1/2 < |z| < 2.",
      source: "Cauchy's bound |z| < 1 + max|a_k/a_d|, and its image under z ↦ 1/z.",
      measured:
        "≈ Measured here to degree 10: the outermost root reaches |z| ≈ 1.99; the bound is approached only as the degree grows, by z^d − z^(d−1) − … − 1.",
    };
  }
  return null;
}

/** The view a curve is drawn into, in device pixels. */
export interface OverlayView {
  readonly cx: number;
  readonly cy: number;
  readonly halfHeight: number;
  readonly width: number;
  readonly height: number;
}

/** World → device pixel. Screen y is down. */
export function toScreen(view: OverlayView, re: number, im: number): { x: number; y: number } {
  const scale = view.height / (2 * view.halfHeight);
  return { x: view.width / 2 + (re - view.cx) * scale, y: view.height / 2 - (im - view.cy) * scale };
}

/** Draw a bound's curves, each with its label placed where it is on screen. */
export function drawBound(ctx: CanvasRenderingContext2D, bound: RootBound, view: OverlayView): void {
  ctx.clearRect(0, 0, view.width, view.height);
  const scale = view.height / (2 * view.halfHeight);
  ctx.lineWidth = Math.max(1, view.height / 600);
  ctx.strokeStyle = "rgba(255, 209, 102, 0.85)";
  ctx.fillStyle = "rgba(255, 209, 102, 0.95)";
  ctx.font = `${Math.max(11, Math.round(view.height / 60))}px system-ui, sans-serif`;
  ctx.setLineDash([6, 5]);
  for (const curve of bound.curves) {
    ctx.beginPath();
    if (curve.kind === "circle") {
      const c = toScreen(view, 0, 0);
      ctx.arc(c.x, c.y, curve.radius * scale, 0, 2 * Math.PI);
      ctx.stroke();
      // Label at the point of the circle nearest the view's own centre, so it is on screen when any of
      // the circle is.
      const angle = Math.atan2(view.cy, view.cx);
      const at = toScreen(view, curve.radius * Math.cos(angle), curve.radius * Math.sin(angle));
      ctx.fillText(curve.label, at.x + 4, at.y - 4);
    } else {
      const top = toScreen(view, curve.re, view.cy + view.halfHeight);
      ctx.moveTo(top.x, 0);
      ctx.lineTo(top.x, view.height);
      ctx.stroke();
      ctx.fillText(curve.label, top.x + 4, 16);
    }
  }
  ctx.setLineDash([]);
}
