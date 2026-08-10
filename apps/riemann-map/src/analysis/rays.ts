// rays.ts — external rays of a filled Julia set (catalog item D5), on the shared @cas/dynamics tracer.
//
// The dynamical-plane external ray at angle θ is φ_B⁻¹({r·e^{2πiθ}: r>1}) — the image of a straight ray
// under the inverse Böttcher map — landing on ∂K at "external angle θ". @cas/dynamics' dynamicRay traces
// it, but only for the quadratic family z² + c (its Newton recurrence is hardcoded to that family), so we
// first recognise the entered map as z² + c and read off c. Pure → node-tested.
import { parse } from "@cas/expr/parser";
import { fToRational } from "@cas/expr/rational";
import { dynamicRay } from "@cas/dynamics";

type V2 = [number, number];
const isZero = (z: readonly [number, number]): boolean => z[0] === 0 && z[1] === 0;
function cdiv(a: readonly [number, number], b: readonly [number, number]): V2 {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}
function polyDeg(p: ReadonlyArray<readonly [number, number]>): number {
  for (let i = p.length - 1; i >= 0; i--) if (!isZero(p[i])) return i;
  return -1;
}

/** If `expr` is a monic quadratic z² + c (the family @cas/dynamics' ray tracer supports), return c; else null. */
export function quadraticJuliaC(expr: string): V2 | null {
  let ast;
  try {
    ast = parse(expr);
  } catch {
    return null;
  }
  const rat = fToRational(ast, [0, 0], [0, 0]);
  if (!rat) return null;
  const { num, den } = rat;
  // den must be a non-zero constant (so f is a polynomial).
  if (den.length === 0 || isZero(den[0])) return null;
  for (let i = 1; i < den.length; i++) if (!isZero(den[i])) return null;
  const d0 = den[0];
  // num must be exactly degree 2, with no linear term, and monic after dividing by den.
  if (polyDeg(num) !== 2) return null;
  if (!isZero(num[1])) return null;
  const lead = cdiv(num[2], d0);
  if (Math.abs(lead[0] - 1) > 1e-9 || Math.abs(lead[1]) > 1e-9) return null;
  return cdiv(num[0] ?? [0, 0], d0); // c = f(0)
}

export interface ExternalRay {
  readonly angle: number;
  readonly pts: V2[];
}

/** Trace the external rays of the filled Julia set of `expr` at the given angles, or null if not z²+c. */
export function juliaExternalRays(expr: string, angles: readonly number[]): ExternalRay[] | null {
  const c = quadraticJuliaC(expr);
  if (!c) return null;
  return angles.map((a) => ({ angle: a, pts: dynamicRay(a, [c[0], c[1]]) as V2[] }));
}

/** A modest dyadic fan of external angles for the default overlay. */
export const DEFAULT_RAY_ANGLES: readonly number[] = [0, 1 / 8, 1 / 4, 3 / 8, 1 / 2, 5 / 8, 3 / 4, 7 / 8];
