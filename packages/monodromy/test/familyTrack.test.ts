import { describe, expect, it } from "vitest";
import { aberth, makeWorkspace } from "@cas/core";
import { Frac, Gauss, gaussOfDoubles, smithDiscsSeries } from "@cas/exact";
import {
  familyAt,
  formatCycles,
  segmentParts,
  trackCoefficientPath,
  trackFamilyPath,
  type Cx,
  type Solver,
} from "../src/index.js";

const solve: Solver = (coeffs, _exact, seeds) => {
  const n = coeffs.length - 1;
  const ws = makeWorkspace(n);
  seeds.forEach(([x, y], i) => {
    ws.rootRe[i] = x;
    ws.rootIm[i] = y;
  });
  aberth(
    Float64Array.from(coeffs, (c) => c[0]),
    Float64Array.from(coeffs, (c) => c[1]),
    n,
    ws,
    { seedFromWorkspace: true },
  );
  return Array.from({ length: n }, (_, i): Cx => [ws.rootRe[i], ws.rootIm[i]]);
};

function rootsOf(coeffs: readonly Cx[]): Cx[] {
  const n = coeffs.length - 1;
  const seeds = Array.from({ length: n }, (_, k): Cx => [
    Math.cos((2 * Math.PI * (k + 0.25)) / n),
    Math.sin((2 * Math.PI * (k + 0.25)) / n),
  ]);
  return [...solve(coeffs, [], seeds)];
}

const G = (x: number, y = 0): Gauss => gaussOfDoubles(x, y);
const Q = (n: bigint, d = 1n): Gauss => new Gauss(Frac.of(n, d), Frac.ZERO);

/** A lasso: out from `base` along a straight tether to a circle round `c`, once round, and back. */
function lasso(base: Cx, c: Cx, r: number, m = 32): Gauss[] {
  const th = Math.atan2(base[1] - c[1], base[0] - c[0]);
  const entry: Cx = [c[0] + r * Math.cos(th), c[1] + r * Math.sin(th)];
  const pts: Gauss[] = [G(...base), G(...entry)];
  for (let k = 1; k < m; k++) {
    const a = th + (2 * Math.PI * k) / m;
    pts.push(G(c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)));
  }
  pts.push(G(...entry), G(...base));
  return pts;
}

// x⁵ − x − t: a₀ = −t, a₁ = −1, a₅ = 1.
const QUINTIC: Gauss[][] = [[Q(0n), Q(-1n)], [Q(-1n)], [], [], [], [Q(1n)]];
// z³ − 3z + t²: quadratic in t, branch points where t² = ±2.
const CUBIC_T2: Gauss[][] = [[Q(0n), Q(0n), Q(1n)], [Q(-3n)], [], [Q(1n)]];

const floatsAt = (family: Gauss[][], t: Gauss): Cx[] =>
  familyAt(family, t).map((c) => c.toTuple());

/** n·|p(zᵢ)| / (|aₙ|·∏|zᵢ − zⱼ|): Smith's radius of the polynomial `c` about the points `z`. */
function smithRadius(c: readonly Cx[], z: readonly Cx[], i: number): number {
  const n = c.length - 1;
  let pr = c[n][0];
  let pi = c[n][1];
  const [x, y] = z[i];
  for (let k = n - 1; k >= 0; k--) {
    const nr = pr * x - pi * y + c[k][0];
    pi = pr * y + pi * x + c[k][1];
    pr = nr;
  }
  let den = Math.hypot(c[n][0], c[n][1]);
  for (let k = 0; k < n; k++) if (k !== i) den *= Math.hypot(x - z[k][0], y - z[k][1]);
  return (n * Math.hypot(pr, pi)) / den;
}

describe("the family tracker (PRA-7): p(t, z) followed along a path of t", () => {
  it("each certified disc covers Smith's radius of every member of its segment — through t = 0, where t² turns", () => {
    // From t = −½ to ½ the two ends are the SAME polynomial (t² = ¼), so an endpoint envelope would see
    // nothing move; in between t² dips to 0 and every root moves.
    let steps = 0;
    const from = Q(-1n, 2n);
    const r = trackFamilyPath({
      family: CUBIC_T2,
      path: [from, Q(1n, 2n)],
      roots: rootsOf(floatsAt(CUBIC_T2, from)),
      solve,
      onStep: ({ from: a, to: b, centres, radii }) => {
        for (let k = 0; k <= 20; k++) {
          const c = floatsAt(CUBIC_T2, a.add(b.sub(a).mul(G(k / 20))));
          centres.forEach((_, i) =>
            expect(smithRadius(c, centres, i)).toBeLessThanOrEqual(radii[i] * (1 + 1e-9)),
          );
        }
        steps++;
      },
    });
    expect(r.ok).toBe(true);
    expect(steps).toBeGreaterThan(1);
  });

  it("x⁵ − x − t agrees with moving a₀ = −t: the same transposition, lasso by lasso", () => {
    const b = Math.pow(256 / 3125, 1 / 4); // a real branch point, 0.535…
    for (const c of [
      [b, 0],
      [0, b],
      [-b, 0],
      [0, -b],
    ] as Cx[]) {
      const path = lasso([0, 0], c, 0.2);
      const roots = rootsOf(floatsAt(QUINTIC, Q(0n)));
      const fam = trackFamilyPath({ family: QUINTIC, path, roots, solve });
      const coef = trackCoefficientPath({
        coeffs: familyAt(QUINTIC, Q(0n)),
        coefficient: 0,
        path: path.map((t) => t.neg()),
        roots,
        solve,
      });
      if (!fam.ok || !coef.ok) throw new Error("refused");
      expect(fam.perm).toEqual(coef.perm);
      expect(formatCycles(fam.perm ?? [])).toMatch(/^\(\d \d\)$/);
    }
  });

  it("z³ − 3z + t² (quadratic in t): a lasso round √2 is a transposition, as its image t² round 2 is", () => {
    const base: Cx = [0.25, 0.1];
    const path = lasso(base, [Math.SQRT2, 0], 0.3);
    const roots = rootsOf(floatsAt(CUBIC_T2, G(...base)));
    const r = trackFamilyPath({ family: CUBIC_T2, path, roots, solve });
    if (!r.ok) throw new Error(r.reason);
    // The same loop pushed forward by s = t²: a₀ = s moves linearly.
    const image = path.map((t) => t.mul(t));
    const lin = trackCoefficientPath({
      coeffs: familyAt(CUBIC_T2, G(...base)),
      coefficient: 0,
      path: image,
      roots,
      solve,
    });
    if (!lin.ok) throw new Error(lin.reason);
    expect(r.perm).toEqual(lin.perm);
    expect(formatCycles(r.perm ?? [])).toMatch(/^\(\d \d\)$/);
  });

  it("a loop enclosing no branch point is the identity", () => {
    const base: Cx = [0.25, 0.1];
    const path = lasso(base, [0.2, 0.6], 0.2);
    const roots = rootsOf(floatsAt(CUBIC_T2, G(...base)));
    const r = trackFamilyPath({ family: CUBIC_T2, path, roots, solve });
    if (!r.ok) throw new Error(r.reason);
    expect(r.perm).toEqual([0, 1, 2]);
  });

  it("every certified step's claim survives sampling INSIDE the segment, where a polynomial in s can peak", () => {
    const base: Cx = [0.25, 0.1];
    const path = lasso(base, [0, Math.SQRT2], 0.35);
    const roots = rootsOf(floatsAt(CUBIC_T2, G(...base)));
    let checked = 0;
    const r = trackFamilyPath({
      family: CUBIC_T2,
      path,
      roots,
      solve,
      onStep: ({ from, to, centres, radii }) => {
        for (const s of [0.13, 0.5, 0.87]) {
          const t = from.add(to.sub(from).mul(G(s)));
          const zs = rootsOf(floatsAt(CUBIC_T2, t));
          centres.forEach((c, i) => {
            const inside = zs.filter(
              (w) => Math.hypot(w[0] - c[0], w[1] - c[1]) <= radii[i],
            );
            expect(inside).toHaveLength(1);
          });
          checked++;
        }
      },
    });
    expect(r.ok).toBe(true);
    expect(checked).toBeGreaterThan(30);
  });

  it("segmentParts is the Taylor expansion about a, scaled to the segment, exactly", () => {
    const a = Q(1n, 3n).add(new Gauss(Frac.ZERO, Frac.of(1n, 2n)));
    const h = Q(-2n, 5n);
    const parts = segmentParts(CUBIC_T2, a, h);
    expect(parts).toHaveLength(3);
    for (const s of [Q(0n), Q(1n, 7n), Q(1n)]) {
      const direct = familyAt(CUBIC_T2, a.add(h.mul(s)));
      const summed = direct.map((_, k) =>
        parts.reduce((acc, part, r) => {
          let sr = Q(1n);
          for (let q = 0; q < r; q++) sr = sr.mul(s);
          return acc.add(part[k].mul(sr));
        }, Gauss.ZERO),
      );
      summed.forEach((v, k) => expect(v.equals(direct[k])).toBe(true));
    }
  });

  it("the series bound is not the endpoint envelope: s(1 − s) peaks inside, and the bound covers the peak", () => {
    // p_s(z) = z² − 1 + c·s(1 − s): both ends are z² − 1; the middle is z² − 1 + c/4.
    const c = Q(3n, 2n);
    const parts = [
      [Q(-1n), Q(0n), Q(1n)],
      [c, Q(0n), Q(0n)],
      [c.neg(), Q(0n), Q(0n)],
    ];
    const r = smithDiscsSeries(parts, [G(1), G(-1)]);
    if (!r.ok) throw new Error(r.reason);
    // At s = ½ the roots are ±√(1 − 3/8) = ±0.79…, 0.21 from ±1: the discs must reach them.
    const rootMid = Math.sqrt(1 - 3 / 8);
    expect(r.discs[0].radiusUpper()).toBeGreaterThanOrEqual(1 - rootMid);
    // And a moving leading coefficient refuses by name.
    const moved = smithDiscsSeries(
      [
        [Q(-1n), Q(0n), Q(1n)],
        [Q(0n), Q(0n), Q(1n)],
      ],
      [G(1), G(-1)],
    );
    expect(moved.ok).toBe(false);
  });

  it("refuses a family whose leading coefficient depends on t, by name", () => {
    const r = trackFamilyPath({
      family: [[Q(-1n)], [], [Q(1n), Q(1n)]],
      path: [Q(0n), Q(1n, 2n)],
      roots: [
        [1, 0],
        [-1, 0],
      ],
      solve,
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.reason).toMatch(/leading coefficient must be a non-zero constant/);
  });

  it("a path through a branch point refuses, naming t", () => {
    const b = Math.pow(256 / 3125, 1 / 4);
    const t0 = Q(0n);
    const r = trackFamilyPath({
      family: QUINTIC,
      path: [t0, G(b), G(1)],
      roots: rootsOf(floatsAt(QUINTIC, t0)),
      solve,
      floor: 8,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^the step from t = /);
  });
});
