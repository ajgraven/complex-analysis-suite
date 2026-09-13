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
const boundValue = (claim: string): number => Number(/≤ ([\d.e+-]+)/.exec(claim)?.[1] ?? Number.NaN);

const ONE = QiPoly.constant(Gauss.ONE);
const onePlusZSquared = QiPoly.fromCoeffs([Gauss.ONE, Gauss.ZERO, Gauss.ONE]);

describe("D4's two circles", () => {
  it("kills the outer one: deg Q − deg P = 4, so the bound is O(ρ⁻³·(ln ρ)²)", () => {
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
  // `R = 1/(1+z²)`: deg Q − deg P = 2, so at ∞ the exponent is 1 − 2 = −1 and it vanishes.
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
    expect(b.certificate.claim).toMatch(/DIVERGES/);
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
});
