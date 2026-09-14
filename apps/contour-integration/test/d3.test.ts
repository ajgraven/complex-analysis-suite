// D3, end to end — the two-parameter keyhole, and the hardest honest distinction in tier D.
//
// > "At integer `a` the integrand has NO branch point […] the keyhole carries no information about
// > the target and the app must REFUSE — even though the closed form `(π/n)/sin(πa/n)` is still
// > correct, by continuity in `a`. […] A correct value obtained from a collapsed derivation is not a
// > proof; print the wedge's derivation or print nothing."
//
// Two of the record's five fixtures exist to be refused, and they are the reason this file is not
// just D1 with another parameter.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, QiPoly } from "@cas/exact";
import { d3KeyholeXToTheN } from "../src/families/records/d3-keyhole-x-to-the-n.js";
import { runFamily, solveFamily } from "../src/families/runFamily.js";
import { loadFamilies } from "../src/families/index.js";
import { buildSystem } from "../src/families/system.js";
import { asCyclotomic, cyclotomicResidueSum } from "../src/kernel/cyclotomic.js";
import { windingNumber } from "../src/kernel/winding.js";
import { ExpSum } from "../src/kernel/expSum.js";
import { Exponent } from "../src/kernel/exponent.js";
import { divideCarryingSine } from "../src/kernel/sineForm.js";
import { SqrtExt } from "@cas/exact";

/** D3 is a one-unknown family, so its solve takes the scalar route; asserting that is how we say so. */
const scalar = (r: ReturnType<typeof solveFamily>) => {
  if (!r.ok) throw new Error(`D3 refused: ${r.reason}`);
  if (r.route !== "scalar") throw new Error("D3 should solve by division, not as a system");
  return r;
};

const alg = (n: number): SqrtExt => SqrtExt.fromGauss(Gauss.int(n));
const iPi = (n: number, d: number): Exponent =>
  Exponent.piTimes(Gauss.rat(0n, 1n, BigInt(n), BigInt(d)));

const D3 = d3KeyholeXToTheN;
const at = (a: number, n: number) => {
  const g = D3.golden.find((x) => x.params.a === a && x.params.n === n);
  if (g === undefined) throw new Error(`no fixture at a = ${a}, n = ${n}`);
  return g;
};

describe("the record loads, with two fixtures that document a refusal", () => {
  it("passes all four invariants", () => {
    const { families, violations } = loadFamilies([D3]);
    expect(violations).toEqual([]);
    expect(families.get(D3.id)).toBe(D3);
  });

  it("marks exactly the two integer-a fixtures as refusing", () => {
    const refusing = D3.golden.filter((g) => g.refuses !== undefined);
    expect(refusing.map((g) => g.params.a)).toEqual([3, 1]);
    // And they still record what the answer WOULD be, which is the whole danger.
    expect(refusing.every((g) => g.value.length > 0)).toBe(true);
  });

  it("has rank 0 at those fixtures and full rank at the others", () => {
    // Invariant 4 inverted rather than escaped: a `refuses` fixture that turned out to have full
    // rank would be documenting nothing.
    for (const g of D3.golden) {
      const built = buildSystem(D3, g.params);
      expect(built.ok).toBe(true);
      if (!built.ok) continue;
      expect(built.system.report.rank).toBe(g.refuses === undefined ? 1 : 0);
    }
  });
});

describe("(π/n)/sin(πa/n) — the geometric sum cancels the keyhole's own factor", () => {
  it("solves a = 3/2, n = 4 to the record's form", () => {
    const r = solveFamily(D3, at(1.5, 4));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.solved.text).toBe("(π/4)/sin(3π/8)");
    expect(r.solved.value).toBeCloseTo(0.85010884618536919, 14);
  });

  it("solves a = 1/2, n = 2 to the record's form", () => {
    const r = solveFamily(D3, at(0.5, 2));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.solved.text).toBe("(π/2)/sin(π/4)");
    expect(r.solved.value).toBeCloseTo(2.2214414690791831, 14);
  });

  it("gives sin(πa/n) and NOT sin(πa) — the cancellation is the whole content", () => {
    // Without it the answer is `(π/n)·(Σₖ e^{…})/sin(πa)`: numerically right, and in a form nothing
    // would recognise as the record's. At a = 3/2 the two sines are `sin(3π/8)` and `sin(3π/2)`.
    const r = scalar(solveFamily(D3, at(1.5, 4)));
    expect(r.solved.form.sine?.equals(Frac.of(3n, 8n))).toBe(true);
    // …and the sum collapsed to a single rational term, `1/n`, with no leftover exponential.
    expect(r.solved.form.sum.terms).toHaveLength(1);
    expect(r.solved.form.sum.asSqrtExt()?.toTuple()[0]).toBeCloseTo(0.25, 15);
  });
});

describe("n = 5, where no individual root can be written down", () => {
  it("solves anyway, because the SUM needs no root", () => {
    // The roots of `1 + z^5` generate ℚ(ζ₁₀), degree 4 over ℚ — outside one quadratic extension, so
    // a per-pole residue walk cannot start. `(π/5)/sin(23π/50)` is exact all the same.
    const r = solveFamily(D3, at(2.3, 5));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.solved.text).toBe("(π/5)/sin(23π/50)");
    expect(r.solved.value).toBeCloseTo(0.63331238805904555, 14);
  });

  it("and the per-pole route really cannot: the poles are not pinned", () => {
    const r = runFamily(D3, at(2.3, 5));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run.poles.exactlyComplete).toBe(false);
    // The value came out exact regardless, from the cyclotomic route.
    expect(r.run.theorem.exactValue).toBeDefined();
  });

  it("matches the record's sine argument exactly — 23/50, not a nearby float", () => {
    const r = scalar(solveFamily(D3, at(2.3, 5)));
    expect(r.solved.form.sine?.n).toBe(23n);
    expect(r.solved.form.sine?.d).toBe(50n);
  });
});

describe("the cyclotomic recogniser", () => {
  const poly = (...c: number[]): QiPoly => QiPoly.fromCoeffs(c.map((x) => Gauss.int(x)));

  it("reads 1 + z^n for every n the record uses", () => {
    for (const n of [2, 3, 4, 5, 7]) {
      const coeffs = Array.from({ length: n + 1 }, (_, k) => (k === 0 || k === n ? 1 : 0));
      const form = asCyclotomic(poly(...coeffs));
      expect(form?.n).toBe(n);
      // `zₖ^n = −b₀/b_n = −1 = e^{iπ}`.
      expect(form?.psi.equals(Frac.ONE)).toBe(true);
    }
  });

  it("refuses a denominator with an intermediate term", () => {
    // `1 + z + z^4`'s roots are not a rotated regular polygon, and the sum has no closed form.
    expect(asCyclotomic(poly(1, 1, 0, 0, 1))).toBeNull();
  });

  it("refuses roots off the unit circle, which would need a logarithm", () => {
    // `2 + z^3`: the roots have modulus 2^{1/3}, so `zₖ^a` needs `ln|zₖ|` — M4.5's half of the basis.
    // The exact verification is what rejects it: `−b₀/b_n = −2` is no root of unity, so there is no
    // separate modulus test to get out of step with this one.
    expect(asCyclotomic(poly(2, 0, 0, 1))).toBeNull();
    expect(asCyclotomic(poly(3, 0, 2))).toBeNull();
  });

  it("puts every root inside the declared determination", () => {
    // `traps.roots-of-minus-one-mislabelled`: "for k = n−1 that is (2n−1)π/n < 2π — all inside".
    const form = asCyclotomic(poly(1, 0, 0, 0, 1));
    expect(form).not.toBeNull();
    if (form === null) return;
    const sum = cyclotomicResidueSum(form, Frac.of(1n, 2n), [Frac.ZERO, Frac.of(2n)]);
    expect(sum.ok).toBe(true);
    if (!sum.ok) return;
    expect(sum.arguments.map((r) => `${r.n}/${r.d}`)).toEqual(["1/4", "3/4", "5/4", "7/4"]);
    expect(sum.value.terms).toHaveLength(4);
  });

  it("refuses when a root falls outside it — the principal determination", () => {
    const form = asCyclotomic(poly(1, 0, 0, 0, 1));
    expect(form).not.toBeNull();
    if (form === null) return;
    const sum = cyclotomicResidueSum(form, Frac.of(1n, 2n), [Frac.of(-1n), Frac.ONE]);
    expect(sum.ok).toBe(false);
    if (sum.ok) return;
    expect(sum.reason).toMatch(/outside the declared determination/);
  });
});

describe("integer a: the value survives, the derivation does not", () => {
  it("REFUSES at a = 3, n = 7, where the record's own value is 0.4603…", () => {
    const g = at(3, 7);
    expect(g.refuses).toBeDefined();
    const r = solveFamily(D3, g);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/carries no information about the target/);
    expect(r.reason).toMatch(/correct value from a collapsed derivation is not a proof/);
  });

  it("REFUSES at a = 1, n = 3, where the coefficient is exactly zero", () => {
    // Here the two edge exponents are EQUAL, so the normal form combines them and the coefficient is
    // zero outright rather than a two-term sine that vanishes. Same fact, earlier.
    const r = solveFamily(D3, at(1, 3));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/exactly zero/);
  });

  it("refuses at every integer a, not only at the two the record fixes", () => {
    for (const [a, n] of [
      [1, 2],
      [2, 5],
      [4, 9],
    ]) {
      const r = solveFamily(D3, { ...at(1.5, 4), params: { a, n } });
      expect(r.ok, `a = ${a}, n = ${n} should refuse`).toBe(false);
    }
  });

  it("but solves a hair either side of an integer", () => {
    for (const a of [2.999, 3.001]) {
      const r = solveFamily(D3, { ...at(1.5, 4), params: { a, n: 7 } });
      expect(r.ok, `a = ${a} should solve`).toBe(true);
      if (!r.ok) continue;
      // …and lands near the value the integer case would have had, by continuity.
      expect(r.solved.value).toBeCloseTo(0.46034065176003164, 3);
    }
  });
});

describe("the contour still has to enclose the poles", () => {
  it("encircles each of the n roots exactly once", () => {
    for (const [a, n] of [
      [1.5, 4],
      [2.3, 5],
    ]) {
      const r = runFamily(D3, { ...at(1.5, 4), params: { a, n } });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      for (let k = 0; k < n; k++) {
        const theta = (Math.PI * (1 + 2 * k)) / n;
        const w = windingNumber(r.run.resolved, [Math.cos(theta), Math.sin(theta)]);
        expect(w.decided).toBe(true);
        expect(w.n).toBe(1);
      }
    }
  });

  it("and the branch point at the origin is not one of them", () => {
    const r = runFamily(D3, at(1.5, 4));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(windingNumber(r.run.resolved, [0, 0]).n).toBe(0);
  });
});

describe("the geometric cancellation is verified, not assumed", () => {
  it("refuses a numerator with the right NUMBER of terms but the wrong shape", () => {
    // Four terms over a denominator whose exponent is four times the first gap — but the terms are
    // not in arithmetic progression, so `Σ q^k` is not what they are and no cancellation is legal.
    // Reading the step and then not checking it against every term is the difference between a
    // recogniser and a guess.
    const c = alg(1);
    const notAnAp = ExpSum.of(c, iPi(1, 8))
      .add(ExpSum.of(c, iPi(3, 8)))
      .add(ExpSum.of(c, iPi(6, 8)))
      .add(ExpSum.of(c, iPi(7, 8)));
    const denominator = ExpSum.fromSqrtExt(alg(1)).sub(ExpSum.of(alg(1), iPi(1, 1)));
    const r = divideCarryingSine(notAnAp, denominator);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // No cancellation: all four terms survive, and the sine is the denominator's own.
    expect(r.form.sum.terms.length).toBeGreaterThan(1);
    expect(r.form.sine).toBeUndefined(); // sin(π/2) = 1, the denominator's
  });

  it("refuses an arithmetic progression whose coefficients differ", () => {
    const rising = ExpSum.of(alg(1), iPi(1, 4))
      .add(ExpSum.of(alg(2), iPi(2, 4)))
      .add(ExpSum.of(alg(1), iPi(3, 4)));
    const denominator = ExpSum.fromSqrtExt(alg(1)).sub(ExpSum.of(alg(1), iPi(3, 4)));
    const r = divideCarryingSine(rising, denominator);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.form.sum.terms.length).toBeGreaterThan(1);
  });
});

describe("the winding check is not decoration", () => {
  it("does not use the cyclotomic sum when the contour misses the roots", () => {
    // A keyhole with `R < 1` leaves the whole unit circle outside, so it encloses none of the roots
    // of `1 + z⁴`. Summing them anyway would report the full residue sum for a contour that
    // encircles nothing — a confident answer to a question about poles it never went round.
    const inside = runFamily(D3, at(1.5, 4), { geometry: { R: 0.5, eps: 0.05 } });
    expect(inside.ok).toBe(true);
    if (!inside.ok) return;
    for (let k = 0; k < 4; k++) {
      const theta = (Math.PI * (1 + 2 * k)) / 4;
      expect(windingNumber(inside.run.resolved, [Math.cos(theta), Math.sin(theta)]).n).toBe(0);
    }
    // The per-pole route takes over, and with every winding zero the sum is empty.
    expect(inside.run.theorem.piUnits?.isZero()).toBe(true);
  });
});

// **THE CATCH ROW ASKED THE WRONG QUESTION, AND HAD SINCE M4.2e (found in M5.4b).** It read
// `poles.exactlyComplete` — "was every pole pinned?" — where the claim beside it is about the SUM.
// So D3 at `(a, n) = (2.3, 5)` printed the exact closed form `(π/5)/sin(23π/50)` with a row saying
// "not every residue is known exactly, so the total is an estimate", which is precisely what the
// cyclotomic route exists to deny.
describe("the CATCH row says what was established, not what was skipped", () => {
  const catchRow = (a: number, n: number) => {
    const r = runFamily(D3, at(a, n));
    if (!r.ok) throw new Error(`D3 refused: ${r.reason}`);
    return r.run.ledger.rows.filter((x) => x.constraint === "CATCH").find((x) => /residue/.test(x.claim));
  };

  it("reports Σ Res exact at n = 5, where ℚ(ζ₁₀) has degree 4 and no residue is expressible", () => {
    const row = catchRow(2.3, 5);
    expect(row?.status).toBe("satisfied");
    expect(row?.claim).toBe("Σ Res is known exactly, though no individual residue is expressible");
    expect(row?.evidence.level).toBe("=");
    // And the closed form is beside it, which is the contradiction that made the old row visible.
    expect(scalar(solveFamily(D3, at(2.3, 5))).solved.text).toBe("(π/5)/sin(23π/50)");
  });

  it("keeps the simpler claim at n = 4, where each residue IS expressible", () => {
    expect(catchRow(1.5, 4)?.claim).toBe("every enclosed residue is known exactly");
  });
});
