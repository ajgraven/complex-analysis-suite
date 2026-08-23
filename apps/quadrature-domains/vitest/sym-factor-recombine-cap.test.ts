import { describe, it, expect, beforeAll } from "vitest";
import _QD from "../app/solvers/solver.mjs";

const QD = _QD as any;
let S: any, MPoly: any;

beforeAll(async () => {
  await import("../app/sym/sym-core.mjs");
  S = QD.Sym;
  MPoly = S.MPoly;
});

// WP5c (review MED / A3): Berlekamp–Zassenhaus subset recombination is worst-case exponential. A sparse
// high-degree poly like x^40 − 2 (irreducible over ℚ by Eisenstein, yet splitting into many small factors
// mod p) used to enumerate ~2^r subsets on the MAIN THREAD, freezing the Algebra tab with no cancel and no
// honest signal — the one place breaking the file's cap-and-throw discipline. The cap must (a) return
// PROMPTLY and (b) surface HONESTLY as `undetermined` (never a false `irreducible`: the swallowed-throw
// path would have wrongly certified it), naming the CAS-export escape hatch.

describe("sym-core factor — Berlekamp–Zassenhaus recombination cap", () => {
  const V = (n: string) => MPoly.variable(n);
  const I = (k: number) => MPoly.fromInt(k);

  it("x^40 − 2 returns promptly as 'undetermined' (capped), not a hang or a false 'irreducible'", () => {
    const poly = V("x").pow(40).sub(I(2));
    const t0 = Date.now();
    const fr = S.factor(poly);
    const ms = Date.now() - t0;
    expect(fr.ok).toBe(false);
    expect(fr.status).toBe("undetermined"); // a cap stopped the search — NOT a proof of irreducibility
    expect(fr.status).not.toBe("irreducible"); // the swallowed-throw bug would have wrongly claimed this
    const capText = (fr.reason || "") + " " + (fr.caps || []).map((c: any) => c.detail || c.code).join(" ");
    expect(capText).toMatch(/CAS export/i); // names the escape hatch
    expect(ms).toBeLessThan(4000); // prompt, not a multi-minute 2^r enumeration
  });

  it("a small reducible poly still factors normally (the cap doesn't over-reject)", () => {
    const fr = S.factor(V("x").pow(2).sub(I(1))); // x² − 1 = (x−1)(x+1)
    expect(fr.ok).toBe(true);
    expect(fr.factors.length).toBe(2);
  });

  it("a small ℚ(i)-irreducible poly is still PROVED irreducible (no false cap)", () => {
    const fr = S.factor(V("x").pow(2).sub(I(2))); // x² − 2 is irreducible over ℚ(i) (no √2 in ℚ(i))
    expect(fr.ok).toBe(false);
    expect(fr.status).toBe("irreducible");
    expect((fr.caps || []).length).toBe(0); // a real certificate, not a cap
  });
});
