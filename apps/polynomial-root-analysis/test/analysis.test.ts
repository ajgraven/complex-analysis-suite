import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { SANDBOX } from "./corpus/sandbox.js";
import { parsePolynomial } from "../src/engine/parse.js";
import {
  fromCoeffs,
  fromExact,
  type Cx,
  type Polynomial,
} from "../src/engine/polynomial.js";
import { rootDiscs } from "../src/engine/roots/discs.js";
import { convexHull, inHull } from "../src/engine/analysis/hull.js";
import { criticalPoints } from "../src/engine/analysis/critical.js";
import {
  branchPoints,
  branchPointsNumeric,
  exactDiscriminant,
} from "../src/engine/analysis/discriminant.js";
import {
  pseudozeroEvaluator,
  pseudozeroRegions,
  segmentClear,
} from "../src/engine/analysis/pseudozero.js";
import { frame } from "../src/shell/state.js";
import { evalAt } from "../src/engine/polynomial.js";

function build(text: string, ring: Polynomial["ring"] = "Q"): Polynomial {
  const r = parsePolynomial(text, ring);
  if (!r.ok) throw new Error(r.reason);
  const b = fromExact(r.exact, ring);
  if (!b.ok) throw new Error(b.reason);
  return b.poly;
}

const dist = (a: Cx, b: Cx): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const wilkinson = Array.from({ length: 20 }, (_, i) => `(z-${i + 1})`).join("*");

describe("the convex hull, exactly", () => {
  it("drops interior and collinear points and decides the closed hull", () => {
    const h = convexHull([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [1, 1],
      [1, 0],
    ]);
    expect(h.vertices).toHaveLength(4);
    expect(inHull(h, [1, 2])).toBe(true); // on an edge
    expect(inHull(h, [2, 2])).toBe(true); // a vertex
    expect(inHull(h, [2 + 2 ** -50, 1])).toBe(false); // one ulp-ish outside, decided exactly
  });

  it("handles the point and the segment", () => {
    expect(inHull(convexHull([[1, 1]]), [1, 1])).toBe(true);
    expect(inHull(convexHull([[1, 1]]), [1, 1 + 2 ** -40])).toBe(false);
    const seg = convexHull([
      [0, 0],
      [4, 0],
      [2, 0],
    ]);
    expect(seg.vertices).toHaveLength(2);
    expect(inHull(seg, [3, 0])).toBe(true);
    expect(inHull(seg, [5, 0])).toBe(false);
    expect(inHull(seg, [2, 1e-300])).toBe(false);
  });
});

describe("critical points (PLAN §7 PRA-2 gate)", () => {
  for (const c of SANDBOX) {
    it(`${c.id}: every plotted critical point lies in the hull of the plotted roots (exact test)`, () => {
      const cp = criticalPoints(build(c.text, c.ring));
      if (c.multiplicities.reduce((a, b) => a + b, 0) < 2) {
        expect(cp).toBeNull();
        return;
      }
      expect(cp?.inHull).toBe(true);
    });
  }

  it("are certified like the roots are: z⁵ − z − 1's four critical points, each in its own disc", () => {
    const cp = criticalPoints(build("z^5 - z - 1"));
    expect(cp?.points).toHaveLength(4);
    expect(cp?.discs.ok && cp.discs.components).toBe(4);
    for (const z of cp?.points ?? [])
      expect(Math.abs(Math.hypot(...z) - 5 ** -0.25)).toBeLessThan(1e-14);
  });
});

describe("the discriminant", () => {
  it("is exact on the quintic families", () => {
    expect(exactDiscriminant(build("z^5 - z - 1"))?.re.equals(Frac.of(2869n))).toBe(true);
    expect(
      exactDiscriminant(build("z^5 + 20z + 16"))?.re.equals(Frac.of(1024000000n)),
    ).toBe(true); // 32000²
    expect(exactDiscriminant(build("z^2 + 1"))?.re.equals(Frac.of(-4n))).toBe(true);
  });

  it("is not attempted on floats (the exact route costs seconds on dyadic coefficients)", () => {
    const f = fromCoeffs(
      [
        [-1, 0],
        [-1, 0],
        [0, 0],
        [0, 0],
        [0, 0],
        [1, 0],
      ],
      "C",
    );
    if (!f.ok) throw new Error(f.reason);
    expect(exactDiscriminant(f.poly)).toBeNull();
    expect(branchPoints(f.poly, 0).route).toBe("numeric");
  });
});

describe("branch points of aⱼ, by both routes (PLAN §7 PRA-2 gate)", () => {
  it("z⁵ − z − 1 in the a₀-plane: the roots of 3125t⁴ − 256, and −q(c) at the critical points", () => {
    const p = build("z^5 - z - 1");
    const exact = branchPoints(p, 0);
    expect(exact.route).toBe("exact");
    if (exact.route !== "exact") return;
    // disc(z⁵ − z + t) = 3125t⁴ − 256, exactly.
    expect(exact.poly.degree()).toBe(4);
    expect(exact.poly.coeff(4).re.equals(Frac.of(3125n))).toBe(true);
    expect(exact.poly.coeff(0).re.equals(Frac.of(-256n))).toBe(true);
    expect(exact.points).toHaveLength(4);
    expect(exact.multiplicity).toEqual([1, 1, 1, 1]);
    for (const d of exact.discs) expect(d.ok && d.components).toBe(4);
    const q: Cx[] = p.coeffs.map((c, k) => (k === 0 ? [0, 0] : c));
    const crit = criticalPoints(p)?.points ?? [];
    for (const c of crit) {
      const v = evalAt(q, c);
      const b: Cx = [-v[0], -v[1]];
      expect(Math.min(...exact.points.map((e) => dist(e, b)))).toBeLessThan(1e-10);
    }
  });

  it("records a branch point where TWO collisions meet: z⁴ − 4z² + 1/3 in the a₂-plane", () => {
    // q = z⁴ + 1/3: z and −z reach the same a₂ = ∓2/√3, so disc(t) has two DOUBLE roots.
    const ex = branchPoints(build("z^4 - 4z^2 + 1/3"), 2);
    if (ex.route !== "exact") throw new Error("expected the exact route");
    expect(ex.multiplicity).toEqual([2, 2]);
    expect(
      ex.points
        .map((z) => Math.abs(z[0]) - 2 / Math.sqrt(3))
        .every((d) => Math.abs(d) < 1e-15),
    ).toBe(true);
  });

  it("agree to 1e-10 for every coefficient of a spread of ℚ polynomials", () => {
    for (const text of [
      "z^5 - z - 1",
      "z^5 + 20z + 16",
      "z^7 - 7z + 3",
      "z^4 - 4z^2 + 1/3",
      "2z^6 - 3z^5 + z^2 - 5",
      "z^3 - 2",
      "z^4 + 3z^2 + 2z",
    ]) {
      const p = build(text);
      for (let j = 0; j < p.degree; j++) {
        const ex = branchPoints(p, j);
        if (ex.route !== "exact") throw new Error("expected the exact route");
        const num = branchPointsNumeric(p, j);
        // Every numeric point is an exact one, and every exact one is reached (the exact polynomial may
        // carry a root the numeric route counts twice, never one it misses).
        const scale = Math.max(1, ...ex.points.map((z) => Math.hypot(...z)));
        for (const z of num)
          expect(
            Math.min(...ex.points.map((e) => dist(e, z))),
            `${text} a${j}`,
          ).toBeLessThan(1e-10 * scale);
        for (const e of ex.points)
          expect(Math.min(...num.map((z) => dist(e, z))), `${text} a${j}`).toBeLessThan(
            1e-10 * scale,
          );
      }
    }
  });
});

describe("pseudozero regions (PLAN §7 PRA-2 gate, restated in STATUS)", () => {
  const wilk = build(wilkinson);
  const wd = rootDiscs(wilk);
  if (!wd.ok) throw new Error(wd.reason);
  const cam = frame(wilk.roots);
  const range = [
    cam.cx - cam.half,
    cam.cx + cam.half,
    cam.cy - cam.half,
    cam.cy + cam.half,
  ] as const;

  const summary = (eps: number): string[] =>
    pseudozeroRegions(wilk, wd.discs, eps, range)
      .regions.map(
        (g) =>
          `${g.certified ? "=" : "?"}${g.roots
            .map((i) => Math.round(wilk.roots[i][0]))
            .sort((a, b) => a - b)
            .join(",")}`,
      )
      .sort();

  it("Wilkinson at ε = 1e-12: roots 1–5 each alone, and 6–20 in ONE region, all certified", () => {
    expect(summary(1e-12)).toEqual(
      ["=1", "=2", "=3", "=4", "=5", "=6,7,8,9,10,11,12,13,14,15,16,17,18,19,20"].sort(),
    );
  });

  it("Wilkinson at ε = 1e-7: the region holding roots 2–20 runs off the view and is REFUSED, root 1 alone", () => {
    const r = pseudozeroRegions(wilk, wd.discs, 1e-7, range).regions;
    const big = r.find((g) => g.roots.length > 1);
    expect(big?.certified).toBe(false);
    expect(big?.reason).toMatch(/edge of the view/);
    expect(r.filter((g) => g.certified).map((g) => g.count)).toEqual([1]);
  });

  it("is FALSIFIABLE: perturbed polynomials really have exactly `count` roots in each certified region", () => {
    const p = build("(z-1)*(z-1.001)*(z-1.002)*(z+2)*(z-3i)", "C");
    const d = rootDiscs(p);
    if (!d.ok) throw new Error(d.reason);
    const eps = 1e-6;
    const rep = pseudozeroRegions(p, d.discs, eps, [-4, 4, -4, 4]);
    const cert = rep.regions.filter((g) => g.certified);
    expect(cert.map((g) => g.count).sort()).toEqual([1, 1, 3]);
    const { nx, x0, y0, h } = rep.grid;
    const regionAt = (z: Cx): number => {
      const c = Math.floor((z[1] - y0) / h) * nx + Math.floor((z[0] - x0) / h);
      return rep.regions.findIndex((g) => g.cells.includes(c));
    };
    let s = 12345;
    const rnd = (): number => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    for (let t = 0; t < 40; t++) {
      // |Δaₖ| = ε|aₖ| exactly, at a random phase: the extreme of the allowed set.
      const q: Cx[] = p.coeffs.map(([a, b]) => {
        const th = 2 * Math.PI * rnd();
        const m = eps * Math.hypot(a, b);
        return [a + m * Math.cos(th), b + m * Math.sin(th)];
      });
      const f = fromCoeffs(q, "C");
      if (!f.ok) throw new Error(f.reason);
      rep.regions.forEach((g, k) => {
        if (!g.certified) return;
        expect(f.poly.roots.filter((z) => regionAt(z) === k)).toHaveLength(g.count);
      });
    }
  });

  it("clears a segment far from the set and never one through a root", () => {
    const p = build("z^2 - 1");
    const e = pseudozeroEvaluator(p);
    expect(segmentClear(e, 1e-3, 0, 0.5, 0, 1)).toBe(true);
    expect(segmentClear(e, 1e-3, 0.9, 0, 1.1, 0)).toBe(false);
    // At ε large enough the whole plane is in the set, so nothing is clear.
    expect(segmentClear(e, 2, 0, 0.5, 0, 1)).toBe(false);
  });
});
