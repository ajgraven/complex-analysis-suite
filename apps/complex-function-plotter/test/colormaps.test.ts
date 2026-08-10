import { describe, expect, it } from "vitest";
import {
  COLORMAPS,
  bakeAtlas,
  bakeRow,
  hsvCyclic,
  oklchCyclic,
  dlmfWarped,
  dlmfQuadrant,
} from "../src/render/colormaps.js";

describe("phase colormaps", () => {
  it("bakes one atlas row per colormap, opaque RGBA8", () => {
    const atlas = bakeAtlas(256);
    expect(atlas.width).toBe(256);
    expect(atlas.height).toBe(COLORMAPS.length);
    expect(atlas.data.length).toBe(256 * COLORMAPS.length * 4);
    for (let i = 3; i < atlas.data.length; i += 4) expect(atlas.data[i]).toBe(255);
  });

  it("keeps every sample in sRGB gamut [0,1]", () => {
    for (const cm of COLORMAPS) {
      for (let k = 0; k < 24; k++) {
        for (const channel of cm.sample(k / 24)) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("HSV wheel: red at phase 0, cyan at phase 1/2", () => {
    expect(hsvCyclic.sample(0)).toEqual([1, 0, 0]);
    const [r, g, b] = hsvCyclic.sample(0.5);
    expect(r).toBeCloseTo(0, 6);
    expect(g).toBeCloseTo(1, 6);
    expect(b).toBeCloseTo(1, 6);
  });

  it("is cyclic — the two endpoints of the loop nearly meet (continuous maps)", () => {
    // The four-colour DLMF map is a deliberate step function (Q4→Q1 jump at arg 0), so it opts out.
    for (const cm of COLORMAPS.filter((c) => c.continuous !== false)) {
      const a = cm.sample(0);
      const b = cm.sample(1 - 1e-6);
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(0.05);
    }
  });

  it("bakeRow is deterministic", () => {
    expect(bakeRow(oklchCyclic, 8)).toEqual(bakeRow(oklchCyclic, 8));
  });
});

describe("DLMF colormaps (D8)", () => {
  const near = (c: [number, number, number], r: number, g: number, b: number): void => {
    expect(c[0]).toBeCloseTo(r, 6);
    expect(c[1]).toBeCloseTo(g, 6);
    expect(c[2]).toBeCloseTo(b, 6);
  };

  it("warped-hue hits the DLMF anchors: red@0, yellow@π/2, cyan@π, blue@3π/2", () => {
    near(dlmfWarped.sample(0), 1, 0, 0); // arg 0
    near(dlmfWarped.sample(0.25), 1, 1, 0); // arg π/2
    near(dlmfWarped.sample(0.5), 0, 1, 1); // arg π
    near(dlmfWarped.sample(0.75), 0, 0, 1); // arg 3π/2
    near(dlmfWarped.sample(1 - 1e-9), 1, 0, 0); // wraps back to red
  });

  it("warped-hue is continuous around the whole loop (no RGB jumps)", () => {
    const N = 512;
    let prev = dlmfWarped.sample(0);
    for (let k = 1; k <= N; k++) {
      const cur = dlmfWarped.sample((k % N) / N);
      for (let i = 0; i < 3; i++) expect(Math.abs(cur[i] - prev[i])).toBeLessThan(0.05);
      prev = cur;
    }
  });

  it("four-colour: a solid blue/green/red/yellow indicator per quadrant", () => {
    const [q1, q2, q3, q4] = [0.1, 0.35, 0.6, 0.85].map((t) => dlmfQuadrant.sample(t));
    expect(q1[2]).toBeGreaterThan(q1[0]); // Q1 blue-dominant
    expect(q1[2]).toBeGreaterThan(q1[1]);
    expect(q2[1]).toBeGreaterThan(q2[0]); // Q2 green-dominant
    expect(q2[1]).toBeGreaterThan(q2[2]);
    expect(q3[0]).toBeGreaterThan(q3[1]); // Q3 red-dominant
    expect(q3[0]).toBeGreaterThan(q3[2]);
    expect(q4[0]).toBeGreaterThan(q4[2]); // Q4 yellow = high R & G, low B
    expect(q4[1]).toBeGreaterThan(q4[2]);
  });

  it("four-colour: constant within a quadrant, stepping at the boundaries", () => {
    expect(dlmfQuadrant.sample(0.05)).toEqual(dlmfQuadrant.sample(0.2)); // same colour across Q1
    expect(dlmfQuadrant.sample(0.24)).not.toEqual(dlmfQuadrant.sample(0.26)); // jumps at t = 0.25
    expect(dlmfQuadrant.continuous).toBe(false);
  });

  it("both are appended after the perceptual maps, keeping earlier indices stable", () => {
    expect(COLORMAPS.indexOf(dlmfWarped)).toBe(4);
    expect(COLORMAPS.indexOf(dlmfQuadrant)).toBe(5);
    expect(COLORMAPS[0].id).toBe("oklch"); // the default is unchanged
  });
});
