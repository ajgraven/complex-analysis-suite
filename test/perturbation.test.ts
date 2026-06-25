import { describe, it, expect } from "vitest";
import {
  computeReferenceOrbit,
  computeReferenceOrbitDD,
  computeReferenceOrbitDDFrom,
} from "../src/render/perturbation";
import { dd } from "../src/render/dd";

/** Independent plain-double z²+c escape-count oracle. */
function mandelEscape(cx: number, cy: number, maxIter: number): number {
  let x = 0;
  let y = 0;
  for (let n = 0; n < maxIter; n++) {
    if (x * x + y * y > 4) return n;
    const xt = x * x - y * y + cx;
    y = 2 * x * y + cy;
    x = xt;
  }
  return maxIter;
}

describe("perturbation reference orbit (z²+c)", () => {
  it("escape iteration matches a plain-double Mandelbrot oracle", () => {
    const maxIter = 500;
    const points: [number, number][] = [
      [0, 0], // interior (fixed point)
      [-1, 0], // interior (period 2)
      [0.3, 0.5], // exterior, escapes quickly
      [-0.75, 0.1], // near the boundary
      [0.35, 0.35], // exterior
      [-0.123, 0.745], // near a tendril
    ];
    for (const [cx, cy] of points) {
      const orbit = computeReferenceOrbit(cx, cy, maxIter);
      const oracle = mandelEscape(cx, cy, maxIter);
      if (oracle >= maxIter) {
        expect(orbit.escaped).toBe(orbit.length); // bounded → never escaped
      } else {
        expect(orbit.escaped).toBe(oracle);
      }
    }
  });

  it("stores orbit samples that track the double-precision orbit", () => {
    const orbit = computeReferenceOrbit(-0.5, 0.5, 200);
    let x = 0;
    let y = 0;
    for (let n = 0; n < Math.min(orbit.length, 20); n++) {
      expect(orbit.xy[2 * n]).toBeCloseTo(x, 4);
      expect(orbit.xy[2 * n + 1]).toBeCloseTo(y, 4);
      const xt = x * x - y * y - 0.5;
      y = 2 * x * y + 0.5;
      x = xt;
    }
  });

  it("never stores more than maxIter+1 samples", () => {
    const orbit = computeReferenceOrbit(0, 0, 100);
    expect(orbit.length).toBeLessThanOrEqual(101);
    expect(orbit.xy.length).toBe(202);
  });

  it("the Z0=0 double-double orbit equals the Mandelbrot wrapper", () => {
    const a = computeReferenceOrbitDD(dd(-0.75), dd(0.1), 300);
    const b = computeReferenceOrbitDDFrom([0, 0], [0, 0], dd(-0.75), dd(0.1), 300);
    expect(a.escaped).toBe(b.escaped);
    expect(a.length).toBe(b.length);
  });
});

/** Plain-double z²+c Julia escape oracle starting from z0 with fixed parameter c. */
function juliaEscape(z0x: number, z0y: number, cx: number, cy: number, maxIter: number): number {
  let x = z0x;
  let y = z0y;
  for (let n = 0; n < maxIter; n++) {
    if (x * x + y * y > 4) return n;
    const xt = x * x - y * y + cx;
    y = 2 * x * y + cy;
    x = xt;
  }
  return maxIter;
}

describe("perturbation reference orbit — Julia/dynamical plane (computeReferenceOrbitDDFrom)", () => {
  it("escape iteration matches a plain-double Julia oracle (Z0 = centre, add = c)", () => {
    const maxIter = 400;
    const c: [number, number] = [-0.8, 0.156];
    const starts: [number, number][] = [
      [0, 0],
      [0.5, 0.1],
      [-0.3, 0.4],
      [1.2, 0.6], // escapes quickly
    ];
    for (const [z0x, z0y] of starts) {
      const orbit = computeReferenceOrbitDDFrom(dd(z0x), dd(z0y), dd(c[0]), dd(c[1]), maxIter);
      const oracle = juliaEscape(z0x, z0y, c[0], c[1], maxIter);
      if (oracle >= maxIter) expect(orbit.escaped).toBe(orbit.length);
      else expect(orbit.escaped).toBe(oracle);
    }
  });

  it("stored samples track the double-precision Julia orbit", () => {
    const c: [number, number] = [0.285, 0.01];
    const orbit = computeReferenceOrbitDDFrom(dd(0.2), dd(0.3), dd(c[0]), dd(c[1]), 200);
    let x = 0.2;
    let y = 0.3;
    for (let n = 0; n < Math.min(orbit.length, 20); n++) {
      expect(orbit.xy[2 * n]).toBeCloseTo(x, 4);
      expect(orbit.xy[2 * n + 1]).toBeCloseTo(y, 4);
      const xt = x * x - y * y + c[0];
      y = 2 * x * y + c[1];
      x = xt;
    }
  });
});
