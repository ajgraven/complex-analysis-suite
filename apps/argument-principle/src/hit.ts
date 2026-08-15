// hit.ts — root hit-testing shared by the hover tooltip (§11 F13) and click-to-pin isolate (§11 C7).
//
// Pure geometry: given a world point and the located singularities, return the nearest marked root within
// a world-space tolerance (derived from a pixel radius by the caller), tagged with its kind.

import type { Vec2 } from "./render/plane.js";
import type { Root, Singularities } from "./singularities.js";

export type RootKind = "zero" | "pole" | "critical";

export interface RootHit {
  readonly kind: RootKind;
  readonly root: Root;
  readonly dist: number;
}

/** The nearest zero / pole / critical point to `world` within `tolWorld`, or null if none is close. */
export function nearestRoot(world: Vec2, sing: Singularities, tolWorld: number): RootHit | null {
  let best: RootHit | null = null;
  let bestD = tolWorld;
  const scan = (list: readonly Root[], kind: RootKind): void => {
    for (const r of list) {
      const d = Math.hypot(r.z[0] - world[0], r.z[1] - world[1]);
      if (d <= bestD) {
        bestD = d;
        best = { kind, root: r, dist: d };
      }
    }
  };
  scan(sing.zeros, "zero");
  scan(sing.poles, "pole");
  scan(sing.critical, "critical");
  return best;
}

/**
 * A radius that isolates `center` from every OTHER zero/pole — a fraction of the distance to the nearest
 * neighbour (§11 C7), so the pinned circle encloses just this root. Falls back to a small default when the
 * root stands alone. `exclude` is the picked root itself (compared by reference), so it is not its own
 * neighbour.
 */
export function isolateRadius(center: Vec2, sing: Singularities, exclude: Root): number {
  let nearest = Infinity;
  const scan = (list: readonly Root[]): void => {
    for (const r of list) {
      if (r === exclude) continue;
      const d = Math.hypot(r.z[0] - center[0], r.z[1] - center[1]);
      if (d > 1e-9 && d < nearest) nearest = d;
    }
  };
  scan(sing.zeros);
  scan(sing.poles);
  const r = Number.isFinite(nearest) ? nearest * 0.4 : 0.3;
  return Math.max(0.02, Math.min(r, 4));
}
