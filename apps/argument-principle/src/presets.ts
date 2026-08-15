// presets.ts — the gallery of functions f(z) the reference applet ships, each a valid @cas/expr source.
//
// Pure data; presets.test.ts asserts every one parses and evaluates finitely at generic points.
// Polynomials/rationals are written with explicit `*` (bulletproof at z = 0, and the natural form for
// the later rational zero/pole finder); the transcendental entries use the builtin names.

export interface FunctionPreset {
  readonly id: string;
  /** Display label (typeset later with KaTeX). */
  readonly name: string;
  /** An @cas/expr source string in `z` (and constants i, e, pi). */
  readonly expr: string;
}

export const FUNCTION_PRESETS: readonly FunctionPreset[] = [
  { id: "rational-square", name: "z² / (z² + 1)", expr: "z*z/(z*z + 1)" },
  { id: "cube-minus-one", name: "z³ − 1", expr: "z*z*z - 1" },
  { id: "sinc", name: "sin(z) / z", expr: "sin(z)/z" },
  { id: "exp-minus-one", name: "exp(z) − 1", expr: "exp(z) - 1" },
  { id: "z-plus-inverse", name: "z + 1/z", expr: "z + 1/z" },
  { id: "double-root", name: "(z − 1)²(z + i)", expr: "(z - 1)*(z - 1)*(z + i)" },
  { id: "tan", name: "tan(z)", expr: "tan(z)" },
  { id: "rational-pole", name: "z(z + 1)/(z − 1)", expr: "z*(z + 1)/(z - 1)" },
] as const;

/** The preset id whose expression matches `expr`, or null (used to sync the picker to a typed edit). */
export function presetIdForExpr(expr: string): string | null {
  const norm = expr.replace(/\s+/g, "");
  const hit = FUNCTION_PRESETS.find((p) => p.expr.replace(/\s+/g, "") === norm);
  return hit ? hit.id : null;
}
