import { describe, it, expect } from "vitest";
import { bulbRoot, fareyLabels, fareyMaxDenominator } from "../src/render/farey";
import type { Vec2 } from "../src/arrays";

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

// The naive O(maxQ²) enumeration the descent replaces: every reduced p/q with 2 ≤ q ≤ maxQ whose
// attachment lands within the (margin-expanded) view. The Stern–Brocot descent must reproduce this
// set exactly — it only changes *how* the visible bulbs are found, not *which*.
function bruteForceFarey(center: Vec2, zoom: number, maxQ: number): Set<string> {
  const half = 1 / zoom;
  const set = new Set<string>();
  for (let q = 2; q <= maxQ; q++) {
    for (let p = 1; p < q; p++) {
      if (gcd(p, q) !== 1) continue;
      const { c } = bulbRoot(p, q);
      if (Math.abs(c[0] - center[0]) <= half * 1.15 && Math.abs(c[1] - center[1]) <= half * 1.15)
        set.add(`${p}/${q}`);
    }
  }
  return set;
}

describe("bulbRoot", () => {
  it("1/2 bulb attaches at the period-2 neck c = -3/4", () => {
    const { c } = bulbRoot(1, 2);
    expect(c[0]).toBeCloseTo(-0.75, 10);
    expect(c[1]).toBeCloseTo(0, 10);
  });

  it("1/3 and 2/3 bulbs are complex conjugates", () => {
    const a = bulbRoot(1, 3).c;
    const b = bulbRoot(2, 3).c;
    expect(b[0]).toBeCloseTo(a[0], 10);
    expect(b[1]).toBeCloseTo(-a[1], 10);
    expect(a[1]).toBeGreaterThan(0); // 1/3 is the upper bulb
  });

  it("1/3 attachment matches μ/2 − μ²/4 at μ = e^{2πi/3}", () => {
    const { c } = bulbRoot(1, 3);
    expect(c[0]).toBeCloseTo(-0.125, 10);
    expect(c[1]).toBeCloseTo((3 * Math.sqrt(3)) / 8, 10);
  });
});

describe("fareyLabels", () => {
  it("includes 1/2, 1/3, 2/3 for the whole-cardioid view and culls off-screen bulbs", () => {
    const labels = fareyLabels([-0.5, 0], 0.75, 6);
    const texts = labels.map((l) => l.text);
    expect(texts).toContain("1/2");
    expect(texts).toContain("1/3");
    expect(texts).toContain("2/3");
  });

  it("view-culls: a tiny window around the 1/2 neck excludes the 1/3 bulb", () => {
    const labels = fareyLabels([-0.75, 0], 200, 8);
    const texts = labels.map((l) => l.text);
    expect(texts).toContain("1/2");
    expect(texts).not.toContain("1/3");
  });

  it("reproduces the brute-force visible set exactly (shallow: the plain-sweep path)", () => {
    // A spread of views: whole cardioid, zoomed at the 1/3 bulb, at the 1/2 neck, and at the cusp.
    const cases: [Vec2, number, number][] = [
      [[-0.5, 0], 0.6, 12],
      [[-0.125, 0.6495], 8, 20],
      [[-0.75, 0], 50, 25],
      [[0.25, 0], 40, 30],
      [[-0.5, 0], 3, 16],
    ];
    for (const [center, zoom, maxQ] of cases) {
      const got = new Set(fareyLabels(center, zoom, maxQ).map((l) => l.text));
      expect(got).toEqual(bruteForceFarey(center, zoom, maxQ));
    }
  });

  it("reproduces the brute-force visible set exactly (deep: the visible-arc path, maxQ > 200)", () => {
    // maxQ > 200 forces the visible-arc enumeration. Cover the hard spots: the cusp (θ ≈ 0, where a
    // from-root tree walk degenerates), a bulb centre, a fine off-lattice boundary point, an
    // interior view and a sea view (both must be empty).
    const cases: [Vec2, number, number][] = [
      [[0.25, 0], 3000, 210], // cusp (maxQ kept so the visible count stays under the emit cap)
      [bulbRoot(2, 5).c, 4000, 400], // centred on the 2/5 bulb
      [bulbRoot(7, 23).c, 4000, 400], // a fine boundary point between low bulbs
      [[-0.75, 0], 5000, 450], // the 1/2 neck, deep
      [[-0.2, 0], 3000, 350], // inside the main cardioid → nothing on the boundary is in view
      [[1.0, 1.0], 3000, 350], // far out in the sea → empty
    ];
    for (const [center, zoom, maxQ] of cases) {
      const got = new Set(fareyLabels(center, zoom, maxQ).map((l) => l.text));
      expect(got).toEqual(bruteForceFarey(center, zoom, maxQ));
    }
  });

  it("returns bulbs largest-first (ascending denominator) for greedy collision culling", () => {
    const labels = fareyLabels([-0.5, 0], 0.6, 20);
    expect(labels.length).toBeGreaterThan(3);
    for (let i = 1; i < labels.length; i++) expect(labels[i].q).toBeGreaterThanOrEqual(labels[i - 1].q);
    expect(labels[0].text).toBe("1/2"); // the biggest bulb is first
  });

  it("labels fine bulbs (q > 16) once zoomed in — the old fixed cap could not", () => {
    // 7/22 is a genuine primary bulb with denominator past the old maxQ = 16 ceiling. zoom 5000 puts
    // maxQ > 200, so this also exercises the deep visible-arc path.
    const c0 = bulbRoot(7, 22).c;
    const maxQ = fareyMaxDenominator(5000, 500);
    expect(maxQ).toBeGreaterThan(200);
    const labels = fareyLabels(c0, 5000, maxQ);
    const texts = labels.map((l) => l.text);
    expect(texts).toContain("7/22");
    expect(labels.some((l) => l.q > 16)).toBe(true);
  });

  it("stays bounded at extreme zoom near the cusp (no O(maxQ²) blow-up)", () => {
    // Deep zoom into the cusp is the pathological case (∝ √zoom bulbs crowd in); the result must
    // still be a small, sorted, finite list rather than hang.
    const labels = fareyLabels([0.25, 0], 1e7, fareyMaxDenominator(1e7, 500));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThanOrEqual(400);
    for (let i = 1; i < labels.length; i++) expect(labels[i].q).toBeGreaterThanOrEqual(labels[i - 1].q);
  });
});

describe("fareyMaxDenominator", () => {
  it("keeps the familiar handful of bulbs at the default full-cardioid view", () => {
    expect(fareyMaxDenominator(0.75, 500)).toBe(5);
    expect(fareyMaxDenominator(1, 500)).toBe(5);
  });

  it("grows like √zoom, so a 4× zoom roughly doubles the resolvable denominator", () => {
    const a = fareyMaxDenominator(1e4, 500);
    const b = fareyMaxDenominator(4e4, 500);
    expect(b / a).toBeCloseTo(2, 1);
    expect(fareyMaxDenominator(1e6, 500)).toBeGreaterThan(fareyMaxDenominator(1e4, 500));
  });

  it("clamps to [4, cap]", () => {
    expect(fareyMaxDenominator(1e-9, 500)).toBe(4); // floor of a tiny √ is below the 4 minimum
    expect(fareyMaxDenominator(1e40, 500)).toBe(300_000); // extreme zoom, clamped to the cap
  });
});
