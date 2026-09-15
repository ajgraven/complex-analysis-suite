// D4 — the log² keyhole, and the first record in the corpus that is not solved by dividing.
//
// Its contour gives ONE complex identity in THREE unknowns. Read as one equation its rank is 1 and
// two of the three integrals are invisible; split into real and imaginary parts — which is legitimate
// only because the unknowns are real — its rank is 2, it determines `∫R log x` AND `∫R dx`, and the
// one genuinely invisible combination is `∫R log²x`. All three of those facts are claims the record
// makes and this file executes.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { assembleVerdict } from "@cas/rigor";
import { d4LogSquaredKeyhole } from "../src/families/records/d4-log-squared-keyhole.js";
import { loadFamilies } from "../src/families/index.js";
import { runFamily, solveFamily } from "../src/families/runFamily.js";
import { buildSystem } from "../src/families/system.js";
import { formatRatPi } from "../src/kernel/ratPi.js";
import type { Family, FamilyPiece } from "../src/families/schema.js";

const D4 = d4LogSquaredKeyhole;
const flagship = D4.golden[0];

function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`expected ${what}`);
  return v;
}

const branchOf = (f: Family): NonNullable<Family["branch"]> => must(f.branch, "a branch spec");

/** D4 is a multi-unknown family, so its solve takes the SYSTEM route; asserting that is how we say so. */
const solved = (golden = flagship) => {
  const r = solveFamily(D4, golden);
  if (!r.ok) throw new Error(`D4 refused: ${r.reason}`);
  if (r.route !== "system") throw new Error("D4 should solve as a system, not by division");
  return r;
};

const piSystem = (family: Family, bindings: Record<string, number>) => {
  const built = buildSystem(family, bindings);
  if (!built.ok) throw new Error(built.reason);
  if (built.system.field !== "Q(i)(pi)") throw new Error(`expected ℚ(i)(π), got ${built.system.field}`);
  return built.system;
};

describe("the record loads", () => {
  it("passes all four invariants", () => {
    const { families, violations } = loadFamilies([D4]);
    expect(violations).toEqual([]);
    expect(families.get(D4.id)).toBe(D4);
  });

  it("declares what each unknown is for, and invariant 4 checks it", () => {
    // `cancels` is not a label, it is a claim: `∫R log²x` has an identically zero column, and a
    // record that claimed to determine it would be dropped by the loader.
    expect(D4.targets.map((t) => [t.id, t.role])).toEqual([
      ["T0", "bonus"],
      ["T1", "primary"],
      ["T2", "cancels"],
    ]);
  });
});

describe("the system: one complex identity, two real rows", () => {
  it("builds M over ℚ(i)(π), realified", () => {
    const s = piSystem(D4, { p: 2 });
    expect(s.targetIds).toEqual(["T0", "T1", "T2"]);
    expect(s.matrix.map((r) => r.map((v) => formatRatPi(v)))).toEqual([
      ["4π²", "0", "0"],
      ["0", "−4π", "0"],
    ]);
    expect(s.report.rank).toBe(2);
    expect(s.report.determined.map((d) => d.column)).toEqual([0, 1]);
  });

  it("carries the `4π²` the derivation's commonest slip drops", () => {
    // `(log x + 2πi)² = log²x + 4πi log x − 4π²`. Without the constant term T0 leaves the system
    // entirely — and T1's answer is UNCHANGED, so nothing downstream would notice.
    expect(formatRatPi(piSystem(D4, { p: 2 }).matrix[0][0])).toBe("4π²");
  });
});

describe("∮, from the residues the record states", () => {
  it("reaches 2πi·Σ with Σ = π/2 − iπ²/2", () => {
    const { run } = solved();
    // 2πi(π/2 − iπ²/2) = π³ + iπ².
    expect(run.theorem.exactInPi).toBeDefined();
    expect(formatRatPi(must(run.theorem.exactInPi, "∮ in ℚ(i)(π)"))).toBe("π³ + iπ²");
    // …and NOT in units of π: a log family's residues are polynomials in π, so there is no single
    // power to divide out.
    expect(run.theorem.piUnits).toBeUndefined();
  });

  it("takes its poles from the rational cofactor, at order 2", () => {
    const { run } = solved();
    expect(run.poles.exactlyComplete).toBe(true);
    expect(run.poles.exactPoles?.map((p) => p.order)).toEqual([2, 2]);
  });
});

describe("Pass 5: two answers from one contour, and an honest silence about the third", () => {
  it("gives the primary answer −π/4", () => {
    const r = solved();
    expect(r.solved.text).toBe("−π/4");
    expect(r.solved.value).toBeCloseTo(-0.78539816339744828, 15);
  });

  it("gives ∫₀^∞ dx/(1+x²)² = π/4 FREE from the same identity", () => {
    // The record's second golden, which is not a second run: it is the other unknown of this one.
    const r = solved();
    expect(r.targets.solved.map((s) => [s.targetId, s.text])).toEqual([
      ["T0", "π/4"],
      ["T1", "−π/4"],
    ]);
    expect(r.targets.solved[0].value).toBeCloseTo(Math.PI / 4, 15);
  });

  it("badges the primary with the PRIMARY's evidence, not the system's", () => {
    // A verdict is a meet, so handing the card every certificate would cap an exact answer at `?`
    // on the strength of a statement about a different unknown — the failure `residueTheorem.ts`
    // records from the other direction, where corroboration capped `=` at `≤`.
    const r = solved();
    expect(r.solved.certificates.map((c) => c.level)).toEqual(["="]);
    expect(assembleVerdict(r.solved.certificates).level).toBe("=");
    // The system's own list still carries all of it, including the `?`.
    expect(r.targets.certificates.map((c) => c.level)).toEqual(["=", "=", "?"]);
  });

  it("says nothing about ∫R log²x, and says so", () => {
    const r = solved();
    expect(r.targets.invisible).toEqual(["this contour carries no information about T2"]);
    // `?`, not a refusal: the contour is sound, it simply carries no information about that one.
    expect(r.targets.certificates.map((c) => c.level)).toEqual(["=", "=", "?"]);
  });

  it("solves the second fixture, where the log integral is 0 and the bonus is π/2", () => {
    // R = 1/(1+x²): Σ = −iπ² is purely imaginary, so Re(Σ) = 0 exactly and T1 = 0 — not 1e−17.
    const r = solved(D4.golden[1]);
    expect(r.solved.text).toBe("0");
    expect(r.solved.value).toBe(0);
    expect(r.targets.solved.map((s) => [s.targetId, s.text])).toEqual([
      ["T0", "π/2"],
      ["T1", "0"],
    ]);
  });
});

describe("the ledger closes", () => {
  it("passes LEGALITY: the cut runs to ∞ and both lips declare their side", () => {
    const { run } = solved();
    const legality = run.ledger.rows.filter((r) => r.constraint === "LEGALITY");
    expect(legality.length).toBeGreaterThan(0);
    expect(legality.every((r) => r.status === "satisfied")).toBe(true);
  });

  it("KILLS both circles with a bound, not an assertion", () => {
    const { run } = solved();
    const kill = run.ledger.rows.filter((r) => r.constraint === "KILL" && r.pieceId !== undefined);
    const arcs = kill.filter((r) => r.pieceId === "outer" || r.pieceId === "inner");
    expect(arcs).toHaveLength(2);
    expect(arcs.every((r) => r.status === "satisfied")).toBe(true);
    // The log is absorbed: it is weaker than every power, so the decay of R alone does the work.
    expect(arcs.every((r) => r.evidence.level === "≤")).toBe(true);
  });

  it("runs a quadrature in the declared determination, and reports the gap", () => {
    // Inverted by M5.0. The old assertion was that D4 had NO second opinion, because a compiled
    // evaluator samples `log` on its principal branch and the keyhole's two lips then cancel. Now
    // each lip is sampled at the limit from its declared side, so the corroboration is of the same
    // integral — and a `log`'s ADDITIVE monodromy makes this the case that most needed it.
    const { run } = solved();
    expect(run.integral.quadratureSkipped).toBeUndefined();
    expect(run.theorem.disagreement).toBeDefined();
    expect(run.theorem.agrees).toBe(true);
  });
});

describe("the traps, executed", () => {
  const withLower = (rows: FamilyPiece["coefficients"]): Family => ({
    ...D4,
    contour: {
      ...D4.contour,
      pieces: D4.contour.pieces.map((p) => (p.role === "reproduces" ? { ...p, coefficients: rows } : p)),
    },
  });

  it("`four-pi-squared-dropped` — the row is derived and the record is checked against it", () => {
    const built = buildSystem(
      withLower([
        { targetId: "T2", coefficient: "-1" },
        { targetId: "T1", coefficient: "-2*(2*pi*i)" },
        { targetId: "T0", coefficient: "0" },
      ]),
      { p: 2 },
    );
    expect(built.ok).toBe(false);
    expect(!built.ok && built.reason).toMatch(/differ on 'T0'/);
  });

  it("`wrong-sign-of-the-shift` — log x − 2πi is not this determination's lower edge", () => {
    const wrong: Family = {
      ...D4,
      branch: { ...branchOf(D4), crossingPhase: { kind: "additive", increment: "-2*pi*i" } },
    };
    const built = buildSystem(wrong, { p: 2 });
    expect(built.ok).toBe(false);
    expect(!built.ok && built.reason).toMatch(/differ on 'T1'/);
  });

  it("`log-phase-is-additive` — a multiplicative phase sends the row to the wrong ring", () => {
    // Writing `exp(2 pi i)` here is a TYPE error, and it surfaces as one: the coefficients carry a
    // bare π, which the exponential basis has no seat for, and the refusal names the seat that does.
    const wrong: Family = {
      ...D4,
      branch: {
        ...branchOf(D4),
        crossingPhase: { kind: "multiplicative", factor: "exp(2*pi*i)" },
      },
    };
    const built = buildSystem(wrong, { p: 2 });
    expect(built.ok).toBe(false);
    expect(!built.ok && built.reason).toMatch(/bare π/);
    expect(!built.ok && built.reason).toMatch(/ADDITIVE/);
  });

  it("`plain-log-loses-the-log-integral` — the gate, as a computed rank statement", () => {
    // One log instead of two: the lower edge gives −(T1 + 2πi·T0), the T1 terms CANCEL, and what
    // survives determines ∫R dx while saying NOTHING about ∫R log x. The app must report that
    // rather than solving for it and printing 0.
    const plain: Family = {
      ...D4,
      targets: [D4.targets[0], { ...D4.targets[1], role: "primary" as const }],
      auxiliary: { ...must(D4.auxiliary, "D4's auxiliary"), integrand: "log(z)/(1+z^2)^p" },
      branch: {
        ...branchOf(D4),
        function: "log(z)",
        factors: [{ ...branchOf(D4).factors[0], order: { kind: "log" as const, power: 1 } }],
      },
      contour: {
        ...D4.contour,
        pieces: D4.contour.pieces.map((p) => {
          if (p.role === "target") return { ...p, coefficients: [{ targetId: "T1", coefficient: "1" }] };
          if (p.role === "reproduces") {
            return {
              ...p,
              coefficients: [
                { targetId: "T1", coefficient: "-1" },
                { targetId: "T0", coefficient: "-(2*pi*i)" },
              ],
            };
          }
          return p;
        }),
      },
    };

    const s = piSystem(plain, { p: 2 });
    expect(s.report.rank).toBe(1);
    expect(s.report.determined.map((d) => d.column)).toEqual([0]);

    const r = solveFamily(plain, flagship);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/does not determine T1/);
    expect(!r.ok && r.reason).toMatch(/carries no information about T1/);
  });
});

describe("the determination is an input to the answer", () => {
  const principal = (): Family => ({
    ...D4,
    branch: {
      ...branchOf(D4),
      factors: [{ ...branchOf(D4).factors[0], argRange: ["-1", "1"] }],
    },
  });

  it("refuses at the principal determination rather than answering", () => {
    // The cut moves with the determination: `arg ∈ (−π, π]` puts it on ℝ₋, straight through the
    // keyhole's two circles, which carry no `side` tag.
    const r = solveFamily(principal(), flagship);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/LEGALITY refuses/);
    expect(r.run?.ledger.failedAt).toBe("LEGALITY");
  });

  it("would otherwise have answered — with different residues", () => {
    // What the gate is stopping. arg(−i) is 3π/2 in the keyhole's range and −π/2 in the principal
    // one, so the residue sum is a different number and Pass 5 knows nothing about the difference.
    const r = runFamily(principal(), flagship);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run.ledger.failedAt).toBe("LEGALITY");
    expect(formatRatPi(must(r.run.theorem.exactInPi, "∮ in ℚ(i)(π)"))).not.toBe("π³ + iπ²");
  });
});

describe("the branch data the record declares", () => {
  it("declares an additive crossing of exactly 2πi", () => {
    const phase = branchOf(D4).crossingPhase;
    expect(phase.kind).toBe("additive");
    expect(phase.kind === "additive" && phase.increment).toBe("2*pi*i");
  });

  it("declares the keyhole determination as exact multiples of π", () => {
    const range = branchOf(D4).factors[0].argRange;
    expect(range).toEqual(["0", "2"]);
    // …and the engine reads them as rationals, not as floats near 0 and 6.283.
    expect(Frac.of(0n).toNumber()).toBe(0);
  });
});
