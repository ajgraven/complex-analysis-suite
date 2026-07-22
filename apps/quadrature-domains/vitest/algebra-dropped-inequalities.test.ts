// @vitest-environment jsdom
//
// Basis-replacement reductions consume non-equality nodes BY OMISSION: Gröbner, saturate,
// triangular and the resultant all emit a fresh set of equality generators, so a '>' or '≠' node
// in the column simply does not appear in the next one.
//
// Gröbner reported that as `skipped`. saturate and triangularize dropped silently, and the column
// diff showed only a bare "−N gone" — indistinguishable from the ordinary rewrite churn. It
// matters most for the univalence palette, whose conditions are mostly inequalities: add "convex",
// reduce once, and the convexity condition is gone. Verified in-browser before the fix (a Convex
// constraint's `> 0` node vanished across a saturate, with nothing said).
import { describe, it, expect, beforeAll } from "vitest";
import _QD from "../app/solver.mjs";

let Store: any;
beforeAll(async () => {
  await import("../app/sym-core.mjs");
  await import("../app/algebra/algebra-store.mjs");
  Store = (_QD as any).AlgebraStore;
});

const seeded = () => ({ st: Store.create() });

describe("the store reports what a basis replacement consumed", () => {
  it("saturateMobius returns a skipped list", () => {
    // Contract check rather than a full algebraic run: the shape is what the UI reads, and an
    // op that returns no `skipped` key at all is the silent-drop regression.
    const { st } = seeded();
    const r = st.saturateMobius();
    expect(r).toHaveProperty("skipped");
    expect(Array.isArray(r.skipped)).toBe(true);
  });

  it("triangularize returns a skipped list", () => {
    const { st } = seeded();
    const r = st.triangularize();
    expect(r).toHaveProperty("skipped");
    expect(Array.isArray(r.skipped)).toBe(true);
  });

  it("both report it even on the early-out paths", () => {
    // An empty store bails before doing any work. That path used to return `{ created: [] }` with
    // no `skipped`, so a UI reading r.skipped.length would throw rather than say nothing.
    const { st } = seeded();
    for (const r of [st.saturateMobius(), st.triangularize()]) {
      expect(r.ok).toBe(false);
      expect(r.skipped).toBeDefined();
    }
  });
});

describe("the drop is recorded permanently, not just toasted", () => {
  let PU: any;
  beforeAll(async () => {
    const reg: any = await import("../app/ui-registry.mjs");
    await import("../app/algebra/algebra-ui.mjs");
    PU = reg.QD_UI.PROV_UI;
  });
  const ctx: any = {
    latexPlain: (v: string) => v, valStr: () => "V", substList: () => "", ratioStrRec: () => "", ns: [], c: 0,
  };

  it("the saturate column label names the dropped inequalities", () => {
    // A toast is gone in seconds; the loss is of the user's own modelling work and has to survive
    // in the derivation — including an exported one.
    const withDrop = PU.saturate.column({ factor: "(1−z̄z)", droppedNonEq: 2 }, ctx);
    expect(withDrop).toMatch(/2 inequality nodes dropped/);
    const without = PU.saturate.column({ factor: "(1−z̄z)", droppedNonEq: 0 }, ctx);
    expect(without).not.toMatch(/dropped/);
  });

  it("the triangular column label does too", () => {
    expect(PU.triangular.column({ droppedNonEq: 1 }, ctx)).toMatch(/1 inequality node dropped/);
    expect(PU.triangular.column({}, ctx)).not.toMatch(/inequality/);
  });

  it("singular and plural are both right", () => {
    // Small, but this string lands in an exported derivation.
    expect(PU.saturate.column({ droppedNonEq: 1 }, ctx)).toMatch(/1 inequality node dropped/);
    expect(PU.saturate.column({ droppedNonEq: 3 }, ctx)).toMatch(/3 inequality nodes dropped/);
  });

  it("an absent count is treated as no drop, not as undefined", () => {
    // Every column predating this change has no droppedNonEq — they must not render "⚠ undefined".
    for (const rec of [PU.saturate, PU.triangular]) {
      expect(rec.column({}, ctx)).not.toMatch(/undefined|NaN/);
    }
  });
});
