// `∮ = 2πi[Σ_{|n|≤N} Res(K·f,n) + Σⱼ Res(K·f,zⱼ)]` — the identity, and what it refuses.
//
// The claim worth testing is not that `∮ → 0`, which is a limit no finite contour exhibits. It is
// that at the contour DRAWN the value is `2πi` times the partial sum minus the infinite one — a
// number the quadrature can be asked about independently, which is the gallery's own `closedContour`
// probe. So the tests recompute the partial sum in float, subtract the closed form from `Math.tanh`,
// and require the engine's exact value to land on it; and separately require the engine's OWN
// quadrature to agree, which is the corroboration the record carries.
import { describe, expect, it } from "vitest";
import { runFamily, type FamilyRun } from "../src/families/runFamily.js";
import { summationRecord } from "./helpers/summationRecord.js";
import { ledgerHeadline } from "../src/engine/ledger.js";
import { SUMMATION_THEOREM_IDENTITY } from "../src/engine/summationTheorem.js";

const COT_A = "pi*cot(pi*z)/(z^2+(3/4)^2)";
const A = 0.75;

function run(integrand: string, N: number): FamilyRun {
  const family = summationRecord(integrand);
  const r = runFamily(family, family.golden[0], { geometry: { N } });
  if (!r.ok) throw new Error(r.reason);
  return r.run;
}

/** `2πi[Σ_{|n|≤N} f(n) − (π/a)coth(πa)]`, in float and sharing nothing with the engine's route. */
function expected(a: number, N: number): [number, number] {
  let partial = 1 / (a * a);
  for (let n = 1; n <= N; n++) partial += 2 / (n * n + a * a);
  const inner = partial - Math.PI / a / Math.tanh(Math.PI * a);
  return [0, 2 * Math.PI * inner];
}

describe("the value at finite N is 2πi times the partial sum minus the infinite one", () => {
  it.each([4, 9, 20])("N = %i", (N) => {
    const { theorem } = run(COT_A, N);
    expect(theorem.exactValue).toBeDefined();
    const [wantRe, wantIm] = expected(A, N);
    expect(theorem.exactValue?.value[0]).toBeCloseTo(wantRe, 10);
    expect(theorem.exactValue?.value[1]).toBeCloseTo(wantIm, 10);
  });

  it("and the app's own quadrature agrees with it, which is the tier's corroboration", () => {
    for (const N of [4, 9]) {
      const { theorem } = run(COT_A, N);
      expect(theorem.agrees).toBe(true);
      expect(theorem.disagreement).toBeLessThan(1e-12);
    }
  });

  it("the value shrinks like 4π/N — the RATE, not a threshold picked to pass", () => {
    // Not a proof of the limit (a bound is), but it is the statement the argument makes, and a sign
    // error or a dropped residue would make this grow instead. The first draft asserted
    // `|∮| < 0.2` at N = 40 and went red on a correct engine: the tail is
    // `2·Σ_{n>N} 1/(n²+a²) ≈ 2/N`, so `|∮| ≈ 4π/N = 0.314` there. A guessed threshold pins nothing
    // and can only be wrong — the RATE is the content, so that is what is asserted (M5.5a, again).
    const widths = [4, 9, 20, 40];
    const magnitudes = widths.map((N) => {
      const got = run(COT_A, N).theorem.exactValue;
      if (got === undefined) throw new Error(`no exact value at N = ${N}`);
      return Math.hypot(...got.value);
    });
    for (let k = 1; k < magnitudes.length; k++) expect(magnitudes[k]).toBeLessThan(magnitudes[k - 1]);
    // Only the two largest: at N = 4 the asymptotic has not set in, which is itself the point.
    for (let k = 2; k < widths.length; k++) expect(magnitudes[k] * widths[k]).toBeCloseTo(4 * Math.PI, 0);
  });

  it("the TEXT is the partial sum minus the named closed form, exactly as the gallery probes it", () => {
    const { theorem } = run(COT_A, 4);
    // `Σ_{|n|≤4} 1/(n²+9/16)` over ℚ, then the infinite sum in its own named form.
    expect(theorem.exactValue?.text).toBe("2πi(56621264/14798925 − (4π/3)·coth(3π/4))");
    expect(theorem.identity).toBe(SUMMATION_THEOREM_IDENTITY);
  });

  it("the csc kernel gives the alternating sum on the same contour", () => {
    const { theorem } = run("pi*csc(pi*z)/(z^2+1)", 9);
    let partial = 1;
    for (let n = 1; n <= 9; n++) partial += (2 * (n % 2 === 0 ? 1 : -1)) / (n * n + 1);
    const inner = partial - Math.PI / Math.sinh(Math.PI);
    expect(theorem.exactValue?.value[1]).toBeCloseTo(2 * Math.PI * inner, 10);
  });
});

describe("each residue is weighted by its winding number", () => {
  /** The same square traversed CLOCKWISE: every winding becomes −1. */
  function reversed(integrand: string) {
    const family = summationRecord(integrand);
    const pieces = [...family.contour.pieces].reverse().map((piece) => ({
      ...piece,
      geom:
        piece.geom.kind === "segment"
          ? { ...piece.geom, from: piece.geom.to, to: piece.geom.from }
          : piece.geom,
    }));
    return { ...family, contour: { ...family.contour, pieces, orientation: "cw" as const } };
  }

  it("a clockwise square negates ∮ exactly — the multiply, not a sign written down once", () => {
    const ccw = run(COT_A, 4).theorem.exactValue;
    const family = reversed(COT_A);
    const cw = runFamily(family, family.golden[0], { geometry: { N: 4 } });
    expect(cw.ok).toBe(true);
    if (!cw.ok || ccw === undefined) return;
    // Refused rather than answered would also be honest; it is not what happens, so pin what does.
    const got = cw.run.theorem.exactValue;
    expect(got).toBeDefined();
    if (got === undefined) return;
    expect(got.value[0]).toBeCloseTo(-ccw.value[0], 10);
    expect(got.value[1]).toBeCloseTo(-ccw.value[1], 10);
  });

  it("and the certificate counts the poles SUMMED, not the poles listed", () => {
    // `kernelBand` is `floor(reach) + 1`, so at N = 4 the list reaches `±5` — two integers the
    // square does not enclose. They carry winding 0 and must not be counted as summed.
    const { theorem } = run(COT_A, 4);
    const claim = theorem.verdict.certificates[0]?.claim ?? "";
    expect(claim).toMatch(/Σ over 9 integer poles/);
    expect(claim).not.toMatch(/Σ over 11 integer poles/);
  });
});

describe("the ledger closes, and every row says something true", () => {
  it("closes, with the target covered as a TERM of the sum", () => {
    const { ledger } = run(COT_A, 4);
    expect(ledger.closes).toBe(true);
    expect(ledger.failedAt).toBeNull();
    expect(ledger.hasTarget).toBe(true);
    expect(ledgerHeadline(ledger)).toBe("This argument closes.");
    const cover = ledger.rows.find((row) => row.constraint === "COVER");
    expect(cover?.status).toBe("satisfied");
    expect(cover?.claim).toMatch(/S is a TERM of the residue sum/);
  });

  it("CATCH counts the cofactor's poles as well as the kernel's", () => {
    // Nine integers at half-width 4.5, plus `±(3/4)i`. `findPoles` reports NEITHER kind — it refuses
    // the whole product, not just the `cot` — so a square dragged onto `±ia` had the same "every
    // singularity is clear" that one dragged onto an integer had before M5.5b.
    const rows = run(COT_A, 4).ledger.rows.filter((row) => row.constraint === "CATCH");
    expect(rows[0]?.claim).toMatch(/^11 singularities are enclosed/);
  });

  it("and does NOT claim that no individual residue is expressible — they all are", () => {
    // That sentence belongs to the CYCLOTOMIC route, where `ℚ(ζ₁₀)` has degree 4 over ℚ and the SUM
    // needs no root. Here every residue is written down, and a row saying otherwise would be false.
    const rows = run(COT_A, 4).ledger.rows.filter((row) => row.constraint === "CATCH");
    const residues = rows[1];
    expect(residues?.status).toBe("satisfied");
    expect(residues?.claim).toMatch(/every enclosed residue is known exactly/);
    expect(residues?.claim).not.toMatch(/no individual residue/);
  });

  it("a record with no declaration gets the sandbox's COVER row, not tier G's", () => {
    const family = summationRecord(COT_A, { noTargetTerms: true });
    const r = runFamily(family, family.golden[0], { geometry: { N: 4 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cover = r.run.ledger.rows.find((row) => row.constraint === "COVER");
    expect(cover?.status).toBe("unknown");
    expect(cover?.claim).toMatch(/no piece is marked as the target/);
    // The closed-contour value is still established exactly — that is what the sandbox gets.
    expect(r.run.ledger.closes).toBe(true);
    expect(ledgerHeadline(r.run.ledger)).toBe("The closed-contour value is established exactly.");
  });
});

describe("what the identity refuses", () => {
  it("refuses a contour that does not enclose every pole of the cofactor", () => {
    // `±5i` needs half-width > 5; at N = 2 the square reaches 2.5 and the sum over ALL the
    // cofactor's poles is a statement about a contour that is not this one.
    const { theorem } = run("pi*cot(pi*z)/(z^2+25)", 2);
    expect(theorem.exactValue).toBeUndefined();
    expect(
      theorem.verdict.certificates.some((c) => /does not enclose the cofactor's pole/.test(c.method)),
    ).toBe(true);
  });

  it("…and accepts the same integrand once the contour has grown past them", () => {
    const { theorem } = run("pi*cot(pi*z)/(z^2+25)", 8);
    expect(theorem.exactValue).toBeDefined();
    expect(theorem.agrees).toBe(true);
  });

  it("refuses a collision, rather than dividing by zero at the merged pole", () => {
    // G1's shape: `1/z²` has its pole exactly where the kernel has one. M5.7's, refused by name.
    const { theorem, ledger } = run("pi*cot(pi*z)/z^2", 4);
    expect(theorem.exactValue).toBeUndefined();
    expect(ledger.closes).toBe(false);
    expect(theorem.verdict.certificates.some((c) => /MERGE/.test(c.method))).toBe(true);
  });
});
