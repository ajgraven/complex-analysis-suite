// D1, end to end — **north-star behaviour 4**, made executable.
//
// > `∫₀^∞ x^{α−1}/(1+x) dx` prints `π/sin(πα)` labelled `=`, with the keyhole's four pieces, the
// > `(1 − e^{2πiα})` factor, and a certified numeric bound on each vanishing arc.
//
// Every clause of that is a test below. The record itself is the specification, so the expected
// values are read out of `d1MellinKeyhole.golden` rather than written again here.
import { describe, expect, it } from "vitest";
import { d1MellinKeyhole } from "../src/families/records/d1-mellin-keyhole.js";
import { runFamily, solveFamily } from "../src/families/runFamily.js";
import { loadFamilies } from "../src/families/index.js";
import { windingNumber } from "../src/kernel/winding.js";
import type { Family } from "../src/families/schema.js";

const D1 = d1MellinKeyhole;
const flagship = D1.golden[0];
/** A golden value may be complex; every one of D1's is real. */
const real = (n: number | readonly [number, number]): number => (typeof n === "number" ? n : n[0]);

/** D1 is a one-unknown family, so its solve takes the scalar route; asserting that is how we say so. */
const solved = (golden = flagship) => {
  const r = solveFamily(D1, golden);
  if (!r.ok) throw new Error(`D1 refused: ${r.reason}`);
  if (r.route !== "scalar") throw new Error(`D1 should solve by division, not as a system`);
  return r;
};

describe("the record loads", () => {
  it("passes all four invariants", () => {
    const { families, violations } = loadFamilies([D1]);
    expect(violations).toEqual([]);
    expect(families.get(D1.id)).toBe(D1);
  });

  it("declares a multiplicative crossing phase, not an additive one", () => {
    // D4's `log z ↦ log z + 2πi` is the additive case, and the tagged union exists so that writing
    // one where the other is meant cannot typecheck.
    expect(D1.branch?.crossingPhase.kind).toBe("multiplicative");
  });

  it("declares `arg z ∈ [0, 2π)` on the FACTOR — not the principal determination", () => {
    expect(D1.branch?.factors[0].argRange).toEqual(["0", "2"]);
  });
});

describe("π/sin(πα), labelled `=`", () => {
  it("prints the record's own closed form at the flagship fixture", () => {
    const { solved: s } = solved();
    expect(s.text).toBe("π/sin(3π/10)");
    expect(s.form.sine?.toNumber()).toBeCloseTo(0.3, 15);
  });

  it("matches every one of the five fixtures, in FORM and in value", () => {
    // `pi/sin(pi*alpha)`, `pi`, `pi/sin(3*pi/4)`, `pi/sin(pi/10)`, `pi/sin(9*pi/10)` — and at
    // α = 1/2 the sine is identically 1, so the record states the value as plain `pi` and so does
    // the engine.
    const expected = ["π/sin(3π/10)", "π", "π/sin(3π/4)", "π/sin(π/10)", "π/sin(9π/10)"];
    D1.golden.forEach((g, k) => {
      const { solved: s } = solved(g);
      expect(s.text).toBe(expected[k]);
      expect(s.value).toBeCloseTo(real(g.numeric), 11);
    });
  });

  it("carries the sine rather than evaluating it: the exponent is exact", () => {
    for (const g of D1.golden) {
      const { solved: s } = solved(g);
      if (s.form.sine === undefined) continue;
      // The sine's argument is `πα` on the nose — a ratio of small integers, not a nearby float.
      expect(s.form.sine.d).toBeLessThanOrEqual(10n);
      expect(s.form.sine.toNumber()).toBeCloseTo(Number(g.params.alpha), 15);
    }
  });

  it("is labelled `=` by a computed verdict", () => {
    const { solved: s } = solved();
    const exact = s.certificates.filter((c) => c.level === "=");
    expect(exact.length).toBeGreaterThan(0);
    expect(s.certificates.every((c) => c.level !== "⚠")).toBe(true);
  });
});

describe("the keyhole's four pieces", () => {
  it("are a closed loop whose winding about the BRANCH POINT is zero", () => {
    // `+1` from the outer circle and `−1` from the inner. This is why the contour is a loop in ℂ∖Γ
    // at all, and it is decided exactly.
    const r = runFamily(D1, flagship);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run.resolved).toHaveLength(4);
    expect(windingNumber(r.run.resolved, [0, 0]).n).toBe(0);
    expect(windingNumber(r.run.resolved, [0, 0]).decided).toBe(true);
  });

  it("enclose the single pole at z = −1 exactly once", () => {
    const r = runFamily(D1, flagship);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(windingNumber(r.run.resolved, [-1, 0]).n).toBe(1);
    // And the branch point is NOT among the poles: `z^{α−1}` has no Laurent series at the origin.
    expect(r.run.poles.poles.map((p) => p.at[0])).toEqual([-1]);
  });

  it("pass LEGALITY with both lips declaring their side", () => {
    const r = runFamily(D1, flagship);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const legality = r.run.ledger.rows.filter((x) => x.constraint === "LEGALITY");
    expect(legality.every((x) => x.status === "satisfied")).toBe(true);
    expect(r.run.ledger.failedAt).toBeNull();
  });

  it("close the argument", () => {
    const r = runFamily(D1, flagship);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run.ledger.closes).toBe(true);
    expect(r.run.ledger.rows.every((x) => x.status !== "failed")).toBe(true);
  });
});

describe("the (1 − e^{2πiα}) factor", () => {
  it("is what multiplies the unknown, and it is not 1", () => {
    // The lower edge is the target times `−e^{2πi(α−1)}`, so the two edges together give
    // `1 − e^{2πiα}`. A solve that ignored the `reproduces` role would divide by 1 and be wrong by
    // exactly that factor.
    const { run } = solved();
    const lower = run.family.contour.pieces.find((p) => p.id === "lower");
    expect(lower?.role).toBe("reproduces");
    expect(lower?.coefficients?.[0].coefficient).toBe("-exp(2*pi*i*(alpha-1))");
  });

  it("keeps the minus sign that carries the reversal", () => {
    // `traps.missing-reversal-sign`: dropping it turns `1 − e^{2πiα}` into `1 + e^{2πiα}` and
    // produces π/tan-shaped nonsense that is finite and plausible-looking. So: the engine on the
    // record's factor, against the engine on the trap's.
    const wrong: Family = {
      ...D1,
      contour: {
        ...D1.contour,
        pieces: D1.contour.pieces.map((p) =>
          p.id === "lower"
            ? { ...p, coefficients: [{ targetId: "I", coefficient: "exp(2*pi*i*(alpha-1))" }] }
            : p,
        ),
      },
    };
    const r = solveFamily(wrong, flagship);
    // It does not refuse — that is the danger — but it does not give the right answer either.
    if (r.ok) expect(Math.abs(r.solved.value - real(flagship.numeric))).toBeGreaterThan(1);
  });
});

describe("a certified bound on each vanishing arc", () => {
  it("discharges both circles, each with a `≤` certificate", () => {
    const { run } = solved();
    const kill = run.ledger.rows.filter((x) => x.constraint === "KILL");
    for (const id of ["outer", "inner"]) {
      const row = kill.find((x) => x.pieceId === id);
      expect(row?.status).toBe("satisfied");
      expect(row?.evidence.level).toBe("≤");
      expect(row?.claim).toMatch(/→ 0 as/);
    }
  });

  it("spends α < 1 on the outer circle and α > 0 on the inner", () => {
    // `traps.circles-asserted-not-proved`: "the bounds are the content of the theorem, not
    // preamble". Each row names the exponent whose sign discharges it.
    const { run } = solved();
    const kill = run.ledger.rows.filter((x) => x.constraint === "KILL");
    expect(kill.find((x) => x.pieceId === "outer")?.claim).toMatch(/O\(ρ\^\(-7\/10\)\)/);
    expect(kill.find((x) => x.pieceId === "inner")?.claim).toMatch(/O\(ρ\^\(3\/10\)\)/);
  });

  it("says in its own audit trail that ρ^α is the one float in the chain", () => {
    const { run } = solved();
    const outer = run.ledger.rows.find((x) => x.pieceId === "outer");
    expect(outer?.evidence.provenance.some((st) => !st.ok && /irrational power/.test(st.text))).toBe(
      true,
    );
  });
});

describe("and no quadrature pretends to corroborate it", () => {
  it("skips the quadrature, saying why", () => {
    // Sampling `z^{α−1}` needs a determination, and a compiled evaluator uses the principal one —
    // which for this contour makes the two lips cancel and answers a different question. A
    // cross-check against a different branch is not a second opinion.
    const { run } = solved();
    expect(run.integral.quadratureSkipped).toMatch(/multivalued/);
    expect(run.theorem.crossCheck).toBeUndefined();
    expect(run.theorem.agrees).toBeUndefined();
  });

  it("does not let the skip read as a refusal — LEGALITY is untouched", () => {
    const { run } = solved();
    expect(run.integral.refusal).toBeUndefined();
    expect(run.ledger.failedAt).toBeNull();
  });

  it("still reports ∮ exactly, from the residue theorem", () => {
    const { run } = solved();
    expect(run.theorem.exactValue).toBeDefined();
    // `2πi·(−1)^{α−1}` at α = 3/10 has modulus 2π.
    const v = run.theorem.exactValue;
    expect(Math.hypot(v?.value[0] ?? 0, v?.value[1] ?? 0)).toBeCloseTo(2 * Math.PI, 9);
  });
});

describe("the wrong argRange is a DIVISION BY ZERO, and the app never prints 0", () => {
  const principal = (): Family => ({
    ...D1,
    branch: {
      ...(D1.branch as NonNullable<Family["branch"]>),
      factors: [{ ...(D1.branch as NonNullable<Family["branch"]>).factors[0], argRange: ["-1", "1"] }],
    },
  });

  it("refuses at the principal determination rather than answering", () => {
    // THE CUT MOVES WITH THE DETERMINATION. `arg ∈ (−π, π]` puts it on ℝ₋, straight through the
    // keyhole's two circles, which carry no `side` tag — and the record names that as the second of
    // three things that go wrong. It is the earliest one this engine can see, so it is what gets
    // reported.
    const r = solveFamily(principal(), flagship);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/LEGALITY refuses/);
    expect(r.reason).toMatch(/crosses the cut/);
    // The run still comes back, so a caller can show the ledger and the contour rather than blanking
    // a record that mostly works.
    expect(r.run?.ledger.failedAt).toBe("LEGALITY");
  });

  it("would otherwise have answered — with a COMPLEX number for a real integral", () => {
    // What the LEGALITY gate is stopping. Pass 5 reads the residue sum and the piece limits and
    // knows nothing about whether the contour was legal; with the pole's argument taken as −π the
    // solve is perfectly confident and its answer is not even real.
    const r = runFamily(principal(), flagship);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.run.ledger.failedAt).toBe("LEGALITY");
    expect(r.run.theorem.piUnits).toBeDefined();
  });

  it("refuses at integer α, where the two edges genuinely cancel", () => {
    // `1 + Σcⱼ = 1 − e^{2πi·1} = 0` EXACTLY: the two exponents are equal, so the normal form
    // combines them and the coefficient is zero rather than nearly zero.
    const r = solveFamily(D1, {
      ...flagship,
      params: { alpha: 1 },
      value: "—",
      numeric: 0,
      verifiedTo: 1,
      method: "the degenerate case, not a golden value",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/carries no information about the target|same phase, so they cancel/);
    // The classical symptom is "the integral collapses to 0"; what is reported is a vanished
    // DENOMINATOR, and no number at all.
    expect(r.reason).not.toMatch(/= 0$/);
  });
});
