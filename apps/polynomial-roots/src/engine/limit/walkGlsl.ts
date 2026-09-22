// The walk, generated as GLSL — the same algorithm as `walk.ts`, transcribed statement for statement.
//
// **Why generate rather than parameterise.** The alphabet could be a `uniform vec2[]` with its length a
// second uniform, and then one program would serve every alphabet. It would also make every inner-loop
// bound dynamic, put the choice tables in uniform storage the compiler cannot fold, and — the reason
// that settles it — make the ARRAY SIZES dynamic, which GLSL ES 3.0 does not allow at all: the explicit
// stack is `vec2 sm[D]`, and `D` is the depth the reader chose. So the program is generated per
// (alphabet, depth) and cached under that key, exactly as Contour Integration generates its branch-cut
// shader per record for the same reason — a declaration belongs in the program text.
//
// **What the shader may and may not do differently from `walk.ts`.** Nothing structural: the prologue,
// the stack, the order of the prune test and the hit test, and the `1/z` fold are the same statements,
// because the browser suite compares the two per pixel and a check between two DIFFERENT algorithms
// would only ever be measuring which is better. What does differ is the arithmetic width — float32 here
// against float64 there — and the parity test's tolerance is that difference and nothing else.
//
// **The one output rides the channel the stage already has.** `R` is the escape depth `reach`, an
// integer in `0 … D+1` (see `walk.ts` for why that, and not a survivor count). It is exact in float32
// and — since `D ≤ 48` — exact in the float16 fallback too, so the parity test compares it as an
// integer rather than within a tolerance, and a browser without `EXT_float_blend` loses nothing here.
//
// **Negative `R` is a status, not a density.** A count is never negative, so `−1` and `−2` are free to
// mean "inside the excluded band" and "the budget ran out" — which is what keeps an uncomputed pixel
// from being painted as an empty one. The alternative, a third channel, would double the memory of
// every one of the root engine's per-degree layers for a flag only this pass writes.
import type { Alphabet } from "../alphabet.js";
import { ANNULUS_INNER, MAX_DEPTH, MIN_DEPTH, NODE_BUDGET, walkSpec } from "./walk.js";

/** `R` for a pixel inside the excluded band. */
export const STATUS_EXCLUDED = -1;

/** `R` for a pixel whose walk ran out of nodes. */
export const STATUS_EXHAUSTED = -2;

/** A float, written so GLSL reads it as one. */
function f(x: number): string {
  if (!Number.isFinite(x)) throw new Error(`the shader cannot carry ${String(x)}`);
  const s = x.toPrecision(9);
  return /[.eE]/.test(s) ? s : `${s}.0`;
}

/** The fullscreen-triangle vertex shader the pass draws with. */
export const WALK_VERT = `#version 300 es
precision highp float;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** The cache key a generated program is stored under. */
export function walkProgramKey(alphabet: Alphabet, depth: number): string {
  return `${alphabet.id}|${clampDepth(depth)}`;
}

/** The depths the shader will generate for. */
export function clampDepth(depth: number): number {
  return Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, Math.round(depth)));
}

/**
 * Generate the walk fragment shader for one alphabet at one depth.
 *
 * `uCentre` / `uHalfExtent` place the composite's texel grid in the plane exactly as the point pass
 * does, so the two engines' pictures are registered to the same world window without either knowing
 * about the other.
 */
export function buildWalkShader(alphabet: Alphabet, depth: number): string {
  const spec = walkSpec(alphabet);
  const d = clampDepth(depth);
  const nv = spec.values.length >> 1;
  const nl = spec.leading.length >> 1;
  const vec2s = (a: Float64Array, n: number): string =>
    Array.from({ length: n }, (_, j) => `vec2(${f(a[2 * j])}, ${f(a[2 * j + 1])})`).join(", ");
  // Each node costs one iteration and each backtrack one more, and a backtrack cannot outnumber the
  // nodes that produced it — so twice the budget plus the depth is a cap the walk cannot reach, and the
  // loop is bounded for the driver without ever bounding the algorithm.
  const maxIter = 2 * NODE_BUDGET + d + 4;
  return `#version 300 es
precision highp float;
precision highp int;

#define DEPTH ${d}
#define NVAL ${nv}
#define NLEAD ${nl}
#define BUDGET ${f(NODE_BUDGET)}
#define MAXITER ${maxIter}
#define MAXABS ${f(spec.maxAbs)}
#define BAND ${f(ANNULUS_INNER)}

const vec2 VAL[NVAL] = vec2[NVAL](${vec2s(spec.values, nv)});
const vec2 LEAD[NLEAD] = vec2[NLEAD](${vec2s(spec.leading, nl)});

uniform vec2 uCentre;
uniform vec2 uHalfExtent;   // (halfWidth, halfHeight) in world units
uniform vec2 uResolution;   // the composite's size in texels
uniform float uPixelRadius; // one texel, in world units — Foster's fudge is scaled by this
uniform float uAnnulus;     // >0.5: walk inside the excluded band too

out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 z = uCentre + uHalfExtent * (2.0 * uv - 1.0);

  // The fold. Reversing a coefficient vector stays in the alphabet for every alphabet, so the root set
  // is symmetric under z -> 1/z and the walk outside the disk is the walk inside it.
  float r2 = dot(z, z);
  vec2 w = r2 > 1.0 ? vec2(z.x, -z.y) / r2 : z;
  float absw = length(w);

  if (absw > BAND && uAnnulus < 0.5) { fragColor = vec4(${f(STATUS_EXCLUDED)}, 0.0, 0.0, 1.0); return; }
  if (absw >= 1.0) { fragColor = vec4(${f(STATUS_EXHAUSTED)}, 0.0, 0.0, 1.0); return; }

  // Foster's fudge: the largest |P(z)| a polynomial with a root inside this texel can have.
  float gap = max(1.0 - min(absw, 1.0 - 1e-6), 1e-6);
  float eps = uPixelRadius * MAXABS / (gap * gap);

  // Path-independent prologue: pw[k] = w^k and tl[k] = MAXABS*|w|^(k+1)/(1-|w|).
  vec2 pw[DEPTH + 1];
  float tl[DEPTH + 1];
  float rate = MAXABS / (1.0 - absw);
  float absPow = 1.0;
  pw[0] = vec2(1.0, 0.0);
  tl[0] = rate * absw;
  for (int k = 1; k <= DEPTH; k++) {
    pw[k] = vec2(pw[k - 1].x * w.x - pw[k - 1].y * w.y, pw[k - 1].x * w.y + pw[k - 1].y * w.x);
    absPow *= absw;
    tl[k] = rate * absPow * absw;
  }

  vec2 sm[DEPTH + 1];
  int ix[DEPTH + 1];
  float reach = 0.0;
  float nodes = 0.0;
  bool exhausted = false;
  int level = 0;
  ix[0] = 0;

  for (int iter = 0; iter < MAXITER; iter++) {
    if (level < 0) break;
    int choices = level == 0 ? NLEAD : NVAL;
    int c = ix[level];
    if (c >= choices) {
      level--;
      if (level >= 0) ix[level]++;
      continue;
    }
    nodes += 1.0;
    if (nodes > BUDGET) { exhausted = true; break; }
    vec2 a = level == 0 ? LEAD[c] : VAL[c];
    vec2 p = pw[level];
    vec2 term = vec2(a.x * p.x - a.y * p.y, a.x * p.y + a.y * p.x);
    vec2 s = level == 0 ? term : sm[level - 1] + term;
    float m = length(s);
    if (m > tl[level] + eps) { ix[level]++; continue; }
    reach = max(reach, float(level + 1));
    // Early exit: survival is MONOTONE in the depth, so one branch at the cap settles the pixel.
    if (level == DEPTH) break;
    sm[level] = s;
    level++;
    ix[level] = 0;
  }

  if (exhausted) { fragColor = vec4(${f(STATUS_EXHAUSTED)}, 0.0, 0.0, 1.0); return; }
  fragColor = vec4(reach, 0.0, 0.0, 1.0);
}`;
}
