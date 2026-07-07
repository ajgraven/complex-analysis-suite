// GPU (WebGL2) render of the deltoid Schwarz-reflection dynamical plane — Milestone A, P6-C4. The σ
// iteration is inherently numerical (φ⁻¹ is a per-pixel Newton solve), so this ports the CPU reference
// (src/deltoid.ts / src/render.ts) into a fragment shader — the same shape QD's schwarz-webgl uses:
// per-pixel Newton invertPhi → evalF → conj, wrapped in an escape-time loop, with the in-K test served
// by a mask texture (the deltoid boundary filled to an offscreen canvas) rather than a per-pixel
// polygon scan. Dogfoods @cas/gpu: the complex stdlib (@cas/gpu/glsl) and the shared compile/link
// (@cas/gpu/shader). The colour scheme mirrors src/render.ts so GPU and CPU renders match.
import { COMPLEX_SINGLE_GLSL } from "@cas/gpu/glsl";
import { createProgram } from "@cas/gpu/shader";
import { deltoidBoundary, type Complex } from "./deltoid.js";
import type { View } from "./render.js";

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

// The deltoid maps + Newton σ, in single-precision complex GLSL. Baked for φ(z) = z + 1/(2 z²) (a later
// slice can generalize to arbitrary Laurent coefficients via uniforms, à la QD's u_polyA).
const FRAG = `#version 300 es
precision highp float;
${COMPLEX_SINGLE_GLSL}

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

bool inK(cvec w) {
  vec2 uv = (w - uMaskCenter) / (2.0 * uMaskHalfExtent) + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return false;
  return texture(uMask, uv).r > 0.5;
}

// Newton solve phi(z) = w on the exterior |z|>1, warm-started from seed. Sets ok=false on failure.
cvec invertPhi(cvec w, cvec seed, out bool ok) {
  cvec z = seed;
  float r = length(z);
  if (r < 1.05) { z = (r < 1e-6) ? vec_(1.1, 0.0) : z * (1.1 / r); }
  ok = true;
  for (int it = 0; it < 40; it++) {
    cvec fz = csub(phi(z), w);
    if (length(fz) < 1e-6) return z;
    cvec dz = dphi(z);
    if (length(dz) < 1e-30) { ok = false; return z; }
    z = csub(z, cdiv(fz, dz));
    if (length(z) > 1e8) { ok = false; return z; }
  }
  ok = length(csub(phi(z), w)) < 1e-4;
  return z;
}

// sigma(w) = conj(F(phi^-1(w))); returns the preimage z via zOut for warm-starting the next step.
cvec sigma(cvec w, cvec seed, out bool ok, out cvec zOut) {
  cvec z = invertPhi(w, seed, ok);
  zOut = z;
  if (!ok) return w;
  if (length(z) < 1e-6) { ok = false; return w; }
  return cconj(fSch(z));
}

vec3 shade(int kind, int n) {
  if (kind == 0 && n == 0) return vec3(30.0, 33.0, 44.0) / 255.0;             // K
  if (kind == 1) { float t = clamp(float(n) / 22.0, 0.0, 1.0);               // basin of infinity
    return vec3(210.0 - 130.0 * t, 226.0 - 96.0 * t, 246.0 - 40.0 * t) / 255.0; }
  if (kind == 0) { float t = mod(float(n), 18.0) / 18.0;                     // tiling set
    return vec3(40.0 + 205.0 * t, 100.0 + 110.0 * (1.0 - t), 150.0 - 90.0 * t) / 255.0; }
  return vec3(6.0, 6.0, 10.0) / 255.0;                                       // limit set (interior/invalid)
}

void main() {
  float aspect = uResolution.x / uResolution.y;
  cvec w = vec_(
    uCenter.x + (gl_FragCoord.x / uResolution.x - 0.5) * 2.0 * uHalfSpan * aspect,
    uCenter.y + (gl_FragCoord.y / uResolution.y - 0.5) * 2.0 * uHalfSpan
  );

  int kind = 2; // interior by default
  int nn = 0;
  if (inK(w)) {
    kind = 0;
  } else {
    cvec seed = w;
    for (int n = 1; n <= 256; n++) {
      if (n > uMaxIter) break;
      bool ok;
      cvec z;
      cvec next = sigma(w, seed, ok, z);
      if (!ok) { kind = 3; nn = n - 1; break; }
      seed = z;
      w = next;
      nn = n;
      if (length(w) > uEscapeR) { kind = 1; break; }
      if (inK(w)) { kind = 0; break; }
    }
  }
  fragColor = vec4(shade(kind, nn), 1.0);
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
  // the image persists across compositing and can be read back / screenshotted.
  const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
  if (!gl) return null;

  let program: WebGLProgram;
  try {
    program = createProgram(gl, VERT, FRAG);
  } catch (e) {
    console.error("correspondences GPU: shader build failed —", e);
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
  gl.uniform1i(uMaxIter, 64);
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
