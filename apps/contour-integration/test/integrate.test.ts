import { describe, expect, it } from "vitest";
import { mayReportValue } from "@cas/rigor";
import type { Cx, Resolved } from "../src/kernel/geom.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { resolveAll } from "../src/engine/contour/model.js";
import { circleTemplate, rectangleTemplate, semicircleTemplate } from "../src/engine/contour/templates.js";

const TWO_PI = 2 * Math.PI;

const cdiv = (a: Cx, b: Cx): Cx => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const sub = (a: Cx, b: Cx): Cx => [a[0] - b[0], a[1] - b[1]];

/** 1/(z − a). */
const simplePole = (a: Cx) => (z: Cx): Cx => cdiv([1, 0], sub(z, a));
/** z^n for integer n ≥ 0. */
const power = (n: number) => (z: Cx): Cx => {
  let re = 1;
  let im = 0;
  for (let k = 0; k < n; k++) {
    const nr = re * z[0] - im * z[1];
    im = re * z[1] + im * z[0];
    re = nr;
  }
  return [re, im];
};

const circle = (centre: [number, number], r: number): Resolved[] =>
  resolveAll(circleTemplate(centre, r));

const dist = (a: Cx, b: Cx): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("the M1 gate: ∮ dz/z = 2πi", () => {
  it("is exact to 1e-14 on the unit circle", () => {
    const r = integrateContour(simplePole([0, 0]), circle([0, 0], 1), [{ at: [0, 0] }]);
    expect(r.value).toBeDefined();
    expect(dist(r.value ?? [0, 0], [0, TWO_PI])).toBeLessThan(1e-14);
  });

  it("is exact at every radius and centre, because the pullback is constant", () => {
    // f(z(t))·z′(t) = 2πi at EVERY sample, so the trapezoidal rule has nothing left to approximate.
    // That is why the periodic rule is the right one for a closed loop, not merely a faster one.
    for (const [cx, cy, r] of [
      [0, 0, 0.25],
      [0, 0, 1000],
      [3, -4, 7],
      [-0.5, 0.5, 1e-3],
    ] as const) {
      const pole: Cx = [cx, cy];
      const out = integrateContour(simplePole(pole), circle([cx, cy], r), [{ at: pole }]);
      expect(dist(out.value ?? [0, 0], [0, TWO_PI])).toBeLessThan(1e-13 * Math.max(1, TWO_PI));
    }
  });

  it("vanishes when the pole is outside the circle", () => {
    const out = integrateContour(simplePole([5, 0]), circle([0, 0], 1), [{ at: [5, 0] }]);
    expect(Math.hypot(...(out.value ?? [1, 1]))).toBeLessThan(1e-12);
  });

  it("vanishes for z^n, n ≥ 0 — an entire integrand over a closed loop", () => {
    for (const n of [0, 1, 2, 5]) {
      const out = integrateContour(power(n), circle([0, 0], 1.3), []);
      expect(Math.hypot(...(out.value ?? [1, 1]))).toBeLessThan(1e-10);
    }
  });

  it("jumps by exactly 2πi·Res when the contour crosses the pole", () => {
    // The first north-star behaviour in the plan: drag the contour across a pole and watch the value
    // jump by a whole residue rather than drift.
    const pole: Cx = [1, 0];
    const inside = integrateContour(simplePole(pole), circle([0, 0], 1.5), [{ at: pole }]);
    const outside = integrateContour(simplePole(pole), circle([0, 0], 0.5), [{ at: pole }]);
    const jump = sub(inside.value ?? [0, 0], outside.value ?? [0, 0]);
    expect(dist(jump, [0, TWO_PI])).toBeLessThan(1e-12);
  });
});

describe("refusal", () => {
  it("prints NO value when the contour passes through a pole", () => {
    // The nearest existing tool answers 6.71197 + 0.46361i here, wrong to six figures and uncaveated.
    const pole: Cx = [1, 0];
    const out = integrateContour(simplePole(pole), circle([0, 0], 1), [{ at: pole }]);
    expect(out.value).toBeUndefined();
    expect(out.verdict.level).toBe("⚠");
    expect(mayReportValue(out.verdict)).toBe(false);
    expect(out.refusal).toMatch(/lies on the contour/);
  });

  it("refuses on a pole within rounding distance of the contour, not only exactly on it", () => {
    const pole: Cx = [1 + 1e-15, 0];
    const out = integrateContour(simplePole(pole), circle([0, 0], 1), [{ at: pole }]);
    expect(out.value).toBeUndefined();
  });

  it("still computes when the pole is merely close, and says the estimate got harder", () => {
    const pole: Cx = [1.01, 0];
    const out = integrateContour(simplePole(pole), circle([0, 0], 1), [{ at: pole }]);
    expect(out.value).toBeDefined();
    // Outside the circle ⇒ the integral is 0; the node controller has to work for it.
    expect(Math.hypot(...(out.value ?? [1, 1]))).toBeLessThan(1e-6);
  });

  it("refuses an empty contour rather than returning zero", () => {
    const out = integrateContour(simplePole([0, 0]), [], []);
    expect(out.value).toBeUndefined();
    expect(out.verdict.level).toBe("⚠");
  });
});

describe("closed non-circular contours", () => {
  it("gives 2πi for a rectangle around the pole", () => {
    const out = integrateContour(simplePole([0, 0]), resolveAll(rectangleTemplate(-1, -1, 1, 1)), [
      { at: [0, 0] },
    ]);
    expect(dist(out.value ?? [0, 0], [0, TWO_PI])).toBeLessThan(1e-9);
  });

  it("gives π for the semicircular contour on 1/(1+z²) — gallery entry A5's shape", () => {
    // ∮ = 2πi·Res(1/(1+z²), i) = 2πi/(2i) = π, and the arc contributes O(1/R).
    const f = (z: Cx): Cx => cdiv([1, 0], [1 + z[0] * z[0] - z[1] * z[1], 2 * z[0] * z[1]]);
    const R = 2000;
    const out = integrateContour(f, resolveAll(semicircleTemplate(R)), [
      { at: [0, 1] },
      { at: [0, -1] },
    ]);
    expect(out.value).toBeDefined();
    // The closed contour's value is π exactly. The tolerance is the QUADRATURE's, not the
    // contour's: the arc's own O(1/R) contribution is part of ∮ and cancels into the total.
    expect(Math.abs((out.value ?? [0, 0])[0] - Math.PI)).toBeLessThan(1e-9);
    expect(Math.abs((out.value ?? [0, 0])[1])).toBeLessThan(1e-9);

    // The panelling is what makes that possible. The diameter is 4000 long with the nearest
    // singularity one unit away, so a single Gauss rule — whose nodes cluster at the endpoints —
    // steps straight over the unit-wide peak of 1/(1+x²) and misses by about 0.1.
    const diameter = out.pieces[0];
    expect(diameter.rule).toBe("gauss-legendre");
    expect(diameter.nodes).toBeGreaterThan(2 * R);
    expect(diameter.capped).toBe(false);
  });

  it("reports whether the contour is closed", () => {
    expect(integrateContour(power(0), circle([0, 0], 1), []).closed).toBe(true);
    expect(integrateContour(power(0), resolveAll(rectangleTemplate(0, 0, 1, 1)), []).closed).toBe(true);
    // The semicircle template's two pieces do not join up: the arc ends at −R, the diameter starts
    // there, but the traversal order is diameter-then-arc, so it closes. Reverse it and it does not.
    expect(integrateContour(power(0), resolveAll(semicircleTemplate(2)), []).closed).toBe(true);
  });
});

describe("honest labelling of the integral", () => {
  it("never labels a quadrature result exact", () => {
    const out = integrateContour(simplePole([0, 0]), circle([0, 0], 1), [{ at: [0, 0] }]);
    // Even though ∮dz/z comes out to the last bit, the METHOD is numerical and the label says so.
    expect(out.verdict.level).not.toBe("=");
  });

  it("carries the 'estimate, not a bound' restriction on the refinement comparison", () => {
    const out = integrateContour(simplePole([0, 0]), circle([0, 0], 1), [{ at: [0, 0] }]);
    expect(out.verdict.restrictions.join(" ")).toMatch(/not a proved error bound/);
  });

  it("labels the winding numbers exact even though the integral is not", () => {
    const out = integrateContour(simplePole([0, 0]), circle([0, 0], 1), [{ at: [0, 0] }]);
    const windingCerts = out.verdict.certificates.filter((c) => c.claim.startsWith("n(γ"));
    expect(windingCerts).toHaveLength(1);
    expect(windingCerts[0].level).toBe("=");
  });
});
