// =============================================================================
// qd-saturate-mobius — the store's Möbius ADMISSIBILITY saturation (finding B-1).
//
// The cleared (●)/(★) system drops the (1−z̄_j z) denominators, so its variety is V(QD) ∪ {|z_j|=1}
// and the raw Hermite real count OVER-counts (e.g. the unit disk h=1/w reads "4" for the true 2, the
// extra two being z=±1 on the circle). store.saturateMobius appends a labeled 'saturate' column with
// ⟨I⟩ : ∏(1−z_j·z̄_j)^∞, dropping the |z_j|=1 stratum so the count is EXACT. It must NOT drop a genuine
// |z_j|<1 solution (that would be the store's already-refused "saturate by z_j deletes the z=0 disk").
//
// Minimal, plumbing-free stand-in for the disk: a (z1, zb1) system with exactly two solutions —
// (0,0) interior (|z|=0<1, genuine) and (1,1) on the unit circle (|z|=1, spurious). Saturation must
// take realCount 2 → 1 and keep z1=0.
import { describe, it, expect } from "vitest";
import _QD from "../app/solvers/solver.mjs";
import "../app/sym/sym-core.mjs";
import "../app/qd/qd-equations.mjs";
import "../app/algebra/algebra-store.mjs";

const S: any = (_QD as any).Sym;
const AS: any = (_QD as any).AlgebraStore;

function diskLikeStore() {
  const z1 = S.mpolyVar("z1"), zb1 = S.mpolyVar("zb1"), one = S.mpolyConst(S.gaussInt(1, 0));
  const p1 = z1.mul(z1.sub(one));   // z1² − z1  ⇒ z1 ∈ {0, 1}
  const p2 = zb1.sub(z1);           // zb1 = z1  (⇒ the reim slice forces z1 real)
  const store = AS.create();
  store.seedFromPolys({ polys: [p1, p2], vars: ["z1", "zb1"] });
  return store;
}

describe("store.saturateMobius — Möbius admissibility saturation (B-1)", () => {
  it("the un-saturated count over-counts: realCount = 2 (interior + on-circle)", () => {
    const cl = diskLikeStore().classify();
    expect(cl.zeroDim).toBe(true);
    expect(cl.realCount).toBe(2);
  });

  it("drops the |z1|=1 boundary solution: realCount 2 → 1", () => {
    const store = diskLikeStore();
    const sat = store.saturateMobius();
    expect(sat.ok).toBe(true);
    expect(sat.poles).toContain("1");
    expect(sat.created.length).toBeGreaterThan(0);
    const after = store.classify();          // defaults to the last (saturated) column
    expect(after.zeroDim).toBe(true);
    expect(after.realCount).toBe(1);
  });

  it("retains the genuine interior solution z1=0 (does NOT delete the |z|<1 disk)", () => {
    const store = diskLikeStore();
    store.saturateMobius();
    const sol = store.solveReal();
    expect(sol.ok).toBe(true);
    const reals = (sol.solutions || []).filter((s: any) =>
      Object.keys(s).every((k) => Math.abs(s[k].im) < 1e-6));
    expect(reals.length).toBe(1);
    const cell = reals[0]["z1__re"] || reals[0]["z1"];
    expect(Math.abs((cell ? cell.re : 99) - 0)).toBeLessThan(1e-6);   // z1 = 0, the interior one
  });

  it("reports honestly (ok:false) when no Möbius denominator (z_j, z̄_j) is present", () => {
    const a = S.mpolyVar("A1_1"), one = S.mpolyConst(S.gaussInt(1, 0));
    const store = AS.create();
    store.seedFromPolys({ polys: [a.sub(one)], vars: ["A1_1"] });   // no z_j / zb_j pair
    const sat = store.saturateMobius();
    expect(sat.ok).toBe(false);
    expect(sat.reason).toMatch(/no Möbius|pinned|eliminated/i);
  });

  // A-1: a multi-pole (●) equation clears CROSS Möbius factors (1 − z̄_{j'} z_j), j'≠j, too — so the
  // all-ordered-pairs saturation must remove a spurious solution on {z̄_a z_b = 1} that no self-term catches.
  it("drops a CROSS-term spurious solution (multi-pole): 2 poles ⇒ realCount 2 → 1", () => {
    const z1 = S.mpolyVar("z1"), zb1 = S.mpolyVar("zb1"), z2 = S.mpolyVar("z2"), zb2 = S.mpolyVar("zb2");
    const one = S.mpolyConst(S.gaussInt(1, 0)), two = S.mpolyConst(S.gaussInt(2, 0)), four = S.mpolyConst(S.gaussInt(4, 0));
    // real solutions (z1,z2) = (0,0) genuine and (1/2, 2) spurious — the latter on the CROSS factor
    // z̄1·z2 = 1 (½·2), NOT on any self |z_j|=1 (|z1|=½, |z2|=2). Self-terms-only would keep it.
    const polys = [
      z2.sub(four.mul(z1)),               // z2 = 4·z1
      two.mul(z1.mul(z1)).sub(z1),        // 2·z1² − z1  ⇒ z1 ∈ {0, 1/2}
      zb1.sub(z1),                        // z̄1 = z1 (reality)
      zb2.sub(z2),                        // z̄2 = z2 (reality)
    ];
    const store = AS.create();
    store.seedFromPolys({ polys, vars: ["z1", "zb1", "z2", "zb2"] });
    expect(store.classify().realCount).toBe(2);
    const sat = store.saturateMobius();
    expect(sat.ok).toBe(true);
    expect(sat.poles).toEqual(expect.arrayContaining(["1", "2"]));
    expect(store.classify().realCount).toBe(1);   // the cross-term (1/2, 2) point removed; (0,0) retained
  });
});
