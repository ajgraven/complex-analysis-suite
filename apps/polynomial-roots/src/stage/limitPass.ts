// The limit-set pass: one fullscreen draw of the generated walk shader into the stage's composite.
//
// It writes STRAIGHT into the composite target rather than owning one, so the equalisation read-back,
// the tone ramp, the present pass, the a11y description and the PNG export are the same code for both
// engines. A difference between the two pictures can then only have come from the walk, which is what
// makes the handover measurable instead of a matter of taste.
//
// The program is generated per (alphabet, depth) — see `walkGlsl.ts` for why — and cached under that
// key, because a depth slider drag would otherwise recompile and relink on every frame. That is the
// Contour Integration M5.1 finding: its stage keyed its rebuild guard on object IDENTITY against a
// product rebuilt every call, and recompiled the GLSL on every recompute, every frame of a drag
// included. The key here is a string of values.
import { createProgram } from "@cas/gpu/shader";
import type { Alphabet } from "../engine/alphabet.js";
import { buildWalkShader, WALK_VERT, walkProgramKey } from "../engine/limit/walkGlsl.js";
import { StageUnavailable, targetDims } from "./glStage.js";
import type { TargetSize } from "./glStage.js";
import type { StageView } from "./glStage.js";

/** Everything one limit-set frame needs. */
export interface LimitRender {
  readonly view: StageView;
  /** The stage's aspect, so the world window matches the point pass's exactly. */
  readonly aspect: number;
  readonly alphabet: Alphabet;
  readonly depth: number;
  /** Walk inside the excluded band too. */
  readonly annulus: boolean;
}

/** What the pass did, for the legend to report honestly. */
export interface LimitFrame {
  /** The depth actually generated for (the slider is clamped to what the shader can carry). */
  readonly depth: number;
  /** One composite texel in world units — the scale Foster's fudge is measured in. */
  readonly pixelRadius: number;
  /** `ε` at the view centre, the number the legend prints. */
  readonly epsAtCentre: number;
}

interface Cached {
  readonly program: WebGLProgram;
  readonly uniforms: Record<string, WebGLUniformLocation | null>;
}

/**
 * One composite texel in world units — the scale Foster's fudge is measured in.
 *
 * Exported because the legend prints `ε` and the shader computes it, and the two must not be able to
 * disagree: the first draft had the legend reading it off the LAST frame, so a depth or a view change
 * showed one number in the controls and another in the panel until the next redraw.
 *
 * The stage's composite has the canvas's own shape, so its texels are square in world units and the
 * two sides below agree. A target of another shape (the browser suites' square one, carrying a
 * non-square world rect) has texels that are not, and the larger side is taken: it fattens the picture
 * rather than thinning it, which is the only direction a superset may err in.
 */
export function limitPixelRadius(halfHeight: number, aspect: number, width: number, height: number = width): number {
  return Math.max((halfHeight * aspect) / Math.max(1, width), halfHeight / Math.max(1, height));
}

/**
 * Programs held at once. One is compiled per (alphabet, depth), and dragging the depth slider or typing
 * a custom alphabet visits dozens; the cache was unbounded, so every one stayed linked on the GPU for the
 * life of the page (2026-09-26 review). Eight covers a reader moving back and forth between a few.
 */
export const MAX_CACHED_PROGRAMS = 8;

export class LimitPass {
  private readonly programs = new Map<string, Cached>();
  private readonly vao: WebGLVertexArrayObject;

  constructor(private readonly gl: WebGL2RenderingContext) {
    const vao = gl.createVertexArray();
    if (vao === null) throw new StageUnavailable("WebGL2 could not allocate a vertex array.");
    this.vao = vao;
  }

  /** How many distinct programs are being held — the cache's own claim, so a test can check it. */
  get cached(): number {
    return this.programs.size;
  }

  private programFor(alphabet: Alphabet, depth: number): Cached {
    const key = walkProgramKey(alphabet, depth);
    const held = this.programs.get(key);
    if (held !== undefined) {
      // Least-recently-used: a hit moves to the back of the Map's insertion order.
      this.programs.delete(key);
      this.programs.set(key, held);
      return held;
    }
    const gl = this.gl;
    const program = createProgram(gl, WALK_VERT, buildWalkShader(alphabet, depth));
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of ["uCentre", "uHalfExtent", "uResolution", "uPixelRadius", "uAnnulus"]) {
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    const entry = { program, uniforms };
    this.programs.set(key, entry);
    while (this.programs.size > MAX_CACHED_PROGRAMS) {
      const [oldest, dropped] = this.programs.entries().next().value as [string, Cached];
      gl.deleteProgram(dropped.program);
      this.programs.delete(oldest);
    }
    return entry;
  }

  /** Draw one frame into `framebuffer`, a float target of `size` texels. */
  render(framebuffer: WebGLFramebuffer, size: TargetSize, options: LimitRender): LimitFrame {
    const gl = this.gl;
    const { width, height } = targetDims(size);
    const { program, uniforms } = this.programFor(options.alphabet, options.depth);
    const halfWidth = options.view.halfHeight * options.aspect;
    const pixelRadius = limitPixelRadius(options.view.halfHeight, options.aspect, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.useProgram(program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(uniforms.uCentre, options.view.cx, options.view.cy);
    gl.uniform2f(uniforms.uHalfExtent, halfWidth, options.view.halfHeight);
    gl.uniform2f(uniforms.uResolution, width, height);
    gl.uniform1f(uniforms.uPixelRadius, pixelRadius);
    gl.uniform1f(uniforms.uAnnulus, options.annulus ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const absz = Math.hypot(options.view.cx, options.view.cy);
    const folded = absz > 1 ? 1 / absz : absz;
    const gap = Math.max(1 - Math.min(folded, 1 - 1e-6), 1e-6);
    return { depth: options.depth, pixelRadius, epsAtCentre: (pixelRadius * maxAbsOf(options.alphabet)) / (gap * gap) };
  }

  dispose(): void {
    for (const { program } of this.programs.values()) this.gl.deleteProgram(program);
    this.programs.clear();
    this.gl.deleteVertexArray(this.vao);
  }
}

function maxAbsOf(alphabet: Alphabet): number {
  let m = 0;
  for (const v of alphabet.values) m = Math.max(m, Math.hypot(v.re, v.im));
  return m;
}
