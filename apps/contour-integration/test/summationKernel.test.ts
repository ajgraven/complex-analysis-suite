// The summation kernels, and the poles LEGALITY could not see.
//
// `π cot(πz)` has a simple pole at every integer with residue exactly 1; `π csc(πz)` has one at every
// integer with residue exactly `(−1)ⁿ`. The alternation is the KERNEL's, not `f`'s — which is why
// `Σ(−1)ⁿ/n²` costs nothing once `Σ1/n²` exists.
import { describe, expect, it } from "vitest";
import { Gauss } from "@cas/exact";
import { makeComplexFn, parse } from "@cas/expr";
import type { Cx } from "../src/kernel/geom.js";
import {
  asSummationKernel,
  kernelPoles,
  kernelResidue,
  kernelResidues,
} from "../src/kernel/summationKernel.js";
import { findPoles } from "../src/kernel/poles.js";
import { analyse } from "../src/engine/analyse.js";
import { squareTemplate } from "../src/engine/contour/templates.js";
import { setParam } from "../src/engine/contour/edit.js";

const must = <T>(v: T | null, what: string): T => {
  if (v === null) throw new Error(`expected ${what}`);
  return v;
};

describe("kernelResidue", () => {
  it("is 1 at every integer for cot, and alternates for csc", () => {
    for (const n of [-5n, -2n, -1n, 0n, 1n, 2n, 7n]) {
      expect(kernelResidue("cot", n).equals(Gauss.ONE), `cot at ${n}`).toBe(true);
      const want = ((n % 2n) + 2n) % 2n === 0n ? Gauss.ONE : Gauss.ONE.neg();
      expect(kernelResidue("csc", n).equals(want), `csc at ${n}`).toBe(true);
    }
  });

  it("matches a direct numeric residue, which is the only independent check available", () => {
    // `Res(K, n) = lim (z−n)K(z)`, measured on a small circle. The engine ASSERTS the value from the
    // theorem; this compares it against arithmetic that shares nothing with it.
    for (const [src, kind] of [["pi*cot(pi*z)", "cot"], ["pi*csc(pi*z)", "csc"]] as const) {
      const fn = makeComplexFn(parse(src));
      for (const n of [0, 1, 2, 3, 4]) {
        let sum: Cx = [0, 0];
        const m = 512;
        const r = 0.05;
        for (let k = 0; k < m; k++) {
          const t = (2 * Math.PI * k) / m;
          const z: Cx = [n + r * Math.cos(t), r * Math.sin(t)];
          const [fr, fi] = fn(z as [number, number], [0, 0]) as Cx;
          // ∮ f dz / 2πi with dz = i·r·e^{it}·dt
          const [dr, di] = [-r * Math.sin(t), r * Math.cos(t)];
          sum = [sum[0] + (fr * dr - fi * di), sum[1] + (fr * di + fi * dr)];
        }
        const scale = (2 * Math.PI) / m / (2 * Math.PI);
        const [re, im] = [sum[1] * scale, -sum[0] * scale];
        const want = kernelResidue(kind, BigInt(n)).toTuple();
        expect(re, `${kind} at ${n}`).toBeCloseTo(want[0], 9);
        expect(im, `${kind} at ${n}`).toBeCloseTo(want[1], 9);
      }
    }
  });
});

describe("asSummationKernel", () => {
  it("reads the kernel whatever order the factors are written in", () => {
    for (const src of ["pi*cot(pi*z)/z^2", "cot(pi*z)*pi/z^2", "(pi/z^2)*cot(pi*z)"]) {
      const k = must(asSummationKernel(parse(src)), `a kernel in ${src}`);
      expect(k.kind).toBe("cot");
      expect(k.num.degree()).toBe(0);
      expect(k.den.degree()).toBe(2);
    }
    expect(must(asSummationKernel(parse("pi*csc(pi*z)/z^2")), "csc").kind).toBe("csc");
  });

  it("REQUIRES the leading π, because it is a factor of π on every term", () => {
    // `cot(πz)` has residue `1/π` at each integer, so an integrand written without the π is a
    // different sum. Research 03 §8 drops exactly this π one level up and its bound stops being one.
    expect(asSummationKernel(parse("cot(pi*z)/z^2"))).toBeNull();
    expect(asSummationKernel(parse("cot(pi*z)/(pi*z^2)"))).toBeNull();
    // TWO πs is not the kernel times a cofactor either — there is no π in ℚ(i) to put the second one.
    expect(asSummationKernel(parse("pi*pi*cot(pi*z)/z^2"))).toBeNull();
  });

  it("gives a NUMERIC coefficient to the cofactor, where it belongs", () => {
    // `2π cot(πz)/z²` is the kernel times `2/z²`, and its residue at `n` is `2/n²`. Exactly ONE π
    // is the kernel's; everything else in the numerator is `f`, which is what makes the check a
    // count rather than a pattern.
    const k = must(asSummationKernel(parse("2*pi*cot(pi*z)/(z^2+1)")), "a kernel");
    const r = kernelResidues(k, 2n);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const t of r.terms) {
      expect(t.residue.toTuple()[0]).toBeCloseTo(2 / (Number(t.n) ** 2 + 1), 14);
    }
  });

  it("REQUIRES the argument to be exactly π·z", () => {
    // `cot(2πz)` has poles every half-integer and `cot(z)` every π: different pole sets, different
    // residues, and neither is the sum this kernel evaluates.
    expect(asSummationKernel(parse("pi*cot(2*pi*z)/z^2"))).toBeNull();
    expect(asSummationKernel(parse("pi*cot(z)/z^2"))).toBeNull();
    expect(asSummationKernel(parse("pi*cot(pi*z+1)/z^2"))).toBeNull();
  });

  it("declines what is not a kernel at all", () => {
    expect(asSummationKernel(parse("1/(1+z^2)"))).toBeNull();
    expect(asSummationKernel(parse("pi*tan(pi*z)/z^2"))).toBeNull();
    expect(asSummationKernel(parse("z^2/(pi*cot(pi*z))"))).toBeNull();
    // Two kernels is not a shape this reads, rather than one silently ignored.
    expect(asSummationKernel(parse("pi*cot(pi*z)*cot(pi*z)"))).toBeNull();
  });
});

describe("kernelResidues", () => {
  it("is f(n) for cot and (−1)ⁿf(n) for csc, exactly", () => {
    // `f = 1/(z²+1)`: no pole at any integer, so every term is clean. `f(n) = 1/(n²+1)`.
    const cot = kernelResidues(must(asSummationKernel(parse("pi*cot(pi*z)/(z^2+1)")), "cot"), 3n);
    expect(cot.ok).toBe(true);
    if (!cot.ok) return;
    expect(cot.terms).toHaveLength(7);
    for (const t of cot.terms) {
      const [re, im] = t.residue.toTuple();
      expect(re).toBeCloseTo(1 / (Number(t.n) ** 2 + 1), 14);
      expect(im).toBeCloseTo(0, 14);
    }

    const csc = kernelResidues(must(asSummationKernel(parse("pi*csc(pi*z)/(z^2+1)")), "csc"), 3n);
    if (!csc.ok) return;
    for (const t of csc.terms) {
      const sign = ((t.n % 2n) + 2n) % 2n === 0n ? 1 : -1;
      expect(t.residue.toTuple()[0]).toBeCloseTo(sign / (Number(t.n) ** 2 + 1), 14);
    }
  });

  it("sums to the partial sum the square's own quadrature reads off", () => {
    // Two computations sharing no arithmetic: the exact residues over ℚ(i) here, and the contour
    // integral over `Γ_N` in `square.test.ts`. `∮ = 2πi·Σ residues`, so at `f = 1/(z²+1)` with the
    // origin included the sum is `Σ_{|n|≤N} 1/(n²+1)`.
    const k = must(asSummationKernel(parse("pi*cot(pi*z)/(z^2+1)")), "a kernel");
    const r = kernelResidues(k, 4n);
    if (!r.ok) return;
    const exact = r.terms.reduce((a, t) => a + t.residue.toTuple()[0], 0);
    const want = Array.from({ length: 9 }, (_, j) => 1 / ((j - 4) ** 2 + 1)).reduce((a, b) => a + b, 0);
    expect(exact).toBeCloseTo(want, 14);
  });

  it("REFUSES a collision by name rather than dividing by zero", () => {
    // G1's `f = 1/z²` collides with the kernel at `n = 0`: the two poles merge into a triple one,
    // the true residue is `−π²/3`, and `Res(K·f, 0) = f(0)` is not merely inaccurate but undefined.
    // It needs the Laurent expansion and lands in ℚ(i)(π) — a different computation, and M5.7's.
    const k = must(asSummationKernel(parse("pi*cot(pi*z)/z^2")), "a kernel");
    const r = kernelResidues(k, 3n);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/pole at z = 0, where the kernel has one too/);
    expect(r.reason).toMatch(/MERGE/);
    expect(r.certificate.level).toBe("⚠");
    // …and away from the collision the same cofactor is fine, which is what makes the refusal about
    // the point rather than about the integrand.
    const shifted = kernelResidues(must(asSummationKernel(parse("pi*cot(pi*z)/(z-0.5)^2")), "k"), 3n);
    expect(shifted.ok).toBe(true);
  });
});

describe("the poles LEGALITY could not see", () => {
  it("findPoles reports NONE for a cot kernel — the hole this closes", () => {
    // Not a criticism of `findPoles`: no reader in the app sees a transcendental, and reporting
    // nothing is honest. What was not honest is the ledger row built on top of it.
    expect(findPoles(parse("pi*cot(pi*z)/(z^2+1)")).poles).toHaveLength(0);
  });

  it("lists every integer in the band, each a simple pole", () => {
    expect(kernelPoles(2n).map((p) => p.at[0])).toEqual([-2, -1, 0, 1, 2]);
    expect(kernelPoles(2n).every((p) => p.order === 1 && p.at[1] === 0)).toBe(true);
    expect(kernelPoles(0n).map((p) => p.at[0])).toEqual([0]);
  });

  const run = (src: string, n: number, withKernel: boolean) => {
    const ast = parse(src);
    const fn = makeComplexFn(ast);
    const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
    const kernel = asSummationKernel(ast);
    return analyse({
      ast,
      f,
      poles: findPoles(ast),
      contour: setParam(squareTemplate(2), "N", n),
      ...(withKernel && kernel !== null ? { summation: { kernel } } : {}),
    });
  };

  it("REFUSES an integer half-width, where the sides run through the kernel's poles", () => {
    // `N = 1.5` puts the half-width at 2 exactly, so the vertical sides `x = ±2` pass through the
    // poles at `z = ±2`. Before the kernel was handed over, LEGALITY said every singularity was
    // clear of the contour — about a contour passing through infinitely many of them.
    const blind = run("pi*cot(pi*z)/(z^2+1)", 1.5, false);
    const legality = blind.ledger.rows.filter((r) => r.constraint === "LEGALITY");
    expect(legality.every((r) => r.status === "satisfied")).toBe(true);

    const seeing = run("pi*cot(pi*z)/(z^2+1)", 1.5, true);
    expect(seeing.ledger.rows.some((r) => r.constraint === "LEGALITY" && r.status !== "satisfied")).toBe(
      true,
    );
  });

  it("passes at a half-integer half-width, which is the whole point of the offset", () => {
    for (const n of [0, 1, 2, 5]) {
      const a = run("pi*cot(pi*z)/(z^2+1)", n, true);
      const legality = a.ledger.rows.filter((r) => r.constraint === "LEGALITY");
      expect(legality.every((r) => r.status === "satisfied"), `N = ${n}`).toBe(true);
    }
  });

  it("counts the enclosed integers, which a window on an infinite set must get right", () => {
    // At `N = 2` the square has half-width 2.5 and encloses `n = −2…2`: five of the kernel's poles,
    // plus none of the cofactor's (`±i` are inside too, so seven in all).
    const a = run("pi*cot(pi*z)/(z^2+1)", 2, true);
    const enclosed = a.integral.windings.filter((w) => w.decided && w.n !== 0);
    expect(enclosed.filter((w) => Math.abs(w.at[1]) < 1e-12)).toHaveLength(5);
  });
});
