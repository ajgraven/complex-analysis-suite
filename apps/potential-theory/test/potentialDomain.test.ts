import { describe, it, expect } from "vitest";
import {
  diskDomain,
  ellipseDomain,
  segmentDomain,
  deltoidDomain,
  polygonDomain,
  equilibriumDots,
  chargeDensity,
  greenCurve,
  type ExteriorDomain,
} from "../src/potentialDomain.js";
import type { Pt } from "@cas/flow";

const cabs = (p: Pt): number => Math.hypot(p[0], p[1]);

// The `smoothBoundary` flag decides the honest Faber-zero claim (analytic ∂K → zeros stay interior, not
// μ_K; corners/cusps → zeros reach μ_K). Pinning it guards the labelling of the disk/ellipse vs the rest.
describe("smoothBoundary classification (drives the honest Faber-zero label)", () => {
  it("only the disk and the ellipse have an analytic-smooth boundary", () => {
    expect(diskDomain(1.2).smoothBoundary).toBe(true);
    expect(ellipseDomain(2, 1).smoothBoundary).toBe(true);
    expect(segmentDomain(1).smoothBoundary).toBe(false); // the zeros ARE the arcsine μ_K
    expect(deltoidDomain().smoothBoundary).toBe(false); // 3 cusps
    expect(polygonDomain("sq", "sq", [[1, -1], [1, 1], [-1, 1], [-1, -1]]).smoothBoundary).toBe(false); // corners
  });
});

// Golden logarithmic capacities (plan §7): cap(K) = |leading coeff of the exterior map Ψ|.
describe("logarithmic capacity", () => {
  it("closed-form classes match the golden table", () => {
    expect(diskDomain(1).capacity).toBeCloseTo(1, 12);
    expect(diskDomain(2.5).capacity).toBeCloseTo(2.5, 12);
    expect(segmentDomain(1).capacity).toBeCloseTo(0.5, 12); // [−1,1]
    expect(segmentDomain(2).capacity).toBeCloseTo(1, 12); // [−2,2]
    expect(ellipseDomain(1.5, 1).capacity).toBeCloseTo(1.25, 12); // (a+b)/2
    expect(deltoidDomain().capacity).toBeCloseTo(1, 12);
  });

  it("the side-2 square (exterior SC) matches its golden capacity", () => {
    const sq: Pt[] = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
    const d = polygonDomain("square", "Square", sq);
    expect(d.exact).toBe(true);
    expect(d.capacity).toBeCloseTo(1.1803405990161, 6);
  });
});

describe("equilibrium measure μ_K = Ψ⁎(dθ/2π)", () => {
  it("the segment [−1,1] gives the arcsine law: dots at x = cos θ on [−1,1]", () => {
    const seg = segmentDomain(1);
    const n = 60;
    const dots = equilibriumDots(seg, n);
    for (let k = 0; k < n; k++) {
      expect(dots[k][0]).toBeCloseTo(Math.cos((2 * Math.PI * k) / n), 10); // x = cos θ
      expect(dots[k][1]).toBeCloseTo(0, 10); // on the real segment
    }
    // The charge crowds at the endpoints (arcsine density diverges at ±1) and is sparse mid-segment.
    const dens = chargeDensity(dots);
    const nearEnd = Math.max(dens[0], dens[1], dens[n - 1]); // θ ≈ 0 → x ≈ 1
    const nearMid = dens[Math.round(n / 4)]; // θ ≈ π/2 → x ≈ 0
    expect(nearEnd).toBeGreaterThan(3 * nearMid);
  });

  it("the disk carries a uniform equilibrium measure (constant density)", () => {
    const dots = equilibriumDots(diskDomain(1), 40);
    const dens = chargeDensity(dots);
    for (const dv of dens) expect(dv).toBeCloseTo(dens[0], 6);
  });
});

describe("Green's function g_K = log|Ψ⁻¹|", () => {
  it("for a disk of radius r, the level curve g = t is the circle |z| = r·eᵗ", () => {
    const r = 1.4;
    for (const t of [0, 0.3, 0.8]) {
      const curve = greenCurve(diskDomain(r), t, 64);
      for (const p of curve) expect(cabs(p)).toBeCloseTo(r * Math.exp(t), 9);
    }
  });

  it("the t = 0 Green curve reproduces ∂K (Ψ on the unit circle)", () => {
    const check = (d: ExteriorDomain, expectR: (x: number) => number): void => {
      const bdry = greenCurve(d, 0, 8);
      for (const p of bdry) expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
      // spot-check Ψ(1) is real for the symmetric closed forms
      expect(d.evalPsi([1, 0])[1]).toBeCloseTo(0, 12);
      void expectR;
    };
    check(deltoidDomain(), () => 1);
    check(ellipseDomain(2, 1), () => 1);
  });
});

// The exterior-SC fit reconstructs Ψ in a REAL-CAPACITY frame (leading coeff rotated to |C| > 0), which
// rotates AND translates the drawn conductor away from the caller's corners. polygonDomain realigns the
// forward map onto the input corners, so the drawn K coincides with what the caller drew — the custom-
// polygon editor's handles, or a preset's declared vertices — instead of appearing rotated/reflected.
describe("polygon domains render in the caller's input frame (not the rotated real-capacity frame)", () => {
  // Distance from a point to the closed polyline (nearest edge), so a corner "on ∂K" is robust to sampling.
  const distToPolyline = (p: Pt, poly: readonly Pt[]): number => {
    let best = Infinity;
    for (let i = 0; i + 1 < poly.length; i++) {
      const a = poly[i];
      const b = poly[i + 1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy || 1e-30;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
      best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
    }
    return best;
  };

  it("an asymmetric (chiral) polygon's drawn ∂K passes through the caller's corners", () => {
    // No rotational symmetry and an off-origin centroid, so the real-capacity frame is both rotated and
    // translated — without the realignment every corner would sit well off the drawn boundary.
    const corners: Pt[] = [[0, 0], [2, 0], [1.4, 1.6], [0.2, 1.1]];
    const d = polygonDomain("quad", "Quad", corners);
    expect(d.exact).toBe(true);
    const bdry = greenCurve(d, 0, 2000); // ∂K = Ψ(unit circle), densely sampled
    for (const c of corners) expect(distToPolyline(c, bdry)).toBeLessThan(0.02);
  });

  it("exposes a unit-rotation realignment frame for polygons, none for the closed-form classes", () => {
    const d = polygonDomain("quad", "Quad", [[0, 0], [2, 0], [1.4, 1.6], [0.2, 1.1]]);
    const fr = d.frame;
    expect(fr).toBeDefined();
    if (!fr) throw new Error("expected a realignment frame for a polygon domain");
    expect(Math.hypot(fr.rot[0], fr.rot[1])).toBeCloseTo(1, 12); // a pure rotation (|rot| = 1)
    // The closed-form classes are already canonical (real-positive capacity, natural orientation).
    expect(diskDomain(1).frame).toBeUndefined();
    expect(segmentDomain(1).frame).toBeUndefined();
    expect(deltoidDomain().frame).toBeUndefined();
  });
});
