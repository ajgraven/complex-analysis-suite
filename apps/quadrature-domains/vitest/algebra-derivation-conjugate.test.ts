// @vitest-environment node
//
// C2 / T2 — the conjugate-overlay bug (the census-fix class, #135) swept from the two DERIVATION /
// REPRODUCTION paths, plus the differential harness whose absence let it ship. derivationSteps and
// sympyDerivation resolved an assume-real step's conjugate via the RAW QC.conjVarName, which is blind to
// "Define substitution" symbols: for a defined `t` (barred partner `tb` in substConj), the raw table
// returns `t` unchanged, so the replay folded NOTHING and the exported SymPy subs was EMPTY — even though
// the actual reduction (assumeReal, which uses the overlay-aware _conjName) folds tb ≡ t. So the
// transcript's "the final step provably equals this node's polynomial" contract and the "reproducible"
// SymPy script were both silently false for a defined symbol. This fixture puts a DEFINED symbol through
// the overlay reductions (the built-in z/z̄ pair the store tests all use would hide the bug — the raw
// bar-toggle already handles it).
import { describe, it, expect, beforeAll } from "vitest";

let Store: any, S: any, QC: any;
beforeAll(async () => {
  const _QD: any = (await import("../app/solver.mjs")).default;
  await import("../app/sym-core.mjs");
  await import("../app/qd-constraints.mjs");
  await import("../app/algebra/algebra-store.mjs");
  await import("../app/algebra/cas-export.mjs");   // sympyDerivation needs QD.CASExport (_subsForRepro)
  Store = _QD.AlgebraStore; S = _QD.Sym; QC = _QD.QDConstraints;
});

// Seed a system where z1² and z̄1² both appear as clean powers (so `define t := z1²` registers the barred
// partner tb and substitutes BOTH), with a live z1 term so a folded node is non-trivial. After the define
// the column is [t − tb, t + tb + z1]; assumeReal(['t']) folds tb ≡ t (overlay-aware) → [0, 2t + z1].
function definedThenReal() {
  const st = Store.create();
  const z1 = S.mpolyVar("z1"), zb1 = S.mpolyVar("zb1");
  const p1 = z1.mul(z1).sub(zb1.mul(zb1));                 // z1² − z̄1²
  const p2 = z1.mul(z1).add(zb1.mul(zb1)).add(z1);         // z1² + z̄1² + z1
  st.seedFromPolys({ polys: [p1, p2], vars: ["z1", "zb1"], model: "conjugate" });
  const d = st.defineSubstitution("t", z1.mul(z1));
  expect(d.ok, "define t := z1² should register the pair: " + (d.reason || "")).not.toBe(false);
  const r = st.assumeReal(["t"]);
  expect(r.ok, "assume t real should succeed: " + (r.reason || "")).not.toBe(false);
  return st;
}

// Every node in the store whose derivation transcript contains the assume-real fold step for t.
function assumeRealNodes(st: any) {
  const out: any[] = [];
  for (const n of (st.list ? st.list() : [])) {
    const ds = st.derivationSteps(n.id);
    if (ds && ds.ok && ds.steps && ds.steps.some((s: any) => /assume\s+t\s+real/.test(s.rule || ""))) out.push({ n, ds });
  }
  return out;
}

describe("derivation transcript + SymPy export resolve a DEFINED symbol's conjugate via the overlay (C2)", () => {
  it("the store registers t↔tb; the raw QC table does not — the bug in one line", () => {
    const st = definedThenReal();
    expect(st.conjNameOf("t")).toBe("tb");
    expect(QC.conjVarName("t")).toBe("t");
  });

  it("derivationSteps REPLAYS the tb ≡ t fold for a defined symbol (absent entirely before the fix)", () => {
    const st = definedThenReal();
    const nodes = assumeRealNodes(st);
    // THE regression guard: before the fix the replay computed conj('t') via the raw table = 't', hit
    // `if (c === v) continue`, and emitted NO fold step for the defined symbol — so this set was EMPTY and
    // the transcript silently stopped short of the node. The overlay-aware _conjName restores the fold.
    expect(nodes.length, "no assume-real fold step was emitted for the defined symbol t (the bug)").toBeGreaterThan(0);
    for (const { ds } of nodes) {
      // The fold step names the identification explicitly (push('assume t real (tb ≡ t)', …)).
      expect(ds.steps.some((s: any) => /tb\s*≡\s*t\b/.test(s.rule || ""))).toBe(true);
      // …and the FINAL step (post-fold) no longer carries tb — the "provably equals this node" contract.
      // (Step 0 is the pre-fold START and legitimately still shows tb; only the last step is the claim.)
      const last = ds.steps[ds.steps.length - 1];
      expect([...last.poly.vars()], "the fold's final replayed step still carries tb").not.toContain("tb");
    }
  });

  it("sympyDerivation reproduces the assume-real step as an explicit tb → t substitution", () => {
    const st = definedThenReal();
    const script = st.sympyDerivation();
    expect(typeof script).toBe("string");
    expect(script.length).toBeGreaterThan(0);
    // Before the fix _subsForRepro built the subs via the raw table, yielding an EMPTY map for the defined
    // symbol, so the column was emitted as a literal with nothing to reproduce the fold. The overlay path
    // emits `SUBS_ = {tb: t}` — assert that exact identification is present.
    expect(script, "the reproducible script must substitute the barred symbol tb → t").toMatch(/tb\s*:\s*t\b/);
  });
});
