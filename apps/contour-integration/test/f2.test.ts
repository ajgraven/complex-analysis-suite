// F2, end to end — the twenty-eighth record, and the one that exists for its ARC BOUND.
//
// `|e^{−z²}| = e^{−R²cos 2θ}` tends to 1, not 0, as `θ → π/4`, so the plain ML bound on the sector
// arc is `(πR/4)·1 → ∞` and establishes nothing. Every textbook treatment of the Fresnel integrals
// waves at this step; the record's job is to discharge it. Nothing new was needed — M5.2 built
// `linearMinorant.ts` as the single predicate L3 and L6 share, two slices before its consumer
// existed, and this is the consumer.
import { describe, expect, it } from "vitest";
import { C } from "@cas/expr";
import { f2WedgeFresnel as F2 } from "../src/families/records/f2-wedge-fresnel.js";
import { e3GaussianShiftZeroResidue as E3 } from "../src/families/records/e3-gaussian-shift-zero-residue.js";
import { solveFamily } from "../src/families/runFamily.js";
import { FAMILIES, loadFamilies } from "../src/families/index.js";

const solved = (n: number, geometry?: Record<string, number>) => {
  const g = F2.golden.find((x) => x.params.n === n);
  if (g === undefined) throw new Error(`F2 has no fixture at n = ${n}`);
  const r = solveFamily(F2, g, geometry === undefined ? {} : { geometry });
  if (!r.ok) throw new Error(`F2 refused at n = ${n}: ${r.reason}`);
  if (r.route !== "imported") throw new Error(`F2 took the ${r.route} route`);
  return r;
};
const by = (r: ReturnType<typeof solved>, id: string): number =>
  r.imported.solved.find((x) => x.targetId === id)?.value ?? Number.NaN;

describe("the gallery is complete", () => {
  it("loads all 28 records, with no violations", () => {
    const loaded = loadFamilies(FAMILIES);
    expect(loaded.violations.map((v) => `${v.family} ${v.invariant}: ${v.message}`)).toEqual([]);
    expect(FAMILIES).toHaveLength(28);
  });
});

describe("one contour, both real integrals", () => {
  it("gives C = S at n = 2 — and that is a COINCIDENCE of the angle", () => {
    // `∫cos(xⁿ)` and `∫sin(xⁿ)` are `Γ(1+1/n)cos(π/(2n))` and `Γ(1+1/n)sin(π/(2n))`, equal iff
    // `n = 2`. The record determines BOTH, so the famous equality is something the app can compare
    // rather than assert — and §10.3's `cos-equals-sin-only-at-n-2` invariant has a `differ` half
    // that could not be run until this record existed.
    const two = solved(2);
    expect(by(two, "C")).toBeCloseTo(Math.sqrt(Math.PI / 8), 13);
    expect(by(two, "S")).toBeCloseTo(Math.sqrt(Math.PI / 8), 13);
    expect(by(two, "C")).toBeCloseTo(by(two, "S"), 14);

    const three = solved(3);
    expect(by(three, "C")).toBeCloseTo(0.77334294207799015, 12);
    expect(by(three, "S")).toBeCloseTo(0.44648975578462446, 12);
    expect(Math.abs(by(three, "C") - by(three, "S"))).toBeGreaterThan(0.3);
  });

  it("carries both closed forms exactly, through a representable root of unity", () => {
    expect(solved(2).solved.text).toBe("√2/4·√π");
    const three = solved(3);
    expect(three.imported.solved.find((x) => x.targetId === "C")?.text).toBe("√3/2·Γ(4/3)");
    expect(three.imported.solved.find((x) => x.targetId === "S")?.text).toBe("1/2·Γ(4/3)");
  });

  it("has modulus exactly Γ(1+1/n) — the wedge ROTATES a known real integral", () => {
    for (const n of [2, 3]) {
      const r = solved(n);
      expect(Math.hypot(by(r, "C"), by(r, "S"))).toBeCloseTo(C.gamma([1 + 1 / n, 0])[0], 12);
    }
  });
});

describe("the arc bound, discharged", () => {
  it("is loose by exactly π/2, and that factor IS the minorant's slack at the origin", () => {
    // The arc integral is asymptotically `1/(n R^{n−1})` — measured `|arc|·n·R^{n−1}` = 0.9976,
    // 0.9995, 0.9999 at R = 4, 6, 10 — and the certified bound is `π/(2n R^{n−1})`, so the ratio is
    // `2/π` at both `n`. That is not a coincidence to record but the inequality's own slack: near
    // `θ = 0` the true `sin(nθ) ≈ nθ` while the minorant only claims `≥ 2nθ/π`, so the majorant's
    // exponent is smaller by exactly that factor and its integral larger by `π/2`.
    for (const n of [2, 3]) {
      const ratios = [4, 6, 10].map((R) => {
        const r = solved(n, { R });
        const bound = Number(/\\le ([0-9.e+-]+)\$/.exec(
          r.run.ledger.rows.find((x) => x.pieceId === "arc")?.claim ?? "",
        )?.[1]);
        const arc = r.run.integral.pieces[1].value;
        const measured = Math.hypot(arc[0], arc[1]);
        expect(measured, `n = ${n}, R = ${R}`).toBeLessThan(bound);
        // The asymptotic form itself, before the ratio: `|arc| · n · R^{n−1} → 1`.
        expect(measured * n * R ** (n - 1), `n = ${n}, R = ${R}`).toBeCloseTo(1, 2);
        return measured / bound;
      });
      for (const r of ratios) expect(Math.abs(r - 2 / Math.PI), `n = ${n}`).toBeLessThan(0.01);
      // And it CONVERGES onto 2/π rather than sitting near it — the remainder is the next term of
      // the expansion, not a tolerance.
      expect(Math.abs(ratios[2] - 2 / Math.PI)).toBeLessThan(Math.abs(ratios[0] - 2 / Math.PI) / 5);
    }
  });

  it("is `≤` on the bound and discharges the limit, on the DECLARED L6", () => {
    const row = solved(2).run.ledger.rows.find((x) => x.pieceId === "arc");
    expect(row?.status).toBe("satisfied");
    expect(row?.evidence.level).toBe("≤");
    expect(row?.claim).toContain("\\to 0$ as $R \\to \\infty");
    expect(F2.vanishingLemmas[0].lemma).toBe("L6");
    // D-1: the admissible range is `π/(2n)` and not `π/n`, which the record declares as geometry
    // rather than as prose — `n·wedgeAngle = π/2` exactly.
    const angle = F2.contour.derived?.find((d) => d.name === "wedgeAngle");
    expect(angle?.expr).toBe("pi/(2*n)");
  });
});

describe("the conditional convergence, made arithmetic", () => {
  it("the gap between the partial integral and the answer IS the arc", () => {
    // `ray0 + arc + ray1 = 0` and the exact `ray1` is `−T`, so `ray0 − T = −arc`. That identity is
    // what makes a conditionally convergent integral computable: the arc bound is a bound on the
    // truncation error, and without it `∫₀^R` at finite `R` is a number with no error attached.
    //
    // It holds up to ONE thing, and the ledger already reports it: the quadrature of `ray1` is
    // `∫₀^R e^{−t²}dt`, not `∫₀^∞`, so the residual is the return ray's own tail. Tying the two
    // numbers together is a stronger statement than a tolerance would be.
    for (const R of [4, 6, 10]) {
      const r = solved(2, { R });
      const ray0 = r.run.integral.pieces[0].value;
      const arc = r.run.integral.pieces[1].value;
      const gap = Math.hypot(ray0[0] - by(r, "C"), ray0[1] - by(r, "S"));
      const tail = Number(
        /is ([0-9.e+-]+) away/.exec(
          r.run.ledger.rows
            .find((x) => x.pieceId === "ray1")
            ?.evidence.provenance.find((p) => p.text.includes("independent check"))?.text ?? "",
        )?.[1],
      );
      expect(Math.abs(gap - Math.hypot(arc[0], arc[1])), `R = ${R}`).toBeLessThan(tail + 1e-12);
    }
  });

  it("the partial integral SPIRALS onto its limit rather than approaching it", () => {
    // `∫₀^∞|cos(x²)|dx = ∞`, and this is what that looks like arithmetically. One integration by
    // parts gives `∫_R^∞ e^{ix²}dx = i·e^{iR²}/(2R) + O(R⁻²)`, so the partial integral's error is
    // `−i·e^{iR²}/(2R) = (sin R², −cos R²)/(2R)`: envelope `1/(2R)`, phase `R²`. The distance shrinks
    // while the DIRECTION keeps turning, and no component settles. Measured `|error|·2R` = 0.9976,
    // 0.9995, 0.9999, 1.0000 at R = 4, 6, 10, 20.
    const limit = Math.sqrt(Math.PI / 8);
    const answers = new Set<number>();
    const envelopes: number[] = [];
    for (const R of [4, 6, 10, 20]) {
      const r = solved(2, { R });
      const [x, y] = r.run.integral.pieces[0].value;
      const ex = x - limit;
      const ey = y - limit;
      envelopes.push(Math.hypot(ex, ey) * 2 * R);
      // The PHASE, not just the size — and the residual is the next term, so the tolerance falls
      // like `R⁻³` rather than being a fixed slack.
      expect(Math.abs(ex - Math.sin(R * R) / (2 * R)), `Re at R = ${R}`).toBeLessThan(1 / R ** 3);
      expect(Math.abs(ey + Math.cos(R * R) / (2 * R)), `Im at R = ${R}`).toBeLessThan(1 / R ** 3);
      answers.add(by(r, "C"));
    }
    // The ANSWER comes from the import and a vanishing arc, so it does not depend on R at all —
    // one value across four radii, bit for bit, while the piece it is read from never settles.
    expect(answers.size).toBe(1);
    for (const e of envelopes) expect(e).toBeCloseTo(1, 2);
    expect(envelopes[3]).toBeGreaterThan(envelopes[0]);
    // And the record says so, on both unknowns.
    expect(F2.targets.map((t) => t.convergence)).toEqual(["conditional", "conditional"]);
  });
});

describe("the import", () => {
  it("is Γ(1+1/n), checked against ∫₀^∞e^{−tⁿ}dt by the contour's own quadrature", () => {
    const step = solved(2).run.ledger.rows
      .find((x) => x.pieceId === "ray1")
      ?.evidence.provenance.find((p) => p.text.includes("independent check"));
    expect(step?.ok).toBe(true);
  });

  it("is E3's OWN atom at n = 2, which is why the closed set has one entry", () => {
    // `Γ(3/2) = √π/2`, so F2 at `n = 2` and E3 import the same number by two different methods —
    // polar coordinates and the substitution `u = tⁿ`. The engine reaches one atom for both.
    const f2 = solved(2).imported.imports[0].value.atom;
    const e3 = solveFamily(E3, E3.golden[0]);
    // **The ROUTE is asserted, not assumed.** It used to be an early return beside an asserted
    // `ok`, so an E3 that stopped importing would have made the comparison below pass by never
    // happening — which is the one thing this test exists to do.
    expect(`${e3.ok}/${e3.ok ? e3.route : "-"}`).toBe("true/imported");
    if (!e3.ok || e3.route !== "imported") return;
    expect(f2.id).toBe(e3.imported.imports[0].value.atom.id);
    expect(f2.text).toBe("√π");
    // At n = 3 it is a different transcendental, and the app says so rather than evaluating it.
    expect(solved(3).imported.imports[0].value.atom.text).toBe("Γ(4/3)");
  });

  it("declares every trap the gallery lists", () => {
    expect(F2.traps.map((t) => t.id)).toEqual([
      "arc-bound-hand-waved",
      "arc-range-too-large",
      "absolute-convergence-assumed",
      "gamma-claimed-as-contour-output",
      "residues-expected",
      "cos-equals-sin-assumed-general",
    ]);
  });
});
