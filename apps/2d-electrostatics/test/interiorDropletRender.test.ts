import { describe, it, expect } from "vitest";
import { dropletBoundary, dropletFlowNet } from "../src/render/interiorDropletRender.js";
import type { Cx } from "../src/heleShawInterior.js";
import type { Pt } from "../src/transplant.js";

const finite = (p: Pt): boolean => Number.isFinite(p[0]) && Number.isFinite(p[1]);
const blob: Cx[] = [[1.3, 0], [0.2, 0.1], [0, -0.1]];

describe("dropletBoundary (∂D = f(∂𝔻))", () => {
  it("is a closed, finite polyline", () => {
    const b = dropletBoundary(blob, 240);
    expect(b.length).toBe(241);
    expect(b.every(finite)).toBe(true);
    expect(Math.hypot(b[0][0] - b[b.length - 1][0], b[0][1] - b[b.length - 1][1])).toBeLessThan(1e-9); // closes
  });
});

describe("dropletFlowNet (pushforward of the disk's polar grid)", () => {
  it("returns finite equipotential rings and streamlines starting at the central source", () => {
    const { equipotentials, streamlines } = dropletFlowNet(blob, { rings: 4, rays: 12 });
    expect(equipotentials.length).toBe(4);
    expect(streamlines.length).toBe(12);
    for (const c of [...equipotentials, ...streamlines]) expect(c.pts.every(finite)).toBe(true);
    // every streamline starts at f(0) = 0 (the source, the image of the disk center)
    for (const s of streamlines) {
      expect(Math.hypot(s.pts[0][0], s.pts[0][1])).toBeLessThan(1e-12);
    }
  });
});
