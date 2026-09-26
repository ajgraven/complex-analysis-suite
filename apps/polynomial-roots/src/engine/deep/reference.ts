// The deep-zoom engine: ONE walk at the view's centre, on the CPU, at whatever precision the view needs.
//
// **Why a reference point rather than a wider float in the shader** (ADR-0046 decision 3). Past a
// certain zoom the limit-set shader cannot even place its own texels: it computes `z = centre +
// halfExtent·(2uv − 1)` in float32, and once the texel is below `ulp(centre)` every texel in a row gets
// the same `z`. Measured at `|z| ≈ 0.64`: the grid quantises at a half-height of about 2e-5. A df64
// shader would push that to ~1e-13 at several times the cost on EVERY pixel of EVERY frame; a reference
// point costs one walk per frame and reaches 1e-30.
//
// **What makes the reference point legitimate is that the survivors do not depend on the pixel.** The
// prune is `|s_k(z)| > max|a|·|z|^{k+1}/(1−|z|) + ε`, and over a view of radius `r` the whole family
// moves by at most `r·max|P′|` — which IS `ε` (Foster's fudge, `limit/walk.ts`). So one walk at `z₀`
// with `ε` read off the VIEW rather than off a texel prunes exactly the subtrees that cannot reach the
// view at all, and what survives is the list of polynomials with a root somewhere in it. Each is then
// Newton-polished to its root in the same precision, and the GPU is handed the OFFSET `δ = root − z₀`,
// which is small and therefore carries full relative precision in float32 — it is never added back to
// an `O(1)` number on the GPU at all.
//
// **This is Foster's `polysInBound` and it is the app's third reader of the one coefficient tree**: the
// root engine reads its leaves, the limit engine prunes it per pixel, and this prunes it once for a
// whole view and then SOLVES what is left. The probe is the same call at the cursor.
import type { Alphabet, AlphabetSpec } from "../alphabet.js";
import { compileAlphabet, formatCx } from "../alphabet.js";
import type { Cx2, Num, Precision } from "./num.js";
import { cxAdd, cxDiv, cxMul, cxSub, DOUBLE_DOUBLE, FLOAT64 } from "./num.js";

/** The deepest the reference walk will go. Far above the shader's cap: there are no GLSL arrays here. */
export const MAX_REFERENCE_DEPTH = 320;

/** Nodes one walk may visit. A view too shallow for this engine explodes; the budget says so. */
export const REFERENCE_BUDGET = 400000;

/**
 * Roots of ONE polynomial the walk will look for inside a view.
 *
 * Almost always one: at depth, two roots of the same polynomial in a 1e-30 window would be a near-double
 * root. At the shallow end it is routinely two or three, and the first draft drew only the first of them
 * — see `solve`.
 */
export const MAX_ROOTS_PER_POLYNOMIAL = 8;

/** Newton steps before giving up. The loop breaks on its own step size long before this. */
const NEWTON_STEPS = 24;

/**
 * A root is accepted when its backward error is at most this many units of the arithmetic's own
 * precision (`2^-bits`). Measured worst on accepted roots: 1.55e-32 in double-double (1.3 units) and
 * about 2 units in float64; 16 is the root engine's `8ε` with a factor of two for the complex Horner.
 */
const RESIDUAL_UNITS = 16;


/** What to ask of one view. */
export interface ReferenceRequest {
  readonly alphabet: AlphabetSpec;
  /** The centre, as decimal strings — a 1e-30 view does not survive a JSON number. */
  readonly cx: string;
  readonly cy: string;
  readonly halfHeight: number;
  readonly aspect: number;
  readonly depth: number;
  readonly precision: Precision;
  readonly budget?: number;
}

/** One polynomial with a root in the view, and its root as an offset from the reference point. */
export interface ReferenceRoot {
  /** `root − z₀`, in world units. Small by construction, so float32 carries it exactly. */
  readonly dx: number;
  readonly dy: number;
  readonly degree: number;
  /** Digit indices into the alphabet, `a_0` first. */
  readonly digits: readonly number[];
  /** `|P′(root)|` — Michelen–Yakir's κ, and what the Newton step divided by. */
  readonly derivative: number;
  /** `|P(root)| / Σ|a_k||root|^k` after polishing: the certificate, not the hope. */
  readonly residual: number;
}

/** What one view came back with. */
export interface ReferenceResult {
  readonly roots: readonly ReferenceRoot[];
  readonly nodes: number;
  /** The budget ran out, so `roots` is a partial list and the picture says so. */
  readonly exhausted: boolean;
  readonly depth: number;
  readonly precision: Precision;
  /** The radius the walk pruned against — half the view's diagonal. */
  readonly radius: number;
  /** Foster's fudge at the centre. */
  readonly eps: number;
  /** The centre, read back at this precision: what the walk actually used. */
  readonly cx: string;
  readonly cy: string;
}

/** A compact rendering of a coefficient vector — `−++−…` when the alphabet allows it. */
export function coefficientString(alphabet: Alphabet, digits: readonly number[]): string {
  const compact = alphabet.values.every((v) => Math.abs(v.im) < 1e-12 && (v.re === -1 || v.re === 0 || v.re === 1));
  if (compact) {
    return digits.map((d) => (alphabet.values[d].re > 0 ? "+" : alphabet.values[d].re < 0 ? "−" : "0")).join("");
  }
  return digits.map((d) => formatCx(alphabet.values[d])).join(", ");
}

/** Run the walk. The one entry point; the worker and the node tests both call it. */
export function runReference(request: ReferenceRequest): ReferenceResult | { error: string } {
  const compiled = compileAlphabet(request.alphabet);
  if ("error" in compiled) return compiled;
  return request.precision === "dd"
    ? walk(DOUBLE_DOUBLE, compiled.alphabet, request)
    : walk(FLOAT64, compiled.alphabet, request);
}

function walk<T>(F: Num<T>, alphabet: Alphabet, request: ReferenceRequest): ReferenceResult | { error: string } {
  const cx = F.parse(request.cx);
  const cy = F.parse(request.cy);
  if (cx === null || cy === null) return { error: `the view centre "${request.cx}, ${request.cy}" cannot be read` };
  const z0: Cx2<T> = { re: cx, im: cy };

  const depth = Math.max(1, Math.min(MAX_REFERENCE_DEPTH, Math.round(request.depth)));
  const budget = request.budget ?? REFERENCE_BUDGET;
  const halfHeight = Math.abs(request.halfHeight);
  const halfWidth = halfHeight * Math.abs(request.aspect);
  const radius = Math.hypot(halfWidth, halfHeight);

  const values = alphabet.values.map((v) => ({ re: F.of(v.re), im: F.of(v.im) }));
  let maxAbs = 0;
  for (const v of alphabet.values) maxAbs = Math.max(maxAbs, Math.hypot(v.re, v.im));
  const nonZero = new Uint8Array(alphabet.values.length);
  for (const j of alphabet.nonZero) nonZero[j] = 1;

  const absz = Math.hypot(F.toNumber(cx), F.toNumber(cy));
  if (!(absz > 0) || absz >= 1) {
    // Outside the open disk the tail bound is infinite. The app folds `|z| > 1` onto `1/z` before it
    // gets here, and `z = 0` is a root of nothing proper.
    return { error: "the deep engine works inside the unit disk; fold |z| > 1 onto 1/z first" };
  }
  // The margin must hold over the whole VIEW, not at its centre: Foster's ε bounds how far a truncation
  // can move across a disc of radius `radius`, and the series' derivative there is governed by
  // `1 − (|z₀| + radius)`. Using `1 − |z₀|` understated ε by 2.4× at a half-height of 0.05 (the
  // 2026-09-26 review; no miss observed, but the bound is the claim).
  const rim = 1 - absz - radius;
  if (!(rim > 0)) {
    return { error: "this view reaches the unit circle, where the tail bound is infinite; zoom in, or use the limit-set engine" };
  }
  const gap = Math.max(rim, 1e-300);
  const eps = (radius * maxAbs) / (gap * gap);

  // Path-independent prologue, at full precision for the powers and in doubles for the bounds.
  const pw: Cx2<T>[] = new Array<Cx2<T>>(depth + 1);
  const tail = new Float64Array(depth + 1);
  pw[0] = { re: F.one, im: F.zero };
  let absPow = 1;
  const rate = maxAbs / gap;
  for (let k = 0; k <= depth; k++) {
    if (k > 0) {
      pw[k] = cxMul(F, pw[k - 1], z0);
      absPow *= absz;
    }
    tail[k] = rate * absPow * absz;
  }

  const sum: Cx2<T>[] = new Array<Cx2<T>>(depth + 1);
  const idx = new Int32Array(depth + 2);
  const digit = new Int32Array(depth + 2);
  const roots: ReferenceRoot[] = [];
  const nValues = values.length;
  const nLeading = alphabet.leading.length;

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
    const d = level === 0 ? alphabet.leading[c] : c;
    const term = cxMul(F, values[d], pw[level]);
    const s = level === 0 ? term : cxAdd(F, sum[level - 1], term);
    // The modulus is read in doubles: the CANCELLATION happened inside the high-precision sum, and a
    // number near `ε` is carried by a double with full relative precision once it exists.
    const m = Math.hypot(F.toNumber(s.re), F.toNumber(s.im));
    if (m > tail[level] + eps) {
      idx[level]++;
      continue;
    }
    digit[level] = d;
    if (level >= 1 && m <= eps && nonZero[d] === 1) {
      solve(F, alphabet, values, digit, level, z0, halfWidth, halfHeight, roots);
    }
    if (level === depth) {
      idx[level]++;
      continue;
    }
    sum[level] = s;
    level++;
    idx[level] = 0;
  }

  roots.sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
  return {
    roots,
    nodes,
    exhausted,
    depth,
    precision: F.name,
    radius,
    eps,
    cx: F.format(cx),
    cy: F.format(cy),
  };
}

/**
 * Re-solve one of the walk's polynomials at full precision and return its root as a decimal pair.
 *
 * **The probe's "centre here" action, and the only way a deep view is reachable at all.** A root read
 * off a `ReferenceRoot` is a float64 OFFSET, so a centre built from one is accurate to about 1e-17 —
 * measured: at a half-height of 1e-18 such a centre puts `|P(z₀)|` at 4.4e-17 against an `ε` of 1.4e-17,
 * so the walk finds nothing at all, including the very polynomial the centre was taken from. The same
 * trap one level up cost the first deep measurement its ladder: the root engine's points are a
 * `Float32Array` (they are GPU vertex data), so a centre taken from one is good to seven digits.
 *
 * A centre is therefore never inherited; it is re-derived, here, at the precision the view will use.
 */
export function centreOnRoot(
  alphabet: AlphabetSpec,
  digits: readonly number[],
  cx: string,
  cy: string,
  precision: Precision,
  /**
   * The probed root's offset from `(cx, cy)`, where Newton starts. It started at the view centre, so for
   * a polynomial with two roots in the view it converged to the same one for both probes — measured in
   * forced-deep mode at `−0.3 + 0.5i`, half-height 0.2: 81 of 162 probes re-centred on the wrong root.
   */
  seed?: { readonly dx: number; readonly dy: number },
): { cx: string; cy: string } | { error: string } {
  const compiled = compileAlphabet(alphabet);
  if ("error" in compiled) return compiled;
  return precision === "dd"
    ? refine(DOUBLE_DOUBLE, compiled.alphabet, digits, cx, cy, seed)
    : refine(FLOAT64, compiled.alphabet, digits, cx, cy, seed);
}

function refine<T>(
  F: Num<T>,
  alphabet: Alphabet,
  digits: readonly number[],
  cxText: string,
  cyText: string,
  seed?: { readonly dx: number; readonly dy: number },
): { cx: string; cy: string } | { error: string } {
  const cx = F.parse(cxText);
  const cy = F.parse(cyText);
  if (cx === null || cy === null) return { error: `the centre "${cxText}, ${cyText}" cannot be read` };
  const values = alphabet.values.map((v) => ({ re: F.of(v.re), im: F.of(v.im) }));
  const coeffs = digits.map((d) => values[d]);
  const start = seed === undefined ? { re: cx, im: cy } : { re: F.add(cx, F.of(seed.dx)), im: F.add(cy, F.of(seed.dy)) };
  const z = newtonFrom(F, coeffs, coeffs.length - 1, start);
  if (z === null) return { error: "the polynomial has a multiple root here; Newton has nothing to divide by" };
  return { cx: F.format(z.re), cy: F.format(z.im) };
}

/**
 * Every root of this polynomial inside the view, as offsets from the reference point.
 *
 * **Not one root — every one.** The walk reaches each polynomial ONCE, and Newton from `z₀` converges
 * to whichever root's basin `z₀` sits in, so a polynomial with two roots in the view contributed one
 * and the other vanished from the picture. Measured against the root engine over a window at
 * `0.6 + 0.45i`: three of the sweep's 150 roots were missing, all of them second roots of a polynomial
 * already found. So each root is DEFLATED out and Newton runs again, and the loop stops when it leaves
 * the view. Every root is then re-polished on the ORIGINAL polynomial, so the residual reported is
 * never the deflated one's — deflation is a search device here, not an arithmetic the answer rests on.
 */
function solve<T>(
  F: Num<T>,
  alphabet: Alphabet,
  values: readonly Cx2<T>[],
  digit: Int32Array,
  degree: number,
  z0: Cx2<T>,
  halfWidth: number,
  halfHeight: number,
  out: ReferenceRoot[],
): void {
  const original: Cx2<T>[] = [];
  for (let k = 0; k <= degree; k++) original.push(values[digit[k]]);
  let working = original;
  const digits: number[] = [];
  for (let k = 0; k <= degree; k++) digits.push(digit[k]);

  const viewRadius = Math.hypot(halfWidth, halfHeight);
  const outer = Math.hypot(F.toNumber(z0.re), F.toNumber(z0.im)) + viewRadius;
  /** This polynomial's roots found so far, as offsets — so a polish that lands on one again is not a new root. */
  const seen: { dx: number; dy: number }[] = [];
  for (let pass = 0; pass < MAX_ROOTS_PER_POLYNOMIAL && working.length > 1; pass++) {
    // Could what is LEFT still have a root in the view? `|Q(z₀)| ≤ r·max|Q′|` on the disc is the same
    // admission the walk itself makes, applied to the deflated polynomial, and it costs one Horner pass
    // where a Newton costs a dozen. It is what keeps the deep case at ONE solve per polynomial: with the
    // root at the centre divided out, what remains provably has nothing left in a 1e-30 window.
    if (!couldReach(F, working, z0, viewRadius, outer)) return;
    const found = newtonFrom(F, working, working.length - 1, z0);
    if (found === null) return;
    // Polish on the ORIGINAL, so a deflated coefficient never reaches the answer.
    const polished = pass === 0 ? found : (newtonFrom(F, original, degree, found) ?? found);
    const dx = F.toNumber(F.sub(polished.re, z0.re));
    const dy = F.toNumber(F.sub(polished.im, z0.im));
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    // **The residual is the certificate, here as in the root engine.** `newtonFrom` returns its last
    // iterate after NEWTON_STEPS whatever happened, and this pushed it: an iterate that did not settle
    // would have been painted as a root (PR-1's rule is "not painted, and counted"). Adams's backward
    // error at a few units of the arithmetic's own precision is what a converged root achieves — the
    // measured worst at 1e-30 is 1.6e-32 against dd's 2⁻¹⁰⁶ = 1.2e-32 — so a looser one is a failure,
    // and the search for this polynomial stops rather than deflating by a point that is not a root.
    const residual = residualAt(F, alphabet, original, digits, degree, polished);
    if (!residualCertified(residual, F.bits)) return;
    // **A polish can land on a root already found.** The deflated polynomial's root is only
    // approximately a root of the original, and Newton on the original from it converges to whichever
    // root's basin it is in — measured in forced-deep mode at half-height 0.12: 998 rows, of which 16
    // polynomials carried the SAME root three or four times, drawn as three or four dots
    // (2026-09-26 review's sweep found it: the re-centring test's "second roots" were these repeats).
    // So a repeat is not pushed. The deflation still divides out the POLISHED root, repeat or not:
    // measured against Aberth on every polynomial the walk reached at `−0.3 + 0.5i`, half-height 0.2,
    // it finds 5,805 of 5,821 roots in view, where dividing out the deflated polynomial's own root finds
    // 5,711 of 5,731 and a hybrid 5,802 of 5,818 — the polished root is the more accurate factor.
    const tol = SAME_ROOT_RELATIVE * Math.max(1, Math.hypot(F.toNumber(polished.re), F.toNumber(polished.im)));
    const repeat = seen.some((q) => Math.hypot(q.dx - dx, q.dy - dy) <= tol);
    seen.push({ dx, dy });
    if (!repeat && Math.abs(dx) <= halfWidth && Math.abs(dy) <= halfHeight) {
      out.push({
        dx,
        dy,
        degree,
        digits,
        derivative: derivativeAt(F, original, degree, polished),
        residual,
      });
    }
    // A root outside the rect does NOT end the search: `z₀` can sit in the basin of a root just
    // outside it while another root of the same polynomial is inside. What ends it is `couldReach`
    // above, on the next pass. A second bound was tried here — `ε/|P′(z₀)|`, how far the hit test
    // itself admits a root could be — and the sweep found it DEAD: removing it changed no result and
    // cost 0.7 s on a 7.5 s suite, because `couldReach` had already stopped every loop it would have.
    working = deflate(F, working, polished);
  }
}

/**
 * Two roots of ONE polynomial closer than this (relative) are one root found twice. Distinct roots of a
 * polynomial over a small alphabet are separated far above it, and a pair that were not could not be
 * told apart by the Newton that found them anyway.
 */
const SAME_ROOT_RELATIVE = 1e-9;

/**
 * Is `residual` — Adams's backward error — within `RESIDUAL_UNITS` units of an arithmetic of `bits`
 * bits? What a converged root achieves; anything looser is an iterate that did not settle, and is not
 * drawn. Exported for its test: no root the walk reaches in the suite's corpus fails it, so the bound's
 * VALUE is pinned directly (the batch-B sweep found `RESIDUAL_UNITS = 1e30` changed no other test).
 */
export function residualCertified(residual: number, bits: number): boolean {
  return residual <= RESIDUAL_UNITS * Math.pow(2, -bits);
}

/** Newton from an arbitrary seed; null when the derivative vanishes (a multiple root). */
function newtonFrom<T>(F: Num<T>, coeffs: readonly Cx2<T>[], degree: number, seed: Cx2<T>): Cx2<T> | null {
  let z = seed;
  for (let iter = 0; iter < NEWTON_STEPS; iter++) {
    const { p, q } = hornerAt(F, coeffs, degree, z);
    const dq = Math.hypot(F.toNumber(q.re), F.toNumber(q.im));
    if (!(dq > 0)) return null;
    const step = cxDiv(F, p, q);
    z = cxSub(F, z, step);
    const stepAbs = Math.hypot(F.toNumber(step.re), F.toNumber(step.im));
    if (stepAbs === 0) break;
    if (stepAbs < Math.hypot(F.toNumber(z.re), F.toNumber(z.im)) * Math.pow(2, -F.bits + 2)) break;
  }
  return z;
}

/** `|P′(z)|`. */
function derivativeAt<T>(F: Num<T>, coeffs: readonly Cx2<T>[], degree: number, z: Cx2<T>): number {
  const { q } = hornerAt(F, coeffs, degree, z);
  return Math.hypot(F.toNumber(q.re), F.toNumber(q.im));
}

/** `|P(z)| / Σ|a_k||z|^k` — Adams's backward-error certificate, the same one the root engine uses. */
function residualAt<T>(
  F: Num<T>,
  alphabet: Alphabet,
  coeffs: readonly Cx2<T>[],
  digits: readonly number[],
  degree: number,
  z: Cx2<T>,
): number {
  const { p } = hornerAt(F, coeffs, degree, z);
  const absz = Math.hypot(F.toNumber(z.re), F.toNumber(z.im));
  let scale = 0;
  let power = 1;
  for (let k = 0; k <= degree; k++) {
    scale += Math.hypot(alphabet.values[digits[k]].re, alphabet.values[digits[k]].im) * power;
    power *= absz;
  }
  return scale > 0 ? Math.hypot(F.toNumber(p.re), F.toNumber(p.im)) / scale : 0;
}

/**
 * Could this polynomial have a root within `radius` of `z₀`?
 *
 * Two NECESSARY conditions, so a `false` is a proof that there is nothing left to find and the search
 * may stop. First order: `|Q(z₀)| ≤ radius · max|Q′|`, the derivative bounded term by term at the disc's
 * far edge. Second order, by Taylor with the remainder: a root `z` in the disc has
 * `0 = Q(z₀) + Q′(z₀)(z − z₀) + R` with `|R| ≤ radius²·max|Q″|/2`, so `|Q(z₀)| ≤ radius·|Q′(z₀)| +
 * radius²·max|Q″|/2`. The second uses the derivative AT `z₀` rather than its maximum over the disc, which
 * is what makes it tight on a small view: at the zoom story's 1e-30 the walk takes 1.23 s against 2.25 s,
 * at 1e-12 126 ms against 180 ms, with the root set identical (hashed) at both (2026-09-26 review).
 */
function couldReach<T>(F: Num<T>, coeffs: readonly Cx2<T>[], z0: Cx2<T>, radius: number, outer: number): boolean {
  const degree = coeffs.length - 1;
  let first = 0;
  let second = 0;
  let power = 1; // outer^(k−1)
  let powerLess = 0; // outer^(k−2), 0 for k = 1
  for (let k = 1; k <= degree; k++) {
    const a = Math.hypot(F.toNumber(coeffs[k].re), F.toNumber(coeffs[k].im));
    first += k * a * power;
    second += k * (k - 1) * a * powerLess;
    powerLess = power;
    power *= outer;
  }
  const { p, q } = hornerAt(F, coeffs, degree, z0);
  const absP = Math.hypot(F.toNumber(p.re), F.toNumber(p.im));
  // Kept although it is equivalent in OUTCOME to the second-order test alone (the batch-C sweep): both
  // are necessary conditions, so dropping either only admits more Newton runs that find nothing in view.
  if (absP > radius * first) return false;
  const absQ = Math.hypot(F.toNumber(q.re), F.toNumber(q.im));
  return absP <= radius * absQ + (radius * radius * second) / 2;
}

/** Divide out `(z − r)` by synthetic division. */
function deflate<T>(F: Num<T>, coeffs: readonly Cx2<T>[], r: Cx2<T>): Cx2<T>[] {
  const degree = coeffs.length - 1;
  const out = new Array<Cx2<T>>(degree);
  let carry = coeffs[degree];
  for (let k = degree - 1; k >= 0; k--) {
    out[k] = carry;
    carry = cxAdd(F, coeffs[k], cxMul(F, r, carry));
  }
  return out;
}

/** `P(z)` and `P′(z)` in one Horner pass. */
function hornerAt<T>(F: Num<T>, coeffs: readonly Cx2<T>[], degree: number, z: Cx2<T>): { p: Cx2<T>; q: Cx2<T> } {
  let p = coeffs[degree];
  let q: Cx2<T> = { re: F.zero, im: F.zero };
  for (let k = degree - 1; k >= 0; k--) {
    q = cxAdd(F, cxMul(F, q, z), p);
    p = cxAdd(F, cxMul(F, p, z), coeffs[k]);
  }
  return { p, q };
}

/** Floats per root in a packed frame: `[dx, dy, weight, degree, derivative, residual]`. */
export const FRAME_STRIDE = 6;

/**
 * A run packed for the wire and the GPU.
 *
 * The root list is thousands of records with a coefficient array each — 3,919 roots of degree up to
 * 164 at the app's floor — so it crosses the worker boundary as typed arrays rather than as objects:
 * one `Float32Array` the vertex buffer takes verbatim, and the coefficient vectors concatenated into a
 * `Uint8Array` with an index. An alphabet has at most 19 values, so a digit is a byte.
 */
export interface ReferenceFrame {
  readonly points: Float32Array;
  readonly digits: Uint8Array;
  /** `starts[i] … starts[i+1]` is root `i`'s coefficient vector. Length `count + 1`. */
  readonly starts: Int32Array;
  readonly count: number;
  /**
   * Distinct POINTS among them, at the precision the GPU draws with.
   *
   * Not the same as `count`, and the gap is the mathematics rather than a rounding artefact: if `P` is
   * a Littlewood polynomial with a root at `α`, so is `P·(1 + z^{d+1})`, and so is
   * `P·(1 + z^{d+1} + z^{2(d+1)})`, for ever. Measured at the zoom story's root at a half-height of
   * 1e-30: **2,223 polynomials on 140 points**, their degrees running 26, 53, 80, 107, 134 — steps of
   * `deg P + 1`. So the deep picture's density is a MULTIPLICITY, and "how many roots are here" and
   * "how many dots are here" are different questions.
   */
  readonly distinct: number;
  readonly nodes: number;
  readonly exhausted: boolean;
  readonly depth: number;
  readonly precision: Precision;
  readonly eps: number;
  readonly radius: number;
  readonly degreeMin: number;
  readonly degreeMax: number;
  /** The worst residual in the frame — the certificate for the whole picture. */
  readonly residual: number;
  /** Present only when the walk could not run at all. */
  readonly error?: string;
}

/** An empty frame carrying a reason. */
export function emptyFrame(error?: string): ReferenceFrame {
  return {
    points: new Float32Array(0),
    digits: new Uint8Array(0),
    starts: new Int32Array(1),
    count: 0,
    distinct: 0,
    nodes: 0,
    exhausted: false,
    depth: 0,
    precision: "float64",
    eps: 0,
    radius: 0,
    degreeMin: 0,
    degreeMax: 0,
    residual: 0,
    ...(error === undefined ? {} : { error }),
  };
}

/** Pack a run. */
export function packFrame(result: ReferenceResult | { error: string }): ReferenceFrame {
  if ("error" in result) return emptyFrame(result.error);
  const count = result.roots.length;
  const points = new Float32Array(count * FRAME_STRIDE);
  const starts = new Int32Array(count + 1);
  let total = 0;
  for (const root of result.roots) total += root.digits.length;
  const digits = new Uint8Array(total);
  let at = 0;
  let degreeMin = Number.POSITIVE_INFINITY;
  let degreeMax = 0;
  let residual = 0;
  result.roots.forEach((root, i) => {
    const p = i * FRAME_STRIDE;
    points[p] = root.dx;
    points[p + 1] = root.dy;
    points[p + 2] = 1;
    points[p + 3] = root.degree;
    points[p + 4] = root.derivative;
    points[p + 5] = root.residual;
    starts[i] = at;
    for (const d of root.digits) digits[at++] = d;
    degreeMin = Math.min(degreeMin, root.degree);
    degreeMax = Math.max(degreeMax, root.degree);
    residual = Math.max(residual, root.residual);
  });
  starts[count] = at;
  const places = new Set<string>();
  for (let i = 0; i < count; i++) places.add(`${points[i * FRAME_STRIDE]},${points[i * FRAME_STRIDE + 1]}`);
  return {
    points,
    digits,
    starts,
    count,
    distinct: places.size,
    nodes: result.nodes,
    exhausted: result.exhausted,
    depth: result.depth,
    precision: result.precision,
    eps: result.eps,
    radius: result.radius,
    degreeMin: count === 0 ? 0 : degreeMin,
    degreeMax,
    residual,
  };
}

/** Read root `i` back out of a packed frame. */
export function rootAt(frame: ReferenceFrame, i: number): ReferenceRoot | null {
  if (i < 0 || i >= frame.count) return null;
  const p = i * FRAME_STRIDE;
  return {
    dx: frame.points[p],
    dy: frame.points[p + 1],
    degree: frame.points[p + 3],
    digits: Array.from(frame.digits.subarray(frame.starts[i], frame.starts[i + 1])),
    derivative: frame.points[p + 4],
    residual: frame.points[p + 5],
  };
}

/** The index of the root nearest a world offset from the centre, or −1. */
export function nearestRoot(frame: ReferenceFrame, dx: number, dy: number): number {
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < frame.count; i++) {
    const p = i * FRAME_STRIDE;
    const d = Math.hypot(frame.points[p] - dx, frame.points[p + 1] - dy);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}
