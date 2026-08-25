import { describe, it, expect } from "vitest";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import type { Complex } from "@cas/expr/complex";
import { detectRiemannForm } from "../src/riemann/inverse.js";

/** Evaluate an AST at the uniformizer value `t` (bound to the formal `z`). */
const at = (ast: Parameters<typeof makeComplexFn>[0], t: Complex): Complex =>
  makeComplexFn(ast, {})(t, [0, 0]);
const evalStr = (src: string, z: Complex): Complex => makeComplexFn(parse(src), {})(z, [0, 0]);
const close = (a: Complex, b: Complex, tol = 1e-6): boolean =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;

const SAMPLE_T: Complex[] = [
  [1.3, 0.7],
  [-0.9, 1.1],
  [0.4, -1.5],
  [2.0, 0.2],
  [-1.2, -0.6],
  [0.6, 0.6],
];

describe("detectRiemannForm — recognition", () => {
  it("recognizes the invertible primitives (bare)", () => {
    for (const src of ["sqrt(z)", "log(z)", "arcsin(z)", "arccos(z)", "arctan(z)", "z^(1/3)"]) {
      expect(detectRiemannForm(parse(src)), src).not.toBeNull();
    }
  });

  it("recognizes affine-wrapped forms", () => {
    for (const src of ["2*sqrt(z)+1", "sqrt(2*z+1)", "log(z-1)", "(1+i)*log(z)", "-arctan(z)"]) {
      expect(detectRiemannForm(parse(src)), src).not.toBeNull();
    }
  });

  it("declines single-valued / unrecognized maps", () => {
    for (const src of ["z^2", "z+1", "sin(z)", "exp(z)", "1/z", "gamma(z)", "z*sqrt(z)", "sqrt(z)+z"]) {
      expect(detectRiemannForm(parse(src)), src).toBeNull();
    }
  });

  it("reports sheet structure", () => {
    expect(detectRiemannForm(parse("sqrt(z)"))?.sheetCount).toBe(2);
    expect(detectRiemannForm(parse("sqrt(z)"))?.sheetKind).toBe("finite");
    expect(detectRiemannForm(parse("z^(1/5)"))?.sheetCount).toBe(5);
    expect(detectRiemannForm(parse("z^(2/3)"))?.sheetCount).toBe(3);
    expect(detectRiemannForm(parse("log(z)"))?.sheetKind).toBe("infinite");
    expect(detectRiemannForm(parse("log(z)"))?.heightSource).toBe("im");
    expect(detectRiemannForm(parse("sqrt(z)"))?.heightSource).toBe("re");
  });
});

describe("detectRiemannForm — inverse geometry satisfies the defining equation", () => {
  // For each bare primitive, the position z = zFromT(t) and value w = wFromT(t) must satisfy the
  // primitive's forward relation, e.g. √: w² = z, log: eʷ = z, arcsin: sin w = z, pow p/q: wᵈ where
  // forward(w) = z. This proves the parametrization is a faithful (glued) cover of the surface.
  const CASES: { src: string; forward: (w: Complex) => Complex }[] = [
    { src: "sqrt(z)", forward: (w) => evalStr("z*z", w) },
    { src: "log(z)", forward: (w) => evalStr("exp(z)", w) },
    { src: "arcsin(z)", forward: (w) => evalStr("sin(z)", w) },
    { src: "arccos(z)", forward: (w) => evalStr("cos(z)", w) },
    { src: "arctan(z)", forward: (w) => evalStr("tan(z)", w) },
    { src: "z^(1/3)", forward: (w) => evalStr("z*z*z", w) }, // w³ = z
    { src: "z^(2/3)", forward: (w) => evalStr("z*z*z", w) }, // w³ = z^2 (checked below via z^p)
  ];
  for (const { src, forward } of CASES) {
    it(src, () => {
      const form = detectRiemannForm(parse(src));
      expect(form, src).not.toBeNull();
      if (!form) return;
      // For z^(p/q) the relation is wᵍ = zᵖ; for the rest forward(w) = z.
      const powMatch = /z\^\((\d+)\/(\d+)\)/.exec(src);
      for (const t of SAMPLE_T) {
        const z = at(form.zFromT, t);
        const w = at(form.wFromT, t);
        if (powMatch) {
          const p = Number(powMatch[1]);
          const q = Number(powMatch[2]);
          const mulC = (a: Complex, b: Complex): Complex => [
            a[0] * b[0] - a[1] * b[1],
            a[0] * b[1] + a[1] * b[0],
          ];
          const powC = (v: Complex, n: number): Complex => {
            let acc: Complex = [1, 0];
            for (let k = 0; k < n; k++) acc = mulC(acc, v);
            return acc;
          };
          const lhs = powC(w, q); // wᵍ
          const rhs = powC(z, p); // zᵖ
          expect(close(lhs, rhs, 1e-5), `${src} @ t=${t} : w^q=${lhs} z^p=${rhs}`).toBe(true);
        } else {
          expect(close(forward(w), z, 1e-5), `${src} @ t=${t}`).toBe(true);
        }
      }
    });
  }
});

describe("detectRiemannForm — affine wrappers place points correctly", () => {
  it("2*sqrt(z)+1 : z=t², w=2t+1", () => {
    const form = detectRiemannForm(parse("2*sqrt(z)+1"));
    expect(form).not.toBeNull();
    if (!form) return;
    const t: Complex = [1.5, 0];
    expect(close(at(form.zFromT, t), [2.25, 0])).toBe(true); // t² = 2.25
    expect(close(at(form.wFromT, t), [4, 0])).toBe(true); // 2·1.5 + 1 = 4
  });

  it("sqrt(2*z+1) : u=t² ⇒ z=(t²−1)/2, w=t", () => {
    const form = detectRiemannForm(parse("sqrt(2*z+1)"));
    expect(form).not.toBeNull();
    if (!form) return;
    const t: Complex = [3, 0];
    expect(close(at(form.zFromT, t), [4, 0])).toBe(true); // (9−1)/2 = 4
    expect(close(at(form.wFromT, t), [3, 0])).toBe(true); // w = t
    // sanity: f(z) at that z equals w on the principal sheet (Re t > 0)
    expect(close(evalStr("sqrt(2*z+1)", [4, 0]), [3, 0])).toBe(true);
  });

  it("the two √z sheets meet over z=1 at opposite Re-t heights (t = w for √)", () => {
    // The shader lifts by the uniformizer t (= the value w for √). t = ±1 map to the same z = 1 at
    // heights ±1 — the two sheets. wFromT is checked here because t = w for √, so Re w = Re t.
    const form = detectRiemannForm(parse("sqrt(z)"));
    expect(form).not.toBeNull();
    if (!form) return;
    const zPlus = at(form.zFromT, [1, 0]);
    const zMinus = at(form.zFromT, [-1, 0]);
    expect(close(zPlus, [1, 0])).toBe(true);
    expect(close(zMinus, [1, 0])).toBe(true); // same z
    // t = +1 → height Re t = +1 (and w = t = +1); t = −1 → height −1 (the other sheet).
    expect(at(form.wFromT, [1, 0])[0]).toBeCloseTo(1, 6);
    expect(at(form.wFromT, [-1, 0])[0]).toBeCloseTo(-1, 6);
  });

  it("log helicoid: same z=1 at Im-t heights 0 and 2π (t = w for log)", () => {
    const form = detectRiemannForm(parse("log(z)"));
    expect(form).not.toBeNull();
    if (!form) return;
    const z0 = at(form.zFromT, [0, 0]);
    const z1 = at(form.zFromT, [0, 2 * Math.PI]);
    expect(close(z0, [1, 0])).toBe(true);
    expect(close(z1, [1, 0], 1e-5)).toBe(true); // e^{2πi} = 1
    // t = w for log, so Im w = Im t: the two turns sit at heights 0 and 2π.
    expect(at(form.wFromT, [0, 0])[1]).toBeCloseTo(0, 6);
    expect(at(form.wFromT, [0, 2 * Math.PI])[1]).toBeCloseTo(2 * Math.PI, 6);
  });

  it("pow window bounds the corner |z| = |t|^q for high roots (no giant lobes / overflow)", () => {
    const cases: [string, number][] = [
      ["sqrt(z)", 2],
      ["z^(1/3)", 3],
      ["z^(1/6)", 6],
      ["z^(1/8)", 8],
      ["z^(1/20)", 20],
    ];
    for (const [src, q] of cases) {
      const form = detectRiemannForm(parse(src));
      expect(form, src).not.toBeNull();
      if (!form) continue;
      const cornerT = form.window(3).halfX * Math.SQRT2; // |t| at a square corner
      const cornerZ = Math.pow(cornerT, q); // |z| = |t|^q there
      expect(cornerZ, `${src} corner |z|`).toBeLessThan(12);
      expect(cornerZ, `${src} corner |z|`).toBeGreaterThan(3); // still a useful region
    }
  });
});

describe("detectRiemannForm — adversarial recognition", () => {
  it("recognizes nested affine wrappers", () => {
    for (const src of [
      "sqrt((2+i)*z - 1) + 3",
      "arctan(z)/2",
      "-2*log(z)",
      "3 - sqrt(z)",
      "z^(7/3)",
      "z^(-1/2)",
    ]) {
      expect(detectRiemannForm(parse(src)), src).not.toBeNull();
    }
  });

  it("declines integer powers and non-affine inners", () => {
    for (const src of ["z^2", "z^3", "z^1", "z^0", "sqrt(z^2)", "1/sqrt(z)", "sqrt(z*z)", "log(z^2)"]) {
      expect(detectRiemannForm(parse(src)), src).toBeNull();
    }
  });

  it("z^(7/3) has 3 sheets (denominator), phase winds 7×", () => {
    const form = detectRiemannForm(parse("z^(7/3)"));
    expect(form?.sheetCount).toBe(3);
    expect(form?.monodromy).toContain("7×");
  });

  it("affine √: w = √((2+i)z−1)+3 satisfies (w−3)² = (2+i)z − 1", () => {
    const form = detectRiemannForm(parse("sqrt((2+i)*z - 1) + 3"));
    expect(form).not.toBeNull();
    if (!form) return;
    const mulC = (a: Complex, b: Complex): Complex => [
      a[0] * b[0] - a[1] * b[1],
      a[0] * b[1] + a[1] * b[0],
    ];
    for (const t of SAMPLE_T) {
      const z = at(form.zFromT, t);
      const w = at(form.wFromT, t);
      const wm3: Complex = [w[0] - 3, w[1]];
      const lhs = mulC(wm3, wm3); // (w−3)²
      const rhs = evalStr("(2+i)*z - 1", z); // (2+i)z − 1
      expect(close(lhs, rhs, 1e-5), `t=${t}: (w-3)²=${lhs} vs ${rhs}`).toBe(true);
    }
  });
});

describe("detectRiemannForm — window scales with sheet count", () => {
  it("log window height grows with N (helicoid turns)", () => {
    const form = detectRiemannForm(parse("log(z)"));
    expect(form).not.toBeNull();
    if (!form) return;
    expect(form.window(1).halfY).toBeCloseTo(Math.PI, 6);
    expect(form.window(3).halfY).toBeCloseTo(3 * Math.PI, 6);
  });
});

describe("detectRiemannForm — branch cut rays (B1)", () => {
  const dir = (src: string) => {
    const f = detectRiemannForm(parse(src));
    if (!f) throw new Error(`no form for ${src}`);
    return f.cutRays;
  };
  it("√z / log z / z^(1/n) cut along the negative real axis from 0", () => {
    for (const src of ["sqrt(z)", "log(z)", "z^(1/3)"]) {
      const rays = dir(src);
      expect(rays.length, src).toBe(1);
      expect(rays[0].origin[0]).toBeCloseTo(0, 9);
      expect(rays[0].origin[1]).toBeCloseTo(0, 9);
      expect(rays[0].dir[0]).toBeCloseTo(-1, 9); // pointing toward −∞ along the real axis
      expect(rays[0].dir[1]).toBeCloseTo(0, 9);
    }
  });
  it("affine sqrt(z − 1) moves the branch point to z = 1, cut still along −x", () => {
    const rays = dir("sqrt(z - 1)");
    expect(rays.length).toBe(1);
    expect(rays[0].origin[0]).toBeCloseTo(1, 9);
    expect(rays[0].origin[1]).toBeCloseTo(0, 9);
    expect(rays[0].dir[0]).toBeCloseTo(-1, 9);
  });
  it("arcsin has two cuts, from +1 (toward +∞) and −1 (toward −∞)", () => {
    const rays = dir("arcsin(z)");
    expect(rays.length).toBe(2);
    const origins = rays.map((r) => r.origin[0]).sort((a, b) => a - b);
    expect(origins[0]).toBeCloseTo(-1, 9);
    expect(origins[1]).toBeCloseTo(1, 9);
    const atPlus = rays.find((r) => r.origin[0] > 0)!;
    expect(atPlus.dir[0]).toBeCloseTo(1, 9); // [1, ∞)
  });
  it("arctan cuts run along the imaginary axis from ±i", () => {
    const rays = dir("arctan(z)");
    expect(rays.length).toBe(2);
    for (const r of rays) {
      expect(r.origin[0]).toBeCloseTo(0, 9);
      expect(Math.abs(r.origin[1])).toBeCloseTo(1, 9); // at ±i
      expect(Math.abs(r.dir[1])).toBeCloseTo(1, 9); // vertical
      expect(r.dir[0]).toBeCloseTo(0, 9);
    }
  });
});
