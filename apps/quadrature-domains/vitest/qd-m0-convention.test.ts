// Review MED (finding 07, ADR-0006): the symbol "M₀" has a DUAL meaning across QD subsystems —
//   • observables.mjs computes the STANDARD geometric area moment  M₀ = ∬_Ω dA  (dA = dx dy),
//     which for the unit disk is the geometric area π;
//   • the solver's point-functional convention (qd-equations.mjs) uses the π→1-NORMALIZED harmonic
//     moment  M₀ = Σ_k k|w_k|²  (area measure normalized so π→1), for which the SAME unit disk has M₀ = 1.
// They differ by EXACTLY the factor of π that ADR-0006 calls the "silent factor-of-π" landmine. The two
// never cross today (traced consumers), but the mislabel was the ADR-0006 defence failing at the doc layer.
// This guard pins BOTH numbers for the SAME unit disk in one place — geometric π and normalized 1 — and
// names the factor of π, so the divergence is loud and regression-tested.
import { describe, it, expect, beforeAll } from "vitest";

let QD: any;
beforeAll(async () => {
  // solver-graph wires the full solver graph (families self-register ⇒ solveInverseQD works);
  // observables registers QD.boundaryObservables onto the same namespace.
  ({ default: QD } = await import("../app/workers/solver-graph.mjs"));
  await import("../app/analysis/observables.mjs");
});

// Unit disk: h = R²/w with R = 1 ⇒ φ(z) = z, Ω = the unit disk (area π).
const diskHData = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1, im: 0 }] }] };

describe("QD — the dual M₀ convention: geometric π vs normalized 1 (ADR-0006 factor-of-π guard)", () => {
  it("the SAME unit disk is M₀ = π (observables, geometric) but M₀ = 1 (solver, normalized) — factor of π", () => {
    const disk = QD.solveInverseQD(diskHData, {});
    expect(disk.success).toBe(true);
    const phi = disk.primary.phi;

    // --- Geometric side: observables integrates ∬_Ω dA with the STANDARD dA = dx dy → area = π ---------
    const obs = QD.boundaryObservables(phi, { samples: 1024 });
    const geometricM0 = obs.moments[0].re;
    expect(geometricM0).toBeCloseTo(Math.PI, 2); // the geometric area of the unit disk
    expect(obs.moments[0].im).toBeCloseTo(0, 6); // M₀ is real (the area)

    // --- Normalized side: the solver's OWN area formula on the SAME φ: M₀ = Σ_k k|w_k|² in the π→1
    //     convention (the exact identity pointFunctionalSystem is built on, qd-equations.mjs). The w_k are
    //     φ's Taylor coefficients at 0 (a[k] = φ^(k)(0)/k!). For the disk φ = z (w₁ = 1) this is 1. --------
    const KMAX = 6;
    const a = QD.phiTaylorAt({ re: 0, im: 0 }, phi, KMAX);
    let normalizedM0 = 0;
    for (let k = 1; k <= KMAX; k++) normalizedM0 += k * (a[k].re * a[k].re + a[k].im * a[k].im);
    expect(normalizedM0).toBeCloseTo(1, 6); // the unit disk's NORMALIZED harmonic moment

    // --- The dual meaning, named: the SAME M₀ is π geometrically and 1 normalized — differing by π -------
    expect(geometricM0 / normalizedM0).toBeCloseTo(Math.PI, 2);
  });
});
