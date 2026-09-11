import { describe, expect, it } from "vitest";
import { evaluate, parse } from "@cas/expr";
import {
  harmonicIndex,
  isUnitCircleMap,
  substituteUnitCircle,
  toContourIntegrand,
} from "../src/engine/substitution.js";
import { contourIntegrandOf } from "../src/families/instantiate.js";
import { findPoles } from "../src/kernel/poles.js";
import { a1CircleLinearCos } from "../src/families/records/a1-circle-linear-cos.js";
import { a3CircleCosNTheta } from "../src/families/records/a3-circle-cos-n-theta.js";
import type { Node } from "@cas/expr";

const SAMPLE_THETA = [0.3, 1.0, 2.2, 3.9, 5.5, 6.1];

/** Evaluate a rewritten z-expression at `z = e^{iθ}`. */
function atCircle(node: Node, theta: number): [number, number] {
  const z: [number, number] = [Math.cos(theta), Math.sin(theta)];
  const v = evaluate(node, z, [0, 0]);
  if (typeof v === "boolean") throw new Error("expected a complex value");
  return v;
}

function rewrite(src: string): Node {
  const r = substituteUnitCircle(parse(src), "theta");
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

describe("the rewrite is checked against the identity it claims, not against itself", () => {
  // The whole substitution rests on cos kθ = (zᵏ + z⁻ᵏ)/2 and sin kθ = (zᵏ − z⁻ᵏ)/(2i) at
  // z = e^{iθ}. Evaluating both sides at real θ tests the identity rather than restating the code.
  it.each([
    ["cos(theta)", (t: number) => Math.cos(t)],
    ["sin(theta)", (t: number) => Math.sin(t)],
    ["cos(2*theta)", (t: number) => Math.cos(2 * t)],
    ["sin(3*theta)", (t: number) => Math.sin(3 * t)],
    ["cos(-2*theta)", (t: number) => Math.cos(2 * t)],
    ["sin(-theta)", (t: number) => -Math.sin(t)],
    ["cos(0*theta)", () => 1],
    ["sin(0*theta)", () => 0],
    ["5 - 4*cos(theta)", (t: number) => 5 - 4 * Math.cos(t)],
  ])("%s", (src, expected) => {
    const node = rewrite(src);
    for (const t of SAMPLE_THETA) {
      const [re, im] = atCircle(node, t);
      expect(re).toBeCloseTo(expected(t), 12);
      expect(Math.abs(im)).toBeLessThan(1e-12);
    }
  });

  it("rewrites exp(i·kθ) straight to z^k", () => {
    for (const t of SAMPLE_THETA) {
      const [re, im] = atCircle(rewrite("exp(i*3*theta)"), t);
      expect(re).toBeCloseTo(Math.cos(3 * t), 12);
      expect(im).toBeCloseTo(Math.sin(3 * t), 12);
    }
  });
});

describe("harmonicIndex refuses what is not an integer multiple of θ", () => {
  const k = (src: string): number | null => harmonicIndex(parse(src), "theta");

  it("reads the multiples it should", () => {
    expect(k("theta")).toBe(1);
    expect(k("3*theta")).toBe(3);
    expect(k("theta*4")).toBe(4);
    expect(k("-2*theta")).toBe(-2);
    expect(k("2*theta + 3*theta")).toBe(5);
    expect(k("theta - 4*theta")).toBe(-3);
    expect(k("0")).toBe(0);
  });

  it("returns null for everything else, rather than guessing", () => {
    // A non-integer harmonic is not single-valued on the circle — it is a branch-cut problem.
    expect(k("theta/2")).toBeNull();
    expect(k("0.5*theta")).toBeNull();
    expect(k("theta^2")).toBeNull();
    expect(k("1")).toBeNull();
    expect(k("n*theta")).toBeNull(); // until n is bound to a number
    expect(k("sin(theta) - 2*theta")).toBeNull(); // A4's shape
  });
});

describe("refusals", () => {
  it("refuses θ outside a trigonometric function", () => {
    const r = substituteUnitCircle(parse("theta*cos(theta)"), "theta");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/multivalued and needs a branch cut/);
  });

  it("refuses a half-integer harmonic", () => {
    const r = substituteUnitCircle(parse("cos(theta/2)"), "theta");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/not an integer multiple/);
  });

  it("leaves a non-trigonometric call alone and rewrites inside it", () => {
    // exp(cos θ) becomes exp((z + 1/z)/2) — correct, and refused LATER as non-rational. Refusing
    // here would refuse too early, and it is the difference between A4 being unimplemented and
    // A4 being unrepresentable.
    const node = rewrite("exp(cos(theta))");
    for (const t of SAMPLE_THETA) {
      const [re, im] = atCircle(node, t);
      expect(re).toBeCloseTo(Math.exp(Math.cos(t)), 10);
      expect(Math.abs(im)).toBeLessThan(1e-10);
    }
  });

  it("refuses a map that is not z = e^{iθ}", () => {
    expect(isUnitCircleMap("exp(i*theta)", "theta")).toBe(true);
    expect(isUnitCircleMap("exp(theta*i)", "theta")).toBe(true);
    expect(isUnitCircleMap("exp(2*i*theta)", "theta")).toBe(false);
    expect(isUnitCircleMap("exp(i*theta)", "x")).toBe(false);
    expect(isUnitCircleMap("2*exp(i*theta)", "theta")).toBe(false);

    const r = toContourIntegrand(parse("cos(theta)"), "theta", {
      map: "2*exp(i*theta)",
      jacobian: "1/(i*z)",
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/hold only on the unit circle/);
  });

  it("refuses a Jacobian that still mentions θ", () => {
    const r = toContourIntegrand(parse("cos(theta)"), "theta", {
      map: "exp(i*theta)",
      jacobian: "1/(i*theta)",
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/still mentions theta/);
  });
});

// The reason this module is engine code. Research 03 §1's "single commonest error" is running pole
// detection on the POSED integrand: the substitution creates singularities that are not there.
describe("the substitution manufactures the singularities the posed integrand does not have", () => {
  it("gives A3 a pole of order exactly n at the origin, from an integrand smooth at every θ", () => {
    // cos 2θ/(5 − 4cos θ) is smooth on all of ℝ. Its contour integrand is not.
    const posed = findPoles(parse("cos(2*z)/(5 - 4*cos(z))"));
    expect(posed.rational).toBe(false); // the posed form is not even rational — nothing to find

    for (const n of [0, 1, 2, 3, 4]) {
      const built = contourIntegrandOf(a3CircleCosNTheta, { n });
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      const report = findPoles(built.ast);
      expect(report.rational).toBe(true);
      const origin = report.poles.find((p) => Math.hypot(p.at[0], p.at[1]) < 1e-9);
      if (n === 0) {
        // The base case of "order = n": at n = 0 the origin is not a pole at all.
        expect(origin).toBeUndefined();
      } else {
        expect(origin?.order).toBe(n);
        expect(origin?.orderCertain).toBe(true);
      }
      // The reciprocal pair is there at every n, and only one member is inside.
      const half = report.poles.find((p) => Math.abs(p.at[0] - 0.5) < 1e-9);
      const two = report.poles.find((p) => Math.abs(p.at[0] - 2) < 1e-9);
      expect(half).toBeDefined();
      expect(two).toBeDefined();
    }
  });

  it("leaves A1 with NO pole at the origin — the Jacobian's z cancels exactly", () => {
    // Contrast with A3. Here clearing the z⁻¹ inside cos θ multiplies the numerator by z, which
    // cancels the Jacobian's z, and z = 0 is a REMOVABLE singularity the engine must name rather
    // than fail to look for.
    const built = contourIntegrandOf(a1CircleLinearCos, { a: 2, b: 1 });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const report = findPoles(built.ast);
    expect(report.rational).toBe(true);
    expect(report.poles.some((p) => Math.hypot(p.at[0], p.at[1]) < 1e-9)).toBe(false);
    // f(z) = −2i/(z² + 4z + 1): the reciprocal pair −2 ± √3, and nothing at the origin.
    expect(report.poles).toHaveLength(2);
    expect(report.poles.map((p) => p.at[0]).sort((x, y) => x - y)[0]).toBeCloseTo(-2 - Math.sqrt(3), 9);
  });
});

describe("contourIntegrandOf binds parameters before it substitutes", () => {
  it("needs n bound before cos(n·θ) is a harmonic at all", () => {
    // The order is load-bearing: `cos(n*theta)` has no integer harmonic index until n is a number.
    const unbound = substituteUnitCircle(parse("cos(n*theta)"), "theta");
    expect(unbound.ok).toBe(false);
    const bound = contourIntegrandOf(a3CircleCosNTheta, { n: 2 });
    expect(bound.ok).toBe(true);
  });

  it("refuses rather than leaving a parameter free", () => {
    const r = contourIntegrandOf(a1CircleLinearCos, { a: 2 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/parameter 'b' is unbound/);
  });

  it("refuses a parameter bound to a variant flag", () => {
    const r = contourIntegrandOf(a1CircleLinearCos, { a: 2, b: true });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/not a number/);
  });
});
