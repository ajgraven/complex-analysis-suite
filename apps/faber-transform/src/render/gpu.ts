// render/gpu.ts — a WebGL2 phase-portrait renderer for one panel, over the shared @cas/gpu coloring
// core (PHASE_COLORING_GLSL, extracted at M1.5). Every case the app draws — a monomial zⁿ, the Faber
// image polynomial Σ bₙ Fₙ, the pole input 1/(z−z₀)^k, and its rational image — is a rational function
// num(z)/den(z), so one fragment kernel with two Horner loops covers them all. The 2-D overlay (axes,
// ∂K, markers) is drawn on a sibling canvas layered on top; see main.ts.
import {
  COMPLEX_SINGLE_GLSL,
  COMPLEX_DERIVED_GLSL,
  PLANE_FROM_FRAG_GLSL,
  FULLSCREEN_VERTEX_GLSL,
  PHASE_COLORING_GLSL,
  createProgram,
} from "@cas/gpu";
import type { Cx } from "@cas/core";
import { BASE_HALF } from "./plane.js";
import type { Viewport } from "./plane.js";
import { DEFAULT_COLORING } from "./coloring.js";
import type { ColoringOptions } from "./coloring.js";

// Max coefficient-array length: covers a Faber-image polynomial up to MAX_DEGREE (40) with margin.
const MAXC = 48;

const FRAGMENT = `#version 300 es
precision highp float;
${COMPLEX_SINGLE_GLSL}
${COMPLEX_DERIVED_GLSL}
${PLANE_FROM_FRAG_GLSL}
uniform vec2  uCenter;
uniform float uHalfSpan;
uniform vec2  uResolution;
uniform vec2  uNum[${MAXC}];
uniform int   uNumDeg;
uniform vec2  uDen[${MAXC}];
uniform int   uDenDeg;
uniform int   uMaskDisk;   // 1 = grey-out |z| ≥ 1 (the unit-disk panel)
uniform vec3  uBg;
${PHASE_COLORING_GLSL}
out vec4 fragColor;

cvec hornerNum(cvec z) {
  cvec acc = vec_(0.0, 0.0);
  for (int i = ${MAXC} - 1; i >= 0; i--) { if (i <= uNumDeg) acc = cadd(cmul(acc, z), uNum[i]); }
  return acc;
}
cvec hornerDen(cvec z) {
  cvec acc = vec_(0.0, 0.0);
  for (int i = ${MAXC} - 1; i >= 0; i--) { if (i <= uDenDeg) acc = cadd(cmul(acc, z), uDen[i]); }
  return acc;
}

void main() {
  cvec z = planeFromFrag(gl_FragCoord.xy, uCenter, uHalfSpan, uResolution);
  if (uMaskDisk == 1 && cabsf(z) >= 1.0) { fragColor = vec4(uBg, 1.0); return; }
  cvec val = cdiv(hornerNum(z), hornerDen(z));
  fragColor = vec4(colorAt(val), 1.0);
}`;

function hsvWheel(n: number): Uint8Array {
  const a = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const h = (i / n) * 6;
    const x = 1 - Math.abs((h % 2) - 1);
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 1) [r, g, b] = [1, x, 0];
    else if (h < 2) [r, g, b] = [x, 1, 0];
    else if (h < 3) [r, g, b] = [0, 1, x];
    else if (h < 4) [r, g, b] = [0, x, 1];
    else if (h < 5) [r, g, b] = [x, 0, 1];
    else [r, g, b] = [1, 0, x];
    a[4 * i] = Math.round(r * 255);
    a[4 * i + 1] = Math.round(g * 255);
    a[4 * i + 2] = Math.round(b * 255);
    a[4 * i + 3] = 255;
  }
  return a;
}

function packCoeffs(co: Cx[]): { arr: Float32Array; deg: number } {
  const deg = Math.min(MAXC - 1, Math.max(0, co.length - 1));
  const arr = new Float32Array(MAXC * 2);
  for (let i = 0; i <= deg; i++) {
    arr[2 * i] = co[i].re;
    arr[2 * i + 1] = co[i].im;
  }
  return { arr, deg };
}

export interface GpuRenderer {
  /** Render num(z)/den(z) (ascending Cx[]) over `view`; `maskDisk` greys |z| ≥ 1; `coloring` sets the style. */
  render(view: Viewport, num: Cx[], den: Cx[], maskDisk: boolean, coloring?: ColoringOptions): void;
  dispose(): void;
}

/** Create a GPU renderer on `canvas`, or null if WebGL2 / shader compilation is unavailable. */
export function createGpuRenderer(
  canvas: HTMLCanvasElement,
  bg: readonly [number, number, number],
): GpuRenderer | null {
  const glMaybe = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
  if (!glMaybe) return null;
  const gl: WebGL2RenderingContext = glMaybe;

  let program: WebGLProgram;
  try {
    program = createProgram(gl, FULLSCREEN_VERTEX_GLSL, FRAGMENT);
  } catch (e) {
    console.error("faber-transform GPU shader failed; falling back to CPU:", e);
    return null;
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const lut = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, lut);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, hsvWheel(256));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const u = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name);
  const loc = {
    center: u("uCenter"),
    half: u("uHalfSpan"),
    res: u("uResolution"),
    num: u("uNum"),
    numDeg: u("uNumDeg"),
    den: u("uDen"),
    denDeg: u("uDenDeg"),
    mask: u("uMaskDisk"),
    bg: u("uBg"),
    lut: u("uPhaseLUT"),
    row: u("uPhaseRow"),
    modulus: u("uModulus"),
    modScale: u("uModScale"),
    enhance: u("uEnhance"),
    sectors: u("uSectors"),
    crisp: u("uCrisp"),
    hueShift: u("uHueShift"),
    hueSign: u("uHueSign"),
    cvd: u("uCvd"),
    unc: u("uUncertainty"),
    levelAbs: u("uLevelAbs"),
    levelArgOn: u("uLevelArgOn"),
    levelArg: u("uLevelArg"),
  };

  function render(view: Viewport, num: Cx[], den: Cx[], maskDisk: boolean, coloring: ColoringOptions = DEFAULT_COLORING): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    gl.viewport(0, 0, w, h);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, lut);

    gl.uniform1i(loc.lut, 0);
    gl.uniform1f(loc.row, 0.5);
    gl.uniform2f(loc.center, view.centerRe, view.centerIm);
    gl.uniform1f(loc.half, BASE_HALF / view.zoom);
    gl.uniform2f(loc.res, w, h);

    const n = packCoeffs(num);
    const d = packCoeffs(den);
    gl.uniform2fv(loc.num, n.arr);
    gl.uniform1i(loc.numDeg, n.deg);
    gl.uniform2fv(loc.den, d.arr);
    gl.uniform1i(loc.denDeg, d.deg);
    gl.uniform1i(loc.mask, maskDisk ? 1 : 0);
    gl.uniform3f(loc.bg, bg[0] / 255, bg[1] / 255, bg[2] / 255);

    // Coloring style from the UI (hue × modulus-lightness transfer × enhancement overlay).
    gl.uniform1i(loc.modulus, coloring.modulus);
    gl.uniform1f(loc.modScale, coloring.modScale);
    gl.uniform1i(loc.enhance, coloring.enhance);
    gl.uniform1f(loc.sectors, coloring.sectors);
    gl.uniform1i(loc.crisp, coloring.crisp ? 1 : 0);
    gl.uniform1f(loc.hueShift, 0);
    gl.uniform1f(loc.hueSign, 1);
    gl.uniform1i(loc.cvd, 0);
    gl.uniform1i(loc.unc, 0);
    gl.uniform1f(loc.levelAbs, 0);
    gl.uniform1i(loc.levelArgOn, 0);
    gl.uniform1f(loc.levelArg, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function dispose(): void {
    gl.deleteProgram(program);
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);
    gl.deleteTexture(lut);
  }

  return { render, dispose };
}
