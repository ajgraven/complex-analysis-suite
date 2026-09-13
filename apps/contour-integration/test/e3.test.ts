// E3, end to end — the record whose contour encloses NOTHING.
//
// Every other entry in tiers E–G ends in a residue. This one has none, and that is its content: the
// residue theorem asserts `∮ = 2πi Σ` over WHATEVER is enclosed, including nothing, so `0` is a
// number and it is the number that closes the argument. Two engine behaviours are therefore under
// test that no other record can reach — an empty residue sum producing a value rather than a
// refusal, and a piece whose value is IMPORTED carrying `=` without laundering the import.
import { describe, expect, it } from "vitest";
import { C, makeComplexFn, parse } from "@cas/expr";
import { e3GaussianShiftZeroResidue as E3 } from "../src/families/records/e3-gaussian-shift-zero-residue.js";
import { runFamily, solveFamily } from "../src/families/runFamily.js";
import { loadFamilies } from "../src/families/index.js";
import { findPoles } from "../src/kernel/poles.js";
import type { Cx } from "../src/kernel/geom.js";

const solved = (b: number) => {
  const g = E3.golden.find((x) => x.params.b === b);
  if (g === undefined) throw new Error(`E3 has no fixture at b = ${b}`);
  const r = solveFamily(E3, g);
  if (!r.ok) throw new Error(`E3 refused at b = ${b}: ${r.reason}`);
  if (r.route !== "imported") throw new Error(`E3 took the ${r.route} route`);
  return r;
};

describe("E3 loads", () => {
  it("passes every invariant", () => {
    const violations = loadFamilies([E3]).violations;
    expect(violations.map((v) => `${v.invariant}: ${v.message}`)).toEqual([]);
  });

  it("declares TWO unknowns, and the odd one is the record's own reality claim", () => {
    // The bottom side is `∫ℝe^{−x²}e^{ibx}dx = C + iS`, so one complex identity realifies into two
    // real equations. Declaring `S` is what turns the `target-is-real` hypothesis from a sentence
    // into a column the contour has to pin.
    expect(E3.targets.map((t) => t.id)).toEqual(["C", "S"]);
    expect(E3.contour.pieces.find((p) => p.id === "bottom")?.coefficients).toEqual([
      { targetId: "C", coefficient: "1" },
      { targetId: "S", coefficient: "i" },
    ]);
  });
});

describe("the empty singular set", () => {
  it("is DECIDED, not the silence of a pole search", () => {
    // `b` is SUBSTITUTED before the pole search — `findPoles` takes a complex parameter, not a
    // binding map — so the integrand is written out, as `test/entire.test.ts` writes it.
    const report = findPoles(parse("exp(-z^2 + i*1.7*z)"));
    expect(report.entire).toBe(true);
    expect(report.exactPoles).toEqual([]);
    // `exactlyComplete` is what lets the residue theorem take the exact route with an empty sum
    // rather than falling through to an estimate.
    expect(report.exactlyComplete).toBe(true);
  });

  it("still produces a value, and LEGALITY says so out loud", () => {
    const r = solved(1.7);
    expect(r.run.theorem.exactValue?.text).toBe("0");
    // Without this row LEGALITY said NOTHING about singularities here — "there are none" and "none
    // were looked for" looked the same on the ledger, for the one record whose point is the former.
    const row = r.run.ledger.rows.find((x) => x.claim.includes("integrand is entire"));
    expect(row?.status).toBe("satisfied");
    expect(row?.constraint).toBe("LEGALITY");
  });

  it("closes the contour to within the quadrature's own noise", () => {
    // `∮ = 0` is a CLAIM about this rectangle, so it is checked against the four sides actually
    // integrated. The gallery's own probe at b = 1.7, R = 8 reports 4.2e-15; measured here at the
    // record's R = 6.
    const r = solved(1.7);
    expect(r.run.theorem.agrees).toBe(true);
    expect(r.run.theorem.disagreement ?? 0).toBeLessThan(1e-12);
  });
});

describe("the two verticals", () => {
  it("are killed by a bound whose max|f| is ATTAINED, not majorised", () => {
    const r = solved(1.7);
    const sides = r.run.ledger.rows.filter((x) => x.claim.includes("vertical side"));
    expect(sides).toHaveLength(2);
    for (const side of sides) {
      expect(side.status).toBe("satisfied");
      expect(side.evidence.level).toBe("≤");
      // The limit rests on `Re(q₂)` and nothing else — `e^{−R²}`.
      expect(side.claim).toContain("O(e^{(−1)R²})");
      expect(side.evidence.provenance.some((p) => p.text.includes("ATTAINED, not majorised"))).toBe(true);
    }
  });

  it("bound a number the quadrature respects", () => {
    // The bound is a claim about the same integral the app computes, so the two meet: `|∫| ≤ B`.
    const r = runFamily(E3, E3.golden[0]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const bounds = r.run.ledger.rows
      .filter((x) => x.claim.includes("vertical side"))
      .map((x) => Number(/≤ ([0-9.e+-]+) at/.exec(x.claim)?.[1] ?? Number.NaN));
    // Pieces 2 and 4 of the rectangle are the verticals (the ledger walks them in order).
    const measured = [1, 3].map((k) => Math.hypot(...(r.run.integral.pieces[k]?.value ?? [0, 0])));
    expect(measured[0]).toBeLessThan(bounds[0]);
    expect(measured[1]).toBeLessThan(bounds[1]);
    // And it is not vacuous: the bound is within a factor of a few thousand of the truth at R = 6,
    // where the integrand itself is e^{−36}.
    expect(bounds[0]).toBeLessThan(1e-14);
  });
});

describe("the import", () => {
  it("carries `=` on its own row, with the provenance beside it", () => {
    const r = solved(1.7);
    const row = r.run.ledger.rows.find((x) => x.pieceId === "top");
    expect(row?.evidence.level).toBe("=");
    expect(row?.evidence.method).toContain("imported, not derived here");
    expect(row?.evidence.provenance[0].text).toContain("polar coordinates");
    // It is `Γ(1/2)`, which is what makes the closed set one entry rather than two.
    expect(row?.evidence.provenance[0].text).toContain("Γ(1/2)");
  });

  it("is corroborated by the piece's own quadrature", () => {
    const r = solved(1.7);
    const step = r.run.ledger.rows
      .find((x) => x.pieceId === "top")
      ?.evidence.provenance.find((p) => p.text.includes("independent check"));
    expect(step?.ok).toBe(true);
  });
});

describe("the answer", () => {
  it("is √π e^(−b²/4) at every fixture, on the form and on the decimal", () => {
    for (const g of E3.golden) {
      const b = Number(g.params.b);
      const r = solved(b);
      expect(r.solved.value, `b = ${b}`).toBeCloseTo(Number(g.numeric), 12);
      // Two independent statements: the form carries √π, and the decimal is the record's own.
      expect(r.solved.text, `b = ${b}`).toContain("√π");
      const exponent = (-b * b) / 4;
      expect(Math.sqrt(Math.PI) * Math.exp(exponent)).toBeCloseTo(Number(g.numeric), 12);
    }
  });

  it("determines the ODD integral too, and it is exactly zero", () => {
    for (const g of E3.golden) {
      const r = solved(Number(g.params.b));
      const odd = r.imported.solved.find((x) => x.targetId === "S");
      expect(odd?.value).toBe(0);
      expect(odd?.text).toBe("0");
    }
  });

  it("agrees with the Gamma function evaluated independently", () => {
    // `√π = Γ(1/2)`, via the Lanczos series in `@cas/expr` — arithmetic the answer does not use.
    const r = solved(1);
    expect(r.solved.value).toBeCloseTo(C.gamma([0.5, 0])[0] * Math.exp(-0.25), 12);
  });
});

describe("the record's own traps", () => {
  it("the wrong shift height still CLOSES, and that is the trap", () => {
    // `h = −b/2` gives a rectangle that closes to 1e-15 and a top side that is `−e^{3b²/4}·T(2b)` —
    // a true identity expressing the target in terms of itself at another parameter. The engine
    // must not be able to tell the difference from the contour alone, which is why the saddle is a
    // declared HYPOTHESIS rather than something inferred.
    const b = 1.7;
    const f = makeComplexFn(parse("exp(-z^2 + i*b*z)"), { b: [b, 0] });
    const R = 8;
    const h = -b / 2;
    const line = (from: Cx, to: Cx): Cx => {
      const N = 20000;
      let re = 0;
      let im = 0;
      for (let k = 0; k < N; k++) {
        const t = (k + 0.5) / N;
        const z: [number, number] = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
        const v = f(z, [0, 0]);
        const dr = to[0] - from[0];
        const di = to[1] - from[1];
        re += (v[0] * dr - v[1] * di) / N;
        im += (v[0] * di + v[1] * dr) / N;
      }
      return [re, im];
    };
    const sides: Cx[] = [
      line([-R, 0], [R, 0]),
      line([R, 0], [R, h]),
      line([R, h], [-R, h]),
      line([-R, h], [-R, 0]),
    ];
    const total = sides.reduce<Cx>((a, s) => [a[0] + s[0], a[1] + s[1]], [0, 0]);
    expect(Math.hypot(...total)).toBeLessThan(1e-12);
    // And the top side there is the target at 2b, scaled — information-free.
    const atTwoB = E3.golden.find((g) => g.params.b === 3.4);
    const targetAt2b = Math.sqrt(Math.PI) * Math.exp(-((2 * b) ** 2) / 4);
    expect(sides[2][0]).toBeCloseTo(-Math.exp((3 * b * b) / 4) * targetAt2b, 10);
    expect(atTwoB).toBeUndefined(); // not a fixture; the identity is checked directly
  });

  it("declares every trap the gallery lists, with a routable predicate", () => {
    expect(E3.traps.map((t) => t.id)).toEqual([
      "contour-method-implies-residues",
      "shift-height-must-be-the-saddle",
      "gaussian-value-claimed-as-contour-output",
      "quasi-period-assumed",
      "cos-not-complexified",
    ]);
  });
});
