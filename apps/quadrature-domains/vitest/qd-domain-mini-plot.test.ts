// domainPlotData — the pure geometry helper that turns a reconstructed bounded-QD φ into
// SVG-ready boundary/node points for the Algebra verdict's domain thumbnail (roadmap #3).
// Driven with the app's real QD.evalPhi on the cardioid map φ = t + ½t².
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";
import "../app/workers/solver-graph.mjs"; // registers the QD families (boundedQD) so QD.evalPhi resolves headlessly
import { domainPlotData, momentPlotData, rationalPlotData, trianglePlotData } from "../app/algebra/domain-mini-plot.mjs";

const evalPhi = (_QD as any).evalPhi;
const cardioid = { unbounded: false, family: "boundedQD", w0: { re: 0, im: 0 }, branches: [{ z: { re: 0, im: 0 }, A: [{ re: 1, im: 0 }, { re: 0.5, im: 0 }] }] };

describe("domainPlotData — reconstructed-domain thumbnail geometry", () => {
  it("samples the cardioid boundary + node into finite SVG-ready data", () => {
    expect(typeof evalPhi).toBe("function");
    const d: any = domainPlotData(cardioid, evalPhi, { samples: 120 });
    expect(d).not.toBeNull();
    expect(d.boundary.length).toBe(120);
    expect(d.boundary.every((p: number[]) => p.length === 2 && p.every((c) => Number.isFinite(c)))).toBe(true);
    expect(d.nodes.length).toBe(1); // one pole ⇒ one quadrature node
    expect(d.view.length).toBe(4);
    expect(d.view.every((c: number) => Number.isFinite(c))).toBe(true);
    expect(d.view[2]).toBeGreaterThan(0); // width
    expect(d.view[3]).toBeGreaterThan(0); // height
    // the boundary bounding box lies within the padded view (both axes)
    const xs = d.boundary.map((p: number[]) => p[0]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(d.view[0] - 1e-9);
    expect(Math.max(...xs)).toBeLessThanOrEqual(d.view[0] + d.view[2] + 1e-9);
    const ys = d.boundary.map((p: number[]) => p[1]);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(d.view[1] - 1e-9);
    expect(Math.max(...ys)).toBeLessThanOrEqual(d.view[1] + d.view[3] + 1e-9);
  });

  it("returns null for a non-QD map / missing evaluator", () => {
    expect(domainPlotData({ w0: { re: 0, im: 0 } } as any, evalPhi)).toBeNull(); // no branches array
    expect(domainPlotData(cardioid, null as any)).toBeNull();
    expect(domainPlotData(null as any, evalPhi)).toBeNull();
  });
});

describe("momentPlotData — moment-route polynomial φ = a + Σ wₖzᵏ thumbnail (C1-ext-B)", () => {
  it("cardioid φ = z + ½z² samples to the known cardioid geometry", () => {
    const d: any = momentPlotData([null, 1, { re: 0.5, im: 0 }], 2, { re: 0, im: 0 }, { samples: 240 });
    expect(d).not.toBeNull();
    expect(d.boundary.length).toBe(240);
    expect(d.boundary.every((p: number[]) => p.length === 2 && p.every((c) => Number.isFinite(c)))).toBe(true);
    // θ=0 → 1 + 0.5 = 1.5 (the nose); θ=π → −1 + 0.5 = −0.5 (the cusp) — SVG y-down, im=0 either way
    expect(d.boundary[0][0]).toBeCloseTo(1.5, 6); expect(d.boundary[0][1]).toBeCloseTo(0, 6);
    expect(d.boundary[120][0]).toBeCloseTo(-0.5, 6); expect(d.boundary[120][1]).toBeCloseTo(0, 6);
    expect(d.nodes).toEqual([[0, 0]]);   // node a = φ(0) = 0
  });

  it("φ = z (bare-number w₁) is the unit circle, translated by the node a = φ(0)", () => {
    // at the origin: the unit circle, node at 0, w₁ supplied as a bare number
    const o: any = momentPlotData([null, 1], 1, { re: 0, im: 0 }, { samples: 64 });
    expect(o.nodes).toEqual([[0, 0]]);
    expect(o.boundary[0][0]).toBeCloseTo(1, 9);   // θ=0 → (1,0)
    expect(o.boundary.every((p: number[]) => Math.abs(Math.hypot(p[0], p[1]) - 1) < 1e-9)).toBe(true);
    // translated by a = (2,1): node + whole circle shift, SVG y-down so (2,1) → (2,−1)
    const t: any = momentPlotData([null, 1], 1, { re: 2, im: 1 }, { samples: 64 });
    expect(t.nodes).toEqual([[2, -1]]);
    expect(t.boundary[0][0]).toBeCloseTo(3, 9); expect(t.boundary[0][1]).toBeCloseTo(-1, 9);   // a + (1,0)
    expect(t.boundary.every((p: number[]) => Math.abs(Math.hypot(p[0] - 2, p[1] + 1) - 1) < 1e-9)).toBe(true);
  });

  it("agrees with the app's QD.evalPhi route on the cardioid (coefficients ≡ evaluator)", () => {
    const viaEval: any = domainPlotData(cardioid, evalPhi, { samples: 120 });
    const viaCoef: any = momentPlotData([null, 1, { re: 0.5, im: 0 }], 2, { re: 0, im: 0 }, { samples: 120 });
    let maxd = 0;
    for (let k = 0; k < 120; k++) maxd = Math.max(maxd, Math.hypot(viaEval.boundary[k][0] - viaCoef.boundary[k][0], viaEval.boundary[k][1] - viaCoef.boundary[k][1]));
    expect(maxd).toBeLessThan(1e-9);
  });

  it("returns null on bad input or a non-finite sample", () => {
    expect(momentPlotData(null as any, 2, { re: 0, im: 0 })).toBeNull();
    expect(momentPlotData([null, 1], 0, { re: 0, im: 0 })).toBeNull();
    expect(momentPlotData([null, Infinity], 1, { re: 0, im: 0 })).toBeNull();   // non-finite coefficient ⇒ null sample
  });
});

describe("rationalPlotData — multi-node rational φ = w0 + R(z+dz²)/(1−cz²) thumbnail (C2-4)", () => {
  const m = { c: 0.25, d: 0.25, R: 1, w0: 0 };   // the asymmetric ground-truth shape
  const nodes = [{ re: 3 / 5, im: 0 }, { re: -7 / 15, im: 0 }];

  it("samples a finite closed boundary; φ(1) = w0 + R(1+d)/(1−c) = 5/3", () => {
    const d: any = rationalPlotData(m, nodes, { samples: 240 });
    expect(d).not.toBeNull();
    expect(d.boundary.length).toBe(240);
    expect(d.boundary.every((p: number[]) => p.length === 2 && p.every((cc) => Number.isFinite(cc)))).toBe(true);
    expect(d.boundary[0][0]).toBeCloseTo(5 / 3, 6);   // θ=0 → (1.25)/(0.75)
    expect(d.boundary[0][1]).toBeCloseTo(0, 6);
  });

  it("marks the two quadrature nodes (SVG y-flipped)", () => {
    const d: any = rationalPlotData(m, nodes, { samples: 64 });
    expect(d.nodes).toEqual([[3 / 5, 0], [-7 / 15, 0]]);
  });

  it("returns null when a pole is inside 𝔻̄ (c ≥ 1), a pole grazes ∂𝔻, or on bad input", () => {
    expect(rationalPlotData({ c: 1.5, d: 0, R: 1, w0: 0 }, nodes)).toBeNull();
    expect(rationalPlotData({ c: 1 - 1e-8, d: 0, R: 1, w0: 0 }, nodes)).toBeNull();   // pole grazes ∂𝔻 at θ=0 (den→0)
    expect(rationalPlotData(null as any, nodes)).toBeNull();
    expect(rationalPlotData({ d: 0, R: 1, w0: 0 } as any, nodes)).toBeNull();   // no c
  });
});

describe("trianglePlotData — equilateral rational φ = R·z/(1−cz³) thumbnail (C3-4)", () => {
  const W = 0.8660254037844386;
  const m = { c: 0.125, R: 63 / 32 };   // the c=⅛ ground-truth shape
  const triNodes = [{ re: 1, im: 0 }, { re: -0.5, im: W }, { re: -0.5, im: -W }];

  it("samples a finite closed boundary; φ(1) = R/(1−c) = 9/4", () => {
    const d: any = trianglePlotData(m, triNodes, { samples: 240 });
    expect(d).not.toBeNull();
    expect(d.boundary.length).toBe(240);
    expect(d.boundary.every((p: number[]) => p.every((cc) => Number.isFinite(cc)))).toBe(true);
    expect(d.boundary[0][0]).toBeCloseTo(2.25, 6);   // θ=0 → R/(1−c) = (63/32)/(7/8) = 9/4
    expect(d.boundary[0][1]).toBeCloseTo(0, 6);
  });

  it("marks the three quadrature nodes", () => {
    const d: any = trianglePlotData(m, triNodes, { samples: 96 });
    expect(d.nodes.length).toBe(3);
  });

  it("returns null when a pole is inside 𝔻̄ (|c| ≥ 1), a pole grazes ∂𝔻, or on bad input", () => {
    expect(trianglePlotData({ c: 1.2, R: 1 }, triNodes)).toBeNull();
    expect(trianglePlotData({ c: 1 - 1e-8, R: 1 }, triNodes)).toBeNull();   // pole grazes ∂𝔻 at θ=0 (den→0)
    expect(trianglePlotData(null as any, triNodes)).toBeNull();
    expect(trianglePlotData({ R: 1 } as any, triNodes)).toBeNull();   // no c
  });
});
