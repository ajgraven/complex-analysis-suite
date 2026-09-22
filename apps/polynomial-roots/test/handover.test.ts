import { describe, it, expect } from "vitest";
import { chooseEngine } from "../src/engine/limit/handover";
import type { HandoverInput } from "../src/engine/limit/handover";
import { DEFAULT_STATE } from "../src/state";
import { MAX_DEPTH, MIN_DEPTH } from "../src/engine/limit/walk";

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
    const chosen = chooseEngine(at({ cx: DEFAULT_STATE.cx, cy: DEFAULT_STATE.cy, halfHeight: DEFAULT_STATE.halfHeight }));
    expect(chosen.engine).toBe("roots");
    expect(chosen.forced).toBe(false);
    // At the origin the root spacing `|z|^(d+1)` is zero, so no pixel is ever smaller than it.
    expect(chosen.spacing).toBe(0);
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

  it("is monotone in the zoom — zooming in never hands the view back", () => {
    // A picture that flipped engines back and forth as the reader zoomed would be unreadable. At a fixed
    // centre the spacing is fixed and the pixel only shrinks, so the switch happens once.
    let seenLimit = false;
    for (let k = 0; k < 40; k++) {
      const halfHeight = 1.45 * Math.pow(0.72, k);
      const chosen = chooseEngine(at({ cx: 0.372, cy: -0.542, halfHeight }));
      if (chosen.engine === "limit") seenLimit = true;
      else expect(seenLimit, `flipped back at half-height ${halfHeight}`).toBe(false);
    }
    expect(seenLimit).toBe(true);
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
    // Turning the band on gives it back.
    expect(chooseEngine(at({ cx: 0.95, cy: 0, halfHeight: 1e-4, annulus: true })).engine).toBe("limit");
  });

  it("the fold applies to the rule as well as to the walk", () => {
    // `z` and `1/z` are the same picture, so they must be the same engine at the same relative zoom.
    const inner = chooseEngine(at({ cx: 0.657, cy: 0, halfHeight: 0.004 }));
    const outer = chooseEngine(at({ cx: 1 / 0.657, cy: 0, halfHeight: 0.004 }));
    expect(outer.spacing).toBeCloseTo(inner.spacing, 12);
    expect(outer.engine).toBe(inner.engine);
  });

  it("a forced choice is obeyed and says it was forced", () => {
    for (const mode of ["roots", "limit"] as const) {
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
