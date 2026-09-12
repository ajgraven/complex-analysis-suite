// **WHICH DETERMINATION THE PICTURE IS DRAWN IN** — the one thing M4.1–M4.6 left the app dishonest
// about.
//
// The phase portrait comes from `@cas/expr`'s compiled evaluator, which uses the PRINCIPAL branch of
// every sub-expression. The ledger computes in the DETERMINATION THE RECORD DECLARES. So for D7 the
// backdrop shows a seam on `(b, ∞)` where the composite is in fact continuous — which is that
// record's own `rendering-the-union-of-sub-cuts` trap (research 06 §2.2, the Maple `BranchCuts`
// lesson) drawn by the app about its own example. An app that draws one branch while computing in
// another is not merely imprecise; it is teaching the misconception it exists to break.
//
// **THE CORRECTION IS A DIFFERENCE OF TWO CROSSING COUNTS, AND THE SHADOW CANCELS.** Research 06
// §5.2 gives the mechanism: continuing `f` along the straight segment `[z₀, z]` defines the SHADOW
// determination, and any cut system Γ differs from it by
//
//     f_Γ(z) = f_shadow(z) · exp(2πi·m_Γ(z)),    m_Γ(z) = −Σ_arcs σ_j(z)·J_j
//
// with `σ_j ∈ {−1, 0, +1}` the signed crossing of `[z₀, z]` against arc `j` and `J_j` its jump
// weight. The principal system P — one ray from each branch point in direction `π` — is *also* a cut
// system, so the SAME formula relates it to the same shadow. Subtract:
//
//     f_Γ(z) = f_P(z) · exp(2πi·[m_Γ(z) − m_P(z)])
//
// and the shadow determination, the base lift, and every subtlety about continuing along a straight
// line drop out. What is left is one loop over a list of (segment, weight) pairs — the declared arcs
// at `+J`, the reference rays at `−α` — which is why {@link cutSegments} returns a single array and
// the GLSL twin needs a single uniform block.
//
// **WHAT THE REFERENCE IS CANNOT BE GUESSED**; see {@link ReferenceDirections}. It is the per-factor
// window the record declares, not C99's principal branch, and assuming the latter drew D6 wrong.
//
// Two consequences worth stating:
//
// - **Γ = the reference gives exactly zero**, term by term, so a picture already in the declared
//   determination is untouched and cannot regress.
// - **This is the PICTURE and not the answer.** The crossing test is a float orientation predicate;
//   the exactly-decided winding numbers that carry `∮` live in `kernel/winding.ts` and never consult
//   it. The parity gate this exists for is CPU↔GPU agreement (`test/cutParity.browser.test.ts`), and
//   the independent check that the picture is in the ledger's determination is against
//   `liftArgument`, which is the mechanism the answer depends on.
import { Frac } from "@cas/exact";
import type { Cx } from "../geom.js";
import { INFINITY, cutPolyline, type BranchChoice, type CutArc } from "./model.js";

/** One straight piece of a cut, with the jump weight crossing it costs. Weights may be negative. */
export interface CutSegment {
  readonly a: Cx;
  readonly b: Cx;
  /** `Σ α` over the side the piece's direction points away from — see {@link jumpWeights}. */
  readonly jump: number;
}

/**
 * How many segments the shader's uniform block holds.
 *
 * Research 06 §5.2's number, and generous: a hand-dragged polyline will not exceed it, and the loop
 * is `O(#segments)` per pixel. A cut system that would need more is truncated and SAID to be, rather
 * than quietly drawn short — a picture missing an arc is a picture in a different determination.
 */
export const MAX_CUT_SEGMENTS = 64;

/** `cross(q − p, r − p)` — the orientation of `r` about the directed line `p → q`. */
const cross = (p: Cx, q: Cx, r: Cx): number =>
  (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);

/**
 * The signed crossing of the directed segment `p → q` against the directed segment `a → b`.
 *
 * `+1` when `p → q` passes from the right of `a → b` to its left, `−1` for the reverse, `0` when
 * they do not properly cross. A touch counts as no crossing: the correction is piecewise constant
 * and its value ON a cut is the limit from one side, which the `side` tags — not this — decide.
 */
export function signedCross(p: Cx, q: Cx, a: Cx, b: Cx): -1 | 0 | 1 {
  const d1 = cross(a, b, p);
  const d2 = cross(a, b, q);
  const d3 = cross(p, q, a);
  const d4 = cross(p, q, b);
  const straddles = (d1 < 0 && d2 > 0) || (d1 > 0 && d2 < 0);
  const spans = (d3 < 0 && d4 > 0) || (d3 > 0 && d4 < 0);
  if (!straddles || !spans) return 0;
  return d2 > 0 ? 1 : -1;
}

/**
 * `J` for every arc of the cut system, as `Σ α` over the side its direction points AWAY from.
 *
 * The forest is the one `checkAdmissibility` walks. Removing an arc splits its component in two; the
 * weight is the sum over the `from` side, which for a ray `b → ∞` is `α_b` — research 06's own `J = α`
 * for `√z` — and for a bounded arc `b₁ → b₂` is `α_{b₁}`.
 *
 * **The dogbone's two orientations agree, and that is admissibility.** Taking the other side would
 * give `α_{b₂}`, and `e^{2πiα₁} = e^{2πiα₂}` exactly when `α₁ + α₂ ∈ ℤ` — research 06 §2.1(b), the
 * condition that makes the bounded cut legal at all. So the choice of side is a convention here
 * precisely because the picture would be wrong if it were not.
 *
 * A `log` branch point has no finite `α`; an arc whose side contains one is reported `null`, and a
 * caller draws it as a cut with an undetermined weight rather than inventing one.
 */
export function jumpWeights(branch: BranchChoice): ReadonlyMap<string, Frac | null> {
  const alpha = new Map<string, Frac | null>();
  for (const point of branch.points) {
    alpha.set(point.id, point.order.kind === "log" ? null : point.order.alpha);
  }

  // Adjacency over the forest, ∞ included as a node so "the side containing ∞" is decidable.
  const neighbours = new Map<string, { readonly to: string; readonly arc: string }[]>();
  const push = (from: string, to: string, arc: string): void => {
    const list = neighbours.get(from) ?? [];
    list.push({ to, arc });
    neighbours.set(from, list);
  };
  for (const cut of branch.cuts) {
    push(cut.from, cut.to, cut.id);
    push(cut.to, cut.from, cut.id);
  }

  const out = new Map<string, Frac | null>();
  for (const cut of branch.cuts) {
    // Walk the `from` side with the arc itself removed. A forest has no cycles, so the walk cannot
    // come back round to `to`; a malformed system with one would, and is reported null.
    const seen = new Set<string>([cut.from]);
    const stack = [cut.from];
    let reachedOther = false;
    while (stack.length > 0) {
      const at = stack.pop();
      if (at === undefined) break;
      for (const edge of neighbours.get(at) ?? []) {
        if (edge.arc === cut.id) continue;
        if (edge.to === cut.to) reachedOther = true;
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        stack.push(edge.to);
      }
    }
    if (reachedOther) {
      out.set(cut.id, null); // a cycle: removing the arc separates nothing
      continue;
    }
    let sum: Frac | null = Frac.ZERO;
    for (const id of seen) {
      if (id === INFINITY) continue;
      const a = alpha.get(id);
      if (a === undefined) continue; // an arc naming a point that does not exist
      if (a === null) {
        sum = null; // a log on this side: infinite order, no finite jump
        break;
      }
      sum = sum === null ? null : sum.add(a);
    }
    out.set(cut.id, sum);
  }
  return out;
}

/**
 * Where each factor's reference cut points, as a multiple of π, by branch-point id.
 *
 * **THE REFERENCE CANNOT BE INFERRED FROM THE BRANCH POINTS, and finding that out cost a wrong
 * picture.** The first version of this file assumed one reference ray per branch point along `ℝ₋` —
 * C99's principal cut — because that is what `@cas/expr` compiles. It is not what `@cas/expr`
 * compiles for D6: `csqrt(1 − z·z)` is principal in its ARGUMENT, so its cut is where `1 − z² ∈ ℝ₋`,
 * which is `(−∞,−1] ∪ [1,∞)` — two rays pointing OUTWARD, not two pointing left. Written as
 * `(z−1)^{−1/2}(z+1)^{−1/2}` the same function has the other reference. So the reference determination
 * is a fact about how the EXPRESSION IS WRITTEN, and an engine that guessed it would be M4.1's
 * incomplete detector wearing a different hat.
 *
 * What the app does instead: a record DECLARES a window per factor (`branch.factors[].argRange`), and
 * a window's cut lies along its lower edge — which `families/branchFactor.ts` already says, since
 * declaring the determination IS declaring where the cut runs. So the reference is the per-factor
 * window rays, which the app knows because the record said so, and the correction handles only what
 * is left: a cut DRAGGED off its window's ray.
 */
export type ReferenceDirections = ReadonlyMap<string, Frac>;

/** C99 / `@cas/expr`: `arg ∈ (−π, π]`, so a factor's principal cut points along `ℝ₋`. */
export const PRINCIPAL_DIRECTION = Frac.ONE;

/**
 * The (segment, weight) list the correction sums over: the declared arcs at `+J`, the reference rays
 * at `−α`.
 *
 * `radius` clips rays to infinity, and must enclose everything the picture shows — otherwise a pixel
 * beyond the clip sits on the wrong side of a cut that in truth continues past it.
 */
export function cutSegments(
  branch: BranchChoice,
  radius: number,
  reference: ReferenceDirections = new Map(),
): readonly CutSegment[] {
  const out: CutSegment[] = [];
  const weights = jumpWeights(branch);

  for (const cut of branch.cuts) {
    const jump = weights.get(cut.id);
    if (jump === undefined || jump === null) continue; // undetermined weight: not drawn, not corrected
    if (jump.isZero()) continue;
    const poly = cutPolyline(branch, cut, radius);
    if (poly === null) continue;
    for (let k = 0; k + 1 < poly.length; k++) {
      out.push({ a: poly[k], b: poly[k + 1], jump: jump.toNumber() });
    }
  }

  // The reference system, at NEGATIVE weight — which is what turns `m_Γ − m_ref` into one sum. A
  // point the caller declares no direction for gets no reference ray: that is the case where the app
  // does not know which determination the base evaluation is in, and inventing one is how D6 got
  // drawn wrong the first time.
  for (const point of branch.points) {
    if (point.order.kind === "log") continue;
    if (point.order.alpha.d === 1n) continue; // an integer exponent is single-valued: no cut either way
    const direction = reference.get(point.id);
    if (direction === undefined) continue;
    const theta = direction.toNumber() * Math.PI;
    const reach = Math.max(radius, Math.hypot(point.at[0], point.at[1]) + radius);
    out.push({
      a: point.at,
      b: [point.at[0] + Math.cos(theta) * reach, point.at[1] + Math.sin(theta) * reach],
      jump: -point.order.alpha.toNumber(),
    });
  }
  return out;
}

/**
 * `m_Γ(z) − m_ref(z)` — the exponent correction taking the reference determination to the declared
 * one, as a multiple of `2πi`.
 *
 * `f_declared(z) = f_reference(z) · exp(2πi · cutCorrection(z, base, segments))`. Zero when the two
 * systems coincide, and zero for every `z` the segment `[base, z]` reaches without crossing anything.
 *
 * **AN INTEGER VALUE IS NO DISCONTINUITY**, and that is not a detail: for D6 the declared bounded cut
 * `[−1,1]` and the per-factor `[0,2π)` window rays are the SAME determination, and what PROVES it is
 * that this comes out an integer everywhere — `α₁ + α₂ ∈ ℤ`, research 06 §2.1(b), the admissibility
 * condition arriving as a property of the picture.
 */
export function cutCorrection(z: Cx, base: Cx, segments: readonly CutSegment[]): number {
  let m = 0;
  const n = Math.min(segments.length, MAX_CUT_SEGMENTS);
  for (let j = 0; j < n; j++) {
    const seg = segments[j];
    m -= signedCross(base, z, seg.a, seg.b) * seg.jump;
  }
  return m;
}

/**
 * `arg(z)` with the cut along the ray of direction `theta0`; the value lies in `[θ₀, θ₀ + 2π)`.
 *
 * Research 06 §5.2's rotatable-ray primitive, and the app's independent check on
 * {@link cutCorrection}: for a cut system that IS a set of rays, the correction and this agree, and
 * they share no machinery — one counts segment crossings, the other lifts by whole turns.
 *
 * **IT ADDS TURNS RATHER THAN TAKING A MODULUS, and that is not a style choice.** Research 06 writes
 * `mod(carg(z) − θ₀, τ) + θ₀` and says `θ₀ = π` "reproduces the principal branch exactly". It does
 * not: subtracting `θ₀` and adding it back costs an ulp, so `argCut([3,4], −π)` came out one ulp from
 * `atan2(4, 3)` — and "exactly" is a claim this app is not allowed to make loosely. Counting the
 * turns instead returns `atan2` UNTOUCHED whenever the value already lies in the window, which is
 * the whole of the principal case. (The sign is research 06's other slip: with the window
 * `[θ₀, θ₀+2π)` it is `−π` that lands on C99's `(−π, π]`; `+π` gives `atan2 + 2π`, one turn up.)
 */
export function argCut(z: Cx, theta0: number): number {
  const TAU = 2 * Math.PI;
  const raw = Math.atan2(z[1], z[0]);
  const turns = Math.ceil((theta0 - raw) / TAU);
  return turns === 0 ? raw : raw + TAU * turns;
}

/** `log z` in the determination {@link argCut} fixes. */
export function logCut(z: Cx, theta0: number): Cx {
  return [Math.log(Math.hypot(z[0], z[1])), argCut(z, theta0)];
}

/** `z^a` in the determination {@link argCut} fixes, for a real exponent. */
export function powCut(z: Cx, a: number, theta0: number): Cx {
  const [lr, th] = logCut(z, theta0);
  const m = Math.exp(a * lr);
  return [m * Math.cos(a * th), m * Math.sin(a * th)];
}

/** Every arc of the cut system as a polyline, for drawing it as the explicit stroked curve it is. */
export function cutPolylines(branch: BranchChoice, radius: number): readonly (readonly Cx[])[] {
  const out: (readonly Cx[])[] = [];
  for (const cut of branch.cuts as readonly CutArc[]) {
    const poly = cutPolyline(branch, cut, radius);
    if (poly !== null) out.push(poly);
  }
  return out;
}
