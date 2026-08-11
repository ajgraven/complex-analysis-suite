import { describe, expect, it } from "vitest";
import { analyzeExterior, reconstructedBoundary } from "../src/analysis/exterior.js";

describe("exterior-Böttcher analysis (E2/E6, on @cas/dynamics)", () => {
  it("capacity = 1 for a monic map (theorem), and the closed-form value for a scaled one", () => {
    const basilica = analyzeExterior("z*z - 1");
    expect(basilica).not.toBeNull();
    if (!basilica) return;
    expect(basilica.capacity).toBeCloseTo(1, 12); // monic ⇒ cap(K) = 1 exactly
    expect(basilica.monic).toBe(true);
    expect(basilica.coeffs.length).toBeGreaterThan(0);

    const scaled = analyzeExterior("2*z*z"); // a₂ = 2 ⇒ cap = 2^{-1/(2-1)} = 1/2
    expect(scaled).not.toBeNull();
    if (!scaled) return;
    expect(scaled.capacity).toBeCloseTo(0.5, 10);
    expect(scaled.monic).toBe(false);
    expect(scaled.robin).toBeCloseTo(-Math.log(0.5), 10);
  });

  it("returns null when ∞ is not superattracting (Möbius, transcendental, degree < 2)", () => {
    expect(analyzeExterior("(z - 1)/(z + 1)")).toBeNull();
    expect(analyzeExterior("exp(z)")).toBeNull();
    expect(analyzeExterior("1/z")).toBeNull();
  });

  it("reconstructs a finite boundary polyline around the set (via @cas/dynamics)", () => {
    const a = analyzeExterior("z*z - 1");
    expect(a).not.toBeNull();
    if (!a) return;
    const b = reconstructedBoundary(a, 1.05, 128);
    expect(b.length).toBe(129);
    for (const [x, y] of b) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
  });
});
