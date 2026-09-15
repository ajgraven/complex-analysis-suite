// ADR-0042's import — the closed set, the walk that finds it, and the solve that never inverts it.
//
// What these tests are FOR, stated once: an imported value is the only number in this app that is
// not computed from anything, so the usual evidence (two routes sharing no arithmetic) has to be
// assembled deliberately. It is, three ways — the half-integer reduction against the Lanczos series,
// the Lanczos series against the defining integral by quadrature, and the assembled value against
// the contour piece's own Gauss–Legendre panel.
import { describe, expect, it } from "vitest";
import { Frac, SqrtExt } from "@cas/exact";
import { C, parse } from "@cas/expr";
import { ExpSum } from "../src/kernel/expSum.js";
import { Exponent } from "../src/kernel/exponent.js";
import { gammaImport, gaussianMomentByQuadrature, IMPORTS } from "../src/kernel/imported.js";
import { importedValue } from "../src/families/importedValue.js";
import {
  resolveImports,
  solveImported,
  type ImportedSolveInputs,
} from "../src/families/solveImported.js";
import { solveFamily } from "../src/families/runFamily.js";
import { loadFamilies } from "../src/families/index.js";
import { importedRecord } from "./helpers/importedRecord.js";

const frac = (n: bigint, d: bigint): Frac => Frac.of(n, d);
const ONE = ExpSum.of(SqrtExt.ONE, Exponent.ZERO);

/** The record's imports, resolved at its flagship binding — what `runFamily` hands Pass 5. */
function resolved(family: Parameters<typeof solveImported>[0]): ImportedSolveInputs["imports"] {
  const got = resolveImports(family, family.golden[0].params);
  if (!got.ok) throw new Error(got.reason);
  return got.imports;
}

describe("the closed set of imports", () => {
  it("is one entry, and it is the Gamma function", () => {
    // Not decoration: E3's record says `√π` IS `Γ(1/2)` ("a polar-coordinates fact"), so the two
    // records that need an import name the SAME function — which is what lets one independent check
    // below cover both.
    expect(IMPORTS).toHaveLength(1);
    expect(IMPORTS[0].spelling).toContain("sqrt(pi)");
  });

  it("reduces a positive half-integer to an exact rational multiple of √π", () => {
    // Γ(k+½) = (2k)!/(4^k k!)·√π — 1, ½, ¾, 15/8 at k = 0…3, by the recurrence rather than a
    // transcribed formula.
    const expected: [bigint, bigint, bigint][] = [
      [1n, 2n, 1n], // Γ(1/2) = 1·√π
      [3n, 2n, 1n], // Γ(3/2) = (1/2)√π
      [5n, 2n, 3n], // Γ(5/2) = (3/4)√π
      [7n, 2n, 15n], // Γ(7/2) = (15/8)√π
    ];
    for (const [n, d, num] of expected) {
      const got = gammaImport(frac(n, d));
      expect(got, `Γ(${n}/${d})`).not.toBeNull();
      if (got === null) continue;
      expect(got.atom.id).toBe("sqrt(pi)");
      expect(got.atom.text).toBe("√π");
      expect(got.multiple.n).toBe(num);
      // The reduction against an INDEPENDENT evaluation: Lanczos, which shares no arithmetic with a
      // rational recurrence over `Math.sqrt(Math.PI)`.
      const closed = got.multiple.toNumber() * got.atom.numeric;
      expect(Math.abs(closed - C.gamma([Number(n) / Number(d), 0])[0]) / closed).toBeLessThan(1e-14);
    }
  });

  it("refuses everything at or below zero — poles AND the reflection", () => {
    for (const q of [0n, -1n, -2n, -7n]) expect(gammaImport(frac(q, 1n)), `Γ(${q})`).toBeNull();
    // **A NEGATIVE HALF-INTEGER IS A REAL VALUE AND STILL REFUSED**, which a mutation sweep is why:
    // relaxing the sign guard made `Γ(−1/2)` return `1·√π` where the answer is `−2√π`, because the
    // recurrence loop runs zero times at a negative `k`. `Γ(1/2 − k) = (−4)^k k!/(2k)! √π` is four
    // lines nobody needs — refusing is honest, and a wrong number is not.
    for (const q of [-1n, -3n, -5n]) expect(gammaImport(frac(q, 2n)), `Γ(${q}/2)`).toBeNull();
    // A positive integer is NOT a pole, and is carried as its own symbol rather than as a factorial:
    // nothing in the corpus reaches it, and inventing a reduction for it would be a branch no record
    // exercises.
    expect(gammaImport(frac(3n, 1n))?.atom.text).toBe("Γ(3)");
  });

  it("carries anything else as its own symbol, not as a decimal", () => {
    const g = gammaImport(frac(4n, 3n));
    expect(g?.atom.text).toBe("Γ(4/3)");
    expect(g?.multiple.equals(Frac.ONE)).toBe(true);
    expect(g?.atom.numeric).toBeCloseTo(0.892979511569249, 14);
    // Distinct transcendentals get distinct ids, which is what stops a solve adding them.
    expect(gammaImport(frac(5n, 4n))?.atom.id).not.toBe(g?.atom.id);
  });

  it("is checked against the integral its own method names", () => {
    // F2's `method` is the real substitution u = tⁿ, and this is that integral. The check covers E3
    // too: Γ(1/2) = 2Γ(3/2) = 2∫₀^∞e^{−t²}dt = √π, one number reached two ways.
    for (const n of [2, 3, 4]) {
      const quad = gaussianMomentByQuadrature(n);
      const symbol = gammaImport(frac(BigInt(n + 1), BigInt(n)));
      expect(symbol).not.toBeNull();
      if (symbol === null) continue;
      const value = symbol.multiple.toNumber() * symbol.atom.numeric;
      expect(Math.abs(quad - value) / value, `n = ${n}`).toBeLessThan(1e-12);
    }
    expect(Math.abs(2 * gaussianMomentByQuadrature(2) - Math.sqrt(Math.PI))).toBeLessThan(1e-12);
  });
});

describe("splitting a knownValue into (import) × (what the contour derived)", () => {
  it("reads E3's top side", () => {
    const got = importedValue(parse("-sqrt(pi)*exp(-b^2/4)"), { b: 1.7 });
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value.atom.id).toBe("sqrt(pi)");
    expect(got.value.numeric[0]).toBeCloseTo(-0.860591739572556, 12);
    expect(got.value.numeric[1]).toBe(0);
  });

  it("reads F2's return ray, and the atom depends on n", () => {
    const two = importedValue(parse("-exp(i*pi/(2*n))*gamma(1 + 1/n)"), { n: 2 });
    expect(two.ok).toBe(true);
    if (!two.ok) return;
    // Γ(3/2) is a half-integer, so at n = 2 F2's import IS E3's atom.
    expect(two.value.atom.id).toBe("sqrt(pi)");
    expect(two.value.numeric[0]).toBeCloseTo(-0.6266570686577501, 12);
    expect(two.value.numeric[1]).toBeCloseTo(-0.6266570686577501, 12);

    const three = importedValue(parse("-exp(i*pi/(2*n))*gamma(1 + 1/n)"), { n: 3 });
    expect(three.ok).toBe(true);
    if (!three.ok) return;
    expect(three.value.atom.text).toBe("Γ(4/3)");
  });

  it("distinguishes √π from any other radical, on the ARGUMENT and not the function name", () => {
    // `gamma(3/2)` is the same import written the other way, and the half-integer reduction reaches
    // the coefficient: `Γ(3/2) = (1/2)√π`.
    const half = importedValue(parse("gamma(3/2)"), {});
    expect(half.ok).toBe(true);
    if (half.ok) {
      expect(half.value.atom.id).toBe("sqrt(pi)");
      expect(half.value.coefficient.toTuple()[0]).toBeCloseTo(0.5, 15);
    }
    // `sqrt(2)` is not an import at all — it is an algebraic number — so the walk reports the schema
    // fact rather than reaching for a Γ. (It is also outside `exactBasisConstant`'s reach, which no
    // record needs: E3 spells its radical `sqrt(pi)` and F2 has none. ADR-0007's posture — the day a
    // record needs `√2` in a coefficient is the day to widen the walker.)
    //
    // **ONE RECOGNISER DECIDES THIS, and a sweep is why.** Relaxing the `sqrt(pi)` guard in the
    // reader alone left the scanner still refusing at the gate, so the corpus stayed green while
    // `sqrt(2)` had quietly become `√π` inside a larger product; `importSpelling` is now the single
    // place, so this assertion covers both halves.
    const algebraic = importedValue(parse("sqrt(2)"), {});
    expect(algebraic.ok).toBe(false);
    if (!algebraic.ok) expect(algebraic.reason).toMatch(/names no imported constant/);
    // The same question inside a product that DOES name an import: `√2` must still not become an atom.
    const mixed = importedValue(parse("sqrt(2)*gamma(3/2)"), {});
    expect(mixed.ok).toBe(false);
    if (!mixed.ok) expect(mixed.reason).not.toMatch(/rank-2/);
  });

  it("refuses what takes it outside the module, each by name", () => {
    const cases: [string, Record<string, number>, RegExp][] = [
      ["sqrt(pi)*gamma(4/3)", {}, /rank-2 module/],
      ["1/sqrt(pi)", {}, /no inverse here/],
      ["exp(sqrt(pi))", {}, /no inverse here/],
      ["2*exp(-1)", {}, /names no imported constant/],
      ["gamma(i)", {}, /RATIONAL argument/],
      ["gamma(0)", {}, /pole/],
    ];
    for (const [src, bindings, why] of cases) {
      const got = importedValue(parse(src), bindings);
      expect(got.ok, src).toBe(false);
      if (got.ok) continue;
      expect(got.reason, src).toMatch(why);
    }
  });
});

describe("Pass 5's fourth route", () => {
  it("solves a contour that encloses nothing and closes on one import", () => {
    const family = importedRecord();
    const solved = solveFamily(family, family.golden[0], { geometry: { R: 8 } });
    expect(solved.ok).toBe(true);
    if (!solved.ok || solved.route !== "imported") {
      expect.fail(solved.ok ? `route ${solved.route}` : solved.reason);
      return;
    }
    expect(solved.solved.value).toBeCloseTo(0.86059173957255597, 12);
    expect(solved.solved.text).toContain("√π");
  });

  it("determines BOTH unknowns of one complex identity, and the odd one is exactly zero", () => {
    // The bottom side is `∫ℝe^{−x²}e^{ibx}dx = C + iS`, so the realified system is the 2×2 identity:
    // `C` off the real row and `S` off the imaginary one. `S = 0` is the oddness of `e^{−x²}sin(bx)`
    // arriving as arithmetic rather than as a hypothesis nobody checked.
    const family = importedRecord({ second: true });
    const solved = solveFamily(family, family.golden[0], { geometry: { R: 8 } });
    expect(solved.ok).toBe(true);
    if (!solved.ok || solved.route !== "imported") {
      expect.fail(solved.ok ? `route ${solved.route}` : solved.reason);
      return;
    }
    const byId = new Map(solved.imported.solved.map((x) => [x.targetId, x]));
    expect(byId.get("C")?.value).toBeCloseTo(0.86059173957255597, 12);
    expect(byId.get("S")?.value).toBe(0);
    expect(byId.get("S")?.text).toBe("0");
  });

  it("gives the imported piece an EXACT ledger row, not the quadrature's", () => {
    // The whole of ADR-0042 in one assertion. `free` takes the quadrature's certificate, which is
    // `≈`, so before this the ledger capped an argument whose every other step was exact — entire
    // integrand, both verticals certified dead, `∮ = 0` — at its most certain step.
    const family = importedRecord();
    const solved = solveFamily(family, family.golden[0], { geometry: { R: 8 } });
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;
    const row = solved.run.ledger.rows.find((r) => r.pieceId === "top");
    expect(row?.evidence.level).toBe("=");
    expect(row?.claim).toContain("a known integral, not derived here");
    // The LEDGER's verdict stays `≤`, and correctly: the two verticals' finite-R ML bounds are
    // one-sided, exactly as E1's and every other ML-killed record's are. What the import fixes is
    // this piece's own row, which is what Pass 5 and the answer's verdict read.
    expect(solved.run.ledger.verdict.level).toBe("≤");
  });

  it("checks the import against the contour's own quadrature, and the gap is the tail", () => {
    const gapOf = (R: number): number => {
      const family = importedRecord();
      const solved = solveFamily(family, family.golden[0], { geometry: { R } });
      if (!solved.ok) return Number.NaN;
      const step = solved.run.ledger.rows
        .find((r) => r.pieceId === "top")
        ?.evidence.provenance.find((p: { ok: boolean; text: string }) => p.text.includes("an independent check"));
      return Number(/is ([0-9.e+-]+) away/.exec(step?.text ?? "")?.[1] ?? Number.NaN);
    };
    // `∫ℝ` against `∫₋R^R` — the gap IS the tail, so it must fall with R rather than sit at a
    // tolerance. Measured 1.3e-8 → 1.4e-13 as R goes 4 → 8.
    const gaps = [gapOf(4), gapOf(8)];
    expect(gaps[0]).toBeLessThan(1e-7);
    expect(gaps[1]).toBeLessThan(1e-11);
    expect(gaps[1]).toBeLessThan(gaps[0] / 1000);
  });

  it("catches a knownValue that is wrong, with a ✗ the reader can see", () => {
    // E3's `expr` with the `e^{−b²/4}` dropped: still an import, still exactly `√π`, and not the
    // value of that piece. Nothing symbolic can tell — only the quadrature can.
    const family = importedRecord({ known: "-sqrt(pi)" });
    const solved = solveFamily(family, family.golden[0], { geometry: { R: 8 } });
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;
    const step = solved.run.ledger.rows
      .find((r) => r.pieceId === "top")
      ?.evidence.provenance.find((p: { ok: boolean; text: string }) => p.text.includes("an independent check"));
    expect(step?.ok).toBe(false);
    expect(step?.text).toMatch(/9\.[0-9]+e-1 away/);
  });

  it("carries F2's rotation exactly when the root of unity is representable, and not otherwise", () => {
    // ALGEBRA ONLY — no `pieceQuadratures`, because this fixture's geometry is not F2's wedge and a
    // cross-check against the wrong contour would be evidence about nothing. What is under test is
    // that `e^{iπ/(2n)}` reaches the coefficient, which is what makes `√(π/8)` a closed form.
    const representable = importedRecord({ second: true, known: "-exp(i*pi/4)*gamma(3/2)" });
    const got = solveImported(representable, {
      closedContourPiUnits: ExpSum.ZERO,
      pieceLimits: [],
      imports: resolved(representable),
    });
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    for (const answer of got.result.solved) {
      expect(answer.value).toBeCloseTo(Math.sqrt(Math.PI / 8), 14);
      expect(answer.text).toBe("√2/4·√π");
    }

    // `e^{iπ/10}` needs ℚ(ζ₂₀), degree 4 over ℚ — outside this basis. The decimal stands and the
    // certificate says why, which is the same posture `solveTarget` takes about B3.
    const beyond = importedRecord({ second: true, known: "-exp(i*pi/10)*gamma(6/5)" });
    const wide = solveImported(beyond, {
      closedContourPiUnits: ExpSum.ZERO,
      pieceLimits: [],
      imports: resolved(beyond),
    });
    expect(wide.ok).toBe(true);
    if (!wide.ok) return;
    const gamma = C.gamma([1.2, 0])[0];
    expect(wide.result.solved[0].text).toBeUndefined();
    expect(wide.result.solved[0].value).toBeCloseTo(Math.cos(Math.PI / 10) * gamma, 12);
    expect(wide.result.solved[1].value).toBeCloseTo(Math.sin(Math.PI / 10) * gamma, 12);
    expect(wide.result.certificates.some((c) => c.level === "?")).toBe(true);
  });

  it("refuses two DIFFERENT imported constants — a rank-2 module", () => {
    // Every real record has exactly one import, so the comparison only runs from the second entry
    // onward and nothing in the corpus reaches it. A sweep found the branch unexercised: inverting
    // the test left every test green.
    const family = importedRecord({ twoAtoms: true });
    const got = solveImported(family, {
      closedContourPiUnits: ExpSum.ZERO,
      pieceLimits: [],
      imports: resolved(family),
    });
    expect(got.ok).toBe(false);
    if (!got.ok) {
      expect(got.reason).toMatch(/two different imported constants/);
      expect(got.reason).toMatch(/√π/);
      expect(got.reason).toMatch(/Γ\(4\/3\)/);
    }
  });

  it("refuses to add π to √π, on either side of the identity", () => {
    const family = importedRecord();
    const nonZero = solveImported(family, {
      closedContourPiUnits: ONE,
      pieceLimits: [],
      imports: resolved(family),
    });
    expect(nonZero.ok).toBe(false);
    if (!nonZero.ok) expect(nonZero.reason).toMatch(/no ring in this app holds both/);

    const limit = solveImported(family, {
      closedContourPiUnits: ExpSum.ZERO,
      pieceLimits: [{ pieceId: "right", contribution: ONE }],
      imports: resolved(family),
    });
    expect(limit.ok).toBe(false);
    if (!limit.ok) expect(limit.reason).toMatch(/'right'.*no ring in this app holds both/);
  });
});

describe("the loader's guards on an import", () => {
  const violations = (family: ReturnType<typeof importedRecord>): string[] =>
    loadFamilies([family]).violations.map((v) => v.message);

  it("refuses an import on any role but 'free'", () => {
    // ADR-0042's hard case: a `knownValue` on the TARGET piece imports the answer and leaves Pass 5
    // with nothing to do.
    expect(violations(importedRecord({ onTarget: true })).join(" ")).toMatch(
      /carries a knownValue but has role 'target'/,
    );
  });

  it("requires the provenance, and requires the level to MATCH", () => {
    expect(violations(importedRecord({ method: "  " })).join(" ")).toMatch(/no method/);
    // Not a ceiling: `=` is the lattice top, so "may not exceed" would be satisfied by every level
    // and assert nothing. Under-claiming is a disagreement with the engine too.
    expect(violations(importedRecord({ rigor: "≈" })).join(" ")).toMatch(
      /declares rigor '≈', but √π is an import this app holds at '='/,
    );
    expect(violations(importedRecord())).toHaveLength(0);
  });

  it("refuses an expression that is not an import, at the record's own bindings", () => {
    expect(violations(importedRecord({ known: "2*pi" })).join(" ")).toMatch(/names no imported constant/);
    expect(violations(importedRecord({ known: "sqrt(pi" })).join(" ")).toMatch(/not a readable expression/);
  });
});
