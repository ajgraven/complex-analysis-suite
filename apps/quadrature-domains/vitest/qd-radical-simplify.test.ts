// simplifyRadical — tidying a solved closed form for display, exactly.
//
// The solver builds roots from RatFn, and RatFn is deliberately LAZY: add/mul/div cross-multiply
// and never cancel, because a multivariate gcd on every step would sit in the solver's hot loop.
// The cost lands on the reader — a closed form arrives carrying unit denominators, zero terms and
// factors that cancel, e.g. `− 4·X·(−a₁)` where `+ 4·X·a₁` was meant.
//
// These pin the two things that could go wrong. A simplification that DROPS a term is a wrong
// answer wearing a "verified ✓" badge (the UI re-verifies for exactly this reason, but the
// re-verification is a net, not a substitute for the rule being right). A simplification that
// changes a SIGN is the same bug in a quieter costume.
import { describe, it, expect, beforeAll } from "vitest";
import _QD from "../app/solver.mjs";

let S: any, SR: any;
beforeAll(async () => {
  await import("../app/sym-core.mjs");
  await import("../app/sym-radical.mjs");
  S = (_QD as any).Sym;
  SR = (_QD as any).SymRadical;
});

const rat = (p: any) => SR.builders.rat(S.RatFn.fromPoly(p));
const int = (k: number) => rat(S.mpolyInt(k));
const v = (n: string) => S.mpolyVar(n);
const tex = (node: any) => SR.radicalToLatex(node, (s: string) => s, S);
const simp = (node: any) => SR.simplifyRadical(node, S);

describe("identity folding", () => {
  it("drops a zero addend instead of printing '0 + x'", () => {
    expect(tex(simp(SR.builders.add(int(0), rat(v("x")))))).toBe("x");
    expect(tex(simp(SR.builders.add(rat(v("x")), int(0))))).toBe("x");
  });

  it("collapses a zero product to 0, not '0 · x'", () => {
    expect(tex(simp(SR.builders.mul(int(0), rat(v("x")))))).toBe("0");
  });

  it("drops a unit factor", () => {
    expect(tex(simp(SR.builders.mul(int(1), rat(v("x")))))).toBe("x");
  });

  it("collapses a zero numerator to 0, not a fraction", () => {
    const q = simp(SR.builders.div(int(0), rat(v("x"))));
    expect(tex(q)).toBe("0");
    expect(tex(q)).not.toContain("frac");
  });

  it("drops a unit denominator — the literal '0/1' class of artifact", () => {
    expect(tex(simp(SR.builders.div(rat(v("x")), int(1))))).toBe("x");
    expect(tex(simp(SR.builders.div(int(0), int(1))))).toBe("0");
  });

  it("folds x^1 and x^0", () => {
    expect(tex(simp(SR.builders.pow(rat(v("x")), 1)))).toBe("x");
    expect(tex(simp(SR.builders.pow(rat(v("x")), 0)))).toBe("1");
  });

  it("cancels a double negation rather than printing '--x'", () => {
    const t = tex(simp(SR.builders.neg(SR.builders.neg(rat(v("x"))))));
    expect(t).toBe("x");
    expect(t).not.toContain("--");
  });
});

describe("sign handling — the '· −a' artifact", () => {
  it("hoists a negative monomial out of a product", () => {
    // 4 · (−a) should read −4a, never '4 \cdot -a'.
    const n = SR.builders.mul(int(4), rat(v("a").neg()));
    const t = tex(simp(n));
    expect(t).not.toMatch(/\\cdot\s*-/);
    expect(t.startsWith("-")).toBe(true);
  });

  it("cancels two negative factors instead of stacking signs", () => {
    const n = SR.builders.mul(rat(v("a").neg()), rat(v("b").neg()));
    const t = tex(simp(n));
    expect(t).not.toContain("--");
    expect(t).not.toMatch(/^-/);
  });

  it("does NOT hoist a sign off a sum — it has no single sign to hoist", () => {
    // (−a + b) is not uniformly negative. Pulling a minus off it would be wrong, not just ugly.
    const sum = v("a").neg().add(v("b"));
    const before = tex(rat(sum));
    expect(tex(simp(rat(sum)))).toBe(before);
  });
});

describe("exact cancellation preserves the value", () => {
  const evalAt = (node: any, vm: any) => SR.evalRadical(node, vm);
  const близко = (a: any, b: any) =>
    Math.abs(a.re - b.re) < 1e-9 && Math.abs(a.im - b.im) < 1e-9;

  it("cancels a genuine common factor", () => {
    // (x·y) / x  →  y
    const num = v("x").mul(v("y")), den = v("x");
    const q = simp(SR.builders.div(rat(num), rat(den)));
    expect(tex(q)).toBe("y");
  });

  it("does NOT cancel when the gcd is 1 — no term may be lost", () => {
    // This is the shape that matters on the cardioid: A·z·(1−z·zb) + B·z² over (1−z·zb)².
    // gcd is 1, so every term must survive; dropping B·z² would be a wrong closed form.
    const one = S.mpolyInt(1);
    const z = v("z"), zb = v("zb"), A = v("A"), B = v("B");
    const om = one.sub(z.mul(zb));
    const num = A.mul(z).mul(om).add(B.mul(z).mul(z));
    const den = om.mul(om);
    const q = simp(SR.builders.div(rat(num), rat(den)));
    const t = tex(q);
    expect(t).toContain("B");                       // the term that must not vanish
    expect(t).toContain("A");
  });

  it("agrees numerically with the unsimplified form on random points", () => {
    // The property the UI's re-verification checks, asserted here directly on the rule.
    //
    // The case deliberately HAS a common factor, so the cancellation path actually runs. An
    // earlier draft used a gcd = 1 example: it passed, but it never exercised the code that can
    // change a value, and a mutation dropping the denominator's division slipped straight past
    // it. A property test aimed at the safe path guards nothing.
    const one = S.mpolyInt(1);
    const z = v("z"), zb = v("zb"), A = v("A"), B = v("B");
    const om = one.sub(z.mul(zb));
    const common = A.mul(z).add(B);                          // shared factor, cancels
    const original = SR.builders.div(
      rat(common.mul(om.mul(om))), rat(common.mul(zb)));     // (om²·c)/(zb·c) → om²/zb
    const reduced = simp(original);
    expect(tex(reduced)).not.toContain("A");                 // the factor really did cancel
    const pts = [
      { z: 0.3, zb: -0.2, A: 1.5, B: -0.75 },
      { z: -1.25, zb: 0.4, A: -2, B: 3 },
      { z: 2, zb: 0.125, A: 0.5, B: 0.25 },
    ];
    for (const p of pts) {
      const vm: any = {};
      for (const k of Object.keys(p)) vm[k] = { re: (p as any)[k], im: 0 };
      expect(близко(evalAt(original, vm), evalAt(reduced, vm)),
        `values diverged at ${JSON.stringify(p)}`).toBe(true);
    }
  });

  it("is idempotent — simplifying twice changes nothing further", () => {
    const one = S.mpolyInt(1);
    const om = one.sub(v("z").mul(v("zb")));
    const n = SR.builders.div(rat(v("A").mul(v("z")).mul(om)), rat(om.mul(om)));
    const once = simp(n);
    expect(tex(simp(once))).toBe(tex(once));
  });
});
