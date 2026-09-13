// D5 — the log³ keyhole, and the first record in the corpus that does not close alone.
//
// Two real equations in three unknowns: it determines `∫R log x` outright and `∫R log²x` only MODULO
// `∫R dx`, which this contour cannot supply. D4's log² keyhole on the same `R` supplies it, and the
// borrowed value's verdict meets into the answer that depends on it — and into no other.
import { describe, expect, it } from "vitest";
import { assembleVerdict } from "@cas/rigor";
import { d5LogCubedKeyhole } from "../src/families/records/d5-log-cubed-keyhole.js";
import { d4LogSquaredKeyhole } from "../src/families/records/d4-log-squared-keyhole.js";
import { checkFamily, loadFamilies } from "../src/families/index.js";
import { solveFamily } from "../src/families/runFamily.js";
import { buildSystem, withoutColumns } from "../src/families/system.js";
import { formatRatPi } from "../src/kernel/ratPi.js";
import type { Family } from "../src/families/schema.js";

const D5 = d5LogCubedKeyhole;
const flagship = D5.golden[0];
const nonZeroBonus = D5.golden[1];

function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`expected ${what}`);
  return v;
}

const solved = (golden = flagship, record: Family = D5) => {
  const r = solveFamily(record, golden);
  if (!r.ok) throw new Error(`D5 refused: ${r.reason}`);
  if (r.route !== "system") throw new Error("D5 should solve as a system");
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
    const { families, violations } = loadFamilies([d4LogSquaredKeyhole, D5]);
    expect(violations).toEqual([]);
    expect(families.get(D5.id)).toBe(D5);
  });

  it("declares T0 as an INPUT, not as something it derives", () => {
    expect(D5.targets.map((t) => [t.id, t.role])).toEqual([
      ["T0", "input"],
      ["T1", "bonus"],
      ["T2", "primary"],
      ["T3", "cancels"],
    ]);
    expect(must(D5.prerequisites, "prerequisites")[0]).toMatchObject({
      targetId: "T0",
      rigor: "=",
    });
    expect(must(D5.prerequisites, "prerequisites")[0].from).toMatch(/^family:log-squared-keyhole/);
  });
});

describe("the contour does NOT close alone, and the system says exactly how", () => {
  it("carries all three lower binomial terms", () => {
    // `−(log x + 2πi)³` = `−log³ − 6πi log² + 12π² log + 8π³i`; the log³ terms cancel with the
    // upper edge and the other three survive. Dropping the last removes T0 SILENTLY.
    const s = piSystem(D5, { p: 1 });
    expect(s.targetIds).toEqual(["T0", "T1", "T2", "T3"]);
    expect(s.matrix.map((r) => r.map(formatRatPi))).toEqual([
      ["0", "12π²", "0", "0"],
      ["8π³", "0", "−6π", "0"],
    ]);
  });

  it("determines T1 outright and leaves T2 entangled with T0", () => {
    const s = piSystem(D5, { p: 1 });
    expect(s.report.rank).toBe(2);
    expect(s.report.determined.map((d) => s.targetIds[d.column])).toEqual(["T1"]);
    // The kernel NAMES the missing input: T2 is knowable only together with T0.
    const kernel = s.report.kernel.map((v) => v.map(formatRatPi));
    expect(kernel).toContainEqual(["3/(4π²)", "0", "1", "0"]);
  });

  it("determines T2 once T0 is taken out — which is what borrowing it means", () => {
    const reduced = withoutColumns(piSystem(D5, { p: 1 }), ["T0"]);
    expect(reduced.targetIds).toEqual(["T1", "T2", "T3"]);
    expect(reduced.report.determined.map((d) => reduced.targetIds[d.column])).toEqual(["T1", "T2"]);
  });

  it("refuses when the prerequisite is taken away", () => {
    // The record without its `prerequisites`: the contour is unchanged and the answer is no longer
    // reachable. The refusal names T0 — computed from the kernel, not written down.
    const alone: Family = { ...D5, prerequisites: undefined };
    const r = solveFamily(alone, flagship);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/does not determine T2/);
    expect(!r.ok && r.reason).toMatch(/T0/);
  });
});

describe("it closes when D4 supplies T0", () => {
  it("gives π³/8 at p = 1, with T1 = 0 as the consistency check", () => {
    const r = solved();
    expect(r.solved.text).toBe("π³/8");
    expect(r.solved.value).toBeCloseTo(Math.PI ** 3 / 8, 13);
    expect(r.targets.solved.map((s) => [s.targetId, s.text])).toEqual([
      ["T1", "0"],
      ["T2", "π³/8"],
    ]);
    expect(r.targets.invisible).toEqual(["this contour carries no information about T3"]);
  });

  it("gives π³/16 at p = 2, where the bonus is NOT zero", () => {
    // The fixture the record's `sign-of-T1-from-the-1-over-i` trap asks for. `T1 = −π/4` is D4's own
    // primary answer at the same p, reached here by a different contour — so the two records
    // cross-check each other on a number neither takes from the other.
    const r = solved(nonZeroBonus);
    expect(r.solved.text).toBe("π³/16");
    expect(r.targets.solved.map((s) => [s.targetId, s.text])).toEqual([
      ["T1", "−π/4"],
      ["T2", "π³/16"],
    ]);
    const d4 = solveFamily(d4LogSquaredKeyhole, { ...d4LogSquaredKeyhole.golden[0], params: { p: 2 } });
    expect(d4.ok && d4.solved.text).toBe("−π/4");
  });

  it("reports the borrowed input as its own row, with its own verdict", () => {
    // The record's `solving-a-rank-deficient-system` trap asks for exactly this: "the ledger must
    // show the prerequisite as its own row with its own verdict, and the final label meets with it."
    const r = solved();
    expect(r.targets.borrowed.map((b) => [b.targetId, b.text])).toEqual([["T0", "π/2"]]);
    expect(assembleVerdict([r.targets.borrowed[0].certificate]).level).toBe("=");
    expect(r.targets.borrowed[0].certificate.claim).toMatch(/borrowed from 'log-squared-keyhole'/);
  });

  it("borrows the value at the SAME binding, not the source's own flagship", () => {
    // D4's flagship is p = 2 and D5's is p = 1. A prerequisite resolved at the source's own fixture
    // would borrow π/4 instead of π/2 and return a confident wrong number.
    const r = solved();
    expect(r.targets.borrowed[0].text).toBe("π/2");
    // …and at p = 2 it borrows D4's OWN flagship value, which is the different number π/4.
    expect(solved(nonZeroBonus).targets.borrowed[0].text).toBe("π/4");
  });
});

describe("the borrowed verdict meets into the answers that depend on it — and no others", () => {
  it("keeps the bonus exact on its own contour", () => {
    // T1 comes off the REAL part of the identity, where T0's coefficient is zero. It does not
    // depend on the borrowed value, so a blanket meet would have downgraded it for nothing.
    const r = solved();
    const t1 = must(r.targets.solved.find((s) => s.targetId === "T1"), "T1");
    expect(t1.certificates).toHaveLength(1);
    expect(assembleVerdict(t1.certificates).level).toBe("=");
  });

  it("carries the borrowed certificate on the answer that does depend on it", () => {
    const r = solved();
    const t2 = must(r.targets.solved.find((s) => s.targetId === "T2"), "T2");
    expect(t2.certificates).toHaveLength(2);
    expect(t2.certificates[1].claim).toMatch(/borrowed from 'log-squared-keyhole'/);
    // D4's T0 is exact, so the meet is exact — the input's rigor, not an assumption about it.
    expect(assembleVerdict(t2.certificates).level).toBe("=");
  });

  it("NEVER upgrades: a record expecting ≈ gets ≈, however exact the source was", () => {
    // The gate's other half. D4 determines T0 exactly; a record that built its argument on the
    // weaker claim keeps the weaker claim, and only the answer that used it is affected.
    const cautious: Family = {
      ...D5,
      prerequisites: [{ ...must(D5.prerequisites, "prerequisites")[0], rigor: "≈" }],
    };
    const r = solved(flagship, cautious);
    const t1 = must(r.targets.solved.find((s) => s.targetId === "T1"), "T1");
    const t2 = must(r.targets.solved.find((s) => s.targetId === "T2"), "T2");
    expect(assembleVerdict(t1.certificates).level).toBe("=");
    expect(assembleVerdict(t2.certificates).level).toBe("≈");
    // And the primary answer the app prints takes the weaker label with it.
    expect(assembleVerdict(r.solved.certificates).level).toBe("≈");
    // The VALUE is unchanged — rigor is a claim about the value, not a different value.
    expect(r.solved.text).toBe("π³/8");
  });
});

describe("the prerequisite must be resolvable, and says so when it is not", () => {
  const withSource = (from: string, extra: Record<string, unknown> = {}): Family => ({
    ...D5,
    prerequisites: [{ ...must(D5.prerequisites, "prerequisites")[0], from, ...extra }],
  });

  it("refuses a source that is not a runnable record", () => {
    const r = solveFamily(withSource("an elementary antiderivative"), flagship);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/needs T0/);
    expect(!r.ok && r.reason).toMatch(/not a record this engine can run/);
    // …and it passes on the alternative the record offers, rather than only saying no.
    expect(!r.ok && r.reason).toMatch(/semicircle family/);
  });

  it("refuses a source that is not loaded", () => {
    const r = solveFamily(withSource("family:no-such-record"), flagship);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/not a loaded record/);
  });

  it("refuses a source that does not determine the named unknown", () => {
    const r = solveFamily(withSource("family:log-squared-keyhole", { sourceTargetId: "T2" }), flagship);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/does not determine T2/);
  });

  it("refuses a cycle rather than recursing", () => {
    // A record borrowing from itself. Nothing in the corpus does, and a corpus that did would
    // otherwise hang rather than report.
    const looping: Family = {
      ...D5,
      prerequisites: [{ ...must(D5.prerequisites, "prerequisites")[0], from: "family:log-cubed-keyhole" }],
    };
    const r = solveFamily(looping, flagship);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/prerequisite cycle/);
  });
});

describe("invariant 4 judges a borrowing record on the system without the borrowed column", () => {
  const invariant4 = (family: Family): string[] =>
    checkFamily(family)
      .filter((v) => v.invariant === 4)
      .map((v) => v.message);

  it("accepts D5", () => {
    expect(invariant4(D5)).toEqual([]);
  });

  it("rejects it when the prerequisite is removed — the contour no longer determines T2", () => {
    const messages = invariant4({ ...D5, prerequisites: undefined });
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toMatch(/does not determine T2/);
  });

  it("rejects a borrowed unknown the contour supplies on its own", () => {
    // T1 IS determined by this contour. Borrowing it would document a dependency that is not there.
    const spurious: Family = {
      ...D5,
      targets: D5.targets.map((t) => (t.id === "T1" ? { ...t, role: "input" as const } : t)),
      prerequisites: [
        must(D5.prerequisites, "prerequisites")[0],
        { ...must(D5.prerequisites, "prerequisites")[0], targetId: "T1" },
      ],
    };
    const messages = invariant4(spurious);
    expect(messages.some((m) => /T1 is borrowed as an input, but this contour determines it/.test(m))).toBe(true);
  });
});
