// **THE FRAME THE PARTIAL SUM IS DRAWN IN** — the first tests `src/ui/` has had.
//
// The panel is research 02's answer to a genuinely open question: Hanke (2024) interviewed three
// research mathematicians about what `∮ f dz` MEANS and got nine interpretations with not one
// recurring, so the head-to-tail walk of `f(zₖ)·Δzₖ` is supplying a missing referent rather than
// decorating a settled one. Which makes how big it is drawn a correctness question, not a polish
// one: a picture too small to read teaches nothing.
//
// Two invariants pin it, and they pull in opposite directions:
//
//  1. **One scale for both axes.** The angle between consecutive terms is content — a quarter-turn
//     between two of them means `f` rotated by a quarter-turn — so stretching one axis to fill the
//     panel would draw angles the integrand does not have. The real trail and the contrast trail
//     share one frame for the same reason.
//  2. **Fit what is actually there.** The previous fit framed `[−max, max]` on BOTH axes with the
//     origin pinned to the canvas centre, which is tight only for a walk reaching equally far in
//     all four directions. D1's keyhole runs `0 → 4.39 − 3.19i` and never leaves one quadrant.
import { describe, expect, it } from "vitest";
import { accumulatorFrame } from "../src/ui/accumulator.js";
import type { Cx } from "../src/kernel/geom.js";

/** The panel as the shell lays it out at a 1500 × 1050 viewport: `--strip` tall, minus `.accSide`. */
const W = 860;
const H = 255;

/** D1's walk, to its endpoint — the record this whole fix was measured on. */
const KEYHOLE: readonly Cx[] = [
  [0, 0],
  [2.1, -0.4],
  [4.39, -1.9],
  [4.39, -3.19],
];

const span = (pts: readonly Cx[], w = W, h = H): { x: number; y: number } => {
  const f = accumulatorFrame(pts, w, h);
  const xs = pts.map((p) => f.toX(p[0]));
  const ys = pts.map((p) => f.toY(p[1]));
  return { x: Math.max(...xs) - Math.min(...xs), y: Math.max(...ys) - Math.min(...ys) };
};

describe("the scale is isotropic, which is the constraint everything else works around", () => {
  it("is ONE number, and both axes are drawn at it", () => {
    const f = accumulatorFrame(KEYHOLE, W, H);
    // A unit step right and a unit step up must measure the same on screen. Asserting this through
    // `toX`/`toY` rather than reading `scale` is the point: a future fit that stretched one axis
    // would keep a `scale` field and still fail here.
    const dx = f.toX(1) - f.toX(0);
    const dy = f.toY(0) - f.toY(1);
    expect(dx).toBeCloseTo(dy, 12);
    expect(dx).toBeCloseTo(f.scale, 12);
  });

  it("so a square walk stays square, however oblong the panel", () => {
    const square: readonly Cx[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const s = span(square, 1200, 160);
    expect(s.x).toBeCloseTo(s.y, 9);
  });
});

describe("the box it fits is the data's own, with the origin in it", () => {
  it("fills the BINDING dimension completely", () => {
    // The tall-ness of the keyhole's walk relative to this panel is what binds, so the trail should
    // span the full padded height. Anything less is the old symmetric-frame waste.
    const s = span(KEYHOLE);
    expect(s.y).toBeCloseTo(H - 36, 6);
    expect(s.x).toBeLessThan(W - 36);
  });

  it("and a FLAT walk fills the width instead — the other axis stops binding", () => {
    // `circle-linear-cos` ends at `3.62749513 − 3.6e-17i`: that imaginary part is float dust from
    // summing 240 terms. A fit that took it seriously would zoom until the dust filled the panel.
    const flat: readonly Cx[] = [
      [0, 0],
      [1.8, -1e-17],
      [3.6274951, -3.6e-17],
    ];
    const s = span(flat);
    expect(s.x).toBeCloseTo(W - 36, 6);
    expect(s.y).toBeLessThan(1e-6);
  });

  it("keeps the origin in frame even when the walk never returns to it", () => {
    // Both axes are drawn through `toX(0)`/`toY(0)`, and `Σ Δz` closing back to the origin is the
    // cheapest striking thing in the app — so a frame that cropped it would break both.
    const away: readonly Cx[] = [
      [8, 6],
      [9, 7],
      [10, 6.5],
    ];
    const f = accumulatorFrame(away, W, H);
    expect(f.toX(0)).toBeGreaterThanOrEqual(0);
    expect(f.toX(0)).toBeLessThanOrEqual(W);
    expect(f.toY(0)).toBeGreaterThanOrEqual(0);
    expect(f.toY(0)).toBeLessThanOrEqual(H);
  });

  it("centres the BOX, not the origin — which is what stops it looking broken", () => {
    // The old fit put `0` at the canvas centre, so a one-quadrant walk hugged a corner. Centring the
    // box puts the picture in the middle and splits the leftover space evenly.
    const f = accumulatorFrame(KEYHOLE, W, H);
    const xs = KEYHOLE.map((p) => f.toX(p[0]));
    const ys = KEYHOLE.map((p) => f.toY(p[1]));
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(W / 2, 6);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(H / 2, 6);
  });
});

describe("it is bigger than the fit it replaces, measured", () => {
  /** The previous fit, kept here as the baseline the improvement is claimed against. */
  const legacySpan = (pts: readonly Cx[], w = W, h = H): { x: number; y: number } => {
    let max = 1e-9;
    for (const p of pts) max = Math.max(max, Math.abs(p[0]), Math.abs(p[1]));
    const scale = Math.min((w - 36) / (2 * max), (h - 36) / (2 * max));
    const xs = pts.map((p) => w / 2 + p[0] * scale);
    const ys = pts.map((p) => h / 2 - p[1] * scale);
    return { x: Math.max(...xs) - Math.min(...xs), y: Math.max(...ys) - Math.min(...ys) };
  };

  it("D1's keyhole: the trail's area grows by more than 3×", () => {
    const now = span(KEYHOLE);
    const before = legacySpan(KEYHOLE);
    expect((now.x * now.y) / (before.x * before.y)).toBeGreaterThan(3);
  });

  it("and a flat walk grows by more than 3× in the one dimension it has", () => {
    const flat: readonly Cx[] = [
      [0, 0],
      [3.6274951, -3.6e-17],
    ];
    expect(span(flat).x / legacySpan(flat).x).toBeGreaterThan(3);
  });

  it("no walk is drawn SMALLER than it was, on either axis", () => {
    // The claim is a strict improvement, so it is asserted as one over a spread of shapes rather
    // than on the one record that motivated it.
    const shapes: readonly (readonly Cx[])[] = [
      KEYHOLE,
      [[0, 0], [1, 1]],
      [[0, 0], [-2, 0], [-2, -2]],
      [[0, 0], [0, 5]],
      [[0, 0], [3, 0], [3, 3], [0, 3], [0, 0]],
      [[0, 0], [0.001, 0.0004]],
      [[0, 0], [-1, 4], [2, -3], [5, 1]],
    ];
    for (const pts of shapes) {
      const now = span(pts);
      const before = legacySpan(pts);
      expect({ x: now.x >= before.x - 1e-6, y: now.y >= before.y - 1e-6 }).toEqual({
        x: true,
        y: true,
      });
    }
  });
});

describe("the degenerate cases are decided rather than left to divide by zero", () => {
  it("a walk that never leaves the origin draws a dot, not a portrait of rounding error", () => {
    const f = accumulatorFrame([[0, 0]], W, H);
    expect(Number.isFinite(f.scale)).toBe(true);
    expect(f.toX(0)).toBeCloseTo(W / 2, 6);
    expect(f.toY(0)).toBeCloseTo(H / 2, 6);
    // Float dust stays dust: 1e-12 is a thousandth of the floor, so it renders sub-pixel.
    expect(Math.abs(f.toX(1e-12) - W / 2)).toBeLessThan(1);
  });

  it("an empty walk is a frame, not a crash", () => {
    const f = accumulatorFrame([], W, H);
    expect(Number.isFinite(f.toX(0))).toBe(true);
    expect(Number.isFinite(f.toY(0))).toBe(true);
  });

  it.each([
    ["NaN", Number.NaN],
    ["+Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
  ])("skips a %s sample instead of letting it decide the frame", (_label, bad) => {
    // `removable-one-minus-cos` is the case that raised this: a midpoint lands exactly on the
    // removable singularity of `(1 − cos z)/z²`, the compiled expression returns `0/0`, and every
    // partial sum after it is NaN.
    //
    // **All three, because a sweep showed NaN alone asserts nothing.** NaN comparisons are all
    // false, so NaN points never move min/max and are excluded whether the guard is there or not —
    // deleting it passes a NaN-only test. ±Infinity is the case that needs the guard: the
    // comparisons ARE true, one sample would make the span infinite and the scale zero, and the
    // whole trail would collapse to a point.
    const poisoned: readonly Cx[] = [[0, 0], [1, -0.5], [2, -1], [bad, bad], [bad, -1]];
    const good = accumulatorFrame([[0, 0], [1, -0.5], [2, -1]], W, H);
    const f = accumulatorFrame(poisoned, W, H);
    // The same frame the good prefix alone would have produced.
    expect(f.scale).toBeCloseTo(good.scale, 9);
    expect(f.toX(2)).toBeCloseTo(good.toX(2), 6);
    expect(f.toY(-1)).toBeCloseTo(good.toY(-1), 6);
    // And the part that can be drawn is still drawn full size, rather than collapsed or blown up.
    expect(span(poisoned.slice(0, 3)).y).toBeCloseTo(H - 36, 6);
  });

  it("a zero-sized canvas does not produce NaN coordinates", () => {
    // `drawAcc` reads `clientWidth || 1` before the first layout, so this really happens.
    const f = accumulatorFrame(KEYHOLE, 1, 1);
    expect(Number.isFinite(f.toX(1))).toBe(true);
    expect(Number.isFinite(f.toY(1))).toBe(true);
  });
});
