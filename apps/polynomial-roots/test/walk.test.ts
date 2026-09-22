import { describe, it, expect } from "vitest";
import { compileAlphabet } from "../src/engine/alphabet";
import type { Alphabet } from "../src/engine/alphabet";
import {
  ANNULUS_INNER,
  ANNULUS_OUTER,
  epsFor,
  MAX_DEPTH,
  walkAt,
  walkGrid,
  walkSpec,
} from "../src/engine/limit/walk";

const compile = (spec: Parameters<typeof compileAlphabet>[0]): Alphabet => {
  const r = compileAlphabet(spec);
  if ("error" in r) throw new Error(r.error);
  return r.alphabet;
};
const LITTLEWOOD = walkSpec(compile({ preset: "littlewood" }));
const NEWMAN = walkSpec(compile({ preset: "zero-one" }));
const TRINARY = walkSpec(compile({ preset: "trinary" }));

describe("the tail bound", () => {
  it("reproduces Bousch's ½ from the DEPTH-0 test alone — the bound is not put in by hand", () => {
    // `|a_0| ≤ max|a|·|z|/(1−|z|)` with `|a_0| = max|a| = 1` is exactly `|z| ≥ ½`. So the walk's very
    // first comparison IS Bousch's bound, and it is arithmetic rather than a constant anyone typed.
    for (const r of [0.2, 0.4, 0.49, 0.4999]) {
      const out = walkAt(LITTLEWOOD, r, 0, { depth: 24, eps: 0 });
      expect(out.reach, `|z| = ${r}`).toBe(0);
      expect(out.nodes, `|z| = ${r}`).toBe(1); // one node: `a_0` is tried and pruned
    }
    expect(walkAt(LITTLEWOOD, 0.5001, 0, { depth: 24, eps: 0 }).reach).toBeGreaterThan(0);
    // **z = ½ EXACTLY is in the set, and the comparison has to be strict for it to be.** There
    // `tail[k] = |z|^{k+1}/(1−|z|) = 2^{−k}` and the branch `a_0 = −1, a_k = +1` has
    // `s_k = −1 + Σ_{j≤k} 2^{−j} = −2^{−k}`, so EVERY level is an exact tie — in powers of two, so
    // float64 reproduces it bit for bit — and the series sums to zero. A `≥` in the prune kills the
    // whole tree at level 0 and drops Bousch's own boundary point out of the picture.
    const boundary = walkAt(LITTLEWOOD, 0.5, 0, { depth: 24, eps: 0 });
    expect(boundary.reach).toBe(25);
    expect(boundary.nodes).toBe(49); // two nodes a level: the tie survives, its sibling prunes
    // And the far side of the fold is the same statement: 2 is 1/(½).
    expect(walkAt(LITTLEWOOD, 1.9996, 0, { depth: 24, eps: 0, computeAnnulus: true }).reach).toBeGreaterThan(0);
    expect(walkAt(LITTLEWOOD, 2.0005, 0, { depth: 24, eps: 0, computeAnnulus: true }).reach).toBe(0);
  });

  it("the origin is in nothing, because a proper polynomial has a non-zero constant term", () => {
    for (const spec of [LITTLEWOOD, NEWMAN, TRINARY]) {
      expect(walkAt(spec, 0, 0, { depth: 20, eps: 0 }).reach).toBe(0);
    }
  });

  it("never claims a point outside the annulus its alphabet's theorem allows", () => {
    // Bousch: every Littlewood root has ½ < |z| < 2. Odlyzko–Poonen: every 0-1 root has 1/Φ < |z| < Φ.
    // The limit set is the closure of the root set, so these are bounds on what the walk may report —
    // the falsifiable direction, since a coarse grid can miss the extremes but cannot invent them.
    // Measured at depth 30 over a 220² grid of [−2.2, 2.2]²: Littlewood lands in [0.670, 1.534] against
    // the permitted [0.5, 2], and {0,1} in [0.737, 1.359] against [0.618, 1.618].
    const phi = (1 + Math.sqrt(5)) / 2;
    for (const [name, spec, lo, hi] of [
      ["Littlewood", LITTLEWOOD, 0.5, 2],
      ["{0,1}", NEWMAN, 1 / phi, phi],
    ] as const) {
      let inSet = 0;
      for (let j = 0; j < 110; j++) {
        for (let i = 0; i < 110; i++) {
          const x = -2.2 + (4.4 * (i + 0.5)) / 110;
          const y = -2.2 + (4.4 * (j + 0.5)) / 110;
          const out = walkAt(spec, x, y, { depth: 30, eps: 0, computeAnnulus: true, budget: 300000 });
          if (out.exhausted || out.reach !== 31) continue;
          inSet++;
          const abs = Math.hypot(x, y);
          expect(abs, `${name} at ${x},${y}`).toBeGreaterThan(lo);
          expect(abs, `${name} at ${x},${y}`).toBeLessThan(hi);
        }
      }
      // Anti-vacuity: a bound nothing reaches is not a test. Measured 2,900 (Littlewood) and 2,048 ({0,1}).
      expect(inSet, name).toBeGreaterThan(1500);
    }
  });
});

describe("what `reach` is", () => {
  it("does not depend on the cap below the cap — the prune uses the INFINITE tail", () => {
    // The pruning test at level `k` compares against `Σ_{j>k}`, not `Σ_{j=k+1}^{D}`, so whether a branch
    // dies at level 7 is a fact about the point and not about how deep the reader asked to go. That is
    // what makes the depth slider monotone: raising it can only sharpen the picture, never redraw it.
    let moved = 0;
    let died = 0;
    for (let j = 0; j < 24; j++) {
      for (let i = 0; i < 24; i++) {
        const x = -0.78 + (1.56 * (i + 0.5)) / 24;
        const y = -0.78 + (1.56 * (j + 0.5)) / 24;
        const shallow = walkAt(LITTLEWOOD, x, y, { depth: 12, eps: 0 });
        const deep = walkAt(LITTLEWOOD, x, y, { depth: 26, eps: 0 });
        if (shallow.reach < 13) {
          died++;
          expect(deep.reach, `${x},${y}`).toBe(shallow.reach); // the tree died; the cap is irrelevant
        } else {
          expect(deep.reach, `${x},${y}`).toBeGreaterThanOrEqual(13);
          if (deep.reach < 27) moved++;
        }
      }
    }
    // Both branches have to be exercised, or the claim is half-tested. Measured over the 576 cells: 456
    // died before depth 12, 120 reached it, and 32 of those 120 failed to reach 26 — which is the
    // picture shrinking as the slider rises, and is the whole reason the slider exists.
    expect(died).toBeGreaterThan(300);
    expect(moved).toBeGreaterThan(20);
  });

  it("grows with ε, and ε is the only thing that fattens it", () => {
    let strictlyMore = 0;
    for (let j = 0; j < 16; j++) {
      for (let i = 0; i < 16; i++) {
        const x = -0.75 + (1.5 * (i + 0.5)) / 16;
        const y = -0.75 + (1.5 * (j + 0.5)) / 16;
        const tight = walkAt(LITTLEWOOD, x, y, { depth: 20, eps: 0 });
        const loose = walkAt(LITTLEWOOD, x, y, { depth: 20, eps: 1e-2 });
        expect(loose.reach, `${x},${y}`).toBeGreaterThanOrEqual(tight.reach);
        if (loose.reach > tight.reach) strictlyMore++;
      }
    }
    // Measured: 36 of 256 cells move. A test that only asserted `≥` would pass with ε ignored entirely.
    expect(strictlyMore).toBeGreaterThan(20);
  });

  it("ε is the largest |P(z)| a polynomial with a root in the pixel can have", () => {
    // Not a fitted constant: `|P(z)| = |P(z) − P(r)| ≤ ρ·max|P′|` and `|P′| ≤ max|a|/(1−|z|)²` over this
    // family. Checked against a polynomial built to have a root exactly `ρ` away.
    const rho = 1e-3;
    const absz = 0.7;
    const eps = epsFor(rho, absz, 1);
    // A degree-25 Littlewood polynomial, and the point one ρ from one of its roots.
    const coeffs: number[] = [];
    for (let k = 0; k <= 25; k++) coeffs.push(k % 3 === 0 ? -1 : 1);
    const evalAt = (zr: number, zi: number): { re: number; im: number } => {
      let re = 0;
      let im = 0;
      for (let k = coeffs.length - 1; k >= 0; k--) {
        const nr = re * zr - im * zi + coeffs[k];
        im = re * zi + im * zr;
        re = nr;
      }
      return { re, im };
    };
    // Newton onto a root near |z| = 0.7, then step ρ away from it.
    let zr = absz;
    let zi = 0.2;
    for (let n = 0; n < 60; n++) {
      const v = evalAt(zr, zi);
      const h = 1e-7;
      const d = evalAt(zr + h, zi);
      const dr = (d.re - v.re) / h;
      const di = (d.im - v.im) / h;
      const den = dr * dr + di * di;
      if (den === 0) break;
      zr -= (v.re * dr + v.im * di) / den;
      zi -= (v.im * dr - v.re * di) / den;
    }
    const root = Math.hypot(zr, zi);
    expect(root).toBeGreaterThan(0.3);
    const probe = evalAt(zr + rho, zi);
    expect(Math.hypot(probe.re, probe.im)).toBeLessThan(epsFor(rho, root, 1));
    expect(eps).toBeGreaterThan(0);
    // `max|a|` is in it, and it has to be: `{−3 … 3}`'s polynomials have three times the derivative of
    // a Littlewood one, so the same pixel admits three times the `|P(z)|`. Every preset but `range` and
    // a custom list has `max|a| = 1`, which is why dropping the factor changes nothing on most of them.
    expect(epsFor(1e-3, 0.5, 3)).toBeCloseTo(3 * epsFor(1e-3, 0.5, 1), 15);
    expect(epsFor(1e-3, 0.5, 1)).toBeCloseTo(0.004, 15);
  });
});

describe("the fold and the band", () => {
  it("the fold is `1/z` and NOT `1/conj z`, which only a complex alphabet can tell apart", () => {
    // Over a real alphabet the limit set is conjugate-symmetric, so `1/z` and `1/conj z` agree
    // everywhere and a test on `{±1}` cannot see the difference — the fold could be conjugating and
    // every picture in the app would still be right. `{1, 0.5+0.5i, −1}` is not closed under
    // conjugation: measured, 772 of 2,816 points inside the band disagree with their own conjugate.
    const complex = walkSpec(compile({ preset: "custom", custom: "1, 0.5+0.5i, -1" }));
    let asymmetric = 0;
    for (let j = 0; j < 30; j++) {
      for (let i = 0; i < 30; i++) {
        const x = -0.78 + (1.56 * (i + 0.5)) / 30;
        const y = -0.78 + (1.56 * (j + 0.5)) / 30;
        const abs = Math.hypot(x, y);
        if (abs < 0.05 || abs > 0.78) continue;
        const inner = walkAt(complex, x, y, { depth: 18, eps: 0 });
        const d = x * x + y * y;
        const outer = walkAt(complex, x / d, -y / d, { depth: 18, eps: 0 });
        expect(outer.reach, `the fold moved the answer at ${x},${y}`).toBe(inner.reach);
        if (walkAt(complex, x, -y, { depth: 18, eps: 0 }).reach !== inner.reach) asymmetric++;
      }
    }
    expect(asymmetric, "the alphabet is conjugate-symmetric, so this proves nothing").toBeGreaterThan(80);
  });

  it("`z` and `1/z` give the same answer, exactly", () => {
    // Reversing a coefficient vector stays in every alphabet, so this is not an approximation and not a
    // property of symmetric alphabets: it holds for `{0,1}` too, which has no negation and no conjugation.
    for (const spec of [LITTLEWOOD, NEWMAN, TRINARY]) {
      for (const [x, y] of [
        [0.62, 0.31],
        [-0.55, 0.4],
        [0.7, -0.2],
        [0.3, 0.71],
      ] as const) {
        const d = x * x + y * y;
        const inner = walkAt(spec, x, y, { depth: 22, eps: 0 });
        const outer = walkAt(spec, x / d, -y / d, { depth: 22, eps: 0 });
        expect(outer.folded).toBe(true);
        expect(outer.reach, `${x},${y}`).toBe(inner.reach);
        expect(outer.nodes, `${x},${y}`).toBe(inner.nodes);
      }
    }
  });

  it("the band is its own image under the fold, so a pixel cannot be inside it on one side only", () => {
    expect(ANNULUS_OUTER).toBe(1 / ANNULUS_INNER);
    for (const r of [0.81, 0.9, 0.99, 1.0, 1.01, 1.1, 1.24]) {
      expect(walkAt(LITTLEWOOD, r, 0, { depth: 20 }).excluded, `|z| = ${r}`).toBe(true);
    }
    for (const r of [0.79, 1.26]) {
      expect(walkAt(LITTLEWOOD, r, 0, { depth: 20 }).excluded, `|z| = ${r}`).toBe(false);
    }
  });

  it("an excluded pixel is not an empty one — it reports `excluded`, not `reach = 0` from a walk", () => {
    const skipped = walkAt(LITTLEWOOD, 0.95, 0, { depth: 20 });
    expect(skipped.excluded).toBe(true);
    expect(skipped.nodes).toBe(0);
    const walked = walkAt(LITTLEWOOD, 0.95, 0, { depth: 20, computeAnnulus: true, budget: 5000 });
    expect(walked.excluded).toBe(false);
    expect(walked.nodes).toBeGreaterThan(0);
  });

  it("the budget is spent, reported, and never silently truncates the answer", () => {
    // The budget bites ONLY inside the band, which is the measurement that justifies both the band and
    // the budget: over a 120² grid of [−2.3, 2.3]² at depth 40 with the band off, not one texel runs out
    // and the worst spends 5,546 nodes; with the band walked, 14 of 8,100 texels over [−1.3, 1.3]² do,
    // and the worst of them is here.
    const out = walkAt(LITTLEWOOD, 1.0544, -0.0722, { depth: 40, computeAnnulus: true });
    expect(out.exhausted).toBe(true);
    expect(out.nodes).toBe(40001);
    // And the mechanism itself, on a point that is otherwise instant.
    const starved = walkAt(LITTLEWOOD, 0.62, 0.31, { depth: 24, budget: 3 });
    expect(starved.exhausted).toBe(true);
    expect(starved.nodes).toBe(4);
    // On the unit circle itself there is nothing to decide at all, and it says so rather than saturating.
    const onCircle = walkAt(LITTLEWOOD, 1, 0, { depth: 20, computeAnnulus: true });
    expect(onCircle.exhausted).toBe(true);
    expect(onCircle.nodes).toBe(0);
  });
});

describe("the unit reduction", () => {
  it("normalising `a_0` to one representative per unit-orbit changes no answer", () => {
    // Every unit has `|u| = 1` — multiplication by `u` permutes a finite set and so preserves its moduli
    // — so `uP` and `P` have the same `|s_k|` at every depth as well as the same zeros. Checked by
    // running the walk against a spec whose `leading` table is EVERY non-zero value.
    for (const [name, preset] of [
      ["littlewood", "littlewood"],
      ["trinary", "trinary"],
      ["roots of unity", "roots-of-unity"],
    ] as const) {
      const alphabet = compile(preset === "roots-of-unity" ? { preset, n: 3 } : { preset });
      const reduced = walkSpec(alphabet);
      const full = {
        ...reduced,
        leading: (() => {
          const out = new Float64Array(alphabet.nonZero.length * 2);
          alphabet.nonZero.forEach((j, pos) => {
            out[2 * pos] = alphabet.values[j].re;
            out[2 * pos + 1] = alphabet.values[j].im;
          });
          return out;
        })(),
      };
      expect(full.leading.length, name).toBeGreaterThanOrEqual(reduced.leading.length);
      let differing = 0;
      for (let j = 0; j < 20; j++) {
        for (let i = 0; i < 20; i++) {
          const x = -0.78 + (1.56 * (i + 0.5)) / 20;
          const y = -0.78 + (1.56 * (j + 0.5)) / 20;
          const a = walkAt(reduced, x, y, { depth: 18, eps: 0 });
          const b = walkAt(full, x, y, { depth: 18, eps: 0 });
          if (a.reach !== b.reach) differing++;
        }
      }
      expect(differing, name).toBe(0);
    }
  });
});

describe("the rasteriser", () => {
  it("covers its view and reports a status for every cell", () => {
    const g = walkGrid(LITTLEWOOD, { cx: 0, cy: 0, halfWidth: 1.6, halfHeight: 1 }, 32, 20, { depth: 16 });
    expect(g.reach.length).toBe(640);
    expect(g.status.length).toBe(640);
    let excluded = 0;
    let inSet = 0;
    for (let i = 0; i < g.reach.length; i++) {
      expect(g.reach[i]).toBeLessThanOrEqual(17);
      if (g.status[i] === 1) excluded++;
      else if (g.reach[i] === 17) inSet++;
    }
    expect(excluded).toBeGreaterThan(0);
    expect(inSet).toBeGreaterThan(0);
  });

  it("takes the LARGER side of a texel that is not square", () => {
    // The stage's composite is square and carries the world RECT, so on a wide view a texel is much
    // wider than it is tall. Foster's fudge must take the larger side: it fattens the picture rather
    // than thinning it, and a superset may only err in that direction. Measured over a 40² grid of a
    // 12:1 view — the larger side reproduces all 1,600 cells, the smaller only 1,300.
    const view = { cx: 0, cy: 0, halfWidth: 0.6, halfHeight: 0.05 };
    const g = walkGrid(LITTLEWOOD, view, 40, 40, { depth: 20 });
    const wide = Math.max(view.halfWidth / 40, view.halfHeight / 40);
    const narrow = Math.min(view.halfWidth / 40, view.halfHeight / 40);
    let matchesWide = 0;
    let matchesNarrow = 0;
    for (let j = 0; j < 40; j++) {
      for (let i = 0; i < 40; i++) {
        const x = view.halfWidth * ((2 * (i + 0.5)) / 40 - 1);
        const y = view.halfHeight * ((2 * (j + 0.5)) / 40 - 1);
        const abs = Math.hypot(x, y);
        const folded = abs > 1 ? 1 / abs : abs;
        const at = g.reach[j * 40 + i];
        if (walkAt(LITTLEWOOD, x, y, { depth: 20, eps: epsFor(wide, folded, 1) }).reach === at) matchesWide++;
        if (walkAt(LITTLEWOOD, x, y, { depth: 20, eps: epsFor(narrow, folded, 1) }).reach === at) matchesNarrow++;
      }
    }
    expect(matchesWide).toBe(1600);
    expect(matchesNarrow).toBeLessThan(1400);
  });

  it("refuses to go deeper than the shader's arrays can carry", () => {
    const deep = walkAt(LITTLEWOOD, 0.62, 0.31, { depth: 400, eps: 0 });
    expect(deep.reach).toBeLessThanOrEqual(MAX_DEPTH + 1);
  });
});
