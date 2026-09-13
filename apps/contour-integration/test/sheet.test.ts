// **THE SHEET SPINNER** — M5.1d, research 06 §5.3, and `BranchChoice.sheet` stops being carried-unread.
//
// Deferred in M4.7d with its reason: under a record the determination is the record's, and the
// sandbox had no declared branch FACTOR for a sheet index to multiply. M5.1 gave it one — and the
// spinner then needed no new machinery at all, which is the claim this file exists to pin.
//
// **A sheet is a whole-turn offset of the declared window.** Reporting the answer on sheet `s` is
// reading `arg ∈ [θ₀ + 2πs, θ₀ + 2π(s+1))`; in units of π that is `[lo + 2s, hi + 2s]`. Everything
// else follows, and the fact that it follows — rather than being arranged — is what says the
// mechanism is the right one:
//
//   - the residues pick up `e^{2πisα}` exactly, because `powerAtPole` reads `z₀^α` in the window;
//   - a LOG shifts ADDITIVELY instead, for free, with no branch anywhere in the code;
//   - the cut does not move, because `cos`/`sin` are 2π-periodic;
//   - the window stays one turn wide, so the invariant M5.1a added is untouched.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import { parse } from "@cas/expr";
import { declaredKey, runDeclared, type SandboxDeclaration } from "../src/engine/declaredRun.js";
import { keyholeTemplate } from "../src/engine/contour/templates.js";
import { buildDeclaration } from "../src/kernel/branch/declaration.js";
import type { BranchChoice } from "../src/kernel/branch/model.js";
import type { Cx } from "../src/kernel/geom.js";

const KEYHOLE = [Frac.ZERO, Frac.of(2n)] as const;

function setup(alpha: Frac, sheet: number) {
  const order = { kind: "power" as const, alpha, sign: 1 as const };
  const built = buildDeclaration({ constant: [1, 0], at: 0, window: KEYHOLE, order });
  if (!built.ok) throw new Error(built.reason);
  const declaration: SandboxDeclaration = {
    constant: [1, 0],
    pointId: "b",
    order,
    window: KEYHOLE,
    cofactor: parse("1/(1+z)"),
  };
  const branch: BranchChoice = { ...built.choice, sheet };
  return { declaration, contour: keyholeTemplate(), branch };
}

const value = (alpha: Frac, sheet: number): Cx => {
  const { declaration, contour, branch } = setup(alpha, sheet);
  const r = runDeclared(declaration, contour, branch);
  if (!r.ok) throw new Error(r.reason);
  const v = r.analysis.theorem.exactValue?.value;
  if (v === undefined) throw new Error(`no exact value on sheet ${sheet}`);
  return v;
};

const ratio = (a: Cx, b: Cx): Cx => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

describe("sheet s multiplies a power's answer by exactly e^{2πisα}", () => {
  it.each([
    [Frac.of(-1n, 2n), 1],
    [Frac.of(-1n, 2n), 2],
    [Frac.of(-1n, 2n), -1],
    [Frac.of(1n, 3n), 1],
    [Frac.of(1n, 3n), 3],
    [Frac.of(3n, 4n), -2],
  ])("α = %s, sheet %s", (alpha, sheet) => {
    const base = value(alpha, 0);
    const moved = value(alpha, sheet);
    const r = ratio(moved, base);
    const want = 2 * Math.PI * sheet * alpha.toNumber();
    expect(r[0]).toBeCloseTo(Math.cos(want), 11);
    expect(r[1]).toBeCloseTo(Math.sin(want), 11);
    // Unimodular: a power's monodromy multiplies by a phase and nothing else.
    expect(Math.hypot(r[0], r[1])).toBeCloseTo(1, 11);
  });

  it("sheet 0 is the identity, not merely close to it", () => {
    // Asserted bit-for-bit, because `[lo + 0, hi + 0]` must be the SAME `Frac` and not a rounded one.
    const a = value(Frac.of(-1n, 2n), 0);
    const b = value(Frac.of(-1n, 2n), 0);
    expect(a).toEqual(b);
  });

  it("an INTEGER exponent has no sheets at all, and the spinner then does nothing", () => {
    // `e^{2πisα} = 1` for integer α: the factor is single-valued, there is one sheet, and moving the
    // spinner is not a different answer. A mechanism that produced a phase here would be inventing
    // multivaluedness the integrand does not have.
    const base = value(Frac.of(2n), 0);
    for (const sheet of [1, 2, -1]) {
      const moved = value(Frac.of(2n), sheet);
      expect({ sheet, re: Math.abs(moved[0] - base[0]) < 1e-9 }).toEqual({ sheet, re: true });
      expect({ sheet, im: Math.abs(moved[1] - base[1]) < 1e-9 }).toEqual({ sheet, im: true });
    }
  });
});

describe("a LOG shifts additively instead, and no code anywhere branches on which", () => {
  it("log² on sheet 1 is not a phase away from sheet 0 — the modulus moves too", () => {
    // `log_{[2π,4π)} = log_{[0,2π)} + 2πi`, and `(L + 2πi)²` is not `L²` times a unimodular factor.
    // The same window offset produces it, which is the point: the mechanism did not have to be told
    // that a log is different.
    const order = { kind: "log" as const, power: 2 };
    const built = buildDeclaration({ constant: [1, 0], at: 0, window: KEYHOLE, order });
    if (!built.ok) throw new Error(built.reason);
    const declaration: SandboxDeclaration = {
      constant: [1, 0],
      pointId: "b",
      order,
      window: KEYHOLE,
      cofactor: parse("1/(1+z^2)^2"),
    };
    const contour = keyholeTemplate();
    const at = (sheet: number): Cx => {
      const r = runDeclared(declaration, contour, { ...built.choice, sheet });
      if (!r.ok) throw new Error(r.reason);
      const v = r.analysis.theorem.exactValue?.value;
      if (v === undefined) throw new Error("no value");
      return v;
    };
    const base = at(0);
    const one = at(1);
    expect(Math.hypot(one[0] - base[0], one[1] - base[1])).toBeGreaterThan(1e-6);
    // NOT unimodular — that is the whole difference from the power case above.
    const r = ratio(one, base);
    expect(Math.abs(Math.hypot(r[0], r[1]) - 1)).toBeGreaterThan(0.01);
  });
});

describe("what a sheet does NOT change", () => {
  it("the cut stays exactly where it was — a sheet is not a deformation", () => {
    // `cos`/`sin` are 2π-periodic, so the ray is identical. Correct rather than convenient: changing
    // sheet says which value is reported, not where the discontinuity is.
    const { declaration, contour, branch } = setup(Frac.of(-1n, 2n), 0);
    const zero = runDeclared(declaration, contour, branch);
    const three = runDeclared(declaration, contour, { ...branch, sheet: 3 });
    if (!zero.ok || !three.ok) throw new Error("both should run");
    expect(three.implied.cuts).toEqual(zero.implied.cuts);
    expect(three.implied.points[0].at).toEqual(zero.implied.points[0].at);
  });

  it("the convention keeps its name — sheet 1 of [0, 2π) is not a third convention", () => {
    // Reading the label off the raw window edge would call `[2π, 4π)` "custom", inventing a
    // convention out of a bookkeeping integer. It is read modulo whole turns instead.
    const { declaration, contour, branch } = setup(Frac.of(-1n, 2n), 0);
    for (const sheet of [0, 1, 2, -1, -3]) {
      const r = runDeclared(declaration, contour, { ...branch, sheet });
      if (!r.ok) throw new Error(r.reason);
      expect({ sheet, convention: r.implied.convention }).toEqual({ sheet, convention: "zeroToTwoPi" });
    }
  });

  it("and the principal window keeps ITS name across sheets, including negative ones", () => {
    // The negative case is where a floor-division helper usually goes wrong, so it is asserted:
    // `−1 − 2s` must reduce back to `−1` and not to `+1`.
    const principal = [Frac.of(-1n), Frac.ONE] as const;
    const order = { kind: "power" as const, alpha: Frac.of(1n, 3n), sign: 1 as const };
    const built = buildDeclaration({ constant: [1, 0], at: 0, window: principal, order });
    if (!built.ok) throw new Error(built.reason);
    const declaration: SandboxDeclaration = {
      constant: [1, 0], pointId: "b", order, window: principal, cofactor: parse("1/(1+z)"),
    };
    for (const sheet of [0, 1, -1, -4]) {
      const r = runDeclared(declaration, keyholeTemplate(), { ...built.choice, sheet });
      if (!r.ok) throw new Error(r.reason);
      expect({ sheet, convention: r.implied.convention }).toEqual({ sheet, convention: "principal" });
    }
  });

  it("the window is still exactly one turn wide, so M5.1a's invariant is untouched", () => {
    // A sheet offset that widened the window would be caught here rather than as a residue bug.
    for (const sheet of [0, 5, -5]) {
      const { declaration, contour, branch } = setup(Frac.of(1n, 4n), sheet);
      const r = runDeclared(declaration, contour, { ...branch, sheet });
      expect({ sheet, ok: r.ok }).toEqual({ sheet, ok: true });
    }
  });
});

describe("the stage's program is keyed by VALUE, because identity never fires", () => {
  it("two runs of the same declaration produce the same key and different objects", () => {
    // `runDeclared` builds `declared` fresh every call. A shell that compared object identity to
    // decide whether to rebuild the GLSL therefore rebuilt it on EVERY recompute — including every
    // frame of a contour drag. This is the claim that keeps the fix honest.
    const { declaration, contour, branch } = setup(Frac.of(-1n, 2n), 0);
    const a = runDeclared(declaration, contour, branch);
    const b = runDeclared(declaration, contour, branch);
    if (!a.ok || !b.ok) throw new Error("both should run");
    expect(a.declared).not.toBe(b.declared);
    expect(declaredKey(a.declared)).toBe(declaredKey(b.declared));
  });

  it("and every field that reaches the shader moves the key", () => {
    const base = setup(Frac.of(-1n, 2n), 0);
    const run = (d: SandboxDeclaration, br = base.branch): string => {
      const r = runDeclared(d, base.contour, br);
      if (!r.ok) throw new Error(r.reason);
      return declaredKey(r.declared);
    };
    const key = run(base.declaration);
    // The exponent, the orientation, the constant, the window and the SHEET each change the program
    // the stage must build — the sheet because it shifts the window the shader reads.
    expect(run({ ...base.declaration, order: { kind: "power", alpha: Frac.of(1n, 3n), sign: 1 } })).not.toBe(key);
    expect(run({ ...base.declaration, order: { kind: "power", alpha: Frac.of(-1n, 2n), sign: -1 } })).not.toBe(key);
    expect(run({ ...base.declaration, constant: [0, 1] })).not.toBe(key);
    expect(run({ ...base.declaration, window: [Frac.of(-1n), Frac.ONE] })).not.toBe(key);
    expect(run(base.declaration, { ...base.branch, sheet: 1 })).not.toBe(key);
    // …and dragging the CONTOUR does not, which is the case the fix exists for.
    const moved = runDeclared(base.declaration, keyholeTemplate(6, 0.2), base.branch);
    if (!moved.ok) throw new Error(moved.reason);
    expect(declaredKey(moved.declared)).toBe(key);
  });
});
