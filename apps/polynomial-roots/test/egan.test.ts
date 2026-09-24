import { describe, it, expect } from "vitest";
import { compileAlphabet, mapRoot } from "../src/engine/alphabet";
import type { Alphabet, AlphabetSpec } from "../src/engine/alphabet";
import { aberth, makeWorkspace } from "@cas/core";
import { hueClasses, hueOf, imageHues } from "../src/engine/egan";
import { applySymmetry, decodeDigits, orbitSpace } from "../src/engine/orbits";
import type { OrbitSpace } from "../src/engine/orbits";
import { sweepChunk } from "../src/engine/sweep";

const alpha = (spec: AlphabetSpec): Alphabet => {
  const r = compileAlphabet(spec);
  if ("error" in r) throw new Error(r.error);
  return r.alphabet;
};

/** Unit-normalise a raw digit vector in place: carry `a_0` to its orbit's representative. */
function normalise(a: Alphabet, degree: number, digits: Int32Array): void {
  const u = a.normUnit[digits[0]];
  if (u === 0) return;
  const perm = a.unitPerm[u];
  for (let k = 0; k <= degree; k++) digits[k] = perm[digits[k]];
}

/** The hue class as an integer, so two computations can be compared exactly. */
const classOf = (a: Alphabet, hue: number, k: number): number => Math.round(hue * hueClasses(a, k));

/** An offset grid, as in `sweep.test.ts` — no small-alphabet root lands on a boundary. */
const OFFSET = 0.0137162;
function cell(x: number, y: number, n: number, R: number): number {
  const i = Math.floor(((x + R + OFFSET) / (2 * R)) * n);
  const j = Math.floor(((y + R + OFFSET) / (2 * R)) * n);
  if (i < 0 || j < 0 || i >= n || j >= n) return -1;
  return j * n + i;
}

/**
 * Brute force: every proper polynomial, no symmetry, each root binned under the hue of ITS OWN
 * unit-normalised coefficients. This is the definition; the sweep has to reproduce it through
 * representatives and group images, which is where a hue could go wrong.
 */
function bruteByHue(a: Alphabet, degree: number, k: number, n: number, R: number): Map<string, number> {
  const out = new Map<string, number>();
  const m = a.values.length;
  const ws = makeWorkspace(degree);
  const cRe = new Float64Array(degree + 1);
  const cIm = new Float64Array(degree + 1);
  const digits = new Int32Array(degree + 1);
  const space = orbitSpace(a, degree);
  const middle = Math.pow(m, Math.max(0, degree - 1));
  for (const first of a.nonZero) {
    for (const last of a.nonZero) {
      for (let mid = 0; mid < middle; mid++) {
        digits[0] = first;
        digits[degree] = last;
        let rest = mid;
        for (let j = 1; j <= degree - 1; j++) {
          const d = rest % m;
          rest = (rest - d) / m;
          digits[j] = d;
        }
        for (let j = 0; j <= degree; j++) {
          cRe[j] = a.values[digits[j]].re;
          cIm[j] = a.values[digits[j]].im;
        }
        if (!aberth(cRe, cIm, degree, ws).converged) throw new Error("brute force did not converge");
        normalise(a, degree, digits);
        const h = classOf(a, hueOf(a, space, digits, k), k);
        for (let r = 0; r < degree; r++) {
          const c = cell(ws.rootRe[r], ws.rootIm[r], n, R);
          if (c < 0) continue;
          const key = `${c}:${h}`;
          out.set(key, (out.get(key) ?? 0) + 1);
        }
      }
    }
  }
  return out;
}

/** The app's path: representatives, each image drawn with the hue the sweep gave THAT image. */
function sweptByHue(a: Alphabet, spec: AlphabetSpec, degree: number, k: number, n: number, R: number): Map<string, number> {
  const r = sweepChunk({ spec, degree, lo: 0, hi: Infinity, circleDelta: 0.05, hueDigits: k });
  if ("error" in r) throw new Error(r.error);
  if (r.hues === undefined) throw new Error("no hues");
  const G = a.group.length;
  expect(r.hues.length).toBe((r.points.length / 3) * G);
  const out = new Map<string, number>();
  for (let p = 0, q = 0; p < r.points.length; p += 3, q += G) {
    for (let g = 0; g < G; g++) {
      const z = mapRoot(a.group[g], r.points[p], r.points[p + 1]);
      const c = cell(z.re, z.im, n, R);
      if (c < 0) continue;
      const key = `${c}:${classOf(a, r.hues[q + g], k)}`;
      out.set(key, (out.get(key) ?? 0) + r.points[p + 2] * a.units.length);
    }
  }
  return out;
}

describe("Egan's hue is the family's own, through the symmetry reduction", () => {
  // The claim the whole mode rests on: density BY HUE, drawn from representatives and group images, is
  // exactly the density by hue of every polynomial solved separately. An image drawn with the
  // representative's hue instead of its own passes every density test in the suite and fails this one.
  const cases: { spec: AlphabetSpec; degree: number; k: number }[] = [
    { spec: { preset: "littlewood" }, degree: 7, k: 3 },
    { spec: { preset: "littlewood" }, degree: 8, k: 2 },
    // One coefficient: the smallest request the mode makes, and the one a `> 1` gate would silently drop.
    { spec: { preset: "littlewood" }, degree: 6, k: 1 },
    { spec: { preset: "zero-one" }, degree: 8, k: 3 },
    { spec: { preset: "trinary" }, degree: 5, k: 2 },
    { spec: { preset: "range", n: 2 }, degree: 3, k: 2 },
    { spec: { preset: "roots-of-unity", n: 3 }, degree: 4, k: 2 },
    { spec: { preset: "custom", custom: "1, -1, i, -i" }, degree: 3, k: 2 },
  ];
  for (const { spec, degree, k } of cases) {
    it(`${JSON.stringify(spec)} at degree ${degree}, ${k} coefficients`, () => {
      const a = alpha(spec);
      const R = 3.2;
      const n = 21;
      const truth = bruteByHue(a, degree, k, n, R);
      const mine = sweptByHue(a, spec, degree, k, n, R);
      let worst = 0;
      let summed = 0;
      for (const key of new Set([...truth.keys(), ...mine.keys()])) {
        const d = Math.abs((truth.get(key) ?? 0) - (mine.get(key) ?? 0));
        worst = Math.max(worst, d);
        summed += d;
      }
      // Anti-vacuity: EVERY hue the alphabet can give appears — a mode that gave every root one hue
      // would otherwise agree with itself.
      const hues = new Set([...truth.keys()].map((key) => key.split(":")[1]));
      expect(hues.size).toBe(hueClasses(a, k));
      expect(worst).toBeLessThanOrEqual(1.0001);
      expect(summed).toBeLessThanOrEqual(2.0001);
    });
  }
});

describe("what the hue is", () => {
  const lw = alpha({ preset: "littlewood" });
  const space: OrbitSpace = orbitSpace(lw, 6);

  it("is a function of the polynomial up to its units — P and −P are one colour", () => {
    // Littlewood's units are ±1, and the raw coefficients of P and −P differ everywhere.
    const d = new Int32Array(7);
    decodeDigits(lw, space, 11, d);
    const neg = Int32Array.from(d, (j) => lw.unitPerm[1][j]);
    expect(lw.values[neg[0]].re).toBe(-lw.values[d[0]].re);
    normalise(lw, 6, neg);
    expect(hueOf(lw, space, neg, 3)).toBe(hueOf(lw, space, d, 3));
  });

  it("NESTS: a longer shared prefix is a closer colour, and the degree does not change the classes", () => {
    const a = new Int32Array([lw.leading[0], 1, 0, 1, 0, 0, 1]);
    const b = new Int32Array([lw.leading[0], 1, 0, 0, 1, 1, 1]);
    const c = new Int32Array([lw.leading[0], 0, 1, 1, 0, 0, 1]);
    const ha = hueOf(lw, space, a, 6);
    // a and b share two digits after a_0, a and c none: b is within 2^-2, c is not.
    expect(Math.abs(ha - hueOf(lw, space, b, 6))).toBeLessThan(0.25);
    expect(Math.abs(ha - hueOf(lw, space, c, 6))).toBeGreaterThanOrEqual(0.25);
    // A degree-2 polynomial with prefix (1, 0) sits at the START of the sector its degree-6 extensions
    // share — the expansion stops early rather than meaning something else.
    const short = orbitSpace(lw, 2);
    const s = new Int32Array([lw.leading[0], 1, 0]);
    const hs = hueOf(lw, short, s, 6);
    expect(ha).toBeGreaterThanOrEqual(hs);
    expect(ha - hs).toBeLessThan(0.25);
    // And the expansion reads a_d when the polynomial is shorter than k: it is a coefficient after the
    // constant term like any other. The sweep found this unpinned — `(lead, 1, 0)` ends in the digit 0,
    // which contributes nothing whether it is read or not.
    expect(hueOf(lw, short, new Int32Array([lw.leading[0], 1, 1]), 6)).toBe(0.75);
    for (const h of [ha, hs]) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it("reads the constant term too, where the units leave more than one representative", () => {
    // {−2 … 2}: units ±1 leave two constant-term classes, 1 and 2, and they must not share a hue.
    const r2 = alpha({ preset: "range", n: 2 });
    expect(r2.leading.length).toBe(2);
    const sp = orbitSpace(r2, 3);
    const one = new Int32Array([r2.leading[0], 2, 2, 3]);
    const two = new Int32Array([r2.leading[1], 2, 2, 3]);
    expect(hueOf(r2, sp, two, 2) - hueOf(r2, sp, one, 2)).toBeCloseTo(0.5, 12);
  });

  it("gives the reversal image the TOP of the polynomial", () => {
    // Outside the unit disk a root belongs to the reversed polynomial, so its colour must come from the
    // representative's high-order coefficients. Checked on a vector whose top and bottom differ.
    const d = new Int32Array([lw.leading[0], 1, 1, 0, 0, 0, 0]);
    const G = lw.group.length;
    const hues = new Float64Array(G);
    imageHues(lw, space, d, 3, new Int32Array(7), hues);
    const scratch = new Int32Array(7);
    for (let g = 0; g < G; g++) {
      applySymmetry(lw, 6, d, lw.group[g], scratch);
      expect(hues[g]).toBe(hueOf(lw, space, scratch, 3));
    }
    const identity = lw.group.findIndex((g) => !g.rev && !g.neg && !g.conj);
    const reversal = lw.group.findIndex((g) => g.rev && !g.neg && !g.conj);
    expect(identity).toBeGreaterThanOrEqual(0);
    expect(reversal).toBeGreaterThanOrEqual(0);
    expect(hues[reversal]).not.toBe(hues[identity]);
  });

  it("is not computed unless asked for", () => {
    const r = sweepChunk({ spec: { preset: "littlewood" }, degree: 6, lo: 0, hi: Infinity, circleDelta: 0.05 });
    if ("error" in r) throw new Error(r.error);
    expect(r.hues).toBeUndefined();
  });
});

/** Mean resultant length of the hues per pixel, averaged over the pixels of each |z| band. */
function coherenceByBand(spec: AlphabetSpec, degree: number, k: number, bands: readonly [number, number][]): number[] {
  const a = alpha(spec);
  const n = 300;
  const R = 2;
  const W = new Float64Array(n * n);
  const C = new Float64Array(n * n);
  const S = new Float64Array(n * n);
  const r = sweepChunk({ spec, degree, lo: 0, hi: Infinity, circleDelta: 0.02, hueDigits: k });
  if ("error" in r || r.hues === undefined) throw new Error("sweep");
  const G = a.group.length;
  for (let p = 0, q = 0; p < r.points.length; p += 3, q += G) {
    for (let g = 0; g < G; g++) {
      const z = mapRoot(a.group[g], r.points[p], r.points[p + 1]);
      const i = Math.floor(((z.re + R) / (2 * R)) * n);
      const j = Math.floor(((z.im + R) / (2 * R)) * n);
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const c = j * n + i;
      const w = r.points[p + 2];
      const th = 2 * Math.PI * r.hues[q + g];
      W[c] += w;
      C[c] += w * Math.cos(th);
      S[c] += w * Math.sin(th);
    }
  }
  return bands.map(([lo, hi]) => {
    let sum = 0;
    let count = 0;
    for (let c = 0; c < n * n; c++) {
      if (W[c] < 3) continue; // a pixel with one or two roots is coherent by counting, not by geometry
      const i = c % n;
      const j = (c - i) / n;
      const m = Math.hypot(((i + 0.5) / n) * 2 * R - R, ((j + 0.5) / n) * 2 * R - R);
      if (m < lo || m >= hi) continue;
      sum += Math.hypot(C[c], S[c]) / W[c];
      count++;
    }
    return count > 0 ? sum / count : NaN;
  });
}

describe("where the hue means something", () => {
  it("is coherent deep inside the disk, fades toward the circle, and is mixed outside it", () => {
    // The legend's `≈` sentence, as a measurement the suite re-takes. Measured at degree 12: 0.990,
    // 0.720, 0.497, 0.458, 0.345 over these bands (degree 14, in `egan.ts`: 0.99, 0.81, 0.40, 0.25, ≤ 0.46).
    const bands: [number, number][] = [
      [0.5, 0.7],
      [0.7, 0.8],
      [0.8, 0.9],
      [0.97, 1.03],
      [1.25, 2],
    ];
    const [deep, near, nearer, circle, outside] = coherenceByBand({ preset: "littlewood" }, 12, 3, bands);
    expect(deep).toBeGreaterThan(0.95);
    expect(near).toBeLessThan(deep);
    expect(nearer).toBeLessThan(near);
    expect(circle).toBeLessThan(0.5);
    expect(outside).toBeLessThan(0.6);
  });
});
