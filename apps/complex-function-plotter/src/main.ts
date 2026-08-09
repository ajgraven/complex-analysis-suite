// Phase 0 walking skeleton for the Complex Function Plotting Tool.
//
// Goal: prove the @cas/expr -> @cas/gpu compile chain in a fresh app by rendering ONE fixed,
// compiled function as a domain-colored (phase) portrait. A user-style expression string is
// parsed and compiled to a GLSL `fFn` body at build time, then concatenated with the shared
// complex GLSL stdlib into a fragment program. Everything here is deliberately minimal; Phase 1
// replaces the hardcoded map with a live expression box and the layered `colorAt` coloring shader.
import { parse } from "@cas/expr/parser";
import { compileF } from "@cas/expr/glsl";
import { COMPLEX_SINGLE_GLSL, COMPLEX_DERIVED_GLSL } from "@cas/gpu/glsl";
import { createProgram } from "@cas/gpu/shader";

// The whole point of Phase 0: a string -> AST (@cas/expr parse) -> GLSL function body (@cas/expr
// glsl). For "z^2" this yields `cvec fFn(cvec z, cvec c) { return cmul(z, z); }`.
const F_SOURCE = "z^2";
const F_GLSL = compileF(parse(F_SOURCE));

const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
${COMPLEX_SINGLE_GLSL}
${COMPLEX_DERIVED_GLSL}

uniform vec2  uCenter;
uniform float uHalfSpan;   // world half-height; x is scaled by the pixel aspect ratio
uniform vec2  uResolution;
out vec4 fragColor;

${F_GLSL}

// The shared stdlib has no colour helper, so supply a minimal HSV->RGB here. Phase 1 replaces this
// with a swappable, perceptually-uniform LUT (catalog C3).
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

void main() {
  float aspect = uResolution.x / uResolution.y;
  cvec z = vec_(
    uCenter.x + (gl_FragCoord.x / uResolution.x - 0.5) * 2.0 * uHalfSpan * aspect,
    uCenter.y + (gl_FragCoord.y / uResolution.y - 0.5) * 2.0 * uHalfSpan
  );
  cvec w = fFn(z, vec_(0.0, 0.0));
  float hue = cre1(carg(w)) * 0.15915494309 + 0.5;          // arg(w) / (2*pi) + 1/2
  float mag = cabsf(w);
  float val = 0.12 + 0.88 * (1.0 - 1.0 / (1.0 + mag));      // monotone bounded: dark zeros, bright poles
  fragColor = vec4(hsv2rgb(vec3(hue, 0.85, val)), 1.0);
}`;

interface Renderer {
  resize(): void;
  render(): void;
}

function createRenderer(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): Renderer | null {
  let program: WebGLProgram;
  try {
    program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  } catch (err) {
    console.error("complex-function-plotter: shader build failed —", err);
    return null;
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uCenter = gl.getUniformLocation(program, "uCenter");
  const uHalfSpan = gl.getUniformLocation(program, "uHalfSpan");
  const uResolution = gl.getUniformLocation(program, "uResolution");

  return {
    resize(): void {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    },
    render(): void {
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uCenter, 0.0, 0.0);
      gl.uniform1f(uHalfSpan, 2.0);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

function main(): void {
  const canvas = document.getElementById("view");
  const statusEl = document.getElementById("status");
  const setStatus = (msg: string): void => {
    if (statusEl) statusEl.textContent = msg;
  };
  if (!(canvas instanceof HTMLCanvasElement)) {
    setStatus("Could not find the render canvas.");
    return;
  }

  const gl = canvas.getContext("webgl2", { antialias: true });
  if (!gl) {
    setStatus("WebGL2 is unavailable in this browser — the plotter requires a WebGL2 context.");
    return;
  }

  let renderer = createRenderer(canvas, gl);
  if (!renderer) {
    setStatus("The shader failed to compile — see the browser console for details.");
    return;
  }

  const readyStatus =
    "f(z) = z²  ·  phase portrait: hue = arg f, brightness = |f|  ·  compiled via @cas/expr → @cas/gpu";

  const draw = (): void => {
    renderer?.resize();
    renderer?.render();
  };

  // L5 seed: keep working across a lost/restored WebGL2 context by rebuilding the program.
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    setStatus("WebGL context lost — restoring…");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    renderer = createRenderer(canvas, gl);
    draw();
    setStatus(renderer ? readyStatus : "The shader failed to rebuild after a context restore.");
  });

  const observer = new ResizeObserver(() => draw());
  observer.observe(canvas);

  draw();
  setStatus(readyStatus);
}

main();
