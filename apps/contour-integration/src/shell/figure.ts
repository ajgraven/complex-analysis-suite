// **THE EXPORTED FIGURE: a plate that carries its own recipe, and its own verdict.**
//
// Three things are exported together, and the third is the one this app owes that a plotting tool
// does not:
//
//   1. the PICTURE — the stage (the integrand's phase portrait with the contour over it) above the
//      accumulator's partial-sum trail, which is research 02 §8's P0 hero;
//   2. the RECIPE — `Software` plus `cas:state`, the permalink, so the figure reopens the session it
//      came from (`@cas/export`'s documented convention);
//   3. the VERDICT — because a picture of a contour over a phase portrait looks exactly the same
//      whether the argument closes or not. A figure exported from an argument that does NOT close
//      has to say so, or this app's whole posture is undone the moment someone puts it on a slide.
//
// The verdict is carried BOTH ways: stamped in the metadata (machine-readable, and what M6.3's gate
// checks) and **drawn on the plate**, because nobody reads PNG metadata. The M6 plan asked only for
// the metadata; drawing it too is the smaller of the two risks.
//
// **WHAT IS PURE HERE AND WHY.** `figureLayout` and `figureCaption` take no canvas and no DOM, so
// the arithmetic and the wording are testable in the node gate; `drawFigure` is the thin part that
// needs a real 2-D context and is covered by the browser suite. That is the same split
// `ui/accumulator.ts` already uses — its frame fit is a node test, its ink a Chromium one.
import { assembleVerdict } from "@cas/rigor";
import { integralRefusal, ledgerHeadline, type LedgerResult } from "../engine/ledger.js";
import type { ContourIntegral } from "../engine/contour/integrate.js";
import type { ResidueTheoremResult } from "../engine/residueTheorem.js";
import type { SolvedValue } from "../families/solveTarget.js";

/** Where each piece of the plate goes, in device pixels. */
export interface FigureLayout {
  readonly width: number;
  readonly height: number;
  readonly stage: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly accumulator: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly caption: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** Font size for the caption's first line; the rest are derived from it. */
  readonly captionFont: number;
}

/** The margin, the gap between the two pictures, and the caption's height — all as a share of the
 *  stage's width, so a 1× and a 3× plate are the same figure at different resolutions. */
const PAD = 0.016;
const GAP = 0.012;
const CAPTION = 0.075;

/**
 * Lay out the plate.
 *
 * **The accumulator is NARROWER than the stage on screen** — 744 px against 1048, because its side
 * panel takes the rest of the strip — so stacking the two canvases at their own sizes would leave a
 * ragged right edge and imply the trail stops early. It is scaled to the stage's width instead,
 * keeping its own aspect ratio, which is the one choice that makes the two pictures describe the
 * same horizontal extent of nothing in particular: the trail's axes are `Σ f·Δz`, not the plane, so
 * there is no shared scale to preserve and matching the frame is purely a matter of not lying about
 * where it ends.
 */
export function figureLayout(
  stage: { readonly w: number; readonly h: number },
  accumulator: { readonly w: number; readonly h: number },
  scale = 1,
): FigureLayout {
  const w = Math.max(1, Math.round(stage.w * scale));
  const pad = Math.round(w * PAD);
  const gap = Math.round(w * GAP);
  const captionH = Math.round(w * CAPTION);
  const stageH = Math.max(1, Math.round(stage.h * (w / Math.max(1, stage.w))));
  // Its own aspect, at the stage's width — see the note above.
  const accH = Math.max(1, Math.round(accumulator.h * (w / Math.max(1, accumulator.w))));
  return {
    width: w + pad * 2,
    height: pad * 2 + stageH + gap + accH + gap + captionH,
    stage: { x: pad, y: pad, w, h: stageH },
    accumulator: { x: pad, y: pad + stageH + gap, w, h: accH },
    caption: { x: pad, y: pad + stageH + gap + accH + gap, w, h: captionH },
    captionFont: Math.max(9, Math.round(w * 0.0155)),
  };
}

/**
 * What the plate says, in three lines.
 *
 * Derived from the SAME data the result card reads, and through the same `integralRefusal` gate, so
 * the caption cannot claim a number the app withholds. That gate was inline in the card until this
 * module existed; it is one function now precisely because this is its second reader.
 */
export interface FigureCaption {
  /** What is being integrated, or which record — the plate's own title. */
  readonly title: string;
  /** `= 2πi`, or `⚠ Refused`. Never a number the card would not print. */
  readonly value: string;
  /** The ledger's own headline sentence: does this argument close? */
  readonly verdict: string;
  /** The machine-readable half, for the PNG metadata. */
  readonly level: string;
}

export function figureCaption(input: {
  readonly title: string;
  readonly integral: ContourIntegral | null;
  readonly theorem: ResidueTheoremResult | null;
  readonly ledger: LedgerResult | null;
  readonly solved: SolvedValue | null;
}): FigureCaption {
  const { integral, theorem, ledger, solved } = input;
  if (integral === null) {
    return { title: input.title, value: "no integrand", verdict: "Nothing was computed.", level: "?" };
  }
  const refused = integralRefusal(integral, ledger);
  if (refused !== null) {
    return {
      title: input.title,
      value: "⚠ Refused",
      // The refusal's own claim, not the headline: "LEGALITY fails" says where, and this says what.
      verdict: refused.claim,
      level: "⚠",
    };
  }
  // A record's SOLVED target is the answer it was built to find; `∮` is the machinery. In the
  // sandbox there is no target and `∮` IS the result — which is what `ledgerHeadline` already
  // distinguishes, so the two lines never disagree about which claim is being made.
  const headline = ledger === null ? "" : ledgerHeadline(ledger);
  if (solved !== null && solved.text !== undefined) {
    // The level is MET from the certificates, exactly as the record card meets it — the badge beside
    // a record's answer is computed from what was established and never chosen, which is the rule
    // M3.5b made structural and a caption must not be the place it lapses.
    const level = assembleVerdict(solved.certificates).level;
    return { title: input.title, value: `${level} ${solved.text}`, verdict: headline, level };
  }
  if (theorem?.exactValue) {
    const level = theorem.verdict.level;
    return { title: input.title, value: `${level} ∮ f dz = ${theorem.exactValue.text}`, verdict: headline, level };
  }
  const level = integral.verdict.level;
  const [re, im] = integral.value ?? [0, 0];
  const sign = im < 0 ? "−" : "+";
  return {
    title: input.title,
    value: `${level} ∮ f dz ≈ ${re.toPrecision(8)} ${sign} ${Math.abs(im).toPrecision(8)}i`,
    verdict: headline,
    level,
  };
}

/** The PNG `tEXt` entries a plate carries. */
export function figureMetadata(permalink: string | null, caption: FigureCaption): Record<string, string> {
  return {
    Software: "Contour Integration — Complex Analysis Suite",
    // `cas:state` is `@cas/export`'s DOCUMENTED key, and this is the second app to use it: of six
    // consumers only Riemann Map does, the other four having each minted their own prefix before the
    // package existed (`ap:url`, `2de:url`, `2dh:url`, `cdjs:state`). Following the majority would
    // entrench an accident; following the doc is what lets one reader open any of them.
    ...(permalink === null ? {} : { "cas:state": permalink }),
    // **The honest half.** The picture alone cannot say whether the argument closes, so the bytes do.
    "cas:verdict": `${caption.level} ${caption.verdict}`,
    "cas:value": caption.value,
  };
}

/** Colours, read from the app's own CSS so the plate matches what was on screen. */
export interface FigureTheme {
  readonly background: string;
  readonly text: string;
  readonly muted: string;
}

/**
 * Draw the plate. The only part that needs a real 2-D context.
 *
 * `stage` is a LIST because the on-screen stage is two stacked canvases — the WebGL2 phase portrait
 * and the 2-D contour ink — and they are composited in order. **The GL canvas must be re-rendered
 * in the same synchronous task as this call:** its context is created without
 * `preserveDrawingBuffer`, so a read after the browser has composited returns an empty buffer.
 * Measured, not assumed — probing the live page returns a single distinct colour for `canvas.gl`
 * where the ink layer returns 44.
 */
export function drawFigure(
  target: HTMLCanvasElement,
  layout: FigureLayout,
  stage: readonly HTMLCanvasElement[],
  accumulator: HTMLCanvasElement,
  caption: FigureCaption,
  theme: FigureTheme,
): void {
  target.width = layout.width;
  target.height = layout.height;
  const ctx = target.getContext("2d");
  if (ctx === null) return;
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  for (const layer of stage) {
    if (layer.width > 0 && layer.height > 0) {
      ctx.drawImage(layer, layout.stage.x, layout.stage.y, layout.stage.w, layout.stage.h);
    }
  }
  if (accumulator.width > 0 && accumulator.height > 0) {
    ctx.drawImage(
      accumulator,
      layout.accumulator.x,
      layout.accumulator.y,
      layout.accumulator.w,
      layout.accumulator.h,
    );
  }

  const f = layout.captionFont;
  ctx.textBaseline = "top";
  ctx.fillStyle = theme.muted;
  ctx.font = `${f}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.fillText(caption.title, layout.caption.x, layout.caption.y, layout.caption.w);
  ctx.fillStyle = theme.text;
  ctx.font = `600 ${Math.round(f * 1.45)}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.fillText(caption.value, layout.caption.x, layout.caption.y + Math.round(f * 1.5), layout.caption.w);
  ctx.fillStyle = theme.muted;
  ctx.font = `${f}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.fillText(caption.verdict, layout.caption.x, layout.caption.y + Math.round(f * 3.35), layout.caption.w);
}
