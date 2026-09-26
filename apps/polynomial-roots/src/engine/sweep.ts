// One chunk of the root sweep: walk a slice of the index space, keep the canonical representatives,
// solve them, and hand back their roots with the weight each one carries.
//
// This is the whole root engine as a PURE function of plain data, so the node gate runs it directly and
// the worker (`roots.worker.ts`) is a five-line wrapper. Everything that could be wrong about the
// picture — which polynomials are enumerated, how much density each root deposits, how many roots are
// real — is decided here, where a test can see it.
//
// The buffer handed back is `[x, y, weight]` per root of each REPRESENTATIVE. The symmetry images are
// not expanded here: the stage draws the same buffer once per group element with the root map in the
// vertex shader, which is four draw calls instead of four times the bandwidth. The statistics, though,
// ARE computed over every image — "how many roots are real" is a question about the whole cloud, not
// about the quarter of it that happens to be enumerated.
import type { Alphabet, AlphabetSpec } from "./alphabet.js";
import { compileAlphabet } from "./alphabet.js";
import { aberth, makeWorkspace } from "./aberth.js";
import type { AberthWorkspace } from "./aberth.js";
import { canonicalOf, decodeDigits, orbitSpace, properCount } from "./orbits.js";
import { imageHues } from "./egan.js";
import type { OrbitSpace } from "./orbits.js";

/** What to sweep: an alphabet, one degree, and a half-open slice `[lo, hi)` of its index space. */
export interface SweepRequest {
  readonly spec: AlphabetSpec;
  readonly degree: number;
  readonly lo: number;
  readonly hi: number;
  /** Half-width of the band around `|z| = 1` the near-circle statistic counts. */
  readonly circleDelta: number;
  /**
   * Egan's hue: how many low-order coefficients colour a root, or 0 (the default) for none. The hues
   * are only computed when asked for — they are `|G|` floats per root, which at Littlewood's `|G| = 4`
   * more than doubles what a chunk carries, and the density and degree modes never read them.
   */
  readonly hueDigits?: number;
}

/** The counts a sweep reports — all over the FULL root multiset, not over the representatives. */
export interface SweepStats {
  /** Proper polynomials this chunk stands for. */
  readonly polynomials: number;
  /**
   * Roots this chunk actually FOUND — `degree × (polynomials − nonConverged)`. It is the count of what
   * was painted, not of what exists, and the two differ exactly when a solve failed.
   */
  readonly roots: number;
  /** Of those, how many are real. */
  readonly realRoots: number;
  /** Of those, how many lie within `circleDelta` of the unit circle. */
  readonly nearCircle: number;
  /**
   * Polynomials whose solve did not settle. Their roots are NOT painted and NOT counted: a solver that
   * has failed is holding iterates, not roots, and one of them once turned into a double root at a place
   * the polynomial does not vanish (see `aberth.ts`). Reported so the number is visible rather than
   * absent.
   */
  readonly nonConverged: number;
}

/** A finished chunk: the representative roots, their weights, and the counts. */
export interface SweepResult {
  readonly degree: number;
  /** `[x, y, weight]` per representative root; `length = 3 × representatives × degree`. */
  readonly points: Float32Array;
  /**
   * Egan's hue per root per symmetry image, `|G|` consecutive floats per point in the alphabet's group
   * order — present exactly when the request asked for `hueDigits > 0`. See `egan.ts`.
   */
  readonly hues?: Float32Array;
  readonly representatives: number;
  readonly stats: SweepStats;
}

/** A root counts as real outright when its imaginary part is below this, relative to `max(1, |z|)`. */
const REAL_TOL = 1e-9;

/** Past this (relative) imaginary part a root is non-real whatever its neighbours do. */
const PAIRING_REACH = 1e-3;

/**
 * How many times the conjugate's distance to its nearest other root a real root's imaginary part may be.
 * A split DOUBLE root measures ≤ 2; a split TRIPLE root up to ~6 (Littlewood `1 − z − z² + z³ + z⁴ −
 * z⁵ − z⁶ + z⁷`-type, measured 5.0 at −1 — the first draft's 4 missed eight roots at degree 7). A
 * genuine non-real pair has its conjugate within ~1e-15 of a root, so any factor below ~1e9 separates
 * them; 64 is generous on the cluster side and nowhere near the pair side.
 */
const PAIRING_FACTOR = 64;

/**
 * Is root `r` of a REAL polynomial real?
 *
 * **A multiple real root does not come back on the axis.** Aberth resolves a double root to about `√ε`,
 * so `(1 − z)²(1 + z)` returns `1 ± 2.5e-8i`-ish rather than two copies of 1, and a fixed `|im| < 1e-9`
 * test counted neither: trinary at degree 11 lost about 4,190 of its real roots (1.05%), and the old
 * test's "truth" used the same solver and the same threshold, so it could not see it (2026-09-26
 * review). What decides it is the CONJUGATE: a real polynomial's non-real roots come in conjugate
 * pairs, which the solver returns to working precision (`|conj z₁ − z₂| ~ 1e-15`, far below `|im|`),
 * while a split real root's "partner" is as far from its conjugate as it is from the axis. So a root is
 * real when its imaginary part is no more than `PAIRING_FACTOR` times the distance from its conjugate to
 * the nearest OTHER root. A triple root's split is caught the same way, its members' mismatch being of
 * the same order as their imaginary parts. Checked EXACTLY against Sturm's theorem over every proper
 * polynomial of four alphabets (`test/sweep.test.ts`).
 */
export function isRealRoot(re: Float64Array, im: Float64Array, degree: number, r: number): boolean {
  const x = re[r];
  const y = im[r];
  const scale = Math.max(1, Math.hypot(x, y));
  const ay = Math.abs(y);
  if (ay < REAL_TOL * scale) return true;
  if (ay > PAIRING_REACH * scale) return false;
  let nearest = Infinity;
  for (let k = 0; k < degree; k++) {
    // Skipping `r` itself is kept for clarity, not for the answer: its own conjugate is `2|y|` away, and
    // `|y| ≤ 64·2|y|` always holds, so including it could never flip the test (a recorded equivalent).
    if (k === r) continue;
    const d = Math.hypot(re[k] - x, im[k] + y);
    if (d < nearest) nearest = d;
  }
  return ay <= PAIRING_FACTOR * nearest;
}

/** Reusable per-degree buffers, so a sweep of a million polynomials allocates nothing per polynomial. */
export interface Scratch {
  readonly digits: Int32Array;
  readonly image: Int32Array;
  readonly cRe: Float64Array;
  readonly cIm: Float64Array;
  readonly ws: AberthWorkspace;
  readonly hueImage: Int32Array;
  readonly hue: Float64Array;
}

function makeScratch(degree: number): Scratch {
  return {
    digits: new Int32Array(degree + 1),
    image: new Int32Array(degree + 1),
    cRe: new Float64Array(degree + 1),
    cIm: new Float64Array(degree + 1),
    ws: makeWorkspace(degree),
    hueImage: new Int32Array(degree + 1),
    hue: new Float64Array(8),
  };
}

/** A Float32Array that grows by doubling, one value at a time. */
class FloatBuffer {
  private data: Float32Array;
  private used = 0;
  constructor(initial: number) {
    this.data = new Float32Array(Math.max(1, initial));
  }
  push(v: number): void {
    if (this.used === this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    this.data[this.used++] = v;
  }
  finish(): Float32Array {
    return this.data.slice(0, this.used);
  }
}

/** A Float32Array that grows by doubling — the canonical count is known only after the walk. */
class PointBuffer {
  private data: Float32Array;
  private used = 0;
  constructor(initial: number) {
    this.data = new Float32Array(Math.max(3, initial));
  }
  push(x: number, y: number, w: number): void {
    if (this.used + 3 > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    this.data[this.used++] = x;
    this.data[this.used++] = y;
    this.data[this.used++] = w;
  }
  finish(): Float32Array {
    return this.data.slice(0, this.used);
  }
}

/**
 * Sweep `[lo, hi)` of one degree's index space.
 *
 * Returns an error string rather than throwing when the alphabet cannot be compiled, so a worker can
 * relay the reason instead of dying: an unreadable custom alphabet is a thing the reader typed, not a
 * crash.
 */
export function sweepChunk(req: SweepRequest): SweepResult | { error: string } {
  const compiled = compileAlphabet(req.spec);
  if ("error" in compiled) return compiled;
  const alphabet = compiled.alphabet;
  if (req.degree < 1) {
    return {
      degree: req.degree,
      points: new Float32Array(0),
      representatives: 0,
      stats: { polynomials: 0, roots: 0, realRoots: 0, nearCircle: 0, nonConverged: 0 },
    };
  }
  const space = orbitSpace(alphabet, req.degree);
  return sweepPrepared(alphabet, space, req, makeScratch(req.degree));
}

/** The walk itself, with the alphabet and scratch already built (the worker reuses both across chunks). */
export function sweepPrepared(
  alphabet: Alphabet,
  space: OrbitSpace,
  req: SweepRequest,
  scratch: Scratch,
): SweepResult {
  const degree = space.degree;
  const lo = Math.max(0, Math.floor(req.lo));
  const hi = Math.min(space.total, Math.floor(req.hi));
  const units = alphabet.units.length;
  const group = alphabet.group;
  const values = alphabet.values;

  const estimate = Math.max(1, Math.ceil(((hi - lo) / group.length) * degree * 3 * 1.2));
  const out = new PointBuffer(Math.min(estimate, 1 << 22));
  const hueDigits = Math.max(0, Math.floor(req.hueDigits ?? 0));
  const hues = hueDigits > 0 ? new FloatBuffer(Math.min((estimate / 3) * group.length, 1 << 22)) : null;

  let representatives = 0;
  let polynomials = 0;
  let roots = 0;
  let realRoots = 0;
  let nearCircle = 0;
  let nonConverged = 0;
  const delta = req.circleDelta;
  const realAlphabet = alphabet.allReal;

  for (let index = lo; index < hi; index++) {
    decodeDigits(alphabet, space, index, scratch.digits);
    const { canonical, stabiliser } = canonicalOf(alphabet, space, scratch.digits, scratch.image);
    if (!canonical) continue;
    representatives++;

    for (let k = 0; k <= degree; k++) {
      const v = values[scratch.digits[k]];
      scratch.cRe[k] = v.re;
      scratch.cIm[k] = v.im;
    }
    const solved = aberth(scratch.cRe, scratch.cIm, degree, scratch.ws);
    // Each image of this representative stands for `units / stabiliser` polynomials; summed over the
    // group that is `units · |G| / stabiliser` — the orbit size times the unit multiplicity.
    const weight = units / stabiliser;
    const stands = (units * group.length) / stabiliser;
    polynomials += stands;
    if (!solved.converged) {
      // Paint nothing. The workspace holds iterates that did not reach the residual certificate, and
      // painting them is how a picture acquires roots the polynomial does not have.
      nonConverged += stands;
      continue;
    }
    if (hues !== null) imageHues(alphabet, space, scratch.digits, hueDigits, scratch.hueImage, scratch.hue);

    for (let r = 0; r < degree; r++) {
      const x = scratch.ws.rootRe[r];
      const y = scratch.ws.rootIm[r];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      // The buffer carries the REPRESENTATIVE's root at its per-image weight; the stage applies the
      // group's root maps when it draws. `units` is a global scale and is deliberately not baked in —
      // the picture is tone-mapped, and the counts below carry it instead.
      out.push(x, y, 1 / stabiliser);
      if (hues !== null) for (let g = 0; g < group.length; g++) hues.push(scratch.hue[g]);
      // Every group map preserves realness (conjugation, negation and 1/z all send ℝ to ℝ), so it is
      // decided ONCE, on the representative's own root set — which is also the only set on which the
      // conjugate-pairing test means anything. Half the group reverses (reversal is always in it), and
      // reversal sends |z| to 1/|z|; conjugation and negation leave |z| alone. So two modulus checks
      // stand for the whole group, where this used to allocate a mapped point per image per root.
      const all = weight * group.length;
      roots += all;
      if (realAlphabet ? isRealRoot(scratch.ws.rootRe, scratch.ws.rootIm, degree, r) : Math.abs(y) < REAL_TOL) {
        realRoots += all;
      }
      const m = Math.hypot(x, y);
      if (Math.abs(m - 1) < delta) nearCircle += all / 2;
      if (Math.abs(1 / m - 1) < delta) nearCircle += all / 2;
    }
  }

  return {
    degree,
    points: out.finish(),
    ...(hues !== null ? { hues: hues.finish() } : {}),
    representatives,
    stats: { polynomials, roots, realRoots, nearCircle, nonConverged },
  };
}

/** Everything a worker needs to keep between chunks of one degree. */
export interface SweepContext {
  readonly alphabet: Alphabet;
  readonly space: OrbitSpace;
  readonly scratch: Scratch;
}

/** Build a reusable context, or the reason the alphabet could not be compiled. */
export function prepareSweep(spec: AlphabetSpec, degree: number): SweepContext | { error: string } {
  const compiled = compileAlphabet(spec);
  if ("error" in compiled) return compiled;
  return {
    alphabet: compiled.alphabet,
    space: orbitSpace(compiled.alphabet, degree),
    scratch: makeScratch(degree),
  };
}

/** How many roots the whole family of this degree has — the number a full sweep's stats must reach. */
export function expectedRoots(alphabet: Alphabet, degree: number): number {
  return degree * properCount(alphabet, degree);
}
