// The whole truth of the page (DESIGN §7): `ShellState`, and `resolveState` — one pure function from
// it to everything computed. The permalink carries a `ShellState`, undo stores `ShellState`s, and the
// golden tests run `resolveState`, so what the suite pins is what the screen shows.
import { renderQiPolyText } from "@cas/exact";
import { parsePolynomial } from "../engine/parse.js";
import {
  fromCoeffs,
  fromExact,
  fromRoots,
  type Continuation,
  type Cx,
  type Polynomial,
  type Ring,
} from "../engine/polynomial.js";
import { conditioning, type Conditioning } from "../engine/roots/conditioning.js";
import { rootDiscs, type DiscReport } from "../engine/roots/discs.js";
import { rootGroups, type GroupReport } from "../engine/roots/multiplicity.js";
import { analyse, type Analysis } from "../engine/analysis/analyse.js";
import type { Loop, LoopContext } from "../engine/loops/loop.js";
import { loopContext, runLoop, type LoopRun } from "../engine/loops/run.js";

/** A pane's camera: the world point at the centre and the half-HEIGHT of the view. */
export interface Cam {
  readonly cx: number;
  readonly cy: number;
  readonly half: number;
}

/** Which form of the polynomial is the truth — the permalink carries only that one. */
export type PolySpec =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "coeffs"; readonly coeffs: readonly Cx[] }
  | { readonly kind: "roots"; readonly roots: readonly Cx[]; readonly lead: Cx };

export interface ShellState {
  readonly ring: Ring;
  readonly poly: PolySpec;
  readonly discs: boolean;
  /** Draw the coefficients on the root plane rather than in their own pane. */
  readonly overlay: boolean;
  /** Critical points and the roots' convex hull (Gauss–Lucas). */
  readonly critical: boolean;
  /** The coefficient whose branch points the coefficient pane shows (aⱼ), or null. */
  readonly coefficient: number | null;
  /** Keep the roots' trails after a drag is released. */
  readonly trails: boolean;
  /** log₁₀ ε of the pseudozero set drawn and certified, or null for none. */
  readonly pseudozero: number | null;
  /** The loop word in the selected coefficient's plane (PRA-3), carried as the word, never samples. */
  readonly loop: Loop | null;
  readonly rootCam: Cam;
  readonly coeffCam: Cam;
}

export const DEFAULT_STATE: ShellState = {
  ring: "Q",
  poly: { kind: "text", text: "z^5 - z - 1" },
  discs: true,
  overlay: false,
  critical: true,
  coefficient: 0,
  trails: false,
  pseudozero: null,
  loop: null,
  rootCam: { cx: 0, cy: 0, half: 1.6 },
  coeffCam: { cx: 0, cy: 0, half: 1.6 },
};

export interface Resolution {
  readonly poly: Polynomial | null;
  /** Why there is no polynomial — a refusal by name. */
  readonly refusal: string | null;
  readonly discs: DiscReport | null;
  readonly groups: GroupReport | null;
  readonly conditioning: readonly Conditioning[] | null;
  readonly analysis: Analysis | null;
  /** Where loops in the selected coefficient's plane start and what they go round. */
  readonly loopContext: LoopContext | null;
  /** The state's loop, run through the certified tracker — on a commit, never a drag frame. */
  readonly loopRun: LoopRun | null;
}

/** Build the polynomial a state names, continuing root labels from `prev` when given. */
export function buildPolynomial(
  s: ShellState,
  prev?: Continuation,
): { ok: true; poly: Polynomial } | { ok: false; reason: string } {
  switch (s.poly.kind) {
    case "text": {
      const read = parsePolynomial(s.poly.text, s.ring);
      if (!read.ok) return read;
      return fromExact(read.exact, s.ring, prev);
    }
    case "coeffs":
      if (s.ring === "Q")
        return {
          ok: false,
          reason: "in ℚ mode the polynomial is carried as exact text, not as decimals",
        };
      return fromCoeffs(s.poly.coeffs, s.ring, prev);
    case "roots":
      return fromRoots(s.poly.roots, s.poly.lead, s.ring);
  }
}

export function resolveState(s: ShellState, prev?: Continuation): Resolution {
  const built = buildPolynomial(s, prev);
  if (!built.ok) {
    return {
      poly: null,
      refusal: built.reason,
      discs: null,
      groups: null,
      conditioning: null,
      analysis: null,
      loopContext: null,
      loopRun: null,
    };
  }
  return resolvePolynomial(built.poly, s, false);
}

/** The pseudozero certificate is made over the root pane's (square) view. */
export function rootRange(s: ShellState): [number, number, number, number] {
  const c = s.rootCam;
  return [c.cx - c.half, c.cx + c.half, c.cy - c.half, c.cy + c.half];
}

/** Everything computed about a polynomial the state (or a drag frame, `drag`) holds. */
export function resolvePolynomial(
  poly: Polynomial,
  s: ShellState,
  drag: boolean,
): Resolution {
  const discs = rootDiscs(poly);
  const analysis = analyse(poly, discs, {
    coefficient: s.coefficient,
    pseudozero: s.pseudozero,
    range: rootRange(s),
    drag,
  });
  const j = s.coefficient;
  const ctx =
    j !== null && j < poly.degree && !drag ? loopContext(poly, j, analysis.branch) : null;
  return {
    poly,
    refusal: null,
    discs,
    groups: rootGroups(poly, discs),
    conditioning: conditioning(poly),
    analysis,
    loopContext: ctx,
    loopRun: ctx && s.loop ? memoRun(poly, s.loop, ctx) : null,
  };
}

// A run costs up to ~2 s at degree 24 (PRA-3's measurement) and every render re-resolves the state, so
// runs are memoised on exactly what decides them: the roots the tracker starts from, the coefficients,
// the coefficient moved and the word.
const RUNS = new Map<string, LoopRun>();
export function memoRun(poly: Polynomial, loop: Loop, ctx: LoopContext): LoopRun {
  const key = JSON.stringify([
    poly.coeffs,
    poly.roots,
    poly.labels,
    ctx.coefficient,
    loop,
  ]);
  const hit = RUNS.get(key);
  if (hit) return hit;
  const r = runLoop(poly, loop, ctx);
  if (RUNS.size >= 32) RUNS.delete(RUNS.keys().next().value as string);
  RUNS.set(key, r);
  return r;
}

/** The spec that carries `p` as its own truth: exact text when there is an exact layer. */
export function specOf(p: Polynomial): PolySpec {
  if (p.exact) return { kind: "text", text: renderQiPolyText(p.exact, "z") };
  if (p.source === "roots") return { kind: "roots", roots: p.roots, lead: p.lead };
  return { kind: "coeffs", coeffs: p.coeffs };
}

/** A camera that shows every point with a margin, never narrower than `min`. */
export function frame(points: readonly Cx[], min = 1.2): Cam {
  if (points.length === 0) return { cx: 0, cy: 0, half: min };
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  // Half the span plus a margin, so a point on the edge of the set is not on the edge of the view.
  const half = Math.max(min, 0.55 * Math.max(x1 - x0, y1 - y0) + 0.3);
  return { cx: Math.abs(cx) < 1e-12 ? 0 : cx, cy: Math.abs(cy) < 1e-12 ? 0 : cy, half };
}
