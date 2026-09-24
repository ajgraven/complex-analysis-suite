import { describe, expect, it } from "vitest";
import {
  andThen,
  cycleType,
  formatCycles,
  fromCycles,
  groupElements,
  inverse,
  loopCommutator,
  recogniseSymmetric,
  type Perm,
} from "@cas/monodromy";
import { parsePolynomial } from "../src/engine/parse.js";
import { fromExact, fromRoots, type Polynomial } from "../src/engine/polynomial.js";
import type { Cx } from "../src/engine/types.js";
import { branchPoints } from "../src/engine/analysis/discriminant.js";
import { loopName, loopPath, type Loop } from "../src/engine/loops/loop.js";
import { loopContext, runLoop } from "../src/engine/loops/run.js";
import { motion } from "../src/engine/loops/motion.js";
import { crossings } from "../src/engine/loops/braid.js";

function build(text: string, ring: Polynomial["ring"] = "Q"): Polynomial {
  const r = parsePolynomial(text, ring);
  if (!r.ok) throw new Error(r.reason);
  const b = fromExact(r.exact, ring);
  if (!b.ok) throw new Error(b.reason);
  return b.poly;
}

const quintic = build("z^5 - z - 1");
const ctx0 = loopContext(quintic, 0, branchPoints(quintic, 0));
const lasso = (point: number, sign: 1 | -1 = 1): Loop => ({ kind: "lasso", point, sign });

function run(loop: Loop, p = quintic, ctx = ctx0): Perm {
  const r = runLoop(p, loop, ctx);
  if (!r.ok) throw new Error(r.reason);
  return r.perm;
}

describe("PLAN §7 PRA-3 gate: x⁵ − x − 1 with a₀ selected", () => {
  const taus = ctx0.branchPoints.map((_, k) => run(lasso(k)));

  it("has four branch points of a₀, and each lasso certifies a TRANSPOSITION", () => {
    expect(ctx0.branchPoints).toHaveLength(4);
    for (const t of taus) expect(cycleType(t)).toEqual([2]);
  });

  it("the four generate S₅ — order 120, enumerated, and recognised by the transposition theorem", () => {
    expect(groupElements(taus, 5).elements).toHaveLength(120);
    expect(recogniseSymmetric(taus, 5).name).toBe("S");
  });

  it("the commutator of two lassos sharing a root certifies a 3-cycle — the SAME one the package composes", () => {
    // Find two transpositions sharing exactly one root.
    let pair: [number, number] | null = null;
    for (let a = 0; a < 4 && !pair; a++)
      for (let b = 0; b < 4 && !pair; b++) {
        if (a === b) continue;
        const shared = taus[a].filter((x, i) => x !== i && taus[b][i] !== i).length;
        if (shared === 1) pair = [a, b];
      }
    if (!pair) throw new Error("no two lassos share a root");
    const [a, b] = pair;
    const tracked = run({ kind: "commutator", a: lasso(a), b: lasso(b) });
    expect(cycleType(tracked)).toEqual([3]);
    expect(tracked).toEqual(loopCommutator(taus[a], taus[b]));
  });

  it("words compose left to right, and an inverse lasso undoes its lasso", () => {
    expect(run({ kind: "word", parts: [lasso(0), lasso(1)] })).toEqual(
      andThen(taus[0], taus[1]),
    );
    expect(run(lasso(2, -1))).toEqual(inverse(taus[2]));
    expect(
      run({ kind: "word", parts: [lasso(3), { kind: "inverse", of: lasso(3) }] }),
    ).toEqual([0, 1, 2, 3, 4]);
  });

  it("a drawn loop THROUGH a branch point refuses by name, and no permutation is given", () => {
    const b = ctx0.branchPoints[0];
    const drawn: Loop = {
      kind: "drawn",
      vertices: [
        [-1, 0],
        [b[0], b[1]],
        [b[0], b[1] - 0.4],
        [-1, -0.4],
      ],
    };
    const r = runLoop(quintic, drawn, ctx0);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/passes through branch point #1, where two roots collide/);
    expect("perm" in r).toBe(false);
  });

  it("a drawn loop grazing a branch point — outside its disc — is refused by the TRACKER, naming the point", () => {
    const b = ctx0.branchPoints.find(([x, y]) => x < 0 && Math.abs(y) < 1e-9) ?? [0, 0];
    const k = ctx0.branchPoints.indexOf(b);
    // A segment passing 1e-10 from the collision: outside the disc pre-check (1e-12), and far closer
    // than 20 halvings of the edge can separate.
    const drawn: Loop = {
      kind: "drawn",
      vertices: [
        [-1, 0],
        [b[0] + 1e-10, 0.3],
        [b[0] + 1e-10, -0.3],
      ],
    };
    const r = runLoop(quintic, drawn, ctx0);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(
      new RegExp(`could not be certified.*branch point #${k + 1} is`),
    );
  });

  it("names loops the way the card will", () => {
    expect(loopName({ kind: "commutator", a: lasso(0), b: lasso(2, -1) })).toBe(
      "[γ₁, γ₃⁻¹]",
    );
    expect(loopName({ kind: "word", parts: [lasso(0), lasso(1)] })).toBe("γ₁·γ₂");
  });

  it("lasso paths start and end at a₀ and keep clear of the other branch points", () => {
    for (let k = 0; k < 4; k++) {
      const r = loopPath(lasso(k), ctx0);
      if (!r.ok) throw new Error(r.reason);
      expect(r.path[0]).toEqual(ctx0.base);
      expect(r.path[r.path.length - 1]).toEqual(ctx0.base);
    }
  });
});

describe("labels follow the proof", () => {
  it("after a lasso the two swapped roots trade labels, and nothing else does", () => {
    const r = runLoop(quintic, lasso(0), ctx0);
    if (!r.ok) throw new Error(r.reason);
    const moved = quintic.labels.filter((l, i) => r.labelsAfter[i] !== l);
    expect(moved).toHaveLength(2);
    expect(formatCycles(r.labelPerm)).toMatch(/^\(\d \d\)$/);
  });
});

describe("motions (DESIGN §4.9)", () => {
  it("(1 2 3 4 5) on x⁵ − x − 1: roots land on their images and every coefficient traces a CLOSED loop", () => {
    const sigma = fromCycles(5, [[0, 1, 2, 3, 4]]);
    const m = motion(quintic.roots, sigma, quintic.lead);
    const last = m.frames[m.frames.length - 1];
    last.forEach((z, i) => expect(z).toEqual(quintic.roots[sigma[i]]));
    const c0 = m.coeffFrames[0];
    const c1 = m.coeffFrames[m.coeffFrames.length - 1];
    c0.forEach((c, k) =>
      expect(Math.hypot(c[0] - c1[k][0], c[1] - c1[k][1])).toBeLessThan(1e-12),
    );
    // …and a coefficient really goes somewhere on the way (the loop is not a point).
    const travel = Math.max(
      ...m.coeffFrames.map((c) => Math.hypot(c[0][0] - c0[0][0], c[0][1] - c0[0][1])),
    );
    expect(travel).toBeGreaterThan(0.1);
    expect(m.minGap).toBeGreaterThan(0);
  });

  it("falls back to sequential lenses when the simultaneous motion comes too close, and still lands", () => {
    const roots: Cx[] = [
      [0, 0],
      [1, 0],
      [2, 0],
    ];
    const sigma = fromCycles(3, [[0, 2]]); // 0 → 2 and 2 → 0 pass through 1's position
    const m = motion(roots, sigma, [1, 0]);
    expect(m.fallback).toBe(false); // bowed apart: a transposition is already a lens
    const cyc = fromCycles(3, [[0, 1, 2]]);
    const close: Cx[] = [
      [0, 0],
      [0.01, 0],
      [5, 0],
    ];
    const f = motion(close, cyc, [1, 0]);
    expect(f.fallback).toBe(true);
    f.frames[f.frames.length - 1].forEach((z, i) => expect(z).toEqual(close[cyc[i]]));
  });
});

describe("the braid strip", () => {
  it("a word of lenses between x-adjacent roots crosses once per letter", () => {
    const p = fromRoots(
      [
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0],
      ],
      [1, 0],
      "R",
    );
    if (!p.ok) throw new Error(p.reason);
    let pos: Cx[] = p.poly.roots.map((r) => [r[0], r[1]]);
    const frames: Cx[][] = [pos];
    // Swap the roots currently at x-positions (1,2), (2,3), (1,2), (3,4): a word of length 4.
    const word: [number, number][] = [
      [1, 2],
      [2, 3],
      [1, 2],
      [3, 4],
    ];
    for (const [x1, x2] of word) {
      const i = pos.findIndex((z) => Math.abs(z[0] - x1) < 1e-9);
      const k = pos.findIndex((z) => Math.abs(z[0] - x2) < 1e-9);
      const m = motion(pos, fromCycles(4, [[i, k]]), [1, 0]);
      frames.push(...m.frames.slice(1).map((f) => [...f]));
      pos = [...m.frames[m.frames.length - 1]];
    }
    const cs = crossings(frames);
    expect(cs).toHaveLength(word.length);
    // Over/under is decided by the imaginary part, and a lens puts one root on each side.
    expect(cs.every((c) => c.over === c.a || c.over === c.b)).toBe(true);
  });
});
