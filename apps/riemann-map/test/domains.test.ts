import { describe, expect, it } from "vitest";
import {
  DOMAIN_PRESETS,
  domainById,
  sampleDomainBoundary,
  conformalSourceGrid,
  cornerBoundary,
  cornerPoles,
  pointInPolygon,
  polygonNonSimpleReason,
  type C,
} from "../src/domains.js";
import { fitSmoothConformalMap, fitConformalMap, fitSchwarzChristoffel } from "@cas/conformal";

/** Winding number of a closed polyline about the origin (÷2π); ≈1 ⇒ 0 is enclosed. */
function windingAboutOrigin(poly: readonly C[]): number {
  let total = 0;
  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    total += Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
  }
  return total / (2 * Math.PI);
}

describe("preset domains + conformal source grid (P3b)", () => {
  it("every preset is star-shaped about 0 (positive radius) and encloses the origin", () => {
    for (const d of DOMAIN_PRESETS) {
      for (let k = 0; k < 64; k++) {
        expect(d.radius((2 * Math.PI * k) / 64)).toBeGreaterThan(0);
      }
      const boundary = [...sampleDomainBoundary(d, 200), sampleDomainBoundary(d, 200)[0]];
      expect(windingAboutOrigin(boundary)).toBeCloseTo(1, 6);
    }
  });

  it("conformalSourceGrid returns the requested spokes/rings, all finite", () => {
    const blob = domainById("blob");
    expect(blob).toBeDefined();
    if (!blob) return;
    const g = conformalSourceGrid(blob, 12, 5, 80);
    expect(g.spokes.length).toBe(12);
    expect(g.rings.length).toBe(5);
    for (const line of [g.boundary, ...g.spokes, ...g.rings]) {
      for (const p of line) expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
    }
  });

  it("the fitted map sends every smooth preset boundary onto the unit circle to good accuracy", () => {
    for (const d of DOMAIN_PRESETS.filter((p) => !p.corners)) {
      const bdry = sampleDomainBoundary(d, 500);
      const map = fitSmoothConformalMap(bdry, 50);
      // Sub-1% boundary residual on every smooth preset (the wavy blob is the loosest).
      expect(map.boundaryResidual, `${d.id} residual`).toBeLessThan(1e-2);
      // A ring interior to Ω maps strictly inside the disk.
      const ring = conformalSourceGrid(d, 4, 3, 40).rings[0];
      for (const p of ring) expect(Math.hypot(...map.eval(p))).toBeLessThan(1);
    }
  });

  it("clustered corner poles all sit OUTSIDE the polygon", () => {
    const sq = domainById("square");
    expect(sq?.corners).toBeDefined();
    if (!sq?.corners) return;
    const poles = cornerPoles(sq.corners, 16, 4);
    expect(poles.length).toBe(16 * sq.corners.length);
    for (const b of poles) expect(pointInPolygon(b, sq.corners)).toBe(false);
  });

  it("corner poles resolve the square's corner singularity that a polynomial alone cannot", () => {
    const sq = domainById("square");
    if (!sq?.corners) throw new Error("square must be a polygon preset");
    const bdry = cornerBoundary(sq.corners, 110);
    const poly = fitConformalMap(bdry, 24, []); // polynomial only — corners unresolved
    const lightning = fitConformalMap(bdry, 24, cornerPoles(sq.corners, 16, 4)); // + clustered poles
    expect(lightning.boundaryResidual).toBeLessThan(poly.boundaryResidual / 5); // poles help a lot
    expect(lightning.boundaryResidual, "square lightning residual").toBeLessThan(1e-2);
    expect(Math.hypot(...lightning.eval([0, 0]))).toBeCloseTo(0, 12); // f(0) = 0
  });
});

describe("reentrant polygon presets → Schwarz–Christoffel (precise)", () => {
  const reentrant = ["lshape", "cross"] as const;

  it("each is a CCW simple polygon enclosing 0 (kernel point) with a reflex corner", () => {
    for (const id of reentrant) {
      const d = domainById(id);
      expect(d?.corners, id).toBeDefined();
      if (!d?.corners) continue;
      const v = d.corners;
      let area2 = 0; // shoelace: > 0 ⇒ counter-clockwise (the SC solver's input convention)
      for (let i = 0; i < v.length; i++) {
        const a = v[i];
        const b = v[(i + 1) % v.length];
        area2 += a[0] * b[1] - b[0] * a[1];
      }
      expect(area2, `${id} orientation`).toBeGreaterThan(0);
      expect(pointInPolygon([0, 0], v), `${id} encloses 0`).toBe(true);
    }
  });

  it("the fast fit tolerates a degenerate polygon the precise solve rejects (backs the no-throw fallback)", () => {
    // A vertex dragged onto a neighbour makes the precise parameter solve throw out of gaussJacobi
    // (interior angle → 0). The studio's solvePolygon catches this and falls back to the fast fit, which
    // must NOT throw — pin both halves so a future engine change that breaks the assumption is caught here.
    const coincident: C[] = [
      [1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ];
    expect(() => fitSchwarzChristoffel({ vertices: coincident }, { mode: "precise" })).toThrow();
    expect(() => fitSchwarzChristoffel({ vertices: coincident }, { mode: "fast" })).not.toThrow();
  });

  it("the precise solve (at the app's nGaussLegendre=12) reproduces the corners to ≥8 digits", () => {
    for (const id of reentrant) {
      const d = domainById(id);
      if (!d?.corners) throw new Error(`${id} must be a polygon preset`);
      const sc = fitSchwarzChristoffel({ vertices: d.corners }, { nGaussLegendre: 12 });
      expect(sc.mode).toBe("precise");
      expect(sc.converged, `${id} converged`).toBe(true);
      expect(Math.max(...sc.angles), `${id} has a reflex (α>1) corner`).toBeGreaterThan(1);
      const err = Math.max(
        ...d.corners.map((z, k) => {
          const f = sc.forward(sc.prevertices[k]);
          return Math.hypot(f[0] - z[0], f[1] - z[1]);
        }),
      );
      expect(err, `${id} vertex reproduction`).toBeLessThan(1e-8);
    }
  });
});

describe("polygonNonSimpleReason — flags non-simple / degenerate polygons (WP6 / A5)", () => {
  it("accepts a simple polygon (returns null)", () => {
    const square: C[] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    expect(polygonNonSimpleReason(square)).toBeNull();
  });

  it("flags a self-intersecting bowtie", () => {
    // Crossed quad: edges (0→1) and (2→3) cross.
    const bowtie: C[] = [
      [-1, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
    ];
    const reason = polygonNonSimpleReason(bowtie);
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/self-intersect/i);
  });

  it("flags a collinear / near-zero-area triple", () => {
    const collinear: C[] = [
      [0, 0],
      [1, 0],
      [2, 0],
    ];
    const reason = polygonNonSimpleReason(collinear);
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/collinear|near-zero/i);
  });
});
