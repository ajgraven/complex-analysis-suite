/**
 * Recognizer for **implicit** algebraic Riemann surfaces (M2c, ADR-0031): a bivariate complex polynomial
 * `F(w, z) = 0` entered directly, covering the general algebraic curve — including the ones with no radical
 * form (`w³ − w − z`, a quintic). Unlike the radical recognizer (M2a/M2b), the sheets here are the roots of
 * `F(·, z) = 0`, solved per vertex, so this is the plotter's first consumer of `@cas/core` `rootsMonic`.
 *
 * `detectImplicitCurve` expands `F` into its `w`-coefficients (`implicitPoly.parseImplicitNumeric`), then
 * returns a `sheetsAt(z)` that Horner-evaluates each `aₖ(z)` and solves the ascending coefficient list for its
 * `n = deg_w F` roots — the sheet values the M2 mesh + every M3 exploration tool already consume. Where the
 * leading coefficient `aₙ(z)` vanishes the degree drops and `rootsMonic` returns fewer roots, so that vertex
 * has fewer sheets and the mesh drops it as a hole (a pole/branch at ∞) — never a wall. Because `F` is entered
 * directly there are **no spurious branches** (every root is a genuine sheet). Pure: no DOM/GL; unit-tested.
 */
import type { Node } from "@cas/expr/ast";
import type { Complex } from "@cas/expr/complex";
import { rootsMonic } from "@cas/core";
import { parseImplicitNumeric } from "./implicitPoly.js";

/** A recognized implicit curve: its per-vertex root enumerator, sheet count (`deg_w F`), and a label. */
export interface ImplicitCurve {
  /** The `deg_w F` roots of `F(·, z) = 0` — the sheet values over `z` (fewer where `aₙ(z) = 0`). */
  sheetsAt: (z: Complex) => Complex[];
  /** `deg_w F` — the generic sheet count. */
  degreeW: number;
  /** Short label for the badge. */
  label: string;
}

/** The largest `deg_w F` we render (a perf + legibility cap, mirroring the radical `MAX_SHEETS`). */
const MAX_DEGREE = 8;

/** Horner evaluation of an ascending complex-coefficient polynomial at `z`. */
function horner(coeffs: readonly Complex[], z: Complex): Complex {
  let acc: Complex = [0, 0];
  for (let j = coeffs.length - 1; j >= 0; j--) {
    const re = acc[0] * z[0] - acc[1] * z[1] + coeffs[j][0];
    const im = acc[0] * z[1] + acc[1] * z[0] + coeffs[j][1];
    acc = [re, im];
  }
  return acc;
}

/**
 * Recognize `ast` as an implicit bivariate polynomial `F(w, z)` and return its root-solve surface, or null
 * (not a constant-coefficient polynomial in `w`, `z`; degree `< 2` — single-valued; or `> MAX_DEGREE`).
 */
export function detectImplicitCurve(ast: Node): ImplicitCurve | null {
  const poly = parseImplicitNumeric(ast);
  if (!poly) return null;
  const { wCoeffs, degreeW } = poly;
  if (degreeW < 2 || degreeW > MAX_DEGREE) return null; // < 2 is single-valued; a cap for perf/legibility
  const sheetsAt = (z: Complex): Complex[] => {
    const coeffs: Complex[] = [];
    for (let k = 0; k <= degreeW; k++) coeffs.push(horner(wCoeffs[k], z));
    // Ascending coefficients; rootsMonic trims a near-zero leading coeff (degree drop ⇒ fewer sheets, a hole).
    return rootsMonic(coeffs);
  };
  return { sheetsAt, degreeW, label: "implicit curve" };
}
