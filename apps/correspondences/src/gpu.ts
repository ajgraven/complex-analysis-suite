// GPU (WebGL2) render of the deltoid Schwarz-reflection dynamical plane — Milestone A, P6-C4. The σ
// iteration is inherently numerical (φ⁻¹ is a per-pixel Newton solve), so this ports the CPU reference
// (src/deltoid.ts / src/render.ts) into a fragment shader — the same shape QD's schwarz-webgl uses:
// per-pixel Newton invertPhi → evalF → conj, wrapped in an escape-time loop, with the in-K test served
// by a mask texture (the deltoid boundary filled to an offscreen canvas) rather than a per-pixel
// polygon scan. Dogfoods @cas/gpu: the complex stdlib (@cas/gpu/glsl) and the shared compile/link
// (@cas/gpu/shader). The colour scheme mirrors src/render.ts so GPU and CPU renders match.
import { COMPLEX_SINGLE_GLSL, FULLSCREEN_VERTEX_GLSL, PLANE_FROM_FRAG_GLSL } from "@cas/gpu/glsl";
import { createProgram } from "@cas/gpu/shader";
import { deltoidBoundary, type Complex } from "./deltoid.js";
import type { View } from "./render.js";

const VERT = FULLSCREEN_VERTEX_GLSL;

// The deltoid maps + Newton σ, in single-precision complex GLSL. Baked for φ(z) = z + 1/(2 z²) (a later
// slice can generalize to arbitrary Laurent coefficients via uniforms, à la QD's u_polyA).
const FRAG = `#version 300 es
precision highp float;
${COMPLEX_SINGLE_GLSL}
${PLANE_FROM_FRAG_GLSL}

uniform vec2  uCenter;
uniform float uHalfSpan;       // world half-height; x scaled by the pixel aspect
uniform vec2  uResolution;
uniform sampler2D uMask;       // R>0.5 inside K (the deltoid)
uniform vec2  uMaskCenter;
uniform vec2  uMaskHalfExtent;
uniform int   uMaxIter;
uniform float uEscapeR;
out vec4 fragColor;

cvec phi(cvec z)  { return cadd(z, cdiv(vec_(0.5, 0.0), cmul(z, z))); }                       // z + 1/(2 z^2)
cvec dphi(cvec z) { return csub(vec_(1.0, 0.0), cdiv(vec_(1.0, 0.0), cmul(cmul(z, z), z))); }  // 1 - 1/z^3
cvec fSch(cvec z) { return cadd(cdiv(vec_(1.0, 0.0), z), cmul(vec_(0.5, 0.0), cmul(z, z))); }  // 1/z + 0.5 z^2

// Exterior branch of phi^-1 by Newton from a COLD seed derived from w (never a warm/previous z). σ maps
// w far from its previous iterate, so reusing the last z lands Newton in the wrong basin — an interior
// preimage of the degree-3 inverse — which corrupted orbits into fake bounded sets (the spurious
// non-escaping "wings"). Seeding from w (pushed just outside the unit disk) lands on the |z|>1 root every
// time (verified: 0 wrong-branch hits over the plane), and Newton is float32-robust where Cardano is not.
cvec invertPhi(cvec w) {
  float r = length(w);
  cvec z = (r > 1.3) ? w : w * (1.3 / max(r, 1e-6));
  for (int it = 0; it < 24; it++) {
    cvec fz = csub(phi(z), w);
    if (length(fz) < 1e-6) break;
    cvec dz = dphi(z);
    if (length(dz) < 1e-30) break;
    z = csub(z, cdiv(fz, dz));
    if (length(z) > 1e8) break;
  }
  return z;
}

bool inK(cvec w) {
  vec2 uv = (w - uMaskCenter) / (2.0 * uMaskHalfExtent) + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return false;
  return texture(uMask, uv).r > 0.5;
}

// Cyclic tessellation palette (Inigo Quilez cosine form): successive tile generations get well-separated
// hues, so the triangular tiles read clearly instead of washing into one band.
vec3 pal(float t) { return 0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67))); }

void main() {
  cvec w = planeFromFrag(gl_FragCoord.xy, uCenter, uHalfSpan, uResolution);
  if (inK(w)) { fragColor = vec4(0.10, 0.11, 0.16, 1.0); return; }   // K (the deltoid interior)

  int nn = 0; bool escaped = false;
  for (int n = 1; n <= 512; n++) {
    if (n > uMaxIter) break;
    cvec z = invertPhi(w);
    if (length(z) < 0.999) break;                                    // no exterior preimage (not in Omega)
    w = cconj(fSch(z));
    nn = n;
    if (length(w) > uEscapeR || inK(w)) { escaped = true; break; }   // left Omega (to infinity or into K) -> a tile
  }
  if (!escaped) { fragColor = vec4(0.02, 0.02, 0.025, 1.0); return; } // non-escaping limit set (a thin fractal)
  fragColor = vec4(pal(0.11 * float(nn)) * 0.92, 1.0);               // tessellation coloured by tile generation
}`;

export interface GpuRenderer {
  render(view: View): void;
}

// Fill the deltoid boundary to an offscreen canvas → the in-K mask. The deltoid is symmetric under
// conjugation, so the mask is y-symmetric and its vertical orientation in the texture is immaterial.
function makeMask(boundary: readonly Complex[], center: Complex, half: Complex, size: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  for (let i = 0; i < boundary.length; i++) {
    const px = ((boundary[i][0] - center[0]) / (2 * half[0]) + 0.5) * size;
    const py = (0.5 - (boundary[i][1] - center[1]) / (2 * half[1])) * size;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  return cv;
}

/** Build a WebGL2 deltoid renderer on `canvas`, or null if WebGL2 / shader setup fails (caller then
 *  falls back to the CPU render). */
export function createDeltoidRenderer(canvas: HTMLCanvasElement): GpuRenderer | null {
  // preserveDrawingBuffer: the render is static (one draw per view), so keep the buffer readable —
  // the image persists across compositing and can be read back / screenshotted. This context is
  // deliberately page-lifetime (CORR-3): a live context is REQUIRED to keep that image on screen, and
  // this is a one-shot page (one renderer per canvas, no mount/unmount churn), so nothing accumulates
  // toward the browser's context cap. The failure path below releases an orphaned context; a live one
  // is reclaimed by the browser on navigation, so there is no teardown hook to add.
  const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
  if (!gl) return null;

  let program: WebGLProgram;
  try {
    program = createProgram(gl, VERT, FRAG);
  } catch (e) {
    console.error("correspondences GPU: shader build failed —", e);
    gl.getExtension("WEBGL_lose_context")?.loseContext(); // release the orphaned WebGL2 context
    return null;
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const maskCenter: Complex = [0, 0];
  const maskHalf: Complex = [2.4, 2.4]; // covers the deltoid + the near dynamics; beyond → "not in K"
  const mask = makeMask(deltoidBoundary(512), maskCenter, maskHalf, 1024);
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const u = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name);
  const uCenter = u("uCenter");
  const uHalfSpan = u("uHalfSpan");
  const uResolution = u("uResolution");
  const uMaxIter = u("uMaxIter");
  const uEscapeR = u("uEscapeR");

  gl.useProgram(program);
  gl.uniform1i(u("uMask"), 0);
  gl.uniform2f(u("uMaskCenter"), maskCenter[0], maskCenter[1]);
  gl.uniform2f(u("uMaskHalfExtent"), maskHalf[0], maskHalf[1]);
  gl.uniform1i(uMaxIter, 96); // cold-seed Newton inverse is cheap per step, so afford deeper tiles near the limit set
  gl.uniform1f(uEscapeR, 40);

  return {
    render(view: View): void {
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uCenter, view.centerX, view.centerY);
      gl.uniform1f(uHalfSpan, view.halfSpan);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
