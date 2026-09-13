// `Res(K·f, z₀)` at a pole of the COFACTOR — where the kernel is the thing being evaluated, and
// where tier G's answer actually comes from.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { makeComplexFn, parse } from "@cas/expr";
import type { Cx } from "../src/kernel/geom.js";
import {
  addRatio,
  cofactorResidues,
  kernelOverPi,
  ratioOf,
  ratioToTuple,
  scaleRatio,
} from "../src/kernel/kernelResidue.js";
import { asSummationKernel } from "../src/kernel/summationKernel.js";
import { ExpSum } from "../src/kernel/expSum.js";

const must = <T>(v: T | null, what: string): T => {
  if (v === null) throw new Error(`expected ${what}`);
  return v;
};

const kernelOf = (src: string) => must(asSummationKernel(parse(src)), `a kernel in ${src}`);

/** `Res(g, z₀)` measured on a small circle — arithmetic sharing nothing with the exact route. */
function numericResidue(src: string, z0: Cx, r = 0.03, m = 4096): Cx {
  const fn = makeComplexFn(parse(src));
  let sum: Cx = [0, 0];
  for (let k = 0; k < m; k++) {
    const t = (2 * Math.PI * k) / m;
    const z: Cx = [z0[0] + r * Math.cos(t), z0[1] + r * Math.sin(t)];
    const [fr, fi] = fn(z as [number, number], [0, 0]) as Cx;
    const [dr, di] = [-r * Math.sin(t), r * Math.cos(t)];
    sum = [sum[0] + (fr * dr - fi * di), sum[1] + (fr * di + fi * dr)];
  }
  const s = (2 * Math.PI) / m / (2 * Math.PI);
  return [sum[1] * s, -sum[0] * s];
}

describe("ExpRatio arithmetic", () => {
  it("adds by cross-multiplication, exactly", () => {
    const half = { num: ExpSum.fromSqrtExt(SqrtExt.ONE), den: ExpSum.fromSqrtExt(SqrtExt.fromGauss(Gauss.int(2))) };
    const third = { num: ExpSum.fromSqrtExt(SqrtExt.ONE), den: ExpSum.fromSqrtExt(SqrtExt.fromGauss(Gauss.int(3))) };
    const sum = must(addRatio(half, third), "a sum");
    expect(ratioToTuple(sum)[0]).toBeCloseTo(5 / 6, 15);
    expect(ratioToTuple(ratioOf(ExpSum.fromSqrtExt(SqrtExt.fromGauss(Gauss.int(7)))))[0]).toBe(7);
    expect(ratioToTuple(scaleRatio(half, SqrtExt.fromGauss(Gauss.int(6))))[0]).toBeCloseTo(3, 15);
  });

  it("REFUSES a product that would leave one quadratic extension", () => {
    // `√2 · √3` is in neither ℚ(i)(√2) nor ℚ(i)(√3), and `SqrtExt` throws rather than pretend. A
    // sum may hold both in separate TERMS; a product may not, so `mul` returns null where `add`
    // keeps the terms apart.
    const r2 = ExpSum.fromSqrtExt(SqrtExt.of(Gauss.ZERO, Gauss.ONE, 2n));
    const r3 = ExpSum.fromSqrtExt(SqrtExt.of(Gauss.ZERO, Gauss.ONE, 3n));
    expect(r2.mul(r3)).toBeNull();
    expect(r2.mul(r2)?.toTuple()[0]).toBeCloseTo(2, 14);
  });
});

describe("kernelOverPi", () => {
  const check = (kind: "cot" | "csc", z0: Gauss) => {
    const got = must(kernelOverPi(kind, z0), `${kind} at a non-integer`);
    const [zr, zi] = z0.toTuple();
    // `cot(πz) = cos/sin`, `csc(πz) = 1/sin`, evaluated independently in float.
    const src = kind === "cot" ? `cot(pi*z)` : `csc(pi*z)`;
    const fn = makeComplexFn(parse(src));
    const [wr, wi] = fn([zr, zi], [0, 0]) as Cx;
    const [gr, gi] = ratioToTuple(got);
    expect(gr, `${kind} at ${zr}+${zi}i`).toBeCloseTo(wr, 10);
    expect(gi, `${kind} at ${zr}+${zi}i`).toBeCloseTo(wi, 10);
  };

  it("is cot(πz₀) and csc(πz₀), checked against an independent evaluation", () => {
    for (const [re, im] of [
      [0n, 3n],
      [0n, 1n],
      [1n, 2n],
      [3n, 5n],
      [-2n, 1n],
    ] as const) {
      const z0 = new Gauss(Frac.of(re, 4n), Frac.of(im, 4n));
      check("cot", z0);
      check("csc", z0);
    }
  });

  it("REFUSES an integer, where the kernel has its own pole", () => {
    // `q = e^{2πin} = 1`, so the quotient's denominator vanishes — the COLLISION, seen from the side
    // of the cofactor rather than from the kernel's. Both sides name it, so neither can reach a
    // division by zero through the other's silence.
    for (const n of [0n, 1n, -3n]) {
      expect(kernelOverPi("cot", new Gauss(Frac.of(n), Frac.ZERO))).toBeNull();
      expect(kernelOverPi("csc", new Gauss(Frac.of(n), Frac.ZERO))).toBeNull();
    }
    // …and a half-integer is fine, where `cot` vanishes and `csc` is ±1.
    expect(kernelOverPi("cot", new Gauss(Frac.of(1n, 2n), Frac.ZERO))).not.toBeNull();
  });

  it("is −i·coth(πa) at z₀ = ia, which is the name tier G knows it by", () => {
    // The ratio does not carry the name — `coth` is a property of THIS z₀, while the ratio is what
    // the arithmetic works in. Here is the identity that makes the name right.
    for (const a of [0.25, 0.75, 1, 2.5]) {
      const z0 = new Gauss(Frac.ZERO, Frac.of(BigInt(Math.round(a * 4)), 4n));
      const [gr, gi] = ratioToTuple(must(kernelOverPi("cot", z0), "cot at ia"));
      expect(gr).toBeCloseTo(0, 12);
      expect(gi).toBeCloseTo(-1 / Math.tanh(Math.PI * a), 10);
    }
  });
});

describe("cofactorResidues — G2's two poles", () => {
  it("is K(z₀)·Res(f, z₀), matching a numeric contour residue", () => {
    // `a = 3/4`, poles at `±3i/4`. The exact route evaluates the kernel symbolically; the check
    // integrates `π cot(πz)/(z²+a²)` round a small circle and shares none of that arithmetic.
    const r = cofactorResidues(kernelOf("pi*cot(pi*z)/(z^2+9/16)"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.at).toHaveLength(2);
    for (const term of r.at) {
      const [zr, zi] = term.z.toTuple();
      const [er, ei] = ratioToTuple(term.value);
      const [nr, ni] = numericResidue("pi*cot(pi*z)/(z^2+9/16)", [zr, zi]);
      // The exact value is in UNITS OF π, so scale before comparing.
      expect(Math.PI * er, `Re at ${zr}+${zi}i`).toBeCloseTo(nr, 8);
      expect(Math.PI * ei, `Im at ${zr}+${zi}i`).toBeCloseTo(ni, 8);
    }
  });

  it("sums to −(1/a)coth(πa) in units of π — which is G2's answer, negated", () => {
    // `Σ_{n∈ℤ} f(n) = −Σ_j Res(Kf, z_j)`, so this total IS the answer with its sign flipped. The
    // `2πi` of the residue theorem never appears: `∮ → 0` takes the whole left-hand side with it.
    for (const [n, d, a] of [
      [3n, 4n, 0.75],
      [1n, 1n, 1],
      [23n, 10n, 2.3],
      [1n, 5n, 0.2],
    ] as const) {
      const r = cofactorResidues(kernelOf(`pi*cot(pi*z)/(z^2+${n * n}/${d * d})`));
      expect(r.ok, `a = ${a}`).toBe(true);
      if (!r.ok) return;
      const [re, im] = ratioToTuple(r.total);
      expect(im, `a = ${a}`).toBeCloseTo(0, 10);
      expect(re, `a = ${a}`).toBeCloseTo(-(1 / a) / Math.tanh(Math.PI * a), 9);
      // …and π times it, negated, is the sum the record claims.
      expect(-Math.PI * re).toBeCloseTo((Math.PI / a) / Math.tanh(Math.PI * a), 9);
    }
  });

  it("gives the csc companion, where the alternation is the KERNEL's", () => {
    // `Σ_{n∈ℤ}(−1)ⁿ/(n²+a²) = (π/a)csch(πa)` — the same contour, the other kernel, and nothing else
    // changes. G2's own `csc-companion` invariant, which §10.3 lists as never having been run.
    for (const a of [0.75, 1, 2.3]) {
      const q = Math.round(a * 20);
      const r = cofactorResidues(kernelOf(`pi*csc(pi*z)/(z^2+${q * q}/400)`));
      expect(r.ok, `a = ${a}`).toBe(true);
      if (!r.ok) return;
      const [re] = ratioToTuple(r.total);
      expect(-Math.PI * re, `a = ${a}`).toBeCloseTo((Math.PI / a) / Math.sinh(Math.PI * a), 9);
    }
  });

  it("REFUSES a pole carrying a √d, where e^{2πiz₀} is not in the basis", () => {
    // `z² − 2` has poles at `±√2`, which are perfectly exact and still unusable: `Exponent.pi` is a
    // GAUSSIAN multiple of π, so `e^{2πi√2}` has nowhere to live. Refused by name rather than
    // approximated.
    const r = cofactorResidues(kernelOf("pi*cot(pi*z)/(z^2-2)"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/carries a √d/);
    expect(r.certificate.level).toBe("⚠");
  });

  it("REFUSES an INCOMPLETE pole list — a different failure from an unusable pole", () => {
    // `z⁵ + z + 1` has no root the exact machinery can pin, so the list is not merely awkward but
    // SHORT — and a residue sum missing a term is the one failure this tier could have and not
    // notice. Distinct from the √d case below, where the poles ARE pinned and simply have nowhere
    // to live: a mutation sweep found that nothing separated the two.
    const r = cofactorResidues(kernelOf("pi*cot(pi*z)/(z^5+z+1)"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/not every pole of the cofactor was pinned/);
    expect(r.reason).not.toMatch(/√d/);
    // …and a QUADRATIC denominator does get a complete list, so the refusal above is about the
    // quintic rather than about every denominator.
    const quadratic = cofactorResidues(kernelOf("pi*cot(pi*z)/(z^2+z+1)"));
    expect(quadratic.ok).toBe(false);
    if (quadratic.ok) return;
    expect(quadratic.reason).toMatch(/carries a √d/);
  });

  it("REFUSES a pole of order 2, where the kernel's derivatives enter", () => {
    const r = cofactorResidues(kernelOf("pi*cot(pi*z)/(z^2+9/16)^2"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/pole of order 2/);
  });

  it("leaves the collision to `mergedResidue` — the two PARTITION the pole set", () => {
    // `f = 1/(z²−1)` has poles at `±1`, both integers, where the kernel has poles too. This function
    // is the set where the kernel is REGULAR, so it reports neither and its total is zero — which is
    // exactly G1's shape (`ρ = 0`, every residue merged) rather than a refusal. It used to refuse
    // here, which was true of the identity this function applies and beside the point, because the
    // identity that applies at an integer is a different one.
    const r = cofactorResidues(kernelOf("pi*cot(pi*z)/(z^2-1)"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.at).toEqual([]);
    expect(r.total.num.isZero()).toBe(true);
  });

  it("and still reports the poles that are NOT collisions, alongside one that is", () => {
    // `1/(z²(z²+1))`: a collision at 0 and an ordinary pair at `±i`. The partition keeps the pair.
    const r = cofactorResidues(kernelOf("pi*cot(pi*z)/(z^2*(z^2+1))"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.at.length).toBe(2);
    expect(r.at.every((x) => !x.z.asGauss()?.im.isZero())).toBe(true);
  });
});
