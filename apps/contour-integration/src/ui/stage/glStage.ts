import { COMPLEX_DERIVED_GLSL, COMPLEX_SINGLE_GLSL, createProgram } from "@cas/gpu";
import { compileF, type Node } from "@cas/expr";
import { plotRange, type View, type Viewport } from "../../kernel/camera.js";
import type { DeclaredProduct } from "../../kernel/branch/declared.js";
import { buildPhaseFrag, PHASE_VERT, STAGE_MODE_CODE } from "./phase.glsl.js";
import { cetC6Bytes } from "./cetC6.js";
import { DEFAULT_STAGE_MODE, type StageMode } from "./mode.js";
import { CUT_GLSL, MAX_CUT_SEGMENTS_GLSL } from "./cut.glsl.js";
import { declaredProductGlsl } from "./declared.glsl.js";
import type { CutSegment } from "../../kernel/branch/correction.js";

/**
 * The Stage's WebGL2 layer: a phase portrait of the integrand, rendered from the same AST the CPU
 * evaluates.
 *
 * The shader body comes from `@cas/expr`'s `compileF`, and the complex arithmetic from `@cas/gpu`'s
 * stdlib — so this file contains no mathematics of its own beyond the colour map. That is the point:
 * the GLSL↔JS agreement that `@cas/gpu`'s dual-backend harness checks only means something while the
 * two backends are compiled from one source.
 */
export class GLStage {
  private readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  /**
   * CET-C6 as a 256×1 RGBA8 texture — built ONCE, not per program.
   *
   * `REPEAT` on S is what makes the seam at `arg f = ±π` the hardware's business: the wrap
   * interpolates from entry 255 into entry 0, which is exactly the join the table was designed to
   * close (`cetC6.ts` measures it). `LINEAR` because 256 samples across a turn is four per degree
   * and a nearest lookup would band a portrait that is otherwise continuous.
   */
  private ramp: WebGLTexture | null = null;
  /** The quad's vertex buffer. **Stored since the review**: `dispose()` leaked one per mounted stage. */
  private buffer: WebGLBuffer | null = null;

  /**
   * The context is gone and has not come back — read by the stage, which says so on screen.
   *
   * A lost context is not an error the app can act on and not a state it may hide: the ink layer,
   * the two rails and the ledger all go on printing exact answers over a portrait that is simply
   * black, which is the one combination a reader cannot diagnose.
   */
  contextLost = false;

  /**
   * Called when the context is lost and again when it has been restored.
   *
   * **The caller must drop whatever it keyed on the old program.** Every GL object this class held
   * is gone; the stage's `programKey` lives one level up, so a restore that did not say so would
   * leave the stage believing its (deleted) program was still built for the current integrand and
   * drawing nothing for ever.
   */
  onContextChange: (() => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    this.gl = gl;
    // **`preventDefault()`, or the browser does not even try.** Measured before this existed: the
    // event fired with `defaultPrevented: false`, so no restore was ever attempted and the stage
    // stayed black for the life of the page. The three sibling apps that handle this
    // (`complex-dynamics/src/render/glPlot.ts`, `.../schwarzGL.ts`,
    // `complex-function-plotter/src/render/plot.ts`) all do the same first thing.
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.contextLost = true;
      // Not `deleteProgram` and friends: the objects do not exist any more, and calling into a lost
      // context is a no-op at best. Dropping the handles is what stops a later `dispose` or `render`
      // from using them.
      this.program = null;
      this.uniforms = {};
      this.vao = null;
      this.buffer = null;
      this.ramp = null;
      this.onContextChange?.();
    });
    canvas.addEventListener("webglcontextrestored", () => {
      this.contextLost = false;
      this.initGeometry();
      this.initRamp();
      // The program is NOT rebuilt here: this class does not keep the AST it was built from. The
      // stage does, and `onContextChange` is what tells it its key is stale.
      this.onContextChange?.();
    });
    this.initGeometry();
    this.initRamp();
  }

  /** Upload the colour table. One texture for the life of the stage; programs come and go. */
  private initRamp(): void {
    const { gl } = this;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, cetC6Bytes());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    // T is clamped rather than repeated: the texture is one row and every sample asks for v = 0.5,
    // so the mode on T can only matter if something later gets the coordinate wrong — and clamping
    // then reads the row it meant instead of wrapping to a row that does not exist.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.ramp = tex;
  }

  private initGeometry(): void {
    const { gl } = this;
    const vao = gl.createVertexArray();
    // Kept on the instance: it was a local, so `dispose()` deleted the program, the VAO and the ramp
    // and left one orphan buffer per mounted stage behind — negligible in the app and visible across
    // a 220-test browser run.
    const buffer = gl.createBuffer();
    this.buffer = buffer;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // Two triangles covering clip space.
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    // Location 0 is DECLARED by `PHASE_VERT`'s `layout(location = 0)`, not assumed: the VAO is built
    // before any program exists, so `getAttribLocation` is not available here and `createProgram`
    // binds nothing.
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.vao = vao;
  }

  /**
   * Rebuild the program for a new integrand.
   *
   * Throws on a compile or link failure with the driver's log attached. The caller is expected to
   * SHOW that, not swallow it: silently keeping the previous program while the caption changes is
   * the exact failure `@cas/expr`'s `paramAlias` note records having hit before — the GPU kept
   * rendering the old map under the new name.
   */
  setIntegrand(ast: Node, declared?: DeclaredProduct): void {
    const { gl } = this;
    if (this.contextLost) return;
    // CUT_GLSL comes in unconditionally: it carries `cpowCut`/`clogCut`, which the declared product
    // is built out of, and with `uCutCount` at 0 its correction is identically zero and costs one
    // comparison per pixel. Including it always keeps ONE program shape, so the sandbox and a
    // record compile the same stdlib and a defect cannot hide in the branch that is rarely built.
    const stdlib = `${COMPLEX_SINGLE_GLSL}\n${COMPLEX_DERIVED_GLSL}\nuniform vec2 uA;\n${CUT_GLSL}\n`;
    // **WITH A DECLARED PRODUCT, `ast` IS THE RATIONAL COFACTOR AND NOT THE WHOLE INTEGRAND.** The
    // branch half is generated from the record's declaration (`declared.glsl.ts`) so the picture is
    // in the determination the ledger computes in; the single-valued half stays on `@cas/expr`'s
    // compile path, which is the one source of truth for everything with no determination to choose.
    const next = createProgram(
      gl,
      PHASE_VERT,
      buildPhaseFrag(
        stdlib,
        compileF(ast),
        declared === undefined ? undefined : declaredProductGlsl(declared),
      ),
    );
    if (this.program) gl.deleteProgram(this.program);
    this.program = next;
    this.uniforms = {};
    for (const name of [
      "uRange",
      "uParamC",
      "uA",
      "uModulusDepth",
      "uGridStrength",
      "uIsoStrength",
      // The cut block: the count, the base point the crossings are counted from, and the (segment,
      // weight) pairs. The last three were missing here, which is why `uCutCount` could only ever be
      // written as 0 — there was nothing to put beside it.
      "uCutCount",
      "uCutBase",
      "uCutSeg",
      "uCutJump",
      "uRamp",
      "uMode",
      "uPaper",
      "uWash",
    ]) {
      this.uniforms[name] = gl.getUniformLocation(next, name);
    }
  }

  /** Size the drawing buffer to the element, honouring devicePixelRatio (capped, per research 04 §8). */
  resize(vp: Viewport): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(vp.width * dpr));
    const h = Math.max(1, Math.round(vp.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(
    view: View,
    vp: Viewport,
    opts: {
      paramC?: readonly [number, number];
      modulusDepth?: number;
      grid?: number;
      /** Modulus contours — research 06 §5.1's device #2. 0 is off. */
      iso?: number;
      /**
       * Which portrait — `ui/stage/mode.ts`. Defaulted rather than required, because every other
       * option here is, and a caller that says nothing should get the app's default rather than a
       * type error about a picture it did not ask to choose.
       */
      mode?: StageMode;
      /** The textbook plate's ground, as `[r, g, b]` in [0, 1]. Read by mode `textbook` and by
       *  `wash`, which blends the portrait toward it. */
      paper?: readonly [number, number, number];
      /** Export only: 0 draws the portrait as shown, 1 washes it onto `paper` for a light plate. */
      wash?: number;
      /**
       * The branch-cut correction's (segment, weight) list — `cutSegments(branch, reach, reference)`.
       *
       * Absent or empty leaves `uCutCount` at 0, which makes `cutFactor` identically 1 and the
       * portrait exactly what `casDeclared` and the compiled AST produce. The declared arcs arrive
       * at `+J` and the reference rays at `−α` in the SAME array, so Γ equal to the reference sums
       * to zero term by term and a picture already in the declared determination cannot move.
       */
      cuts?: { readonly segments: readonly CutSegment[]; readonly base: readonly [number, number] };
    } = {},
  ): void {
    const { gl, program } = this;
    if (!program || this.contextLost) return;
    this.resize(vp);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(program);
    gl.bindVertexArray(this.vao);

    const [xmin, xmax, ymin, ymax] = plotRange(view, vp);
    gl.uniform4f(this.uniforms.uRange ?? null, xmin, xmax, ymin, ymax);
    const c = opts.paramC ?? [0, 0];
    gl.uniform2f(this.uniforms.uParamC ?? null, c[0], c[1]);
    gl.uniform2f(this.uniforms.uA ?? null, 0, 0);
    gl.uniform1f(this.uniforms.uModulusDepth ?? null, opts.modulusDepth ?? 1);
    gl.uniform1f(this.uniforms.uGridStrength ?? null, opts.grid ?? 1);
    gl.uniform1f(this.uniforms.uIsoStrength ?? null, opts.iso ?? 0);
    gl.uniform1i(this.uniforms.uMode ?? null, STAGE_MODE_CODE[opts.mode ?? DEFAULT_STAGE_MODE]);
    const paper = opts.paper ?? [0, 0, 0];
    gl.uniform3f(this.uniforms.uPaper ?? null, paper[0], paper[1], paper[2]);
    gl.uniform1f(this.uniforms.uWash ?? null, opts.wash ?? 0);
    // Unit 0, bound on every draw rather than once at link: the app has ONE stage and one texture,
    // but a sampler left pointing at whatever was bound last is the class of defect that shows up
    // as a portrait in the wrong colours only after some other feature starts using a texture.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.ramp);
    gl.uniform1i(this.uniforms.uRamp ?? null, 0);
    this.uploadCuts(opts.cuts?.segments ?? [], opts.cuts?.base ?? [0, 0]);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /**
   * The cut block, flattened into the two fixed-size arrays the shader declares.
   *
   * **Truncation is the caller's to REPORT, and the count is written from the same `min` the CPU
   * twin takes** — `cutCorrection` reads `Math.min(segments.length, MAX_CUT_SEGMENTS)` and this
   * uploads exactly that many, so the two backends drop the same tail rather than disagreeing about
   * a picture. `stageView` says on screen when it happens; nothing here can, because a shader has no
   * voice.
   */
  private uploadCuts(segments: readonly CutSegment[], base: readonly [number, number]): void {
    const { gl } = this;
    const n = Math.min(segments.length, MAX_CUT_SEGMENTS_GLSL);
    gl.uniform1i(this.uniforms.uCutCount ?? null, n);
    if (n === 0) return;
    // The arrays are allocated per draw rather than kept: a draw that uploads cuts at all is one a
    // reader asked for by dragging something, and 64 × 5 floats is 1.3 kB against a fragment program
    // that has just evaluated the integrand at every pixel.
    const flat = new Float32Array(MAX_CUT_SEGMENTS_GLSL * 4);
    const jumps = new Float32Array(MAX_CUT_SEGMENTS_GLSL);
    for (let j = 0; j < n; j++) {
      flat[4 * j] = segments[j].a[0];
      flat[4 * j + 1] = segments[j].a[1];
      flat[4 * j + 2] = segments[j].b[0];
      flat[4 * j + 3] = segments[j].b[1];
      jumps[j] = segments[j].jump;
    }
    gl.uniform2f(this.uniforms.uCutBase ?? null, base[0], base[1]);
    gl.uniform4fv(this.uniforms.uCutSeg ?? null, flat);
    gl.uniform1fv(this.uniforms.uCutJump ?? null, jumps);
  }

  /**
   * Blank the portrait to the ground colour.
   *
   * For a parse failure. **Leaving the last good portrait up is the worst of both**: the reader is
   * told the expression is broken while looking at a picture of something else, and the picture is
   * the more convincing of the two. The colour is `--g-ground`'s, stated here because a GL clear
   * cannot read a CSS variable.
   */
  clear(): void {
    this.clearTo([0x0f / 255, 0x11 / 255, 0x15 / 255]);
  }

  /**
   * Clear to an arbitrary ground — the **textbook** plate's paper.
   *
   * A clear rather than a full-screen draw under `uMode == 3`: the plate's portrait is *absent*, so
   * the cheapest correct thing is not to run the fragment program at all, and it also means the
   * plate is right even when the program failed to link. The shader keeps its own paper branch
   * anyway, so the two cannot disagree about what "textbook" looks like.
   */
  clearTo(rgb: readonly [number, number, number]): void {
    const { gl } = this;
    if (this.contextLost) return;
    // The CURRENT drawing-buffer size, not a fresh `resize`: `render` is the only thing that sizes
    // the buffer, and a mode that never renders must not be the one deciding the canvas's shape.
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(rgb[0], rgb[1], rgb[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }


  dispose(): void {
    const { gl } = this;
    if (this.program) gl.deleteProgram(this.program);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.ramp) gl.deleteTexture(this.ramp);
    this.program = null;
    this.vao = null;
    this.buffer = null;
    this.ramp = null;
    this.onContextChange = null;
  }
}
