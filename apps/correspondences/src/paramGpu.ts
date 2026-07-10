// GPU (WebGL2) render of the family PARAMETER plane — Milestone C, P6-C4. Where gpu.ts renders the
// dynamical plane of ONE map (a baked, with an in-K mask texture), this renders the parameter plane of
// the whole family φ_a(z) = z + (a/2)/z²: every pixel is a different a ∈ ℂ, and the coefficient is read
// from the pixel coordinate — so a, a/2 and conj(a/2) all vary per fragment. Two things make this
// SIMPLER than the dynamical shader, not harder:
//   • the classifier is pure escape-to-∞ (no point-in-polygon), so there is NO mask texture;
//   • the three critical values are m_k = φ_a(ζ_k) = 1.5·ζ_k with ζ_k = a^{1/3}·{1,ω,ω²} (since
//     φ_a'(ζ)=0 ⟹ a/ζ² = ζ ⟹ φ_a(ζ) = 1.5ζ) — i.e. just 1.5·(the three cube roots of a).
// Dogfoods @cas/gpu (the complex stdlib + shared compile/link). Colours match paramFieldToImage exactly,
// so this is cross-validated PIXEL-FOR-PIXEL against the CPU classifier (criticalEscape).
import { COMPLEX_SINGLE_GLSL } from "@cas/gpu/glsl";
import { createProgram } from "@cas/gpu/shader";
import type { ParamView } from "./paramPlane.js";

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
${COMPLEX_SINGLE_GLSL}

uniform vec2  uCenter;      // a-plane centre
uniform float uHalfSpan;    // a-plane world half-height; x scaled by aspect
uniform vec2  uResolution;
uniform int   uMaxIter;
uniform float uEscapeR;
out vec4 fragColor;

// φ_a, φ_a', and the Schwarz extension F_a — all with the per-pixel coefficient a passed in.
cvec phi_a(cvec z, cvec a)  { return cadd(z, cdiv(cmul(vec_(0.5,0.0), a), cmul(z,z))); }        // z + (a/2)/z^2
cvec dphi_a(cvec z, cvec a) { return csub(vec_(1.0,0.0), cdiv(a, cmul(cmul(z,z),z))); }          // 1 - a/z^3
cvec fSch_a(cvec z, cvec a) { return cadd(cdiv(vec_(1.0,0.0), z),
                                          cmul(cconj(cmul(vec_(0.5,0.0),a)), cmul(z,z))); }       // 1/z + conj(a/2) z^2

// Principal complex cube root (matches CPU: cbrt(|a|), arg(a)/3).
cvec ccbrt(cvec a) {
  float r = length(a);
  if (r < 1e-20) return vec_(0.0, 0.0);
  float rr = pow(r, 1.0/3.0);
  float th = atan(a.y, a.x) / 3.0;
  return vec_(rr * cos(th), rr * sin(th));
}

// Exterior branch of φ_a^{-1} by Newton from a COLD seed derived from w (never a warm/previous z). σ_a
// maps w far from its previous iterate, so a warm seed drifts onto an interior preimage of the degree-3
// inverse and corrupts the orbit — the same branch bug fixed in the deltoid shader. Seeding from w lands
// on the |z|>1 root, and Newton is float32-robust (unlike the Cardano closed form).
cvec invertPhi(cvec w, cvec a, out bool ok) {
  float r = length(w);
  cvec z = (r > 1.3) ? w : w * (1.3 / max(r, 1e-6));
  ok = true;
  for (int it = 0; it < 24; it++) {
    cvec fz = csub(phi_a(z, a), w);
    if (length(fz) < 1e-6) return z;
    cvec dz = dphi_a(z, a);
    if (length(dz) < 1e-30) { ok = false; return z; }
    z = csub(z, cdiv(fz, dz));
    if (length(z) > 1e8) { ok = false; return z; }
  }
  ok = length(csub(phi_a(z, a), w)) < 1e-4;
  return z;
}

// σ_a(w) = conj(F_a(φ_a^{-1}(w))).
cvec sigma_a(cvec w, cvec a, out bool ok) {
  cvec z = invertPhi(w, a, ok);
  if (!ok) return w;
  // Exterior branch only: φ_a is univalent on {|z|>1} for the entire family window (area theorem,
  // |a| ≤ √2), so a preimage inside the closed unit disk is the WRONG branch. Treat it as "no exterior
  // preimage" (the orbit left Ω inward — bounded, not an escape), matching the CPU UnboundedLaurent-
  // Schwarz and the deltoid shader's length(z) < 0.999 call-site guard; 1e-4 slack mirrors acceptZ
  // elsewhere. Previously only z ~ 0 was rejected, so an accepted interior root corrupted the escape
  // count on the ~0.04% of pixels where the cold seed converged inward. (CORR-2)
  if (length(z) < 1.0 - 1e-4) { ok = false; return w; }
  return cconj(fSch_a(z, a));
}

vec3 shade(int best, int maxIter) {
  if (best >= maxIter) return vec3(24.0, 27.0, 42.0) / 255.0;          // the connectedness body
  float t = clamp(float(best) / 24.0, 0.0, 1.0);                       // escape speed
  return vec3(244.0 - 210.0*t, 176.0 - 96.0*t, 92.0 + 132.0*t) / 255.0;
}

void main() {
  float aspect = uResolution.x / uResolution.y;
  cvec a = vec_(
    uCenter.x + (gl_FragCoord.x / uResolution.x - 0.5) * 2.0 * uHalfSpan * aspect,
    uCenter.y + (gl_FragCoord.y / uResolution.y - 0.5) * 2.0 * uHalfSpan
  );

  const cvec OMEGA = vec_(-0.5, 0.86602540378);  // e^{2πi/3}
  cvec root = ccbrt(a);                          // ζ_0 = a^{1/3}
  int best = uMaxIter;

  for (int k = 0; k < 3; k++) {
    cvec w = cmul(vec_(1.5, 0.0), root);         // critical value m_k = 1.5·ζ_k
    int esc = uMaxIter;
    for (int n = 1; n <= 256; n++) {
      if (n > uMaxIter) break;
      bool ok;
      cvec next = sigma_a(w, a, ok);
      if (!ok) { esc = uMaxIter; break; }        // left Ω inward — not an escape to ∞
      w = next;
      if (length(w) > uEscapeR) { esc = n; break; }
    }
    best = min(best, esc);
    root = cmul(root, OMEGA);                     // next cube root ζ_{k+1} = ζ_k·ω
  }
  fragColor = vec4(shade(best, uMaxIter), 1.0);
}`;

export interface ParamGpuRenderer {
  render(view: ParamView, maxIter: number, escapeR: number): void;
}

/** Build a WebGL2 parameter-plane renderer on `canvas`, or null if WebGL2 / shader setup fails (the
 *  caller then falls back to the chunked CPU classify). */
export function createParamRenderer(canvas: HTMLCanvasElement): ParamGpuRenderer | null {
  // preserveDrawingBuffer keeps the one static render readable/screenshottable. As in gpu.ts, this
  // context is deliberately page-lifetime (CORR-3) — a live context is required to keep the image on
  // screen, and the one-shot page creates one renderer per canvas (no churn toward the context cap).
  // The failure path releases an orphan; a live context is reclaimed on navigation.
  const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
  if (!gl) return null;

  let program: WebGLProgram;
  try {
    program = createProgram(gl, VERT, FRAG);
  } catch (e) {
    console.error("correspondences param GPU: shader build failed —", e);
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

  const u = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name);
  const uCenter = u("uCenter");
  const uHalfSpan = u("uHalfSpan");
  const uResolution = u("uResolution");
  const uMaxIter = u("uMaxIter");
  const uEscapeR = u("uEscapeR");

  return {
    render(view: ParamView, maxIter: number, escapeR: number): void {
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uCenter, view.centerX, view.centerY);
      gl.uniform1f(uHalfSpan, view.halfSpan);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1i(uMaxIter, maxIter);
      gl.uniform1f(uEscapeR, escapeR);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
