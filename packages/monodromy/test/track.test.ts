import { describe, expect, it } from "vitest";
import { aberth, makeWorkspace } from "@cas/core";
import { Gauss, gaussOfDoubles } from "@cas/exact";
import {
  formatCycles,
  recogniseSymmetric,
  trackCoefficientPath,
  type Cx,
  type Solver,
} from "../src/index.js";

/** Aberth seeded from the previous roots — the kind of solver an app passes in. */
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

/** Roots of a polynomial from scratch (unit-circle seeds). */
function rootsOf(coeffs: readonly Cx[]): Cx[] {
  const n = coeffs.length - 1;
  const seeds = Array.from({ length: n }, (_, k): Cx => [
    Math.cos((2 * Math.PI * (k + 0.25)) / n),
    Math.sin((2 * Math.PI * (k + 0.25)) / n),
  ]);
  return [...solve(coeffs, [], seeds)];
}

const G = (x: number, y = 0): Gauss => gaussOfDoubles(x, y);

/** A closed polygon of `m` vertices on the circle |a − c| = r, starting (and ending, EXACTLY) at `from`. */
function around(c: Cx, r: number, from: number, m = 24): Gauss[] {
  const pts: Gauss[] = [];
  for (let k = 0; k < m; k++) {
    const th = from + (2 * Math.PI * k) / m;
    pts.push(G(c[0] + r * Math.cos(th), c[1] + r * Math.sin(th)));
  }
  pts.push(pts[0]);
  return pts;
}

function setup(float: Cx[]): { coeffs: Gauss[]; roots: Cx[] } {
  return { coeffs: float.map(([x, y]) => G(x, y)), roots: rootsOf(float) };
}

describe("the certified tracker: small cases whose answer is known", () => {
  it("z² + a₀, a₀ once round 0: the two roots SWAP", () => {
    const p = setup([
      [1, 0],
      [0, 0],
      [1, 0],
    ]);
    const path = around([0, 0], 1, 0);
    const r = trackCoefficientPath({ ...p, coefficient: 0, path, solve });
    if (!r.ok) throw new Error(r.reason);
    expect(r.perm).toEqual([1, 0]);
    expect(r.evidence.steps).toBeGreaterThanOrEqual(24);
  });

  it("z² + a₀ round a circle NOT enclosing 0: nothing moves", () => {
    const p = setup([
      [2, 0],
      [0, 0],
      [1, 0],
    ]);
    // cos π is exact but sin π is 1.2e-16, so the first vertex is pinned to a₀ = 2 itself.
    const path = around([2.5, 0], 0.5, Math.PI);
    path[0] = path[path.length - 1] = G(2);
    const r = trackCoefficientPath({ ...p, coefficient: 0, path, solve });
    if (!r.ok) throw new Error(r.reason);
    expect(r.perm).toEqual([0, 1]);
  });

  it("z³ + a₀ round 0: one 3-cycle; twice round: the other; three times: the identity", () => {
    const p = setup([
      [1, 0],
      [0, 0],
      [0, 0],
      [1, 0],
    ]);
    const once = around([0, 0], 1, 0);
    const r1 = trackCoefficientPath({ ...p, coefficient: 0, path: once, solve });
    const r2 = trackCoefficientPath({
      ...p,
      coefficient: 0,
      path: [...once, ...once.slice(1)],
      solve,
    });
    const r3 = trackCoefficientPath({
      ...p,
      coefficient: 0,
      path: [...once, ...once.slice(1), ...once.slice(1)],
      solve,
    });
    if (!r1.ok || !r2.ok || !r3.ok) throw new Error("refused");
    expect(r1.perm && formatCycles(r1.perm)).toMatch(/^\(\d \d \d\)$/);
    expect(r2.perm && formatCycles(r2.perm)).toMatch(/^\(\d \d \d\)$/);
    expect(r2.perm).not.toEqual(r1.perm);
    expect(r3.perm).toEqual([0, 1, 2]);
  });

  it("an OPEN path ends on the roots of the polynomial at its end, labels carried", () => {
    const p = setup([
      [1, 0],
      [0, 0],
      [1, 0],
    ]);
    // Half way round: a₀ from 1 to −1 through the upper half-plane; roots from ±i to ±1.
    const half = around([0, 0], 1, 0, 24).slice(0, 13);
    const r = trackCoefficientPath({ ...p, coefficient: 0, path: half, solve });
    if (!r.ok) throw new Error(r.reason);
    expect(r.perm).toBeNull();
    for (const z of r.ends) expect(Math.abs(Math.hypot(...z) - 1)).toBeLessThan(1e-12);
    expect(r.ends.every(([, y]) => Math.abs(y) < 1e-12)).toBe(true);
    // Each root moved a quarter turn the same way (√ of a half turn).
    const start = p.roots.map(([x, y]) => Math.atan2(y, x));
    const end = r.ends.map(([x, y]) => Math.atan2(y, x));
    start.forEach((s, i) => {
      const d =
        ((((end[i] - s) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      expect(Math.abs(Math.abs(d) - Math.PI / 2)).toBeLessThan(1e-9);
    });
  });
});

describe("refusals, by name", () => {
  it("a path THROUGH the collision refuses, naming the step, and prints no permutation", () => {
    const p = setup([
      [1, 0],
      [0, 0],
      [1, 0],
    ]);
    const r = trackCoefficientPath({
      ...p,
      coefficient: 0,
      path: [G(1), G(-1), G(1)],
      solve,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/could not be certified after 20 halvings.*roots collide/);
    expect(r.edge).toBe(0);
    // The refusal is AT the collision: the last segment tried straddles a₀ = 0.
    const [[x0], [x1]] = r.at ?? [[9], [9]];
    expect(Math.min(x0, x1)).toBeLessThanOrEqual(0);
    expect(Math.max(x0, x1)).toBeGreaterThanOrEqual(0);
    // The floor: 20 halvings of an edge of length 2.
    expect(Math.abs(x1 - x0)).toBe(2 * 2 ** -20);
    expect("perm" in r).toBe(false);
  });

  it("refuses the leading coefficient, a path that starts elsewhere, and roots that are not isolated", () => {
    const p = setup([
      [1, 0],
      [0, 0],
      [1, 0],
    ]);
    const base = { ...p, solve };
    expect(
      trackCoefficientPath({ ...base, coefficient: 2, path: [G(1), G(2)] }),
    ).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/below the leading one/),
    });
    expect(
      trackCoefficientPath({ ...base, coefficient: 0, path: [G(2), G(3)] }),
    ).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/does not start at the current value of a0/),
    });
    expect(
      trackCoefficientPath({
        ...base,
        roots: [
          [0, 1],
          [0, 1.5],
        ],
        coefficient: 0,
        path: [G(1), G(2)],
      }),
    ).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/not each in their own disc/),
    });
  });
});

describe("x⁵ − x − 1 in the a₀-plane (PLAN §7 PRA-3's gate, at the package level)", () => {
  // Branch points of a₀ for z⁵ − z + a₀: 3125a₀⁴ = 256, so a₀ = ±β, ±iβ with β = (256/3125)^(1/4).
  const beta = (256 / 3125) ** 0.25;
  const p = setup([
    [-1, 0],
    [-1, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [1, 0],
  ]);
  /** base → (waypoint) → a circle of radius 0.15 round b → back the same way. */
  function lasso(b: Cx, via: Cx | null): Gauss[] {
    const base: Cx = [-1, 0];
    const from: Cx = via ?? base;
    const th = Math.atan2(from[1] - b[1], from[0] - b[0]);
    const ring = around(b, 0.15, th, 24);
    const out = [G(...base)];
    if (via) out.push(G(...via));
    out.push(...ring);
    if (via) out.push(G(...via));
    out.push(G(...base));
    return out;
  }
  const loops: [string, Cx, Cx | null][] = [
    ["−β", [-beta, 0], null],
    ["iβ", [0, beta], null],
    ["−iβ", [0, -beta], null],
    ["+β", [beta, 0], [0, 0.35]], // the straight tether would run through −β
  ];

  it("each of the four lassos certifies a transposition, and together they generate S₅", () => {
    const perms = loops.map(([name, b, via]) => {
      const r = trackCoefficientPath({
        ...p,
        coefficient: 0,
        path: lasso(b, via),
        solve,
      });
      if (!r.ok) throw new Error(`${name}: ${r.reason}`);
      expect(r.perm && formatCycles(r.perm), name).toMatch(/^\(\d \d\)$/);
      return r.perm as number[];
    });
    expect(recogniseSymmetric(perms, 5)).toEqual({
      name: "S",
      how: "transpositions",
      order: null,
    });
  });
});
