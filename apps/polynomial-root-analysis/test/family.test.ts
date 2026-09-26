import { describe, expect, it } from "vitest";
import { Frac, Gauss, QiPoly, renderQiPolyText } from "@cas/exact";
import { cycleType } from "@cas/monodromy";
import {
  FAMILY_PRESETS,
  baseText,
  defaultBase,
  familyContext,
  readBase,
  readFamily,
  specialise,
  type FamilyReading,
} from "../src/engine/family/family.js";
import {
  arithmeticGroup,
  isSquareInQt,
  relate,
  specialGalois,
} from "../src/engine/family/bridge.js";
import { fromExact, type Polynomial } from "../src/engine/polynomial.js";
import { runLoop, type LoopRun } from "../src/engine/loops/run.js";
import { lassoGroup } from "../src/engine/loops/group.js";
import { loopPath } from "../src/engine/loops/loop.js";
import {
  arithmeticCert,
  familyBranchCert,
  monodromyCert,
  monodromyGroupCert,
  specialisationCert,
} from "../src/engine/certify.js";
import { galoisEvidence, galoisRequest } from "../src/engine/galois/tier0.js";
import { registerTable } from "../src/engine/galois/tables.js";
import large from "../src/engine/galois/data/transitive-8-15.json";

registerTable(large);

function family(text: string): FamilyReading {
  const r = readFamily(text);
  if (!r.ok) throw new Error(r.reason);
  return r.family;
}

function atBase(f: FamilyReading, base: Gauss): Polynomial {
  const b = fromExact(specialise(f, base), base.im.isZero() ? "Q" : "C");
  if (!b.ok) throw new Error(b.reason);
  return b.poly;
}

function flower(
  f: FamilyReading,
  base = defaultBase(f),
): { p: Polynomial; runs: LoopRun[] } {
  const p = atBase(f, base);
  const ctx = familyContext(f, base);
  return {
    p,
    runs: f.points.map((_, k) => runLoop(p, { kind: "lasso", point: k, sign: 1 }, ctx)),
  };
}

const Q = (n: bigint, d = 1n): Gauss => new Gauss(Frac.of(n, d), Frac.ZERO);
const galoisOf = (p: Polynomial) => {
  const req = galoisRequest(p);
  if (!req.ok) throw new Error(req.reason);
  return galoisEvidence(req.request);
};

describe("x⁵ − x − t (PLAN §7 PRA-7 gate)", () => {
  const f = family("x^5 - x - t");
  it("has exactly four branch points, the roots of 3125t⁴ − 256, =", () => {
    expect(renderQiPolyText(f.disc, "t")).toBe("3125 t^4 - 256");
    expect(f.points).toHaveLength(4);
    expect(f.multiplicity).toEqual([1, 1, 1, 1]);
    expect(familyBranchCert(f).level).toBe("=");
    const b = Math.pow(256 / 3125, 1 / 4);
    for (const [x, y] of f.points) expect(Math.hypot(x, y)).toBeCloseTo(b, 12);
  });
  it("four certified transpositions, generating = S₅", () => {
    const { runs } = flower(f);
    expect(runs.every((r) => r.ok)).toBe(true);
    for (const r of runs) {
      if (!r.ok) continue;
      expect(cycleType(r.labelPerm)).toEqual([2]);
      expect(monodromyCert(r).level).toBe("=");
    }
    const g = lassoGroup(runs, 5);
    expect(g.order).toBe(120);
    expect(monodromyGroupCert(g.recognition, g.missing, 5)).toMatchObject({
      level: "=",
      claim: "the symmetric group S₅",
    });
    expect(arithmeticCert(arithmeticGroup(g, f.rawDisc, 5), 5)).toMatchObject({
      level: "=",
    });
  });
  it("a lasso whose tether crosses another branch point's circle refuses, by name", () => {
    // From t₀ = 1 the straight tether to −0.535 runs through +0.535.
    const ctx = familyContext(f, Q(1n));
    const far = f.points.findIndex(([x]) => x < -0.5);
    const near = f.points.findIndex(([x]) => x > 0.5);
    const r = loopPath({ kind: "lasso", point: far, sign: 1 }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.reason).toBe(
        `the tether from the base point to branch point #${far + 1} passes through the circle round branch point #${near + 1}, so this lasso would go round both — move the base point, or draw the loop by hand`,
      );
    // And the flower's group, with that lasso missing, is not claimed at all.
    const { runs } = flower(f, Q(1n));
    const g = lassoGroup(runs, 5);
    expect(monodromyGroupCert(g.recognition, g.missing, 5).level).toBe("⚠");
    expect(arithmeticCert(arithmeticGroup(g, f.rawDisc, 5), 5).level).toBe("⚠");
  });
  it("specialised at t = 1 it is x⁵ − x − 1, whose group over ℚ (the Galois card's = S₅) is all of it", () => {
    const p = atBase(f, Q(1n));
    expect(renderQiPolyText(p.exact as QiPoly, "z")).toBe("z^5 - z - 1");
    const g = lassoGroup(flower(f).runs, 5);
    const arith = arithmeticGroup(g, f.rawDisc, 5);
    const sg = specialGalois(galoisOf(p));
    expect(sg).toEqual({ kind: "named", name: "S₅", order: 120 });
    const rel = relate(arith, sg);
    expect(rel).toEqual({ kind: "equal" });
    expect(specialisationCert(rel, "1", "S₅")).toMatchObject({ level: "=" });
    expect(specialisationCert(rel, "1", "S₅").claim).toMatch(/outside the thin set/);
  });
});

describe("x⁴ − 4x² + t — Sottile's example", () => {
  const f = family("x^4 - 4x^2 + t");
  it("opens off its branch point t = 0, at t₀ = 1", () => {
    expect(baseText(defaultBase(f))).toBe("1");
  });
  it("gives a swap at t = 0 and a double swap at t = 4 (two collisions at once)", () => {
    const { runs } = flower(f);
    const at = (x: number): LoopRun =>
      runs[f.points.findIndex((z) => Math.abs(z[0] - x) < 1e-9 && Math.abs(z[1]) < 1e-9)];
    const r0 = at(0);
    const r4 = at(4);
    if (!r0.ok || !r4.ok) throw new Error("refused");
    expect(cycleType(r0.labelPerm)).toEqual([2]);
    expect(cycleType(r4.labelPerm)).toEqual([2, 2]);
    expect(f.multiplicity[f.points.findIndex((z) => Math.abs(z[0] - 4) < 1e-9)]).toBe(2);
    const g = lassoGroup(runs, 4);
    expect(g.order).toBe(8); // D₄: x² = u solves by radicals in t
    expect(arithmeticGroup(g, f.rawDisc, 4)).toEqual({
      kind: "contains",
      geometricOrder: 8,
    });
  });
});

describe("x⁷ − 7x + t at t = 3 — Trinks, in the thin set", () => {
  const f = family("x^7 - 7x + t");
  it("is generically S₇, and Trinks' member has the proper subgroup of order 168", () => {
    const base = Q(3n);
    const { p, runs } = flower(f, base);
    expect(runs.every((r) => r.ok)).toBe(true);
    const g = lassoGroup(runs, 7);
    expect(g.order).toBe(5040);
    const arith = arithmeticGroup(g, f.rawDisc, 7);
    const sg = specialGalois(galoisOf(p));
    expect(sg).toMatchObject({ kind: "named", order: 168 });
    const rel = relate(arith, sg);
    expect(rel).toEqual({ kind: "proper" });
    expect(specialisationCert(rel, "3", "PSL(3,2)").claim).toMatch(
      /lies in the thin set/,
    );
  });
});

describe("x³ + t·x + 1 and the other presets", () => {
  it("three transpositions round the cube roots of −27/4, = S₃", () => {
    const f = family("x^3 + t x + 1");
    expect(renderQiPolyText(f.disc, "t")).toBe("4 t^3 + 27");
    const g = lassoGroup(flower(f).runs, 3);
    expect(g.recognition.name).toBe("S");
  });
  it("every preset reads, and opens where it says", () => {
    for (const pr of FAMILY_PRESETS) {
      const f = family(pr.text);
      const base = pr.base
        ? readBase(pr.base)
        : { ok: true as const, base: defaultBase(f) };
      if (!base.ok) throw new Error(base.reason);
      const { runs } = flower(f, base.base);
      expect(runs.every((r) => r.ok)).toBe(true);
    }
  });
});

describe("the group over ℚ(t): named only when the monodromy and the discriminant pin it", () => {
  it("z³ − t: the monodromy is A₃, the raw discriminant −27t² is no square in ℚ(t), so it is S₃", () => {
    const f = family("z^3 - t");
    expect(renderQiPolyText(f.rawDisc, "t")).toBe("- 27 t^2");
    expect(isSquareInQt(f.rawDisc)).toBe(false);
    // The primitive form would have said otherwise: t² IS a square.
    expect(isSquareInQt(f.disc)).toBe(true);
    const g = lassoGroup(flower(f).runs, 3);
    expect(g.recognition.name).toBe("A");
    expect(arithmeticGroup(g, f.rawDisc, 3)).toMatchObject({
      name: "S",
      why: "not-square",
    });
  });
  it("Shanks' simplest cubic z³ − tz² + (t − 3)z + 1: A₃, and the discriminant (t² + 3t + 9)² is a square", () => {
    const f = family("z^3 - t z^2 + (t - 3) z + 1");
    const g = lassoGroup(flower(f).runs, 3);
    expect(g.recognition.name).toBe("A");
    expect(isSquareInQt(f.rawDisc)).toBe(true);
    const a = arithmeticGroup(g, f.rawDisc, 3);
    expect(a).toMatchObject({ name: "A", why: "square" });
    expect(arithmeticCert(a, 3).claim).toBe("A₃, the alternating group");
  });
  it("squareness in ℚ(t) needs the constant to be a rational square too", () => {
    const t = QiPoly.variable();
    const c = (n: bigint, d = 1n) => QiPoly.constant(Q(n, d));
    expect(isSquareInQt(t.mul(t))).toBe(true);
    expect(isSquareInQt(c(4n, 9n).mul(t).mul(t))).toBe(true);
    expect(isSquareInQt(c(2n).mul(t).mul(t))).toBe(false);
    expect(isSquareInQt(c(-1n).mul(t).mul(t))).toBe(false);
    expect(isSquareInQt(t.mul(t).mul(t))).toBe(false);
    const u = t.sub(c(1n));
    expect(isSquareInQt(c(9n).mul(u).mul(u).mul(t).mul(t).mul(t).mul(t))).toBe(true);
  });
});

describe("reading a family, or refusing by name", () => {
  const refuses = (text: string, why: RegExp): void => {
    const r = readFamily(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(why);
  };
  it("refuses what it cannot follow", () => {
    refuses("x^5 - x - 1", /needs the parameter t/);
    refuses("t x^2 + x + 1", /leading coefficient in x depends on t/);
    refuses("x^2 - 1/t", /t appears in a denominator/);
    refuses("(x^2 - t)^2", /repeated root in x for EVERY t/);
    refuses("x^9 - t", /over the family cap of 8/);
    refuses("x^2 - t^5", /degree 5 in t is over the family cap/);
    refuses("x^2 - i t", /over ℚ/);
    refuses("x^2 - t + y", /'y' is neither/);
    refuses("x^2 + z - t", /not both/);
    refuses("x - t", /fewer than two roots/);
    refuses("x^2 - 2^t", /exponent/);
    refuses("x^2 - t + t - 1", /t cancels out/);
  });
  it("interpolates a family of degree 2 in t exactly", () => {
    const f = family("z^3 - 3z + t^2");
    expect(f.tDegree).toBe(2);
    expect(f.grid[0].map((c) => c.toTuple()[0])).toEqual([0, 0, 1]);
    expect(f.grid[1].map((c) => c.toTuple()[0])).toEqual([-3]);
    expect(renderQiPolyText(f.disc, "t")).toBe("t^4 - 4");
  });
  it("reads a product of two factors in t at the degree of their product", () => {
    const f = family("z^2 + t*(t - 1)*z + 1");
    expect(f.grid[1].map((c) => c.toTuple()[0])).toEqual([0, -1, 1]);
  });
  it("reads (t + 1)² z² … through products and powers", () => {
    const f = family("z^2 + (t + 1)^2 z - t^3/2");
    expect(f.grid[1].map((c) => c.toTuple()[0])).toEqual([1, 2, 1]);
    expect(f.grid[0].map((c) => c.toTuple()[0])).toEqual([0, 0, 0, -0.5]);
  });
});

describe("the base point as exact text", () => {
  it("round-trips through baseText and readBase", () => {
    for (const g of [
      Q(0n),
      Q(1n),
      Q(-3n, 4n),
      new Gauss(Frac.of(1n, 2n), Frac.of(3n, 4n)),
      new Gauss(Frac.ZERO, Frac.of(-1n)),
      new Gauss(Frac.of(-2n), Frac.of(-5n, 3n)),
    ]) {
      const r = readBase(baseText(g));
      if (!r.ok) throw new Error(r.reason);
      expect(r.base.equals(g)).toBe(true);
    }
    expect(readBase("t").ok).toBe(false);
    expect(readBase("1/(").ok).toBe(false);
  });
});

describe("sweep survivors (PRA-7)", () => {
  it("the default base point is one from which EVERY straight tether is clear, not merely one off the branch points", () => {
    // Branch points at 1 and 2: from 0 (and from every real candidate) the tether to 2 runs through 1.
    const f = family("z^2 - (t - 1)(t - 2)");
    expect(renderQiPolyText(f.disc, "t")).toBe("t^2 - 3 t + 2");
    expect(baseText(defaultBase(f))).toBe("i");
  });
  it("a reducible member is a proper subgroup: z⁵ − z at t = 0 factors", () => {
    const f = family("x^5 - x - t");
    const sg = specialGalois(galoisOf(atBase(f, Q(0n))));
    expect(sg).toEqual({ kind: "reducible" });
    const g = lassoGroup(flower(f).runs, 5);
    expect(relate(arithmeticGroup(g, f.rawDisc, 5), sg)).toEqual({ kind: "proper" });
  });
  it("a member the Galois card only estimates is never compared", () => {
    const b = fromExact(
      (() => {
        const r = readFamily("x^8 - 3x^6 + 4x^4 - 2x^2 + t");
        if (!r.ok) throw new Error(r.reason);
        return specialise(r.family, Q(1n));
      })(),
      "Q",
    );
    if (!b.ok) throw new Error(b.reason);
    const sg = specialGalois(galoisOf(b.poly));
    expect(sg.kind).toBe("open");
    if (sg.kind === "open") expect(sg.why).toMatch(/only estimates/);
  });
});
