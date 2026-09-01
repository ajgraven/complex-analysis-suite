import { describe, it, expect } from "vitest";
import { fitLogLightning } from "../src/logLightning.js";
import { diskDomain, ellipseDomain, polygonDomain, greenCurve } from "../src/potentialDomain.js";
import type { Pt } from "@cas/flow";

/** ∂K samples (an open loop — drop greenCurve's closing duplicate). */
const boundaryOf = (d: Parameters<typeof greenCurve>[0], n = 240): Pt[] => greenCurve(d, 0, n).slice(0, n);
const circle = (cx: number, cy: number, r: number, n = 240): Pt[] =>
  Array.from({ length: n }, (_, k): Pt => {
    const t = (2 * Math.PI * k) / n;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  });

// The numerical method reproduces the KNOWN capacities of the closed-form conductors (plan §7) — the
// strongest self-consistency check that log-lightning is right.
describe("log-lightning capacity vs the exact goldens", () => {
  it("the disk (cap = r)", () => {
    expect(fitLogLightning(boundaryOf(diskDomain(1.2))).capacity).toBeCloseTo(1.2, 3);
  });
  it("the ellipse (cap = (a+b)/2)", () => {
    expect(fitLogLightning(boundaryOf(ellipseDomain(2, 1))).capacity).toBeCloseTo(1.5, 3);
  });
  it("an OFF-centre disk (cap = r, translation-invariant)", () => {
    expect(fitLogLightning(circle(0.5, -0.3, 1)).capacity).toBeCloseTo(1, 3);
  });
  it("the square via its SC boundary (cap = 1.1803…)", () => {
    const sq: Pt[] = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
    expect(fitLogLightning(boundaryOf(polygonDomain("sq", "sq", sq))).capacity).toBeCloseTo(1.1803406, 2);
  });
});

describe("Green's function from log-lightning", () => {
  it("vanishes on ∂K (the conductor is grounded)", () => {
    const f = fitLogLightning(circle(0, 0, 1.3));
    for (const w of circle(0, 0, 1.3, 24)) expect(f.greenFn(w)).toBeCloseTo(0, 2);
    expect(f.residual).toBeLessThan(1e-2);
  });
  it("has the far-field g_K(z) ~ log|z| − log cap", () => {
    const r = 1.2;
    const f = fitLogLightning(circle(0, 0, r));
    for (const R of [30, 80, 200]) {
      expect(f.greenFn([R, 0])).toBeCloseTo(Math.log(R) - Math.log(r), 2);
    }
  });
});

describe("equilibrium charge density", () => {
  it("is ≈ uniform around a disk", () => {
    const f = fitLogLightning(circle(0, 0, 1));
    const d = circle(0, 0, 1, 40).map((w) => f.chargeDensity(w));
    const mean = d.reduce((s, x) => s + x, 0) / d.length;
    for (const x of d) expect(Math.abs(x - mean) / mean).toBeLessThan(0.05); // within 5%
  });
});
