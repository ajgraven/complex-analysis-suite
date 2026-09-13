// `Res(K·f, n)` at a merged pole — the collision, and the ring it lands in.
//
// The value is checked two ways, as the gallery checks it: against the closed form the series
// predicts, and against a TRAPEZOID on a small circle about the pole — a route sharing nothing with
// the Laurent arithmetic (no Bernoulli number, no exact shift, no ℚ(i)(π)). A sign error in the
// kernel series, a dropped `(−1)ⁿ` or an off-by-one in the convolution all survive the first check
// and none survives the second.
import { describe, expect, it } from "vitest";
import { Gauss, QiPoly } from "@cas/exact";
import { parse } from "@cas/expr";
import { asSummationKernel } from "../src/kernel/summationKernel.js";
import { mergedResidue } from "../src/kernel/mergedResidue.js";
import { formatRatPi } from "../src/kernel/ratPi.js";
import { makeComplexFn } from "@cas/expr";

const kernelOf = (src: string) => {
  const k = asSummationKernel(parse(src));
  if (k === null) throw new Error(`no kernel in ${src}`);
  return k;
};

const merged = (src: string, n: bigint) => {
  const k = kernelOf(src);
  const r = mergedResidue(k.kind, k.num, k.den, n);
  if (!r.ok) throw new Error(r.reason);
  return r;
};

/**
 * `(1/2πi)∮ f dz` on `|z − centre| = ρ`, by the trapezoid rule.
 *
 * Spectrally accurate for a periodic analytic integrand, which this is once the circle avoids every
 * other pole — so 4096 points reach ~1e-14 and the comparison is sharp enough to see a wrong
 * Bernoulli number, not merely a wrong sign.
 */
function residueByQuadrature(src: string, centre: number, radius: number, n = 4096): [number, number] {
  const f = makeComplexFn(parse(src));
  let [re, im] = [0, 0];
  for (let k = 0; k < n; k++) {
    const t = (2 * Math.PI * k) / n;
    const z: [number, number] = [centre + radius * Math.cos(t), radius * Math.sin(t)];
    const v = f(z, [0, 0]);
    // `∮ f dz = ∫ f·(i ρ e^{it}) dt`, so `(1/2πi)∮ = (1/2π)∫ f·ρe^{it} dt` — the `i` CANCELS, and a
    // first draft that kept it returned the residue rotated a quarter turn, putting a real answer
    // entirely in the imaginary part. The weight is `ρe^{it}`, not `iρe^{it}`.
    const w: [number, number] = [radius * Math.cos(t), radius * Math.sin(t)];
    re += v[0] * w[0] - v[1] * w[1];
    im += v[0] * w[1] + v[1] * w[0];
  }
  return [re / n, im / n];
}

describe("G1's own residue: Res(π cot(πz)/z², 0) = −π²/3", () => {
  it("is exact in ℚ(i)(π), at a merged pole of order 3", () => {
    const r = merged("pi*cot(pi*z)/z^2", 0n);
    expect(r.order).toBe(3);
    expect(formatRatPi(r.value)).toBe("−π²/3");
    expect(r.value.toNumber()[0]).toBeCloseTo(-(Math.PI * Math.PI) / 3, 12);
  });

  it("and a circle trapezoid agrees, sharing no arithmetic with it", () => {
    const [re, im] = residueByQuadrature("pi*cot(pi*z)/z^2", 0, 0.25);
    expect(re).toBeCloseTo(-(Math.PI * Math.PI) / 3, 10);
    expect(im).toBeCloseTo(0, 10);
  });

  it("the csc companion is +π²/6 — G3, and it costs nothing once G1 exists", () => {
    const r = merged("pi*csc(pi*z)/z^2", 0n);
    expect(r.order).toBe(3);
    expect(formatRatPi(r.value)).toBe("π²/6");
    const [re] = residueByQuadrature("pi*csc(pi*z)/z^2", 0, 0.25);
    expect(re).toBeCloseTo((Math.PI * Math.PI) / 6, 10);
  });
});

describe("the kernel series is the thing being asserted", () => {
  it("a fourth-order cofactor reaches k = 2, and the quadrature still agrees", () => {
    // `1/z⁴` merges to order 5 and pulls in `t₂ = −1/45`: `Res = −π⁴/45`. Nothing below this in the
    // gallery exercises the second Bernoulli number, and a table mistyped there would pass every
    // G1/G3 test.
    const r = merged("pi*cot(pi*z)/z^4", 0n);
    expect(r.order).toBe(5);
    expect(formatRatPi(r.value)).toBe("−π⁴/45");
    const [re] = residueByQuadrature("pi*cot(pi*z)/z^4", 0, 0.25);
    expect(re).toBeCloseTo(-(Math.PI ** 4) / 45, 8);
  });

  it("csc's fourth-order companion is a DIFFERENT number, not a sign flip", () => {
    // `π csc(πz) = 1/u + π²u/6 + 7π⁴u³/360`, so this is `7π⁴/360` where cot gives `−π⁴/45`. The two
    // series differ by more than a sign from k = 2 onward, which is the claim `2^{2k} − 2` makes.
    const r = merged("pi*csc(pi*z)/z^4", 0n);
    expect(formatRatPi(r.value)).toBe("7π⁴/360");
    const [re] = residueByQuadrature("pi*csc(pi*z)/z^4", 0, 0.25);
    expect(re).toBeCloseTo((7 * Math.PI ** 4) / 360, 8);
  });

  it("an ODD-order collision picks up f's own constant term as well", () => {
    // `1/z³` merges to order 4; `c₀` is zero and `c_{−2}` is zero, so only `c_{−1}`… which the
    // kernel's EVEN expansion never multiplies. The residue is therefore 0 — a fact about parity,
    // and one a reader would not guess.
    const r = merged("pi*cot(pi*z)/z^3", 0n);
    expect(r.order).toBe(4);
    expect(r.value.isZero()).toBe(true);
    const [re, im] = residueByQuadrature("pi*cot(pi*z)/z^3", 0, 0.25);
    expect(Math.hypot(re, im)).toBeLessThan(1e-9);
  });
});

describe("away from the origin, and where there is nothing to merge", () => {
  it("cot is π-PERIODIC, so the same collision at n = 3 gives the same residue", () => {
    const r = merged("pi*cot(pi*z)/(z-3)^2", 3n);
    expect(formatRatPi(r.value)).toBe("−π²/3");
    const [re] = residueByQuadrature("pi*cot(pi*z)/(z-3)^2", 3, 0.25);
    expect(re).toBeCloseTo(-(Math.PI * Math.PI) / 3, 10);
  });

  it("csc ALTERNATES, so the same collision at an odd n flips sign", () => {
    expect(formatRatPi(merged("pi*csc(pi*z)/(z-2)^2", 2n).value)).toBe("π²/6");
    expect(formatRatPi(merged("pi*csc(pi*z)/(z-3)^2", 3n).value)).toBe("−π²/6");
    const [re] = residueByQuadrature("pi*csc(pi*z)/(z-3)^2", 3, 0.25);
    expect(re).toBeCloseTo(-(Math.PI * Math.PI) / 6, 10);
  });

  it("refuses where there is no collision, rather than returning the ordinary residue", () => {
    // `f` is regular at 1, so `Res(K·f, 1) = f(1)` — a DIFFERENT computation, and a caller that
    // reached here by mistake should hear so instead of getting a plausible number.
    const k = kernelOf("pi*cot(pi*z)/z^2");
    const r = mergedResidue(k.kind, k.num, k.den, 1n);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/does not vanish at z = 1.*no collision/s);
  });

  it("refuses an identically zero denominator", () => {
    const r = mergedResidue("cot", QiPoly.constant(Gauss.ONE), QiPoly.zero(), 0n);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/identically zero/);
  });
});
