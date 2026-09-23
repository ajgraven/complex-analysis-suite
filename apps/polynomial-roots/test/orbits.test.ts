import { describe, it, expect } from "vitest";
import { compileAlphabet, mapRoot } from "../src/engine/alphabet";
import type { Alphabet, AlphabetSpec } from "../src/engine/alphabet";
import {
  applySymmetry,
  canonicalOf,
  decodeDigits,
  encodeDigits,
  orbitSpace,
  properCount,
} from "../src/engine/orbits";

const alpha = (spec: AlphabetSpec): Alphabet => {
  const r = compileAlphabet(spec);
  if ("error" in r) throw new Error(r.error);
  return r.alphabet;
};

const SPECS: AlphabetSpec[] = [
  { preset: "littlewood" },
  { preset: "zero-one" },
  { preset: "trinary" },
  { preset: "range", n: 2 },
  { preset: "roots-of-unity", n: 3 },
  { preset: "roots-of-unity", n: 4 },
  { preset: "custom", custom: "1, -1, i, -i" },
];

describe("the index space is a bijection", () => {
  it("encode ∘ decode is the identity on every index, for every preset and small degree", () => {
    for (const spec of SPECS) {
      const a = alpha(spec);
      for (let degree = 1; degree <= 4; degree++) {
        const space = orbitSpace(a, degree);
        const digits = new Int32Array(degree + 1);
        expect(space.total).toBeGreaterThan(0);
        const seen = new Set<string>();
        for (let i = 0; i < space.total; i++) {
          decodeDigits(a, space, i, digits);
          // Properness: the constant term is a representative and the leading term is non-zero.
          expect(space.leadPos[digits[0]]).toBeGreaterThanOrEqual(0);
          expect(space.nzPos[digits[degree]]).toBeGreaterThanOrEqual(0);
          const back = encodeDigits(space, digits);
          expect(back).toBe(i);
          seen.add(digits.join(","));
        }
        expect(seen.size).toBe(space.total);
      }
    }
  });

  it("the space is exactly the proper family modulo units", () => {
    for (const spec of SPECS) {
      const a = alpha(spec);
      for (let degree = 1; degree <= 5; degree++) {
        expect(orbitSpace(a, degree).total * a.units.length).toBe(properCount(a, degree));
      }
    }
  });
});

describe("the symmetry group acts on the index space", () => {
  it("every image is still a proper, normalised vector — nothing leaves the space", () => {
    for (const spec of SPECS) {
      const a = alpha(spec);
      for (let degree = 1; degree <= 4; degree++) {
        const space = orbitSpace(a, degree);
        const digits = new Int32Array(degree + 1);
        const out = new Int32Array(degree + 1);
        for (let i = 0; i < space.total; i++) {
          decodeDigits(a, space, i, digits);
          for (const g of a.group) {
            applySymmetry(a, degree, digits, g, out);
            expect(space.leadPos[out[0]], `lead after ${JSON.stringify(g)}`).toBeGreaterThanOrEqual(0);
            expect(space.nzPos[out[degree]]).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it("the group is CLOSED on representatives — the (−1)^d that neg and rev disagree by is a unit", () => {
    // Negation and reversal commute only up to a global (−1)^d factor, which the normalisation removes.
    // That argument is the header's; this is the check. Applying any generator to any image must land
    // back inside the image set.
    for (const spec of SPECS) {
      const a = alpha(spec);
      for (let degree = 1; degree <= 5; degree++) {
        const space = orbitSpace(a, degree);
        const digits = new Int32Array(degree + 1);
        const img = new Int32Array(degree + 1);
        const again = new Int32Array(degree + 1);
        for (let i = 0; i < space.total; i += Math.max(1, Math.floor(space.total / 40))) {
          decodeDigits(a, space, i, digits);
          const orbit = new Set<number>();
          for (const g of a.group) {
            applySymmetry(a, degree, digits, g, img);
            orbit.add(encodeDigits(space, img));
          }
          for (const idx of [...orbit]) {
            decodeDigits(a, space, idx, img);
            for (const g of a.group) {
              applySymmetry(a, degree, img, g, again);
              expect(orbit.has(encodeDigits(space, again))).toBe(true);
            }
          }
        }
      }
    }
  });

  it("a coefficient symmetry really induces the ROOT map it claims", () => {
    // The whole reduction rests on this: if `gP` is the transformed polynomial then its roots are
    // `σ_g(roots P)`. Checked by evaluating, not by algebra — `Q(σ_g(z)) = 0` wherever `P(z) = 0`.
    const a = alpha({ preset: "littlewood" });
    const degree = 5;
    const space = orbitSpace(a, degree);
    const digits = new Int32Array(degree + 1);
    const img = new Int32Array(degree + 1);
    const evalAt = (d: Int32Array, x: number, y: number): { re: number; im: number } => {
      let pr = 0;
      let pi = 0;
      let zr = 1;
      let zi = 0;
      for (let k = 0; k <= degree; k++) {
        const v = a.values[d[k]];
        pr += v.re * zr - v.im * zi;
        pi += v.re * zi + v.im * zr;
        const nzr = zr * x - zi * y;
        zi = zr * y + zi * x;
        zr = nzr;
      }
      return { re: pr, im: pi };
    };
    for (let i = 0; i < space.total; i += 7) {
      decodeDigits(a, space, i, digits);
      // A point where P vanishes, found by a short Newton run from a generic start.
      let x = 0.6;
      let y = 0.37;
      for (let step = 0; step < 200; step++) {
        const p = evalAt(digits, x, y);
        const h = 1e-7;
        const px = evalAt(digits, x + h, y);
        const dr = (px.re - p.re) / h;
        const di = (px.im - p.im) / h;
        const den = dr * dr + di * di;
        if (den < 1e-30) break;
        x -= (p.re * dr + p.im * di) / den;
        y -= (p.im * dr - p.re * di) / den;
      }
      const at = evalAt(digits, x, y);
      if (Math.hypot(at.re, at.im) > 1e-9) continue; // Newton did not land; not this test's business
      for (const g of a.group) {
        applySymmetry(a, degree, digits, g, img);
        const w = mapRoot(g, x, y);
        const q = evalAt(img, w.re, w.im);
        // A unit scaling may multiply the value; vanishing is what matters, scaled by the size of |z|^d.
        const scale = Math.max(1, Math.pow(Math.hypot(w.re, w.im), degree));
        expect(Math.hypot(q.re, q.im) / scale).toBeLessThan(1e-7);
      }
    }
  });
});

describe("canonical representatives and their stabilisers", () => {
  it("exactly one representative per orbit, and the stabiliser is the orbit's own count", () => {
    for (const spec of SPECS) {
      const a = alpha(spec);
      for (let degree = 1; degree <= 5; degree++) {
        const space = orbitSpace(a, degree);
        const digits = new Int32Array(degree + 1);
        const img = new Int32Array(degree + 1);
        const reps: number[] = [];
        const covered = new Set<number>();
        let weighted = 0;
        for (let i = 0; i < space.total; i++) {
          decodeDigits(a, space, i, digits);
          const { canonical, stabiliser } = canonicalOf(a, space, digits, img);
          if (!canonical) {
            expect(stabiliser).toBe(0); // a non-representative reports no weight at all
            continue;
          }
          reps.push(i);
          const orbit = new Set<number>();
          for (const g of a.group) {
            applySymmetry(a, degree, digits, g, img);
            orbit.add(encodeDigits(space, img));
          }
          // |orbit| · |stabiliser| = |G| — the orbit–stabiliser theorem, as an assertion.
          expect(orbit.size * stabiliser).toBe(a.group.length);
          for (const o of orbit) {
            expect(covered.has(o)).toBe(false); // orbits do not overlap
            covered.add(o);
          }
          weighted += a.group.length / stabiliser;
        }
        // The orbits partition the space...
        expect(covered.size).toBe(space.total);
        // ...and the weights the sweep will use sum to it exactly.
        expect(weighted).toBe(space.total);
        expect(reps.length).toBeGreaterThan(0);
      }
    }
  });

  it("a fixed polynomial really is fixed — palindromes are the case the weights exist for", () => {
    const a = alpha({ preset: "littlewood" });
    const degree = 4;
    const space = orbitSpace(a, degree);
    const digits = new Int32Array(degree + 1);
    const img = new Int32Array(degree + 1);
    let fixedFound = 0;
    for (let i = 0; i < space.total; i++) {
      decodeDigits(a, space, i, digits);
      const { canonical, stabiliser } = canonicalOf(a, space, digits, img);
      if (canonical && stabiliser > 1) fixedFound++;
    }
    // Littlewood degree 4 has palindromes (1,±1,±1,±1,1 reversed to itself); if none were found the
    // stabiliser machinery would never be exercised and the weight test above would be vacuous.
    expect(fixedFound).toBeGreaterThan(0);
  });
});
