// A radical formula followed along a motion of the roots (DESIGN §4.8). The coefficients at every
// frame are Vieta's of the root positions (monic); the formula is evaluated bottom-up with ONE branch
// tracked per radical — never re-selected by proximity — and each radical reports whether it came
// back.
//
// Tracking a radical `ᵏ√X`: its argument is accumulated, θ_f = θ_{f−1} + (arg X_f − arg X_{f−1})
// wrapped into (−π, π], and its value is |X|^{1/k}·e^{iθ/k}. The wrapped increment is the TRUE one
// only if X did not swing round 0 between the two samples; the criterion used is |X_f − X_{f−1}| <
// |X_{f−1}| (then the segment between the two values misses 0), and a step that breaks it is halved —
// the roots moved half as far — until it holds. That criterion is checked at the SAMPLES; between two
// samples nothing is bounded, which is why a winding here is a measurement (≈), not a certificate.
//
// When the radicand returns to where it started, its total winding m is a whole number, and the radical
// comes back exactly when m ≡ 0 (mod k). A radicand that does not return (an inner radical failed)
// takes the radical with it. A radicand that comes too close to 0 refuses the run by name: there the
// radical is branched and no branch can be followed.
import type { Node } from "@cas/expr";
import type { Cx } from "../types.js";
import { vieta } from "../polynomial.js";
import { DISC, radicalOf, rational, type Formula, type Radical } from "./tree.js";

const add = (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Cx, b: Cx): Cx => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: Cx, b: Cx): Cx => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const abs = (a: Cx): number => Math.hypot(a[0], a[1]);
function ipow(a: Cx, e: number): Cx {
  let base = e < 0 ? div([1, 0], a) : a;
  let n = Math.abs(e);
  let out: Cx = [1, 0];
  while (n > 0) {
    if (n & 1) out = mul(out, base);
    base = mul(base, base);
    n >>= 1;
  }
  return out;
}
const wrap = (x: number): number => {
  let y = x;
  while (y > Math.PI) y -= 2 * Math.PI;
  while (y <= -Math.PI) y += 2 * Math.PI;
  return y;
};

/** Per radical: the radicand last seen and the accumulated argument. */
interface Track {
  readonly x: Cx;
  readonly theta: number;
}

type Sample =
  | { readonly kind: "ok"; readonly tracks: Track[]; readonly value: Cx }
  | { readonly kind: "refine" }
  | { readonly kind: "vanish"; readonly radical: number };

class Stop {
  constructor(readonly sample: Sample) {}
}

/** Evaluate the formula at one set of coefficients, continuing `prev`'s branches (or starting them). */
function sample(
  f: Formula,
  roots: readonly Cx[],
  prev: readonly Track[] | null,
  scale: readonly number[],
): Sample {
  const tracks: Track[] = [];
  const env = new Map<string, Cx>();
  const coeffs = vieta(roots, [1, 0]);
  let disc: Cx | null = null;
  const discriminant = (): Cx => {
    if (!disc) {
      let d: Cx = [1, 0];
      for (let i = 0; i < roots.length; i++)
        for (let j = i + 1; j < roots.length; j++) {
          const r = sub(roots[i], roots[j]);
          d = mul(d, mul(r, r));
        }
      disc = d;
    }
    return disc;
  };
  const ev = (node: Node): Cx => {
    switch (node.kind) {
      case "num":
        return [node.value, 0];
      case "const":
        return node.name === "pi"
          ? [Math.PI, 0]
          : node.name === "e"
            ? [Math.E, 0]
            : [0, 1];
      case "var": {
        const m = /^a(\d+)$/.exec(node.name);
        if (m) return coeffs[Number(m[1])];
        if (node.name === DISC) return discriminant();
        if (node.name === "i") return [0, 1];
        if (node.name === "pi") return [Math.PI, 0];
        if (node.name === "e") return [Math.E, 0];
        return env.get(node.name) as Cx;
      }
      case "neg": {
        const v = ev(node.operand);
        return [-v[0], -v[1]];
      }
      case "arith": {
        const rad = radicalOf(node);
        if (rad) return radical(rad);
        if (node.op === "^") {
          const e = rational(node.right);
          return ipow(ev(node.left), e ? e[0] : 1);
        }
        const l = ev(node.left);
        const r = ev(node.right);
        return node.op === "+"
          ? add(l, r)
          : node.op === "-"
            ? sub(l, r)
            : node.op === "*"
              ? mul(l, r)
              : div(l, r);
      }
      case "call": {
        const rad = radicalOf(node);
        if (rad) return radical(rad);
        throw new Error(`unexpected call ${node.name}`);
      }
      default:
        throw new Error("unexpected node");
    }
  };
  // Radicals are met in the same order `readFormula` numbered them (children first), except a radical
  // of a constant, which `readFormula` did not number: it is evaluated as a plain principal root.
  let next = 0;
  const radical = (rad: { k: number; power: number; radicand: Node }): Cx => {
    const x = ipow(ev(rad.radicand), rad.power);
    const id =
      next < f.radicals.length && movesWithCoefficients(rad.radicand, env) ? next++ : -1;
    if (id < 0) {
      const r = Math.pow(abs(x), 1 / rad.k);
      const t = Math.atan2(x[1], x[0]) / rad.k;
      return [r * Math.cos(t), r * Math.sin(t)];
    }
    if (abs(x) <= 1e-10 * scale[id]) throw new Stop({ kind: "vanish", radical: id });
    let theta: number;
    const p = prev?.[id];
    if (p) {
      if (!(abs(sub(x, p.x)) < abs(p.x))) throw new Stop({ kind: "refine" });
      theta = p.theta + wrap(Math.atan2(x[1], x[0]) - Math.atan2(p.x[1], p.x[0]));
    } else theta = Math.atan2(x[1], x[0]);
    tracks[id] = { x, theta };
    const r = Math.pow(abs(x), 1 / rad.k);
    return [r * Math.cos(theta / rad.k), r * Math.sin(theta / rad.k)];
  };
  try {
    const stmts = f.ast.kind === "seq" ? f.ast.stmts : [f.ast];
    let value: Cx = [0, 0];
    for (const st of stmts) {
      if (st.kind === "assign") {
        const v = ev(st.value);
        env.set(st.name, v);
        value = v;
      } else value = ev(st);
    }
    return { kind: "ok", tracks, value };
  } catch (e) {
    if (e instanceof Stop) return e.sample;
    throw e;
  }
}

/** Does a radicand depend on the coefficients (directly, or through an assigned name that does)? */
function movesWithCoefficients(node: Node, env: ReadonlyMap<string, Cx>): boolean {
  switch (node.kind) {
    case "var":
      return /^a\d+$/.test(node.name) || node.name === DISC || env.has(node.name);
    case "neg":
      return movesWithCoefficients(node.operand, env);
    case "arith":
      return (
        movesWithCoefficients(node.left, env) || movesWithCoefficients(node.right, env)
      );
    case "call":
      return node.args.some((a) => movesWithCoefficients(a, env));
    default:
      return false;
  }
}

export interface RadicalOutcome {
  readonly radical: Radical;
  /** Did the radicand come back to where it started? */
  readonly returns: boolean;
  /** Its total winding round 0, when it returned. */
  readonly winding: number | null;
  /** The radical came back: its radicand returned and wound a multiple of k times. */
  readonly closes: boolean;
}

export type Evaluation =
  | {
      readonly ok: true;
      readonly radicals: readonly RadicalOutcome[];
      /** Every radical came back, so the formula's value does. */
      readonly closes: boolean;
      readonly start: Cx;
      readonly end: Cx;
      readonly samples: number;
      /** How many steps had to be halved to meet the criterion. */
      readonly halvings: number;
      /** The formula's value at every accepted sample, when asked for. */
      readonly trace: readonly Cx[] | null;
    }
  | { readonly ok: false; readonly reason: string };

const lerp = (a: readonly Cx[], b: readonly Cx[], s: number): Cx[] =>
  a.map((p, i) => [p[0] + (b[i][0] - p[0]) * s, p[1] + (b[i][1] - p[1]) * s]);

/** Follow `f` along root positions `frames` (the first and last the same SET, monic). */
export function evaluateAlong(
  f: Formula,
  frames: readonly (readonly Cx[])[],
  opts: { readonly trace?: boolean } = {},
): Evaluation {
  if (frames.length < 2) return { ok: false, reason: "there is no motion to follow" };
  // The vanishing threshold is relative to each radicand's size at the start.
  const first0 = sample(f, frames[0], null, new Array<number>(f.radicals.length).fill(0));
  if (first0.kind !== "ok")
    return {
      ok: false,
      reason:
        first0.kind === "vanish"
          ? `the radicand of ${f.radicals[first0.radical].text} is 0 at the start, where the radical is branched`
          : "the formula could not be evaluated at the start",
    };
  const scale = first0.tracks.map((t) => Math.max(1e-300, abs(t.x)));
  const start = first0;
  let tracks = start.tracks;
  let value = start.value;
  let samples = 1;
  let halvings = 0;
  const trace: Cx[] | null = opts.trace ? [start.value] : null;
  const MAX_SAMPLES = 400_000;
  for (let fr = 1; fr < frames.length; fr++) {
    // Walk from frame fr − 1 to fr, halving the remaining step until each sample meets the criterion.
    let s0 = 0;
    const a = frames[fr - 1];
    const b = frames[fr];
    let step = 1;
    while (s0 < 1) {
      const s1 = Math.min(1, s0 + step);
      const r = sample(f, s1 === 1 ? b : lerp(a, b, s1), tracks, scale);
      samples++;
      if (samples > MAX_SAMPLES)
        return {
          ok: false,
          reason: `the motion needed more than ${MAX_SAMPLES} samples`,
        };
      if (r.kind === "vanish")
        return {
          ok: false,
          reason: `the radicand of ${f.radicals[r.radical].text} passes through 0 during the motion, where the radical is branched — no branch can be followed through it`,
        };
      if (r.kind === "refine") {
        step /= 2;
        halvings++;
        if (step < 2 ** -30)
          return {
            ok: false,
            reason: "a radicand moved too fast to follow even after 30 halvings",
          };
        continue;
      }
      tracks = r.tracks;
      value = r.value;
      trace?.push(value);
      s0 = s1;
      step = Math.min(1, step * 2);
    }
  }
  const radicals = f.radicals.map((rad): RadicalOutcome => {
    const t0 = start.tracks[rad.id];
    const t1 = tracks[rad.id];
    const returns = abs(sub(t1.x, t0.x)) <= 1e-8 * Math.max(1, abs(t0.x));
    if (!returns) return { radical: rad, returns, winding: null, closes: false };
    const turns = (t1.theta - t0.theta) / (2 * Math.PI);
    const winding = Math.round(turns);
    return { radical: rad, returns, winding, closes: winding % rad.k === 0 };
  });
  // A radical whose radicand returned only because it is built from others must also have those
  // return: close ⟺ every radical at or below it closes. (A failed inner radical makes the outer one's
  // radicand end elsewhere, which `returns` already sees.)
  return {
    ok: true,
    radicals,
    closes: radicals.every((r) => r.closes),
    start: start.value,
    end: value,
    samples,
    halvings,
    trace,
  };
}
