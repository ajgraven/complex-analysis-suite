import { describe, expect, it } from "vitest";
import { Frac, compareFrac, fracOfDouble } from "@cas/exact";
import { SANDBOX } from "./corpus/sandbox.js";
import { insertImplicitProducts, parsePolynomial } from "../src/engine/parse.js";
import {
  conjugateClose,
  evalAt,
  fromCoeffs,
  fromExact,
  fromRoots,
  vieta,
  type Cx,
  type Polynomial,
} from "../src/engine/polynomial.js";
import { formatRadiusUpper, rootDiscs } from "../src/engine/roots/discs.js";
import { rootGroups } from "../src/engine/roots/multiplicity.js";
import { conditioning } from "../src/engine/roots/conditioning.js";
import { simplestBetween, snapRational } from "../src/engine/rational.js";
import { separate, solveRoots } from "../src/engine/roots/solve.js";
import { specOf } from "../src/shell/state.js";

function build(text: string, ring: Polynomial["ring"]): Polynomial {
  const read = parsePolynomial(text, ring);
  if (!read.ok) throw new Error(read.reason);
  const b = fromExact(read.exact, ring);
  if (!b.ok) throw new Error(b.reason);
  return b.poly;
}

describe("the corpus (PLAN §7 PRA-1 gate)", () => {
  for (const c of SANDBOX) {
    it(`${c.id}: backward-stable round trip, exact discs, decided multiplicities`, () => {
      const p = build(c.text, c.ring);
      expect(p.degree).toBe(c.multiplicities.reduce((a, b) => a + b, 0));

      // coeff → root: each root is an exact root of a polynomial within ~8ε of ours, coefficient by
      // coefficient (the solver's own stopping rule, re-checked here in plain arithmetic).
      const eps = 2.220446049250313e-16;
      for (const r of p.roots) {
        const [re, im] = evalAt(p.coeffs, r);
        const bound = p.coeffs.reduce(
          (acc, a, k) => acc + Math.hypot(a[0], a[1]) * Math.hypot(r[0], r[1]) ** k,
          0,
        );
        expect(Math.hypot(re, im)).toBeLessThanOrEqual(16 * eps * bound);
      }

      // root → coeff → root: re-solving from the Vieta coefficients moves each SIMPLE root by no more
      // than the rounding in forming those coefficients predicts. Vieta's rounding in aₖ is bounded by
      // ~n·ε·Eₖ with Eₖ the coefficients of ∏(z + |rⱼ|), so |δr| ≲ n·ε·Σ Eₖ|r|ᵏ / |p′(r)| — the
      // conditioning of the ROOT form. The roots themselves, in root form, are kept bit for bit.
      if (c.multiplicities.every((m) => m === 1)) {
        const viaRoots = fromRoots(p.roots, p.lead, "C");
        if (!viaRoots.ok) throw new Error(viaRoots.reason);
        expect(viaRoots.poly.roots).toEqual(p.roots);
        const again = fromCoeffs(viaRoots.poly.coeffs, "C");
        if (!again.ok) throw new Error(again.reason);
        const E = vieta(
          p.roots.map((r) => [-Math.hypot(r[0], r[1]), 0] as Cx),
          [Math.hypot(...p.lead), 0],
        );
        const dp = viaRoots.poly.coeffs
          .slice(1)
          .map(([re, im], k) => [re * (k + 1), im * (k + 1)] as Cx);
        p.roots.forEach((r, i) => {
          const m = Math.hypot(r[0], r[1]);
          const predicted =
            (p.degree * eps * E.reduce((acc, e, k) => acc + e[0] * m ** k, 0)) /
            Math.hypot(...evalAt(dp, r));
          const near = Math.min(
            ...again.poly.roots.map((q) => Math.hypot(q[0] - r[0], q[1] - r[1])),
          );
          expect(near, `root ${i + 1}`).toBeLessThanOrEqual(4 * predicted + 4 * eps * m);
        });
      }

      const discs = rootDiscs(p);
      expect(discs.ok).toBe(true);
      if (!discs.ok) return;
      // Every radius is an exact Frac, and the drawn radius is not below it.
      for (const d of discs.discs) {
        expect(d.radiusSq).toBeInstanceOf(Frac);
        const r = fracOfDouble(d.radius * (1 + 1e-15));
        expect(compareFrac(r.mul(r), d.radiusSq)).toBeGreaterThanOrEqual(0);
      }

      const groups = rootGroups(p, discs);
      expect(groups.ok).toBe(true);
      if (!groups.ok) return;
      const mults = groups.groups.flatMap((g) =>
        Array<number>(g.distinct ?? 1).fill(g.multiplicity),
      );
      if (p.exact) {
        expect(groups.groups.every((g) => g.exact)).toBe(true);
        expect(mults.sort((a, b) => b - a)).toEqual([...c.multiplicities]);
      }
      // Counted with multiplicity, the groups hold every root exactly once.
      expect(groups.groups.reduce((a, g) => a + g.count, 0)).toBe(p.degree);
      // Every plotted root is accounted for exactly once.
      expect(groups.groups.flatMap((g) => g.members).sort((a, b) => a - b)).toEqual(
        p.roots.map((_, i) => i),
      );
    });
  }

  it("isolates every root of every simple-rooted case: `= 1 root in D(zᵢ, ρᵢ)`", () => {
    for (const c of SANDBOX.filter((s) => s.multiplicities.every((m) => m === 1))) {
      const d = rootDiscs(build(c.text, c.ring));
      expect(d.ok, c.id).toBe(true);
      if (d.ok)
        expect(
          d.discs.every((x) => x.count === 1),
          c.id,
        ).toBe(true);
    }
  });
});

describe("multiplicity: decided in ℚ, a cluster elsewhere", () => {
  it("reads the double root of (z−1)²(z+2) as `= 2` in ℚ and `≈ cluster of 2` in ℂ", () => {
    const q = build("(z-1)^2*(z+2)", "Q");
    const qd = rootDiscs(q);
    const qg = rootGroups(q, qd);
    expect(qg.ok).toBe(true);
    if (!qg.ok) return;
    const dbl = qg.groups.find((g) => g.multiplicity === 2);
    expect(dbl?.exact).toBe(true);
    expect(dbl?.distinct).toBe(1);
    expect(dbl?.members).toHaveLength(2);

    const c = fromCoeffs(q.coeffs, "C");
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const cd = rootDiscs(c.poly);
    const cg = rootGroups(c.poly, cd);
    expect(cg.ok).toBe(true);
    if (!cg.ok) return;
    const cluster = cg.groups.find((g) => g.count === 2);
    expect(cluster?.exact).toBe(false);
    expect(cluster?.distinct).toBeNull();
    // And the simple root is still exact without ℚ: a component of ONE disc holds one simple root.
    expect(cg.groups.find((g) => g.count === 1)?.exact).toBe(true);
  });
});

describe("implicit products", () => {
  it("writes the multiplications a reader leaves out, and not inside a call", () => {
    const cases: [string, string][] = [
      ["20z", "20*z"],
      ["3z^2 - 2(z+1)", "3*z^2-2*(z+1)"],
      ["(z+1)(z-1)", "(z+1)*(z-1)"],
      ["z(z+1)", "z*(z+1)"],
      ["2 z", "2*z"],
      ["2i z", "2*i*z"],
      ["sin(z)", "sin(z)"],
      ["1.5e3z", "1.5e3*z"],
      ["x^2 - 0.5", "x^2-0.5"],
      ["+z^2 + (+3)", "z^2+(3)"],
    ];
    for (const [text, want] of cases)
      expect(insertImplicitProducts(text), text).toBe(want);
  });
});

describe("parsePolynomial refuses by name", () => {
  const cases: [string, Polynomial["ring"], RegExp][] = [
    ["", "C", /no polynomial/],
    ["z^2 +", "C", /does not parse/],
    ["sin(z)", "C", /not a rational function/],
    ["1/z + 1", "C", /non-constant denominator/],
    ["5", "C", /degree must be at least 1/],
    ["z^25 + 1", "C", /cap of 24/],
    ["z^2 + i", "R", /coefficient of z\^0 is not real/],
    ["z^2 + w", "C", /free variable 'w'/],
  ];
  for (const [text, ring, why] of cases) {
    it(`'${text}' (${ring})`, () => {
      const r = parsePolynomial(text, ring);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(why);
    });
  }

  it("reads x when x is the variable, and decimals as the rationals they name", () => {
    const r = parsePolynomial("x^2 - 0.5", "Q");
    expect(r.ok && r.variable).toBe("x");
    if (r.ok) expect(r.exact.coeff(0).re.equals(Frac.of(-1n, 2n))).toBe(true);
  });
});

describe("the dual form's constructors", () => {
  it("refuses what breaks a ring's invariant", () => {
    const bad = (b: ReturnType<typeof fromCoeffs>): string => (b.ok ? "" : b.reason);
    expect(
      bad(
        fromCoeffs(
          [
            [1, 1],
            [0, 0],
            [1, 0],
          ],
          "R",
        ),
      ),
    ).toMatch(/a0 is not real/);
    expect(
      bad(
        fromCoeffs(
          [
            [1, 0],
            [0, 0],
          ],
          "C",
        ),
      ),
    ).toMatch(/leading coefficient a1 is zero/);
    expect(
      bad(
        fromCoeffs(
          [
            [1, 0],
            [1, 0],
          ],
          "Q",
        ),
      ),
    ).toMatch(/exact rational/);
    expect(bad(fromRoots([[1, 0]], [1, 0], "Q"))).toMatch(/snap/);
    expect(bad(fromRoots([[1, 0]], [0, 1], "R"))).toMatch(/real leading/);
    expect(bad(fromCoeffs([[1, 0]], "C"))).toMatch(/at least 1/);
  });

  it("keeps real coefficients real in ℝ, and conjugate pairs exact", () => {
    const b = fromRoots(
      [
        [1, 2],
        [1, -2],
        [3, 0],
      ],
      [2, 0],
      "R",
    );
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.poly.coeffs.every((c) => c[1] === 0)).toBe(true);
    const s = fromCoeffs(b.poly.coeffs, "R");
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const [a, bb] = s.poly.roots.filter((r) => r[1] !== 0);
    expect(a[0]).toBe(bb[0]);
    expect(a[1]).toBe(-bb[1]);
    expect(s.poly.roots.some((r) => r[1] === 0)).toBe(true);
  });

  it("conjugateClose puts an unpaired root on the axis and pairs the rest exactly", () => {
    const out = conjugateClose([
      [1, 1e-17],
      [2, 3],
      [2.0000000001, -3],
    ]);
    expect(out[0]).toEqual([1, 0]);
    expect(out[1][0]).toBe(out[2][0]);
    expect(out[1][1]).toBe(-out[2][1]);
  });

  it("continues LABELS across a small coefficient step, by identity not by set", () => {
    const p = build("z^5 - z - 1", "C");
    const step = [...p.coeffs];
    step[0] = [p.coeffs[0][0] + 1e-3, 1e-3];
    const q = fromCoeffs(step, "C", p);
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    q.poly.roots.forEach((r, i) =>
      expect(Math.hypot(r[0] - p.roots[i][0], r[1] - p.roots[i][1])).toBeLessThan(0.01),
    );
    expect(q.poly.labels).toEqual(p.labels);
  });

  it("a0 around a circle enclosing no branch point returns every root to its OWN label", () => {
    // z⁵ − z − 1: the branch points of a₀ are at a₀ = −q(c) for the critical points c of z⁵ − z,
    // |c| = 5^(−1/4) ≈ 0.669, |q(c)| = 4/5·|c| ≈ 0.535 — so |a₀ + 1| = 0.2 encloses none.
    const p = build("z^5 - z - 1", "C");
    let cur: Polynomial = p;
    const steps = 400;
    for (let k = 1; k <= steps; k++) {
      const th = (2 * Math.PI * k) / steps;
      const c = [...cur.coeffs];
      c[0] = [-1 + 0.2 * Math.cos(th) - 0.2, 0.2 * Math.sin(th)];
      const next = fromCoeffs(c, "C", cur);
      if (!next.ok) throw new Error(next.reason);
      cur = next.poly;
    }
    cur.roots.forEach((r, i) =>
      expect(
        Math.hypot(r[0] - p.roots[i][0], r[1] - p.roots[i][1]),
        `root ${i + 1}`,
      ).toBeLessThan(1e-9),
    );
    expect(cur.labels).toEqual(p.labels);
  });

  it("…and around one that encloses a branch point, two labels swap", () => {
    // Centre the circle on the branch point a₀ = −q(c) for the real critical point c = 5^(−1/4).
    const p = build("z^5 - z - 1", "C");
    const c = 5 ** -0.25;
    const b = -(c ** 5 - c); // a₀ at which z⁵ − z + a₀ has a double root at c
    let cur: Polynomial = fromCoeffs([[b + 0.05, 0], ...p.coeffs.slice(1)], "C").ok
      ? (fromCoeffs([[b + 0.05, 0], ...p.coeffs.slice(1)], "C") as { poly: Polynomial })
          .poly
      : p;
    const start = cur;
    for (let k = 1; k <= 400; k++) {
      const th = (2 * Math.PI * k) / 400;
      const cc = [...cur.coeffs];
      cc[0] = [b + 0.05 * Math.cos(th), 0.05 * Math.sin(th)];
      const next = fromCoeffs(cc, "C", cur);
      if (!next.ok) throw new Error(next.reason);
      cur = next.poly;
    }
    const moved = cur.roots.filter(
      (r, i) => Math.hypot(r[0] - start.roots[i][0], r[1] - start.roots[i][1]) > 1e-6,
    );
    expect(moved).toHaveLength(2);
  });
});

describe("the sweep's survivors, each closed by the property it exposed", () => {
  it("ℝ refuses a coefficient with a NEGATIVE imaginary part too", () => {
    const b = fromCoeffs(
      [
        [1, -1],
        [0, 0],
        [1, 0],
      ],
      "R",
    );
    expect(b.ok ? "" : b.reason).toMatch(/a0 is not real/);
  });

  it("refuses degree 25 from coefficients, not only from text", () => {
    const b = fromCoeffs(
      Array.from({ length: 26 }, () => [1, 0] as Cx),
      "C",
    );
    expect(b.ok ? "" : b.reason).toMatch(/cap of 24/);
  });

  it("solves a quadratic without the textbook formula's cancellation", () => {
    // z² − 10⁸z + 1: the small root is 10⁻⁸ to 16 digits; b − √Δ cancels it to ~1e-9 relative.
    const { roots } = solveRoots([
      [1, 0],
      [-1e8, 0],
      [1, 0],
    ]);
    const small = roots.reduce((a, b) => (Math.abs(a[0]) < Math.abs(b[0]) ? a : b));
    // The true small root is 1e-8·(1 + 1e-16); the textbook formula loses ~7 digits of it.
    expect(Math.abs(small[0] - 1e-8) / 1e-8).toBeLessThan(1e-15);
  });

  it("recovers when the seeds cannot reach the roots — real seeds, complex roots", () => {
    // A real polynomial iterated from real seeds stays real for ever: z⁴ + 1 has no real root.
    const s = solveRoots(
      [
        [1, 0],
        [0, 0],
        [0, 0],
        [0, 0],
        [1, 0],
      ],
      [
        [-2, 0],
        [-1, 0],
        [1, 0],
        [2, 0],
      ],
    );
    expect(s.converged).toBe(true);
    for (const r of s.roots)
      expect(Math.abs(Math.hypot(r[0], r[1]) - 1)).toBeLessThan(1e-14);
    expect(s.roots.every((r) => Math.abs(r[1]) > 0.5)).toBe(true);
  });

  it("refines Wilkinson's roots to the integers themselves: every disc of radius exactly 0", () => {
    const w = build(Array.from({ length: 20 }, (_, i) => `(z-${i + 1})`).join("*"), "Q");
    const d = rootDiscs(w);
    expect(d.ok).toBe(true);
    if (d.ok) for (const x of d.discs) expect(x.radiusSq.isZero()).toBe(true);
    expect(w.roots.map((r) => r[0]).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it("flushes a sub-ulp component to zero: Wilkinson's roots read as real in ℂ", () => {
    // Without the flush, exact refinement leaves root 3 at 3 + 4.7e-38i (measured over the corpus:
    // 10 such components, Wilkinson and Littlewood among them), which the Roots card would print.
    const p = build(Array.from({ length: 20 }, (_, i) => `(z-${i + 1})`).join("*"), "C");
    expect(p.roots.every((r) => r[1] === 0)).toBe(true);
  });

  it("certifies a double root that the closed form returns as two IDENTICAL points", () => {
    const floats = fromCoeffs(
      [
        [1, 0],
        [-2, 0],
        [1, 0],
      ],
      "C",
    );
    if (!floats.ok) throw new Error(floats.reason);
    for (const [ring, p] of [
      ["C", floats.poly],
      ["Q", build("(z-1)^2", "Q")],
    ] as const) {
      const d = rootDiscs(p);
      expect(d.ok, ring).toBe(true);
      if (!d.ok) continue;
      expect(d.discs.map((x) => x.count)).toEqual([2, 2]);
      const g = rootGroups(p, d);
      expect(g.ok && g.groups.map((x) => [x.count, x.multiplicity, x.exact])).toEqual([
        [2, 2, ring === "Q"],
      ]);
    }
    expect(
      separate([
        [1, 0],
        [1, 0],
        [2, 0],
      ]).every((r, i, a) => a.findIndex((s) => s[0] === r[0] && s[1] === r[1]) === i),
    ).toBe(true);
  });

  it("carries a polynomial as its own truth", () => {
    expect(specOf(build("z^2 - 1/3", "Q"))).toEqual({ kind: "text", text: "z^2 - 1/3" });
    const r = fromRoots(
      [
        [1, 0],
        [2, 0],
      ],
      [1, 0],
      "C",
    );
    expect(r.ok && specOf(r.poly)).toEqual({
      kind: "roots",
      roots: [
        [1, 0],
        [2, 0],
      ],
      lead: [1, 0],
    });
    const c = fromCoeffs(
      [
        [1, 0],
        [0, 0],
        [1, 0],
      ],
      "C",
    );
    expect(c.ok && specOf(c.poly).kind).toBe("coeffs");
  });
});

describe("conditioning", () => {
  it("is exactly the ratio it names on z² − 1 at 1: (1 + 1)/|p′(1)| = 1", () => {
    const p = fromRoots(
      [
        [1, 0],
        [-1, 0],
      ],
      [1, 0],
      "C",
    );
    if (!p.ok) throw new Error(p.reason);
    const k = conditioning(p.poly);
    k.forEach((x) => expect(x.kappa).toBe(1));
    expect(k[0].gains).toEqual([0.5, 0.5]);
  });

  it("is large where Wilkinson is fragile, and infinite at a float double root", () => {
    const w = build(Array.from({ length: 20 }, (_, i) => `(z-${i + 1})`).join("*"), "Q");
    const k = conditioning(w);
    const byRoot = w.roots
      .map((r, i) => [Math.round(r[0]), k[i].kappa] as const)
      .sort((a, b) => a[0] - b[0]);
    expect(byRoot[14][1]).toBeGreaterThan(1e12); // root 15, the textbook worst
    expect(byRoot[0][1]).toBeLessThan(byRoot[14][1]);
    const d = fromRoots(
      [
        [1, 0],
        [1, 0],
      ],
      [1, 0],
      "C",
    );
    expect(d.ok && conditioning(d.poly)[0].kappa).toBe(Infinity);
  });
});

describe("snapping and the radius string", () => {
  it("snaps to the simplest rational within the tolerance", () => {
    // Brute force: no fraction with a smaller denominator lies within the tolerance.
    const s = snapRational(0.7351928, 0.001);
    expect(Math.abs(Number(s.n) / Number(s.d) - 0.7351928)).toBeLessThanOrEqual(0.001);
    for (let d = 1n; d < s.d; d++) {
      const nearest = BigInt(Math.round(0.7351928 * Number(d)));
      expect(Math.abs(Number(nearest) / Number(d) - 0.7351928)).toBeGreaterThan(0.001);
    }
    expect(s.equals(Frac.of(25n, 34n))).toBe(true);
    expect(snapRational(0.333, 0.001).equals(Frac.of(1n, 3n))).toBe(true);
    expect(snapRational(-2.49, 0.02).equals(Frac.of(-5n, 2n))).toBe(true);
    expect(snapRational(0.001, 0.01).isZero()).toBe(true);
    const e = snapRational(Math.E, 0);
    expect(e.equals(fracOfDouble(Math.E))).toBe(true);
    expect(simplestBetween(Frac.of(3n), Frac.of(3n)).equals(Frac.of(3n))).toBe(true);
    expect(() => simplestBetween(Frac.ONE, Frac.ZERO)).toThrow(/empty/);
  });

  it("prints a radius rounded UP", () => {
    expect(formatRadiusUpper(0)).toBe("0");
    expect(formatRadiusUpper(1.234e-9)).toBe("1.24e-9");
    expect(formatRadiusUpper(0.1)).toBe("0.101"); // 0.1·(1+1e-12) rounds up
    expect(Number(formatRadiusUpper(0.0123456))).toBeGreaterThanOrEqual(0.0123456);
  });
});
