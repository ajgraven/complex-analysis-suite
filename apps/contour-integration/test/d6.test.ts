// D6 — the dogbone, and a contour that encloses no pole at all without being zero.
//
// Three things are pinned here that no other record can pin. **The enclosed count is 0 and the value
// is not**: those are separate rows, and the app is not allowed to read one off the other. **The
// branch factor takes opposite signs at the conjugate poles**, so the residues add instead of
// cancelling — using `+√(1+a²)` at both, the natural symmetry reflex, returns exactly 0 and nothing
// looks wrong. And **`Res(f,∞) = 0` is certified rather than assumed**, by the same degree
// computation that would discharge an outer circle; D7 is where the same term carries the answer.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { d6DogboneInverseSqrt } from "../src/families/records/d6-dogbone-inverse-sqrt.js";
import { loadFamilies } from "../src/families/index.js";
import { primaryGolden, runFamily, solveFamily } from "../src/families/runFamily.js";
import { multiFactorOf } from "../src/families/branchFactor.js";
import { d2KeyholeTwoPoles } from "../src/families/records/d2-keyhole-two-poles.js";
import { multiPowerAtPole } from "../src/kernel/branchResidue.js";
import { formatExpSum } from "../src/kernel/expSum.js";
import type { Family } from "../src/families/schema.js";

const D6 = d6DogboneInverseSqrt;
const flagship = primaryGolden(D6);

function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`expected ${what}`);
  return v;
}

const solved = (golden = flagship) => {
  const r = solveFamily(D6, golden);
  if (!r.ok) throw new Error(`D6 refused: ${r.reason}`);
  return r;
};

const ran = (golden = flagship) => {
  const r = runFamily(D6, golden);
  if (!r.ok) throw new Error(`D6 refused: ${r.reason}`);
  return r.run;
};

const reasons = (golden = flagship): string =>
  ran(golden)
    .theorem.verdict.certificates.map((c) => [c.claim, c.method, ...c.provenance.map((s) => s.text)].join(" :: "))
    .join(" | ");

describe("the record loads and solves", () => {
  it("passes all four invariants", () => {
    const { families, violations } = loadFamilies([D6]);
    expect(violations).toEqual([]);
    expect(families.get(D6.id)).toBe(D6);
  });

  it("gives π/√2 at a = 1, as a symbolic closed form", () => {
    const r = solved();
    expect(r.solved?.text).toBe("π√2/2");
    expect(r.solved?.value).toBeCloseTo(Math.PI / Math.SQRT2, 12);
    expect(r.run.ledger.closes).toBe(true);
    expect(r.run.ledger.failedAt).toBeNull();
  });

  it("solves every fixture it declares, including the one that needs a factorisation", () => {
    for (const g of D6.golden) {
      const a = Number(g.params.a);
      const r = solveFamily(D6, g);
      if (!r.ok) throw new Error(`a = ${a}: ${r.reason}`);
      expect({ a, value: r.solved?.value }).toEqual({
        a,
        value: expect.closeTo(Math.PI / (a * Math.sqrt(1 + a * a)), 10) as unknown as number,
      });
    }
  });
});

describe("what the dogbone teaches", () => {
  it("encloses NO pole, and says so in a row that says nothing about the value", () => {
    const catches = ran().ledger.rows.filter((r) => r.constraint === "CATCH");
    expect(catches[0].claim).toMatch(/0 singularities are enclosed/);
    expect(catches[0].status).toBe("satisfied");
    // And the value is not zero, on the same run.
    expect(must(ran().theorem.exactValue, "an exact ∮").text).toBe("π√2");
    expect(reasons()).toMatch(/says what is ENCLOSED and says nothing whatever about the value/);
  });

  it("weights those poles by n − σ = 1, which is where the cut being inside is paid for", () => {
    expect(reasons()).toMatch(/encloses the cut clockwise \(σ = −1 at every branch point\)/);
    expect(reasons()).toMatch(/weighted by n\(γ,aₖ\) − σ = n\(γ,aₖ\) − −1/);
  });

  it("certifies Res(f,∞) = 0 from the degree rather than assuming it", () => {
    expect(reasons()).toMatch(/Res\(f, ∞\) = 0/);
    expect(reasons()).toMatch(/f = O\(z\^\(−3\)\) at infinity/);
    expect(reasons()).toMatch(/an order of −2 or less leaves no z⁻¹ coefficient/);
    // The one-number unification: the same computation would discharge an outer circle by L2.
    expect(reasons()).toMatch(/SAME computation discharges L2 on the outer circle/);
  });

  it("takes OPPOSITE signs at the conjugate poles — the trap that returns 0 and looks fine", () => {
    expect(reasons()).toMatch(/the branch factor at i is √2\/2/);
    expect(reasons()).toMatch(/the branch factor at −i is −√2\/2/);
    // Using +√2/2 at both would make Σ Res = 0 and the answer 0. The record says so.
    const trap = must(
      D6.traps.find((t) => t.id === "wrong-sqrt-determination-at-an-outside-pole"),
      "the determination trap",
    );
    expect(trap.message).toMatch(/the sum is 0, and the answer is 0/);
  });

  it("kills each end cap by a bound taken about that cap's OWN branch point", () => {
    const caps = ran().ledger.rows.filter((r) => r.claim.includes("over the cap"));
    expect(caps).toHaveLength(2);
    for (const cap of caps) {
      expect(cap.status).toBe("satisfied");
      expect(cap.evidence.level).toBe("≤");
      expect(cap.claim).toMatch(/O\(η\^\(1\/2\)\)/);
      expect(cap.evidence.provenance.map((s) => s.text).join(" | ")).toMatch(
        /shifted to the cap's own centre by exact synthetic division/,
      );
    }
  });

  it("reads its edges as ADDING, because two sign changes make one", () => {
    // W changes sign across the cut AND the traversal is reversed, so the lower edge reproduces the
    // target with coefficient +1 and ∮ = 2T. A reader who expects a cut to make the edges cancel has
    // it exactly backwards: cancellation is what would happen if there were no cut at all.
    const bottom = must(D6.contour.pieces.find((p) => p.id === "bottom"), "the lower edge");
    expect(bottom.coefficients?.[0].coefficient).toBe("-exp(2*pi*i*(-1/2))");
    expect(must(ran().theorem.exactValue, "∮").value[0]).toBeCloseTo(2 * (Math.PI / Math.SQRT2), 12);
  });
});

describe("the determination is read from the record, and refuses what it cannot hold", () => {
  it("reads the branch factor the record declares — two points, one window, constant i", () => {
    const factor = multiFactorOf(D6, flagship.params);
    if (!factor.ok) throw new Error(factor.reason);
    expect(factor.factor.points.map((p) => p.at.toTuple())).toEqual([
      [-1, 0],
      [1, 0],
    ]);
    expect(factor.factor.points.every((p) => p.alpha.equals(Frac.of(-1n, 2n)))).toBe(true);
    expect(factor.factor.constant.equals(SqrtExt.fromGauss(Gauss.I))).toBe(true);
    expect(factor.choice.cuts).toEqual([{ id: "Γ1", from: "b1", to: "b2", via: [] }]);
  });

  it("drops the constant and the answer turns imaginary — which is the only thing that shows", () => {
    const factor = multiFactorOf(D6, flagship.params);
    if (!factor.ok) throw new Error(factor.reason);
    const without = { ...factor.factor, constant: SqrtExt.ONE };
    const at = multiPowerAtPole(SqrtExt.fromGauss(Gauss.I), without);
    if (!at.ok) throw new Error(at.reason);
    // `√2/2` becomes `−i√2/2`: the same modulus, rotated. Every residue picks up the same factor, so
    // the answer stays finite, stays plausible, and is wrong by `i`.
    expect(formatExpSum(at.value)).toBe("−i√2/2");
  });

  it("refuses two different determinations in one product, rather than reading the first", () => {
    // D7 declares `arg z ∈ [0,2π)` for one factor and `arg(b−z) ∈ (−π,π]` for the other. That is a
    // different branch structure, not a harder case of this one, and silently using one window for
    // both would rotate half the residues with nothing to warn you.
    const split = {
      ...D6,
      branch: must(D6.branch, "a branch") && {
        ...must(D6.branch, "a branch"),
        factors: [
          must(D6.branch, "a branch").factors[0],
          { ...must(D6.branch, "a branch").factors[1], argRange: ["-1", "1"] as const },
        ],
      },
    };
    const factor = multiFactorOf(split, flagship.params);
    expect(factor.ok).toBe(false);
    if (!factor.ok) expect(factor.reason).toMatch(/declares a different determination from the first/);
  });
});

describe("the cap bound is taken about the cap's OWN centre", () => {
  // A variant whose cofactor has a pole at `1 ± i/10` — just outside the η = 0.05 cap, and far from
  // the origin. It exists to make the shift LOAD-BEARING: bounding `|R|` on `|z| = η` about the
  // ORIGIN says `|D| ≥ 0.9`, which is true there and meaningless on the cap, where `|D|` falls to
  // 0.0075. The bound computed that way is ~1.1 and the cap's integral is ~10²: not a loose bound,
  // an invalid one, wearing a `≤`. D6 itself cannot catch this — its own poles are at `±i`, where the
  // unshifted reading happens to be conservative, which is exactly how such a bug survives.
  const nearPole: Family = {
    ...D6,
    id: "dogbone-pole-near-the-cap",
    branch: { ...must(D6.branch, "a branch"), rationalPart: "1/((z-1)^2 + 1/100)" },
    targets: [{ ...D6.targets[0], integrand: "1/(((x-1)^2 + 1/100)*sqrt(1-x^2))" }],
    auxiliary: { ...must(D6.auxiliary, "an auxiliary"), integrand: "1/(((z-1)^2 + 1/100)*sqrt(1-z^2))" },
  };

  /** `|∮|` over the cap `|z − b| = η`, from the record's own declared branch, in floats. */
  function capIntegral(b: number, eta: number, n = 40000): number {
    const argIn = (px: number, py: number): number => {
      const t = Math.atan2(py, px);
      return t < 0 ? t + 2 * Math.PI : t;
    };
    let re = 0;
    let im = 0;
    for (let k = 0; k < n; k++) {
      const t = Math.PI - (2 * Math.PI * k) / n;
      const x = b + eta * Math.cos(t);
      const y = eta * Math.sin(t);
      const lm = 0.5 * (Math.log(Math.hypot(x - 1, y)) + Math.log(Math.hypot(x + 1, y)));
      const th = 0.5 * (argIn(x - 1, y) + argIn(x + 1, y));
      const wr = Math.exp(lm) * Math.sin(th); // W = −i·e^{lm+iθ}
      const wi = -Math.exp(lm) * Math.cos(th);
      const pr = (x - 1) * (x - 1) - y * y + 0.01;
      const pi = 2 * (x - 1) * y;
      const dr = pr * wr - pi * wi;
      const di = pr * wi + pi * wr;
      const m = dr * dr + di * di;
      const fr = dr / m;
      const fi = -di / m;
      const zr = -eta * Math.sin(t);
      const zi = eta * Math.cos(t);
      const step = (-2 * Math.PI) / n;
      re += (fr * zr - fi * zi) * step;
      im += (fr * zi + fi * zr) * step;
    }
    return Math.hypot(re, im);
  }

  it("dominates the cap's actual integral, where an unshifted bound would not", () => {
    const r = runFamily(nearPole, {
      params: { a: 1 },
      value: "n/a",
      numeric: 0,
      verifiedTo: 1,
      method: "not a golden: this variant exists to make the cap bound falsifiable, not to be solved",
    });
    if (!r.ok) throw new Error(r.reason);
    const eta = must(r.run.contour.params.eta, "the η parameter").value;
    const caps = r.run.ledger.rows.filter((row) => row.claim.includes("over the cap"));
    expect(caps).toHaveLength(2);
    for (const [k, b] of [1, -1].entries()) {
      const cap = must(
        caps.find((row) => row.pieceId === (b === 1 ? "endB" : "endA")),
        `the cap at ${b}`,
      );
      const claimed = Number(/≤ ([0-9.e+-]+)/.exec(cap.claim)?.[1] ?? "NaN");
      const actual = capIntegral(b, eta);
      expect({ k, b, holds: actual <= claimed }).toEqual({ k, b, holds: true });
    }
  });
});

describe("multiFactorOf refuses what is not a multi-point factor", () => {
  it("refuses a record with ONE branch point, which is the keyhole's case", () => {
    // Reachable only by a direct call — `runFamily` routes on `isMultiPoint` first — and guarded
    // anyway, because a one-point product has no bounded cut and cannot be legally enclosed.
    const r = multiFactorOf(d2KeyholeTwoPoles, { s: 1.5, p: 2, q: 4 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/needs at least two branch points; the family declares 1/);
  });

  it("refuses a log branch point, whose monodromy has infinite order", () => {
    const logged: Family = {
      ...D6,
      branch: {
        ...must(D6.branch, "a branch"),
        factors: [
          must(D6.branch, "a branch").factors[0],
          { at: "1", order: { kind: "log", power: 1 }, argRange: ["0", "2"] },
        ],
      },
    };
    const r = multiFactorOf(logged, { a: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cannot share a bounded cut: its monodromy has infinite order/);
  });

  it("refuses a cut naming a branch point the factor list does not declare", () => {
    const stray: Family = {
      ...D6,
      branch: { ...must(D6.branch, "a branch"), cuts: [{ from: "-1", to: "2" }] },
    };
    const r = multiFactorOf(stray, { a: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/names a branch point the factor list does not/);
  });
});
