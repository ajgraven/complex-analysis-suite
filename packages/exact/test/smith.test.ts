import { describe, expect, it } from "vitest";
import {
  Frac,
  Gauss,
  QiPoly,
  compareFrac,
  discsDisjoint,
  fracOfDouble,
  gaussOfDoubles,
  inDisc,
  smithDiscs,
  smithDiscsEnvelope,
  smithDiscsSeries,
  sqrtUpperBound,
} from "../src/index.js";

/** Ascending exact coefficients of ∏ (z − rᵢ). */
function fromRoots(roots: readonly Gauss[]): Gauss[] {
  let p = QiPoly.int(1);
  for (const r of roots) p = p.mul(QiPoly.variable().sub(QiPoly.constant(r)));
  return Array.from({ length: p.degree() + 1 }, (_, k) => p.coeff(k));
}

const g = (re: number, im = 0): Gauss => gaussOfDoubles(re, im);

/** A deterministic generator, so the property corpus is reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("fracOfDouble / sqrtUpperBound / compareFrac", () => {
  it("reads a double as the dyadic rational it is", () => {
    expect(fracOfDouble(0.1).equals(Frac.of(3602879701896397n, 1n << 55n))).toBe(true);
    expect(fracOfDouble(-3).equals(Frac.of(-3n))).toBe(true);
    expect(fracOfDouble(5e-324).equals(Frac.of(1n, 1n << 1074n))).toBe(true);
    expect(() => fracOfDouble(Number.NaN)).toThrow(/non-finite/);
  });

  it("bounds √s from above, tightly", () => {
    for (const s of [
      Frac.of(2n),
      Frac.of(1n, 3n),
      fracOfDouble(1e-200),
      fracOfDouble(7.5e150),
      Frac.of(9n, 4n),
    ]) {
      const r = sqrtUpperBound(s);
      expect(compareFrac(r.mul(r), s)).toBeGreaterThanOrEqual(0);
      const rel = r.toNumber() / Math.sqrt(s.toNumber()) - 1;
      expect(rel).toBeLessThan(1e-14);
    }
    expect(sqrtUpperBound(Frac.of(9n, 4n)).equals(Frac.of(3n, 2n))).toBe(true);
    expect(sqrtUpperBound(Frac.ZERO).isZero()).toBe(true);
  });

  it("orders fractions", () => {
    expect(compareFrac(Frac.of(1n, 3n), Frac.of(1n, 2n))).toBe(-1);
    expect(compareFrac(Frac.of(2n, 4n), Frac.of(1n, 2n))).toBe(0);
    expect(compareFrac(Frac.of(-1n), Frac.of(-2n))).toBe(1);
  });
});

describe("discsDisjoint / inDisc", () => {
  it("is tight: touching discs are not disjoint, and a gap no AM–GM test would see is found", () => {
    // Radii 1 and 1, centres 2 apart: they touch.
    expect(discsDisjoint(g(0), Frac.ONE, g(2), Frac.ONE)).toBe(false);
    // Radii 1 and 0, centres √1.01 apart: disjoint, though |δ|² = 1.01 < 2(1 + 0).
    expect(
      discsDisjoint(g(0), Frac.ONE, new Gauss(Frac.of(101n, 100n), Frac.ZERO), Frac.ZERO),
    ).toBe(true);
    expect(discsDisjoint(g(0), Frac.ONE, g(1), Frac.ZERO)).toBe(false); // the point is on the circle
  });

  it("decides membership on the closed disc", () => {
    const disc = { centre: g(1, 1), radiusSq: Frac.of(2n) };
    expect(inDisc(g(0, 0), disc)).toBe(true); // on the boundary
    expect(inDisc(g(-0.001, 0), disc)).toBe(false);
  });
});

describe("smithDiscs", () => {
  const cubic = fromRoots([g(1), g(2), g(3)]);

  it("gives radius zero at exact roots", () => {
    const r = smithDiscs(cubic, [g(1), g(2), g(3)]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.discs.every((d) => d.radiusSq.isZero() && d.count === 1)).toBe(true);
    expect(r.components).toBe(3);
  });

  it("isolates each simple root, and the disc really contains it", () => {
    const r = smithDiscs(cubic, [g(1.001), g(2, 1e-9), g(2.999)]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.components).toBe(3);
    [1, 2, 3].forEach((root, i) => expect(inDisc(g(root), r.discs[i])).toBe(true));
  });

  it("merges a double root's two discs into one component that counts 2", () => {
    const p = fromRoots([g(1), g(1), g(-2)]);
    const r = smithDiscs(p, [g(1, 1e-8), g(1, -1e-8), g(-2)]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.discs[0].component).toBe(r.discs[1].component);
    expect(r.discs[0].count).toBe(2);
    expect(r.discs[2].count).toBe(1);
    expect(inDisc(g(1), r.discs[0]) || inDisc(g(1), r.discs[1])).toBe(true);
  });

  it("treats exactly touching discs as one component", () => {
    // z² − 1 about −1/3 and the exact root 1: ρ = 2·|p(−1/3)/(−1/3 − 1)| = 4/3 = |−1/3 − 1|.
    const third = new Gauss(Frac.of(-1n, 3n), Frac.ZERO);
    const r = smithDiscs(fromRoots([g(-1), g(1)]), [third, g(1)]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.discs[0].radiusSq.equals(Frac.of(16n, 9n))).toBe(true);
    expect(r.components).toBe(1);
    expect(r.discs[0].count).toBe(2);
  });

  it("uses the leading coefficient", () => {
    const monic = smithDiscs(cubic, [g(1.01), g(2), g(3)]);
    const scaled = smithDiscs(
      cubic.map((c) => c.mul(Gauss.int(5, 2))),
      [g(1.01), g(2), g(3)],
    );
    expect(monic.ok && scaled.ok).toBe(true);
    if (!monic.ok || !scaled.ok) return;
    expect(monic.discs[0].radiusSq.equals(scaled.discs[0].radiusSq)).toBe(true);
  });

  it("refuses by name when the hypotheses fail", () => {
    const why = (res: ReturnType<typeof smithDiscs>): string =>
      res.ok ? "" : res.reason;
    expect(why(smithDiscs(cubic, [g(1), g(1), g(3)]))).toMatch(
      /approximations 1 and 2 coincide/,
    );
    expect(why(smithDiscs(cubic, [g(1), g(2)]))).toMatch(/2 approximations .* degree 3/);
    expect(why(smithDiscs([g(1), Gauss.ZERO], [g(0)]))).toMatch(
      /leading coefficient is zero/,
    );
    expect(why(smithDiscs([g(1)], []))).toMatch(/constant/);
  });

  it("partitions exactly as the plain pairwise Frac test does, near-touching discs included", () => {
    const rnd = lcg(7);
    const partition = (labels: readonly number[]): string =>
      labels.map((c) => labels.indexOf(c)).join(",");
    for (let trial = 0; trial < 60; trial++) {
      const n = 3 + Math.floor(rnd() * 6);
      const roots = Array.from({ length: n }, () =>
        g(Math.round(rnd() * 6 - 3) / 4, Math.round(rnd() * 6 - 3) / 4),
      );
      // Perturbations spanning the scale at which discs start to touch.
      const eps = 10 ** (-1 - rnd() * 6);
      const approx = roots.map((r, i) => {
        const [re, im] = r.toTuple();
        return g(re + eps * (rnd() - 0.5) + i * 1e-13, im + eps * (rnd() - 0.5));
      });
      const res = smithDiscs(fromRoots(roots), approx);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      const parent = approx.map((_, i) => i);
      const find = (i: number): number => (parent[i] === i ? i : find(parent[i]));
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
          if (
            !discsDisjoint(
              approx[i],
              res.discs[i].radiusSq,
              approx[j],
              res.discs[j].radiusSq,
            )
          )
            parent[find(i)] = find(j);
      expect(partition(res.discs.map((d) => d.component))).toBe(
        partition(approx.map((_, i) => find(i))),
      );
    }
  });

  it("agrees with the plain test on a pair swept across the touching threshold", () => {
    // Roots ±1 (and a third far away); the approximations drift apart, so the discs grow until they meet.
    const coeffs = fromRoots([g(-1), g(1), g(5)]);
    let sawDisjoint = false;
    let sawTouching = false;
    for (let k = 0; k <= 400; k++) {
      const t = 0.5 + (k / 400) * 0.6; // they touch near t ≈ 0.8
      const approx = [g(-1 - t, 0.1 * t), g(1 + t, -0.05 * t), g(5)];
      const res = smithDiscs(coeffs, approx);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      const plain = discsDisjoint(
        approx[0],
        res.discs[0].radiusSq,
        approx[1],
        res.discs[1].radiusSq,
      );
      expect(res.discs[0].component !== res.discs[1].component, `t = ${t}`).toBe(plain);
      if (plain) sawDisjoint = true;
      else sawTouching = true;
    }
    expect(sawDisjoint && sawTouching).toBe(true);

    // Then bisect (on the plain test) to the last disjoint and first touching doubles: pairs within a
    // relative ~1e-15 of touching, which only the exact fallback can decide.
    const at = (t: number) => [g(-1 - t, 0.1 * t), g(1 + t, -0.05 * t), g(5)];
    const plainAt = (t: number): boolean => {
      const r = smithDiscs(coeffs, at(t));
      if (!r.ok) throw new Error(r.reason);
      return discsDisjoint(at(t)[0], r.discs[0].radiusSq, at(t)[1], r.discs[1].radiusSq);
    };
    let lo = 0.5;
    let hi = 1.1;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (plainAt(mid)) lo = mid;
      else hi = mid;
    }
    for (const [t, disjoint] of [
      [lo, true],
      [hi, false],
    ] as const) {
      const r = smithDiscs(coeffs, at(t));
      expect(r.ok && r.discs[0].component !== r.discs[1].component, `t = ${t}`).toBe(
        disjoint,
      );
    }
  });

  it("property: every true root lies in its component, and each component holds exactly `count` of them", () => {
    const rnd = lcg(20260923);
    for (let trial = 0; trial < 40; trial++) {
      const n = 2 + Math.floor(rnd() * 8);
      const roots = Array.from({ length: n }, () =>
        g(Math.round(rnd() * 8 - 4) / 2, Math.round(rnd() * 8 - 4) / 2),
      );
      const coeffs = fromRoots(roots);
      // Distinct perturbed approximations, some of them far off.
      const approx = roots.map((r, i) => {
        const [re, im] = r.toTuple();
        const scale = rnd() < 0.2 ? 0.3 : 1e-6;
        return g(re + scale * (rnd() - 0.5) + i * 1e-12, im + scale * (rnd() - 0.5));
      });
      const res = smithDiscs(coeffs, approx);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      const held = new Map<number, number>();
      for (const root of roots) {
        const comps = new Set(
          res.discs.filter((d) => inDisc(root, d)).map((d) => d.component),
        );
        expect(comps.size).toBe(1); // in the union, and components are disjoint
        const c = [...comps][0];
        held.set(c, (held.get(c) ?? 0) + 1);
      }
      for (const d of res.discs) expect(held.get(d.component) ?? 0).toBe(d.count);
    }
  });
});

describe("SmithDisc.radiusUpper", () => {
  it("is never below the exact radius, and within 1e-11 of it", () => {
    const rnd = lcg(3);
    for (let t = 0; t < 30; t++) {
      const roots = [
        g(rnd() * 4 - 2, rnd() * 4 - 2),
        g(rnd() * 4 - 2, rnd()),
        g(-rnd(), rnd() * 3),
      ];
      const res = smithDiscs(
        fromRoots(roots),
        roots.map((r) =>
          g(r.toTuple()[0] + (rnd() - 0.5) * 10 ** (-3 - 6 * rnd()), r.toTuple()[1]),
        ),
      );
      if (!res.ok) continue;
      for (const d of res.discs) {
        const up = d.radiusUpper();
        const upF = fracOfDouble(up);
        expect(compareFrac(upF.mul(upF), d.radiusSq)).toBeGreaterThanOrEqual(0);
        expect(up / Math.sqrt(d.radiusSq.toNumber()) - 1).toBeLessThan(1e-11);
      }
    }
    const zero = smithDiscs(fromRoots([g(1), g(2)]), [g(1), g(2)]);
    expect(zero.ok && zero.discs[0].radiusUpper()).toBe(0);
  });
});

describe("smithDiscsEnvelope (the certified tracker's segment test, @cas/monodromy)", () => {
  const a = fromRoots([g(1), g(2), g(3)]);
  // The same cubic with its constant term moved: z³ − 6z² + 11z − 6.5.
  const b = a.map((c, k) => (k === 0 ? c.sub(new Gauss(Frac.of(1n, 2n), Frac.ZERO)) : c));
  // p_a(3.2) = 0.528 while p_b(3.2) = 0.028, and the other way round near 1: the maxima come from both.
  const z = [g(1.001), g(2, 1e-9), g(3.2)];

  it("is smithDiscs for one polynomial", () => {
    const e = smithDiscsEnvelope([a], z);
    const s = smithDiscs(a, z);
    if (!e.ok || !s.ok) throw new Error("refused");
    e.discs.forEach((d, i) => expect(d.radiusSq.equals(s.discs[i].radiusSq)).toBe(true));
    expect(e.components).toBe(s.components);
  });

  it("carries the LARGER radius disc by disc, in either order of the set", () => {
    const sa = smithDiscs(a, z);
    const sb = smithDiscs(b, z);
    if (!sa.ok || !sb.ok) throw new Error("refused");
    for (const set of [
      [a, b],
      [b, a],
    ]) {
      const e = smithDiscsEnvelope(set, z);
      if (!e.ok) throw new Error(e.reason);
      e.discs.forEach((d, i) => {
        const m = compareFrac(sa.discs[i].radiusSq, sb.discs[i].radiusSq) >= 0 ? sa : sb;
        expect(d.radiusSq.equals(m.discs[i].radiusSq)).toBe(true);
      });
    }
    // And the maximum is not always from the same polynomial here — so the test decides something.
    const fromA = sa.discs.map(
      (d, i) => compareFrac(d.radiusSq, sb.discs[i].radiusSq) >= 0,
    );
    expect(new Set(fromA).size).toBe(2);
  });

  it("refuses polynomials of different degrees, by name", () => {
    const r = smithDiscsEnvelope([a, a.slice(0, 3)], z);
    expect(!r.ok && r.reason).toMatch(/same degree/);
  });
});

describe("smithDiscsSeries (a family's segment, coefficients polynomial in its parameter)", () => {
  it("each radius is at least Smith's radius of EVERY member Σ sʳ·partᵣ, s ∈ [0, 1]", () => {
    // p_s(z) = z² − 1 + c·(s + s²): the two parts add up at s = 1, where |p| = 2c at z = ±1 — more than
    // √(Σ|vᵣ|²) = √2·c, so the Cauchy–Schwarz factor K is what makes this a bound at all.
    const c = Frac.of(1n, 10n);
    const k = new Gauss(c, Frac.ZERO);
    const zero = Gauss.ZERO;
    const parts = [
      [g(-1), zero, g(1)],
      [k, zero, zero],
      [k, zero, zero],
    ];
    const r = smithDiscsSeries(parts, [g(1), g(-1)]);
    if (!r.ok) throw new Error(r.reason);
    const cf = c.toNumber();
    for (let i = 0; i <= 100; i++) {
      const sv = i / 100;
      for (const [d, z] of [
        [0, 1],
        [1, -1],
      ] as const) {
        const value = Math.abs(z * z - 1 + cf * (sv + sv * sv));
        const smith = (2 * value) / Math.abs(z - -z);
        expect(smith).toBeLessThanOrEqual(r.discs[d].radiusUpper());
      }
    }
  });
});
