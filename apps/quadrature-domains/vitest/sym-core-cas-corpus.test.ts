// =============================================================================
// sym-core-cas-corpus -- check the QD exact engine against a golden corpus computed
// by an EXTERNAL CAS (Sympy). This is the strongest independence in the suite: every
// other test (differentials, the reference fuzz, the GB invariants) is computed inside
// this repo; here the expected values come from a mature, separately-implemented CAS,
// serialized to fixtures/cas-corpus.json and committed. CI consumes only the JSON —
// it does NOT run Python. Regenerate/extend via fixtures/gen-cas-corpus.py.
//
// Conventions were matched to QD when the corpus was authored (resultant sign/arg
// order; realRootCount = DISTINCT real roots; grevlex + variable order). Coefficients
// are ZZ, so a QD result carrying any imaginary part or wrong rational fails the compare.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import _QD from "../app/solver.mjs";
import "../app/sym-core.mjs";

const S: any = (_QD as any).Sym;
const { MPoly, monomialOrder, buchberger, reduceGroebner, resultant, realRootCount } = S;

const corpus: any = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/cas-corpus.json", import.meta.url)), "utf8"));

// --- build a QD MPoly from the corpus term-list [[coeffInt, {var:exp}], ...] ---
function mpolyFromTerms(terms: any[]): any {
  let p = MPoly.zero();
  for (const [c, mono] of terms) {
    let m = MPoly.fromInt(c);
    for (const v of Object.keys(mono)) m = m.mul(MPoly.variable(v).pow(mono[v]));
    p = p.add(m);
  }
  return p;
}

const monoStr = (entries: [string, any][]) => entries.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([k, e]) => `${k}^${e}`).join("*");
const fmtRat = ([n, d]: [string | number, string | number]) => (String(d) === "1" ? String(n) : `${n}/${d}`);

// canonical string of a QD MPoly (real coeffs expected; any imaginary part shows up and fails).
function canonMPoly(p: any): string {
  return p.termList().map((t: any) => {
    let coeff = fmtRat(t.coeff.re);
    if (t.coeff.im[0] !== "0") coeff += `+${fmtRat(t.coeff.im)}i`;
    return `${monoStr(Object.entries(t.mono))}:${coeff}`;
  }).sort().join(" + ");
}
// canonical string of a golden term-list; coeff is an int (resultants) or [n,d] (monic GB).
function canonGolden(terms: any[]): string {
  return terms.map(([c, mono]: any) => `${monoStr(Object.entries(mono))}:${Array.isArray(c) ? fmtRat(c) : String(c)}`).sort().join(" + ");
}
const mapMonoKey = (m: Map<string, any>) => monoStr([...m.entries()]);
const objMonoKey = (o: any) => monoStr(Object.entries(o));

describe(`external-CAS golden corpus (${corpus._generatedBy})`, () => {
  describe("resultants Res_var(f, g) match Sympy", () => {
    for (const rc of corpus.resultants) {
      const label = `Res_${rc.var}( ${JSON.stringify(rc.f)} , ${JSON.stringify(rc.g)} )`;
      it(label, () => {
        const f = mpolyFromTerms(rc.f), g = mpolyFromTerms(rc.g);
        expect(canonMPoly(resultant(f, g, rc.var))).toBe(canonGolden(rc.result));
      });
    }
  });

  describe("real-root counts (distinct) match Sympy", () => {
    for (const rr of corpus.realRootCounts) {
      it(`#realRoots( ${JSON.stringify(rr.p)} ) = ${rr.count}`, () => {
        expect(realRootCount(mpolyFromTerms(rr.p), rr.var)).toBe(rr.count);
      });
    }
  });

  describe("Gröbner (grevlex): leading-monomial set + monic reduced basis match Sympy", () => {
    for (const gb of corpus.groebner) {
      it(`GB of ${JSON.stringify(gb.polys)} over [${gb.vars}]`, () => {
        const ord = monomialOrder("grevlex", gb.vars);
        const G = reduceGroebner(buchberger(gb.polys.map(mpolyFromTerms), ord), ord);
        // leading-monomial set (the initial ideal is unique — a cross-CAS invariant)
        const qdLMs = G.map((g: any) => mapMonoKey(g.leadingMono(ord))).sort();
        const goldLMs = gb.leadingMonomials.map(objMonoKey).sort();
        expect(qdLMs).toEqual(goldLMs);
        // full monic reduced basis (unique ⇒ set-equal after canonicalization)
        const qdBasis = G.map(canonMPoly).sort();
        const goldBasis = gb.monicBasis.map(canonGolden).sort();
        expect(qdBasis).toEqual(goldBasis);
      });
    }
  });
});
