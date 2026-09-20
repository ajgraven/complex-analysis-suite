// **The amplitwist detail's arithmetic** — M8 step 3.3.
//
// The picture on the stage asserts exactly two things and neither of them is a length: the RATIO of
// the two arrows is `|f(z_k)|` and the ANGLE between them is `arg f(z_k)`. Both survive the
// magnification and the camera, which is what makes the magnification spendable at all — so what is
// pinned here is that they survive, not that any particular number of pixels came out.
//
// The corpus half of the file is the other reason it exists: the shorter arrow is dropped below a
// floor, and **the measurement that sets that policy inverted the guess it was written on**. The
// expectation was an amplifying term near a pole leaving `Δz` invisible; the gallery does the
// opposite, because a vanishing-arc record has `|f| ≪ 1` on the arc BY CONSTRUCTION. That is not a
// case to tolerate — it is the KILL lemma drawn.
import { describe, expect, it } from "vitest";

import { accumulateForIntegral } from "../src/engine/contour/accumulate.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import { loadFamilies } from "../src/families/index.js";
import { compile, defaultState, resolveState } from "../src/shell/state.js";
import {
  ARROW_PX,
  MIN_ARROW_PX,
  amplitwistScale,
  degrees,
  scaleLabel,
  stepDetail,
} from "../src/shell/stepDetail.js";
import type { AccumulationStep } from "../src/engine/contour/accumulate.js";
import type { Cx } from "../src/kernel/geom.js";

/** A step built by hand, so the two invariants can be asserted against a chosen `f`. */
function madeStep(z: Cx, dz: Cx, fz: Cx): AccumulationStep {
  const term: Cx = [fz[0] * dz[0] - fz[1] * dz[1], fz[0] * dz[1] + fz[1] * dz[0]];
  return { z, dz, fz, term, running: term, piece: 0, s: 0 };
}

const abs = (z: Cx): number => Math.hypot(z[0], z[1]);
const arg = (z: Cx): number => Math.atan2(z[1], z[0]);

describe("the two invariants", () => {
  it("draws the arrows in the ratio `|f|`, whatever the camera and whatever the magnification", () => {
    // Four cameras, one step. The arrows change length — that is what the magnification is for —
    // and their RATIO does not move at all, which is the only thing the picture claims.
    const f: Cx = [3, 0];
    const step = madeStep([1, 1], [0.05, 0.02], f);
    const ratios: number[] = [];
    const lengths: number[] = [];
    const plot: number[] = [];
    for (const px of [20, 120, 900, 4000]) {
      const d = stepDetail(step, 7, px);
      expect(d).not.toBeNull();
      if (d === null || d.dz === null || d.term === null) throw new Error("both arrows must be drawn at |f| = 3");
      ratios.push(abs(d.term) / abs(d.dz));
      lengths.push(abs(d.term) * px);
      plot.push(abs(d.term));
    }
    for (const r of ratios) expect(r).toBeCloseTo(3, 12);
    // **The anti-vacuity half, and stating it correctly took a second look.** In SCREEN pixels the
    // longer arrow is pinned at `ARROW_PX` by construction, so "the arrows changed" is false there
    // and asserting it would pass on a stub. What changes across a 200× camera is the PLOT-space
    // vector, by the same 200× — the magnification absorbing the zoom is exactly the mechanism, so
    // that is the thing to measure.
    for (const L of lengths) expect(L).toBeCloseTo(ARROW_PX, 9);
    expect(Math.max(...plot) / Math.min(...plot)).toBeCloseTo(200, 6);
    // The ratios are not bit-identical across the four — the scale divides and multiplies by
    // different numbers — so what is asserted is that the spread is float64 dust rather than a
    // dependence: measured at 8.9e-16, which is 4 ulp of 3.
    const spread = Math.max(...ratios) - Math.min(...ratios);
    expect(`spread ${spread < 1e-14}`).toBe("spread true");
  });

  it("marks `arg f` as the angle between them, and reads it off `f` rather than dividing", () => {
    // `term / dz` and `fz` are the same number in exact arithmetic and not in float64, and the arc
    // on the stage is drawn from the two DRAWN directions. So the assertion is that the three
    // agree: the declared `arg f`, the difference of the arrows' arguments, and the value the
    // detail reports.
    for (const theta of [0, 0.7, 2.5, -1.2, Math.PI]) {
      const f: Cx = [2 * Math.cos(theta), 2 * Math.sin(theta)];
      const d = stepDetail(madeStep([0, 0], [0.1, 0], f), 0, 100);
      if (d === null || d.dz === null || d.term === null) throw new Error("both arrows must be drawn at |f| = 2");
      const between = Math.atan2(Math.sin(arg(d.term) - arg(d.dz)), Math.cos(arg(d.term) - arg(d.dz)));
      expect(`θ=${theta}: ${between.toFixed(9)}`).toBe(`θ=${theta}: ${d.argument.toFixed(9)}`);
      expect(degrees(d.argument)).toBeCloseTo((theta * 180) / Math.PI, 9);
    }
  });

  it("magnifies against the LONGER arrow, so which one is pinned at 60 px is `|f|`'s answer", () => {
    // One factor for both is the whole point — per-arrow scaling would draw two equal arrows and
    // destroy the ratio. Choosing it against the longer is what keeps either from overflowing the
    // stage, and it means an amplifying term pins `f·Δz` while a damping one pins `Δz`.
    const px = 100;
    const big = stepDetail(madeStep([0, 0], [0.1, 0], [5, 0]), 0, px);
    const small = stepDetail(madeStep([0, 0], [0.1, 0], [0.2, 0]), 0, px);
    if (big === null || big.term === null || small === null || small.dz === null) throw new Error("both drawn");
    expect(abs(big.term) * px).toBeCloseTo(ARROW_PX, 9);
    expect(abs(small.dz) * px).toBeCloseTo(ARROW_PX, 9);
    // And the one that is not pinned is shorter, not equal: `|f| = 5` and `|f| = 0.2` are the same
    // statement read from the two ends.
    expect((big.dz === null ? 0 : abs(big.dz)) * px).toBeCloseTo(ARROW_PX / 5, 9);
    expect((small.term === null ? 0 : abs(small.term)) * px).toBeCloseTo(ARROW_PX * 0.2, 9);
  });
});

describe("what it refuses to draw", () => {
  it("drops the shorter arrow at the floor — and keeps the longer one and the numbers", () => {
    // At `|f| = MIN_ARROW_PX / (2·ARROW_PX)` the short arrow would be half the floor. The detail
    // still carries `modulus` and `argument`, because the panel's digits are what say how far off
    // the scale the picture has gone — dropping the arrow is not dropping the term.
    const px = 100;
    const tiny = MIN_ARROW_PX / (2 * ARROW_PX);
    const d = stepDetail(madeStep([0, 0], [0.1, 0], [tiny, 0]), 3, px);
    if (d === null) throw new Error("a tiny |f| is a drawable step");
    expect(`dz drawn: ${d.dz !== null}, term drawn: ${d.term !== null}`).toBe("dz drawn: true, term drawn: false");
    expect(d.modulus).toBeCloseTo(tiny, 15);
    expect(d.index).toBe(3);
    // Just above the floor both are drawn, which is what makes the line a threshold rather than a
    // rule that always fires.
    const over = stepDetail(madeStep([0, 0], [0.1, 0], [(MIN_ARROW_PX * 1.01) / ARROW_PX, 0]), 3, px);
    if (over === null) throw new Error("drawable");
    expect(`dz: ${over.dz !== null}, term: ${over.term !== null}`).toBe("dz: true, term: true");
  });

  it("refuses a non-finite term, a zero step and a stage with no size", () => {
    const nan = madeStep([0, 0], [0.1, 0], [Number.NaN, 0]);
    expect(stepDetail(nan, 0, 100)).toBeNull();
    // **`z` alone, which is the only case the finite check catches by ITSELF.** A non-finite `f`
    // or `Δz` poisons `term` too and `amplitwistScale` then refuses three lines further down, so a
    // sweep that mutates the check away still sees those refused — the mutant survived until this
    // line. The sample POINT is different: it is where the arrows start and nothing downstream
    // looks at it, so without the check a `NaN` origin would go through and the stage would draw a
    // detail at a screen position that is not a position.
    expect(stepDetail(madeStep([Number.NaN, 0], [0.1, 0], [1, 0]), 0, 100)).toBeNull();
    expect(stepDetail(madeStep([0, Number.POSITIVE_INFINITY], [0.1, 0], [1, 0]), 0, 100)).toBeNull();
    // And the pairing: the same step with a finite `z` IS drawn, so the refusal is about the point
    // and not about the shape of a hand-built step.
    expect(stepDetail(madeStep([0, 0], [0.1, 0], [1, 0]), 0, 100)).not.toBeNull();
    // A zero `Δz` has no direction, so there is no angle to mark and no arrow to draw — and
    // `amplitwistScale` is what says so, by having nothing to divide by.
    expect(stepDetail(madeStep([0, 0], [0, 0], [1, 0]), 0, 100)).toBeNull();
    expect(amplitwistScale([0, 0], [0, 0], 100)).toBe(0);
    // jsdom gives a canvas no size, so `scale(view, vp)` is 0 there: the detail is null rather than
    // Infinity-long arrows.
    expect(stepDetail(madeStep([0, 0], [0.1, 0], [1, 0]), 0, 0)).toBeNull();
    expect(stepDetail(undefined, 0, 100)).toBeNull();
  });

  it("states the magnification as a factor, including when it is a reduction", () => {
    // A magnification is a thing a reader must be able to discount, so it is stated rather than
    // implied. Below 1 it is a REDUCTION and `×0.08` is the honest word — the app does not write
    // `÷12`, because the arrows really are multiplied.
    expect(scaleLabel(1200)).toBe("arrows ×1200");
    expect(scaleLabel(12.34)).toBe("arrows ×12.3");
    expect(scaleLabel(0.0812)).toBe("arrows ×0.081");
    expect(scaleLabel(0)).toBe("");
    expect(scaleLabel(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("the corpus, which set the policy", () => {
  it("is a gallery of DAMPING terms, and that is the vanishing-arc lemma rather than a defect", () => {
    let finite = 0;
    let damping = 0;
    let dropped = 0;
    let nonFinite = 0;
    let worst = 0;
    const base = defaultState(circleTemplate([0, 0], 1.5));
    for (const id of loadFamilies().families.keys()) {
      const st = { ...base, mode: "gallery" as const, record: id, fixture: 0 };
      const r = resolveState(st, compile(st.expr));
      if (r.kind !== "gallery" || r.run === null || r.run.integral === undefined) continue;
      const acc = accumulateForIntegral(r.run.f, r.run.resolved, r.run.integral, r.run.ledger, undefined, r.run.sides);
      if (acc === null) continue;
      for (let k = 0; k < acc.steps.length; k += 1) {
        const d = stepDetail(acc.steps[k], k, 120);
        if (d === null) {
          nonFinite += 1;
          continue;
        }
        finite += 1;
        if (d.modulus < 1) damping += 1;
        if (d.dz === null || d.term === null) dropped += 1;
        if (d.modulus > worst) worst = d.modulus;
      }
    }
    // The numbers the constant's own doc quotes, run rather than remembered. The shape is what
    // matters and it is stated as a share: nine steps in ten have `|f| < 1`, so the arrow that
    // goes is nearly always the TERM's — the opposite of the amplifying-near-a-pole case the floor
    // was first written for.
    expect(`${finite} finite steps`).toBe("6717 finite steps");
    expect(`${damping} damping`).toBe("6136 damping");
    expect(damping / finite).toBeGreaterThan(0.9);
    // `removable-one-minus-cos` puts a midpoint exactly on the removable singularity of
    // `(1 − cos z)/z²`, so one step of the whole gallery is `0/0`. Asserting the count, not just
    // that it is small: a refusal that started firing everywhere would be a regression this
    // number catches and a `> 0` would not.
    expect(`${nonFinite} non-finite`).toBe("1 non-finite");
    expect(`${dropped} dropped`).toBe("2545 dropped");
    // And the amplification never runs away: the largest `|f|` anywhere in the gallery is 287, so
    // no record needs a second policy for the other end.
    expect(worst).toBeLessThan(1e3);
    expect(worst).toBeGreaterThan(1e2);
  });
});
