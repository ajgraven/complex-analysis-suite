// @vitest-environment node
//
// X1 shared RUR channel — the certified fold/boundary tests run at the true algebraic root through the RUR
// (minPoly(t) + coordinate maps g_v(t)), but the certified solve runs in the WORKER and `certifiedRealToJSON`
// used to flatten every Rational box to a float, discarding the exact object the tests need. This slice
// carries the RUR across the boundary as term-lists and rebuilds it main-thread via `rurFromJSON`. The RUR
// is what the fold (interval Schur–Cohn) and boundary (augmented minPoly count) certificates both consume,
// so its fidelity across serialization is load-bearing — a corrupted coord map would be a wrong φ′, i.e. a
// false `=`. This pins the round trip: solveRealCertified exposes it, certifiedRealToJSON serializes it, and
// rurFromJSON reconstructs it byte-for-byte.
import { describe, it, expect, beforeAll } from "vitest";

let S: any;
beforeAll(async () => {
  const QD = (await import("../app/solvers/solver.mjs")).default;
  await import("../app/sym/sym-core.mjs");
  S = QD.Sym;
});

// {x²−2, y−x}: a zero-dimensional system with the two IRRATIONAL real solutions (±√2, ±√2) — exactly the
// irrational-algebraic case X1 targets. The RUR is minPoly(t) (deg 2) + coord maps g_x(t), g_y(t).
const system = () => {
  const x = S.mpolyVar("x"), y = S.mpolyVar("y");
  return [x.mul(x).sub(S.mpolyConst(S.gaussInt(2))), y.sub(x)];
};

describe("X1 RUR channel — solveRealCertified exposes the RUR, and it round-trips through JSON", () => {
  it("solveRealCertified attaches the RUR (minPoly + coord maps) alongside the certified boxes", () => {
    const res = S.solveRealCertified(system(), { vars: ["x", "y"] });
    expect(res.ok).toBe(true);
    expect(res.count).toBe(2);                                  // the two real roots ±√2
    expect(res.rur).toBeTruthy();
    expect(res.rur.tName).toBeTruthy();
    // minPoly and both coordinate maps are MPolys (have a term-list), univariate in the RUR variable.
    expect(typeof res.rur.minPoly.termList).toBe("function");
    for (const v of ["x", "y"]) {
      expect(res.rur.coords[v]).toBeTruthy();
      const vars = [...res.rur.coords[v].vars()];
      expect(vars.every((n: string) => n === res.rur.tName)).toBe(true);   // a genuine coordinate map g_v(t)
    }
  });

  it("certifiedRealToJSON serializes the RUR to term-lists, rurFromJSON rebuilds it byte-for-byte", () => {
    const res = S.solveRealCertified(system(), { vars: ["x", "y"] });
    const json = S.certifiedRealToJSON(res);
    // serialized: term-lists (JSON-safe arrays), matching the live MPolys exactly.
    expect(Array.isArray(json.rur.minPoly)).toBe(true);
    expect(json.rur.minPoly).toEqual(res.rur.minPoly.termList());
    expect(json.rur.coords.x).toEqual(res.rur.coords.x.termList());
    expect(json.rur.tName).toBe(res.rur.tName);
    // reconstructed: MPolys whose term-lists match the originals (fromTermList ∘ termList is identity).
    const back = S.rurFromJSON(json.rur);
    expect(back).toBeTruthy();
    expect(back.tName).toBe(res.rur.tName);
    expect(back.minPoly.termList()).toEqual(res.rur.minPoly.termList());
    for (const v of ["x", "y"]) expect(back.coords[v].termList()).toEqual(res.rur.coords[v].termList());
  });

  it("rurFromJSON returns null when there is no RUR (the numeric-solve fallback path)", () => {
    expect(S.rurFromJSON(null)).toBe(null);
    expect(S.rurFromJSON({})).toBe(null);
    expect(S.rurFromJSON({ minPoly: [], coords: {} })).toBe(null);   // missing tName
  });

  it("the PARALLEL isolating t-boxes (tBoxes) serialize and reconstruct to Rationals — solutions stay clean", () => {
    // The per-solution certified fold encloses φ′ over each box, so tBoxes must survive the worker boundary,
    // aligned with `solutions`. They ride BESIDE the solutions (not as a solution key) so no coordinate-
    // iterating consumer ever sees a non-coordinate.
    const json = S.certifiedRealToJSON(S.solveRealCertified(system(), { vars: ["x", "y"] }));
    expect(json.solutions.length).toBe(2);
    expect(json.tBoxes.length).toBe(json.solutions.length);          // one box per solution, aligned
    // solutions carry ONLY coordinate objects — every key resolves to a { …, reLo } box
    for (const sol of json.solutions) for (const v of Object.keys(sol)) expect(typeof sol[v].reLo).toBe("number");
    for (const b of json.tBoxes) {
      expect(Array.isArray(b.lo)).toBe(true);                        // [num, den] strings, JSON-safe
      const box = S.ratBoxFromJSON(b);
      expect(box.lo.sub(box.hi).sign()).toBeLessThanOrEqual(0);      // lo ≤ hi — a valid isolating bracket
    }
    expect(S.ratBoxFromJSON(null)).toBe(null);
  });
});
