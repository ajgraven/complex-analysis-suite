import { describe, expect, it } from "vitest";
import { makePoly, objAlgebra, tupleAlgebra, type Cx, type ComplexTuple } from "../src/index.js";

// Golden corpus for the generic dense-polynomial arithmetic (the TS port of QD.Poly). It pins:
//   - correctness (hand-computed products, powers, (z−z0)^m, Horner eval, monic normalize),
//   - the LOAD-BEARING trimming convention (add/mul/scale do NOT trim; `trim` is separate — the
//     σ⁻¹ root count is the degree), and
//   - representation invariance (objAlgebra {re,im} and tupleAlgebra [re,im] agree exactly).

const P = makePoly(objAlgebra);
const c = (re: number, im = 0): Cx => ({ re, im });
/** A polynomial as flat [re,im,re,im,…] for compact golden assertions (+0 normalises a signed −0). */
const flat = (p: Cx[]): number[] => p.flatMap((z) => [z.re + 0, z.im + 0]);

describe("makePoly — constructors", () => {
  it("zero / one / variable", () => {
    expect(flat(P.zero())).toEqual([0, 0]);
    expect(flat(P.one())).toEqual([1, 0]);
    expect(flat(P.variable())).toEqual([0, 0, 1, 0]); // 0 + 1·z
  });
});

describe("makePoly — arithmetic (hand-computed goldens)", () => {
  it("mul: (1 + z)(−1 + z) = −1 + 0·z + z²", () => {
    expect(flat(P.mul([c(1), c(1)], [c(-1), c(1)]))).toEqual([-1, 0, 0, 0, 1, 0]);
  });

  it("pow: z³ = [0,0,0,1]", () => {
    expect(flat(P.pow(P.variable(), 3))).toEqual([0, 0, 0, 0, 0, 0, 1, 0]);
  });

  it("scale by a complex scalar i: i·(1 + z) = i + i·z", () => {
    expect(flat(P.scale([c(1), c(1)], c(0, 1)))).toEqual([0, 1, 0, 1]);
  });

  it("neg negates every coefficient", () => {
    expect(flat(P.neg([c(1), c(-2), c(3)]))).toEqual([-1, 0, 2, 0, -3, 0]);
  });

  it("linearPower: (z − 2)³ = −8 + 12z − 6z² + z³", () => {
    expect(flat(P.linearPower(c(2), 3))).toEqual([-8, 0, 12, 0, -6, 0, 1, 0]);
  });

  it("linearPower with a complex root: (z − i)² = −1 − 2i·z + z²", () => {
    expect(flat(P.linearPower(c(0, 1), 2))).toEqual([-1, 0, 0, -2, 1, 0]);
  });
});

describe("makePoly — eval + monic", () => {
  it("eval by Horner: (z−2)³ is 0 at z=2 and 1 at z=3", () => {
    const p = P.linearPower(c(2), 3);
    expect(flat([P.eval(p, c(2))])).toEqual([0, 0]);
    expect(flat([P.eval(p, c(3))])).toEqual([1, 0]);
  });

  it("monic divides through by the leading coefficient", () => {
    // 2 + 4z + 2z²  ÷ 2  =  1 + 2z + z²
    expect(flat(P.monic([c(2), c(4), c(2)]))).toEqual([1, 0, 2, 0, 1, 0]);
  });
});

describe("makePoly — trimming convention (load-bearing)", () => {
  it("trim drops trailing ~0 coefficients but keeps the constant term", () => {
    // The 1e-15 leading is dropped, then the now-trailing exact 0 is too → the bare constant [1].
    expect(flat(P.trim([c(1), c(0), c(1e-15)]))).toEqual([1, 0]);
    // A genuine middle coefficient is kept (only TRAILING near-zeros drop).
    expect(flat(P.trim([c(1), c(0), c(5)]))).toEqual([1, 0, 0, 0, 5, 0]);
    expect(flat(P.trim([c(0), c(0), c(0)]))).toEqual([0, 0]); // all-zero → the constant [0]
  });

  it("add and mul do NOT trim — the degree is preserved (σ⁻¹ root count depends on it)", () => {
    // (0 + z) + (0 − z) = 0 + 0·z : length 2, NOT collapsed to [0].
    const s = P.add([c(0), c(1)], [c(0), c(-1)]);
    expect(s.length).toBe(2);
    expect(flat(s)).toEqual([0, 0, 0, 0]);
    // A product whose top coefficient is exactly zero keeps its slot.
    const m = P.mul([c(1), c(0)], [c(1), c(0)]); // (1)(1) padded to length 2 each → length 3
    expect(m.length).toBe(3);
  });
});

describe("makePoly — representation invariance (obj vs tuple)", () => {
  const T = makePoly(tupleAlgebra);
  const tflat = (p: ComplexTuple[]): number[] => p.flatMap((z) => [z[0], z[1]]);

  it("obj and tuple give bit-identical coefficients through a mixed op sequence", () => {
    const obj = P.trim(P.add(P.mul(P.linearPower(c(0.3, -0.7), 3), [c(2, 1), c(-1)]), P.scale(P.pow(P.variable(), 2), c(0, 1))));
    const t = tupleAlgebra;
    const T2 = T;
    const tup = T2.trim(
      T2.add(
        T2.mul(T2.linearPower(t.make(0.3, -0.7), 3), [t.make(2, 1), t.make(-1, 0)]),
        T2.scale(T2.pow(T2.variable(), 2), t.make(0, 1)),
      ),
    );
    expect(tflat(tup)).toEqual(flat(obj));
  });
});
