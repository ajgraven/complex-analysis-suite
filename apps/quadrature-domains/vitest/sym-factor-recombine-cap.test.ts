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

  it("a reducible poly whose NORM has >20 modular factors still factors (no count-cap over-reject)", () => {
    // ∏ₖ(x²+k), k=1..8 — a plainly reducible degree-16 product. `_recombine` runs on the norm N = b·b̄
    // (degree 2·16 = 32), which splits into r=24 factors mod p — past the earlier RECOMBINE_MAX_FACTORS=20
    // count cap, which WRONGLY reported this trivially-reducible product as 'undetermined'. It recombines at
    // small subset sizes in well under the wall-clock budget, so it must factor cleanly. Over ℚ(i) only x²+1
    // and x²+4 split (√1, √4 ∈ ℚ ⇒ 2 linear factors each); x²+k for k∈{2,3,5,6,7,8} stays irreducible
    // (i√k ∉ ℚ(i)) ⇒ 2+2+6 = 10 factors. Guards the WP5c count-cap → deadline change.
    let P = I(1);
    for (let k = 1; k <= 8; k++) P = P.mul(V("x").pow(2).add(I(k)));
    const t0 = Date.now();
    const fr = S.factor(P);
    const ms = Date.now() - t0;
    expect(fr.ok).toBe(true);
    expect(fr.status).toBe("reducible");
    expect((fr.caps || []).length).toBe(0); // factored outright, never capped
    expect(fr.factors.length).toBe(10); // (x²+1),(x²+4) → 2 linear each; the other six stay irreducible quadratics
    expect(ms).toBeLessThan(4000); // and promptly, nowhere near the deadline
  });
});
