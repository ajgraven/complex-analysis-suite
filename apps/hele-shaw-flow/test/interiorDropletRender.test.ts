import { describe, it, expect } from "vitest";
import { dropletBoundary, dropletFlowNet } from "../src/render/interiorDropletRender.js";
import { evalMap, type Cx } from "../src/heleShawInterior.js";
import type { Pt } from "@cas/flow";

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

  it("warps the net for an off-centre source: streamlines start at f(a), and it differs from the central net (F1.1)", () => {
    const a: Cx = [0.4, 0.1]; // source preimage
    const src = evalMap(blob, a); // its image = where the flow converges
    const off = dropletFlowNet(blob, { rings: 4, rays: 12, at: a });
    for (const s of off.streamlines) {
      expect(Math.hypot(s.pts[0][0] - src[0], s.pts[0][1] - src[1])).toBeLessThan(1e-9); // start at the source
    }
    // the warped net is genuinely different from the central polar grid
    const central = dropletFlowNet(blob, { rings: 4, rays: 12 });
    let maxDiff = 0;
    for (let k = 0; k < off.equipotentials.length; k++) {
      const p = off.equipotentials[k].pts[0];
      const q = central.equipotentials[k].pts[0];
      maxDiff = Math.max(maxDiff, Math.hypot(p[0] - q[0], p[1] - q[1]));
    }
    expect(maxDiff).toBeGreaterThan(0.05); // the Blaschke warp visibly offsets the rings
  });
});
