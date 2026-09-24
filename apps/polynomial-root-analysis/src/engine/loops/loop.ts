// Loops in the aⱼ-plane (DESIGN §2, §4.4): a loop is a WORD — lassos round the branch points of aⱼ,
// hand-drawn polygons, inverses, products and commutators — and is carried as that word (the permalink
// carries the tree, never samples). `loopPath` turns a word into the one thing the certified tracker
// takes: a closed polyline of aⱼ values starting and ending at aⱼ's current value.
//
// A lasso is TETHERED: from the base point out to a small circle round its branch point, once round,
// and back the same way. The tether must not pass near another branch point — a lasso whose tether
// crosses one is a different loop (a conjugate of the one meant, or worse, a loop round two points) —
// so a straight tether is used when it is clear, and otherwise one bent through a waypoint to either
// side, the first that is clear. The routing is geometry chosen for legibility; what the loop DOES is
// decided afterwards, by the tracker, and never assumed from the picture.
import type { Cx } from "../types.js";

export type Loop =
  | { readonly kind: "lasso"; readonly point: number; readonly sign: 1 | -1 }
  | { readonly kind: "word"; readonly parts: readonly Loop[] }
  | { readonly kind: "inverse"; readonly of: Loop }
  | { readonly kind: "commutator"; readonly a: Loop; readonly b: Loop }
  | { readonly kind: "drawn"; readonly vertices: readonly Cx[] };

export interface LoopContext {
  /** The coefficient the loop moves. */
  readonly coefficient: number;
  /** aⱼ's current value — every loop starts and ends here. */
  readonly base: Cx;
  /** The branch points of aⱼ (PRA-2), in the order the Analysis card numbers them. */
  readonly branchPoints: readonly Cx[];
  /** Per branch point, a radius its exact disc is known to lie within (0 when only numeric). */
  readonly branchRadii: readonly number[];
}

export type PathResult =
  | { readonly ok: true; readonly path: readonly Cx[] }
  | { readonly ok: false; readonly reason: string };

/** Vertices on a lasso's circle. */
export const LASSO_VERTICES = 24;

const dist = (a: Cx, b: Cx): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Distance from point p to the segment [a, b]. */
export function segmentDistance(p: Cx, a: Cx, b: Cx): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  const t =
    L2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** The radius of the circle round branch point k: well inside the gap to its neighbours and the base. */
export function lassoRadius(ctx: LoopContext, k: number): number {
  const b = ctx.branchPoints[k];
  let gap = dist(b, ctx.base);
  ctx.branchPoints.forEach((q, i) => {
    if (i !== k) gap = Math.min(gap, dist(b, q));
  });
  return 0.3 * gap;
}

/** Is the polyline clear of every branch point but `except`, by at least that point's own lasso radius? */
function clear(poly: readonly Cx[], ctx: LoopContext, except: number): boolean {
  for (let i = 0; i < ctx.branchPoints.length; i++) {
    if (i === except) continue;
    const r = lassoRadius(ctx, i);
    for (let s = 0; s + 1 < poly.length; s++)
      if (segmentDistance(ctx.branchPoints[i], poly[s], poly[s + 1]) < r) return false;
  }
  return true;
}

function lassoPath(ctx: LoopContext, k: number, sign: 1 | -1): PathResult {
  const b = ctx.branchPoints[k];
  if (!b)
    return {
      ok: false,
      reason: `there is no branch point #${k + 1} of a${ctx.coefficient}`,
    };
  const r = lassoRadius(ctx, k);
  if (!(r > 0))
    return {
      ok: false,
      reason: `branch point #${k + 1} sits on the current value of a${ctx.coefficient}`,
    };
  const base = ctx.base;
  // Candidate tethers: straight, then through a waypoint to the left or right of the straight line,
  // further out each time.
  const d = dist(base, b);
  const ux = (b[0] - base[0]) / d;
  const uy = (b[1] - base[1]) / d;
  const vias: (Cx | null)[] = [null];
  for (const s of [0.35, -0.35, 0.7, -0.7, 1.2, -1.2]) {
    vias.push([base[0] + (ux * d) / 2 - uy * s * d, base[1] + (uy * d) / 2 + ux * s * d]);
  }
  for (const via of vias) {
    const from = via ?? base;
    const th = Math.atan2(from[1] - b[1], from[0] - b[0]);
    const entry: Cx = [b[0] + r * Math.cos(th), b[1] + r * Math.sin(th)];
    const tether: Cx[] = via ? [base, via, entry] : [base, entry];
    if (!clear(tether, ctx, k)) continue;
    const ring: Cx[] = [];
    for (let m = 1; m < LASSO_VERTICES; m++) {
      const a = th + (sign * 2 * Math.PI * m) / LASSO_VERTICES;
      ring.push([b[0] + r * Math.cos(a), b[1] + r * Math.sin(a)]);
    }
    return {
      ok: true,
      path: [...tether, ...ring, entry, ...[...tether].reverse().slice(1)],
    };
  }
  return {
    ok: false,
    reason: `no tether from a${ctx.coefficient} to branch point #${k + 1} stays clear of the others — draw this loop by hand`,
  };
}

/** The closed polyline of aⱼ values a loop word travels, from the base and back to it. */
export function loopPath(loop: Loop, ctx: LoopContext): PathResult {
  switch (loop.kind) {
    case "lasso":
      return lassoPath(ctx, loop.point, loop.sign);
    case "inverse": {
      const r = loopPath(loop.of, ctx);
      return r.ok ? { ok: true, path: [...r.path].reverse() } : r;
    }
    case "word": {
      if (loop.parts.length === 0) return { ok: false, reason: "the word is empty" };
      const out: Cx[] = [ctx.base];
      for (const part of loop.parts) {
        const r = loopPath(part, ctx);
        if (!r.ok) return r;
        out.push(...r.path.slice(1));
      }
      return { ok: true, path: out };
    }
    case "commutator":
      return loopPath(
        {
          kind: "word",
          parts: [
            loop.a,
            loop.b,
            { kind: "inverse", of: loop.a },
            { kind: "inverse", of: loop.b },
          ],
        },
        ctx,
      );
    case "drawn": {
      const v = loop.vertices;
      if (v.length < 3)
        return { ok: false, reason: "a drawn loop needs at least three points" };
      // Closed at its first point, and tethered to the base when drawn elsewhere.
      const ring: Cx[] = [...v];
      if (dist(v[v.length - 1], v[0]) !== 0) ring.push(v[0]);
      const path = dist(v[0], ctx.base) === 0 ? ring : [ctx.base, ...ring, ctx.base];
      // A drawn loop through a collision refuses by name before any tracking: there the roots meet,
      // and no permutation of them is defined.
      for (let i = 0; i < ctx.branchPoints.length; i++) {
        const q = ctx.branchPoints[i];
        const near = Math.max(
          ctx.branchRadii[i] ?? 0,
          1e-12 * Math.max(1, Math.hypot(q[0], q[1])),
        );
        for (let s = 0; s + 1 < path.length; s++)
          if (segmentDistance(q, path[s], path[s + 1]) <= near)
            return {
              ok: false,
              reason: `the loop passes through branch point #${i + 1}, where two roots collide — no permutation is defined there`,
            };
      }
      return { ok: true, path };
    }
  }
}

/** Short reader-facing text for a loop word, 1-based: γ₁, γ₂⁻¹, [γ₁, γ₂], γ₁γ₃, drawn. */
export function loopName(loop: Loop): string {
  const sub = (k: number): string =>
    String(k)
      .split("")
      .map((c) => "₀₁₂₃₄₅₆₇₈₉"[Number(c)])
      .join("");
  switch (loop.kind) {
    case "lasso":
      return `γ${sub(loop.point + 1)}${loop.sign === -1 ? "⁻¹" : ""}`;
    case "inverse":
      return loop.of.kind === "lasso" || loop.of.kind === "drawn"
        ? `${loopName(loop.of)}⁻¹`
        : `(${loopName(loop.of)})⁻¹`;
    case "word":
      return loop.parts.map(loopName).join("·");
    case "commutator":
      return `[${loopName(loop.a)}, ${loopName(loop.b)}]`;
    case "drawn":
      return "the drawn loop";
  }
}
