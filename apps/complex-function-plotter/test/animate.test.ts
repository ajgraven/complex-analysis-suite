import { describe, expect, it } from "vitest";
import { DEFAULT_ANIM, stepT, type AnimConfig } from "../src/ui/animate.js";

// The `t` transport (catalog G2) is DOM + requestAnimationFrame, but its per-frame stepping — advance
// by speed·dt, wrap when looping, clamp + report `ended` when not — is pure. Pin it here.

const cfg = (over: Partial<AnimConfig> = {}): AnimConfig => ({
  ...DEFAULT_ANIM,
  ...over,
});

describe("stepT — animation frame stepping", () => {
  it("advances t by speed·dt", () => {
    const { t, ended } = stepT(1, 0.5, cfg({ t0: 0, t1: 10, speed: 2 }));
    expect(t).toBeCloseTo(2, 12); // 1 + 2·0.5
    expect(ended).toBe(false);
  });

  it("wraps into [t0, t1) when looping", () => {
    const { t, ended } = stepT(9.5, 1, cfg({ t0: 0, t1: 10, speed: 1, loop: true }));
    expect(t).toBeCloseTo(0.5, 12); // 10.5 wraps to 0.5
    expect(ended).toBe(false);
  });

  it("clamps to t1 and reports ended when not looping", () => {
    const r = stepT(9.8, 1, cfg({ t0: 0, t1: 10, speed: 1, loop: false }));
    expect(r.t).toBe(10);
    expect(r.ended).toBe(true);
  });

  it("does not end early inside a non-looping segment", () => {
    const r = stepT(2, 1, cfg({ t0: 0, t1: 10, speed: 1, loop: false }));
    expect(r.t).toBeCloseTo(3, 12);
    expect(r.ended).toBe(false);
  });

  it("treats a degenerate (non-positive) span as an ended no-op at t0", () => {
    expect(stepT(5, 1, cfg({ t0: 3, t1: 3, speed: 1 }))).toEqual({ t: 3, ended: true });
    expect(stepT(5, 1, cfg({ t0: 4, t1: 2, speed: 1 }))).toEqual({ t: 4, ended: true });
  });

  it("wraps a multi-span overshoot correctly (large dt·speed)", () => {
    // start 1, +25 over a span of 10 ⇒ 26 → wrap into [0,10) ⇒ 6
    const { t } = stepT(1, 5, cfg({ t0: 0, t1: 10, speed: 5, loop: true }));
    expect(t).toBeCloseTo(6, 12);
  });
});
