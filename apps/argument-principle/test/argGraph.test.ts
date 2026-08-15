import { describe, expect, it } from "vitest";
import { argGraphLayout, turnsAt } from "../src/render/argGraph.js";

// The strip-chart's pure geometry (A1). drawArgGraph itself is canvas code verified in the browser smoke;
// here we pin the t↔turns mapping and the integer-turn gridlines that make "winding = a height" legible.

describe("argGraphLayout", () => {
  it("maps t = 0 to the left pad and t = 1 to the right pad, monotonically", () => {
    const L = argGraphLayout([0, 1, 2, 3], 400, 140);
    expect(L.xOfT(0)).toBeCloseTo(L.padL, 9);
    expect(L.xOfT(1)).toBeCloseTo(400 - L.padR, 9);
    expect(L.xOfT(0.5)).toBeGreaterThan(L.xOfT(0));
    expect(L.xOfT(1)).toBeGreaterThan(L.xOfT(0.5));
  });

  it("puts larger turns higher on screen (smaller y)", () => {
    const L = argGraphLayout([0, 1, 2, 3], 400, 140);
    expect(L.yOfV(L.vMax)).toBeLessThan(L.yOfV(L.vMin));
    expect(L.yOfV(3)).toBeLessThan(L.yOfV(0));
  });

  it("draws an integer-turn gridline for every revolution in view, including 0", () => {
    const L = argGraphLayout([0, 1, 2, 3], 400, 140);
    expect(L.gridTurns).toEqual([0, 1, 2, 3]);
    expect(L.vMin).toBeLessThanOrEqual(0);
    expect(L.vMax).toBeGreaterThanOrEqual(3);
  });

  it("handles a negative winding (climb downward) with 0 always framed", () => {
    const L = argGraphLayout([0, -1, -2], 400, 140);
    expect(L.gridTurns).toContain(0);
    expect(L.gridTurns).toContain(-2);
    expect(L.vMin).toBeLessThanOrEqual(-2);
    expect(L.vMax).toBeGreaterThanOrEqual(0);
  });

  it("expands a flat (winding-0) series to at least one turn of vertical room", () => {
    const L = argGraphLayout([0, 0, 0], 400, 140);
    expect(L.vMax - L.vMin).toBeGreaterThanOrEqual(1);
    expect(L.gridTurns).toContain(0);
  });
});

describe("turnsAt (marker interpolation)", () => {
  it("returns the endpoints at t = 0 and t = 1", () => {
    expect(turnsAt([0, 1, 2, 3], 0)).toBe(0);
    expect(turnsAt([0, 1, 2, 3], 1)).toBe(3);
  });

  it("interpolates linearly within an edge", () => {
    expect(turnsAt([0, 2], 0.5)).toBeCloseTo(1, 12);
    expect(turnsAt([0, 1, 2], 0.25)).toBeCloseTo(0.5, 12);
  });

  it("clamps out-of-range t and degenerate inputs", () => {
    expect(turnsAt([0, 1, 2], -1)).toBe(0);
    expect(turnsAt([0, 1, 2], 5)).toBe(2);
    expect(turnsAt([], 0.5)).toBe(0);
    expect(turnsAt([1.5], 0.5)).toBe(1.5);
  });
});
