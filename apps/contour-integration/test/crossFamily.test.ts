// The cross-family invariants — `tier-efg.md` §10.3's "specifications for tests, not results".
//
// Each `invariants[]` block carrying a `check` and no `verifiedBy` was REASONED and never run. This
// runs them. They are worth more than their individual statements, because every one of them relates
// records that share no machinery: a wedge closed the other way, a kernel swapped under a fixed
// contour, a sum reached by a route the record does not use. A single arithmetic error inside one
// family is invisible to that family's own golden and visible here.
//
// **AND THREE OF THEM TURN OUT TO BE ONE IDENTITY.** `a → 0` carries G2 onto G1, and the rigorous
// form of that limit is not an evaluation at a small `a` (§10.3's own complaint) but a series:
//
//     (π/a)coth(πa) − 1/a² = Σ_{k≥1} (−1)^k t_k π^{2k} a^{2k−2}
//
// with `t_k` the kernel's OWN Laurent coefficients — the ones `mergedResidue` uses. So the `a⁰` term
// is exactly `−Res₀`, which is twice G1's answer; the `a²` term is `Res₀` of the `1/z⁴` family, which
// is ζ(4)'s; and the same statement on `csc` closes the other column. The 2×2 square of
// {cot, csc} × {collision, none} is one fact about one series.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { parse } from "@cas/expr";
import { primaryGolden, solveFamily } from "../src/families/runFamily.js";
import { asSummationKernel } from "../src/kernel/summationKernel.js";
import { kernelSeries, mergedResidue } from "../src/kernel/mergedResidue.js";
import { formatRatPi } from "../src/kernel/ratPi.js";
import { f1WedgeRationalPower as F1 } from "../src/families/records/f1-wedge-rational-power.js";
import { g1SquareCotCollision as G1 } from "../src/families/records/g1-square-cot-collision.js";
import { g2SquareCotKernel as G2 } from "../src/families/records/g2-square-cot-kernel.js";
import { g3SquareCscCollision as G3 } from "../src/families/records/g3-square-csc-collision.js";
import type { Bindings, Family } from "../src/families/schema.js";

/** Solve a record (possibly a clone) at one binding, through the same door the gallery uses. */
function value(family: Family, params: Bindings): { readonly value: number; readonly text?: string } {
  const r = solveFamily(family, { ...primaryGolden(family), params });
  if (!r.ok) throw new Error(`${family.id} at ${JSON.stringify(params)}: ${r.reason}`);
  return { value: r.solved.value, ...(r.solved.text === undefined ? {} : { text: r.solved.text }) };
}

const merged = (src: string): { value: import("../src/kernel/ratPi.js").RatPi; order: number } => {
  const k = asSummationKernel(parse(src));
  if (k === null) throw new Error(`no kernel in ${src}`);
  const r = mergedResidue(k.kind, k.num, k.den, 0n);
  if (!r.ok) throw new Error(r.reason);
  return { value: r.value, order: r.order };
};

describe("F1.closing-the-other-way — the wedge taken from −2π/n to 0", () => {
  /**
   * The same record with its sector reflected: `wedgeAngle` and `wedgeY` negate, the return ray's
   * factor becomes `−ω̄`, and the traversal is then clockwise. The enclosed pole is `e^{−iπ/n}`
   * rather than `e^{iπ/n}` — a DIFFERENT residue, reached by a different rotation — and the two
   * routes must agree. DESIGN §9's "closing up vs closing down", in its rotational form.
   */
  const DOWN: Family = {
    ...F1,
    contour: {
      ...F1.contour,
      derived: [
        { name: "wedgeAngle", expr: "-2*pi/n" },
        { name: "wedgeX", expr: "cos(2*pi/n)" },
        { name: "wedgeY", expr: "-sin(2*pi/n)" },
      ],
      orientation: "cw",
      pieces: F1.contour.pieces.map((p) =>
        p.coefficients === undefined
          ? p
          : { ...p, coefficients: [{ targetId: "I", coefficient: "-exp(-2*pi*i/n)" }] },
      ),
    },
  };

  it.each([2, 3, 4, 5, 7])("n = %i", (n) => {
    const up = value(F1, { n });
    const down = value(DOWN, { n });
    expect(down.value).toBeCloseTo(up.value, 12);
    expect(up.value).toBeCloseTo(Math.PI / n / Math.sin(Math.PI / n), 12);
  });

  it("and the two routes print DIFFERENT closed forms for the same number", () => {
    // `(π/n)/sin(π/n)` against `(π/n)/sin((n−1)π/n)` — supplementary angles, equal sines. Neither is
    // wrong and neither is the other's text, which is what makes the agreement worth asserting: a
    // shared formatter could not have produced both.
    expect(value(F1, { n: 3 }).text).toBe("(π/3)/sin(π/3)");
    expect(value(DOWN, { n: 3 }).text).toBe("(π/3)/sin(2π/3)");
    expect(value(F1, { n: 5 }).text).toBe("(π/5)/sin(π/5)");
    expect(value(DOWN, { n: 5 }).text).toBe("(π/5)/sin(4π/5)");
  });
});

describe("G2.csc-companion — one contour family, two kernels", () => {
  /** G2's record with `π cot` swapped for `π csc`. Nothing else changes. */
  const G2_CSC: Family = {
    ...G2,
    auxiliary: { ...G2.auxiliary, integrand: "pi*csc(pi*z)/(z^2 + a^2)", relation: "Re", note: G2.auxiliary?.note ?? "" },
    targets: [{ ...G2.targets[0], summand: "(-1)^n/(n^2 + a^2)" }],
  };

  it.each([
    [0.75, "(4π/3)·csch(3π/4)"],
    [1, "π·csch(π)"],
    [2.3, "(10π/23)·csch(23π/10)"],
  ])("a = %s gives (π/a)csch(πa)", (a, text) => {
    const got = value(G2_CSC, { a });
    expect(got.text).toBe(text);
    expect(got.value).toBeCloseTo(Math.PI / Number(a) / Math.sinh(Math.PI * Number(a)), 12);
  });

  it("the alternation lives entirely in Res(K, n), and the cofactor is untouched", () => {
    // Same `1/(z²+a²)`, same square, same weight — only the kernel differs, and `coth` becomes
    // `csch`. That is `Res(π cot, n) = 1` against `Res(π csc, n) = (−1)ⁿ` and nothing else.
    expect(G2_CSC.residueSelection).toEqual(G2.residueSelection);
    expect(G2_CSC.contour.pieces).toEqual(G2.contour.pieces);
    const [cot, csc] = [value(G2, { a: 1 }), value(G2_CSC, { a: 1 })];
    expect(cot.text).toBe("π·coth(π)");
    expect(csc.text).toBe("π·csch(π)");
  });
});

describe("ζ(4) = π⁴/90 — summed independently, not read off a coefficient", () => {
  /** G1's record on `1/z⁴`: the collision merges to order 5 and the residue is `−π⁴/45`. */
  const ZETA4: Family = {
    ...G1,
    id: "series-cot-collision-quartic",
    auxiliary: { ...G1.auxiliary, integrand: "pi*cot(pi*z)/z^4", relation: "Re", note: G1.auxiliary?.note ?? "" },
    targets: [{ ...G1.targets[0], summand: "1/n^4" }],
    collisions: [{ ...(G1.collisions ?? [])[0], mergedOrder: 5, residue: "-pi^4/45" }],
    closedForm: { expr: "-Res(pi*cot(pi*z)/z^4, 0) / 2", simplified: "pi^4/90" },
  };

  it("the engine sums it, where §10.3 had only the measured coefficient", () => {
    const got = value(ZETA4, {});
    expect(got.text).toBe("π⁴/90");
    expect(got.value).toBeCloseTo(Math.PI ** 4 / 90, 12);
    // And against the series itself, which shares nothing with the contour argument.
    let direct = 0;
    for (let n = 1; n <= 200000; n++) direct += 1 / n ** 4;
    expect(got.value).toBeCloseTo(direct, 12);
  });

  it("its residue is the SAME number §10.3 measured, now derived", () => {
    // `c₁ = −π⁴/45` of `π cot(πz)/z²` is `Res₀[π cot(πz)/z⁴]` — one coefficient of one series, read
    // at two indices. §10.3 called that "the same number" and did not sum ζ(4); both are here now.
    expect(formatRatPi(merged("pi*cot(pi*z)/z^4").value)).toBe("−π⁴/45");
    expect(merged("pi*cot(pi*z)/z^4").order).toBe(5);
  });
});

describe("the confluence a → 0, as a SERIES rather than an evaluation", () => {
  // §10.3: "checked by evaluating the closed form at a = 10⁻⁴, not by a rigorous confluence
  // argument". The rigorous form is an identity between two things the engine already computes.
  const piPow = (k: number): number => Math.PI ** (2 * k);
  /** `(−1)^k t_k` — the Taylor coefficients of the non-colliding closed form, pole part removed. */
  const confluence = (kind: "cot" | "csc", upTo: number): Frac[] =>
    kernelSeries(kind, upTo).map((t, j) => ((j + 1) % 2 === 0 ? t : t.neg()));

  it.each([
    ["cot", (a: number) => Math.PI / a / Math.tanh(Math.PI * a)],
    ["csc", (a: number) => Math.PI / a / Math.sinh(Math.PI * a)],
  ] as const)("%s: the series reproduces the closed form to the order of its next term", (kind, closed) => {
    const c = confluence(kind, 4);
    for (const a of [0.05, 0.1, 0.2]) {
      const series = c.reduce((acc, ck, j) => acc + ck.toNumber() * piPow(j + 1) * a ** (2 * j), 0);
      const want = closed(a) - 1 / (a * a);
      // The truncation error is the next term, `|c₅|π¹⁰a⁸`, which at a = 0.2 is ~2e-4 of the value.
      expect(Math.abs(series - want)).toBeLessThan(Math.abs(c[3].toNumber()) * piPow(5) * a ** 8 * 3);
    }
  });

  it("the a⁰ term IS −Res₀, so the limit is the collision record's own answer", () => {
    // `lim_{a→0}[(π/a)coth(πa) − 1/a²] = c₁π² = −Res₀ = π²/3 = 2·ζ(2)`. Exact, in ℚ(i)(π), with no
    // small `a` anywhere.
    expect(confluence("cot", 1)[0].equals(Frac.of(1n, 3n))).toBe(true);
    expect(formatRatPi(merged("pi*cot(pi*z)/z^2").value)).toBe("−π²/3");
    expect(value(G1, {}).value * 2).toBeCloseTo(Math.PI ** 2 / 3, 14);

    // And the csc column closes the square: `lim[(π/a)csch(πa) − 1/a²] = −π²/6 = 2·(−π²/12)`.
    expect(confluence("csc", 1)[0].equals(Frac.of(-1n, 6n))).toBe(true);
    expect(formatRatPi(merged("pi*csc(pi*z)/z^2").value)).toBe("π²/6");
    expect(value(G3, {}).value * 2).toBeCloseTo(-(Math.PI ** 2) / 6, 14);
  });

  it("the a² term is ζ(4)'s residue — one series, read at the next index", () => {
    expect(confluence("cot", 2)[1].equals(Frac.of(-1n, 45n))).toBe(true);
    expect(formatRatPi(merged("pi*cot(pi*z)/z^4").value)).toBe("−π⁴/45");
  });

  it("G3.csc-companion-of-G2 — the 2×2 square of {cot, csc} × {collision, none} closes", () => {
    // Four records, one series. Each column's confluence limit is the other row's answer, doubled.
    const rows = [
      { kind: "cot" as const, none: (a: number) => Math.PI / a / Math.tanh(Math.PI * a), collision: value(G1, {}).value },
      { kind: "csc" as const, none: (a: number) => Math.PI / a / Math.sinh(Math.PI * a), collision: value(G3, {}).value },
    ];
    for (const row of rows) {
      const leading = confluence(row.kind, 1)[0].toNumber() * Math.PI ** 2;
      expect(leading).toBeCloseTo(2 * row.collision, 14);
      // …and the numeric limit agrees with it, which is the check §10.3 actually ran — kept as
      // corroboration of the series rather than as the argument.
      expect(row.none(1e-4) - 1e8).toBeCloseTo(leading, 6);
    }
  });
});
