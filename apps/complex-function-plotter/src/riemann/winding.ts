/**
 * The winding number of a closed base-plane loop about a point — the signed integer count of times the loop
 * encircles it, `(1/2π) ∮ d·arg(z − center)`. This is the loop's homotopy class in ℂ∖{center}, i.e. **exact
 * integer topology** (`=`), in deliberate contrast to the monodromy explorer's `≈` sheet permutation: the
 * winding is the *topological input* the permutation depends on, and it is certain where the permutation is
 * only estimated. Pure; unit-tested.
 */
import type { Complex } from "@cas/expr/complex";

/**
 * The winding number of `loop` (treated as closed — the last point joins back to the first) about `center`.
 * Sums the signed incremental angle `atan2(a×b, a·b)` of the ray `z − center` across each edge — robust to
 * how the loop is sampled — and rounds to the nearest integer. Returns 0 for a degenerate loop (< 3 points)
 * or when the loop passes through `center` (winding undefined there).
 */
export function windingNumber(loop: readonly Complex[], center: Complex): number {
  const n = loop.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % n];
    const ax = a[0] - center[0];
    const ay = a[1] - center[1];
    const bx = b[0] - center[0];
    const by = b[1] - center[1];
    if ((ax === 0 && ay === 0) || (bx === 0 && by === 0)) return 0; // on the center — winding is undefined
    total += Math.atan2(ax * by - ay * bx, ax * bx + ay * by); // signed angle from a→b in (−π, π]
  }
  return Math.round(total / (2 * Math.PI)) || 0; // `|| 0` normalises −0 (and any NaN) to +0
}
