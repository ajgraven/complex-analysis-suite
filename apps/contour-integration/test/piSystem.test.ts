// A LOG family's `M`, over ℚ(i)(π) — the ring D4 and D5 need, and the row the crossing phase forces.
//
// The synthetic records here are the log keyhole at `k = 1` and `k = 2`, written as a record author
// would write them: the lower edge's coefficients are the literal expansion of `−(log x + 2πi)^k`,
// transcribed rather than computed, so the test is independent of the arithmetic in
// `derivedAdditiveRow` that checks them.
import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr";
import { Gauss } from "@cas/exact";
import { exactPiConstant } from "../src/families/piConstant.js";
import { RatPi, formatRatPi } from "../src/kernel/ratPi.js";
import { buildSystem, type PiSystem } from "../src/families/system.js";
import { describeKernel } from "../src/families/linear.js";
import { RAT_PI_FIELD } from "../src/families/field.js";
import { solvePiTargets } from "../src/families/solveTarget.js";
import { checkFamily } from "../src/families/index.js";
import { d1MellinKeyhole } from "../src/families/records/d1-mellin-keyhole.js";
import type { Family, FamilyPiece, FamilyTarget } from "../src/families/schema.js";

const pc = (src: string, bindings = {}): ReturnType<typeof exactPiConstant> =>
  exactPiConstant(parse(src), bindings);

describe("exactPiConstant — ℚ(i)(π), and a refusal that names the other seat", () => {
  it("walks the coefficients a log keyhole actually declares", () => {
    const cases: readonly [string, string][] = [
      ["1", "1"],
      ["-1", "−1"],
      ["0", "0"],
      ["2*pi*i", "2iπ"],
      ["-2*(2*pi*i)", "−4iπ"],
      ["-(2*pi*i)^2", "4π²"],
      // −Δ³ = −(2πi)³ = −8π³i³ = +8iπ³ — the sign D5's row turns on.
      ["-(2*pi*i)^3", "8iπ³"],
      ["pi^2/4", "π²/4"],
      ["1/(2*pi)", "1/(2π)"],
    ];
    for (const [src, text] of cases) {
      const got = pc(src);
      expect(got.ok, `${src}: ${got.ok ? "" : got.reason}`).toBe(true);
      if (got.ok) expect(formatRatPi(got.value)).toBe(text);
    }
  });

  it("refuses an exponential by naming the ring that holds it", () => {
    // The two rings are incomparable: `e^{2πiα}` is not a rational function of π. A walker that
    // accepted it by evaluating numerically is how a rank becomes a tolerance.
    const got = pc("exp(2*pi*i*alpha)", { alpha: 0.5 });
    expect(got.ok).toBe(false);
    expect(!got.ok && got.reason).toMatch(/MULTIPLICATIVE crossing phase/);
  });

  it("refuses what ℚ(i)(π) genuinely cannot hold", () => {
    expect(pc("e").ok).toBe(false);
    expect(pc("pi^(1/2)").ok).toBe(false);
    expect(pc("gamma").ok).toBe(false);
    expect(pc("a").ok).toBe(false); // unbound
    expect(pc("1/(pi - pi)").ok).toBe(false);
    const flag = pc("x", { x: true });
    expect(flag.ok).toBe(false);
    expect(!flag.ok && flag.reason).toMatch(/variant flag/);
  });

  it("binds a rational parameter", () => {
    // A fixture's binding is read through `simplestRational`: the simplest rational that reproduces
    // the double, which is the convention every coefficient walk in the app already uses.
    const got = pc("a*pi", { a: 0.25 });
    expect(got.ok && formatRatPi(got.value)).toBe("π/4");
  });
});

// ── the synthetic log keyhole ────────────────────────────────────────────────────────────────────

function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`expected ${what}`);
  return v;
}

/** `−(log x + Δ)^k` expanded by hand, as a record author would transcribe it. */
const LOWER_ROWS: Readonly<Record<number, readonly { targetId: string; coefficient: string }[]>> = {
  1: [
    { targetId: "T1", coefficient: "-1" },
    { targetId: "T0", coefficient: "-(2*pi*i)" },
  ],
  2: [
    { targetId: "T2", coefficient: "-1" },
    { targetId: "T1", coefficient: "-2*(2*pi*i)" },
    { targetId: "T0", coefficient: "-(2*pi*i)^2" },
  ],
};

function logKeyhole(k: number): Family {
  const base = d1MellinKeyhole;
  const targets: FamilyTarget[] = Array.from({ length: k + 1 }, (_, j) => ({
    ...base.targets[0],
    id: `T${j}`,
    integrand: j === 0 ? "R(x)" : `R(x)*log(x)^${j}`,
    role: j === k ? ("cancels" as const) : j === k - 1 ? ("primary" as const) : ("bonus" as const),
  }));
  const pieces: FamilyPiece[] = base.contour.pieces.map((p) => {
    if (p.role === "target") return { ...p, coefficients: [{ targetId: `T${k}`, coefficient: "1" }] };
    if (p.role === "reproduces") return { ...p, coefficients: [...LOWER_ROWS[k]] };
    return p;
  });
  return {
    ...base,
    id: `log-keyhole-${k}`,
    targets,
    auxiliary: { ...must(base.auxiliary, "D1's auxiliary"), integrand: `R(z)*log(z)^${k}`, relation: "components" },
    branch: {
      ...must(base.branch, "D1's branch spec"),
      function: `log(z)^${k}`,
      rationalPart: "1/(1+z)^2",
      crossingPhase: { kind: "additive", increment: "2*pi*i" },
    },
    contour: { ...base.contour, pieces },
    golden: [{ params: {}, value: "0", numeric: 0, verifiedTo: 1e-15, method: "synthetic" }],
  };
}

const pi = (k: number, re = 1, im = 0): RatPi => RatPi.piPower(k, Gauss.int(re, im));

/** The ℚ(i)(π) arm, checked rather than cast. */
const piSystem = (built: ReturnType<typeof buildSystem>): PiSystem => {
  if (!built.ok) throw new Error(built.reason);
  if (built.system.field !== "Q(i)(pi)") {
    throw new Error(`expected a ℚ(i)(π) system, got ${built.system.field}`);
  }
  return built.system;
};

describe("buildSystem — the crossing phase chooses the ring", () => {
  it("routes an ADDITIVE phase into ℚ(i)(π), realified", () => {
    const s = piSystem(buildSystem(logKeyhole(2)));
    expect(s.targetIds).toEqual(["T0", "T1", "T2"]);
    expect(s.matrix.map((r) => r.map(formatRatPi))).toEqual([
      ["4π²", "0", "0"],
      ["0", "−4π", "0"],
    ]);
    expect(s.report.rank).toBe(2);
    expect(s.report.determined.map((d) => d.column)).toEqual([0, 1]);
  });

  it("leaves a MULTIPLICATIVE phase where it was — D1 is unaffected", () => {
    const built = buildSystem(d1MellinKeyhole, { alpha: 0.5 });
    expect(built.ok && built.system.field).toBe("Q");
  });

  it("names T2 as the combination a log² keyhole cannot see", () => {
    const s = piSystem(buildSystem(logKeyhole(2)));
    expect(describeKernel(RAT_PI_FIELD, s.report, s.targetIds)).toEqual([
      "this contour carries no information about T2",
    ]);
  });

  it("reports the plain-log keyhole's loss as the same rank statement", () => {
    // k = 1: the T1 terms cancel and the surviving equation is −2πi·T0 = 2πi ΣRes, which determines
    // ∫R dx and says nothing about ∫R log x. The gate's sentence, computed.
    const s = piSystem(buildSystem(logKeyhole(1)));
    expect(s.matrix.map((r) => r.map(formatRatPi))).toEqual([
      ["0", "0"],
      ["−2π", "0"],
    ]);
    expect(s.report.rank).toBe(1);
    expect(s.report.determined.map((d) => d.column)).toEqual([0]);
    expect(describeKernel(RAT_PI_FIELD, s.report, ["∫₀^∞ R(x) dx", "∫₀^∞ R(x) log x dx"])).toEqual([
      "this contour carries no information about ∫₀^∞ R(x) log x dx",
    ]);
  });
});

describe("buildSystem — the derived row is what makes D4's traps impossible", () => {
  const withLower = (k: number, rows: readonly { targetId: string; coefficient: string }[]): Family => {
    const f = logKeyhole(k);
    return {
      ...f,
      contour: {
        ...f.contour,
        pieces: f.contour.pieces.map((p) => (p.role === "reproduces" ? { ...p, coefficients: rows } : p)),
      },
    };
  };

  it("catches `four-pi-squared-dropped`", () => {
    // (log x + 2πi)² = log²x + 4πi log x − 4π². Dropping the constant removes T0 from the system
    // and leaves T1's answer UNCHANGED, so nothing downstream would notice.
    const built = buildSystem(
      withLower(2, [
        { targetId: "T2", coefficient: "-1" },
        { targetId: "T1", coefficient: "-2*(2*pi*i)" },
        { targetId: "T0", coefficient: "0" },
      ]),
    );
    expect(built.ok).toBe(false);
    expect(!built.ok && built.reason).toMatch(/differ on 'T0'/);
    expect(!built.ok && built.reason).toMatch(/4π²/);
  });

  it("catches a lost binomial coefficient", () => {
    const built = buildSystem(
      withLower(2, [
        { targetId: "T2", coefficient: "-1" },
        { targetId: "T1", coefficient: "-(2*pi*i)" },
        { targetId: "T0", coefficient: "-(2*pi*i)^2" },
      ]),
    );
    expect(built.ok).toBe(false);
    expect(!built.ok && built.reason).toMatch(/differ on 'T1'/);
  });

  it("catches `wrong-sign-of-the-shift` from the increment's side", () => {
    // Under arg ∈ (0, 2π) the lower edge is log x + 2πi, not log x − 2πi. The flip negates T1 and
    // leaves T0 alone: −π/4 becomes +π/4, right magnitude and wrong sign.
    const f = logKeyhole(2);
    const built = buildSystem({
      ...f,
      branch: { ...must(f.branch, "the synthetic branch spec"), crossingPhase: { kind: "additive", increment: "-2*pi*i" } },
    });
    expect(built.ok).toBe(false);
    expect(!built.ok && built.reason).toMatch(/differ on 'T1'/);
  });

  it("refuses an increment that is not a log's monodromy", () => {
    const f = logKeyhole(2);
    const built = buildSystem({
      ...f,
      branch: { ...must(f.branch, "the synthetic branch spec"), crossingPhase: { kind: "additive", increment: "2*pi" } },
    });
    expect(built.ok).toBe(false);
    expect(!built.ok && built.reason).toMatch(/not purely imaginary/);
  });

  it("refuses to split the identity unless the record declares it", () => {
    // Re/Im is legitimate only because the unknowns are real, which is a hypothesis about R.
    const f = logKeyhole(2);
    const built = buildSystem({ ...f, auxiliary: { ...must(f.auxiliary, "the synthetic auxiliary"), relation: "Re" } });
    expect(built.ok).toBe(false);
    expect(!built.ok && built.reason).toMatch(/components/);
  });
});

describe("invariant 4 — per unknown, not a rank count", () => {
  const invariant4 = (family: Family): string[] =>
    checkFamily(family)
      .filter((v) => v.invariant === 4)
      .map((v) => v.message);

  it("accepts D4's shape: rank 2 in three unknowns, with the third declared as cancelling", () => {
    expect(invariant4(logKeyhole(2))).toEqual([]);
  });

  it("rejects the same system when the record claims the cancelling unknown", () => {
    const f = logKeyhole(2);
    const claimed: Family = {
      ...f,
      targets: f.targets.map((t) => (t.id === "T2" ? { ...t, role: "primary" as const } : t)),
    };
    const messages = invariant4(claimed);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/does not determine T2/);
    // And the failure says WHY, in the sentence the gate asks for.
    expect(messages[0]).toMatch(/carries no information about T2/);
  });

  it("rejects a cancellation that does not happen", () => {
    const f = logKeyhole(2);
    const wrong: Family = {
      ...f,
      targets: f.targets.map((t) => (t.id === "T0" ? { ...t, role: "cancels" as const } : t)),
    };
    const messages = invariant4(wrong);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/T0 is marked as cancelling, but this contour determines it/);
  });
});

describe("solvePiTargets — Pass 5 over ℚ(i)(π)", () => {
  it("solves D4's identity for both unknowns it determines", () => {
    // Σ = π/2 − iπ²/2 for R = 1/(1+x²)², so ∮ = 2πi·Σ = π³ + iπ².
    const closedContour = pi(3).add(pi(2, 0, 1));
    const got = solvePiTargets(logKeyhole(2), { closedContour, pieceLimits: [] });
    if (!got.ok) throw new Error(got.reason);
    expect(got.targets.solved.map((s) => [s.targetId, s.text])).toEqual([
      ["T0", "π/4"],
      ["T1", "−π/4"],
    ]);
    expect(got.targets.solved.map((s) => s.value)).toEqual([Math.PI / 4, -Math.PI / 4]);
    expect(got.targets.invisible).toEqual(["this contour carries no information about T2"]);
    // Every determined unknown is `=`; the invisible one is `?`, not a refusal.
    expect(got.targets.certificates.map((c) => c.level)).toEqual(["=", "=", "?"]);
  });

  it("subtracts the non-vanishing pieces before solving", () => {
    const closedContour = pi(3).add(pi(2, 0, 1)).add(pi(3, 4));
    const got = solvePiTargets(logKeyhole(2), {
      closedContour,
      pieceLimits: [{ pieceId: "indent", contribution: pi(3, 4) }],
    });
    if (!got.ok) throw new Error(got.reason);
    expect(got.targets.solved.map((s) => s.text)).toEqual(["π/4", "−π/4"]);
  });

  it("reports a contradicted identity instead of solving the rows that survived", () => {
    // The plain-log system's real row is identically zero, so a residue sum with a real part says
    // `0 = non-zero`. That is the reality condition failing, not an underdetermined system.
    const got = solvePiTargets(logKeyhole(1), { closedContour: pi(1), pieceLimits: [] });
    expect(got.ok).toBe(false);
    expect(!got.ok && got.reason).toMatch(/contradicted in its real part/);
  });

  it("refuses a family that is not a log family", () => {
    const got = solvePiTargets(d1MellinKeyhole, {
      closedContour: RatPi.ONE,
      pieceLimits: [],
      bindings: { alpha: 0.5 },
    });
    expect(got.ok).toBe(false);
    expect(!got.ok && got.reason).toMatch(/log family/);
  });
});
