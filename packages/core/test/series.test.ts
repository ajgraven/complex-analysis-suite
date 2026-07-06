import { describe, expect, it } from "vitest";
import { makeSeries, objAlgebra, tupleAlgebra, type ComplexAlgebra } from "../src/index.js";

// Golden corpus for the shared truncated-series multiply, through both reference algebras.
// Pins correctness, representation invariance (bit-identical products), truncation, sparse
// handling, and ragged input lengths.

type RI = [number, number];

const toSeries = <C>(alg: ComplexAlgebra<C>, ri: RI[]): C[] => ri.map(([re, im]) => alg.make(re, im));
const fromSeries = <C>(alg: ComplexAlgebra<C>, s: C[]): RI[] => s.map((z) => [alg.re(z), alg.im(z)]);
const riEqual = (a: RI[], b: RI[]): boolean =>
  a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);

function mulRI<C>(alg: ComplexAlgebra<C>, a: RI[], b: RI[], order: number): RI[] {
  return fromSeries(alg, makeSeries(alg).mul(toSeries(alg, a), toSeries(alg, b), order));
}

const CASES: { name: string; a: RI[]; b: RI[]; order: number; want: RI[] }[] = [
  { name: "(1+x)^2", a: [[1, 0], [1, 0]], b: [[1, 0], [1, 0]], order: 2, want: [[1, 0], [2, 0], [1, 0]] },
  { name: "(1+2x)(3+4x)", a: [[1, 0], [2, 0]], b: [[3, 0], [4, 0]], order: 2, want: [[3, 0], [10, 0], [8, 0]] },
  { name: "(1+ix)(1-ix)", a: [[1, 0], [0, 1]], b: [[1, 0], [0, -1]], order: 2, want: [[1, 0], [0, 0], [1, 0]] },
  { name: "truncate (1+x)^2 to order 1", a: [[1, 0], [1, 0]], b: [[1, 0], [1, 0]], order: 1, want: [[1, 0], [2, 0]] },
  {
    name: "sparse (1+2x^2)(1+3x^2)",
    a: [[1, 0], [0, 0], [2, 0]],
    b: [[1, 0], [0, 0], [3, 0]],
    order: 4,
    want: [[1, 0], [0, 0], [5, 0], [0, 0], [6, 0]],
  },
];

describe("makeSeries.mul (truncated convolution, both representations)", () => {
  function check<C>(label: string, alg: ComplexAlgebra<C>): void {
    for (const c of CASES) {
      it(`${label}: ${c.name}`, () => {
        expect(riEqual(mulRI(alg, c.a, c.b, c.order), c.want)).toBe(true);
      });
    }
  }
  check("obj", objAlgebra);
  check("tuple", tupleAlgebra);

  it("obj and tuple multiply bit-identically", () => {
    for (const c of CASES) {
      expect(riEqual(mulRI(objAlgebra, c.a, c.b, c.order), mulRI(tupleAlgebra, c.a, c.b, c.order))).toBe(true);
    }
  });

  it("handles inputs shorter than the order (missing coeffs = 0)", () => {
    // (1 + x) · (2), order 3 → 2 + 2x
    expect(riEqual(mulRI(objAlgebra, [[1, 0], [1, 0]], [[2, 0]], 3), [[2, 0], [2, 0], [0, 0], [0, 0]])).toBe(true);
  });

  it("constructors and product have length order+1", () => {
    const s = makeSeries(objAlgebra);
    expect(s.zeros(3).length).toBe(4);
    expect(s.unit(3).length).toBe(4);
    expect(s.mul(toSeries(objAlgebra, [[1, 0]]), toSeries(objAlgebra, [[1, 0]]), 5).length).toBe(6);
  });
});
