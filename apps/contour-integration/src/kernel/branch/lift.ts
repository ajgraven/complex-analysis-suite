// The continuous argument of `z − b` along a path.
//
// PLAN §4.3 keeps two deliberately separate evaluators, and this is the first: **CPU = the answer.**
// (The GPU's per-pixel crossing-count correction is the picture, and lands later.) Continuous-argument
// accumulation is how a multivalued factor is followed across a cut without the answer depending on
// where the cut happens to be drawn, and it is what PLAN §9's R1 demands before a jump weight is
// trusted: *never* trust a derived weight — verify each arc with a numeric continuation probe, and
// refuse to render an unverified cut system.
//
// THE STEP RULE. Each step contributes `arg((z_{k+1} − b)/(z_k − b))`, the PRINCIPAL value of the
// quotient — which is the small angle turned, and is summable. It is only summable while no single
// step turns by more than π, because past that the principal value silently picks the short way
// round; research 06 §3.1 and PLAN §4.3 therefore control the step at `|Δθ| ≤ π/4`, subdividing
// until it holds. The margin to π is the whole safety factor and is why the control is not `≤ π`.
// The control is applied to the two PARTS of a candidate interval rather than to the interval
// itself, and the split point is irrational — which together are what make it a guard rather than a
// hope. See the note on the subdivision loop.
//
// AND IT REPORTS RATHER THAN CLAMPS. PLAN §9's R7 is "near-branch-point cancellation and unbounded
// angular rate", with the mitigation stated as a hard `r_min` guard that **reports** rather than
// silently clamping. A path through a branch point has no continuous argument, and returning a
// number there would be inventing one.
import { bound, refuse, type Certificate } from "@cas/rigor";
import type { Cx } from "../geom.js";

export interface LiftOptions {
  /** Subdivide until no step turns by more than this. Default `π/4`. */
  readonly maxStep?: number;
  /** Refuse within this distance of the branch point. Default `1e-9`. */
  readonly rMin?: number;
  /** Sample ceiling, so a pathological path fails loudly instead of hanging. */
  readonly maxSamples?: number;
}

export type LiftResult =
  | {
      readonly ok: true;
      /** Total change in `arg(z − b)`, CONTINUOUS — not reduced mod 2π. */
      readonly delta: number;
      /** `delta / 2π` rounded: the winding number, for a closed path. */
      readonly turns: number;
      /** How far `delta` sits from an exact multiple of 2π. Large ⇒ the path was not closed. */
      readonly residual: number;
      readonly samples: number;
      readonly certificate: Certificate;
    }
  | { readonly ok: false; readonly reason: string; readonly certificate: Certificate };

const TWO_PI = 2 * Math.PI;

/** The golden-ratio conjugate: where an interval is split. See the note on the subdivision loop. */
const PHI = (Math.sqrt(5) - 1) / 2;

/** `arg(to / from)` as a principal value: the small angle between two vectors. */
function turn(from: Cx, to: Cx): number {
  return Math.atan2(to[1] * from[0] - to[0] * from[1], to[0] * from[0] + to[1] * from[1]);
}

/**
 * Follow `arg(z − b)` continuously along `path`, `t ∈ [0, 1]`.
 *
 * `path` is sampled, never differentiated, so it works for any parameterisation the contour model
 * can produce — and for a cut polyline just as well as for an arc.
 */
export function liftArgument(path: (t: number) => Cx, b: Cx, opts: LiftOptions = {}): LiftResult {
  const maxStep = opts.maxStep ?? Math.PI / 4;
  const rMin = opts.rMin ?? 1e-9;
  const maxSamples = opts.maxSamples ?? 1 << 16;

  const at = (t: number): Cx => {
    const z = path(t);
    return [z[0] - b[0], z[1] - b[1]];
  };
  const tooClose = (v: Cx): boolean => Math.hypot(v[0], v[1]) <= rMin;

  const start = at(0);
  if (tooClose(start)) return onTop(0, rMin);

  // A first pass coarse enough to be cheap and fine enough that a full turn is already inside the
  // step rule: 16 samples put a circle at π/8 per step, so the subdivision below is the exception.
  const INITIAL = 16;
  let samples = INITIAL + 1;
  let delta = 0;

  // Each interval is (t0, v0, t1, v1); accepted turns are summed, and addition does not care about
  // the order they are accepted in.
  const stack: { t0: number; v0: Cx; t1: number; v1: Cx }[] = [];
  let prevT = 0;
  let prevV = start;
  for (let k = 1; k <= INITIAL; k++) {
    const t = k / INITIAL;
    const v = at(t);
    if (tooClose(v)) return onTop(t, rMin);
    stack.push({ t0: prevT, v0: prevV, t1: t, v1: v });
    prevT = t;
    prevV = v;
  }

  // SPLIT FIRST, THEN TEST THE PARTS — and split at an IRRATIONAL fraction. Both halves of that
  // sentence are load-bearing, and each fixes a way the obvious version is silently wrong.
  //
  // Measuring `turn(v0, v1)` and comparing it to the step rule cannot detect the failure the rule
  // exists to prevent: if the path turns by exactly 2π across an interval then `v1 = v0`, the
  // principal value is 0, the "step" passes with room to spare, and a whole revolution is dropped in
  // silence. A 16-turn circle against a 16-sample first pass hits that head-on — every sample lands
  // on the same point and the lift reports no turning at all. Splitting first and testing both parts
  // closes it: once `|turn(v0,vs)|` and `|turn(vs,v1)|` are both ≤ π/4 the true turn across the
  // interval is ≤ π/2 < π, so no principal value on it is ambiguous, and the sum of the parts — which
  // is what gets accumulated — is the true angle rather than an alias of it.
  //
  // But splitting at the MIDPOINT only moves the resonance: a 32-turn circle aliases at the midpoints
  // too, and bisecting again moves it to 64. Every dyadic subdivision has a frequency that defeats it,
  // because `k·2π·Δt ≡ 0 (mod 2π)` keeps holding as Δt halves whenever `k` is the matching multiple.
  // Splitting at `φ = (√5 − 1)/2` removes the whole family at once: `k·φ·Δt` is never an integer for
  // integer `k` and `Δt` dyadic, so a periodic path cannot resonate with the subdivision at ANY depth.
  // The parts are 0.618 and 0.382 of the interval, so the geometric decay that makes the recursion
  // terminate is untouched.
  //
  // What this still does NOT buy is a proof. A black-box path can be built to defeat any fixed
  // sampling, which is exactly why the certificate below is `≤` and not `=`.
  while (stack.length > 0) {
    const seg = stack.pop();
    if (seg === undefined) break;
    const ts = seg.t0 + PHI * (seg.t1 - seg.t0);
    const vs = at(ts);
    samples += 1;
    if (tooClose(vs)) return onTop(ts, rMin);
    const first = turn(seg.v0, vs);
    const second = turn(vs, seg.v1);
    if (Math.abs(first) <= maxStep && Math.abs(second) <= maxStep) {
      delta += first + second;
      continue;
    }
    if (samples >= maxSamples) {
      return {
        ok: false,
        reason: `following arg(z − b) along this path needs more than ${maxSamples} samples`,
        certificate: refuse(
          "the continuous argument",
          `the |Δθ| ≤ ${maxStep.toFixed(3)} step rule was not reachable within ${maxSamples} samples, so the lift is not established`,
          {
            provenance: [
              { ok: false, text: "a step exceeding π would make the principal value pick the short way round" },
              { ok: true, text: "suggested repair: move the path away from the branch point, or raise the sample ceiling" },
            ],
          },
        ),
      };
    }
    stack.push({ t0: seg.t0, v0: seg.v0, t1: ts, v1: vs });
    stack.push({ t0: ts, v0: vs, t1: seg.t1, v1: seg.v1 });
  }

  const rounded = Math.round(delta / TWO_PI);
  const turns = rounded === 0 ? 0 : rounded; // `Math.round(-1e-9)` is -0, which reads as a direction.
  const residual = Math.abs(delta - turns * TWO_PI);
  return {
    ok: true,
    delta,
    turns,
    residual,
    samples,
    // `≤`, not `=`: the lift is a sampled continuation, and its guarantee is the step rule rather
    // than an exact value. What IS exact is the integer it rounds to, once the residual is small —
    // and the residual is reported so a caller can see whether it earned that.
    certificate: bound(
      "≤",
      `arg(z − b) changes by ${delta.toFixed(9)} along the path (${turns} turn${Math.abs(turns) === 1 ? "" : "s"}, residual ${residual.toExponential(2)})`,
      `continuous-argument accumulation with |Δθ| ≤ ${maxStep.toFixed(3)}, ${samples} samples`,
      {
        provenance: [
          {
            ok: true,
            text: `every accepted half-step turned by at most ${maxStep.toFixed(3)} < π, so no principal value was ambiguous`,
          },
          {
            ok: residual < 1e-6,
            text: `the total is ${residual.toExponential(2)} from an exact multiple of 2π`,
          },
        ],
      },
    ),
  };
}

function onTop(t: number, rMin: number): LiftResult {
  return {
    ok: false,
    reason: `the path reaches the branch point at t = ${t.toFixed(6)}`,
    certificate: refuse(
      "the continuous argument",
      `the path comes within ${rMin.toExponential(1)} of the branch point at t = ${t.toFixed(6)}, where arg(z − b) is not defined`,
      {
        provenance: [
          { ok: false, text: "a path THROUGH a branch point has no continuous argument to follow" },
          { ok: true, text: "suggested repair: indent the path around the branch point, or move it" },
        ],
      },
    ),
  };
}
