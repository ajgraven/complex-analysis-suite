// **ONE INEQUALITY, TWO FACES — and the range test that D-1 got wrong.**
//
// `sin ψ ≥ 2ψ/π` (Jordan, L3) and `cos φ ≥ 1 − 2φ/π` (the wedge lemma, L6) are the same statement
// under `φ = π/2 − ψ`. The first block MEASURES that rather than asserting it: the two slacks are
// computed independently on 5001 points and compared, because "they are the same inequality" is the
// claim the whole module rests on and a reader is entitled to see it checked.
//
// The rest is the side condition, which is the half that is decidable and the half research 03 got
// wrong: it applied the inequality on a range where it does not hold.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { dampedArcIntegral, MINORANT_RANGE, SIN_RANGE } from "../src/kernel/bounds/linearMinorant.js";

const q = (n: number, d = 1): Frac => Frac.of(BigInt(n), BigInt(d));
const N = 5001;

describe("the two faces are one inequality", () => {
  it("has identical slack under φ = π/2 − ψ, on 5001 points", () => {
    let worst = 0;
    for (let i = 0; i < N; i++) {
      const psi = (Math.PI / 2) * (i / (N - 1));
      const phi = Math.PI / 2 - psi;
      const jordan = Math.sin(psi) - (2 * psi) / Math.PI;
      const wedge = Math.cos(phi) - (1 - (2 * phi) / Math.PI);
      worst = Math.max(worst, Math.abs(jordan - wedge));
    }
    // Float noise, not a near miss: the two expressions are algebraically the same number.
    expect(worst).toBeLessThan(1e-15);
  });

  it("both hold on [0, π/2], with equality only at the two ends", () => {
    let minSlack = Number.POSITIVE_INFINITY;
    let interiorMin = Number.POSITIVE_INFINITY;
    for (let i = 0; i < N; i++) {
      const psi = (Math.PI / 2) * (i / (N - 1));
      const slack = Math.sin(psi) - (2 * psi) / Math.PI;
      minSlack = Math.min(minSlack, slack);
      if (i > 0 && i < N - 1) interiorMin = Math.min(interiorMin, slack);
    }
    expect(minSlack).toBeGreaterThan(-1e-16);
    expect(interiorMin).toBeGreaterThan(0);
  });

  it("REVERSES on [π/2, π] — which is why the cos face stops there", () => {
    // `cos φ ≤ 1 − 2φ/π` past π/2: equal at both ends, cos below the chord between. This is the
    // fact research 03 §0.3 walked past when it stated L6 on `θ ∈ [0, π/n]`.
    let worst = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < N; i++) {
      const phi = Math.PI / 2 + (Math.PI / 2) * (i / (N - 1));
      worst = Math.max(worst, Math.cos(phi) - (1 - (2 * phi) / Math.PI));
    }
    expect(worst).toBeLessThan(1e-15);
  });
});

describe("dampedArcIntegral — the side condition, decided in ℚ", () => {
  it("gives π/(2κ) on any range inside [0, π/2], in either face", () => {
    for (const face of ["sin", "cos"] as const) {
      for (const upper of [q(1, 12), q(1, 6), q(1, 4), q(1, 3), MINORANT_RANGE]) {
        const d = dampedArcIntegral(upper, face);
        expect(d.constant?.equals(q(1, 2))).toBe(true);
        expect(d.withinMinorant).toBe(true);
        expect(d.certificate.level).toBe("≤");
      }
    }
  });

  it("names the identity in the cos face's method, so the sharing is visible", () => {
    const d = dampedArcIntegral(q(1, 4), "cos");
    expect(d.certificate.method).toMatch(/SAME inequality under φ = π\/2 − ψ/);
  });

  it("folds the sin face past π/2, at exactly twice the constant", () => {
    for (const upper of [q(3, 5), q(3, 4), SIN_RANGE]) {
      const d = dampedArcIntegral(upper, "sin");
      expect(d.constant?.equals(Frac.ONE)).toBe(true);
      expect(d.withinMinorant).toBe(false);
      expect(d.certificate.level).toBe("≤");
      expect(d.certificate.method).toMatch(/sin ψ = sin\(π − ψ\)/);
    }
  });

  it("REFUSES the cos face past π/2 — the same range the sin face survives", () => {
    // The two calls differ in one argument, and that is D-1: research 03 applied the sin face's
    // tolerance to the cos face's integrand.
    const survives = dampedArcIntegral(q(3, 4), "sin");
    const refuses = dampedArcIntegral(q(3, 4), "cos");
    expect(survives.constant).not.toBeNull();
    expect(refuses.constant).toBeNull();
    expect(refuses.certificate.level).toBe("⚠");
    expect(refuses.certificate.method).toMatch(/GROWS/);
    expect(refuses.certificate.method).toMatch(/runs past π\/2/);
  });

  it("refuses the cos face at the first rational past π/2, not merely far past it", () => {
    const d = dampedArcIntegral(q(51, 100), "cos");
    expect(d.constant).toBeNull();
  });

  it("refuses the sin face past π, where sin goes negative too", () => {
    for (const upper of [q(11, 10), q(3, 2), q(2)]) {
      const d = dampedArcIntegral(upper, "sin");
      expect(d.constant).toBeNull();
      expect(d.certificate.level).toBe("⚠");
    }
  });

  it("refuses a non-positive range in either face", () => {
    for (const face of ["sin", "cos"] as const) {
      expect(dampedArcIntegral(Frac.ZERO, face).constant).toBeNull();
      expect(dampedArcIntegral(q(-1, 2), face).constant).toBeNull();
    }
  });

  it("is a bound on the real integral, at every κ the caller could supply", () => {
    // The predicate's own claim, checked against quadrature: `∫₀^Ψ e^{−κ h} dψ ≤ c·π/κ`. A constant
    // that was too small would be certification theatre — the exact charge D-2 lays against the
    // square-contour bound — so it is measured rather than trusted.
    const integrate = (h: (x: number) => number, kappa: number, upper: number): number => {
      const m = 20001;
      const step = upper / (m - 1);
      let s = Math.exp(-kappa * h(0)) + Math.exp(-kappa * h(upper));
      for (let i = 1; i < m - 1; i++) s += (i % 2 ? 4 : 2) * Math.exp(-kappa * h(i * step));
      return (s * step) / 3;
    };
    for (const face of ["sin", "cos"] as const) {
      const h = face === "sin" ? Math.sin : Math.cos;
      for (const upper of [q(1, 6), q(1, 4), MINORANT_RANGE]) {
        const d = dampedArcIntegral(upper, face);
        expect(d.constant).not.toBeNull();
        for (const kappa of [0.25, 1, 4, 16, 256]) {
          const actual = integrate(h, kappa, upper.toNumber() * Math.PI);
          const claimed = (d.constant as Frac).toNumber() * (Math.PI / kappa);
          expect(actual).toBeLessThanOrEqual(claimed);
        }
      }
      if (face === "sin") {
        const d = dampedArcIntegral(SIN_RANGE, "sin");
        for (const kappa of [0.25, 1, 4, 16, 256]) {
          expect(integrate(Math.sin, kappa, Math.PI)).toBeLessThanOrEqual(
            (d.constant as Frac).toNumber() * (Math.PI / kappa),
          );
        }
      }
    }
  });
});
