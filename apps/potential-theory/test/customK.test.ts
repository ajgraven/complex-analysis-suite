import { describe, it, expect } from "vitest";
import {
  DEFAULT_CUSTOM_CORNERS,
  nearestVertex,
  addVertex,
  removeVertex,
  signedArea2,
  ensureCCW,
  encodeViewState,
  decodeViewState,
} from "../src/customK.js";
import type { Pt } from "@cas/flow";

// PT-6a — the pure state helpers + permalink codec behind the "draw your own K" polygon editor.

describe("default shape", () => {
  it("is a simple pentagon, counter-clockwise, with finite corners", () => {
    expect(DEFAULT_CUSTOM_CORNERS).toHaveLength(5);
    for (const [x, y] of DEFAULT_CUSTOM_CORNERS) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    expect(signedArea2(DEFAULT_CUSTOM_CORNERS)).toBeGreaterThan(0); // CCW
  });
});

describe("nearestVertex", () => {
  const sq: Pt[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
  it("returns the nearest vertex within tolerance, −1 otherwise", () => {
    expect(nearestVertex(sq, [0.1, -0.05], 0.3)).toBe(0);
    expect(nearestVertex(sq, [1.9, 2.1], 0.3)).toBe(2);
    expect(nearestVertex(sq, [1, 1], 0.3)).toBe(-1); // the centre is far from every corner
  });
});

describe("addVertex / removeVertex", () => {
  it("adds a vertex at the midpoint of the longest edge", () => {
    const corners: Pt[] = [[0, 0], [4, 0], [4, 1], [0, 1]]; // longest edges are the two length-4 sides
    const out = addVertex(corners);
    expect(out).toHaveLength(5);
    // the inserted midpoint (2,0) or (2,1) must be present
    expect(out.some((p) => Math.abs(p[0] - 2) < 1e-9 && (Math.abs(p[1]) < 1e-9 || Math.abs(p[1] - 1) < 1e-9))).toBe(true);
  });
  it("removes a vertex but never below a triangle", () => {
    const quad: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(removeVertex(quad, 1)).toHaveLength(3);
    const tri: Pt[] = [[0, 0], [1, 0], [0, 1]];
    expect(removeVertex(tri, 0)).toHaveLength(3); // no-op at a triangle
    expect(removeVertex(quad, 9)).toHaveLength(4); // bad index → unchanged copy
  });
});

describe("ensureCCW", () => {
  it("flips a clockwise polygon and leaves a CCW one", () => {
    const ccw: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const cw = ccw.slice().reverse();
    expect(signedArea2(ensureCCW(cw))).toBeGreaterThan(0);
    expect(ensureCCW(ccw)).toEqual(ccw);
  });
});

describe("view-state codec", () => {
  it("round-trips a custom polygon (corners rounded to 1e-4)", () => {
    const v = { domain: "custom", corners: [[0, 0], [1.23456, -0.5], [0.5, 1]] as Pt[] };
    const decoded = decodeViewState(encodeViewState(v));
    expect(decoded?.domain).toBe("custom");
    expect(decoded?.corners).toHaveLength(3);
    expect(decoded?.corners?.[1][0]).toBeCloseTo(1.2346, 4);
  });
  it("round-trips a preset (no corners) and produces a #vs= hash", () => {
    const hash = encodeViewState({ domain: "deltoid" });
    expect(hash.startsWith("#vs=")).toBe(true);
    const decoded = decodeViewState(hash);
    expect(decoded).toEqual({ domain: "deltoid" });
  });
  it("returns null for a hash with no vs= param, and ignores a corrupt payload gracefully", () => {
    expect(decodeViewState("#foo=bar")).toBeNull();
    expect(decodeViewState("")).toBeNull();
    expect(decodeViewState("#vs=not-valid-base64-json!!")).toBeNull();
  });
  it("drops a degenerate corner list (< 3 points) but keeps the domain", () => {
    const decoded = decodeViewState(encodeViewState({ domain: "custom", corners: [[0, 0]] as Pt[] }));
    expect(decoded).toEqual({ domain: "custom" }); // the 1-point list is not serialized
  });
});
