import { describe, it, expect } from "vitest";
import { clampState, DEFAULT_STATE, LIVE_DEGREE_CAP, MAX_DEGREE } from "../src/state";
import type { AppState } from "../src/state";

const base = (over: Partial<AppState> = {}): AppState => ({ ...DEFAULT_STATE, ...over });

describe("clampState", () => {
  it("ORDERS the degrees, because a reversed range sweeps nothing at all", () => {
    // The pool builds its queue with `for (d = min; d <= max; d++)`, so `max < min` produces no chunks,
    // no points and an empty stage — a blank picture with every control looking correct. Found by a
    // mutation sweep: removing the `Math.max` here changed no test.
    const s = clampState(base({ minDegree: 12, maxDegree: 4 }));
    expect(s.minDegree).toBe(12);
    expect(s.maxDegree).toBe(12);
    expect(s.maxDegree).toBeGreaterThanOrEqual(s.minDegree);
    // And an ordered range is left alone.
    const ok = clampState(base({ minDegree: 4, maxDegree: 12 }));
    expect([ok.minDegree, ok.maxDegree]).toEqual([4, 12]);
  });

  it("keeps the degrees inside what the engine computes", () => {
    expect(clampState(base({ minDegree: 0, maxDegree: 5 })).minDegree).toBe(1);
    expect(clampState(base({ minDegree: -7, maxDegree: 5 })).minDegree).toBe(1);
    expect(clampState(base({ minDegree: 1, maxDegree: 999 })).maxDegree).toBe(MAX_DEGREE);
    expect(clampState(base({ minDegree: 3.7, maxDegree: 9.2 })).minDegree).toBe(4);
    expect(LIVE_DEGREE_CAP).toBeLessThan(MAX_DEGREE); // the live cap is a cap, not the ceiling
  });

  it("replaces a non-finite number with its default rather than carrying NaN into the stage", () => {
    const s = clampState(base({ cx: "not a number", cy: "", halfHeight: NaN, exposure: NaN, gamma: -0 }));
    expect(s.cx).toBe("0");
    expect(s.cy).toBe("0");
    for (const v of [s.halfHeight, s.exposure, s.gamma, s.circleDelta]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(s.halfHeight).toBe(DEFAULT_STATE.halfHeight);
    expect(s.exposure).toBe(DEFAULT_STATE.exposure);
  });

  it("clamps the view rather than refusing it — a zoom is not a claim about anything", () => {
    expect(clampState(base({ halfHeight: 1e-30 })).halfHeight).toBeGreaterThan(0);
    expect(clampState(base({ halfHeight: 1e30 })).halfHeight).toBeLessThanOrEqual(1e4);
    expect(clampState(base({ exposure: 1e9 })).exposure).toBeLessThanOrEqual(40);
    expect(clampState(base({ gamma: 0 })).gamma).toBeGreaterThan(0);
  });

  it("an unknown colour mode falls back to density rather than reaching the shader", () => {
    expect(clampState(base({ colour: "rainbow" as never })).colour).toBe("density");
    expect(clampState(base({ colour: "degree" })).colour).toBe("degree");
  });

  it("is idempotent — the app clamps on every change and must not drift", () => {
    for (const s of [DEFAULT_STATE, base({ minDegree: 12, maxDegree: 4 }), base({ halfHeight: 1e-30 })]) {
      const once = clampState(s);
      expect(clampState(once)).toEqual(once);
    }
  });

  it("the default state is already clamped", () => {
    expect(clampState(DEFAULT_STATE)).toEqual(DEFAULT_STATE);
  });
});
