import { describe, it, expect } from "vitest";
import {
  buildGroup,
  compileAlphabet,
  formatCx,
  mapRoot,
  parseAlphabet,
  specId,
  valuesOfSpec,
} from "../src/engine/alphabet";
import type { AlphabetSpec, Cx } from "../src/engine/alphabet";

const ok = <T>(r: T | { error: string }): T => {
  if (typeof r === "object" && r !== null && "error" in r) throw new Error(String(r.error));
  return r as T;
};
const alpha = (spec: AlphabetSpec) => ok(compileAlphabet(spec)).alphabet;

describe("the alphabet's symmetries are DERIVED, not assumed", () => {
  it("Littlewood has negation, reversal and the two units — Christensen's 8-fold reduction", () => {
    const a = alpha({ preset: "littlewood" });
    expect(a.hasNeg).toBe(true);
    expect(a.allReal).toBe(true);
    expect(a.units).toHaveLength(2);
    // Conjugation is off the GROUP for a real alphabet (each polynomial's roots are already
    // conjugate-closed); the header says so and this is the assertion.
    expect(a.group).toHaveLength(4);
    expect(a.group.some((g) => g.conj)).toBe(false);
    // One constant-term representative: {−1, +1} is a single unit-orbit.
    expect(a.leading).toHaveLength(1);
  });

  it("{0, 1} has NO negation — the reduction that assumed it would paint a different set", () => {
    const a = alpha({ preset: "zero-one" });
    expect(a.hasNeg).toBe(false);
    expect(a.units).toHaveLength(1);
    expect(a.group).toHaveLength(2); // identity and reversal only
    expect(a.nonZero).toHaveLength(1);
  });

  it("{−1, 0, 1} has negation and two units, and 0 is not a constant term", () => {
    const a = alpha({ preset: "trinary" });
    expect(a.hasNeg).toBe(true);
    expect(a.units).toHaveLength(2);
    expect(a.group).toHaveLength(4);
    expect(a.nonZero).toHaveLength(2);
    expect(a.leading).toHaveLength(1);
  });

  it("the n-th roots of unity have n units and are NOT real, so conjugation joins the group", () => {
    const a = alpha({ preset: "roots-of-unity", n: 3 });
    expect(a.values).toHaveLength(3);
    expect(a.allReal).toBe(false);
    expect(a.units).toHaveLength(3);
    expect(a.hasConj).toBe(true);
    expect(a.hasNeg).toBe(false); // −1 is not a cube root of unity
    expect(a.group).toHaveLength(4); // identity, rev, conj, rev·conj
    expect(a.leading).toHaveLength(1); // the three values are one unit-orbit
  });

  it("the 4th roots of unity DO have negation — the check, not the name, decides", () => {
    const a = alpha({ preset: "roots-of-unity", n: 4 });
    expect(a.hasNeg).toBe(true);
    expect(a.units).toHaveLength(4);
    expect(a.group).toHaveLength(8);
  });

  it("{−n … n} has negation but only ±1 as units, so there are n constant-term representatives", () => {
    const a = alpha({ preset: "range", n: 3 });
    expect(a.values).toHaveLength(7);
    expect(a.hasNeg).toBe(true);
    expect(a.units).toHaveLength(2); // ±1; 2·A ⊄ A
    expect(a.nonZero).toHaveLength(6);
    expect(a.leading).toHaveLength(3); // {1,2,3} represent {±1},{±2},{±3}
  });

  it("brute force: every claimed symmetry really maps the alphabet to itself, and no unclaimed one does", () => {
    const specs: AlphabetSpec[] = [
      { preset: "littlewood" },
      { preset: "zero-one" },
      { preset: "trinary" },
      { preset: "range", n: 1 },
      { preset: "range", n: 4 },
      { preset: "roots-of-unity", n: 2 },
      { preset: "roots-of-unity", n: 3 },
      { preset: "roots-of-unity", n: 5 },
      { preset: "roots-of-unity", n: 6 },
      { preset: "custom", custom: "1, -1, i, -i" },
      { preset: "custom", custom: "0, 1, i" },
      { preset: "custom", custom: "2, -2, 5" },
      { preset: "custom", custom: "1, 2, 3" },
      { preset: "custom", custom: "0, 1, -1, 2" },
    ];
    const has = (vals: readonly Cx[], v: Cx) =>
      vals.some((w) => Math.abs(w.re - v.re) < 1e-9 && Math.abs(w.im - v.im) < 1e-9);
    for (const spec of specs) {
      const a = alpha(spec);
      const realNeg = a.values.every((v) => has(a.values, { re: -v.re, im: -v.im }));
      const realConj = a.values.every((v) => has(a.values, { re: v.re, im: -v.im }));
      expect(a.hasNeg, `neg on ${specId(spec)}`).toBe(realNeg);
      expect(a.hasConj, `conj on ${specId(spec)}`).toBe(realConj);
      // Every claimed unit permutes the alphabet, and nothing outside the claimed set does.
      for (const u of a.units) {
        for (const v of a.values) {
          expect(has(a.values, { re: u.re * v.re - u.im * v.im, im: u.re * v.im + u.im * v.re })).toBe(true);
        }
      }
      const candidates: Cx[] = [];
      for (const p of a.values) {
        for (const q of a.values) {
          const d = p.re * p.re + p.im * p.im;
          if (d < 1e-18) continue;
          candidates.push({ re: (q.re * p.re + q.im * p.im) / d, im: (q.im * p.re - q.re * p.im) / d });
        }
      }
      for (const u of candidates) {
        // PERMUTES, not merely "maps into": `u = 0` sends every value of {0, 1} into the alphabet and is
        // not a symmetry of it (and `P ↦ 0·P` is not a proper polynomial). Writing the weaker predicate
        // here is what first made this assertion fail.
        const images = a.values.map((v) => ({ re: u.re * v.re - u.im * v.im, im: u.re * v.im + u.im * v.re }));
        const permutes =
          images.every((w) => has(a.values, w)) &&
          images.every((w, i) => images.findIndex((x) => Math.hypot(x.re - w.re, x.im - w.im) < 1e-9) === i);
        expect(has(a.units, u), `unit ${formatCx(u)} on ${specId(spec)}`).toBe(permutes);
      }
    }
  });

  it("the permutation tables agree with the arithmetic they stand in for", () => {
    const a = alpha({ preset: "roots-of-unity", n: 6 });
    for (let j = 0; j < a.values.length; j++) {
      const v = a.values[j];
      expect(a.values[a.negPerm[j]].re).toBeCloseTo(-v.re, 12);
      expect(a.values[a.conjPerm[j]].im).toBeCloseTo(-v.im, 12);
      for (let u = 0; u < a.units.length; u++) {
        const uv = a.units[u];
        expect(a.values[a.unitPerm[u][j]].re).toBeCloseTo(uv.re * v.re - uv.im * v.im, 12);
        expect(a.values[a.unitPerm[u][j]].im).toBeCloseTo(uv.re * v.im + uv.im * v.re, 12);
      }
    }
    // `normUnit` carries every non-zero digit to a constant-term representative.
    for (const j of a.nonZero) {
      expect(a.leading).toContain(a.unitPerm[a.normUnit[j]][j]);
    }
  });

  it("units[0] is the identity, so unitPerm[0] is the no-op the normaliser skips", () => {
    for (const spec of [{ preset: "littlewood" as const }, { preset: "roots-of-unity" as const, n: 5 }]) {
      const a = alpha(spec);
      expect(a.units[0].re).toBeCloseTo(1, 12);
      expect(a.units[0].im).toBeCloseTo(0, 12);
      expect(Array.from(a.unitPerm[0])).toEqual(a.values.map((_, j) => j));
    }
  });
});

describe("the root maps the symmetries induce", () => {
  it("negation, inversion and conjugation, and they commute", () => {
    const g = buildGroup(true, true);
    expect(g).toHaveLength(8);
    const r = mapRoot({ neg: true, rev: false, conj: false }, 0.5, 0.25);
    expect(r).toEqual({ re: -0.5, im: -0.25 });
    const inv = mapRoot({ neg: false, rev: true, conj: false }, 0.5, 0.25);
    // 1/(0.5+0.25i) = (0.5−0.25i)/0.3125
    expect(inv.re).toBeCloseTo(1.6, 12);
    expect(inv.im).toBeCloseTo(-0.8, 12);
    const both = mapRoot({ neg: true, rev: true, conj: true }, 0.5, 0.25);
    expect(both.re).toBeCloseTo(-1.6, 12);
    expect(both.im).toBeCloseTo(-0.8, 12);
  });

  it("the identity is first in the group, whatever generators it has", () => {
    for (const [n, c] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ] as const) {
      const g = buildGroup(n, c);
      expect(g[0]).toEqual({ neg: false, rev: false, conj: false });
    }
  });
});

describe("parsing a custom alphabet", () => {
  it("reads the forms a reader would type", () => {
    const r = ok(parseAlphabet("1, -1, i, -i, 2+3i, -0.5-0.5i, 2i"));
    expect(r.values).toHaveLength(7);
    expect(r.values.map(formatCx)).toContain("i");
    expect(r.values.map(formatCx)).toContain("2+3i");
    expect(r.values.map(formatCx)).toContain("−0.5−0.5i");
  });

  it("accepts commas, semicolons or plain spaces", () => {
    for (const text of ["1, -1", "1 -1", "1;-1", " 1 ,  -1 "]) {
      expect(ok(parseAlphabet(text)).values).toHaveLength(2);
    }
  });

  it("REFUSES BY NAME rather than half-reading — a mistyped alphabet is not a different picture", () => {
    for (const bad of ["", "   ", "1", "1, 1", "1, banana", "1, -", "0, 0"]) {
      const r = parseAlphabet(bad);
      expect("error" in r, `"${bad}" should refuse`).toBe(true);
    }
    const r = parseAlphabet("1, banana");
    expect("error" in r && r.error).toContain("banana");
  });

  it("de-duplicates and orders, so how it was typed does not change the digit order", () => {
    const a = ok(parseAlphabet("1, -1, 1"));
    const b = ok(parseAlphabet("-1, 1"));
    expect(a.values).toEqual(b.values);
    expect(a.values[0].re).toBe(-1);
  });
});

describe("presets and their parameters", () => {
  it("refuses a parameter outside the range it can compute", () => {
    expect("error" in valuesOfSpec({ preset: "range", n: 0 })).toBe(true);
    expect("error" in valuesOfSpec({ preset: "range", n: 50 })).toBe(true);
    expect("error" in valuesOfSpec({ preset: "roots-of-unity", n: 1 })).toBe(true);
    expect("error" in valuesOfSpec({ preset: "roots-of-unity", n: 99 })).toBe(true);
  });

  it("the id is stable and distinguishes the parameterised presets", () => {
    expect(specId({ preset: "littlewood" })).toBe("littlewood");
    expect(specId({ preset: "range", n: 3 })).toBe("range3");
    expect(specId({ preset: "range", n: 4 })).not.toBe(specId({ preset: "range", n: 3 }));
    expect(specId({ preset: "custom", custom: "1, -1" })).toBe("custom:1,-1");
  });

  it("the roots of unity are exact on the axes, so the permutation tables are exact", () => {
    const a = alpha({ preset: "roots-of-unity", n: 4 });
    const exact = a.values.filter((v) => (v.re === 0 && Math.abs(v.im) === 1) || (v.im === 0 && Math.abs(v.re) === 1));
    expect(exact).toHaveLength(4);
  });
});
