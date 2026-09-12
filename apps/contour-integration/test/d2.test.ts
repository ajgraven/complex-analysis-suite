// D2 — two poles off one cut, and the first record whose poles are off the UNIT CIRCLE.
//
// `(−2)^{1/2} = e^{(1/2)(ln 2 + iπ)}`: the argument is decided in the declared determination as it
// always was, and the modulus arrives as a symbolic `ln 2` in the same exponent. It folds back to a
// radical because the weight is a half, so the answer reads `π − π√2/2` rather than as an
// exponential — the "ln(ℚ₊) exponents and radical factors" of M4.5, in one record.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { d2KeyholeTwoPoles } from "../src/families/records/d2-keyhole-two-poles.js";
import { loadFamilies } from "../src/families/index.js";
import { solveFamily } from "../src/families/runFamily.js";
import { powerAtPole } from "../src/kernel/branchResidue.js";
import { formatExpSum } from "../src/kernel/expSum.js";
import type { Family } from "../src/families/schema.js";

const D2 = d2KeyholeTwoPoles;
const flagship = D2.golden[0];
const q = (n: number, d = 1): Frac => Frac.of(BigInt(n), BigInt(d));
const KEYHOLE: readonly [Frac, Frac] = [q(0), q(2)];

function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`expected ${what}`);
  return v;
}

const solved = (golden = flagship, record: Family = D2) => {
  const r = solveFamily(record, golden);
  if (!r.ok) throw new Error(`D2 refused: ${r.reason}`);
  if (r.route !== "scalar") throw new Error("D2 solves one unknown, by division");
  return r;
};

describe("the record loads", () => {
  it("passes all four invariants", () => {
    const { families, violations } = loadFamilies([D2]);
    expect(violations).toEqual([]);
    expect(families.get(D2.id)).toBe(D2);
  });

  it("starts its contour wide enough to enclose its own poles", () => {
    // The global default radius is 4 and this record's pole sits exactly ON it, where the winding
    // number is undecided and the record would open refusing.
    expect(D2.contour.limitParams[0]).toMatchObject({ name: "R_lim", to: "inf", start: 8 });
  });
});

describe("a pole off the unit circle", () => {
  it("reads (−2)^{1/2} as e^{(ln 2)/2 + iπ/2}, and folds it to i√2", () => {
    const at = SqrtExt.fromGauss(Gauss.int(-2));
    const r = powerAtPole(at, { alpha: q(1, 2), argRange: KEYHOLE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(formatExpSum(r.value)).toBe("e^(iπ/2 + ln 2/2)");
    expect(formatExpSum(r.value.foldSigns())).toBe("i√2");
    // arg(−2) = π, in the DECLARED range — which is the whole content of this record's
    // `residue-with-the-wrong-argument` trap.
    expect(r.argMultiple.equals(q(1))).toBe(true);
  });

  it("would answer differently under the principal determination", () => {
    // Under arg ∈ (−π, π] the pole at −2 is read at arg = −π: `(−2)^{1/2} = −i√2`, the opposite
    // sign. The record's trap is that this does NOT make the answer complex — it flips one term.
    const at = SqrtExt.fromGauss(Gauss.int(-2));
    const principal = powerAtPole(at, { alpha: q(1, 2), argRange: [q(-1), q(1)] });
    expect(principal.ok).toBe(true);
    if (!principal.ok) return;
    expect(formatExpSum(principal.value.foldSigns())).toBe("−i√2");
  });

  it("keeps the modulus, which is the difference between 0.9202 and 1.5708", () => {
    // Dropping `ln 2` — what a basis carrying only the argument would do — multiplies that residue
    // by 2^{1−s} and returns π/2 instead. Both are plausible; the second is the one a reader would
    // not question. Here the engine's own answer pins it.
    const r = solved();
    expect(r.solved.value).toBeCloseTo(Math.PI * (1 - 1 / Math.SQRT2), 14);
    expect(r.solved.value).not.toBeCloseTo(Math.PI / 2, 6);
  });
});

describe("the two edges ADD, and the answer is π(1 − 1/√2)", () => {
  it("reproduces the record's flagship value", () => {
    const r = solved();
    expect(r.solved.text).toBe("π − π√2/2");
    expect(r.solved.value).toBeCloseTo(0.92015118451061029, 14);
  });

  it("has a REAL crossing phase, so no sine survives", () => {
    // `1 − e^{2πi(s−1)}` at s = 3/2 is `1 − e^{iπ} = 2`. The recogniser still factors it through a
    // sine — `sin(π/2)` — and that sine is 1, so it does not appear in the answer. A real-valued
    // phase looks like "no phase", which is exactly when a reader concludes the edges must cancel.
    const r = solved();
    expect(r.solved.form.sine === undefined || r.solved.form.sine.equals(q(1, 2))).toBe(true);
    expect(r.solved.text).not.toMatch(/sin/);
  });

  it("solves the second fixture, where one pole has ln p = 0", () => {
    // `p = 1` makes `ln 1 = 0`, so this fixture would still pass if the modulus were dropped from
    // the OTHER pole only — which is why both fixtures are here.
    const r = solved(D2.golden[1]);
    expect(r.solved.text).toBe("−π/2 + π√3/2");
    expect(r.solved.value).toBeCloseTo(1.14990271955643, 14);
  });

  it("computes ∮ from two residues of opposite sign", () => {
    const { run } = solved();
    expect(run.poles.exactlyComplete).toBe(true);
    expect(run.poles.exactPoles?.map((p) => p.at.toTuple()[0])).toEqual([-2, -4]);
    // `∮ = 2πi(i/√2 − i)`, which is `2π(1 − 1/√2)` — real, and twice the answer.
    expect(must(run.theorem.exactValue, "∮").value[0]).toBeCloseTo(2 * Math.PI * (1 - 1 / Math.SQRT2), 12);
    expect(must(run.theorem.exactValue, "∮").value[1]).toBeCloseTo(0, 12);
  });
});

describe("the hypotheses the record spends", () => {
  it("kills both circles: s < 2 on the outer, s > 0 on the inner", () => {
    const { run } = solved();
    const arcs = run.ledger.rows.filter(
      (row) => row.constraint === "KILL" && (row.pieceId === "outer" || row.pieceId === "inner"),
    );
    expect(arcs).toHaveLength(2);
    expect(arcs.every((row) => row.status === "satisfied")).toBe(true);
    expect(arcs.every((row) => row.evidence.level === "≤")).toBe(true);
  });

  it("refuses a pole ON the cut, rather than substituting into the formula", () => {
    // `(x−2)(x−4)`: both poles land on [0, ∞), on the cut and on the contour. The integral diverges
    // and the method does not apply — and the same formula with p = −2, q = −4 yields a finite and
    // entirely fictitious number.
    const onCut: Family = { ...D2 };
    const r = solveFamily(onCut, { ...flagship, params: { s: 1.5, p: -2, q: -4 } });
    expect(r.ok).toBe(false);
  });
});
