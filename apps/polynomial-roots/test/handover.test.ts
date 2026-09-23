import { describe, it, expect } from "vitest";
import { chooseEngine } from "../src/engine/limit/handover";
import type { HandoverInput } from "../src/engine/limit/handover";
import { centreNumbers, DEFAULT_STATE } from "../src/state";
import { MAX_DEPTH, MIN_DEPTH } from "../src/engine/limit/walk";
import { DEEP_DEPTH_MARGIN, DOUBLE_DOUBLE_BELOW } from "../src/engine/limit/handover";

const at = (over: Partial<HandoverInput> = {}): HandoverInput => ({
  mode: "auto",
  cx: 0,
  cy: 0,
  halfHeight: 1.45,
  maxDegree: 16,
  annulus: false,
  pixels: 1024,
  ...over,
});

describe("which engine draws", () => {
  it("the opening view is the root cloud, and that is the article's own picture", () => {
    const chosen = chooseEngine(at({ ...centreNumbers(DEFAULT_STATE), halfHeight: DEFAULT_STATE.halfHeight }));
    expect(chosen.engine).toBe("roots");
    expect(chosen.forced).toBe(false);
    // At the origin the root spacing `|z|^(d+1)` is zero, so no pixel is ever smaller than it.
    expect(chosen.spacing).toBe(0);
    // And the legend must not then say "roots are about 0 apart", which it did on every overview
    // centred at the origin until PR-5's browser pass read it off the Newman place.
    expect(chosen.reason).not.toMatch(/about 0 apart/);
    expect(chosen.reason).toContain("origin");
    expect(chooseEngine(at({ cx: 0.657 })).reason).toMatch(/about \d\.\de-\d+ apart/);
  });

  it("hands over when a pixel is finer than the degree's own root spacing", () => {
    // Michelen–Yakir magnify about `α` by `α^(n+1)`, so that IS the spacing of the degree-`n` roots near
    // `α`. Once a texel is smaller, the cloud has come apart into separate dots and the limit-set walk
    // is the better picture of the same object.
    const wide = chooseEngine(at({ cx: 0.657, cy: 0, halfHeight: 1.45 }));
    const tight = chooseEngine(at({ cx: 0.657, cy: 0, halfHeight: 0.004 }));
    expect(wide.engine).toBe("roots");
    expect(tight.engine).toBe("limit");
    expect(wide.spacing).toBeCloseTo(Math.pow(0.657, 17), 12);
    expect(tight.spacing).toBe(wide.spacing);
  });

  it("is monotone in the zoom — the three engines are a LADDER and it only goes down", () => {
    // A picture that flipped engines back and forth as the reader zoomed would be unreadable. At a fixed
    // centre the root spacing is fixed, the texel only shrinks and the two thresholds are both on the
    // texel, so each hand-over happens once and in one direction: root cloud, then limit set, then the
    // reference walk.
    const rung = { roots: 0, limit: 1, deep: 2 } as const;
    let previous = 0;
    const seen = new Set<string>();
    for (let k = 0; k < 90; k++) {
      const halfHeight = 1.45 * Math.pow(0.72, k);
      const chosen = chooseEngine(at({ cx: 0.372, cy: -0.542, halfHeight }));
      seen.add(chosen.engine);
      expect(rung[chosen.engine], `stepped back up at half-height ${halfHeight}`).toBeGreaterThanOrEqual(previous);
      previous = rung[chosen.engine];
    }
    expect([...seen].sort()).toEqual(["deep", "limit", "roots"]);
  });

  it("a higher degree keeps the root engine longer, because its cloud resolves further", () => {
    // `|z|^(d+1)` SHRINKS with the degree, so a higher degree puts the hand-over further in. Measured at
    // `|z| = 0.657`: degree 10 comes apart at a texel of 1.0e-2, degree 24 not until 2.7e-5.
    const view = { cx: 0.657, cy: 0, halfHeight: 0.5 };
    expect(chooseEngine(at({ ...view, maxDegree: 10 })).engine).toBe("limit");
    expect(chooseEngine(at({ ...view, maxDegree: 24 })).engine).toBe("roots");
  });

  it("keeps the band around |z| = 1 for the root engine, because the walk does not enter it", () => {
    // Handing a view the walk refuses to compute to the walk would paint the whole frame neutral. The
    // root engine covers exactly that region, and Bousch proved the roots are dense there.
    const banded = chooseEngine(at({ cx: 0.95, cy: 0, halfHeight: 1e-4 }));
    expect(banded.engine).toBe("roots");
    expect(banded.reason).toContain("band");
    // Turning the band on gives it back — at a zoom the limit-set shader can still place its own texels.
    // Deeper than that the reference walk takes over there too, and near |z| = 1 it is the walk's own
    // budget that reports the trouble rather than the rule pretending there is none.
    expect(chooseEngine(at({ cx: 0.95, cy: 0, halfHeight: 1e-2, annulus: true })).engine).toBe("limit");
    expect(chooseEngine(at({ cx: 0.95, cy: 0, halfHeight: 1e-6, annulus: true })).engine).toBe("deep");
  });

  it("the fold applies to the rule as well as to the walk", () => {
    // `z` and `1/z` are the same picture, so they must be the same engine at the same relative zoom.
    const inner = chooseEngine(at({ cx: 0.657, cy: 0, halfHeight: 0.004 }));
    const outer = chooseEngine(at({ cx: 1 / 0.657, cy: 0, halfHeight: 0.004 }));
    expect(outer.spacing).toBeCloseTo(inner.spacing, 12);
    expect(outer.engine).toBe(inner.engine);
  });

  it("chooses the arithmetic the view needs, and the depth the scale needs", () => {
    // Measured: float64 and double-double agree on the root set exactly from 1e-10 to 1e-13 and part
    // company at 1e-14, so the switch sits at 1e-11 — a hundredth of a texel's worth of disagreement.
    // And the walk goes `log(radius)/log|z|` deep plus a margin of four: margin 0 returns a handful of
    // roots, margin 8 returns thousands at ten times the price.
    expect(chooseEngine(at({ halfHeight: 1e-10 })).precision).toBe("float64");
    expect(chooseEngine(at({ halfHeight: 1e-12 })).precision).toBe("dd");
    expect(DOUBLE_DOUBLE_BELOW).toBe(1e-11);
    const deep = chooseEngine(at({ cx: 0.42065, cy: 0.48354, halfHeight: 1e-18 }));
    const bare = Math.ceil(Math.log(Math.hypot(1e-18 * 1.55, 1e-18)) / Math.log(Math.hypot(0.42065, 0.48354)));
    expect(deep.deepDepth).toBe(bare + DEEP_DEPTH_MARGIN);
    expect(DEEP_DEPTH_MARGIN).toBe(4);
    // And it is capped at what the walk will carry.
    expect(chooseEngine(at({ cx: 0.79, cy: 0, halfHeight: 1e-30 })).deepDepth).toBeLessThanOrEqual(320);
  });

  it("a forced choice is obeyed and says it was forced", () => {
    for (const mode of ["roots", "limit", "deep"] as const) {
      const chosen = chooseEngine(at({ mode, cx: 0.372, cy: -0.542, halfHeight: 0.075 }));
      expect(chosen.engine).toBe(mode);
      expect(chosen.forced).toBe(true);
      expect(chosen.reason).toContain("you chose");
    }
  });

  it("warns when the forced limit-set engine is pointed at the band it will not walk", () => {
    // Obeyed, because it was asked for — but a blank frame with no explanation is the failure this
    // sentence exists to prevent.
    const chosen = chooseEngine(at({ mode: "limit", cx: 0.95, cy: 0.1, halfHeight: 1e-3 }));
    expect(chosen.engine).toBe("limit");
    expect(chosen.reason).toContain("blank");
    expect(chooseEngine(at({ mode: "limit", cx: 0.4, cy: 0.1, halfHeight: 1e-3 })).reason).not.toContain("blank");
  });

  it("the pixel is the world HEIGHT over the texel count, not the half-height", () => {
    // A factor of two here moves the hand-over by one power of `|z|` and nothing else in the rule would
    // look wrong. A view 2 units tall over 100 texels is 0.02 a texel.
    expect(chooseEngine(at({ halfHeight: 1, pixels: 100 })).pixelSize).toBeCloseTo(0.02, 15);
    expect(chooseEngine(at({ halfHeight: 1.45, pixels: 1024 })).pixelSize).toBeCloseTo(2.9 / 1024, 15);
  });

  it("suggests the depth the view can actually resolve", () => {
    // The depth-`D` walk cannot separate points closer than about `|z|^D`, so a texel far below that
    // OVER-REPORTS: measured at the zoom story at half-height 4e-4, depth 16 calls 50% of the frame
    // in-set against 18% at depth 24 and 16% at 34 and 48, where it has converged.
    // `log(pixel)/log|z|` is the depth that resolves a texel: 34 at the dragon's window, 33 at the
    // hexaholes, 28 at the feathers near 0.657, and the floor at the opening view, where the centre is
    // the origin and there is nothing to resolve.
    expect(chooseEngine(at({ cx: 0.372, cy: -0.542, halfHeight: 0.0004 })).suggestedDepth).toBe(34);
    expect(chooseEngine(at({ cx: 0.372368, cy: 0.517839, halfHeight: 0.00025 })).suggestedDepth).toBe(33);
    expect(chooseEngine(at({ cx: 0.657, cy: 0, halfHeight: 0.004 })).suggestedDepth).toBe(28);
    expect(chooseEngine(at({ cx: 0, cy: 0, halfHeight: 1.45 })).suggestedDepth).toBe(MIN_DEPTH);
    // It rises as the reader zooms, and is clamped to what the shader's arrays can carry.
    const deeper = chooseEngine(at({ cx: 0.372, cy: -0.542, halfHeight: 4e-8 }));
    expect(deeper.suggestedDepth).toBeGreaterThan(34);
    expect(chooseEngine(at({ cx: 0.372, cy: -0.542, halfHeight: 1e-30 })).suggestedDepth).toBe(MAX_DEPTH);
  });

  it("the reason carries the two numbers it compares, so a reader can check the rule", () => {
    const chosen = chooseEngine(at({ cx: 0.657, cy: 0, halfHeight: 0.004 }));
    expect(chosen.reason).toContain(chosen.pixelSize.toExponential(1));
    expect(chosen.reason).toContain(chosen.spacing.toExponential(1));
    expect(chosen.reason).toContain("degree-16");
  });
});
