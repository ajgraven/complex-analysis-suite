import { describe, it, expect } from "vitest";
import { compileAlphabet } from "../src/engine/alphabet";
import type { Alphabet, Cx } from "../src/engine/alphabet";
import {
  dragonBounds,
  dragonPlan,
  dragonSet,
  MAX_DRAGON_POINTS,
  maxAbsOf,
  nearestToOrigin,
  originInSet,
  theoremOverlay,
} from "../src/engine/dragon";
import { epsFor, walkAt, walkSpec } from "../src/engine/limit/walk";
import { runReference } from "../src/engine/deep/reference";

const A = (preset: string, over: Record<string, unknown> = {}): Alphabet => {
  const r = compileAlphabet({ preset, ...over } as never);
  if ("error" in r) throw new Error(r.error);
  return r.alphabet;
};
const LITTLEWOOD = A("littlewood");
const NEWMAN = A("zero-one");

/** `max|a|·|z|^{d+1}/(1−|z|)` — the enumeration's own tail, written out rather than imported. */
const tailOf = (a: Alphabet, z: Cx, depth: number): number => {
  const r = Math.hypot(z.re, z.im);
  return (maxAbsOf(a) * Math.pow(r, depth + 1)) / (1 - r);
};

describe("the attractor", () => {
  it("is the fixed point of its own maps — D = ⋃ₐ (a + z·D), level by level", () => {
    // The self-similarity is the DEFINITION, so the enumeration can be checked against it without any
    // reference value: the depth-d set must be exactly what applying every map to the depth-(d−1) set
    // produces. Nothing about the alphabet, the point or the loop order is assumed.
    // **A COMPLEX alphabet is in the list on purpose.** Every preset the rest of this file uses is
    // real, and over a real alphabet the imaginary half of the shift `a·z^k` is identically zero — so a
    // sign error in that multiply is invisible on all of them. The fourth roots of unity are the
    // cheapest alphabet that is not real.
    const z = { re: 0.42, im: 0.38 };
    for (const a of [LITTLEWOOD, NEWMAN, A("trinary"), A("roots-of-unity", { n: 4 })]) {
      const prev = dragonSet(a, z, 3);
      const here = dragonSet(a, z, 4);
      const want = new Set<string>();
      const zp = Math.pow(1, 1); // z^0; the images are built as `a + z·(previous level)`
      void zp;
      for (const v of a.values) {
        for (let i = 0; i + 1 < prev.length; i += 2) {
          // `a + z·s` where `s` is a depth-3 value: the same set as depth 4 read the other way round.
          const re = v.re + z.re * prev[i] - z.im * prev[i + 1];
          const im = v.im + z.re * prev[i + 1] + z.im * prev[i];
          want.add(`${re.toFixed(12)},${im.toFixed(12)}`);
        }
      }
      const got = new Set<string>();
      for (let i = 0; i + 1 < here.length; i += 2) got.add(`${here[i].toFixed(12)},${here[i + 1].toFixed(12)}`);
      expect(got.size, a.id).toBe(want.size);
      for (const k of got) expect(want.has(k), `${a.id} ${k}`).toBe(true);
    }
  });

  it("has |A|^(depth+1) values and sits inside max|a|/(1−|z|)", () => {
    const z = { re: -0.3, im: 0.5 };
    for (const a of [LITTLEWOOD, NEWMAN, A("trinary")]) {
      const pts = dragonSet(a, z, 5);
      expect(pts.length / 2, a.id).toBe(Math.pow(a.values.length, 6));
      const bound = maxAbsOf(a) / (1 - Math.hypot(z.re, z.im));
      for (let i = 0; i + 1 < pts.length; i += 2) expect(Math.hypot(pts[i], pts[i + 1])).toBeLessThanOrEqual(bound);
    }
  });

  it("takes a_0 from the WHOLE alphabet, and the proper set is a different object", () => {
    // The attractor's `a_0` ranges over `A`; the limit walk's ranges over `alphabet.leading`, one
    // representative per unit-orbit of the NON-ZERO values, because the root engine counts proper
    // polynomials. Over {−1, +1} the two sets agree — `−A = A` makes the attractor symmetric — and over
    // {0, 1} they do not, which is what stops the cross-check below from being a coincidence.
    const z = { re: 0.5, im: 0.4 };
    const key = (p: Float64Array): Set<string> => {
      const s = new Set<string>();
      for (let i = 0; i + 1 < p.length; i += 2) s.add(`${p[i].toFixed(10)},${p[i + 1].toFixed(10)}`);
      return s;
    };
    const lwFull = key(dragonSet(LITTLEWOOD, z, 6));
    const lwProper = key(dragonSet(LITTLEWOOD, z, 6, true));
    expect(lwProper.size).toBe(lwFull.size / 2);
    // Littlewood: every proper value's negative is a full value, so the full set is the proper one
    // together with its reflection and nothing else.
    const reflected = new Set([...lwProper].map((k) => k.split(",").map((x) => (-Number(x)).toFixed(10)).join(",")));
    expect(new Set([...lwProper, ...reflected]).size).toBe(lwFull.size);
    // {0, 1}: the attractor is strictly larger, and NOT by a reflection.
    const nmFull = dragonSet(NEWMAN, z, 6);
    const nmProper = dragonSet(NEWMAN, z, 6, true);
    expect(nmProper.length).toBeLessThan(nmFull.length);
    const [x0] = dragonBounds(nmFull);
    const [px0] = dragonBounds(nmProper);
    expect(x0).toBeLessThan(px0);
  });

  it("refuses |z| ≥ 1 by name rather than drawing a diverging cloud", () => {
    for (const z of [{ re: 1, im: 0 }, { re: 0.8, im: 0.8 }, { re: -2, im: 0 }]) {
      const plan = dragonPlan(LITTLEWOOD, z, 0.01);
      expect(plan.contracts, `${z.re},${z.im}`).toBe(false);
      expect(plan.depth).toBe(-1);
      expect(dragonSet(LITTLEWOOD, z, plan.depth).length).toBe(0);
    }
    expect(dragonPlan(LITTLEWOOD, { re: 0.9, im: 0 }, 0.01).contracts).toBe(true);
  });
});

describe("the plan chooses resolution FIRST and the budget second", () => {
  it("says `resolved` when the tail is under the asked-for resolution", () => {
    // Measured at Baez's point (|z| = 0.6617): depth 15, 65,536 values, tail 4.0e-3 — resolved.
    const plan = dragonPlan(LITTLEWOOD, { re: 0.375453, im: 0.544825 }, 0.005);
    expect(plan.depth).toBe(15);
    expect(plan.points).toBe(1 << 16);
    expect(plan.tail).toBeLessThan(0.005);
    expect(plan.resolved).toBe(true);
    expect(plan.capped).toBe(false);
    expect(plan.tail).toBeCloseTo(tailOf(LITTLEWOOD, { re: 0.375453, im: 0.544825 }, plan.depth), 12);
  });

  it("says `capped` near the unit circle, where the picture is beyond drawing", () => {
    // The annulus again, in the third engine: at |z| = 0.9055 resolving the attractor to 5e-3 needs a
    // depth of about 50, which is 2^51 values. The budget stops at 2^20 with a tail of 1.46 — a cloud
    // the size of the picture — and the plan says so instead of drawing a coarse blob that looks
    // finished. This is the same fact as the limit walk costing 300× inside the band.
    const plan = dragonPlan(LITTLEWOOD, { re: 0.9, im: 0.1 }, 0.005);
    expect(plan.capped).toBe(true);
    expect(plan.resolved).toBe(false);
    expect(plan.points).toBeLessThanOrEqual(MAX_DRAGON_POINTS);
    expect(plan.tail).toBeGreaterThan(1);
    // And it is the BUDGET that bit, not the depth guard: asking for a coarser picture resolves.
    expect(dragonPlan(LITTLEWOOD, { re: 0.9, im: 0.1 }, 3).resolved).toBe(true);
  });

  it("never exceeds the point budget, whatever the alphabet's size", () => {
    for (const a of [LITTLEWOOD, A("trinary"), A("range", { n: 4 }), A("roots-of-unity", { n: 7 })]) {
      const plan = dragonPlan(a, { re: 0.7, im: 0.3 }, 1e-9);
      expect(plan.points, a.id).toBeLessThanOrEqual(MAX_DRAGON_POINTS);
      expect(plan.points, a.id).toBe(dragonSet(a, { re: 0.7, im: 0.3 }, plan.depth).length / 2);
    }
  });
});

describe("Bousch: the inset answers the STAGE's question", () => {
  it("`0 ∈ D_z` agrees with the limit walk, pixel for pixel", () => {
    // The theorem is `q ∈ D̄ ⟺ 0 ∈ D_q`, and the limit engine is one side of it: the walk prunes a
    // prefix when |s_k| exceeds the same tail this enumeration reports and says how deep it got. So the
    // two are the same predicate computed in opposite directions — one keeps the values and takes a
    // minimum, the other throws them away and keeps a depth — and they are required to AGREE rather
    // than to correlate. Measured over the grid below: 1,352 of 1,352, with no disagreements at all.
    const spec = walkSpec(LITTLEWOOD);
    const depth = 12;
    let tested = 0;
    const disagree: string[] = [];
    for (let i = 0; i < 40; i++) {
      for (let j = 0; j < 40; j++) {
        const z = { re: -0.75 + (1.5 * (i + 0.5)) / 40, im: -0.75 + (1.5 * (j + 0.5)) / 40 };
        const absz = Math.hypot(z.re, z.im);
        if (!(absz > 0.05 && absz < 0.79)) continue;
        const eps = epsFor(0.01, absz, 1);
        const tail = tailOf(LITTLEWOOD, z, depth);
        const mine = originInSet(dragonSet(LITTLEWOOD, z, depth, true), tail, eps);
        const theirs = walkAt(spec, z.re, z.im, { depth, eps, computeAnnulus: true }).reach > depth;
        tested++;
        if (mine !== theirs) disagree.push(`${z.re.toFixed(4)},${z.im.toFixed(4)}`);
      }
    }
    expect(tested).toBe(1352);
    expect(disagree.slice(0, 5).join(" | ")).toBe("");
  });

  it("can disagree — and FOSTER'S FUDGE, not the tail, is what the pixel test measures", () => {
    // The first draft of this perturbed the tail at a realistic pixel and found **4 of 1,352** — which
    // looked like a weak falsification and was in fact a measurement of the wrong thing. At a pixel
    // radius of 0.01 the fudge `ε = ρ·max|a|/(1−|z|)²` is ~0.04 while the depth-12 tail is ~2e-4, so
    // `ε` decides every point and the tail contributes nothing: halving it, quartering it and deleting
    // it all give the same 4. Setting `ε = 0` makes the tail the WHOLE criterion, and then the two
    // engines still agree exactly while a wrong tail breaks them in proportion: **0 at the true tail,
    // 60 at half, 144 at a quarter, and 288 — every in-set point there is — at zero.**
    const spec = walkSpec(LITTLEWOOD);
    const depth = 12;
    const broken = (factor: number, eps: number): { broken: number; inSet: number } => {
      let bad = 0;
      let inSet = 0;
      for (let i = 0; i < 40; i++) {
        for (let j = 0; j < 40; j++) {
          const z = { re: -0.75 + (1.5 * (i + 0.5)) / 40, im: -0.75 + (1.5 * (j + 0.5)) / 40 };
          const absz = Math.hypot(z.re, z.im);
          if (!(absz > 0.05 && absz < 0.79)) continue;
          const mine = originInSet(dragonSet(LITTLEWOOD, z, depth, true), tailOf(LITTLEWOOD, z, depth) * factor, eps);
          const theirs = walkAt(spec, z.re, z.im, { depth, eps, computeAnnulus: true }).reach > depth;
          if (theirs) inSet++;
          if (mine !== theirs) bad++;
        }
      }
      return { broken: bad, inSet };
    };
    expect(broken(1, 0)).toEqual({ broken: 0, inSet: 288 });
    expect(broken(0.5, 0).broken).toBe(60);
    expect(broken(0.25, 0).broken).toBe(144);
    expect(broken(0, 0)).toEqual({ broken: 288, inSet: 288 });
    // And the fudge's own effect, which is why it dominates: it admits 112 more points than the exact
    // criterion does. The picture is deliberately a SUPERSET (PR-2), and this is the size of it.
    expect(broken(1, epsFor(0.01, 0.5, 1)).inSet).toBeGreaterThan(288);
  });

  it("the nearest value to the origin is what decides it", () => {
    const z = { re: 0.6, im: 0.3 };
    const pts = dragonSet(LITTLEWOOD, z, 10, true);
    const d = nearestToOrigin(pts);
    expect(d).toBeGreaterThan(0);
    expect(originInSet(pts, d, 0)).toBe(true);
    expect(originInSet(pts, d * 0.999, 0)).toBe(false);
    expect(nearestToOrigin(new Float64Array(0))).toBe(Infinity);
  });
});

describe("theorem mode: Michelen–Yakir, paired rather than Hausdorff", () => {
  /** A prefix polynomial with a root near a point, from the deep walk — the app's own route to one. */
  const prefixAt = (preset: string, cx: string, cy: string, halfHeight: number, minDegree = 0) => {
    const run = runReference({
      alphabet: { preset } as never,
      cx,
      cy,
      halfHeight,
      aspect: 1.55,
      depth: 30,
      precision: "float64",
      budget: 4e6,
    });
    if ("error" in run) throw new Error(run.error);
    const root = run.roots.find((r) => r.degree >= minDegree);
    if (root === undefined) throw new Error(`no root of degree ≥ ${minDegree} at ${cx}, ${cy}`);
    return { digits: root.digits, alpha: { re: Number(run.cx) + root.dx, im: Number(run.cy) + root.dy } };
  };

  it("THE GATE — at Baez's point the overlay lands inside one inset pixel for a degree ≥ 24 prefix", () => {
    // The milestone's gate, with its number in the test. At 0.375453 + 0.544825i the deep walk offers
    // prefixes of many degrees through the same neighbourhood; take one of degree ≥ 24 and magnify its
    // extensions' roots by 1/α^{n+1}. An inset pixel at 220 px across a picture of radius r is r/110.
    const { digits, alpha } = prefixAt("littlewood", "0.375453", "0.544825", 1e-5, 24);
    const overlay = theoremOverlay(LITTLEWOOD, { digits, alpha, extend: 8 });
    if ("error" in overlay) throw new Error(overlay.error);
    expect(overlay.degree).toBeGreaterThanOrEqual(24);
    // The magnification is `|α|^{n+1}` and not `|α|^n`: it is the scale the theorem's own `T_{n,α}`
    // divides by, and it is what the panel prints as the zoom factor and what `noise` is read from.
    const absAlpha = Math.hypot(alpha.re, alpha.im);
    expect(overlay.magnification / Math.pow(absAlpha, overlay.degree + 1)).toBeCloseTo(1, 9);
    expect(overlay.noise).toBeCloseTo(1e-16 / overlay.magnification, 30);
    expect(overlay.predicted.length / 2).toBe(256);
    expect(overlay.actual.length).toBe(overlay.predicted.length);
    const insetPixel = overlay.radius / 110;
    expect(overlay.worst).toBeLessThan(insetPixel);
    // Measured: 1.2e-5 against a picture of radius 0.542 — 2.2e-5 of it, and 0.002 of a pixel.
    expect(overlay.worst / overlay.radius).toBeLessThan(1e-4);
    expect(overlay.kappa).toBeGreaterThan(1);
  });

  it("THE PAIRING sees what a Hausdorff distance cannot: the sign", () => {
    // `T(w) → −R(α)/P′(α)`, and the paper can drop the minus because it is about Littlewood, where
    // `−A = A` makes the predicted SET symmetric — measured below, it is its own negation exactly. So a
    // Hausdorff distance is blind to the sign on the very alphabet the theorem is stated for. The
    // pairing is not: each extension's tail names one point in each array, and negating the prediction
    // sends a tail to some OTHER tail's partner. Measured: 6.8e-3 honest against 1.09 dropped, 159×.
    const { digits, alpha } = prefixAt("littlewood", "0.375453", "0.544825", 1e-5);
    const overlay = theoremOverlay(LITTLEWOOD, { digits, alpha, extend: 8 });
    if ("error" in overlay) throw new Error(overlay.error);
    const key = (re: number, im: number): string => `${re.toFixed(9)},${im.toFixed(9)}`;
    const set = new Set<string>();
    for (let i = 0; i + 1 < overlay.predicted.length; i += 2) set.add(key(overlay.predicted[i], overlay.predicted[i + 1]));
    let missing = 0;
    for (let i = 0; i + 1 < overlay.predicted.length; i += 2) {
      if (!set.has(key(-overlay.predicted[i], -overlay.predicted[i + 1]))) missing++;
    }
    expect(missing).toBe(0); // the SET is symmetric, so Hausdorff cannot see the sign
    let dropped = 0;
    for (let i = 0; i + 1 < overlay.predicted.length; i += 2) {
      dropped = Math.max(
        dropped,
        Math.hypot(overlay.actual[i] + overlay.predicted[i], overlay.actual[i + 1] + overlay.predicted[i + 1]),
      );
    }
    expect(dropped / overlay.worst).toBeGreaterThan(50);
  });

  it("and over {0, 1} the sign moves the SET too, so neither reading could miss it", () => {
    // `−A ≠ A` here, so the predicted set is not symmetric and dropping the minus draws the reflection
    // of the right picture. Measured: 1.2e-2 honest against 8.8e-1 dropped, in a picture of radius 0.44.
    const { digits, alpha } = prefixAt("zero-one", "0.6", "0.55", 2e-4);
    const overlay = theoremOverlay(NEWMAN, { digits, alpha, extend: 8 });
    if ("error" in overlay) throw new Error(overlay.error);
    expect(overlay.worst).toBeLessThan(overlay.radius / 20);
    let dropped = 0;
    for (let i = 0; i + 1 < overlay.predicted.length; i += 2) {
      dropped = Math.max(
        dropped,
        Math.hypot(overlay.actual[i] + overlay.predicted[i], overlay.actual[i + 1] + overlay.predicted[i + 1]),
      );
    }
    expect(dropped).toBeGreaterThan(overlay.radius);
  });

  it("the convergence is a U, and the far side is float64 rather than the theorem", () => {
    // `P·(1 + z^{d+1})` keeps α a root and doubles the prefix degree exactly, so the same root can be
    // read at 16, 33, 67 and 135 with no search. The theorem's error falls; the magnification's noise
    // rises; the sum has a minimum. Measured worst: 6.83e-3, 1.21e-5, 1.80e-4 — and at 135 the mode
    // REFUSES, because 1e-16/|α|^136 is 2.5e+8 in a picture of radius 0.54.
    const { digits, alpha } = prefixAt("littlewood", "0.375453", "0.544825", 1e-5);
    const worst: number[] = [];
    let d = [...digits];
    for (let rep = 0; rep < 4; rep++) {
      const overlay = theoremOverlay(LITTLEWOOD, { digits: d, alpha, extend: 6 });
      if ("error" in overlay) {
        expect(rep).toBe(3);
        expect(overlay.error).toContain("draws noise");
        expect(overlay.error).toContain("a lower-degree prefix through the same root");
      } else {
        worst.push(overlay.worst);
        expect(overlay.noise).toBeLessThan(overlay.radius);
      }
      d = [...d, ...d];
    }
    expect(worst.length).toBe(3);
    expect(worst[1]).toBeLessThan(worst[0] / 100); // the theorem converging
    expect(worst[2]).toBeGreaterThan(worst[1] * 5); // and the arithmetic taking it back
  });

  it("refuses by name rather than drawing what the theorem does not claim", () => {
    const { digits, alpha } = prefixAt("littlewood", "0.375453", "0.544825", 1e-5);
    const bad = (over: Record<string, unknown>): string => {
      const r = theoremOverlay(LITTLEWOOD, { digits, alpha, extend: 4, ...over } as never);
      if (!("error" in r)) throw new Error("expected a refusal");
      return r.error;
    };
    expect(bad({ digits: [0] })).toContain("degree at least 1");
    expect(bad({ digits: [0, 99] })).toContain("digit the alphabet does not have");
    expect(bad({ extend: 40 })).toContain("past this app's budget");
    // **The seed is REFINED before anything is decided**, so "outside the disk" is a statement about
    // the root and not about where the reader clicked. Seeding at 3 on a prefix whose roots are inside
    // is not an error — Newton walks in — so the refusal needs a polynomial whose root really is out:
    // `−1 + z + z²` has roots (−1 ± √5)/2, one of them −1.618.
    expect(theoremOverlay(LITTLEWOOD, { digits, alpha: { re: 3, im: 0 }, extend: 2 })).not.toHaveProperty("error");
    const outside = theoremOverlay(LITTLEWOOD, { digits: [0, 1, 1], alpha: { re: -1.6, im: 0 }, extend: 2 });
    expect("error" in outside && outside.error).toContain("INSIDE the unit disk");
  });
});

describe("why the membership question is asked of the PROPER set", () => {
  it("an alphabet containing 0 holds the origin for free at every depth", () => {
    // The all-zero prefix is a value of the full attractor's enumeration and it is exactly 0, so
    // `nearestToOrigin` over the drawn cloud is 0 at every point of the plane and every depth — which
    // would call the whole picture in-set. Restricting `a_0` to `alphabet.leading` is what the limit
    // walk does and what makes the question mean anything. Over Littlewood, where 0 is not a
    // coefficient, the trap does not exist, which is why it survives unnoticed on the flagship alphabet.
    const z = { re: 0.3, im: 0.61 };
    for (const a of [NEWMAN, A("trinary")]) {
      expect(nearestToOrigin(dragonSet(a, z, 8)), a.id).toBe(0);
      expect(nearestToOrigin(dragonSet(a, z, 8, true)), a.id).toBeGreaterThan(0);
    }
    expect(nearestToOrigin(dragonSet(LITTLEWOOD, { re: 0.3, im: 0.61 }, 8))).toBeGreaterThan(0);
    // And the limit walk agrees with the PROPER reading rather than the full one, at a point the full
    // reading would wrongly claim.
    const spec = walkSpec(NEWMAN);
    const depth = 10;
    const eps = epsFor(0.005, Math.hypot(z.re, z.im), maxAbsOf(NEWMAN));
    const tail = tailOf(NEWMAN, z, depth);
    expect(originInSet(dragonSet(NEWMAN, z, depth), tail, eps)).toBe(true); // the free zero
    expect(originInSet(dragonSet(NEWMAN, z, depth, true), tail, eps)).toBe(
      walkAt(spec, z.re, z.im, { depth, eps, computeAnnulus: true }).reach > depth,
    );
  });
});
