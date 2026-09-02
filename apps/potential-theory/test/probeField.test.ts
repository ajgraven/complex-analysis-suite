import { describe, it, expect } from "vitest";
import { invertPsi, probeExterior, probeGeneral } from "../src/probeField.js";
import { diskDomain, segmentDomain, ellipseDomain } from "../src/potentialDomain.js";
import { offDiskDomain } from "../src/generalDomains.js";

// PT-6b — the hover-probe / test-charge field evaluator, checked against closed-form g_K / |∇g_K|.

const hypot = (w: readonly [number, number]): number => Math.hypot(w[0], w[1]);

describe("invertPsi", () => {
  it("inverts the disk map Ψ(w) = r·w exactly", () => {
    const d = diskDomain(1.2);
    const inv = invertPsi(d, [3, 0]);
    expect(inv).not.toBeNull();
    expect(inv?.w[0]).toBeCloseTo(2.5, 9); // w = z/r = 3/1.2
    expect(inv?.w[1]).toBeCloseTo(0, 9);
  });
  it("picks the exterior branch |w| ≥ 1 of the segment map", () => {
    const d = segmentDomain(1); // Ψ(w) = ½(w + 1/w), cap = ½
    const inv = invertPsi(d, [2, 0]); // ½(w+1/w)=2 ⇒ w = 2±√3; the exterior root is 2+√3
    if (!inv) throw new Error("expected an exterior preimage");
    expect(hypot(inv.w)).toBeCloseTo(2 + Math.sqrt(3), 6);
  });
});

describe("probeExterior — disk (cap = r)", () => {
  const d = diskDomain(1.2);
  it("g_K = log(|z|/r), U^μ = −log|z|, |E| = 1/|z| outside", () => {
    const p = probeExterior(d, [3, 0]);
    expect(p.inside).toBe(false);
    expect(p.gK).toBeCloseTo(Math.log(3 / 1.2), 6);
    expect(p.potential).toBeCloseTo(-Math.log(3), 6); // −log cap − g_K = −log 1.2 − log(3/1.2) = −log 3
    expect(p.field).toBeCloseTo(1 / 3, 6);
    expect(p.fieldDir[0]).toBeCloseTo(1, 6); // radially outward
    expect(p.fieldDir[1]).toBeCloseTo(0, 6);
    expect(p.wAbs).toBeCloseTo(2.5, 6);
  });
  it("reports the grounded surface inside K: g_K = 0, U^μ = γ = −log cap", () => {
    const p = probeExterior(d, [0.4, -0.2]);
    expect(p.inside).toBe(true);
    expect(p.gK).toBe(0);
    expect(p.field).toBe(0);
    expect(p.potential).toBeCloseTo(-Math.log(1.2), 9);
  });
  it("handles z = origin (the seed z/cap collapses to 0) without producing NaN", () => {
    for (const dom of [diskDomain(1.2), segmentDomain(1), ellipseDomain(2, 1)]) {
      const p = probeExterior(dom, [0, 0]);
      expect(p.inside).toBe(true);
      expect(Number.isFinite(p.gK)).toBe(true);
      expect(Number.isFinite(p.potential)).toBe(true);
      expect(p.field).toBe(0);
    }
  });
});

describe("probeExterior — segment [−1, 1]", () => {
  const d = segmentDomain(1); // cap = ½
  it("matches g_K = log|z+√(z²−1)| and |E| = 1/|√(z²−1)| at z = 2", () => {
    const p = probeExterior(d, [2, 0]);
    expect(p.gK).toBeCloseTo(Math.log(2 + Math.sqrt(3)), 6);
    expect(p.field).toBeCloseTo(1 / Math.sqrt(3), 6); // 1/√(4−1)
  });
  it("matches |E| off the real axis at z = 2i", () => {
    const p = probeExterior(d, [0, 2]); // √(z²−1) = √(−5) = i√5 ⇒ |E| = 1/√5
    expect(p.field).toBeCloseTo(1 / Math.sqrt(5), 6);
  });
});

describe("probeExterior — ellipse focal check", () => {
  it("agrees with the confocal-ellipse Green's function on a 2:1 ellipse", () => {
    const d = ellipseDomain(2, 1); // Ψ(w) = 1.5 w + 0.5 w⁻¹, cap = 1.5
    const z: [number, number] = [3, 1];
    const p = probeExterior(d, z);
    // Re-derive g_K from the inverse and compare with the direct log|w|.
    const inv = invertPsi(d, z);
    if (!inv) throw new Error("expected an exterior preimage");
    expect(p.gK).toBeCloseTo(Math.log(Math.hypot(inv.w[0], inv.w[1])), 9);
    expect(p.potential).toBeCloseTo(-Math.log(1.5) - p.gK, 9);
  });
});

describe("probeGeneral — off-centre disk (cap ≈ 1)", () => {
  const d = offDiskDomain(); // unit disk centred at (0.55, 0.35)
  it("recovers g_K ≈ log(dist) and |E| ≈ 1/dist far outside (log-lightning ≈)", () => {
    const z: [number, number] = [0.55 + 3, 0.35]; // distance 3 from the centre
    const p = probeGeneral(d, z);
    expect(p.inside).toBe(false);
    expect(p.gK).toBeCloseTo(Math.log(3), 2);
    expect(p.field).toBeCloseTo(1 / 3, 2);
    expect(Number.isNaN(p.wAbs)).toBe(true);
  });
  it("reports the grounded surface at the centre", () => {
    const p = probeGeneral(d, [0.55, 0.35]);
    expect(p.inside).toBe(true);
    expect(p.gK).toBe(0);
    expect(p.field).toBe(0);
  });
});
