// map.ts — the executable form of a user map φ (catalog items A1 + S3).
//
// One parsed AST drives BOTH backends the tool needs (the keystone, ADR-0005): a JS closure for CPU
// work (orbits, curve pushforward, invariants, tests) and a GLSL body for the per-pixel shader. When
// φ is holomorphic we also carry its symbolic derivative φ′ (JS + GLSL) for the amplitwist readout and
// the distortion render modes; for anti-holomorphic / non-differentiable maps φ′ is null and callers
// fall back to a finite difference. Pure and DOM-free, so it unit-tests directly.
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { differentiate } from "@cas/expr/derivative";
import { toLatex } from "@cas/expr/latex";
import type { MapState } from "./viewState.js";

/** The JS evaluator's signature: (z, c) → w, on `[re, im]` tuples (the @cas/expr complex rep). */
export type ComplexFn = ReturnType<typeof makeComplexFn>;

/** A compiled map: the JS evaluator, the GLSL `cvec fFn(cvec z, cvec c)` body, φ′ (or null), latex. */
export interface CompiledMap {
  readonly jsFn: ComplexFn;
  /** Symbolic ∂φ/∂z as a JS evaluator, or null for anti-holomorphic / non-differentiable maps. */
  readonly jsDeriv: ComplexFn | null;
  /** KaTeX-ready LaTeX for the map (falls back to the raw source if typesetting fails). */
  readonly latex: string;
}

/** Result of compiling a user map: either the compiled map, or a human-readable parse/compile error. */
export type MapResult = { readonly ok: true; readonly map: CompiledMap } | { readonly ok: false; readonly error: string };

/**
 * Compile a {@link MapState} into its executable + renderable forms. Never throws: a malformed
 * expression comes back as `{ ok: false, error }` so the UI can show the message inline.
 */
export function compileMap(state: MapState): MapResult {
  let ast;
  try {
    ast = parse(state.expr);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  try {
    const jsFn = makeComplexFn(ast);

    // φ′: only when φ is genuinely holomorphic. `conjugate` has no holomorphic ∂/∂z, so skip it (the
    // symbolic pass could otherwise return a misleading result); callers finite-difference instead.
    let jsDeriv: ComplexFn | null = null;
    if (!/conjugate/.test(state.expr)) {
      try {
        jsDeriv = makeComplexFn(differentiate(ast, "z"));
      } catch {
        jsDeriv = null;
      }
    }

    let latex: string;
    try {
      latex = toLatex(ast);
    } catch {
      latex = state.expr;
    }
    return { ok: true, map: { jsFn, jsDeriv, latex } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** φ′ at z (holding the family parameter c): the symbolic derivative when available, else a central
 *  finite difference of φ in z (honest ≈). `c` defaults to the origin for maps that don't use it. */
export function derivativeAt(
  map: CompiledMap,
  z: readonly [number, number],
  c: readonly [number, number] = [0, 0],
): [number, number] {
  const cc: [number, number] = [c[0], c[1]];
  if (map.jsDeriv) {
    const d = map.jsDeriv([z[0], z[1]], cc);
    return [d[0], d[1]];
  }
  const h = 1e-4 * Math.max(1, Math.hypot(z[0], z[1]));
  const zp = map.jsFn([z[0] + h, z[1]], cc);
  const zm = map.jsFn([z[0] - h, z[1]], cc);
  return [(zp[0] - zm[0]) / (2 * h), (zp[1] - zm[1]) / (2 * h)];
}
