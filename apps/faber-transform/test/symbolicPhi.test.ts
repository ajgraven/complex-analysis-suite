// symbolicPhi — build an exterior map φ: 𝔻* → Ω from a typed formula, extracting the {c, laurent} contract.
import { describe, expect, it } from "vitest";
import { buildPhiFromExpr, univalentByAreaBound } from "../src/symbolicPhi.js";
import type { ExteriorMap } from "@cas/faber";

const ok = (r: ReturnType<typeof buildPhiFromExpr>): { map: ExteriorMap; exact: boolean } => {
  if ("error" in r) throw new Error(`expected a map, got error: ${r.error}`);
  return r;
};
const near = (a: number, b: number, tol = 1e-9): boolean => Math.abs(a - b) < tol;
const lc = (map: ExteriorMap, k: number): { re: number; im: number } => map.laurent[k] ?? { re: 0, im: 0 };

describe("buildPhiFromExpr — exact rational extraction", () => {
  it("z + 0.5/z ⇒ ellipse {c:1, laurent:[0, 0.5]}, exact", () => {
    const { map, exact } = ok(buildPhiFromExpr("z + 0.5/z"));
    expect(exact).toBe(true);
    expect(near(map.c, 1)).toBe(true);
    expect(near(lc(map, 0).re, 0) && near(lc(map, 1).re, 0.5) && near(lc(map, 1).im, 0)).toBe(true);
  });

  it("z + 0.425/z^2 ⇒ deltoid (a=0.85) {c:1, laurent:[0,0,0.425]}, exact", () => {
    const { map, exact } = ok(buildPhiFromExpr("z + 0.425/z^2"));
    expect(exact).toBe(true);
    expect(near(map.c, 1)).toBe(true);
    expect(near(lc(map, 2).re, 0.425) && near(lc(map, 1).re, 0)).toBe(true);
  });

  it("z + 0.2125/z^4 ⇒ 5-cusped star (a=0.85), exact", () => {
    const { map } = ok(buildPhiFromExpr("z + 0.2125/z^4"));
    expect(near(lc(map, 4).re, 0.2125) && near(lc(map, 3).re, 0)).toBe(true);
  });

  it("a combined fraction (z^2 + 0.5)/z gives the same ellipse map", () => {
    const { map, exact } = ok(buildPhiFromExpr("(z^2 + 0.5)/z"));
    expect(exact).toBe(true);
    expect(near(map.c, 1) && near(lc(map, 1).re, 0.5)).toBe(true);
  });

  it("keeps a nonzero leading capacity: 2*z + 1/z ⇒ {c:2, laurent:[0,1]}", () => {
    const { map } = ok(buildPhiFromExpr("2*z + 1/z"));
    expect(near(map.c, 2)).toBe(true);
    expect(near(lc(map, 1).re, 1)).toBe(true);
  });

  it("rational with finite poles is truncated (not exact): z + 1/(z - 2) is ≈", () => {
    const r = buildPhiFromExpr("z + 1/(z - 2)");
    const { exact, map } = ok(r);
    expect(exact).toBe(false);
    // 1/(z−2) = 1/z + 2/z² + 4/z³ + … at ∞, so laurent[1]=1, laurent[2]=2, laurent[3]=4.
    expect(near(lc(map, 1).re, 1) && near(lc(map, 2).re, 2) && near(lc(map, 3).re, 4)).toBe(true);
  });
});

describe("buildPhiFromExpr — leading-coefficient normalization", () => {
  it("rotates a complex leading term to a real-positive capacity", () => {
    const { map } = ok(buildPhiFromExpr("(1 + i)*z + 1/z"));
    expect(near(map.c, Math.SQRT2, 1e-9)).toBe(true); // |1+i| = √2, real-positive
    // laurent[1] = ρ·1 with ρ = conj(1+i)/√2 = (1 − i)/√2
    expect(near(lc(map, 1).re, Math.SQRT1_2) && near(lc(map, 1).im, -Math.SQRT1_2)).toBe(true);
  });
});

describe("buildPhiFromExpr — rejections", () => {
  it("rejects a non-simple pole at ∞ (z^2 grows too fast)", () => {
    expect("error" in buildPhiFromExpr("z^2")).toBe(true);
  });
  it("rejects a map bounded at ∞ (1/z has no c·z term)", () => {
    expect("error" in buildPhiFromExpr("1/z")).toBe(true);
  });
  it("rejects the empty formula", () => {
    expect("error" in buildPhiFromExpr("   ")).toBe(true);
  });
});

describe("buildPhiFromExpr — transcendental FFT fallback (≈)", () => {
  it("z + exp(1/z) - 1 ⇒ laurent ≈ [0, 1, 1/2, 1/6, …] (the exp(1/z) tail), not exact", () => {
    const { map, exact } = ok(buildPhiFromExpr("z + exp(1/z) - 1"));
    expect(exact).toBe(false);
    expect(near(lc(map, 1).re, 1, 1e-3)).toBe(true);
    expect(near(lc(map, 2).re, 0.5, 1e-3)).toBe(true);
    expect(near(lc(map, 3).re, 1 / 6, 1e-3)).toBe(true);
  });
  it("rejects a transcendental map with no simple pole at ∞ (exp(z))", () => {
    expect("error" in buildPhiFromExpr("exp(z)")).toBe(true);
  });

  it("accepts a transcendental map with a COMPLEX leading term (γ compared, not |γ|)", () => {
    // (1+i)·z + exp(1/z) − 1: a valid exterior map; the pole-at-∞ guard must compare against the complex
    // leading coefficient, not its magnitude, or it would wrongly reject this.
    const { map, exact } = ok(buildPhiFromExpr("(1 + i)*z + exp(1/z) - 1"));
    expect(exact).toBe(false);
    expect(near(map.c, Math.SQRT2, 1e-6)).toBe(true); // |1+i| = √2, rotated to real-positive capacity
  });
});

describe("univalentByAreaBound", () => {
  it("passes the ellipse/deltoid (Σ k|bₖ| ≤ c) and fails an over-large coefficient", () => {
    expect(univalentByAreaBound(ok(buildPhiFromExpr("z + 0.5/z")).map)).toBe(true);
    expect(univalentByAreaBound(ok(buildPhiFromExpr("z + 0.425/z^2")).map)).toBe(true);
    expect(univalentByAreaBound(ok(buildPhiFromExpr("z + 2/z")).map)).toBe(false); // 1·2 > 1
  });
});
