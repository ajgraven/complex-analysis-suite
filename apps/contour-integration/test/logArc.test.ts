// The ML bound for `R(z)·log^m z` — and the one case where the log changes the verdict.
//
// A logarithm is weaker than every power, so it moves no exponent: D4's two circles are killed by
// the decay of `R` alone. What it does take away is the BOUNDARY case. At exponent 0 a rational arc
// bound is `O(1)` — bounded, discharging nothing — while the same arc with `m ≥ 1` DIVERGES, because
// `(ln ρ)^m → ∞`. Reporting "bounded" there would say a lemma merely fails when the integral it
// bounds grows without limit.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, QiPoly } from "@cas/exact";
import { logArcBound } from "../src/kernel/bounds/logArc.js";

const f = (n: number, d = 1): Frac => Frac.of(BigInt(n), BigInt(d));
const KEYHOLE: readonly [Frac, Frac] = [f(0), f(2)];
const PRINCIPAL: readonly [Frac, Frac] = [f(-1), f(1)];
const FULL_CIRCLE = f(2);

/** The bound's own number, read back out of the claim it states. */
const boundValue = (claim: string): number => Number(/\\le ([\d.e+-]+)/.exec(claim)?.[1] ?? Number.NaN);

const ONE = QiPoly.constant(Gauss.ONE);
const onePlusZSquared = QiPoly.fromCoeffs([Gauss.ONE, Gauss.ZERO, Gauss.ONE]);

describe("D4's two circles", () => {
  it("kills the outer one: \\deg Q - \\deg P = 4, so the bound is O(ρ⁻³·(ln ρ)²)", () => {
    const b = logArcBound(2, ONE, onePlusZSquared.pow(2), f(1000000000), {
      limit: "inf",
      piMultiple: FULL_CIRCLE,
      argRange: KEYHOLE,
    });
    expect(b.asymptotics).toBe("vanishes");
    expect(b.certificate.level).toBe("≤");
    expect(b.exponent).toBe(-3);
  });

  it("kills the inner one: R is bounded at 0, so the bound is O(ρ·(ln 1/ρ)²)", () => {
    const b = logArcBound(2, ONE, onePlusZSquared.pow(2), f(1, 1000000000), {
      limit: "0+",
      piMultiple: FULL_CIRCLE,
      argRange: KEYHOLE,
    });
    expect(b.asymptotics).toBe("vanishes");
    expect(b.certificate.level).toBe("≤");
    expect(b.exponent).toBe(1);
  });

  it("reads the determination for |log z| ≤ |ln ρ| + A rather than assuming 2π", () => {
    const keyhole = logArcBound(2, ONE, onePlusZSquared.pow(2), f(10), {
      limit: "inf",
      piMultiple: FULL_CIRCLE,
      argRange: KEYHOLE,
    });
    const principal = logArcBound(2, ONE, onePlusZSquared.pow(2), f(10), {
      limit: "inf",
      piMultiple: FULL_CIRCLE,
      argRange: PRINCIPAL,
    });
    // Same verdict, a genuinely smaller bound: A = π rather than 2π.
    expect(principal.asymptotics).toBe("vanishes");
    expect(boundValue(principal.certificate.claim)).toBeLessThan(boundValue(keyhole.certificate.claim));
    expect(principal.certificate.provenance.some((s) => s.text.includes("3.14"))).toBe(true);
  });
});

describe("the boundary case is where the log shows", () => {
  // `R = 1/(1+z²)`: \\deg Q - \\deg P = 2, so at ∞ the exponent is 1 − 2 = −1 and it vanishes.
  // `R = 1/(1+z)`: the gap is 1, the exponent is 0, and the two readings part company.
  const onePlusZ = QiPoly.fromCoeffs([Gauss.ONE, Gauss.ONE]);

  it("is BOUNDED for a rational integrand — O(1), discharging nothing", () => {
    const b = logArcBound(0, ONE, onePlusZ, f(1000), {
      limit: "inf",
      piMultiple: FULL_CIRCLE,
      argRange: KEYHOLE,
    });
    expect(b.exponent).toBe(0);
    expect(b.asymptotics).toBe("bounded");
    expect(b.certificate.level).toBe("⚠");
  });

  it("DIVERGES with a log, because (ln ρ)^m grows without limit", () => {
    const b = logArcBound(1, ONE, onePlusZ, f(1000), {
      limit: "inf",
      piMultiple: FULL_CIRCLE,
      argRange: KEYHOLE,
    });
    expect(b.exponent).toBe(0);
    expect(b.asymptotics).toBe("diverges");
    expect(b.certificate.level).toBe("⚠");
    expect(b.certificate.claim).toMatch(/diverges/);
  });

  it("and the bound itself grows, which is what that verdict is about", () => {
    const at = (rho: Frac): number =>
      boundValue(
        logArcBound(1, ONE, onePlusZ, rho, {
          limit: "inf",
          piMultiple: FULL_CIRCLE,
          argRange: KEYHOLE,
        }).certificate.claim,
      );
    expect(at(f(100000))).toBeGreaterThan(at(f(1000)));
  });
});

describe("refusals", () => {
  it("refuses a non-positive radius", () => {
    const b = logArcBound(2, ONE, onePlusZSquared, f(0), {
      limit: "inf",
      piMultiple: FULL_CIRCLE,
      argRange: KEYHOLE,
    });
    expect(b.certificate.level).toBe("⚠");
    expect(b.certificate.method).toMatch(/radius must be positive/);
  });

  it("refuses a negative or fractional power", () => {
    for (const power of [-1, 1.5]) {
      const b = logArcBound(power, ONE, onePlusZSquared, f(10), {
        limit: "inf",
        piMultiple: FULL_CIRCLE,
        argRange: KEYHOLE,
      });
      expect(b.certificate.level).toBe("⚠");
      expect(b.certificate.method).toMatch(/non-negative integer power/);
    }
  });

  it("refuses when no positive lower bound on |Q| is available — a pole may lie on the arc", () => {
    // `1 + z²` at ρ = 1: the reverse triangle inequality gives 1 − 1 = 0, and ±i are on the circle.
    const b = logArcBound(2, ONE, onePlusZSquared, f(1), {
      limit: "inf",
      piMultiple: FULL_CIRCLE,
      argRange: KEYHOLE,
    });
    expect(b.certificate.level).toBe("⚠");
    expect(b.certificate.method).toMatch(/a pole may lie on the arc/);
  });

  it("claim NOTHING about the limit — a refused bound establishes no asymptotics", () => {
    // The field the disposal row's status is read from. Carrying the exponent's verdict through a
    // refusal is what marked a `⚠` row satisfied; a bound that WAS reached keeps its own verdict.
    const at = (power: number, rho: Frac, limit: "inf" | "0+" = "inf") =>
      logArcBound(power, ONE, onePlusZSquared, rho, {
        limit,
        piMultiple: FULL_CIRCLE,
        argRange: KEYHOLE,
      }).asymptotics;
    expect(at(2, f(0))).toBe("unestablished"); // a non-positive radius
    expect(at(-1, f(10))).toBe("unestablished"); // a power that is not a non-negative integer
    expect(at(2, f(1))).toBe("unestablished"); // no lower bound on |Q| there
    // And the two verdicts a reached bound may carry, unchanged.
    const onePlusZ = QiPoly.fromCoeffs([Gauss.ONE, Gauss.ONE]);
    const reached = (power: number) =>
      logArcBound(power, ONE, onePlusZ, f(1000), {
        limit: "inf",
        piMultiple: FULL_CIRCLE,
        argRange: KEYHOLE,
      }).asymptotics;
    expect(reached(0)).toBe("bounded");
    expect(reached(1)).toBe("diverges");
  });
});

// **IS IT A BOUND?** The same question `dogboneArc.test.ts` asks of the cap, asked of the two circles
// this file is about — the two whose value is a FLOAT (`Math.log`, `Math.pow`), i.e. the least
// defended by construction. Measured against `∫|f||dz|` on the same circle, in the DECLARED window.
describe("the log circles ARE bounds: each dominates its own ∫|f||dz|", () => {
  const claimed = (claim: string): number => Number(/\\le ([0-9.e+-]+)/.exec(claim)?.[1] ?? "NaN");

  /**
   * `∫ |R(z)·log^m z| |dz|` over the full circle of radius ρ, with `arg` taken in `[lo·π, hi·π)`.
   *
   * The window matters and is the point: `|log z|² = (ln ρ)² + θ²`, and θ runs over the DECLARED
   * range rather than over `(−π, π]`, which is the difference between the keyhole's bound and the
   * principal one that the bound itself reads.
   */
  function circleIntegral(
    power: number,
    rho: number,
    window: readonly [Frac, Frac],
    den: (x: number, y: number) => number,
    n = 200000,
  ): number {
    const lo = window[0].toNumber() * Math.PI;
    let total = 0;
    const dt = (2 * Math.PI) / n;
    for (let k = 0; k < n; k++) {
      const th = lo + (k + 0.5) * dt;
      const x = rho * Math.cos(th);
      const y = rho * Math.sin(th);
      const logMod = Math.pow(Math.hypot(Math.log(rho), th), power);
      total += (logMod / den(x, y)) * rho * dt;
    }
    return total;
  }

  // D4/D5's cofactors: `1/(1+z²)²` and `1/(1+z²)`.
  const quarticDen = (x: number, y: number): number => {
    const re = 1 + x * x - y * y;
    const im = 2 * x * y;
    return Math.hypot(re, im) ** 2;
  };
  const quadraticDen = (x: number, y: number): number => Math.hypot(1 + x * x - y * y, 2 * x * y);

  it("D4's pair, at m = 1, 2, 3 and both limits", () => {
    for (const power of [1, 2, 3]) {
      for (const [rho, limit] of [
        [f(40), "inf"],
        [f(1000), "inf"],
        [f(1, 40), "0+"],
        [f(1, 1000), "0+"],
      ] as [Frac, "inf" | "0+"][]) {
        const b = logArcBound(power, ONE, onePlusZSquared.pow(2), rho, {
          limit,
          piMultiple: FULL_CIRCLE,
          argRange: KEYHOLE,
        });
        const actual = circleIntegral(power, rho.toNumber(), KEYHOLE, quarticDen);
        expect({ power, rho: rho.toNumber(), holds: actual <= claimed(b.certificate.claim) }).toEqual({
          power,
          rho: rho.toNumber(),
          holds: true,
        });
      }
    }
  });

  it("D5's cofactor at m = 3, and the PRINCIPAL window, which is the smaller bound", () => {
    for (const window of [KEYHOLE, PRINCIPAL]) {
      for (const rho of [f(40), f(1000)]) {
        const b = logArcBound(3, ONE, onePlusZSquared, rho, {
          limit: "inf",
          piMultiple: FULL_CIRCLE,
          argRange: window,
        });
        const actual = circleIntegral(3, rho.toNumber(), window, quadraticDen);
        expect({
          window: window[0].toNumber(),
          rho: rho.toNumber(),
          holds: actual <= claimed(b.certificate.claim),
        }).toEqual({ window: window[0].toNumber(), rho: rho.toNumber(), holds: true });
      }
    }
  });
});
