// presets.ts — a gallery of elementary conformal maps (catalog item A19).
//
// The building blocks a Riemann-map studio starts from: the classic textbook maps, each a valid
// @cas/expr source. Pure data; presets.test.ts asserts every one compiles and evaluates finitely.
export interface MapPreset {
  readonly id: string;
  readonly name: string;
  /** An @cas/expr source string in `z` (and the constants i, e, pi). */
  readonly expr: string;
}

export const MAP_PRESETS: readonly MapPreset[] = [
  { id: "joukowski", name: "Joukowski  z + 1/z", expr: "z + 1/z" },
  { id: "square", name: "z²", expr: "z*z" },
  { id: "cube", name: "z³", expr: "z*z*z" },
  { id: "inversion", name: "1/z  (inversion)", expr: "1/z" },
  { id: "mobius", name: "Möbius  (z−1)/(z+1)", expr: "(z - 1)/(z + 1)" },
  { id: "cayley", name: "Cayley  (z−i)/(z+i)", expr: "(z - i)/(z + i)" },
  { id: "blaschke", name: "Blaschke  z(z−½)/(1−½z)", expr: "z*(z - 0.5)/(1 - 0.5*z)" },
  { id: "exp", name: "exp z", expr: "exp(z)" },
  { id: "log", name: "log z", expr: "log(z)" },
  { id: "sqrt", name: "√z", expr: "sqrt(z)" },
  { id: "sin", name: "sin z", expr: "sin(z)" },
  { id: "tan", name: "tan z", expr: "tan(z)" },
  { id: "conjugate", name: "z̄  (anti-holomorphic)", expr: "conjugate(z)" },
] as const;

/** The preset id whose expression matches `expr`, or null (used to sync the picker to a typed edit). */
export function presetIdForExpr(expr: string): string | null {
  const norm = expr.replace(/\s+/g, "");
  const hit = MAP_PRESETS.find((p) => p.expr.replace(/\s+/g, "") === norm);
  return hit ? hit.id : null;
}
