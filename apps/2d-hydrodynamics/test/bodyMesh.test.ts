import { describe, it, expect } from "vitest";
import { EXTERIOR_MAP_PRESETS, type Pt } from "@cas/flow";
import { buildBodyMesh } from "../src/render/bodyMesh.js";
import { airfoilBody, galleryBody, physicalVelocity, potential } from "../src/bodyModel.js";

// The forward-mapped mesh is the HD-6.3 render payload; its geometry is pure (no WebGL), so it is pinned
// here. The GL upload + shading is browser-verified.
describe("body mesh geometry", () => {
  const ellipse = EXTERIOR_MAP_PRESETS.find((e) => e.id === "ellipse-ext");
  if (!ellipse) throw new Error("ellipse-ext preset missing");
  const body = galleryBody(ellipse, 0.2, 0.8);

  it("has the expected vertex / index counts for a polar (nR, nTheta) grid", () => {
    const nR = 12;
    const nTheta = 24;
    const mesh = buildBodyMesh(body, { nR, nTheta });
    expect(mesh.stride).toBe(5);
    expect(mesh.vertexCount).toBe((nR + 1) * (nTheta + 1));
    expect(mesh.vertices.length).toBe(mesh.vertexCount * 5);
    expect(mesh.indices.length).toBe(nR * nTheta * 6);
    expect(mesh.outline.length).toBe(nTheta + 1); // the r = 1 ring
  });

  it("keeps every triangle index inside the vertex range", () => {
    const mesh = buildBodyMesh(body, { nR: 8, nTheta: 16 });
    let maxIdx = 0;
    for (const idx of mesh.indices) maxIdx = Math.max(maxIdx, idx);
    expect(maxIdx).toBeLessThan(mesh.vertexCount);
  });

  it("its r = 1 ring is ψ(∂𝔻) — the body outline", () => {
    const mesh = buildBodyMesh(body, { nR: 8, nTheta: 24 });
    for (let i = 0; i <= 24; i++) {
      const t = (2 * Math.PI * i) / 24;
      const expected = body.psi([Math.cos(t), Math.sin(t)]);
      expect(mesh.outline[i][0]).toBeCloseTo(expected[0], 12);
      expect(mesh.outline[i][1]).toBeCloseTo(expected[1], 12);
    }
  });

  it("tags each vertex with the exact physical velocity + stream function at its w = r·e^{iθ}", () => {
    const nR = 6;
    const nTheta = 12;
    const rMax = 8;
    const mesh = buildBodyMesh(body, { nR, nTheta, rMax });
    // Spot-check a middle vertex (row j, col i) against the direct evaluation.
    const j = 3;
    const i = 5;
    const r = Math.exp((Math.log(rMax) * j) / nR);
    const t = (2 * Math.PI * i) / nTheta;
    const w: Pt = [r * Math.cos(t), r * Math.sin(t)];
    const base = (j * (nTheta + 1) + i) * 5;
    const z = body.psi(w);
    const vel = physicalVelocity(body, w);
    const stream = potential(body, w)[1];
    expect(mesh.vertices[base]).toBeCloseTo(z[0], 5);
    expect(mesh.vertices[base + 1]).toBeCloseTo(z[1], 5);
    expect(mesh.vertices[base + 2]).toBeCloseTo(vel[0], 5);
    expect(mesh.vertices[base + 3]).toBeCloseTo(vel[1], 5);
    expect(mesh.vertices[base + 4]).toBeCloseTo(stream, 5);
  });

  it("builds for the airfoil body too (ψ = J(ζ₀ + R·w))", () => {
    const air = airfoilBody({ U: 1, alpha: 0.1, b: 1, center: [-0.12, 0.06], circulation: 0.5, n: 2 });
    const mesh = buildBodyMesh(air, { nR: 10, nTheta: 20 });
    expect(mesh.outline.length).toBe(21);
    // The outline is a closed loop: first ≈ last (θ = 0 and θ = 2π).
    expect(mesh.outline[0][0]).toBeCloseTo(mesh.outline[20][0], 9);
    expect(mesh.outline[0][1]).toBeCloseTo(mesh.outline[20][1], 9);
    // Every outline point is finite (the airfoil ψ is univalent on |w| ≥ 1).
    for (const p of mesh.outline) {
      expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
    }
  });
});
