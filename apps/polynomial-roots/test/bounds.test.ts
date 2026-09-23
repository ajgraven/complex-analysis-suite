import { describe, it, expect } from "vitest";
import { compileAlphabet } from "../src/engine/alphabet";
import type { Alphabet } from "../src/engine/alphabet";
import { orbitSpace } from "../src/engine/orbits";
import { sweepChunk } from "../src/engine/sweep";
import { boundFor, PHI, toScreen } from "../src/stage/bounds";

const A = (preset: string): Alphabet => {
  const r = compileAlphabet({ preset } as never);
  if ("error" in r) throw new Error(r.error);
  return r.alphabet;
};

/** Every root of every proper polynomial of degree `1 … maxDegree`, the whole symmetry orbit expanded. */
function allRoots(preset: string, maxDegree: number): { re: number; im: number; degree: number }[] {
  const a = A(preset);
  const out: { re: number; im: number; degree: number }[] = [];
  for (let degree = 1; degree <= maxDegree; degree++) {
    const space = orbitSpace(a, degree);
    const sw = sweepChunk({ spec: { preset } as never, degree, lo: 0, hi: space.total, circleDelta: 0.02 });
    if ("error" in sw) throw new Error(sw.error);
    for (let p = 0; p + 2 < sw.points.length; p += 3) {
      for (const g of a.group) {
        let x = sw.points[p];
        let y = sw.points[p + 1];
        if (g.conj) y = -y;
        if (g.rev) {
          const d = x * x + y * y;
          x = x / d;
          y = -y / d;
        }
        if (g.neg) {
          x = -x;
          y = -y;
        }
        out.push({ re: x, im: y, degree });
      }
    }
  }
  return out;
}

describe("a published bound is CHECKED, not drawn on trust", () => {
  it("Odlyzko–Poonen: every {0, 1} root lies inside 1/Φ < |z| < Φ and Re z < 3/2", () => {
    // An inclusion over every root the engine finds, and then the two margins that stop it being
    // vacuous — a region drawn far from every root would pass the inclusion trivially.
    const bound = boundFor(A("zero-one"));
    if (bound === null) throw new Error("no bound for {0, 1}");
    const roots = allRoots("zero-one", 16);
    expect(roots.length).toBeGreaterThan(100000);
    const outside = roots.filter((r) => !bound.contains(r.re, r.im));
    expect(outside.slice(0, 3)).toEqual([]);
    let maxR = 0;
    let minR = Infinity;
    let maxRe = -Infinity;
    for (const r of roots) {
      const m = Math.hypot(r.re, r.im);
      maxR = Math.max(maxR, m);
      minR = Math.min(minR, m);
      maxRe = Math.max(maxRe, r.re);
    }
    // **One bound is SHARP and the other is not, and the picture shows which.** Measured to degree 16:
    // the outermost root is at |z| = 1.6174, 6.2e-4 inside Φ (and 1.3e-4 by degree 20), and by the
    // z ↦ 1/z symmetry the innermost is as close to 1/Φ. The rightmost root is at Re z = 1.1358 and
    // PLATEAUS there — 1.1323, 1.1358, 1.1367, 1.1354 at degrees 14, 16, 18, 20 — so the half-plane is
    // 0.36 away from everything this app draws. True, and loose; the first draft of this test asked for
    // a margin under 0.3 on all three and the measurement said otherwise.
    expect(PHI - maxR, `max|z| = ${maxR}`).toBeGreaterThan(0);
    expect(PHI - maxR, `max|z| = ${maxR}`).toBeLessThan(1e-3);
    expect(minR - 1 / PHI, `min|z| = ${minR}`).toBeGreaterThan(0);
    expect(minR - 1 / PHI, `min|z| = ${minR}`).toBeLessThan(1e-3);
    expect(maxRe).toBeCloseTo(1.1358, 3);
    expect(1.5 - maxRe).toBeGreaterThan(0.3);
    // The legend's "very few roots" is a number: at degree 16, 94 of 528,384 lie beyond |z| = 1.6.
    const d16 = roots.filter((r) => r.degree === 16);
    const beyond = d16.filter((r) => Math.hypot(r.re, r.im) > 1.6).length;
    expect(d16.length).toBe(528384);
    expect(beyond).toBe(94);
  });

  it("Cauchy: every {−1, 0, 1} root lies inside 1/2 < |z| < 2", () => {
    const bound = boundFor(A("trinary"));
    if (bound === null) throw new Error("no bound for {−1, 0, 1}");
    const roots = allRoots("trinary", 10);
    expect(roots.length).toBeGreaterThan(100000);
    expect(roots.filter((r) => !bound.contains(r.re, r.im)).slice(0, 3)).toEqual([]);
    let maxR = 0;
    for (const r of roots) maxR = Math.max(maxR, Math.hypot(r.re, r.im));
    // Sharp only in the limit — `z^d − z^{d−1} − … − 1` has a root tending to 2 — so at degree 10 the
    // outermost root is close but not at it.
    expect(maxR).toBeLessThan(2);
    expect(maxR).toBeGreaterThan(1.9);
  });

  it("can FAIL — a region one step tighter excludes real roots, so the inclusion is evidence", () => {
    // PR-2's lesson: an inclusion nothing can violate is not evidence. Shrink each bound by a few
    // percent and roots fall outside.
    const nm = allRoots("zero-one", 16);
    expect(nm.some((r) => Math.hypot(r.re, r.im) > 0.97 * PHI)).toBe(true);
    // The half-plane is loose, so its falsification has to be drawn where the roots actually stop.
    expect(nm.some((r) => r.re > 1.1)).toBe(true);
    const tr = allRoots("trinary", 10);
    expect(tr.some((r) => Math.hypot(r.re, r.im) > 0.95 * 2)).toBe(true);
  });

  it("`contains` is the region the curves draw — each edge tested from both sides", () => {
    // The inclusion above cannot see an edge moved OUTWARD (every root still passes) and the margins
    // read the roots rather than `contains`, so the sweep widened each radius — 1/Φ → ½, Φ → 1.7,
    // ½ → 0, 2 → 2.5 — with the suite green. Each curve is now checked against its own predicate.
    for (const preset of ["zero-one", "trinary"]) {
      const bound = boundFor(A(preset));
      if (bound === null) throw new Error(preset);
      for (const curve of bound.curves) {
        const probe = (t: number): [number, number] =>
          curve.kind === "circle" ? [0, curve.radius * t] : [curve.re * t, 0];
        // Just inside and just outside, along a ray the OTHER curves do not cut near the edge.
        const inside = curve.kind === "circle" && curve.radius < 1 ? 1.01 : 0.99;
        const outside = curve.kind === "circle" && curve.radius < 1 ? 0.99 : 1.01;
        expect(bound.contains(...probe(inside)), `${preset} ${curve.label} inside`).toBe(true);
        expect(bound.contains(...probe(outside)), `${preset} ${curve.label} outside`).toBe(false);
      }
    }
  });

  it("only the two alphabets the literature bounds carry one", () => {
    expect(boundFor(A("littlewood"))).toBeNull();
    expect(boundFor(A("zero-one"))?.source).toContain("Odlyzko");
    expect(boundFor(A("trinary"))?.source).toContain("Cauchy");
    const custom = compileAlphabet({ preset: "custom", custom: "1, 0" } as never);
    if ("error" in custom) throw new Error(custom.error);
    // Recognised by VALUE, not by preset name, so a custom {1, 0} carries Odlyzko–Poonen too.
    expect(boundFor(custom.alphabet)?.source).toContain("Odlyzko");
  });
});

describe("the overlay's coordinates", () => {
  it("puts the view's centre at the frame's centre and keeps one scale", () => {
    const view = { cx: 0.3, cy: -0.2, halfHeight: 1.5, width: 900, height: 600 };
    const c = toScreen(view, 0.3, -0.2);
    expect(c.x).toBeCloseTo(450, 9);
    expect(c.y).toBeCloseTo(300, 9);
    const top = toScreen(view, 0.3, -0.2 + 1.5);
    expect(top.y).toBeCloseTo(0, 9);
    const right = toScreen(view, 0.3 + 1.5, -0.2);
    expect(right.x - c.x).toBeCloseTo(300, 9); // the same scale as the vertical
  });
});
