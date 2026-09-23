// The dragon: the third reader of the one coefficient tree.
//
// Fix `z` with `|z| < 1`. The maps `f_a(x) = a + z·x`, one per alphabet value, all contract, so they
// have a unique compact attractor
//
//     D_z = { Σ_{k≥0} a_k z^k : a_k ∈ A }
//
// — the SET OF VALUES of every power series over the alphabet, and the "dragon curve" the pictures are
// named for. The root engine reads the tree's leaves and the limit engine prunes it; this module keeps
// the values themselves, which is the same tree with nothing thrown away.
//
// **IT IS THE LIMIT ENGINE'S OWN QUESTION, DRAWN.** Bousch's theorem is `q ∈ D̄ ⟺ 0 ∈ D_q`: a point is
// in the closure of the root set exactly when some series over the alphabet vanishes there, which is
// exactly when the origin lies in the dragon at `q`. So the inset is not an ornament beside the
// picture — the picture is a map of where the inset's cloud swallows the origin, and `originInSet`
// below is checked against `walkAt` in the suite rather than being asserted from the paper.
//
// Two conventions differ and the difference is real. The attractor takes `a_0` from the WHOLE alphabet;
// the limit walk takes it from `alphabet.leading`, one representative per unit-orbit of the non-zero
// values, because the root engine counts PROPER polynomials. For `{−1, +1}` the two agree, because
// `D_z = −D_z` when `−A = A`. For `{0, 1}` they do not: the attractor contains `z·D_z` (the series with
// `a_0 = 0`) and the proper set does not. `properLeading` selects, the inset draws the attractor, and
// the cross-check against the walk passes `true`.
//
// **Cost is the picture's own resolution, and near `|z| = 1` it is unaffordable.** A depth-`D`
// enumeration is `|A|^{D+1}` points and pins the attractor to within its own tail,
// `max|a|·|z|^{D+1}/(1−|z|)`. At `|z| = 0.64` a fifth of a percent takes `D = 11` — 4,096 points. At
// `|z| = 0.9` it takes `D = 50`, which is 2^51. That is the same fact as the limit walk costing 300×
// inside the annulus, arriving in the other engine: the dragon near the unit circle is not slow to
// draw, it is beyond drawing, and `DragonPlan.resolved` says so rather than drawing a coarse cloud
// that looks finished.
import type { Alphabet, Cx } from "./alphabet.js";

/** Points one enumeration may hold. 2²⁰ pairs of doubles is 16 MB, and an inset has ~5·10⁴ pixels. */
export const MAX_DRAGON_POINTS = 1 << 20;

/** Deepest enumeration, whatever the alphabet size — a guard on the loop, not on the memory. */
export const MAX_DRAGON_DEPTH = 24;

/** What a dragon enumeration can and cannot do at this point and this resolution. */
export interface DragonPlan {
  /** Coefficients `a_0 … a_depth` are chosen; `-1` when there is nothing to draw. */
  readonly depth: number;
  /** `|A|^{depth+1}` — how many points the enumeration returns. */
  readonly points: number;
  /** `max|a|·|z|^{depth+1}/(1−|z|)`: every drawn point is within this of the true attractor. */
  readonly tail: number;
  /** The tail is below the caller's resolution, so the cloud is the attractor to within a pixel. */
  readonly resolved: boolean;
  /** The point budget stopped the enumeration short of that resolution. */
  readonly capped: boolean;
  /** `|z| < 1`. When false there is no attractor at all and `depth` is `-1`. */
  readonly contracts: boolean;
}

/** `max|a|` over the alphabet. */
export function maxAbsOf(alphabet: Alphabet): number {
  let m = 0;
  for (const v of alphabet.values) m = Math.max(m, Math.hypot(v.re, v.im));
  return m;
}

/**
 * How deep to enumerate at `z` to pin the attractor to `resolution`, and what that costs.
 *
 * The depth is chosen from the RESOLUTION and then cut by the budget, in that order, so `capped` means
 * "this picture is coarser than you asked for" and `resolved` means "it is not". Reversing them would
 * make a budget-limited cloud indistinguishable from a converged one.
 */
export function dragonPlan(alphabet: Alphabet, z: Cx, resolution: number): DragonPlan {
  const absz = Math.hypot(z.re, z.im);
  const maxAbs = maxAbsOf(alphabet);
  if (!(absz < 1) || !Number.isFinite(absz)) {
    return { depth: -1, points: 0, tail: Infinity, resolved: false, capped: false, contracts: false };
  }
  const size = alphabet.values.length;
  const rate = maxAbs / (1 - absz);
  // `rate · |z|^{D+1} < resolution` — the depth resolution asks for, before any budget.
  const wanted =
    absz === 0 || rate <= resolution ? 0 : Math.ceil(Math.log(resolution / rate) / Math.log(absz)) - 1;
  const want = Math.max(0, Math.min(MAX_DRAGON_DEPTH, wanted));
  // The deepest the budget allows: `size^{D+1} ≤ MAX_DRAGON_POINTS`.
  const affordable = Math.max(0, Math.floor(Math.log(MAX_DRAGON_POINTS) / Math.log(size)) - 1);
  const depth = Math.min(want, affordable);
  const tail = rate * Math.pow(absz, depth + 1);
  return {
    depth,
    points: Math.round(Math.pow(size, depth + 1)),
    tail,
    resolved: tail < resolution,
    capped: depth < want,
    contracts: true,
  };
}

/**
 * Every value `Σ_{k≤depth} a_k z^k`, as interleaved `re, im`.
 *
 * Built level by level rather than by recursion: level `k` multiplies the whole previous level by `z^k`
 * once and adds each alphabet value, so the cost is one complex multiply per POINT rather than per
 * point per level, and `z^k` is accumulated once instead of being raised each time.
 */
export function dragonSet(alphabet: Alphabet, z: Cx, depth: number, properLeading = false): Float64Array {
  if (depth < 0) return new Float64Array(0);
  const first = properLeading ? alphabet.leading.map((j) => alphabet.values[j]) : alphabet.values;
  const size = alphabet.values.length;
  let out = new Float64Array(first.length * 2);
  first.forEach((v, i) => {
    out[2 * i] = v.re;
    out[2 * i + 1] = v.im;
  });
  let pr = 1;
  let pi = 0;
  for (let k = 1; k <= depth; k++) {
    const nr = pr * z.re - pi * z.im;
    pi = pr * z.im + pi * z.re;
    pr = nr;
    const count = out.length / 2;
    const next = new Float64Array(count * size * 2);
    for (let j = 0; j < size; j++) {
      const v = alphabet.values[j];
      // `a_k z^k` is the same shift for every point at this level.
      const dr = v.re * pr - v.im * pi;
      const di = v.re * pi + v.im * pr;
      const base = j * count * 2;
      for (let i = 0; i < count; i++) {
        next[base + 2 * i] = out[2 * i] + dr;
        next[base + 2 * i + 1] = out[2 * i + 1] + di;
      }
    }
    out = next;
  }
  return out;
}

/**
 * Is the origin inside the drawn cloud, to within `eps` plus the enumeration's own tail?
 *
 * This is Bousch's criterion evaluated on what was actually computed, and it is the limit walk's
 * verdict by another route: the walk prunes a prefix when `|s_k|` exceeds `tail[k] + eps` and reports
 * how deep it got, while this enumerates every `s_depth` and takes the smallest. The suite runs both at
 * the same `z`, `depth` and `eps` and requires them to agree.
 */
export function originInSet(points: Float64Array, tail: number, eps: number): boolean {
  return nearestToOrigin(points) <= tail + eps;
}

/** `min |s|` over the cloud. Infinity when it is empty. */
export function nearestToOrigin(points: Float64Array): number {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const d = Math.hypot(points[i], points[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

/** The cloud's bounding box, as `[minRe, minIm, maxRe, maxIm]`; a zero-size box when it is empty. */
export function dragonBounds(points: Float64Array): [number, number, number, number] {
  if (points.length === 0) return [0, 0, 0, 0];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    if (points[i] < x0) x0 = points[i];
    if (points[i] > x1) x1 = points[i];
    if (points[i + 1] < y0) y0 = points[i + 1];
    if (points[i + 1] > y1) y1 = points[i + 1];
  }
  return [x0, y0, x1, y1];
}

// --- theorem mode (Michelen–Yakir) ----------------------------------------------------------------

/**
 * How much of the overlay's own radius float64's magnified noise may be before the mode refuses.
 *
 * **The convergence is a U, and the right-hand side is the arithmetic rather than the theorem.** The
 * overlay divides by `α^{n+1}`, so a root known to `~1e-16` absolute comes back with an error of
 * `1e-16/|α|^{n+1}` — and that grows with the prefix degree exactly as the theorem's own error shrinks.
 * Measured at Baez's point on one root, extending the prefix by exact doubling (`P·(1 + z^{d+1})`, which
 * keeps `α` a root):
 *
 *     degree   16        33        67        135
 *     worst    6.83e-3   1.21e-5   1.80e-4   5.42e-1
 *     noise    1.12e-13  1.25e-10  1.57e-4   2.47e+8
 *
 * The minimum is near degree 33; by 135 the "overlay" is the picture's own radius, which is to say it is
 * noise. So a deep probe's highest-degree polynomials are the WORST prefixes to illustrate the theorem
 * with, not the best, and the mode refuses rather than drawing a disagreement the theorem is not having.
 */
export const MAGNIFIED_NOISE_FLOOR = 1e-2;

/** What theorem mode was asked to draw. */
export interface TheoremRequest {
  /** The prefix polynomial's digit indices, `a_0 … a_n`, exactly as the probe reports them. */
  readonly digits: readonly number[];
  /** A root of that polynomial. Refined by Newton before anything else is computed. */
  readonly alpha: Cx;
  /** How many extension digits `a_{n+1} … a_{n+m}` to enumerate; `|A|^m` points. */
  readonly extend: number;
}

/** The overlay, and the number that says whether it lands. */
export interface TheoremOverlay {
  /** `−P′(α)⁻¹ · Σ_{j<m} a_{n+1+j} α^j` for each tail, interleaved. The theorem's prediction. */
  readonly predicted: Float64Array;
  /** `(w − α)/α^{n+1}` for the actual root `w` of each extension, in the SAME tail order. */
  readonly actual: Float64Array;
  /** The largest distance between a paired prediction and its root. */
  readonly worst: number;
  /** The overlay's own radius, so `worst` can be read as a fraction of the picture. */
  readonly radius: number;
  /** `|P′(α)|` — the theorem's `κ`. Small means its hypothesis is weak here. */
  readonly kappa: number;
  /** `deg P`. */
  readonly degree: number;
  /** `|α|^{n+1}`: how far the picture is magnified. */
  readonly magnification: number;
  /** `1e-16 / |α|^{n+1}`, the error float64 alone contributes to a magnified root. */
  readonly noise: number;
}

/**
 * The theorem, drawn — and PAIRED, which is strictly stronger than the Hausdorff distance it states.
 *
 * Michelen–Yakir: for a Littlewood series with a root `α` and `|P′(α)| ≥ κ`, the roots of all extensions
 * of its length-`n` prefix, magnified by `T(w) = (w − α)/α^{n+1}`, converge in Hausdorff distance to
 * `P′(α)^{−1} D_α`. The derivation is one line of Egan's heuristic made exact: an extension is
 * `Q = P + z^{n+1}R`, so near the root `Q(w) ≈ P′(α)(w − α) + α^{n+1}R(α)`, and `T(w) → −R(α)/P′(α)`.
 *
 * **The tails INDEX both sets**, because `R` ranges over the same `|A|^m` truncations on both sides. So
 * instead of a Hausdorff distance — a min over a max, which a systematically rotated overlay can still
 * pass — every predicted point has a named partner and `worst` is the largest distance between them.
 *
 * **THE SIGN IS NOT DECORATION, and the paper can drop it because it is about Littlewood.** `−D_α = D_α`
 * whenever `−A = A`, so over `{−1, +1}` the minus is invisible; over `{0, 1}` it is the difference
 * between the overlay and its reflection, and the suite measures that on both alphabets.
 */
export function theoremOverlay(alphabet: Alphabet, request: TheoremRequest): TheoremOverlay | { error: string } {
  const { digits, extend } = request;
  const degree = digits.length - 1;
  if (degree < 1) return { error: "a theorem overlay needs a polynomial of degree at least 1" };
  const coeffs = digits.map((d) => alphabet.values[d]);
  if (coeffs.some((c) => c === undefined)) return { error: "the polynomial names a digit the alphabet does not have" };

  const alpha = newtonOn(coeffs, request.alpha);
  if (alpha === null) return { error: "the polynomial has a multiple root here; the theorem's κ is zero" };
  const absAlpha = Math.hypot(alpha.re, alpha.im);
  if (!(absAlpha > 0) || !(absAlpha < 1)) {
    return { error: "the theorem is about a root INSIDE the unit disk; this one is not" };
  }
  const magnification = Math.pow(absAlpha, degree + 1);
  const noise = 1e-16 / magnification;

  const dP = derivativeAt(coeffs, alpha);
  const kappa = Math.hypot(dP.re, dP.im);
  if (!(kappa > 0)) return { error: "P′(α) = 0, so the theorem says nothing here" };

  const size = alphabet.values.length;
  const m = Math.max(0, Math.round(extend));
  const count = Math.round(Math.pow(size, m));
  if (!Number.isFinite(count) || count > MAX_DRAGON_POINTS) {
    return { error: `${size}^${m} extensions is past this app's budget of ${MAX_DRAGON_POINTS}` };
  }

  // `R(α) = Σ_{j<m} a_{n+1+j} α^j` for every tail, in odometer order — the same order the extension
  // polynomials are built in below, which is what makes the two arrays a PAIRING rather than two sets.
  const rValues = dragonSet(alphabet, alpha, m - 1);
  const predicted = new Float64Array(count * 2);
  const actual = new Float64Array(count * 2);
  const den = dP.re * dP.re + dP.im * dP.im;
  let radius = 0;
  for (let t = 0; t < count; t++) {
    const rr = m === 0 ? 0 : rValues[2 * t];
    const ri = m === 0 ? 0 : rValues[2 * t + 1];
    const pr = -(rr * dP.re + ri * dP.im) / den;
    const pi = -(ri * dP.re - rr * dP.im) / den;
    predicted[2 * t] = pr;
    predicted[2 * t + 1] = pi;
    radius = Math.max(radius, Math.hypot(pr, pi));
  }
  // The prediction is cheap and the |A|^m Newton solves are not, so the refusal is decided FIRST and
  // costs nothing: past the floor the magnified roots are float64's rounding, not the theorem's error.
  if (noise > MAGNIFIED_NOISE_FLOOR * radius) {
    return {
      error:
        `at degree ${degree} the magnification is ${(1 / magnification).toPrecision(3)}×, so float64's own ` +
        `rounding reaches ${noise.toPrecision(3)} in a picture of radius ${radius.toPrecision(3)} — ` +
        `a lower-degree prefix through the same root illustrates the theorem, this one draws noise`,
    };
  }

  const tail: number[] = new Array(m).fill(0);
  let worst = 0;
  for (let t = 0; t < count; t++) {
    const pr = predicted[2 * t];
    const pi = predicted[2 * t + 1];
    // actual: Newton on the extension, magnified about α
    const extended = coeffs.concat(tail.map((d) => alphabet.values[d]));
    const w = newtonOn(extended, alpha);
    if (w === null) {
      actual[2 * t] = NaN;
      actual[2 * t + 1] = NaN;
      worst = Infinity;
    } else {
      const q = divideByPower(w.re - alpha.re, w.im - alpha.im, alpha, degree + 1);
      actual[2 * t] = q.re;
      actual[2 * t + 1] = q.im;
      worst = Math.max(worst, Math.hypot(q.re - pr, q.im - pi));
    }
    // odometer over the tail digits, little-endian in `j` to match `dragonSet`'s level order
    for (let j = 0; j < m; j++) {
      if (++tail[j] < size) break;
      tail[j] = 0;
    }
  }
  return { predicted, actual, worst, radius, kappa, degree, magnification, noise };
}

/** `(dr + i·di) / α^{p}`, by repeated division so no power of a small `α` is ever formed. */
function divideByPower(dr: number, di: number, alpha: Cx, p: number): Cx {
  const den = alpha.re * alpha.re + alpha.im * alpha.im;
  let r = dr;
  let i = di;
  for (let k = 0; k < p; k++) {
    const nr = (r * alpha.re + i * alpha.im) / den;
    i = (i * alpha.re - r * alpha.im) / den;
    r = nr;
  }
  return { re: r, im: i };
}

/** `P′(z)` by Horner on the derivative's coefficients. */
function derivativeAt(coeffs: readonly Cx[], z: Cx): Cx {
  let r = 0;
  let i = 0;
  for (let k = coeffs.length - 1; k >= 1; k--) {
    const nr = r * z.re - i * z.im + coeffs[k].re * k;
    i = r * z.im + i * z.re + coeffs[k].im * k;
    r = nr;
  }
  return { re: r, im: i };
}

/** Newton from a seed; null when the derivative vanishes. Twenty-four steps is far past quadratic. */
function newtonOn(coeffs: readonly Cx[], seed: Cx): Cx | null {
  let z = seed;
  for (let step = 0; step < 24; step++) {
    let pr = 0;
    let pi = 0;
    let qr = 0;
    let qi = 0;
    for (let k = coeffs.length - 1; k >= 0; k--) {
      const nqr = qr * z.re - qi * z.im + pr;
      qi = qr * z.im + qi * z.re + pi;
      qr = nqr;
      const npr = pr * z.re - pi * z.im + coeffs[k].re;
      pi = pr * z.im + pi * z.re + coeffs[k].im;
      pr = npr;
    }
    const den = qr * qr + qi * qi;
    if (!(den > 0)) return null;
    const sr = (pr * qr + pi * qi) / den;
    const si = (pi * qr - pr * qi) / den;
    z = { re: z.re - sr, im: z.im - si };
    const step2 = Math.hypot(sr, si);
    if (step2 === 0) break;
    if (step2 < Math.hypot(z.re, z.im) * 2 ** -51) break;
  }
  return z;
}
