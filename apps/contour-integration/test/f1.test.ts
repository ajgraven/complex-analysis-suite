// F1, end to end — and the record whose job in the corpus is to be reached TWICE.
//
// `2π/(3√3)` is F1 at `n = 3` and D3 at `(a, n) = (1, 3)`, and the two arguments share nothing: D3 is
// a keyhole with a branch cut along `[0,∞)`, a `z^{a−1}` monodromy and a `−e^{2πia}` phase, while F1's
// wedge has no cut at all because `1/(1+zⁿ)` is single-valued. D3 REFUSES at `a = 1` — its phase
// collapses — and names this record as the repair, so the pair is a working relationship rather than
// a coincidence: the value stands, the keyhole's derivation does not, and the wedge's does.
import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";
import type { Cx } from "../src/kernel/geom.js";
import { f1WedgeRationalPower as F1 } from "../src/families/records/f1-wedge-rational-power.js";
import { d3KeyholeXToTheN as D3 } from "../src/families/records/d3-keyhole-x-to-the-n.js";
import { runFamily, solveFamily } from "../src/families/runFamily.js";
import { loadFamilies } from "../src/families/index.js";
import { findPoles } from "../src/kernel/poles.js";
import { analyse } from "../src/engine/analyse.js";
import { resolveAll, pt, type Contour } from "../src/engine/contour/model.js";
import { setParam } from "../src/engine/contour/edit.js";
import { wedgeTemplate } from "../src/engine/contour/templates.js";
import { isClosed } from "../src/kernel/geom.js";

const scalar = (family: typeof F1, n: number) => {
  const g = F1.golden.find((x) => x.params.n === n);
  if (g === undefined) throw new Error(`F1 has no fixture at n = ${n}`);
  const r = solveFamily(family, g);
  if (!r.ok) throw new Error(`F1 refused at n = ${n}: ${r.reason}`);
  if (r.route !== "scalar") throw new Error("F1 solves by division, not as a system");
  return r;
};

describe("F1 loads and solves", () => {
  it("passes every loader invariant", () => {
    const loaded = loadFamilies([F1]);
    expect(loaded.violations).toEqual([]);
    expect(loaded.families).toHaveLength(1);
  });

  it("prints (π/n)/sin(π/n) at every fixture — one shape, whatever the field", () => {
    // The two halves of the engine meeting: `n = 2, 3` reach their residue pole by pole (the roots
    // of `1 + zⁿ` are in one quadratic extension there) and `n = 5, 7` structurally (they are not).
    // Different routes, and the record cannot tell — which is the strongest statement that the
    // fallback in `applyResidueTheorem` is a route to the same answer and not a second answer.
    expect(scalar(F1, 2).solved.text).toBe("π/2");
    expect(scalar(F1, 3).solved.text).toBe("(π/3)/sin(π/3)");
    expect(scalar(F1, 5).solved.text).toBe("(π/5)/sin(π/5)");
    expect(scalar(F1, 7).solved.text).toBe("(π/7)/sin(π/7)");
  });

  it("is right to four more digits than the gallery pinned", () => {
    for (const g of F1.golden) {
      const want = typeof g.numeric === "number" ? g.numeric : g.numeric[0];
      const got = scalar(F1, g.params.n as number).solved.value;
      expect(Math.abs(got - want)).toBeLessThan(1e-15 * Math.max(1, Math.abs(want)));
    }
  });

  it("labels every fixture `=`, with an agreeing quadrature", () => {
    for (const g of F1.golden) {
      const r = runFamily(F1, g);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.run.theorem.agrees, JSON.stringify(g.params)).toBe(true);
      expect(r.run.ledger.closes).toBe(true);
      expect(scalar(F1, g.params.n as number).solved.certificates.every((c) => c.level !== "⚠")).toBe(
        true,
      );
    }
  });

  it("declares NO branch — the absence is the record", () => {
    // If this ever gains a `branch` block the cross-provenance test below stops meaning anything:
    // two arguments agreeing is evidence only while they are actually different arguments.
    expect(F1.branch).toBeUndefined();
    expect(D3.branch).toBeDefined();
  });
});

describe("the cross-provenance check, which is F1's real job", () => {
  it("F1(n = 3) is D3(a = 1, n = 3): a wedge with no cut against a keyhole with one", () => {
    const wedge = scalar(F1, 3).solved.value;
    // D3 at `a = 1` REFUSES, and its golden records the value that would have been printed. That is
    // the number to compare against: the claim is that the two DERIVATIONS reach one value, not that
    // both print it.
    const d3 = D3.golden.find((g) => g.params.a === 1 && g.params.n === 3);
    if (d3 === undefined) throw new Error("D3 has no (a, n) = (1, 3) fixture");
    expect(d3.refuses).toBeDefined();
    expect(solveFamily(D3, d3).ok).toBe(false);
    const want = typeof d3.numeric === "number" ? d3.numeric : d3.numeric[0];
    expect(Math.abs(wedge - want)).toBeLessThan(1e-14);
  });

  it("…and at n = 5 the two agree where NEITHER has an expressible pole", () => {
    // D3 at `a = 2.3, n = 5` and F1 at `n = 5` are different integrals, so this compares the shared
    // machinery rather than the answer: both reach `(π/n)/sin(πa/n)` through the structural sum, at
    // `a = 1` and `a = 2.3`. F1's value is D3's formula at `a = 1`.
    const f1 = scalar(F1, 5).solved.value;
    expect(f1).toBeCloseTo(Math.PI / 5 / Math.sin(Math.PI / 5), 12);
  });
});

describe("the u = xⁿ substitution, stated precisely enough to be a test", () => {
  it("carries the wedge onto the Mellin keyhole: ∫x^{a−1}/(1+xⁿ) = (1/n)∫u^{s−1}/(1+u), s = a/n", () => {
    // Research 03 §13's `§5.1 ≡ §7`. At `a = 1` the left side is F1 and the right is D1's integrand
    // at `s = 1/n`, so the wedge's convergence window `0 < a < n` IS the Mellin fundamental strip
    // `0 < s < 1` — one method's condition mapped onto the other's.
    for (const n of [2, 3, 5, 7]) {
      const wedge = scalar(F1, n).solved.value;
      const s = 1 / n;
      const mellin = Math.PI / Math.sin(Math.PI * s);
      expect(Math.abs(wedge - mellin / n)).toBeLessThan(1e-13);
    }
  });
});

describe("closing the other way", () => {
  // DESIGN §9's "closing up vs closing down" in its ROTATIONAL form. The wedge may equally be taken
  // as the sector from `arg z = −2π/n` to `0`: the enclosed pole is then `e^{−iπ/n}`, the loop runs
  // CLOCKWISE, and the two sign changes cancel. The contour is built by hand because a record's
  // geometry is its own — and the point is that the ENGINE produces the matching `∮`, not a second
  // formula that was arranged to agree.
  const downwardWedge = (n: number, R: number): Contour => {
    const angle = (-2 * Math.PI) / n;
    return {
      pieces: [
        {
          id: "ray0",
          name: "the positive real axis",
          geom: { kind: "segment", from: pt(0, 0), to: pt({ param: "R" }, 0) },
          role: "target",
          colour: 0,
        },
        {
          id: "arc",
          name: "the sector arc, clockwise",
          geom: { kind: "arc", center: pt(0, 0), radius: { param: "R" }, theta0: 0, theta1: angle },
          role: "vanish",
          lemma: "L2",
          colour: 1,
        },
        {
          id: "ray1",
          name: "the return ray arg z = −2π/n",
          geom: {
            kind: "segment",
            from: pt({ param: "R", mul: Math.cos(angle) }, { param: "R", mul: Math.sin(angle) }),
            to: pt(0, 0),
          },
          role: "reproduces",
          colour: 2,
        },
      ],
      params: { R: { name: "R", value: R, range: [0.5, 1e6], scale: "log", limit: { to: "inf" } } },
    };
  };

  const closedValue = (contour: Contour, n: number): Cx => {
    const ast = parse(`1/(1+z^${n})`);
    const fn = makeComplexFn(ast);
    const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
    const a = analyse({ ast, f, poles: findPoles(ast), contour: setParam(contour, "R", 4) });
    const v = a.theorem.exactValue;
    if (v === undefined) throw new Error(`no exact value for the downward wedge at n = ${n}`);
    return v.value;
  };

  it("closes, and its ∮ is the CONJUGATE of the upward wedge's", () => {
    // `1 + zⁿ` has real coefficients, so `Res(f, z̄₀) = conj(Res(f, z₀))`; the reversed orientation
    // supplies the other sign, and `conj(2πi·R) = −2πi·conj(R)` is exactly the two cancelling.
    for (const n of [2, 3, 5, 7]) {
      const down = downwardWedge(n, 4);
      expect(isClosed(resolveAll(down)), `n = ${n}`).toBe(true);
      const [dr, di] = closedValue(down, n);
      const [ur, ui] = closedValue(wedgeTemplate(n, 4), n);
      expect(dr).toBeCloseTo(ur, 12);
      expect(di).toBeCloseTo(-ui, 12);
    }
  });

  it("solves to the SAME real value — which is what closing the other way has to mean", () => {
    // The downward solve is `(1 + c′)·T = ∮` with `c′ = −ω̄`, so `T = ∮/(1 − e^{−2πi/n})`. Both the
    // numerator and the denominator are the conjugates of the upward ones, so `T` is the conjugate
    // of a real number — itself.
    for (const n of [2, 3, 5, 7]) {
      const [dr, di] = closedValue(downwardWedge(n, 4), n);
      const theta = (-2 * Math.PI) / n;
      const [cr, ci] = [1 - Math.cos(theta), -Math.sin(theta)];
      const norm = cr * cr + ci * ci;
      const re = (dr * cr + di * ci) / norm;
      const im = (di * cr - dr * ci) / norm;
      expect(im).toBeCloseTo(0, 12);
      expect(re).toBeCloseTo(scalar(F1, n).solved.value, 12);
    }
  });
});
