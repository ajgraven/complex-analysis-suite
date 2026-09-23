import { describe, it, expect } from "vitest";
import { compileAlphabet } from "../src/engine/alphabet";
import type { Alphabet } from "../src/engine/alphabet";
import { dragonBounds, dragonPlan, dragonSet } from "../src/engine/dragon";
import type { DragonPlan, TheoremOverlay } from "../src/engine/dragon";
import { cloudAlpha, inkStats, insetDescription, insetLayout, paintDragon, theoremDescription, toCanvas } from "../src/stage/inset";

const A = (preset: string): Alphabet => {
  const r = compileAlphabet({ preset } as never);
  if ("error" in r) throw new Error(r.error);
  return r.alphabet;
};
const LITTLEWOOD = A("littlewood");

describe("the inset's arithmetic", () => {
  it("fits a box into the frame keeping ONE scale, and centres the box", () => {
    // One scale for both axes, because the dragon is a self-affine set: stretching it to fill the frame
    // would draw a different set. The box is centred rather than the origin, so a cloud that sits in one
    // quadrant still uses the whole frame (Contour Integration's accumulator, same finding).
    const layout = insetLayout([-2, -1, 2, 1], 200, 200, 10);
    expect(layout.scale).toBe(45); // 180/4, the binding axis
    const lo = toCanvas(layout, -2, -1);
    const hi = toCanvas(layout, 2, 1);
    expect(lo.x).toBeCloseTo(10, 9);
    expect(hi.x).toBeCloseTo(190, 9);
    // Screen y is DOWN: the top of the box is the smaller y.
    expect(hi.y).toBeCloseTo(55, 9);
    expect(lo.y).toBeCloseTo(145, 9);
    // The box's centre lands on the frame's centre, not the origin.
    const c = toCanvas(insetLayout([1, 1, 3, 3], 200, 200, 10), 2, 2);
    expect(c.x).toBeCloseTo(100, 9);
    expect(c.y).toBeCloseTo(100, 9);
  });

  it("gives a degenerate box a unit scale rather than an infinite one", () => {
    const layout = insetLayout([1, 1, 1, 1], 100, 100);
    expect(layout.scale).toBe(1);
    expect(Number.isFinite(layout.ox)).toBe(true);
    const p = toCanvas(layout, 1, 1);
    expect(p.x).toBeCloseTo(50, 9);
    expect(p.y).toBeCloseTo(50, 9);
  });

  it("rasterises a real dragon across the frame, not onto one pixel", () => {
    // The layout is the part a test can be wrong about, so it is checked with no canvas at all: fit the
    // cloud's own bounds, paint, and require the ink to be SPREAD. A wrong sign, a swapped axis or a
    // scale off by the aspect all collapse this.
    const z = { re: 0.375453, im: 0.544825 };
    const plan = dragonPlan(LITTLEWOOD, z, 0.01);
    const points = dragonSet(LITTLEWOOD, z, plan.depth);
    const layout = insetLayout(dragonBounds(points), 200, 200);
    const hits = paintDragon(points, layout);
    const { lit, peak } = inkStats(hits);
    expect(points.length / 2).toBe(plan.points);
    expect(lit).toBeGreaterThan(1500);
    expect(peak).toBeGreaterThan(1);
    // Nothing escapes the frame: the bounds were the cloud's own.
    let inside = 0;
    for (const h of hits) inside += h;
    expect(inside).toBe(points.length / 2);
    // And the frame is USED along the BINDING axis — the other one is centred with slack, which is what
    // keeping one scale means. Requiring ink on all four sides would demand the cloud be square.
    const w = layout.width;
    const col = (x: number): number => {
      let n = 0;
      for (let y = 0; y < layout.height; y++) n += hits[y * w + x];
      return n;
    };
    const row = (y: number): number => {
      let n = 0;
      for (let x = 0; x < w; x++) n += hits[y * w + x];
      return n;
    };
    const [x0, y0, x1, y1] = dragonBounds(points);
    const horizontal = x1 - x0 >= y1 - y0;
    expect(horizontal).toBe(true); // this dragon is wider than it is tall
    expect(col(6) + col(7)).toBeGreaterThan(0);
    expect(col(192) + col(193)).toBeGreaterThan(0);
    // The slack axis is centred: the top and bottom rows are empty and the middle is not.
    expect(row(6) + row(193)).toBe(0);
    expect(row(Math.floor(layout.height / 2))).toBeGreaterThan(0);
  });

  it("drops a point outside the frame instead of WRAPPING it onto the next row", () => {
    // The `x >= width` half of the bounds test is the one a far-away point cannot exercise: a huge index
    // falls off the end of the typed array and is dropped for free. What needs it is a point just past
    // the RIGHT edge, whose index `y·width + x` is a perfectly valid pixel one row down — so removing
    // the check does not lose ink, it MOVES it, which is worse.
    const layout = insetLayout([-1, -1, 1, 1], 20, 20, 0);
    expect(inkStats(paintDragon(new Float64Array([0, 0, 50, 50, -50, -50]), layout)).lit).toBe(1);
    const justPast = toCanvas(layout, 0, 0);
    const wrapped = paintDragon(new Float64Array([(20 - justPast.x + 1) / layout.scale, 0]), layout);
    expect(inkStats(wrapped).lit).toBe(0);
  });

  it("the cloud's coverage RAMPS with the count, so the picture carries its density", () => {
    // A constant would paint a flat silhouette: the frame would then carry two colours whatever the
    // cloud did, and the browser suite's "one colour per distinct count" would be meaningless.
    expect(cloudAlpha(0)).toBe(0);
    expect(cloudAlpha(1)).toBeCloseTo(0.4, 9);
    expect(cloudAlpha(9)).toBeCloseTo(0.24 + 0.16 * Math.log2(10), 9);
    // Strictly increasing until it SATURATES, which measurement puts at 26 hits — `0.24 + 0.16·log2(27)`
    // is the first value past 1. The inset's own busiest pixel at Baez's point is 9, so the flat top is
    // never reached there; a coarser frame or a denser cloud would reach it, and then the picture stops
    // distinguishing densities rather than stops drawing.
    for (let n = 1; n < 25; n++) expect(cloudAlpha(n + 1), String(n)).toBeGreaterThan(cloudAlpha(n));
    expect(cloudAlpha(25)).toBeLessThan(1);
    expect(cloudAlpha(26)).toBe(1);
    expect(cloudAlpha(1e9)).toBe(1);
  });
});

describe("the inset's generated description", () => {
  const plan = (over: Partial<DragonPlan>): DragonPlan => ({
    depth: 12,
    points: 8192,
    tail: 1e-3,
    resolved: true,
    capped: false,
    contracts: true,
    ...over,
  });

  it("says there is no attractor at all when |z| ≥ 1", () => {
    const text = insetDescription({ re: 0.9, im: 0.6 }, plan({ contracts: false, depth: -1 }), null);
    expect(text).toContain("no attractor");
    expect(text).toContain("expand");
    expect(text).not.toContain("origin");
  });

  it("distinguishes a RESOLVED cloud from one the budget stopped", () => {
    expect(insetDescription({ re: 0.4, im: 0.4 }, plan({}), null)).toContain("finer than a pixel");
    const capped = insetDescription({ re: 0.9, im: 0.1 }, plan({ resolved: false, capped: true, tail: 1.46 }), null);
    expect(capped).toContain("budget");
    expect(capped).toContain("coarse picture and not a finished one");
    expect(capped).not.toContain("finer than a pixel");
  });

  it("carries Bousch's sentence BOTH ways, and omits it when it was not asked", () => {
    const yes = insetDescription({ re: 0.4, im: 0.4 }, plan({}), true);
    expect(yes).toContain("inside the cloud");
    expect(yes).toContain("in the limit set");
    const no = insetDescription({ re: 0.4, im: 0.4 }, plan({}), false);
    expect(no).toContain("outside the cloud");
    expect(no).toContain("no power series");
    expect(insetDescription({ re: 0.4, im: 0.4 }, plan({}), null)).not.toContain("origin");
  });

  it("prints the point with a sign a reader can read", () => {
    expect(insetDescription({ re: 0.5, im: -0.25 }, plan({}), null)).toContain("0.500000 − 0.250000i");
    expect(insetDescription({ re: 0.5, im: 0.25 }, plan({}), null)).toContain("0.500000 + 0.250000i");
  });
});

describe("theorem mode's sentence is honestly labelled", () => {
  const overlay = (over: Partial<TheoremOverlay> = {}): TheoremOverlay => ({
    predicted: new Float64Array([0, 0]),
    actual: new Float64Array([0, 0]),
    worst: 4.1e-5,
    radius: 0.55,
    kappa: 3.86,
    degree: 30,
    magnification: 2.83e-6,
    noise: 3.5e-11,
    ...over,
  });

  it("calls itself an illustration and never an equality", () => {
    // ADR-0046 decision 7: a cited theorem may be stated as a theorem, but nothing about the IMAGE may
    // read as certified. The sentence names the paper and reports a measured distance.
    const text = theoremDescription(overlay(), 0.005);
    expect(text).toContain("illustration of Michelen–Yakir Theorem 1, not a certificate");
    expect(text).not.toMatch(/(?:^|[^≈≤])=\s/);
    // Even κ is `≈`: it is a float64 evaluation of P′ at a numerically polished root, so writing it
    // with an `=` would be the one literal equality on a surface that has none.
    expect(text).toContain("|P′(α)| ≈ 3.860");
  });

  it("says the overlay LANDS in units of the inset's own pixel", () => {
    expect(theoremDescription(overlay(), 0.005)).toContain("within 0.0082 of an inset pixel");
    expect(theoremDescription(overlay({ worst: 0.2 }), 0.005)).toContain("miss their predicted points by up to 0.200");
  });

  it("flags a weak hypothesis rather than drawing a confident picture", () => {
    expect(theoremDescription(overlay({ kappa: 0.01 }), 0.005)).toContain("hypothesis is weak");
    expect(theoremDescription(overlay(), 0.005)).not.toContain("hypothesis is weak");
  });
});
