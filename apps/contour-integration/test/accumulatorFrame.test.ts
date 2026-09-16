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
import { accumulatorFrame, stepNear } from "../src/ui/accumulator.js";
import type { Accumulation, AccumulationStep } from "../src/engine/contour/accumulate.js";
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


// **THE HIT TEST** — `stepNear`, which answers "which term of the sum is the pointer over?" and so
// links the trail to the piece list and to the contour on the stage.
//
// It needs no canvas for the same reason `accumulatorFrame` does not: the mapping is arithmetic. Its
// one correctness obligation is that it agrees with what `drawAccumulator` DREW — the same frame, the
// same `upTo` slice — so the fixture below is walked by hand and the screen positions are written out
// as literals rather than recomputed from the thing under test.

/** A step with only the fields the hit test reads; the rest are along for the interface. */
const stepAt = (running: Cx, piece: number, s: number): AccumulationStep => ({
  z: [0, 0],
  dz: [0, 0],
  fz: [0, 0],
  term: [0, 0],
  running,
  piece,
  s,
});

/**
 * Four steps: right, right, up, up — two pieces of two steps each.
 *
 * Its box is `[0,2] × [0,2]`, so in the 860 × 255 panel the height binds and the scale is
 * `(255 − 36)/2 = 109.5` px per unit, with the box centred: `toX(re) = 430 + (re − 1)·109.5`,
 * `toY(im) = 127.5 − (im − 1)·109.5`. Every coordinate below is that arithmetic done by hand.
 */
const WALK: Accumulation = {
  steps: [
    stepAt([1, 0], 0, 0.25),
    stepAt([2, 0], 0, 0.5),
    stepAt([2, 1], 1, 0.75),
    stepAt([2, 2], 1, 1),
  ],
  total: [2, 2],
  // `Σ Δz` reaching well outside the real walk's box, so turning the contrast on demonstrably moves
  // the frame — which is the point of the last test in this block.
  contrasts: { sumZ: [], sumFz: [], sumDz: [[0, 0], [0, 0], [0, 0], [-6, 0]] },
};

/** The origin, and the endpoint of each of the four steps, in canvas pixels. */
const AT = {
  origin: [320.5, 237] as const,
  s0: [430, 237] as const,
  s1: [539.5, 237] as const,
  s2: [539.5, 127.5] as const,
  s3: [539.5, 18] as const,
};

describe("stepNear agrees with what was drawn, because it asks the same frame", () => {
  it("the fixture really is where the hand arithmetic says", () => {
    // Pins the literals above against `accumulatorFrame` itself, so if the fit ever moves, the rest
    // of this block fails as a wrong EXPECTATION rather than silently testing a different picture.
    const f = accumulatorFrame(WALK.steps.map((s) => s.running), W, H);
    expect(f.scale).toBeCloseTo(109.5, 9);
    expect([f.toX(0), f.toY(0)]).toEqual([AT.origin[0], AT.origin[1]]);
    expect([f.toX(2), f.toY(2)]).toEqual([AT.s3[0], AT.s3[1]]);
  });

  it("a point exactly on a step's screen position returns that step", () => {
    const hit = (p: readonly [number, number]): number | null =>
      stepNear(WALK, W, H, p[0], p[1], { upTo: 1, contrast: "none" });
    // A vertex is shared by the step arriving at it and the step leaving it, both at distance 0. The
    // tie goes to the earlier one — the segment that ARRIVES — so `s2`'s position is step 2.
    expect([hit(AT.s0), hit(AT.s1), hit(AT.s2), hit(AT.s3)]).toEqual([0, 1, 2, 3]);
    // And a point in the middle of a segment, where there is no tie at all: half-way along step 3,
    // which runs (539.5, 127.5) → (539.5, 18).
    expect(hit([539.5, 72.75])).toBe(3);
  });

  it("a point far from every segment returns null", () => {
    // (100, 40) is 295.7 px from the nearest drawn segment — the top-left of the panel, where this
    // walk never goes.
    expect(stepNear(WALK, W, H, 100, 40, { upTo: 1, contrast: "none" })).toBeNull();
  });

  it("a step BEYOND `upTo` is not returned, because the drawing did not draw it", () => {
    // `drawAccumulator` shows `round(upTo · steps.length)` steps, so `upTo = 0.5` draws steps 0–1
    // and stops at (539.5, 237). The frame does NOT change — it fits every step's running total so
    // that scrubbing moves the head along a fixed picture — so `s3` is still at (539.5, 18), 219 px
    // up the canvas from where the drawing stops, and nothing is there to hit.
    const half = { upTo: 0.5, contrast: "none" } as const;
    expect(stepNear(WALK, W, H, AT.s1[0], AT.s1[1], half)).toBe(1);
    expect(stepNear(WALK, W, H, AT.s2[0], AT.s2[1], half)).toBeNull();
    expect(stepNear(WALK, W, H, AT.s3[0], AT.s3[1], half)).toBeNull();
  });
});

describe("the tolerance is a boundary, not a suggestion", () => {
  /** Straight up from the middle of step 0, which runs (320.5, 237) → (430, 237) horizontally. */
  const above = (d: number, tolerance?: number): number | null =>
    stepNear(WALK, W, H, 375, 237 - d, { upTo: 1, contrast: "none", ...(tolerance === undefined ? {} : { tolerance }) });

  it("the default is 8 px, inclusive", () => {
    // Measured over the loaded corpus in this same 860 × 255 box: 28 records, 6,524 segments, whose
    // consecutive vertices are a median of 1.11 px apart (mean 3.38, max 121.6 — `mellin-keyhole`'s
    // outer circle against its lips). So the tolerance is never about resolving neighbouring steps;
    // it is about how far OFF the trail still counts. At 8 px a uniform 40 × 12 grid of probes over
    // every record lands on a segment 3.5% of the time (1.7% at 4 px, 9.7% at 12, 13.5% at 20), so a
    // miss stays the common case and `null` is a real answer rather than a rare one.
    expect([above(7.9), above(8), above(8.1)]).toEqual([0, 0, null]);
  });

  it("and a caller's own tolerance is the boundary instead", () => {
    expect([above(4.9, 5), above(5, 5), above(5.1, 5)]).toEqual([0, 0, null]);
    // Far outside the default, well inside a generous one.
    expect([above(30), above(30, 40)]).toEqual([null, 0]);
  });

  it("an empty walk is null at every tolerance", () => {
    const empty: Accumulation = {
      steps: [],
      total: [0, 0],
      contrasts: { sumZ: [], sumFz: [], sumDz: [] },
    };
    expect(stepNear(empty, W, H, W / 2, H / 2, { upTo: 1, contrast: "none", tolerance: 1e6 })).toBeNull();
  });
});

describe("the contrast walk decides the frame, and is not itself hoverable", () => {
  // Both halves of one claim: `stepNear` is given `contrast` because the FIT spans both walks, so
  // the same canvas point is over a different segment with the contrast shown and hidden — and the
  // answer it returns is always a step of the real trail, never of the faint dashed one.
  it("turning the contrast on moves where the steps are", () => {
    // `Σ Δz` reaches (−6, 0), so the box becomes `[−6,2] × [0,2]` and the WIDTH binds instead:
    // scale `(860 − 36)/8 = 103`, box centre (−2, 1), so step 3 lands at (842, 24.5) rather than
    // (539.5, 18) — 302.6 px away, well outside any tolerance a pointer uses.
    const f = accumulatorFrame(
      [...WALK.steps.map((s) => s.running), ...WALK.contrasts.sumDz],
      W,
      H,
    );
    expect([f.toX(2), f.toY(2)]).toEqual([842, 24.5]);
    const withContrast = { upTo: 1, contrast: "sumDz" } as const;
    expect(stepNear(WALK, W, H, 842, 24.5, withContrast)).toBe(3);
    expect(stepNear(WALK, W, H, AT.s3[0], AT.s3[1], withContrast)).toBeNull();
  });

  it("a point on the contrast trail alone hits nothing", () => {
    // Under that same frame the contrast runs from the origin at (636, 230.5) out to (18, 230.5),
    // and the real walk's leftmost point is that origin — so (100, 230.5) is squarely ON the dashed
    // trail and 536 px from anything drawn in a piece colour.
    expect(stepNear(WALK, W, H, 100, 230.5, { upTo: 1, contrast: "sumDz" })).toBeNull();
  });
});
