// The pixel engine's tree walk, in float64 — the app's second reader of the one coefficient tree.
//
// The root engine reads the tree's LEAVES: enumerate every polynomial, solve it, splat the roots. This
// one reads a single POINT and prunes the tree around it, which is a different object and a better one
// at depth. Fix `z` and walk the partial sums `s_k = s_{k−1} + a_k z^k`. The remaining tail of any
// continuation has modulus at most
//
//     T_k = max|a| · Σ_{j>k} |z|^j = max|a| · |z|^{k+1} / (1 − |z|),
//
// so a prefix with `|s_k| > T_k` can never be continued to a vanishing series and the whole subtree
// under it is dead. What survives to the cap is the set of prefixes that COULD be continued to zero,
// and as the cap rises the surviving set shrinks onto the LIMIT SET: the `z` at which some power series
// over the alphabet vanishes. Bousch proved that for `{−1,+1}` this is exactly the closure of the
// polynomial root set inside the disk, which is why the two engines draw the same picture and why the
// handover between them is checkable rather than a matter of taste.
//
// **The tail is INFINITE on purpose.** Truncating it at the cap — `Σ_{j=k+1}^{D}` — would decide a
// different question, "is there a degree-`D` polynomial vanishing here", which is the root engine's
// object and already has an engine. The infinite tail is the series question, it is what "limit set"
// means, and it is monotone in the cap (a survivor at depth `D+1` was a survivor at depth `D`), so the
// picture only ever sharpens as the depth slider rises.
//
// **`a_0 ≠ 0`, normalised by the units.** Properness costs nothing here: a series with `a_0 = 0` is `z`
// times one with `a_0 ≠ 0`, and `z = 0` is not a root of anything proper. And every unit `u` has
// `|u| = 1` — multiplication by `u` permutes a finite set and so preserves its moduli — so `uP` and `P`
// have the same `|s_k|` at every depth as well as the same zeros. The walk therefore starts from one
// representative per unit-orbit, exactly as the root engine's enumeration does.
//
// **What a pixel reports is the DEPTH IT REACHED, not how many prefixes survived.** Counting survivors
// was the first design and it is unaffordable, measured at the app's own flagship window: at the CKW
// hexaholes, 2,675 of 2,720 texels spent a 40,000-node budget without finishing, so the picture was one
// decided hole on a field of "undecided". Existence, on the other hand, EXITS EARLY — the moment one
// branch reaches the cap there is nothing left to learn — and the same window then costs 186 nodes a
// texel. And the quantity it yields is the better one anyway: survival to depth `k` is MONOTONE in `k`,
// so `reach` is the deepest approximation of the limit set the point belongs to, which is exactly the
// escape-time function of this set. Points at the cap are the ones this depth cannot separate; raising
// the depth separates them, which is what makes the slider mean something.
//
// **`ε` is Foster's fudge, and it is a STATED quantity rather than a hidden constant.** A pixel is not a
// point: what the picture should show at pixel `z` of radius `ρ` is whether some series vanishes
// ANYWHERE in that pixel. If `P(r) = 0` with `|r − z| ≤ ρ` then `|P(z)| ≤ ρ · max|P′|`, and over this
// family `|P′| ≤ max|a| / (1 − |z|)²`. So `ε = ρ · max|a| / (1 − |z|)²` catches every polynomial with a
// root in the pixel (and some without one — it errs towards drawing, which is the honest direction for
// a picture that claims `≈`). It enters the prune as `|s_k| > T_k + ε` and it is reported in the legend.
//
// **`|z| > 1` folds onto `1/z`, exactly.** Reversing a coefficient vector — `a_k ↦ a_{d−k}` — always
// lands in the same alphabet and takes `P`'s roots to their reciprocals, so the polynomial root set is
// symmetric under `z ↦ 1/z` for EVERY alphabet, not only the ones closed under something. Outside the
// disk the tail bound diverges and there is nothing to walk; inside, the fold gives the answer.
import type { Alphabet, Cx } from "../alphabet.js";

/** The deepest the walk will go. The shader carries the same cap as its array sizes. */
export const MAX_DEPTH = 48;

/** The shallowest depth worth drawing — below this the survivor set is barely pruned. */
export const MIN_DEPTH = 4;

/**
 * The band around the unit circle the walk does not enter by default.
 *
 * Inside it the tail bound is enormous, almost nothing prunes, and the node count explodes — measured
 * in the plan's research at 4.8 ms per pixel at `0.9 + 0.1i` against 14 µs at the dragon, 300× — while
 * the root engine covers exactly that region well and Bousch proved the roots are dense in
 * `2^(−1/4) ≤ |z| ≤ 2^(1/4)`, so there is nothing subtle there for this engine to resolve. `0.8` is
 * Egan's choice, and its reciprocal `1.25` is exact in binary, so the band is its own image under the
 * fold and a pixel cannot be inside it on one side and outside on the other.
 */
export const ANNULUS_INNER = 0.8;

/** The outer edge of that band — exactly `1 / ANNULUS_INNER`. */
export const ANNULUS_OUTER = 1 / ANNULUS_INNER;

/**
 * Nodes one pixel may visit before the walk gives up and says so.
 *
 * Two jobs. It bounds the frame time — a full-screen pass is a million pixels — and, because every leaf
 * is a node, it bounds the survivor count below `2²⁴`, so the count stays EXACTLY representable in the
 * shader's float32 and the two backends can be compared as integers rather than within a tolerance.
 */
export const NODE_BUDGET = 40000;

/** The alphabet, flattened for the walk: interleaved `[re, im]` pairs and the one scalar it needs. */
export interface WalkSpec {
  /** Every value, as `[re, im]` pairs — the choices at depths `1 … D`. */
  readonly values: Float64Array;
  /** One value per unit-orbit, as `[re, im]` pairs — the choices at depth 0 (`a_0 ≠ 0`). */
  readonly leading: Float64Array;
  /** `max |a|` over the alphabet: the tail bound's constant. */
  readonly maxAbs: number;
  /** The alphabet's id, so a cached shader can be matched to the spec it was generated from. */
  readonly id: string;
}

/** Flatten a compiled alphabet into the form both backends are generated from. */
export function walkSpec(alphabet: Alphabet): WalkSpec {
  const values = new Float64Array(alphabet.values.length * 2);
  alphabet.values.forEach((v, j) => {
    values[2 * j] = v.re;
    values[2 * j + 1] = v.im;
  });
  const leading = new Float64Array(alphabet.leading.length * 2);
  alphabet.leading.forEach((j, pos) => {
    const v: Cx = alphabet.values[j];
    leading[2 * pos] = v.re;
    leading[2 * pos + 1] = v.im;
  });
  let maxAbs = 0;
  for (const v of alphabet.values) maxAbs = Math.max(maxAbs, Math.hypot(v.re, v.im));
  return { values, leading, maxAbs, id: alphabet.id };
}

/** What to ask of one pixel. */
export interface WalkOptions {
  /** The cap `D`: coefficients `a_0 … a_D` are chosen. */
  readonly depth: number;
  /** Foster's fudge, in the units of `|P(z)|`. Use `epsFor` unless a test wants the exact set. */
  readonly eps?: number;
  /** Nodes before giving up. */
  readonly budget?: number;
  /** Walk inside the excluded band too, under the budget. */
  readonly computeAnnulus?: boolean;
  /**
   * Walk the WHOLE tree and count the survivors instead of stopping at the first one.
   *
   * Off on every drawing path — it is what the header says is unaffordable — and on in the cross-check
   * against `bandt.ts`, where comparing the two frontier COUNTS is a far stronger statement than
   * comparing two booleans.
   */
  readonly exhaustive?: boolean;
}

/** What one pixel came back with. */
export interface WalkResult {
  /**
   * The deepest level any branch survived to, plus one: `0` when not even `a_0` survives and `depth + 1`
   * when a branch reached the cap. Order-independent, and monotone in the depth asked for.
   */
  readonly reach: number;
  /** Prefixes surviving to the cap. Only counted under `exhaustive`; otherwise 0 or 1. */
  readonly hits: number;
  /** Nodes visited. */
  readonly nodes: number;
  /** The budget ran out, so `reach` is a lower bound and the pixel is UNDECIDED. */
  readonly exhausted: boolean;
  /** `|z| > 1`, so the walk ran at `1/z`. */
  readonly folded: boolean;
  /** The point is in the excluded band and was not walked. */
  readonly excluded: boolean;
}

/**
 * Foster's fudge for a pixel of radius `ρ` at `|z| = absz`: the largest `|P(z)|` a polynomial with a
 * root inside the pixel can have. See the header — it is an upper bound, so the picture is a superset.
 */
export function epsFor(pixelRadius: number, absz: number, maxAbs: number): number {
  const gap = Math.max(1e-6, 1 - Math.min(absz, 1 - 1e-6));
  return pixelRadius * maxAbs / (gap * gap);
}

// One scratch workspace, reused. The walk is called once per pixel of a full grid, and allocating four
// small arrays a million times is the difference between a rasteriser and a garbage collector. JS is
// single-threaded and the walk never yields, so there is no reentrancy to protect against.
const scratchSum = new Float64Array(2 * (MAX_DEPTH + 2));
const scratchPow = new Float64Array(2 * (MAX_DEPTH + 2));
const scratchTail = new Float64Array(MAX_DEPTH + 2);
const scratchIdx = new Int32Array(MAX_DEPTH + 2);

/**
 * Walk the tree at one point.
 *
 * The loop is written to mirror the generated GLSL statement for statement — the same explicit stack,
 * the same order of the prune and the hit tests, the same path-independent `pow`/`tail` prologue — so
 * the browser suite's parity check is comparing two transcriptions of one algorithm rather than two
 * algorithms that ought to agree.
 */
export function walkAt(spec: WalkSpec, zre: number, zim: number, options: WalkOptions): WalkResult {
  const depth = Math.max(0, Math.min(MAX_DEPTH, Math.floor(options.depth)));
  const eps = options.eps ?? 0;
  const budget = options.budget ?? NODE_BUDGET;

  const r2 = zre * zre + zim * zim;
  const folded = r2 > 1;
  const wr = folded ? zre / r2 : zre;
  const wi = folded ? -zim / r2 : zim;
  const absw = Math.sqrt(wr * wr + wi * wi);

  if (absw > ANNULUS_INNER && options.computeAnnulus !== true) {
    return { reach: 0, hits: 0, nodes: 0, exhausted: false, folded, excluded: true };
  }
  if (absw >= 1) {
    // On the unit circle itself the tail bound is infinite and every prefix survives: there is nothing
    // to decide, so it is reported as undecided rather than as a saturated pixel.
    return { reach: 0, hits: 0, nodes: 0, exhausted: true, folded, excluded: false };
  }

  // Path-independent prologue: `pow[k] = w^k` and `tail[k] = maxAbs·|w|^{k+1}/(1−|w|)`. Computing the
  // powers once rather than multiplying down and dividing back up is what keeps the two backends bit-
  // comparable — a divide-on-ascend loop drifts by a relative ε per round trip over millions of nodes.
  const pow = scratchPow;
  const tail = scratchTail;
  pow[0] = 1;
  pow[1] = 0;
  const rate = spec.maxAbs / (1 - absw);
  let absPow = 1;
  for (let k = 0; k <= depth; k++) {
    if (k > 0) {
      const pr = pow[2 * (k - 1)];
      const pi = pow[2 * (k - 1) + 1];
      pow[2 * k] = pr * wr - pi * wi;
      pow[2 * k + 1] = pr * wi + pi * wr;
      absPow *= absw;
    }
    tail[k] = rate * absPow * absw;
  }

  const sum = scratchSum;
  const idx = scratchIdx;
  const values = spec.values;
  const leading = spec.leading;
  const nValues = values.length >> 1;
  const nLeading = leading.length >> 1;

  const exhaustive = options.exhaustive === true;
  let hits = 0;
  let reach = 0;
  let nodes = 0;
  let exhausted = false;
  let level = 0;
  idx[0] = 0;

  while (level >= 0) {
    const choices = level === 0 ? nLeading : nValues;
    const c = idx[level];
    if (c >= choices) {
      level--;
      if (level >= 0) idx[level]++;
      continue;
    }
    nodes++;
    if (nodes > budget) {
      exhausted = true;
      break;
    }
    const table = level === 0 ? leading : values;
    const ar = table[2 * c];
    const ai = table[2 * c + 1];
    const pr = pow[2 * level];
    const pi = pow[2 * level + 1];
    const tr = ar * pr - ai * pi;
    const ti = ar * pi + ai * pr;
    const sr = level === 0 ? tr : sum[2 * (level - 1)] + tr;
    const si = level === 0 ? ti : sum[2 * (level - 1) + 1] + ti;
    const m = Math.sqrt(sr * sr + si * si);
    if (m > tail[level] + eps) {
      idx[level]++;
      continue;
    }
    if (level + 1 > reach) reach = level + 1;
    if (level === depth) {
      hits++;
      if (!exhaustive) break;
      idx[level]++;
      continue;
    }
    sum[2 * level] = sr;
    sum[2 * level + 1] = si;
    level++;
    idx[level] = 0;
  }

  return { reach, hits, nodes, exhausted, folded, excluded: false };
}

/** The world window a grid covers, in the stage's own terms. */
export interface GridView {
  readonly cx: number;
  readonly cy: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

/** A rasterised walk: one entry per cell, row 0 at the BOTTOM (GL's convention, so tests line up). */
export interface WalkGrid {
  readonly width: number;
  readonly height: number;
  /** The escape depth, `0 … depth + 1`. */
  readonly reach: Int32Array;
  readonly nodes: Float64Array;
  /** 0 walked, 1 excluded (the band), 2 exhausted (the budget). */
  readonly status: Uint8Array;
}

/**
 * Rasterise the walk over a view. This is the reference the shader is checked against and the source of
 * the node-side agreement measurement against the root engine; it is not on any drawing path.
 */
export function walkGrid(spec: WalkSpec, view: GridView, width: number, height: number, options: WalkOptions): WalkGrid {
  const reach = new Int32Array(width * height);
  const nodes = new Float64Array(width * height);
  const status = new Uint8Array(width * height);
  const pixelRadius = Math.max(view.halfWidth / width, view.halfHeight / height);
  for (let j = 0; j < height; j++) {
    const y = view.cy + view.halfHeight * ((2 * (j + 0.5)) / height - 1);
    for (let i = 0; i < width; i++) {
      const x = view.cx + view.halfWidth * ((2 * (i + 0.5)) / width - 1);
      const absz = Math.hypot(x, y);
      const eps = options.eps ?? epsFor(pixelRadius, absz > 1 ? 1 / absz : absz, spec.maxAbs);
      const r = walkAt(spec, x, y, { ...options, eps });
      const at = j * width + i;
      reach[at] = r.reach;
      nodes[at] = r.nodes;
      status[at] = r.excluded ? 1 : r.exhausted ? 2 : 0;
    }
  }
  return { width, height, reach, nodes, status };
}
