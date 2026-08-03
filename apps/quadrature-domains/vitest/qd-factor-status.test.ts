// factor() three-state outcome. Previously every non-factorization returned a bare `ok:false`, so
// "PROVED irreducible over ℚ(i)" and "gave up at 9 variables" were indistinguishable — and the UI's
// response to both was to render nothing, making a certificate, a cap, and a missing feature look
// identical. `status` + `caps` separate them; `ok` keeps its old meaning so callers are unaffected.
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly } = S;
const v = (n: string) => MPoly.variable(n);
const I = (k: number) => MPoly.fromInt(k);
const x = v("x"), y = v("y");

const reducible = x.pow(2).sub(y.pow(2));            // (x−y)(x+y)
const linear = x.sub(I(1));                          // trivially irreducible
// Absolutely reducible (x±√2·y) but IRREDUCIBLE over ℚ(i) — the Gao path runs to completion and
// genuinely settles the question, so this must read as a certificate, not as a cap.
const qiIrreducible = x.pow(2).sub(I(2).mul(y.pow(2)));
// Seven variables: past the in-browser cap, so the engine never tried. Nothing may be claimed here.
const sevenVars = ["a", "b", "c", "d", "e", "f", "g"].map(v).reduce((p, q) => p.mul(q)).add(I(1));

describe("factor() reports WHY it stopped, not just that it did", () => {
  it("a factorization is 'reducible'", () => {
    const r = S.factor(reducible);
    expect(r.ok).toBe(true);
    expect(r.status).toBe("reducible");
    expect(r.factors.length).toBeGreaterThanOrEqual(2);
  });

  it("a completed run that finds no split is 'irreducible', with no caps", () => {
    for (const p of [linear, qiIrreducible]) {
      const r = S.factor(p);
      expect(r.ok).toBe(false);
      expect(r.status).toBe("irreducible");
      expect(r.caps).toEqual([]);
      expect(r.reason).toMatch(/irreducible/i);
    }
  });

  it("a run stopped by a cap is 'undetermined' and names the cap", () => {
    const r = S.factor(sevenVars);
    expect(r.ok).toBe(false);
    expect(r.status).toBe("undetermined");
    expect(r.caps.map((c: any) => c.code)).toContain("vars");
    const cap = r.caps.find((c: any) => c.code === "vars");
    expect(cap.detail).toMatch(/7/);          // says how many it saw
    expect(cap.detail).toMatch(/6/);          // …and what the cap is
  });

  // The distinction this whole change exists to protect: 'undetermined' is a statement about the
  // SEARCH, 'irreducible' is a statement about the POLYNOMIAL. Never let the former read as the latter.
  it("'undetermined' never claims irreducibility", () => {
    const r = S.factor(sevenVars);
    expect(r.reason).not.toMatch(/\birreducible\b/i);
    expect(r.status).not.toBe("irreducible");
  });

  it("the zero polynomial and a constant are distinguished from each other", () => {
    expect(S.factor(MPoly.zero ? MPoly.zero() : I(0)).status).toBe("undetermined");
    expect(S.factor(I(7)).status).toBe("irreducible");   // a constant genuinely has no split
  });
});

describe("contract invariants", () => {
  const corpus = [reducible, linear, qiIrreducible, sevenVars, I(7), x.mul(y), x.pow(4).sub(y.pow(4))];

  it("status is always exactly one of the three", () => {
    for (const p of corpus) {
      expect(["reducible", "irreducible", "undetermined"]).toContain(S.factor(p).status);
    }
  });

  it("ok is true if and only if status is 'reducible' (back-compat for every existing caller)", () => {
    for (const p of corpus) {
      const r = S.factor(p);
      expect(r.ok).toBe(r.status === "reducible");
    }
  });

  it("caps are non-empty if and only if the status is 'undetermined'", () => {
    for (const p of corpus) {
      const r = S.factor(p);
      expect((r.caps || []).length > 0).toBe(r.status === "undetermined");
    }
  });

  it("caps carry no duplicate codes (a separable split recurses and can re-fire one)", () => {
    for (const p of corpus) {
      const codes = (S.factor(p).caps || []).map((c: any) => c.code);
      expect(codes.length).toBe(new Set(codes).size);
    }
  });

  it("every cap record is { code, detail } with a user-facing detail", () => {
    const r = S.factor(sevenVars);
    for (const c of r.caps) {
      expect(typeof c.code).toBe("string");
      expect(c.code.length).toBeGreaterThan(0);
      expect(typeof c.detail).toBe("string");
      expect(c.detail.length).toBeGreaterThan(8);
    }
  });
});
