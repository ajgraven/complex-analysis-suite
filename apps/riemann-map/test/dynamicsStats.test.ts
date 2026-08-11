import { describe, expect, it } from "vitest";
import { juliaDynamics, attractingCycle } from "../src/analysis/dynamicsStats.js";

describe("Julia-set dynamics stats (E12, z²+c)", () => {
  it("c=0: connected, superattracting fixed point (period 1, multiplier 0)", () => {
    const s = juliaDynamics([0, 0]);
    expect(s.connected).toBe(true);
    expect(s.cycle).not.toBeNull();
    expect(s.cycle?.period).toBe(1);
    expect(s.cycle?.multiplier).toBeCloseTo(0, 9);
  });

  it("c=−1 (basilica): connected, superattracting 2-cycle {0,−1} (period 2, multiplier 0)", () => {
    const s = juliaDynamics([-1, 0]);
    expect(s.connected).toBe(true);
    expect(s.cycle?.period).toBe(2);
    expect(s.cycle?.multiplier).toBeCloseTo(0, 9);
  });

  it("c=−0.5 (main cardioid): period-1 attracting fixed point, |λ|=|2α|<1", () => {
    const s = juliaDynamics([-0.5, 0]);
    expect(s.connected).toBe(true);
    expect(s.cycle?.period).toBe(1);
    // α = (1−√(1−4c))/2 = (1−√3)/2, λ = 2α = 1−√3, |λ| = √3−1 ≈ 0.732.
    expect(s.cycle?.multiplier).toBeCloseTo(Math.sqrt(3) - 1, 6); // |1−√3| = √3 − 1
    expect(s.cycle?.multiplier).toBeLessThan(1);
  });

  it("c=2 (real, outside M): disconnected K, no attracting cycle", () => {
    const s = juliaDynamics([2, 0]);
    expect(s.connected).toBe(false);
    expect(s.cycle).toBeNull();
  });

  it("c=−2 (Chebyshev): the critical orbit lands on a repelling fixed point — reported as no attracting cycle", () => {
    // 0 → −2 → 2 → 2 → …; the fixed point 2 has multiplier 4 > 1, so it is not an attracting cycle.
    expect(attractingCycle([-2, 0])).toBeNull();
  });
});
