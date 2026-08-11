import { describe, expect, it } from "vitest";
import { fitConformalMap, fitForwardMap, type C } from "@cas/conformal";
import { DOMAIN_PRESETS, domainById, sampleDomainBoundary } from "../src/domains.js";

const boundaryOf = (id: string, m: number): C[] => {
  const d = domainById(id);
  if (!d) throw new Error(id);
  return sampleDomainBoundary(d, m);
};

describe("forward Riemann map g: 𝔻 → Ω (2.1)", () => {
  it("the unit disk maps (essentially) to the identity", () => {
    // Ω = 𝔻 (radius 1): f is the identity, so g should be too.
    const boundary: C[] = Array.from({ length: 240 }, (_, j): C => {
      const t = (2 * Math.PI * j) / 240;
      return [Math.cos(t), Math.sin(t)];
    });
    const f = fitConformalMap(boundary, 20);
    const g = fitForwardMap(f, boundary, 20);
    expect(g.boundaryResidual).toBeLessThan(1e-3);
    expect(Math.hypot(g.center[0], g.center[1])).toBeLessThan(1e-3); // g(0) ≈ 0
    const w: C = [0.4, 0.2];
    const gw = g.eval(w);
    expect(Math.hypot(gw[0] - w[0], gw[1] - w[1])).toBeLessThan(2e-3);
  });

  it("smooth regions: g sends ∂𝔻 onto ∂Ω to good accuracy, and 𝔻 into Ω", () => {
    for (const id of ["ellipse", "offdisk", "blob", "oval"]) {
      const d = domainById(id);
      if (!d) continue;
      const boundary = boundaryOf(id, 400);
      const f = fitConformalMap(boundary, 60);
      const g = fitForwardMap(f, boundary, 60);
      expect(g.boundaryResidual, `${id} residual`).toBeLessThan(5e-2);
      // interior disk points land inside Ω (within its polar radius along their own angle)
      for (const [rr, th] of [
        [0.3, 0.7],
        [0.6, 2.1],
        [0.8, 4.0],
      ]) {
        const p = g.eval([rr * Math.cos(th), rr * Math.sin(th)]);
        const ang = Math.atan2(p[1], p[0]);
        expect(Math.hypot(p[0], p[1]), `${id} interior point stays inside`).toBeLessThan(d.radius(ang) + 0.15);
      }
    }
  });

  // NB: the app drives the region source with SMOOTH domains only — the forward fit g: 𝔻 → Ω is stable
  // there. Polygon corners make the forward fit ill-conditioned (that is the Schwarz–Christoffel case,
  // roadmap 3.1), so we don't assert accuracy on them; we only require the smooth presets stay finite.
  it("every smooth preset produces a finite, accurate forward map", () => {
    for (const d of DOMAIN_PRESETS.filter((x) => !x.corners)) {
      const boundary = sampleDomainBoundary(d, 400);
      const f = fitConformalMap(boundary, 60);
      const g = fitForwardMap(f, boundary, 60);
      const p = g.eval([0.5, 0.1]);
      expect(Number.isFinite(p[0]) && Number.isFinite(p[1]), `${d.id} finite`).toBe(true);
      expect(g.boundaryResidual, `${d.id} residual`).toBeLessThan(5e-2);
    }
  });
});
