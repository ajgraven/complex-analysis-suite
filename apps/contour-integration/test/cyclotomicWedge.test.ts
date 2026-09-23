// The residue theorem where no individual residue exists — and the wedge that needs it.
//
// `1/(1 + zⁿ)` has poles in ℚ(i)(√d) at `n = 2, 3, 4` and none at `n = 5, 7`, because ℚ(ζ₁₀) has
// degree 4 over ℚ and ℚ(ζ₁₄) degree 6. D3 met this first and answered it for a KEYHOLE, which
// encircles every root once; F1's wedge encircles exactly one of the `n`, so the structural sum has
// to become what the residue theorem actually says — `Σₖ n(γ,zₖ)·Res` — with the sum as the special
// case `wₖ ≡ 1`.
import { describe, expect, it } from "vitest";
import { Frac, toExactRational } from "@cas/exact";
import { makeComplexFn, parse } from "@cas/expr";
import type { Cx } from "../src/kernel/geom.js";
import {
  asCyclotomic,
  cyclotomicResidueSum,
  cyclotomicRoots,
  cyclotomicWeightedSum,
} from "../src/kernel/cyclotomic.js";
import { findPoles } from "../src/kernel/poles.js";
import { analyse } from "../src/engine/analyse.js";
import { applyResidueTheorem } from "../src/engine/residueTheorem.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { resolveAll } from "../src/engine/contour/model.js";
import { wedgeTemplate } from "../src/engine/contour/templates.js";
import { setParam } from "../src/engine/contour/edit.js";

const formOf = (src: string) => {
  const split = toExactRational(parse(src));
  if (!split.ok) throw new Error(`not rational: ${src}`);
  const form = asCyclotomic(split.value.den);
  if (form === null) throw new Error(`not cyclotomic: ${src}`);
  return form;
};

const FULL: readonly [Frac, Frac] = [Frac.ZERO, Frac.of(2n)];

describe("cyclotomicRoots", () => {
  it("names each root by an exact ARGUMENT and never by a position", () => {
    // `1 + z⁵ = 0` at `arg = π/5, 3π/5, π, 7π/5, 9π/5`. Not one of the five is expressible in
    // ℚ(i)(√d); all five arguments are fractions.
    const roots = cyclotomicRoots(formOf("1/(1+z^5)"));
    expect(roots.map((r) => `${r.argOverPi.n}/${r.argOverPi.d}`)).toEqual([
      "1/5",
      "3/5",
      "1/1",
      "7/5",
      "9/5",
    ]);
    // The float position is there to ask the geometry a question, and it had better be the root.
    for (const r of roots) {
      const [x, y] = r.at;
      // z⁵ = −1 at each of them.
      const pow = (k: number): Cx => {
        let re = 1;
        let im = 0;
        for (let i = 0; i < k; i++) [re, im] = [re * x - im * y, re * y + im * x];
        return [re, im];
      };
      const [re, im] = pow(5);
      expect(re).toBeCloseTo(-1, 12);
      expect(im).toBeCloseTo(0, 12);
    }
  });
});

describe("cyclotomicWeightedSum", () => {
  it("IS cyclotomicResidueSum when every weight is 1 — the wrapper is not a second implementation", () => {
    for (const src of ["1/(1+z^3)", "1/(1+z^5)", "1/(1+z^7)", "1/(1+z^4)"]) {
      const form = formOf(src);
      for (const alpha of [Frac.ZERO, Frac.of(3n, 10n), Frac.of(-1n, 2n)]) {
        const a = cyclotomicResidueSum(form, alpha, FULL);
        const b = cyclotomicWeightedSum(form, alpha, FULL, () => 1);
        expect(a.ok).toBe(true);
        if (!a.ok || !b.ok) throw new Error("expected both to succeed");
        expect(b.value.toTuple()).toEqual(a.value.toTuple());
        expect(b.arguments).toEqual(a.arguments);
      }
    }
  });

  it("selects ONE root: Res(1/(1+z⁵), e^{iπ/5}) = −e^{iπ/5}/5", () => {
    const form = formOf("1/(1+z^5)");
    const only = cyclotomicWeightedSum(form, Frac.ZERO, undefined, (r) =>
      r.argOverPi.equals(Frac.of(1n, 5n)) ? 1 : 0,
    );
    expect(only.ok).toBe(true);
    if (!only.ok) return;
    expect(only.arguments.map((f) => `${f.n}/${f.d}`)).toEqual(["1/5"]);
    const [re, im] = only.value.toTuple();
    expect(re).toBeCloseTo(-Math.cos(Math.PI / 5) / 5, 13);
    expect(im).toBeCloseTo(-Math.sin(Math.PI / 5) / 5, 13);
  });

  it("weights by the WINDING NUMBER, not by membership", () => {
    // `Σ n·Res` is what the theorem says; a contour that winds twice about a root contributes twice.
    const form = formOf("1/(1+z^5)");
    const once = cyclotomicWeightedSum(form, Frac.ZERO, undefined, (r) => (r.index === 0 ? 1 : 0));
    const twice = cyclotomicWeightedSum(form, Frac.ZERO, undefined, (r) => (r.index === 0 ? 2 : 0));
    const back = cyclotomicWeightedSum(form, Frac.ZERO, undefined, (r) => (r.index === 0 ? -1 : 0));
    if (!once.ok || !twice.ok || !back.ok) throw new Error("expected all three to succeed");
    const [r1, i1] = once.value.toTuple();
    expect(twice.value.toTuple()[0]).toBeCloseTo(2 * r1, 13);
    expect(twice.value.toTuple()[1]).toBeCloseTo(2 * i1, 13);
    expect(back.value.toTuple()[0]).toBeCloseTo(-r1, 13);
    expect(back.value.toTuple()[1]).toBeCloseTo(-i1, 13);
  });

  it("REFUSES an undecided weight rather than dropping the term", () => {
    // A dropped term is a term missing from a sum still reported as exact, which is the one failure
    // mode this whole route could have and not be noticed.
    const form = formOf("1/(1+z^5)");
    const r = cyclotomicWeightedSum(form, Frac.ZERO, undefined, (root) =>
      root.index === 2 ? null : 1,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/winding number about the root at arg = 1\/1·π was not\s+decided/);
    expect(r.certificate.level).toBe("⚠");
  });

  it("refuses a FRACTIONAL power with no determination declared, and allows an integer one", () => {
    // A determination is a property of the integrand. D3's `z^{a−1}` has one and must declare it;
    // F1's plain `1/(1+zⁿ)` is single-valued and has none, so defaulting a window for it would put a
    // convention on an integrand that does not admit one.
    const form = formOf("1/(1+z^3)");
    const fractional = cyclotomicWeightedSum(form, Frac.of(3n, 10n), undefined, () => 1);
    expect(fractional.ok).toBe(false);
    if (!fractional.ok) expect(fractional.reason).toMatch(/multivalued/);

    expect(cyclotomicWeightedSum(form, Frac.ZERO, undefined, () => 1).ok).toBe(true);
    expect(cyclotomicWeightedSum(form, Frac.of(2n), undefined, () => 1).ok).toBe(true);
  });

  it("checks the window only where a residue is COUNTED", () => {
    // D3's `roots-of-minus-one-mislabelled` trap, kept: with every root counted, a window that omits
    // one refuses. But a root the contour does not enclose contributes nothing, and its argument is
    // not consulted — so the same window passes when only the root inside it is weighted.
    const form = formOf("1/(1+z^5)");
    const narrow: readonly [Frac, Frac] = [Frac.ZERO, Frac.ONE];
    expect(cyclotomicWeightedSum(form, Frac.of(3n, 10n), narrow, () => 1).ok).toBe(false);
    expect(
      cyclotomicWeightedSum(form, Frac.of(3n, 10n), narrow, (r) => (r.index === 0 ? 1 : 0)).ok,
    ).toBe(true);
  });
});

describe("the wedge reaches an exact value at every n", () => {
  const wedge = (n: number, R = 4) => {
    const ast = parse(`1/(1+z^${n})`);
    const fn = makeComplexFn(ast);
    const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
    return analyse({ ast, f, poles: findPoles(ast), contour: setParam(wedgeTemplate(n, R), "R", R) });
  };

  it("takes the PER-POLE route where the poles are expressible, and keeps the radical form", () => {
    // The layering claim. Trying the structural route first would work and would be worse: it
    // returns `π/(3·sin(π/3))` where this returns `2π/(3√3)` — the same number carrying a
    // transcendental it does not need. The record's own goldens say exactly this.
    expect(wedge(2).theorem.exactValue?.text).toBe("π");
    expect(wedge(3).theorem.exactValue?.text).toBe("−πi/3 + π√3/3");
    expect(wedge(4).theorem.exactValue?.text).toBe("π√2/4 − πi√2/4");
  });

  it("takes the STRUCTURAL route where they are not — n = 5 and n = 7", () => {
    expect(findPoles(parse("1/(1+z^5)")).exactlyComplete).toBe(false);
    expect(wedge(5).theorem.exactValue?.text).toBe("−2πi/5·e^(iπ/5)");
    expect(wedge(7).theorem.exactValue?.text).toBe("−2πi/7·e^(iπ/7)");
  });

  it("agrees with an independent quadrature at every n, to 1e-14", () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      const a = wedge(n);
      expect(a.theorem.agrees).toBe(true);
      expect(a.theorem.disagreement ?? Infinity).toBeLessThan(1e-14);
    }
  });

  it("is INDEPENDENT of the radius, as the residue theorem requires", () => {
    for (const n of [3, 5, 7]) {
      expect(wedge(n, 4).theorem.exactValue?.text).toBe(wedge(n, 60).theorem.exactValue?.text);
    }
  });

  it("reports the residue SUM as exact at n = 5, where no individual residue is", () => {
    const rows = wedge(5).ledger.rows.filter((r) => r.constraint === "CATCH");
    const residues = rows.find((r) => /residue/.test(r.claim));
    expect(residues?.status).toBe("satisfied");
    expect(residues?.claim).toBe("the residue sum is exact — the individual residues lie outside $\\mathbb{Q}(i)(\\sqrt{d})$, the sum does not");
    // …and the per-pole case still says the simpler thing.
    const at3 = wedge(3).ledger.rows.find((r) => /residue/.test(r.claim));
    expect(at3?.claim).toBe("every enclosed residue is exact");
  });

  it("kills the sector arc at every n, now that a 2π/n sweep can be measured", () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      const arc = wedge(n).ledger.rows.find((r) => r.constraint === "KILL" && /arc/.test(r.claim));
      expect(arc?.status, `n = ${n}`).toBe("satisfied");
      expect(arc?.evidence.level).toBe("≤");
    }
  });
});

// The four cases a mutation sweep found the tests above could not see. Two are about what the route
// does with a winding it was not given cleanly; two are about a numerator it must not ignore.
describe("the route refuses rather than guesses", () => {
  const wedgeIntegral = (n: number) => {
    const ast = parse(`1/(1+z^${n})`);
    const fn = makeComplexFn(ast);
    const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
    const contour = setParam(wedgeTemplate(n, 4), "R", 4);
    const poles = findPoles(ast);
    return {
      ast,
      poles,
      integral: integrateContour(
        f,
        resolveAll(contour),
        poles.poles.map((p) => ({ at: p.at, order: p.order })),
      ),
    };
  };

  it("REFUSES when a root's winding number was not decided", () => {
    // A term dropped for an undecided winding is a term missing from a sum still reported as exact,
    // and `∮` would then be wrong by exactly one residue with nothing on screen to say so.
    const { ast, poles, integral } = wedgeIntegral(5);
    const blurred = {
      ...integral,
      windings: integral.windings.map((w, k) => (k === 0 ? { ...w, decided: false } : w)),
    };
    const r = applyResidueTheorem(poles, blurred, ast);
    expect(r.exactValue).toBeUndefined();
    expect(r.verdict.level).toBe("⚠");
    expect(r.verdict.certificates.some((c) => /winding number about the root/.test(c.method))).toBe(true);
  });

  it("REFUSES a root the geometry was never asked about — silence is not a zero", () => {
    const { ast, poles, integral } = wedgeIntegral(5);
    const missing = { ...integral, windings: integral.windings.slice(1) };
    const r = applyResidueTheorem(poles, missing, ast);
    expect(r.exactValue).toBeUndefined();
    expect(r.verdict.level).toBe("⚠");
  });

  it("declines a NON-CONSTANT numerator, whose residues are a different sum", () => {
    // `Res = −zₖ^a/(n b₀)` comes from `P/Q′` with `P` constant. For `(z+1)/(1+z⁵)` the true residue
    // is `−(zₖ² + zₖ)/5`, and a route that read the denominator alone would return `−zₖ/5` — an
    // exact-looking answer to a different question.
    const ast = parse("(z+1)/(1+z^5)");
    const fn = makeComplexFn(ast);
    const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
    const contour = setParam(wedgeTemplate(5, 4), "R", 4);
    const poles = findPoles(ast);
    const a = analyse({ ast, f, poles, contour });
    expect(a.theorem.exactValue).toBeUndefined();
  });

  it("carries a CONSTANT numerator through, rather than dropping it", () => {
    // `3/(1 + z⁵)` is `1/((1/3) + (1/3)z⁵)`: same roots, scaled coefficients. Ignoring the 3 gives a
    // value exactly three times too small — which the quadrature would catch, and which nothing
    // else would.
    const ast = parse("3/(1+z^5)");
    const fn = makeComplexFn(ast);
    const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
    const contour = setParam(wedgeTemplate(5, 4), "R", 4);
    const a = analyse({ ast, f, poles: findPoles(ast), contour });
    expect(a.theorem.exactValue?.text).toBe("−6πi/5·e^(iπ/5)");
    expect(a.theorem.agrees).toBe(true);
    expect(a.theorem.disagreement ?? Infinity).toBeLessThan(1e-13);
  });
});
