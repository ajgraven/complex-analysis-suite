// schwarzExplicitForm.test.ts — the explicit-form text (F4i). Golden formula strings for CD's two families;
// the numbers match the engine-test fixtures' documented φ / F (so a wrong conj or dropped term shows here).
import { describe, expect, it } from "vitest";
import { explicitSigmaForm } from "../src/render/schwarzExplicitForm";
import type { SchwarzPhi } from "../src/render/schwarzPhiForm";

describe("explicitSigmaForm (F4i — the closed form as text)", () => {
  it("the deltoid φ(z) = z + 0.5/z², F(z) = 1/z + 0.5·z²", () => {
    const phi: SchwarzPhi = { c: [1, 0], F: [[0, 0], [0, 0], [0.5, 0]], branches: [] };
    const f = explicitSigmaForm(phi);
    expect(f.phi).toBe("φ(z) = z + 0.5/z²");
    expect(f.F).toBe("F(z) = 1/z + 0.5·z²");
    expect(f.sigma).toBe("σ(w) = conj(F(ψ(w))),  ψ = φ⁻¹");
    expect(f.title).toContain("Unbounded-Laurent");
    expect(f.note).toContain("≈"); // the honesty note flags σ as numerical
  });

  it("a complex leading c reflects to conj(c) in F (S5-C1) — the load-bearing sign", () => {
    const phi: SchwarzPhi = { c: [1, 0.5], F: [[0, 0], [0, 0], [0.4, 0]], branches: [] };
    const f = explicitSigmaForm(phi);
    expect(f.phi).toBe("φ(z) = (1+0.5i)·z + 0.4/z²");
    expect(f.F).toBe("F(z) = (1-0.5i)/z + 0.4·z²"); // conj(c) = 1−0.5i, NOT 1+0.5i
  });

  it("a finite pole: φ and F carry the branch term (order 1 + order 2)", () => {
    const single: SchwarzPhi = { c: [1, 0], F: [], branches: [{ z: [0.2, 0], A: [[0.3, 0]] }] };
    expect(explicitSigmaForm(single).phi).toBe("φ(z) = z + 0.3·z/(1−0.2·z)");
    expect(explicitSigmaForm(single).F).toBe("F(z) = 1/z + 0.3/(z−0.2)");
    const order2: SchwarzPhi = { c: [1, 0], F: [], branches: [{ z: [0.5, 0], A: [[1, 0], [0.5, 0]] }] };
    expect(explicitSigmaForm(order2).F).toBe("F(z) = 1/z + 1/(z−0.5) + 0.5/(z−0.5)²");
  });

  it("the bounded family reads w₀ + branches (interior branch)", () => {
    const lobe: SchwarzPhi = { family: "bounded", c: [0, 0], F: [], w0: [0, 0], branches: [{ z: [0.3, 0], A: [[0.5, 0]] }] };
    const f = explicitSigmaForm(lobe);
    expect(f.phi).toBe("φ(z) = 0.5·z/(1−0.3·z)"); // the zero centre w₀ drops
    expect(f.F).toBe("F(z) = 0.5/(z−0.3)");
    expect(f.title).toContain("Bounded");
    // An off-centre w₀ shows, and conj(w₀) flips its sign in F.
    const off: SchwarzPhi = { family: "bounded", c: [0, 0], F: [], w0: [0.1, -0.2], branches: [{ z: [0.25, 0.1], A: [[0.3, 0.05]] }] };
    expect(explicitSigmaForm(off).phi.startsWith("φ(z) = 0.1-0.2i +")).toBe(true);
    expect(explicitSigmaForm(off).F.startsWith("F(z) = 0.1+0.2i +")).toBe(true); // conj(w₀)
  });

  it("a trivial φ (unit disk: F(z) = 1/z, no branches) reads cleanly", () => {
    const disk: SchwarzPhi = { c: [1, 0], F: [], branches: [] };
    expect(explicitSigmaForm(disk).phi).toBe("φ(z) = z");
    expect(explicitSigmaForm(disk).F).toBe("F(z) = 1/z");
  });
});
